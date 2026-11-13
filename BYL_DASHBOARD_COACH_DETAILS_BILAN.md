# Dashboard Coach — détails à la demande

Branche : `codex/firebase-performance-audit`. Aucun déploiement, aucune règle modifiée, aucun worker lancé. P0-3 et P0-4 restent ouverts.

## Résultat

Les contenus détaillés des historiques et la description des programmes attribués ne font plus partie du chargement initial du Dashboard. Les lecteurs existants de ProgramView, SessionPlayer et de la fiche client les obtiennent à la consultation, avec leurs contrôles d'accès habituels. Il n'y a ni préchargement supplémentaire, ni nouveau service, ni résumé persistant, ni écriture ajoutée.

Il s'agit d'un chargement à la demande ciblé : **les prescriptions complètes des séances restent chargées** car le Radar Coach les utilise pour préparer et appliquer ses ajustements. Ce lot ne prétend pas avoir différé toutes les données de tous les programmes.

La mesure locale passe de **17,029 s à 13,772 s**, soit environ 19 %. L'objectif de 2 secondes n'est pas atteint sur ce compte. La fixture synthétique passe de **2,701 s à 1,740 s** en médiane ; ces deux résultats ne sont pas interchangeables.

## Cause et architecture

Le précédent correctif avait supprimé la double lecture après l'erreur HTTP 413. Le transfert contenait encore des descriptions et des corps d'historiques que le Dashboard n'affiche pas. Les convertir, compresser, transférer, décoder puis conserver dans plusieurs objets de progression était inutile.

Le Dashboard demande maintenant `dashboardProjection: 1` sur le même endpoint transactionnel. Le serveur :

- conserve la vérification de session, de rôle, d'abonnement et d'appartenance pour tous les dossiers avant lecture ;
- conserve la liste complète des programmes et toutes les validations, dans le même ordre ;
- sélectionne côté Firestore les champs historiques nécessaires aux calculs, au calendrier, au Radar et à la reprise : statuts, dates et leurs anciennes variantes, identifiants de séance, liens de calendrier, visibilité coach, difficulté, dernier exercice/série et chronométrages ;
- omet la description du programme dans la réponse Dashboard, tout en conservant les autres champs, les prescriptions complètes et les anciens champs de progression ;
- indique `__dashboardPartial: true` sur cette représentation ;
- laisse le contrat complet de l'API disponible pour les autres consommateurs.

Aucun total n'est extrapolé. Le Dashboard exécute ses calculs existants sur les métadonnées de **tous** les historiques. Les informations de date, difficulté, visibilité, validation, répétition et dédoublonnage sont préservées. Les contenus narratifs, résultats détaillés d'exercices et autres champs non utilisés restent dans les documents canoniques.

Le cache partagé garde sa clé `bundle/<dossier>` et sa version de révision existante : la page Clients peut réutiliser les mêmes métriques sans nouvelle requête de sport. Les purges ciblées et la barrière d'identité restent intactes. Une ancienne entrée complète reste un sur-ensemble valide ; elle n'est pas purgée automatiquement.

ProgramView utilise `useProgrammeDocument` pour son document canonique et son abonnement d'historique. SessionPlayer conserve son propre chargement canonique. Le Dashboard transmet des identifiants de navigation, pas un programme projeté à enregistrer. L'action de reprise relit déjà le dossier concerné ; aucun nouvel appel n'y est ajouté.

## Mesures locales

Même navigateur et même compte local, rechargement complet. Une observation avant, deux après dont la dernière avec conservation explicite des champs historiques embarqués anciens. Aucune mutation métier exécutée. Seuls les compteurs et durées agrégés sont conservés dans le rapport.

| Mesure | Avant | Après, premier essai | Après, version finale |
|---|---:|---:|---:|
| Dashboard principal confirmé | 17 029 ms | 13 785 ms | 13 772 ms |
| Détails/métadonnées disponibles | 16 912 ms | 13 673 ms | 13 676 ms |
| Annuaire confirmé | 2 110 ms | 1 067 ms | 929 ms |
| Appels API de programmes | 2 | 2 | 2 |
| Replis SDK après 413/404 | 0 | 0 | 0 |
| Caractères du snapshot applicatif | 32 175 207 | 24 098 135 | 24 098 135 |

Parité : 36 clients, 57 modèles, 422 validations, 258 séances prévues et 274 événements. Ces compteurs sont ceux du diagnostic existant, pas le nombre de documents facturés. La taille du snapshot est un nombre de caractères JSON, **pas des octets réseau ni la mémoire du serveur**.

La variabilité de l'annuaire participe à l'écart total : il serait incorrect d'attribuer mécaniquement toutes les millisecondes gagnées à la projection. La phase entre annuaire et détails passe d'environ 14,80 s à 12,75 s. Les prescriptions conservées et les requêtes nécessaires aux statistiques restent dominantes.

## Banc synthétique et coûts

Voir `BYL_DASHBOARD_COACH_DETAILS_MESURES.md` et `audits/coach-demand/*-build.json`.

Deux séries alternées avant/après, application compilée, profils Chrome jetables et émulateurs Auth/Firestore : 36 clients, 90 programmes et 900 validations. Textes synthétiques volumineux, sans donnée réelle. Les prescriptions simples de cette fixture ne représentent pas la diversité du compte local.

- Principal confirmé : médiane 2 701 → 1 740 ms.
- Retour chaud : 338 → 249 ms.
- API programmes : 2 → 2.
- Opérations SDK détaillées backend : 134 → 134.
- Documents backend : 1 028 → 1 028 ; estimation documentaire : 1 032 → 1 032.
- Opérations SDK navigateur : 45 → 45.
- Écritures navigateur : 2 → 2, déjà présentes ; backend : 0 → 0.
- Corps API programmes compressés : environ 311 ko → 1,6 ko, sur les textes répétitifs de la fixture uniquement.
- Heap navigateur médian : 127 → 50 Mio ; CPU JavaScript : 1 128 → 1 051 ms.
- Écouteurs navigateur : 5 → 5 ; backend observés : 2 → 2.

