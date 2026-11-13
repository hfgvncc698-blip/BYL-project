#!/usr/bin/env bash
set -euo pipefail
# Executed ONLY by the explicit --deploy mode of deploy-nutrition-only.sh.
package="$1"
[[ "$package" =~ ^/tmp/byl-nutrition-[0-9]+-[0-9]+$ ]] || exit 2
cd "$package"
sha256sum -c package.sha256
web=/var/www/byl-dist
releases=/var/www/byl-front-releases
[[ -L "$web" ]] || { echo 'Refus : webroot non symbolique.'; exit 1; }
previous="$(readlink -f "$web")"
[[ "$previous" == "$releases"/* ]] || { echo 'Cible actuelle inattendue.'; exit 1; }
# A concurrent deployment must never be overwritten.
exec 9>/var/lock/byl-nutrition-release.lock
flock -n 9 || { echo 'Une autre publication nutrition est en cours.'; exit 1; }
(cd "$web" && sha256sum --quiet -c "$package/expected-production.sha256")
next="$releases/nutrition-${package##*/}"
[[ ! -e "$next" ]] || { echo 'Release déjà présente : arrêt.'; exit 1; }
mkdir "$next"
# Preserve every existing asset and public resource, including old chunks.
cp -a "$previous/." "$next/"
tar -xzf "$package/nutrition-overlay.tgz" -C "$next"
(cd "$next" && sha256sum --quiet -c "$package/overlay.sha256")
chown -R www-data:www-data "$next"
chmod -R u=rwX,go=rX "$next"
# Check again immediately before the atomic frontend switch.
[[ "$(readlink -f "$web")" == "$previous" ]] || { echo 'Version modifiée pendant la préparation.'; exit 1; }
(cd "$web" && sha256sum --quiet -c "$package/expected-production.sha256")
link="${web}.nutrition-${package##*/}"
ln -s "$next" "$link"
mv -Tf "$link" "$web"
if ! (cd "$web" && sha256sum --quiet -c "$package/overlay.sha256"); then
  if [[ "$(readlink -f "$web")" == "$next" ]]; then
    rollback="${web}.rollback-${package##*/}"
    ln -s "$previous" "$rollback"
    mv -Tf "$rollback" "$web"
  fi
  echo 'Vérification finale échouée. Publication refusée, retour arrière tenté.' >&2
  exit 1
fi
printf 'Frontend nutrition publié. Ancienne release conservée : %s\n' "$previous"
printf 'Retour arrière : sudo ln -s %q %q && sudo mv -Tf %q %q\n' "$previous" "${web}.rollback-${package##*/}" "${web}.rollback-${package##*/}" "$web"
echo 'Aucun backend, service, règle Firebase, index, fonction ou document modifié.'
