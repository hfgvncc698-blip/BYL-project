# Lot 7B.1 QUATER — bilan

10 novembre 2026. Branche `codex/firebase-performance-audit`, base `5bdcd1b`. Aucun déploiement, aucune donnée réelle, aucune modification des règles Firestore, aucune purge héritée.

## Résultat et décision

L’architecture A+D est intégrée au parcours réel ProgramBuilder : connexion Firebase habituelle, autosauvegarde serveur distincte de la publication, modifications hors ligne en mémoire, synchronisation à la reconnexion, contrôle des versions et avertissement de fermeture. Aucun second mot de passe. Les données privées nouvelles ne passent plus par les lecteurs persistants applicatifs recensés.

**P0-4 reste ouvert et la production reste bloquée.** Le contre-test Chrome reproduit la fuite initiale de programme et de nutrition. Après correction, le second compte n’obtient plus ces données via les lecteurs applicatifs testés ni le cache SDK courant. La lecture directe des anciennes bases sur disque reste possible : la quarantaine ne chiffre ni n’efface ces copies. La phase C s’arrête avant toute récupération/import/purge de données héritées.

## Modifications réelles

- Firestore utilise `memoryLocalCache`. Pas de reprise automatique des mutations de l’ancienne base IndexedDB. Terminaison de l’ancien SDK avant changement de principal, puis nouveau contexte JavaScript.
- Admission de l’interface après profil confirmé par le serveur ; suppression de l’hydratation depuis l’ancien `user` local. Barrière commune de génération, invalidation des mémoires et tickets autour des appels API. Changement de rôle/club : fermeture de l’interface et rechargement du contexte.
- Adaptateurs `privateStorage` en mémoire pour les anciennes clés privées ; liste explicite de préférences d’appareil autorisées à rester persistantes. Les données de position et identifiants analytics ne sont pas des préférences publiques.
- `pageDataCache` conserve son cache RAM. `dashboardSnapshotCache` ne lit, n’écrit et ne supprime plus IndexedDB. Les anciens contenus restent en quarantaine.
- API `/api/program-drafts/{read,save,complete}` : authentification vérifiée, marqueur de révocation, périmètre courant, transactions, version canonique Firestore, révision du brouillon, opérations idempotentes, taille bornée. Aucun accès SDK direct aux nouveaux brouillons serveur.
- ProgramBuilder : temporisation de 900 ms, restauration explicite, indicateurs, reprise après réseau, conflit bloquant. L’autosauvegarde ne publie plus le programme canonique ; le bouton de sauvegarde explicite le fait, avec comparaison transactionnelle du document chargé. Suppression du seul nouveau brouillon serveur après publication confirmée.

Le remplacement des accès de stockage dans les Dashboards, nutrition, messagerie, offres, géolocalisation et SessionPlayer est nécessaire à la barrière transversale. Il n’ajoute pas d’optimisation métier de ces modules. Leurs brouillons locaux deviennent volatils ; seul ProgramBuilder reçoit la nouvelle autosauvegarde serveur. Le retour dans une page de la même session conserve les caches mémoire autorisés ; fermer/recharger le navigateur ne les conserve pas.

## Fichiers

Inventaire exhaustif : [audits/lot7b1quater/files.txt](audits/lot7b1quater/files.txt). Empreintes de la livraison et résultats : [results.json](audits/lot7b1quater/results.json).

Principaux fichiers : `src/firebaseConfig.js`, `src/AuthContext.jsx`, `src/utils/privateSession.js`, `src/utils/privateStorage.js`, `src/utils/api.js`, `src/utils/pageDataCache.js`, `src/utils/dashboardSnapshotCache.js`, `src/hooks/useSessionDraft.js`, `src/hooks/useProgramDraft.js`, `src/components/ProgramBuilder.jsx`, `src/utils/programFingerprint.js`, `src/utils/safeProgramWrite.js`, `backend/routes/programDrafts.js`, montage dans `backend/app.js`, labels de métriques dans `backend/utils/firestoreMetrics.js`. Les scripts existants ont été adaptés aux nouveaux contrats de stockage ; le tutoriel n’a pas été modifié fonctionnellement.

## Validation et limites

20 contrôles Chrome intégrés, 18 contrôles API/règles sur émulateurs, 53 contrôles smoke, test de barrière incluant une réponse HTTP retardée, tests des écritures confirmées et build avec budgets respectés. Détails dans [TESTS](BYL_LOT7B1QUATER_TESTS.md). Les performances locales et leurs limites figurent dans [PERFORMANCES](BYL_LOT7B1QUATER_PERFORMANCES.md).

Ce n’est pas une certification exhaustive de toutes les pages, appareils ou droits. Les caches HTTP/médias, anciennes versions encore ouvertes, révocation externe Firebase Auth et données héritées restent des risques documentés. Aucun traitement P1/P2/P3 entrepris. Les règles et corrections serveur antérieures P0-1/P0-2 ne sont pas affaiblies ; leur qualification exhaustive de production n’est pas remplacée par ces tests.

## Suite soumise à validation

Valider séparément le protocole de récupération puis purge décrit dans [MIGRATION](BYL_LOT7B1QUATER_MIGRATION.md). Ne pas publier tant que les contre-tests sur navigateurs migrés, anciens onglets et droits réels de préproduction ne sont pas concluants. Arrêt du lot à cette livraison.
