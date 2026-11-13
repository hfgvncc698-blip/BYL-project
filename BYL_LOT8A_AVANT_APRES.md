# Lot 8A — mesures avant/après

Mesures locales sur Chrome froid 1440 px, application Vite de développement et émulateurs. Un passage par cellule : variations de JIT, compilation et scheduling possibles. Historique h = nombre total de validations réparties entre programmes. Les ressources de développement ne représentent pas le bundle distribué.

**Chargement complet : non démontré.** La stabilisation est 1,5 s sans nouveaux octets achevés, pas la fin de tous les flux. Les routes secondaires non montées peuvent retourner 404 ; les mesures restent partielles. ND = indisponible ou jalon non atteint. Les données principales sont signalées par les composants, le premier contenu utile par la présence de données synthétiques autorisées. Le squelette est mesuré séparément dans les JSON.

## Temps, millisecondes

| Scénario | Premier contenu utile | Données principales | Stabilisation observée |
|---|---:|---:|---:|
| coach 12 | 1460.56 → 1572.21 | 1837.42 → 1934.56 | 4508.92 → 4555.54 |
| coach 100 | 924.1 → 962.67 | 2447.82 → 2310.95 | 4945.37 → 4814.45 |
| coach 500 | 1001.05 → 988.49 | 7257.09 → 7124.56 | 10544.62 → 10602.8 |
| clients 100 | 609.16 → 582.13 | 2159.03 → 1024.36 | 3946.0 → 3954.63 |
| clients 500 | 567.57 → 564.93 | 7883.52 → 1356.27 | 9456.04 → 3961.71 |
| client 5 / h100 | 834.75 → 821.47 | 1063.6 → 1153.49 | 4135.03 → 4177.98 |
| client 5 / h1000 | 918.08 → 813.53 | 1283.26 → 1196.11 | 4000.95 → 4046.74 |
| client 20 / h100 | 786.83 → 792.47 | 2439.3 → 2553.18 | 4346.63 → 4455.86 |
| client 20 / h1000 | 848.48 → 814.68 | 3040.76 → 3139.03 | 5098.46 → 5079.76 |
| club 100 | 934.34 → 929.09 | 832.53 → 826.06 | 3849.22 → 3841.72 |
| club 500 | 945.77 → 958.1 | 843.52 → 855.51 | 3881.75 → 3882.35 |
| coach 12 calendrier | 1460.84 → 1444.68 | 1589.73 → 1573.63 | 4288.98 → 4406.39 |
| client 5 / h100 calendrier | 849.29 → 875.24 | 1072.69 → 1143.78 | 3904.32 → 4060.06 |
| club 100 calendrier | 751.08 → 746.18 | 647.62 → 642.72 | 3870.57 → 3862.21 |
| messages 100 | 979.75 → 956.98 | 979.75 → 956.98 | 4976.18 → 3582.45 |
| messages 1000 | 1513.08 → 683.66 | 1513.08 → 683.66 | ND → 3244.67 |

## Coûts documentaires observés

B = navigateur ; R = routes instrumentées ; L = documents de snapshots Admin hors HTTP. Ces colonnes sont séparées pour éviter de confondre SDK, HTTP, documents et facturation. La sonde générique backend partielle n’est pas ajoutée aux routes. Écritures = navigateur / backend après seed. Les erreurs et requêtes encore ouvertes ne sont pas converties en lectures nulles.

