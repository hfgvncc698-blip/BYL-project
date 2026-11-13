# Lot 8A — tests et reproduction

## Banc intégré

```sh
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runColdLot8A.cjs before
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runColdLot8A.cjs after
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runColdLot8A.cjs before messages
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runColdLot8A.cjs after messages
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runColdLot8A.cjs before calendar
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runColdLot8A.cjs after calendar
```

Les sources applicatives d’avant correction sont conservées pour les fichiers ciblés dans `audits/lot8a/baseline/`. Le runner superpose les fichiers de travail nécessaires à une copie temporaire, sans `.env`. Chaque exécution possède ses émulateurs et profils Chrome jetables. Le groupe principal couvre Coach 12/100/500, Clients 100/500, Client 5/20 programmes × historique total 100/1 000, Club 100/500. Le groupe Messages couvre 100/1 000 ; le groupe calendrier observe Coach, Client et route Club calendrier.

Les fixtures sont préparées avant l’ouverture des navigateurs afin d’éviter un défaut observé de l’émulateur qui tentait de notifier un stream fermé lors du seed suivant. Le profil froid est recréé et le cache HTTP désactivé par scénario. La largeur finale est fixée explicitement à 1440 px ; le test de redimensionnement descend ensuite à 500 px. L’identité et les droits restent confirmés par l’application réelle.

## Tests ciblés et régressions

```sh
node scripts/testClientVisibleMetricsLot8A.mjs
node scripts/testNotificationBurstLot8A.cjs
node scripts/testPrivateSessionLot7B1Octies.mjs
node scripts/testResilientLazyLot7B1Octies.mjs
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runRegressionsLot8A.cjs coach
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runRegressionsLot8A.cjs progress
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runRegressionsLot8A.cjs calendar
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runRegressionsLot8A.cjs p01
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runRegressionsLot8A.cjs p02
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runRegressionsLot8A.cjs messaging
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runIntegratedMigrationLot7B1Octies.cjs
node scripts/testPaidProgramDelivery.cjs
node scripts/testNutritionLoading.mjs
node scripts/testConfirmedProgramWrites.mjs
node scripts/testClubMessaging.cjs
node scripts/testClientMobileCalendar.mjs
npm run test:smoke
npm run build
git diff --check
```

- Sélection des métriques : première page, page suivante, recherche hors première page, intersection avec les identifiants autorisés, filtres exhaustifs, liste vide.
- Callback de notification **réel** avant/après : 1 000 → 1 toast, replay sans doublon, version suivante notifiée, lots 0/3 inchangés.
- Navigateur : page suivante Clients, retour puis reprise sans nouvelles écritures de résumé, recherche ; affichage de davantage de conversations, recherche et sélection ; navigation mobile après resize.
- Régressions Coach : résumés, cache conditionnel, anciennes propriétés, programmes multiples, validation/suppression, rôle/Club, transfert, nutrition, révocation.
- Régressions calendriers : périodes, récurrences, règles et opérations concurrentes du banc Lot 6.
- Contre-tests P0-1/P0-2 via les scénarios profile/session du Lot 7B.1.
- Rejeu intégré Lot 7 : 48 contrôles, dont A/B, deux onglets, rôle/Club, révocation, brouillons, conflits et publication, anciens stockages et nettoyage synthétique. Ce rejeu ne clôt pas P0-4.
- Paiements simulés : livraison concurrente/idempotente et conservation du programme modifié ; aucun paiement ni réseau externe.

## Échecs de qualification conservés

- Les anciens bancs Lots 4–6 remplaçaient AuthContext et utilisaient la persistance SDK. Ils n’ont pas servi comme preuve d’admission actuelle.
- Erreurs initiales de syntaxe/import de la sonde, réglage implicite de largeur Chrome et attente de fermeture des écouteurs avant `db.terminate` : corrigés dans le banc, sans changement des règles.
- Le test historique de progression n’avait pas de profil utilisateur Firestore : refus avec les règles actuelles. La fixture reçoit désormais un profil particulier légitime ; aucune règle affaiblie. Un premier correctif de fixture ajoutait aussi un linkedClientId, maintenant supprimé : cette permission indépendante rendait à tort le test de révocation authUid incohérent. La fixture finale conserve seulement le profil rôle et l’association canonique authUid qu’elle teste. Sa branche Coach/Club reçoit aussi un document d’appartenance actif : un simple clubId de profil ne suffit plus depuis les protections Lot 7. Le journal du rejeu final est `delivered-progress-membership.log`.
- Le test VM de paiement omettait le validateur de taille ajouté depuis sa création : il injecte maintenant le vrai `assertProgramSize`, sans stub qui accepte tout.
- L’affichage de 50 contacts seul n’a pas résolu le gel de la référence à 1 000 non lus. L’inspection du callback a démontré la rafale de toasts ; leur regroupement est testé séparément et dans l’application.
- Dépassements de délai et sondes de mémoire indisponibles sur le renderer saturé ne sont pas transformés en temps de chargement réussis.

Les journaux initiaux `suites.json` et les résultats finaux `final-suites.json` sont distincts. Le succès d’un runner de mesure peut inclure une ligne marquée `failure` : il signifie que la collecte s’est terminée, pas que toutes les cibles de performance sont atteintes.

Les suites ne certifient pas tous les navigateurs, tous les scénarios mobiles, une charge de production, ni toutes les tâches secondaires des écrans. Les limites restantes sont détaillées dans RISQUES et AVANT_APRES.

## Qualification finale et portée

Les journaux `delivered-before-main.log` et `delivered-after-main.log` remplacent les tentatives principales ayant échoué sur la fermeture des écouteurs ou des sélecteurs de test. Les groupes Messages et calendriers utilisent les journaux `final-*-messages.log` et `final-*-calendar.log`. Les échecs précédents restent conservés ; ils ne sont pas effacés des fichiers `suites.json` / `final-suites.json`.

Le profil froid baseline à 1 000 conversations atteint un premier contenu mais ne se stabilise pas dans la fenêtre de 30 secondes. Après correction, les deux volumes Messages se stabilisent et les contrôles d’affichage supplémentaire, recherche et sélection passent. Les 16 cellules sont des observations locales uniques, sans prétention de percentile.

Les suites séparées Coach, calendrier, messagerie et P0-1/P0-2 ont une sortie 0. Le rejeu intégré OCTIES a 48 contrôles réussis ; le smoke en a 53. Build et budgets réussis. Les tests unitaires de sélection visible, rafale de notifications, identité, import différé, nutrition, livraison de paiement simulée et écritures confirmées passent. Les logs sont conservés dans `audits/lot8a/`.

Les erreurs SDK du Dashboard Client et les 404 secondaires visibles dans les métriques ne sont pas ignorés : cette qualification ne prouve pas un chargement exhaustif réussi de tous les services secondaires. La matrice mobile complète, les percentiles à chaud et le réseau lent restent à qualifier avant publication. Le redimensionnement réel du shell et le calendrier mobile sont testés, sans les assimiler à une certification mobile de chaque page.

Rejeu final de progression : **réussi**, incluant deux appareils, reconnexion, validation, suppression, révocation lecture/écriture, transfert Club et changement de rôle. Les refus Firestore attendus sont présents dans le log et ne constituent pas des échecs du test. Les 13 runners finaux listés dans `audits/lot8a/qualification.json` se terminent avec succès ; la baseline Messages 1 000 conserve toutefois son observation de non-stabilisation.