Une projection Firestore conserve le même nombre de documents lus. L'économie démontrée concerne ici le transfert et les traitements inutiles, pas une baisse du nombre de lectures. Aucune lecture de validation supplémentaire, aucun nouveau polling ou stockage de synthèse. Les consultations de détails gardent les appels déjà présents avant cette modification.

Les compteurs navigateur secondaires varient légèrement selon l'ordre d'arrivée des écouteurs ; les opérations du domaine programmes sont identiques. Les ressources réseau terminées ne couvrent pas intégralement les flux Firestore persistants. La facturation réelle Firebase/Google, la mémoire de l'instance Google et son CPU ne sont pas mesurés. Aucun changement d'infrastructure ou de capacité n'a été effectué ; il n'y a pas de garantie chiffrée sur une facture réelle.

## Tests exécutés

Réussis :

1. `testCoachDashboardProjection.cjs` exécute les véritables fonctions pures du Dashboard sur 0, 10, 100 et 1 000 historiques : validations, prochaine séance, dates, titres, difficulté, visibilité, reprise, répétitions, dédoublonnage, suppression et correction ; parité complète avant/après. Les prescriptions restent identiques, champs inconnus inclus.
2. `testCoachBatchesLot8B.cjs` sur émulateurs : projection comparée à la réponse complète, mêmes coûts documentaires ; détails canoniques toujours disponibles via le SDK Web ; lecture refusée après transfert du dossier à un autre coach. Anciennes structures `seances`, champs inconnus, contrôles de rôle, club, révocation, désactivation et limites 32/33 dossiers conservés.
3. Chargeur partagé : déduplication, lots 32/32/32/4, cache réutilisé, aucun repli en cas de 401/403/400, repli compatible 404/413.
4. Banc intégré : démarrage compilé, retour à chaud, navigation, rechargement, redimensionnement desktop/mobile, mêmes compteurs de programmes/progression/calendrier.
5. Contre-tests P0-1 et P0-2 : réussis.
6. `testCoachDashboardLoading.mjs`, `npm run test:smoke` et `npm run build` : réussis.
7. `git diff --check` : réussi.

Deux premières tentatives de lancement du banc n'ont pas démarré : Java absent du PATH puis ports locaux interdits par le sandbox. Après sélection du JDK déjà installé et autorisation des ports locaux, les exécutions passent. Ce ne sont pas des résultats fonctionnels réussis ; les résultats retenus sont ceux des exécutions ultérieures.

Le dernier ajustement conserve les champs embarqués `sessionsEffectuees` et `_progressSessionsEffectuees` pour ne pas changer la priorité des anciens formats. Ces champs ne sont pas présents dans la fixture de performance ; les contre-tests finaux ont été relancés sur le code final. Les deux mesures locales après présentent la même taille et les mêmes compteurs.

Les tests ne couvrent pas chaque interaction graphique de toutes les pages ni chaque format historique possible. Les détails sont vérifiés via les véritables règles et SDK, sans prétendre avoir rejoué chaque bouton de ProgramView et SessionPlayer. P0-3/P0-4 ne sont pas déclarés résolus.

## Fichiers concernés

Application :

- `backend/utils/coachDashboardBundles.js` : projection historique et représentation du programme destinée au Dashboard.
- `backend/routes/coachProgramRead.js` : sélection explicite de ce contrat après les contrôles existants.
- `src/utils/coachProgramBatch.js` : demande du contrat projeté ; cache, invalidation, transport et repli inchangés.

Qualification : `scripts/testCoachDashboardProjection.cjs`, `scripts/testCoachBatchesLot8B.cjs`, `scripts/runCoachDemandBenchmark.cjs`, `scripts/reportCoachDemand.py`, rapports et `audits/coach-demand/`. Les nombreuses autres modifications présentes sur la branche précèdent ce travail et n'ont pas été annulées.

Reproduction :

```sh
node scripts/testCoachDashboardProjection.cjs
node scripts/testCoachProgramBatchLot8B.mjs
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runRegressionsLot8B.cjs coach
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachDemandBenchmark.cjs before 1 build
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachDemandBenchmark.cjs after 1 build
# Refaire la paire avec 2, puis :
python3 scripts/reportCoachDemand.py
```

Le banc restaure les sources du début de cette tâche pour « avant », dans une copie temporaire. Il utilise uniquement le projet demo des émulateurs. Les profils et données utilisateur ne sont pas purgés.

## Limites et suite recommandée

- Toutes les métadonnées historiques restent nécessaires au calcul actuel. Réduire le nombre de documents exige un résumé fiable, une invalidation démontrée et un budget d'écritures évalué ; rien de tel n'est introduit ici.
- Les programmes complets sont encore lus côté backend. Leurs prescriptions restent transmises pour préserver les ajustements Radar sans lecture ajoutée. Différer ces prescriptions nécessite de qualifier le coût et la cohérence de ces actions.
- Une nouvelle utilisation d'un champ historique dans le Dashboard doit faire évoluer la projection et ses tests.
- Les détails restent soumis au réseau à leur ouverture ; les caches mémoire autorisés et les protections existantes sont conservés.
- Le repli ancien 404/413 peut encore charger des contenus complets dans un cas exceptionnel. Aucun repli n'a été observé sur les mesures finales.
- L'avertissement existant sur le canal facultatif de révision des modèles n'a pas été masqué ni corrigé dans cette tâche.

Travail arrêté après la comparaison. Aucun déploiement.
