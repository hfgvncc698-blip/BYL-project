# Lot 7B.1 TER — bilan

10 novembre 2026. Branche `codex/firebase-performance-audit`, base `5bdcd1b`. Prototype isolé uniquement. Aucun déploiement, aucune donnée réelle, aucune migration, aucune suppression de brouillon hérité.

## Résultat

Le prototype démontre un parcours **sans deuxième mot de passe**, avec connexion Firebase, programme autorisé en mémoire, préparation de brouillon pendant coupure, synchronisation automatique et conflits explicites à la reconnexion. Il vérifie l’isolation de son interface et de son API entre comptes, ainsi que l’absence de nouvelle persistance métier dans le profil vierge testé.

La contrepartie du mode mémoire est démontrée. Après fermeture complète du navigateur, le travail non synchronisé n’est plus disponible. La sauvegarde serveur reste récupérable par son propriétaire après reconnexion et vérification des droits.

Un essai complémentaire WebAuthn PRF avec authentificateur virtuel démontre la récupération d’une clé de chiffrement et l’isolation entre credentials. Il ne qualifie pas un appareil réel, une biométrie ni la reprise chiffrée après fermeture. L’absence de PRF provoque un refus explicite.

**P0-4 reste ouvert.** Les copies nutritionnelles héritées sont encore lisibles directement et après redémarrage. La nouvelle approche n’est pas raccordée aux caches BYL. La production reste bloquée.

25 contrôles passent dans le runner final, dont les caractérisations explicites des limites. Voir la matrice pour distinguer garanties et problèmes restant présents.

## Recommandation

A+D comme base portable, B/C uniquement sur appareils qualifiés. Aucun secret quotidien supplémentaire. Aucune clé déchiffrante accessible dans le stockage persistant de la même origine. Aucune promesse de reprise hors ligne permanente sur tous les navigateurs.

Voir [options](BYL_LOT7B1TER_OPTIONS.md), [sécurité](BYL_LOT7B1TER_SECURITE.md), [tests](BYL_LOT7B1TER_TESTS.md), [performances](BYL_LOT7B1TER_PERFORMANCES.md) et [décision proposée](BYL_LOT7B1TER_DECISION.md).

## Changements

Ajout des six rapports, du runner `scripts/runOfflineDraftLot7B1Ter.cjs`, du test/API synthétique `scripts/testOfflineDraftLot7B1Ter.cjs`, de la page `scripts/fixtures/lot7b1ter/session.js` et de la preuve `audits/lot7b1ter/results.json`.

Aucun fichier `src`, `backend`, `functions` ou règles Firestore modifié. Les fichiers non suivis du Lot BIS sont conservés. Les corrections P0-1/P0-2 et les gains des Lots 1 à 6 ne sont pas altérés par ce prototype non importé par l’application. Aucun travail sur P1/P2/P3.

## Arrêt

Prototype terminé, arrêt avant intégration et attente de validation. Les limites matérielles, migration et interface de conflits restent des conditions pour une étape suivante, pas des fonctionnalités livrées implicitement.
