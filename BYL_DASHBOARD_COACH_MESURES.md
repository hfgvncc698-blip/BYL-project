# Dashboard Coach — mesures de stabilisation

Trois passages avant/après par scénario, profils navigateur jetables, bundle compilé de la vraie application, Auth et Firestore émulés. Valeurs : médiane [minimum–maximum]. Les modules sont compilés avec la configuration du projet ; seuls les marqueurs de temps sont activés dans la copie de test. Aucun compte réel. Pas de déploiement.

Fixtures : 36 ou 100 clients ; deux programmes chacun, sauf un client avec 20 programmes ; 10 ou 100 validations par programme ; 5 modèles et 40 événements de calendrier. Le nombre de clients ne suffit donc pas à décrire le volume. Les anciennes mesures 500 clients/deux validations ne sont pas comparables.

## Affichage (millisecondes)

| Clients / historique par programme | Premier contenu utile | Principal confirmé | Retour chaud | Reload confirmé |
|---|---:|---:|---:|---:|
| 36 / 10 | 659 [609–662] → 639 [637–731] | 2228 [2085–2228] → 2385 [2226–2400] | 266 [261–297] → 281 [276–307] | 1546 [1457–1811] → 1847 [1436–2273] |
| 36 / 100 | 485 [472–496] → 487 [479–653] | 1986 [1818–2113] → 2024 [1800–2453] | 316 [301–346] → 350 [315–399] | 1605 [1602–1622] → 1866 [1692–2318] |
| 100 / 10 | 479 [477–495] → 495 [481–576] | 1946 [1922–2293] → 2144 [1950–3250] | 322 [322–324] → 328 [302–340] | 1736 [1722–1747] → 2136 [1658–2911] |

Principal = core confirmé, avec parité des totaux terminés/prévus. Le premier contenu utile n’est pas le skeleton. Les données secondaires ne sont pas toutes représentées par core ; certaines routes secondaires du banc restent non montées (404). Pas de percentile terrain, de serveur distant ni de promesse pour le compte réel.

## Coûts et ressources

| Clients / historique | Appels détaillés | Lectures estimées détaillées | SDK navigateur | Écritures navigateur | Écritures backend |
|---|---:|---:|---:|---:|---:|
| 36 / 10 | 2 [2–2] → 2 [2–2] | 1032 [1032–1032] → 1032 [1032–1032] | 46 [46–46] → 46 [46–46] | 2 [2–2] → 2 [2–2] | 0 [0–0] → 0 [0–0] |
| 36 / 100 | 2 [2–2] → 2 [2–2] | 9132 [9132–9132] → 9132 [9132–9132] | 46 [46–46] → 46 [46–46] | 2 [2–2] → 2 [2–2] | 0 [0–0] → 0 [0–0] |
| 100 / 10 | 4 [4–4] → 4 [4–4] | 2510 [2510–2510] → 2510 [2510–2510] | 110 [110–110] → 110 [110–110] | 2 [2–2] → 2 [2–2] | 0 [0–0] → 0 [0–0] |

| Clients / historique | Documents route détaillée | Estimation navigateur | Transfert Kio | Heap JS Mio | JS ms | Écoutes actives navigateur |
|---|---:|---:|---:|---:|---:|---:|
| 36 / 10 | 1028 [1028–1028] → 1028 [1028–1028] | 102 [98–109] → 112 [109–122] | 2740 [2740–2740] → 2741 [2741–2741] | 37 [36–40] → 53 [41–53] | 1120 [1094–1144] → 1124 [1070–1153] | 6 [6–6] → 6 [6–6] |
| 36 / 100 | 9128 [9128–9128] → 9128 [9128–9128] | 122 [122–122] → 122 [122–122] | 2749 [2749–2749] → 2750 [2750–2751] | 55 [40–57] → 56 [53–61] | 1075 [1057–1077] → 1076 [1069–1186] | 6 [6–6] → 6 [6–6] |
| 100 / 10 | 2502 [2502–2502] → 2502 [2502–2502] | 250 [248–250] → 250 [234–250] | 2746 [2746–2746] → 2748 [2747–2748] | 53 [37–56] → 36 [34–55] | 1170 [1150–1180] → 1270 [1144–1551] | 6 [6–6] → 6 [6–6] |

Les lectures sont des estimations instrumentées, pas la facture Google. Le coût serveur n’est pas remplacé par le heap du navigateur. Aucun nouveau service, index, document de synthèse, polling ou écriture métier. La concurrence des lectures détaillées ne dépasse pas celle de l’ancien code : au plus un créneau par client du lot, maximum 32. Une erreur arrête les lectures encore en file, sans retry ajouté.

## Erreurs observées

- before/1 : 36/10 HTTP {'200': 6, '404': 1}, échecs SDK 0; 36/100 HTTP {'200': 6, '404': 1}, échecs SDK 0; 100/10 HTTP {'200': 8, '404': 1}, échecs SDK 0
- before/2 : 36/10 HTTP {'200': 6, '404': 1}, échecs SDK 0; 36/100 HTTP {'200': 6, '404': 1}, échecs SDK 0; 100/10 HTTP {'200': 8, '404': 1}, échecs SDK 0
- before/3 : 36/10 HTTP {'200': 6, '404': 1}, échecs SDK 0; 36/100 HTTP {'200': 6, '404': 1}, échecs SDK 0; 100/10 HTTP {'200': 8, '404': 1}, échecs SDK 0
- after/1 : 36/10 HTTP {'200': 6, '404': 1}, échecs SDK 0; 36/100 HTTP {'200': 6, '404': 1}, échecs SDK 0; 100/10 HTTP {'200': 8, '404': 1}, échecs SDK 0
- after/2 : 36/10 HTTP {'200': 6, '404': 1}, échecs SDK 0; 36/100 HTTP {'200': 6, '404': 1}, échecs SDK 0; 100/10 HTTP {'200': 8, '404': 1}, échecs SDK 0
- after/3 : 36/10 HTTP {'200': 6, '404': 1}, échecs SDK 0; 36/100 HTTP {'200': 6, '404': 1}, échecs SDK 0; 100/10 HTTP {'200': 8, '404': 1}, échecs SDK 0
