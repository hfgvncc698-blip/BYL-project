# Lot 7A — anomalies

Campagne du 10 novembre 2026. Branche `codex/firebase-performance-audit`, version applicative `e476b0a4cfcd6bb9e27515c69a5416325e480f6e`. Campagne locale sur fixtures synthétiques.

## Confirmé par test

Quatre défauts de sécurité bloquent une publication. Le niveau correspond au résultat démontré, même si le test de caractérisation attend ce résultat.

### S1 · P0 · Élévation par profil créé par un coach

Antérieure. Même résultat à a55018a et e476b0a.

**Reproduction.** Avec deux comptes Auth sans privilège, un coach actif et un second compte sans document utilisateur, appeler le résumé d’un club tiers avec le second jeton (404). Avec le jeton coach, créer users/<second UID> par Firestore, role=particulier, linkedClientId=<second UID>, hasActiveSubscription=false, isAdmin=true. Répéter GET /clubs/summary?view=calendar&clubId=<club tiers> avec le second jeton.

**Fichiers.** firestore.rules, création de users (ligne 669) et backend/routes/clubs.js, isAdminRequester (ligne 753).

**Impact métier et sécurité.** Création autorisée et HTTP 200 avec le nom et un membre du club tiers. La lecture inter-clubs est démontrée. Les autres routes qui réutilisent ce prédicat nécessitent un inventaire.

**Performance.** Aucun coût significatif requis pour reproduire.

**Preuve.** privilege et base-privilege, assertion de confidentialité échouée.

**Correction proposée.** Autoriser explicitement les seuls champs de création client nécessaires. Utiliser une autorité administrative que ce parcours ne peut écrire et auditer les profils existants sous contrôle habilité.

**Risque de correction.** Compatibilité des anciens administrateurs et des créations déléguées.

### S2 · P0 · Divulgation de séance indépendante via un rendez-vous lié

Nouvelle projection du Lot 6. L’ancien détail de rendez-vous enrichissait déjà le statut. L’étendue de ce parcours historique reste à qualifier.

**Reproduction.** Créer une séance indépendante sans clubId avec une difficulté. Un responsable externe connaissant les identifiants séance et client reçoit permission-denied en lecture directe. Avec son SDK, créer clubs/<son club>/appointments/<id> avec linkedSessionId, clientId concordant et startsAt dans la période. Consulter GET /clubs/calendar-period sur cette période.

**Fichiers.** firestore.rules, écriture des rendez-vous Club, backend/utils/clubCalendarPeriod.js, eventRow (ligne 85), backend/routes/clubs.js.

**Impact métier et sécurité.** Le serveur renvoie le statut validée et la difficulté 4 du client externe. Aucun accès légitime au dossier cible dans la fixture. Connaître les deux identifiants est un prérequis.

**Performance.** Un seul rendez-vous et une consultation suffisent.

**Preuve.** foreign-link, contrôle SDK refusé puis assertion de confidentialité échouée.

**Correction proposée.** Vérifier un rattachement serveur indépendant du document soumis et protéger les champs de liaison. En cas de lien ancien ambigu, omettre les données externes. Tester ouverture, attente et reprise.

**Risque de correction.** Les anciens rendez-vous légitimes doivent rester visibles. Vérifier la parité du statut avant publication.

### S3 · P0 · Ancien jeton après désactivation Auth seule

Limite déjà démontrée au Lot 2B.2.

**Reproduction.** Conserver le jeton frais, désactiver uniquement dans Auth, relire et écrire directement un message avant toute API BYL. Répéter après cinq secondes puis appeler les API et retenter les mêmes opérations.

**Fichiers.** firestore.rules, backend/utils/messagingRevocation.js, scripts/messagingRevocation.cjs.

**Impact métier et sécurité.** Deux opérations directes encore autorisées. Le marqueur est absent ou ne bloque pas encore le jeton. La première intervention BYL peut réparer ce compte.

**Performance.** Réparation ciblée par UID. Fenêtre maximale sans réconciliation inconnue.

**Preuve.** auth et auth-window réussissent en reproduisant explicitement cette limitation.

**Correction proposée.** Marquer avant désactivation, restreindre les procédures console et qualifier la détection des modifications externes. Définir les garanties séparément pour chaque domaine.

