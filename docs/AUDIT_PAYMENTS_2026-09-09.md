# Audit paiements — 9 septembre 2026

## Conclusion

Stripe est configuré et joignable, mais la chaîne de paiement ne peut pas être déclarée entièrement fiable. L’audit a reproduit des défauts de contrôle du paiement, de répétition des commandes et de reprise après erreur. Aucun correctif applicatif ni déploiement n’a été effectué dans cet audit.

## Périmètre et sécurité du test

- Code local examiné : routes Checkout, portail, finalisation, webhook, récupération Premium ; pages offres Pro, Premium, questionnaire client, succès et facturation ; trigger d’e-mail abonnement.
- La clé de `backend/.env` est en **mode LIVE**, pas test. Aucun environnement de paiement de test identifié dans les fichiers d’environnement du dépôt.
- Stripe interrogé réellement **en lecture seule** : 27 prix, configuration du portail, configuration des webhooks. Aucune session Checkout/portail, aucun client Stripe, paiement, abonnement, e-mail ou changement Firestore réels créés.
- Tests métier exécutés hors réseau avec les **vraies routes locales** dans une VM et doubles Stripe/Firestore en mémoire. Ils ne prouvent pas que la même version applicative est déployée en production.
- Aucun numéro de carte, secret, identifiant de paiement réel ou donnée client n’est inclus dans ce rapport.
- L’ouverture réelle d’une nouvelle page Checkout et une transaction complète restent **non testées**, faute de configuration Stripe de test. Une URL Stripe renvoyée par un double ne constitue pas une preuve d’ouverture réelle.

## Vérification réelle de la configuration Stripe (GET uniquement)

Commande : `node scripts/auditPaymentsStripeReadOnly.cjs --read-only-network`.

