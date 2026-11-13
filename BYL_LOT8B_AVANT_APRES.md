# Lot 8B — avant/après

Chrome froid, viewport 1440 × 1000, application Vite réelle et émulateurs locaux. Une observation par cellule, pas de percentile. main = réseau/CPU locaux ; slow = latence CDP 100 ms, téléchargement 1 500 000 octets/s, upload 750 000 ; cpu = ralentissement CDP ×4, réseau local. Cache HTTP désactivé, profil neuf par volume. Chaque dossier comporte deux programmes et deux validations ; cinq modèles et 40 événements par coach.

Les données principales correspondent à core confirmé, pas au skeleton. Le jalon painted ne couvre que les blocs instrumentés. Les 404 secondaires et flux ouverts empêchent de certifier un chargement exhaustif de toute BYL. ND ne signifie pas zéro. Les horloges pageMs et celles du runner diffèrent légèrement ; elles ne doivent pas être soustraites entre elles.

La série normale paired est la dernière paire successivement exécutée sur les fichiers finaux. Les séries ralenties précèdent uniquement l’alignement final du prédicat de confirmation sur la seconde disposition desktop ; voir TESTS. Les mesures antérieures de reload sans nouveau timeOrigin démontré sont exclues.

## Temps de premier chargement (ms)

| Conditions / clients | Contenu utile | Principal confirmé | Blocs instrumentés painted | Stabilisation réseau |
|---|---:|---:|---:|---:|
| main / 12 | 2901.66 → 2970.22 | 4230.85 → 4456.07 | 5110 → 5808 | 7291.18 → 8008.48 |
| main / 100 | 1635.44 → 788.78 | 4430.79 → 1914.36 | 6151 → 2282 | 7843.18 → 4288.21 |
| main / 500 | 1751.33 → 1070.33 | 14798.73 → 6883.72 | 18581 → 10784 | 20256.43 → 12459.23 |
| main / 1000 | 1765.88 → 1662.45 | 25857.99 → 12755.73 | 31793 → 19919 | 33466.85 → 21708.78 |
| slow / 12 | 22564.48 → 22644.96 | 23882.07 → 23993.1 | 23892 → 23987 | 26109.39 → 26184.86 |
| slow / 100 | 22449.99 → 22459.03 | 25259.19 → 24760.81 | 25312 → 24757 | 26944.85 → 26471.83 |
| slow / 500 | 22285.83 → 22306.57 | 29850.6 → 28166.06 | 33255 → 32381 | 35037.73 → 34111.37 |
| slow / 1000 | 22338.28 → 22261.8 | 33724.35 → 29747.67 | 39919 → 37139 | 41705.7 → 38917.52 |
| cpu / 12 | 2388.41 → 3470.65 | 4126.28 → 4833.24 | 5221 → 6782 | 8070.5 → 10041.13 |
| cpu / 100 | 2144.01 → 2629.85 | 7574.5 → 6481.86 | 9139 → 8786 | 10936.05 → 10770.9 |
| cpu / 500 | 2017.81 → 2939.31 | 24984.95 → 14996.65 | 28001 → 20881 | 29893.65 → 22834.51 |
| cpu / 1000 | 1921.31 → 3680.02 | 51069.0 → 30303.18 | 56658 → 43885 | 58551.79 → 45853.33 |

## Jalons de données, depuis navigation (ms)

