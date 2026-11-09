# BYL — Lot 2A, offres du dashboard coach

Branche `codex/firebase-performance-audit`. Référence avant correction : `4e65de8254a2052ca76e65bc18f348f61ecb7811`, lot 1 validé. Les chiffres ci-dessous concernent les offres. Le calendrier et les autres domaines du dashboard conservent leurs chargements existants.

**Résultat.** À la première ouverture sans contrat, un seul appel HTTP renvoie un seul document Firestore, contre 851 documents dans le passage validé du lot 1. Le retour à chaud et les 62 secondes de repos ne déclenchent aucune lecture d’offres. Avec deux contrats, la validation distante d’une séance passe de 494 à 7 documents retournés dans le rejeu comparatif.

## Causes identifiées

1. La carte « Aujourd’hui » rendait un composant `PriorityCard` défini à l’intérieur de CoachDashboard. Son type React changeait à chaque rendu du dashboard. React démontait puis remontait ses descendants. Avec suffisamment de temps entre deux réponses HTTP, le coordinateur ne pouvait plus regrouper les demandes.
2. Les présentations tablette, grand écran et planning détaillé étaient rendues simultanément dans des conteneurs masqués par CSS. Chaque carte montée lançait l’aperçu des paiements et, hors club, les renouvellements. Sur la fixture à deux contrats, le DOM de départ contenait deux liens vers les paiements, dont un masqué. Sur mobile, les cartes d’offres desktop ne sont pas montées.
3. Chaque instance de `useOfferPreview` chargeait au montage et installait ses propres cycles de 30 secondes et de focus. La Map partageait la dernière réponse publiée mais ne représentait ni la requête en cours ni la durée de validité de cette réponse. Les variations de layout, les rendus du calendrier et les remontages après navigation pouvaient tous redémarrer le chargement.
4. Côté serveur, la lecture du profil et du document d’offres s’accompagnait systématiquement de trois requêtes de séances par `coachId`, `createdBy` et `ownerId`. La fusion intervenait après lecture. L’historique complet sert par ailleurs à afficher les séances hors pack : le supprimer du contrat de l’API existante aurait changé le résultat de la fiche client.

## Corrections

- La carte « Aujourd’hui » renvoie directement le même type de conteneur React. La fonction de présentation locale ne constitue plus le type React de cette carte. Seule la variante correspondant au breakpoint monte les composants d’offres. Les autres cartes gardent leur comportement. Le bloc d’alertes est chargé à la demande. La lecture autorisée démarre en parallèle du module sur la disposition qui affiche les offres.
- Un magasin mémoire par onglet partage l’instantané confirmé et la requête en cours entre les consommateurs du même compte, du même périmètre de rôle et de la même projection. Le dashboard, la page Offres, les modales d’attribution/édition et l’aperçu client utilisent le résumé. La modale d’historique demande le détail. Le retour sur une page réutilise un instantané frais.
- Les commandes utilisent le jeton du titulaire authentifié et la version confirmée. Le serveur contrôle toujours les droits, les conflits, l’affectation et les paiements. Une réponse ancienne ou appartenant à un compte quitté ne peut pas remplacer le nouvel état. À la déconnexion, les instantanés du titulaire sortant sont écartés. Un aperçu admin ne réutilise pas les offres personnelles de l’admin sous l’identité du coach consulté.
- Après une modification d’offre, de contrat ou de paiement, le résultat serveur alimente la projection concernée et invalide les autres. Les onglets du titulaire échangent uniquement un signal d’invalidation. Une réservation, un déplacement, une annulation ou un changement de statut confirmé invalide les crédits concernés. Les listeners de séances **déjà présents** signalent les changements distants. Un coach sans contrat ne recharge pas son résumé pour une simple modification de séance.
- **Fraîcheur choisie : deux minutes** au maximum pour un instantané de consultation. Le focus, le retour visible, la reconnexion et les signaux de mutation anticipent cette échéance. Une page visible revalide aussi à expiration pour rattraper les changements provenant d’un autre navigateur ou d’une ancienne version. L’état périmé ou en erreur ne fournit pas de solde confirmé aux actions. Les badges chargés portent l’heure de dernière vérification. Les vérifications d’une opération engageant un crédit restent transactionnelles côté serveur.
- La projection `/coach-offers?view=summary` vérifie le profil et lit le document d’offres. Sans contrat, elle s’arrête là. Avec contrats, elle ne sélectionne que les séances partagées, liées au coach par l’une des trois clés historiques et à un client sous contrat par l’une des deux clés historiques. Les identités sont groupées par cinq. Le décompte utilise toujours `calculateCoachCredits`, y compris pour l’allocation chronologique et les crédits réservés. Les anciens contrats sans identifiant client exploitable et les index manquants disposent d’un repli exact sur le chemin canonique. Un refus d’autorisation n’utilise pas ce repli.
- La route historique complète reste disponible pour la chronologie, les séances hors pack et les anciens appelants. La vérification de réservation saute la recherche des séances seulement si aucun contrat ne correspond au client et au service. Les transactions de réservation, les règles tarifaires, les montants, les contrôles de version et les rappels de paiement sont conservés.

