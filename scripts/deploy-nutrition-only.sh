#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
package="$root/audits/nutrition-release"
mode="${1:---check}"
if [[ "$mode" != --check && "$mode" != --deploy ]]; then
  echo 'Usage: bash scripts/deploy-nutrition-only.sh [--check|--deploy]'; exit 2
fi
[[ $# -le 1 ]] || exit 2
(cd "$package" && shasum -a 256 -c package.sha256)
if [[ "$mode" == --check ]]; then
  echo 'Paquet nutrition vérifié localement. Aucun accès serveur ni déploiement.'
  exit 0
fi
host="tom@141.94.244.26"
echo 'Publication du frontend nutrition uniquement. Ancienne release conservée.'
echo 'Le serveur refusera si la version active a changé depuis la qualification.'
read -r -p 'Saisir PUBLIER NUTRITION pour continuer : ' answer
[[ "$answer" == 'PUBLIER NUTRITION' ]] || { echo 'Annulé.'; exit 1; }
remote="/tmp/byl-nutrition-$(date +%s)-$$"
ssh "$host" "umask 077; mkdir '$remote'"
scp "$package/nutrition-overlay.tgz" "$package/expected-production.sha256" "$package/overlay.sha256" "$package/package.sha256" "$root/scripts/releases/nutrition/publish-remote.sh" "$host:$remote/"
ssh -t "$host" "sudo bash '$remote/publish-remote.sh' '$remote'"
