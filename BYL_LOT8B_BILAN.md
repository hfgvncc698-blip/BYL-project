# BYL — Lot 8B : démarrage et Dashboard Coach

Branche : `codex/firebase-performance-audit`. **Aucun déploiement. P0-3 et P0-4 restent ouverts.** Aucun compte réel, aucune purge utilisateur, aucune règle de production modifiée.

## Résultat

**Objectifs partiellement atteints.** Les requêtes et les remontages diminuent fortement, mais le principal reste au-delà de deux secondes à 500 et 1 000 clients. Aucun chiffre approximatif ne remplace les statistiques confirmées ; l’admission Auth reste obligatoire.

Dernière paire avant/après exécutée successivement, sans build simultané, navigateur froid, réseau/CPU locaux et Vite de développement :

| Clients | Principal avant | Principal après | Retour chaud après |
|---|---:|---:|---:|
| 12 | 4,23 s | 4,46 s | 504 ms |
| 100 | 4,43 s | 1,91 s | 352 ms |
| 500 | 14,80 s | 6,88 s | 532 ms |
| 1 000 | 25,86 s | 12,76 s | 861 ms |

À 500 clients, cette paire observe environ **53 % de réduction** du délai principal, 70 → 23 appels API et 23 211 → 2 969 montages. Les lectures estimées des routes passent de 2 707 à 2 566, sans nouvelle écriture backend. Le premier contenu utile passe de 1 751 à 1 070 ms : la cible 800 ms reste dépassée. À 12 clients, le principal régresse de 225 ms environ ; aucune accélération universelle n’est revendiquée.

**Variabilité importante :** le premier passage normal avant donnait 6,15 s à 500 clients et 9,60 s à 1 000 ; une version intermédiaire après donnait 4,50 s et 6,90 s. Ces chiffres ne sont pas ceux de la dernière paire et ne servent pas de promesse. Les conditions locales ne sont pas un benchmark matériel isolé ; une observation par cellule ne donne ni percentile ni causalité exclusive. Les rapports conservent les observations défavorables. Les causes de cette variabilité ne sont pas entièrement isolées.

Les séries CPU ×4 donnent 24,98 → 15,00 s à 500 et 51,07 → 30,30 s à 1 000 ; elles précèdent uniquement le dernier alignement du prédicat de confirmation sur la seconde disposition desktop. Des blocages du thread restent présents. Les reload sous contraintes sans preuve de nouveau document sont exclus (ND), et les reload normaux ont été rejoués avec contrôle de `timeOrigin`.

Les cibles de contenu utile <800 ms, principal <2 s et retour chaud <500 ms ne sont donc pas garanties sur la matrice. Le chargement complet de tous les services secondaires n’est pas certifié : certains endpoints ne sont pas montés dans ce banc. La référence ajoute cinq modèles et des sondes ; les 7,12 s du Lot 8A ne sont pas directement comparables.

## Trois causes

1. **Chargements par vagues trop petites** : huit dossiers, trois appels simultanés. Les transactions et leurs aller-retours se répétaient 63 fois à 500 clients et 125 fois à 1 000.
2. **Types de cartes React recréés** : remontages massifs à chaque actualisation du parent. La stabilisation corrige cette cause, mais l’essai isolé montre qu’elle ne suffisait pas à accélérer le principal.
3. **Données globales et calculs proportionnels au portefeuille** : annuaire paginé en chaîne, programmes/historiques et nutrition. Ils restent nécessaires aux résultats exacts actuels ; ils expliquent une partie du coût résiduel. Sous réseau ralenti, le transfert des modules Vite est un autre blocage commun avant même l’affichage privé.

## Corrections réellement intégrées

- `src/components/CoachDashboard.jsx` : type DashboardCard stable pour les cartes statistiques, rapides et de priorité ; callbacks actuels transmis, identité des sous-arbres préservée. Les compteurs et leurs sous-titres numériques attendent la confirmation de leur source, avec aria-busy ; les liens restent utilisables.
- `src/utils/coachDashboardLoading.js` : type de carte stable et prédicat pur de confirmation des indicateurs.
- `src/utils/coachProgramBatch.js` : lots bornés à 32, trois appels simultanés, cache/déduplication et refus existants conservés.
- `backend/routes/coachProgramRead.js` : plafond détaillé à 32 ; contrôle transactionnel d’identité, profil et propriété sur chaque dossier inchangé ; réponse limitée à 4 Mio ; aucune nouvelle synthèse persistante.

