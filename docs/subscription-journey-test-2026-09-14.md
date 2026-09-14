# Recette locale du parcours abonnement — 14 septembre 2026

Résultat : tous les scénarios exécutés ont réussi. Aucun code métier n’a été changé pendant cette recette.

## Nouveau test d’intégration

`scripts/testSubscriptionJourney.cjs` utilise le vrai générateur `generateAndSaveAutoProgram`, les banques d’exercices JSON du dépôt et les transactions Firestore réelles sur l’émulateur `demo-byl-security`.

Le reçu de paiement est simulé. Les callbacks de fin de séance et le compteur de séances sont chargés depuis le code des Cloud Functions ; leur invocation est locale et explicite. Le test exécute aussi la requête de sélection des tâches utilisée par le worker et la fonction de sélection du programme du dashboard.

| Étape | Résultat |
| --- | --- |
| Abonnement confirmé simulé | Frise et premier programme réel créés, dashboard actif |
| Hypertrophie : 4 semaines × 2 séances | Aucun passage anticipé ; passage après la 8e validation |
| Récupération : 1 semaine × 2 séances | Passage après la 2e validation |
| Force : 3 semaines × 2 séances | Passage après la 6e validation |
| Prochaine récupération | 4e programme créé et sélectionné par le dashboard |
| Pause de deux semaines dans chaque programme | Aucun saut de séance ni de cycle |
| Séances partielles | Non comptées, même avant la dernière validation |
| Réception répétée de chaque événement | Aucun programme supplémentaire |
| Entre clôture et génération | Dashboard en attente, message disponible dans les sept langues |
| Après génération | Nouveau programme courant, ancien programme et historique conservés |
| Compteurs frontend/backend | Même nombre de séances attendues pour chaque programme |

La suite `testSubscriptionCycles.cjs` repasse également : renouvellement sans doublon, expiration, annulation, réactivation, choix du coach, reprise d’un programme existant, répétition de frise, concurrence et conflit avec une modification du coach.

## Limites précises

- Aucun paiement réel ni dossier client réel n’a été utilisé. Les fixtures locales sont supprimées à la fin.
- Cette recette confirme le code de génération, de transition et de sélection du dashboard, pas le rendu visuel du navigateur mobile/ordinateur.
- Elle ne confirme pas le déploiement des triggers Firebase, l’index de production ni le fonctionnement du processus worker sur le serveur distant. Ces vérifications restent nécessaires lors de la mise en service.
- La banque d’exercices utilisée est celle du dépôt, pas une copie de la base distante. La qualité sportive de chaque prescription n’est pas certifiée par ce test fonctionnel.