| Conditions / clients | Admission observée | Racines confirmées | Modèles | Calendrier visible | Détails des clients |
|---|---:|---:|---:|---:|---:|
| main / 12 | 1916.8 → 1822.6 | 3499 → 3535 | 2634 → 2600 | 3878.34 → 3836.54 | 3998 → 4205 |
| main / 100 | 729.6 → 441.7 | 2338 → 1004 | 1428 → 669 | 2531.87 → 1104.91 | 4260 → 1770 |
| main / 500 | 670.4 → 444.1 | 3723 → 2123 | 1562 → 832 | 3909.13 → 2270.43 | 14515 → 6658 |
| main / 1000 | 757.2 → 669.6 | 4962 → 4044 | 1602 → 1295 | 5135.07 → 4203.07 | 25522 → 12466 |
| slow / 12 | 12677.4 → 12795.2 | 22481 → 22570 | 22148 → 22210 | 24635.86 → 24719.07 | 23812 → 23880 |
| slow / 100 | 12567.2 → 12591 | 22524 → 22435 | 22134 → 22151 | 24844.21 → 24903.19 | 25190 → 24651 |
| slow / 500 | 12591.8 → 12583.9 | 23826 → 23458 | 22120 → 22107 | 24988.3 → 25355.32 | 29666 → 27957 |
| slow / 1000 | 12581.1 → 12587.6 | 25007 → 24804 | 22067 → 22101 | 25109.06 → 24965.43 | 33537 → 29554 |
| cpu / 12 | 1218.9 → 1837.9 | 2421 → 3515 | 2133 → 3150 | 3537.39 → 4833.24 | 3508 → 4279 |
| cpu / 100 | 930.5 → 1139 | 2705 → 3278 | 1881 → 2347 | 3464.66 → 4426.21 | 7243 → 6140 |
| cpu / 500 | 959.1 → 1322.6 | 5299 → 6831 | 1755 → 2640 | 5638.13 → 7391.48 | 24513 → 14376 |
| cpu / 1000 | 799.9 → 1953.4 | 7902 → 11078 | 1672 → 3362 | 8251.14 → 11673.91 | 50403 → 29518 |

Les racines servent les noms/compteurs confirmés ; les détails sont nécessaires aux actions dépendant des progressions. Ces jalons ne remplacent pas un test individuel de chaque interaction. Les instants Firebase, Auth, profil, montage, nutrition et rendu sont conservés dans les JSON.

## Navigation et restauration, réseau normal (ms)

| Clients / parcours | Contenu | Principal | API lancées | Écritures backend |
|---|---:|---:|---:|---:|
| 12 / navigation | 104.76 → 113.15 | 412.34 → 347.85 | 3 → 3 | 0 → 0 |
| 12 / warm | 195.45 → 188.67 | 515.02 → 503.71 | 3 → 3 | 0 → 0 |
| 12 / reload | 1318.33 → 1331.06 | 2298.51 → 2116.28 | 8 → 7 | 0 → 0 |
| 100 / navigation | 107.75 → 117.23 | 498.25 → 478.33 | 3 → 3 | 0 → 0 |
| 100 / warm | 225.02 → 161.52 | 554.45 → 351.56 | 3 → 3 | 0 → 0 |
| 100 / reload | 1461.54 → 785.78 | 4203.64 → 1780.5 | 20 → 11 | 0 → 0 |
| 500 / navigation | 126.3 → 120.36 | 1248.19 → 989.26 | 3 → 3 | 0 → 0 |
| 500 / warm | 191.58 → 223.87 | 744.88 → 531.95 | 3 → 3 | 0 → 0 |
| 500 / reload | 1612.15 → 1230.1 | 12625.46 → 6688.94 | 70 → 23 | 0 → 0 |
| 1000 / navigation | 134.76 → 133.2 | 2129.24 → 2102.25 | 3 → 3 | 0 → 0 |
| 1000 / warm | 214.23 → 215.05 | 861.51 → 861.39 | 3 → 3 | 0 → 0 |
| 1000 / reload | 1368.8 → 1923.12 | 21196.9 → 12706.74 | 132 → 39 | 0 → 0 |

Navigation : aller sur About, attendre 1,5 s, revenir ; warm : aller-retour de 200 ms ; reload : rechargement complet avec restauration Firebase et admission réelle. Ce sont trois parcours distincts. Le premier accès après connexion est inclus dans le premier chargement ; le délai route → core est disponible via mountMs, sans faire passer l’admission pour une donnée facultative.

## Firestore et réseau

