# BYL · Lot 6 — Calendriers Coach, Client et Club, Dashboard Club

Branche `codex/firebase-performance-audit`. Référence avant correction : `866241d`, commit validé du Lot 5. Les comparaisons utilisent Firebase Auth et Firestore sur émulateurs, Chrome local et des données synthétiques. Aucun déploiement.

## 1. Causes identifiées

- L’ouverture du calendrier Club appelait le bilan général, avec les dossiers, programmes, bilans nutritionnels, séances historiques, données administratives et rendez-vous. Le backend lisait toute la collection de rendez-vous, la triait par date croissante et ne renvoyait que les 200 premiers. Sur une fixture comprenant 360 anciens rendez-vous, le rendez-vous courant était donc absent du calendrier.
- La présence d’un rendez-vous suffisait à déclencher le chargement de l’annuaire des participants et de leurs packs. Le retour au premier plan et un intervalle d’une minute pouvaient recommencer ce travail. Une mutation de rendez-vous relançait aussi le bilan.
- Le calendrier Client demandait les séances par trois chemins de liaison qui se recouvrent. Une séance liée par les trois chemins arrivait dans trois vues. Le rattrapage des validations anciennes relisait le calendrier pour trouver les clés existantes. Les cours collectifs du membre chargeaient les anciennes séances du club et pouvaient relire tous les rendez-vous pour vérifier le crédit de chaque cours, même en l’absence de pack.
- Le calendrier Coach partageait déjà les séances racines depuis le Lot 4. Un changement calendrier invalidait néanmoins les programmes du dossier et la lecture des rendez-vous du club. Un cours interne modifié depuis le Club pouvait, à l’inverse, attendre la réconciliation du cache du coach.
- Les badges d’échéances et d’annulations récupéraient des listes détaillées sur des pages qui ne les affichaient pas. L’accueil Club et les outils détaillés utilisaient le même chargement.

## 2. Architecture retenue

**Calendrier Club.** La page demande d’abord l’identité du club et les professionnels. Une route autorisée charge ensuite les rendez-vous qui chevauchent la période. Les récurrences BYL sont matérialisées en occurrences ; chaque occurrence conserve son identifiant et ses propres déplacements et annulations. Les bornes reposent sur les minuits locaux. Le mois inclut les jours adjacents de la grille, la vue mobile suit sa semaine et le PDF demande la semaine choisie dans son dialogue. La prochaine séance de l’accueil dispose d’une lecture séparée à partir d’aujourd’hui pour tenir compte des filtres et des rendez-vous éloignés.

Le processus backend partage les écoutes de la même période, les lectures des anciens formats et les documents de séances liés. Une écriture réveille les attentes HTTP concernées. Le client conserve jusqu’à huit réponses en mémoire ; le serveur vérifie les droits et compare une empreinte du contenu avant leur réutilisation. Une attente dure au plus 24 secondes. Les ressources de la période sont libérées quatre secondes après le départ du dernier consommateur. Une perte de connexion déclenche un nouvel essai. Un refus d’accès retire les données privées. Les variantes mobile et desktop du calendrier Club se montent selon la taille de l’écran.

**Coach.** Les séances racines conservent leur abonnement commun pour les statistiques et les crédits. Si une ouverture à froid attend toujours le flux complet après 180 ms, la semaine courante peut être demandée en priorité ; la réponse complète prend le relais, notamment pour les formats de dates anciens. Les rendez-vous propres au coach dans son club restent synchronisés par un abonnement soumis aux règles. Un changement de titre, de date ou de statut calendrier conserve les programmes et historiques confirmés. Les révisions du domaine progression continuent à invalider ces données lorsqu’elles changent réellement.