**Risque de correction.** Une réactivation qui efface trop vite le marqueur peut réautoriser un ancien jeton.

### S4 · P0 · Contenu du précédent compte lisible dans le cache disque du profil partagé

La persistance multi-onglet et la déconnexion sans purge IndexedDB sont présentes avant le Lot 1. Reproduction dynamique sur HEAD.

**Reproduction.** Compte A autorisé, lire clients/client/programmes/p0 depuis le serveur dans Chromium. Déconnecter A, connecter B sur la même origine et le même profil, recharger la page, couper le réseau Firestore. Sous B, appeler getDocFromCache sur cette référence, puis rétablir le réseau et tenter getDocFromServer.

**Fichiers.** src/firebaseConfig.js initialise persistentLocalCache et persistentMultipleTabManager. src/AuthContext.jsx, logout, retire le compte local et la prévisualisation.

**Impact métier et sécurité.** Le nom synthétique exact du programme de A est lisible par du code exécuté sur la même origine sous B. Le Dashboard affiche zéro programme. Le serveur refuse B. Le test nécessite le profil local partagé et une copie déjà obtenue par A.

**Performance.** Une lecture locale suffit, sans requête au serveur.

**Preuve.** persistent-profile et persistent-content. Le second compare la valeur privée exacte à la fixture.

**Correction proposée.** Définir la politique appareil partagé, utiliser un cache mémoire sur un appareil non fiable ou isoler les données persistantes par identité. Tester la fermeture de tous les onglets, la reprise et les écritures en attente avant toute purge.

**Risque de correction.** Une purge naïve peut perdre des mutations hors ligne ou perturber les onglets encore ouverts.

### C1 · P1 · Coût d’un changement dans une grande inbox

Résiduel déjà décrit au Lot 2B.2.

**Reproduction.** Créer 1 000 conversations, attendre l’admission des écouteurs, envoyer un message et observer jusqu’à réception.

**Fichiers.** backend/utils/inboxProjection.js, backend/utils/clubInboxWatch.js, routes Club et professionnelles, scripts/measureMessagingLot2B2.cjs.

**Impact métier et sécurité.** Réception en 331/398 ms. Aucune fuite constatée par ce test. Une forte activité réengage les projections et leurs autorisations.

**Performance.** 1 011 lectures estimées côté professionnel, 1 948 côté Club pour le scénario message.

**Preuve.** inbox, comparaison des phases steady24 et message.

**Correction proposée.** Mesurer à fréquence de messages représentative et borner la projection modifiée en conservant les contrôles de portée.

**Risque de correction.** Omettre une conversation ou un retrait de droits.

### C2 · P2 · Progression confirmée tardive à froid

Résiduel du Lot 5 sur grands historiques.

**Reproduction.** Ouvrir le Dashboard Client sans cache, avec 20 programmes de 1 000 séances chacun.

**Fichiers.** src/components/Clientdashboard.jsx et lecteurs de progression du Lot 5.

**Impact métier et sécurité.** Le premier contenu apparaît en 1,402 s. La progression complète demande 24,854 s sur ce passage. Aucune fuite détectée dans ce scénario.

**Performance.** 20 000 documents historiques transmis à froid et 178 Mio de tas échantillonné à l’ouverture.

**Preuve.** browser-deep.

**Correction proposée.** Évaluer un résumé vérifiable à partir des sources canoniques, coût initial et corrections inclus.

**Risque de correction.** Double comptage, reprise erronée ou données périmées après suppression.

### T1 · P3 · Assertion de sélection de semaine

Antérieure

**Reproduction.** Lancer scripts/testClientWeekSessions.mjs via Node dans les deux révisions.

**Fichiers.** scripts/testClientWeekSessions.mjs

**Impact métier et sécurité.** Le test exige une chaîne JSX/JS différente du chaînage optionnel effectif. Couverture de régression affaiblie, incident utilisateur non démontré.

**Performance.** Effet sur sécurité et performances non établi.

**Preuve.** testClientWeekSessions

**Correction proposée.** Tester la sélection rendue.

**Risque de correction.** Une assertion trop permissive masquerait une régression réelle.

### T2 · P3 · Banc de livraison payante incomplet

