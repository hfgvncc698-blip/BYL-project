# BYL — Lot 3 · Workers et tâches automatiques

Référence avant correction : `31009aa`, sur `codex/firebase-performance-audit`. Les mesures utilisent des comptes et dossiers synthétiques sans navigateur connecté. Les seules consultations de production ont porté sur les métadonnées des services et du planificateur. Aucun déploiement ni lancement manuel d’une tâche distante.

## 1. Inventaire et niveau de preuve

| Traitement | Configuration et déclenchement | Vérification |
|---|---|---|
| API et cron PM2 | `backend/ecosystem.config.js` déclare `byl-api` et `byl-cron`, sans option de réplication. Le cron reçoit `CRON_ENABLED=true` et `TZ=Europe/Paris`. `deploy.sh` utilise cette configuration pour recharger PM2. L’API n’installe pas ce ticker. | Configuration du dépôt. La connexion SSH en lecture seule sur le VPS configuré a été refusée. Nombre de processus actifs, redémarrages et éventuels processus lancés hors PM2 inconnus. |
| Expiration des adhésions | Le cron tente une passe toutes les 60 s, avec exclusion locale des passages qui se chevauchent. Le processus autonome `membership-expiry.worker.js` lance aussi une passe au démarrage puis toutes les 60 s s’il est démarré séparément. | Le second processus ne figure pas dans la configuration PM2 du dépôt. Son exécution effective ailleurs reste inconnue. Les consultations interactives d’adhésion sont distinctes des mesures des workers. |
| File des cycles | La référence cherche jusqu’à 20 travaux dus toutes les 5 s. L’inscription, la progression d’un cycle et la Function de changement de plan alimentent la même collection. L’inscription peut aussi tenter le traitement immédiatement. | Sélection historique reproduite depuis Git. Worker corrigé démarré dans deux processus Node indépendants. |
| Fin des essais | Ticker d’une seconde, sélection au plus une fois dans chaque minute divisible par dix. Vérifie la date et l’absence d’abonnement Stripe. | Cet horaire dépend de l’exécution de `byl-cron`. |
| Programmes historiques à 30 jours | Sélection quotidienne des clients dont l’abonnement est actif, pendant les heures 09 et 10 en heure locale, avec décalage de 0 à 60 minutes. Seuls les dossiers historiques éligibles peuvent recevoir un programme à 30 jours d’intervalle. Les cycles modernes et livraisons sur facture sont exclus. | Chemin toujours configuré. Le nombre de clients encore concernés en production est inconnu. |
| `runLifecycleEmailJobs` | Function Firebase de deuxième génération, en `europe-west1`. Trois sélections quotidiennes : essais, rappels de fin de programme, rappels d’inactivité, chacune limitée à 500 documents. | L’inventaire distant confirme la Function. Cloud Scheduler indique `ENABLED`, `every day 09:00`, `Europe/Paris`. Dernière tentative au relevé : 9 novembre 2026 à 08:00:34 UTC. Cette métadonnée n’établit ni le nombre d’e-mails envoyés ni leur coût. |
| Autres Functions | Les changements de plan et les validations de séances sont des événements Firestore. Les handlers de création de programme, de changement d’abonnement et de notification dépendent aussi d’événements. Les routes HTTP dépendent de requêtes entrantes. | Un seul export planifié trouvé dans le code et dans l’inventaire des Functions de ce projet. Un seul job Scheduler dans la région consultée. Un changement produit par un worker peut déclencher une Function sans navigateur. |

## 2. Causes des lectures

L’expiration lisait tous les clubs puis tous leurs dossiers privés avant de regarder la date de sortie. Les sélections se répétaient même en l’absence d’échéance. Deux workers multipliaient ce coût. La file de cycles utilisait une requête temporisée indépendante des arrivées et des baux. Le contrôle des essais relisait tous les utilisateurs en essai, y compris ceux dont l’échéance était lointaine.

La Function quotidienne retrouvait également des programmes dont l’envoi était déjà confirmé. Le marqueur empêchait un deuxième envoi mais le champ d’échéance continuait d’alimenter l’index. Des programmes terminés pouvaient ainsi occuper une partie des 500 places à chaque passage.

## 3. Corrections appliquées

