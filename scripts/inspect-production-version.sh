#!/usr/bin/env bash
# Read-only diagnostic. Never deploys, restarts services or reads application secrets.
set -euo pipefail
if [[ "${1:-}" == "--help" ]]; then
  echo 'Usage: bash scripts/inspect-production-version.sh [utilisateur@serveur]'
  echo 'Connexion SSH en lecture seule ; cible par défaut issue de deploy.sh.'
  exit 0
fi
if (( $# > 1 )); then echo 'Trop de paramètres.' >&2; exit 2; fi
host="${1:-tom@141.94.244.26}"
if [[ ! "$host" =~ ^[a-zA-Z0-9._-]+@[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]; then
  echo 'Cible SSH invalide (format utilisateur@serveur).' >&2; exit 2
fi
ssh -o ConnectTimeout=15 "$host" 'bash -s' <<'REMOTE'
set -eu
webroot=/var/www/byl-dist
printf '%s\n' '=== Version frontend active ==='
if [ -e "$webroot/index.html" ]; then
  readlink -f "$webroot"
  stat -c 'Date index.html : %y' "$webroot/index.html"
  sha256sum "$webroot/index.html"
else
  printf '%s\n' 'index.html absent ou inaccessible.'
fi
printf '%s\n' '=== Référence Git éventuelle du backend (indice, pas preuve du frontend) ==='
if [ -d /var/www/byl-backend/.git ]; then
  git -C /var/www/byl-backend rev-parse --verify HEAD
else
  printf '%s\n' 'Pas de dépôt Git dans le backend déployé.'
fi
printf '%s\n' '=== Limite ===' \
  'Le script actuel ne conserve pas le commit frontend dans la release.' \
  'Le nom, la date et le hash ci-dessus identifient les fichiers publiés, pas leur commit source.' \
  'Chercher la ligne « Git: branche @ commit » dans le journal du dernier déploiement.' \
  'Si --allow-dirty était utilisé, le commit seul ne suffit pas : il faut les sources exactes.'
REMOTE
