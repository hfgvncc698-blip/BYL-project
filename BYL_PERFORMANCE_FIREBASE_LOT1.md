# BYL — Lot 1, instrumentation et mesures

**9 novembre 2026 · branche `codex/firebase-performance-audit` · base applicative `02ad24f87b782e0591dd5dbc28f348f61ecb7811`.**

## Résultat pour la décision

Deux contributions du commit du 18 octobre sont reproductibles sur fixture.

- **Offres du coach.** Sur écran large et pour un coach sans contrat, le parent ne demande aucune offre. Au commit du 18 octobre, ouvrir la même page a déclenché 12 appels aux offres et retourné 444 documents Firestore côté API. Sur la version actuelle instrumentée, un passage a produit 23 appels et 851 documents. Au repos pendant 62 secondes, le commit et la version actuelle produisent chacun 2 appels et 74 documents. Le volume à l’ouverture varie avec les montages et le chevauchement temporel des requêtes.
- **Messagerie du club.** En 22 secondes sans intervention du propriétaire, les composants du badge et de la bulle passent de 2 appels contacts et 32 documents retournés sur le parent à 5 appels et 83 documents sur le commit. Le changement de condition de montage de la bulle dans App suffit à reproduire ce surcroît.
- **Lectures antérieures au commit.** Sur les trois révisions, le retour aux Clients relit 48 documents via les appels SDK par défaut. Une modification distante d’une seule séance déclenche 30 appels SDK par défaut du coach. Les 72 documents retournés comprennent les programmes et historiques des douze clients. Le passage d’expiration du worker parcourt les 13 documents de clubs et dossiers privés de la fixture sans navigateur.

Ces comptes établissent un effet causal sur les scénarios locaux. La durée réelle des ouvertures, la taille des collections et la révision effectivement déployée en octobre restent inconnues. Les 23 602 147 lectures et les 37,41 GiB communiqués dans l’audit initial ne peuvent pas être répartis entre ces postes à partir de ce test.

## Comment ont été prises les mesures

| Couche | Unité | Traitement |
|---|---|---|
| Composant navigateur | Demande de rafraîchissement | Comptée avant la coordination des appels d’offres. |
| Transport HTTP | Requête réellement lancée, requête reçue, statut, temps côté serveur, octets de corps déclarés si disponibles | Le coordinateur existant signale les promesses rejointes. Les en-têtes, URL dynamiques, paramètres et contenus restent exclus des métriques. La taille du corps HTTP est distincte du transfert effectué par Firestore. |
| SDK navigateur | Appels par défaut et cache forcé, snapshots et erreurs | Compte les documents visibles, la source cache, les écritures en attente, le premier snapshot, les ajouts/modifications/retraits et le rattachement/détachement. Un résultat de listener de taille 12 peut contenir un seul changement. |
| SDK serveur | Gets de document, requêtes, agrégations, getAll, transactions et tentatives | Contexte séparé par requête ou job. Une délégation interne du SDK à getAll ne double pas le compteur. Les documents absents sont exclus des documents retournés. |
| Estimation | Composante documentaire des lectures **réussies** | Modèle conventionnel pour ces fixtures : au moins une unité par get serveur ou requête ordinaire, une par référence de getAll, zéro pour une réponse locale. Agrégations, échecs, lectures des règles, entrées d’index et listeners restent hors estimation. Les opérations non estimées sont distinctes. |
| Facturation réelle | Quantité et coût du SKU de facturation, périmètre et période | `actualBilledReads: null` pour tous les essais. Un essai sur émulateur ne fournit pas de quantité facturée. |

Les compteurs navigateur sont en mémoire et réinitialisables. Les compteurs backend produisent une ligne de nombres et libellés prédéfinis par requête ou job observé, avec un identifiant aléatoire propre à la mesure. Le collecteur ne stocke aucun identifiant de personne, de club, de document, aucun token, aucun contenu ou message d’erreur brut. Les références SDK ne sont jamais sérialisées. L’instrumentation n’exporte rien à un collecteur distant et ne fait aucune lecture ou écriture Firestore pour compter.

