# BYL · Lot 5 — Dashboard Client et progression

Branche `codex/firebase-performance-audit`. Référence avant correction : `a2661ad` (Lot 4). Toutes les mesures utilisent des données synthétiques, Chrome et les émulateurs locaux. Aucun déploiement.

## 1. Causes identifiées

- À chaque notification de la collection des programmes, le Dashboard republiait toutes les cartes avec zéro séance effectuée, puis relisait tous les `sessionsEffectuees`, les deux variantes historiques des notes et, selon les données, les auteurs. Modifier un seul programme invalidait ainsi les autres.
- Le calendrier écoutait déjà les mêmes historiques. Ses notifications créaient les événements manquants mais ne mettaient pas à jour les compteurs du Dashboard. Modifier uniquement un historique pouvait laisser la progression affichée inchangée jusqu’à la notification suivante du programme.
- ProgramView reprenait une écoute du fil. SessionPlayer lançait une requête de reprise par index et écoutait aussi l’historique complet pour les performances et charges antérieures. La page Statistiques combinait lecture ponctuelle des 100 premiers programmes et abonnement au même répertoire complet.
- La fonction de validation vérifiait l’éligibilité au message de fin de programme en lisant tous les documents d’exécution, même si les premières exécutions suffisaient à établir le résultat.

## 2. Architecture retenue

**Une source canonique par dossier et programme.** Le Dashboard partage un abonnement SDK entre calcul de progression et rattrapage du calendrier. ProgramView et SessionPlayer peuvent rejoindre la même source. L’identifiant du dossier fait partie du chemin, y compris quand deux suivis utilisent le même identifiant de programme. Une modification du programme réutilise le dernier historique confirmé. Une modification d’exécution recalcule le programme concerné. Une suppression retire réellement l’exécution. Des répétitions au même index restent des exécutions distinctes.

**Résumé en mémoire.** Le résumé est associé à la version immuable du snapshot SDK. Un parcours en mémoire détermine le nombre brut, les index validés, la dernière date et le dernier enregistrement. Le Dashboard conserve ses calculs de plafond, de pourcentage, de reprise partielle et de prochaine séance. Un changement de difficulté ou de programme peut réutiliser le résumé. Les historiques détaillés restent accessibles dans les vues qui les utilisent. SessionPlayer conserve l’historique interprogrammes pour les anciennes charges et modifications. L’alias sans accent des difficultés prend le relais lorsque la collection prioritaire est vide ou inaccessible.

**Affichage et admission.** Le répertoire confirmé permet d’afficher les intitulés et de naviguer pendant le calcul. Le pourcentage global de la carte programmes reste en attente tant que sa valeur est incomplète. Une mise à jour ordinaire conserve les résultats déjà confirmés. Les données en mémoire appartiennent à la session Firebase, au rôle, au club, au dossier et à la prévisualisation concernés. Une écoute reste disponible deux secondes après le départ du dernier consommateur pour le passage entre pages. Elle se ferme ensuite. À la déconnexion ou au refus serveur, les références concernées sont écartées. Un snapshot local seul ne permet pas d’admettre une nouvelle session. Les commandes métier continuent à passer par les règles et les contrôles existants.

**Concurrence à froid.** Au plus quatre abonnements attendent simultanément leur première confirmation serveur. Une fois confirmés, ils continuent à recevoir les changements. En lançant tous les historiques simultanément, l’émulateur a signalé plus de 10 000 messages en attente sur le canal de retour. Le plafonnement a permis de terminer la fixture de 20 000 exécutions.

**Backend.** Le déclencheur de validation lit en transaction de lecture seule uniquement les champs utilisés par son prédicat historique. Il s’arrête lorsque le nombre d’exécutions valides atteint le seuil. Les pages suivantes couvrent les index anciens et les entrées partielles. La vérification existante avant l’envoi planifié de l’email reste en place.

## 3. Fichiers modifiés