| Scénario | SDK B | Documents B | Estimation B | Documents R | Estimation R | Documents L | Écritures B | Écritures backend |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| coach 12 | 21 → 21 | 70 → 76 | 69 → 63 | 67 → 67 | 75 → 75 | 0 → 0 | 2 → 2 | 0 → 0 |
| coach 100 | 110 → 110 | 168 → 153 | 235 → 250 | 518 → 518 | 548 → 548 | 0 → 0 | 2 → 2 | 0 → 0 |
| coach 500 | 514 → 514 | 553 → 580 | 1050 → 1023 | 2568 → 2568 | 2698 → 2698 | 0 → 0 | 2 → 2 | 0 → 0 |
| clients 100 | 4 → 4 | 106 → 106 | 104 → 104 | 505 → 158 | 714 → 225 | 0 → 0 | 1 → 1 | 100 → 31 |
| clients 500 | 8 → 8 | 506 → 506 | 504 → 504 | 2521 → 153 | 3562 → 218 | 0 → 0 | 1 → 1 | 500 → 30 |
| client 5 / h100 | 30 → 30 | 575 → 575 | 168 → 168 | 9 → 9 | 17 → 17 | 0 → 0 | 6 → 6 | 0 → 0 |
| client 5 / h1000 | 30 → 30 | 1567 → 1517 | 1067 → 1068 | 9 → 9 | 17 → 17 | 0 → 0 | 6 → 6 | 0 → 0 |
| client 20 / h100 | 90 → 90 | 2185 → 2180 | 238 → 241 | 9 → 9 | 17 → 17 | 0 → 0 | 21 → 21 | 0 → 0 |
| client 20 / h1000 | 90 → 90 | 3068 → 3059 | 1132 → 1135 | 9 → 9 | 17 → 17 | 0 → 0 | 21 → 21 | 0 → 0 |
| club 100 | 1 → 1 | 3 → 3 | 2 → 2 | 321 → 321 | 417 → 417 | 2 → 2 | 1 → 1 | 0 → 0 |
| club 500 | 1 → 1 | 3 → 3 | 2 → 2 | 921 → 921 | 1017 → 1017 | 2 → 2 | 1 → 1 | 0 → 0 |
| coach 12 calendrier | 21 → 21 | 69 → 71 | 70 → 68 | 67 → 67 | 75 → 75 | 0 → 0 | 2 → 2 | 0 → 0 |
| client 5 / h100 calendrier | 30 → 30 | 585 → 583 | 169 → 168 | 9 → 9 | 17 → 17 | 0 → 0 | 6 → 6 | 0 → 0 |
| club 100 calendrier | 1 → 1 | 3 → 3 | 2 → 2 | 15 → 15 | 22 → 22 | 1 → 1 | 1 → 1 | 0 → 0 |
| messages 100 | 1 → 1 | 1 → 1 | 1 → 1 | 103 → 103 | 105 → 105 | 201 → 201 | 0 → 0 | 0 → 0 |
| messages 1000 | ND → 1 | ND → 1 | ND → 1 | 1006 → 1003 | 1012 → 1005 | 2001 → 1941 | ND → 0 | 0 → 0 |

## Ressources et API

Réseau = octets CDP achevés, incluant les modules Vite. Mémoire = heap JS utilisé, pas la mémoire totale de Chrome. JS = ScriptDuration CDP. Montages = instances function/class engagées relevées par la sonde, pas tous les éléments DOM.

| Scénario | API lancées | Réponses API octets | Réseau Mio | Heap Mio | JS ms | Montages |
|---|---:|---:|---:|---:|---:|---:|
| coach 12 | 9 → 9 | 1146 → 1146 | 33.58 → 33.55 | 69.69 → 52.16 | 1362.31 → 1328.3 | 8795 → 8752 |
| coach 100 | 20 → 20 | 4233 → 4235 | 33.59 → 33.57 | 111.15 → 94.26 | 2265.56 → 2121.45 | 12882 → 12499 |
| coach 500 | 70 → 70 | 18293 → 18363 | 33.65 → 33.62 | 196.49 → 208.2 | 6318.6 → 6317.18 | 29807 → 29172 |
| clients 100 | 7 → 5 | 1189 → 660 | 28.37 → 28.34 | 54.99 → 52.71 | 526.44 → 500.72 | 1386 → 1358 |
| clients 500 | 23 → 5 | 4966 → 655 | 28.38 → 28.34 | 54.05 → 55.96 | 642.27 → 790.21 | 1984 → 1978 |
| client 5 / h100 | 16 → 16 | 931 → 931 | 48.03 → 48.02 | 97.77 → 98.9 | 831.1 → 856.29 | 4599 → 4569 |
| client 5 / h1000 | 16 → 16 | 933 → 933 | 48.03 → 48.02 | 87.68 → 83.97 | 808.35 → 811.41 | 4499 → 4415 |
| client 20 / h100 | 15 → 16 | 896 → 933 | 48.03 → 48.03 | 88.99 → 83.43 | 1258.23 → 1405.08 | 6897 → 7692 |
| client 20 / h1000 | 16 → 16 | 935 → 935 | 48.04 → 48.03 | 72.46 → 104.28 | 1461.7 → 1344.06 | 8011 → 7406 |
| club 100 | 12 → 12 | 45199 → 45199 | 37.69 → 37.68 | 57.33 → 51.64 | 361.66 → 353.08 | 1418 → 1383 |
| club 500 | 12 → 12 | 131731 → 131731 | 37.77 → 37.76 | 52.85 → 61.44 | 374.56 → 356.61 | 1411 → 1383 |
| coach 12 calendrier | 9 → 9 | 1145 → 1145 | 33.58 → 33.55 | 70.46 → 69.86 | 1230.79 → 1195.5 | 8147 → 7808 |
| client 5 / h100 calendrier | 15 → 16 | 894 → 931 | 48.03 → 48.02 | 97.42 → 96.36 | 791.97 → 809.04 | 4412 → 4431 |
| club 100 calendrier | 8 → 8 | 938 → 938 | 37.64 → 37.64 | 53.58 → 52.46 | 329.73 → 325.04 | 1375 → 1340 |
| messages 100 | 5 → 5 | 49773 → 49773 | 29.61 → 29.58 | 83.11 → 43.42 | 2414.65 → 256.37 | 3345 → 1125 |
| messages 1000 | 5 → 5 | 504416 → 504073 | 30.05 → 30.01 | ND → 38.95 | ND → 249.44 | ND → 1125 |

