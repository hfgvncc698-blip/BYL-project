# Lot 7B.1 — risques résiduels et décisions

10 novembre 2026. Branche `codex/firebase-performance-audit`. Référence applicative `e476b0a4cfcd6bb9e27515c69a5416325e480f6e`, départ du travail `27a9515`. Tests locaux sur données synthétiques et émulateurs uniquement.

## Décisions bloquantes


P0 | Reproduit avant | Corrigé dans le code | Contre-test | Statut
--- | --- | --- | --- | ---
1 · autorité Club | Oui | Oui | Réussi | Corrigé pour les frontières testées
2 · séance étrangère | Oui | Oui | Réussi | Corrigé pour les projections et mutations testées
3 · Auth externe | Oui | Partiellement, préparation opérateur | Confinement réussi, Auth seule reste accessible | Partiellement corrigé
4 · stockage partagé | Oui | Non | Échec de confidentialité confirmé | Bloquant, décision de stockage requise


Le déploiement reste interdit. P0-3 conserve une faille pour les interventions Auth externes qui contournent le marqueur. P0-4 conserve la lecture locale inter-comptes dans un profil partagé. Leur statut ne dépend pas du nombre de tests verts.

## P0-4 · inventaire des stockages


Stockage | Contenu et portée | État vérifié
--- | --- | ---
Firestore persistentLocalCache | Documents programmes, historiques et autres collections consultées. Coordination multi-onglet. | Lecture du programme sous le second compte démontrée, avant et après redémarrage.
Firestore memoryLocalCache, prototype temporaire | Documents conservés dans l’instance JS active. | Après redémarrage, le programme disparaît. Dans la même instance après changement de compte, il reste lisible.
IndexedDB byl-dashboard-snapshots | Copies reconstruisibles des programmes, clients, nutrition, statistiques. Clés incluant des identifiants, durée maximale de sept jours dans le code. | Lecture du bilan synthétique du premier compte démontrée sous le second, même avec Firestore mémoire.
pageDataCache / localStorage | Cache mémoire et copie locale par clés de page. Certaines clés de prévisualisation sont réservées à la session. | Observé dans le code. L’isolation des clés ne chiffre pas les valeurs.
ProgramView / sessionStorage | Préférences par dossier/programme et BYL_AUTO_PREFS_LAST. | Observé dans le code. Clé globale à classifier avant toute conservation après changement de compte.
SessionPlayer / localStorage | État du chronomètre et préférences. Travaux et progressions hors ligne impliquent aussi la file Firestore. | Observé dans le code. La purge ne doit pas perdre une mutation non synchronisée.
clientResolver / localStorage | Identifiant de dossier et horodatage du cache de résolution. | Observé dans le code. Métadonnées à traiter comme privées.
Messagerie | Feed partagé en mémoire, nettoyage à changement Auth. Dans la bulle, marqueurs locaux de notifications déjà vues. | Scénarios applicatifs du Lot 7A et audit du stockage. Les anciens messages déjà lus via SDK peuvent aussi se trouver dans le cache Firestore.
ExerciseList / localStorage | workoutProgram | Observé dans le code. Contenu à inclure dans le périmètre de stockage privé.


## Options à valider pour P0-4


Option | Garantie recherchée | Conséquences | Validation restante
--- | --- | --- | ---
Cache privé éphémère et frontière d’identité complète, option recommandée pour un profil partagé | Nouvelle instance de données à chaque identité, retrait de toutes les copies privées reconstructibles, rejet des écritures tardives de l’ancien compte. | Perte du retour hors ligne après redémarrage. Le changement de compte doit attendre la synchronisation des mutations ou proposer une sauvegarde maîtrisée. Les vieux onglets doivent confirmer leur arrêt. | Protocole multi-onglet, inventaire complet des écritures persistantes, migration réversible des profils existants, panne réseau et écriture en vol. Le simple remplacement par memoryLocalCache a échoué.
Mode appareil personnel avec stockage privé chiffré | Conserver le mode hors ligne, avec déverrouillage de la bonne identité et chiffrement de toutes les copies applicatives. | Gestion des clés, récupération, verrouillage et migration des anciennes données en clair. Les clés ne peuvent être laissées en clair à côté du cache. | Architecture et mécanisme de conservation des écritures à approuver avant implémentation.
Confinement opérationnel provisoire | Une seule identité BYL par environnement utilisateur protégé, avec profils navigateur distincts et contrôle d’accès du système. | Le changement de compte dans le même profil reste interdit par procédure. Un autre utilisateur ayant accès au même profil disque peut toujours relire les données. | Deux profils Chromium indépendants ont été testés. Cette procédure n’est pas une correction technique du profil partagé et ne rend pas la production autorisée.


## Options pour Auth externe

La procédure préalable de marqueur est la solution opérationnelle testée pour le périmètre messagerie. Restreindre les droits d’outils externes afin de rendre cette procédure obligatoire nécessite une décision opérationnelle et une vérification IAM.

Une réconciliation périodique ou événementielle peut réduire la fenêtre, mais ajoute coût, retard, reprises et configuration. Elle ne constitue pas une révocation synchrone. Un contrôle serveur pour chaque accès engagerait une migration des clients SDK. Ces changements demandent validation avant mise en œuvre.
## Compatibilité et coûts à surveiller

Les clients qui provisionnent un utilisateur avec des champs privilégiés ou non prévus reçoivent désormais un refus. Les administrateurs fondés uniquement sur isAdmin doivent être qualifiés avant publication. Les appartenances purement déclarées dans un profil sans fiche de membre ni propriété du club sont refusées, y compris via les droits SDK partagés.

Les anciens rendez-vous dont la liaison ne prouve pas le club conservent leurs données locales. Leur séance ne fournit plus de difficulté ou de statut enrichi. Une réassociation nécessitera une preuve serveur, sans modification massive automatique.

Les projections enrichies ajoutent des lectures ponctuelles et des écoutes de dossiers. La fixture de 12 membres quantifie ce surcoût. Le coût à 1 000 conversations, les grands historiques et les six bancs P3 restent les sujets du Lot 7A. Ce sous-lot ne les corrige pas.

Non vérifiés dans ce sous-lot — index et règles déployés, IAM, appareils physiques, comportement du proxy de production, facture réelle, lecture locale sous un compte OS distinct sur un appareil partagé, migration d’un cache existant contenant des écritures en attente.