| Conditions / clients | SDK navigateur | Docs navigateur | Lectures estimées navigateur | Docs routes | Lectures estimées routes | Écritures B / serveur avant→après | HTTP lancées | Réseau Mio |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| main / 12 | 21 → 21 | 72 → 73 | 67 → 66 | 77 → 76 | 84 → 81 | (2, 0) → (2, 0) | 9 → 8 | 33.56 → 33.56 |
| main / 100 | 110 → 111 | 172 → 153 | 231 → 250 | 528 → 519 | 557 → 530 | (2, 0) → (2, 0) | 20 → 11 | 33.57 → 33.57 |
| main / 500 | 515 → 515 | 553 → 581 | 1050 → 1022 | 2578 → 2531 | 2707 → 2566 | (2, 0) → (2, 0) | 70 → 23 | 33.63 → 33.6 |
| main / 1000 | 1019 → 1020 | 1106 → 1102 | 1997 → 2001 | 5143 → 5047 | 5400 → 5114 | (2, 0) → (2, 0) | 134 → 39 | 33.7 → 33.65 |
| slow / 12 | 21 → 21 | 76 → 77 | 63 → 63 | 77 → 76 | 84 → 81 | (2, 0) → (2, 0) | 9 → 8 | 33.56 → 33.56 |
| slow / 100 | 110 → 110 | 153 → 153 | 250 → 250 | 528 → 519 | 557 → 530 | (2, 0) → (2, 0) | 20 → 11 | 33.57 → 33.57 |
| slow / 500 | 514 → 514 | 553 → 555 | 1050 → 1044 | 2578 → 2531 | 2707 → 2566 | (2, 0) → (2, 0) | 70 → 23 | 33.62 → 33.59 |
| slow / 1000 | 1019 → 1019 | 1145 → 1126 | 1958 → 1977 | 5140 → 5047 | 5393 → 5114 | (2, 0) → (2, 0) | 132 → 39 | 33.67 → 33.62 |
| cpu / 12 | 21 → 21 | 65 → 65 | 74 → 74 | 77 → 76 | 84 → 81 | (2, 0) → (2, 0) | 9 → 8 | 33.55 → 33.56 |
| cpu / 100 | 110 → 110 | 153 → 153 | 250 → 250 | 528 → 519 | 557 → 530 | (2, 0) → (2, 0) | 20 → 11 | 33.57 → 33.57 |
| cpu / 500 | 514 → 514 | 553 → 553 | 1050 → 1050 | 2581 → 2531 | 2714 → 2566 | (2, 0) → (2, 0) | 72 → 23 | 33.62 → 33.6 |
| cpu / 1000 | 1019 → 1019 | 1053 → 1053 | 2050 → 2050 | 5146 → 5050 | 5407 → 5121 | (2, 0) → (2, 0) | 136 → 41 | 34.34 → 33.65 |

Aucune nouvelle écriture métier introduite. Les écritures navigateur à froid existaient avant correction. Le réseau inclut les modules Vite, et non seulement les réponses privées. Les comptes de snapshots Admin hors HTTP sont séparés dans listeners ; aucune addition de la sonde backend générique partielle aux routes. La sonde ne fournit pas un décompte certifié de tous les listeners actifs ; aucune souscription applicative ajoutée par le diff.

## CPU, interactivité et mémoire

