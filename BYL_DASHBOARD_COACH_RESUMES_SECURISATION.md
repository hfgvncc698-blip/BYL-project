# Résumés Dashboard Coach — invalidation protégée et éligibilité

## Résultat et décision

Le pilote a été renforcé **uniquement dans les émulateurs**. Les écritures Web SDK non coordonnées sont refusées sur les dossiers qualifiés ; les validations légitimes coach, client et administrateur passent en changeant la génération dans la même opération atomique. Les anciens parcours non qualifiés restent canoniques.

La variante persistante a été écartée pour cet essai : elle ajoutait des lectures et écritures de résumé, sans gain sur les dossiers vides. Le nouveau pilote utilise une projection exacte en **mémoire serveur**, sans document de résumé, index, listener ou écriture de cache Firestore.

Sur les phases comparées, lectures et écritures Firestore sont égales à la référence à froid, puis diminuent lors d'une réutilisation éligible. Le coût total Google n'est pas une facture observable sur émulateur. Les ressources mémoire/CPU et le coût de migration des anciens auteurs restent à qualifier avant une activation réelle.

**Aucun dossier réel n'est enrôlé. Aucun déploiement, aucune modification des règles de production ou de l'application locale habituelle.** Le pilote est importé uniquement dans les copies jetables du banc. P0-3/P0-4 restent ouverts.

## Mesures avant/après

Dashboard compilé, 36 clients / 90 programmes / 900 validations, deux paires alternées, médianes :

| Mesure | Canonique | Pilote protégé |
|---|---:|---:|
| Données principales à froid | 1 546 ms | 1 660 ms |
| Rechargement, cache serveur présent | 1 027 ms | 589 ms |
| Retour chaud | 279 ms | 268 ms |
| Lectures programmes estimées à froid | 1 032 | 1 032 |
| Écritures serveur à froid | 0 | 0 |
| Écritures navigateur déjà présentes | 2 | 2 |

Le premier chargement est **plus lent de 114 ms dans cette série** ; aucun gain à froid n'est revendiqué. Les deux répétitions ne suffisent pas pour attribuer causalement cet écart au cache. La réduction mesurée au rechargement est d'environ 43 %. Ces chiffres synthétiques ne remplacent pas les 13,77 s précédemment mesurées sur le compte local.

API protégée, 500 clients / 1 000 programmes / 10 000 historiques : référence 8 649 ms et 11 548 lectures estimées ; cache présent 126 ms en médiane et 548 lectures, soit environ 95 % de lectures en moins. **Il s'agit du temps d'API, pas du temps de rendu d'un Dashboard de 500 clients.**

La comparaison complète, CPU, mémoire et volumes figurent dans `BYL_DASHBOARD_COACH_RESUMES_SECURISATION_MESURES.md`.

## Invalidation protégée

Le protocole émulé ajoute deux champs sur les dossiers synthétiques :

- `__summaryProtocol` : enrôlement réservé au serveur ;
- `__summaryEpoch` : génération entière monotone.

Une création, correction ou suppression sous `clients/{id}/programmes/**` est acceptée sur un dossier qualifié seulement si `getAfter` observe la génération précédente + 1 dans la **même** opération atomique. `dashboardProgramRevision` prend la même valeur pour invalider les caches frontend existants.

Les règles racine empêchent un client Web de s'enrôler, de désactiver le protocole, de reculer ou sauter une génération. Les modifications de profil sans rapport restent possibles avec les mêmes permissions. Les dossiers non enrôlés gardent leurs parcours de modification existants.

La règle générique d'administration du dossier est également encadrée : dans Firestore, un autre `allow` permissif pouvait sinon contourner la règle spécifique aux programmes. Le contre-test administrateur Web vérifie que l'écriture directe est refusée et que l'écriture atomique reste autorisée.

Chaque réutilisation côté API intervient **après** les contrôles existants de session, révocation, rôle, abonnement et propriété, puis la lecture actuelle du dossier dans la transaction. Le cache ne remplace aucun de ces contrôles.

L'entrée mémoire est liée à la génération **et à la date de création Firestore du dossier**. Supprimer puis recréer le même identifiant ne permet pas de récupérer la projection de son incarnation précédente. Les réponses retournées sont isolées du contenu mémorisé, et les identifiants spéciaux tels que `__proto__` restent des clés de données.

## Éligibilité économique

Un dossier est mémorisé seulement si :

1. le protocole d'écriture est explicitement qualifié dans l'environnement d'essai ;
2. la génération et l'identité du document sont valides ;
3. la lecture canonique déjà effectuée montre au moins **20 lectures documentaires estimées** pour ses programmes et historiques ;
4. sa représentation sérialisée ne dépasse pas **1 Mio**.

Le seuil est calculé à partir des documents effectivement lus, jamais à partir d'un compteur fourni par le navigateur. Les dossiers vides et les petits dossiers sans historique sont exclus : aucune lecture de cache Firestore n'est tentée et aucune écriture n'est ajoutée.

Budget global : **16 Mio de payloads sérialisés UTF-8**, éviction LRU, validité de cinq minutes. Le plafond n'est pas un plafond du RSS total : il faut ajouter objets JavaScript, structures du cache et réponses en cours. La validité expire à cinq minutes ; les octets sont retirés à l'accès ou sous pression, pas par une purge physique garantie à une échéance exacte.

Un redémarrage, une éviction, une expiration ou un changement de génération ramène au parcours canonique. Les données ne dépendent pas de la survie du cache. Deux caches indépendants vérifient chacun la génération actuelle ; ils ne demandent aucun service de synchronisation supplémentaire.