| Élément | Résultat constaté |
| --- | --- |
| 24 prix Pro : 4 packs × 3 paliers × 2 cadences | Tous actifs, LIVE, EUR, recurring, cadence mois/année attendue |
| Pro Sport et Nutrition | Solo 29 €/290 € ; Croissance 59 €/590 € ; Illimité 79 €/790 €, taxes incluses |
| Pro Complet | Solo 69 €/690 € ; Croissance 84 €/840 € ; Illimité 99 €/990 €, taxes incluses |
| Club | Studio 149 €/1 490 € ; Club 229 €/2 290 € ; Réseau 299 €/2 990 €, taxes exclusives |
| Particulier mensuel | 39,99 €, actif, récurrent mensuel, EUR, taxes incluses |
| Programme sur mesure à l’unité | 89,99 €, actif, paiement unique, EUR, taxes incluses |
| Premium tarif de secours | 19,99 €, actif, paiement unique, EUR, taxes incluses |
| Portail Billing | Configuration par défaut active ; historique factures, annulation et changement d’abonnement activés |
| Webhook | `https://boostyourlife.coach/api/payments/stripe-webhook`, activé, LIVE |
| Événements souscrits | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` |
| Événements différés | Pas d’abonnement à `checkout.session.async_payment_succeeded` ni `checkout.session.async_payment_failed` |
| Version webhook | `api_version: null` : héritée du compte, version effective non vérifiée |

Les prix Pro correspondent aux montants actuellement affichés dans `src/pages/PlanProfessionnel.jsx`. Ces constats ne garantissent ni la configuration de chaque produit Premium spécifique en base, ni la disponibilité de tous les moyens de paiement, ni la réception d’un reçu.

## Tests métier hors réseau

Commande : `node scripts/auditPaymentsMock.cjs`.

**33 contrôles passent ; 6 assertions d’intégrité échouent** (code de sortie 1 attendu tant que les défauts persistent). Les 6 échecs représentent plusieurs manifestations de quatre défauts principaux ci-dessous.

Le script existant `node scripts/smokeCriticalFlows.mjs` passe également : **51/51 contrôles**. Il vérifie notamment le câblage et des invariants de source ; il ne couvre pas les défauts transactionnels reproduits par le nouvel audit.

Contrôles positifs :

- 24 combinaisons Pro/palier/cadence : bon prix serveur, quota/modules déterminés côté serveur, URL Stripe renvoyée, taxes automatiques, retours succès/annulation corrects ; prix et droits injectés par le navigateur ignorés.
- Particulier abonnement et achat unique : bon produit sélectionné.
- Identité d’un autre utilisateur et prix Premium arbitraire refusés.
- Finalisation d’une session appartenant à une autre identité refusée.
- Abonnement Pro actif : statut, rôle et droits enregistrés.
- Premium payé : attribution et rejeu idempotents (une seule attribution).
- Portail : URL Stripe renvoyée ; retour vers un domaine non autorisé remplacé par le retour sûr.
- Webhook de signature invalide : HTTP 400 et aucune écriture métier.

La vérification cryptographique réelle d’une signature Stripe n’a pas été exécutée : le double simule signature valide/invalide, ce qui vérifie les branches du handler. Le montage `express.raw` avant `express.json` a été confirmé dans `backend/app.js:127`.

## Défauts reproduits

### P1 — Attribution possible avant paiement

`backend/routes/payments.js:2358` passe à l’attribution de l’achat unique ou Premium sans contrôler `payment_status`/`status` après la vérification du propriétaire.

Preuve : une session de fixture `mode=payment`, `status=open`, `payment_status=unpaid` entraîne deux écritures : droit utilisateur `hasPurchasedCustomProgram=true` et commande `status=paid`. Le même bloc appelle l’attribution Premium sans contrôle préalable. **Ce test ne nécessite pas de moyen de paiement différé** : un Checkout simplement ouvert/non payé suffit si son propriétaire invoque la finalisation.

Le webhook présente également le défaut : `checkout.session.completed` avec `payment_status=unpaid` crée une commande à `backend/routes/payments.js:2588`. La récupération Premium utilise aussi `paid || complete` à `backend/routes/payments.js:1938` (constat statique).

Stripe distingue complétion du Checkout et état du paiement ; la livraison doit se baser sur le statut de paiement et gérer les moyens différés. [Documentation officielle Stripe — livraison](https://docs.stripe.com/checkout/fulfillment).

### P1 — Une erreur de persistance est acquittée comme un succès

`backend/routes/payments.js:2622` intercepte l’erreur métier, puis renvoie HTTP 200 `ok-onetime` à la ligne 2625.

Preuve : le double Firestore lève une erreur sur l’écriture de la commande/droit ; la réponse reste 200. La branche abonnement a le même schéma à `backend/routes/payments.js:2582` ; cette seconde branche est constatée dans le code, pas injectée dans ce scénario précis.

Conséquence : Stripe reçoit un succès alors que l’achat n’est pas appliqué ; sa relivraison automatique ne permet pas de réparer cette opération acquittée. [Documentation officielle Stripe — événements et retries](https://docs.stripe.com/webhooks?lang=node).

### P1 — Les commandes sur mesure ne sont pas idempotentes

`backend/routes/payments.js:2390` et `backend/routes/payments.js:2608` utilisent `custom_program_orders.add(...)` sans unicité par session. `stripe_events` est seulement écrit, pas utilisé pour exclure un événement déjà traité.

Preuves séparées : deux appels de finalisation de la même session produisent deux commandes ; deux livraisons du même webhook produisent deux commandes. Un retour client et un webhook peuvent donc eux aussi doubler l’enregistrement. Ce défaut ne concerne pas l’attribution Premium testée, qui utilise un identifiant stable et une création protégée.

### P1 conditionnel — Paiements différés non pris en charge

Le handler n’a pas de branche `checkout.session.async_payment_succeeded` (`backend/routes/payments.js:2533` et branches suivantes), et le webhook LIVE n’est pas abonné à cet événement.

Preuve : un événement valide `async_payment_succeeded` avec paiement confirmé reçoit un acquittement mais ne crée aucune commande. L’exposition réelle dépend des moyens de paiement activés dans Stripe, non vérifiés ici. Le défaut précédent livre déjà trop tôt lors de `completed+unpaid` ; corriger uniquement ce contrôle sans ajouter la livraison différée laisserait ces commandes sans attribution.

## Anomalies de parcours confirmées dans le code, sans paiement réel

### Achat unique 89,99 € : liaison avec la génération et la sortie de page incomplète

Le CTA est actif dans `src/components/AutoProgramQuestionnaire.jsx:899`. La finalisation réussie d’un achat unique ne crée que le droit utilisateur et la commande (`backend/routes/payments.js:2382`), sans appel au générateur. Une recherche dans le dépôt ne trouve aucun consommateur/trigger de `custom_program_orders` ni aucun consommateur de `hasPurchasedCustomProgram` hors de ces écritures.

La page `src/pages/Success.jsx:134` attend **un abonnement actif** pour rediriger `action=program`, même quand l’achat à l’unité a été payé ; le booléen de paiement ne suffit que pour Premium. Un particulier achetant seulement le programme à l’unité peut donc rester sur la page d’attente, sans génération déclenchée par ce parcours. Le cron mensuel existant sélectionne des clients `abonnementActif=true`, ce qui ne répare pas cet achat à l’unité.

Statut : défaut de raccordement fortement établi par la chaîne locale et la recherche exhaustive des champs ; **pas reproduit avec une carte réelle**. À tester de bout en bout dans Stripe test avant validation.

### Page succès affirmative même sans paiement vérifié

`src/pages/Success.jsx:180` utilise « Paiement validé » lorsque `paid=false`, y compris après une erreur de vérification absorbée dans le `catch` de la ligne 96. Le badge affiche « Paiement vérifié » dans ce même état à la ligne 213. Aucun état d’échec visible n’est prévu. Cela ne prouve pas un débit et peut induire l’utilisateur en erreur.

### Ancienne route Checkout simulée encore publique

`src/pages/Checkout.jsx:17` attend 1,2 seconde puis navigue vers `/payment-success` sans appeler Stripe. Route montée dans `src/App.jsx:802` : `/checkout/:productId`.

Recherche globale de `/checkout/` dans `src` : aucun CTA actuel trouvé vers cette route. **Legacy accessible directement**, pas le chemin normal des offres Pro, du questionnaire ou du catalogue Premium. À ne pas confondre avec une panne du Checkout principal.

### Deux routes de portail différentes

Les réglages principaux utilisent la route `payments/create-stripe-portal-session`, testée avec retours sûrs et recherche/création du client Stripe. `src/pages/AccountBilling.jsx:31` utilise l’autre route `stripe-portal/create-stripe-portal-session`, qui exige `stripeCustomerId` déjà présent et force le retour vers `/settings-coach` via `FRONTEND_BASE_URL` (`backend/routes/stripePortal.js:22`, `backend/routes/stripePortal.js:26`).

Dans la configuration locale actuelle, ce retour est localhost ; la valeur déployée n’est pas connue. Pour un compte particulier cette route renvoie aussi vers des réglages coach. Incohérence statique à harmoniser, mais aucune session de portail réelle créée pour tester le retour.

## E-mails liés à l’abonnement

Le trigger Firestore `onUserSubscriptionLifecycle` existe dans `functions/index.js:2807`, région `europe-west1`, sur `users/{uid}`, avec secrets SMTP déclarés.

- À l’entrée dans un statut `active` ou `trialing`, il prépare un e-mail `subscriptionWelcome` (`functions/index.js:2830`).
- À l’entrée dans `past_due`, `unpaid` ou `incomplete_expired`, il prépare `paymentIssue` avec lien vers la facturation (`functions/index.js:2857`).
- Garde-fous présents : adresse non vide, changement de famille de statut, préférences d’e-mail, suspension, marqueur d’envoi et réservation transactionnelle avant envoi.
- L’envoi est suivi d’un marqueur et d’un événement de livraison ; l’erreur est journalisée et suspend la livraison automatique (`functions/index.js:2883`).
- Le marqueur est unique par type, pas par facture. Une transition `trialing → active` ne déclenche pas un nouveau `subscriptionWelcome`. Il ne s’agit donc pas d’un reçu de paiement systématique.
- Les reçus Stripe et l’envoi réel des factures n’ont pas été vérifiés. Le fait que le portail propose l’historique des factures ne démontre pas leur réception par e-mail.
- Les secrets SMTP locaux sont configurés ; leur présence ne prouve ni le déploiement/secret du trigger Cloud Functions, ni sa délivrabilité. Aucun e-mail envoyé dans cet audit paiements.

## Validation restant nécessaire

1. Corriger puis rejouer les assertions d’intégrité négatives, y compris concurrence entre retour navigateur et webhook.
2. Fournir un environnement Stripe **test** avec prix, webhook et compte applicatif de test isolés.
3. Ouvrir Checkout pour chaque famille d’offre, tester retour annulé, paiement carte réussi/refusé/3DS et, si activé, paiement différé.
4. Contrôler les droits et la livraison du programme après retour, après fermeture du navigateur et après reprise d’un webhook en erreur.
5. Vérifier le portail et les vrais e-mails sur une boîte de test autorisée ; ne pas utiliser Alex ou ses clientes pour ces mutations de test.

Fichiers ajoutés par cet audit : ce rapport, `scripts/auditPaymentsMock.cjs`, `scripts/auditPaymentsStripeReadOnly.cjs`. Aucun fichier applicatif modifié.
