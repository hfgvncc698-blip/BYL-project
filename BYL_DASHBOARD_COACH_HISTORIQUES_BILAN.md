# Dashboard Coach — programmes détaillés et historiques

Branche `codex/firebase-performance-audit`. Aucun déploiement, changement de règles, migration, résumé persistant ou purge. Les corrections d’admission et de confidentialité précédentes sont conservées.

## Cause confirmée dans l’environnement local

L’API effectuait les lectures des programmes et historiques d’un lot de 32 dossiers, sérialisait le résultat, puis renvoyait 413 au-delà de 4 Mio de JSON. Le navigateur relisait alors ces mêmes collections via le SDK Firestore. Une réponse 413 n’économisait donc pas les lectures déjà exécutées côté serveur.

Le chronométrage local avant correction confirme deux appels détaillés, un succès et un 413, suivis du repli SDK pour 32 dossiers. Le principal devient prêt à 20,123 s. Cette observation complète le diagnostic précédent ; elle ne repose pas sur une estimation du volume à partir du seul nombre de clients.

## Correction intégrée, sans perte de contenu

Le navigateur négocie `transferVersion: 2` sur la route détaillée existante. Le serveur peut alors transmettre la réponse complète en gzip sous deux limites explicites : 32 Mio compressés et 64 Mio de JSON décompressé. Les anciens clients conservent leur limite de 4 Mio. Sans gzip négocié, le plafond de 4 Mio est conservé. La limite de 32 dossiers par requête et les trois requêtes concurrentes restent inchangées.

**Le plafond du nouveau mode a donc été augmenté de façon bornée ; il n’est pas présenté comme un plafond de 4 Mio inchangé.** Cette taille remplace la relecture directe, déjà capable de charger ces gros programmes. Les réponses dépassant encore ces plafonds gardent le refus 413 et le repli existant. Aucun résultat n’est tronqué ou présenté comme complet à tort.

La compression est sans perte : aucun champ d’exercice, prescription, historique, difficulté, reprise, ancien format ou donnée inconnue n’est supprimé. Le codec Firestore existant et l’ordre des documents restent les mêmes. Les fonctionnalités du Dashboard qui réutilisent les programmes complets, notamment les ajustements de séances, conservent leurs données.

Les vérifications Auth, révocation, rôle, abonnement, propriété et transactions sont exécutées avant la construction de la réponse, comme auparavant. Aucun cache ne devient une autorité d’accès. `Cache-Control: private, no-store` et `Vary: Accept-Encoding` sont conservés.

L’instrumentation locale `dashboardPerf` expose uniquement des nombres de requêtes, statuts, durées et nombres de dossiers concernés par un repli. Elle ne conserve ni corps de programme, identifiant client, token ou contenu personnel, et n’ajoute aucune requête Firestore.

## Résultat réel, avec le même Dashboard

| Version | Chargement principal | Appels réussis / détaillés | Réponses 413 | Dossiers relus par SDK |
|---|---:|---:|---:|---:|
| Avant | 20,123 s | 1 / 2 | 1 | 32 |
| Essai intermédiaire, plafond gzip 4 Mio | 23,471 s | 1 / 2 | 1 | 32 |
| Version finale, premier rechargement | 16,032 s | 2 / 2 | 0 | 0 |
| Version finale, second rechargement | 15,736 s | 2 / 2 | 0 | 0 |

Le gain observé final est d’environ **20 à 22 %**, soit 4,1 à 4,4 secondes. Les compteurs restent identiques : 36 clients, 57 modèles, 422 validations, 258 séances prévues et 274 événements dans le résultat réconcilié. Ces nombres sont des contrôles de parité, pas le contenu des dossiers.

L’état applicatif sérialisé reste de 32 175 207 caractères : les données n’ont pas été amputées pour gagner du temps. Ce chiffre n’est pas une mesure des octets HTTP. Les mesures locales sont un passage avant et deux après, sans percentile terrain ni garantie générale. L’API a été redémarrée avant les mesures après ; le frontend n’a pas été redémarré pour éviter de confondre ce changement avec un démarrage Vite à froid.

**La cible de deux secondes n’est toujours pas atteinte dans l’environnement connecté.** La relecture inutile est supprimée, mais les appels backend restent longs. Leur durée englobe admission, lectures, sérialisation/compression et transfert ; elle ne permet pas à elle seule d’attribuer tout le temps restant à Firestore.

## Comparaison synthétique reproductible

Voir `BYL_DASHBOARD_COACH_HISTORIQUES_MESURES.md`. Trois passages avant et trois passages finaux après, émulateurs Auth/Firestore, profils Chrome jetables, vraie application compilée et prescriptions synthétiques riches.

