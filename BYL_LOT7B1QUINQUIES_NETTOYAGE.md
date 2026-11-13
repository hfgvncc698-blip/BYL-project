# Lot 7B.1 QUINQUIES — nettoyage proposé et points d’arrêt

## Autorisation et périmètre

**Aucune procédure de nettoyage intégrée à BYL. Aucune purge réelle autorisée par ce lot.** Les suppressions exécutées concernent uniquement des fixtures créées dans un profil Chrome temporaire. Les booléens `confirmed/resolved` du banc représentent des décisions simulées ; ils ne constituent pas une autorisation de production.

La suppression d’une base Firestore partagée ne peut pas être décidée pour A en ignorant les brouillons de B. Toutes les copies potentiellement uniques du périmètre à supprimer doivent avoir une disposition validée : récupération vérifiée, équivalence serveur confirmée, ou abandon explicite autorisé. Le compte courant n’a pas pour autant le droit de lire les copies d’autres personnes.

## Machine d’états proposée

| État | Précondition et action | Confirmation / passage à l’étape suivante |
|---|---|---|
| Quarantaine | Désactiver lecteurs historiques et nouveaux writers persistants ; rester sur QUATER | Version sûre et admission serveur courante ; aucune donnée privée hydratée |
| Inventaire en attente | Lister les emplacements techniques autorisés, pas les contenus d’autres comptes | Classification de chaque catégorie ; inconnu implique arrêt |
| Récupération en attente | Procédure de RECUPERATION ; garder originaux | Reçus serveur et relectures, ou décision explicite d’abandon documentée |
| Prêt à fermer | Vérifier saisies dans chaque onglet et restauration possible | Confirmation avant fermeture pouvant perdre une saisie ; pas de fermeture silencieuse |
| Isolation | Fermer anciens onglets/app windows, arrêter connexions et transactions, empêcher chargement d’anciennes versions | Vérifier contexte sûr après réouverture ; un ACK BroadcastChannel n’est pas preuve d’absence de vieux code |
| Suppression autorisée | Cible exacte et version du plan validées, aucune donnée non résolue | Journal sans contenu privé, autorisation durable indépendante du seul localStorage |
| Suppression en cours | Supprimer bases/entrées privées approuvées, jamais wildcard Firebase ni `clear()` global | `onsuccess` / résultat SDK confirmé ; `blocked/error` n’est pas un succès |
| Interrompu / bloqué | Maintenir quarantaine ; conserver statut « résultat incertain » | Réinspecter l’état physique et les opérations en cours avant reprise |
| Vérification | Bases ciblées absentes, clés ciblées absentes, caches et workers ciblés traités ; autres onglets clos | Contrôle indépendant puis fermeture/réouverture et contre-test B |
| Vérifié sur périmètre | Autoriser seulement la version sûre | Surveillance de recontamination à la réouverture ; ce statut ne signifie pas effacement forensique |
| Recontaminé | Ancien writer a recréé un stockage | Bloquer de nouveau, nouvel inventaire/disposition ; ne pas supprimer automatiquement la nouvelle copie |

## Onglets, connexions et opérations différées

BroadcastChannel et Web Locks coordonnent les versions coopérantes. Le prototype utilise Web Locks pour sérialiser ses tentatives ; aucun de ces mécanismes ne force un ancien onglet à participer. Un ancien onglet peut garder des transactions, du sessionStorage, des références RAM, un service worker contrôlant sa page, ou rouvrir une base après suppression.

`IDBDatabase.close()` attend la fin des transactions en cours. Une demande `deleteDatabase()` notifie les connexions par `versionchange`, puis peut rester `blocked`. **Un timeout côté application n’annule pas cette requête.** Le banc constate sa réussite ultérieure après fermeture de la connexion bloquante. Ne jamais annoncer « suppression annulée, données intactes » sur le seul timeout. Après interruption, vérifier ce qui a réellement été supprimé avant toute décision de récupération.