| Conditions / clients | JS ms | Blocage cumulé >50 ms | Heartbeat maximum ms | Heap JS Mio | Montages |
|---|---:|---:|---:|---:|---:|
| main / 12 | 3427.13 → 3762.02 | 1923 → 2217 | 459.9 → 478.2 | 81.11 → 93.09 | 7980 → 2831 |
| main / 100 | 4242.83 → 1388.23 | 2562 → 160 | 479.1 → 190.2 | 66.7 → 83.81 | 10460 → 2814 |
| main / 500 | 13398.85 → 6220.23 | 9436 → 3567 | 496.8 → 396.4 | 188.7 → 81.05 | 23211 → 2969 |
| main / 1000 | 23293.89 → 11412.35 | 16254 → 7441 | 548.3 → 468.5 | 155.55 → 175.02 | 38672 → 2946 |
| slow / 12 | 1373.17 → 1179.89 | 129 → 53 | 154.7 → 179.3 | 67.97 → 79.7 | 8793 → 2734 |
| slow / 100 | 2067.11 → 1556.05 | 245 → 85 | 178.3 → 191.1 | 53.71 → 77.17 | 12941 → 2774 |
| slow / 500 | 7282.31 → 5661.5 | 3010 → 2853 | 288.3 → 366.3 | 139.57 → 82.23 | 26879 → 2936 |
| slow / 1000 | 10451.4 → 6548.59 | 3059 → 1600 | 254.3 → 270.8 | 238.89 → 79.9 | 46575 → 2943 |
| cpu / 12 | 4821.4 → 6005.93 | 3366 → 4362 | 880.2 → 1009.6 | 92.4 → 76.15 | 7572 → 2821 |
| cpu / 100 | 7609.02 → 7021.84 | 5630 → 5352 | 879.4 → 1008.5 | 64.34 → 85.37 | 10780 → 2692 |
| cpu / 500 | 22986.91 → 13925.98 | 18125 → 11453 | 871.2 → 1200.4 | 198.13 → 85.28 | 26543 → 2902 |
| cpu / 1000 | 46434.25 → 28941.31 | 37682 → 25087 | 739.1 → 1372.9 | 243.6 → 152.89 | 48669 → 2941 |

Le heartbeat vise 50 ms ; les valeurs élevées représentent du retard du thread. Les Long Tasks ne sont pas un INP. Le heap est celui du renderer, pas la mémoire serveur. Les durées HTTP de chaque route et la somme des temps de réponse sont conservées dans les JSON : ce ne sont pas des temps CPU serveur.

## Échecs et réponses secondaires

- main/12 : HTTP {'200': 6, '404': 1} → {'200': 5, '404': 1}; SDK refus/erreurs 0 → 0; collecte OK → OK.
- main/100 : HTTP {'200': 17, '404': 1} → {'200': 8, '404': 1}; SDK refus/erreurs 0 → 0; collecte OK → OK.
- main/500 : HTTP {'200': 67, '404': 1} → {'200': 20, '404': 1}; SDK refus/erreurs 0 → 0; collecte OK → OK.
- main/1000 : HTTP {'200': 131, '404': 1} → {'200': 36, '404': 1}; SDK refus/erreurs 0 → 0; collecte OK → OK.
- slow/12 : HTTP {'200': 6, '404': 1} → {'200': 5, '404': 1}; SDK refus/erreurs 0 → 0; collecte OK → OK.
- slow/100 : HTTP {'200': 17, '404': 1} → {'200': 8, '404': 1}; SDK refus/erreurs 0 → 0; collecte OK → OK.
- slow/500 : HTTP {'200': 67, '404': 1} → {'200': 20, '404': 1}; SDK refus/erreurs 0 → 0; collecte OK → OK.
- slow/1000 : HTTP {'200': 129, '404': 1} → {'200': 36, '404': 1}; SDK refus/erreurs 0 → 0; collecte OK → OK.
- cpu/12 : HTTP {'200': 6, '404': 1} → {'200': 5, '404': 1}; SDK refus/erreurs 0 → 0; collecte OK → OK.
- cpu/100 : HTTP {'200': 17, '404': 1} → {'200': 8, '404': 1}; SDK refus/erreurs 0 → 0; collecte OK → OK.
- cpu/500 : HTTP {'200': 69, '404': 1} → {'200': 20, '404': 1}; SDK refus/erreurs 0 → 0; collecte OK → OK.
- cpu/1000 : HTTP {'200': 133, '404': 1} → {'200': 38, '404': 1}; SDK refus/erreurs 0 → 0; collecte OK → OK.

## Navigation sous contraintes (ms)

