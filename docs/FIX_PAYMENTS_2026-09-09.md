# Correctifs paiements — 9 septembre 2026

## État

Correctifs implémentés localement à la suite de l’audit. **Aucun paiement, compte Stripe, session Checkout/portail, e-mail ou enregistrement Firebase réel créé pendant cette phase de correction. Aucun déploiement ni changement de configuration Stripe LIVE.**

Les échecs de l’audit initial sont désormais couverts par des assertions réussies. La validation réelle Checkout/3DS/délivrabilité reste à faire en environnement de test, puis après déploiement autorisé.

## Corrections métier

- **Paiement vérifié** : livraison uniquement pour une session `status=complete` et `payment_status=paid` ou `no_payment_required` (cas gratuit intégralement remisé). Un Checkout ouvert, annulé, expiré ou encore impayé n’accorde aucun droit.
- **Une même chaîne de livraison** pour finalisation navigateur, webhook et paiement différé. La récupération Premium utilise aussi le contrôle strict de paiement.
- **Erreurs webhook relivrables** : HTTP 500 pour panne de lecture, écriture ou génération ; HTTP 503 si une autre exécution détient déjà la réservation de livraison. Pas d’acquittement métier mensonger.
- **Idempotence et concurrence** : identifiants de reçus et programmes déterministes, réservation Firestore transactionnelle avec bail de 120 s, marqueur livré uniquement après création confirmée. Une reprise après panne utilise le même programme.
- **Génération create-only** : `generateAndSaveAutoProgram` accepte un `assignedProgramId` interne ; le programme déjà créé n’est jamais réécrit lors d’une reprise, notamment après modification/commencement par le client. Le paramètre n’est pas exposé depuis le corps public de `/programs/generate`.
- **Questionnaire payé figé** : préférences complètes stockées dans `checkout_program_requests` côté serveur, puis dans le reçu. Seule une référence opaque est transmise à Stripe ; les informations de blessure ne sont pas ajoutées à ses métadonnées. La collection nouvelle reste interdite aux clients par la règle Firestore générale ; accès serveur Admin SDK uniquement.
- **Achat unique** : produit le programme réellement assigné, renvoie son `clientId`, `programAssignmentId` et URL exacte. Ne dépend plus d’un abonnement actif ni d’une recherche approximative du dernier programme.
- **Abonnement particulier** : première livraison commune au retour Checkout et à la facture initiale (`initial_sub_<subscriptionId>`), quel que soit leur ordre. Les renouvellements `invoice.paid` / `subscription_cycle` utilisent un reçu par facture. Les ajustements/prorations ne déclenchent pas un programme mensuel supplémentaire.
- **Questionnaire des renouvellements conservé** : sexe, niveau, objectif, fréquence, durée, lieu, matériel et exclusions de blessure restent ceux de la demande payée, pas les valeurs par défaut d’un cron.
- **Compatibilité cron** : les nouveaux abonnements portent `deliveryMode=stripe-invoice` et sont exclus du générateur historique 30 jours. Les abonnements legacy sans ce marqueur restent inchangés.
- **Paiements différés** : gestion de `checkout.session.async_payment_succeeded` et `checkout.session.async_payment_failed`. Un événement ancien ne remplace pas un état de paiement plus récent ; l’état Stripe courant est relu.
- **Factures récentes et anciennes** : résolution de l’abonnement dans `invoice.subscription` ou `invoice.parent.subscription_details.subscription`. Une facture autonome n’est pas traitée comme un abonnement et ne peut pas écrire `subscriptionStatus=paid`.
- **Abonnements remplacés et événements concurrents** : une annulation retardée d’un ancien abonnement ne peut pas désactiver son remplaçant. Un changement d’identifiant exige un nouvel abonnement actif/trialing de création strictement plus récente ; timestamps égaux ou absents restent fail-closed. Les réponses Stripe sont ordonnées par une révision transactionnelle réservée **avant** leur lecture dans `stripe_subscription_sync`, afin qu’une ancienne réponse active lente ne remplace pas une annulation ou un impayé déjà appliqué. Les statuts Stripe terminaux ne sont pas réactivés pour le même identifiant.
- **Projection atomique utilisateur/client** : statut, identifiant Stripe, droits et drapeau `deliveryMode` sont écrits ensemble dans la transaction validée. Les nouvelles livraisons par facture ne réécrivent pas les préférences cron legacy d’un abonnement courant ; une ancienne facture payée peut livrer le programme dû sans modifier le nouvel abonnement. La réconciliation et l’annulation administrative utilisent le même arbitre ; une simple liste Stripe vide ne révoque plus un Checkout concurrent.
- **Prix Premium** : tarif résolu depuis le programme serveur actif réellement Premium. Un tarif de secours moins cher ne remplace plus arbitrairement un prix spécifique ; un modèle privé ne peut pas être acheté via ce chemin.
- **Identité** : un UID Stripe explicite ne peut pas être contourné par une simple correspondance d’e-mail. La compatibilité e-mail s’applique uniquement sans UID et avec e-mail vérifié. Une recherche utilisateur par UID inexistant ne bascule pas vers un e-mail arbitraire.

