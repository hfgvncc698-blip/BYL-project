#!/usr/bin/env bash
set -euo pipefail

# ========= A CONFIGURER =========
HOST="141.94.244.26"                 # IP ou domaine du VPS
USER="tom"                           # utilisateur SSH
REMOTE_WEBROOT="/var/www/byl-dist"   # root Nginx
REMOTE_BACKUPS="/var/www/byl_backups"
REMOTE_FRONT_RELEASES="/var/www/byl-front-releases"
REMOTE_BACKEND="/var/www/byl-backend"
LOCAL_API_HEALTH_URL="${LOCAL_API_HEALTH_URL:-http://127.0.0.1:5050/api/health}"
REMOTE_API_HEALTH_URL="${REMOTE_API_HEALTH_URL:-http://127.0.0.1:5000/api/health}"
REMOTE_NODE_VERSION="${REMOTE_NODE_VERSION:-22}"
REMOTE_CANARY_PORT="${REMOTE_CANARY_PORT:-5099}"
# =================================

ASSUME_YES=false
ALLOW_DIRTY=false
ALLOW_UNPUSHED=false
SKIP_PREFLIGHT=false
DEPLOY_FIRESTORE_RULES=true
DEPLOY_FIRESTORE_INDEXES=true
DEPLOY_STORAGE_RULES=true
DEPLOY_FIREBASE_FUNCTIONS=true

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [options]

Options:
  --yes                    Ne demande pas de confirmation interactive.
  --allow-dirty            Autorise un working tree non committe.
  --allow-unpushed         Autorise des commits locaux non push.
  --skip-preflight         Ignore lint/tests/build locaux.
  --skip-firebase          Ignore exceptionnellement tous les deploiements Firebase.
  --firebase-rules         Deploie les rules Firestore.
  --firebase-indexes       Deploie les index Firestore.
  --firebase-storage       Deploie les rules Firebase Storage.
  --firebase-functions     Deploie les Cloud Functions Firebase.
  --firebase-all           Deploie rules, index, Storage et Functions.
  --firebase-firestore-all Equivalent a --firebase-rules --firebase-indexes.
  -h, --help               Affiche cette aide.

Par defaut, le script deploie le front + backend VPS ainsi que toutes les
ressources Firebase utilisees par l'application: Firestore rules/indexes,
Storage rules et Cloud Functions. Utilise --skip-firebase uniquement pour
un deploiement VPS volontairement isole.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --yes) ASSUME_YES=true ;;
    --allow-dirty) ALLOW_DIRTY=true ;;
    --allow-unpushed) ALLOW_UNPUSHED=true ;;
    --skip-preflight) SKIP_PREFLIGHT=true ;;
    --skip-firebase)
      DEPLOY_FIRESTORE_RULES=false
      DEPLOY_FIRESTORE_INDEXES=false
      DEPLOY_STORAGE_RULES=false
      DEPLOY_FIREBASE_FUNCTIONS=false
      ;;
    --firebase-rules) DEPLOY_FIRESTORE_RULES=true ;;
    --firebase-indexes) DEPLOY_FIRESTORE_INDEXES=true ;;
    --firebase-storage) DEPLOY_STORAGE_RULES=true ;;
    --firebase-functions) DEPLOY_FIREBASE_FUNCTIONS=true ;;
    --firebase-all)
      DEPLOY_FIRESTORE_RULES=true
      DEPLOY_FIRESTORE_INDEXES=true
      DEPLOY_STORAGE_RULES=true
      DEPLOY_FIREBASE_FUNCTIONS=true
      ;;
    --firebase-firestore-all)
      DEPLOY_FIRESTORE_RULES=true
      DEPLOY_FIRESTORE_INDEXES=true
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

  local rules_changed=false
  local indexes_changed=false
  local storage_changed=false
  local functions_changed=false

  if ! git diff --quiet "${base}..HEAD" -- firestore.rules firebase.json; then
    rules_changed=true
  fi
  if ! git diff --quiet "${base}..HEAD" -- firestore.indexes.json; then
    indexes_changed=true
  fi
  if ! git diff --quiet "${base}..HEAD" -- storage.rules firebase.json; then
    storage_changed=true
  fi
  if ! git diff --quiet "${base}..HEAD" -- functions; then
    functions_changed=true
  fi

  if [ "$rules_changed" != true ] &&
    [ "$indexes_changed" != true ] &&
    [ "$storage_changed" != true ] &&
    [ "$functions_changed" != true ]; then
    return 0
  fi

  local missing=()
  if [ "$rules_changed" = true ] && [ "$DEPLOY_FIRESTORE_RULES" != true ]; then
    missing+=("Firestore rules")
  fi
  if [ "$indexes_changed" = true ] && [ "$DEPLOY_FIRESTORE_INDEXES" != true ]; then
    missing+=("Firestore indexes")
  fi
  if [ "$storage_changed" = true ] && [ "$DEPLOY_STORAGE_RULES" != true ]; then
    missing+=("Firebase Storage rules")
  fi
  if [ "$functions_changed" = true ] && [ "$DEPLOY_FIREBASE_FUNCTIONS" != true ]; then
    missing+=("Firebase functions")
  fi

  if [ "${#missing[@]}" -eq 0 ]; then
    return 0
  fi

  echo
  echo "Attention: le dernier commit touche des fichiers Firebase non inclus dans ce deploy:"
  printf ' - %s\n' "${missing[@]}"
  echo "Le deploy VPS ne les publie pas par defaut."
  echo "Options disponibles: --firebase-rules, --firebase-indexes, --firebase-storage, --firebase-functions."
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
  run_step npm run test:deploy
  run_step npm run test:footer-i18n
  run_step npm run test:sport-engine
  run_step npm run build
  run_step npm --prefix backend audit --omit=dev --audit-level=moderate
}