## Fichiers modifiés

| Fichiers | Intervention |
|---|---|
| `src/components/CoachDashboard.jsx`, `src/components/offers/DashboardOfferAlerts.jsx` | Stabilité de la carte, sélection de la variante visible et signaux après confirmation de séance. |
| `src/components/offers/OfferPreviewStore.js` | Déduplication par périmètre, fraîcheur, invalidation, séparation des comptes et des projections. |
| `src/components/offers/OfferPaymentPreview.jsx`, `OfferRenewalAlerts.jsx`, `OfferClientSummary.jsx` dans le même répertoire | État de chargement ou d’erreur, heure de confirmation, détail historique à la demande. |
| `backend/routes/coachOffers.js`, `backend/utils/coachOffers.js` | Projection autorisée, sélection ciblée et parité avec le calcul canonique. |
| `firestore.indexes.json` | Six index du résumé d’offres, un pour chaque couple de clés coach/client avec visibilité. Déclarations locales uniquement. |
| `src/utils/api.js` | Attribution de la nouvelle URL au compteur HTTP « offers » du lot 1. |
| `scripts/measureCoachOffers.cjs`, `scripts/fixtures/firebaseOffersBrowser.jsx`, `scripts/measureFirebaseBrowser.cjs`, `scripts/measureFirebaseLot1.cjs` | Banc comparatif réutilisant l’émulation, les compteurs et les composants du lot 1. |

## Protocole de mesure

Chrome headless monte CoachDashboard avec un vrai compte Firebase Auth d’émulation, un contexte de rôle synthétique et les règles Firestore du dépôt. Chaque cas repart d’un profil Chrome neuf. Le banc utilise la même fixture de douze clients et douze séances que le lot 1. Le scénario supplémentaire ajoute deux packs et des séances réservées, validées, annulées, hors pack, reliées par des clés anciennes ou appartenant à un autre coach. Chaque révision reçoit les mêmes données.

Les fenêtres mesurent la première ouverture, le retour chaud, 62 secondes sans action et 3,2 secondes après une modification distante. Le compte SDK inclut les lectures de documents et de requêtes faites par les handlers d’offres. Les documents retournés incluent les répétitions et excluent les documents absents. L’estimation documentaire applique le modèle du lot 1 aux lectures réussies. Les frais d’index et les quantités facturées par Cloud Billing ne sont pas mesurés.

## Mesures avant/après

Chaque cellule donne **avant → après** sur deux passages du banc. Les demandes de rafraîchissement sont celles de l’onglet principal. Les appels HTTP, opérations SDK et documents retournés sont comptés côté serveur pour tous les onglets de la fenêtre.

| Scénario | Rafraîchissements | HTTP | SDK | Documents | Estimation documentaire |
|---|---:|---:|---:|---:|---:|
| Ouverture, sans contrat | 212 → 1 | 27 → 1 | 135 → 2 | 999 → 1 | 1026 → 2 |
| Retour chaud, sans contrat | 192 → 0 | 25 → 0 | 125 → 0 | 925 → 0 | 950 → 0 |
| Repos 62 s, sans contrat | 8 → 0 | 2 → 0 | 10 → 0 | 74 → 0 | 76 → 0 |
| Séance distante, sans contrat | 168 → 0 | 19 → 0 | 95 → 0 | 703 → 0 | 722 → 0 |
| Ouverture, deux contrats | 268 → 2 | 37 → 2 | 185 → 6 | 962 → 14 | 962 → 14 |
| Retour chaud, deux contrats | 188 → 0 | 22 → 0 | 110 → 0 | 572 → 0 | 572 → 0 |
| Repos 62 s, deux contrats | 8 → 0 | 2 → 0 | 10 → 0 | 52 → 0 | 52 → 0 |
| Séance distante, deux contrats | 168 → 1 | 19 → 1 | 95 → 3 | 494 → 7 | 494 → 7 |
| Séance sans rapport, deux contrats | 168 → 0 | 19 → 0 | 95 → 0 | 494 → 0 | 494 → 0 |
| Modification de contrat, deux onglets, deux contrats | 0 → 0 | 2 → 2 | 15 → 11 | 78 → 40 | 78 → 40 |
| Reconnexion, deux contrats | 1 → 1 | 1 → 1 | 5 → 3 | 26 → 7 | 26 → 7 |