## Environnement et périmètre

- Révisions comparées : parent `8d8841573f8d24b28f2041b7eed83ed11d3042ca`, commit `61abede5ba6fd15e7f59de0a1254d1011285a45d`, base actuelle ci-dessus avec l’instrumentation du lot 1. Les arbres historiques et profils Chrome sont temporaires. Les trois essais utilisent les mêmes dépendances installées et les mêmes règles actuelles pour isoler l’effet des sources applicatives.
- Node 25.8.1, Chrome 156.0.8078.80 en mode headless, Firebase CLI 15.13.0, OpenJDK 21, Firebase Web 12.12.0. Auth et Firestore tournent sur loopback dans `demo-byl-performance`. La suite de règles utilise séparément `demo-byl-security`.
- Fixture recréée pour chaque révision : un propriétaire, un coach actif sans offre, un administrateur, un club, 12 clients, 12 dossiers privés, 12 programmes attribués avec un historique chacun et 12 séances portant toutes les trois clés coach historiques. Analytics contient 12 documents horaires et un document journalier. La file de cycles et les conversations sont vides.
- Le banc monte les vrais composants Clients et CoachDashboard sous React, Chakra et React Router, avec un contexte de rôle synthétique, une vraie identité de l’émulateur Auth et les règles Firestore. Il monte séparément le badge du club et la bulle selon la condition de la révision d’App. Les routes prioritaires sont les vrais handlers Express. Les autres routes sont hors banc. Les connexions externes de la page sont bloquées. Le déroulé mesure les composants et services ciblés, et exclut notamment le démarrage du shell complet et l’authentification utilisateur.
- La première visite désigne la première ouverture **de la page** dans le profil de la révision. Clients précède Coach et peut avoir déjà alimenté Firestore localement. La seconde visite remonte le composant dans le même profil. Les fenêtres ci-dessous couvrent le montage jusqu’à la détection de l’état prêt, plus 500 ms, puis un intervalle de repos distinct de 62 s.

## Comparaison par scénario

Dans le tableau suivant, chaque triplet correspond aux **requêtes HTTP / opérations SDK serveur / documents Firestore retournés** dans la fenêtre. Les appels directs du navigateur sont détaillés séparément.

| Scénario, écran de 1 440 px | Parent | 18 octobre | Actuel |
|---|---:|---:|---:|
| Offres, première ouverture coach | 0 / 0 / 0 | 12 / 60 / 444 | 23 / 115 / 851 |
| Offres, retour au coach | 0 / 0 / 0 | 13 / 65 / 481 | 26 / 130 / 962 |
| Offres, repos de 62 s | 0 / 0 / 0 | 2 / 10 / 74 | 2 / 10 / 74 |
| Offres, 3,2 s après modification distante de séance | 0 / 0 / 0 | 7 / 35 / 259 | 19 / 95 / 703 |
| Contacts du club, badge et bulle pendant 22 s | 2 / 38 / 32 | 5 / 98 / 83 | 5 / 98 / 83 |
| Modèles coach, retour au coach | 1 / 2 / 1 | 1 / 2 / 1 | 1 / 2 / 1 |

**Pourquoi la lecture des offres est élevée.** Pour un appel réussi, le serveur lit le profil et le document d’offres, absent dans cette fixture, puis effectue trois requêtes de séances sans borne de période. Il fusionne les résultats après lecture. Les 12 séances donnent 36 résultats auxquels s’ajoute le profil. Sur la version actuelle, la première ouverture a généré 212 demandes de rafraîchissement des composants. Le coordinateur en a joint 189, laissant 23 requêtes HTTP. Au repos, 8 demandes en ont donné 2. La carte « Aujourd’hui » utilise plusieurs instances dans la disposition large. La définition locale de PriorityCard est aussi un candidat à des remontages lors des rendus du parent. Les compteurs démontrent la rafale, ils n’attribuent pas chaque remontage à une ligne React précise.

