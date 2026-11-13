# Programmes détaillés — comparaison synthétique

Trois passages avant et trois passages après, même SDK, même bundle compilé, émulateurs, profils Chrome jetables. Les premières séries étaient alternées ; les trois passages après ont été rejoués avec les plafonds finaux. 36 clients, 90 programmes, 900 validations ; champ synthétique riche par programme (336 000 caractères), conservé intégralement. Médiane [min–max].

| Mesure | Avant | Après |
|---|---:|---:|
| Principal confirmé (ms) | 3084 [3079–3168] | 1647 [1617–1895] |
| Retour chaud (ms) | 301 [281–302] | 298 [277–298] |
| SDK navigateur | 159 [159–159] | 45 [45–45] |
| Documents navigateur | 1002 [1002–1003] | 97 [89–109] |
| Estimation navigateur | 1013 [1012–1013] | 114 [102–122] |
| Lectures SDK détaillées backend | 134 [134–134] | 134 [134–134] |
| Documents détaillés backend | 1028 [1028–1028] | 1028 [1028–1028] |
| Lectures estimées détaillées backend | 1032 [1032–1032] | 1032 [1032–1032] |
| Appels API détaillés | 2 [2–2] | 2 [2–2] |
| Écritures navigateur | 2 [2–2] | 2 [2–2] |
| Écritures backend | 0 [0–0] | 0 [0–0] |
| Corps HTTP détaillés, octets compressés | 8497 [8485–8498] | 94607 [94567–94646] |
| Ressources réseau terminées, octets (partiel) | 2820130 [2820129–2821172] | 2900915 [2900604–2900995] |
| CPU JS navigateur (ms) | 1590 [1558–1599] | 1038 [991–1126] |
| Heap navigateur (Mio) | 110 [98–147] | 66 [58–73] |

Le backend lit les mêmes documents. Le gain documentaire vient de la suppression du repli SDK après 413. Les deux écritures navigateur sont existantes, aucune écriture ajoutée. Les métriques sont des estimations, pas des relevés de facturation.

Attention : le compteur réseau observe les ressources terminées. Il ne mesure pas intégralement les canaux Firestore persistants ; les octets API ne doivent pas être comparés seuls pour conclure sur le trafic total. La mémoire ci-dessus est celle du navigateur, pas de l’instance Google.

Les plafonds de transfert, le contrat ancien, la décompression sans perte, les refus d’accès et le cas incompressible sont testés séparément. Les compteurs métier avant/après sont identiques.
