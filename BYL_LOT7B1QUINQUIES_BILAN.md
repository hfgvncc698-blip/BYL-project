# Lot 7B.1 QUINQUIES — bilan de qualification

10 novembre 2026 — branche `codex/firebase-performance-audit`.

## Conclusion

La qualification est terminée : **30 contrôles synthétiques réussis**. La récupération générale des brouillons historiques n’est **pas garantie**. Les essais confirment qu’une purge peut perdre une mutation Firestore non synchronisée et que d’anciens onglets peuvent conserver ou recréer des données après un nettoyage local.

**Aucune migration réelle ni purge utilisateur réalisée. P0-4 reste ouvert ; production bloquée.** Le succès des tests inclut la constatation attendue des limites, pas leur disparition.

## Travail réalisé

Lecture intégrale de `BYL_LOT7B1QUATER_MIGRATION.md`, `BYL_LOT7B1QUATER_SECURITE.md`, `BYL_LOT7B1QUATER_TESTS.md`, `BYL_LOT7B1BIS_STOCKAGES.md`, `BYL_LOT7B1TER_DECISION.md`. Vérification du format de brouillons historique à `5bdcd1b`, du contrat du SDK installé et de la documentation primaire IndexedDB/Firebase.

Classification par catégorie des données reconstructibles, uniques, non attribuables et potentiellement révoquées. Conception d’une récupération soumise à provenance prouvée, identité et droits actuels, confirmation explicite, versions et reçus ; aucun import/publication automatique. Conception d’un nettoyage en étapes avec arrêt, journal, reprise, vérification et conditions de retour arrière.

Ajout d’un banc **isolé, non importé par BYL** :

- `scripts/testMigrationLot7B1Quinquies.cjs`
- `scripts/fixtures/lot7b1quinquies/migration.js`
- `scripts/fixtures/lot7b1quinquies/firestore.js`
- `audits/lot7b1quinquies/results.json` et `qualification.json`

Il utilise uniquement un profil Chrome temporaire, un serveur d’autorité synthétique, des données fabriquées et un projet SDK demo sans réseau documentaire. Aucun profil personnel inspecté, aucun `.env` utilisé, aucune règle modifiée. Les empreintes des fichiers livrés au lot QUATER sont inchangées ; aucune modification fonctionnelle des autres modules. Aucun P1/P2/P3 traité.

## Principaux résultats

| Risque | Observation | Conséquence |
|---|---|---|
| Attribution par clé UID | Format historique sans preuve serveur ni version canonique | Refuser récupération automatique si provenance inconnue |
| Lecture du compte A sous B | Refus du modèle avant toute lecture privée | Précondition stricte, ne remplace pas la protection physique du disque |
| Confirmation perdue / double tentative | Deux brouillons distincts écrits, aucune duplication malgré reprises et deux onglets | Reçu et idempotence nécessaires ; autorité de test simulée |
| Révocation / Club / conflit | Refus aux contrôles préalables et à l’import | Ne jamais laisser le cache accorder un droit |
| `deleteDatabase` bloqué | Réussit plus tard lorsque l’autre connexion ferme | Un timeout ne signifie pas annulation |
| Nettoyage d’un onglet | sessionStorage d’un autre onglet encore présent | Pas de statut global sur la base d’un nettoyage local |
| Ancien writer | Recrée IndexedDB après suppression | Fermeture des anciens contextes indispensable, recontamination bloquante |
| Échec partiel / réouverture | Contenu secondaire restant observé, reprise possible | Vérifier état réel, ne pas croire seulement le journal |
| SDK réel offline | Mutation toujours présente après terminaison et réouverture | Ne pas purger sans disposition explicite |
| SDK réel effacement | Mutation et base demo disparaissent après terminaison + purge synthétique | Destruction effective, pas mécanisme de récupération |

Les contrôles utilisent Chrome 157 et Firebase 12.12.0. La récupération positive repose sur un manifeste fiable préparé pour les fixtures, absent des anciens brouillons réels. Aucun décodeur des files internes Firestore, aucune migration de parc, aucun effacement forensique qualifié. Les détails et tests non exécutés sont explicités dans TESTS.

## Livrables

- [Inventaire, récupération/perte/isolation/suppression/retour arrière par catégorie](BYL_LOT7B1QUINQUIES_INVENTAIRE.md)
- [Récupération et expérience coach proposée](BYL_LOT7B1QUINQUIES_RECUPERATION.md)
- [Nettoyage, étapes, confirmations, interruptions et limites](BYL_LOT7B1QUINQUIES_NETTOYAGE.md)
- [Tests exécutés et portée des preuves](BYL_LOT7B1QUINQUIES_TESTS.md)
- [Décision et préconditions à toute action réelle](BYL_LOT7B1QUINQUIES_DECISION.md)

## Arrêt

Maintenir la quarantaine. La suite proposée est la conception d’un pilote limité aux données dont provenance et disposition sont établies, avec validation distincte de toute perte irréversible. Rien n’est automatiquement récupéré ou supprimé sur un appareil utilisateur. Travail arrêté à ce lot, en attente de validation explicite.