## Interface

- `Success.jsx` n’affiche plus « Paiement validé/vérifié » par défaut lorsque le paiement n’est pas connu. États explicites : référence absente, connexion requise, paiement en attente, erreur, préparation, abonnement inactif et confirmation.
- Appel de finalisation borné à 45 s ; annulation à la sortie ; au maximum 10 tentatives automatiques pour une livraison déjà en cours. Bouton de nouvelle vérification, sans nouveau paiement, au-delà de cette limite.
- Une confirmation déjà obtenue est conservée si une tentative ultérieure rencontre seulement une panne réseau.
- Redirection vers l’URL locale exacte validée et renvoyée par le serveur ; aucun lien externe accepté. Pour le Pro, attente de l’actualisation d’AuthContext avant de franchir la route protégée, afin d’éviter un retour au paywall sur un profil périmé.
- Ancienne route `/checkout/:productId` : suppression de la simulation ; liens explicites vers les parcours d’achat réels, sans redirection fictive de succès.
- `AccountBilling` et les anciennes routes portail réutilisent le même handler sécurisé. Retour neutre vers la facturation plutôt qu’un retour coach forcé pour tous les rôles.

### Traductions

Les nouveaux messages `payment.return.*` et `payment.legacy.*` sont traduits en français, anglais, espagnol, allemand, italien, russe et arabe. `scripts/testPaymentReturnI18n.mjs` vérifie les 20 clés réellement utilisées et leur résolution dans les sept langues, ainsi que les deux nouvelles clés d’inscription Google : 154 résolutions locales, sans repli français dans les langues non françaises.

## Tests exécutés

| Commande | Résultat |
| --- | --- |
| `node scripts/auditPaymentsMock.cjs` | **69 contrôles réussis, 0 échec** |
| `node scripts/testPaidProgramDelivery.cjs` | Fonction réelle de sauvegarde : create-only concurrent, reprise sans régénération/écrasement, validation du reçu — OK |
| `node scripts/testPaidProgramFirestore.cjs` via `npm run test:emulator-fixes` | **6/6** avec SDK Admin et transactions Firestore réelles dans l’émulateur local `demo-byl-security` : concurrence, facture initiale/Checkout, reprise après marqueur en panne, bail expiré, propriétaire du reçu, impayé. Aucun accès à Firebase distant. |
| `node scripts/testPaymentReturn.mjs` | Statuts, destinations sûres, bornes de tentatives/annulation, attente auth et absence de simulation legacy — OK |
| `node scripts/smokeCriticalFlows.mjs` | **51/51** |
| ESLint ciblé sur fichiers modifiés et tests | OK |
| `node scripts/planStripeWebhookEvents.cjs` | Dry-run hors réseau — OK |

