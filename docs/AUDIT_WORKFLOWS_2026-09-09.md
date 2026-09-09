# Audit métier : nutrition, programmes, player, planning et notifications

Date : 9 septembre 2026. Périmètre : code local et suites automatisées dans l’état actuel du répertoire partagé. Aucun correctif applicatif ni déploiement effectué dans cet audit. Aucun compte, dossier de santé, programme ou événement réel créé/modifié, aucun e-mail envoyé.

## Conclusion

Les 22 commandes de tests existantes exécutées réussissent. Des tests supplémentaires ciblant les reprises, doubles soumissions et lectures lentes révèlent néanmoins **6 scénarios en échec, correspondant à 4 familles de bugs**. Il n’est donc pas justifié de déclarer tous les parcours fiables.

Les nouveaux tests exécutent soit les vrais gestionnaires de routes avec Firestore simulé, soit les callbacks extraits du code source avec état/services simulés. Ils ne remplacent pas des parcours navigateur avec comptes de test et infrastructure de préproduction.

## Défauts reproduits

### 1. Priorité haute — une ancienne synchronisation peut rétablir une ancienne version du programme client

Source : [backend/routes/programs.js](/Users/tommarie/Projects/BYL-project/backend/routes/programs.js:378), en particulier l’écriture sans condition de version à [la ligne 400](/Users/tommarie/Projects/BYL-project/backend/routes/programs.js:400).

Reproduction : une première demande de synchronisation lit le modèle révision 1, puis attend les recherches d’assignations. Une seconde demande lit la révision 2 et l’écrit sur le programme client. La première reprend ensuite et remet la révision 1. **Les deux requêtes répondent succès**, tandis que le client finit avec l’ancienne séance.

Preuve : `node scripts/auditWorkflowsRoutes.cjs`, scénario `overlapping template sync never overwrites a newer client revision`, résultat `1 !== 2`.

Ce test démontre une condition de concurrence, pas que les retours d’Alex ont nécessairement cette cause. Un timeout suivi d’une nouvelle sauvegarde, ou deux appareils, peuvent rendre ce chevauchement possible. Correction à prévoir : contrôle de révision atomique et/ou sérialisation par modèle, sans écraser une révision client supérieure.

### 2. Priorité haute — le préremplissage nutrition peut écraser une saisie récente

Source : [NutritionAssessmentEditor.jsx](/Users/tommarie/Projects/BYL-project/src/components/NutritionAssessmentEditor.jsx:452). L’effet asynchrone conserve l’ancien `form`, le copie après ses lectures à la ligne 475, puis applique `setForm(next)` à la ligne 535 sans fusion avec l’état courant ni contrôle d’obsolescence.

Reproduction : ouvrir l’éditeur, maintenir les lectures de profil en attente, saisir de nouvelles notes, puis laisser finir les lectures. Les notes reviennent à leur valeur initiale. L’effet peut aussi être relancé par les modifications de `form` tant que le premier préremplissage n’est pas terminé.

Preuve : `node scripts/auditWorkflowsClientActions.cjs`, scénario `nutrition prefill preserves user edits made while reads are pending`, résultat `initial notes` au lieu de `notes typed while loading`.

Correction à prévoir : fusion fonctionnelle avec le dernier formulaire, uniquement pour les champs encore vides, et annulation logique des opérations obsolètes au changement de dossier.

### 3. Priorité moyenne — assignations dupliquées après double soumission ou échec partiel

Source principale : [Clients.jsx](/Users/tommarie/Projects/BYL-project/src/components/Clients.jsx:878), nouvel identifiant créé à la ligne 887, écriture programme puis mise à jour client séparées aux lignes 890 et 905. Le bouton de la ligne 1629 n’est pas verrouillé pendant l’assignation.

Deux reproductions :

- Deux appels rapprochés au gestionnaire créent deux programmes assignés.
- L’écriture du programme réussit, la mise à jour de la fiche client échoue ; une erreur est annoncée, mais le programme existe déjà. Réessayer crée une seconde copie.

Preuves : `node scripts/auditWorkflowsClientActions.cjs`, scénarios `client-list assignment ignores a double submission` et `retry after assignment metadata failure does not duplicate the program`, chacun `2 !== 1`.

L’assignation du dashboard possède maintenant un verrou de soumission ; il ne couvre pas le formulaire Clients. Par inspection, le builder possède également un gestionnaire sans verrou et plusieurs écritures séparées : [ProgramBuilder.jsx](/Users/tommarie/Projects/BYL-project/src/components/ProgramBuilder.jsx:3990), bouton ligne 5448. Ce second formulaire n’a pas fait l’objet d’une reproduction navigateur.

Correction à prévoir : verrou commun de soumission, identifiant de tentative conservé pour la reprise et écriture atomique des documents liés.

### 4. Priorité moyenne — réessayer une création d’événement peut désynchroniser les deux calendriers

