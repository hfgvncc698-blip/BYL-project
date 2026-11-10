# Lot 7A — performances mesurées

Campagne du 10 novembre 2026. Branche `codex/firebase-performance-audit`, version applicative `e476b0a4cfcd6bb9e27515c69a5416325e480f6e`. Campagne locale sur fixtures synthétiques.

## Confirmé par test

Mesures de ce passage sur émulateurs et Chromium local. Une ligne correspond à une fenêtre instrumentée, au milieu d’autres tests locaux. Les temps sont des observations unitaires, sans percentile. Le premier libellé visible et le résultat confirmé ont des horloges distinctes.

## Offres du coach

Le banc extrait lui-même sa référence avant Lot 2A. Les nombres HTTP ci-dessous concernent uniquement les offres.

Version | px | Contrats | Phase | Demandes | HTTP | SDK API | Docs | Estim. | Confirmé ms
--- | --- | --- | --- | --- | --- | --- | --- | --- | ---
avant | 1440 | non | cold | 212 | 26 | 130 | 962 | 988 | 419
avant | 1440 | non | warm | 196 | 25 | 125 | 925 | 950 | 160
avant | 1440 | non | idle62s | 8 | 2 | 10 | 74 | 76 | n.m.
avant | 1440 | non | remoteSession | 168 | 19 | 95 | 703 | 722 | n.m.
avant | 1440 | oui | cold | 244 | 35 | 175 | 910 | 910 | 167
avant | 1440 | oui | warm | 188 | 22 | 110 | 572 | 572 | 75
avant | 1440 | oui | idle62s | 8 | 2 | 10 | 52 | 52 | n.m.
avant | 1440 | oui | remoteSession | 168 | 19 | 95 | 494 | 494 | n.m.
avant | 1440 | oui | unrelatedSession | 168 | 19 | 95 | 494 | 494 | n.m.
avant | 1440 | oui | twoTabsContract | 0 | 2 | 15 | 78 | 78 | n.m.
avant | 1440 | oui | reconnect | 1 | 1 | 5 | 26 | 26 | n.m.
avant | 850 | oui | cold | 232 | 34 | 170 | 884 | 884 | 182
avant | 850 | oui | warm | 188 | 22 | 110 | 572 | 572 | 87
avant | 390 | oui | cold | 0 | 0 | 0 | 0 | 0 | n.m.
avant | 390 | oui | warm | 0 | 0 | 0 | 0 | 0 | n.m.
après | 1440 | non | cold | 1 | 1 | 2 | 1 | 2 | 189
après | 1440 | non | warm | 0 | 0 | 0 | 0 | 0 | n.m.
après | 1440 | non | idle62s | 0 | 0 | 0 | 0 | 0 | n.m.
après | 1440 | non | remoteSession | 0 | 0 | 0 | 0 | 0 | n.m.
après | 1440 | oui | cold | 1 | 1 | 3 | 7 | 7 | 206
après | 1440 | oui | warm | 0 | 0 | 0 | 0 | 0 | n.m.
après | 1440 | oui | idle62s | 0 | 0 | 0 | 0 | 0 | n.m.
après | 1440 | oui | remoteSession | 1 | 1 | 3 | 7 | 7 | n.m.
après | 1440 | oui | unrelatedSession | 0 | 0 | 0 | 0 | 0 | n.m.
après | 1440 | oui | twoTabsContract | 0 | 2 | 11 | 40 | 40 | n.m.
après | 1440 | oui | reconnect | 1 | 1 | 3 | 7 | 7 | n.m.
après | 850 | oui | cold | 1 | 1 | 3 | 7 | 7 | 188
après | 850 | oui | warm | 0 | 0 | 0 | 0 | 0 | n.m.
après | 390 | oui | cold | 0 | 0 | 0 | 0 | 0 | n.m.
après | 390 | oui | warm | 0 | 0 | 0 | 0 | 0 | n.m.


## Pages coach et Clients


