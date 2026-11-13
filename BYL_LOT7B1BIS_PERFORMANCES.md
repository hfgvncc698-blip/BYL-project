# Lot 7B.1 BIS — performances

## Mesures réellement effectuées

Microbenchmark du prototype WebCrypto sous Node v25.8.1 sur la machine de travail, une mesure par taille. Fixtures synthétiques, aucun réseau ni Firestore. Sérialisation JSON en tableau d’octets pour faciliter l’inspection de la preuve. Ce format de démonstration ne doit pas devenir le format de stockage final.

| Charge texte approximative | Chiffrement avec sérialisation ms | Déchiffrement avec parsing ms | Enveloppe JSON octets |
|---|---:|---:|---:|
| 10 000 octets | 0,28 | 0,29 | 35 865 |
| 100 000 octets | 2,24 | 0,42 | 357 668 |
| 1 000 000 octets | 26,33 | 3,85 | 3 569 246 |

Heap Node à la fin du test environ 50,1 Mo. C’est une mesure ponctuelle du processus de qualification, pas une différence mémoire navigateur ni un pic garanti. Les valeurs varient entre exécutions. Le coût de récupération du secret, d’IndexedDB, de compression et du rendu React n’est pas mesuré.

Le chiffrement brut ajoute un IV de 12 octets et un tag de 16 octets par enregistrement, hors métadonnées/enveloppe. Le tableau JSON gonfle fortement le volume mesuré. Une implémentation devrait stocker du binaire, mesurer la compression avant chiffrement et contrôler les tailles avant déchiffrement.

## Comparaison applicative

| Mesure demandée | Avant | Après |
|---|---|---|
| Première ouverture | Non rechronométrée dans ce lot | Non disponible, architecture non intégrée |
| Retour à chaud | Non rechronométré | Non disponible |
| Dashboard → programmes | Non rechronométré | Non disponible |
| Lectures Firestore | La reproduction valide la fuite, pas un benchmark de page | Aucun gain revendiqué |
| Trafic réseau | Non instrumenté dans la reproduction | Aucun gain revendiqué |
| Mémoire navigateur | Non mesurée ici | Non disponible |
| Temps de synchronisation | Non mesuré ici | Non disponible |
| Hors ligne après fermeture | Cache actuellement accessible en clair à B | Modèle coffre déverrouillable avec secret externe, pas parcours applicatif |

Aucun coût d’écriture serveur nouveau n’a été introduit. Cela découle de l’absence d’intégration applicative, et ne prédit pas le coût d’une future outbox ou récupération serveur.

## Protocole à rejouer après validation

Reprendre les fixtures programmes/historiques et nutrition des lots 4/5, même machine, même build et mêmes scénarios. Distinguer navigateur froid, coffre existant verrouillé, déverrouillage, cache mémoire chaud et resynchronisation. Relever séparément lectures SDK, documents, HTTP, octets, écritures, heap, temps de rendu et retour à fraîcheur serveur, sur un/deux onglets et mobile/desktop. Ajouter file hors ligne vide/non vide et déverrouillage après redémarrage.

La mémoire autorisée peut conserver les gains pendant une session. Changer d’identité doit l’invalider. Les données chiffrées ne remplacent pas une vérification des droits serveur. Le coût du backfill et les caches SDK à froid peuvent augmenter les lectures, à mesurer avant toute promesse de maintien des gains.
