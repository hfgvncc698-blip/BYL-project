# Essai de résumés — qualification

## Environnement

Copies jetables du dépôt, projet `demo-byl-performance`, Auth/Firestore émulés, Chrome headless avec profils temporaires. La vraie route `coachProgramRead` est adaptée dans la copie uniquement. Aucun fichier applicatif actif n'importe le pilote. Les tests n'utilisent ni cache ni compte utilisateur réel.

## Résultats

| Contrôle | Résultat |
|---|---|
| 0 client | Réussi, zéro lecture et écriture de résumé |
| 12 clients sans programme | Parité réussie ; surcoût sans amortissement démontré |
| 12 clients / 24 programmes sans historique | Parité et coûts mesurés |
| 12 / 36 / 100 / 500 clients avec historiques | Parité de la réponse complète réussie |
| 24 000 historiques au total | Parité et consultation du résumé réussies |
| Première création et consultations suivantes | Coûts séparés, aucune écriture lors des consultations valides |
| Validation, correction, suppression, modification du programme | Recalcul canonique identique |
| Liens de calendrier dupliqués et séances répétées | Données conservées ; calculs frontend inchangés |
| Invalidations répétées ou retardées | Reconstruction de l'état courant, pas d'incrément cumulatif |
| Deux lecteurs concurrents sur un résumé à reconstruire | Réponses identiques |
| Course lecteur/auteur | Réponse cohérente ancienne ou nouvelle ; lecture suivante nouvelle |
| Résumé corrompu ou schéma inconnu | Recalcul canonique |
| Programme trop volumineux pour le cache | Réponse exacte sans stockage du résumé |
| Écriture contournant la génération | **Résumé périmé reproduit : critère d'activation non satisfait** |
| Autre compte | Refus API |
| Dossier transféré à un autre coach | Refus API malgré résumé présent |
| Changement de club sans perte de propriété | Même politique d'accès que la référence |
| Rôle non coach ou compte désactivé | Refus API |
| Session révoquée | Refus API |
| Lecture et écriture SDK directe du résumé | Refus par les règles |
| Dossier supprimé | Refus API, writer ne recrée pas le dossier |
| Environnement non émulé | Garde du pilote refuse l'exécution |
| Dashboard compilé, desktop et mobile | Réussi |
| Navigation, retour chaud, rechargement | Réussi |
| Validation puis suppression pendant que le Dashboard est ouvert | Compteurs mis à jour, lectures ciblées |

Le test négatif d'écriture non coordonnée est volontairement attendu par le banc : le processus termine avec succès parce qu'il a détecté la limite. Cela ne ferme pas le défaut de fraîcheur pour une intégration réelle.

## Limites

- L'émulateur Functions n'est pas lancé : les mutations de qualification utilisent le writer atomique synthétique. Les déclencheurs existants sont examinés dans le code, pas transformés en une garantie atomique.
- La qualification UI porte sur 36 clients / 90 programmes / 900 validations ; les autres volumes sont qualifiés via l'API protégée, pas par un Dashboard complet de 500 clients.
- Pas de mesure de facturation réelle, de capacité Google, de réseau mobile contraint ni de redémarrage de deux instances API indépendantes.
- Les réponses intégrales sont comparées, mais tous les boutons Programme/SessionPlayer/Radar n'ont pas été rejoués graphiquement. Le frontend et les données qu'il reçoit restent identiques.
- Les P0-3/P0-4 restent ouverts. Le pilote ne modifie aucun contrôle correspondant.

## Sources et reproduction

- `scripts/experiments/coachSummaryPilot.cjs` : service expérimental, garde émulateur, génération atomique et vue matérialisée.
- `scripts/testCoachSummaryPilot.cjs` : scénarios de parité, sécurité, invalidation et coûts.
- `scripts/runCoachSummaryTrial.cjs` : copie jetable et patch de la route protégée.
- `scripts/runCoachSummaryBrowser.cjs` : banc de la vraie application compilée, variations avant/après et synchronisation.
- `scripts/reportCoachSummaryTrial.py` : tableaux et assertions de comparaison.
- `audits/coach-summary-pilot/trial.json`, `trial-final.log`, `checks.json` et `audits/coach-summary-browser/*-build.json` : résultats bruts synthétiques.

```sh
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachSummaryTrial.cjs
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachSummaryBrowser.cjs before 1 build
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachSummaryBrowser.cjs after 1 build
# Refaire la paire avec 2, puis :
python3 scripts/reportCoachSummaryTrial.py
```

Lancer les émulateurs séquentiellement : les ports du banc sont partagés. Le JDK utilisé est celui déjà installé sur la machine. Aucun paquet ou service externe supplémentaire n'est nécessaire.