Dossiers | Phase | Visible ms | Prêt ms | HTTP suivis | SDK API | Docs API | Est. API | Docs web | Est. web | Écr. vues | Tas Mio | Octets décodés suivis
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
12 | clientsCold | 1684 | 2019 | 1 | 53 | 64 | 87 | 13 | 13 | 12 | 64 | 8867
12 | dashboardCold | 168 | 1585 | 4 | 48 | 64 | 70 | 17 | 16 | 0 | 99 | 22483
12 | clientsWarm | 84 | 84 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 97 | 4816
12 | dashboardWarm | n.m. | 230 | 0 | 0 | 0 | 0 | 4 | 13 | 0 | 129 | 238
12 | remoteSession | 70 | 471 | 0 | 0 | 0 | 0 | 16 | 7 | 0 | 133 | 12070
12 | foreground | 56 | 307 | 1 | 2 | 1 | 2 | 0 | 0 | 0 | 131 | 230
12 | programChange | 126 | 555 | 1 | 7 | 6 | 8 | 12 | 1 | 0 | 154 | 6556
12 | validate | 26 | 430 | 1 | 7 | 7 | 9 | 12 | 1 | 0 | 152 | 6637
12 | deleteValidation | 245 | 653 | 1 | 7 | 6 | 8 | 12 | 1 | 0 | 175 | 6590
12 | online | 0 | 293 | 1 | 2 | 1 | 2 | 0 | 0 | 0 | 102 | 112
12 | expired | 51 | 655 | 4 | 48 | 64 | 70 | 28 | 12 | 0 | 105 | 28198
12 | returnList | 84 | 84 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 139 | 86
500 | clientsCold | 994 | 7267 | 20 | 2100 | 2620 | 3560 | 501 | 501 | 500 | 64 | 321251
500 | dashboardCold | 146 | 7044 | 65 | 1756 | 2565 | 2693 | 504 | 504 | 0 | 300 | 796244
500 | clientsWarm | 142 | 142 | 0 | 0 | 0 | 0 | 4 | 12 | 0 | 319 | 0
500 | dashboardWarm | n.m. | 1678 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 179 | 90
500 | remoteSession | 1106 | 2448 | 0 | 0 | 0 | 0 | 504 | 4 | 0 | 290 | 279031
500 | foreground | 240 | 1146 | 1 | 2 | 1 | 2 | 0 | 1 | 0 | 364 | 56
100 | clientsCold | 452 | 982 | 4 | 420 | 524 | 712 | 101 | 101 | 100 | 68 | 65099
100 | dashboardCold | 95 | 585 | 14 | 354 | 514 | 541 | 108 | 119 | 0 | 75 | 167014
100 | clientsWarm | 110 | 110 | 0 | 0 | 0 | 0 | 2 | 12 | 0 | 79 | 6356
100 | dashboardWarm | 174 | 174 | 0 | 0 | 0 | 0 | 5 | 6 | 0 | 90 | 4736
100 | remoteSession | 29 | 322 | 0 | 0 | 0 | 0 | 107 | 40 | 0 | 92 | 70709
100 | foreground | 23 | 198 | 0 | 0 | 0 | 0 | 7 | 39 | 0 | 101 | 18123


## Dashboard Client, ProgramView et SessionPlayer


Programmes × séances | Phase | Visible ms | Prêt ms | SDK get | Départs écoute | Docs web | Est. web | Docs historiques | Tas Mio | Octets décodés suivis
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
1 × 10 | open | 3040 | 3641 | 1 | 6 | 14 | 15 | 10 | 81 | 10194
1 × 10 | edit | 55 | 84 | 0 | 0 | 1 | 2 | 0 | 75 | 1504
1 × 10 | partial | 93 | 121 | 0 | 0 | 11 | 1 | 11 | 81 | 5937
1 × 10 | editWhilePartial | 51 | 77 | 0 | 0 | 1 | 1 | 0 | 75 | 1171
1 × 10 | validate | 83 | 139 | 0 | 0 | 11 | 1 | 11 | 81 | 5944
1 × 10 | delete | 92 | 131 | 0 | 0 | 21 | 1 | 21 | 76 | 6015
1 × 10 | warm | 152 | 152 | 1 | 2 | 3 | 2 | 0 | 84 | 2980
1 × 10 | view | 38 | 65 | 0 | 2 | 4 | 2 | 0 | 79 | 2071
1 × 10 | player | 297 | 360 | 47 | 2 | 28 | 50 | 22 | 84 | 4566
1 × 10 | fromPlayer | 141 | 141 | 5 | 2 | 2 | 5 | 0 | 108 | 3140
1 × 10 | fromPlayerView | 30 | 30 | 0 | 2 | 2 | 0 | 0 | 87 | 796
1 × 10 | undoView | 0 | 466 | 14 | 0 | 24 | 18 | 21 | 92 | 14113
1 × 10 | back | 176 | 176 | 1 | 3 | 3 | 5 | 0 | 88 | 4555
1 × 10 | twoTabs-validate | 26 | 52 | 0 | 0 | 11 | 1 | 11 | 108 | 5997
1 × 10 | twoTabs-delete | 19 | 87 | 0 | 0 | 33 | 1 | 31 | 98 | 6046
1 × 10 | reconnect | 3 | 210 | 0 | 0 | 13 | 2 | 11 | 84 | 11615
1 × 10 | revoke | 88 | 121 | 7 | 0 | 0 | 7 | 0 | 94 | 778
20 × 1000 | open | 1402 | 24854 | 1 | 50 | 20023 | 20046 | 20000 | 178 | 10088013
20 × 1000 | edit | 48 | 152 | 0 | 5 | 20 | 6 | 0 | 171 | 14579
20 × 1000 | partial | 53 | 309 | 0 | 4 | 1001 | 5 | 1001 | 191 | 505166
20 × 1000 | validate | 47 | 290 | 0 | 4 | 1001 | 5 | 1001 | 181 | 505195
20 × 1000 | delete | 78 | 763 | 0 | 0 | 2001 | 5 | 2001 | 200 | 505294
20 × 1000 | warm | 269 | 294 | 1 | 2 | 3 | 2 | 0 | 193 | 3032