**Client.** Une requête OU réunit les liaisons autorisées d’un même compte. Les dossiers supplémentaires qui peuvent avoir des droits différents conservent des admissions séparées. Les curseurs donnent la priorité à la semaine courante puis chargent deux intervalles complémentaires pour les séries statistiques, les packs et la détection des doublons. Une séance datée appartient à un seul intervalle de sa requête. Les intervalles restent en place pendant la navigation. Un retour immédiat peut rejoindre le même abonnement confirmé pendant deux secondes. Les documents sans date ne sont pas affichables ; leur éventuelle clé historique reste vérifiée avant une création automatique. En cas d’échec du parcours indexé, la requête autorisée d’origine sert de repli.

Les cours collectifs chargent les périodes affichées et les inscriptions ou listes d’attente du membre nécessaires à la progression de ses packs. Pendant une consultation, une lecture identique de droits à crédit est mutualisée. Une nouvelle réservation refait ses vérifications dans la transaction serveur.

**Accueil et sections Club.** L’accueil conserve les données nécessaires à ses indicateurs et alertes. Le formulaire de rendez-vous charge les détails de programmes lorsqu’ils servent à choisir une séance. Le journal, les exports et les sections détaillées gardent le bilan correspondant à leurs besoins. Les badges de l’accueil interrogent les échéances candidates et les annulations en attente. Les outils détaillés publient leurs propres compteurs. Le calendrier charge les noms et packs des dossiers concernés par les événements visibles ; l’annuaire complet reste disponible lors de la gestion des inscriptions. Les calculs de solde incluent les événements historiques référencés par un rapport, même après retrait d’un participant.

## 3. Fichiers modifiés

| Domaine | Fichiers |
|---|---|
| Dashboard Club et présentation des périodes | `src/pages/ClubDashboard.jsx`, `src/components/dashboard/{ClubMobileCalendar,ClubPlanningDownload,ClubLogo,CoachDashboardCalendar}.jsx`, `src/utils/{calendarWindow.mjs,useClubCalendarPeriod.js,api.js}` |
| Calendriers Coach et Client | `src/components/{CoachDashboard,Clientdashboard}.jsx`, `src/components/dashboard/useClientClubClasses.jsx`, `src/utils/{coachPageSource,calendarBootstrap,clientCalendarFeed}.js`. Le calendrier Client utilise déjà le composant de grille commun. |
| API et calculs Club | `backend/routes/{clubs,coachSessions}.js`, `backend/utils/{clubCalendarPeriod,clubClassBooking,clubSessionPacks,clubSubscriptions,clientSessionCancellation,firestoreMetrics}.js`, `firestore.indexes.json` |
| Tests et mesures | `scripts/{runCalendarLot6,measureCalendarLot6,testCalendarLot6,measureFirebaseBrowser,testClubSessionPacks,testClientCreationDelivery}.cjs`, `scripts/fixtures/{calendarLot6.jsx,personalCalendarLot6.jsx,personalCalendarProbe.cjs}` |

L’audit a également couvert les écritures de réservations, les contrôles d’annulation, les présences, les liens avec les calendriers individuels et les fonctions de synchronisation existantes. Le code de ces fonctions et les règles Firestore n’ont pas changé.

## 4. Mesures avant et après

Les fixtures Club comprennent deux professionnels, 0, 12, 100 ou 500 dossiers, 360 rendez-vous anciens sur plusieurs années et un rendez-vous courant lié à une séance. Les deux versions utilisent les mêmes données, dont un logo synthétique pour que l’ancienne version puisse rendre l’accueil. Le défaut observé avec un logo absent a été corrigé dans le composant ClubLogo.

**Lecture des tableaux.** HTTP compte les requêtes du périmètre Club instrumentées, y compris une attente fermée au changement de vue. SDK compte les opérations de lecture backend et les démarrages d’écoute. Documents compte les résultats ponctuels et les changements serveur des écoutes ; le navigateur Club utilise l’API pour ce parcours. L’estimation documentaire compte notamment les résultats vides, sans chiffrer les entrées d’index, les lectures de règles ou la facturation des agrégations. Les octets correspondent au trafic API et Firestore décodé par Chrome dans la fenêtre de mesure, hors offres et messagerie. Le temps « prêt » correspond à l’état du composant, le tas JS à un échantillon au terme de la fenêtre. Les requêtes en vol peuvent se terminer dans la fenêtre suivante, particulièrement sur l’ancien bilan à 500 dossiers. Aucun chiffre de facture réelle ni percentile de production.