Le seuil indique un bénéfice en lectures **si l'entrée est réutilisée**. Il ne peut pas garantir une consultation future ni une économie de CPU/mémoire pour un dossier consulté une seule fois. Contrairement au pilote persistant, cette absence de réutilisation ne laisse pas une facture de lectures/écritures de résumé.

## Écritures privilégiées et anciens parcours

Le SDK Admin et les outils privilégiés ne sont pas soumis aux règles Firestore. Le test le démontre encore : modifier directement un historique avec ces outils, sans génération ni clôture préalable, peut laisser un cache périmé.

Le pilote fournit donc `quarantine(db, clientId)` : une transaction désactive l'éligibilité et change la révision **avant** toute maintenance ancienne ou externe. Les lectures suivantes utilisent les données canoniques et les entrées mémoire ne servent plus. Le writer atomique refuse de modifier un dossier non qualifié. Aucun réenrôlement automatique ne masque un échec ou une interruption.

Cette procédure n'intercepte pas une console ou un outil externe qui l'ignore. **L'enrôlement réel reste interdit tant que tous les auteurs privilégiés ne sont pas qualifiés.** Un marqueur serveur ne prouve pas à lui seul que cet inventaire est complet.

Les points à qualifier incluent les écritures de SessionPlayer/ProgramView, les assignations et suppressions de programmes, les services de génération automatique, les cycles et fonctions Firebase, scripts administratifs et outils externes. La recherche de références à `sessionsEffectuees` a trouvé 36 fichiers, comprenant aussi des lecteurs : ce chiffre n'est pas présenté comme un inventaire exhaustif des auteurs.

Aucun de ces modules n'a été modifié dans cette tâche. Un ancien onglet ne doit jamais être confronté au protocole renforcé sans qualification préalable : ses écritures seraient refusées sur un dossier enrôlé. C'est pourquoi tous les dossiers réels et anciens parcours restent hors pilote.

## Tests et garanties démontrées

- Parité de la réponse métier complète pour 0, 12, 36, 100 et 500 clients, jusqu'à 24 000 historiques au total.
- Lecture initiale et réutilisations sans augmentation de lectures ou écritures Firestore dans le banc.
- Validation, correction, suppression et changement de programme ; invalidations répétées ; deux lecteurs ; course lecture/écriture.
- Coach, client lié et administrateur Web : mutation atomique autorisée ; écriture directe ou rejeu de génération refusé.
- Enrôlement falsifié, désactivation du protocole et modification de propriété non autorisée refusés.
- Dossier supprimé puis recréé ; cache perdu ; expiration ; éviction ; deux caches indépendants ; réponse modifiée par l'appelant ; clés spéciales.
- Session révoquée, changement de rôle, compte désactivé et dossier transféré refusés avant toute réutilisation du cache.
- Ancien dossier non qualifié : fonctionnalités et nombre de lectures canoniques inchangés.
- Dashboard complet : même progression, synchronisation après validation et suppression, desktop/mobile, navigation et rechargement.
- Contre-tests P0-1/P0-2 avec la copie des règles renforcées : réussis.

La validation/suppression dans le Dashboard utilise le writer atomique synthétique. La migration effective de chaque écran vers ce protocole n'est pas prétendue réalisée. Tous les boutons de toutes les pages n'ont pas été rejoués, et deux caches indépendants en test ne constituent pas une qualification de plusieurs processus API déployés.

## Coûts encore à qualifier avant intégration

Le writer atomique réalise une lecture du dossier puis la mutation et sa révision. Ces opérations existent dans **les deux variantes comparées**. Les nouveaux contrôles de règles peuvent ajouter des lectures dépendantes `getAfter`. L'émulateur ne fournit pas leur facturation réelle. Les déclencheurs actuellement actifs devront être pris en compte, pas supposés supprimés gratuitement.

L'intégration ne doit donc pas être autorisée sur la seule affirmation « zéro écriture de cache ». Il faut encore vérifier le coût de migration du protocole, les éventuelles doubles invalidations, les accès dépendants des règles, le CPU et la mémoire allouée Google. Aucun service, capacité ou déploiement supplémentaire n'a été introduit ici.

## Fichiers et reproduction

Nouveaux fichiers expérimentaux :

- `scripts/experiments/coachSummaryGuarded.cjs` : cache borné, writer atomique, quarantaine ;
- `scripts/experiments/coachSummaryRules.cjs` : transformation des règles de la copie jetable uniquement ;
- `scripts/testCoachSummaryGuarded.cjs`, `scripts/testCoachSummaryMemory.cjs` ;
- `scripts/runCoachSummaryGuarded.cjs`, `scripts/runCoachSummaryGuardedBrowser.cjs` ;
- `scripts/reportCoachSummaryGuarded.py` ;
- rapports et résultats dans `audits/coach-summary-guarded*`.

```sh
node scripts/testCoachSummaryMemory.cjs
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachSummaryGuarded.cjs trial
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachSummaryGuarded.cjs p01
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachSummaryGuarded.cjs p02
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachSummaryGuardedBrowser.cjs before 1 build
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachSummaryGuardedBrowser.cjs after 1 build
# Refaire la paire avec 2, puis :
python3 scripts/reportCoachSummaryGuarded.py
```

Exécutions séquentielles, ports locaux partagés. Les gardes exigent le projet demo et les émulateurs sur loopback. L'environnement non émulé est refusé.

Travail arrêté après qualification. Le choix technique réduit les lectures récurrentes sans stockage Firestore supplémentaire ; l'autorisation d'une intégration réelle reste distincte et non accordée.