La suite métier exécute la vraie route avec Firebase/Stripe en mémoire et inclut une vérification cryptographique réelle du SDK Stripe sur des octets signés localement (secret de fixture), puis rejet après altération. Aucun appel Stripe n’est fait par cette vérification.

Cas de panne/concurrence inclus : retour et webhook simultanés ; facture initiale avant/après le retour et en concurrence ; panne du générateur ; panne après création avant marqueur de livraison ; bail expiré après crash ; rejeu des factures récurrentes ; protection d’un programme commencé ; événement différé échoué ancien ; facture récente et facture autonome ; récupération Premium impayée/payée ; ancien abonnement annulé face au nouveau (pro et particulier) ; dates égales/absentes ; anciennes réponses du même abonnement contre `canceled` et `past_due` ; deux courses de réconciliation ; facture historique sans modification des préférences cron actuelles.

Les tests Firestore réels concernent le helper de livraison et sa persistance, avec génération synthétique create-only ; les 10 nouveaux cas d’arbitrage d’abonnements exécutent la route réelle avec des doubles mémoire. Les nouvelles collections `checkout_program_requests` et `stripe_subscription_sync` restent interdites au SDK client. La protection des champs serveur `users.stripeSubscriptionCreatedAt` et `clients.deliveryMode` a été coordonnée avec le correctif des règles et sa suite émulateur, sans élargir leurs permissions.

L’assertion smoke héritée de la recherche client/programme côté page succès a été remplacée par le nouveau contrat de destination confirmée côté serveur. Aucun contrôle d’intégrité n’a été supprimé pour faire passer un défaut.

## Déploiement et opérations restant à effectuer

1. Déployer frontend, API et worker cron correspondants ensemble, après validation de l’environnement de test.
2. Ajouter aux événements du webhook Stripe existant les deux événements différés : `checkout.session.async_payment_succeeded` et `checkout.session.async_payment_failed`. **La configuration LIVE n’a pas été changée.**
3. `scripts/planStripeWebhookEvents.cjs` affiche la liste attendue sans réseau par défaut. `--read-only-network` compare par GET sans mutation ; `--apply` est volontairement refusé. La liste existante des autres événements doit être conservée.
4. Vérifier en Stripe test : ouverture Checkout, carte réussie/refusée/3DS, annulation, paiement différé, fermeture du navigateur avant retour, reprise après panne et e-mails sur boîte de test autorisée.
5. Les anciens doublons historiques de `custom_program_orders` n’ont pas été supprimés ni fusionnés ; aucune donnée utilisateur existante n’a été effacée. Les nouveaux reçus évitent de créer ces doublons.
6. Une ancienne session payée dont les préférences nécessaires sont absentes échoue explicitement et reste à réconcilier, plutôt que générer arbitrairement un programme à partir de valeurs inventées. Les nouveaux achats valident et figent les préférences avant Checkout.

## Fichiers concernés

- `backend/routes/payments.js`, `backend/routes/stripePortal.js`
- `backend/utils/paidProgramOrders.js`, `backend/utils/generateAutoProgram.js`
- `backend/cron.worker.js` (uniquement exclusion des abonnements livrés par facture)
- `src/pages/Success.jsx`, `src/pages/Checkout.jsx`, `src/pages/AccountBilling.jsx`, `src/utils/paymentReturn.js`
- Tests et script dry-run listés ci-dessus ; assertion ciblée `scripts/smokeCriticalFlows.mjs`

La fermeture de la génération directe des particuliers dans `backend/routes/programs.js` a été coordonnée avec le correctif workflows ; les particuliers reçoivent un programme uniquement via un reçu payé vérifié côté serveur. `functions/index.js` et `src/App.jsx` n’ont pas été modifiés par ce sous-ensemble de correctifs.
