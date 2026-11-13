# Résumés sécurisés — mesures sur émulateurs

## Dashboard complet

Deux séries alternées, application compilée, profils Chrome jetables. 36 clients / 90 programmes / 900 historiques. Même protocole de mutation atomique dans les deux variantes ; seule la lecture utilise ou non le cache mémoire. Médiane [min–max]. Aucun coût de migration réelle ou de facturation Google n’est inclus.

| Mesure | Référence canonique | Cache protégé |
|---|---:|---:|
| Premier contenu réel (ms) | 635 [619–650] | 732 [730–735] |
| Principal confirmé, cache serveur vide (ms) | 1546 [1478–1614] | 1660 [1652–1667] |
| Rechargement, cache serveur présent (ms) | 1027 [891–1163] | 589 [580–598] |
| Retour chaud (ms) | 279 [275–282] | 268 [257–279] |
| SDK navigateur | 45 [45–45] | 45 [45–45] |
| Lectures programmes estimées au premier accès | 1032 [1032–1032] | 1032 [1032–1032] |
| Écritures backend au premier accès | 0 [0–0] | 0 [0–0] |
| Écritures navigateur au premier accès | 2 [2–2] | 2 [2–2] |
| Octets HTTP programmes au premier accès | 1565 [1565–1565] | 1566 [1565–1566] |
| CPU JS navigateur (ms) | 1018 [978–1058] | 1035 [1014–1055] |
| Heap navigateur (Mio) | 50 [50–51] | 50 [49–50] |
| Validation synchronisée (ms) | 466 [431–501] | 474 [473–474] |
| Suppression synchronisée (ms) | 486 [461–511] | 440 [417–464] |

La référence utilise déjà les projections allégées du lot précédent. Le payload métier reste identique ; les petits écarts d’octets proviennent notamment des dates synthétiques. Ni squelette ni ancien cache client ne sont comptés comme des données principales confirmées.

## API par volume

Une référence et un remplissage, puis deux réutilisations par fixture. Les durées API ne sont pas les temps de rendu du Dashboard. Lectures = estimations documentaires incluant admission et dossiers.

| Clients | Programmes | Historiques | Référence ms | Cache vide ms | Cache présent ms (médiane) | Lectures référence | Lectures cache vide | Lectures suivantes | Écritures cache |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 12 | 0 | 0 | 93 | 45 | 40 | 27 | 27 | 27 | 0 |
| 12 | 24 | 0 | 96 | 57 | 56 | 63 | 63 | 63 | 0 |
| 12 | 24 | 240 | 86 | 59 | 18 | 279 | 279 | 15 | 0 |
| 36 | 72 | 7200 | 690 | 611 | 56 | 7314 | 7314 | 42 | 0 |
| 100 | 200 | 2000 | 1148 | 900 | 40 | 2312 | 2312 | 112 | 0 |
| 500 | 1000 | 10000 | 8649 | 8276 | 126 | 11548 | 11548 | 548 | 0 |
| 12 | 24 | 24000 | 1576 | 1490 | 100 | 24039 | 24039 | 15 | 0 |

Les dossiers vides et peu coûteux restent canoniques : aucune lecture de document de résumé et aucune écriture. Un cache absent, expiré, évincé ou un processus redémarré repart du parcours de référence. Une mutation invalide seulement sa génération ; aucun résumé persistant à reconstruire. Les assertions vérifient l’absence d’augmentation des lectures et écritures sur toutes ces phases.

## CPU et mémoire serveur observés

| Clients / programmes / historiques | CPU référence ms | CPU remplissage ms | CPU réutilisation ms (médiane) | RSS max observé référence / remplissage / réutilisation (Mio) |
|---|---:|---:|---:|---|
| 0 / 0 / 0 | 0 | 0 | 0 | 149 / 149 / 149 |
| 12 / 0 / 0 | 59 | 26 | 26 | 155 / 157 / 158 |
| 12 / 24 / 0 | 79 | 43 | 49 | 168 / 168 / 184 |
| 12 / 24 / 240 | 132 | 45 | 9 | 197 / 198 / 198 |
| 36 / 72 / 7200 | 453 | 378 | 74 | 331 / 365 / 389 |
| 100 / 200 / 2000 | 524 | 442 | 62 | 393 / 402 / 402 |
| 500 / 1000 / 10000 | 1846 | 1619 | 101 | 443 / 441 / 443 |
| 12 / 24 / 24000 | 585 | 533 | 125 | 473 / 494 / 543 |

RSS et CPU concernent le processus du banc, après génération de fixtures, et dépendent du GC. Le plafond de 16 Mio porte sur les chaînes sérialisées en UTF-8 retenues par le cache, pas sur le RSS total du processus. Il faut aussi compter les objets JavaScript, les chaînes et les réponses temporaires. Aucune capacité ou instance Google supplémentaire n’est créée.

## Limites économiques

- Aucun coût de lecture/écriture de cache Firestore, ni index ou stockage persistant supplémentaire.
- Le protocole atomique lui-même écrit la mutation et la révision du dossier ; ces deux écritures sont présentes dans les deux variantes comparées. Cela ne prouve pas que la migration de chaque ancien auteur vers ce protocole soit gratuite.
- Les lectures dépendantes des règles (`get`/`getAfter`) et les coûts d’invocation des fonctions existantes ne sont pas une facture observable sur émulateur ; ils doivent être qualifiés avant activation réelle.
- CPU et mémoire peuvent varier et le remplissage ajoute du traitement local. Aucune garantie absolue de facture Google identique pour tous les usages ne découle de ces tests.
- Les écritures privilégiées non coordonnées restent hors garantie. Aucun dossier réel n’est enrôlé ; l’application active reste inchangée.