Pendant le repos, le serveur a renvoyé des réponses HTTP 304 aux appels d’offres, après avoir interrogé Firestore. Un 304 sans corps peut donc accompagner 37 documents retournés côté serveur. Le détail d’un appel direct sans cache HTTP donnait un corps JSON de 85 octets pour ces mêmes 37 documents. Les montages responsives comptent : lors d’un premier essai avec la largeur Chrome par défaut, la carte desktop n’était pas montée et le dashboard n’a effectué aucun appel aux offres pendant la même fenêtre de repos.

**Mesures du navigateur.** Les volumes ci-dessous sont identiques sur les trois révisions dans cette comparaison. Les appels par défaut comprennent les tentatives échouées, et les documents comprennent uniquement les résultats réussis.

| Scénario | Appels SDK par défaut | Documents retournés | Composante estimée* | Détail |
|---|---:|---:|---:|---|
| Clients, première visite ou retour | 39 | 48 | 60 | 3 requêtes clients, dont une refusée. 12 lectures de listes de programmes, 12 d’historiques et 12 de listes nutrition vides. |
| Coach, première visite ou retour | 33 | 74 | 75 | Deux refus de requête. 24 résultats clients, 24 résultats séances, 12 programmes, 12 historiques et deux résultats utilisateurs. |
| Coach, modification distante de séance | 30 | 72 | 72 | 3 requêtes clients, 3 requêtes séances, 12 listes de programmes et 12 historiques. Deux requêtes sont refusées. |

\* Exclut dépendances des règles, index, refus et listeners. Les erreurs faisaient déjà partie des parcours sur le parent. Les tests ont conservé les règles. Le fait que la page atteigne « prêt » après un fallback ne certifie pas le succès de chaque requête.

Au retour sur Coach, les callbacks initiaux des listeners ont remis 36 documents visibles en trois snapshots dans cet essai, tous signalés comme provenant du cache. Après modification d’un seul document sur l’émulateur, deux snapshots présentaient 24 documents visibles au total. La taille de ces snapshots n’est pas comptabilisée comme lectures facturables.

### Activité sans navigateur et mesures unitaires serveur

| Déclencheur | HTTP | Opérations SDK | Documents | Estimation documentaire | Facturation réelle |
|---|---:|---:|---:|---:|---|
| Offres, appel direct au 18 octobre et sur la version actuelle | 1 | 5 | 37 | 38 | Indisponible |
| Contacts propriétaire, club explicite | 1 | 19 | 16 | 30 | Indisponible |
| AdminGeo, fenêtre aujourd’hui | 1 | 8 | 14 | 18 + agrégation non estimée | Indisponible |
| Expiration, une passe du service utilisé par les workers | 0 | 2 | 13 | 13 | Indisponible |
| Cycles, une interrogation de la file vide par le code du worker | 0 | 1 | 0 | 1 | Indisponible |
| Fonction quotidienne, trois scans vides sur la version actuelle | 0 | 3 | 0 | 3 | Indisponible |

La vérification du rôle porte la mesure de contacts de 18 à 19 opérations et de 15 à 16 documents par rapport au service seul dans l’audit. Pour les workers, le banc exécute la méthode réelle d’expiration et la sélection réelle des cycles sans démarrer le ticker permanent. La fonction quotidienne a été appelée avec une fixture sans envoi à effectuer. Le coût nocturne réel dépend notamment du nombre d’instances actives, des tailles de club et des retries. Les durées des tickers en code ne donnent pas un volume mensuel constaté.

## Temps de chargement et onglets

Le signal « cache » est celui de la page après restauration. Le signal « prêt » est celui du chargement principal observé dans le composant, échantillonné toutes les 100 ms. Le banc démarre son chronomètre au montage, une fois les modules du banc chargés. Ces points ne certifient pas à eux seuls la présence d’un contenu utile à l’écran.

