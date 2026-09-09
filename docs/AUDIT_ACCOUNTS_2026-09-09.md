# Audit comptes, identité et e-mails — 9 septembre 2026

## Périmètre et niveau de preuve

Audit du code local de création de compte par e-mail et Google, création/rattachement de client, ajout d'un professionnel dans un club, activation, réinitialisation de mot de passe et gardes d'accès. Aucune correction applicative, aucun compte réel créé, aucun e-mail envoyé et aucun mot de passe changé.

Les scénarios métier ont été exécutés avec le **vrai code des routes** et les fonctions d'inscription extraites du code, mais avec Firebase et SMTP entièrement remplacés par des doubles en mémoire. Cela vérifie les décisions et les écritures prévues, **pas** la disponibilité de Firebase/SMTP, l'exécution des règles déployées, la réception dans une boîte mail ou une connexion complète dans le navigateur.

Une lecture réelle anonymisée des profils Firestore et de Firebase Auth a aussi été effectuée. Elle n'a pas modifié de données. Les règles Firestore/Storage ont été relues statiquement et leur identité exacte avec les versions déployées a été vérifiée via l'API Firebase Rules en lecture seule ; aucun test d'écriture agressif en production et aucun émulateur Auth/Firestore n'ont été utilisés.

## Résultats d'exécution

Commandes réussies :

- `node scripts/auditAccounts.cjs` : **22 scénarios conformes**, **4 anomalies métier reproduites** et explicitement séparées des scénarios conformes.
- `node scripts/testClientCreationDelivery.cjs` : envoi différé, succès/échec SMTP, compatibilité synchrone, rollback Auth après échec du commit client.
- `node scripts/testNutritionLoading.mjs` : refus d'identité professionnelle, refus hors périmètre, succès client autorisé, conservation d'une opération lente sans doublon, propagation d'erreur.
- `npx eslint scripts/auditAccounts.cjs` : réussi.
- `node scripts/auditSecurityState.cjs` : lecture réelle réussie, sortie anonymisée uniquement.
- `node scripts/auditAccountsDeployedRules.cjs` : comparaison réelle réussie, Firestore et Storage exactement identiques aux fichiers locaux ; aucune création/publication de règles.

Le script d'audit retourne un succès quand son diagnostic s'exécute correctement : les anomalies listées ne doivent **pas** être interprétées comme des parcours validés.

| Parcours / contrôle | Résultat simulé |
| --- | --- |
| Inscription par e-mail client | Profil user + client, pas d'abonnement payant, vérification demandée |
| Inscription par e-mail professionnel | Profil pro en attente de vérification, pas de statut payant |
| Inscription par e-mail club | User + club + membre propriétaire dans le batch d'inscription |
| Échec commit inscription | Suppression du compte Auth nouvellement créé |
| Échec envoi de vérification après inscription | Compte conservé pour permettre un renvoi, pas de suppression |
| Ajout client par coach actif | Création acceptée |
| Ajout client par coach en essai valide | Création acceptée |
| Essai expiré, client non coach, coach soumis à vérification non vérifiée | Création refusée sans compte créé |
| E-mail invalide, nom manquant, propriétaire tiers | Refus explicite |
| Nouveau client lorsque le quota est plein | Refus explicite |
| Adresse d'un professionnel utilisée comme client | Refus sans conversion du compte ni nouvel e-mail |
| Client existant d'un autre coach | Rattachement refusé |
| Client déjà dans le bon périmètre | Rattachement accepté, historique conservé, pas de nouvel e-mail |
| Mot de passe oublié, adresse inconnue | Réponse neutre, pas d'envoi |
| Mot de passe oublié, adresse connue | Envoi simulé puis succès ; 6e tentative identique refusée |
| Échec SMTP du reset | Erreur 503 explicite |
| Activation d'un ancien dossier avec identifiant distinct | Indicateurs user et client lié actualisés |

## Anomalies reproduites en mémoire

### A1 — Priorité haute : ajout pro d'un club, réaffectation et lien d'accès d'un compte existant

`backend/routes/clubs.js:2117` n'interdit que les rôles autres que particulier/coach. Il ne refuse pas un coach ou propriétaire déjà rattaché à un autre club. Les lignes 2126–2156 réécrivent son rôle, son club, ses modules et son accès comme membre du club demandeur. Les lignes 2177–2196 génèrent ensuite un lien de réinitialisation et le retournent au demandeur.

