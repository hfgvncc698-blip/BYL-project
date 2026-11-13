# Dashboard Coach — mesures du chargement indépendant

Trois passages avant/après par scénario, profils navigateur jetables, bundle compilé de la vraie application, Auth et Firestore émulés. Valeurs : médiane [minimum–maximum]. Les modules sont compilés avec la configuration du projet ; seuls les marqueurs de temps sont activés dans la copie de test. Aucun compte réel. Pas de déploiement.

Fixtures : 36 ou 100 clients ; deux programmes chacun, sauf un client avec 20 programmes ; 10 ou 100 validations par programme ; 5 modèles et 40 événements de calendrier. Le nombre de clients ne suffit donc pas à décrire le volume. Les anciennes mesures 500 clients/deux validations ne sont pas comparables.

## Affichage (millisecondes)

| Clients / historique par programme | Premier contenu utile | Principal confirmé | Retour chaud | Reload confirmé |
|---|---:|---:|---:|---:|
| 36 / 10 | 729 [634–976] → 817 [747–868] | 2274 [2139–2564] → 2495 [2301–2584] | 296 [265–304] → 265 [260–287] | 1531 [1452–1631] → 1498 [1496–1533] |
| 36 / 100 | 487 [472–490] → 489 [478–568] | 1872 [1762–1943] → 1935 [1774–2301] | 333 [320–349] → 307 [303–336] | 1644 [1599–1753] → 1574 [1569–1936] |
| 100 / 10 | 483 [472–490] → 579 [485–581] | 2657 [1965–3417] → 2032 [1713–2158] | 314 [271–384] → 276 [274–283] | 1756 [1689–2372] → 1823 [1702–1900] |

Principal = core confirmé, avec parité des totaux terminés/prévus. Le premier contenu utile n’est pas le skeleton. Les données secondaires ne sont pas toutes représentées par core ; certaines routes secondaires du banc restent non montées (404). Pas de percentile terrain, de serveur distant ni de promesse pour le compte réel.

## Coûts et ressources

| Clients / historique | Appels détaillés | Lectures estimées détaillées | SDK navigateur | Écritures navigateur | Écritures backend |
|---|---:|---:|---:|---:|---:|
| 36 / 10 | 2 [2–2] → 2 [2–2] | 1032 [1032–1032] → 1032 [1032–1032] | 46 [46–46] → 45 [45–45] | 2 [2–2] → 2 [2–2] | 0 [0–0] → 0 [0–0] |
| 36 / 100 | 2 [2–2] → 2 [2–2] | 9132 [9132–9132] → 9132 [9132–9132] | 46 [46–46] → 45 [45–45] | 2 [2–2] → 2 [2–2] | 0 [0–0] → 0 [0–0] |
| 100 / 10 | 4 [4–4] → 4 [4–4] | 2510 [2510–2510] → 2510 [2510–2510] | 110 [110–110] → 109 [109–109] | 2 [2–2] → 2 [2–2] | 0 [0–0] → 0 [0–0] |

| Clients / historique | Documents route détaillée | Estimation navigateur | Transfert Kio | Heap JS Mio | JS ms | Écoutes actives navigateur |
|---|---:|---:|---:|---:|---:|---:|
| 36 / 10 | 1028 [1028–1028] → 1028 [1028–1028] | 112 [104–113] → 111 [103–122] | 2741 [2741–2741] → 2741 [2741–2741] | 46 [42–50] → 41 [35–59] | 1127 [1108–1209] → 1031 [995–1092] | 6 [6–6] → 5 [5–5] |
| 36 / 100 | 9128 [9128–9128] → 9128 [9128–9128] | 122 [122–122] → 122 [122–122] | 2750 [2750–2750] → 2750 [2750–2750] | 52 [52–54] → 48 [47–60] | 1085 [1083–1099] → 1045 [994–1138] | 6 [6–6] → 5 [5–5] |
| 100 / 10 | 2502 [2502–2502] → 2502 [2502–2502] | 250 [217–250] → 250 [250–250] | 2748 [2747–2748] → 2748 [2748–2748] | 46 [43–60] → 37 [35–47] | 1353 [1303–1579] → 1150 [1041–1284] | 6 [6–6] → 5 [5–5] |

Les lectures sont des estimations instrumentées, pas la facture Google. Le coût serveur n’est pas remplacé par le heap du navigateur. Aucun nouveau service, index, document de synthèse, polling ou écriture métier. La concurrence des lectures détaillées ne dépasse pas celle de l’ancien code : au plus un créneau par client du lot, maximum 32. Une erreur arrête les lectures encore en file, sans retry ajouté.

## Erreurs observées

- before/1 : 36/10 HTTP {'200': 6, '404': 1}, échecs SDK 0; 36/100 HTTP {'200': 6, '404': 1}, échecs SDK 0; 100/10 HTTP {'200': 8, '404': 1}, échecs SDK 0
- before/2 : 36/10 HTTP {'200': 6, '404': 1}, échecs SDK 0; 36/100 HTTP {'200': 6, '404': 1}, échecs SDK 0; 100/10 HTTP {'200': 8, '404': 1}, échecs SDK 0
- before/3 : 36/10 HTTP {'200': 6, '404': 1}, échecs SDK 0; 36/100 HTTP {'200': 6, '404': 1}, échecs SDK 0; 100/10 HTTP {'200': 8, '404': 1}, échecs SDK 0
- after/1 : 36/10 HTTP {'200': 6, '404': 1}, échecs SDK 0; 36/100 HTTP {'200': 6, '404': 1}, échecs SDK 0; 100/10 HTTP {'200': 8, '404': 1}, échecs SDK 0
- after/2 : 36/10 HTTP {'200': 6, '404': 1}, échecs SDK 0; 36/100 HTTP {'200': 6, '404': 1}, échecs SDK 0; 100/10 HTTP {'200': 8, '404': 1}, échecs SDK 0
- after/3 : 36/10 HTTP {'200': 6, '404': 1}, échecs SDK 0; 36/100 HTTP {'200': 6, '404': 1}, échecs SDK 0; 100/10 HTTP {'200': 8, '404': 1}, échecs SDK 0