Antérieure

**Reproduction.** Lancer scripts/testPaidProgramDelivery.cjs via Node dans les deux révisions.

**Fichiers.** scripts/testPaidProgramDelivery.cjs

**Impact métier et sécurité.** La fonction extraite ne reçoit pas assertProgramSize. Les six scénarios Firestore de livraison réussissent. Couverture de régression affaiblie, incident utilisateur non démontré.

**Performance.** Effet sur sécurité et performances non établi.

**Preuve.** testPaidProgramDelivery

**Correction proposée.** Importer le service avec ses dépendances explicites.

**Risque de correction.** Une assertion trop permissive masquerait une régression réelle.

### T3 · P3 · Extraction textuelle nutrition cassée

Nouvelle depuis la référence

**Reproduction.** Lancer scripts/testDashboardNutritionRecords.mjs via Node dans les deux révisions.

**Fichiers.** scripts/testDashboardNutritionRecords.mjs

**Impact métier et sécurité.** Illegal return statement dans la source extraite. Le même test passe sur la référence. Couverture de régression affaiblie, incident utilisateur non démontré.

**Performance.** Effet sur sécurité et performances non établi.

**Preuve.** testDashboardNutritionRecords

**Correction proposée.** Exercer le chemin nutrition avec des dossiers synthétiques.

**Risque de correction.** Une assertion trop permissive masquerait une régression réelle.

### T5 · P3 · Suite de publication bloquée par une extraction statique

Nouvelle depuis la référence

**Reproduction.** Lancer npm run test:release-regressions sur HEAD, puis node scripts/testDashboardTemplatePublication.mjs sur la référence.

**Fichiers.** scripts/testDashboardTemplatePublication.mjs

**Impact métier et sécurité.** start > 0 échoue en cherchant programmesSnapPromise. Le test de référence passe. La suite npm arrête les commandes suivantes. Couverture de régression affaiblie, incident utilisateur non démontré.

**Performance.** Effet sur sécurité et performances non établi.

**Preuve.** release

**Correction proposée.** Tester la publication avec des promesses contrôlées.

**Risque de correction.** Une assertion trop permissive masquerait une régression réelle.

### T6 · P3 · Banc de recherche mobile exigeant un tableau desktop

Test introduit au Lot 4

**Reproduction.** Lancer node scripts/runCoachPagesLot4.cjs after 100 500 21 sur HEAD. Comparer au résultat du contrôle sur les liens des cartes mobiles.

**Fichiers.** scripts/fixtures/coachPagesLot4.jsx

**Impact métier et sécurité.** La recherche à 500 px attend une ligne tbody alors que Clients rend des cartes. Couverture de régression affaiblie, incident utilisateur non démontré.

**Performance.** Effet sur sécurité et performances non établi.

**Preuve.** coach100

**Correction proposée.** Vérifier le lien du client recherché et l’absence du résultat précédent.

**Risque de correction.** Une assertion trop permissive masquerait une régression réelle.

### T4 · P3 · Assertion de restauration de liste dépassée

Nouvelle depuis la référence

**Reproduction.** Lancer scripts/testGlobalLoading.mjs via Node avec --experimental-vm-modules.

**Fichiers.** scripts/testGlobalLoading.mjs

**Impact métier et sécurité.** Les contrôles dynamiques de cache réussissent, puis l’assertion exige await restorePageDataCacheEntry dans Clients. La référence passe avec --experimental-vm-modules. Couverture de régression affaiblie, incident utilisateur non démontré.

**Performance.** Effet sur sécurité et performances non établi.

**Preuve.** vm-loading

**Correction proposée.** Remplacer le contrôle de texte par le comportement de restauration et d’autorisation.

**Risque de correction.** Une assertion trop permissive masquerait une régression réelle.

## Observé dans le code

Les contrôles Rules et les lectures via Admin SDK utilisent des autorités différentes. Les deux premières reproductions exploitent précisément cette frontière.

## Hypothèse

Les autres routes qui lisent les mêmes champs pourraient élargir le périmètre exposé. Seules les routes reproduites figurent dans les impacts confirmés.

## Non vérifié

Présence de profils ou de liaisons compromis en production, exploitation passée et coût monétaire réel inconnus.