Reproduction : un propriétaire actif du club A soumet l'adresse fictive d'un propriétaire du club B. La route répond 200, transforme le profil en membre A et renvoie le code d'action de réinitialisation fictif fourni par le double Firebase. **Le risque dépasse un mauvais rattachement : un demandeur pourrait obtenir un accès au compte d'un tiers.** Aucun compte réel ni vrai lien n'a été utilisé pour cette reproduction.

À traiter avant ouverture/validation du parcours club : invitation avec consentement du destinataire, contrôle strict du périmètre des comptes existants, aucune restitution de lien de reset au club pour un compte tiers existant.

### A2 — Priorité moyenne : inscription Google professionnelle non prise en compte

`src/pages/Register.jsx:408` appelle `loginWithGoogle()` sans rôle, type de compte, choix de club, consentements ni callback. `src/AuthContext.jsx:783` utilise `seedUserDocFromClient`, qui impose `role: "particulier"` à la ligne 370.

Le test du générateur réel de profil confirme qu'un nouvel utilisateur Google sans dossier préexistant est un particulier ; sélectionner professionnel ou club dans le formulaire ne transmet pas ces choix. Le parcours Google ne peut donc pas être validé comme équivalent à l'inscription pro par e-mail.

### A3 — Priorité moyenne : création d'un pro de club non atomique

`backend/routes/clubs.js:2105` crée le compte Auth, puis `2155` et `2156` enregistrent le profil et l'appartenance au club en deux écritures distinctes. Le catch de la ligne 2198 ne réalise aucun rollback.

Reproduction : échec simulé de la deuxième écriture. La route répond 500 alors que le compte Auth et le profil professionnel subsistent, sans document membre et sans e-mail d'activation. L'ajout client classique dispose d'un batch et d'un rollback, pas ce parcours professionnel.

### A4 — Priorité moyenne : quota client contourné lors d'un rattachement

`backend/routes/clubs.js:1580` ne contrôle le quota que si aucun document client n'existe. Un particulier inscrit lui-même possède déjà un document client, même sans coach.

Reproduction : coach à 1 client sur 1, rattachement d'un particulier autonome existant. Réponse 200 et affectation au coach ; le quota passe à 2/1. Il faut distinguer un client déjà compté dans le périmètre d'un client existant mais encore extérieur au périmètre.

## Défauts de règles repérés statiquement — validation émulateur requise

Ces trois constats sont fondés sur les prédicats du fichier local, dont l'identité exacte avec la version actuellement déployée est confirmée. Ils ne proviennent pas d'une tentative d'exploitation des règles en production. Leur gravité justifie des tests négatifs isolés et une correction avant de conclure à une isolation coach/client fiable.

Comparaison par hash du texte intégral obtenue via l'API Firebase Rules (requêtes GET uniquement, aucun jeton ni contenu sensible imprimé) :

| Règles | Texte déployé/local | Création de la version (UTC) | Dernière mise à jour de publication (UTC) |
| --- | --- | --- | --- |
| Firestore | Strictement identique | 2026-09-02 20:24:11 | 2026-09-09 06:22:10 |
| Storage | Strictement identique | 2026-08-02 10:54:58 | 2026-09-09 06:22:18 |

Disponibilité vérifiée : CLI Firebase 15.13.0 présente ; `/usr/bin/java` est le lanceur système, mais `java -version` répond qu'aucun runtime Java n'est installé. Aucun JDK détecté dans les emplacements usuels et aucun émulateur en cache trouvé. Aucun téléchargement ni installation n'a été entrepris. Cette contrainte empêche une reproduction par l'émulateur Firestore dans cette session.

### R1 — Priorité haute : deux `clubId` vides peuvent être considérés comme un même club

`firestore.rules:125` vérifie seulement la présence des clés et leur égalité. Il n'exige pas un identifiant chaîne non vide. `clubId: null` sur un coach indépendant et `clubId: null` sur un dossier satisfont donc l'égalité ; `coachOwnsRecord` utilise cette branche à la ligne 159.

La création professionnelle indépendante stocke un club nul et la création API des clients indépendants fait également de même. Cette branche ne devrait pas donner d'accès partagé entre coaches indépendants.

Préconditions du cas négatif : compte authentifié A avec profil `role: coach`, `hasActiveSubscription: false`, `subscriptionStatus: active`, `emailVerificationRequired: false`, `clubId: null` ; dossier appartenant à B avec champs d'identité de B, `createdBy: B`, `coachId: B`, `coachIds: [B]`, `clubId: null`. La garde d'accès professionnel de A est valide, aucune propriété directe de A n'est satisfaite, mais la branche même-club l'est. Cas témoin à refuser aussi : deux `clubId` chaînes vides.