## Calendriers et limites observées

| Calendrier | Coque calendrier ms | Premier événement visible ms |
|---|---:|---:|
| coach 12 calendrier | 1192.14 → 1235.89 | 1460.84 → 1444.68 |
| client 5 / h100 calendrier | 849.29 → 875.24 | 849.29 → 875.24 |
| club 100 calendrier | 647.62 → 642.72 | 751.08 → 746.18 |

## Statuts, erreurs et vérification

- coach 12 : statuts API {'200': 6, '404': 1} → {'200': 6, '404': 1}; échecs SDK 0 → 0. Échec de collecte : aucun → aucun.
- coach 100 : statuts API {'200': 17, '404': 1} → {'200': 17, '404': 1}; échecs SDK 0 → 0. Échec de collecte : aucun → aucun.
- coach 500 : statuts API {'200': 67, '404': 1} → {'200': 67, '404': 1}; échecs SDK 0 → 0. Échec de collecte : aucun → aucun.
- clients 100 : statuts API {'200': 5, '404': 1} → {'200': 3, '404': 1}; échecs SDK 0 → 0. Échec de collecte : aucun → aucun.
- clients 500 : statuts API {'200': 21, '404': 1} → {'200': 3, '404': 1}; échecs SDK 0 → 0. Échec de collecte : aucun → aucun.
- client 5 / h100 : statuts API {'200': 8, '404': 6} → {'200': 8, '404': 6}; échecs SDK 2 → 2. Échec de collecte : aucun → aucun.
- client 5 / h1000 : statuts API {'200': 8, '404': 6} → {'200': 8, '404': 6}; échecs SDK 2 → 2. Échec de collecte : aucun → aucun.
- client 20 / h100 : statuts API {'200': 8, '404': 5} → {'200': 8, '404': 6}; échecs SDK 2 → 2. Échec de collecte : aucun → aucun.
- client 20 / h1000 : statuts API {'200': 8, '404': 6} → {'200': 8, '404': 6}; échecs SDK 2 → 2. Échec de collecte : aucun → aucun.
- club 100 : statuts API {'200': 7, '404': 1} → {'200': 7, '404': 1}; échecs SDK 0 → 0. Échec de collecte : aucun → aucun.
- club 500 : statuts API {'200': 7, '404': 1} → {'200': 7, '404': 1}; échecs SDK 0 → 0. Échec de collecte : aucun → aucun.
- coach 12 calendrier : statuts API {'200': 6, '404': 1} → {'200': 6, '404': 1}; échecs SDK 0 → 0. Échec de collecte : aucun → aucun.
- client 5 / h100 calendrier : statuts API {'200': 8, '404': 5} → {'200': 8, '404': 6}; échecs SDK 2 → 2. Échec de collecte : aucun → aucun.
- club 100 calendrier : statuts API {'200': 4, '404': 1} → {'200': 4, '404': 1}; échecs SDK 0 → 0. Échec de collecte : aucun → aucun.
- messages 100 : statuts API {'200': 2, '404': 1} → {'200': 2, '404': 1}; échecs SDK 0 → 0. Échec de collecte : aucun → aucun.
- messages 1000 : statuts API {'200': 4, '404': 1} → {'200': 2, '404': 1}; échecs SDK None → 0. Échec de collecte : not-settled-within-probe-window → aucun.

Les temps serveur par route sont conservés dans `http[].durationMs`, les temps de toutes les réponses dans `api.durationMs`. La couverture des sondes est décrite dans FIREBASE. Aucun chiffre ne représente une économie réelle de facture Firebase. Les objectifs de 1/2 s ne sont pas garantis, notamment pour Coach 500 et les historiques Client volumineux. Les parcours à chaud ne sont pas une seconde matrice de benchmark : le retour Clients et les tests de cache vérifient le comportement, sans extrapoler un percentile.