**Adhésions.** Une requête de groupe sur `privateClients.exitDate` sélectionne les dates non vides strictement antérieures au jour courant à Paris. Elle ne demande que la date et parcourt des pages de 200 avec un curseur stable même lorsque les dates sont identiques. Le chemin et l’existence du club sont vérifiés pour préserver le comportement sur les sous-collections orphelines. Deux balayages qui trouvent un candidat encore membre se départagent sur un seul bail temporaire, `worker_leases/membership_expiry`, avec précondition de version et heure Firestore. Il est renouvelable après 25 s et récupérable après 45 s si le propriétaire disparaît. Un passage sans candidat encore lié ne consulte pas ce document. La transaction de sortie relit tous les dossiers liés, les politiques actuelles et les réservations. Une échéance repoussée bloque donc la sortie. Si l’index de groupe est indisponible, le worker utilise les requêtes de dates par club, signale le repli et retente la requête de groupe au passage suivant.

**Cycles.** Chaque processus partage une seule écoute de la première tâche en attente, triée par fin de bail. Une nouvelle tête provoque un réveil, une tête future programme un minuteur. Le worker sélectionne ensuite au plus 20 tâches effectivement dues et vérifie l’état dans la transaction métier. Un contrôle toutes les 60 s rattrape un flux silencieux. Une erreur terminale d’écoute rétablit les tentatives toutes les 5 s pendant la reconnexion. L’écoute ne crée aucun document et n’ajoute aucune écriture chez les producteurs. La réservation compare la version du document sélectionné avant d’ouvrir la transaction métier, ce qui évite que deux processus bloquent simultanément le dossier client. Le traitement refuse une tâche supprimée ou annulée et vérifie le statut, le jeton et la valeur du bail avant de publier ou de réarmer un travail. Un cycle sans suite applicable devient inactif. Une durée invalide est différée de 30 s pour laisser passer les autres tâches.

**Essais et programmes à 30 jours.** Pour zéro à huit essais, le worker conserve une seule sélection initiale. Pour neuf ou plus, il interroge les deux champs historiques, sous leurs formes Timestamp et millisecondes, avec une projection limitée aux champs nécessaires. La transaction de clôture relit la date et le rattachement Stripe. Si un index n’est pas prêt, la sélection historique assure la continuité. Pour la génération mensuelle, l’étape coûteuse prépare le programme. Une écriture atomique crée le programme et avance le dossier sous précondition de version. Si le dossier a changé, le worker relit le contrat et la rotation avant toute nouvelle tentative. Elle utilise l’horodatage du SDK qui écrit le document. Une deuxième instance ou un redémarrage ne peut laisser un programme commité sans l’avancement correspondant.

**Planificateur d’e-mails.** La réservation d’un envoi de programme vérifie maintenant que l’échéance sélectionnée est encore la même. Un envoi déjà confirmé sort de la sélection périodique. Sa date d’origine est conservée dans `lifecycleEmails.*ScheduledFor`, avec son marqueur d’envoi intact. L’écriture exige la version exacte du document lu. Deux échéances déjà traitées du même programme sont retirées ensemble si elles sont dues, avec au plus 20 nettoyages concurrents. Une annulation ou un échec d’envoi seul ne suffit pas à déclencher ce nettoyage.

**Fichiers.** Les changements d’exécution sont dans `backend/cron.worker.js`, `backend/membership-expiry.worker.js`, `backend/utils/clubMemberships.js`, `backend/utils/subscriptionCycles.js`, les nouveaux fichiers `membershipExpiryLease.js`, `subscriptionCycleWorker.js`, `legacyCronSubscriptions.js` et `workerFirestoreError.js`, `functions/index.js`, `functions/lifecycleSchedule.js` et `firestore.indexes.json`. Les adaptations du banc Lot 1, du test d’adhésion et du contrôle statique SMTP suivent les nouveaux points d’entrée. Les nouveaux bancs sont `scripts/testWorkersLot3.cjs`, `scripts/testWorkerSchedulerLot3.cjs` et leurs fixtures. Le test historique d’adhésion fournit désormais le responsable synthétique du second club nécessaire pour exercer les deux contacts autorisés.

## 4. Mesures avant et après

