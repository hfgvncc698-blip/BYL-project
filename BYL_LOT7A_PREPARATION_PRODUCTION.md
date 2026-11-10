# Lot 7A — préparation de la production

Campagne du 10 novembre 2026. Branche `codex/firebase-performance-audit`, version applicative `e476b0a4cfcd6bb9e27515c69a5416325e480f6e`. Campagne locale sur fixtures synthétiques.

## Confirmé par test

**Avis défavorable à la production.** Le build et les tests Functions de calendrier réussissent. La séparation inter-clubs échoue dans deux parcours, et la désactivation Auth externe seule laisse une fenêtre d’accès directe. Sur un profil Chromium partagé, le SDK restitue aussi un programme privé du compte précédent depuis le cache disque. La contre-épreuve à deux API et les essais de bail utilisent de vrais processus locaux. Le calendrier couvre deux attentes, les changements d’heure à Paris, les anciennes dates, la liste d’attente FIFO et les réservations concurrentes.

## Observé dans le code


Élément | État versionné | Vérification à prévoir avant publication
--- | --- | ---
PM2 | backend/ecosystem.config.js déclare byl-api et byl-cron dans /var/www/byl-backend, sans replicas explicites. NODE_INTERPRETER optionnel, NODE_ENV, TZ=Europe/Paris et CRON_ENABLED=true pour le cron. | Inventorier processus actifs, démarrages externes et valeur effective des paramètres.
Expiration et cycles | Passe d’adhésion chaque minute. membership-expiry.worker.js existe séparément, hors manifeste. Écoute de tête de file, rattrapage périodique, baux. Les essais et les programmes historiques ont leur propre calendrier. | Écarter les doublons entre PM2, ordonnanceur système et autre hôte. Vérifier qu’un arrêt laisse le bail récupérable.
Fonctions | functions/index.js programme runLifecycleEmailJobs à 09:00 Europe/Paris en europe-west1. Les notifications et révisions Firestore dépendent d’événements. | Confirmer configuration et reprises en préproduction autorisée. Les métadonnées historiques du Lot 3 ne constituent pas un contrôle courant.
Dépendances | Le manifeste Functions requiert Node 22, firebase-admin, firebase-functions, modules calendrier, Stripe et transports email. Aucun changement cumulé des manifestes backend/Functions ni des lockfiles. Le package racine ajoute measure:firestore:lot1. | Rejouer le build avec le Node cible et dépendances verrouillées. Vérifier secrets SMTP, APP_BASE_URL et configuration Stripe sans en journaliser les valeurs.
Index | firestore.indexes.json comporte 15 composites (12 sessions, 2 users, 1 subscription_cycle_jobs) et 8 entrées fieldOverrides. Les règles ont changé aux lots de sécurité et de projections. | Comparer définition et état READY de chaque index dans un environnement autorisé. Rejouer les requêtes ciblées et les replis.
Proxy | Les deux fichiers nginx versionnés couvrent en-têtes et redirections. Les attentes de messagerie mesurées durent 24 s et sont renouvelées. | Vérifier délais de lecture et interruptions du proxy, annulation à la déconnexion, reprise derrière deux instances et après redémarrage.
Caches et collecte | BYL_FIRESTORE_METRICS active l’instrumentation volontaire. BYL_COACH_LIST_VIEWS=off permet le calcul canonique sans vue. Persistance Firestore multi-onglet lorsque disponible. | Tester expiration, refus serveur et navigateur partagé. Surveiller constructions de vues, coûts listeners et pics de mémoire.
Configuration locale | GCLOUD_PROJECT dédié demo, FIRESTORE_EMULATOR_HOST et FIREBASE_AUTH_EMULATOR_HOST en loopback. VITE_API_BASE/VITE_API_URL concernent les routes client. Java 21 utilisé pour les émulateurs. | Séparer strictement identifiants, endpoints et secrets. Aucun paiement, mail ou job distant pour qualifier les fixtures.


## Retour arrière par lot


Lot | Commit | Procédure à qualifier
--- | --- | ---
1 | 4e65de8 | Désactiver la collecte optionnelle. Conserver un moyen de comparer les compteurs.
2A | 4b1d084 | Rétablir ensemble le client et son API de prévisualisation. Maintenir la vérification serveur des crédits.
2B | a14e066 | Maintenir les routes compatibles avec les anciens clients et vider les réponses en vol.
2B.1 | 3955d59 | Conserver les contrôles de droits au réveil et les protections des mutations.
2B.2 | 31009aa | Garder marqueurs et règles de révocation actifs. Revenir séparément sur la mutualisation après drainage des attentes.
3 | bff7eaf | Arrêter le consommateur, attendre les baux, reprendre sur un seul worker. Contrôler les opérations déjà livrées.
4 | a2661ad | Désactiver les vues de liste, vérifier la reconstruction canonique et renouveler les caches de périmètre.
5 | 866241d | Réactiver les lecteurs historiques, vérifier les comptes sur les historiques canoniques. Aucune conversion destructive.
6 | e476b0a | Rétablir ensemble les routes et lecteurs de période. Garder les index tant que des lecteurs en dépendent.


## Hypothèse

Une multiplication des réplicas derrière le proxy peut augmenter les admissions, les écoutes et le coût des reconnexions. Mesurer latences, taux de redémarrage, coût marginal d’un message et budget mémoire par instance.

## Non vérifié

PM2 actuellement actif, configuration du proxy amont, SLA et alertes, version Node de production, IAM, index déployés, coûts Cloud et disponibilité effective des secrets. Aucun accès distant dans cette campagne. Aucun retour arrière appliqué.

Pour une prochaine validation, exiger les contre-tests S1 et S2 au vert sur les routes et leurs variantes historiques, une politique de désactivation avec garantie démontrée, une politique de cache sur appareil partagé avec tests hors ligne, puis un essai sur la volumétrie cible. La décision de lancer le Lot 7B appartient au responsable du projet.
