#!/usr/bin/env bash
set -euo pipefail

# Publie le correctif GPS seulement si la version de départ correspond aux
# fichiers effectivement servis. Aucun fichier de production n'est touché
# avant les comparaisons et la confirmation interactive de deploy.sh.
BASE=12d4bbf6005321ead7dd4b6a5bd60a52526965a5
FIX=45c99c84a44d092b7ffaf2ca6408297bc480d214
SOURCE=/home/tom/BYL-project
WEB=/var/www/byl-dist
API=/var/www/byl-backend
TARGET="/home/tom/byl-geo-only-$(date +%Y%m%d-%H%M%S)"

files=(
  backend/routes/analytics.js
  scripts/smokeCriticalFlows.mjs
  scripts/testAdminGeoInteraction.mjs
  scripts/testGeoVisitEnrichment.cjs
  scripts/testGeolocationSessionLifecycle.mjs
  src/components/RouteAnalyticsListener.jsx
  src/hooks/useGeolocation.js
  src/pages/AdminGeo.jsx
  src/utils/analytics.js
  src/utils/geoVisitDisplay.js
)

fail() { echo "ARRÊT : $*" >&2; exit 1; }
cd "$SOURCE"
git fetch origin main
git cat-file -e "${BASE}^{commit}" || fail "Commit de départ absent"
git cat-file -e "${FIX}^{commit}" || fail "Correctif absent sur GitHub"

expected="$(printf '%s\n' "${files[@]}" | LC_ALL=C sort)"
actual="$(git diff --name-only "$BASE" "$FIX" | LC_ALL=C sort)"
[[ "$actual" == "$expected" ]] || fail "Le correctif contient d'autres fichiers que les 10 autorisés."

echo "Création d'une copie isolée au commit de la release : $TARGET"
git worktree add --detach "$TARGET" "$BASE"
cd "$TARGET"
npm ci --no-audit --no-fund
npm run build

echo "Comparaison de la version de base avec le frontend réellement servi..."
[[ -f "$WEB/index.html" ]] || fail "Frontend actif introuvable"
cmp -s dist/index.html "$WEB/index.html" || fail "index.html en ligne différent de la version de base ; aucune publication."
while IFS= read -r -d '' file; do
  rel="${file#dist/assets/}"
  cmp -s "$file" "$WEB/assets/$rel" || fail "Asset en ligne différent : $rel ; aucune publication."
done < <(find dist/assets -type f -print0)

echo "Comparaison de la version de base avec le backend réellement servi..."
while IFS= read -r -d '' file; do
  rel="${file#backend/}"
  cmp -s "$file" "$API/$rel" || fail "Backend en ligne différent : $rel ; aucune publication."
done < <(git ls-files -z backend | while IFS= read -r -d '' path; do
  [[ "$path" == "backend/.env" || "$path" == "backend/firebase-service-account.json" || "$path" == "backend/serviceAccountKey.json" ]] || printf '%s\0' "$path"
done)

# Le déploiement synchronise le dossier backend avec --delete : un fichier
# inconnu présent en production doit donc interrompre l'opération.
while IFS= read -r -d '' file; do
  rel="${file#"$API"/}"
  case "$rel" in
    node_modules/*|.env|serviceAccountKey.json|firebase-service-account.json|*.log) continue ;;
  esac
  [[ -f "backend/$rel" ]] || fail "Fichier backend supplémentaire en ligne : $rel ; aucune publication."
done < <(find "$API" -type f -print0)

echo "Base vérifiée. Application des 10 fichiers admin/GPS et tests..."
git -C "$SOURCE" diff --binary "$BASE" "$FIX" -- "${files[@]}" | git apply --check
git -C "$SOURCE" diff --binary "$BASE" "$FIX" -- "${files[@]}" | git apply
[[ "$(git diff --name-only | LC_ALL=C sort)" == "$expected" ]] || fail "Différence imprévue dans la copie isolée."

echo "Les vérifications du déploiement vont démarrer."
echo "À la première question (absence d'upstream), réponds y ; à la confirmation finale, examine le résumé avant de répondre y."
./deploy.sh --allow-dirty --skip-firebase
