# Mesures du dashboard coach — 9 septembre 2026

## Quatrième optimisation : dashboard et actions

Mesures locales, session Tom, base Firebase réelle, mêmes 36 clients, 44 modèles,
219 séances, 12 bilans et 1 retour Nutrition. Pas de création de données client
de test en production et pas de connexion sous le compte d’Alex.

### Actualisation différentielle des modèles

La lecture serveur complète des modèles représente environ 9,8 Mo JSON, dont
9,7 Mo de séances/exercices. Une mesure Admin SDK en lecture seule prend 5,652 s.
Retarder cette lecture ou seulement compresser son transfert n’a pas suffi.

La nouvelle route authentifiée `POST /api/programs/dashboard-templates` lit
d’abord les références et versions serveur Firestore (`updateTime`, nanosecondes
comprises), puis seulement les documents modifiés. La copie locale conserve
chaque document complet. Ajouts, suppressions et changements sont vérifiés à
chaque ouverture ; aucun champ applicatif optionnel (`_rev`, `updatedAt`) n’est
utilisé comme preuve de fraîcheur. Les changements sont renvoyés sans tronquer
les exercices. Accès limité au coach actif ou à l’administrateur vérifié ; aucune
extension aux autres comptes du club. Une ancienne API peut utiliser le repli
SDK ; une réponse 401/403 ne contourne pas le refus.

| Essai | Copie enregistrée affichée | Données complètes actualisées et rendues |
| --- | ---: | ---: |
| Première acquisition des versions (44 documents) | 1,102 s | 6,002 s |
| Réouverture 1 (0 modèle modifié) | 1,255 s | 3,918 s |
| Réouverture 2 (0 modèle modifié) | 1,214 s | 4,298 s |
| Pipeline Nutrition final, retour depuis aperçu | 1,273 s | 5,408 s |
| Pipeline Nutrition final, rechargement de confirmation | 1,295 s | 4,087 s |

Les 44 modèles complets sont vérifiés en 0,875 puis 0,924 s lors des deux
réouvertures, sans retransférer les 9,8 Mo. Le reste du temps inclut les lectures
client/programme/historique et Nutrition. Les dernières lectures Nutrition ont
ensuite été regroupées en 12 tâches : chaque patient lit son retour dès ses
bilans reçus, sans barrière attendant les bilans de tous les autres patients.
Sur les deux derniers essais, Nutrition se termine à 4,829 puis 3,503 s ;
les détails sportifs à 5,088 puis 3,779 s. Les lectures individuelles les plus
lentes prennent respectivement 2,333 et 0,873 s. Le résultat final reste donc
variable : on ne doit pas annoncer un plafond garanti de quatre secondes.

### Actions et aperçus

- ProgramView et AutoProgramPreview utilisent directement un abonnement live,
  sans `getDoc` réseau préalable. Ils peuvent afficher le document complet déjà
  disponible ; les commandes d’édition attendent la confirmation serveur.
  Repli assigné → modèle seulement après absence confirmée, annulation des
  abonnements à la navigation et sortie du chargement après 10 s en cas d’attente.
- ProgramView : 0,622 puis 0,611 s pour le premier programme confirmé/rendu.
  AutoProgramPreview : 0,534 s, sur le même modèle existant de quatre séances.
  `pagePerf=1&fresh=1` ignore le document transmis par navigation et la première
  émission locale du SDK ; cela ne vide pas le cache HTTP des scripts/images.
  Ces mesures portent sur les données et le premier rendu des exercices, pas
  sur le téléchargement complet de chaque média ou le PDF. Le chronomètre ne
  remplace plus le premier résultat par chaque émission live ultérieure.
- Programme créé/enregistré : suppression des délais de navigation artificiels
  de 500/1200 ms **après** confirmation. La synchronisation des assignations
  client reste attendue. Une sauvegarde concurrente est empêchée, et de nouvelles
  modifications saisies pendant la requête ne sont plus marquées enregistrées
  ni perdues par une navigation automatique.
- Planning : la réponse arrive après la transaction et contient la séance
  réellement confirmée, y compris l’état existant en cas de doublon. Le calendrier
  la fusionne immédiatement puis actualise les autres données en arrière-plan.
  Les refus, données invalides et réponses sans confirmation ne créent pas de
  séance visuelle. Les assignations utilisent un indicateur local, pas le blocage
  du dashboard entier.
