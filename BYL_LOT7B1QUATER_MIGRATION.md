# Lot 7B.1 QUATER — migration suspendue à validation

## État livré

Aucune suppression de base IndexedDB, de valeur privée localStorage/sessionStorage, de transaction héritée ou de brouillon personnel. Aucun import automatique. L’ancien nettoyage par quota des caches persistants n’est plus lancé par l’initialisation Firebase. Les adaptateurs ignorent les anciennes valeurs ; leur `removeItem` privé ne touche que la mémoire nouvelle.

La suppression d’un **nouveau** brouillon serveur après publication explicite est distincte d’une migration des données héritées. Le logout termine le SDK courant ; il ne vide pas les bases historiques. La nouvelle instance mémoire ne réexpédie pas les anciennes mutations IndexedDB en attente.

## Classer avant récupération

| Contenu hérité | Classification et récupération envisagée |
|---|---|
| Snapshot serveur de programme, historique, nutrition, annuaire, Club | Reconstructible uniquement après confirmation de présence et accès actuels côté serveur ; l’âge ou un UID dans une clé ne suffisent pas |
| Mutations en attente dans Firestore | Potentiellement seule copie d’un travail ; inventaire et rapprochement avec source canonique nécessaires, ne pas ouvrir naïvement l’ancien SDK qui peut les expédier |
| Brouillon ProgramBuilder / questionnaire / reprise SessionPlayer | Potentiellement unique ; récupération explicite sous identité confirmée et autorisée sur le dossier/programme |
| `workoutProgram`, fallback global de préférences | Attribution ambiguë ; ne jamais proposer au compte courant uniquement parce qu’il occupe le même navigateur |
| Notification, position, analytics, préférences de contexte | Personnel, même sans contenu de programme ; à inclure au périmètre de purge validé |
| Auth, langue, thème, consentement | À distinguer ; pas de suppression globale de toutes les bases/valeurs par défaut |

## Options présentées, non appliquées

**1. Conserver la quarantaine actuelle.** Réversible dans le code, sans perte des données héritées. Les parcours courants testés ne les lisent plus, mais un second utilisateur peut encore lire le disque. Cette option ne permet pas de lever P0-4 ni de publier sur des navigateurs partagés hérités.

**2. Récupération autorisée, puis purge ciblée validée — option proposée pour qualification.** Concevoir un outil isolé sur appareil de confiance, demander l’identité du propriétaire et confirmer ses droits en ligne. Faire l’inventaire des seuls contenus de cette identité ; ne pas afficher des données ambiguës à une autre personne. Présenter un différentiel avec le serveur, importer après confirmation vers des brouillons serveur versionnés et vérifier la relecture. Une clé UID n’est jamais la preuve de propriété. Les contenus non attribuables restent sous contrôle du propriétaire légitime ; aucun export global partagé.

Après validation distincte du périmètre de suppression, arrêter tous les anciens onglets et processus BYL, vérifier les connexions et transactions IndexedDB, attendre leur fermeture, puis supprimer uniquement les bases/entrées privées approuvées. Une suppression `blocked` doit arrêter la procédure, jamais afficher un succès. Vérifier après fermeture et réouverture de Chrome, y compris sous B et hors ligne, par lecture brute indépendante. Inventorier les Service Workers/Cache Storage réellement présents avant toute action sur eux.

**3. Nouveau profil navigateur contrôlé.** Peut isoler un pilote sans importer les anciens caches, après récupération légitime du travail. Cela ne sécurise pas l’ancien profil ni les sauvegardes de disque ; ce n’est pas une correction de P0-4 sur le parc existant.

## Réversibilité et barrières

La préparation et la quarantaine sont réversibles ; une purge ne l’est pas. Une sauvegarde de récupération ne doit pas devenir une nouvelle copie privée non protégée. Sa méthode de stockage, durée, destinataire et destruction doivent être décidés avant création. Aucun fichier de données personnelles sauvegardé dans ce lot.

Ne pas rétrograder vers le code à persistance claire après migration : il pourrait recréer la fuite. Les anciennes versions dans d’autres onglets peuvent repeupler le disque ; un accusé BroadcastChannel seul ne prouve pas l’absence de tous les onglets. Un protocole opérationnel de fermeture et vérification de version reste nécessaire. Ne pas garantir l’effacement forensique des blocs disque, backups OS, exports ou copies antérieures.

## Comportement A+D approuvé

Le brouillon déjà confirmé côté serveur peut être proposé à nouveau après connexion et contrôle d’accès. Les modifications non synchronisées restent en RAM ; une fermeture complète, un rechargement ou une transition de sécurité peuvent les perdre. Le Builder affiche cette limite et pose un avertissement `beforeunload` lorsque les valeurs locales ne sont pas confirmées ; les navigateurs peuvent ne pas afficher ce dialogue dans toutes les circonstances. Aucun deuxième mot de passe ou coffre chiffré implicite ajouté.

## Validation attendue

Conformément à la phase C (« Ne pas effacer les données personnelles ou brouillons hérités sans validation explicite »), la purge est arrêtée. La prochaine décision est de valider **la conception et qualification de l’option 2**, avec récupération autorisée préalable et validation séparée avant suppression irréversible. Aucun autre lot et aucun déploiement ne sont engagés par cette livraison.
