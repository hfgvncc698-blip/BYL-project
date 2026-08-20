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
REMOTE_MIN_FREE_MB="${REMOTE_MIN_FREE_MB:-1024}"
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
# Le chemin doit rester court (macOS limite fortement la longueur des sockets Unix).
# La connexion maitre evite de redemander le mot de passe SSH a chaque scp/ssh.
SSH_CONTROL_PATH="/tmp/byl-ssh-${UID}-%C"
SSH_OPTS=(
  -o ControlMaster=auto
  -o ControlPersist=yes
  -o ControlPath="${SSH_CONTROL_PATH}"
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=4
)
SSH_MASTER_STARTED=false
REMOTE_SUDO_PASSWORD=""
REMOTE_SUDO_REQUIRES_PASSWORD=false
REMOTE_SCRIPT="/tmp/byl-deploy-${ts}.sh"
REMOTE_SCRIPT_LOCAL="${TMPDIR:-/tmp}/byl-deploy-${ts}.sh"
REMOTE_STORAGE_SCRIPT="/tmp/byl-storage-cleanup-${ts}.sh"
REMOTE_STORAGE_SCRIPT_LOCAL="${TMPDIR:-/tmp}/byl-storage-cleanup-${ts}.sh"

cleanup() {
  if [ "$SSH_MASTER_STARTED" = true ]; then
    ssh "${SSH_OPTS[@]}" -O exit "${USER}@${HOST}" >/dev/null 2>&1 || true
  fi
  REMOTE_SUDO_PASSWORD=""
  rm -f "${ARCHIVE}" "${BACKEND_ARCHIVE}" "${REMOTE_SCRIPT_LOCAL}" "${REMOTE_STORAGE_SCRIPT_LOCAL}"
  rm -rf "${BACKEND_STAGE}"
}
trap cleanup EXIT

open_remote_connection() {
  echo "Ouverture d'une connexion SSH persistante vers ${USER}@${HOST}..."
  ssh "${SSH_OPTS[@]}" -MNf "${USER}@${HOST}"
  SSH_MASTER_STARTED=true
  ssh "${SSH_OPTS[@]}" -O check "${USER}@${HOST}" >/dev/null
  echo "Connexion SSH validee. Elle sera reutilisee pendant tout le deploy."
}

prepare_remote_sudo() {
  # Verifie le vrai mode sans mot de passe, independamment d'un ancien cache sudo.
  if ssh -T "${SSH_OPTS[@]}" "${USER}@${HOST}" \
    "sudo -k >/dev/null 2>&1; sudo -n true" >/dev/null 2>&1; then
    REMOTE_SUDO_REQUIRES_PASSWORD=false
    echo "Autorisation sudo distante sans mot de passe validee."
    return 0
  fi

  REMOTE_SUDO_REQUIRES_PASSWORD=true
  local attempt
  for attempt in 1 2 3; do
    read -r -s -p "Mot de passe sudo du VPS (saisi une seule fois) : " REMOTE_SUDO_PASSWORD
    echo

    if [ -z "$REMOTE_SUDO_PASSWORD" ]; then
      echo "Le mot de passe ne peut pas etre vide."
      continue
    fi

    # Le secret passe uniquement par stdin : jamais dans un fichier ni dans
    # les arguments visibles par les autres processus.
    if printf '%s\n' "$REMOTE_SUDO_PASSWORD" |
      ssh -T "${SSH_OPTS[@]}" "${USER}@${HOST}" "sudo -S -k -p '' -v"; then
      echo "Mot de passe sudo valide."
      return 0
    fi

    REMOTE_SUDO_PASSWORD=""
    echo "Mot de passe sudo refuse (tentative ${attempt}/3)."
  done

  echo "Impossible de valider sudo apres 3 tentatives. Deploy annule."
  return 1
}

run_remote_root_script() {
  local remote_command="$1"
  if [ "$REMOTE_SUDO_REQUIRES_PASSWORD" = true ]; then
    printf '%s\n' "$REMOTE_SUDO_PASSWORD" |
      ssh -T "${SSH_OPTS[@]}" "${USER}@${HOST}" "sudo -S -k -p '' -- ${remote_command}"
  else
    ssh -T "${SSH_OPTS[@]}" "${USER}@${HOST}" "sudo -n -- ${remote_command}"
  fi
}