Source : [coachSessions.js](/Users/tommarie/Projects/BYL-project/backend/routes/coachSessions.js:260), construction du miroir depuis la demande aux lignes 274–289, puis écriture même en cas de doublon à la ligne 302.

La route détecte correctement une séance existante et conserve sa donnée racine. Mais elle remplace le miroir `clients/<id>/calendarEvents/<id>` avec la nouvelle demande au lieu de l’état réellement conservé.

Deux reproductions :

- Séance déjà terminée : racine et réponse restent `validée`, mais le miroir client passe de `done` à `planned`.
- Rendez-vous nutrition de 45 minutes : nouvelle demande du même rendez-vous avec 30 minutes ; la racine reste à 45 minutes, le miroir passe à 30 minutes.

Preuves : `node scripts/auditWorkflowsRoutes.cjs`, scénarios `duplicate planning preserves completed status in client mirror` et `duplicate nutrition planning preserves duration in client mirror`.

Correction à prévoir : ne pas réécrire un miroir existant sur simple reprise, ou le reconstruire depuis la séance conservée et non depuis le formulaire soumis.

## Point supplémentaire identifié par lecture du code

La création initiale d’un programme attend directement `addDoc` sans borne d’attente : [ProgramBuilder.jsx](/Users/tommarie/Projects/BYL-project/src/components/ProgramBuilder.jsx:3871). Les mises à jour existantes utilisent `saveWithTimeout`, contrairement à ce chemin. Une écriture sans confirmation serveur peut donc laisser le bouton en chargement. Ce point n’a pas été mesuré en mode hors-ligne dans un navigateur ; le timeout doit être accompagné d’une reprise idempotente pour éviter des doublons.

## Notifications : couverture et limites

**12 scénarios supplémentaires réussis**, via `node scripts/auditWorkflowsNotifications.cjs` :

- Déclencheur programme enregistré sur `clients/{clientId}/programmes/{programmeId}` à la création.
- Envoi simulé unique en cas de rejeu du déclencheur.
- Respect de `noNotify`, de l’absence d’e-mail, du refus global, du refus « programme », de la suspension et du réglage des notifications.
- Échec SMTP simulé tracé comme échec, sans annoncer un envoi réussi.
- Aucun e-mail pour un brouillon nutrition non partagé.
- Partage nutrition notifié une fois, avec protection anti-doublon.
- `clientShare.noNotify` supprime bien le déclencheur automatique.

Sources : [functions/index.js](/Users/tommarie/Projects/BYL-project/functions/index.js:2617), [déclencheur nutrition](/Users/tommarie/Projects/BYL-project/functions/index.js:3123), [verrou d’envoi](/Users/tommarie/Projects/BYL-project/functions/index.js:1654).

Le partage nutrition récent enregistre volontairement `noNotify: true`, puis appelle explicitement [POST /clubs/nutrition-share-email](/Users/tommarie/Projects/BYL-project/backend/routes/clubs.js:2587) depuis [MenuJournalierFromRation.jsx](/Users/tommarie/Projects/BYL-project/src/components/MenuJournalierFromRation.jsx:1414). Ce n’est donc pas une absence de notification due au seul `noNotify`. Ce chemin manuel a été inspecté, pas exercé sur un vrai destinataire.

Le verrou automatique `AttemptedAt` bloque aussi les rejeux après échec SMTP. Une relance manuelle administrateur existe : [adminEmails.js](/Users/tommarie/Projects/BYL-project/backend/routes/adminEmails.js:836). Aucune guérison automatique d’un échec temporaire n’a été démontrée ici.

**Planning** : aucun déclencheur d’e-mail de confirmation à la création/modification de séance n’a été trouvé dans les exports de `functions/index.js` ni dans la route `coachSessions`. Le parcours crée les documents planning et leur miroir pour le calendrier/flux ICS. Il ne faut pas présenter un e-mail de confirmation de séance comme validé ou comme actuellement implémenté sur ce parcours.

La réception réelle en boîte mail, les secrets SMTP déployés, la présence des déclencheurs en production, leurs journaux et la livraison anti-spam ne sont pas couverts par ces simulations.

## Commandes exécutées et résultats

Toutes les commandes existantes suivantes ont retourné le code 0 :

```text
npm run test:nutrition
npm run test:nutrition-creation
npm run test:nutrition-daily-log
npm run test:ciqual-search
npm run test:program-duplication
npm run test:program-sync
npm run test:program-display-metrics
npm run test:program-pdf-title
npm run test:player-program-sync
npm run test:player-builder-sync
npm run test:player-exercise-editing
npm run test:player-timer-editing
npm run test:player-settings-layout
npm run test:session-resume
npm run test:session-timing-calibration
npm run test:exercise-history
npm run test:loading
npm run test:coach-loading
npm run test:action-loading
npm run test:calendar-functions
npm run test:sport-engine
npm run test:exercise-search
```

Quelques bornes de couverture importantes :