## Calendriers Club et personnels


Rôle | Taille | Phase | Visible ms | Fin ms | HTTP suivis | SDK API | Docs API | Est. API | Est. web | Tas web Mio | Tas API Mio
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
club | 0 | calendar | 382 | 382 | 3 | 23 | 12 | 24 | n.m. | 72 | 169
club | 0 | warm | 140 | 140 | 5 | 18 | 11 | 19 | n.m. | 77 | 172
club | 0 | week | 0 | 123 | 2 | 8 | 3 | 8 | n.m. | 83 | 174
club | 0 | month | 142 | 142 | 3 | 13 | 6 | 13 | n.m. | 82 | 177
club | 0 | focus | 15 | 15 | 1 | 5 | 2 | 5 | n.m. | 88 | 105
club | 0 | remote | 63 | 105 | 2 | 9 | 6 | 11 | n.m. | 82 | 107
club | 0 | validate | n.m. | 48 | 2 | 9 | 5 | 10 | n.m. | 90 | 109
club | 0 | cancel | n.m. | 137 | 4 | 18 | 11 | 21 | n.m. | 86 | 113
club | 0 | home | n.m. | 246 | 8 | 37 | 16 | 37 | n.m. | 97 | 122
club | 12 | calendar | 607 | 607 | 3 | 24 | 13 | 25 | n.m. | 72 | 123
club | 12 | warm | 153 | 153 | 5 | 19 | 12 | 20 | n.m. | 77 | 127
club | 12 | week | 0 | 123 | 2 | 8 | 3 | 8 | n.m. | 83 | 129
club | 12 | month | 104 | 104 | 3 | 14 | 7 | 14 | n.m. | 83 | 132
club | 12 | focus | 9 | 9 | 1 | 6 | 3 | 6 | n.m. | 88 | 133
club | 12 | twoTabs | 466 | 466 | 3 | 17 | 11 | 18 | n.m. | 98 | 97
club | 12 | idleTwoTabs | 25001 | 25001 | 6 | 8 | 4 | 8 | n.m. | 77 | 90
club | 12 | remote | 71 | 142 | 4 | 20 | 12 | 22 | n.m. | 98 | 91
club | 12 | validate | n.m. | 86 | 5 | 17 | 9 | 17 | n.m. | 90 | 92
club | 12 | cancel | n.m. | 121 | 4 | 20 | 13 | 23 | n.m. | 101 | 92
club | 12 | home | n.m. | 407 | 8 | 60 | 41 | 71 | n.m. | 80 | 95
club | 100 | calendar | 432 | 432 | 3 | 24 | 13 | 25 | n.m. | 72 | 162
club | 100 | warm | 132 | 132 | 5 | 19 | 12 | 20 | n.m. | 77 | 166
club | 100 | week | 1 | 114 | 2 | 8 | 3 | 8 | n.m. | 83 | 168
club | 100 | month | 84 | 84 | 3 | 14 | 7 | 14 | n.m. | 83 | 171
club | 100 | focus | 16 | 16 | 1 | 6 | 3 | 6 | n.m. | 88 | 172
club | 100 | remote | 59 | 100 | 2 | 10 | 7 | 12 | n.m. | 82 | 175
club | 100 | validate | n.m. | 46 | 2 | 10 | 6 | 11 | n.m. | 90 | 177
club | 100 | cancel | n.m. | 119 | 4 | 20 | 13 | 23 | n.m. | 86 | 181
club | 100 | home | n.m. | 316 | 8 | 216 | 217 | 315 | n.m. | 98 | 114
club | 500 | calendar | 285 | 285 | 3 | 24 | 13 | 25 | n.m. | 67 | 128
club | 500 | warm | 125 | 125 | 5 | 19 | 12 | 20 | n.m. | 73 | 132
club | 500 | week | n.m. | 63 | 2 | 8 | 3 | 8 | n.m. | 75 | 134
club | 500 | weekReturn | 51 | 51 | 3 | 12 | 6 | 12 | n.m. | 72 | 136
club | 500 | focus | 9 | 9 | 1 | 6 | 3 | 6 | n.m. | 70 | 138
club | 500 | remote | 29 | 71 | 2 | 10 | 6 | 11 | n.m. | 70 | 140
club | 500 | validate | n.m. | 48 | 2 | 10 | 6 | 11 | n.m. | 70 | 142
club | 500 | cancel | n.m. | 113 | 4 | 20 | 12 | 22 | n.m. | 73 | 146
club | 500 | home | n.m. | 365 | 8 | 316 | 717 | 815 | n.m. | 72 | 164
coach | 12 | open | 1451 | 1451 | 2 | 7 | 3 | 7 | 362 | 104 | 153
coach | 12 | warm | 78 | 78 | 0 | 0 | 0 | 0 | n.m. | 100 | 154
coach | 12 | remote | 61 | 249 | 0 | 0 | 0 | 0 | 1 | 118 | 155
coach | 12 | focus | 47 | 47 | 0 | 0 | 0 | 0 | n.m. | 102 | 156
client | 12 | open | 580 | 836 | 1 | 30 | 11 | 30 | 361 | 82 | 171
client | 12 | warm | 175 | 175 | 1 | 30 | 11 | 30 | n.m. | 86 | 90
client | 12 | remote | 104 | 155 | 0 | 0 | 0 | 0 | 1 | 78 | 92
client | 12 | focus | 29 | 29 | 1 | 30 | 11 | 30 | n.m. | 79 | 108


