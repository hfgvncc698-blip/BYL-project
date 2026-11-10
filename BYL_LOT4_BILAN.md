# BYL · Lot 4 — Dashboard Coach et page Clients

Branche `codex/firebase-performance-audit`. Référence du Lot 3 : `bff7eaf`. Tests locaux sur données synthétiques, avec Firebase Auth, Firestore et Chrome. Aucun déploiement.

## 1. Causes identifiées

- La page Clients lançait trois recherches de propriétaires, puis lisait les programmes, les séances effectuées et les bilans nutritionnels de chaque dossier pour calculer les lignes. Le retour depuis le Dashboard recommençait ce travail malgré la présence d’un aperçu.
- Le Dashboard cumulait lectures ponctuelles et abonnements du calendrier sur des champs historiques qui se recouvrent. Une notification calendrier ou une reprise de focus réexécutait la collecte des dossiers, programmes et progressions. Sur la fixture originale du Lot 1, un changement de calendrier déclenchait 30 opérations SDK ponctuelles et retournait 72 documents, en plus des notifications et d’un appel aux modèles.
- Un coach propriétaire uniquement via le tableau `coachIds` pouvait accéder à son dossier individuellement. Les règles rejetaient pourtant sa requête `array-contains`. Les fixtures mixtes de 12 et 100 dossiers ne présentaient donc que 8 et 67 dossiers avant le Lot 4. Les limites par requête tronquaient aussi les grandes listes.
- Un aperçu ancien ne prouvait ni la fraîcheur des indicateurs ni la persistance des droits. Les montages des deux pages ne partageaient pas de confirmation serveur pour le répertoire.

## 2. Architecture retenue

**Répertoire et calendrier.** Une source par session authentifiée, cible, club et droits mutualise les promesses et les écouteurs. Le répertoire utilise une requête OU sur les trois formes de propriété, ordonnée par identifiant. La première fenêtre contient 25 dossiers, les suivantes jusqu’à 100. Lorsqu’une frontière change, les fenêtres suivantes sont reconstruites. La page affiche 25 lignes à la fois. Recherche, filtres et compteurs portent sur le répertoire complet. Le calendrier combine les champs autorisés et utilise le client précédent et le nouveau pour invalider une séance transférée. Le champ historique `ownerId` seul ne confère aucun droit au coach.

**Données de liste.** La liste utilise les informations déjà disponibles en mémoire, puis une API de résumés par groupes de 25. Les lignes visibles passent en premier. Les compteurs globaux exigent encore de compléter les autres groupes. Le navigateur ne télécharge pas les historiques pour construire la liste. Les modèles à attribuer sont chargés à l’ouverture de l’action. Les critères métier de la progression et de la dernière activité conservent les formats historiques. La prochaine séance et les indicateurs du Dashboard restent calculés à partir du calendrier et des programmes.

**Écritures et fraîcheur.** Au premier besoin, le serveur peut créer une synthèse par dossier et variante sport/nutrition dans `coachPageLists/{clientId}/coachClientListViews`. Elle contient des valeurs numériques et des dates nécessaires aux compteurs glissants. Sa réutilisation vérifie les droits, la version du dossier et une ancienneté maximale d’une heure. Les index automatiques de ces champs sont exemptés. Une synthèse de plus de 128 Kio est calculée à la demande. Quatre déclencheurs avec reprise signalent sur le dossier les changements de programme, de séance effectuée, de bilan et de retour nutritionnel. Un changement de modèle signale ses propriétaires concernés. Le nettoyage après suppression vérifie le dossier en transaction, y compris après recréation sous le même identifiant.

**Dashboard.** Les données complètes nécessaires aux actions et aux statistiques restent disponibles. Le chargement groupe jusqu’à huit dossiers par appel et limite à trois appels simultanés. En cas de route absente ou de réponse trop volumineuse, les lectures SDK autorisées prennent le relais. Le cache mémoire a une durée de cinq minutes. Une notification invalide le domaine et le dossier concernés. Le retour au premier plan réconcilie les données échues. La perte de connexion conserve un indicateur de fraîcheur. La session vérifie le profil, ignore les réponses d’un ancien périmètre et écarte les aperçus persistants hérités. Entre onglets, Firestore peut mutualiser ses abonnements et les synthèses serveur sont réutilisables après contrôle des droits. Les réponses HTTP privées ne circulent pas entre fenêtres.

