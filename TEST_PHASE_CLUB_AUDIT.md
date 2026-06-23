# Audit phase de test Club

Date: 2026-05-10

## Comptes test

Voir `TEST_PHASE_CLUB_ACCOUNTS.md`.

## Parcours validés

- Connexion propriétaire club test vers `/club-dashboard`.
- Création d’un pro depuis le dashboard club.
- Affichage du pro dans `Pros du club`.
- Vues club internes:
  - `/club-dashboard?section=activity&view=clients`
  - `/club-dashboard?section=activity&view=programs`
  - `/club-dashboard?section=activity&view=nutrition`
  - `/club-dashboard?section=activity&view=stats`
- Connexion du pro rattaché au club vers `/coach-dashboard`.
- Pages pro principales:
  - `/coach-dashboard`
  - `/clients`
  - `/programmes`
  - `/exercise-bank`
  - `/nutrition-coach`
  - `/statistics-coach`
  - `/coach/profile`
  - `/settings-coach`
- Suspension puis réactivation du pro depuis le dashboard club.

## Problèmes trouvés et corrigés

- Connexion propriétaire club envoyée vers `/coach-dashboard` au lieu de `/club-dashboard`.
- Connexion pro rattaché au club envoyée vers `/plans/professionnel` au lieu de `/coach-dashboard`.
- Statut suspendu du pro relu comme actif dans le dashboard club.

## Problème restant à corriger

- Le backend a loggé plusieurs erreurs `analytics/pageview` avec `INVALID_ARGUMENT: Invalid transaction`.

## Notes

- L’automatisation navigateur a eu des difficultés à remplir les champs `email` et `date` du formulaire d’inscription. Le compte club test a donc été créé côté Firebase pour poursuivre le test fonctionnel, puis tout le reste du parcours a été testé dans le navigateur.
