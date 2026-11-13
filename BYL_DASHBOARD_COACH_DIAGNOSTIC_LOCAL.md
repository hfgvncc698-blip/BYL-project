# Diagnostic du Dashboard local — 11 novembre 2026

Périmètre demandé : diagnostic, sans correction fonctionnelle ni déploiement. Le navigateur déjà connecté à BYL a été utilisé pour des rechargements ordinaires ; les preuves conservées ne contiennent que durées, états et catégorie d’erreur, sans contenu de dossier, token ni identifiant personnel. Aucun dossier client ouvert ni mutation métier déclenchée volontairement. Les rechargements exécutent les requêtes habituelles de l’application : ils ne constituent pas un test sans consommation Firebase.

## Conclusion démontrée

Une écoute Firestore sur `coachPageTemplateRevisions/{coachUid}` retourne `permission-denied`. Le code traite ce refus comme une invalidation globale du Dashboard : incrément de `dashboardLoadSeqRef`, purge des caches mémoire, effacement des clients/programmes/séances/nutrition. La continuation du chargement abandonne ensuite à `if(!isLatestLoad())return`, avant l’enrichissement des clients.

Le chronomètre `core` reste `loading` ; ce chemin ne produit pas d’erreur console explicite. Les premiers clients ou modèles peuvent néanmoins être affichés par d’autres continuations, ce qui donne une page partiellement chargée. Aucun chargement principal réussi en sept secondes n’a été reproduit : le diagnostic a reproduit un blocage plus durable. Ce résultat ne permet pas d’affirmer que tous les délais antérieurs avaient cette seule cause.

Preuves code : `src/components/CoachDashboard.jsx`, gestionnaire `denied` autour de 4278, écoute de révision autour de 4286, sortie de chargement autour de 3436. Le marqueur de révision sert à invalider les modèles ; son auteur est la synchronisation dans `functions/index.js`. Il ne contient pas l’annuaire ni l’historique des séances.

## Chronométrages observés

Les temps sont ceux du marqueur existant `dashboardPerf`, depuis le démarrage du document. Le montage du Dashboard se déduit de `pageMs - mountMs` ; il ne sépare pas restauration Auth, profil, téléchargement et rendu initial.

| Étape | Essai 1 | Essai 2 | Essai 3, trace locale temporaire |
|---|---:|---:|---:|
| Montage du Dashboard | 508 ms | 481 ms | 526 ms |
| Refus de l’écoute de révision | non instrumenté | non instrumenté | 769 ms |
| Réception de l’annuaire | 895 ms | 865 ms | 859 ms |
| Modèles reçus par API | 1 023 ms | 1 025 ms | 1 122 ms |
| Enrichissement principal | non atteint | non atteint | non atteint |

Les 36 racines clients et les 57 modèles arrivent donc rapidement dans ces essais. Le marqueur nutrition indique zéro client après le nettoyage global : il ne faut pas l’interpréter comme l’absence réelle de dossiers nutritionnels ni comme un chargement nutrition réussi.

Une actualisation HMR pendant l’ajout de la trace a également montré le refus de la même écoute. Ses temps ne sont pas assimilés à ceux d’un rechargement. Aucune assertion interne ca9/b815 ni erreur de la route détaillée n’a été retrouvée dans la fenêtre des journaux consultés ; cela ne prouve pas leur absence historique.

## Deuxième problème : cohérence des versions locales

Les processus API (port 5050) et Vite (port 5173) démarrent tous deux le 9 novembre à 18:53:38. `backend/routes/coachProgramRead.js` a été modifié le 11 novembre à 12:41 et `backend/utils/coachDashboardBundles.js` à 12:47. L’API importe la route avant `listen`, et `dev:api` lance `node backend/app.js`, sans rechargement automatique.

L’API existante ne recharge donc pas les corrections ultérieures simplement parce que le frontend est mis à jour par Vite. Le lanceur `scripts/dev.mjs` réutilise les services déjà actifs. Aucune surcharge `VITE_DEV_API_URL` n’a été trouvée dans les fichiers d’environnement Vite usuels ; la configuration par défaut passe par le proxy local. Une variable injectée au lancement n’a pas été inspectée, pour éviter de lire l’environnement sensible du processus.

Aucun processus redémarré. Aucun appel `/api/health` provoqué : cette route peut elle-même lire Firestore.

## Ce qui n’est pas encore établi

- La raison exacte du refus distant : règles déployées différentes, condition de rôle/abonnement/email, ou autre divergence du contexte. La règle locale prévoit un `get` pour le coach autorisé ou l’administrateur, mais les règles réellement actives n’ont pas été récupérées ni modifiées.
- La latence des historiques dans cet environnement une fois le blocage levé : l’exécution normale s’arrête avant cette étape.
- Le temps réseau détaillé, le CPU navigateur et les lectures réellement facturées. Le navigateur contrôlé expose les marqueurs DOM et les journaux, pas les entrées Performance via son évaluation en lecture seule.
- Les mesures synthétiques précédentes utilisaient les règles du dépôt et un backend neuf : elles ne couvraient pas cette divergence de l’environnement connecté.

## Options à examiner avant correction

1. **Rendre l’environnement local cohérent.** Vérifier la destination effective de l’API, puis prévoir un redémarrage maîtrisé de l’API avec le code actuel. Vérifier auparavant les tâches automatiques lancées au démarrage pour éviter toute activité réelle non prévue. Cela ne résout pas à lui seul le refus Firestore.
2. **Qualifier le contrat d’accès au marqueur de révision.** Reproduire sur émulateur le cas “lectures métier autorisées, marqueur refusé”, puis identifier la différence avec le contexte connecté. Aucune mise en production des règles ni ouverture générale de droits proposée.
3. **Corriger la portée et la visibilité de cet échec.** Distinguer un refus d’un canal d’invalidation d’une révocation de session réellement confirmée. Étudier un comportement dégradé qui conserve les vérifications serveur et retire les données en cas de vraie révocation. Ne pas simplement ignorer le refus ni déclarer les données fraîches. Pas de polling supplémentaire comme solution par défaut.
4. **Reprendre ensuite la mesure des historiques.** Selon le résultat, limiter les données de chaque bloc ou qualifier des résumés exacts avec un bilan lectures/écritures. Une augmentation de puissance serveur n’est pas justifiée par ce diagnostic.

## Remise en état

La trace temporaire ajoutait uniquement domaine et code d’erreur au panneau local déjà existant. Aucun appel Firebase ni journal serveur ajouté. Elle a été retirée ; l’empreinte SHA-256 de `CoachDashboard.jsx` est identique à celle du début de l’intervention. L’URL a été remise à `/coach-dashboard`, le panneau de diagnostic est absent et le titre du Dashboard est présent.

Seuls ce rapport et les preuves agrégées sous `audits/coach-diagnostic-local/` sont conservés. Pas de correction fonctionnelle, déploiement, changement des règles, purge de données ni résolution déclarée de P0-3/P0-4.