## 3. Fichiers modifiés

| Périmètre | Fichiers |
|---|---|
| Pages et contrôle du profil | `src/components/CoachDashboard.jsx`, `src/components/Clients.jsx`, `src/components/dashboard/CoachPageAccess.jsx`, `src/utils/useCoachPageViewer.js` |
| Répertoire, progression et cache | `src/utils/coachPageSource.js`, `coachDirectoryFeed.js`, `coachListRows.js`, `coachProgramBatch.js`, `pageDataCache.js` (même répertoire) |
| API et instrumentation | `src/utils/api.js`, `src/utils/browserMetrics.js`, `src/utils/firestoreMetrics.js`, `backend/routes/coachProgramRead.js`, `backend/utils/coachClientListSummary.js`, `backend/utils/coachPageWire.js`, `backend/utils/firestoreMetrics.js` |
| Révisions et sécurité | `functions/index.js`, `functions/coachPageRevision.js`, `firestore.rules`, `firestore.indexes.json` |
| Mesures et régressions | `scripts/{runCoachPagesLot4,measureCoachPagesLot4,testCoachPagesLot4,measureFirebaseBrowser,measureFirebaseLot1,testFirestoreRules}.cjs`, `scripts/fixtures/{coachPagesLot4.jsx,coachNetworkProbe.cjs,firebaseLot1Browser.jsx}`, `scripts/{smokeCriticalFlows,testCoachDashboardLoading}.mjs` |

Les utilitaires existants de concurrence et de snapshots du Dashboard ont été examinés et réutilisés là où leur périmètre convenait.

## 4. Mesures avant et après

Deux programmes et deux historiques par dossier, une séance calendrier par dossier et un bilan nutritionnel tous les cinq dossiers. Dans chaque exécution, Clients ouvre en premier, puis le Dashboard, puis les deux pages à chaud. « Dashboard ouverture » désigne donc sa première ouverture après Clients. La référence utilise les sources frontend et règles du Lot 3 avec les mêmes sondes. Les endpoints ajoutés au Lot 4 ne sont pas appelés par l’ancienne version.

Dans les tableaux, **web** donne opérations SDK / documents / estimation. Pour les écouteurs, on compte leur démarrage et les changements serveur, et non la taille de la vue reconstruite à chaque notification. Les lectures ponctuelles depuis le cache peuvent retourner des documents pour une estimation nulle. **API** donne appels HTTP / opérations SDK backend / documents retournés / estimation. Les API programmes, modèles et résumés sont incluses. Les écritures sont les synthèses créées durant la requête. Le trafic est le volume décodé Firestore et API programmes observé sur la fenêtre, arrondi en Kio. Le trafic Firestore partagé peut inclure une activité concomitante. Le tas JS est un échantillon en Mio, sensible au ramasse-miettes. L’estimation exclut notamment les lectures dépendantes des règles et les entrées d’index. Aucune facture réelle n’a été mesurée.

L’affichage chronomètre la première présence du nom synthétique dans le DOM, puis l’état prêt du cœur de page. « — » indique que la sonde n’a pas vu le nom avant cet état ou que le répertoire était vide. Ces temps locaux incluent le démarrage React et l’authentification du profil. Des tests ont tourné simultanément sur la machine. Les valeurs représentent une exécution, sans percentile ni garantie de latence.

### 0 dossiers · desktop 1 440 px

