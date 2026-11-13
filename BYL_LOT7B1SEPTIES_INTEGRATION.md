# Lot 7B.1 SEPTIES — intégration dans BYL

## Points d’intégration réels

Les rapports QUATER (5), QUINQUIES (6) et SEXIES (6) ont été lus intégralement. Le nouveau code est importé par l’application, pas par une page de prototype indépendante.

| Élément | Intégration |
|---|---|
| Frontière d’identité | `src/AuthContext.jsx` charge `CacheMigrationNotice` en lazy, uniquement après admission du profil serveur et de la session privée. La génération existante démonte l’interface à chaque transition. |
| Service central | `src/utils/cacheMigration.js` : détection, version/protocole, état partagé, tickets d’identité, récupération, coordination et nettoyage contrôlé. |
| Messages | `src/components/privacy/CacheMigrationNotice.jsx` : ancienne sauvegarde, vérification, proposition, refus, confirmation, autre onglet, interruption et état incomplet. Aucun aperçu de contenu privé. |
| Autorisations communes | `backend/utils/programDraftAccess.js` extrait les contrôles de l’API existante de brouillons ; `programDrafts.js` et `cacheMigration.js` l’utilisent. |
| API | `backend/routes/cacheMigration.js`, montée dans `backend/app.js` à `/api/cache-migration`. Auth Firebase/révocation et marqueur transactionnel existants réutilisés. |
| Brouillon importé | Même collection `programDrafts/<uid>/entries/<cible>` et même format principal que QUATER. Aucun programme canonique écrit par la migration. |
| ProgramBuilder | `useProgramDraft` peut relire le brouillon après l’événement de récupération, uniquement si le formulaire n’est pas modifié et sans envoi en cours. La restauration reste explicite. |
| Mesures | Labels opt-in dans `firestoreMetrics.js` et compteur d’écritures des commits de migration ; ni contenu, ni jeton dans la télémétrie. |

## Détection et version

Après admission, le service énumère les noms des bases IndexedDB et les clés privées reconnues, sans ouvrir les bases ni lire leurs valeurs. Cache Storage et Service Workers sont recensés par leurs métadonnées ; seuls des indicateurs sont affichés. Un échec d’énumération ne vaut pas preuve d’absence.

Le protocole `byl-private-cache-v1` est contrôlé par l’API. L’identité de build utilise `VITE_BUILD_ID`, avec valeur de développement `septies-memory-cache-v1`. Les versions coopérantes échangent build et identifiant aléatoire d’onglet via BroadcastChannel ; pas d’UID, de clé de stockage ou de contenu métier. Un onglet silencieux n’est jamais déclaré fermé par expiration d’un timer.

La détection n’ajoute aucune lecture Firestore. Elle est relancée à l’admission et au retour visible/pageshow, sans polling. Une recherche de brouillons serveur exige un clic. Une navigation sur une autre page ne déclenche pas automatiquement cette recherche.

## Récupération

La collection serveur `cacheMigrationProvenance/<uid>/entries` doit contenir une preuve préalablement qualifiée : propriétaire, protocole, expiration, périmètre, cible, version canonique, descripteur de source et empreinte canonique SHA-256 du contenu. Aucun endpoint client ne crée ces preuves. Les règles existantes refusent l’accès SDK direct à ces nouvelles collections.

`discover` examine au plus 21 preuves, autorise au plus 20 propositions et ne retourne que leurs identifiants. Les droits de chaque cible sont vérifiés. La limite est signalée par l’API ; pagination de grands inventaires non implémentée dans ce lot.

Après confirmation explicite, `authorize` recontrôle la preuve et les droits. Le seul adaptateur pris en charge est `program-builder-fields-v1` : champs JSON historiques dans sessionStorage, préfixe de formulaire ProgramBuilder et liste de champs bornée. Le nom du programme et la liste des séances sont obligatoires. Le contenu est vérifié contre l’empreinte serveur ; une clé UID ne remplace jamais la preuve.

`import` recontrôle tout dans une transaction, refuse un canonique modifié et refuse d’écraser un brouillon courant. Il crée le brouillon et `cacheMigrationReceipts/<uid>/entries/<preuve>` atomiquement. Un retry vérifie le brouillon existant et retourne le même reçu. `receipt` relit le brouillon et confirme son empreinte. Aucune publication automatique ; un ancien brouillon ambigu, global `workoutProgram`, ou une mutation Firestore interne n’est pas automatiquement converti.

## Nettoyage contrôlé

Deux verrous indépendants :

- Frontend : `DEV`, `VITE_CACHE_MIGRATION_CLEANUP=true`, origine loopback et projet Firebase `demo-*`.
- Backend : `BYL_CACHE_MIGRATION_CLEANUP=true`, projet `demo-*`, Auth et Firestore émulés sur loopback.

Sans ces conditions, la suppression est refusée. Le build de production n’active pas le mécanisme par simple variable d’environnement. Ces restrictions sont intentionnelles pour cette intégration contrôlée.

Un plan `cacheMigrationPlans/<uid>/entries/<id>` doit être qualifié côté serveur, lié au périmètre courant et à l’origine exacte, avec cibles explicites et reçus nécessaires. Aucun endpoint ne permet à l’utilisateur de qualifier un plan. La confirmation humaine et les vérifications serveur précèdent toute suppression. Les préférences publiques ne sont pas des cibles admissibles.

Seules les bases Firestore du projet courant, `byl-dashboard-snapshots` et les clés privées explicitement reconnues sont implémentées. Cache Storage ou Service Workers présents bloquent les étapes destructives : leur suppression n’est pas intégrée faute de catalogue historique qualifié. Ce refus est préférable à un effacement général de l’origine.

Web Locks sérialise les versions coopérantes. Les autres onglets connus bloquent l’opération. Une connexion silencieuse qui empêche IndexedDB de se fermer produit `blocked`. La requête de suppression peut réussir plus tard : ce n’est pas une annulation. La reprise recontrôle les droits après les opérations asynchrones, vérifie l’absence physique des cibles et conserve un état **`local-verified-incomplete`**, jamais un succès global.

## Journal et recontamination

Journal local technique : protocole, statut, douze étapes au maximum ; aucun UID, identifiant de plan, clé, contenu ou jeton. Journal serveur protégé : `cacheMigrationOperations/<uid>/entries/<plan>`, vingt étapes maximum et date de mise à jour. Le journal n’accorde aucun droit et ne remplace pas l’examen de l’état réel.

Après recontamination, l’ancien plan est bloqué côté service et côté serveur ; il faut une nouvelle qualification. Ni l’interface ni une valeur locale « terminé » ne permettent de déclarer le navigateur globalement nettoyé. Une preuve d’absence de tous les anciens contextes n’est pas disponible dans un navigateur standard.