| Fonction | Fichiers |
|---|---|
| Dashboard, calcul et source partagée | `src/components/Clientdashboard.jsx`, `src/utils/clientProgramFeed.js` |
| Joueur, vues manuelle et automatique | `src/components/SessionPlayer.jsx`, `src/components/ProgramView.jsx`, `src/components/AutoProgramPreview.jsx`, `src/hooks/useProgrammeDocument.js` |
| Statistiques | `src/pages/StatisticsPageClient.jsx` |
| Validation serveur | `functions/index.js`, `functions/programCompletionThreshold.js` |
| Banc Chrome et émulateurs | `scripts/runClientProgressLot5.cjs`, `scripts/measureClientProgressLot5.cjs`, `scripts/measureFirebaseBrowser.cjs`, `scripts/fixtures/clientProgressLot5.jsx`, `scripts/fixtures/clientProgressProbe.cjs` |
| Sécurité et régressions | `scripts/testClientProgressLot5.cjs`, `scripts/testPlayerLoadRecovery.mjs`, `scripts/smokeCriticalFlows.mjs` |

## 4. Mesures avant et après

Chaque programme contient deux séances planifiées. Les historiques comportent des exécutions distinctes répétées au même index. Les fixtures à plusieurs programmes alternent les origines automatique et manuelle. La progression brute peut dépasser le nombre prévu, le pourcentage affiché reste plafonné. Même code de fixture, mêmes données et mêmes règles pour les deux révisions.

Les compteurs instrumentent les frontières publiques du SDK des pages et utilitaires testés. Pour une lecture ponctuelle, la sonde compte les documents du résultat. Pour un abonnement, elle distingue la **taille de la vue livrée au composant** et les **documents changés d’origine serveur**. Une notification portant sur une séance peut ainsi présenter une vue de 1 001 documents. Les estimations appliquent un minimum pour les requêtes serveur vides ; les lectures de règles, les index, les reconnexions réellement facturées et le coût monétaire ne sont pas mesurés. Les appels HTTP étrangers à la progression répondent sur un serveur local de fixture. Les flux Cloud Functions sont testés séparément.

Le temps d’affichage indique la première présence du libellé synthétique dans le DOM après lancement du parcours. Le temps de synchronisation indique que le composant a publié le nombre attendu, tous dossiers du scénario compris. Le trafic correspond aux octets Firestore décodés par Chrome sur la fenêtre d’observation ; il inclut les autres écoutes Firestore actives de la page. Le tas JS est un échantillon en Mio. Les tests de charge et certains tests mobile ont tourné simultanément. Ces valeurs locales ne constituent pas des percentiles de production.

### Ouverture et modification de programme

Les colonnes « historiques » comptent l’estimation documentaire du seul domaine `sessionsEffectuees`. Les temps concernent le Dashboard entier.

| Programmes | Séances historiques par programme | Historiques ouverture, avant → après | Historiques modification programme | Premier libellé (ms) | Progression prête (ms) | Retour à chaud prêt (ms) |
|---|---|---|---|---|---|---|
| 0 | — | 0 → 0 | — → — | — → — | 1762 → 1342 | — → — |
| 1 | 10 | 20 → 10 | 10 → 0 | 529 → 625 | 605 → 625 | 625 → 179 |
| 1 | 100 | 200 → 100 | 100 → 0 | 1721 → 1835 | 2033 → 1835 | 502 → 235 |
| 1 | 1000 | 2000 → 1000 | 1000 → 0 | 1369 → 2681 | 2557 → 2681 | 1255 → 298 |
| 5 | 10 | 100 → 50 | 50 → 0 | 1249 → 1620 | 1719 → 2106 | 780 → 264 |
| 5 | 100 | 1000 → 500 | 500 → 0 | 832 → 865 | 1326 → 1428 | 636 → 262 |
| 5 | 1000 | 10000 → 5000 | 5000 → 0 | 1168 → 2003 | 5290 → 5190 | 2996 → 350 |
| 20 | 10 | 400 → 200 | 200 → 0 | 1107 → 1376 | 2041 → 2988 | 1545 → 264 |
| 20 | 100 | 4000 → 2000 | 2000 → 0 | 973 → 1262 | 3307 → 4481 | 2471 → 334 |
| 20 | 1000 | 2000 → 20000 | — → 0 | 1800 → 2336 | inachevé à 120016 → 20416 | — → 376 |

À 20 × 1 000, le passage historique s’est arrêté au seuil de 120 s. Les volumes avant correction y sont partiels. Après correction, le même jeu de 20 000 exécutions atteint l’état attendu. À froid, l’ancienne version pouvait présenter les intitulés plus tôt tout en affichant provisoirement zéro.