| Parcours | Version | Web | API | Écritures | DOM / prêt (ms) | Trafic (Kio) | Tas (Mio) |
|---|---|---|---|---:|---:|---:|---:|
| Clients ouverture | avant | 6 / 0 / 2 | 0 / 0 / 0 / 0 | 0 | — / 581 | 1 | 58 |
| Clients ouverture | après | 2 / 1 / 2 | 0 / 0 / 0 / 0 | 0 | — / 1699 | 1 | 60 |
| Dashboard ouverture | avant | 13 / 2 / 9 | 1 / 2 / 1 / 2 | 0 | — / 895 | 3 | 72 |
| Dashboard ouverture | après | 6 / 3 / 5 | 1 / 2 / 1 / 2 | 0 | — / 1255 | 3 | 83 |
| Clients retour | avant | 3 / 0 / 2 | 0 / 0 / 0 / 0 | 0 | — / 157 | 1 | 81 |
| Clients retour | après | 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 | — / 55 | 0 | 89 |
| Dashboard retour | avant | 13 / 3 / 7 | 1 / 2 / 1 / 2 | 0 | — / 692 | 5 | 102 |
| Dashboard retour | après | 4 / 3 / 2 | 0 / 0 / 0 / 0 | 0 | — / 262 | 0 | 102 |

### 12 dossiers · desktop 1 440 px

| Parcours | Version | Web | API | Écritures | DOM / prêt (ms) | Trafic (Kio) | Tas (Mio) |
|---|---|---|---|---:|---:|---:|---:|
| Clients ouverture | avant | 38 / 42 / 48 | 0 / 0 / 0 / 0 | 0 | 1682 / 3099 | 31 | 70 |
| Clients ouverture | après | 2 / 13 / 13 | 1 / 53 / 64 / 87 | 12 | 1042 / 1318 | 8 | 63 |
| Dashboard ouverture | avant | 59 / 81 / 93 | 1 / 2 / 1 / 2 | 0 | 750 / 3821 | 52 | 144 |
| Dashboard ouverture | après | 7 / 16 / 17 | 3 / 46 / 63 / 68 | 0 | 175 / 1112 | 14 | 81 |
| Clients retour | avant | 35 / 42 / 48 | 0 / 0 / 0 / 0 | 0 | 85 / 1317 | 41 | 133 |
| Clients retour | après | 12 / 2 / 12 | 0 / 0 / 0 / 0 | 0 | 88 / 88 | 6 | 90 |
| Dashboard retour | avant | 55 / 69 / 77 | 1 / 2 / 1 / 2 | 0 | 86 / 2836 | 59 | 127 |
| Dashboard retour | après | 4 / 3 / 2 | 0 / 0 / 0 / 0 | 0 | — / 218 | 0 | 117 |
| Séance distante | avant | 30 / 88 / 88 | 1 / 2 / 1 / 2 | 0 | 18 / 2499 | 45 | 177 |
| Séance distante | après | 3 / 1 / 5 | 1 / 7 / 6 / 8 | 0 | 82 / 592 | 11 | 134 |
| Premier plan | avant | 30 / 64 / 64 | 1 / 2 / 1 / 2 | 0 | 58 / 2458 | 31 | 80 |
| Premier plan | après | 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 | 70 / 365 | 0 | 139 |

### 100 dossiers · desktop 1 440 px

| Parcours | Version | Web | API | Écritures | DOM / prêt (ms) | Trafic (Kio) | Tas (Mio) |
|---|---|---|---|---:|---:|---:|---:|
| Clients ouverture | avant | 274 / 348 / 402 | 0 / 0 / 0 / 0 | 0 | 579 / 11895 | 255 | 88 |
| Clients ouverture | après | 3 / 101 / 101 | 4 / 420 / 524 / 712 | 100 | 2349 / 4990 | 63 | 72 |
| Dashboard ouverture | avant | 373 / 653 / 730 | 1 / 2 / 1 / 2 | 0 | 954 / 34411 | 443 | 170 |
| Dashboard ouverture | après | 18 / 106 / 116 | 14 / 354 / 514 / 541 | 0 | 146 / 3861 | 111 | 143 |
| Clients retour | avant | 271 / 348 / 402 | 0 / 0 / 0 / 0 | 0 | 300 / 11559 | 301 | 149 |
| Clients retour | après | 9 / 1 / 9 | 0 / 0 / 0 / 0 | 0 | 139 / 139 | 1 | 142 |
| Dashboard retour | avant | 361 / 551 / 618 | 1 / 2 / 1 / 2 | 0 | 137 / 29954 | 447 | 259 |
| Dashboard retour | après | 4 / 3 / 2 | 0 / 0 / 0 / 0 | 0 | — / 551 | 2 | 182 |
| Séance distante | avant | 207 / 735 / 735 | 1 / 2 / 1 / 2 | 0 | 40 / 22302 | 361 | 255 |
| Séance distante | après | 4 / 2 / 5 | 1 / 7 / 6 / 8 | 0 | 75 / 674 | 61 | 224 |
| Premier plan | avant | 207 / 535 / 535 | 1 / 2 / 1 / 2 | 0 | 80 / 20312 | 254 | 250 |
| Premier plan | après | 9 / 1 / 10 | 0 / 0 / 0 / 0 | 0 | 101 / 459 | 0 | 230 |