## Messagerie et processus automatiques

Comptages par phase et par instance dans le [rapport des coûts Firebase](BYL_LOT7A_COUTS_FIREBASE.md). Trois identités indépendantes ont vu la même séance et sa validation en 38 ms. La réception d’un message et la confirmation de paiement sont testées séparément.

## Observé dans le code

Les harnais montent les composants métier avec un contexte contrôlé. Les routes sans rapport direct sont parfois simulées. Les requêtes HTTP mesurées et les transferts décodés concernent les domaines instrumentés. Une connexion Firestore ouverte peut rester inachevée à la fin de la fenêtre. Un compteur SDK ou HTTP nul ne mesure pas les requêtes système de Chromium.

## Hypothèse

La concurrence locale, la collecte mémoire et la réutilisation du cache expliquent une partie de la dispersion. Les comparaisons de latence exigent des répétitions sur appareils représentatifs.

## Non vérifié

p95/p99, bande passante mobile physique, octets facturés, performances sur réseau WAN et durée réelle des traitements Cloud. « n.m. » signale un compteur absent.

## Mesures complémentaires de réception

Le fil fermé met à jour le badge en 1 000 ms. Le fil ouvert apparaît en 80 ms, reçoit le message en 123 ms et confirme sa lecture en 196 ms. Un seul toast visible et deux onglets convergents. À 22 s, un onglet totalise 4 HTTP et 7 documents, contre 8 HTTP et 14 documents sur deux onglets dans ce banc. À 62 s, un onglet totalise 8 HTTP et 17 documents. L’annuaire explicite seul a coûté 1 HTTP et 17 documents.

La file automatique vide sur 62 s et deux workers passe de 26 à 4 lectures estimées. La livraison témoin passe de 2 782 à 198 ms, de 7 à 13 lectures estimées et reste à 4 écritures. Après perte réseau, livraison en 3 230 ms après reconnexion. Après arrêt forcé, reprise 95 ms après expiration du bail. Pour 3 000 essais, 3 000 → 16 lectures estimées, avec deux changements métier dans les deux versions.

Sur le Dashboard Coach à 100 dossiers, la lecture explicite du document utilisateur depuis le cache retourne un document pour zéro lecture serveur estimée au retour à chaud. À 500 dossiers, la modification distante publie 504 documents dans les vues web pour 4 lectures estimées dans la fenêtre. Les écarts proviennent notamment des vues complètes renvoyées après un changement. Les compteurs de retries réseau exhaustifs ne sont pas disponibles. Les pertes réseau et reprises de baux ont été injectées dans des scénarios distincts.