firebase_deploy_if_requested() {
  if [ "$DEPLOY_FIRESTORE_RULES" != true ] &&
    [ "$DEPLOY_FIRESTORE_INDEXES" != true ] &&
    [ "$DEPLOY_STORAGE_RULES" != true ] &&
    [ "$DEPLOY_FIREBASE_FUNCTIONS" != true ]; then
    return 0
  fi

  need_command firebase

  if [ "$DEPLOY_FIRESTORE_RULES" = true ]; then
    run_step firebase deploy --non-interactive --only firestore:rules
  fi

  if [ "$DEPLOY_FIRESTORE_INDEXES" = true ]; then
    echo
    echo "Attention: deployer les index Firestore peut proposer de supprimer des index existants."
    echo "Reponds toujours 'n' si Firebase demande de supprimer des index non presents localement."
    run_step firebase deploy --non-interactive --only firestore:indexes
  fi

  if [ "$DEPLOY_STORAGE_RULES" = true ]; then
    run_step firebase deploy --non-interactive --only storage
  fi

  if [ "$DEPLOY_FIREBASE_FUNCTIONS" = true ]; then
    run_step firebase deploy --non-interactive --only functions
  fi
}

ts="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="byl-dist-${ts}.tgz"
BACKEND_ARCHIVE="byl-backend-${ts}.tgz"
BACKEND_STAGE="${TMPDIR:-/tmp}/byl-backend-stage-${ts}"
SSH_CONTROL_PATH="${TMPDIR:-/tmp}/byl-deploy-${USER}-${HOST}-%p"
SSH_OPTS=(-o ControlMaster=auto -o ControlPersist=10m -o ControlPath="${SSH_CONTROL_PATH}")
REMOTE_SCRIPT="/tmp/byl-deploy-${ts}.sh"
REMOTE_SCRIPT_LOCAL="${TMPDIR:-/tmp}/byl-deploy-${ts}.sh"

cleanup() {
  ssh "${SSH_OPTS[@]}" -O exit "${USER}@${HOST}" >/dev/null 2>&1 || true
  rm -f "${ARCHIVE}" "${BACKEND_ARCHIVE}" "${REMOTE_SCRIPT_LOCAL}"
  rm -rf "${BACKEND_STAGE}"
}
trap cleanup EXIT

preflight
firebase_deploy_if_requested