run_remote_deploy_script() {
  if [ "$REMOTE_SUDO_REQUIRES_PASSWORD" = true ]; then
    printf '%s\n' "$REMOTE_SUDO_PASSWORD" |
      ssh -T "${SSH_OPTS[@]}" "${USER}@${HOST}" \
        "exec bash '${REMOTE_SCRIPT}' --sudo-password-stdin"
  else
    ssh -T "${SSH_OPTS[@]}" "${USER}@${HOST}" \
      "exec bash '${REMOTE_SCRIPT}' --sudo-nopasswd"
  fi
}

prepare_remote_storage() {
  echo "Preparation du nettoyage distant -> ${REMOTE_STORAGE_SCRIPT_LOCAL}"
  cat > "${REMOTE_STORAGE_SCRIPT_LOCAL}" <<'REMOTE_STORAGE_CLEANUP'
#!/usr/bin/env bash
set -euo pipefail

remote_webroot="$1"
front_releases="$2"
remote_backups="$3"
minimum_free_mb="$4"

[[ "$remote_webroot" == /var/www/* ]] || exit 1
[[ "$front_releases" == /var/www/* ]] || exit 1
[[ "$remote_backups" == /var/www/* ]] || exit 1

echo "Nettoyage des fichiers temporaires BYL abandonnes..."
find /tmp -mindepth 1 -maxdepth 1 -type d -name 'byl-backend-release-*' -exec rm -rf -- {} +
find /tmp -mindepth 1 -maxdepth 1 -type f \
  \( -name 'byl-backend-*.tgz' -o -name 'byl-dist-*.tgz' -o -name 'byl-deploy-*.sh' -o -name 'byl-backend-canary-*.log' \) \
  -delete

active_front="$(readlink -f "$remote_webroot" 2>/dev/null || true)"
if [ -d "$front_releases" ]; then
  while IFS= read -r abandoned_release; do
    if [ "$abandoned_release" != "$active_front" ]; then
      rm -rf "$abandoned_release"
    fi
  done < <(find "$front_releases" -mindepth 1 -maxdepth 1 -type d -name 'release-*' -print)
fi

prune_backups() {
  local pattern="$1"
  local keep="$2"
  local index
  local -a files=()

  [ -d "$remote_backups" ] || return 0
  mapfile -t files < <(find "$remote_backups" -maxdepth 1 -type f -name "$pattern" -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
  for ((index = keep; index < ${#files[@]}; index += 1)); do
    rm -f "${files[$index]}"
  done
}

prune_backups 'byl-backend-*.tgz' 2
prune_backups 'byl-20*.tgz' 2

available_kb="$(df -Pk /var/www | awk 'NR == 2 { print $4 }')"
required_kb="$((minimum_free_mb * 1024))"
if [ "${available_kb:-0}" -lt "$required_kb" ]; then
  echo "Espace disque insuffisant apres nettoyage: $((available_kb / 1024)) Mo disponibles, ${minimum_free_mb} Mo requis."
  echo "Le deploiement est arrete avant Firebase et avant l'upload principal."
  exit 1
fi

echo "Espace disque disponible: $((available_kb / 1024)) Mo."
REMOTE_STORAGE_CLEANUP

  chmod 700 "${REMOTE_STORAGE_SCRIPT_LOCAL}"
  echo "Envoi du controle d'espace distant..."
  scp "${SSH_OPTS[@]}" "${REMOTE_STORAGE_SCRIPT_LOCAL}" "${USER}@${HOST}:${REMOTE_STORAGE_SCRIPT}"

  echo "Liberation et controle de l'espace distant..."
  if ! run_remote_root_script \
    "bash '${REMOTE_STORAGE_SCRIPT}' '${REMOTE_WEBROOT}' '${REMOTE_FRONT_RELEASES}' '${REMOTE_BACKUPS}' '${REMOTE_MIN_FREE_MB}'"; then
    ssh -T "${SSH_OPTS[@]}" "${USER}@${HOST}" "rm -f '${REMOTE_STORAGE_SCRIPT}'" || true
    return 1
  fi
  ssh -T "${SSH_OPTS[@]}" "${USER}@${HOST}" "rm -f '${REMOTE_STORAGE_SCRIPT}'"
}

preflight

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
echo "- Espace distant minimal: ${REMOTE_MIN_FREE_MB} Mo"
echo
confirm "Lancer le deploy maintenant ?" || exit 1

open_remote_connection
prepare_remote_sudo
prepare_remote_storage
firebase_deploy_if_requested

if [ ! -d dist ]; then
  echo "dist introuvable apres build."
  exit 1
fi

echo "Archive dist -> ${ARCHIVE}"
COPYFILE_DISABLE=1 COPY_EXTENDED_ATTRIBUTES_DISABLE=1 tar -C dist -czf "${ARCHIVE}" .

echo "Archive backend -> ${BACKEND_ARCHIVE}"
rm -rf "${BACKEND_STAGE}"
mkdir -p "${BACKEND_STAGE}"
COPYFILE_DISABLE=1 COPY_EXTENDED_ATTRIBUTES_DISABLE=1 tar \
  --exclude "node_modules" \
  --exclude ".env" \
  --exclude "serviceAccountKey.json" \
  --exclude "firebase-service-account.json" \
  --exclude "*.log" \
  -C backend \
  -cf - . | tar -C "${BACKEND_STAGE}" -xf -

COPYFILE_DISABLE=1 COPY_EXTENDED_ATTRIBUTES_DISABLE=1 tar -C "${BACKEND_STAGE}" -czf "${BACKEND_ARCHIVE}" .

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
REMOTE_MIN_FREE_MB="${REMOTE_MIN_FREE_MB}"
SUDO_MODE="\${1:-}"
REMOTE_SUDO_PASSWORD=""

[ -f "\$ARCHIVE" ] || { echo "Archive manquante: \$ARCHIVE"; exit 1; }
[ -f "\$BACKEND_ARCHIVE" ] || { echo "Archive backend manquante: \$BACKEND_ARCHIVE"; exit 1; }
[[ "\$REMOTE_WEBROOT" == /var/www/* ]] || { echo "REMOTE_WEBROOT non autorise"; exit 1; }
[[ "\$REMOTE_FRONT_RELEASES" == /var/www/* ]] || { echo "REMOTE_FRONT_RELEASES non autorise"; exit 1; }
[[ "\$REMOTE_FRONT_RELEASE" == "\$REMOTE_FRONT_RELEASES"/release-* ]] || { echo "REMOTE_FRONT_RELEASE non autorise"; exit 1; }
[[ "\$REMOTE_BACKEND" == /var/www/* ]] || { echo "REMOTE_BACKEND non autorise"; exit 1; }

cleanup_remote_stage() {
  rm -rf "\$REMOTE_BACKEND_RELEASE"
  rm -f "\$ARCHIVE" "\$BACKEND_ARCHIVE" "\$REMOTE_SCRIPT"

  local active_front=""
  active_front="\$(readlink -f "\$REMOTE_WEBROOT" 2>/dev/null || true)"
  if [ -d "\$REMOTE_FRONT_RELEASE" ] && [ "\$active_front" != "\$REMOTE_FRONT_RELEASE" ]; then
    if declare -F sudo_run >/dev/null 2>&1; then
      sudo_run rm -rf "\$REMOTE_FRONT_RELEASE"
    fi
  fi
  REMOTE_SUDO_PASSWORD=""
}
trap cleanup_remote_stage EXIT

need_remote_command() {
  command -v "\$1" >/dev/null 2>&1 || {
    echo "Commande distante manquante: \$1"
    exit 1
  }
}

need_remote_command sudo
need_remote_command tar
need_remote_command curl

# Le secret est lu une seule fois depuis stdin, reste uniquement en memoire et
# n'apparait jamais dans un fichier ou dans les arguments des processus.
if [ "\$SUDO_MODE" = "--sudo-password-stdin" ]; then
  IFS= read -r REMOTE_SUDO_PASSWORD || {
    echo "Mot de passe sudo distant non recu. Deploy annule."
    exit 1
  }
  [ -n "\$REMOTE_SUDO_PASSWORD" ] || {
    echo "Mot de passe sudo distant vide. Deploy annule."
    exit 1
  }
  sudo_run() {
    printf '%s\n' "\$REMOTE_SUDO_PASSWORD" | command sudo -S -p '' -- "\$@"
  }
elif [ "\$SUDO_MODE" = "--sudo-nopasswd" ]; then
  sudo_run() {
    command sudo -n -- "\$@"
  }
else
  echo "Mode sudo distant invalide. Deploy annule."
  exit 1
fi

sudo_run true || {
  echo "L'autorisation sudo distante n'est pas disponible. Deploy annule."
  exit 1
}

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
sudo_run mkdir -p "\$REMOTE_BACKUPS" "\$REMOTE_FRONT_RELEASES" "\$REMOTE_BACKEND"
BK=""
BK_BACKEND=""
PREVIOUS_FRONT_TARGET=""

echo "Extraction front dans release temporaire..."
sudo_run rm -rf "\$REMOTE_FRONT_RELEASE"
sudo_run mkdir -p "\$REMOTE_FRONT_RELEASE"
sudo_run tar -C "\$REMOTE_FRONT_RELEASE" -xzf "\$ARCHIVE"

if [ ! -f "\$REMOTE_FRONT_RELEASE/index.html" ] || [ ! -d "\$REMOTE_FRONT_RELEASE/assets" ]; then
  echo "Release front invalide: index.html ou assets manquant."
  exit 1
fi

# Les chunks Vite portent un hash et sont caches 7 jours par Nginx. Une page
# deja ouverte peut encore les demander apres un deploy. On les reporte dans
# la nouvelle release avant la bascule, puis on ne garde que huit jours.
if [ -d "\$REMOTE_WEBROOT/assets" ]; then
  echo "Conservation des assets encore references par les navigateurs..."
  sudo_run cp -an "\$REMOTE_WEBROOT/assets/." "\$REMOTE_FRONT_RELEASE/assets/"
fi
sudo_run find "\$REMOTE_FRONT_RELEASE/assets" -type f -mtime +8 -delete
sudo_run chown -R www-data:www-data "\$REMOTE_FRONT_RELEASE"
sudo_run chmod -R 755 "\$REMOTE_FRONT_RELEASE"

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

  echo "Test canary backend sur le port \$REMOTE_CANARY_PORT..."
  prepare_canary_env

  cd "\$REMOTE_BACKEND_RELEASE"
  NODE_ENV=production "\$NODE_INTERPRETER" app.js >"\$canary_log" 2>&1 &
  canary_pid="\$!"

  for attempt in \$(seq 1 15); do
    if curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:\$REMOTE_CANARY_PORT/api/health" >/dev/null; then
      echo "Canary backend OK."
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
  "\$REMOTE_BACKEND_RELEASE/serviceAccountKey.json" \
  "\$REMOTE_BACKEND_RELEASE/firebase-service-account.json"

echo "Backup front actuel..."
if [ -d "\$REMOTE_WEBROOT" ] && [ "\$(ls -A "\$REMOTE_WEBROOT" 2>/dev/null | wc -l)" -gt 0 ]; then
  BK="\$REMOTE_BACKUPS/byl-\$(date +%Y%m%d-%H%M%S).tgz"
  sudo_run tar -C "\$REMOTE_WEBROOT" -czf "\$BK" .
  echo "Backup front: \$BK"
else
  echo "Pas de front existant a sauvegarder."
fi

echo "Backup backend actuel..."
if [ "\$(ls -A "\$REMOTE_BACKEND" 2>/dev/null | wc -l)" -gt 0 ]; then
  BK_BACKEND="\$REMOTE_BACKUPS/byl-backend-\$(date +%Y%m%d-%H%M%S).tgz"
  sudo_run tar \
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
  sudo_run rm -f "\$next_link"
  sudo_run ln -s "\$target" "\$next_link"

  if [ -L "\$REMOTE_WEBROOT" ]; then
    # mv -T remplace le lien courant en une seule operation atomique.
    sudo_run mv -Tf "\$next_link" "\$REMOTE_WEBROOT"
    return 0
  fi

  if [ -d "\$REMOTE_WEBROOT" ]; then
    # Migration unique depuis l'ancien dossier physique. Les deploys suivants
    # passent uniquement par la branche atomique ci-dessus.
    local legacy_release="\${REMOTE_FRONT_RELEASES}/legacy-${ts}"
    sudo_run mv "\$REMOTE_WEBROOT" "\$legacy_release"
    PREVIOUS_FRONT_TARGET="\$legacy_release"
  fi

  sudo_run mv -Tf "\$next_link" "\$REMOTE_WEBROOT"
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
if command -v rsync >/dev/null 2>&1; then
  sudo_run rsync -a --delete \
    --exclude ".env" \
    --exclude "serviceAccountKey.json" \
    --exclude "firebase-service-account.json" \
    "\$REMOTE_BACKEND_RELEASE"/ "\$REMOTE_BACKEND"/
else
  sudo_run find "\$REMOTE_BACKEND" -mindepth 1 -maxdepth 1 \
    ! -name ".env" \
    ! -name "public" \
    ! -name "serviceAccountKey.json" \
    ! -name "firebase-service-account.json" \
    -exec rm -rf {} +
  (cd "\$REMOTE_BACKEND_RELEASE" && tar \
    --exclude ".env" \
    --exclude "serviceAccountKey.json" \
    --exclude "firebase-service-account.json" \
    -cf - .) | sudo_run tar -C "\$REMOTE_BACKEND" -xf -
fi
sudo_run chown -R "\$USER":"\$USER" "\$REMOTE_BACKEND"

cd "\$REMOTE_BACKEND"
echo "Reload PM2..."
NODE_INTERPRETER="\$NODE_INTERPRETER" pm2 startOrReload ecosystem.config.js --update-env

rollback_release() {
  echo
  echo "Rollback automatique en cours..."

  if [ -n "\$BK_BACKEND" ] && [ -f "\$BK_BACKEND" ]; then
    echo "Restauration backend: \$BK_BACKEND"
    sudo_run find "\$REMOTE_BACKEND" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    sudo_run tar -C "\$REMOTE_BACKEND" -xzf "\$BK_BACKEND"
    sudo_run chown -R "\$USER":"\$USER" "\$REMOTE_BACKEND"
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
    sudo_run rm -rf "\$rollback_front"
    sudo_run mkdir -p "\$rollback_front"
    sudo_run tar -C "\$rollback_front" -xzf "\$BK"
    sudo_run chown -R www-data:www-data "\$rollback_front"
    sudo_run chmod -R 755 "\$rollback_front"
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
sudo_run rm -f "\$ARCHIVE" "\$BACKEND_ARCHIVE"
rm -rf "\$REMOTE_BACKEND_RELEASE"
rm -f "\$REMOTE_SCRIPT"

echo "Nettoyage des anciennes releases front (plus de 9 jours)..."
active_front_target="\$(readlink -f "\$REMOTE_WEBROOT")"
while IFS= read -r old_release; do
  if [ "\$old_release" != "\$active_front_target" ]; then
    sudo_run rm -rf "\$old_release"
  fi
done < <(sudo_run find "\$REMOTE_FRONT_RELEASES" -mindepth 1 -maxdepth 1 -type d -mtime +9 -print)

REMOTE_SUDO_PASSWORD=""
trap - EXIT

echo "Deploy distant termine."
EOF

echo "Upload vers ${USER}@${HOST}:/tmp/"
scp "${SSH_OPTS[@]}" "${ARCHIVE}" "${BACKEND_ARCHIVE}" "${REMOTE_SCRIPT_LOCAL}" "${USER}@${HOST}:/tmp/"

echo "Deploiement sur le serveur..."
run_remote_deploy_script

echo "Deploy termine."