### Club · ouverture, retour et accueil desktop

| Dossiers | Parcours | Version | HTTP | SDK | Documents | Estimation | Trafic Kio | Prêt ms | Tas JS Mio |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Calendrier, ouverture | avant | 4 | 24 | 730 | 745 | 103.3 | 232 | 70 |
| 0 | Calendrier, ouverture | après | 3 | 23 | 12 | 24 | 0.6 | 352 | 72 |
| 0 | Calendrier, retour | avant | 4 | 24 | 730 | 745 | 103.3 | 135 | 86 |
| 0 | Calendrier, retour | après | 4 | 18 | 11 | 19 | 0.6 | 118 | 77 |
| 0 | Accueil Club | avant | 4 | 24 | 730 | 745 | 103.3 | 136 | 87 |
| 0 | Accueil Club | après | 7 | 37 | 16 | 37 | 1.8 | 177 | 97 |
| 12 | Calendrier, ouverture | avant | 4 | 124 | 827 | 900 | 113.5 | 427 | 76 |
| 12 | Calendrier, ouverture | après | 3 | 24 | 13 | 25 | 0.7 | 313 | 72 |
| 12 | Calendrier, retour | avant | 4 | 124 | 827 | 900 | 113.5 | 198 | 77 |
| 12 | Calendrier, retour | après | 4 | 19 | 12 | 20 | 0.7 | 135 | 77 |
| 12 | Accueil Club | avant | 4 | 124 | 827 | 900 | 113.5 | 220 | 82 |
| 12 | Accueil Club | après | 7 | 60 | 41 | 71 | 10.5 | 221 | 80 |
| 100 | Calendrier, ouverture | avant | 4 | 824 | 1531 | 2040 | 155.7 | 527 | 71 |
| 100 | Calendrier, ouverture | après | 3 | 24 | 13 | 25 | 0.7 | 379 | 72 |
| 100 | Calendrier, retour | avant | 4 | 824 | 1531 | 2040 | 155.7 | 275 | 76 |
| 100 | Calendrier, retour | après | 4 | 19 | 12 | 20 | 0.7 | 123 | 77 |
| 100 | Accueil Club | avant | 4 | 824 | 1531 | 2040 | 155.7 | 236 | 82 |
| 100 | Accueil Club | après | 7 | 216 | 217 | 315 | 41.7 | 303 | 98 |
| 500 | Calendrier, ouverture | avant | 3 | 2400 | 3569 | 4757 | 262.4 | 1123 | 70 |
| 500 | Calendrier, ouverture | après | 3 | 24 | 13 | 25 | 0.6 | 311 | 72 |
| 500 | Calendrier, retour | avant | 4 | 3404 | 4431 | 6620 | 282.8 | 821 | 76 |
| 500 | Calendrier, retour | après | 4 | 19 | 12 | 20 | 0.6 | 136 | 77 |
| 500 | Accueil Club | avant | 4 | 3404 | 4431 | 6620 | 282.8 | 456 | 83 |
| 500 | Accueil Club | après | 7 | 316 | 717 | 815 | 118.3 | 361 | 99 |

À 500 dossiers, le libellé du rendez-vous courant est présent dans un élément rendu à 311 ms après correction. La version précédente rendait son calendrier sans ce rendez-vous. Sur la nouvelle version, l’ouverture calendrier dépend principalement des événements affichés et de leurs participants. L’accueil conserve un coût dépendant du nombre de dossiers.

### Navigation, modifications et synchronisation · Club de 12 dossiers

