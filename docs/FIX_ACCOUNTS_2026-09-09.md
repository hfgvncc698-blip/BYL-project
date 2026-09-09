# Correctifs comptes — 9 septembre 2026

Suite au volet A1–A4 de l'audit, corrections locales dans `backend/routes/clubs.js`, `src/AuthContext.jsx`, `src/pages/Register.jsx` et `src/pages/ClubDashboard.jsx`. Aucune modification de compte réel, aucun envoi réel d'e-mail, aucun déploiement.

## Correctifs

- **Ajout d'un professionnel dans un club** : tout compte Auth existant est refusé sans modification, conversion de rôle, déplacement de club ou envoi d'e-mail. Cela inclut les membres déjà rattachés, les indépendants, les particuliers et les comptes administrateurs. L'interface explique qu'un rattachement existant nécessite une validation avec consentement ; aucun nouveau mécanisme de transfert implicite n'a été introduit.
- **Liens d'accès** : `/clubs/coaches` ne retourne plus de lien de réinitialisation, même pour un compte neuf. Le lien personnel est uniquement adressé au destinataire par e-mail. L'interface ne promet plus de lien copiable : en cas d'échec d'envoi, elle indique au professionnel comment demander un nouveau lien via « Mot de passe oublié ».
- **Cohérence de création professionnelle** : profil utilisateur et membre du club enregistrés dans un seul batch. En cas d'échec du commit, le compte Auth nouvellement créé est supprimé ; un échec SMTP après commit ne détruit pas un compte valide. L'état de livraison est enregistré (`pending`, `sent`, `failed`).
- **Quotas clients** : un document client préexistant n'exempte plus automatiquement du contrôle. Seuls les clients déjà comptés dans le périmètre du coach ou club sont réutilisables sans ajouter une unité. Le contrôle couvre le rattachement d'un compte existant et l'activation d'un dossier sans compte Auth.
- **Inscription Google** : mêmes données d'identité, rôle, club et consentements que l'inscription par e-mail, via un constructeur de profil commun. Les espaces particuliers/professionnels/clubs sont créés correctement ; l'essai démarre après validation de l'e-mail Google. Aucun abonnement payant n'est inventé.
- **Compte Google préexistant** : sa fiche, son rôle et son rattachement sont préservés, même si le formulaire d'inscription demande un autre rôle.
- **Course de création du profil** : la création minimale automatique du listener Auth est suspendue pendant l'inscription. Elle ne peut donc plus créer un particulier avant l'écriture du profil professionnel demandé.
- **Consentement depuis le bouton de connexion Google** : une nouvelle identité Google sans formulaire d'inscription complet est invitée à passer par « Inscription » ; elle n'obtient pas silencieusement un profil sans consentement. Seule l'identité Auth nouvellement créée pour cette tentative incomplète est annulée. Un compte préexistant n'est jamais supprimé par ce mécanisme.
- Les boutons d'inscription sont désactivés pendant l'opération, et le formulaire Google exige identité/majorité/conditions sans imposer l'e-mail ou le mot de passe du formulaire e-mail.

## Tests

`scripts/auditAccounts.cjs` a été converti en **véritable suite anti-régression** : une réapparition des défauts provoque désormais une assertion échouée et un code de sortie non nul, au lieu d'une simple entrée de diagnostic.

Résultats :

- `node scripts/auditAccounts.cjs` : **44 scénarios réussis**, doubles Firebase/SMTP en mémoire, fonctions et routes réelles.
- `node scripts/testClientCreationDelivery.cjs` : réussi.
- `node scripts/testNutritionLoading.mjs` : réussi.
- ESLint ciblé sur les quatre fichiers applicatifs et le test : réussi.
- Contrôle de whitespace des différences : réussi.
- Validation intégrée de la tâche principale : **51 cas smoke réussis**. L'assertion source temporairement en échec pendant les modifications parallèles a été corrigée.
- Validation des règles par la tâche principale : **46 scénarios dans le véritable émulateur Firestore** (`scripts/testFirestoreRules.cjs`), distincts des 44 tests comptes en mémoire de ce volet.

Cas négatifs couverts : comptes existants dans un autre club ou le même club, particulier/indépendant/admin, échec d'écriture d'appartenance, échec SMTP sans rollback indu, quotas individuel/club pleins, dossier hors quota déjà existant, conservation d'un client déjà compté, absence de lien secret dans les réponses, Google particulier/pro/club, absence de consentement, inscription via le bouton de connexion, profil Google préexistant, rollback uniquement d'une nouvelle identité Auth.

## Limites et mise en service

Ces tests ne créent pas de comptes Firebase réels, ne font pas apparaître une vraie fenêtre OAuth et n'envoient pas d'e-mail. La réception effective des messages et les vrais retours OAuth restent à vérifier dans un environnement de test isolé. Les règles Firestore corrigées ont été validées séparément en émulateur par la tâche principale ; leur publication en production reste distincte de cette validation.

Les correctifs doivent être publiés côté frontend **et** API avant d'être effectifs pour les utilisateurs. Un compte existant n'est pas transférable par le formulaire de création ; le transfert volontaire demeure une opération distincte à valider, ce n'est pas un échec silencieux de création.

Le contrôle des quotas corrige l'exemption erronée des documents existants ; ce volet n'introduit pas de compteur transactionnel global pour des créations concurrentes depuis plusieurs instances serveur.

## Complément : classification des erreurs SMTP

Le classement global `code >= 500` a été supprimé des fonctions automatiques et des envois/relances de l'administration. Les codes 530, 534 et 535 correspondent à l'authentification ou à la configuration de l'expéditeur : ils ne doivent jamais suspendre le destinataire comme si son adresse était invalide. Les codes 550, 551, 553 et les messages explicites de destinataire invalide restent classés comme rejets permanents. Les autres erreurs serveur génériques ne sont plus assimilées automatiquement à un bounce.

Cloud Functions réutilise le classificateur du nouveau module de notification des séances. Le backend garde un classificateur équivalent autonome afin de ne pas créer de dépendance entre les deux unités de déploiement.

`node scripts/auditAccountsSmtpClassification.cjs` : **27 cas d'erreur, vérifiés sur 3 classificateurs et 2 chemins réels de suspension**, réussis avec écritures exclusivement simulées. ESLint ciblé et contrôle de diff réussis. Aucune mécanique historique de claim, tentative ou relance automatique n'a été changée ; une ancienne tentative ambiguë reste une relance manuelle après vérification, et une suspension déjà enregistrée n'est pas levée automatiquement par cette correction.

## Complément : langues des nouveaux messages

Les ressources `src/i18n/locales/{fr,en,es,de,it,ru,ar}/common.json` comprennent les 20 nouvelles clés de retour de paiement/liens anciens ainsi que les 2 nouvelles clés d'inscription Google (`auth.register.googleDetailsRequired` et `auth.register.googleRegistrationRequired`). Total : **22 clés × 7 langues, soit 154 traductions**.

`scripts/testPaymentReturnI18n.mjs` extrait les clés utilisées par les pages concernées et vérifie précisément les deux clés Google, le format JSON, la parité des clés et leur résolution i18next dans chaque langue sans fallback français. Aucun texte historique sans rapport avec ces changements n'a été réécrit.
