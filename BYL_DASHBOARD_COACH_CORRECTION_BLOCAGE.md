# Dashboard Coach — correction du blocage et cohérence locale

Branche `codex/firebase-performance-audit`. Aucun déploiement, changement des règles de production, purge de cache ou migration. Les tests de sécurité utilisent uniquement les émulateurs et des fixtures synthétiques. La mesure locale finale utilise l’onglet existant et conserve seulement des timings agrégés, sans contenu de dossier ni token.

## Correction

Le refus de lecture de `coachPageTemplateRevisions` n’appelle plus le nettoyage global du Dashboard. Ce document est un canal d’invalidation des modèles, pas une preuve d’autorisation. Son indisponibilité est explicitement affichée : les modèles ne bénéficient pas des notifications automatiques de modification et un rechargement obtient leur dernière version.

Les refus de lecture du profil, de l’annuaire ou du calendrier restent bloquants. Les contrôles serveur des dossiers et historiques, la barrière d’identité, les gardes contre les réponses anciennes et les changements de périmètre restent en place. Le traitement ne transforme pas un refus d’accès aux données en succès ni ne lit un cache pour accorder des droits.

L’API existante des modèles relit déjà le profil à chaque requête. Cette même lecture refuse maintenant explicitement `disabled`, `disabledByClub`, `deletedFromClub` et les statuts inactifs/supprimés ; aucun document supplémentaire n’est lu. Le contrôle de rôle, d’abonnement, d’administrateur vérifié et de propriétaire reste inchangé. Les limites historiques de révocation Auth externe des lots précédents ne sont pas déclarées résolues.

Pas de nouvel écouteur, polling, retry, index ou résumé persistant. Aucun contournement des règles refusant le marqueur. La cause distante exacte de ce refus n’est pas corrigée : le canal reste indisponible dans l’environnement connecté et l’utilisateur en est informé.

Fichiers applicatifs modifiés :

- `src/components/CoachDashboard.jsx` : portée de l’échec du canal de révision et message utilisateur.
- `backend/routes/coachProgramRead.js` : refus des profils désactivés avec la lecture déjà existante.

Tests : `scripts/testCoachBatchesLot8B.cjs`, nouveau banc `scripts/runCoachRevisionFix.cjs`. Baselines et diff isolé sous `audits/coach-revision-fix/`.

## Validation synthétique

Trois passages du vrai frontend compilé avec Auth/Firestore émulés :

1. Ancien code et règle de fixture refusant le marqueur : chargement principal non terminé, reproduction attendue du blocage.
2. Code corrigé et même refus : chargement principal terminé, avertissement visible, puis désactivation du profil retirant réellement le Dashboard.
3. Code corrigé et marqueur autorisé : chargement principal terminé, absence d’avertissement, puis même retrait lors de la désactivation.

La modification de règle existe seulement dans la copie temporaire de test, jamais dans les règles du projet ou de production. Les tests API couvrent huit états de désactivation/suppression, le retour au profil actif, la propriété des dossiers et les limites des lots. Les suites Coach, P0-1/P0-2, les 53 contrôles smoke et le build avec budgets passent. Résultats individuels dans `checks.json`.

## Coûts

Pour la même fixture fonctionnelle de 36 clients, avec ou sans canal de révision accessible :

| Mesure | Canal refusé | Canal autorisé |
|---|---:|---:|
| Opérations SDK navigateur | 45 | 45 |
| Écritures navigateur existantes | 2 | 2 |
| Appels détaillés backend | 2 | 2 |
| Lectures SDK détaillées backend | 134 | 134 |
| Documents détaillés retournés | 1 028 | 1 028 |
| Lectures documentaires détaillées estimées | 1 032 | 1 032 |
| Écritures backend dans la mesure | 0 | 0 |

Le canal refusé compte un écouteur actif de moins après son échec. L’estimation navigateur est 113 contre 114 ; ce compteur n’est pas une facture.

L’ancienne page bloquée ne chargeait pas les historiques : elle effectuait seulement neuf opérations SDK dans cette fixture. Rétablir les fonctionnalités rétablit nécessairement leurs lectures normales. La référence pertinente est la page fonctionnelle avec canal autorisé, pas une page en échec. Aucun coût automatique additionnel n’est introduit par la correction ; aucune garantie de facture globale Google n’est déduite des émulateurs.

Les rechargements de qualification dans l’onglet connecté exécutent les lectures habituelles de l’application. Ils ne sont pas présentés comme gratuits ou comme des tests sur émulateurs. Le repli existant après une réponse détaillée trop volumineuse (413) reste une limite connue : son éventuel déclenchement sur les données locales n’a pas été instrumenté dans cette intervention.

## Cohérence locale

Les anciens processus des ports 5050 et 5173, démarrés le 9 novembre, ont été arrêtés après identification. Les nouvelles instances API et Vite utilisent le code actuel et écoutent sur la boucle locale. Identifiants consignés dans `local-processes.json`.

`backend/app.js` ne démarre pas les workers/CRON. Les imports inspectés ne démarrent pas de scan global à l’initialisation. Aucun worker lancé ou redémarré. La disponibilité de l’API a été vérifiée par une route inexistante donnant 404, sans appeler `/api/health` qui aurait lu Firestore. Aucun fichier persistant de logs applicatifs contenant des requêtes utilisateur n’a été créé par le redémarrage.

## Mesures dans le navigateur existant

| Étape depuis le démarrage du document | Premier lancement après redémarrage | Rechargement ordinaire |
|---|---:|---:|
| Montage du Dashboard | 6,247 s | 0,464 s |
| Annuaire disponible | 6,919 s | 0,938 s |
| Calendrier initial disponible | 6,932 s | 0,953 s |
| Modèles disponibles | 7,050 s | 1,153 s |
| Nutrition disponible | 8,322 s | 2,257 s |
| Programmes et historiques détaillés disponibles | 26,104 s | 20,071 s |
| Principal complet (`core`) | 26,232 s | 20,204 s |
| Marqueur de rendu | 26,342 s | 20,329 s |

Le chargement aboutit désormais. **L’objectif global de deux secondes n’est pas atteint.** Les premiers blocs sont rapides après le démarrage à froid, mais les programmes et historiques restent sur le chemin critique.

Le snapshot applicatif représente 32 175 207 caractères JSON en mémoire. Ce chiffre ne mesure ni les octets HTTP transférés, ni le nombre de documents facturés ; il comprend les structures dérivées de l’interface. L’instrumentation sérialise cet état uniquement pour en mesurer la longueur, sans conserver son contenu. Cette opération ajoute une faible surcharge au chronométrage. Le temps avant montage inclut plusieurs étapes (JavaScript, Auth, profil et route) et ne permet pas d’attribuer les 6,247 secondes à une cause unique.

Les temps d’émulateur antérieurs ne sont pas extrapolés à cet environnement. Le nombre de clients ne représente pas à lui seul la taille des programmes ni de leurs historiques.

## État final et suite

Le blocage global provoqué par le marqueur est corrigé et testé, les serveurs locaux sont à jour. L’avertissement de synchronisation des modèles est volontaire tant que ce canal est refusé. Le Dashboard est remis sur son URL normale sans panneau de mesure.

Le prochain travail de performance doit mesurer précisément les requêtes détaillées et leur éventuel repli 413, puis réduire les données nécessaires à chaque bloc. Tout résumé devra préserver la progression, l’historique, les autorisations et démontrer que les écritures ajoutées sont compensées par les lectures évitées. Aucun résumé ni autre optimisation de page n’a été introduit ici. P0-3/P0-4 restent ouverts.
