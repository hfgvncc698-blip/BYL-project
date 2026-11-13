# Dashboard Coach — chargement indépendant

Branche `codex/firebase-performance-audit`. Intervention limitée au Dashboard et à son annuaire partagé. Aucun déploiement, donnée réelle, purge, migration, nouveau service Google ou changement de règles. Les modifications préexistantes du projet sont conservées. P0-3/P0-4 restent ouverts.

## Changements intégrés

- `src/components/CoachDashboard.jsx` : les modèles de programmes ne bloquent plus la publication des clients enrichis, de leur progression exacte et du calendrier réconcilié. Les compteurs qui dépendent de ces données disposent de leur propre état de confirmation. Le marqueur global `core` et le cache complet attendent toujours les modèles : aucun gain n’est annoncé en déplaçant simplement la fin du chronomètre.
- Les modèles gardent leur chargement parallèle et leur affichage dès réception. Leur erreur reste visible. Une réponse d’autorisation négative efface les données et retire la confirmation des compteurs. La séquence de chargement et la barrière d’identité existantes rejettent les réponses anciennes. Aucun cache destination de programmes vide n’est amorcé avant disponibilité des modèles.
- `src/utils/coachDirectoryFeed.js` : quand le Dashboard ouvre l’annuaire, une requête autorisée remplace les pages successives qui finissaient par lire tous les mêmes dossiers. Le Dashboard a toujours besoin de l’ensemble pour les totaux exacts et la déduplication des anciens dossiers. Le filtrage propriétaire et l’ordre sont inchangés. La page Clients conserve ses pages 25/100 ; si elle a ouvert le flux partagé en premier, celui-ci conserve son mode paginé. Aucun deuxième flux concurrent n’est créé.
- Le résumé mobile masqué par CSS n’est plus monté sur desktop. Il se monte lorsque le breakpoint mobile est réellement actif ; les actions restent les mêmes.
- Suppression d’un second parcours des historiques pour retrouver la date de dernière activité : réutilisation du maximum déjà calculé avec la même fonction. L’historique canonique et les données détaillées restent complets.
- `src/hooks/useDashboardTiming.js` : état de confirmation `clientProgress` distinct du chargement des modèles, y compris hors instrumentation. Aucun export de télémétrie.

Le backend et les dépendances ne sont pas modifiés par cette intervention. L’état antérieur est archivé dans `audits/coach-blocks/baseline/` ; le diff propre à cette intervention se trouve dans `audits/coach-blocks/changes.diff`.

## Option écartée pour préserver les coûts

Commencer les programmes avant la fin de l’annuaire aurait pu lire un ancien dossier ensuite éliminé par la déduplication d’identité. Cette approche n’est pas conservée. L’ordre des lots de 32, le cache partagé et le plafond réseau existants sont préservés. Aucun résumé persistant n’est ajouté : sa maintenance et sa parité métier nécessiteraient une qualification distincte.

## Mesures

Voir `BYL_DASHBOARD_COACH_BLOCS_MESURES.md` et les JSON bruts. Trois passages avant/après alternés, même SDK 12.13.0, même configuration compilée, vrais composants et routes, Auth/Firestore émulés et profils Chrome jetables. Les profils navigateur sont froids. Le premier scénario rencontre aussi un backend/émulateur fraîchement lancé ; les suivants réutilisent ce backend. Les volumes entre lignes ne sont donc pas un test isolé de proportionnalité.

| Fixture | Principal avant → après (médiane) | Retour chaud après |
|---|---:|---:|
| 36 clients, 10 validations/programme | 2,274 → 2,495 s | 0,265 s |
| 36 clients, 100 validations/programme | 1,872 → 1,935 s | 0,307 s |
| 100 clients, 10 validations/programme | 2,657 → 2,032 s | 0,276 s |

**La cible de moins de deux secondes n’est pas atteinte de manière générale.** Une amélioration est observée à 100 clients, mais le premier lancement à 36 clients régresse en médiane. Trois passages ne permettent pas d’attribuer précisément toute cette variation. Tous les passages sont conservés. Le contenu utile initial n’est ni le skeleton ni une garantie de progression complète. Le délai réel de vingt secondes signalé sur le compte utilisateur n’est pas reproduit ici.