| Parcours | Version | HTTP | SDK | Documents | Estimation | Trafic Kio | Fenêtre ou synchronisation ms |
|---|---|---|---|---|---|---|---|
| Semaine suivante | avant | 0 | 0 | 0 | 0 | 0.0 | 0 |
| Semaine suivante | après | 2 | 8 | 3 | 8 | 0.1 | 100 |
| Vue mois | avant | 0 | 0 | 0 | 0 | 0.0 | 0 |
| Vue mois | après | 3 | 14 | 7 | 14 | 0.4 | 86 |
| Premier plan | avant | 3 | 80 | 412 | 462 | 0.5 | 0 |
| Premier plan | après | 1 | 6 | 3 | 6 | 0.1 | 19 |
| Ouverture du second onglet | après | 3 | 17 | 11 | 18 | 0.0 | 269 |
| Repos 25 s, deux onglets | après | 2 | 8 | 4 | 8 | 0.1 | 25003 |
| Modification distante | après | 4 | 20 | 12 | 22 | 0.4 | 110 |
| Validation de la séance liée | après | 3 | 11 | 6 | 11 | 0.4 | 73 |
| Annulation synchronisée | après | 4 | 20 | 13 | 23 | 0.7 | 115 |

Le changement de semaine de la référence ne lançait pas de requête. Le navigateur filtrait ses 200 premières lignes, y compris lorsque cette liste omettait les événements de la semaine demandée. Les deux onglets après correction montrent la modification distante ; les coûts des attentes et des lectures HTTP couvrent les deux, le trafic Chrome ne couvre que l’onglet principal. Le premier plan est chronométré jusqu’au retour de l’action ; ses appels de rafraîchissement sont observés pendant les 250 ms suivantes. La référence ne fournissait pas d’écoute des modifications distantes sur cet écran.

### Mobile · Club de 12 dossiers, largeur 500 px

| Parcours | Version | HTTP | SDK | Documents | Estimation | Trafic Kio | Libellé courant dans le DOM ms | Prêt ms |
|---|---|---|---|---|---|---|---|---|
| Ouverture | avant | 4 | 124 | 827 | 900 | 113.5 | — | 289 |
| Retour | avant | 4 | 124 | 827 | 900 | 113.5 | — | 159 |
| Semaine suivante | avant | 0 | 0 | 0 | 0 | 0.0 | — | 9 |
| Semaine précédente | avant | 0 | 0 | 0 | 0 | 0.0 | — | 9 |
| Ouverture | après | 3 | 24 | 13 | 25 | 0.6 | 267 | 268 |
| Retour | après | 4 | 19 | 12 | 20 | 0.6 | 103 | 103 |
| Semaine suivante | après | 2 | 8 | 3 | 8 | 0.1 | — | 75 |
| Semaine précédente | après | 3 | 12 | 6 | 12 | 0.1 | 68 | 68 |
| Édition distante | après | 2 | 10 | 6 | 11 | 0.3 | 45 | 88 |
| Validation | après | 2 | 10 | 6 | 11 | 0.3 | — | 52 |
| Annulation | après | 4 | 20 | 12 | 22 | 0.6 | — | 84 |

Le test mobile actionne les boutons de navigation visibles. « — » indique que le libellé de référence n’a pas été vu dans cette fenêtre ; il change de texte après l’édition distante. Ce test utilise Chrome redimensionné.

### Coach et Client · 360 séances racines réparties sur plusieurs années