| Clients / parcours | Contenu | Principal | API | Écritures backend |
|---|---:|---:|---:|---:|
| 12 / slow/navigation | 112.31 → 115.77 | 359.04 → 353.81 | 3 → 3 | 0 → 0 |
| 12 / slow/warm | 73.13 → 145.8 | 317.79 → 380.37 | 2 → 3 | 0 → 0 |
| 12 / slow/reload | ND → ND | ND → ND | 9 → 8 | 0 → 0 |
| 12 / cpu/navigation | 495.35 → 335.58 | 1369.43 → 1210.55 | 3 → 3 | 0 → 0 |
| 12 / cpu/warm | 291.15 → 224.53 | 1297.9 → 1221.54 | 4 → 3 | 0 → 0 |
| 12 / cpu/reload | ND → ND | ND → ND | 4 → 7 | 0 → 0 |
| 100 / slow/navigation | 115.98 → 116.33 | 465.15 → 444.84 | 3 → 3 | 0 → 0 |
| 100 / slow/warm | 145.24 → 160.54 | 343.27 → 356.1 | 3 → 3 | 0 → 0 |
| 100 / slow/reload | ND → ND | ND → ND | 20 → 11 | 0 → 0 |
| 100 / cpu/navigation | 323.78 → 325.76 | 1659.52 → 1676.18 | 3 → 3 | 0 → 0 |
| 100 / cpu/warm | 267.87 → 484.37 | 1323.59 → 1262.84 | 3 → 3 | 0 → 0 |
| 100 / cpu/reload | ND → ND | ND → ND | 19 → 10 | 0 → 0 |
| 500 / slow/navigation | 119.72 → 121.32 | 1063.18 → 1054.84 | 3 → 3 | 0 → 0 |
| 500 / slow/warm | 195.93 → 212.45 | 426.57 → 460.71 | 3 → 3 | 0 → 0 |
| 500 / slow/reload | ND → ND | ND → ND | 70 → 23 | 0 → 0 |
| 500 / cpu/navigation | 337.27 → 354.52 | 3624.23 → 3514.64 | 3 → 3 | 0 → 0 |
| 500 / cpu/warm | 369.26 → 411.81 | 1696.99 → 1669.24 | 3 → 3 | 0 → 0 |
| 500 / cpu/reload | ND → ND | ND → ND | 70 → 23 | 0 → 0 |
| 1000 / slow/navigation | 133.25 → 132.97 | 1832.97 → 2075.57 | 3 → 3 | 0 → 0 |
| 1000 / slow/warm | 257.91 → 286.99 | 529.77 → 623.54 | 3 → 3 | 0 → 0 |
| 1000 / slow/reload | ND → ND | ND → ND | 132 → 39 | 0 → 0 |
| 1000 / cpu/navigation | 388.45 → 442.22 | 6286.31 → 7280.34 | 3 → 3 | 0 → 0 |
| 1000 / cpu/warm | 524.96 → 648.42 | 2068.93 → 2535.18 | 3 → 3 | 0 → 0 |
| 1000 / cpu/reload | ND → ND | ND → ND | 134 → 39 | 0 → 0 |

Contrôles de fraîcheur des jalons : before-transitions/12/slow/reload : nouveau contexte/signal non démontré, temps exclu; before-transitions/12/cpu/reload : nouveau contexte/signal non démontré, temps exclu; before-transitions/100/slow/reload : nouveau contexte/signal non démontré, temps exclu; before-transitions/100/cpu/reload : nouveau contexte/signal non démontré, temps exclu; before-transitions/500/slow/reload : nouveau contexte/signal non démontré, temps exclu; before-transitions/500/cpu/reload : nouveau contexte/signal non démontré, temps exclu; before-transitions/1000/slow/reload : nouveau contexte/signal non démontré, temps exclu; before-transitions/1000/cpu/reload : nouveau contexte/signal non démontré, temps exclu; after-transitions/12/slow/reload : nouveau contexte/signal non démontré, temps exclu; after-transitions/12/cpu/reload : nouveau contexte/signal non démontré, temps exclu; after-transitions/100/slow/reload : nouveau contexte/signal non démontré, temps exclu; after-transitions/100/cpu/reload : nouveau contexte/signal non démontré, temps exclu; after-transitions/500/slow/reload : nouveau contexte/signal non démontré, temps exclu; after-transitions/500/cpu/reload : nouveau contexte/signal non démontré, temps exclu; after-transitions/1000/slow/reload : nouveau contexte/signal non démontré, temps exclu; after-transitions/1000/cpu/reload : nouveau contexte/signal non démontré, temps exclu

