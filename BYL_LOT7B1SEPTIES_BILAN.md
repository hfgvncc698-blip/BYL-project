# Lot 7B.1 SEPTIES — bilan

Branche `codex/firebase-performance-audit`, 10 novembre 2026. Aucun déploiement, aucune donnée réelle, aucune purge de profil utilisateur.

## Réellement intégré

Un service central de migration est maintenant appelé par **BYL**, après admission dans AuthContext. Il détecte les anciennes zones sans lire leur contenu, présente les messages de récupération, utilise la barrière d’identité existante et coordonne les versions coopérantes par BroadcastChannel.

L’API réelle montée dans le backend réutilise les autorisations de ProgramBuilder. Une preuve serveur qualifiée permet, après confirmation explicite, d’importer les champs historiques supportés vers le brouillon serveur existant, avec version canonique, transaction, reçu idempotent et vérification du contenu. Aucun programme n’est publié par cette opération ; un brouillon courant n’est pas écrasé.

Le nettoyage contrôlé est implémenté mais **désactivé par défaut**, et limité techniquement aux émulateurs demo/loopback en développement. Il exige un plan serveur qualifié, des reçus cohérents et une confirmation. Journal, blocage IndexedDB, interruption, reprise et vérification des zones sont intégrés. La recontamination verrouille l’ancien plan côté navigateur et serveur.

## Résultats

- **41 contrôles réussis dans l’application complète**, avec `main.jsx`, App, routeur, AuthProvider et ProgramBuilder réels, Firebase émulé et profil Chrome jetable.
- **18 contrôles API/règles** de non-régression des brouillons.
- **53 contrôles smoke**, tests de réponse tardive/session, écritures confirmées et build avec budgets respectés.
- Refus de provenance forgée par SDK, preuve absente/révoquée, rôle ou Club modifié et plan non qualifié.
- Nettoyage synthétique ciblé repris après interruption et fermeture de Chrome, sans supprimer la base contenant la mutation Firestore non synchronisée.

Une limite reste observée : une coupure réseau très précoce après rechargement a déclenché AppErrorBoundary dans le shell complet en développement. Le test final hors ligne passe après stabilisation des modules, sans prétendre couvrir ce timing précoce. Les autres échecs de mise au point et les refus attendus sont distingués dans TESTS.

## Expérimental et risques résiduels

**P0-4 reste ouvert et la production reste bloquée.** L’API et les lecteurs courants isolent A/B dans les scénarios testés ; l’inspection brute retrouve encore les données de la base Firestore historique volontairement non purgée. L’état final du service est toujours incomplet, même si les zones d’un plan sont absentes.

La majorité des anciens brouillons n’a pas de provenance démontrable et reste refusée. Aucun convertisseur des mutations internes Firestore ni suppression générique Cache Storage/Service Workers n’est intégré. Ces zones inconnues bloquent l’opération. Une page web ne prouve pas l’absence de tous les anciens onglets silencieux, workers ou contextes restaurés.

La création/qualification des preuves et des plans n’a pas d’interface de production ni d’endpoint client. Seules les fixtures les préparent dans ce lot. La rétention, les grands inventaires, les navigateurs/appareils réels et le protocole opérationnel de fermeture restent à décider. Aucun effacement forensique ni récupération générale sans perte n’est garanti.

## Fonctionnalités préservées

Connexion Firebase habituelle, absence de deuxième mot de passe, cache privé mémoire, brouillons serveur, modifications temporaires hors ligne après chargement, reprise réseau, conflits, restauration et publication manuelle ProgramBuilder. Les contrôles d’accès antérieurs sont partagés, pas supprimés. Aucune modification des règles de production ou des correctifs P0-1/P0-2. Aucun P1/P2/P3 entrepris.

Le journal technique ne contient ni UID, ni clé de stockage, ni contenu privé. La détection ne lance aucune requête Firestore. Les 31 HTTP de migration du scénario final représentent 247 opérations SDK documentaires, 166 documents retournés, 247 lectures estimées et 11 écritures de commits ; ce sont des mesures de fixture incluant tests négatifs et reprises, pas une facture ni un coût par connexion.

## Fichiers et livrables

Nouveaux fichiers applicatifs : `src/utils/cacheMigration.js`, `src/components/privacy/CacheMigrationNotice.jsx`, `backend/routes/cacheMigration.js`, `backend/utils/programDraftAccess.js`.

Intégrations : `src/AuthContext.jsx`, `src/hooks/useProgramDraft.js`, `backend/routes/programDrafts.js`, `backend/app.js`, `backend/utils/firestoreMetrics.js`. Le launcher QUATER est adapté pour inclure les nouvelles dépendances ; un launcher et un fixture SEPTIES chargent l’application complète sans reconstruire ses composants. Liste/empreintes dans `audits/lot7b1septies/qualification.json`.

- [Intégration](BYL_LOT7B1SEPTIES_INTEGRATION.md)
- [Sécurité](BYL_LOT7B1SEPTIES_SECURITE.md)
- [Tests réussis, échecs et limites](BYL_LOT7B1SEPTIES_TESTS.md)
- [Performances](BYL_LOT7B1SEPTIES_PERFORMANCES.md)
- [Décisions avant déploiement](BYL_LOT7B1SEPTIES_DEPLOIEMENT.md)

## Arrêt

Attendre validation explicite de ce lot. Avant tout déploiement : qualifier les preuves réelles, la disposition de chaque donnée unique, les anciennes versions et stockages, les reçus/rétentions, le démarrage hors ligne et les risques antérieurs. Aucune migration réelle, activation de production ou suite de lot engagée.
