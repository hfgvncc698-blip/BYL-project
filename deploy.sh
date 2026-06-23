#!/usr/bin/env bash
set -euo pipefail

# ========= A CONFIGURER =========
HOST="141.94.244.26"                 # IP ou domaine du VPS
USER="tom"                           # utilisateur SSH
REMOTE_WEBROOT="/var/www/byl-dist"   # root Nginx
REMOTE_BACKUPS="/var/www/byl_backups"
REMOTE_RELEASE="/var/www/byl_release"
REMOTE_BACKEND="/var/www/byl-backend"
LOCAL_API_HEALTH_URL="${LOCAL_API_HEALTH_URL:-http://127.0.0.1:5050/api/health}"
REMOTE_API_HEALTH_URL="${REMOTE_API_HEALTH_URL:-http://127.0.0.1:5050/api/health}"
# =================================

ASSUME_YES=false
ALLOW_DIRTY=false
ALLOW_UNPUSHED=false
SKIP_PREFLIGHT=false
DEPLOY_FIRESTORE_RULES=false
DEPLOY_FIREBASE_FUNCTIONS=false

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [options]

Options:
  --yes                    Ne demande pas de confirmation interactive.
  --allow-dirty            Autorise un working tree non committe.
  --allow-unpushed         Autorise des commits locaux non push.
  --skip-preflight         Ignore lint/tests/build locaux.
  --firebase-rules         Deploie aussi les rules/index Firestore.
  --firebase-functions     Deploie aussi les Cloud Functions Firebase.
  --firebase-all           Equivalent a --firebase-rules --firebase-functions.
  -h, --help               Affiche cette aide.

Par defaut, le script deploie uniquement le front + backend VPS.
Firestore rules et Firebase functions ne sont deployes que via options explicites.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --yes) ASSUME_YES=true ;;
    --allow-dirty) ALLOW_DIRTY=true ;;
    --allow-unpushed) ALLOW_UNPUSHED=true ;;
    --skip-preflight) SKIP_PREFLIGHT=true ;;
    --firebase-rules) DEPLOY_FIRESTORE_RULES=true ;;
    --firebase-functions) DEPLOY_FIREBASE_FUNCTIONS=true ;;
    --firebase-all)
      DEPLOY_FIRESTORE_RULES=true
      DEPLOY_FIREBASE_FUNCTIONS=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Option inconnue: $arg"
      usage
      exit 2
      ;;
  esac
done

confirm() {
  local prompt="$1"
  if [ "$ASSUME_YES" = true ]; then
    echo "${prompt} oui (--yes)"
    return 0
  fi
  read -r -p "${prompt} [y/N] " answer
  case "$answer" in
    y|Y|yes|YES|oui|OUI) return 0 ;;
    *) return 1 ;;
  esac
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Commande manquante: $1"
    exit 1
  }
}

run_step() {
  echo
  echo "==> $*"
  "$@"
}

ensure_clean_git() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Ce dossier n'est pas un repo Git."
    exit 1
  fi

  local branch
  local commit
  branch="$(git rev-parse --abbrev-ref HEAD)"
  commit="$(git rev-parse --short HEAD)"
  echo "Git: ${branch} @ ${commit}"

  if [ -n "$(git status --porcelain)" ]; then
    if [ "$ALLOW_DIRTY" != true ]; then
      echo
      echo "Working tree non committe. Commit d'abord tes changements GitHub, puis relance."
      echo "Pour forcer quand meme: ./deploy.sh --allow-dirty"
      exit 1
    fi
    run_step git diff --check
  fi

  local upstream=""
  upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
  if [ -n "$upstream" ]; then
    local ahead behind
    read -r ahead behind < <(git rev-list --left-right --count "HEAD...${upstream}")
    if [ "${behind:-0}" -gt 0 ]; then
      echo "La branche locale est en retard de ${behind} commit(s) sur ${upstream}. Fais un pull avant deploy."
      exit 1
    fi
    if [ "${ahead:-0}" -gt 0 ] && [ "$ALLOW_UNPUSHED" != true ]; then
      echo "Il y a ${ahead} commit(s) local(aux) non push vers ${upstream}."
      echo "Push d'abord sur GitHub, ou force avec ./deploy.sh --allow-unpushed."
      exit 1
    fi
  else
    echo "Aucun upstream Git detecte pour cette branche."
    confirm "Continuer sans verification de push GitHub ?" || exit 1
  fi
}