### Parcours de référence · 5 programmes × 100 séances

| Parcours | Version | Lectures ponctuelles / écoutes démarrées | Documents présentés, vues incluses | Lectures web estimées | Dont historiques | État attendu (ms) | Trafic (Kio) | Tas JS (Mio) |
|---|---|---|---|---|---|---|---|---|
| Première ouverture | avant | 18 / 11 | 1007 | 1022 | 1000 | 1326 | 255.8 | 110 |
| Première ouverture | après | 1 / 21 | 508 | 521 | 500 | 1428 | 255.1 | 96 |
| Remontage à chaud | avant | 18 / 11 | 1007 | 513 | 500 | 636 | 260.3 | 131 |
| Remontage à chaud | après | 1 / 5 | 3 | 2 | 0 | 262 | 3.9 | 107 |
| Modification de programme | avant | 15 / 0 | 505 | 511 | 500 | 223 | 8.9 | 112 |
| Modification de programme | après | 0 / 0 | 5 | 1 | 0 | 64 | 3.5 | 110 |
| Reprise à 45 % | avant | 0 / 0 | 101 | 1 | 1 | non observé en 1012 | 50.1 | 115 |
| Reprise à 45 % | après | 0 / 0 | 101 | 1 | 1 | 97 | 50.0 | 99 |
| Validation | avant | 0 / 0 | 101 | 1 | 1 | non observé en 1012 | 49.9 | 117 |
| Validation | après | 0 / 0 | 101 | 1 | 1 | 73 | 50.0 | 114 |
| Suppression | avant | 0 / 0 | 100 | 1 | 1 | valeur déjà affichée | 50.0 | 99 |
| Suppression | après | 0 / 0 | 201 | 1 | 1 | 93 | 50.1 | 102 |
| ProgramView | avant | 1 / 2 | 103 | 2 | 0 | 78 | 52.1 | 120 |
| ProgramView | après | 0 / 2 | 4 | 2 | 0 | 61 | 2.1 | 115 |
| SessionPlayer | avant | 7 / 7 | 607 | 106 | 100 | 319 | 303.9 | 133 |
| SessionPlayer | après | 1 / 6 | 3 | 7 | 0 | 210 | 3.7 | 129 |

Le transfert Firestore initial reste du même ordre sur cette fixture : la couche SDK mutualisait déjà une partie du trafic. Lors d’une mutation, les octets décodés peuvent également refléter l’historique complet du programme dans le transport de l’émulateur. Le comptage documentaire ne permet pas de déduire le trafic réseau. Avant correction, les seuls changements d’historique de reprise et de validation n’avaient pas actualisé le compteur dans la fenêtre d’une seconde. Le test de suppression historique retrouvait un nombre déjà affiché, ce qui ne prouve pas que la suppression avait été reçue.

### Parcours fonctionnels chronométrés

| État observé | 1 × 10 desktop (ms) | 1 × 10 mobile 500 px (ms) | 20 × 1 000 desktop (ms) |
|---|---|---|---|
| Reprise à 45 % | 64 | 253 | 435 |
| Validation distante | 51 | 127 | 420 |
| Annulation distante | 65 | 288 | 535 |
| Retour Dashboard | 211 | 179 | 376 |
| Dashboard après validation dans le joueur | 234 | 216 | — |
| ProgramView après validation dans le joueur | 28 | 54 | — |
| Suppression observée dans ProgramView | 26 | 103 | — |
| Validation avec deux onglets | 48 | 65 | — |
| Suppression avec deux onglets | 70 | 169 | — |
| Rattrapage après coupure SDK | 127 | 277 | — |
| Retrait après révocation des liens | 92 | 109 | — |

Pour la grande fixture, le premier libellé apparaît à 2336 ms et la progression complète à 20416 ms. À l’ouverture, Chrome observe 9.63 Mio décodés et un tas JS de 192 Mio. Pour une validation distante, un changement d’historique est comptabilisé, avec 494 Kio Firestore sur la fenêtre.

## 5. Tests fonctionnels