Les lectures backend détaillées restent exactement 1 032 / 9 132 / 2 510 estimées selon la fixture. Appels SDK navigateur : 46 → 45 pour 36 clients, 110 → 109 pour 100. Écoutes actives : 6 → 5. Deux écritures navigateur existantes, aucune nouvelle écriture backend pendant la mesure. Le CPU JavaScript médian baisse sur les trois fixtures ; le transfert reste proche de l’identique. Le tableau complet expose aussi les variations de mémoire et des estimations navigateur.

Il s’agit de comptages instrumentés, pas d’une facture Firebase. Aucun budget de facturation réel Google n’est mesuré ou garanti. Le CPU/mémoire de l’instance déployée n’est pas remplacé par la mesure du heap navigateur.

## Vérifications

Les assertions du rapport vérifient la parité des clients, programmes, séances planifiées et effectuées, et le même nombre de lectures/documents/estimations dans la route détaillée. Elles refusent une augmentation des appels SDK ou des écritures. Les retours et rechargements doivent atteindre l’état prêt ; le reload doit créer une nouvelle origine temporelle.

Tests unitaires réussis : annuaire vide, 12/36/100/500/1 000 dossiers, refus des snapshots non confirmés, retrait et révocation, conservation de la pagination Clients ; chargement partagé et caches privés ; lots 32/32/32/4, réutilisation sans doublon, refus 401/403/400 sans fallback et repli 404/413 existant. Les volumes 500/1 000 de ce test sont simulés, pas des mesures navigateur.

Test intégré de modèles retardés de 3,5 secondes : résultat final consigné dans `audits/coach-blocks/tests.json`. Le premier essai a exposé un arrêt prématuré du banc après accalmie réseau, alors que `core` était encore en chargement. Il a été déclaré en échec ; sa sortie est conservée dans `delayed-incomplete-probe.json`. Le banc corrigé exige `core` prêt pour ce scénario et vérifie que `clientProgress` le précède nettement sans déclarer la page entière prête trop tôt.

Les suites de sécurité Coach, calendrier, P0-1/P0-2, les brouillons intégrés, smoke et build sont consignés individuellement dans `audits/coach-blocks/tests.json`. Le contrôle historique OCTIES de présence de l’écran de migration, déjà en échec lors de l’intervention précédente, n’est pas déclaré corrigé ni relancé pour prétendre une suite entièrement verte.

## Limites et suite du travail

Les fonctions de progression, de reprise, d’assignation, de calendrier et d’historique conservent leurs sources et calculs. La disponibilité indépendante est améliorée, mais les lectures intégrales d’historiques restent sur le chemin critique du chargement complet. Certaines routes secondaires du banc répondent 404 : ce banc ne qualifie pas exhaustivement chaque intégration ni un serveur distant. Les redimensionnements mobiles testent le responsive, pas tous les appareils réels.

La prochaine étape technique pour atteindre durablement la cible est de définir les données minimales exactes de chaque bloc, puis de comparer le coût complet d’un résumé maintenu aux lectures actuelles. Supprimer arbitrairement des historiques, afficher un compteur approximatif ou ajouter un cache privé persistant ne constitue pas une solution acceptable. Aucun de ces changements n’est réalisé ici.

Aucune publication autorisée ou effectuée. Les garanties de sécurité des lots précédents restent applicables.

## Résultats finaux des tests

Les huit tâches de `tests.json` réussissent : indépendance avec modèle retardé, Coach, calendrier, P0-1, P0-2, brouillons intégrés (20 contrôles), smoke (53 contrôles) et build/budgets. Les six séries avant/après réussissent également, avec parité vérifiée par `scripts/reportCoachBlocks.py`. Aucun échec applicatif nouveau identifié par ces suites ; la régression de temps à froid reste explicitement documentée.

Dans le test de bloc retardé, `clientProgress` est prêt à 1,230 s, les racines du calendrier à 0,831 s, les modèles à 3,977 s et le marqueur global à 3,978 s depuis le démarrage du document. Les 900 validations et 90 séances prévues restent exactes. Ce délai injecté démontre l’indépendance, pas une performance normale de production.

Les gardes empêchant l’amorçage d’un cache programmes non confirmé et retirant la confirmation après refus d’autorisation ont été ajoutées pendant la qualification. Le test retardé et les suites finales utilisent ces gardes ; les premiers passages normaux ont déjà leurs modèles disponibles avant le chargement détaillé et ne sollicitent pas la première garde. Les données brutes antérieures restent conservées.