warn_if_firebase_changes_not_deployed() {
  local base="HEAD~1"
  if ! git rev-parse --verify "${base}" >/dev/null 2>&1; then
    return 0
  fi

  if git diff --quiet "${base}..HEAD" -- firestore.rules firestore.indexes.json firebase.json functions; then
    return 0
  fi

  if [ "$DEPLOY_FIRESTORE_RULES" = true ] || [ "$DEPLOY_FIREBASE_FUNCTIONS" = true ]; then
    return 0
  fi

  echo
  echo "Attention: le dernier commit touche Firestore/Firebase functions."
  echo "Le deploy VPS ne les publie pas par defaut."
  echo "Ajoute --firebase-rules, --firebase-functions ou --firebase-all si ces changements sont requis."
  confirm "Continuer avec seulement front + backend VPS ?" || exit 1
}

preflight() {
  need_command git
  need_command npm
  need_command tar
  need_command ssh
  need_command scp

  ensure_clean_git
  warn_if_firebase_changes_not_deployed

  if [ "$SKIP_PREFLIGHT" = true ]; then
    echo "Preflight local ignore (--skip-preflight)."
    return 0
  fi

  run_step npm run lint
  run_step npm run test:smoke
  run_step npm run test:footer-i18n
  run_step npm run test:sport-engine
  run_step npm run build
}

firebase_deploy_if_requested() {
  if [ "$DEPLOY_FIRESTORE_RULES" != true ] && [ "$DEPLOY_FIREBASE_FUNCTIONS" != true ]; then
    return 0
  fi

  need_command firebase

  if [ "$DEPLOY_FIRESTORE_RULES" = true ]; then
    run_step firebase deploy --only firestore:rules,firestore:indexes
  fi

  if [ "$DEPLOY_FIREBASE_FUNCTIONS" = true ]; then
    run_step firebase deploy --only functions
  fi
}

ts="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="byl-dist-${ts}.tgz"
BACKEND_ARCHIVE="byl-backend-${ts}.tgz"
SSH_CONTROL_PATH="${TMPDIR:-/tmp}/byl-deploy-${USER}-${HOST}-%p"
SSH_OPTS=(-o ControlMaster=auto -o ControlPersist=10m -o ControlPath="${SSH_CONTROL_PATH}")
REMOTE_SCRIPT="/tmp/byl-deploy-${ts}.sh"
REMOTE_SCRIPT_LOCAL="${TMPDIR:-/tmp}/byl-deploy-${ts}.sh"

cleanup() {
  ssh "${SSH_OPTS[@]}" -O exit "${USER}@${HOST}" >/dev/null 2>&1 || true
  rm -f "${ARCHIVE}" "${BACKEND_ARCHIVE}" "${REMOTE_SCRIPT_LOCAL}"
}
trap cleanup EXIT

preflight
firebase_deploy_if_requested

echo
echo "Resume du deploy:"
echo "- VPS: front + backend"
echo "- Host: ${USER}@${HOST}"
echo "- Webroot: ${REMOTE_WEBROOT}"
echo "- Backend: ${REMOTE_BACKEND}"
echo "- Firestore rules: ${DEPLOY_FIRESTORE_RULES}"
echo "- Firebase functions: ${DEPLOY_FIREBASE_FUNCTIONS}"
echo
confirm "Lancer le deploy maintenant ?" || exit 1

if [ ! -d dist ]; then
  echo "dist introuvable apres build."
  exit 1
fi

echo "Archive dist -> ${ARCHIVE}"
tar -C dist -czf "${ARCHIVE}" .

echo "Archive backend -> ${BACKEND_ARCHIVE}"
tar \
  --exclude "node_modules" \
  --exclude ".env" \
  --exclude "serviceAccountKey.json" \
  --exclude "firebase-service-account.json" \
  --exclude "*.log" \
  -C backend \
  -czf "${BACKEND_ARCHIVE}" .

echo "Preparation du script distant -> ${REMOTE_SCRIPT_LOCAL}"
cat > "${REMOTE_SCRIPT_LOCAL}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="/tmp/${ARCHIVE}"
BACKEND_ARCHIVE="/tmp/${BACKEND_ARCHIVE}"
REMOTE_SCRIPT="${REMOTE_SCRIPT}"
REMOTE_WEBROOT="${REMOTE_WEBROOT}"
REMOTE_BACKUPS="${REMOTE_BACKUPS}"
REMOTE_RELEASE="${REMOTE_RELEASE}"
REMOTE_BACKEND="${REMOTE_BACKEND}"
REMOTE_BACKEND_RELEASE="/tmp/byl-backend-release-${ts}"
REMOTE_API_HEALTH_URL="${REMOTE_API_HEALTH_URL}"