### R2 — Priorité haute : droit de lecture publique réutilisé comme droit de modification

`firestore.rules:798` autorise une modification de programme lorsque `canAccessProgram` vaut vrai avant et après. Cette fonction (`403`) inclut `publicProgram`, sans connexion obligatoire. Un programme ayant les attributs de publication valides satisfait ainsi une condition de modification simplement parce qu'il reste public. Lecture publique et écriture par son propriétaire doivent être séparées.

Préconditions du cas négatif : requête non authentifiée, document existant avec `isActive: true`, `visibility: public`, modification d'un champ métier en conservant ces deux attributs. La branche `publicProgram` vaut vrai sur l'ancienne et la nouvelle version ; aucun recours au statut coach n'est nécessaire. Les créations et suppressions ont d'autres gardes : le constat vise spécifiquement `update`.

### R3 — Priorité haute : lien client arbitraire non borné à la création du profil utilisateur

`safeSelfUserCreate` (`firestore.rules:561`) protège le rôle et les abonnements, mais ne contraint pas `linkedClientId`. `clientIsOwnProfile` (`138–147`) fait ensuite confiance à ce champ pour identifier le propriétaire d'un dossier. Un test négatif émulateur doit vérifier le refus de créer son profil particulier avec le lien d'un dossier tiers. La protection du champ lors des mises à jour ne protège pas sa valeur initiale.

Préconditions du cas négatif : utilisateur Auth nouvellement créé A, aucun `users/A` existant ; création de son profil avec `role: particulier`, `subscriptionStatus: free`, `hasActiveSubscription: false`, `accountType: ""`, `clubId: null`, `clubRole: ""`, identifiants Stripe nuls et `linkedClientId` désignant un dossier B. Les contraintes explicites de création sont respectées ; le lien n'est pas validé. Puis une lecture du dossier B satisferait la branche du lien dans `clientIsOwnProfile`. La lecture de Nutrition reste soumise au partage côté client, contrairement à la fiche client et ses programmes.

### Points statiques favorables et limites

- Rôle admin et champs d'abonnement protégés contre les mises à jour ordinaires ; administration conditionnée à l'e-mail vérifié.
- Nutrition : essai coach valide inclus, dossier limité au périmètre et lecture client conditionnée au partage activé. Les défauts d'identité ci-dessus restent transversaux.
- Storage : banque partagée en lecture authentifiée uniquement, écriture directe interdite ; logos seulement dans le dossier de son UID ; pièces jointes client seulement pour leur UID, taille et type bornés ; pas de règle globale publique.
- Storage ne permet pas au coach de lire directement le dossier de pièces jointes d'un autre UID. Les commentaires indiquent un périmètre prévu pour de futurs fichiers ; l'existence d'un parcours actuel dépendant de cet accès n'a pas été démontrée ici.
- Pas d'exécution des règles Firestore/Storage en émulateur dans cet audit ; l'identité du texte actuellement déployé avec les fichiers locaux est en revanche vérifiée.

## Lecture réelle anonymisée des identités

Instantané du 9 septembre 2026 : 83 profils utilisateurs Firestore, 50 dossiers clients et 71 comptes Firebase Auth.

- 9 groupes d'adresse ayant plusieurs profils utilisateurs : 21 profils concernés. Chaque groupe comporte un seul véritable compte Auth ; les autres profils sont hérités/orphelins. Ce sont des incohérences à investiguer, **pas une preuve de panne de connexion**.
- 1 document sans rôle, mais sans compte Auth associé et avec trois champs techniques seulement. La sévérité « critique » du script est un signal brut, pas une élévation de privilège constatée.
- Aucun signal de particulier avec droit professionnel, essai expiré encore marqué actif ou accès actif soumis à vérification dont l'e-mail Auth serait non vérifié dans cette lecture.
- Compte administrateur unique, e-mail vérifié ; aucune MFA enregistrée.

Aucune attribution de ces anomalies à Alex ou à une cliente particulière : aucun test de connexion à leur place n'a été réalisé.

## Reste à tester en environnement dédié

Connexion réelle client/pro/club et comptes Google, réception et clic des messages de vérification/activation/reset, codes expirés ou réutilisés, activation effective de l'essai après vérification, rattachement côté interfaces, navigation depuis le mail, tests négatifs inter-comptes en émulateur. Les triggers de mails programme/calendrier/abonnement relèvent des autres volets de l'audit global.

Ce périmètre ne permet donc pas de déclarer « tout fonctionne » : les anomalies ci-dessus sont à traiter puis à revalider.