| Page | Parcours | Version | Web écoutes / lectures | Docs présentés web | Estimation web | API HTTP / SDK / docs / estimation | Trafic Kio | Prêt ms | Tas JS Mio |
|---|---|---|---|---|---|---|---|---|---|
| coach | Ouverture | avant | 1 / 1 | 360 | 361 | 2 / 7 / 3 / 7 | 238.7 | 2031 | 113 |
| coach | Ouverture | après | 2 / 1 | 361 | 362 | 2 / 7 / 3 / 7 | 239.6 | 2071 | 118 |
| coach | Retour | avant | 0 / 0 | 0 | 0 | 0 / 0 / 0 / 0 | 0.2 | 104 | 124 |
| coach | Retour | après | 0 / 0 | 0 | 0 | 0 / 0 / 0 / 0 | 0.2 | 90 | 131 |
| coach | Édition distante | avant | 0 / 1 | 360 | 2 | 1 / 5 / 2 / 5 | 237.3 | 400 | 143 |
| coach | Édition distante | après | 0 / 0 | 360 | 1 | 0 / 0 / 0 / 0 | 236.8 | 311 | 138 |
| coach | Premier plan | avant | 0 / 0 | 0 | 0 | 0 / 0 / 0 / 0 | 0.1 | 33 | 83 |
| coach | Premier plan | après | 0 / 0 | 0 | 0 | 0 / 0 / 0 / 0 | 0.0 | 33 | 143 |
| client | Ouverture | avant | 3 / 0 | 1080 | 360 | 1 / 47 / 4354 / 4378 | 708.2 | 2424 | 92 |
| client | Ouverture | après | 3 / 0 | 360 | 361 | 1 / 30 / 11 / 30 | 237.1 | 1418 | 91 |
| client | Retour | avant | 3 / 0 | 1080 | 0 | 1 / 47 / 4354 / 4378 | 475.0 | 591 | 100 |
| client | Retour | après | 0 / 0 | 0 | 0 | 1 / 30 / 11 / 30 | 3.0 | 249 | 94 |
| client | Édition distante | avant | 0 / 0 | 1080 | 1080 | 0 / 0 / 0 / 0 | 883.1 | 306 | 117 |
| client | Édition distante | après | 0 / 0 | 1 | 1 | 0 / 0 / 0 / 0 | 235.7 | 163 | 112 |
| client | Premier plan | avant | 0 / 0 | 0 | 0 | 1 / 47 / 4354 / 4378 | 5.2 | 22 | 120 |
| client | Premier plan | après | 0 / 0 | 0 | 0 | 1 / 30 / 11 / 30 | 0.1 | 20 | 112 |

Pour le Client, les champs de liaison se recouvrent sur la fixture. À froid, l’estimation web passe de 360 à 361 alors que les documents présentés passent de 1 080 à 360 : le SDK savait déjà servir certaines vues depuis son cache et le nouveau découpage comporte une requête vide. Le coût serveur des cours collectifs passe de 4 354 à 11 documents retournés. Pour le Coach, la requête prioritaire coûte ici une lecture supplémentaire à froid et le temps global est légèrement plus long. Le déplacement distant ne relance plus l’API des programmes. Le volume réseau du transport Firestore peut rester élevé même lorsque le SDK ne présente qu’un changement.

**Écritures et mémoire serveur.** Sur la fixture instrumentée de 12 dossiers, le compteur de commits Admin confirme zéro écriture à l’ouverture, au retour, au changement de période et pendant les 25 secondes de repos à deux onglets. La mutation distante de titre et la validation écrivent chacune un document source ; l’annulation de la fixture écrit le rendez-vous et la séance liée. Aucune de ces opérations ne crée de projection persistante. Le tas du processus Node du banc est de 173 Mio à l’ouverture et de 90 Mio après les 25 secondes de repos ; il inclut le serveur de test et les variations du ramasse-miettes. Les six index déclarés sur `sessions` ont un coût de stockage, de construction initiale et de maintenance des entrées distinct des écritures documentaires.

## 5. Tests métier