echo
echo "Resume du deploy:"
echo "- VPS: front + backend"
echo "- Host: ${USER}@${HOST}"
echo "- Webroot: ${REMOTE_WEBROOT}"
echo "- Releases front: ${REMOTE_FRONT_RELEASES}"
echo "- Backend: ${REMOTE_BACKEND}"
echo "- Firestore rules: ${DEPLOY_FIRESTORE_RULES}"
echo "- Firestore indexes: ${DEPLOY_FIRESTORE_INDEXES}"
echo "- Firebase Storage rules: ${DEPLOY_STORAGE_RULES}"
echo "- Firebase functions: ${DEPLOY_FIREBASE_FUNCTIONS}"
echo "- Node distant cible: ${REMOTE_NODE_VERSION}"
echo "- Port canary backend: ${REMOTE_CANARY_PORT}"
echo
confirm "Lancer le deploy maintenant ?" || exit 1

if [ ! -d dist ]; then
  echo "dist introuvable apres build."
  exit 1
fi

echo "Archive dist -> ${ARCHIVE}"
tar -C dist -czf "${ARCHIVE}" .

echo "Archive backend -> ${BACKEND_ARCHIVE}"
rm -rf "${BACKEND_STAGE}"
mkdir -p "${BACKEND_STAGE}"
tar \
  --exclude "node_modules" \
  --exclude ".env" \
  --exclude "serviceAccountKey.json" \
  --exclude "firebase-service-account.json" \
  --exclude "*.log" \
  -C backend \
  -cf - . | tar -C "${BACKEND_STAGE}" -xf -

mkdir -p \
  "${BACKEND_STAGE}/ad-samples/social-publisher" \
  "${BACKEND_STAGE}/ad-samples/social-publisher/runs" \
  "${BACKEND_STAGE}/public/social-media"

tar \
  --exclude ".cert" \
  --exclude ".env.social" \
  --exclude "*.log" \
  --exclude "chatgpt-assets" \
  --exclude "creative-studio" \
  --exclude "public/social-media" \
  --exclude "runs" \
  -C ad-samples \
  -cf - social-publisher/src social-publisher/campaigns social-publisher/marketing-agent social-publisher/media-library social-publisher/demo-assets social-publisher/story-overlays | \
  tar -C "${BACKEND_STAGE}/ad-samples" -xf -

tar -C "${BACKEND_STAGE}" -czf "${BACKEND_ARCHIVE}" .

echo "Preparation du script distant -> ${REMOTE_SCRIPT_LOCAL}"
cat > "${REMOTE_SCRIPT_LOCAL}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="/tmp/${ARCHIVE}"
BACKEND_ARCHIVE="/tmp/${BACKEND_ARCHIVE}"
REMOTE_SCRIPT="${REMOTE_SCRIPT}"
REMOTE_WEBROOT="${REMOTE_WEBROOT}"
REMOTE_BACKUPS="${REMOTE_BACKUPS}"
REMOTE_FRONT_RELEASES="${REMOTE_FRONT_RELEASES}"
REMOTE_FRONT_RELEASE="${REMOTE_FRONT_RELEASES}/release-${ts}"
REMOTE_BACKEND="${REMOTE_BACKEND}"
REMOTE_BACKEND_RELEASE="/tmp/byl-backend-release-${ts}"
REMOTE_API_HEALTH_URL="${REMOTE_API_HEALTH_URL}"
REMOTE_NODE_VERSION="${REMOTE_NODE_VERSION}"
REMOTE_CANARY_PORT="${REMOTE_CANARY_PORT}"