| Repère en ms, passage comparatif | Parent | 18 octobre | Actuel |
|---|---:|---:|---:|
| Clients, première visite, prêt | 827 | 423 | 646 |
| Coach, première visite, prêt | 790 | 847 | 1 711 |
| Clients, retour, cache / prêt | 99 / 433 | 95 / 418 | 89 / 517 |
| Coach, retour, cache / prêt | 51 / 659 | 51 / 672 | 36 / 1 393 |

Sur cinq retours supplémentaires à chaud dans la version actuelle, le repère cache médian vaut **57 ms pour Clients** et **23 ms pour Coach**. L’état prêt médian arrive respectivement à **608 ms et 1 495 ms**. Les p95 empiriques, par rang supérieur, sont de 87 et 47 ms pour le cache, 623 et 1 601 ms pour l’état prêt. Avec cinq observations, le p95 correspond au maximum de l’échantillon. Le retour semble rapide côté cache alors que les lectures continuent. Ces temps décrivent Chrome local et le serveur de développement. La comparaison ne valide pas encore les objectifs de latence sur mobile ou en production.

| Essai complémentaire sur la version actuelle | HTTP | Lectures SDK serveur | Documents retournés |
|---|---:|---:|---:|
| Un onglet club, 22 s incluant le montage | 5 | 98 | 83 |
| Deux vrais onglets du même propriétaire, 22 s à partir du démarrage du second | 8 | 157 | 133 |
| Page AdminGeo ouverte 17 s sans interaction | 2 | 16 | 28 |

Les fenêtres des essais à un et deux onglets commencent dans des états différents. Elles démontrent que le travail des deux onglets se cumule, sans fournir un coefficient universel. AdminGeo a déclenché un chargement initial et son rafraîchissement à 15 s. Son repli direct sur le SDK en cas de 404 est instrumenté dans le code actuel. L’API fonctionnait dans cet essai.

Les compteurs par ressource, scénario et révision, ainsi que les statuts HTTP, sont conservés dans le relevé JSON. [Mesures du lot 1](reports/firebase-lot1-measures.json)

## Reproduire

1. Depuis la branche dédiée, utiliser les dépendances installées du dépôt, Firebase CLI et Java 21. Pour le test navigateur, utiliser Chrome et renseigner `BYL_CHROME` si l’exécutable diffère du chemin macOS par défaut.
2. Lancer le banc ci-dessous. Le script refuse une base distante et un projet différent de `demo-byl-performance`. Il réinitialise **uniquement cette base d’émulation dédiée**. Les deux révisions Git historiques doivent être disponibles localement.
3. Les sorties JSON identifient la révision, le scénario, les compteurs, le statut, la durée et le périmètre. Chaque profil Chrome est supprimé à la fin. L’emplacement des caches et dépendances est indépendant des trois arbres Git.

```sh
# Si Java 21 de Homebrew n’est pas déjà dans le PATH
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"

# Trois révisions, navigateur et API
BYL_MEASURE_BROWSER=1 npm run measure:firestore:lot1

# Ajoute à la version actuelle les retours répétés, deux onglets et la page AdminGeo
BYL_LOT1_EXTENDED=1 BYL_MEASURE_BROWSER=1 npm run measure:firestore:lot1

# Suites fonctionnelles et de sécurité existantes
npm run test:loading
npm run test:coach-loading
npm run test:club-messaging
node scripts/testCoachOffers.cjs
node scripts/testAdminVisitLocation.cjs
npm run test:calendar-functions
npm run test:security-rules
npm run build
```

Pour un diagnostic local séparé, `VITE_BYL_FIRESTORE_METRICS=1` active le collecteur navigateur au lancement de Vite. `window.bylFirestoreMetrics.reset()` ouvre une fenêtre de mesure et `window.bylFirestoreMetrics.snapshot()` en fournit les totaux. `BYL_FIRESTORE_METRICS=1` active les lignes `[byl-metrics]` dans l’API, les workers et les sélections de la fonction quotidienne. Sans ces variables, les pages utilisent les fonctions SDK d’origine et les prototypes serveur restent intacts. Les autres logs métier préexistants ne font pas partie de ces métriques.