Le lot 1 validé avait observé **23 appels et 851 documents** à la première ouverture sans contrat. Le nouveau passage du code de référence a produit 27 appels et 999 documents. Dans les deux cas, il y avait 212 demandes de rafraîchissement. Le nombre de requêtes qui se chevauchent assez longtemps pour être regroupées varie avec le rendu et la latence.

Avec deux contrats, une réponse corrigée a coûté trois opérations SDK dans la fixture : profil, document d’offres, requête de séances ciblée. Cinq séances répondaient aux filtres de lecture, puis le calcul canonique a appliqué la priorité des champs de propriété. Le premier montage a entraîné deux chargements dans ce passage : le branchement au calendrier peut entraîner une réconciliation pendant l’initialisation. Au retour chaud et au repos, le compteur est resté à zéro. Une opération de modification de contrat garde ses lectures transactionnelles de contrôle.

Dans la fenêtre de modification de contrat, le second onglet a reçu la quantité confirmée en **29 998 ms avant** et **997 ms après**. Après rétablissement du transport, la confirmation des crédits a pris **28 077 ms avant** et **103 ms après**. Avec l’API en erreur, l’ancien hook gardait ses deux contrats visibles en mémoire avec une erreur. Le nouveau hook rend un état indisponible sans solde. Dans la sonde maintenue montée 200 ms après déconnexion, le nombre de contrats accessibles passe de deux sur la référence à zéro après correction. Le second compte reçoit zéro contrat et zéro échéance.

### Dispositions responsives et temps du dashboard

| Fenêtre et fixture | Documents des offres à l’ouverture | Liens de paiement / renouvellement montés à l’ouverture | Cache principal au retour (ms) | Dashboard prêt, ouverture / retour (ms) |
|---|---:|---|---:|---|
| 1440 px, sans contrat | 999 → 1 | 0 / 0 → 0 / 0 | 49 → 48 | 2197 / 1433 → 2012 / 1374 |
| 1440 px, deux contrats | 962 → 14 | 2 / 2 → 1 / 1 | 30 → 40 | 2950 / 1376 → 2470 / 1296 |
| 850 px, deux contrats | 936 → 14 | 2 / 2 → 1 / 1 | 58 → 57 | 2605 / 1364 → 2443 / 1306 |
| 500 px, deux contrats | 0 → 0 | 0 / 0 → 0 / 0 | 22 → 25 | 831 / 789 → 855 / 850 |

Chrome a imposé une largeur intérieure de 500 px pour la fenêtre demandée à 390 px. Cette largeur a exercé la disposition mobile. Les repères « cache principal » et « prêt » proviennent du dashboard entier. Chaque valeur est une observation locale en mode développement, avec variabilité de rendu et de compilation.

### Disponibilité des offres seules

Une sonde de rendu distincte relève le premier état utilisable du composant et l’acceptation d’une réponse confirmée depuis le montage. Elle permet de mesurer aussi un aperçu vide. Les mesures du premier affichage incluent le module de présentation dans Chrome en mode développement.

| Fixture sur desktop | Premier état utilisable à froid, ms | Première confirmation serveur à froid, ms | Premier état utilisable au retour, ms | Nouvelle confirmation au retour, ms |
|---|---:|---:|---:|---|
| Sans contrat | 146 → 216 | 146 → 145 | 47 → 45 | 132 → cache frais, aucun appel |
| Deux contrats | 155 → 274 | 148 → 142 | 62 → 62 | 109 → cache frais, aucun appel |

Sur ce passage, la réponse fraîche est arrivée à peu près au même moment à froid. Le premier rendu utilisable des offres a été plus tardif après correction, de 70 ms sans contrat et de 119 ms avec contrats. La comparaison à chaud donne un premier état utilisable en 45 à 62 ms après correction. Lors du rejeu complet, l’aperçu corrigé était utilisable à 189 et 190 ms sur les deux fixtures desktop. Ces valeurs décrivent quelques passages locaux et ne permettent pas d’établir un percentile de production.

## Tests fonctionnels