- Chrome a monté les composants réels pour zéro programme et pour les neuf combinaisons de 1, 5 et 20 programmes avec 10, 100 et 1 000 exécutions chacun. Les temps de navigation vers le joueur et les vues détaillées ont été mesurés sur les petites et moyennes fixtures. Les profils desktop et mobile utilisent respectivement 1 440 et 500 px.
- Le scénario à un programme vérifie le passage à 45 % d’une séance interrompue, sa validation puis sa suppression. Sur desktop, la durée du programme a été modifiée en cours de reprise : le total prévu passe de quatre à six, la reprise reste à 45 %, et le nouvel état apparaît en 48 ms. Les exécutions répétées au même index comptent séparément. Le nombre brut est contrôlé lors de la première ouverture et du retour.
- Sur les deux tailles d’écran, le test clique sur **Terminer la séance**, choisit la difficulté 4 et soumet le formulaire du vrai SessionPlayer. Une seule exécution nouvelle existe, la difficulté et le compteur sont visibles sur le Dashboard, puis ProgramView reçoit l’exécution et sa suppression. Le test de feedback atomique couvre aussi l’échec du lot d’écriture et la relance idempotente. Une requête facultative de suggestion de planning a reçu un refus des règles sur cette fixture. La validation et le retour ont abouti.
- Le programme automatique s’ouvre par AutoProgramPreview. La page Statistiques retrouve les cinq programmes. Le test du joueur vérifie aussi la synchronisation des modifications avec le programme affecté et le builder. Les règles de sélection de la dernière séance, des charges antérieures et de la reprise s’appuient toujours sur les données canoniques.
- Deux onglets d’un même profil ont confirmé le même compteur après une validation puis après sa suppression. Les temps du tableau sont ceux de l’onglet principal ; un accusé indépendant est exigé du second. Deux instances du SDK, avec authentifications, caches mémoire et connexions distincts, ont également vérifié coupure, rattrapage, correction et suppression. Ce dernier test simule deux appareils.
- Les 53 contrôles smoke, les tests de reprise, de synchronisation joueur/programme et joueur/builder, de feedback atomique, de sortie de séance, de récupération du joueur et de progression par résultats passent. Les tests du package Functions et le build passent également. Le Dashboard Client atteint 35,0 Kio pour un budget de 35 Kio. SessionPlayer utilise 37,2 Kio sur 38 Kio.

## 6. Sécurité

Les 82 scénarios de règles Firestore passent sur émulateur. Aucune modification des règles, des prix ou des permissions. Dans le test indépendant, le compte tiers ne lit pas l’historique. Un coach du même club peut le lire ; le transfert vers un autre club retire cet accès. Une attribution directe le rétablit ; le passage du rôle coach au rôle particulier retire ensuite la lecture et l’écriture. Après retrait des liens autorisant le dossier, le lecteur connecté reçoit un refus et l’ancien compte ne peut ni relire le document ni le modifier. Le Dashboard retire le programme. La déconnexion suivie de l’ouverture sous un autre compte ne réaffiche aucun programme du compte précédent.

Les pages remettent leur état à zéro lorsque le périmètre d’identité change. Les données de navigation ou le cache disque SDK seuls ne sont pas utilisés pour ouvrir un programme dans un nouveau périmètre. ProgramView et la vue automatique peuvent utiliser un programme provenant d’un abonnement encore confirmé, tandis que la référence modifiable est délivrée par une lecture serveur. Les scénarios du présent lot couvrent la révocation de l’accès au dossier. La limite des anciens jetons après désactivation effectuée uniquement dans Firebase Auth, documentée au Lot 2B.2, demeure applicable.

## 7. Coûts supplémentaires et réversibilité

| Opération | Résultat mesuré ou coût introduit |
|---|---|
| Première construction du résumé du Dashboard | Un parcours en mémoire de l’historique confirmé de chaque programme. À 20 × 1 000, 20 000 documents d’historique présentés à froid, zéro écriture de résumé. |
| Consultation suivante du même snapshot | Réutilisation en mémoire. Au retour immédiat à 5 × 100 et 20 × 1 000, zéro nouvelle lecture d’historique observée. |
| Nouvelle validation, correction, suppression | L’écriture métier porte sur le document canonique. Zéro écriture additionnelle de projection. Le programme touché recalcule son résumé en mémoire. |
| Déclencheur de validation, seuil de quatre, 1 000 exécutions valides | Ancienne lecture complète : 1 000 documents. Nouveau calcul sur émulateur : une requête, quatre documents, résultat identique au second passage. Les tests couvrent aussi un seuil impossible à atteindre et le recalcul après correction et suppression. |
| Notes et modifications | Des écoutes ciblées remplacent des lectures ponctuelles. Une modification de note ou d’historique de modifications peut donc entraîner une lecture supplémentaire pendant une consultation, ce qui permet son affichage à distance. La dernière fermeture libère l’écoute après deux secondes. |

