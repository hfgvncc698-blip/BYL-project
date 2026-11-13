# Lot 7B.1 OCTIES — bilan

10 novembre 2026 — branche `codex/firebase-performance-audit`.

**Stabilisation intégrée et qualification locale terminées. Production toujours bloquée ; P0-4 reste ouvert.** Aucun déploiement, aucune donnée réelle, aucune purge utilisateur ni migration irréversible. Les corrections antérieures sont conservées.

## Problèmes corrigés

1. Un rejet réseau d’import différé pouvait retirer toute l’application via AppErrorBoundary. Le blocage réel de GuidedTutorial reproduit ce défaut. Une frontière locale conserve désormais le formulaire frère et propose une nouvelle tentative, sans rechargement forcé ni assouplissement d’admission. La trace historique SEPTIES ne permet pas d’identifier avec certitude son module exact.
2. Le client API générique n’imposait pas de politique de cache HTTP aux réponses authentifiées. Il force désormais `no-store`, même si l’appelant demande `force-cache`. Cela ne purge aucune ancienne réponse et ne couvre pas les médias directs.

## Intégration et fichiers

Code applicatif modifié dans ce lot :

- `src/App.jsx` : chargement différé avec frontière locale.
- `src/AuthContext.jsx` : même protection pour la notice de migration, admission inchangée.
- `src/utils/resilientLazy.jsx` : nouveau composant commun de dégradation/réessai réseau.
- `src/utils/api.js` : no-store sur transport authentifié, barrière de génération conservée.

Bancs ajoutés : `scripts/runIntegratedMigrationLot7B1Octies.cjs`, `scripts/testIntegratedMigrationLot7B1Octies.cjs`, `scripts/fixtures/lot7b1octies/application.jsx`, `scripts/testResilientLazyLot7B1Octies.mjs`, `scripts/testPrivateSessionLot7B1Octies.mjs`. Ils prolongent le banc intégré SEPTIES, chargent la vraie application et ne constituent pas un prototype métier.

Les runners QUATER et SEPTIES incluent désormais aussi le nouveau fichier commun dans leur copie temporaire, pour conserver leur reproductibilité.

Les autres modifications déjà présentes dans l’arbre de travail appartiennent aux lots antérieurs. Aucun code backend, règle, prix ou calendrier modifié dans OCTIES. Empreintes dans `audits/lot7b1octies/changes.json`.

## Résultats

| Vérification finale | Résultat |
|---|---|
| BYL réel, Chrome jetable, Auth/Firestore émulés | **48 contrôles réussis** |
| API brouillons et règles réelles sur émulateurs | **18 contrôles réussis** |
| Smoke global | **53 contrôles réussis** |
| Frontière de modules, génération de session et HTTP no-store | Réussite |
| Écritures confirmées de programmes | Réussite |
| Build et budgets de performance | Réussite |
| Diff whitespace | Réussite |

Les échecs de mise au point et les limites non qualifiées sont explicités dans TESTS. Les refus d’autorisation, conflits et nettoyages bloqués attendus sont vérifiés comme tels. Aucun scénario final ne démontre un effacement global de l’appareil.

Les scénarios communs restent du même ordre de grandeur : autosauvegarde 967 ms incluant 900 ms de debounce, synchronisation au retour réseau 127 ms, import et reçu 161 ms. Relevés uniques locaux, pas de SLA. La matrice enrichie consomme 33 appels HTTP de migration, 269 opérations SDK documentaires, 182 documents retournés, 269 lectures estimées et 12 écritures confirmées de migration. L’augmentation brute par rapport à SEPTIES correspond à des contrôles supplémentaires ; aucune facturation réelle mesurée.

## Fonctionnalités préservées

Admission confirmée par serveur ; isolation A/B ; changement de rôle/Club et révocation ; brouillons serveur automatiques ; travail temporaire hors ligne dans l’onglet ; conflits et restauration explicite ; publication manuelle ; avertissement de travail non synchronisé ; récupération conditionnelle sur preuve serveur ; reçu idempotent ; coordination et nettoyage ciblé désactivé par défaut. Aucun deuxième mot de passe.

## Garanties et problèmes ouverts

- La nouvelle session n’utilise pas les lecteurs privés persistants hérités dans les parcours testés. Les réponses HTTP tardives sont rejetées. Le profil indisponible n’est pas admis depuis le cache.
- Les nouveaux marqueurs métier testés ne sont pas écrits dans les zones persistantes inspectées. Cela n’est pas une certification exhaustive de tous les médias, fetch directs et SDK tiers.
- Les anciennes copies Firestore restent directement inspectables et peuvent contenir des mutations uniques : **P0-4 ouvert**. Aucun nettoyage automatique de ces données.
- Firebase Auth conserve une persistance de session distincte du cache métier. Sa confidentialité sur appareil partagé reste à qualifier, comme les médias privés et les couches HTTP réelles.
- Un ancien contexte silencieux peut recréer une base ; BroadcastChannel et Web Locks ne permettent pas d’en prouver l’absence générale. Worker inconnu ou IDB bloquante : nettoyage refusé/incomplet.
- Une récupération générale des brouillons historiques sans provenance fiable reste impossible. Aucun rollback d’effacement physique, copie exportée ou sauvegarde OS promis.
- Démarrage sans JavaScript disponible, navigateurs non Chrome, certains échecs d’import mémorisés par le moteur et timings réseau non couverts restent des limites explicites.

## Livrables complémentaires

- [Stabilité](BYL_LOT7B1OCTIES_STABILITE.md)
- [Sécurité et inventaire actuel](BYL_LOT7B1OCTIES_SECURITE.md)
- [Transition et procédure opérationnelle](BYL_LOT7B1OCTIES_MIGRATION.md)
- [Tests, échecs et limites](BYL_LOT7B1OCTIES_TESTS.md)
- [Performances et portée des mesures](BYL_LOT7B1OCTIES_PERFORMANCES.md)
- [Décision et conditions avant déploiement](BYL_LOT7B1OCTIES_DECISION.md)

Arrêt au terme du Lot OCTIES. Attendre validation explicite avant toute suite, purge, migration réelle ou publication.
