# Lot 7B.1 SEPTIES — tests intégrés

## Environnement et reproductibilité

```sh
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runIntegratedMigrationLot7B1Septies.cjs
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runIntegratedMigrationLot7B1Septies.cjs api
node scripts/testPrivateSessionLot7B1Quater.mjs
node scripts/testConfirmedProgramWrites.mjs
npm run test:smoke
npm run build
git diff --check
```

Le runner crée une copie temporaire, sans `.env`, superpose les fichiers de travail nécessaires et démarre les seuls émulateurs Auth/Firestore du projet `demo-byl-performance`. Chrome utilise un profil jetable. Aucune donnée réelle, aucun cache d’un profil utilisateur et aucune règle de production ne sont traités.

Le test charge **`src/main.jsx`, `App`, le routeur réel, AuthProvider, ProgramBuilderPage et ProgramBuilder**. Il ne reconstruit pas leur comportement dans un prototype. La configuration Firebase est remplacée uniquement dans la copie temporaire par les endpoints émulés ; le service de migration, son interface et les routes backend sont ceux de l’application.

Les APIs sans rapport avec la migration sont simulées avec des réponses vides. L’inbox simulée respecte une attente de 24 secondes pour ne pas introduire artificiellement une boucle de rafraîchissement rapide. Les métriques de ces routes simulées ne sont pas utilisées pour conclure à leur consommation réelle.

## Résultats finaux

| Suite | Résultat |
|---|---|
| Application complète dans Chrome / émulateurs | **41 contrôles réussis**, code de sortie 0 |
| API/règles de brouillons après extraction du contrôle partagé | **18 contrôles réussis** |
| Smoke global | **53 contrôles réussis** |
| Isolation de session et réponse HTTP tardive réelle via apiFetch | Réussite |
| Écritures confirmées des programmes | Réussite |
| Build et budgets | Réussite |
| Syntaxe et diff whitespace | Réussite |

Preuves détaillées : `audits/lot7b1septies/results.json`, `qualification.json`. Les mesures sont celles du passage final, pas les essais de mise au point.

## Scénarios de migration et P0-4

| Scénario | Observation finale |
|---|---|
| Détection dans App après identité confirmée | Anciennes zones signalées, pas de lecture de leur contenu |
| Nettoyage par défaut | API refuse avec flag absent ; frontend production ne peut pas activer la suppression |
| Fausse provenance SDK | Firestore refuse l’écriture depuis le navigateur |
| Protocole ancien / provenance absente | Refus, aucun import |
| Récupération sans confirmation | Refus avant lecture des champs |
| Proposition et confirmation dans l’interface réelle | Import vers brouillon serveur et reçu vérifié ; canonique intact |
| Retry | Même reçu, pas de seconde création |
| Retour dans ProgramBuilder sur la cible récupérée | Brouillon proposé ; restauration reste une action distincte |
| A puis B, déconnexion et deux onglets | Interface et cache SDK courant isolés ; appels serveur d’un autre périmètre refusés |
| Rôle, Club, profil désactivé | Programme retiré / accès refusé, frontière d’identité réinitialisée |
| Preuve révoquée / ancien périmètre coach | Nouvelle autorisation refusée |
| Mutation Firestore offline héritée | Mutation réellement créée en persistance ; aucun envoi serveur automatique, base laissée hors du plan de suppression |
| Nutrition et programme historiques, accès brut | Fuite initiale reproduite ; accès applicatif courant en quarantaine |
| Plan non qualifié | Suppression refusée, nutrition conservée |
| Préférences publiques proposées comme cibles | Plan rejeté côté service, préférence conservée |
| Cache Storage inconnu | Arrêt avant suppression ; le cache synthétique est retiré ensuite par le fixture, pas par l’application |
| Deux versions actuelles | Présence de l’autre onglet détectée, suppression refusée |
| Ancien onglet silencieux | Blocage réel IndexedDB ; aucune annonce de fin globale |
| Fermeture tardive | Suppression en attente peut aboutir ; état reste bloqué/incomplet tant que les contrôles ne sont pas repris |
| Échec entre IDB et stockage secondaire | État interrompu, clé secondaire conservée |
| Redémarrage Chrome et reprise | Zones du plan absentes après vérification, statut local incomplet |
| Recontamination | Donnée recréée conservée ; ancien plan refusé côté service **et** API |
| Autre page réelle `/about` | Aucun polling HTTP de migration ajouté par la navigation |

Le plan de test cible nutrition et des clés secondaires. La base Firestore contenant la mutation offline reste volontairement présente. Le contre-test brut du programme historique reste donc positif : **P0-4 n’est pas clôturé**. L’absence constatée pour les zones nettoyées ne prouve pas un effacement physique des fichiers, exports, backups ou caches HTTP.

## Préservation de ProgramBuilder

Les contrôles couvrent création, modification d’un programme existant, autosauvegarde en brouillon, coupure réseau après chargement des modules, avertissement de fermeture, reconnexion, conflit concurrent, conflit canonique, restauration explicite et publication manuelle avec achèvement du brouillon. L’autosauvegarde de migration ne publie pas le programme et ne remplace pas un brouillon déjà présent.

## Échecs et limites observés

- Un essai de coupure réseau **très précoce après rechargement** a affiché l’écran AppErrorBoundary du shell complet en développement. La cause exacte n’est pas qualifiée. Le scénario final attend 2,5 secondes après la première sauvegarde pour stabiliser les modules avant de couper le réseau. Il réussit dans cette condition ; cela ne valide pas tous les timings de démarrage hors ligne. Aucun correctif hors périmètre n’a été ajouté pour masquer ce cas.
- Des essais ont été interrompus par les destructions normales de contexte Chrome au logout/révocation. Le driver attend maintenant la fin de la transition et navigue dans un contexte stabilisé ; les barrières de sécurité de l’application n’ont pas été relâchées.
- Une réponse inbox simulée initialement instantanée créait du trafic artificiel dans le banc ; le fixture respecte maintenant l’attente. Aucun code métier de messagerie modifié et aucune mesure de cet essai utilisée dans le bilan final.
- Échecs attendus : 403 d’autorisation, 409 de conflit/requalification, erreur réseau injectée avant stockage secondaire, IndexedDB `blocked`. Le succès des tests signifie que le refus/interruption attendu a été observé.

Pas de qualification exhaustive de toutes les versions historiques, appareils mobiles, Firefox/Safari, crash OS, corruption disque, bfcache, Service Workers historiques, ni récupération des mutations internes Firestore. Le changement de compte sur deux onglets est réel ; ce n’est pas une preuve qu’une page web peut identifier tous les anciens contextes silencieux.
