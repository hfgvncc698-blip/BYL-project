# Lot 7B.1 BIS — proposition de migration, non exécutée

## Décision déjà prise

Conserver la reprise hors ligne après fermeture, au moyen d’un stockage chiffré par identité. Ne pas activer une purge automatique ni désactiver simplement la persistance Firestore en perdant la file en attente.

## Fonctionnement proposé à valider avant intégration

**Option recommandée pour la première version du coffre** — secret de récupération aléatoire par identité, remis explicitement à son propriétaire lors d’un provisionnement en ligne. Il reste hors du navigateur, par exemple dans le gestionnaire de mots de passe du propriétaire. Après fermeture ou changement d’identité, l’utilisateur déverrouille son coffre avec ce secret. Les clés ouvertes restent en mémoire. Aucun mécanisme de déverrouillage automatique basé seulement sur un UID, un profil local ou la session Auth persistée.

En cas de perte du secret, les données déjà synchronisées sont récupérables après authentification serveur. Les brouillons et écritures exclusivement locaux ne le sont pas sans copie de récupération autorisée. L’interface devra le préciser avant activation. Aucun export de brouillon en clair imposé ni transfert au compte suivant.

**Alternative** — clé de données aléatoire enveloppée avec une phrase secrète dédiée et une clé de récupération distincte. Elle nécessite le choix et la qualification d’une KDF, la gestion des changements de phrase et la résistance aux attaques hors ligne. Ne pas utiliser directement le mot de passe Firebase, qui n’est pas disponible dans tous les parcours Google/Apple et dont la réinitialisation ne récupère pas une clé locale.

Une récupération serveur ou organisationnelle des clés introduirait de nouveaux accès aux données et doit être spécifiquement validée. Elle n’est pas incluse dans le prototype.

Il faut également valider ce que signifie la reprise hors ligne après révocation. Un coffre déjà provisionné et son secret permettent encore la lecture locale en l’absence de réseau. Une exigence de révocation immédiatement vérifiable impliquerait une validation en ligne avant consultation, incompatible avec cette reprise autonome.

## Brouillons et écritures métier

ProgramBuilder, questionnaire automatique, profil, Club, messages et reprise SessionPlayer doivent disposer d’un inventaire lisible uniquement par leur propriétaire. Les données locales sans attribution fiable restent en quarantaine dans l’ancien profil navigateur. Ne pas les attribuer au premier compte qui se connecte.

Avant nettoyage, le propriétaire choisit de synchroniser les contenus autorisés ou de récupérer une archive chiffrée dont il conserve la clé. Vérifier un déchiffrement de contrôle avant de supprimer une source. Les brouillons de messages supprimés actuellement à la déconnexion exigent un comportement explicite si leur conservation est demandée. Ne pas envoyer les messages pour les sauvegarder.

Le cache Firestore contient aussi des mutations non synchronisées. Aucun export public de la file interne n’a été démontré. `waitForPendingWrites` n’est pas un export et ne résout pas l’absence de réseau ou les écritures refusées. Les transactions/paiements/réservations qui nécessitent le serveur gardent leurs contraintes actuelles. La nouvelle file chiffrée devrait distinguer brouillon, opération à transmettre, opération confirmée et conflit, avec identifiant stable et revalidation serveur. Pas de remplacement générique de toutes les écritures dans ce lot sans qualification métier.

## Séquence de migration proposée

1. Préparer une version qui bloque les nouvelles écritures persistantes non chiffrées et sait inventorier les données héritées, sans les détruire. Garder le compte propriétaire authentifié pour la récupération.
2. Fermer ou mettre à jour tous les onglets de l’origine, y compris fenêtres et applications installées. Exiger un protocole de génération et accusés. Un onglet ancien silencieux ne peut être considéré fermé par simple expiration d’un timer.
3. Suspendre abonnements et tâches asynchrones. Attendre les écritures autorisées en ligne, gérer explicitement refus et conflits. Si l’état de la file ne peut être prouvé, interrompre la migration.
4. Provisionner le coffre et la récupération, importer uniquement les données attribuées et autorisées. Conserver timestamps de fraîcheur et versions. Les données révoquées ne deviennent pas autorisées parce qu’elles sont anciennes.
5. Vérifier l’intégrité, les volumes et la récupération dans un contexte vierge. Tester les archives sans contenu personnel dans les journaux.
6. Arrêter Firestore et fermer toutes les connexions IndexedDB. Gérer `blocked`, `versionchange`, transactions ouvertes et délais. Ne pas ignorer un échec.
7. **Point irréversible soumis à validation** — retirer les anciennes bases et clés privées précisément inventoriées, après sauvegarde/récupération confirmée. Pas de `localStorage.clear()` ni de suppression générale des brouillons. Les restaurations de sessionStorage de fenêtres anciennes doivent être couvertes.
8. Inventorier les enregistrements Service Worker et Cache Storage de l’origine dans le navigateur réel. Aucun enregistrement n’a été repéré dans le code actuel. Une absence dans le dépôt ne prouve pas l’absence d’un ancien worker installé.
9. Redémarrer avec Firestore mémoire, coffre verrouillé et migration attestée. Vérifier qu’aucun ancien onglet ne peut recréer une copie en clair. En cas d’échec, maintenir l’accès privé bloqué, sans afficher « nettoyage terminé ».

## Réversibilité et limites

Avant l’étape 7, les sources sont conservées et la migration peut être interrompue. Cela conserve aussi leur exposition initiale. Après suppression, seul un retour depuis une sauvegarde autorisée est possible. Une ancienne version applicative ne doit pas être réactivée automatiquement car elle recréerait les caches en clair.

Le nettoyage logique n’efface pas les sauvegardes OS, copies de profil, exports antérieurs, blocs disque récupérables ni données d’une autre origine ou d’un appareil inaccessible. Ne promettre aucun effacement rétroactif de ces copies. La migration ne peut être garantie tant que des onglets anciens ou des mutations non synchronisées sont encore présents.

## Critères avant autorisation

Choix du déverrouillage/récupération et des droits hors ligne, prototype navigateur et IndexedDB transactionnel, parcours de brouillons complets, tests SDK avec instance remplacée, deux onglets et appareils, reconnexion avec conflits, nettoyage bloqué puis repris, matrices fonctionnelles et performances. Aucune de ces étapes d’intégration n’est déclarée accomplie par les tests unitaires du coffre.
