# Lot 7B.1 OCTIES — stabilité

Branche `codex/firebase-performance-audit`. Qualification locale du 10 novembre 2026, sans déploiement.

## Cause reproduite

Le premier rejeu du scénario SEPTIES sans l’attente de 2,5 secondes réussit (41 contrôles). Il ne reproduit donc pas systématiquement l’échec historique. En bloquant ensuite le téléchargement réel de `GuidedTutorial.jsx` avec Chrome CDP, le shell affiche AppErrorBoundary : `TypeError: Failed to fetch dynamically imported module`. Le module est monté après admission, via IdleMount et React.lazy. Suspense traite l’attente, mais pas le rejet de l’import ; le rejet remontait à la frontière de l’application entière et retirait le formulaire.

Cette cause est démontrée pour la reproduction contrôlée. La trace historique SEPTIES ne contenait pas l’erreur précise : on ne peut pas affirmer rétrospectivement que le même module était responsable.

## Correction intégrée

`src/utils/resilientLazy.jsx` fournit une frontière locale pour les échecs réseau d’import reconnus. `src/App.jsx` l’utilise pour ses composants différés, `src/AuthContext.jsx` pour la notice de migration. Les erreurs de rendu métier continuent de remonter à la frontière générale. Les formulaires frères restent montés. Une nouvelle tentative est disponible manuellement et lors de l’événement `online`, sans polling, rechargement automatique, cache persistant, ni accès supplémentaire aux données.

L’identité initiale du composant lazy reste stable pendant les reprises Suspense. Un premier correctif de mise au point recréait cette identité avant montage et restait en attente : corrigé et couvert par un test ciblé. Aucun tutoriel métier modifié.

Message : « Une partie de cette page n’a pas pu être chargée. Vérifiez votre connexion puis réessayez. Votre travail ouvert est conservé. » Ce message signifie conservation du formulaire resté monté, pas sauvegarde durable de modifications encore hors ligne.

## Admission et brouillons

Le profil doit toujours être confirmé côté serveur ; bloquer Firestore à l’ouverture laisse « Vérification de la session » et aucun ProgramBuilder. Une identité Firebase Auth connue ne suffit pas. Les droits et tickets de génération sont inchangés.

Le test interrompt la lecture du brouillon : l’interface reste ouverte, signale l’échec, puis propose le brouillon après rétablissement et nouvelle tentative. Sa restauration reste explicite. Autosauvegarde, conflit, publication manuelle, avertissement avant fermeture et reconnexion restent couverts.

## Limites

Si le document ou le JavaScript initial n’a jamais été chargé et n’est pas disponible, l’application ne peut pas afficher sa propre dégradation : Chrome peut afficher son écran réseau. Aucun Service Worker hors ligne ni admission depuis un profil persistant n’est ajouté.

Certains moteurs mémorisent un import échoué jusqu’au rechargement ; une nouvelle tentative peut rester en échec. Aucun cache-busting ni rechargement forcé susceptible de perdre le travail ouvert. Après synchronisation confirmée, l’utilisateur peut recharger. Les erreurs inconnues de module/rendu ne sont pas masquées. Pas de qualification de tous les moteurs, connexions mobiles et dépendances imbriquées de toutes les pages.