Le SDK exige l’arrêt de l’instance avant effacement de persistance ; le test réel constate `failed-precondition` sur une instance active. `terminate()` ne supprime pas les mutations en attente. Ne pas réactiver le réseau de l’ancien SDK pour « le vider » : cela peut publier des opérations héritées sans révision métier actuelle.

## Stockages secondaires et réouverture

- IndexedDB applicatif : noms exacts, versions connues, vérifier existence sans ouvrir/créer accidentellement la base. Pas de suppression des bases inconnues sur simple ressemblance.
- localStorage : clés/préfixes privés explicitement inventoriés, préserver préférences publiques et décisions de consentement selon plan. Pas de contenu privé ni UID/dossier dans le journal de reprise.
- sessionStorage : propre à chaque onglet. Le banc démontre qu’un autre onglet conserve sa valeur après nettoyage de l’onglet courant. La restauration de session du navigateur ne doit pas être présumée vide ; qualification spécifique et fermeture de tous les anciens contextes nécessaires.
- Cache Storage : noms et origine exacts après inventaire ; pas de purge arbitraire d’un cache inconnu.
- Service Workers : inventorier script/scope/version, unregister le périmètre approuvé, fermer les clients déjà contrôlés. Un unregister réussi ne remplace pas leur fermeture.
- Cache HTTP/médias/exports/backups : hors preuve de suppression IndexedDB. Ne pas certifier leur effacement avec `indexedDB.databases()`.
- Réouverture pendant nettoyage : shell sûr affiche « vérification interrompue », refuse hydratation historique, recharge les preuves serveur puis recalcule les étapes. Une valeur locale « terminé » n’est jamais autorité.

## Idempotence et reprise

Chaque étape reçoit un identifiant de tentative et une cible explicite. Le journal persistant ne contient que des états techniques minimaux ; une preuve serveur protégée doit couvrir autorisations et reçus, avec contrôles d’accès. Avant de rejouer une suppression, vérifier à nouveau l’absence de données uniques nouvelles et l’état réel des connexions. Une base absente est une étape déjà accomplie ; une base recréée n’est pas automatiquement la même donnée à purger.

Le prototype qualifie l’interruption après suppression de la base mais avant nettoyage secondaire, la réouverture dans cet état, puis la reprise et une seconde exécution sans effet supplémentaire. Son journal local n’est qu’un outil de test, pas une preuve de migration fiable face à manipulation ou perte du stockage.

## Retour arrière et perte

Avant suppression : conserver la quarantaine et les originaux ; annuler l’import ne nécessite aucune suppression. Après récupération serveur : vérifier le reçu, continuer à garder l’original jusqu’à décision explicite. Après purge : **aucun rollback local garanti** ; seules les copies serveur autorisées peuvent être relues. Une sauvegarde de récupération contenant des données privées ne doit pas être créée sans politique validée de destinataire, chiffrement, durée et effacement. Aucune sauvegarde réelle n’est créée ici.

Ne pas revenir au code qui écrivait les données privées en clair. Une régression doit maintenir la barrière mémoire, ou garder le service indisponible sur les profils concernés. Aucune promesse de retrait des exports ou d’effacement physique des blocs disque.

## Références vérifiées

- [Spécification IndexedDB — suppression et connexions](https://www.w3.org/TR/IndexedDB/#deleting-a-database) : coordination de version et attente des connexions.
- [API Firestore — clearIndexedDbPersistence et terminate](https://firebase.google.com/docs/reference/js/firestore) : suppression des documents/mutations, préconditions d’arrêt, absence de garantie d’effacement sécurisé.
- Contrat de la version installée : `node_modules/@firebase/firestore/dist/index.d.ts`, sections `clearIndexedDbPersistence`, `terminate`, `waitForPendingWrites`. Le dernier attend les écritures déjà en attente du compte actif, pas toutes les futures écritures de tous les comptes.
