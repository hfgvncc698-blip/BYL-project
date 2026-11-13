# Dashboard Coach — publication des blocs disponibles

## Corrections intégrées

La limitation à une publication toutes les 100 ms ignorait les autres clients résolus dans la même fenêtre. Ces données déjà reçues attendaient ensuite la fin de tous les lots. Un accumulateur publie désormais tous les clients terminés, par fenêtre de 100 ms au maximum (hors blocage du thread), puis vide les derniers résultats à la fin. Les réponses périmées sont rejetées avant publication et dans la fonction de mise à jour React.

Le marqueur `_quickPlaceholder` hérité du squelette restait présent dans certains programmes complets. Il est explicitement retiré de leur état d'attente. Les prescriptions et la progression canonique sont conservées ; les historiques visibles par le coach restent distincts. Les statistiques globales ne sont pas déclarées confirmées prématurément.

Le module public du calendrier est préchargé après lecture des préférences, uniquement sur ordinateur lorsque le calendrier est visible et déplié. Le montage à proximité de la zone visible et les requêtes de données restent inchangés. Une erreur de préchargement est interceptée et permet une nouvelle tentative de chargement du module.

## Coûts et limites

Aucune nouvelle requête API, lecture ou écriture Firebase, aucun écouteur, aucun résumé persistant. Les lots réseau et leurs limites sont inchangés. Le calendrier peut télécharger son code même si l'utilisateur quitte la page sans faire défiler jusqu'à lui : compromis de transfert JavaScript public, pas de lecture documentaire. Aucun déploiement.

Ce correctif traite la disponibilité visuelle de données déjà reçues. Il ne réduit pas la durée des requêtes d'historiques elles-mêmes et ne démontre pas un Dashboard complet sous deux secondes. Aucun nouveau temps navigateur réel ou émulé n'est annoncé ici. Les résultats des anciens pilotes ne constituent pas une mesure de ce correctif.

## Vérification

- `node scripts/testCoachProgressPaint.mjs` : 32 réponses simultanées publiées ensemble avant les quatre dernières, 36/36 à la fin, prescriptions et séparation des historiques conservées, réponse différée rejetée après invalidation d'identité.
- `node scripts/testCoachDashboardLoading.mjs` : réussi.
- `node scripts/testCoachProgramBatchLot8B.mjs` : réussi ; budgets réseau inchangés, erreurs d'autorisation sans relecture de secours.
- `node scripts/testCoachDashboardProjection.cjs` : réussi sur 0/10/100/1000 validations et leurs corrections/suppressions.

Avant : pour un lot résolu dans la même fenêtre de 100 ms, au plus un client était publié immédiatement ; les autres attendaient la consolidation globale. Après : chaque client terminé est conservé puis publié, sans requête supplémentaire. Ce constat est un test de comportement, pas un benchmark de latence de production.

Compilation : `npm run build` réussie, budgets de taille JavaScript respectés.

## Périmètre

Modifications : `CoachDashboard.jsx`, `coachDashboardLoading.js` et nouveau test `testCoachProgressPaint.mjs`. Aucun changement d'Auth, de règles, de backend, de données réelles ou de cache persistant. Les résumés expérimentaux restent désactivés dans l'application habituelle. P0-3 et P0-4 restent ouverts.
