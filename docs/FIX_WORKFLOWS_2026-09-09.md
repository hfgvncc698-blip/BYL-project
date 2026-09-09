# Correctifs des parcours métier — 9 septembre 2026

Correctifs locaux des anomalies reproduites dans `AUDIT_WORKFLOWS_2026-09-09.md`. Aucun programme, bilan, client ou événement réel modifié ; aucun déploiement effectué par ce sous-travail.

## Changements

- **Synchronisation modèle → client** : chaque petit groupe de copies est maintenant écrit dans une transaction qui relit le modèle et les copies. Un modèle modifié avant le commit provoque une reprise transactionnelle avec la version récente. La propriété du modèle est revérifiée ; les copies supprimées ou rattachées à un autre modèle ne sont pas recréées. L’historique des séances effectuées est conservé.
- **Paywall génération** : `/api/programs/generate` est réservé aux administrateurs vérifiés et coachs actifs. Les particuliers doivent recevoir leur programme depuis le parcours de reçu Stripe validé, pris en charge par le correctif paiements. Le drapeau client historique `hasPurchasedCustomProgram` n’accorde pas un droit de génération directe.
- **Planning** : lors d’une demande déjà traitée, le statut, les horaires, la durée et la récurrence du miroir calendrier viennent de la séance effectivement conservée, pas des nouvelles valeurs du formulaire.
- **Préremplissage nutrition** : fusion avec le dernier état du formulaire, uniquement dans les champs vides. Les notes et valeurs saisies pendant la lecture restent prioritaires. Une réponse arrivant après changement de dossier/démontage est ignorée ; le formulaire et ses marqueurs sont réinitialisés au changement de bilan.
- **Assignation depuis Clients, Programmes, Dashboard et Builder** : une opération commune transactionnelle crée la copie et met à jour la fiche client ensemble ; le builder ajoute ses métadonnées de modèle dans la même transaction. Le modèle complet est lu dans cette transaction pour couvrir aussi une modification concurrente au moment de l’assignation. Les doubles soumissions sont verrouillées.
- **Builder** : l’assignation utilise le modèle confirmé, puis lui applique les suggestions de charges issues de l’historique. Si des changements locaux ne sont pas enregistrés ou qu’une sauvegarde est en cours, un message demande de terminer l’enregistrement au lieu d’assigner silencieusement une ancienne version.
- **Création de programme** : identifiant alloué une seule fois par opération, transaction qui n’écrase pas un document déjà créé, et attente de confirmation bornée. Une modification saisie pendant la création reste marquée comme non enregistrée et pourra être sauvegardée sur le nouveau document.

Les nouvelles opérations utilisent [confirmedOperation.js](/Users/tommarie/Projects/BYL-project/src/utils/confirmedOperation.js) et [programWriteOperations.js](/Users/tommarie/Projects/BYL-project/src/utils/programWriteOperations.js).

## Reprise et confirmation

Un délai dépassé n’est jamais présenté comme un succès ou comme une annulation serveur. La même promesse/opération et son identifiant restent disponibles en mémoire pour le bouton de vérification/reprise ; un échec réel rejoue cette opération idempotente. Une copie déjà confirmée n’est ni dupliquée ni réinitialisée, même si sa progression a changé entre-temps.

Si l’utilisateur ferme une modale, change sa sélection et que l’ancienne opération a été confirmée tardivement, un message informatif confirme d’abord cette précédente opération, sans nouvelle écriture. Le clic suivant peut traiter la nouvelle sélection ; la nouvelle paire client/programme n’est donc pas bloquée indéfiniment.

Cette conservation de l’opération est en mémoire. Elle ne constitue pas un journal persistant de brouillon après fermeture complète/rechargement du navigateur. Les transactions empêchent les écritures partielles, mais aucune garantie de reprise de brouillon après effacement de la mémoire du navigateur n’est revendiquée ici.

## Vérifications effectuées

Après corrections, ces commandes passent :

```text
node scripts/auditWorkflowsRoutes.cjs
node scripts/auditWorkflowsClientActions.cjs
node scripts/testConfirmedProgramWrites.mjs
node scripts/testProgramSyncConcurrency.cjs
npm run test:program-sync
npm run test:action-loading
npm run test:nutrition-creation
npm run test:player-program-sync
npm run test:player-builder-sync
npm run test:loading
```

- Audit routes : **8/8** (les trois échecs initiaux sont corrigés).
- Audit callbacks : **5/5** (les trois échecs initiaux sont corrigés, plus une vérification de réponse obsolète après changement de bilan).
- Écritures confirmées : timeout, reprise de la même opération, changement de sélection après confirmation tardive, IDs stables, absence d’écriture partielle, conservation des exercices/progression/saisies récentes.
- Concurrence : ancien travail de synchronisation après nouvelle sauvegarde, modification du modèle entre lecture et commit de nouvelle assignation, suppression/rattachement/changement de propriétaire pendant la synchronisation.
- ESLint ciblé sur les composants, helpers, routes et tests modifiés : aucune erreur ni avertissement après nettoyage des imports devenus inutiles.

Les tests exécutent les vrais gestionnaires ou callbacks avec services en mémoire ; ils ne créent pas de données Firestore réelles et ne prétendent pas reproduire tous les comportements d’un navigateur. L’intégration globale, la compilation, les règles Firestore en émulateur et le parcours Stripe sont vérifiés séparément par les autres parties du travail. La transaction de création d’un modèle nécessite notamment le GET d’un document inexistant pour un coach actif/admin, ajouté dans le correctif des règles.

## Livraison

Les changements applicatifs demandent un déploiement cohérent du frontend, de l’API et des règles Firestore. Après déploiement, les parcours devront être revalidés sur des comptes/données de test, particulièrement en connexion lente et sur mobile. Aucun nouveau gain de temps réseau réel n’a été mesuré ici ; les améliorations visent surtout l’intégrité, les reprises et une confirmation honnête des opérations.