### 500 dossiers · desktop 1 440 px

| Parcours | Version | Web | API | Écritures | DOM / prêt (ms) | Trafic (Kio) | Tas (Mio) |
|---|---|---|---|---:|---:|---:|---:|
| Clients ouverture | avant | 233 / 539 / 587 | 0 / 0 / 0 / 0 | 0 | 1361 / inachevé à 45236 | 329 | 197 |
| Clients ouverture | après | 7 / 501 / 501 | 20 / 2100 / 2620 / 3560 | 500 | 2316 / 13900 | 313 | 64 |
| Dashboard ouverture | avant | 511 / 2330 / 2460 | 1 / 2 / 1 / 2 | 0 | 2000 / inachevé à 45031 | 1143 | 314 |
| Dashboard ouverture | après | 6 / 503 / 504 | 64 / 1754 / 2564 / 2691 | 0 | 156 / 4730 | 511 | 229 |
| Clients retour | après | 12 / 3 / 12 | 0 / 0 / 0 / 0 | 0 | 177 / 177 | 2 | 225 |
| Dashboard retour | après | 4 / 3 / 2 | 0 / 0 / 0 / 0 | 0 | — / 2136 | 0 | 194 |
| Séance distante | après | 0 / 1 / 1 | 1 / 7 / 6 / 8 | 0 | 72 / 1972 | 271 | 290 |
| Premier plan | après | 1 / 0 / 1 | 0 / 0 / 0 / 0 | 0 | 314 / 1433 | 0 | 164 |

**Lecture des résultats.** À 100 dossiers, le retour sur Clients passe de 11 559 à 139 ms et de 402 à 9 lectures estimées web + API. Le changement distant passe de 737 à 13 lectures estimées. À 500 dossiers, les deux ouvertures historiques sont inachevées au seuil de 45 secondes. Leurs volumes sont des mesures partielles. Après correction, la liste complète est prête en 13,9 s au premier passage, puis en 177 ms au retour. Le Dashboard de 500 dossiers nécessite encore 2,14 s pour redevenir prêt à chaud. À zéro dossier, l’ouverture initiale est plus lente que la référence. À 100 dossiers, la première construction de la liste représente 813 lectures estimées et 100 écritures, contre 402 lectures pour l’ancienne liste incomplète. Les deux versions ne rendent donc pas toujours le même nombre de dossiers. Le gain démontré concerne surtout les retours et les changements ciblés.

**Attribution par domaine, fixture mixte de 12.** À l’ouverture de Clients, le navigateur reçoit 12 dossiers et un profil. Le backend retourne 12 racines autorisées, 24 programmes, 24 historiques, trois bilans et un profil. Les vérifications de révocation et de synthèses manquantes participent aux 87 lectures backend estimées. Au premier Dashboard, le calendrier reçoit 12 séances dans un abonnement. L’API de détail retourne 24 programmes et 24 historiques en deux appels. L’API de modèles retourne un document dans un autre appel. Les bilans et retours nutritionnels du Dashboard peuvent terminer après l’état prêt et apparaître dans la fenêtre suivante. L’appel aux offres (2 opérations SDK, 1 document, estimation 2) est exclu des totaux. La messagerie et les workers ne contribuent à aucun gain annoncé.

