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
    valid: deployScript.includes('sudo mv -Tf "\\$next_link" "\\$REMOTE_WEBROOT"'),
  },
  {
    description: "les anciens assets caches sont reportes dans la nouvelle release",
    valid: deployScript.includes('sudo cp -an "\\$REMOTE_WEBROOT/assets/." "\\$REMOTE_FRONT_RELEASE/assets/"'),
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
      deployScript.includes("COPYFILE_DISABLE=1 COPY_EXTENDED_ATTRIBUTES_DISABLE=1 tar -C dist") &&
      deployScript.includes("COPYFILE_DISABLE=1 COPY_EXTENDED_ATTRIBUTES_DISABLE=1 tar -C \"${BACKEND_STAGE}\""),
  },
  {
    description: "les fichiers temporaires distants sont nettoyes meme apres un echec",
    valid:
      deployScript.includes("cleanup_remote_stage()") &&
      deployScript.includes("trap cleanup_remote_stage EXIT"),
  },
  {
    description: "les medias persistants ne gonflent pas chaque backup backend",
    valid: deployScript.includes('--exclude "./public/social-media"'),
  },
  {
    description: "l'espace disque est controle avant l'upload",
    valid: (() => {
      const storageCheck = deployScript.indexOf("prepare_remote_storage\nfirebase_deploy_if_requested");
      const mainUpload = deployScript.indexOf('echo "Upload vers ${USER}@${HOST}:/tmp/"');
      return (
        deployScript.includes('REMOTE_MIN_FREE_MB="${REMOTE_MIN_FREE_MB:-1024}"') &&
        deployScript.includes("sudo bash '${REMOTE_STORAGE_SCRIPT}'") &&
        storageCheck >= 0 &&
        mainUpload >= 0 &&
        storageCheck < mainUpload
      );
    })(),
  },
  {
    description: "sudo recoit le mot de passe depuis un vrai terminal et non depuis le script",
    valid:
      deployScript.includes('scp "${SSH_OPTS[@]}" "${REMOTE_STORAGE_SCRIPT_LOCAL}"') &&
      !deployScript.includes('"bash -s -- \'${REMOTE_WEBROOT}\''),
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
