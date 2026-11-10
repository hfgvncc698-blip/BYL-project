# Lot 7A — coûts Firebase

Campagne du 10 novembre 2026. Branche `codex/firebase-performance-audit`, version applicative `e476b0a4cfcd6bb9e27515c69a5416325e480f6e`. Campagne locale sur fixtures synthétiques.

## Confirmé par test

Les estimations comptent des documents ou un minimum pour une requête vide selon la sonde. Un événement de cache peut retourner des lignes sans lecture serveur. Un abonnement peut produire plusieurs livraisons. Les colonnes SDK, documents et estimation décrivent trois quantités distinctes. Aucune mesure de facturation réelle.

## Messagerie · 1 000 conversations


Périmètre | Phase | HTTP | SDK | Docs | Estim. | Écritures | Écoutes actives | Fenêtre ms | Réception ms | Δ tas Mio | Δ RSS Mio
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
professional | open | 1 | 13 | 2001 | 2002 | 0 | 1 | 1752 | n.m. | 25 | 56
club | open | 1 | 55 | 2904 | 2935 | 0 | 1 | 2349 | n.m. | 11 | 63
professional | idle24 | 1 | 38 | 1002 | 1004 | 0 | 36 | 24084 | n.m. | 23 | -25
club | idle24 | 1 | 102 | 1906 | 1938 | 0 | 97 | 24099 | n.m. | 17 | 40
professional | steady24 | 1 | 3 | 1 | 3 | 0 | 36 | 24048 | n.m. | 26 | -26
professional | message | 2 | 20 | 1006 | 1011 | 2 | 36 | 484 | 331 | 25 | 47
club | steady24 | 1 | 6 | 4 | 6 | 0 | 97 | 24047 | n.m. | 24 | -24
club | message | 2 | 66 | 1911 | 1948 | 3 | 97 | 550 | 398 | 30 | 51
professional | idle62 | 3 | 7 | 2 | 7 | 0 | 36 | 62004 | n.m. | 9 | -37
club | idle62 | 3 | 15 | 10 | 15 | 0 | 97 | 62002 | n.m. | 20 | -36


## Messagerie Club · 100 conversations, deux onglets et deux instances


Phase | HTTP | SDK | Docs | Estim. | Écritures | Écoutes par API | Fenêtre ms | Réception ms | RSS par API Mio
--- | --- | --- | --- | --- | --- | --- | --- | --- | ---
open | 2 | 22 | 588 | 596 | 0 | [1, 1] | 347 | n.m. | [131, 132]
idle24 | 2 | 36 | 392 | 402 | 0 | [13, 13] | 24070 | n.m. | [67, 66]
message | 3 | 33 | 396 | 411 | 3 | [13, 13] | 357 | [155, 155] | [91, 83]
revoke-no-focus | 3 | 34 | 592 | 608 | 0 | [13, 13] | 441 | n.m. | [112, 104]
revoke-focused | 3 | 64 | 1073 | 1102 | 0 | [26, 26] | 360 | n.m. | [132, 123]


## Adhésions · sans navigateur


Version | Dossiers | Phase | SDK | Docs | Estim. | Écritures | Temps ms | RSS Mio
--- | --- | --- | --- | --- | --- | --- | --- | ---
before | 12 | idle | 2 | 13 | 13 | 0 | 396 | 114
before | 4000 | idle | 21 | 4020 | 4020 | 0 | 3387 | 155
before | 4000 | two-due | 43 | 4026 | 4042 | 4 | 1865 | 153
before | 4000 | archived | 23 | 4022 | 4022 | 0 | 949 | 154
after | 12 | idle | 1 | 0 | 1 | 0 | 29 | 155
after | 4000 | idle | 1 | 0 | 1 | 0 | 59 | 186
after | 4000 | two-due | 26 | 10 | 27 | 6 | 221 | 186
after | 4000 | archived | 5 | 6 | 6 | 0 | 105 | 186

Le planificateur local a effectué trois sélections par passage. Avec 60 documents au premier passage, l’estimation est de 62 lectures en 346 ms. Au deuxième, aucun document et trois lectures estimées en 17 ms. Le transport SMTP du banc est simulé.

## Économies et dépenses par lot


Lot | Gain ou coût constaté | Contrepartie
--- | --- | ---
1 | Étalonnage par activité. AdminGeo sur fixture, 1 HTTP, 8 SDK, 14 documents, 18 lectures estimées. | Un agrégat hors estimation complète. Instrumentation locale optionnelle.
2A | Comparatif rejoué sur deux révisions dans le [rapport de performances](BYL_LOT7A_PERFORMANCES.md). Le repos sans contrat passe de 74 documents à zéro. | Les mutations gardent leurs vérifications serveur.
2B à 2B.2 | Référence publiée Lot 2B, 1 onglet au repos 62 s, 183 → 17 documents. À 1 000 fils le repos stabilisé de 24 s vaut 3/6 estimées pro/Club sur HEAD. | Admission, message et reconnexion peuvent reconstruire une grande vue. Les écoutes se multiplient par instance.
3 | 4 000 dossiers au repos, 4 020 → 1 estimées. Deux dossiers échus, 4 042 → 27. | Deux écritures de bail supplémentaires dans ce dernier cas. Les dossiers archivés encore échus restent candidats.
4 | Comparatif du Lot 4 sur 100 dossiers, retour 402 → 9 estimées, changement distant 737 → 13. Création des vues à la demande observée en 7A. | 100 écritures de vues pour une première liste de 100 dossiers. Révisions et reconstruction ultérieure à prendre en compte.
5 | 20 × 1 000 sur HEAD, 20 000 historiques à froid. Les modifications de programme ne relisent pas tout l’historique. | Calcul à la demande sans nouvelle projection Firestore persistante. Transfert initial important.
6 | Comparatif du Lot 6 sur 500 membres, calendrier initial 3 569 → 13 documents API et 4 757 → 25 estimées. Rejeu HEAD à 500 dans le rapport performances. | Annuaire, agrégats d’accueil, liens anciens et autorisations restent des postes distincts.


## Observé dans le code

Entre la référence et HEAD, les définitions passent de 1 à 15 index composites et de 6 à 8 entrées fieldOverrides. Les écritures dans les champs indexés entretiennent les index. L’ajout d’un index existant sur de nombreuses données demande une construction initiale. Les déclencheurs de révision du Lot 4 peuvent écrire le dossier puis entraîner la reconstruction d’une vue si elle est consultée. Aucune reconstruction globale n’a été lancée.

## Hypothèse

Le nombre de dossiers activement modifiés, la durée réelle des attentes et le nombre de processus gouvernent le seuil de rentabilité. Les pourcentages par lot portent sur des charges différentes.

## Non vérifié

Facture, coût des lectures de règles et des entrées d’index, stockage, egress, durée facturée des fonctions, reprises Cloud et coût d’un backfill en préproduction. Les scripts ne mesurent pas la taille physique des index.