Lors de la modification distante d’une séance rattachée à un dossier, le serveur relit deux marqueurs de révocation, un profil, une racine de dossier, deux programmes et leurs deux historiques. Cela donne sept opérations, six documents retournés et huit lectures estimées pour les programmes et le contrôle d’accès ensemble, à 12 comme à 500 dossiers. Le navigateur reçoit un changement calendrier. À 500 dossiers, son trafic Firestore atteint encore 271 Kio sur la fenêtre : la taille du transport et la taille de la vue calendrier restent à surveiller même lorsque le nombre de documents modifiés est faible.

**Contrôle croisé sur la fixture originale du Lot 1.** Ses 12 dossiers ont des alias de propriété qui se recouvrent. Sur le retour Clients, 39 lectures ponctuelles navigateur et 48 documents avant deviennent zéro lecture ponctuelle et zéro appel de résumés. Sur son événement calendrier, qui n’identifie pas de dossier de progression à recharger, on observe après un changement serveur et zéro appel programmes. Son ouverture Clients à froid est passée de 1 036 à 4 256 ms sur ces deux passages. La sonde historique a livré les mesures avant une erreur de fermeture de l’émulateur lors du premier passage. La matrice mixte ci-dessus utilise des exécutions terminées avec succès.

## 5. Tests de sécurité

- Les tests des règles sur émulateur passent (82 scénarios). La recherche OU accepte le propriétaire historique autorisé, exclut les tiers et les pseudo-tableaux, et refuse les recherches globales ou avec un abonnement expiré. Le signal des modèles est lisible par son coach. Les écritures de signaux et l’accès direct aux synthèses par le coach sont refusés.
- Le test API utilise Auth et Firestore réels sur émulateurs. Il couvre lot contenant un identifiant étranger, prévisualisation admin, remplacement du propriétaire, révocation, changement de rôle et retrait de permission nutrition. Les contrôles portent sur chaque dossier avant la lecture de sa synthèse. La transaction et les contrôles d’authentification restent nécessaires en cas de synthèse déjà chaude.
- En navigateur desktop et mobile, la suppression de l’accès à un dossier pendant un changement de club retire sa ligne. Une réponse HTTP volontairement retenue jusqu’au changement de rôle ne réaffiche aucun dossier. Après déconnexion et ouverture sous un autre compte, aucun nom synthétique de l’ancien compte ne réapparaît. La qualification de la révocation externe Firebase Auth du Lot 2B.2 reste applicable.

## 6. Tests de synchronisation et reproduction

| Parcours sur 12 dossiers | Desktop | Mobile (500 px) |
|---|---:|---:|
| Programme modifié, total planifié +1 | 696 ms | 479 ms |
| Validation, total effectué +1 | 519 ms | 453 ms |
| Suppression de la validation, retour au total précédent | 776 ms | 498 ms |
| Reconnexion, cœur du Dashboard prêt | 394 ms | 228 ms |
| Retour au premier plan avec cache périmé, trois appels programmes/modèles | 704 ms | 531 ms |
| Second onglet prêt après les mutations | 464 ms | 908 ms |
| Retour à la liste après fermeture du second onglet | 83 ms | 84 ms |

- Le second onglet effectue un appel de résumés, neuf opérations serveur, 30 documents retournés et 32 lectures estimées. Onze synthèses sont réutilisées, une est reconstruite. Ces chiffres HTTP couvrent les deux fenêtres. La sonde réseau finale observe l’onglet principal. La donnée mémoire sensible reste propre à chaque session d’onglet.
- Pagination et recherche vérifiées dans le DOM à 100 et 500 dossiers : 25 lignes au premier écran, dossier de la page suivante présent puis recherche du dernier dossier. Les fixtures à zéro dossier atteignent l’état prêt. Le test API vérifie deux programmes, les anciens compteurs, les dates et le glissement hebdomadaire, la validation, la suppression, l’invalidation et la recréation d’un dossier. Avec la persistance désactivée, les résultats métier sont identiques. Le test unitaire sur un dossier passe de 8 opérations SDK / 6 documents / 9 lectures estimées à 5 / 3 / 5 pour le second appel.
- Le test hors ligne coupe le réseau du SDK, observe l’indicateur puis réactive le réseau. Il vérifie le rattrapage d’une session déjà confirmée. Le vieillissement artificiel est limité à l’horloge du cache des pages. La mutation de programme et de progression appelle le même gestionnaire de révision que la fonction. Le délai de livraison réel d’un événement Cloud Functions reste à mesurer en préproduction.
- Build et budgets respectés, dont 69,9 Kio sur 70 pour le Dashboard. Les 53 contrôles smoke, la suite de chargement coach, le transport incrémental des modèles et les tests du package Functions passent.

