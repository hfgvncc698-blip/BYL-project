# Lot 7B.1 TER — tests

## Reproduction

```sh
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" node scripts/runOfflineDraftLot7B1Ter.cjs
```

Le lanceur archive HEAD dans un répertoire temporaire, copie uniquement les fichiers du prototype, exclut les `.env` et lance les émulateurs Auth/Firestore sur le projet `demo-byl-performance`. Chrome utilise un profil jetable. Aucune session du navigateur utilisateur n’est manipulée. Les coupures sont imposées avec le protocole réseau de Chrome, pas seulement un drapeau dans le store.

Sources du prototype

- `scripts/runOfflineDraftLot7B1Ter.cjs` — isolation et émulateurs.
- `scripts/testOfflineDraftLot7B1Ter.cjs` — API transactionnelle synthétique, tests et orchestration Chrome.
- `scripts/fixtures/lot7b1ter/session.js` — connexion Firebase, mémoire, brouillon, états, barrière et expérience PRF.

## Résultat final

25 contrôles exécutés, sortie 0. Ils incluent des caractérisations de limites attendues, notamment la lecture des données héritées et l’impossibilité de reprendre la session fermée hors ligne.

## Matrice et portée

| Scénario | Résultat et limite |
|---|---|
| Connexion Firebase A et ouverture | Programme synthétique autorisé reçu, sans second mot de passe |
| Retour à chaud | Aucun nouvel appel serveur pour la consultation mémoire |
| Coupure réseau | Programme consultable, modifications gardées et état en attente |
| Reconnexion | Sauvegarde automatique du brouillon, sans publier/modifier le programme |
| Répétition de sauvegarde | Même opération sans nouvelles écritures |
| Modification distante programme | HTTP 409, modification locale conservée |
| Modification distante brouillon | HTTP 409, contenu distant préservé et modification locale conservée |
| Échec serveur simulé | État d’échec visible, nouvelle tentative réussie |
| Déconnexion pendant HTTP retardé | Requête annulée et contenu retiré, pas de repeuplement par la réponse |
| Compte B dans même onglet | Programme absent du DOM et de `ter.view`, API serveur refuse |
| Deux onglets | Connexion de B verrouille l’onglet A, sans transfert du programme |
| Changement de rôle | Lecture et mutation avec jeton de session précédent refusées |
| Changement de club | Lecture et mutation refusées |
| Révocation d’accès du prototype | Lecture et mutation refusées au prochain échange, pas de garantie de détection hors ligne |
| Désactivation Firebase Auth | Ancien jeton refusé pour lecture et mutation API |
| IndexedDB/localStorage/sessionStorage vierges | Aucun marqueur métier synthétique trouvé. Base heartbeat technique Firebase présente |
| Nutrition héritée | **Toujours lisible directement**, test de caractérisation du risque, pas succès de confidentialité |
| PRF avec authentificateur virtuel | Chiffrement et nouveau `get()` permettent le déchiffrement, credential distinct refusé |
| Authentificateur sans PRF | Échec explicite `PRF-unavailable`, pas de clé de secours persistée |
| Arrêt complet et redémarrage Chrome hors ligne | Session et brouillon mémoire indisponibles. La page du prototype n’a pas de Service Worker et son shell ne se recharge pas hors ligne |
| Réouverture en ligne | État initial verrouillé, récupération de la dernière sauvegarde serveur de A après sa connexion |
| Nutrition héritée après redémarrage | Copie synthétique toujours présente, aucune suppression |

La preuve finale et ses mesures se trouvent dans `audits/lot7b1ter/results.json`. Les contrôles de caractérisation de fuite y ont `passed: true` parce que la persistance du problème était attendue. Ils ne sont pas comptés comme correction P0.

## Difficultés corrigées pendant les essais

Une première assertion supposait IndexedDB entièrement vide. Le SDK crée une base `firebase-heartbeat-database`. L’essai inspecte désormais les noms et contenus et vérifie l’absence des marqueurs métier, sans prétendre qu’aucune base n’existe. Un premier essai PRF a échoué avec `NotAllowedError` parce que l’onglet voisin avait le focus. Le runner ramène explicitement l’onglet de qualification au premier plan. Ce comportement confirme qu’une capacité annoncée ne suffit pas à réussir une cérémonie.

Le contrôle de concurrence a été étendu à la version du brouillon, en plus de celle du programme. Les dernières exécutions ajoutent le contrôle de mutation après changement de droits et une demande HTTP commencée avant la déconnexion.

## Non démontré

Ce prototype ne teste pas les pages BYL intégrées, une clé matérielle/biométrique, Safari/Firefox/iOS/Android réels, la récupération PRF après redémarrage de l’authentificateur, la liaison credential/Firebase, la réinstallation, le partage d’un PIN OS, la migration des données existantes ou la fusion graphique des conflits. Les essais PRF utilisent un authentificateur logiciel créé pour le test et détruit ensuite, sans export de sa clé privée.

Le test navigateur P0-4 des caches BYL réels a été exécuté dans le Lot BIS et reste documenté dans `audits/lot7b1bis/browser-before.json`. Il n’est pas présenté comme une nouvelle exécution TER. Ici, l’exposition des caches hérités est reproduite sur une base synthétique isolée. Les tests P0-1/P0-2 et les lots de performance précédents ne sont pas relancés, leurs fichiers d’exécution n’étant pas modifiés.

Aucune levée de P0-4 avant qualification de l’intégration complète.
