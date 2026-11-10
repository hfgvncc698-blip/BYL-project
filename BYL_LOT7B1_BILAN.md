# Lot 7B.1 — bilan

10 novembre 2026. Branche `codex/firebase-performance-audit`. Référence applicative `e476b0a4cfcd6bb9e27515c69a5416325e480f6e`, départ du travail `27a9515`. Tests locaux sur données synthétiques et émulateurs uniquement.

## Décision

**Production toujours bloquée.** Les corrections indépendantes des deux premières anomalies sont livrées. La protection préalable d’une intervention Auth est testée. Le cas Auth seul et le stockage partagé restent ouverts.

P0 | Reproduit avant | Corrigé dans le code | Contre-test | Statut
--- | --- | --- | --- | ---
1 · autorité Club | Oui | Oui | Réussi | Corrigé pour les frontières testées
2 · séance étrangère | Oui | Oui | Réussi | Corrigé pour les projections et mutations testées
3 · Auth externe | Oui | Partiellement, préparation opérateur | Confinement réussi, Auth seule reste accessible | Partiellement corrigé
4 · stockage partagé | Oui | Non | Échec de confidentialité confirmé | Bloquant, décision de stockage requise


## Garanties obtenues


- **P0-1.** La création déléguée d’un utilisateur par un coach utilise une liste de champs autorisés. Le champ historique isAdmin ne suffit plus à autoriser une API Club. Les administrateurs disposent d’un rôle protégé ou d’une claim signée, avec email vérifié. Le propriétaire est contrôlé dans le document du club. Un membre doit disposer d’une appartenance actuelle pour utiliser le droit partagé via SDK.
- **P0-2.** La séance, le club, le rendez-vous et le dossier doivent correspondre avant l’enrichissement. Les identités historiques contradictoires et les séances privées sont refusées. Les mutations des rendez-vous utilisent le même contrôle dans leur transaction. Un ancien lien forgé conserve son rendez-vous local mais ne modifie ni ne supprime la séance étrangère.
- **P0-3.** La commande prepare-disable écrit le marqueur avant une intervention console. Le test vérifie le refus SDK et API alors que le compte Auth est encore actif, puis après sa désactivation. Une intervention Auth seule sans marqueur reste insuffisante.
- **P0-4.** La lecture par le second compte est reproduite dans l’onglet courant, dans un second onglet et après fermeture complète de Chromium. Le programme Firestore et le cache nutritionnel IndexedDB sont concernés. Un profil navigateur distinct ne retrouve pas les données dans la fixture.

## Choix et limites

Les anciens liens dépourvus de preuve de club restent visibles comme rendez-vous, avec enrichissement privé suspendu. Un club ancien sans ownerUid est admis seulement lorsque son identifiant est l’UID du propriétaire. Les autres rattachements historiques ambigus nécessitent une qualification serveur.

Le prototype mémoire est resté dans une copie temporaire. Il supprime la persistance Firestore après fermeture, mais le second compte peut encore lire le cache mémoire dans l’onglet courant et le stockage IndexedDB secondaire. Étendre ce changement exigerait de coordonner tous les onglets, les requêtes tardives et les écritures hors ligne. Aucune purge des données locales existantes n’a été appliquée.

Le Lot 7B.1 s’arrête sur cette décision d’architecture, conformément à la mission. Les P1, P2 et P3 du Lot 7A conservent leur statut.
## Livrables

[Sécurité et procédure de confinement](BYL_LOT7B1_SECURITE.md), [tests et reproductions](BYL_LOT7B1_TESTS.md), [mesures de performance](BYL_LOT7B1_PERFORMANCES.md), [risques résiduels et options à valider](BYL_LOT7B1_RISQUES_RESIDUELS.md).


## Fichiers applicatifs et essais

Périmètre | Fichiers
--- | ---
Autorité Club et lectures SDK | firestore.rules, backend/routes/clubs.js, backend/utils/batchedFieldReads.js
Liaisons de séances | backend/utils/clubAppointmentSession.js, backend/utils/clubCalendarPeriod.js, backend/routes/clubs.js
Préparation de révocation | scripts/messagingRevocation.cjs
Contre-tests et lanceur | scripts/testClubBoundariesLot7B1.cjs, scripts/testSharedBrowserLot7B1.cjs, scripts/fixtures/sharedBrowserLot7B1.js, scripts/runSecurityLot7B1.cjs
Suites et fixtures adaptées | scripts/testFirestoreRules.cjs, scripts/testMessagingLot2B2.cjs, scripts/measureFirebaseLot1.cjs

Le cache applicatif existant conserve son comportement. Le prototype mémoire a été limité à une copie temporaire. Les cinq rapports du sous-lot constituent la documentation de livraison.
