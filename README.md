# BoostYourLife

Application web React/Vite pour coachs sportifs et clients : création de programmes, suivi des séances, nutrition, paiements Stripe, tableaux de bord, analytics et espace d'administration.

## Démarrage local

```bash
npm install
npm run dev
```

Le script `dev` lance le frontend Vite et l'API locale. Les scripts séparés restent disponibles :

```bash
npm run dev:front
npm run dev:api
```

## Qualité

```bash
npm run build
npm run lint
npm run test:sport-engine
```

Avant une mise en production, vérifier au minimum :

- parcours inscription/connexion client et coach ;
- accès coach actif, trial ou abonnement ;
- achat Stripe, retour succès, portail de facturation ;
- création, assignation et lecture d'un programme ;
- génération automatique et prévisualisation de programme ;
- consultation mobile des dashboards client et coach ;
- consentement analytics et pages légales.

## Zones produit critiques

- Conversion : pages offres, programmes premium, checkout et retours Stripe.
- Activation : onboarding guidé, premier programme créé, premier client assigné.
- Rétention : dashboards, planning, statistiques, relances et suivi nutrition.
- Confiance : profils, documents PDF, emails, données légales et stabilité mobile.