Aucune collection de synthèses, écriture de maintenance, migration, tâche planifiée ni service externe ajouté. Le coût de création d’un résumé **persistant** est donc nul ; le premier chargement des sources conserve le coût indiqué dans les tableaux. Le calcul de seuil projette les champs nécessaires et peut encore parcourir tout le programme si les exécutions valides sont rares. Le balayage planifié avant envoi et les autres fonctions métier n’ont pas été attribués aux économies du navigateur. Le test du seuil mesure le calcul Firestore exécuté par la fonction, sans lancer d’email ni mesurer une facture Cloud Functions. Un retour au code du Lot 4 ne nécessite aucune conversion de données.

## 8. Risques résiduels et reproduction

L’objectif d’affichage presque instantané est atteint sur plusieurs retours à chaud. La première ouverture à 20 000 exécutions reste coûteuse. Les automatismes de calendrier pour les anciennes validations et les règles de reprise utilisent encore l’historique canonique. Un nouvel appareil, une nouvelle identité ou un retour après fermeture des écoutes peut devoir le relire. Des historiques comportant des brouillons d’exercices volumineux peuvent transférer bien plus de données que la fixture. La simulation mobile utilise Chrome desktop redimensionné. Les résultats réseau, mémoire et délais restent à qualifier sur appareil physique et en préproduction autorisée.

La coupure testée porte sur la connexion Firestore déjà ouverte. Une première admission hors ligne ne peut pas valider les droits du dossier. Le retrait observé en ligne ne donne pas de borne de révocation pendant une coupure. Les tests du backend isolent le prédicat de validation et le seuil documentaire ; ils ne mesurent pas la latence de livraison de l’événement Cloud en préproduction.

Reproduction depuis la racine, avec les dépendances installées, Java 21, Firebase CLI et Chrome local. La commande de mesure refuse un projet autre que le projet de démonstration ou des émulateurs hors loopback. Chaque invocation du lanceur crée sa propre configuration temporaire. La ligne JSON `LOT5` contient les chiffres détaillés par parcours et domaine.

```sh
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
for revision in before after; do
  node scripts/runClientProgressLot5.cjs "$revision" 0 10 1440
  for programs in 1 5 20; do
    for history in 10 100 1000; do
      node scripts/runClientProgressLot5.cjs "$revision" "$programs" "$history" 1440
    done
  done
done
node scripts/runClientProgressLot5.cjs after 1 10 500 0 journey
node scripts/runClientProgressLot5.cjs after 1 10 1440 0 journey
firebase emulators:exec --config firebase.performance-test.json --project demo-byl-performance --only auth,firestore 'node scripts/testClientProgressLot5.cjs'
npm run test:security-rules
npm run test:session-resume
npm run test:player-program-sync
npm run test:player-builder-sync
node scripts/testSessionFeedbackAtomic.mjs
node scripts/testPlayerCompletionExit.mjs
node scripts/testPlayerLoadRecovery.mjs
node scripts/testCycleResultsProgression.mjs
npm run test:smoke
npm --prefix functions test
npm run build
```

## 9. Recommandations pour les calendriers et le Dashboard Club

Pour le calendrier, mesurer séparément la lecture de la période visible, la détection des validations historiques sans événement associé et la création d’un événement manquant. Inclure un dossier avec plusieurs années d’historique, les validations corrigées et les changements d’heure. Pour le Dashboard Club, mesurer l’ouverture par rôle, le coût de la première vue, les abonnements simultanés et le volume réseau lors d’un seul changement. Conserver un contrôle du périmètre club avant toute réutilisation de données. Ces parcours relèvent d’un autre lot.