## Écoutes actives observées au passage froid de la série transitions

| Clients | SDK navigateur actif | Pic SDK navigateur | Handles Admin actifs |
|---|---:|---:|---:|
| 12 | 5 → 5 | 5 → 5 | 2 → 2 |
| 100 | 6 → 6 | 6 → 6 | 2 → 2 |
| 500 | 10 → 10 | 10 → 10 | 2 → 2 |
| 1000 | 15 → 15 | 15 → 15 | 2 → 2 |

Ces compteurs sont des abonnements/handles SDK actifs du banc, pas le nombre de connexions physiques multiplexées ni la consommation future après la fenêtre. La sonde de souscriptions a été ajoutée pour cette série complémentaire ; les autres séries ne prétendent pas mesurer un nombre actif exact.

Ces parcours conservent le même compte autorisé. Les conditions lentes sont appliquées après le premier lancement local, avant chaque navigation, retour ou reload. Seuls les reload avec changement de timeOrigin démontré sont retenus ; les mesures antérieures sans cette preuve sont ND, même si leur durée semblait plausible.

## Démarrage détaillé, réseau normal (ms depuis navigation)

| Clients | HTML responseEnd | Module Firebase prêt | Entrée JS | Session restaurée | Admission observée | Montage Dashboard |
|---|---:|---:|---:|---:|---:|---:|
| 12 | 40.6 → 26.9 | 874.4 → 830.6 | 887 → 841 | 1013.3 → 944.2 | 1916.8 → 1822.6 | 2001 → 1980 |
| 100 | 4.4 → 3.5 | 405.2 → 231 | 414.3 → 235.6 | 548.2 → 307.3 | 729.6 → 441.7 | 932 → 463 |
| 500 | 4.2 → 3.1 | 398.9 → 219.9 | 407.7 → 225.2 | 503.2 → 313.9 | 670.4 → 444.1 | 885 → 491 |
| 1000 | 5.8 → 3.5 | 468.1 → 399.5 | 478.4 → 409.7 | 583.1 → 508.1 | 757.2 → 669.6 | 998 → 812 |

## Durée et transfert des réponses API

| Conditions / clients | Somme latences serveur ms | Plus lente route instrumentée ms | Réponses API octets |
|---|---:|---:|---:|
| main / 12 | 1482.41 → 1548.97 | 420 → 606 | 1343 → 1116 |
| main / 100 | 2945.0 → 1970.34 | 249 → 578 | 4413 → 2316 |
| main / 500 | 11985.35 → 9963.86 | 582 → 755 | 18495 → 7476 |
| main / 1000 | 66898.71 → 19335.0 | 24058 → 861 | 36495 → 14093 |
| slow / 12 | 630.53 → 577.97 | 170 → 197 | 1344 → 1114 |
| slow / 100 | 2482.32 → 1624.22 | 233 → 493 | 4433 → 2315 |
| slow / 500 | 10542.31 → 9669.3 | 316 → 698 | 18544 → 7424 |
| slow / 1000 | 14803.2 → 11543.53 | 171 → 489 | 36201 → 14101 |
| cpu / 12 | 425.31 → 431.71 | 156 → 228 | 1341 → 1115 |
| cpu / 100 | 1505.8 → 1754.0 | 139 → 561 | 4417 → 2315 |
| cpu / 500 | 53372.51 → 6923.65 | 24019 → 530 | 18890 → 7491 |
| cpu / 1000 | 105821.6 → 58785.33 | 24013 → 24020 | 36865 → 14470 |

## Route détaillée seule, hors attentes de messagerie

| Clients | Appels détaillés | Documents retournés | Lectures estimées |
|---|---:|---:|---:|
| 12 | 2 → 1 | 62 → 61 | 66 → 63 |
| 100 | 13 → 4 | 513 → 504 | 539 → 512 |
| 500 | 63 → 16 | 2563 → 2516 | 2689 → 2548 |
| 1000 | 125 → 32 | 5125 → 5032 | 5375 → 5096 |
