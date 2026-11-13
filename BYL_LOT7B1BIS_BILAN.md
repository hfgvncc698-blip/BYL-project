# Lot 7B.1 BIS — bilan de conception et qualification préalable

10 novembre 2026. Branche `codex/firebase-performance-audit`. Base `5bdcd1b`. Aucun déploiement, aucune donnée réelle, aucune migration, aucune modification de règles ou de code applicatif.

## Conclusion

**P0-4 reste ouvert. La production reste bloquée.** La reproduction Chrome confirme l’exposition des caches actuels. Ce livrable constitue la conception et une qualification limitée du stockage chiffré demandé, pas une correction intégrée ni une autorisation de migration.

L’utilisateur a retenu explicitement « Conserver la reprise hors ligne après fermeture avec stockage chiffré par identité, à concevoir et qualifier avant migration ». La désactivation simple de la persistance Firestore n’a donc pas été appliquée. Les données et brouillons hérités sont conservés.

## Résultats

- Inventaire des accès explicites aux stockages, des mémoires partagées, des brouillons, des caches SDK et des dépendances de session. Voir `BYL_LOT7B1BIS_STOCKAGES.md` et `audits/lot7b1bis/storage-sites.txt`.
- P0-4 reproduit sur projet Firebase `demo-byl-performance`, dans des profils Chrome jetables. Lecture locale par B possible dans le même onglet, dans un onglet voisin et après redémarrage. Lecture serveur par B refusée. Le profil navigateur indépendant ne possède pas ces données.
- Prototype WebCrypto isolé, sans import depuis `src`, avec secret aléatoire externe de 256 bits, AES-GCM et périmètre authentifié par les données associées. 21 contrôles passent sous Node. Les tests ne constituent pas une qualification des parcours BYL.
- Proposition de barrière d’identité et de migration réversible jusqu’au nettoyage final. Aucune purge ni bascule automatique.

## Architecture proposée à valider

Coffre applicatif chiffré par identité, clé conservée hors du stockage navigateur et déverrouillage explicite après fermeture ou changement d’identité. Firestore serait utilisé en mémoire. Les lectures locales seraient fournies par le coffre et les modifications non synchronisées par une file chiffrée distincte, soumise aux contrôles serveur lors de leur transmission. Les données déjà autorisées pourraient être consultées hors ligne après déverrouillage local. Cette consultation ne prouverait pas la validité actuelle des droits.

L’intégration exige une décision sur la clé de récupération, la durée des droits hors ligne et la reprise des écritures métier. Un simple remplacement de `persistentLocalCache` ne fournit pas ces garanties. Le détail et les options sont dans `BYL_LOT7B1BIS_MIGRATION.md`.

## Fichiers ajoutés

Les six rapports `BYL_LOT7B1BIS_*.md`, trois pièces de preuve dans `audits/lot7b1bis/`, le prototype `scripts/fixtures/lot7b1bis/encryptedVaultPrototype.mjs` et son test `scripts/testEncryptedVaultLot7B1Bis.mjs`.

Aucun fichier d’exécution de l’application n’a été modifié. Les corrections P0-1/P0-2 restent inchangées. P0-3 n’est pas traité. Aucun travail P1/P2/P3.

## Arrêt

La consigne utilisateur impose d’attendre avant une migration irréversible ou une décision affectant fortement le hors-ligne. Arrêt avant intégration et migration, avec proposition concrète de fonctionnement et de récupération. Les tests navigateur après correction et les mesures de pages restent à exécuter après cette validation. Aucun gain de performance ni fermeture de P0-4 n’est revendiqué.
