# BYL — Lot 2B.2 · Révocation et grandes inbox

La référence est le commit `3955d59` sur `codex/firebase-performance-audit`. Tous les essais ont utilisé des identités synthétiques, les émulateurs Firebase et des processus locaux. Aucun déploiement, migration de données existantes ou changement de prix.

**La garantie BYL commence au commit du marqueur Firestore protégé.** Elle couvre les nouvelles lectures et mutations de messagerie des anciennes sessions. Une action réalisée uniquement dans la console Auth, sans ce commit, conserve une fenêtre d’exposition directe. La seconde correction réduit le coût d’une attente stable en échange d’écoutes ciblées par instance API.

## 1. Cause et inventaire des chemins

Un jeton ID Firebase déjà émis a normalement une durée de vie d’une heure. Révoquer les refresh tokens ou désactiver le compte empêche leur utilisation ultérieure auprès d’Auth. Les règles Firestore d’une requête directe examinent les claims du jeton présenté et les documents accessibles aux règles. Elles ne font pas un appel synchrone à Auth pour connaître le statut courant du compte. Le backend peut demander ce contrôle avec `verifyIdToken(token, true)`. Dans le SDK Admin installé (13.10.0), `base-auth.js` vérifie le JWT avant de consulter l’état de révocation du compte. [Gestion officielle des sessions](https://firebase.google.com/docs/auth/admin/manage-sessions)

| Chemin identifié | Effet et couverture |
|---|---|
| Gestion des coachs dans le Club | Les routes PATCH et DELETE de `backend/routes/clubs.js` écrivent la révocation avec le membre et le profil dans le même batch, avant Auth. Le retrait du Club conserve la distinction avec la suppression définitive de l’identité. |
| Administration coach/client | `AdminCoach.jsx` et `AdminClient.jsx` utilisent la prévisualisation puis la confirmation de `/payments/admin/delete-user`. Les deux routes exigent un administrateur vérifié et une session actuelle. `adminAccountDeletion.js` conserve le marqueur définitif avant la suppression Auth et le nettoyage récursif. L’aperçu reste sans écriture. |
| Échecs de création, liaison ou invitation | Les retours arrière du backend Club et de la Function `sendPasswordSetupEmail` marquent le nouvel UID avant sa suppression. La suppression du profil ne supprime pas le marqueur. Un échec d’écriture du marqueur arrête la suppression Auth. |
| Inscriptions e-mail et Google abandonnées | `AuthContext.jsx` demande au serveur de préparer le retour arrière avant `deleteUser`. Le serveur utilise exclusivement l’UID authentifié, vérifie qu’il s’agit d’un compte récent et que le profil n’existe pas. Un profil déjà commité entraîne un refus. Un serveur indisponible peut laisser un compte orphelin à traiter. Un appel direct à la suppression de soi auprès de Firebase Auth relève du chemin externe. |
| Réglages coach et client | Les boutons de confirmation dans `SettingsPageCoach.jsx` et `SettingsPageClient.jsx` affichent un toast. Ils n’exécutent aucune suppression ou révocation serveur. Ils ne permettent pas de certifier un effacement. |
| Scripts et opérations administratives | Les deux scripts de préparation de comptes de test avancent la date de révocation avant de modifier un mot de passe et refusent de réactiver implicitement une identité désactivée. La modification administrative de l’adresse Auth d’un client dans le backend Club avance également cette date. L’outil dédié `scripts/messagingRevocation.cjs` couvre inspection, désactivation, révocation des sessions, préparation de suppression, réactivation et réconciliation par UID. |
| Déconnexion, action de réinitialisation ou de vérification d’adresse | Une déconnexion locale ferme la session de cet appareil. Les actions hébergées par Firebase, dont la confirmation de réinitialisation dans `ActivateAccount.jsx`, peuvent modifier la validité des sessions Auth sans écrire de marqueur BYL. Demander un e-mail de réinitialisation ne désactive pas le compte. |
| Console, Admin SDK, CLI, imports, suppressions en lot ou outils externes | Un acteur disposant de droits de gestion peut intervenir hors de BYL. Le dépôt ne permet pas d’énumérer les outils privés ni de vérifier les IAM ou journaux de production. La procédure ci-dessous définit ce que BYL peut garantir. |

### Possibilités Firebase vérifiées

Les événements de création et de suppression sont des notifications après opération. Une suppression en lot avec `deleteUsers` ne déclenche pas une notification individuelle pour chaque utilisateur. Les handlers bloquants portent notamment sur l’inscription et la connexion, et nécessitent Identity Platform. La version installée de `firebase-functions/v2/identity` n’expose pas de hook synchrone de désactivation administrative. [Événements Auth Firebase](https://firebase.google.com/docs/functions/auth-events) · [Fonctions bloquantes](https://firebase.google.com/docs/auth/extend-with-blocking-functions)

Identity Platform documente notamment `SetAccountInfo`, `DeleteAccount` et `BatchDeleteAccounts` dans les journaux Data Access. Une exploitation par alerte ou consommateur devrait vérifier leur activation, leurs permissions, leur couverture et leur coût. Elle surviendrait après l’opération. Le SDK Admin permet `getUser(uid)` et une énumération paginée jusqu’à 1 000 utilisateurs par page. Un balayage aurait un coût même sans incident et nécessiterait un inventaire antérieur pour reconnaître les comptes disparus. BYL utilise une réconciliation ciblée, sans nouveau service ou tâche périodique. Si un opérateur désactive puis réactive un compte hors procédure avant la réconciliation, l’état courant d’Auth ne suffit pas à reconstituer tout l’historique. [Journaux Identity Platform](https://docs.cloud.google.com/identity-platform/docs/audit-logging) · [API de gestion des utilisateurs](https://firebase.google.com/docs/auth/admin/manage-users)

## 2. Garantie, marqueur et procédure

`messagingRevocations/{uid}` est indépendant de `users/{uid}`. Le client ne peut ni le lire directement, ni le créer, le modifier ou le supprimer. Il contient un blocage, un horodatage serveur de révocation et, pour une suppression définitive, un indicateur persistant. L’absence de marqueur garde la compatibilité des comptes existants. Aucune réécriture générale n’est nécessaire.

Les règles de messagerie conservent les tests de rôle, de dossier, de participant et de destinataire. Elles exigent en plus que la session soit ouverte après la coupure enregistrée, en comparant `auth_time` à l’horodatage. L’API vérifie Auth et le marqueur à l’admission et à la sortie d’une attente renouvelée. Les transactions d’envoi et d’accusé relisent le marqueur dans leur transaction. Un fil ouvert surveille aussi le marqueur du demandeur. Avant de restaurer un profil ancien dont le marqueur est absent ou ouvert, BYL ferme le marqueur et retient sa version exacte. Une réactivation libère le blocage avec une précondition sur la version du marqueur et fait avancer la coupure : les deux anciens appareils doivent se réauthentifier. Si la seconde d’authentification coïncide avec celle de la coupure, il faut se reconnecter à la seconde suivante. Rafraîchir un jeton conserve son `auth_time`.

Une requête API dont le jeton vérifié est refusé par Auth pour compte désactivé, supprimé ou sessions révoquées déclenche une relecture ciblée du compte Auth. Seul l’état autoritatif lu avec l’Admin SDK détermine le marqueur. La requête reste refusée même si la réparation échoue. La réconciliation est restrictive et idempotente ; une réactivation externe ne lève pas automatiquement le blocage BYL. Sans requête API, sans réconciliation explicite et sans marqueur préalable, **BYL ne garantit aucun délai de retrait après une action Auth seule**. Un fil ouvert écoute le marqueur. Une attente sans fil ciblé peut aller jusqu’au renouvellement de 24 s pour constater le blocage du compte. Une réponse déjà autorisée ou livrée avant le commit et les copies hors ligne restent hors de portée de la révocation serveur.

### Procédure pour un opérateur habilité

1. Identifier le projet et l’UID exacts. Exécuter `node scripts/messagingRevocation.cjs PROJECT UID inspect` avec les identifiants administratifs appropriés.
2. Utiliser `disable` pour fermer le marqueur avant de désactiver Auth, ou `revoke` pour couper les sessions antérieures en autorisant une nouvelle connexion. Avant une suppression externe ou en lot, exécuter `prepare-delete` pour **chaque UID**, confirmer le marqueur définitif par `inspect`, puis effectuer la suppression autorisée. Cette commande ne supprime pas le compte. Elle réserve définitivement cet UID dans la messagerie, même si la suppression Auth ultérieure échoue ; pour un retrait temporaire, utiliser `disable`.
3. Si Auth a déjà été modifié hors procédure, exécuter immédiatement `reconcile`, puis `inspect`. Vérifier le refus de l’ancien jeton par le SDK et l’API. En cas d’échec partiel, garder le blocage et reprendre l’opération sur le même UID. Un retrait Club dont le blocage a réussi mais dont la désactivation Auth a échoué renvoie 503 ; vérifier le marqueur puis terminer avec `disable`.
4. Pour une réactivation autorisée, utiliser le parcours Club correspondant ou `reactivate`, vérifier aussi les droits métier, puis tester une nouvelle connexion. Un marqueur de suppression définitive reste fermé. Ne jamais effacer le marqueur pour réactiver un compte.

Ces commandes sont une procédure d’exploitation proposée. Seules les identités de démonstration ont été manipulées pendant le lot.

## 3. Tests de révocation

| Scénario sur émulateurs | Résultat |
|---|---|
| Deux connexions indépendantes du même compte | Deux jetons distincts ; lecture et envoi autorisés sur les deux avant la désactivation. |
| Désactivation par le parcours Club | Les deux anciens jetons obtiennent 403 en lecture et écriture Firestore directes et 401 en lecture et envoi API. Une attente déjà ouverte se termine par 401. |
| Réactivation par BYL | Les anciens jetons restent refusés. Une authentification ultérieure réussit sur les deux surfaces. Une réactivation concurrente avec un marqueur plus récent ne peut pas lever celui-ci. |
| Auth désactivé directement, ancien jeton conservé | **200 en lecture et écriture directes avant réparation**, 401 côté API. Après relecture ciblée d’Auth et commit du marqueur : **403 en accès direct**. |
| Révocation explicite de sessions | L’ancien jeton est refusé sans supprimer le compte. Une nouvelle connexion fonctionne. |
| Tentative client de modification ou suppression du marqueur | Refus 403, y compris avec l’identité titulaire. En accès SDK direct, un administrateur révoqué ne peut ni effacer le marqueur ni supprimer une conversation. Un administrateur à nouveau autorisé conserve ce dernier droit. Le marqueur définitif survit à la disparition du profil. |
| Aperçu, suppression administrative, retour arrière d’inscription | L’aperçu ne modifie pas la base. Une panne simulée du marqueur laisse Auth intact. La CLI opérateur est exercée avec un UID synthétique. Le serveur refuse de préparer la suppression d’un profil commité et protège le nouveau compte orphelin. |
| Déconnexion, reconnexion, coupure HTTP | Le navigateur rejette la réponse de l’ancienne identité. Le message envoyé pendant la coupure arrive au retour. Les anciens historiques, la pagination et les accusés monotones sont rejoués. |

## 4. Grandes inbox

**Cause.** Au Lot 2B.1, chaque réponse HTTP relisait les profils, dossiers, marqueurs de membre et propriétaires nécessaires pour reconstruire l’ensemble autorisé. La comparaison d’empreinte arrivait après ces lectures. Une réponse de quelques octets pouvait donc faire relire 1 000 dossiers.

**Admission.** L’API continue de charger les racines existantes et d’autoriser la projection. Elle enregistre en mémoire les identifiants et versions des documents réellement consultés, y compris les documents absents et les résultats des requêtes de responsables. Le contenu des messages n’entre pas dans cet enregistrement. L’inbox est rendue avant de brancher les écoutes supplémentaires.

**Renouvellement.** Pour 12 à 1 000 racines, les documents d’autorisation sont suivis par groupes d’au plus 30 identifiants. Une projection est liée à l’identité, à la session, au rôle ou périmètre et au fil consulté. Une instance peut uniquement renvoyer `unchanged` sans contenu si elle a elle-même validé cette projection et que toutes ses versions concordent. Un reçu fourni par un client ne permet jamais de lire un message ni d’écrire un accusé. Une instance froide ou redémarrée reprend par l’admission complète.

**Changement.** Un envoi, une lecture ou une modification d’un document dont dépend le périmètre réveille les attentes concernées. Une version différente impose de refaire les vérifications avant de restituer des données. La fraîcheur des racines est vérifiée avec l’horodatage de lecture Firestore de l’admission ; un ancien snapshot partagé est relu lorsqu’il ne suffit pas pour restituer du contenu. Les vues professionnelles masquées et les historiques restent soumis aux mêmes autorisations et à la même pagination. Le fil consulté conserve son signal ciblé.

**Bornes.** Les preuves expirent au bout de dix minutes. Une instance retient au plus 128 périmètres, chaque preuve au plus 128 groupes, et au plus 256 écoutes supplémentaires distinctes de politique simultanément. Un échec d’écoute de politique, un budget atteint, une petite inbox ou plus de 1 000 racines font revenir au contrôle complet. Les écoutes sont locales au processus et détachées après le délai de grâce de 1,5 s. Les lectures d’admission et de sécurité ne sont jamais remplacées par une permission mémorisée.

**Options écartées.** Un compteur d’autorisation durable par club ou par utilisateur devrait être mis à jour atomiquement par tous les auteurs, y compris les outils externes. Un trigger asynchrone laisserait une fenêtre. Dupliquer les conversations et compteurs dans une nouvelle projection Firestore introduirait des écritures par destinataire, des index et une reprise des historiques. La solution livrée ne crée aucune projection persistante, aucun nouvel index composé et aucune écriture de synchronisation lors d’une attente.

## 5. Mesures avant et après

Les deux versions utilisent les mêmes comptes, historiques et conversations synthétiques, dont des conversations masquées et des membres retirés. Les routes HTTP sont authentifiées. Les nombres de documents sont ceux retournés au backend par le SDK, y compris les documents changés des écoutes. L’estimation documentaire compte aussi les lectures sans résultat et les minima par opération. Les écritures correspondent aux documents mutés par les transactions instrumentées. Les écritures de préparation et de révocation de la fixture sont exclues de ces compteurs. Les lectures dépendantes des règles côté client, la facturation réelle, les octets d’index et le trafic réseau de production ne sont pas mesurés.

### Un onglet logique et une instance

Chaque paire indique Lot 2B.1 → Lot 2B.2. Le repos de 62 s suit un message et utilise les écoutes déjà initialisées. La colonne stable compare le coût d’une attente ordinaire de 24 s de la référence à une deuxième attente du Lot 2B.2. Les délais sont des observations locales uniques par scénario.

| Racines | Inbox | Ouverture, est. | Première attente 24 s, est. | Attente stable 24 s, est. | Repos 62 s, est. | Nouveau message, est. | Écoutes actives au repos |
|---:|---|---:|---:|---:|---:|---:|---:|
| 12 | Club | 40 → 41 | 28 → 32 | 28 → 6 | 58 → 15 | 38 → 42 | 1 → 5 |
| 12 | Pro | 25 → 26 | 13 → 16 | 13 → 3 | 26 → 7 | 19 → 23 | 1 → 3 |
| 100 | Club | 297 → 298 | 197 → 201 | 197 → 6 | 396 → 15 | 207 → 211 | 1 → 13 |
| 100 | Pro | 201 → 202 | 101 → 104 | 101 → 3 | 202 → 7 | 107 → 111 | 1 → 6 |
| 500 | Club | 1469 → 1470 | 969 → 973 | 969 → 6 | 1940 → 15 | 979 → 983 | 1 → 50 |
| 500 | Pro | 1001 → 1002 | 501 → 504 | 501 → 3 | 1002 → 7 | 507 → 511 | 1 → 19 |
| 1000 | Club | 2934 → 2935 | 1934 → 1938 | 1934 → 6 | 3870 → 15 | 1944 → 1948 | 1 → 97 |
| 1000 | Pro | 2001 → 2002 | 1001 → 1004 | 1001 → 3 | 2002 → 7 | 1007 → 1011 | 1 → 36 |

| Racines | Inbox | Affichage initial, ms | Réception après envoi, ms | Documents à l’ouverture | Documents par message¹ | Opérations SDK par message¹ | Écritures par message¹ |
|---:|---|---:|---:|---:|---:|---:|---:|
| 12 | Club | 205 → 233 | 89 → 96 | 39 → 39 | 34 → 34 | 16 → 20 | 3 → 3 |
| 12 | Pro | 192 → 208 | 88 → 99 | 25 → 25 | 18 → 18 | 7 → 11 | 2 → 2 |
| 100 | Club | 204 → 254 | 83 → 91 | 294 → 294 | 201 → 201 | 18 → 22 | 3 → 3 |
| 100 | Pro | 164 → 214 | 60 → 85 | 201 → 201 | 106 → 106 | 7 → 11 | 2 → 2 |
| 500 | Club | 374 → 453 | 175 → 188 | 1454 → 1454 | 961 → 961 | 38 → 42 | 3 → 3 |
| 500 | Pro | 281 → 270 | 74 → 100 | 1001 → 1001 | 506 → 506 | 11 → 15 | 2 → 2 |
| 1000 | Club | 500 → 551 | 252 → 299 | 2904 → 2904 | 1911 → 1911 | 62 → 66 | 3 → 3 |
| 1000 | Pro | 333 → 362 | 116 → 133 | 2001 → 2001 | 1006 → 1006 | 16 → 20 | 2 → 2 |

À 1 000 racines, l’attente stable Club passe de 53 à 6 opérations SDK et de 1 904 à 4 documents retournés. Côté professionnel, les opérations passent de 11 à 3 et les documents de 1 001 à 1. Sur 62 s, les documents retournés passent de 3 810 à 10 côté Club et de 2 002 à 2 côté professionnel.

¹ Envoi et réception de l’inbox combinés. Pour ces quatre tailles, l’ouverture et l’attente complète représentent chacune un appel HTTP, l’envoi avec réception deux, le repos de 62 s trois dont le dernier est interrompu. Zéro écriture au repos. L’émulateur ne donne aucune facture et ces latences ne constituent pas un percentile de service.

### Deux onglets Club, 1 000 racines

Deux attentes HTTP indépendantes sont placées soit dans le même processus, soit sur deux processus séparés. Le tableau compare les compteurs agrégés des deux onglets. RSS donne la mémoire résidente de chaque processus en Mio au terme de l’étape. Les processus et le ramasse-miettes rendent cette valeur variable.

| Étape | Instances | HTTP | SDK | Documents retournés | Estimation | Écoutes actives par instance | RSS par instance, Mio |
|---|---:|---:|---:|---:|---:|---|---|
| Ouverture | 1 | 2 → 2 | 107 → 109 | 4808 → 4808 | 4868 → 4870 | 1 → 1 | 167 → 170 |
| Premières 24 s | 1 | 2 → 2 | 106 → 108 | 3808 → 1910 | 3868 → 1944 | 1 → 97 | 169 → 179 |
| 62 s stables | 1 | 6 → 6 | 216 → 30 | 7620 → 20 | 7740 → 30 | 1 → 97 | 94 → 189 |
| Message | 1 | 3 → 3 | 115 → 121 | 3815 → 3815 | 3878 → 3884 | 1 → 97 | 176 → 210 |
| Retrait sans fil ouvert | 1 | 2 → 2 | 110 → 116 | 3806 → 5807 | 3870 → 5875 | 1 → 97 | 228 → 245 |
| Retrait du fil ouvert | 1 | 3 → 3 | 174 → 243 | 5718 → 9619 | 5815 → 9752 | 6 → 103 | 250 → 257 |
| Ouverture | 2 | 2 → 2 | 108 → 110 | 5808 → 5808 | 5868 → 5870 | 1+1 → 1+1 | 162+162 → 161+164 |
| Premières 24 s | 2 | 2 → 2 | 106 → 204 | 3808 → 3812 | 3868 → 3876 | 1+1 → 97+97 | 165+165 → 175+172 |
| 62 s stables | 2 | 6 → 6 | 216 → 30 | 7620 → 20 | 7740 → 30 | 1+1 → 97+97 | 162+165 → 128+109 |
| Message | 2 | 3 → 3 | 115 → 121 | 3816 → 3816 | 3879 → 3885 | 1+1 → 97+97 | 173+171 → 178+173 |
| Retrait sans fil ouvert | 2 | 3 → 3 | 163 → 122 | 5710 → 5812 | 5804 → 5882 | 1+1 → 97+97 | 174+180 → 185+183 |
| Retrait du fil ouvert | 2 | 3 → 3 | 174 → 304 | 5719 → 10521 | 5816 → 10685 | 6+6 → 103+103 | 175+211 → 237+240 |

Les deux onglets reçoivent le nouveau message en 361 et 374 ms sur une instance (372 et 388 ms auparavant), en 295 et 305 ms sur deux instances (285 et 278 ms auparavant). Dans les deux configurations le serveur confirme trois écritures pour l’envoi Club.

Après commit du retrait du fil ouvert, les deux réponses ont retiré le fil en 264 ms sur une instance et 219 ms sur deux, contre 230 et 194 ms. La phase entière, préparation comprise, dure 2 125 et 3 951 ms, contre 436 et 398 ms. Le retrait sans fil ouvert prend 2 536 ou 4 409 ms contre environ 24 s auparavant. Une instance redémarrée écarte le reçu ancien et rattrape le retrait en 979 ou 945 ms selon la topologie, contre 24 894 et 24 963 ms auparavant (2 903 documents retournés, 2 936 estimés). Les événements d’autorisation peuvent ainsi coûter plus cher que dans la référence. Les gains chiffrés concernent le repos prolongé.

### Complément à deux onglets

Les deux onglets logiques attendent le même compte. Chaque taille dispose de son propre couple d’émulateurs. Certains couples tournaient en parallèle sur la même machine : les temps muraux et les valeurs RSS sont indicatifs. Le nombre d’écoutes est indiqué par instance.

| Racines | Inbox | Instances | Estimation première attente de 24 s | Estimation 62 s stables | Documents 62 s | Opérations SDK 62 s | Écoutes au repos | RSS au repos, Mio | Estimation lors du message |
|---:|---|---:|---:|---:|---:|---:|---|---|---:|
| 12 | Club | 1 | 56 → 38 | 116 → 30 | 112 → 20 | 32 → 30 | 1 → 5 | 117 → 78 | 66 → 72 |
| 12 | Club | 2 | 56 → 64 | 116 → 30 | 112 → 20 | 32 → 30 | 1+1 → 5+5 | 117+118 → 93+104 | 67 → 73 |
| 100 | Club | 1 | 394 → 207 | 792 → 30 | 780 → 20 | 40 → 30 | 1 → 13 | 135 → 101 | 404 → 410 |
| 100 | Club | 2 | 394 → 402 | 792 → 30 | 780 → 20 | 40 → 30 | 1+1 → 13+13 | 128+126 → 110+111 | 405 → 411 |
| 500 | Club | 1 | 1938 → 979 | 3880 → 30 | 3820 → 20 | 120 → 30 | 1 → 50 | 162 → 131 | 1948 → 1954 |
| 500 | Club | 2 | 1938 → 1946 | 3880 → 30 | 3820 → 20 | 120 → 30 | 1+1 → 50+50 | 152+152 → 102+77 | 1949 → 1955 |
| 1000 | Pro | 1 | 2002 → 1007 | 4004 → 14 | 4004 → 4 | 44 → 14 | 1 → 36 | 136 → 136 | 2008 → 2014 |
| 1000 | Pro | 2 | 2002 → 2008 | 4004 → 14 | 4004 → 4 | 44 → 14 | 1+1 → 36+36 | 127+128 → 124+121 | 2009 → 2015 |

| Racines | Inbox | Instances | Réception des deux onglets après envoi, ms | Retrait du fil après commit, ms | Rattrapage après redémarrage, ms |
|---:|---|---:|---|---:|---:|
| 12 | Club | 1 | 126+122 → 127+126 | 45 → 49 | 24558 → 520 |
| 12 | Club | 2 | 67+65 → 80+78 | 31 → 52 | 24572 → 850 |
| 100 | Club | 1 | 112+113 → 146+147 | 62 → 55 | 24606 → 518 |
| 100 | Club | 2 | 79+85 → 109+101 | 40 → 54 | 24499 → 576 |
| 500 | Club | 1 | 242+248 → 314+363 | 152 → 268 | 24995 → 617 |
| 500 | Club | 2 | 170+173 → 234+233 | 112 → 127 | 24611 → 854 |
| 1000 | Pro | 1 | 217+205 → 175+190 | 71 → 149 | 24747 → 960 |
| 1000 | Pro | 2 | 185+190 → 184+211 | 88 → 111 | 24488 → 571 |

Les reprises ont été vérifiées en coupant une requête HTTP encore en vol. Le banc utilise le dernier reçu autorisé pour cette coupure : sur les petites fixtures, une requête utilisant une ancienne version pouvait légitimement retourner avant l’arrêt du processus. Les six appels HTTP de la fenêtre de 62 s et les écritures au repos (zéro) sont identiques dans ces scénarios. Les envois confirmés écrivent toujours trois documents côté Club ou deux côté professionnel, indépendamment de la répartition des onglets.


### Navigateurs et petite fixture de référence

| Parcours | Appels HTTP | Opérations SDK | Documents retournés | Estimation |
|---|---:|---:|---:|---:|
| 1 onglet, 22 s | 4 → 4 | 9 → 13 | 7 → 7 | 9 → 13 |
| 2 onglets, 22 s | 8 → 8 | 16 → 24 | 14 → 14 | 16 → 24 |
| 1 onglet, 62 s | 8 → 8 | 19 → 31 | 17 → 17 | 19 → 31 |
| Deux envois avec réception et lecture | 16 → 16 | 112 → 140 | 92 → 93 | 116 → 144 |

Sur Chrome, aux largeurs 1 440 et 500 px respectivement, l’affichage du fil prend 73 et 72 ms, le badge du fil fermé 1 000 et 999 ms, la livraison du fil ouvert 103 et 101 ms, l’accusé 175 et 138 ms. Les deux onglets convergent, un seul toast est affiché et le retrait visible prend 6 ms sur cette petite fixture. Les lectures additionnelles proviennent notamment du marqueur à l’admission, à la fin des attentes et dans les transactions. Le badge et la page ne relancent pas un annuaire périodique.

## 6. Vérifications exécutées et reproduction

- Règles Firestore sur émulateur, 81 contrôles réussis. Deux sessions du même compte utilisées en parallèle. Le refus après désactivation BYL couvre les deux appareils simulés et l’attente en vol. Sur le dernier passage, la désactivation et la fin de l’attente ont pris 25 ms. Après désactivation Auth seule, les deux refus API incluant la réparation ont pris 19 ms.
- Retrait de membre, changement de club, responsable désactivé, dossier relié à un autre compte, rôle modifié ou retiré. Les six opérations contrôlées par scénario sont refusées après mutation. Retrait sans focus testé également côté professionnel. Reçu d’un autre utilisateur, autre périmètre et reçu forgé testés sur les routes, sans accès supplémentaire.
- Envois simultanés, idempotence, accusés partiels et monotones, pagination ancienne et dates identiques, conversations masquées et isolation des responsables rejoués. Une coupure suivie d’une reconnexion rattrape le message. Une remise en route rattrape aussi un changement d’autorisation intervenu pendant l’arrêt.
- Tests unitaires de messagerie Club, accès professionnel, suppression administrative et parcours de liaison. Suite globale de smoke tests, 53 contrôles réussis. Build frontend et budgets réussis. Le script historique séparé `scripts/auditAccounts.cjs` s’arrête sur `Unexpected dependency: ../utils/batchedFieldReads`, reproduit à l’identique sur `3955d59`. Cet ancien harnais ne valide pas les parcours de compte pour ce lot.
- Les quatre tailles ont été mesurées avec un consommateur par canal. Les deux consommateurs ont aussi été testés ensemble puis répartis sur deux processus pour les quatre tailles Club et à 1 000 racines côté professionnel. Les parcours navigateur utilisent deux vrais onglets sur la petite fixture. Les deux appareils Auth sont deux connexions indépendantes, sans téléphone physique.

Depuis la racine du projet, avec Java 21 et les dépendances du dépôt, lancer séparément les commandes suivantes. Le comparateur extrait le backend de référence depuis Git et démarre des processus indépendants. Les jeux de données sont remplacés sur les émulateurs de test dédiés.

```sh
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
firebase emulators:exec --config firebase.performance-test.json --only auth,firestore --project demo-byl-performance 'node scripts/testMessagingLot2B2.cjs'
firebase emulators:exec --config firebase.performance-test.json --only auth,firestore --project demo-byl-performance 'node scripts/measureMessagingLot2B2.cjs'
firebase emulators:exec --config firebase.performance-test.json --only auth,firestore --project demo-byl-performance 'BYL_VALIDATE_WITHDRAWAL=1 node scripts/testMessagingLargeInbox.cjs'
firebase emulators:exec --config firebase.performance-test.json --only auth,firestore --project demo-byl-performance 'BYL_TOPO_IDLE_ONLY=1 node scripts/testMessagingLargeInbox.cjs'
firebase emulators:exec --config firebase.performance-test.json --only auth,firestore --project demo-byl-performance 'node scripts/measureClubMessaging.cjs && node scripts/measureFirebaseLot1.cjs --current'
# Rejouer par exemple 100 racines Club ou 1 000 professionnelles avec les coupures.
firebase emulators:exec --config firebase.performance-test.json --only auth,firestore --project demo-byl-performance 'BYL_TOPO_SIZE=100 BYL_TOPO_ALL=1 BYL_VALIDATE_WITHDRAWAL=1 node scripts/testMessagingLargeInbox.cjs'
firebase emulators:exec --config firebase.performance-test.json --only auth,firestore --project demo-byl-performance 'BYL_TOPO_KIND=professional BYL_TOPO_ALL=1 BYL_VALIDATE_WITHDRAWAL=1 node scripts/testMessagingLargeInbox.cjs'
npm run test:security-rules
npm run test:smoke
npm run build
```

Les fichiers de mesure restent exécutables dans le dépôt. Les sorties `MEASURE`, `TOPOLOGY` et `RESUME` contiennent uniquement les agrégats nécessaires aux comparaisons.

## 7. Risques résiduels

- Une désactivation Auth externe seule laisse une fenêtre démontrée avec un ancien jeton. Sa durée dépend de la réparation, de l’expiration du jeton et de la connexion de l’appareil. BYL ne peut rappeler des messages déjà livrés ou effacer à distance un appareil hors ligne.
- Les grandes inbox paient encore le contrôle complet à l’ouverture, lors d’un changement et après redémarrage. Une alternance fréquente de processus froids, des attentes espacées au-delà du délai de grâce, des droits modifiés en rafale ou une saturation des budgets diminuent le gain. Au-delà de 1 000 racines le chemin complet reste disponible.
- À 1 000 conversations Club, une instance conserve 97 écoutes au repos et jusqu’à 103 sur le scénario avec focus. La mémoire observée atteint 257 Mio pour un processus, ou 237 et 240 Mio pour deux dans ce scénario. Le banc ne mesure ni saturation multi-clubs réelle, ni débit maximum, ni coût monétaire des reconnexions ou des lectures d’entrées d’index. La première attente a un coût légèrement accru.
- Le parcours Club écrit un marqueur lors de la désactivation et une mise à jour lors de la réactivation d’un marqueur fermé. Pour un ancien profil sans marqueur fermé, la réactivation écrit aussi la fermeture préalable. Une révocation de sessions peut nécessiter une mise à jour additionnelle si la coupure Auth est plus récente. Ces écritures de cycle de vie s’ajoutent aux lectures de contrôle. Une réconciliation restrictive qui ne détecte aucun changement ne réécrit pas le document. Les nouveaux marqueurs utilisent les index Firestore ordinaires. Les écoutes d’autorisation n’ajoutent aucune écriture par destinataire ni index composé.

## 8. Recommandation pour la production

**Maintenir le déploiement en attente.** Avant toute décision, faire valider la procédure de révocation par les opérateurs et vérifier qui peut encore désactiver ou supprimer un compte hors de ce parcours. Tester en préproduction la distribution réelle des connexions entre instances, les budgets mémoire, les redémarrages et les lectures facturées par Firebase, notamment pour les clubs qui changent souvent de périmètre. Le résultat sur émulateurs suffit à distinguer le gain au repos du coût des changements, mais ne fournit pas une garantie de latence ou de coût en exploitation.

## 9. Recommandation pour le lot suivant

Après validation explicite, privilégier la qualification opérationnelle de cette messagerie avec des seuils convenus pour les écoutes simultanées, la mémoire par instance et le délai de retrait. Si l’exploitation doit accepter des modifications Auth hors procédure, qualifier séparément une alerte ou une réconciliation ciblée à partir des journaux réellement disponibles. Le lot s’arrête ici.
