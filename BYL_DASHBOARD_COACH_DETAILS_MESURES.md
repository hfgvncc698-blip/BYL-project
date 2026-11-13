# Dashboard Coach — détails à la demande : mesures synthétiques

Deux séries alternées avant/après, application compilée, mêmes versions Firebase, émulateurs et profils Chrome jetables. 36 clients, 90 programmes, 900 validations. Descriptions de 336 000 caractères et détails historiques synthétiques volumineux. Médiane [min–max]. Les données principales sont confirmées ; un squelette ne termine pas la mesure.

| Mesure | Avant | Après |
|---|---:|---:|
| Principal confirmé (ms) | 2701 [2689–2713] | 1740 [1579–1901] |
| Retour chaud (ms) | 338 [326–349] | 249 [241–257] |
| SDK navigateur | 45 [45–45] | 45 [45–45] |
| Documents navigateur | 95 [89–101] | 100 [99–101] |
| Estimation navigateur | 116 [110–122] | 111 [110–112] |
| Lectures SDK détaillées backend | 134 [134–134] | 134 [134–134] |
| Documents détaillés backend | 1028 [1028–1028] | 1028 [1028–1028] |
| Lectures estimées détaillées backend | 1032 [1032–1032] | 1032 [1032–1032] |
| Appels API détaillés | 2 [2–2] | 2 [2–2] |
| Écritures navigateur | 2 [2–2] | 2 [2–2] |
| Écritures backend | 0 [0–0] | 0 [0–0] |
| Corps HTTP détaillés, octets compressés | 310886 [310631–311142] | 1566 [1565–1566] |
| Ressources réseau terminées, octets (partiel) | 3117414 [3117334–3117494] | 2807580 [2807580–2807581] |
| CPU JS navigateur (ms) | 1128 [1123–1133] | 1051 [1022–1080] |
| Heap navigateur (Mio) | 127 [95–160] | 50 [49–50] |

Les compteurs métier (clients, programmes, validations, séances prévues et calendrier) sont identiques. Même nombre de lectures détaillées, aucune écriture ajoutée. Ce sont des estimations documentaires, pas la facture Firebase.

Les corps HTTP indiquent les octets compressés. Le trafic total observé est partiel : les canaux Firestore persistants ne sont pas tous terminés. La mémoire mesurée est celle du navigateur, pas celle du service Google. La fixture favorise la compression de textes répétitifs ; elle ne prédit pas le temps du compte local.

Les métadonnées de toutes les validations restent lues. Les descriptions et contenus détaillés historiques sont chargés par les lecteurs existants lors de la consultation. Les prescriptions nécessaires au Radar restent complètes : aucune lecture supplémentaire pour ces actions.