| Vérification | Résultat |
|---|---|
| Parité du résumé avec le calcul historique | Égalité profonde des contrats, de leur historique, des états, des crédits réservés/consommés/disponibles et des échéances vérifiées. Les séances hors pack d’un autre client restent accessibles dans le détail complet. |
| Clés historiques et volumétrie | Test des trois champs coach, des deux champs client, des valeurs en conflit et d’un client étranger. Test sur sept contrats et deux groupes de requête. Le repli pour index manquant donne la même réponse. Un refus de permission est propagé. |
| Contrat, paiement et crédit | Une réservation devient une séance validée : le crédit réservé passe à utilisé une seule fois. L’annulation le libère. La modification de quantité et la confirmation de paiement réussissent. Une version obsolète est refusée avec un 409. |
| Réservation engageante | Les tests historiques de cycle de vie vérifient deux réservations concurrentes du dernier crédit, le déplacement, l’épuisement, la justification d’annulation, ainsi que les rappels explicites et idempotents. Les envois de test sont simulés. |
| Deux onglets | Le second onglet du titulaire reçoit la version du contrat après modification dans le premier. Les deux vérifient les données auprès de l’API. Les requêtes et opérations SDK incluent la transaction de modification. |
| Panne, reconnexion et changement de compte | Le banc coupe l’API des offres avec une réponse HTTP 503 et exerce les événements hors ligne/en ligne. Il vérifie que les crédits indisponibles sont retirés, que le retour en ligne récupère les données, puis que le nouveau titulaire ne voit aucune offre ni aucun paiement du précédent. |
| Mobile, tablette, desktop | Les dispositions tablette et desktop affichent chacune un seul lien de paiement et de renouvellement dans la fixture à deux contrats. La disposition mobile garde son comportement précédent. |
| Tests existants | `test:loading`, `test:coach-loading`, `test:action-loading`, tests d’offres, crédits, cycle de vie, échéanciers, suppression, renouvellements et rappels multilingues réussis. Les **78 tests** des règles Firestore sont passés sur un second émulateur. `npm run build` respecte les budgets gzip existants. |

### Rejouer

Le banc refuse toute base distante et réinitialise la fixture du projet d’émulation dédié. Le code de référence est extrait dans un répertoire temporaire. La branche de travail ne change pas. Utiliser Firebase CLI, Java 21, Chrome et les dépendances du dépôt. `BYL_CHROME` peut désigner un autre emplacement de l’exécutable Chrome.

```sh
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
firebase emulators:exec --config firebase.performance-test.json \
  --project demo-byl-performance --only auth,firestore \
  "node scripts/measureCoachOffers.cjs"
```

Pour répéter seulement les mesures de temps sur desktop, préfixer la commande avec `BYL_OFFERS_TIMING_ONLY=1`. Les sondes de confirmation et de rendu sont injectées uniquement dans les copies temporaires du banc. Elles ne journalisent aucun contenu de contrat.

## Régressions et risques résiduels

- La fraîcheur des soldes engageants repose sur les contrôles serveur existants. Pour une modification provenant d’un autre appareil sans signal local, l’affichage peut attendre la revalidation suivante, jusqu’à deux minutes sur un onglet actif connecté. Le comportement précédent interrogeait l’API toutes les 30 secondes. Le retour au premier plan et la reconnexion anticipent ce délai.
- Le premier chargement de la carte inclut le coût de son module à la demande. Le chargement autorisé commence en parallèle sur desktop et tablette. Les repères d’affichage ci-dessus restent des observations sur émulateur.
- Les index ne sont pas déployés. Leur présence, leur coût de stockage/écriture et le nombre réel de lectures devront être vérifiés sur un projet de préproduction avant toute publication autorisée. Le coût de repli peut rejoindre celui d’un scan historique pour les titulaires avec contrats. Le repli conserve la parité. [Limites des requêtes composées Firestore](https://firebase.google.com/docs/firestore/query-data/queries#query_limitations) · [Index Firestore](https://firebase.google.com/docs/firestore/query-data/index-overview)
- Les packs sans échéance peuvent nécessiter tout l’historique pertinent de leur client. Un cache persistant de soldes ou un nouveau listener Firestore n’a pas été nécessaire. L’onglet qui ouvre explicitement le détail complet supporte toujours le coût de cet historique.
- Les temps, les documents retournés et l’estimation documentaire ne constituent pas une facture. Les chiffres d’octobre ne peuvent pas être extrapolés à partir de ces fixtures.

## Recommandation pour le lot 2B

À validation distincte, reprendre le scénario de messagerie du lot 1 : mesurer le badge et la bulle avec un puis deux onglets, puis vérifier qu’une notification et un accusé de lecture restent corrects sans reconstruction périodique de l’annuaire. Cette recommandation ne change aucun composant de messagerie ou worker.

**Arrêt après le lot 2A.** Les modifications restent locales à la branche dédiée. Aucune publication en production.