| Scénario | Résultat |
|---|---|
| Période vide et historique ancien | L’API renvoie une liste vide confirmée pour la semaine vide. La période contenant le rendez-vous récent le restitue au-delà des 200 anciens éléments. |
| Dates et récurrence | La série hebdomadaire commence avant la semaine demandée. Son occurrence dans la semaine est présente. Les semaines de changement d’heure Europe/Paris durent 167 et 169 h. Les dates numériques, ISO, Timestamp, objets historiques et événements longs chevauchant minuit sont vérifiés. |
| Déplacement, validation, annulation | Un événement entre dans la fenêtre puis en sort lors du déplacement suivant. L’annulation d’une occurrence et la validation de la séance liée arrivent dans les vues ouvertes. Un même rendez-vous reste unique entre les requêtes de compatibilité. |
| Réservation et présence | Deux comptes réservent simultanément une place via l’API. Une seule inscription est confirmée, l’autre est en attente. Répéter l’inscription ne double pas la place. Le retrait promeut le premier en attente. Les suites packs et administration couvrent présence, absence, justification, annulation et calcul de solde. |
| Paiements et abonnements | Le compteur et le détail des échéances concordent sur un contrat et un règlement manuel. Le contrat d’un autre club est exclu. Les tests existants couvrent les périodes, paiements partiels, tentatives répétées et contrôles de paiement. |
| Onglets, appareils, reconnexion | Deux vrais onglets Chrome du même responsable voient l’édition distante. Deux instances indépendantes du SDK Web, authentifiées comme coach et client avec des caches distincts, vérifient qu’un changement effectué pendant la coupure du client lui parvient à la reconnexion. |
| Mobile et PDF | La navigation par les boutons mobiles change la semaine puis revient aux événements attendus. La suite PDF vérifie semaine, filtres, exclusions, densité et pagination du document. |
| Non-régression des lots précédents | Les parcours Chrome du Lot 4 sur 12 clients et du Lot 5 avec le vrai SessionPlayer mobile aboutissent. Le build et les 53 contrôles smoke passent. |

Le test statique `scripts/testClientWeekSessions.mjs` échoue sur la branche et sur une archive indépendante de `866241d`. Il recherche littéralement `selected?.program.id` dans le parcours client, dont le JSX utilise `selected?.program?.id`. Le test et le parcours qu’il inspecte sont identiques aux deux révisions. Cet échec préexistant est distinct des tests calendrier exécutés ci-dessus.

## 6. Sécurité

- L’API vérifie le responsable, le club effectivement autorisé et la session Firebase. Avant de rendre les lignes d’une attente, elle revérifie le profil, le club et le marqueur de révocation. Dans le test, le changement de club pendant l’attente produit un refus 403, même lorsqu’un ancien rendez-vous réveille l’attente. Un compte client ne peut pas ouvrir la période privée du club.
- Un identifiant de dossier tiers mélangé à un lot de participants autorisés ne fournit ni nom ni pack. Le membre reçoit uniquement la projection publique du cours, son propre état et sa position. Après transfert de club, sa demande de mutation sur l’ancien club est refusée.
- La fusion d’une séance liée n’expose que son statut et sa difficulté ; le lien avec le rendez-vous ou le dossier est vérifié. Les autorisations de lecture des séances côté navigateur restent celles de Firestore. Un client ne peut pas se réattribuer une séance professionnelle.
- Les vérifications de capacité, de dates d’inscription, de présence, de réservation, de crédit et d’annulation restent dans les routes métier. Le résultat de lecture en mémoire ne permet aucune mutation. Les 82 scénarios de règles Firestore passent sur émulateur.

## 7. Risques résiduels et reproduction

Le calendrier personnel du Coach conserve une vue confirmée de l’historique pour les indicateurs et les crédits. Celui du Client charge les deux intervalles historiques complémentaires pour les statistiques et la reprise des anciennes validations. Le Lot 6 évite de reconstruire ces historiques à chaque navigation ; l’ouverture initiale d’un très gros dossier conserve ce coût. Le transport de l’émulateur peut également transmettre une vue complète lorsqu’un seul document change.

