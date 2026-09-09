# Audit global du site — 9 septembre 2026

> Rapport historique, état avant corrections. Les correctifs et leurs validations ultérieures sont détaillés dans [FIX_SITE_2026-09-09.md](/Users/tommarie/Projects/BYL-project/docs/FIX_SITE_2026-09-09.md). Les résultats initiaux ci-dessous sont conservés pour traçabilité.

## Verdict

**Le site ne peut pas être déclaré entièrement fiable en l'état.** Les suites existantes passent, mais les nouveaux scénarios reproduisent des erreurs d'autorisation, de paiement, de synchronisation et de reprise. Certaines correspondent au type de symptômes rapportés par Alex ; aucune n'est présentée comme la cause prouvée de son incident personnel.

Il s'agit d'un audit, pas d'une livraison de corrections. Aucun correctif applicatif ni déploiement effectué dans ce tour. Les modifications de performance et de player déjà présentes avant l'audit ont été préservées. Seuls des scripts d'audit et les rapports associés ont été ajoutés.

## Priorités

| Priorité | Constat | Niveau de preuve |
| --- | --- | --- |
| Critique | L'ajout d'un professionnel à un club peut réaffecter un coach/propriétaire d'un autre club et retourner son lien de réinitialisation au demandeur. | Vraie route locale, Firebase simulé ; aucun compte réel ciblé. |
| Critique | Trois défauts d'isolation dans les règles : `clubId` nuls traités comme un même club, programme public potentiellement modifiable sans authentification, lien client arbitraire accepté à la création d'un profil. | Lecture statique ; texte des règles déployées strictement identique au local, confirmé par l'API Firebase. Pas d'exploitation réelle ni d'émulateur. |
| Haute | Finaliser un Checkout ouvert/non payé peut attribuer l'achat ; un événement de paiement non encore réglé peut aussi livrer trop tôt. | Reproduit sur vraies routes avec Stripe/Firestore simulés. |
| Haute | Une erreur d'écriture pendant le webhook Stripe reçoit quand même HTTP 200 ; l'achat peut ne pas être livré et Stripe ne réessaiera pas cette réponse acquittée. | Panne de persistance injectée en mémoire. |
| Haute | Répéter finalisation/webhook crée plusieurs commandes sur mesure ; livraison différée non traitée. | Reproduit en mémoire ; absence d'abonnement au webhook différé également constatée en lecture réelle Stripe. |
| Haute | Deux synchronisations chevauchées peuvent remettre l'ancienne version du programme chez le client, malgré deux réponses de succès. | Reproduit sur route réelle avec lectures/écritures contrôlées. |
| Haute | Le préremplissage Nutrition peut écraser les notes saisies pendant les lectures initiales. | Callback réel extrait du source, services/état simulés. |
| Moyenne | Double soumission d'assignation depuis Clients, ou reprise après échec partiel : deux programmes créés. | Deux scénarios reproduits en mémoire. |
| Moyenne | Réessayer une création de séance peut modifier statut/durée du miroir calendrier client sans modifier la séance racine. | Deux scénarios reproduits en mémoire. |
| Moyenne | L'inscription Google ignore le choix professionnel/club et initialise un particulier. | Chaîne d'inscription inspectée et générateur de profil testé. |
| Moyenne | L'ajout d'un pro de club laisse un compte partiel après échec ; rattacher un client autonome peut dépasser un quota déjà plein. | Deux scénarios reproduits en mémoire. |

Autres anomalies établies par inspection, à tester après correction :

- L'interface facture la génération personnelle mais l'API de génération ne vérifie pas le droit d'achat/abonnement du particulier.
- Achat programme à l'unité : commande et droit écrits, mais aucune consommation de ces champs vers la génération trouvée ; la page succès attend un abonnement pour sortir du parcours programme.
- La page succès peut afficher « Paiement validé » sans paiement vérifié. Une ancienne route `/checkout/:productId` simule encore un succès ; aucun CTA actuel vers cette route n'a été trouvé.
- La création initiale d'un programme attend une écriture sans borne d'attente, contrairement aux mises à jour.
- Aucun e-mail de confirmation à la création/modification d'une séance coach identifié : calendrier/ICS ne signifie pas envoi de confirmation.

Les références exactes, préconditions et pistes de correction sont dans les trois rapports spécialisés ci-dessous. La présence d'un défaut dans le code local ne prouve pas que la même version du backend est actuellement déployée. L'identité local/déployé a été vérifiée pour les règles Firebase, pas pour tout le frontend/backend.

## Ce qui a effectivement été testé