- Nutrition : 1 474 scénarios de logique/calcul, 7 langues, 34 fichiers et 617 clés de traduction. Ce n’est pas une validation médicale des propositions pour chaque personne.
- Moteur sport : 9 936 combinaisons synthétiques et ajustements de durée ; pas de validation clinique ni de génération enregistrée en production.
- Nutrition-creation : identité, attente/erreurs, route client avec Firebase/SMTP simulés, statut différé, échec SMTP et rollback de création Auth.
- Program-sync : transformation du modèle et repli de requête ; la suite historique ne testait pas le chevauchement identifié ci-dessus.
- Action-loading : réponses confirmées seulement après transaction, doublons de séance, erreur de commit, abonnements programme, cache et accès. Le message `test-commit-failed` attendu dans les logs provient du scénario de panne volontaire.
- Calendar-functions : contrat de génération ICS et compatibilité des dépendances ; pas d’abonnement iPhone/Google/Outlook réel.
- Program-pdf-title : titre et bornes d’attente ; ce test ne vérifie pas un PDF complet rendu et paginé.
- Player-settings-layout : garde statique de structure/CSS ; ce n’est pas un test physique iPhone.
- Chargement : concurrence, coalescence, séparation des comptes, invalidation/expiration, données complètes, erreurs/reprises. Aucun nouveau temps réseau réel n’est mesuré par ces tests.

Nouveaux tests d’audit :

| Commande | Résultat | Type |
|---|---|---|
| `node scripts/auditWorkflowsRoutes.cjs` | 5 réussis, 3 échecs ; code 1 | Vraies routes, Firestore en mémoire |
| `node scripts/auditWorkflowsClientActions.cjs` | 1 réussi, 3 échecs ; code 1 | Callbacks source, état/services simulés |
| `node scripts/auditWorkflowsNotifications.cjs` | 12 réussis ; code 0 | Déclencheurs source, état et SMTP simulés |

Les échecs ont été conservés volontairement comme preuves reproductibles. Les trois nouveaux scripts passent ESLint lorsqu’ils sont contrôlés seuls. Ils ne sont pas ajoutés à `package.json`.

## Non couvert par ce sous-audit

Ce sous-audit n’utilise pas le navigateur partagé et ne se connecte pas sous Alex ou sous une cliente. Il ne valide pas les autorisations Firestore réellement déployées, la livraison des e-mails, les paiements Stripe, les comptes réels, les PDF complets, ni les calendriers externes. Les tests UI, inscriptions et Stripe sont réalisés séparément dans l’audit global ; leurs preuves ne doivent pas être déduites des résultats présentés ici.

## Complément en lecture seule : générateur et couverture transversale

**Droit à la génération payante.** Le contrôle serveur n’est pas cohérent avec le parcours produit. [AutoProgramQuestionnaire.jsx](/Users/tommarie/Projects/BYL-project/src/components/AutoProgramQuestionnaire.jsx:110) réserve explicitement la génération directe aux administrateurs et coachs actifs ; les particuliers passent par Stripe. Le paiement enregistre notamment `hasPurchasedCustomProgram`. Pourtant, [resolveGenerationScope](/Users/tommarie/Projects/BYL-project/backend/routes/programs.js:58) accepte un particulier pour son propre dossier sans contrôler achat, abonnement ou crédit. Le quota de 12 requêtes par 15 minutes n’est pas un contrôle de paiement. Cela constitue, d’après le code local et en complément de la reproduction simulée du sous-audit paiements, un **contournement du paywall**, pas une gratuité clairement prévue. Aucun appel réseau de génération supplémentaire n’a été effectué.

Inventaire des autres modules, **sans prétention de les avoir testés exhaustivement** :

| Module | Couverture disponible identifiée | Reste à vérifier réellement |
|---|---|---|
| Messagerie | Contrats statiques dans `smokeCriticalFlows.mjs` : routage, conversations, écriture groupée, pagination, accusés de lecture, compteurs, préférences e-mail | Conversation aller-retour entre deux comptes, reconnexion, droits, pagination et réception des e-mails |
| Statistiques coach/client | Tests de calculs programme/historique et chargement ; garde statique du comptage serveur côté coach | Exactitude des totaux affichés sur dossiers connus, périodes, unités, actualisation après séance |
| Admin Geo | Contrats statiques smoke : identité après authentification, géolocalisation fraîche, consentement, regroupement des visiteurs | Safari/iPhone, autorisation/refus persistants, changement de ville, identification de visite réelle |
| Exports PDF/ICS | Titres PDF, présence des notes localisées (smoke), contrat de génération ICS | Rendu complet, pagination, images, caractères/langues, téléchargement mobile et import dans calendriers externes |
| Notifications push | Badges/toasts de messagerie et e-mails présents ; aucune chaîne Web Push/FCM/service worker identifiée dans les sources consultées | Ne pas annoncer un push reçu application fermée comme une fonctionnalité validée |

Les vérifications transversales ci-dessus sont un inventaire de couverture et de limites, pas de nouveaux tests de bout en bout. Aucun test réseau, envoi ou changement de données supplémentaire dans ce complément.