- Principal confirmé médian : 3,084 → 1,647 s.
- Opérations SDK navigateur : 159 → 45.
- Lectures documentaires navigateur estimées médianes : 1 013 → 114.
- Backend détaillé : toujours 134 opérations SDK, 1 028 documents retournés et 1 032 lectures estimées.
- Appels détaillés : toujours deux.
- Écritures : inchangées, deux navigateur existantes et zéro backend pendant la mesure.
- Retour chaud médian : 301 → 298 ms.

La baisse vient de la suppression des doubles lectures, pas d’un déplacement des lectures vers le backend. Aucun nouveau service, écouteur, polling, index ou document de synthèse.

Les comptages ne constituent pas une facture Firebase. Le trafic réseau total n’est pas mesuré intégralement : le banc observe les ressources terminées et ne compte pas entièrement les canaux Firestore persistants. Comparer uniquement les octets API serait trompeur, puisque les réponses 413 ne transportaient presque rien avant les relectures SDK. La compression des gros lots ajoute du travail CPU au serveur ; aucune modification de capacité ni de service Google n’a été effectuée, et le coût réel d’une instance déployée n’est pas qualifié ici.

## Tests

Réussis :

- Restitution exacte du JSON après gzip, y compris Unicode, prescriptions, historique et champs anciens/inconnus.
- Charge peu compressible de plus de 4 Mio : acceptation en v2, contenu complet, refus ancien mode.
- Rejet au-delà de 64 Mio décompressés et au-delà de 32 Mio compressés.
- Client ne négociant pas gzip : conservation du plafond ancien.
- Grande réponse API : mêmes documents et mêmes lectures que la réponse ancienne rejetée, parité de chaque champ synthétique testé.
- Propriété des dossiers, acteur étranger, rôles désactivés, réactivation, limites 32/33, P0-1/P0-2.
- Repli 404/413 existant, absence de repli sur 401/403/400, déduplication des lots.
- Chargement partiel autorisé et cache privé, 53 contrôles smoke, build et budgets.

Le smoke initial échouait sur une assertion textuelle exigeant trois arguments exactement à `loadProgramBatches`. Le quatrième argument est l’observation locale optionnelle. Seule l’assertion a été adaptée ; l’affichage anticipé n’a pas été supprimé pour satisfaire le test. L’échec initial reste conservé dans `checks.json` et `smoke.log`, les validations finales dans `final-checks.json`.

L’essai avec plafond gzip de 4 Mio passait sur les données répétitives synthétiques mais échouait encore dans l’environnement connecté. Il est conservé comme résultat intermédiaire, pas présenté comme une correction réelle réussie. Les trois passages après ont été rejoués avec les plafonds finaux.

## Fichiers et reproduction

Application :

- `src/utils/coachProgramBatch.js` : négociation du transport et observation locale agrégée.
- `src/components/CoachDashboard.jsx` : chronométrage des réponses et replis.
- `backend/routes/coachProgramRead.js` : sélection du transport après les contrôles existants.
- `backend/utils/coachDashboardTransport.js` : compression sans perte et limites explicites.

Qualification : `scripts/testCoachDashboardTransport.cjs`, `scripts/testCoachBatchesLot8B.cjs`, `scripts/runCoachHistoryTransfer.cjs`, `scripts/reportCoachHistoryTransfer.py`, assertion smoke et listes de dépendances des bancs isolés. Les autres changements préexistants de l’espace de travail sont préservés.

Mesures synthétiques : `node scripts/runCoachHistoryTransfer.cjs before 1 build` puis `after 1 build`, avec Java disponible pour les émulateurs ; répétitions 1 à 3. Le banc crée ses propres copies et profils jetables. `node scripts/testCoachDashboardTransport.cjs` vérifie le contrat de transport sans Firebase. `python3 scripts/reportCoachHistoryTransfer.py` contrôle les parités et produit le tableau.

## Limites et suite

Les lots qui dépassent encore les plafonds peuvent toujours subir un repli et des lectures redondantes. Aucun résumé persistant ni chargement partiel risquant d’altérer les opérations métier n’a été introduit. Réduire les 15–16 secondes restantes exige de mesurer les étapes internes de l’API et d’identifier les données réellement nécessaires par bloc, avec une stratégie sûre pour les actions utilisant les programmes complets.

L’API locale a été rechargée, aucun worker lancé et aucun déploiement effectué. L’avertissement sur le canal de révision indisponible reste volontaire. P0-3/P0-4 et les limites de révocation précédentes ne sont pas déclarés résolus.
