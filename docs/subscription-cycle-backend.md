# Abonnement mensuel et frise de programmation

## Fonctionnement

- Le paiement Stripe vérifié ouvre l’accès jusqu’à `subscriptionAccessUntil`. Le mois de facturation n’est pas la durée d’un cycle.
- Pour un abonnement autonome, le backend crée une frise persistée dans `clients.trainingPlan`. Elle commence par l’objectif choisi, puis alterne hypertrophie, récupération et force. La frise enregistrée, y compris ses modifications par le coach, devient la source de vérité.
- Un programme automatique déjà en cours est rattaché au premier cycle, sans remise à zéro de ses séances.
- Un plan existant non automatique, le mode « programmes uniquement » et un programme courant manuel restent sous le contrôle du coach. Un brouillon de coach n’est jamais publié automatiquement.
- La dernière séance validée clôture le cycle côté Cloud Functions et crée une tâche serveur. Les séances partielles ne comptent pas. Une pause ne fait pas avancer le cycle par date.
- Le worker récupère les tâches toutes les cinq secondes et prépare le prochain programme, à condition que l’abonnement soit actif. La génération peut prendre plus longtemps : l’interface affiche un message de préparation, traduit en sept langues.
- Le programme est enregistré dans les programmes du client, lié au cycle et défini comme programme courant dans une même transaction. Un renouvellement ne crée pas de programme supplémentaire.
- Une récupération conserve les exercices précédents avec un volume réduit. Les exercices simples reçoivent les paramètres du cycle ; les charges historiques sont des suggestions, jamais des charges imposées. Les exercices chronométrés et séries avancées ne sont pas réécrits par cette adaptation.
- Au terme de la frise, les étapes enregistrées sont répétées (hors préparation générale), avec de nouveaux identifiants et sans effacer l’historique.

## Fiabilité

Identifiant de programme déterministe par client/cycle, bail de génération, nouvelle vérification de l’abonnement et de la révision complète de la frise avant publication. Une modification concurrente du coach annule la publication obsolète et entraîne une nouvelle tentative. Les tâches serveur et les champs de contrôle ne sont pas modifiables par le client.

## Vérifications locales

`scripts/testSubscriptionCycles.cjs` exige un émulateur Firestore localhost sur le projet fictif `demo-byl-security`. Il teste l’inscription, le renouvellement, la dernière séance, la récupération courte, la concurrence, l’expiration, la réactivation, les choix du coach, la reprise d’un programme existant, la répétition de la frise et le raccordement des reçus payés. Le générateur sportif est remplacé par une fixture ; ce test ne certifie pas la qualité d’une prescription sportive réelle.

Tests complémentaires : `testPaidProgramFirestore.cjs`, `testFirestoreRules.cjs`, `functions/scripts/testTrainingCycleCompletion.cjs`, `testDashboardCycle.mjs`, `testClientJourney.mjs`, `testCycleValidationJourney.mjs`, lint et build.

## Mise en service — non exécutée par cette modification

1. Déployer les règles et l’index `subscription_cycle_jobs` de `firestore.indexes.json`.
2. Déployer les fonctions de fin de séance et de modification de frise.
3. Déployer le backend et redémarrer son worker avec `CRON_ENABLED=true` ; surveiller les tâches `pending`, les erreurs et les baux expirés.
4. Déployer le frontend, puis vérifier un parcours Stripe **test** et le changement de programme sur mobile et ordinateur.

Les nouveaux abonnements et les renouvellements utilisant déjà `programDeliveryMode=stripe-invoice` passent par ce raccordement. Aucun abonnement historique n’a été modifié en production. Les anciens abonnements reposant uniquement sur le cron mensuel doivent faire l’objet d’une migration séparée après vérification Stripe de leurs droits et de leurs préférences ; ne pas activer `subscriptionCycle.enabled` manuellement sans ces données.
