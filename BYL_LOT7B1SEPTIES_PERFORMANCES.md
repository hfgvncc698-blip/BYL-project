# Lot 7B.1 SEPTIES — performances

## Méthode et comparaison

Application complète en développement Vite, Firebase émulé, Chrome jetable, petites fixtures synthétiques. Un passage final de 41 contrôles. Les durées comprennent les attentes du driver et les vérifications ; ce ne sont ni des percentiles ni des garanties de production.

Le lot QUATER utilisait une composition AuthProvider/Builder avec MemoryRouter ; SEPTIES charge `main.jsx`, App, son routeur, la banque d’exercices et le shell. Les temps ne sont donc pas un benchmark causal avant/après comparable. Aucun gain global des Lots 1–6 n’est revendiqué. Le démarrage froid de tout BYL et la connexion seule ne sont pas isolés : la première mesure ci-dessous combine réauthentification/admission et disponibilité du Builder dans une fixture déjà amorcée.

| Scénario final | Durée |
|---|---:|
| Admission/connexion et ouverture Builder dans fixture déjà démarrée | 219.4 ms |
| Détection explicite des zones héritées | 13.5 ms |
| Découverte et affichage de proposition | 105.4 ms |
| Confirmation, import et vérification du reçu | 158.0 ms |
| Retry idempotent | 24.6 ms |
| Ouverture de la cible récupérée dans ProgramBuilder | 286.3 ms |
| Autosauvegarde normale (temporisation incluse) | 1083.0 ms |
| Reconnexion et synchronisation normale | 127.9 ms |
| Suppression bloquée par ancien onglet | 104.2 ms |
| Reprise des zones qualifiées après redémarrage | 156.1 ms |
| Vérification de recontamination et refus | 81.0 ms |

La détection se fait hors chemin bloquant du rendu : la notice est chargée séparément en Suspense. Elle énumère des métadonnées locales et ne lance aucun appel Firestore. Pas de polling ; retour visible et pageshow déclenchent seulement une nouvelle détection locale. La recherche de provenance nécessite un clic.

## Coût des endpoints de migration

| Action | HTTP instrumentés | Opérations SDK de lecture | Documents retournés |
|---|---:|---:|---:|
| authorize | 4 | 16 | 7 |
| checkpoint | 9 | 99 | 71 |
| cleanup-plan | 12 | 98 | 67 |
| discover | 2 | 6 | 3 |
| import | 2 | 14 | 8 |
| receipt | 2 | 14 | 10 |
| Total | 31 | 247 | 166 |

Estimation documentaire : **247 lectures**, incluant les documents absents et les contrôles transactionnels, selon l’instrumentation existante. **Facturation réelle non mesurée** (`actualBilledReads: null`). Une opération SDK n’est pas un document retourné ni une ligne de facture.

Écritures de commits réussis mesurées par l’API : **11**, soit 1 brouillon + 1 reçu d’import et 9 checkpoints de journal. Le retry d’import ne crée pas une seconde écriture de brouillon/reçu. Ce total comprend les scénarios de blocage, interruption et recontamination du test ; il n’est pas le coût d’une récupération utilisateur simple.

Les preuves/plans de fixture, leur préparation, les injections de changement de rôle/Club, les sondes du runner, les écritures normales ProgramBuilder et les routes simulées sont hors de ce sous-total. Les métriques `program-draft-*` restent séparées dans le JSON brut. Aucun brouillon ou journal de migration n’est écrit pendant la détection initiale normale.

Le service de migration n’effectue pas d’opération documentaire SDK dans le navigateur : ses lectures/écritures Firestore passent par l’API instrumentée. L’ensemble des lectures SDK navigateur du shell, des autres pages et de ProgramBuilder n’a pas été recompté intégralement dans ce lot. La notification de récupération peut provoquer une relecture du brouillon affiché, sous contrôle du hook existant.

## Mémoire et réseau

- Heap JS final : 61,444,184 octets utilisés, 72,564,736 alloués.
- Mémoire embedder : 7,076,880 ; backing storage : 57,482,962 octets.
- Trafic CDP total : 58,320,337 octets, incluant modules Vite, baseline historique, banque d’exercices, nombreuses navigations et rechargements. Ce n’est pas le trafic de production imputable à la migration.

Captures ponctuelles après navigation sur About ; ni pic mémoire ni différence avant/après. Les métriques ne contiennent pas de contenu privé.

## Autres pages et limites

La navigation réelle vers `/about` n’ajoute aucun HTTP de migration. Les 53 smoke checks et les budgets du build passent. Cela ne démontre pas une absence d’impact chiffrée sur tous les Dashboards/Clients/calendriers à grands volumes.

La découverte est bornée à 20 propositions (21 documents pour détecter la troncature) ; chaque cible ajoute ses contrôles d’accès. Aucun scan permanent, listener Firestore ou tâche planifiée ajouté. Les grands inventaires, la rétention des reçus et les pages à forte volumétrie restent à qualifier. La coupure réseau très précoce décrite dans TESTS reste une limite distincte du parcours stabilisé mesuré ici.
