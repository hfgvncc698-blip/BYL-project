# Essai de résumés — mesures

## Dashboard complet, 36 clients synthétiques

Deux séries alternées avant/après, application réelle compilée, Chrome jetable, Auth/Firestore émulés. 90 programmes, 900 historiques. Médiane [min–max]. La première ouverture crée les résumés ; le rechargement suivant les réutilise. Il ne faut pas comparer ce rechargement au premier lancement ni à la mesure locale précédente de 13,77 s.

| Mesure | Avant | Pilote |
|---|---:|---:|
| Premier contenu réel (ms) | 827 [671–982] | 750 [732–769] |
| Principal confirmé, première création (ms) | 1845 [1659–2031] | 1740 [1640–1840] |
| Rechargement, résumés déjà prêts (ms) | 1046 [981–1110] | 658 [625–691] |
| Retour chaud (ms) | 280 [278–282] | 276 [259–293] |
| SDK navigateur | 45 [45–45] | 45 [45–45] |
| SDK backend programmes à la création | 134 [134–134] | 136 [136–136] |
| Documents programmes à la création | 1028 [1028–1028] | 1028 [1028–1028] |
| Lectures estimées programmes à la création | 1032 [1032–1032] | 1068 [1068–1068] |
| Écritures backend à la création | 0 [0–0] | 36 [36–36] |
| Écritures navigateur | 2 [2–2] | 2 [2–2] |
| Octets API programmes compressés | 1530 [1494–1566] | 1565 [1564–1566] |
| CPU JavaScript navigateur (ms) | 1058 [1052–1064] | 1044 [1007–1081] |
| Heap navigateur (Mio) | 50 [50–50] | 45 [40–50] |
| Validation : synchronisation (ms) | 442 [435–449] | 562 [464–661] |
| Suppression : synchronisation (ms) | 513 [509–517] | 398 [376–419] |

Les compteurs métier sont identiques. Les données transférées et le travail de rendu restent pratiquement identiques : le gain vient surtout des lectures serveur évitées. Les validations et suppressions changent bien les statistiques à l’écran. La reconstruction du dossier modifié ajoute 1 lecture et 1 écriture de résumé ; son annuaire et les autres dossiers ne sont pas reconstruits.

## API protégée : création et consultations suivantes

Une référence et une création par fixture, puis deux consultations avec résumé présent. Latences locales et émulateurs ; aucune facture réelle. Avant et après renvoient une projection strictement identique (empreinte de l’intégralité des réponses). Les nombres ci-dessous sont des lectures documentaires estimées, autorisation incluse.

| Clients | Programmes | Historiques | Avant ms | Création ms | Résumé présent ms (médiane) | Lectures avant | Lectures création | Lectures suivantes | Écritures création |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 12 | 0 | 0 | 91 | 42 | 24 | 27 | 39 | 27 | 12 |
| 12 | 24 | 0 | 70 | 65 | 22 | 63 | 75 | 27 | 12 |
| 12 | 24 | 240 | 82 | 74 | 20 | 279 | 291 | 27 | 12 |
| 36 | 72 | 7200 | 669 | 571 | 48 | 7314 | 7350 | 78 | 36 |
| 100 | 200 | 2000 | 739 | 718 | 40 | 2312 | 2412 | 212 | 100 |
| 500 | 1000 | 10000 | 7214 | 7314 | 136 | 11548 | 12048 | 1048 | 500 |
| 12 | 24 | 24000 | 1481 | 1432 | 107 | 24039 | 24051 | 27 | 12 |

## Coût complet et seuil de rentabilité

Soit R le prix d’une lecture et W celui d’une écriture. Après N consultations serveur sans modification : avant = N × B × R ; pilote = C × R + E × W + (N−1) × H × R, avec B les lectures de référence, C celles de création, E ses écritures et H les lectures du résumé. Il faut compter aussi le stockage et les ressources serveur. Les ratios ci-dessous sont des hypothèses de sensibilité, **pas des tarifs Google**.

| Clients / programmes / historiques | Consultations nécessaires si W/R=1 | Si W/R=3 | Si W/R=5 | Résumés compressés stockés (octets) |
|---|---:|---:|---:|---:|
| 0 / 0 / 0 | aucun surcoût | aucun surcoût | aucun surcoût | 0 |
| 12 / 0 / 0 | jamais | jamais | jamais | 264 |
| 12 / 24 / 0 | 2 | 3 | 3 | 2268 |
| 12 / 24 / 240 | 2 | 2 | 2 | 5784 |
| 36 / 72 / 7200 | 2 | 2 | 2 | 51840 |
| 100 / 200 / 2000 | 2 | 2 | 2 | 48200 |
| 500 / 1000 / 10000 | 2 | 2 | 2 | 241000 |
| 12 / 24 / 24000 | 2 | 2 | 2 | 195168 |

Une consultation après chaque modification reconstruit le résumé et peut coûter plus cher que la référence. Un dossier vide peut ne jamais amortir la création. Une navigation à chaud déjà servie par le cache navigateur ne constitue pas une consultation serveur économisée. Il serait donc incorrect de garantir un coût inférieur pour tous les utilisateurs à partir des seuls accès avec cache présent.

## CPU et mémoire du processus de test

| Clients / historiques | CPU référence ms | CPU création ms | CPU résumé ms (médiane) | RSS max observé référence / création / résumé (Mio) |
|---|---:|---:|---:|---|
| 0 / 0 | 0 | 0 | 0 | 153 / 153 / 153 |
| 12 / 0 | 60 | 23 | 13 | 161 / 163 / 164 |
| 12 / 0 | 57 | 51 | 9 | 174 / 178 / 182 |
| 12 / 240 | 91 | 66 | 8 | 198 / 205 / 205 |
| 36 / 7200 | 530 | 408 | 50 | 320 / 347 / 370 |
| 100 / 2000 | 513 | 455 | 32 | 413 / 416 / 416 |
| 500 / 10000 | 1753 | 1705 | 110 | 480 / 453 / 431 |
| 12 / 24000 | 731 | 676 | 133 | 464 / 477 / 513 |

CPU et RSS concernent le processus Node du banc, qui contient le SDK, les routes et les fixtures. RSS est échantillonné toutes les 10 ms et dépend du GC et des scénarios précédents ; il ne mesure ni le pic exact ni le coût mémoire d’une instance Google. Le trafic réseau navigateur observe seulement les ressources terminées. Ni les entrées d’index facturées, ni la facture Firebase/Google ne sont observées par les émulateurs. Aucun service ou capacité supplémentaire n’est déployé.