- Nutrition : suppression de la requête de quota préalable pour les parcours
  e-mail qui vérifient déjà le quota serveur. Le contrôle préalable est conservé
  pour la fiche hors ligne ; les erreurs de quota serveur ouvrent la même alerte.
  Historique médical, autorisations, confirmation d’écriture et protection contre
  les doubles créations restent conservés. Aucun bilan réel n’a été créé pour
  ce test, donc aucun temps de création bout en bout en production n’est annoncé.

Tests : lint, 51 smoke checks, `test:action-loading` (vraies routes avec doubles
en mémoire, commit différé/échoué, doublons, contrôles d’accès, versions et
abonnements), Nutrition/création e-mail, chargement global/dashboard,
synchronisation/duplication de programmes, synchronisation player-builder.
Build et budgets gzip respectés : initial 514,7 KiB / 520, dashboard 62,9 / 70.

**Déploiement restant : frontend et backend ensemble.** Les tests ne constituent
pas une validation sur le téléphone d’Alex. La première acquisition complète et
les mauvaises connexions ne sont pas garanties instantanées.

## Troisième optimisation : pages principales du site

Mesures locales supplémentaires du 9 septembre, session Tom, données Firebase
réelles, sans compilation ni modification de code pendant chaque mesure.
`?pagePerf=1` expose la fin de restauration (`cache`) et la fin de chargement
(`ready`) après deux trames. `&fresh=1` contourne le cache applicatif de la page,
mais ne vide ni le cache du navigateur ni celui du SDK Firebase.

| Page | Affichage enregistré | Chargement complet sans reprise applicative | Relecture lors de la réouverture |
| --- | ---: | ---: | ---: |
| Nutrition | 0,241 s | 1,916 s | 1,263 s |
| Clients | 0,331 s | 2,461 s | 1,958 s |
| Programmes | 0,491 s | 3,306 s | 2,657 s |
| Statistiques | 0,329 s | 2,033 s | 2,614 s |

Périmètre : 36 clients, 90 programmes assignés pour les métriques Clients,
44 modèles, 12 bilans Nutrition. La fenêtre d’assignation a été ouverte après
le chargement Clients : 44 modèles présents, confirmation désactivée sans
sélection, puis fermeture sans écrire d’assignation.

Contrôle du dashboard avec le cache commun final : affichage complet enregistré
en 1,133 puis 1,146 s ; relecture complète en 7,573 puis 5,865 s, toujours avec
36 clients, 44 modèles, 219 séances, 12 bilans et 1 retour Nutrition.
Une première ouverture avait abandonné la décompression à 350 ms : la limite
de lecture/reconstruction est désormais 750 ms pour mieux reprendre les grosses
copies. Cela ne garantit pas la reprise sur tous les appareils.
**Le dashboard n’est donc pas garanti sous six secondes pour la relecture du
serveur** ; son affichage enregistré est disponible bien avant.

Changements :

- Restauration IndexedDB partagée avec les pages Clients, Programmes, Nutrition,
  Statistiques et Mes programmes, avec isolation par compte et variantes de vue.
  Les entrées complètes sont réaffichées puis toujours actualisées ; un état
  partiel ne remplace plus une copie complète et une ancienne lecture ne remplace
  pas une navigation ou un résultat plus récent.
- Programmes : lectures racines parallèles, retrait de la lecture SDK locale
  redondante des modèles et de l’attente avant les affectations, file bornée à 12.
- Clients : file partagée de 24 lectures, retrait de l’attente et des écritures
  de rattrapage `lastSession` pendant la consultation. Les modèles ne sont lus
  qu’à l’ouverture de l’assignation. Cette dernière optimisation fait passer la
  mesure complète de 4,486 à 2,461 s sur ce jeu de données. Les programmes complets
  restent dans les lignes en mémoire pour la navigation vers les profils ; la
  copie persistée de la liste conserve seulement ses données et métriques utiles.
- Nutrition : une seule file priorisée de 12 lectures, sans pause entre groupes.
  Les erreurs de rafraîchissement conservent les résultats enregistrés. Les refus
  de permissions sur les branches legacy facultatives restent tolérés, sans
  transformer l’échec de la requête principale en une liste vide réussie.
