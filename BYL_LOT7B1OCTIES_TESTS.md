# Lot 7B.1 OCTIES — tests

## Reproduction

```sh
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runIntegratedMigrationLot7B1Octies.cjs
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runIntegratedMigrationLot7B1Octies.cjs api
node scripts/testResilientLazyLot7B1Octies.mjs
node scripts/testPrivateSessionLot7B1Octies.mjs
node scripts/testConfirmedProgramWrites.mjs
npm run test:smoke
npm run build
git diff --check
```

Le runner reprend l’intégration SEPTIES : copie temporaire de la branche et des modifications locales nécessaires, aucun `.env`, émulateurs Auth/Firestore demo, Chrome headless avec profil jetable. Il charge `src/main.jsx`, App, AuthProvider, routes et ProgramBuilder réels. Les APIs sans rapport avec le lot sont simulées ; la messagerie simulée attend 24 secondes. Les flags de nettoyage sont activés uniquement dans ce banc. Les bases synthétiques ne sont pas celles d’un utilisateur.

## Couverture intégrée

- P0-4 initial : A puis B lisent le programme et la nutrition via les anciens lecteurs ; une mutation Firestore réellement pending est créée sans envoi serveur.
- Module différé inaccessible : statut local, Builder admis toujours présent ; pas de remplacement par AppErrorBoundary. Le test ne dépend plus de l’attente artificielle de 2,5 secondes avant la coupure.
- Profil Firestore bloqué à l’initialisation : vérification de session, aucun Builder ; réadmission en ligne.
- Connexion ralentie (120 ms de latence, 500 kB/s descendant, 200 kB/s montant), navigation et retour au Builder.
- Coupure de lecture pendant la restauration : erreur contrôlée, proposition au retour réseau, restauration explicite.
- Édition offline après admission, avertissement de fermeture, synchronisation, conflits de brouillons et canonique, publication manuelle.
- Compte A puis B, deux onglets, redémarrage Chrome, retrait de rôle/Club/profil, réponse tardive : isolation des lecteurs courants et refus serveur.
- Ancien onglet silencieux et IDB bloquante, fermeture tardive, interruption entre étapes, reprise après redémarrage, recontamination côté client et serveur.
- Cache Storage inconnu et Service Worker synthétique : refus de nettoyage. Le banc retire ensuite ses propres fixtures ; l’application ne purge pas les zones inconnues.
- Préférences protégées, preuve forgée refusée, confirmation obligatoire, reçu idempotent, aucun import sur clé UID seule.
- Sentinelles programmes/nutrition/messages/historique/Club/géo/reprise/brouillons via l’adaptateur réel : stockage natif inchangé. Nouveau contenu Builder absent des bases historiques inspectées. Ce contrôle partagé ne remplace pas huit scénarios complets d’interface.
- La base historique Firestore reste inspectable ; nutrition ciblée absente après nettoyage qualifié. La mutation non synchronisée est volontairement conservée.

## Tests ciblés

Le test resilientLazy vérifie la stabilité d’identité pendant Suspense, la dégradation pour import réseau et la propagation des erreurs de rendu. Le test privateSession utilise le vrai apiFetch avec transport synthétique : no-store prévaut sur force-cache, réponse tardive après changement de compte rejetée, anciennes données conservées et snapshots en quarantaine.

Les 53 smoke globaux et les tests d’écritures confirmées couvrent les invariants existants ; ils ne constituent pas une reprise exhaustive de tous les benchmarks des Lots 1 à 6.

## Échecs observés pendant mise au point

1. Avant correction, l’import bloqué déclenche AppErrorBoundary, puis la coupure précoce échoue également. Preuve réduite dans `audits/lot7b1octies/reproduction.txt`.
2. Première frontière locale : identité lazy recréée avant montage, attente Suspense sans fin. Correction : identité initiale stable, test dédié.
3. Banc enrichi : assertion ancienne refusant le nouveau champ `current:false` du diagnostic disque. Mise à jour de la forme attendue, sans modification fonctionnelle.
4. Rétablissement du rôle : navigation du driver pendant la réinitialisation de session, aboutissant au Dashboard. Le banc attend maintenant le rôle réellement admis avant de naviguer ; aucun délai arbitraire ni assouplissement d’autorisation ajouté à l’application.
5. Essai du test unitaire utilisant esbuild absent : remplacé par la transformation OXC du Vite installé, sans nouvelle dépendance.

Les refus 403/409, le réseau interrompu et IndexedDB blocked sont des résultats attendus, pas des succès de récupération.

## Limites explicites

Pas de preuve exhaustive des navigateurs mobiles, Firefox/Safari, rendu initial sans aucun JavaScript disponible, crash OS, effacement forensique, médias privés distants ou anciens Service Workers de toutes les versions. La reconnexion de plusieurs onglets est couverte par les transitions intégrées ; toutes les combinaisons de coupure simultanée sur plusieurs appareils ne sont pas rejouées. Aucune mesure réelle de facturation.

Les résultats finaux et leurs durées sont dans `audits/lot7b1octies/results.json` ; la synthèse des sorties est dans `audits/lot7b1octies/validation.json`.