## Tests et risques résiduels

| Vérification exécutée | Résultat |
|---|---|
| Comparaison des trois révisions, Auth + Firestore, pages réelles sous Chrome | Trois exécutions abouties sur écran large. Routes protégées avec comptes synthétiques, résultats des offres et contacts contrôlés. La sonde calendrier modifie uniquement la séance synthétique du banc. |
| Répétition actuelle, 5 retours à chaud, second onglet et AdminGeo | Toutes les fenêtres terminées. La dispersion des retours à chaud justifie de conserver le nombre d’observations avec chaque percentile. |
| Compteurs backend | Isolation de deux activités concurrentes, lecture manquante, getAll, lecture transactionnelle, tentative, exclusion des agrégations du modèle documentaire, absence de marqueur sensible dans la sortie, prototypes inchangés hors opt-in. Trois scans réels de la fonction quotidienne sur émulateur sans livraison. |
| Coordination HTTP et caches | `test:loading` réussi. Douze demandes concurrentes d’offres donnent une requête et onze jonctions. Les tests couvrent aussi l’isolation des identités, les barrières de mutation, les erreurs et les délais. |
| Coach, messagerie, offres, géographie et fonctions calendrier | `test:coach-loading`, `test:club-messaging`, `testCoachOffers.cjs`, `testAdminVisitLocation.cjs` et `test:calendar-functions` réussis. Les tests messagerie couvrent notamment la révocation, le rattachement de compte, l’aperçu admin et l’envoi idempotent. |
| Règles Firestore | Les **78 tests** existants ont réussi contre les règles du dépôt, sur le second émulateur isolé. Firestore et Storage conservent leurs fichiers de règles. |
| Compilation et budgets | `npm run build` réussi avec les plafonds gzip existants. Le mode normal exporte les primitives Firebase d’origine. |

**Couverture.** Le backend observe les routes prédéfinies dans `backend/utils/firestoreMetrics.js`, les workers et les trois scans du planificateur. Le navigateur observe les lectures directes des deux pages, la messagerie attenante, les offres et AdminGeo. Les lectures indirectes hors de ces points, les autres triggers, les appels non ciblés, les retries internes du transport et le trafic de démarrage du shell ne sont pas recensés par ces colonnes. L’API locale du banc ne sert que les routes requises pour les mesures. Lors d’une interruption HTTP, le statut 0 marque une fermeture avant la fin de réponse : du travail backend ultérieur peut échapper au relevé. La persistance et le SDK peuvent aussi partager des flux entre onglets. Aucune quantité de facturation n’est déduite du nombre de callbacks.

**Rapprochement avec octobre.** Utiliser les quantités de Cloud Billing par projet, jour, SKU de lecture et SKU de transfert, avant conversion en euros. Si disponibles, aligner les séries horaires d’activité Firestore sur les mêmes fenêtres UTC, les instances de workers actives, les déploiements réels et les ouvertures admin. Garder un intervalle témoin sans utilisateur et reporter un écart non attribué. Un minimum par requête, les dépendances des règles et certaines lectures d’index expliquent pourquoi les compteurs application et la facture peuvent diverger. Aucun export de facturation ni relevé horaire d’exploitation n’a été fourni ou interrogé pour le lot 1. [Tarification Firestore](https://firebase.google.com/docs/firestore/pricing) · [Mesure de l’activité](https://firebase.google.com/docs/firestore/monitor-usage)

Les fenêtres de 17, 22 et 62 secondes échantillonnent les cadences identifiées. Elles ne mesurent pas une journée d’activité réelle ni une perte réseau prolongée. Les priorités établies pour une éventuelle correction sont la reconstruction de l’annuaire, les lectures d’offres au montage et lors des rendus, le rechargement coach après changement de séance et les scans sans utilisateur. Les tests n’ont appliqué aucune correction à ces mécanismes.

**Point de validation.** Le lot 1 livre une base de mesure. Aucune économie en production n’est revendiquée. Le lot 2 attend une validation distincte.
