# Lot 7B.1 TER — performances et coûts

## Mesures du prototype

Exécution finale sur Chrome/157.0.8103.50 headless, émulateurs locaux, programme et brouillon courts synthétiques. Une observation par scénario, sans percentiles ni réseau mobile. Preuve `audits/lot7b1ter/results.json`, contenant aussi les empreintes des trois fichiers exécutés.

| Scénario | Observation | Coût Firebase supplémentaire du prototype |
|---|---|---|
| Connexion habituelle + première ouverture | 56,9 ms mesurés par le runner, dont 47,1 ms pour la requête API du programme | 1 HTTP métier, 1 `getAll` transactionnel, 3 documents ciblés dont 2 présents, 0 écriture |
| Retour à chaud | 1,3 ms pour lire l’état via Chrome DevTools, pas un temps de peinture React | 0 HTTP, 0 lecture/écriture supplémentaire |
| Consultation et brouillon pendant coupure | État mémoire conservé. Attente de test 300 ms pour observer le debounce | 0 lecture/écriture tant que le réseau reste coupé |
| Reconnexion et premier accusé | 114,4 ms observés par polling de test à 100 ms, requête de sauvegarde 30,1 ms | 1 HTTP, 1 `getAll`, 4 documents ciblés, 2 présents, 2 écritures |
| Répétition même opération | Requête 16,1 ms | 1 HTTP et contrôle transactionnel, 0 nouvelle écriture |
| Conflit programme ou brouillon | État observé après environ 208–217 ms, incluant debounce 150 ms et polling du test | Relecture transactionnelle, 0 écriture métier sur conflit |
| Reprise après fermeture hors ligne | Indisponible dans A+D, comportement explicite | 0 lecture serveur possible. Les modifications non transmises ne sont pas récupérées |
| Réouverture en ligne | État vide puis récupération du brouillon confirmé après connexion A | Nouvelle admission et lecture serveur |
| Essais PRF | Voir durée de scénario dans la preuve, authentificateur virtuel | Aucun appel Firestore induit par la cryptographie de cet essai |

Le brouillon entraîne deux écritures, son document et le document d’idempotence. Le debounce ne sauvegarde pas chaque frappe et une répétition du même identifiant ne réécrit pas. La rétention des identifiants devra être bornée et mesurée lors d’une intégration.

## Total de la matrice de sécurité

27 appels HTTP vers l’API synthétique, 24 opérations SDK `getAll`, 80 références documentaires ciblées, 68 documents présents retournés, 4 écritures métier. Ce total inclut refus, répétitions, reconnexions et conflits artificiels. Ce n’est pas le coût d’un parcours utilisateur normal.

Le champ historique `sdkReads` de la preuve compte les références documentaires demandées. `sdkOperations` compte les appels `getAll`. Les 80 références constituent une estimation documentaire simple incluant documents absents, pas une facture réelle. Le compteur d’écritures est incrémenté dans le callback transactionnel et pourrait compter des tentatives en cas de retry. Aucun test de facturation réelle ni d’index n’a lieu.

Les opérations de création des fixtures, de modification des droits et d’assertion directe via Admin SDK sont exclues de ces compteurs. Les échanges Auth/Firebase de vérification de jeton, Vite et le transport DevTools sont distincts du HTTP métier compté. Les chiffres ne sont donc pas présentés comme tout le trafic réseau du navigateur.

## Mémoire et stockage

Heap JavaScript mesuré avant arrêt de Chrome environ 3,30 Mo utilisés et 4,64 Mo alloués. Mesure ponctuelle, pas un pic ni le RSS complet. Les chiffres n’incluent pas une volumétrie réelle de programmes BYL.

Aucune copie métier persistante nouvelle détectée dans les stockages inspectés du profil vierge. La base technique Firebase heartbeat existe. Après ajout de la fixture de nutrition héritée, celle-ci persiste intentionnellement et reste exposée. Les tailles et métadonnées de ce stockage ne doivent pas être confondues avec un coffre chiffré validé.

Les tailles `bytes` de la preuve sont celles du JSON de réponse réencodé. Première réponse programme 163 caractères ASCII, accusé de sauvegarde 14, réponses de conflit 28. Elles n’incluent pas headers, TLS, requêtes, Auth, assets ou compression et ne constituent pas une capture réseau complète.

## Comparaison avec BYL et options B/C

Aucun avant/après de Dashboard BYL n’est revendiqué. Le prototype n’importe aucun module applicatif et ne change pas les gains des Lots 1 à 6. Les résultats sont une base pour dimensionner une intégration, pas une preuve de non-régression globale.

L’option mémoire privilégie le retour chaud sans lectures, avec coût serveur pour la sauvegarde et la réouverture. PRF permettrait une persistance locale sans écriture Firebase par édition, mais son déverrouillage dépend du matériel et du fournisseur. Les durées virtuelles ne prédisent pas une interaction biométrique, l’enrôlement, le changement d’appareil ou le coût d’une récupération.

Avant activation, mesurer sur les mêmes fixtures métier les volumes de brouillons, debounce, rétention, cache autorisé, reconstruction à froid, latence réseau mobile et mémoire. Mesurer séparément admission, consultation, sauvegarde, reprise et vérification de droits.