| Domaine | Contrôle réalisé | Ce que cela ne valide pas |
| --- | --- | --- |
| Pages publiques | 27 requêtes de production réussies : 15 routes et 12 variantes de langue, redirections canoniques suivies, HTML applicatif présent. Audit local des pages/SEO également réussi. | Un HTTP 200 ne teste pas chaque interaction ni chaque traduction rendue. |
| Inscription | Formulaire réel ouvert ; choix Élève/Pro/Club présents. Logique e-mail client/pro/club, rollback, vérification et refus exercés en mémoire. | Inscription complète, consentement, connexion Google réelle et clic de vérification. |
| Clients | Liste déployée rendue, 36 lignes. Formulaire « Nouveau client » ouvert au clavier, champs et action d'enregistrement présents ; fermé sans soumission. Routes ajout/rattachement/quotas testées en mémoire. | Nouveau compte Firebase réel, réception du message et connexion sous le client. |
| Nutrition | Liste déployée rendue avec 12 bilans. Formulaire « Nouveau suivi diététique » ouvert, puis annulé sans création. Tests de calcul, création, identité, attente et erreurs. | Création/partage/consultation complète par un nouveau client réel. |
| Dashboard | Production affichée avec données client/programmes/Nutrition et calendrier ; aucune erreur console capturée sur cette observation. | Tous les rôles, tous les volumes et un temps maximal garanti. |
| Programmes | Liste déployée, menu manuel/guidé et builder vierge ouverts ; aucune sauvegarde. Tests de duplication, synchronisation, concurrence, métriques, player et reprise. | Programme complet créé/assigné/modifié puis vérifié sous un autre compte en production. |
| Planning | Formulaire réel ouvert ; variantes Sport/Nutrition et récurrence présentes. Bouton Ajouter désactivé sans données requises. Fermé sans créer d'événement. Routes transactionnelles testées en mémoire. | Réception e-mail, calendrier externe et cycle réel coach → client. |
| Player mobile | Version locale : réglages ouverts à 390 × 844 puis 844 × 390, dimensions réelles mesurées ; défilement jusqu'à Intensité, bouton Fermer accessible. | Safari iPhone physique, zones de sécurité matérielles, sons/vibrations et déploiement de cette correction. |
| Statistiques | Page déployée rendue, sans alerte ni indicateur de chargement restant au contrôle. Logique de chargement testée. | Exactitude indépendante de tous les agrégats et de tous les filtres. |
| Réglages coach | Page déployée rendue : langue, e-mails, didacticiel, abonnement, sécurité et bouton portail Stripe présents, sans alerte. Aucune préférence modifiée. | Enregistrement des réglages, modification d'abonnement, changement de mot de passe et suppression de compte. |
| Paiements | 27 prix Stripe LIVE actifs, EUR/cadences attendues ; portail et webhook actifs. 39 scénarios de routes simulées dont 6 échecs. | Ouverture réelle d'un nouveau Checkout, paiement, 3DS, refus, annulation et livraison réelle. |
| E-mails | Inscription/reset/activation et déclencheurs programme/Nutrition/abonnement inspectés ; succès, préférences, anti-doublons, échecs testés avec SMTP simulé. | Réception effective, spam, liens expirés/réutilisés et configuration exacte des triggers déployés. |
| Autorisations | Refus de plusieurs routes non authentifiées constatés en local et production ; règles déployées comparées ; identités lues sans modification et anonymisées. | Validation négative complète inter-comptes en émulateur. |

Les interactions pointeur sur certains boutons de production n'ont pas eu d'effet observable dans le navigateur de contrôle. L'activation clavier a permis d'ouvrir les formulaires Clients, Nutrition et planning. Ce constat est une **incertitude de test**, pas une panne générale confirmée du site ni une validation du tactile mobile.

Le player portrait mesuré occupe le viewport ; son corps défile sur 613 px. En paysage, le dialogue est contenu entre y=24 et y=366 dans un écran haut de 390 px, la dernière option est visible entre y=241 et y=262 et Fermer entre y=309 et y=349 après défilement. L'override de viewport a été réinitialisé.

## Résultats automatisés

- `npm run lint`, `npm run build`, `npm run test:deploy`, `npm run test:footer-i18n`, `npm run test:tutorial-i18n` : réussis.
- 22 commandes métier existantes réussies ; liste complète dans le rapport workflows.
- Smoke existant : 51/51 contrôles ; protections de déploiement : 17 contrôles.
- Nutrition : 1 474 scénarios de logique/calcul ; moteur sport : 9 936 combinaisons synthétiques. Ces nombres ne constituent ni une validation médicale ni des milliers de parcours utilisateurs réels.
- Comptes, nouveaux tests : 22 scénarios conformes et 4 anomalies reproduites.
- Paiements, nouveaux tests : 33 conformes / 6 assertions en échec.
- Workflows, nouveaux tests : 18 conformes / 6 assertions en échec, notifications comprises.
- Les nouveaux scripts passent ESLint. Les scripts paiements/workflows retournent volontairement un code 1 pour leurs anomalies non corrigées ; le script comptes retourne 0 lorsque son diagnostic termine et liste séparément ses anomalies.