[ -f "\$ARCHIVE" ] || { echo "Archive manquante: \$ARCHIVE"; exit 1; }
[ -f "\$BACKEND_ARCHIVE" ] || { echo "Archive backend manquante: \$BACKEND_ARCHIVE"; exit 1; }
[[ "\$REMOTE_WEBROOT" == /var/www/* ]] || { echo "REMOTE_WEBROOT non autorise"; exit 1; }
[[ "\$REMOTE_BACKEND" == /var/www/* ]] || { echo "REMOTE_BACKEND non autorise"; exit 1; }

need_remote_command() {
  command -v "\$1" >/dev/null 2>&1 || {
    echo "Commande distante manquante: \$1"
    exit 1
  }
}

need_remote_command sudo
need_remote_command tar
need_remote_command npm
need_remote_command pm2
need_remote_command curl

echo "Preparation dossiers..."
sudo mkdir -p "\$REMOTE_WEBROOT" "\$REMOTE_BACKUPS" "\$REMOTE_RELEASE" "\$REMOTE_BACKEND"

echo "Extraction front dans release temporaire..."
sudo rm -rf "\$REMOTE_RELEASE"
sudo mkdir -p "\$REMOTE_RELEASE"
sudo tar -C "\$REMOTE_RELEASE" -xzf "\$ARCHIVE"

echo "Extraction backend dans release temporaire..."
rm -rf "\$REMOTE_BACKEND_RELEASE"
mkdir -p "\$REMOTE_BACKEND_RELEASE"
tar -C "\$REMOTE_BACKEND_RELEASE" -xzf "\$BACKEND_ARCHIVE"

cd "\$REMOTE_BACKEND_RELEASE"
echo "Installation dependances backend dans la release temporaire..."
if [ -f package-lock.json ]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

echo "Backup front actuel..."
if [ "\$(ls -A "\$REMOTE_WEBROOT" 2>/dev/null | wc -l)" -gt 0 ]; then
  BK="\$REMOTE_BACKUPS/byl-\$(date +%Y%m%d-%H%M%S).tgz"
  sudo tar -C "\$REMOTE_WEBROOT" -czf "\$BK" .
  echo "Backup front: \$BK"
else
  echo "Pas de front existant a sauvegarder."
fi

echo "Backup backend actuel..."
if [ "\$(ls -A "\$REMOTE_BACKEND" 2>/dev/null | wc -l)" -gt 0 ]; then
  BK_BACKEND="\$REMOTE_BACKUPS/byl-backend-\$(date +%Y%m%d-%H%M%S).tgz"
  sudo tar \
    --exclude "./node_modules" \
    --exclude "./*.log" \
    -C "\$REMOTE_BACKEND" \
    -czf "\$BK_BACKEND" .
  echo "Backup backend: \$BK_BACKEND"
else
  echo "Pas de backend existant a sauvegarder."
fi

echo "Publication front..."
sudo rm -rf "\$REMOTE_WEBROOT"/*
sudo cp -a "\$REMOTE_RELEASE"/. "\$REMOTE_WEBROOT"/
sudo chown -R www-data:www-data "\$REMOTE_WEBROOT"
sudo chmod -R 755 "\$REMOTE_WEBROOT"

echo "Publication backend..."
if command -v rsync >/dev/null 2>&1; then
  sudo rsync -a --delete \
    --exclude ".env" \
    --exclude "serviceAccountKey.json" \
    --exclude "firebase-service-account.json" \
    "\$REMOTE_BACKEND_RELEASE"/ "\$REMOTE_BACKEND"/
else
  sudo find "\$REMOTE_BACKEND" -mindepth 1 -maxdepth 1 \
    ! -name ".env" \
    ! -name "serviceAccountKey.json" \
    ! -name "firebase-service-account.json" \
    -exec rm -rf {} +
  sudo cp -a "\$REMOTE_BACKEND_RELEASE"/. "\$REMOTE_BACKEND"/
fi
sudo chown -R "\$USER":"\$USER" "\$REMOTE_BACKEND"

cd "\$REMOTE_BACKEND"
echo "Reload PM2..."
pm2 reload ecosystem.config.js --update-env

echo "Verification API..."
curl --fail --silent --show-error --max-time 15 "\$REMOTE_API_HEALTH_URL" >/dev/null

echo "Nettoyage distant..."
sudo rm -f "\$ARCHIVE" "\$BACKEND_ARCHIVE"
sudo rm -rf "\$REMOTE_RELEASE"
rm -rf "\$REMOTE_BACKEND_RELEASE"
rm -f "\$REMOTE_SCRIPT"

echo "Deploy distant termine."
EOF

echo "Upload vers ${USER}@${HOST}:/tmp/"
scp "${SSH_OPTS[@]}" "${ARCHIVE}" "${BACKEND_ARCHIVE}" "${REMOTE_SCRIPT_LOCAL}" "${USER}@${HOST}:/tmp/"

echo "Deploiement sur le serveur..."
ssh -tt "${SSH_OPTS[@]}" "${USER}@${HOST}" "bash '${REMOTE_SCRIPT}'"

echo "Deploy termine."