Le banc utilise les méthodes métier du commit de référence et de la branche corrigée, le SDK autonome du worker avec `preferRest`, des émulateurs locaux et des processus enfants. La fixture de 12 dossiers est celle du Lot 1. La grande fixture répartit 4 000 dossiers entre 20 clubs, avec dates absentes, vides ou futures. Deux dates deviennent ensuite échues. Les lectures de contrôle du banc, la préparation des données et les écritures de la fixture sont exclues des compteurs métier.

Une opération SDK correspond à une lecture explicite ou à l’attachement initial d’une écoute. Les documents retournés comptent les résultats présents et les changements observés. L’estimation applique notamment un minimum d’une lecture à une requête vide. Le coût des entrées d’index, des reconnexions et des dépendances réelles n’est pas extrait d’une facture. Les RSS sont des observations de processus, en Mio. Les millisecondes proviennent d’un passage local, sans garantie de percentile. [Tarification Firestore](https://firebase.google.com/docs/firestore/pricing) · [Index Firestore](https://firebase.google.com/docs/firestore/query-data/index-overview)

### Expirations

Chaque paire indique la référence puis la correction. Chaque ligne correspond à une passe complète. Pour la mesure mémoire, chaque version a démarré dans un processus neuf, avec collecte possible entre les scénarios.

| Fixture et état | Lectures SDK | Documents | Estimation | Écritures confirmées | Durée, ms | RSS en fin de passe |
|---|---:|---:|---:|---:|---:|---:|
| 12 · aucune sortie due | 2 → 1 | 13 → 0 | 13 → 1 | 0 → 0 | 114 → 34 | 130 → 123 |
| 4000 · aucune sortie due | 21 → 1 | 4020 → 0 | 4020 → 1 | 0 → 0 | 458 → 25 | 166 → 152 |
| 4000 · deux sorties dues | 43 → 26 | 4026 → 10 | 4042 → 27 | 4 → 6 | 498 → 138 | 168 → 153 |
| 4000 · passage après archivage | 23 → 5 | 4022 → 6 | 4022 → 6 | 0 → 0 | 343 → 43 | 170 → 153 |

### Contrôle des essais

Deux utilisateurs sont clôturés dans chaque fixture non vide. Les contrôles préservent la priorité de la date principale, la protection Stripe et les deux formats historiques.

| Utilisateurs en essai | Lectures SDK | Documents | Estimation | Clôtures | Durée, ms |
|---:|---:|---:|---:|---:|---:|
| 0 | 1 → 1 | 0 → 0 | 1 → 1 | 0 → 0 | 5 → 6 |
| 6 | 1 → 3 | 6 → 8 | 6 → 8 | 2 → 2 | 11 → 21 |
| 3000 | 1 → 7 | 3000 → 15 | 3000 → 16 | 2 → 2 | 151 → 122 |

### File vide et réception d’une tâche

Fenêtre réelle de 62 s avec deux processus indépendants, dont les lancements sont espacés de 350 ms dans les deux versions. Les deux contributions sont présentées séparément.

| Processus | Sélections de file | Écoutes attachées | Opérations SDK | Documents | Estimation | Écritures | RSS |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 13 → 1 | 0 → 1 | 13 → 2 | 0 → 0 | 13 → 2 | 0 → 0 | 80 → 105 |
| 2 | 13 → 1 | 0 → 1 | 13 → 2 | 0 → 0 | 13 → 2 | 0 → 0 | 81 → 106 |

Pour un travail ajouté à cette file, le délai va de l’écriture demandée par le producteur à l’observation du programme par le banc. Les chiffres agrègent les deux workers et excluent l’écriture d’entrée du producteur.

| Tâche avec concurrence | Sélections | Opérations SDK | Documents | Estimation | Écritures confirmées | Délai, ms |
|---|---:|---:|---:|---:|---:|---:|
| Une livraison | 2 → 2 | 7 → 7 | 5 → 12 | 7 → 13 | 4 → 4 | 2778 → 122 |

Sur cette livraison, les lectures estimées ont augmenté de 7 à 13, pour quatre écritures métier dans les deux versions. Au repos, les deux processus totalisent 26 lectures estimées avant et 4 après. Les RSS observées augmentent de 25 Mio par processus avec l’écoute active.

La reconnexion après rupture du relais TCP a livré le programme en 2342 ms après réouverture du réseau. Une échéance repoussée puis avancée a été traitée en 112 ms après son avancement. Après arrêt forcé, le rattrapage a été observé 90 ms après la fin du bail réel. Le test de non-régression vérifie aussi le repli sur sélection après une erreur terminale de l’écoute.

### Function quotidienne

Soixante programmes synthétiques portent chacun deux anciens envois confirmés. Trois requêtes de sélection sont exécutées dans chaque version. Au premier passage corrigé, les deux échéances d’un programme sont archivées par une seule mise à jour conditionnelle. Au deuxième passage, ces programmes ne sont plus retournés. Les colonnes SDK, documents et estimation de ce tableau couvrent les sélections du planificateur.

| Passage | SDK | Documents | Estimation | Écritures de nettoyage | Durée, ms |
|---|---:|---:|---:|---:|---:|
| 1 | 3 → 3 | 120 → 60 | 121 → 62 | 0 → 60 | 250 → 185 |
| 2 | 3 → 3 | 120 → 0 | 121 → 3 | 0 → 0 | 34 → 17 |

Limiter la requête à une tâche en tête de file économise les interrogations à vide. Un changement de tête ou de bail peut, en revanche, ajouter un événement et une nouvelle sélection. Le bail global utilise un document temporaire réservé au backend. Les index d’échéances n’ajoutent aucun document par dossier ni par cycle. Ils ajoutent des entrées d’index pour les champs concernés. L’archivage des dates d’e-mail est le coût d’écriture ponctuel mesuré ci-dessus.

## 5. Tests de fiabilité et reproduction

- Dans un premier essai sur la référence avec des démarrages synchronisés, la livraison a dépassé le délai d’observation de 30 s. Le comparatif ci-dessus utilise le même décalage de lancement de 350 ms avant et après. Un essai distinct soumet simultanément la même version de tâche à deux prises de bail et vérifie une seule génération. Deux processus indépendants ont observé la même tâche. Le banc vérifie une seule génération et un seul programme enregistré. Une réexécution concurrente du parcours mensuel enregistre un seul programme. Une résiliation qui intervient pendant la génération empêche l’affectation.
- Un processus a été tué par SIGKILL après la prise du bail et avant la publication. Son remplaçant a respecté le bail réel de 120 s, puis a repris la tâche sans intervention sur le document. Une coupure TCP locale a interrompu l’accès du worker à l’émulateur ; le travail ajouté pendant la coupure a été rattrapé à la reconnexion.
- Une tâche repoussée n’a pas été exécutée à son ancienne échéance. La ramener à une échéance immédiate a réveillé le worker. Une tâche invalide est différée, une panne terminale de l’écoute déclenche la sélection de secours et une annulation pendant la génération a conservé l’état annulé sans créer de programme. Les tests historiques de cycles couvrent également la modification du plan, le renouvellement et la réactivation.
- Le test d’expiration vérifie la milliseconde précédant minuit puis minuit à Paris pour les fins de contrat des 28 et 29 mars, 24 et 25 octobre 2026. Il vérifie aussi deux exécuteurs simultanés, les appartenances multiclubs, la réactivation, un report de date entre la sélection et la transaction, les sous-collections orphelines, la pagination à dates identiques et le repli sur index manquant. Un bail d’expiration encore valide empêche le deuxième balayage, puis son expiration permet le rattrapage. Le test métier existant contrôle aussi la file d’attente des cours collectifs, les archives et la préservation de l’historique.
- Sur l’émulateur, deux invocations simultanées du planificateur n’ont produit qu’un envoi sur le transport SMTP simulé. Un e-mail annulé et une date repoussée sont restés protégés. Un nettoyage avec une version périmée n’a pas effacé la nouvelle échéance. La fixture vide du Lot 1 a renvoyé trois sélections vides et aucun envoi.
- Les tests de cycles d’abonnement, d’adhésions, les deux tests de contrat des Functions et les 53 contrôles globaux ont été rejoués. Les tests de règles et les parcours des Dashboards ne sont pas des mesures de ce lot.

Depuis la racine de la branche, avec les dépendances du projet, Java 21 et Firebase CLI, exécuter séparément ces commandes. Les bancs remplacent uniquement les données des émulateurs de démonstration dédiés.

```sh
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
firebase emulators:exec --config firebase.performance-test.json --project demo-byl-performance --only auth,firestore 'node scripts/testWorkersLot3.cjs'
firebase emulators:exec --config firebase.performance-test.json --project demo-byl-performance --only auth,firestore 'node --expose-gc scripts/testWorkersLot3.cjs expiry-before && node --expose-gc scripts/testWorkersLot3.cjs expiry-after'
firebase emulators:exec --config firebase.performance-test.json --project demo-byl-performance --only auth,firestore 'node scripts/testWorkerSchedulerLot3.cjs before && node scripts/testWorkerSchedulerLot3.cjs after && node scripts/measureFirebaseLot1.cjs --current'
firebase emulators:exec --config firebase.rules-test.json --project demo-byl-security --only firestore 'node scripts/testSubscriptionCycles.cjs'
node scripts/testClubMemberships.cjs
npm --prefix functions test
npm run test:smoke
```

## 6. Risques résiduels

- Les sorties passées sont conservées. Un dossier déjà archivé dont la date reste échue est encore candidat au prochain passage. Si presque toutes les dates du club sont historiques, la sélection garde un coût proportionnel à cet historique. Les dossiers sans date et les échéances futures ne sont plus parcourus par le scan global. Une passe avec une sortie réelle acquiert puis libère le bail, soit deux écritures techniques supplémentaires dans le cas simple. Si l’arrêt survient pendant ce bail, le passage suivant peut le reprendre après son échéance. Le repli sur requêtes par club relit la liste des clubs et doit déclencher une vérification des index s’il persiste. Une transaction de sortie réelle continue de lire les cours collectifs nécessaires au retrait des réservations. La limite de sécurité sur les grandes transactions reste en place.
- Chaque processus possède sa propre écoute de file et sa requête de rattrapage. Une file constamment alimentée peut coûter davantage en événements, sélections et contentions qu’une file vide. Les écritures de bail, les index préexistants et la durée de génération subsistent. Un bail expiré peut entraîner un second calcul préparatoire ; seule la transaction valide peut publier le résultat.
- La fermeture des essais peut lire une seconde fois un petit nombre de candidats pour vérifier la situation à l’instant de la mutation. La génération mensuelle parcourt encore les abonnements actifs une fois dans sa fenêtre locale. Un arrêt couvrant cette fenêtre peut reporter ce traitement au prochain passage quotidien. Les anciennes échéances SMTP encore annulées, ambiguës ou sans destinataire éligible restent soumises aux sélections existantes et à leur plafond de 500.
- SMTP et Firestore ne partagent pas de transaction. Un arrêt après la réservation d’un envoi mais avant la confirmation durable laisse un état à rapprocher des journaux d’envoi. Un rejeu aveugle risquerait un doublon. Les essais locaux valident la réservation et la concurrence ; ils ne prouvent pas la livraison en boîte réelle.
- Les volumes de production, les autres machines éventuelles, le nombre de workers PM2 actifs et la facturation ne sont pas établis. Les métriques des émulateurs ne comprennent pas tous les retries de transport, les entrées d’index facturées, le trafic, ni les Functions en aval potentiellement déclenchées par une écriture.

## 7. Préconisations avant déploiement

Maintenir l’interdiction de production. En préproduction autorisée, vérifier l’état des trois nouveaux index (groupe sur la date de sortie et deux index d’essais), ainsi que l’index existant de la file. Vérifier l’état PM2 effectif et si le worker dédié est aussi lancé. Tester une reprise avec un stock représentatif d’archives et de tâches en retard. Comparer les lectures et écritures mesurées par Cloud Monitoring et Cloud Billing sur des périodes équivalentes sans utilisateurs, avec le nombre d’instances, la distribution des retards, les erreurs de repli et la mémoire. Vérifier également que le VPS accepte le transport gRPC de l’écoute et que le repli à cinq secondes permet de traiter la file si ce transport est indisponible. Les valeurs locales ne remplacent pas cette qualification. Les conditions de publication du Lot 2B.2 restent applicables.

## 8. Dashboards et calendriers

Pour un prochain lot validé, reprendre les scénarios navigateur du Lot 1 et isoler le trafic des tâches automatiques. Mesurer séparément ouverture, repos, navigation entre vues et modification distante avec un puis deux onglets. Comparer les documents par requête à périmètre et fenêtre de dates identiques avant de modifier un cache ou un calendrier. Aucun travail fonctionnel sur ces parcours n’a été engagé.
