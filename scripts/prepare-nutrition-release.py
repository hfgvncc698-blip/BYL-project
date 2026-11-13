#!/usr/bin/env python3
"""Prepare only the reviewed CIQUAL translation patch. Never deploy anything."""
import argparse, hashlib, json, pathlib, shutil, subprocess, tempfile
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base', required=True, help='Commit source de la version publiée, à vérifier indépendamment')
parser.add_argument('--output', required=True, help='Nouveau dossier de préparation, hors du dépôt')
args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parent.parent
output=pathlib.Path(args.output).resolve()
if output.exists() or output==root or root in output.parents:
    parser.error('Le dossier doit être nouveau et hors du dépôt de travail.')
if args.base.startswith('-'):
    parser.error('Référence Git invalide.')
def run(cmd, cwd=root):
    return subprocess.check_output(cmd,cwd=cwd)
base=run(['git','rev-parse','--verify',args.base+'^{commit}']).decode().strip()
manifest=json.loads((root/'scripts/releases/nutrition/manifest.json').read_text())
patch=root/'scripts/releases/nutrition/translations.patch'
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
if digest(patch)!=manifest['patchSha256']:
    raise SystemExit('Le patch a changé : nouvelle revue nécessaire.')
for file, expected in manifest['payload'].items():
    if digest(root/file)!=expected:
        raise SystemExit('Fichier changé depuis la revue : '+file)
output.mkdir(parents=True)
source=output/'source';source.mkdir()
archive=output/'base.tar'
archive.write_bytes(run(['git','archive','--format=tar',base]))
subprocess.run(['tar','-xf',str(archive),'-C',str(source)],check=True)
# An existing base is preserved: patches fail on conflicts; no three-way guessing.
subprocess.run(['git','apply','--check',str(patch)],cwd=source,check=True)
subprocess.run(['git','apply',str(patch)],cwd=source,check=True)
for file in manifest['payload']:
    target=source/file
    if target.is_symlink() or any(p.is_symlink() for p in target.parents):
        raise SystemExit('Lien symbolique refusé : '+file)
    if target.exists() and file not in ['scripts/testCiqualSearch.mjs','scripts/testCiqualTranslations.mjs']:
        if digest(target)!=manifest['payload'][file]:
            raise SystemExit('Conflit avec un fichier existant : '+file)
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(root/file,target)
for test in ['scripts/testCiqualSearch.mjs','scripts/testCiqualTranslations.mjs']:
    subprocess.run(['node',test],cwd=source,check=True)
shutil.copyfile(patch,output/'translations.patch')
(output/'preparation.json').write_text(json.dumps({'baseCandidate':base,'productionBaseVerified':False,
    'deployed':False,'files':manifest['modified']+list(manifest['payload']),
    'note':'Référence candidate uniquement. Vérifier les sources de production avant toute compilation/publication.'},indent=2)+'\n')
print('Préparation et tests réussis : '+str(output))
print('Aucun déploiement. Cette commande ne prouve pas que --base est la version en production.')
