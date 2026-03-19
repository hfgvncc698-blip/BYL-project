#!/usr/bin/env bash
set -euo pipefail

# ========= A CONFIGURER =========
HOST="141.94.244.26"                 # IP ou domaine du VPS
USER="tom"                           # utilisateur SSH
REMOTE_WEBROOT="/var/www/byl-dist"        # root Nginx
REMOTE_BACKUPS="/var/www/byl_backups"
REMOTE_RELEASE="/var/www/byl_release"
# =================================

ts="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="byl-dist-${ts}.tgz"

echo "🔧 Build front…"
npm run build

echo "📦 Archive dist -> ${ARCHIVE}"
tar -C dist -czf "${ARCHIVE}" .

echo "🚀 Upload vers ${USER}@${HOST}:/tmp/${ARCHIVE}"
scp "${ARCHIVE}" "${USER}@${HOST}:/tmp/${ARCHIVE}"

echo "🖥️  Déploiement sur le serveur…"
echo "ℹ️  IMPORTANT: avant de lancer ce script, exécute :"
echo "   ssh -t ${USER}@${HOST} \"sudo -v\""
echo "   (tu l'as déjà fait -> parfait)"
echo

# ✅ -tt = force pseudo-terminal (utile sur certains environnements)
ssh -tt "${USER}@${HOST}" bash -s <<EOF
  set -euo pipefail

  ARCHIVE="/tmp/${ARCHIVE}"
  REMOTE_WEBROOT="${REMOTE_WEBROOT}"
  REMOTE_BACKUPS="${REMOTE_BACKUPS}"
  REMOTE_RELEASE="${REMOTE_RELEASE}"

  # Sécurités basiques
  [ -f "\$ARCHIVE" ] || { echo "❌ Archive manquante : \$ARCHIVE"; exit 1; }
  [[ "\$REMOTE_WEBROOT" == /var/www/* ]] || { echo "❌ REMOTE_WEBROOT non autorisé"; exit 1; }

  echo "📁 Préparation dossiers…"
  sudo mkdir -p "\$REMOTE_WEBROOT" "\$REMOTE_BACKUPS" "\$REMOTE_RELEASE"

  # Sauvegarde de la version actuelle (si non vide)
  if [ "\$(ls -A "\$REMOTE_WEBROOT" 2>/dev/null | wc -l)" -gt 0 ]; then
    BK="\$REMOTE_BACKUPS/byl-\$(date +%Y%m%d-%H%M%S).tgz"
    echo "🗄️  Backup actuel -> \$BK"
    sudo tar -C "\$REMOTE_WEBROOT" -czf "\$BK" .
  else
    echo "🗄️  Pas de contenu existant à sauvegarder."
  fi

  echo "📦 Extraction de l'archive…"
  sudo rm -rf "\$REMOTE_RELEASE"
  sudo mkdir -p "\$REMOTE_RELEASE"
  sudo tar -C "\$REMOTE_RELEASE" -xzf "\$ARCHIVE"

  echo "📤 Publication -> \$REMOTE_WEBROOT"
  sudo rm -rf "\$REMOTE_WEBROOT"/*
  sudo cp -a "\$REMOTE_RELEASE"/. "\$REMOTE_WEBROOT"/

  echo "🔐 Droits…"
  sudo chown -R www-data:www-data "\$REMOTE_WEBROOT"
  sudo chmod -R 755 "\$REMOTE_WEBROOT"

  echo "🔄 Reload Nginx…"
  sudo nginx -t
  sudo systemctl reload nginx

  echo "🧹 Nettoyage…"
  sudo rm -f "\$ARCHIVE"
  sudo rm -rf "\$REMOTE_RELEASE"

  echo "✅ Déploiement terminé."
EOF

echo "🧹 Nettoyage local…"
rm -f "${ARCHIVE}"

echo "✨ Done !"

