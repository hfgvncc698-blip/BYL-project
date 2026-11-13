# Lot 8A — risques, limites et décision

**Aucun déploiement autorisé. P0-3 et P0-4 restent ouverts.** Aucun accès aux données réelles, aucune modification des règles, aucune suppression de données utilisateur. Les bases et profils utilisés par les tests sont exclusivement jetables et synthétiques.

## Compromis des changements

- Clients : les indicateurs des pages suivantes sont chargés à la consultation. Les racines restent exhaustives ; les filtres métier exigeant toutes les statistiques restent plus coûteux. Le cache partiel ne doit jamais être pris pour une synthèse complète. La navigation utilise toujours les contrôles et versions existants.
- Messages : les 50 premières lignes accélèrent l’affichage, mais « Afficher davantage » est nécessaire pour parcourir la suite sans recherche. L’API reçoit toujours l’inbox autorisée complète. Une sélection profonde peut forcer davantage de lignes pour garder le contact sélectionné visible. Pas d’économie de lectures revendiquée sur cette correction.
- Notifications : au-delà de trois conversations nouvelles simultanées, une notification récapitulative remplace les toasts nominatifs individuels. La liste et les badges restent disponibles ; aucune confirmation de lecture n’est produite par le regroupement.
- Mobile : vérifier le breakpoint et les redimensionnements sur les appareils cibles ; le contrôle de largeur ne confère aucun droit.
- Aucune projection serveur nouvelle, migration ou modification de la progression canonique. Les grands historiques et indicateurs globaux peuvent toujours dépasser les cibles.

## Limites de qualification

Le banc est un serveur Vite de développement avec profils Chrome froids, sur machine locale et émulateurs. Le code réel, AuthProvider et les routes montées sont conservés ; les fonctionnalités dont les routes ne sont pas montées renvoient 404, elles ne sont pas remplacées par des succès vides. Les timings ne sont pas des percentiles ni un SLA de production. Les ressources initiales incluent les sources et dépendances de développement.

L’absence d’activité réseau pendant 1,5 seconde n’est pas une preuve de fin de toutes les tâches secondaires. Les écouteurs et attentes HTTP peuvent rester ouverts. Les tableaux nomment ce jalon « stabilisation observée », et non « chargement complet garanti ». La date de confirmation des données principales est mesurée séparément quand le composant fournit un signal fiable.

Le compteur de composants relève les instances engagées via le hook DevTools dans le banc ; ce n’est pas un nombre de nœuds DOM. Il ajoute un coût de mesure, identique avant/après. Les temps CPU proviennent de CDP. Les tailles réseau de CDP ne mesurent pas toute la durée future des flux Firestore ouverts.

Les métriques de lecture et écritures sont des opérations/estimations documentaires sur émulateur. Elles n’incluent pas une facturation réelle, tous les index, une infrastructure distante, ni les métriques internes de tous les services externes. Les scripts et preuves précisent leur périmètre.

Le stress exploratoire avec 20 000 validations a atteint une limite de canal de l’émulateur ; une autre erreur de canal fermé a imposé de préparer les fixtures avant l’ouverture des navigateurs. Ces essais ne servent pas à annoncer un gain applicatif. Les dépassements de délai de rendu sont conservés comme résultats incomplets, sans inventer leur durée de fin.

## Sécurité conservée

Barrière d’identité, mémoire privée, rejet des réponses tardives, vérifications de rôle/Club, révocation, contrôles serveur, brouillons et confirmations restent en place. Les anciens caches locaux et la révocation Auth externe ne sont pas corrigés par ce lot. Le nettoyage hérité reste désactivé par défaut ; pas de purge utilisateur.

## Suite proposée

Avant publication : validation explicite de ce lot, qualification des P0 ouverts, benchmarks répétés sur build distribué et appareils cibles, métriques complètes des flux, essais réseau lent et charge backend. Une éventuelle pagination serveur de répertoire ou projection de progression doit conserver les filtres, la compatibilité historique et la révocation ; aucune mise en œuvre supplémentaire engagée ici.

Arrêt après la livraison des résultats, en attente de validation. Aucun autre lot commencé.