- Statistiques : comptage serveur des modèles au lieu de télécharger tous leurs
  exercices ; lectures détaillées bornées à 24, copie de cartes allégée.
- Mes programmes : restauration asynchrone et revalidation, sans remplacer la
  progression enregistrée par les valeurs provisoires avant lecture des séances.
- Indication visible de l’actualisation, instrumentation réservée au développement,
  et correction d’un avertissement React `tableLayout` sur la liste Clients.

Les tests de cache couvrent la coalescence, les dates de fraîcheur, les courses
avec un résultat récent, les valeurs partielles et le stockage indisponible.
Les tests de parcours protègent le chargement différé de l’assignation et la
relecture du modèle complet avant écriture. Lint, 50 smoke tests, tests de
chargement, Nutrition, duplication, métriques et reprise de séance passent.
Compilation et budgets respectés : démarrage 514,7 KiB gzip, Clients 11,5 KiB,
Programmes 7,4 KiB, dashboard coach 62,1 KiB.

Limites : pas de déploiement, pas de mesure sur le téléphone d’Alex, pas de
nouvelle session client disponible pour chronométrer Mes programmes. Les temps
ci-dessus ne prouvent pas que chaque page du site ou un premier accès sur un
réseau mobile froid est instantané. Les sections précédentes ci-dessous
conservent l’historique des mesures.

## Deuxième optimisation : réouverture rapide (version finale)

Après la première série ci-dessous, un cache de **données complètes**, compressé
sans perte dans IndexedDB, a été ajouté. Il est isolé par coach/club et ne
contient ni identifiants de connexion ni brouillons. L’affichage depuis le cache
est explicitement distingué de l’actualisation réseau dans l’interface.

| Essai propre | Affichage depuis la copie locale | Actualisation complète terminée |
| --- | ---: | ---: |
| Réouverture 1 | 1,004 s | 6,226 s |
| Réouverture 2 | 0,961 s | 6,504 s |
| Sans reprise de la synthèse (`fresh=1`) | Non utilisée | 6,627 s |

Ces deux réouvertures incluent la reprise des 36 clients, 44 programmes,
219 séances, 12 suivis Nutrition, des préférences et du copilote, puis deux
trames de rendu. Le calendrier hors écran reste affiché au défilement.
Ce n’est **pas** une promesse de données fraîchement relues du serveur en une
seconde : elles restent affichées pendant leur revalidation, à chaque ouverture.
Les commandes d’édition de mémoire/historique du copilote attendent sa lecture
serveur pour éviter d’écraser une configuration modifiée ailleurs.

Le jeu complet représente 30 088 854 caractères JSON (dont environ 9,8 millions
pour les modèles de programmes). Les exercices et l’historique ne sont plus
tronqués dans cette copie. Limites : 40 millions de caractères avant compression,
24 Mo par entrée stockée, 32 Mo au total, 12 entrées, expiration après 7 jours,
et deux dashboards complets au maximum dans la mémoire dédiée aux synthèses.
Une lecture du cache bloquée est abandonnée après un délai borné et le chargement
réseau prend le relais. Une écriture ancienne ne remplace pas une copie plus
récente. La version sport est passée à 9 et la version Nutrition à 2.

Les lectures SDK locales redondantes et le second rafraîchissement parallèle du
planning ont été supprimés. Les synthèses de pages trop volumineuses sont
rejetées dès le début de leur sérialisation, sans parcourir tout leur contenu.
Le premier chargement complet **n’est pas devenu instantané** : le gain vérifié
porte sur les réouvertures disposant d’une copie locale.

Validation complémentaire : budget de bundles, lint, 50 smoke tests,
`test:coach-loading`, `test:loading`, `test:program-duplication`,
`test:session-resume`, `test:nutrition-creation`. Tests de cache : compression
sans perte, isolation des clés, expiration, éviction, absence de stockage,
stockage bloqué/corrompu et ordre des écritures. Les mesures restent locales
sur la session Tom ; aucune validation de déploiement ou mesure mobile Alex.

La suite du document conserve les mesures de la première optimisation pour
comparaison ; ses anciennes limites de cache ne décrivent pas la version finale.

## Périmètre

Navigateur intégré, interface Vite locale sur `127.0.0.1:5173`, session Tom
administrateur affichant son dashboard coach, données Firebase réelles.
Pas de déploiement ni de mesure sur le téléphone d’Alex.

