# Lot 7B.1 QUATER — sécurité et stockages

## Modèle et garanties

Une clé contenant un UID n’est pas une autorisation. Les caches nouveaux sont volatils, et le profil doit être confirmé en ligne avant admission. Une génération change à chaque transition : les réponses de l’ancienne génération sont rejetées par `apiFetch`, les mémoires des adaptateurs et pageDataCache sont vidées. Les composants sont remontés sous la nouvelle génération. Le remplacement complet du contexte retire aussi les Maps globales des composants et le cache SDK.

Un changement de compte termine Firestore avant admission de l’autre principal. Un changement confirmé de rôle/club verrouille l’interface puis recharge. Un navigateur démarré hors ligne ne restaure pas une interface privée depuis le disque. Une session Firebase Auth restaurée reste possible, mais elle ne suffit pas à admettre les caches privés : le profil serveur doit être obtenu.

## Inventaire actualisé

L’inventaire historique détaillé, lecteurs, clés et durées figure dans `BYL_LOT7B1BIS_STOCKAGES.md` et `audits/lot7b1bis/storage-sites.txt`. Ce document remplace ses **propositions** par l’état QUATER ci-dessous. Recherche actuelle : `audits/lot7b1quater/storage-sites.txt`.

| Famille / lecteurs et auteurs | Risque initial | Correction / durée nouvelle | Test et garantie | Limite |
|---|---|---|---|---|
| Firestore IndexedDB, tous consommateurs SDK | Programme/historique/nutrition/Club/message lisible après logout/fermeture | SDK mémoire, vie du contexte, terminaison à changement d’identité | Ancien SDK reproduit la fuite ; nouveau SDK ne restitue pas A à B, deux onglets et réouverture | Ancienne base et mutations en attente conservées sur disque |
| `byl-dashboard-snapshots`, pageDataCache/nutrition | Copies privées compressées, TTL ne purgeant pas le disque | Lecteur/écrivain IndexedDB neutralisé, RAM conservée dans la session | Nutrition héritée absente via lecteur applicatif, toujours présente en lecture brute | Pas de purge, pas de récupération automatique |
| localStorage de pages, programmes, clients, historiques, Club/progression | JSON privé accessible au compte suivant | Adaptateur mémoire, aucune lecture des anciennes valeurs | Unité de quarantaine + scénario Chrome programme/nutrition | Pas de parcours complet de chaque page de nutrition/Club |
| Profil `user`, résolution client | Profil précédent admis avant serveur, métadonnées identifiantes | Profil initial vide, cache mémoire après admission | AuthProvider réel, changement rôle/club/compte | Révocation distante inconnue pendant coupure réseau |
| Brouillons ProgramBuilder | Valeur locale non chiffrée et attribution insuffisante | RAM + nouveau brouillon serveur privé ; autosave 900 ms | Hors ligne, reconnexion, conflit, publication, récupération serveur | Pas de récupération de RAM après fermeture ; ancien brouillon non importé |
| `useSessionDraft`, questionnaires, messages, Club ; `workoutProgram` ExerciseList | Brouillons persistants et clé parfois globale | Mémoire de session via adaptateur, purge RAM à transition | Test adaptateur et barrière ; accès natifs privés remplacés | Ces autres parcours n’ont pas la nouvelle autosauvegarde serveur |
| SessionPlayer, sessionResume, chronomètres, préférences automatiques | Reprises et activités conservées en clair | Mémoire, mêmes lecteurs métier | Smoke et inspection des adaptateurs | Reprise après fermeture limitée à ce qui existe déjà côté serveur ; qualification complète de séances à poursuivre |
| Messagerie et offres : notifications, anciens previews, feed | Métadonnées persistantes ou fallback ancien | Adaptateur mémoire, aucun fallback privé natif | Tests transversaux + smoke | BroadcastChannel conservé ; fallback de signal via stockage ne traverse plus les onglets |
| Position, analytics, AdminGeo, état tutoriel/navigation | Position/identifiants et chemins persistants | Mémoire ; contexte anonyme frais possible avant première admission, effacé à admission | Tests géolocalisation/smoke et unité | Aucun enrichissement de télémétrie ; analyse de toutes dépendances tierces non exhaustive |
| Mémoires globales et requêtes en cours | Résultat A réutilisé après B | Epoch, ticket API, démontage puis nouveau contexte aux changements de périmètre | Réponse API retardée rejetée ; Chrome A→B | Les `fetch` hors helper ne sont pas tous équipés de tickets ; destruction du contexte est la protection transversale |
| Préférences d’appareil | Confusion entre privé et public | Allowlist native : consentement, langue, thème, unités, son/haptique, activation géolocalisation, marqueur de référentiel CIQUAL | Inventaire statique | Ne contient ni position, ni profil, ni programme ; consentement reste choix du navigateur |
| Firebase Auth SDK | Session authentifiée conservée sur appareil partagé | Persistance Auth inchangée, admission serveur obligatoire | Réouverture en ligne/hors ligne | Pas de protection contre vol de jeton ou personne utilisant une session A restée connectée |
| Service Workers / Cache Storage | Ancien code ou réponses privées possibles | Aucun usage explicite repéré dans src/public/config inspectés ; aucune suppression | Recherche statique, profil Chrome synthétique | Ne prouve pas l’absence de SW historiques sur postes déployés |
| Cache HTTP, médias, exports | Copies indépendantes des stores applicatifs | Nouvelle API brouillon `private, no-store` | Inspection route | Pas d’effacement des téléchargements, backups, médias, copies exportées ou mémoire OS |

## Brouillons serveur et publication

Chaque endpoint recontrôle Firebase Auth et le marqueur de révocation, puis dans la transaction le profil, le périmètre et l’accès au programme/dossier. Les droits propres du coach restent distincts des droits dérivés du Club. Retrait d’un membre : les droits dérivés sont refusés. Les règles Firestore existantes interdisent l’accès direct à `programDrafts` ; aucune nouvelle règle de production.

La révision du brouillon empêche deux onglets de l’écraser silencieusement. `operationId` + digest rendent une reprise réseau idempotente ; même identifiant avec autre contenu est refusé. Le `updateTime` du programme canonique détecte aussi les documents historiques sans `_rev`. La publication explicite compare l’empreinte du document dans une transaction ; le brouillon ne valide aucun paiement, réservation ou crédit.

## Limites de sécurité à ne pas masquer

P0-4 reste ouvert pour la lecture brute des anciennes données. Un ancien onglet peut continuer à écrire en clair ; aucun nouveau code ne peut garantir son arrêt sans protocole de migration. Refuser un avertissement de fermeture peut laisser un contexte verrouillé nécessitant rechargement ; cela n’autorise pas le nouveau principal à l’ancien SDK.

La désactivation dans Firebase Auth seule et les limites P0-3 restent celles des lots antérieurs. La révocation du profil BYL a retiré le Builder en environ 34 ms dans l’essai connecté local ; ce n’est ni une borne de production ni une garantie hors ligne. Aucun effacement rétroactif de copies déjà exportées n’est promis. Les changements d’appartenance sont soumis à la confirmation serveur et aux contrôles propres de chaque domaine ; tous les écrans n’ont pas reçu une qualification end-to-end dans ce lot.