L’accueil Club doit encore rechercher les données sources des indicateurs. Les limites historiques des sélections récentes et des bilans détaillés demeurent, notamment les programmes affectés des 200 premiers dossiers et les bilans nutritionnels des 80 premiers. Les compteurs de sections reposant sur une sélection récente ne constituent pas un inventaire exhaustif d’un club de 500 dossiers. Pour garder le prochain rendez-vous exact avec les filtres, l’accueil peut lire les événements futurs au-delà de la semaine affichée. Les anciennes dates en texte ou en objet et les durées atypiques nécessitent des lectures de compatibilité ; elles sont mutualisées pour les calendriers Club ouverts sur une même instance. Un club composé majoritairement de tels enregistrements mérite une mesure distincte.

Les attentes émettent du trafic d’autorisation même au repos. Les abonnements serveur se partagent à l’intérieur d’un processus ; des instances API indépendantes peuvent ouvrir leurs propres écoutes. Une réponse autorisée n’est pas une garantie de retrait instantané de l’écran lorsque l’appareil est hors ligne. L’attente nominale de 24 secondes, les interruptions réseau et les limites de révocation Auth externe documentées précédemment restent pertinentes. Les échéances, les soldes affichés et les classes de membres conservent des rafraîchissements ciblés ; les transactions de réservation recalculent le crédit à partir des sources, avec un coût potentiellement important pour un détenteur de packs anciens. Aucun coût réel Firebase de production n’a été mesuré.

Pour reproduire depuis la racine du dépôt avec Java 21, Firebase CLI et Chrome :

```sh
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
export TZ=Europe/Paris
for revision in before after; do
  for size in 0 12 100 500; do
    node scripts/runCalendarLot6.cjs "$revision" "$size" 1440
  done
  node scripts/runCalendarLot6.cjs "$revision" 12 500
  node scripts/runCalendarLot6.cjs "$revision" 12 1440 0 coach
  node scripts/runCalendarLot6.cjs "$revision" 12 1440 0 client
done
firebase emulators:exec --config firebase.performance-test.json --project demo-byl-performance --only auth,firestore 'node scripts/testCalendarLot6.cjs'
npm run test:security-rules
node scripts/testClubSessionPacks.cjs
node scripts/testClubClassBooking.cjs
node scripts/testClubMemberships.cjs
node scripts/testClubSubscriptions.cjs
node scripts/testClubRecurrence.cjs
node scripts/testClubGroupClass.cjs
node scripts/testClientCancellationInbox.cjs
node scripts/testClientSessionCancellation.cjs
node scripts/testCoachSessionCreation.cjs
node scripts/testCoachSessionMove.cjs
node scripts/testCoachSessionCalendarStatus.mjs
node scripts/testClubPlanningPdf.mjs
node scripts/testCoachDashboardLoading.mjs
node scripts/testClientCreationDelivery.cjs
npm --prefix functions test
npm run test:smoke
npm run build
```

La ligne JSON `LOT6` donne les résultats par parcours. Les scripts exigent un projet de démonstration et des ports loopback. La messagerie et les services étrangers au parcours sont isolés du banc ; le chiffrage ne leur attribue aucun gain. Aucun envoi d’email ni service de paiement externe n’est nécessaire.

## 8. Recommandations pour la phase finale de performance et de sécurité

En préproduction autorisée, vérifier la disponibilité des six index, le plan des requêtes de période et d’échéances, les lectures facturées et le trafic par instance. Mesurer séparément les clubs avec beaucoup de cours futurs, de dates anciennes non normalisées et de packs avec historique. Tester une perte réseau pendant une attente, un redémarrage API derrière le proxy et un transfert de club pendant une réservation et pendant l’affichage. Vérifier les latences sur appareil mobile physique et la concurrence réelle pour les derniers crédits d’un pack.

Le retour au commit du Lot 5 ne requiert aucune migration de données. Les index ne doivent être retirés qu’après vérification des versions de lecteurs qui les utilisent. La qualification de sécurité et les conditions de préproduction des lots précédents restent applicables.