Les autres changements visibles dans le dépôt, antérieurs au Lot 8B, sont conservés et ne sont pas attribués à ce lot. Aucune optimisation d’une autre page engagée. Un callback local `_openBirthdayMessage`, sans référence selon l’analyse des bindings, a été supprimé ; l’affichage des anniversaires et le markup de leur fenêtre sont conservés. Ce retrait évite de charger son code inactif et maintient le budget sans relever le seuil.

## Coûts et compromis

Les données métier lues restent les mêmes. Le gain provient surtout de moins d’aller-retours et moins d’admissions répétées, pas d’une suppression des historiques. À 1 000 clients, la dernière paire observe 134 → 39 API et 5 400 → 5 114 lectures estimées des routes. Une partie de cette variation vient des renouvellements de messagerie pendant une fenêtre plus longue : la route détaillée seule économise 93 appels et 279 lectures estimées. Les appels SDK navigateur sont identiques à 12 et 500 ; un appel/souscription supplémentaire est observé à 100 et 1 000, sans augmentation des écoutes actives finales. Les estimations de snapshots varient également ; elles ne sont pas une mesure de facture. Les écritures navigateur de démarrage existaient déjà avant correction.

Le pic possible passe de 24 à 96 dossiers en cours dans les trois lots. Les gros historiques peuvent atteindre plus tôt 4 Mio et déclencher le repli SDK existant, avec des lectures supplémentaires. La limite est testée ; une économie universelle n’est pas promise. Pas de mesure de facture Firebase réelle ni de mémoire serveur exhaustive.

## Validation et problèmes ouverts

Les totaux terminés/prévus sont contrôlés sur chaque volume. Les tests de lots vérifient absence de doublon, cache partagé, parité singleton, refus des dossiers étrangers, refus 33 dossiers, limite de réponse et absence de repli pour 400/401/403. Les six suites métier/sécurité (Coach, progression, calendrier, P0-1, P0-2, messagerie) réussissent, ainsi que 48 contrôles intégrés de sécurité/brouillons. Après le dernier alignement visuel, le test des deux variantes de compteurs, le chargeur réel avec repli 404/413, les 53 contrôles smoke et le build passent. Budget CoachDashboard : 69,5 Kio / 70. Les sorties et limites de couverture sont consignées dans TESTS.

Les comparaisons conservent les régressions ponctuelles, variations et limites du banc. Des routes secondaires non montées retournent 404 ; un marqueur painted ou un réseau stabilisé ne signifie pas un succès exhaustif de toutes les données secondaires. Les protections d’identité, rôle/Club, révocation, brouillons, offres et paiements ne sont pas assouplies.

Avant publication : validation explicite, traitement/qualification des P0 ouverts, build distribué sur appareils cibles, charge backend, gros historiques et mémoire serveur, compatibilité backend acceptant 32 avant le frontend correspondant. Aucun déploiement réalisé.

## Livrables et arrêt

`BYL_LOT8B_CHEMIN_CRITIQUE.md`, `BYL_LOT8B_AVANT_APRES.md`, `BYL_LOT8B_FIREBASE.md`, `BYL_LOT8B_TESTS.md`, `BYL_LOT8B_RISQUES.md`, preuves sous `audits/lot8b/`.

**Arrêt après le Lot 8B. Attente de validation avant toute autre modification ou tout autre lot.**

Banc et tests propres au lot : `scripts/measureCoachLot8B.cjs`, `scripts/runCoachLot8B.cjs`, `scripts/fixtures/lot8b/firestore.js`, `scripts/reportCoachLot8B.py`, `scripts/executeLot8B.cjs`, `scripts/runRegressionsLot8B.cjs`, `scripts/testCoachBatchesLot8B.cjs`, `scripts/testCoachProgramBatchLot8B.mjs`, `scripts/testCoachConfirmedCountersLot8B.cjs`. Le manifeste `audits/lot8b/qualification.json` référence les empreintes des quatre fichiers applicatifs, des baselines et des mesures retenues.
