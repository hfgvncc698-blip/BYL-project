# Contrôles avant déploiement — 21 septembre 2026

## Correctifs

- Clients récents : programme courant explicite prioritaire, puis cycle courant ou dernier programme assigné. Pas de repli sur la dernière séance de l'ancien programme.
- Statistiques : suppression de l'import inutilisé ; mesures enregistrées atomiquement dans le dossier client et le miroir utilisateur avec un même identifiant. Suppression de l'écriture racine non autorisée. Verrou double-clic, date locale, contrôles numériques, délai de chargement et retour d'erreur avec réessai.
- Smoke tests : vérification de la délégation réelle des calculs aux composants partagés, pas d'import artificiel uniquement pour satisfaire le test.
- Taille des programmes : contrôle ajouté aux duplications/assignations de la fiche client, validation de brouillon et modifications/synchronisation du player. Duplication modèle + assignation atomique. Les programmes trop grands restent refusés, pas découpés automatiquement.
- Dépendances : mises à jour compatibles des fichiers lock, sans mise à jour majeure forcée.
- Nouvelles régressions incluses dans le préflight de `deploy.sh`.

## Vérifications réussies

- ESLint sans erreur ni avertissement ; diff sans erreurs d'espacement.
- 53 smoke checks, 36 suites ciblées, 17 protections du déploiement.
- Moteur sportif : 9 936 combinaisons ; sept langues.
- Build et budgets gzip respectés (initial 517,4/520 KiB ; player 37,8/38 KiB).
- Audits npm : zéro vulnérabilité signalée pour le projet complet et les dépendances production backend / Functions au moment du contrôle.
- Calendrier Functions, clôture de cycle, synchronisation de programmes concurrente, traductions footer.
- Émulateur `demo-byl-security` : 67 tests de règles, sauvegarde réelle des mesures, abonnement et parcours complet avec vrai générateur et banque locale. Aucun dossier de production utilisé.

## Avant publication

Les modifications ne sont ni commitées ni publiées. Inclure les nouveaux fichiers et les lockfiles dans le commit, pousser, puis exécuter la procédure habituelle de déploiement complet. Ne pas ignorer le préflight.

Java 21 a été installé localement pour les tests. Pour relancer l'émulateur :

`env JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home npm run test:security-rules`

Pas de recette visuelle exhaustive mobile/desktop ni de paiement réel. Vérifier les écrans modifiés, puis après publication les services VPS, le worker, les Functions, les index et les journaux. Les tests locaux ne prouvent pas leur état en production. L'émulateur journalise des limites d'évaluation sur certains refus attendus des règles ; les tests d'accès autorisé cités passent.
