# Lot 7B.1 SEXIES — parcours du pilote et migration

## Périmètre autorisé

Les six rapports QUINQUIES ont été lus intégralement. Les conclusions sur l’attribution incertaine, les mutations locales, les onglets et le caractère irréversible d’une purge réelle restent applicables. Ce lot ajoute un pilote exécutable uniquement sur fixtures. Aucun ancien brouillon utilisateur n’est lu, exporté ou effacé.

| Catégorie | Traitement du pilote | Limite avant migration réelle |
|---|---|---|
| Brouillon à provenance serveur démontrée | Proposition, consentement, import séparé, reçu atomique, vérification | Manifestes historiques généralement absents ; ne pas inventer la provenance |
| Brouillon sans propriétaire établi | Refus avant lecture/import | Maintenir quarantaine ; toute perte éventuelle exige une décision distincte |
| Brouillon déjà récupéré | Réutiliser reçu et vérifier contenu, sans seconde écriture | Rétention durable et droits réels à qualifier dans une future intégration |
| Programme/nutrition/historique en cache | Copies synthétiques pour contre-tests puis purge de test | Confirmer reconstructibilité et droits actuels, pas sur seul TTL |
| Mutation Firestore offline | Prouver survie après fermeture puis perte lors de purge synthétique | Pas de conversion qualifiée vers brouillon ; jamais purger automatiquement une file réelle |
| localStorage/sessionStorage secondaires | Suppression des seules clés `sexies-synthetic-*` | Liste réelle à établir par version ; chaque onglet détient son sessionStorage |
| Préférence langue | Conservée et vérifiée après redémarrage | Préserver l’allowlist non privée, pas de `clear()` global |
| Cache Storage/Service Worker | Créer puis supprimer les seules fixtures | Inventorier les scopes réels et fermer leurs clients avant toute action réelle |

## Parcours utilisateur du pilote

Le coach se connecte normalement au compte synthétique. La proposition « Brouillon autorisé : récupérer sans publier ? » n’apparaît qu’après admission serveur. Le bouton « Récupérer » exige une action explicite. Le contenu n’est pas publié. En cas de conflit, révocation ou erreur, le pilote conserve l’original et affiche l’erreur ; aucune attribution au compte suivant. Au changement de compte, la proposition est retirée.

Le banc n’est pas une interface produit prête à déployer : les comptes et les données sont préparés par le runner, les droits sont ceux du pilote, et les actions de nettoyage sont pilotées par les tests. Aucun second mot de passe, aucune sauvegarde privée exportée.

## Coordination et étapes

1. Quarantaine ; refus des données inconnues et des suppressions dont les dispositions ne sont pas confirmées.
2. Récupération autorisée et reçus vérifiés, ou disposition synthétique explicite du banc. Les booléens `confirmed/resolved` n’ont de valeur que pour les fixtures ; pas de mécanisme de consentement réel livré.
3. Préparation BroadcastChannel : les onglets actuels accusent et nettoient leur propre sessionStorage. Un ancien onglet ignore le message ; le manque d’accusé n’est jamais assimilé à son absence.
4. Nettoyage sérialisé via Web Locks entre versions coopérantes, suppression IDB et stockages secondaires ciblés. Une ancienne connexion qui reste ouverte produit `blocked`.
5. Une suppression bloquée reste active : la fermeture tardive de la connexion peut la faire réussir après le retour du contrôle. Ne pas confondre timeout et annulation.
6. Échec secondaire : journal technique `interrupted`, pas de succès global. Après fermeture/réouverture, vérifier l’état réel puis reprendre les étapes restantes.
7. Recontamination : si l’ancien onglet recrée IndexedDB, arrêter et demander un nouvel inventaire ; pas de purge silencieuse de nouvelles données uniques.
8. Fin locale provisoire `local-checked-global-unproven`. Tant que l’ancien contexte peut écrire, le reçu global est refusé.
9. Le harness ferme Chrome, redémarre le profil jetable et vérifie tous les emplacements ciblés. Il confirme l’unique onglet sûr, puis permet au serveur d’enregistrer et relire le reçu limité à ce profil de test.

La purge de la base Firestore demo réelle est un sous-test séparé : arrêt SDK, effacement, vérification d’absence puis nouveau redémarrage. Elle ne constitue pas une procédure générique de migration des bases Firestore de BYL.

## Reprise et retour arrière

Le journal local ne contient que des états techniques, sans contenu privé. Il guide la reprise mais ne prouve ni l’autorisation ni l’absence d’une base. Les reçus de brouillons sont conservés dans Firestore émulé ; perdre une réponse ne déclenche pas une seconde création. Le test d’import concurrent confirme cette propriété.

Avant purge réelle : les originaux doivent rester intacts jusqu’à décision et preuve de récupération. Après purge : aucun retour arrière local garanti ; seules les copies autorisées déjà récupérées peuvent être relues. Ne jamais redéployer l’ancien code persistant comme rollback. Les fermetures normales testées ne couvrent pas une panne électrique, toutes les restaurations de session, ni la récupération forensique du disque.

## Arrêt avant intégration

Aucune intégration dans BYL et aucune migration réelle à l’issue de ce lot. Pour une suite éventuelle : définir le périmètre réel, établir provenance/disposition de chaque donnée unique, qualifier le protocole de fermeture des anciennes versions et les preuves serveur, puis obtenir une validation distincte avant toute suppression irréversible.