Le build respecte les budgets gzip : initial 514,7 KiB / 520, dashboard 62,9 / 70. L'avertissement Vite sur les gros chunks reste présent. Un budget de taille respecté ne garantit pas une ouverture instantanée.

L'ancien audit HTTP supposait une réponse immédiate 200 et échouait sur une redirection 301 de production. Le nouvel audit suit ces redirections : 27/27 réponses finales 200. Les 50–304 ms relevées concernent uniquement la récupération HTML, **pas le chargement complet des données du dashboard**.

## Chargements : ne pas confondre affichage et fraîcheur

Aucun nouveau benchmark exhaustif de toutes les pages n'a été effectué dans ce tour. Les mesures locales antérieures restent documentées dans [COACH_DASHBOARD_PERFORMANCE.md](/Users/tommarie/Projects/BYL-project/docs/COACH_DASHBOARD_PERFORMANCE.md) : dernier dashboard environ 1,3 s pour afficher la copie enregistrée, puis environ 4,1–5,4 s pour les données entièrement actualisées, et 6 s à la première acquisition des versions. Ce sont des mesures locales datées, pas une garantie production/mobile.

Les tests de cache, concurrence, délais et reprise passent, mais les nouveaux défauts de concurrence montrent que « les chargements sont bornés » ne suffit pas à garantir « aucune ancienne donnée ne remplace la nouvelle ».

## Limites et validation restant à terminer

L'environnement disponible est branché à Firebase et Stripe réels. Aucun compte, bilan, programme, événement, abonnement ou paiement réel n'a été créé/modifié par cet audit ; aucun message n'a été envoyé. Les consultations normales peuvent générer la télémétrie habituelle du site.

L'ouverture réelle d'un nouveau Checkout n'a pas été tentée : ce chemin peut créer/rattacher un client Stripe même sans paiement. Aucun débit n'a été effectué. Une clé Stripe test et des comptes applicatifs dédiés sont nécessaires pour valider sereinement toute la chaîne demandée. Une boîte mail de test autorisée est également nécessaire pour contrôler la réception et les liens.

Pas de connexion sous Alex, ni sous les clientes citées. Les profils legacy/dupliqués repérés ne suffisent pas à expliquer leur connexion ; aucun compte réel n'a été réinitialisé pour contourner ce manque de session de test.

À couvrir en recette dédiée : tous les rôles/packs/essais et quotas ; connexion à partir des e-mails ; chaque entrée de création Nutrition ; sauvegarde et assignation multi-appareils ; création/modification/annulation/récurrence planning ; paiement réussi/refusé/3DS/différé, annulation et reprise de webhook ; portail/factures ; messages entre comptes ; statistiques avec données de référence ; Admin Geo avec consentement et changement d'identité ; exports PDF rendus et calendriers externes ; fichiers/Storage ; erreurs réseau, mobile physique et accessibilité. Les tests/source de certains de ces modules ont été inspectés, mais ils ne sont pas marqués entièrement validés.

Ordre recommandé : sécuriser les comptes et règles d'accès, corriger la chaîne de paiement, corriger pertes/doublons de données, puis effectuer les parcours réels sur préproduction et refaire une vérification après déploiement. Aucun déploiement automatique n'est recommandé avant les correctifs prioritaires.

## Rapports et preuves

- [Comptes, accès et e-mails](/Users/tommarie/Projects/BYL-project/docs/AUDIT_ACCOUNTS_2026-09-09.md)
- [Paiements Stripe](/Users/tommarie/Projects/BYL-project/docs/AUDIT_PAYMENTS_2026-09-09.md)
- [Nutrition, programmes, planning et notifications](/Users/tommarie/Projects/BYL-project/docs/AUDIT_WORKFLOWS_2026-09-09.md)

Scripts ajoutés : `auditAccounts.cjs`, `auditAccountsDeployedRules.cjs`, `auditPaymentsMock.cjs`, `auditPaymentsStripeReadOnly.cjs`, `auditPublicLive.mjs`, `auditWorkflowsRoutes.cjs`, `auditWorkflowsClientActions.cjs`, `auditWorkflowsNotifications.cjs`, dans `scripts/`. Les scripts de reproduction en mémoire n'utilisent ni Firebase réel ni Stripe/SMTP réels ; les scripts de lecture réseau sont distincts.