[ -f "\$ARCHIVE" ] || { echo "Archive manquante: \$ARCHIVE"; exit 1; }
[ -f "\$BACKEND_ARCHIVE" ] || { echo "Archive backend manquante: \$BACKEND_ARCHIVE"; exit 1; }
[[ "\$REMOTE_WEBROOT" == /var/www/* ]] || { echo "REMOTE_WEBROOT non autorise"; exit 1; }
[[ "\$REMOTE_FRONT_RELEASES" == /var/www/* ]] || { echo "REMOTE_FRONT_RELEASES non autorise"; exit 1; }
[[ "\$REMOTE_BACKEND" == /var/www/* ]] || { echo "REMOTE_BACKEND non autorise"; exit 1; }

need_remote_command() {
  command -v "\$1" >/dev/null 2>&1 || {
    echo "Commande distante manquante: \$1"
    exit 1
  }
}

need_remote_command sudo
need_remote_command tar
need_remote_command curl

activate_remote_node() {
  local requested_major="\$REMOTE_NODE_VERSION"

  if [ -s "\$HOME/.nvm/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "\$HOME/.nvm/nvm.sh"
    nvm use "\$requested_major" >/dev/null 2>&1 ||
      nvm use 22 >/dev/null 2>&1 ||
      nvm use 20 >/dev/null 2>&1 ||
      nvm use 18 >/dev/null 2>&1 ||
      true
  fi

  if command -v fnm >/dev/null 2>&1; then
    eval "\$(fnm env --shell bash)"
    fnm use "\$requested_major" >/dev/null 2>&1 ||
      fnm use 22 >/dev/null 2>&1 ||
      fnm use 20 >/dev/null 2>&1 ||
      fnm use 18 >/dev/null 2>&1 ||
      true
  fi

  hash -r

  need_remote_command node
  need_remote_command npm
  need_remote_command pm2

  local node_major
  node_major="\$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
  if [ "\$node_major" -lt 18 ]; then
    echo "Node distant trop ancien: \$(node -v). Le backend requiert Node 18+."
    echo "Installe/active Node 22 sur le VPS, ou expose-le via nvm/fnm avant de relancer."
    exit 1
  fi

  echo "Node distant actif: \$(node -v)"
  echo "npm distant actif: \$(npm -v)"
  export NODE_INTERPRETER="\$(command -v node)"
  echo "Interpreteur Node PM2: \$NODE_INTERPRETER"
}

activate_remote_node

echo "Preparation dossiers..."
sudo mkdir -p "\$REMOTE_BACKUPS" "\$REMOTE_FRONT_RELEASES" "\$REMOTE_BACKEND"
BK=""
BK_BACKEND=""
PREVIOUS_FRONT_TARGET=""
SOCIAL_ENV_BACKUP="/tmp/byl-social-env-${ts}"

echo "Extraction front dans release temporaire..."
sudo rm -rf "\$REMOTE_FRONT_RELEASE"
sudo mkdir -p "\$REMOTE_FRONT_RELEASE"
sudo tar -C "\$REMOTE_FRONT_RELEASE" -xzf "\$ARCHIVE"

if [ ! -f "\$REMOTE_FRONT_RELEASE/index.html" ] || [ ! -d "\$REMOTE_FRONT_RELEASE/assets" ]; then
  echo "Release front invalide: index.html ou assets manquant."
  exit 1
fi

# Les chunks Vite portent un hash et sont caches 7 jours par Nginx. Une page
# deja ouverte peut encore les demander apres un deploy. On les reporte dans
# la nouvelle release avant la bascule, puis on ne garde que huit jours.
if [ -d "\$REMOTE_WEBROOT/assets" ]; then
  echo "Conservation des assets encore references par les navigateurs..."
  sudo cp -an "\$REMOTE_WEBROOT/assets/." "\$REMOTE_FRONT_RELEASE/assets/"
fi
sudo find "\$REMOTE_FRONT_RELEASE/assets" -type f -mtime +8 -delete
sudo chown -R www-data:www-data "\$REMOTE_FRONT_RELEASE"
sudo chmod -R 755 "\$REMOTE_FRONT_RELEASE"

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

prepare_canary_env() {
  if [ -f "\$REMOTE_BACKEND/.env" ]; then
    cp "\$REMOTE_BACKEND/.env" "\$REMOTE_BACKEND_RELEASE/.env"
  fi
  if [ -f "\$REMOTE_BACKEND/ad-samples/social-publisher/.env.social" ]; then
    mkdir -p "\$REMOTE_BACKEND_RELEASE/ad-samples/social-publisher"
    cp "\$REMOTE_BACKEND/ad-samples/social-publisher/.env.social" "\$REMOTE_BACKEND_RELEASE/ad-samples/social-publisher/.env.social"
  fi
  if [ -f "\$REMOTE_BACKEND/serviceAccountKey.json" ]; then
    cp "\$REMOTE_BACKEND/serviceAccountKey.json" "\$REMOTE_BACKEND_RELEASE/serviceAccountKey.json"
  fi
  if [ -f "\$REMOTE_BACKEND/firebase-service-account.json" ]; then
    cp "\$REMOTE_BACKEND/firebase-service-account.json" "\$REMOTE_BACKEND_RELEASE/firebase-service-account.json"
  fi

  touch "\$REMOTE_BACKEND_RELEASE/.env"
  if grep -q '^PORT=' "\$REMOTE_BACKEND_RELEASE/.env"; then
    sed -i "s/^PORT=.*/PORT=\$REMOTE_CANARY_PORT/" "\$REMOTE_BACKEND_RELEASE/.env"
  else
    printf '\nPORT=%s\n' "\$REMOTE_CANARY_PORT" >> "\$REMOTE_BACKEND_RELEASE/.env"
  fi
  if ! grep -q '^NODE_ENV=' "\$REMOTE_BACKEND_RELEASE/.env"; then
    printf 'NODE_ENV=production\n' >> "\$REMOTE_BACKEND_RELEASE/.env"
  fi
}

run_backend_canary() {
  local canary_log="/tmp/byl-backend-canary-${ts}.log"
  local canary_pid=""
  local admin_key=""

  echo "Test canary backend sur le port \$REMOTE_CANARY_PORT..."
  prepare_canary_env

  cd "\$REMOTE_BACKEND_RELEASE"
  NODE_ENV=production "\$NODE_INTERPRETER" app.js >"\$canary_log" 2>&1 &
  canary_pid="\$!"

  for attempt in \$(seq 1 15); do
    if curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:\$REMOTE_CANARY_PORT/api/health" >/dev/null; then
      echo "Canary backend OK."
      if [ -f "\$REMOTE_BACKEND_RELEASE/.env" ]; then
        admin_key="\$(awk -F= '/^ADMIN_SEARCH_KEY=/ {print \$2; exit}' "\$REMOTE_BACKEND_RELEASE/.env" | tr -d '"'\''[:space:]' || true)"
      fi
      if [ -n "\$admin_key" ]; then
        echo "Test canary Social Publisher..."
        if ! curl --fail --silent --show-error --max-time 10 \
          -H "x-admin-key: \$admin_key" \
          "http://127.0.0.1:\$REMOTE_CANARY_PORT/api/social-publisher/connections" >/dev/null; then
          echo "Le canary Social Publisher ne repond pas."
          cat "\$canary_log" || true
          kill "\$canary_pid" >/dev/null 2>&1 || true
          wait "\$canary_pid" >/dev/null 2>&1 || true
          return 1
        fi
      else
        echo "ADMIN_SEARCH_KEY absent: test canary Social Publisher ignore."
      fi
      kill "\$canary_pid" >/dev/null 2>&1 || true
      wait "\$canary_pid" >/dev/null 2>&1 || true
      rm -f "\$canary_log"
      return 0
    fi
    if ! kill -0 "\$canary_pid" >/dev/null 2>&1; then
      echo "Le canary backend s'est arrete avant de repondre."
      cat "\$canary_log" || true
      return 1
    fi
    echo "Canary backend pas encore disponible, tentative \$attempt/15..."
    sleep 2
  done

  echo "Le canary backend ne repond pas."
  cat "\$canary_log" || true
  kill "\$canary_pid" >/dev/null 2>&1 || true
  wait "\$canary_pid" >/dev/null 2>&1 || true
  return 1
}

run_backend_canary

echo "Nettoyage des secrets temporaires de la release backend..."
rm -f \
  "\$REMOTE_BACKEND_RELEASE/.env" \
  "\$REMOTE_BACKEND_RELEASE/ad-samples/social-publisher/.env.social" \
  "\$REMOTE_BACKEND_RELEASE/serviceAccountKey.json" \
  "\$REMOTE_BACKEND_RELEASE/firebase-service-account.json"

echo "Backup front actuel..."
if [ -d "\$REMOTE_WEBROOT" ] && [ "\$(ls -A "\$REMOTE_WEBROOT" 2>/dev/null | wc -l)" -gt 0 ]; then
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

activate_front_release() {
  local target="\$1"
  local next_link="\${REMOTE_WEBROOT}.next-${ts}"

  [ -d "\$target" ] || { echo "Release front introuvable: \$target"; return 1; }
  sudo rm -f "\$next_link"
  sudo ln -s "\$target" "\$next_link"

  if [ -L "\$REMOTE_WEBROOT" ]; then
    # mv -T remplace le lien courant en une seule operation atomique.
    sudo mv -Tf "\$next_link" "\$REMOTE_WEBROOT"
    return 0
  fi

  if [ -d "\$REMOTE_WEBROOT" ]; then
    # Migration unique depuis l'ancien dossier physique. Les deploys suivants
    # passent uniquement par la branche atomique ci-dessus.
    local legacy_release="\${REMOTE_FRONT_RELEASES}/legacy-${ts}"
    sudo mv "\$REMOTE_WEBROOT" "\$legacy_release"
    PREVIOUS_FRONT_TARGET="\$legacy_release"
  fi

  sudo mv -Tf "\$next_link" "\$REMOTE_WEBROOT"
}

if [ -L "\$REMOTE_WEBROOT" ]; then
  PREVIOUS_FRONT_TARGET="\$(readlink -f "\$REMOTE_WEBROOT")"
elif [ -d "\$REMOTE_WEBROOT" ]; then
  PREVIOUS_FRONT_TARGET="\$REMOTE_WEBROOT"
fi

echo "Publication front atomique..."
activate_front_release "\$REMOTE_FRONT_RELEASE"
echo "Front actif: \$(readlink -f "\$REMOTE_WEBROOT")"

echo "Publication backend..."
if [ -f "\$REMOTE_BACKEND/ad-samples/social-publisher/.env.social" ]; then
  cp "\$REMOTE_BACKEND/ad-samples/social-publisher/.env.social" "\$SOCIAL_ENV_BACKUP"
fi
if command -v rsync >/dev/null 2>&1; then
  sudo rsync -a --delete \
    --exclude ".env" \
    --exclude "public/social-media" \
    --exclude "ad-samples/social-publisher/.env.social" \
    --exclude "serviceAccountKey.json" \
    --exclude "firebase-service-account.json" \
    "\$REMOTE_BACKEND_RELEASE"/ "\$REMOTE_BACKEND"/
else
  sudo find "\$REMOTE_BACKEND" -mindepth 1 -maxdepth 1 \
    ! -name ".env" \
    ! -name "public" \
    ! -name "serviceAccountKey.json" \
    ! -name "firebase-service-account.json" \
    -exec rm -rf {} +
  sudo mkdir -p "\$REMOTE_BACKEND/public/social-media"
  (cd "\$REMOTE_BACKEND_RELEASE" && tar \
    --exclude ".env" \
    --exclude "public/social-media" \
    --exclude "ad-samples/social-publisher/.env.social" \
    --exclude "serviceAccountKey.json" \
    --exclude "firebase-service-account.json" \
    -cf - .) | sudo tar -C "\$REMOTE_BACKEND" -xf -
fi
if [ -f "\$SOCIAL_ENV_BACKUP" ]; then
  sudo mkdir -p "\$REMOTE_BACKEND/ad-samples/social-publisher"
  sudo cp "\$SOCIAL_ENV_BACKUP" "\$REMOTE_BACKEND/ad-samples/social-publisher/.env.social"
  rm -f "\$SOCIAL_ENV_BACKUP"
fi
sudo chown -R "\$USER":"\$USER" "\$REMOTE_BACKEND"

cd "\$REMOTE_BACKEND"
echo "Reload PM2..."
NODE_INTERPRETER="\$NODE_INTERPRETER" pm2 startOrReload ecosystem.config.js --update-env

rollback_release() {
  echo
  echo "Rollback automatique en cours..."

  if [ -n "\$BK_BACKEND" ] && [ -f "\$BK_BACKEND" ]; then
    echo "Restauration backend: \$BK_BACKEND"
    sudo find "\$REMOTE_BACKEND" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    sudo tar -C "\$REMOTE_BACKEND" -xzf "\$BK_BACKEND"
    sudo chown -R "\$USER":"\$USER" "\$REMOTE_BACKEND"
    cd "\$REMOTE_BACKEND"
    echo "Reinstallation dependances backend apres rollback..."
    if [ -f package-lock.json ]; then
      npm ci --omit=dev
    else
      npm install --omit=dev
    fi
  else
    echo "Aucun backup backend disponible pour rollback."
  fi

  if [ -n "\$PREVIOUS_FRONT_TARGET" ] && [ -d "\$PREVIOUS_FRONT_TARGET" ]; then
    echo "Restauration atomique du front: \$PREVIOUS_FRONT_TARGET"
    activate_front_release "\$PREVIOUS_FRONT_TARGET"
  elif [ -n "\$BK" ] && [ -f "\$BK" ]; then
    local rollback_front="\${REMOTE_FRONT_RELEASES}/rollback-${ts}"
    echo "Restauration du backup front: \$BK"
    sudo rm -rf "\$rollback_front"
    sudo mkdir -p "\$rollback_front"
    sudo tar -C "\$rollback_front" -xzf "\$BK"
    sudo chown -R www-data:www-data "\$rollback_front"
    sudo chmod -R 755 "\$rollback_front"
    activate_front_release "\$rollback_front"
  else
    echo "Aucun backup front disponible pour rollback."
  fi

  if [ -f "\$REMOTE_BACKEND/ecosystem.config.js" ]; then
    cd "\$REMOTE_BACKEND"
    NODE_INTERPRETER="\$NODE_INTERPRETER" pm2 startOrReload ecosystem.config.js --update-env || true
  fi
}

echo "Verification API..."
remote_env_port=""
if [ -f "\$REMOTE_BACKEND/.env" ]; then
  remote_env_port="\$(awk -F= '/^PORT=/ {print \$2; exit}' "\$REMOTE_BACKEND/.env" | tr -d '\"'\''[:space:]' || true)"
fi

health_urls=("\$REMOTE_API_HEALTH_URL")
if [ -n "\$remote_env_port" ]; then
  health_urls+=("http://127.0.0.1:\${remote_env_port}/api/health")
fi
health_urls+=("http://127.0.0.1:5000/api/health" "http://127.0.0.1:5050/api/health")

check_api_health() {
  local max_attempts="\$1"
  local wait_seconds="\$2"
  local url
  local attempt

  for attempt in \$(seq 1 "\$max_attempts"); do
    for url in "\${health_urls[@]}"; do
      if curl --fail --silent --show-error --max-time 5 "\$url" >/dev/null; then
        echo "API OK: \$url"
        return 0
      fi
    done
    echo "API pas encore disponible, tentative \$attempt/\$max_attempts..."
    sleep "\$wait_seconds"
  done

  return 1
}

api_ready=false
if check_api_health 12 3; then
  api_ready=true
fi

if [ "\$api_ready" != true ]; then
  echo "L'API ne repond pas apres reload PM2."
  echo "Statut PM2:"
  pm2 status || true
  echo
  echo "Logs byl-api:"
  pm2 logs byl-api --lines 80 --nostream || true
  echo
  echo "Ports en ecoute:"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp || true
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltnp || true
  fi
  rollback_release
  echo
  echo "Verification API apres rollback..."
  if check_api_health 3 2; then
    echo "Rollback effectue: l'API repond a nouveau."
  else
    echo "Rollback effectue, mais l'API ne repond toujours pas. Intervention manuelle requise."
  fi
  exit 1
fi

echo "Nettoyage distant..."
sudo rm -f "\$ARCHIVE" "\$BACKEND_ARCHIVE"
rm -rf "\$REMOTE_BACKEND_RELEASE"
rm -f "\$REMOTE_SCRIPT"

echo "Nettoyage des anciennes releases front (plus de 9 jours)..."
active_front_target="\$(readlink -f "\$REMOTE_WEBROOT")"
while IFS= read -r old_release; do
  if [ "\$old_release" != "\$active_front_target" ]; then
    sudo rm -rf "\$old_release"
  fi
done < <(sudo find "\$REMOTE_FRONT_RELEASES" -mindepth 1 -maxdepth 1 -type d -mtime +9 -print)

echo "Deploy distant termine."
EOF

echo "Upload vers ${USER}@${HOST}:/tmp/"
scp "${SSH_OPTS[@]}" "${ARCHIVE}" "${BACKEND_ARCHIVE}" "${REMOTE_SCRIPT_LOCAL}" "${USER}@${HOST}:/tmp/"

echo "Deploiement sur le serveur..."
ssh -tt "${SSH_OPTS[@]}" "${USER}@${HOST}" "bash '${REMOTE_SCRIPT}'"

echo "Deploy termine."