`?dashboardPerf=1&fresh=1` active une instrumentation **uniquement en développement**
et contourne les caches de synthèse de l’application. Le cache propre au SDK
Firestore et le cache des fichiers du navigateur ne sont pas effacés : ce n’est
donc pas une simulation de première installation ni de réseau mobile froid.

Le compteur `painted.pageMs` part de la navigation et attend la fin des lectures
sport/client/planning et Nutrition, puis deux trames de rendu. La version finale
attend également les préférences et le copilote. Il mesure un signal de fin de
chargement applicatif, pas une analyse vidéo de chaque pixel.

Le calendrier hors écran reste monté au défilement : son état `calendar` est
distinct. Son affichage a été vérifié après défilement. Les séances qui
l’alimentent sont déjà incluses dans les données chronométrées.

## Résultats observés

| Cas | Temps depuis la navigation | Données obtenues |
| --- | ---: | --- |
| Référence 1 | 8,687 s pour le sport | 24 clients détaillés sur 36 ; Nutrition restée en chargement |
| Référence 2 | 8,942 s pour le sport | Même chargement incomplet |
| Après correction, essai 1 | 5,745 s | 36/36 clients, 44 programmes, 219 séances, 12 suivis Nutrition, 1 retour |
| Après correction, essai 2 | 5,391 s | Même périmètre complet |
| Après correction, essai 3 | 4,760 s | Même périmètre, préférences et copilote prêts à 2,833 s |
| Réouverture, cache applicatif autorisé | 6,072 s | Même périmètre ; cache de synthèse non réutilisé dans cet essai |

Les essais après correction ont été réalisés sans compilation simultanée.
Les essais intermédiaires perturbés par le rechargement à chaud ou une
compilation ne sont pas des références. Les délais varient avec le serveur,
le réseau et la machine ; aucun délai instantané ou SLA n’est garanti.

## Corrections

- Suppression du plafond de 24 clients détaillés : les clients de la liste
  chargée sont tous enrichis. Les limites préexistantes des requêtes racines
  restent inchangées (500 documents par requête clients, 200 programmes).
- File partagée de 24 lectures simultanées pour les programmes clients et leurs
  séances ; enrichissement chevauchant les lectures du planning, sans pause
  artificielle de 650 ms. Les 126 lectures de cet échantillon sont terminées.
- Nutrition déclenchée sur les identifiants clients stables : un enrichissement
  des mêmes clients ne détruit plus le chargement déjà en cours. Délai initial
  réduit et réutilisation de cache conditionnée au même ensemble de clients.
- Invalidation des anciennes synthèses incomplètes (version de cache 8), et
  interdiction de reprendre le dernier cache d’un autre compte ou club.
- Limitation des copies persistées de pages : la saturation de `localStorage`
  provoquait une erreur interne Firebase et une file de lectures bloquée.
  Les copies serveur reconstruites sont les seules entrées évincées ; aucune
  donnée serveur, session de connexion, préférence ou brouillon n’est supprimé.
  Les grosses copies restent utilisables en mémoire sans remplir ce stockage.
- Conservation des requêtes de permissions séparées : les branches legacy
  facultatives ne doivent pas faire échouer les requêtes autorisées d’Alex.

Aucune nouvelle erreur console depuis la récupération du stockage n’a été
observée sur les essais finaux.

## Vérifications et limites restantes

`npm run build`, budgets de bundles, `npm run lint`, les 50 tests smoke,
`npm run test:coach-loading`, `npm run test:loading` et
`npm run test:nutrition-creation` passent. Le test de cache protège notamment
les entrées d’authentification, Firebase, brouillons et préférences.

Le premier chargement n’est pas encore quasi instantané : les 44 documents de
programmes représentent environ **9,8 millions de caractères JSON**, avant
compression réseau, et l’enrichissement implique encore 126 lectures. Un gain
supplémentaire important nécessitera des synthèses serveur légères et leur
invalidation fiable lors des modifications. Cette évolution n’a pas été
introduite dans cette correction et les règles Firestore n’ont pas été élargies.

La réussite des mesures locales ne valide ni le déploiement en production,
ni la création d’un espace Nutrition dans la session navigateur d’Alex.
