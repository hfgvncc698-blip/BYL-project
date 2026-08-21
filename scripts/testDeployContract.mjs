import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployScript = fs.readFileSync(path.join(projectRoot, "deploy.sh"), "utf8");

const checks = [
  {
    description: "le contenu du webroot n'est plus efface avant une publication",
    valid: !/rm\s+-rf\s+["']?\\?\$REMOTE_WEBROOT["']?\/\*/.test(deployScript),
  },
  {
    description: "les releases front sont versionnees hors du webroot",
    valid: deployScript.includes('REMOTE_FRONT_RELEASES="/var/www/byl-front-releases"'),
  },
  {
    description: "la bascule du lien symbolique est atomique",
    valid: deployScript.includes('sudo_run mv -Tf "\\$next_link" "\\$REMOTE_WEBROOT"'),
  },
  {
    description: "les anciens assets caches sont reportes dans la nouvelle release",
    valid: deployScript.includes('sudo_run cp -an "\\$REMOTE_WEBROOT/assets/." "\\$REMOTE_FRONT_RELEASE/assets/"'),
  },
  {
    description: "la retention des assets depasse le cache Nginx de sept jours",
    valid: deployScript.includes('find "\\$REMOTE_FRONT_RELEASE/assets" -type f -mtime +8 -delete'),
  },
  {
    description: "une release incomplete est refusee avant activation",
    valid:
      deployScript.includes('[ ! -f "\\$REMOTE_FRONT_RELEASE/index.html" ]') &&
      deployScript.includes('[ ! -d "\\$REMOTE_FRONT_RELEASE/assets" ]'),
  },
  {
    description: "le rollback reutilise une release complete",
    valid: deployScript.includes('activate_front_release "\\$PREVIOUS_FRONT_TARGET"'),
  },
  {
    description: "les attributs macOS ne sont pas ajoutes aux archives",
    valid:
      deployScript.includes("COPYFILE_DISABLE=1 COPY_EXTENDED_ATTRIBUTES_DISABLE=1 tar --no-xattrs -C dist") &&
      deployScript.includes("COPYFILE_DISABLE=1 COPY_EXTENDED_ATTRIBUTES_DISABLE=1 tar --no-xattrs -C \"${BACKEND_STAGE}\""),
  },
  {
    description: "les fichiers temporaires distants sont nettoyes meme apres un echec",
    valid:
      deployScript.includes("cleanup_remote_stage()") &&
      deployScript.includes("trap cleanup_remote_stage EXIT"),
  },
  {
    description: "l'espace disque est controle avant l'upload",
    valid: (() => {
      const storageCheck = deployScript.indexOf("prepare_remote_storage\nfirebase_deploy_if_requested");
      const mainUpload = deployScript.indexOf('echo "Upload vers ${USER}@${HOST}:/tmp/"');
      return (
        deployScript.includes('REMOTE_MIN_FREE_MB="${REMOTE_MIN_FREE_MB:-1024}"') &&
        deployScript.includes("run_remote_root_script") &&
        storageCheck >= 0 &&
        mainUpload >= 0 &&
        storageCheck < mainUpload
      );
    })(),
  },
  {
    description: "une connexion SSH maitre persistante couvre tout le deploy",
    valid:
      deployScript.includes('SSH_CONTROL_PATH="/tmp/byl-ssh-${UID}-%C"') &&
      deployScript.includes("ControlPersist=yes") &&
      deployScript.includes('ssh "${SSH_OPTS[@]}" -MNf "${USER}@${HOST}"'),
  },
  {
    description: "le mot de passe sudo est saisi et valide une seule fois",
    valid:
      deployScript.includes("Mot de passe sudo du VPS (saisi une seule fois)") &&
      deployScript.includes("sudo -S -k -p '' -v") &&
      deployScript.includes("REMOTE_SUDO_PASSWORD=\"\"") &&
      !deployScript.includes("ssh -tt"),
  },
  {
    description: "le deploy distant reutilise en memoire le secret deja valide",
    valid:
      deployScript.includes('"exec bash \'${REMOTE_SCRIPT}\' --sudo-password-stdin"') &&
      deployScript.includes("IFS= read -r REMOTE_SUDO_PASSWORD") &&
      deployScript.includes("sudo_run()") &&
      deployScript.includes("command sudo -S -p '' --") &&
      !deployScript.includes("SUDO_KEEPALIVE_PID"),
  },
  {
    description: "la publication backend ne partage jamais stdin entre sudo et tar",
    valid:
      !/\|\s*sudo_run/.test(deployScript) &&
      deployScript.includes('REMOTE_BACKEND_SYNC_ARCHIVE="/tmp/byl-backend-sync-${ts}.tar"') &&
      deployScript.includes('tar -tf "\\$REMOTE_BACKEND_SYNC_ARCHIVE" >/dev/null') &&
      deployScript.includes('sudo_run tar -C "\\$REMOTE_BACKEND" -xf "\\$REMOTE_BACKEND_SYNC_ARCHIVE"'),
  },
  {
    description: "tout echec de publication declenche un rollback automatique",
    valid:
      deployScript.includes("set -Eeuo pipefail") &&
      deployScript.includes("handle_release_error()") &&
      deployScript.includes("trap handle_release_error ERR") &&
      deployScript.includes("Echec pendant la publication. Restauration de la version precedente."),
  },
  {
    description: "la politique de securite du navigateur est publiee et verifiee par Nginx",
    valid:
      deployScript.includes('NGINX_SECURITY_HEADERS_LOCAL="nginx/boostyourlife-security-headers.conf"') &&
      deployScript.includes("install_nginx_security_headers()") &&
      deployScript.includes('sudo_run nginx -t') &&
      deployScript.includes('sudo_run nginx -s reload'),
  },
  {
    description: "un backend incomplet n'ecrase pas la derniere sauvegarde exploitable",
    valid:
      deployScript.includes('[ -f "\\$REMOTE_BACKEND/app.js" ]') &&
      deployScript.includes('[ -f "\\$REMOTE_BACKEND/package.json" ]') &&
      deployScript.includes("Derniere sauvegarde backend complete reutilisee") &&
      deployScript.includes("Aucune sauvegarde backend complete disponible pour un rollback"),
  },
];

const failures = checks.filter(({ valid }) => !valid);
for (const check of checks) {
  console.log(`${check.valid ? "ok" : "not ok"} - ${check.description}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`Deploy contract OK: ${checks.length} protections validees.`);
}