Depuis la racine, avec les dépendances du projet, Java 21, Firebase CLI et Chrome local (variable `BYL_CHROME` si nécessaire) :

```sh
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
for n in 0 12 100 500; do
  node scripts/runCoachPagesLot4.cjs before "$n" 1440
  node scripts/runCoachPagesLot4.cjs after "$n" 1440
done
node scripts/runCoachPagesLot4.cjs after 12 500
firebase emulators:exec --config firebase.performance-test.json --project demo-byl-performance --only auth,firestore 'node scripts/testCoachPagesLot4.cjs'
npm run test:security-rules
npm run test:coach-loading
node scripts/testDashboardTemplates.cjs
npm run test:smoke
npm --prefix functions test
npm run build
```

Les lignes JSON `LOT4` produites par chaque commande contiennent les fenêtres, compteurs navigateur, domaines et mesures API. Les données de test sont synthétiques. Les compteurs opérationnels utilisent des noms de collection autorisés et des valeurs numériques.

## 7. Risques résiduels et réversibilité

- Un premier accès massif paie la construction par dossier et la confirmation d’identité. Les groupes de 25 bornent une requête, mais les filtres globaux nécessitent finalement tout le répertoire. Le premier affichage de 500 dossiers prend 2,32 s et le calcul des indicateurs continue. Le Dashboard lit encore les historiques à froid pour préserver ses actions et ses statistiques exactes. Le tas JS atteint 290 Mio au point de mesure suivant une mutation à 500 dossiers. À vérifier sur des mobiles physiques, des historiques beaucoup plus profonds et un réseau contraint.
- Chaque événement programme/progression/nutrition ajoute habituellement une écriture de révision sur le dossier, plus la reconstruction ultérieure d’une synthèse demandée. Un transfert de modèle signale les deux propriétaires. Les livraisons répétées peuvent ajouter des rafraîchissements. Quantifier les déclencheurs préexistants sur les mises à jour de racine, la contention des transactions, les reprises et les coûts réels sur une préproduction autorisée. La fenêtre entre mutation et révision dépend de la livraison des événements.
- Une vérification réseau peut différer l’ouverture depuis un nouvel onglet ou une nouvelle identité. Une session déjà confirmée peut afficher sa dernière vue pendant une coupure. Aucun délai de retrait instantané hors connexion n’a été établi. Les chronomètres « prêt » ne constituent pas une mesure du rendu intégral de tous les widgets.
- Aucune migration de masse. Pour revenir au calcul immédiat, `BYL_COACH_LIST_VIEWS=off` désactive la lecture et l’écriture des synthèses par l’API. Les données métier d’origine restent la source du calcul. Un retour complet aux versions précédentes des pages, de l’API, des fonctions et des règles doit être coordonné. Les synthèses et signaux peuvent ensuite être retirés séparément après vérification en préproduction. Aucun effacement opérationnel n’a été exécuté.

## 8. Recommandations pour les lots suivants

Mesurer séparément l’ouverture du Dashboard Client, le détail de progression et le calendrier pour le même dossier. Vérifier les comptes avec plusieurs programmes, les dates limites, l’annulation d’une validation et une séance transférée. Pour le calendrier, comparer le volume effectivement transmis sur une fenêtre visible et sur un historique long. Pour la progression, comparer le coût d’un résumé exact au coût de lecture d’un historique profond, y compris le coût des écritures et des corrections rétroactives.

Le Lot 4 peut être examiné sur la branche dédiée. L’ouverture à froid des grandes listes, la livraison des révisions et les conditions de sécurité et de préproduction des lots précédents restent à qualifier avant publication.
