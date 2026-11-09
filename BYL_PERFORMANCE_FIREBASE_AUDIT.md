# BYL — audit des lectures Firestore et du chargement

9 novembre 2026 · branche `codex/firebase-performance-audit` · code audité `02ad24f87b782e0591dd5dbc28f348f61ecb7811`.

**Décision proposée.** Instrumenter d’abord les offres sur le dashboard coach, la messagerie, les workers et l’administration géographique. Chacun peut répéter des lectures sans modification des données. Une mesure limitée au navigateur d’un coach manquerait le bruit de fond des workers et les lectures d’un onglet admin. En parallèle, mesurer le coût d’un changement de calendrier et celui du retour à la page Clients.

**Point de départ.** Le relevé communiqué pour octobre indique 23 602 147 lectures, 11,66 € de lectures, 37,41 GiB de transfert Europe → Europe et 2,89 € de transfert pour environ quatre utilisateurs. Ce sont des totaux fournis, sans ventilation par route, base, jour ou révision déployée. L’audit porte sur les sources Git et un essai local en mémoire. Il n’y a pas encore de mesure avant/après en production.

## 1. Ce que le commit du 18 octobre a changé

Comparaison directe de `8d8841573f8d24b28f2041b7eed83ed11d3042ca` à `61abede5ba6fd15e7f59de0a1254d1011285a45d` (« agenda et rapidité de chargement », 16 h 52 heure de Paris). Le diff touche 168 fichiers. Les références de ligne dans le reste du rapport pointent vers le code audité, qui contient aussi des changements ultérieurs.

| Chemin | Diff observé | Conséquence à vérifier |
|---|---|---|
| App, DashboardMessagingBubble, useMemberClubContacts | La bulle, auparavant montée sur les dashboards coach et client, est aussi montée sur le club, le profil et les messages. Le mode notifications seules exécute le hook avant de rendre `null`. Le délai de 10 s et la reconstruction backend préexistaient. | Augmentation de la durée de polling et coexistence avec la boîte de réception. Vérifier les minutes de présence par route. |
| Clients, CoachDashboard | Les trois sélections de clients par propriétaires historiques sont démarrées plus tôt. Sur Clients elles précèdent la restauration asynchrone du snapshot. Le dashboard met aussi les séances en concurrence avec le reste du chargement. | Peut raccourcir un démarrage à froid et engager des lectures sur un retour chaud. Le déplacement des mêmes appels dans le diff ne prouve pas un triplement des requêtes. |
| OfferPreviewStore, coachOffers, ClientMemberships | Nouveau polling de l’API des offres toutes les 30 s par consommateur monté. Nouvelle interrogation des demandes de résiliation toutes les 30 s. | Coût même sans intervention. La Map d’offres partage le résultat publié, chaque hook crée encore son minuteur. |
| backend/utils/batchedFieldReads.js | Déduplique les valeurs, les groupe par dix, concurrence maximale de quatre requêtes et limite de 500 par groupe. | Peut réduire les doublons et la latence. Le nombre de documents renvoyés dépend toujours de chaque groupe. |
| analytics.js, fonctions, App | Une recherche d’événements par visiteur est ajoutée dans le détail administrateur. Les préchargements de routes ajoutés importent des modules. Les parcours de notifications ont aussi changé. | Séparer ouverture du détail, page principale, import JS, montage de composant et lecture backend. |
| Hypothèses concurrentes | Les trois listeners historiques du calendrier coach existaient dès septembre. Le sweep d’expiration et le polling AdminGeo existent dans le parent. | Peuvent expliquer le niveau de fond, ou un pic si activation, volume ou durée de consultation a changé. |

Pour établir la causalité des 20–22 octobre, superposer aux quantités horaires disponibles les heures de **déploiement effectif** frontend, API, Functions et workers, le nombre d’instances et les ouvertures de pages. Comparer parent, commit et HEAD sur la même fixture, avec le même scénario. Un effet reproductible prouve un mécanisme. Sa contribution au mois exige aussi la fréquence réelle. Sans télémétrie historique par route, l’attribution exacte peut rester indéterminée.

## 2. Inventaire des chemins et classement

L’annexe localise les sites SDK, leur fonction ou route englobante et l’expression interrogée. Le tableau suivant relie les principaux sites à leur déclencheur et à leur volume. Les priorités représentent l’ordre de mesure. Elles ne représentent pas une part connue de la facture.

| Priorité et chemin | Déclencheur et données effectivement demandées | Cache, duplication et risque |
|---|---|---|
| Très haute · messagerie club | Bulle et page Messages montent séparément le hook contacts. Premier appel, puis 10 s après chaque réponse, focus et événement de lecture. Sur ClubDashboard, useClubUnreadCount relit le même annuaire toutes les 20 s. ClubMessagingPanel relit les contacts toutes les 20 s et le fil ouvert toutes les 10 s. | Garde « busy » par instance seulement sur le hook. Plusieurs onglets ou composants multiplient le travail. Même un badge demande noms et aperçus. |
| Très haute · backend clubMessaging | `directory` lit le club et quatre listes limitées chacune à 1 000 (utilisateurs, membres, clients par deux champs). `contacts` ajoute un get de conversation par contact, y compris absent. Pour un membre, cinq requêtes d’identité limitées à 100, un dossier direct et un annuaire par club découvert. | Pas de cache du service. La déduplication des dossiers intervient après lecture. Le plafond d’une liste peut masquer des personnes dans les grands clubs. |
| Très haute · conversations ouvertes | Pour messages, lecture et envoi, le middleware `authorize` reconstruit aussi l’annuaire puis vérifie la conversation. La page de messages lit jusqu’à 51 documents, en renvoie 50, et lit le document curseur si fourni. `/read` refait un get avant écriture. `/send` lit un reçu transactionnel et, selon le cas, le cours. | Relecture de la même page au repos. Préserver anti-doublon, changement de compte destinataire et aperçu admin en lecture seule. La messagerie coach/client classique utilise aussi des listeners de conversations dans useMessagingContacts. |
| Très haute · jobs indépendants du trafic | PM2 configure le cron actif. `runMembershipExpiry` appelle `expireAll` au plus une fois/minute par instance. Lecture de tous les clubs puis de tous les `privateClients` club par club, avant filtrage par date à Paris. Un second worker dédié peut exécuter le même travail selon installation. `runSubscriptionCycles` interroge les jobs dus toutes les 5 s au plus, limite 20. | Aucun navigateur requis. Configuration effective et nombre de réplicas inconnus. Avec C clubs et D dossiers privés, une passe complète visite C + D documents avant les traitements d’expiration. Même une file de jobs vide peut coûter. Préserver les échéances et les traitements exactement une fois au niveau métier. |
| Très haute · AdminGeo | `AdminGeo.jsx:696`, toutes les 15 s tant que la page admin est montée, plus événements de visite. `analytics.js:394`, quatre collections entières dont les historiques horaires et quotidiens, puis agrégations et détails. | La sélection de fenêtre dans l’interface n’empêche pas ces quatre lectures. Volume croissant avec l’historique, même si un seul admin ouvre la page. Mesurer aussi la transaction analytics d’une navigation, distincte de la consultation. |
| Haute · Dashboard Coach | `fetchData` cherche les clients par trois champs, modèles, séances, puis programmes par client et historiques par programme. Nutrition a un cache distinct. Trois listeners sessions par coachId, createdBy, ownerId sans borne de dates. Un changement après initialisation, focus ou retour visible peut déclencher `fetchData({ force: true, silent: true })` avec regroupement à 750 ms. | Cache coach/club 15 min, snapshot périmé jusqu’à 7 jours, pool borné. Le pool limite la concurrence, pas le volume. Une édition ou un focus peut relire des domaines indépendants. Préserver les trois formes de propriété historique. |
| Haute · Clients | `fetchData` lance trois getDocs limités à 150 chacun avant IndexedDB. Un cache mémoire/localStorage peut déjà avoir affiché la page. `buildClientComputedStats` lit les programmes de chaque dossier puis les séances de chaque programme. Certaines vues enrichissent aussi les bilans. Les modèles coach sont demandés séparément, limite 200. | Jusqu’à trois listes qui se recouvrent avant fusion. Un `limit` isolé ne fournit pas la page suivante. Certains échecs deviennent des listes vides, à distinguer d’une suppression au moment de mettre en cache. |
| Haute · Dashboard Client | Un listener programmes par dossier lié publie la liste rapide. Chaque snapshot reparcourt `snap.docs`, puis charge sessionsEffectuees, coach et difficultés pour chaque programme. Guards de version sur résultats en retard. Listeners distincts pour sessions et nutrition. | Un seul changement peut réentraîner les lectures de tous les programmes du dossier. La première projection remet la progression à zéro avant enrichissement. Mesurer les relances sur validation, reprise et modification distante. |
| Haute · Club et calendriers | Au montage, focus et toutes les 60 s, demandes des échéances et annulations. Participants si formulaire groupe, cours sélectionné ou calendrier déjà alimenté. L’effet dépend aussi de `summary` entier. `/clubs/summary` appelle expireClub, lit tous les rendez-vous et jusqu’à 50 programmes pour chacun des 200 premiers clients, en plus des autres requêtes. | Une référence summary nouvelle peut relancer l’effet même si le club et le cours sont identiques. Les modifications rappellent souvent loadSummary. Les composants annulations, packs et abonnements ont leurs propres cycles à 30/60 s. Le minuteur de `setNow` sert seulement à l’affichage. |
| Haute selon usage · statistiques, nutrition, admin | StatisticsPageCoach relit clients par trois champs (500 chacun), programmes, historiques et bilans. CoachNutritionPage refait les listes et bilans par dossier. AdminDashboard lit les groupes members et programmes et utilise getCountFromServer pour les compteurs. AdminEmails parcourt les groupes programmes avec limites. | Les clés de pages amortissent les retours, les vues partagent des sources sans partager nécessairement leurs lectures. Séparer graphique agrégé, recherche et détail. Confirmer la proportion d’ouvertures admin. |
| Variable · banque, builder, vue, player | ExerciseBank lit toutes les collections du catalogue, cache RAM 5 min et promesses partagées. Après restauration Firestore locale, rafraîchissement global. SessionPlayer dispose d’un warmup qui appelle explicitement cette fonction. ProgramView peut finir par un scan de collection si ses recherches ciblées échouent. Builder lit historiques de séances et de modifications par programme. | Le nombre d’exercices domine le transfert, les variantes multilingues multiplient les recherches de secours. Distinguer import de module et warmup de données. |
| Variable · premium, offres et paiement | PremiumPrograms fusionne deux requêtes sur des champs historiques, charge le document complet au détail. OfferPreviewStore peut avoir plusieurs minuteurs pour un UID. Stripe, paiements, crédits, annulations utilisent aussi des transactions et contrôles d’accès. | Préserver contrats, tarifs, droits, garanties de transaction et rejouabilité des webhooks. Optimiser la consultation et mesurer les retries indépendamment des écritures. |
| Fond · Functions et opérations ponctuelles | `functions/index.js` déclenche des traitements sur messages, séances, assignations, abonnements, nutrition et cycles. `runLifecycleEmailJobs` à 09 h Paris interroge notamment trials et programmes. Worker essais toutes les 10 min et recherche quotidienne de clients actifs pour l’ancien cycle mensuel. Imports, migrations et scripts manuels figurent à part en annexe. | Une écriture métier peut déclencher plusieurs fonctions, transactions ou reprises. Mesurer par type d’événement et tentative. Une présence de code de maintenance ne prouve pas son exécution en octobre. |

### Chemin ajouté le 18 octobre à mesurer en priorité sur le dashboard coach

La carte « Aujourd’hui » monte OfferPaymentPreview et, hors club, OfferRenewalAlerts. Tous deux appellent useOfferPreview. Le dashboard rend cette carte dans deux variantes responsives et une troisième sous condition de disposition. Une variante masquée par CSS reste montée. Ces appels figurent déjà dans le diff du 18 octobre. Le service autorisé de lecture des offres (`backend/utils/coachOffers.js:23` et `:44`) lit le profil du demandeur, son document d’offres puis **trois requêtes sessions sans limite de date**, sur coachId, createdBy et ownerId. Il fusionne les séances seulement après leur lecture pour calculer les crédits.

Essai local du vrai `createCoachOffers(db).get` sur une fixture contenant un coach actif, aucune offre enregistrée et douze séances portant chacune les trois champs historiques. **5 opérations SDK et 37 documents existants retournés** pour un seul chargement autorisé des offres, dont 36 résultats correspondant à 12 séances distinctes. Le handler lance les recherches même lorsque la liste de contrats est vide. Dans cette fixture, éviter les recherches de séances lorsque le calcul n’a aucun contrat à traiter serait une économie vérifiable de trois requêtes et 36 résultats par appel, sous réserve de tester la parité du calcul.

Le nombre de hooks montés ne donne pas directement le nombre de requêtes HTTP. `src/utils/requestCoordinator.js`, déjà présent au 18 octobre, regroupe les GET identiques simultanés d’apiFetch tant qu’aucune mutation n’est active. Il ne conserve pas le résultat pour le cycle suivant. En revanche, `clubMessagingApi.js` passe directement par fetch. Compter séparément ticks des composants, hits HTTP et documents SDK pour le coach avec et sans contrats. Les crédits à réserver sur une action utilisateur exigent toujours une validation sur les données canoniques.

### Navigation commune et autorisations

Pour un client ou un membre professionnel qui hérite du nom de navigation, Navbar interroge `/client-profile/navigation-brand` au montage, toutes les 60 s si visible et au focus. `backend/utils/navigationBranding.js:25` lit deux documents et cinq requêtes d’identité avant les résolutions conditionnelles du coach/club. Mesurer cette charge sur toute navigation authentifiée. `AuthContext.jsx:755` écoute le profil connecté et le parcours de connexion peut relire ce profil après écriture. Conserver le signal de révocation et l’accès à jour. Le minuteur d’horloge de l’accès dans AuthContext actualise uniquement l’heure locale. AdminClientDiagnostics utilise des alias getDoc/getDocs qui forcent explicitement le serveur, pour le diagnostic manuel d’un dossier.

### Essai local du service de contacts

Essai exécuté en mémoire, avec le vrai `createClubMessaging(db).contacts` puis la boucle de lecture des conversations de la route. Fixture synthétique d’un club, un propriétaire, douze clients liés chacun par authUid, liste members vide, aucune conversation existante. Les faux snapshots appliquent les filtres sur ces douze clients. Les compteurs ci-dessous excluent le middleware Firebase, `previewFor/getUserRole`, le réseau et les règles.

| Appel rejoué | Opérations get | Documents existants renvoyés par le faux SDK, répétitions incluses | Contacts envoyés |
|---|---:|---:|---:|
| Propriétaire, club explicite | 18 | 15 | 12 |
| Même propriétaire, découverte implicite | 19 | 16 | 12 |
| Membre lié à un dossier | 13 | 15 | 1 |

Pour le propriétaire explicite, on peut reproduire le compteur par 1 lecture du demandeur + 1 du club + 4 requêtes d’annuaire + 12 recherches de conversations absentes. Pour le membre, le résultat ne contient qu’un contact malgré la lecture de la liste du club. Ce test démontre la multiplicité des appels et l’écart entre documents lus et éléments présentés. Son résultat ne donne ni un montant facturé ni une fréquence d’usage réelle.

## 3. Hypothèses et protocole du lot 1

| Hypothèse à départager | Expérience contrôlée | Signature recherchée |
|---|---|---|
| Le nouveau dashboard d’octobre relit les séances au repos | Dashboard indépendant ouvert, variantes mobile/tablette/desktop, comptes avec zéro puis plusieurs contrats. Comparer hits /coach-offers et retours des trois champs sessions, incrémenter uniquement le volume historique. | Cycles de 30 s, volume lié aux séances même sans contrat. Mesurer la coalescence HTTP et le nombre de cartes montées. |
| Les workers dominent au repos | Fixture identique, aucun navigateur, fenêtres avec worker seul puis sans worker, file vide et dossiers échus/non échus. Vérifier les process réellement actifs. | Périodicités 5 s, 60 s et 10 min distinctes. Les lectures d’expiration suivent le nombre de dossiers privés. |
| Une page ouverte explique le pic | Comparer coach immobile, profil, Messages, club puis AdminGeo, une page à la fois pendant 10 min. Refaire avec deux onglets, masqués puis visibles. | Hits par route et volume par tick, même sans écriture. Les compteurs doivent distinguer annuaire, fil, badge et géographie. |
| La navigation chaude ou le calendrier dominent | Froid puis chaud, focus seul, modification d’un unique événement. Mesurer fetchData, templates backend, nutrition et historiques séparément. | Demandes par domaine et documents rendus pour une seule action. Vérifier chevauchement initial snapshot/getDocs. |
| La validation sportive recharge des dossiers indépendants | Modifier un programme dans un dossier qui en contient plusieurs, puis répéter une validation depuis deux onglets. | Nombre d’historiques chargés hors du programme touché, convergence de l’état local et du résultat confirmé. |
| Le transfert provient de gros documents | Rejouer templates avec versions identiques, catalogue et programmes détaillés. Mesurer trafic Firestore → backend séparément du HTTP compressé backend → navigateur. | `coachProgramRead.js` projette les champs puis relit les documents changés si nécessaire. Réponse HTTP courte possible malgré la lecture de chaque projection. |

**Comptage prévu.** Introduire une instrumentation opt-in à étiquettes fixes. Pour le web, envelopper les appels réels et les callbacks des listeners. Distinguer get local, get serveur forcé, source par défaut, démarrage/arrêt et rattachement de listener, premier snapshot, metadata.fromCache, hasPendingWrites, size et docChanges par type. Un rappel local ou metadata seul doit rester identifiable. Pour Express, créer un contexte par requête avec route normalisée et identifiant de corrélation aléatoire éphémère. Compter les lectures dans les services, y compris getAll, agrégations, transactions et tentatives. Pour les jobs et Functions, même schéma avec déclencheur statique, tentative, durée et nombre de documents effectivement retournés. Consigner également hit/miss/stale de chaque cache, nombre de promesses rejointes, poids HTTP réel et erreurs par code. Mesurer les résultats manquants séparément. Exporter des compteurs agrégés vers les outils de mesure, sans écrire une métrique Firestore à chaque lecture.

**Confidentialité.** Liste blanche de dimensions (rôle, domaine, scénario, opération, révision, source, code d’erreur). Exclure identifiants de comptes/clubs/documents, paramètres de requête, contenus de programmes, provenance précise, emails, textes de messages, en-têtes, tokens et secrets. Injecter un identifiant de scénario non personnel dans le banc de test. Échantillonner la télémétrie éventuelle en exploitation, sans exporter les logs existants non expurgés.

**Rapprochement.** Dans un projet de test isolé, utiliser les mêmes jeux de données synthétiques et les mêmes fenêtres UTC pour chaque révision. Séparer navigateur, backend, Functions et travail de fond, avec et sans concurrence. Reporter nombre de requêtes, documents reçus/existants, octets, p50/p95 du premier contenu et du retour chaud, délai de convergence, erreurs et nombre d’exécutions. Fixer appareil, réseau et état de cache. Enregistrer une fenêtre témoin sans trafic. L’émulateur valide les invariants fonctionnels. Pour octobre, rapprocher par projet, base si disponible, région, jour et SKU les quantités de Monitoring et de Cloud Billing, puis crédits et prix effectivement appliqués. Vérifier fuseau et délai de publication. Conserver les totaux observés et l’écart non attribué.

**Facturation.** Une requête vide peut supporter un minimum, un lot de documents peut engendrer plusieurs lectures, et des vérifications de règles par get/exists/getAfter peuvent ajouter du travail. Les reconnects des listeners dépendent de la persistance et de la durée de déconnexion. Certaines requêtes à plusieurs champs de plage et les agrégations peuvent lire des entrées d’index facturables. Identifier les requêtes candidates, notamment file par statut/lease et plages datées, compter les champs de plage selon les règles Firestore, vérifier avec Query Explain sur fixture contrôlée. Une définition d’index composite seule ne prouve aucun coût. Comparer les métriques d’usage à la facturation finale. [Tarification Firestore](https://firebase.google.com/docs/firestore/pricing) · [Mesure de l’activité](https://firebase.google.com/docs/firestore/monitor-usage)

## 4. Architecture proposée et invariants

1. **Cache et isolation.** Étendre `pageDataCache.js` (mémoire, écritures différées, restauration dédupliquée) et `dashboardSnapshotCache.js` (IndexedDB compressé, métadonnées et éviction). Firestore utilise déjà la persistance multi-onglets avec fallback. Réutiliser requestCoordinator pour les GET simultanés compatibles, respecter les annulations indépendantes et la barrière de mutation existante. Ajouter au niveau des domaines Firestore une promesse réseau par clé et une génération de session. Clé versionnée comprenant UID authentifié, identité consultée, rôle réel/effectif, club, domaine, paramètres, période et curseur. La clé Clients actuelle contient le coach effectif et les filtres mais ne distingue pas le demandeur. La clé coach inclut le club. Invalider au retour d’une mutation confirmée, écarter les réponses d’une génération périmée, purger caches sensibles et files d’écriture sur logout, changement de compte, club ou révocation. Protéger explicitement la restauration depuis un onglet ancien. Le cache ne décide jamais d’un droit. Restreindre l’affichage hors ligne au périmètre déjà autorisé selon la politique du produit, avec état de fraîcheur explicite. Un cache de 7 jours n’est pas une garantie de fraîcheur. TanStack Query apporterait déduplication et invalidation, mais imposerait une coordination avec les deux couches existantes. Tester ces deux capacités sur les caches actuels avant toute dépendance.
2. **Messagerie.** Distinguer recherche paginée d’annuaire à la demande, liste des fils actifs et contenu paginé d’un fil. Réutiliser les documents de conversation, lastMessageAt et readAt. Pour le club, privilégier un flux API authentifié d’événements ciblés (ou un delta borné si l’infrastructure ne porte pas de flux). Firestore ne définit pas de règle cliente dédiée à clubConversations. Conserver le contrôle serveur, dont le rôle, l’appartenance active, la liaison au destinataire et l’aperçu admin. Revalider sur changement de droits et fermer les flux révoqués. Un flux par périmètre actif, rafraîchissement au focus/reconnect avec curseur stable, repli en cas de coupure. Entre onglets, diffuser seulement une invalidation cloisonnée, reprise si l’onglet responsable disparaît. Ne retirer le polling actuel qu’après preuve de réception, notifications, pagination et accusés. Utiliser un watermark monotone du dernier message effectivement affiché pour éviter de marquer lu un message arrivé entre affichage et confirmation.
3. **Coach et Clients.** Partitionner clients, programmes, calendrier, progression, nutrition, statistiques, notifications. Réutiliser la projection et les versions backend des modèles. Afficher cache frais immédiatement et éviter les revalidations en double. Une mutation d’événement modifie uniquement les périodes et compteurs concernés. Pour les trois champs propriétaires, garder l’union autorisée jusqu’à migration vérifiée vers une identité canonique. Fusion par ID, suivre la provenance par requête pour ne retirer un événement que lorsqu’il sort de toutes les sources. Pour la liste, curseur stable par champ historique, déduplication entre pages, filtres/recherche exacts sur tout le jeu et index adaptés. Les détails restent disponibles à la demande.
4. **Client et progression.** Garder la projection rapide plus le dernier état enrichi par couple dossier/programme. Appliquer docChanges et invalidations issues des écritures d’historique (une sous-collection peut changer sans événement du parent). Réutiliser les fonctions métier de calcul des séances, total, prochaine séance, difficultés et reprise. Conserver les transactions existantes du player. Clé d’opération déterministe adaptée à la séance *et à son occurrence*, protection contre retry/double validation, mise à jour optimiste avec identifiant temporaire, confirmation ou correction ciblée sur erreur. Résumé versionné par programme incluant dernière séance, comptages selon les règles existantes et repère de reprise. Vérifier les séances répétables, le plan modifié et les dossiers liés avant de s’en servir pour les pourcentages.
5. **Calendriers.** Abonnement partagé par identité autorisée et fenêtre affichée, bornes locales converties en instants, intervalles semi-ouverts, chevauchements inclus. Couvrir les séries créées avant la fenêtre, leurs exceptions, déplacements entre deux périodes et annulations. Indexer occurrences ou matérialiser une fenêtre bornée pour les récurrences selon le modèle actuel. Garder une source compatible pour dates/champs anciens jusqu’à réconciliation, synchroniser la nouvelle fenêtre avant d’écarter l’ancienne. Réservations, capacités et présences restent validées côté serveur. Au reconnect, rattrapage des ajouts, suppressions et déplacements, y compris ceux d’un autre utilisateur.
6. **Club et workers.** Charger les détails des sections à l’ouverture, partager les listes entre badge et panneau. Distinguer identité stable du club et période de la référence de summary. Extraire les rendez-vous et les participants du résumé global. Pour l’expiration, construire un index des dossiers avec échéance, requête bornée des échéances effectivement dépassées, curseur et reprise idempotente, vérification des dates locales déjà utilisées. Comparer le résultat au sweep historique avant bascule. Conserver le traitement au bon instant des sorties et des jobs de paiement. Adapter le réveil d’une file vide avec une borne de latence conforme au service, ou déclencher à l’écriture avec rattrapage.
7. **Catalogue et autres modules.** Versionner le catalogue partagé par section, avec publication atomique manifeste + données et fallback à la dernière version complète. Vérifier d’abord l’éligibilité des données et la couverture des personnalisations, langues et droits. Une modification admin doit changer la version, y compris lors d’un import. Résoudre les exercices par identifiant stable puis alias indexés pour les programmes anciens. Miniatures dimensionnées pour la liste, média complet à l’ouverture. Mesurer octets et coût de rafraîchissement. Pour statistiques, afficher les agrégats puis charger les séries au détail. Pour premium, paginer les résumés et conserver les droits d’achat côté serveur. Pour AdminGeo, requêter la fenêtre demandée, puis les détails par curseur. Pour les offres, partager requête et invalidation versionnée entre consommateurs. Différer les sauvegardes de brouillon seulement si la reprise, le flush et la gestion d’échec sont vérifiés.

## 5. Migration et réconciliation

| Projection candidate | Source canonique et unité | Validation avant utilisation |
|---|---|---|
| Progression, dernière séance et activité client | Historiques, programmes et séances, un résumé par programme/dossier avec version et révision source. Tenir compte de la provenance coach et des reprises. | Recalcul exact des numérateurs/dénominateurs, prochaine séance et dates. Inclure correction, suppression, modification d’objectif, replay et anciens formats. |
| Indicateur non lu | Message et marqueur de lecture par côté/participant autorisé et conversation. Réutiliser la comparaison temporelle existante. Compteur matérialisé seulement si le coût de la liste active le justifie. | Vérifier messages simultanés, retry d’envoi, lecture partielle et révocation de l’appartenance. |
| Statistiques coach/club et activité récente | Agrégats par périmètre, période et domaine, accès serveur ou règles minimales testées. Partitionnement si contention observée. | Égalité avec détail canonique et traitement des changements de club, suppressions et antériorité. |

Créer les projections facultatives sous version de schéma. Écritures autoritatives côté serveur, transaction sur la contribution par événement ou recalcul déterministe depuis une révision connue. Un événement déjà traité doit produire le même résultat, un événement ancien ne doit pas écraser un état plus récent. Couvrir créations, mises à jour, suppressions et transferts d’identité. Rétroremplissage paginé, checkpoints, débit plafonné, mode simulation, reprise après interruption. Commencer sur données synthétiques puis périmètre autorisé. Lire en parallèle un échantillon ancien/nouveau, consigner uniquement écarts agrégés et coût additionnel de migration. En cas de divergence ou résumé manquant, servir la source canonique et reconstruire le périmètre. Activer progressivement par domaine, garder une bascule réversible vers les lectures existantes et borner la durée de double lecture. Toute exécution en production relève d’une autorisation distincte.

## 6. Lots, fichiers cibles et critères d’acceptation

Les fichiers indiqués sont les points d’intervention proposés, à confirmer avec la mesure. Les modules de télémétrie indiqués comme nouveaux n’existent pas dans la branche auditée. Chaque lot livre diff, justification, tests, écarts, risques, bilan mesuré et attend validation avant le suivant.

| Lot | Fichiers prévus | Preuve attendue et risque principal |
|---|---|---|
| 1 · mesure | Nouveaux `src/utils/firestoreMetrics.js`, `backend/utils/firestoreMetrics.js`. Points d’entrée `src/utils/api.js`, `backend/utils/coachOffers.js`, `src/utils/coachDashboardLoading.js`, `backend/app.js`, `backend/utils/clubMessaging.js`, `backend/routes/clubMessaging.js`, `backend/routes/analytics.js`, `backend/cron.worker.js`, `backend/membership-expiry.worker.js`, `functions/index.js` et sites prioritaires du tableau. | Counters web/API/jobs confrontés à un spy SDK et à la fixture, sources cache isolées, surcharge de la mesure contrôlée. Rejouer parent/commit/HEAD avant correction. |
| 2 · messagerie | `src/components/messaging/{useMemberClubContacts.js,useClubUnreadCount.js,clubMessagingApi.js,ClubMessagingPanel.jsx,DashboardMessagingBubble.jsx,useMessagingContacts.js}`, `src/pages/MessagingPage.jsx`, `backend/{routes,utils}/clubMessaging.js`, `src/App.jsx`. | Aucun cycle d’annuaire pour attendre des messages. Fil, badge, lecture, notification et reconnexion fiables à deux onglets. Risque de lecture indue ou non-lu perdu. |
| 3 · coach et clients | `src/components/{CoachDashboard,Clients}.jsx`, `src/utils/{coachDashboardLoading,pageDataCache}.js`, `backend/routes/coachProgramRead.js`, `backend/utils/programListSummary.js`, `src/components/offers/OfferPreviewStore.js`, `backend/utils/coachOffers.js`. | Vérifier le coût des offres au repos et la parité des crédits. Navigation chaude, clients historiques dans tous les filtres et pages, aucune relecture de nutrition après simple mouvement de calendrier. |
| 4 · progression | `src/components/{Clientdashboard,SessionPlayer,ProgramView}.jsx`, `src/utils/{programDisplayMetrics,programWriteOperations}.js`, `functions/index.js`. | Parité historique, reprise et prochaine séance, absence de double comptage, traitements hors ordre et refus serveur testés. |
| 5 · club et calendriers | `src/pages/ClubDashboard.jsx`, `src/components/dashboard/{CoachDashboardCalendar,ClientDashboardCalendar,ClubMobileCalendar,SessionCancellationRequests,ClientCancellationUpdates,ClubSessionPacks}.jsx`, `src/components/{CoachDashboard,Clientdashboard}.jsx`, `backend/routes/{clubs,coachSessions}.js`, `backend/utils/clubMemberships.js`, workers du lot 1, `firestore.indexes.json` si nécessaire. | Coût borné à la période ou à l’échéance. Parité des séries et réservations, échéances strictement conservées. Risque de rendez-vous ou sortie manqués. |
| 6 · caches et autres modules | `src/utils/{dashboardSnapshotCache,pageDataCache,persistedPageCache}.js`, `src/AuthContext.jsx`, `src/components/{ExerciseBank,ProgramBuilder,ProgramView,SessionPlayer}.jsx`, `src/components/offers/OfferPreviewStore.js`, `src/pages/{StatisticsPageCoach,CoachNutritionPage,PremiumPrograms,AdminGeo}.jsx`, `backend/routes/{analytics,payments,coachOffers}.js`. | Version du catalogue, purge et clés vérifiées, parité des statuts et abonnements, diminution des appels d’admin et des octets par scénario. |
| 7 · validation | Suites de `scripts/`, en particulier `testFirestoreRules.cjs`, `testClubMessaging.cjs`, `testCoachCalendarLiveSync.mjs`, `testPlayerProgramSync.mjs`, `testSessionResume.mjs` et `testCoachDashboardLoading.mjs`. | Tableau avant/après à données et réseau comparables, tests de rôle et démonstration mobile. Mention explicite des scénarios non vérifiés et de l’écart Billing restant. |

## 7. Matrice de validation et estimation

| Scénarios | Vérifications |
|---|---|
| Première ouverture, retour chaud, navigation rapide et focus | Affichage utile chronométré depuis l’action de navigation, cache observable, résultats périmés rejetés. Cibles de retour < 200 ms, dashboard en cache < 500 ms, première visite 1–2 s sur bonne connexion. Conserver distribution et conditions du test. |
| Deux onglets, logout, nouveau compte, changement de club et aperçu admin | Révoquer les accès pendant un chargement, une persistance différée et un flux. Vérifier isolation des réponses, de l’écran et des données stockées, y compris sur terminal partagé. Exécuter les tests des règles et des routes Admin SDK séparément. |
| Calendrier coach/client/club | Éditer, reporter entre deux plages, annuler une occurrence, confirmer présence et réserver simultanément la dernière place. Inclure mobile, semaine à cheval sur un changement d’heure, récurrence ancienne, permissions et reconnexion. UI optimiste, confirmation distante ou restauration. |
| Création/modification de programme, validation et reprise de séance | Réessayer après erreur et saisir depuis deux appareils. Comparer progression, dernière séance, détails et prochaine séance par programme, y compris anciens dossiers. |
| Réception, notifications, non lus | Message quand la liste est fermée, fil actif, second onglet masqué, coupure puis reconnexion. Comparer état des deux parties, lecture et notifications sans double envoi. |
| Hors ligne et reconnexion | Démarrer avec cache, modifier si le métier le permet, reconnecter après mutation distante et après révocation. Vérifier rattrapage des suppressions et des opérations non confirmées. |
| Mobile et langues | Vérifier routes clés en viewport mobile, dates locales/Paris, recherche traduite, langues RTL et changement de langue pendant chargement. Mesurer poids des images et rendu principal sur réseau mobile contrôlé. |
| Volume et maintenance | Fixtures multi-clubs, plusieurs champs d’identité par dossier, dépassement des limites actuelles, gros historiques, fichiers catalogue anciens, jobs vides et reprises de backfill. Comparer une journée type avec et sans interfaces ouvertes. |

L’état initial ne permet pas d’annoncer une économie en euros. Le potentiel le plus direct est proportionnel au **nombre de reconstructions évitées × documents parcourus par reconstruction**. Pour une modification de programme, on peut viser l’élimination des lectures d’historiques des programmes non concernés. Pour un calendrier chargé par période, le gain dépend de la proportion d’événements hors fenêtre, pour AdminGeo de la fraction d’historique hors période, pour le worker du ratio dossiers examinés/dossiers réellement échus. Déduire les lectures et écritures nouvelles des agrégats, les rattrapages et le coût ponctuel de migration. Les essais locaux valident des mécanismes. Les € et GiB économisés seront renseignés lorsque les compteurs et la comparaison Billing seront disponibles.

**Arrêt de l’intervention.** Ce rapport précède le lot 1. Sa validation explicite est le prochain jalon.

## Annexe A — répertoire des sites SDK

Parcours syntaxique de 727 fichiers JavaScript/TypeScript suivis, via Babel (JSX inclus). Les bundles, dépendances, répertoires temporaires et clients Data Connect générés sont exclus. Le relevé compte **960 expressions candidates dans 151 fichiers**. Les imports seuls ne sont pas comptés. Les alias d’import et les lecteurs passés en paramètre sont indiqués. Les get de transactions clientes sont inclus. Les scripts et mocks sont isolés. Une déclaration collectionGroup décrit la portée et le get qui la consomme est une autre ligne.

Les appels SDK.get sont détectés par forme syntaxique (get sans argument ou lecteur transactionnel connu). Les appels indirects ou dynamiques nécessitent le contexte du service. Le compteur statique n’est ni une trace de production ni un nombre de requêtes par utilisateur. Les numéros de ligne se rapportent à la révision auditée. Pour un helper réutilisé, sa fréquence est celle de ses appelants. Les volumes exacts, le chevauchement des résultats et la fréquence de chaque site seront mesurés au lot 1.

| Opération | Frontend | Backend | Functions | Scripts et tests |
|---|---:|---:|---:|---:|
| SDK.collectionGroup | 0 | 4 | 3 | 1 |
| SDK.get | 25 | 446 | 62 | 104 |
| SDK.getAll | 0 | 2 | 0 | 0 |
| SDK.listCollections | 0 | 2 | 0 | 0 |
| SDK.listDocuments | 0 | 1 | 0 | 0 |
| collectionGroup | 2 | 0 | 0 | 0 |
| getCountFromServer | 3 | 0 | 0 | 0 |
| getDoc | 83 | 0 | 0 | 1 |
| getDocFromCache | 2 | 0 | 0 | 0 |
| getDocFromServer | 4 | 0 | 0 | 0 |
| getDocs | 159 | 0 | 0 | 0 |
| getDocs transmis | 1 | 0 | 0 | 0 |
| getDocsFromCache | 2 | 0 | 0 | 0 |
| getDocsFromCache transmis | 1 | 0 | 0 | 0 |
| getDocsFromServer | 5 | 0 | 0 | 0 |
| onSnapshot | 47 | 0 | 0 | 0 |

### Frontend

<details>
<summary>src/AuthContext.jsx · 13 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 357 | findClientProfileForAuthUser | getDocs | `q` |
| 482 | syncVerifiedEmailAccount | getDoc | `userRef` |
| 755 | AuthProvider | onSnapshot | `userRef` |
| 846 | AuthProvider | getDoc | `userRef` |
| 850 | AuthProvider | getDoc | `userRef` |
| 876 | loginWithEmail | getDoc | `ref` |
| 883 | loginWithEmail | getDocFromCache | `ref` |
| 943 | loginWithGoogle | getDoc | `userRef` |
| 956 | loginWithGoogle | getDoc | `userRef` |
| 1017 | loginWithApple | getDoc | `userRef` |
| 1026 | loginWithApple | getDoc | `userRef` |
| 1134 | refreshEmailVerification | getDoc | `userRef` |
| 1150 | refreshEmailVerification | getDoc | `userRef` |

</details>

<details>
<summary>src/analytics/analyticsStore.js · 3 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 62 | saveAnalyticsGeo | SDK.get | `geoAllVisitorRef` |
| 63 | saveAnalyticsGeo | SDK.get | `geoDailyVisitorRef` |
| 64 | saveAnalyticsGeo | SDK.get | `geoHourlyVisitorRef` |

</details>

<details>
<summary>src/components/AdminDashboard.jsx · 28 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 1007 | AdminDashboard | getDocs | `query(collection(db, "admin_audit_logs"), orderBy("createdAt", "desc"), limit(12))` |
| 1070 | AdminDashboard | getDocs | `collection(db, colName)` |
| 1132 | AdminDashboard | getDocs | `query(dailyCol, orderBy("day", "desc"), limit(45))` |
| 1133 | AdminDashboard | getDocs | `collection(db, "clubs")` |
| 1134 | AdminDashboard | getDocs | `collectionGroup(db, "members")` |
| 1134 | AdminDashboard | collectionGroup | `db` |
| 1135 | AdminDashboard | getDocs | `query(collection(db, "users"), where("role", "==", "coach"))` |
| 1136 | AdminDashboard | getCountFromServer | `progCol` |
| 1137 | AdminDashboard | getCountFromServer | `clientsCol` |
| 1138 | AdminDashboard | getDocs | `clientsCol` |
| 1139 | AdminDashboard | getDocs | `progCol` |
| 1140 | AdminDashboard | getDocs | `query(collection(db, "users"), where("role", "==", "particulier"))` |
| 1141 | AdminDashboard | getDocs | `collectionGroup(db, "programmes")` |
| 1141 | AdminDashboard | collectionGroup | `db` |
| 1277 | AdminDashboard | getDoc | `doc(db, "users", creatorId)` |
| 1278 | AdminDashboard | getDoc | `doc(db, "coachs", creatorId)` |
| 1371 | AdminDashboard | getDoc | `doc(db, "users", creatorId)` |
| 1372 | AdminDashboard | getDoc | `doc(db, "coachs", creatorId)` |
| 2130 | loadLinkedPrograms | getDocs | `collection(db, "clients", clientId, "programmes")` |
| 2165 | loadLinkedPrograms | getDocs | `qy` |
| 2208 | openClientDrawer | getDoc | `doc(db, "users", userLookupId)` |
| 2220 | openClientDrawer | getDoc | `doc(db, "clients", explicitLinkedClientId)` |
| 2232 | openClientDrawer | getDocs | `query(collection(db, "clients"), where("email", "==", emailKey))` |
| 2280 | openClientDrawer | getDoc | `doc(db, "clients", clientLookupId)` |
| 2286 | openClientDrawer | getDocs | `query(collection(db, "users"), where("email", "==", emailKey), limit(1))` |
| 2351 | openCoachDrawer | getDoc | `doc(db, "users", id)` |
| 2402 | openCoachDrawer | getDocs | `query(collection(db, "clients"), where("createdBy", "==", id))` |
| 2417 | openCoachDrawer | getDocs | `query(collection(db, "programmes"), where("createdBy", "==", id))` |

</details>

<details>
<summary>src/components/AssignProgram.jsx · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 58 | AssignProgram | getDocs | `q` |
| 83 | handleAssignProgram | getDoc | `baseRef` |

</details>

<details>
<summary>src/components/AutoProgramPreview.jsx · 11 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 699 | findExerciseDocFromFirestore | getDoc | `directRef` |
| 702 | findExerciseDocFromFirestore | getDocs | `query(collection(db, col), where("id", "==", exId), limit(1))` |
| 710 | findExerciseDocFromFirestore | getDocs | `query(collection(db, col), where("nom", "==", exName), limit(1))` |
| 716 | findExerciseDocFromFirestore | getDocs | `query(collection(db, col), where("name", "==", exName), limit(1))` |
| 723 | findExerciseDocFromFirestore | getDocs | `query(collection(db, col), where( translations.${lng}.nom , "==", exName), limit(1))` |
| 821 | findExerciseVariantDoc | getDoc | `doc(db, directCol, id)` |
| 832 | findExerciseVariantDoc | getDocs | `query(collection(db, col), where("nom", "==", wanted), limit(1))` |
| 838 | findExerciseVariantDoc | getDocs | `query(collection(db, col), where("name", "==", wanted), limit(1))` |
| 845 | findExerciseVariantDoc | getDocs | `query(collection(db, col), where("id", "==", id), limit(1))` |
| 856 | findExerciseVariantDoc | getDocs | `collection(db, col)` |
| 1299 | resolveCoachNameFromCreatedBy | getDoc | `doc(db, "users", raw)` |

</details>

<details>
<summary>src/components/ClientCreation.jsx · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 325 | handleSubmit | getDocs | `qDup` |

</details>

<details>
<summary>src/components/ClientNutritionDailyJournal.jsx · 7 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 272 | ClientNutritionDailyJournal | onSnapshot | `ref` |
| 299 | ClientNutritionDailyJournal | onSnapshot | `historyQuery` |
| 317 | ClientNutritionDailyJournal | onSnapshot | `feedbackRef` |
| 331 | ClientNutritionDailyJournal | onSnapshot | `feedbackCollection(clientId)` |
| 1112 | CoachNutritionDailySummary | onSnapshot | `q` |
| 1120 | CoachNutritionDailySummary | onSnapshot | `feedbackCollection(clientId)` |
| 1173 | CoachNutritionDailySummary | onSnapshot | `doc(db, "clients", clientId, "nutrition_assessments", latestAssessmentId)` |

</details>

<details>
<summary>src/components/ClientNutritionSection.jsx · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 158 | ClientNutritionSection | onSnapshot | `q` |

</details>

<details>
<summary>src/components/ClientNutritionSharedSection.jsx · 3 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 882 | ClientNutritionSharedSection | onSnapshot | `query(collection(db, "clients", sourceClientId, "nutrition_assessments"), where("clientShare.enabled", "==", true))` |
| 913 | ClientNutritionSharedSection | onSnapshot | `feedbackQuery` |
| 1211 | ClientNutritionSharedSection | getDoc | `doc(db, "users", coachId)` |

</details>

<details>
<summary>src/components/ClientView.jsx · 16 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 411 | resolveProgrammeDisplayNameFromClientDoc | getDoc | `doc(db, "programmes", baseId)` |
| 764 | GlobalClientView | onSnapshot | `doc(db, "clients", clientId)` |
| 853 | reloadProgrammes | getDocsFromCache | `programmesRef` |
| 861 | reloadProgrammes | getDocs | `programmesRef` |
| 876 | reloadProgrammes | getDocs | `collection(db, "clients", requestedClientId, SUBCOL_PROGRAMMES, d.id, SUBCOL_SESSIONS_DONE)` |
| 879 | reloadProgrammes | getDocs | `collection(db, "clients", requestedClientId, SUBCOL_PROGRAMMES, d.id, SUBCOL_DIFFICULTE_NOTES)` |
| 976 | GlobalClientView | onSnapshot | `collection(db, "clients", clientId, SUBCOL_PROGRAMMES)` |
| 983 | GlobalClientView | onSnapshot | `collection(db, "clients", clientId, SUBCOL_PROGRAMMES, id, SUBCOL_SESSIONS_DONE)` |
| 1014 | GlobalClientView | onSnapshot | `collection(db, "clients", clientId, "measurements")` |
| 1208 | duplicateProgramme | getDoc | `srcRef` |
| 1225 | duplicateProgramme | getDoc | `doc(db, "programmes", linkedBaseId)` |
| 1325 | loadBaseProgrammes | getDocs | `query(collection(db, "programmes"), where("createdBy", "==", assignmentCoachUid), limit(300))` |
| 1326 | loadBaseProgrammes | getDocs | `query(collection(db, "programmes"), where("coachId", "==", assignmentCoachUid), limit(300))` |
| 1328 | loadBaseProgrammes | getDocs | `collection(db, "programmes")` |
| 1368 | handleAssignProgramme | getDoc | `doc(db, "programmes", baseId)` |
| 1435 | handleAssignProgramme | SDK.get | `clientRef` |

</details>

<details>
<summary>src/components/Clientdashboard.jsx · 21 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 464 | resolveCoachDisplay | getDoc | `doc(db, 'users', createdBy)` |
| 471 | resolveCoachDisplay | getDoc | `doc(db, 'coachs', createdBy)` |
| 479 | resolveCoachDisplay | getDocs | `query(collection(db, 'users'), where('email', '==', authorEmail))` |
| 484 | resolveCoachDisplay | getDocs | `query(collection(db, 'coachs'), where('email', '==', authorEmail))` |
| 783 | ClientDashboard | getDoc | `doc(db, "clients", previewClientIdParam)` |
| 790 | ClientDashboard | getDoc | `doc(db, "users", accountUid)` |
| 867 | ClientDashboard | onSnapshot | `doc(db,'clients',clientId)` |
| 1045 | fetchDifficultyMap | getDocs | `collection(db, 'clients', cId, 'programmes', programmeId, colName)` |
| 1131 | ClientDashboard | getDocs | `q1` |
| 1131 | ClientDashboard | getDocs | `q2` |
| 1212 | publishNutrition | onSnapshot | `query(collection(db, "clients", nextLogClientId, "nutrition_daily_logs"), orderBy("dateKey", "desc"), limit(7))` |
| 1222 | ClientDashboard | onSnapshot | `query(collection(db, "clients", sourceClientId, "nutrition_assessments"), where("clientShare.enabled", "==", true))` |
| 1288 | ClientDashboard | onSnapshot | `qA` |
| 1301 | ClientDashboard | onSnapshot | `query(collection(db,'sessions'),where('clientDocId','==',id))` |
| 1308 | ClientDashboard | onSnapshot | `query(collection(db, 'sessions'), where('userId', '==', user.uid))` |
| 1326 | ClientDashboard | onSnapshot | `progCol` |
| 1401 | ClientDashboard | getDocs | `collection(db, 'clients', cId, 'programmes', d.id, 'sessionsEffectuees')` |
| 1625 | ClientDashboard | getDocs | `query(collection(db, 'sessions'), where('clientId', '==', user.uid))` |
| 1626 | ClientDashboard | getDocs | `query(collection(db, 'sessions'), where('clientDocId', '==', clientId))` |
| 1645 | ClientDashboard | onSnapshot | `colRef` |
| 1919 | openPremDetails | getDoc | `ref` |

</details>

<details>
<summary>src/components/Clients.jsx · 9 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 97 | warmClientRoute | getDocs | `collection(db, "clients", clientId, "programmes")` |
| 355 | buildClientComputedStats | getDocs | `collection(db, "clients", clientId, SUBCOLL_PROGRAMMES)` |
| 369 | buildClientComputedStats | getDocs | `sessEffCol` |
| 528 | Clients | getDocs | `query(collection(db, "programmes"), where("createdBy", "==", effectiveCoachUid), orderBy("createdAt", "desc"), limit(200))` |
| 529 | Clients | getDocs | `query(collection(db, "programmes"), where("createdBy", "==", effectiveCoachUid), limit(200))` |
| 628 | Clients | getDocs | `clientQuery` |
| 694 | Clients | getDocsFromCache | `clientQuery` |
| 803 | Clients | getDocs | `collection(db, "clients", c.id, "nutrition_assessments")` |
| 933 | loadProgram | SDK.get | `tplRef` |

</details>

<details>
<summary>src/components/CoachDashboard.jsx · 22 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 1926 | CoachDashboard | getDoc | `doc(db, "users", adminCoachId)` |
| 2193 | CoachDashboard | getDoc | `doc(db, "clubs", clubId, "goals", getGoalDocId(clubGoalPeriod, clubGoalPeriodKey))` |
| 2324 | CoachDashboard | getDoc | `doc(db, "users", effectiveCoachUid)` |
| 2406 | CoachDashboard | getDocFromCache | `doc(db, "users", effectiveCoachUid)` |
| 2415 | CoachDashboard | getDoc | `doc(db, "users", effectiveCoachUid)` |
| 2712 | CoachDashboard | getDoc | `doc(db, [valeur], effectiveCoachUid)` |
| 2791 | loadNutritionRows | getDocs | `collection(db, "clients", clientId, "nutrition_assessments")` |
| 2794 | loadNutritionRows | getDocs | `query(collection(db, "clients", clientId, "nutrition_feedback"), orderBy("createdAt", "desc"), limit(5))` |
| 2853 | loadAndWatch | onSnapshot | `collection(db, "clients", clientId, "nutrition_assessments")` |
| 3221 | CoachDashboard | getDocs | `collection(db, "clients", client.id, "programmes")` |
| 3225 | CoachDashboard | getDocs | `collection(db, "clients", client.id, "programmes", d.id, "sessionsEffectuees")` |
| 3401 | CoachDashboard | getDocs | `query(collection(db, "clients"), where("createdBy", "==", effectiveCoachUid), limit(500))` |
| 3406 | CoachDashboard | getDocs | `query(collection(db, "clients"), where("coachId", "==", effectiveCoachUid), limit(500))` |
| 3407 | CoachDashboard | getDocs | `query(collection(db, "clients"), where("coachIds", "array-contains", effectiveCoachUid), limit(500))` |
| 3459 | fallback | getDocs | `progsQ` |
| 3492 | CoachDashboard | getDocs | `sessionQuery` |
| 3619 | CoachDashboard | getDocs | `collection(db, "clients", client.id, "programmes")` |
| 3634 | CoachDashboard | getDocs | `collection(db, "clients", client.id, "programmes", d.id, "sessionsEffectuees")` |
| 4068 | CoachDashboard | getDocs | `query( collection(db, "clubs", coachClubId, "appointments"), where("coachUid", "==", effectiveCoachUid) )` |
| 4419 | CoachDashboard | onSnapshot | `query(collection(db, "sessions"), where(field, "==", effectiveCoachUid))` |
| 4473 | loadProgram | SDK.get | `doc(db, "programmes", programmeId)` |
| 4552 | handleDuplicateProgram | getDoc | `progRef` |

</details>

<details>
<summary>src/components/ExerciseBank.jsx · 4 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 152 | refreshExerciseBankData | getDocs transmis | `getDocs` |
| 169 | preloadExerciseBankData | getDocsFromCache transmis | `getDocsFromCache` |
| 1633 | ExerciseBank | getDocs | `collection(db, colName)` |
| 1797 | handleSaveExercise | getDocs | `collection(db, section)` |

</details>

<details>
<summary>src/components/FoodSurvey.jsx · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 496 | FoodSurvey | onSnapshot | `assessmentRef` |
| 529 | FoodSurvey | getDocs | `query(colRef, orderBy("updatedAt", "desc"))` |

</details>

<details>
<summary>src/components/Home.jsx · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 13 | fetchPrograms | getDocs | `collection(db, "programmes")` |

</details>

<details>
<summary>src/components/MenuJournalierAuto.jsx · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 3232 | MenuJournalierAuto | onSnapshot | `assessmentRef` |

</details>

<details>
<summary>src/components/MenuJournalierFromRation.jsx · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 707 | MenuJournalierFromRation | onSnapshot | `assessmentRef` |
| 731 | MenuJournalierFromRation | getDoc | `doc(db, "clients", clientId)` |

</details>

<details>
<summary>src/components/MenuJournalierManual.jsx · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 590 | MenuJournalierManual | onSnapshot | `assessmentRef` |

</details>

<details>
<summary>src/components/NutritionAssessmentEditor.jsx · 4 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 461 | NutritionAssessmentEditor | onSnapshot | `ref` |
| 483 | NutritionAssessmentEditor | getDoc | `doc(db, "users", clientId)` |
| 484 | NutritionAssessmentEditor | getDoc | `doc(db, "clients", clientId)` |
| 494 | NutritionAssessmentEditor | getDocs | `qs` |

</details>

<details>
<summary>src/components/NutritionRationPage.jsx · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 566 | NutritionRationPage | getDoc | `doc(db, "clients", clientId)` |
| 599 | NutritionRationPage | onSnapshot | `assessmentRef` |

</details>

<details>
<summary>src/components/ProgramBuilder.jsx · 10 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 652 | loadClientCompletionHistory | getDocs | `collection(db, "clients", clientId, "programmes")` |
| 672 | loadClientCompletionHistory | getDocs | `collection(db, "clients", clientId, "programmes", pid, "sessionsEffectuees")` |
| 673 | loadClientCompletionHistory | getDocs | `collection(db, "clients", clientId, "programmes", pid, [valeur])` |
| 714 | subscribeClientCompletionHistory | getDocs | `collection(db, "clients", clientId, "programmes")` |
| 763 | subscribeClientCompletionHistory | getDocs | `collection(db, "clients", clientId, "programmes", pid, [valeur])` |
| 776 | subscribeClientCompletionHistory | onSnapshot | `collection(db, "clients", clientId, "programmes", pid, "sessionsEffectuees")` |
| 3154 | ProgramBuilder | getDocs | `query(collection(db, "clients"), limit(500))` |
| 3169 | ProgramBuilder | getDocs | `clientQuery` |
| 3357 | ProgramBuilder | onSnapshot | `programDocRef` |
| 3941 | loadProgram | SDK.get | `doc(db, "programmes", programId)` |

</details>

<details>
<summary>src/components/ProgramCreator.jsx · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 33 | fetchClients | getDocs | `collection(db, "clients")` |

</details>

<details>
<summary>src/components/ProgramView.jsx · 13 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 711 | findExerciseDocFromFirestore | getDoc | `directRef` |
| 716 | findExerciseDocFromFirestore | getDocs | `query(collection(db, col), where("nom", "==", exName), limit(1))` |
| 722 | findExerciseDocFromFirestore | getDocs | `query(collection(db, col), where("name", "==", exName), limit(1))` |
| 729 | findExerciseDocFromFirestore | getDocs | `query(collection(db, col), where( translations.${lng}.nom , "==", exName), limit(1))` |
| 740 | findExerciseDocFromFirestore | getDocs | `query(collection(db, col), where("id", "==", exId), limit(1))` |
| 835 | findExerciseVariantDoc | getDoc | `doc(db, directCol, id)` |
| 846 | findExerciseVariantDoc | getDocs | `query(collection(db, col), where("nom", "==", wanted), limit(1))` |
| 852 | findExerciseVariantDoc | getDocs | `query(collection(db, col), where("name", "==", wanted), limit(1))` |
| 859 | findExerciseVariantDoc | getDocs | `query(collection(db, col), where("id", "==", id), limit(1))` |
| 870 | findExerciseVariantDoc | getDocs | `collection(db, col)` |
| 1308 | resolveCoachNameFromCreatedBy | getDoc | `doc(db, "users", raw)` |
| 2512 | ProgramView | getDoc | `doc(db, "clients", clientId)` |
| 2536 | subscribe | onSnapshot | `collection( db, "clients", clientId, "programmes", programId, "sessionsEffectuees" )` |

</details>

<details>
<summary>src/components/ProgramsPage.jsx · 8 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 66 | getDocs | getDocs | `ref` |
| 406 | ProgramsPage | getDocs | `query(collection(db, "clients"), where("createdBy", "==", effectiveCoachUid), limit(200))` |
| 407 | ProgramsPage | getDocs | `query(collection(db, "clients"), where("coachId", "==", effectiveCoachUid), limit(200))` |
| 408 | ProgramsPage | getDocs | `query(collection(db, "clients"), where("coachIds", "array-contains", effectiveCoachUid), limit(200))` |
| 432 | fallback | getDocs | `progQ` |
| 475 | ProgramsPage | getDocs | `collection(db, "clients", clientData.id, "programmes")` |
| 581 | handleDuplicate | getDoc | `doc(db, "programmes", progId)` |
| 652 | loadProgram | SDK.get | `tplRef` |

</details>

<details>
<summary>src/components/SessionComparator.jsx · 3 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 479 | SessionComparator | getDocs | `completionsRef` |
| 480 | SessionComparator | getDocs | `query(modificationsRef, orderBy("updatedAt", "asc"))` |
| 481 | SessionComparator | getDocs | `modificationsRef` |

</details>

<details>
<summary>src/components/SessionPlayer.jsx · 15 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 1689 | findExerciseDocFromFirestore | getDoc | `directRef` |
| 1692 | findExerciseDocFromFirestore | getDocs | `query(collection(db, col), where("id", "==", exId), limit(1))` |
| 1700 | findExerciseDocFromFirestore | getDocs | `query(collection(db, col), where("nom", "==", exName), limit(1))` |
| 1706 | findExerciseDocFromFirestore | getDocs | `query(collection(db, col), where("name", "==", exName), limit(1))` |
| 1713 | findExerciseDocFromFirestore | getDocs | `query(collection(db, col), where( translations.${lng}.nom , "==", exName), limit(1))` |
| 2897 | SessionPlayer | getDocs | `query( collection(db, "clients", clientId, "programmes", programId, "sessionsEffectuees"), where("sessionIndex", "==", sessionIndex) )` |
| 3566 | syncCompletionSideEffects | SDK.get | `programDocRef` |
| 3703 | upsertCoachCalendarEvent | getDoc | `doc(db, "clients", clientId)` |
| 3779 | upsertCoachCalendarEvent | getDoc | `plannedRef` |
| 3806 | upsertCoachCalendarEvent | getDocs | `query( collection(db, "sessions"), where("clientId", "==", clientId), where("programmeId", "==", programId), where("sessionIndex", "==", sessionIndex), limit(10` |
| 4552 | SessionPlayer | onSnapshot | `programDocRef` |
| 4642 | subscribeToProgramHistory | onSnapshot | `collection(db, "clients", clientId, "programmes", pid, "sessionsEffectuees")` |
| 4667 | subscribeToProgramHistory | getDocs | `collection(db, "clients", clientId, "programmes", pid, [valeur])` |
| 4706 | SessionPlayer | onSnapshot | `collection(db, "clients", clientId, "programmes")` |
| 4775 | run | getDoc | `doc(db, "clients", clientId)` |

</details>

<details>
<summary>src/components/admin/AdminClientDiagnostics.jsx · 5 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 34 | run | getDocFromServer | `doc(db, 'clients', clientId)` |
| 34 | run | getDocsFromServer | `collection(db, 'clients', clientId, 'programmes')` |
| 38 | run | getDocsFromServer | `collection(p.ref, 'sessionsEffectuees')` |
| 44 | run | getDocFromServer | `doc(db, 'sessions', id)` |
| 44 | run | getDocFromServer | `doc(db, 'clients', clientId, 'calendarEvents', id)` |

</details>

<details>
<summary>src/components/admin/AdminClientLocationSettings.jsx · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 13 | AdminClientLocationSettings | onSnapshot | `doc(db, 'users', uid)` |

</details>

<details>
<summary>src/components/client/AssignmentPlacement.jsx · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 22 | AssignmentPlacement | getDoc | `doc(db, 'clients', clientId)` |

</details>

<details>
<summary>src/components/client/ClientJourneyPage.jsx · 4 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 116 | ClientJourneyPage | onSnapshot | `doc(db,'clients',f.id)` |
| 117 | ClientJourneyPage | onSnapshot | `collection(db,'clients',f.id,'programmes')` |
| 121 | ClientJourneyPage | onSnapshot | `doc(db,'clients',clientId)` |
| 122 | ClientJourneyPage | onSnapshot | `collection(db,'clients',clientId,'programmes')` |

</details>

<details>
<summary>src/components/client/TrainingCycles.jsx · 8 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 52 | TrainingCycles | getDocsFromServer | `collection(db, 'training')` |
| 97 | linkProgram | SDK.get | `doc(db, 'clients', clientId, 'programmes', selectedProgram.id)` |
| 111 | persist | SDK.get | `doc(db, 'clients', clientId, 'programmes', c.programId)` |
| 132 | prepare | SDK.get | `doc(db, 'clients', clientId)` |
| 134 | prepare | SDK.get | `draftRef` |
| 149 | prepare | SDK.get | `doc(db, 'clients', clientId, 'programmes', sourceId)` |
| 154 | prepare | getDocsFromServer | `collection(db, 'clients', clientId, 'programmes', sourceId, 'sessionsEffectuees')` |
| 155 | prepare | getDocsFromServer | `collection(db, 'training')` |

</details>

<details>
<summary>src/components/messaging/MessagingThread.jsx · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 96 | MessagingThread | onSnapshot | `messagesQuery` |
| 116 | loadOlderMessages | getDocs | `query( collection(db, "conversations", conversationId, "messages"), orderBy("createdAt", "asc"), endBefore(cursor), limitToLast(pageSize) )` |

</details>

<details>
<summary>src/components/messaging/useMessagingContacts.js · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 81 | useMessagingContacts | onSnapshot | `doc(db, "conversations", contact.id)` |

</details>

<details>
<summary>src/components/offers/AssignOfferModal.jsx · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 19 | AssignOfferModal | getDocs | `query(collection(db,'clients'),where(key,key==='coachIds'?'array-contains':'==',uid))` |

</details>

<details>
<summary>src/components/updatePremiumPrograms.jsx · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 176 | run | getDocs | `q` |

</details>

<details>
<summary>src/hooks/useJourneyRecords.js · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 15 | useJourneyRecords | onSnapshot | `collection(db,'clients',clientId,'programmes',programId,'sessionsEffectuees')` |

</details>

<details>
<summary>src/hooks/useProgrammeDocument.js · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 41 | useProgrammeDocument | getDocFromServer | `candidate.ref` |

</details>

<details>
<summary>src/pages/AdminClient.jsx · 19 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 206 | loadClientPrograms | getDocs | `collection(db, "clients", clientId, "programmes")` |
| 237 | loadClientPrograms | getDocs | `qy` |
| 269 | loadUnifiedProfile | getDoc | `doc(db, "users", id)` |
| 270 | loadUnifiedProfile | getDoc | `doc(db, "users", uid)` |
| 271 | loadUnifiedProfile | getDoc | `doc(db, "clients", id)` |
| 272 | loadUnifiedProfile | getDoc | `doc(db, "clients", uid)` |
| 277 | loadUnifiedProfile | getDocs | `query(collection(db, "users"), where("email", "==", email), limit(5))` |
| 278 | loadUnifiedProfile | getDocs | `query(collection(db, "users"), where("emailLower", "==", email), limit(5))` |
| 279 | loadUnifiedProfile | getDocs | `query(collection(db, "clients"), where("email", "==", email), limit(20))` |
| 280 | loadUnifiedProfile | getDocs | `query(collection(db, "clients"), where("emailLower", "==", email), limit(20))` |
| 283 | loadUnifiedProfile | getDocs | `query(collection(db, "clients"), where("linkedUserId", "==", uid), limit(20))` |
| 284 | loadUnifiedProfile | getDocs | `query(collection(db, "clients"), where("uid", "==", uid), limit(20))` |
| 330 | enrichProgramsWithLatestSessions | getDocs | `collection(db, "clients", clientId, "programmes", program.id, "sessionsEffectuees")` |
| 452 | AdminClient | getDoc | `doc(db, "users", id)` |
| 456 | AdminClient | getDoc | `doc(db, "clients", id)` |
| 464 | AdminClient | getDoc | `doc(db, "clients", linkedClientId)` |
| 542 | AdminClient | getDoc | `doc(db, "users", coachId)` |
| 543 | AdminClient | getDoc | `doc(db, "coachs", coachId)` |
| 553 | AdminClient | getDocs | `query(collection(db, "users"), where("email", "==", lookupEmail), limit(1))` |

</details>

<details>
<summary>src/pages/AdminCoach.jsx · 6 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 415 | AdminCoach | getDoc | `doc(db, "users", id)` |
| 420 | AdminCoach | getDoc | `doc(db, "coachs", id)` |
| 433 | AdminCoach | getDocs | `qC` |
| 437 | AdminCoach | getDocs | `qC` |
| 472 | AdminCoach | getDocs | `buildQ()` |
| 483 | AdminCoach | getDocs | `query(collection(db, "programmes"), where("createdBy", "==", id))` |

</details>

<details>
<summary>src/pages/AdminGeo.jsx · 7 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 245 | loadAdminGeoFromFirestore | getDocs | `collection(db, "analytics_daily")` |
| 248 | loadVisits | getDocs | `query(collection(db, "analytics_daily", day, name), orderBy(field, "desc"), limit(120))` |
| 251 | loadAdminGeoFromFirestore | getDocs | `collection(db, "analytics_geo")` |
| 252 | loadAdminGeoFromFirestore | getDocs | `collection(db, "analytics_geo_daily")` |
| 253 | loadAdminGeoFromFirestore | getDocs | `collection(db, "analytics_geo_hourly")` |
| 254 | loadAdminGeoFromFirestore | getDocs | `collection(db, "analytics_daily")` |
| 385 | loadAdminGeoFromFirestore | getDoc | `doc(db, "users", uid)` |

</details>

<details>
<summary>src/pages/AdminGeoGlobe.jsx · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 20 | AdminGeoGlobe | getDocs | `collection(db, "analytics_geo")` |

</details>

<details>
<summary>src/pages/CoachNutritionPage.jsx · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 204 | CoachNutritionPage | getDocs | `clientQuery` |
| 247 | fetchAssessmentGroup | getDocs | `collection(db, "clients", clientId, "nutrition_assessments")` |

</details>

<details>
<summary>src/pages/MyPrograms.jsx · 3 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 264 | run | getDocs | `qProgs` |
| 325 | run | getDocs | `collection(db,'clients',id,'programmes')` |
| 403 | run | getDocs | `collection(db, "clients", p.clientDocId, "programmes", p.id, "sessionsEffectuees")` |

</details>

<details>
<summary>src/pages/PremiumPrograms.jsx · 4 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 304 | PremiumPrograms | getDoc | `doc(db,"users", user.uid)` |
| 332 | PremiumPrograms | getDocs | `q1` |
| 333 | PremiumPrograms | getDocs | `q2` |
| 422 | openPremDetails | getDoc | `ref` |

</details>

<details>
<summary>src/pages/ProfilePageClient.jsx · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 267 | load | getDoc | `usersRef` |

</details>

<details>
<summary>src/pages/ProfilePageCoach.jsx · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 257 | ProfilePageCoach | getDoc | `doc(db, "users", user.uid)` |

</details>

<details>
<summary>src/pages/StatisticsPageClient.jsx · 3 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 117 | getDocsSafe | getDocs | `q` |
| 272 | StatisticsPageClient | onSnapshot | `doc(db,'clients',clientId)` |
| 273 | StatisticsPageClient | onSnapshot | `collection(db,'clients',clientId,'programmes')` |

</details>

<details>
<summary>src/pages/StatisticsPageCoach.jsx · 7 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 379 | StatisticsPageCoach | getCountFromServer | `query(collection(db, "programmes"), where("createdBy", "==", user.uid), limit(500))` |
| 385 | StatisticsPageCoach | getDocs | `query(collection(db, "clients"), where("createdBy", "==", user.uid), limit(500))` |
| 386 | StatisticsPageCoach | getDocs | `query(collection(db, "clients"), where("coachId", "==", user.uid), limit(500))` |
| 387 | StatisticsPageCoach | getDocs | `query(collection(db, "clients"), where("coachIds", "array-contains", user.uid), limit(500))` |
| 430 | StatisticsPageCoach | getDocs | `collection(db, "clients", client.id, "programmes")` |
| 447 | StatisticsPageCoach | getDocs | `collection(db, "clients", client.id, "programmes", d.id, "sessionsEffectuees")` |
| 502 | StatisticsPageCoach | getDocs | `collection(db, "clients", client.id, "nutrition_assessments")` |

</details>

<details>
<summary>src/utils/clientResolver.js · 10 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 54 | tryReadDoc | getDoc | `path` |
| 63 | tryReadQuery | getDocs | `q` |
| 72 | tryGetDocsFromQuery | getDocs | `q` |
| 98 | scoreClientSnapshot | getDocs | `query(collection(db, "clients", snap.id, "programmes"), limit(options.programmesLimit    6))` |
| 110 | scoreClientSnapshot | getDocs | `query(collection(db, "clients", snap.id, "nutrition_assessments"), ...nutritionConstraints)` |
| 131 | resolveClientSnapshotForUserUncached | getDoc | `doc(db, "clients", user.linkedClientId)` |
| 158 | resolveClientSnapshotForUserUncached | getDoc | `doc(db, "clients", localClientId)` |
| 286 | resolveClientSnapshotFromIdentifier | getDoc | `doc(db, "clients", candidateId)` |
| 289 | resolveClientSnapshotFromIdentifier | getDoc | `doc(db, "users", candidateId)` |
| 295 | resolveClientSnapshotFromIdentifier | getDoc | `doc(db, "clients", linkedClientId)` |

</details>

<details>
<summary>src/utils/coachPageSummary.js · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 33 | readCoachPageSummary | getDoc | `doc(db, SUMMARY_COLLECTION, getSummaryDocId(coachUid, pageKey))` |

</details>

<details>
<summary>src/utils/firestoreAccessDiagnostics.js · 13 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 76 | runClientDataAccessDiagnostic | getDoc | `doc(db, "users", user.uid)` |
| 80 | runClientDataAccessDiagnostic | getDoc | `doc(db, "clients", user.uid)` |
| 87 | runClientDataAccessDiagnostic | getDoc | `doc(db, "clients", user.linkedClientId)` |
| 97 | runClientDataAccessDiagnostic | getDocs | `query(collection(db, "clients"), where("emailLower", "==", emailLower), limit(10))` |
| 107 | runClientDataAccessDiagnostic | getDocs | `query(collection(db, "clients"), where("email", "==", email), limit(20))` |
| 116 | runClientDataAccessDiagnostic | getDocs | `query(collection(db, "clients"), where("linkedUserId", "==", user.uid), limit(10))` |
| 124 | runClientDataAccessDiagnostic | getDocs | `query(collection(db, "clients"), where("uid", "==", user.uid), limit(10))` |
| 150 | runClientDataAccessDiagnostic | getDocs | `query(collection(db, "clients", resolvedClientId, "programmes"), limit(100))` |
| 157 | runClientDataAccessDiagnostic | getDocs | `query( collection(db, "clients", resolvedClientId, "nutrition_assessments"), ...(user?.role === "particulier" ? [where("clientShare.enabled", "==", true)] : [])` |
| 168 | runClientDataAccessDiagnostic | getDocs | `query(collection(db, "clients", resolvedClientId, "measurements"), limit(20))` |
| 175 | runClientDataAccessDiagnostic | getDocs | `query(collection(db, "sessions"), where("clientId", "==", resolvedClientId), limit(50))` |
| 184 | runClientDataAccessDiagnostic | getDocs | `query(collection(db, "sessions"), where("clientId", "==", user.uid), limit(50))` |
| 192 | runClientDataAccessDiagnostic | getDocs | `query(collection(db, "programmes"), where("origine", "==", "premium"), limit(20))` |

</details>

<details>
<summary>src/utils/messaging.js · 4 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 52 | getDocsWithoutBlockingUi | getDocs | `queryRef` |
| 199 | loadProfessionalProfile | getDoc | `doc(db, "users", professionalUid)` |
| 200 | loadProfessionalProfile | getDoc | `doc(db, "coachs", professionalUid)` |
| 216 | loadClientMessagingContacts | getDoc | `doc(db, "clients", clientId)` |

</details>

<details>
<summary>src/utils/nutritionAssessmentCalendar.js · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 30 | commitNutritionAssessment | SDK.get | `assessmentRef` |
| 32 | commitNutritionAssessment | SDK.get | `ref` |

</details>

<details>
<summary>src/utils/nutritionFeedbackService.js · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 63 | getClientNutritionFeedbackHistory | getDocs | `query(collection(db, "clients", clientId, "nutrition_feedback"), orderBy("createdAt", "desc"), limit(maxItems))` |

</details>

<details>
<summary>src/utils/nutritionPrefill.js · 8 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 152 | findExistingClientByIdentity | getDocs | `query(collection(db, "clients"), where("createdBy", "==", createdByUid))` |
| 153 | findExistingClientByIdentity | getDocs | `query(collection(db, "clients"), where("coachId", "==", createdByUid))` |
| 154 | findExistingClientByIdentity | getDocs | `query(collection(db, "clients"), where("coachIds", "array-contains", createdByUid))` |
| 164 | ensureExistingClientLinked | getDoc | `clientRef` |
| 393 | getClientNutritionPrefill | getDoc | `clientRef` |
| 393 | getClientNutritionPrefill | getDocs | `q` |
| 456 | createNutritionAssessmentDraft | getDocs | `existingQuery` |
| 533 | createNutritionAssessmentDraft | getDocs | `query(collection(db, "sessions"), where("coachId", "==", createdByUid))` |

</details>

<details>
<summary>src/utils/programWriteOperations.js · 4 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 9 | createProgramAssignmentOperation | SDK.get | `assignedRef` |
| 19 | createProgramAssignmentOperation | SDK.get | `doc(db, 'clients', clientId)` |
| 28 | createProgramAssignmentOperation | SDK.get | `doc(db, 'clients', clientId, 'programmes', currentId)` |
| 66 | createProgramCreationOperation | SDK.get | `programRef` |

</details>

<details>
<summary>src/utils/safeProgramWrite.js · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 26 | updateProgramDoc | SDK.get | `ref` |

</details>

<details>
<summary>src/utils/sessionScheduleSuggestion.js · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 28 | buildSessionScheduleSuggestion | getDocs | `query(collection(db, "sessions"), where("clientId", "==", clientId), limit(80))` |
| 35 | buildSessionScheduleSuggestion | getDocs | `query(collection(db, "clients", clientId, "calendarEvents"), limit(80))` |

</details>

<details>
<summary>src/utils/trainingCycles.js · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 139 | writeCyclePlan | SDK.get | `clientRef` |

</details>

<details>
<summary>src/utils/validateCycleDraft.js · 3 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 6 | confirmCycleDraft | SDK.get | `templateRef` |
| 12 | confirmCycleDraft | SDK.get | `assignedRefForId(template.validatedCycleAssignmentId)` |
| 17 | confirmCycleDraft | SDK.get | `clientRef` |

</details>


### Backend

<details>
<summary>backend/app.js · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 199 | GET /api/health · module | SDK.get | `db.collection('health').limit(1)` |

</details>

<details>
<summary>backend/cron.worker.js · 3 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 22 | runSubscriptionCycles | SDK.get | `db.collection('subscription_cycle_jobs').where('status','==','pending').where('leaseUntil',' =',Date.now()).orderBy('leaseUntil').limit(20)` |
| 75 | runTrialGuard | SDK.get | `db.collection('users').where('subscriptionStatus', '==', 'trialing')` |
| 116 | runMonthlyPrograms | SDK.get | `db.collection('clients').where('abonnementActif', '==', true)` |

</details>

<details>
<summary>backend/routes/adminEmails.js · 24 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 211 | resolveProfile | SDK.get | `db.collection("clients").doc(id)` |
| 212 | resolveProfile | SDK.get | `db.collection("users").doc(id)` |
| 219 | resolveProfile | SDK.get | `db.collection("users").where("email", "==", email).limit(1)` |
| 223 | resolveProfile | SDK.get | `db.collection("clients").where("email", "==", email).limit(1)` |
| 283 | loadStoredEvents | SDK.get | `db.collection("email_events").where("clientId", "==", profile.client?.id    id).limit(200)` |
| 285 | loadStoredEvents | SDK.get | `db.collection("email_events").where("userId", "==", profile.user.id).limit(200)` |
| 288 | loadStoredEvents | SDK.get | `db.collection("email_events").where("to", "==", profile.email).limit(200)` |
| 340 | loadLegacyEvents | SDK.get | `clientRef.collection("programmes")` |
| 368 | loadLegacyEvents | SDK.get | `clientRef.collection("nutrition_assessments")` |
| 387 | loadLegacyEvents | SDK.get | `assessmentSnap.ref.collection("email_logs")` |
| 410 | loadAudit | SDK.get | `db.collection("email_admin_audit").where("clientId", "==", profile.client.id).limit(100)` |
| 413 | loadAudit | SDK.get | `db.collection("email_admin_audit").where("userId", "==", profile.user.id).limit(100)` |
| 447 | loadUpcoming | SDK.get | `db.collection("clients").doc(profile.client.id).collection("programmes")` |
| 495 | loadGlobalUpcoming | SDK.get | `db.collectionGroup("programmes").where("completionEmailDueAt", " =", threshold).limit(500)` |
| 495 | loadGlobalUpcoming | SDK.collectionGroup | `db` |
| 496 | loadGlobalUpcoming | SDK.get | `db.collectionGroup("programmes").where("inactiveReminderDueAt", " =", threshold).limit(500)` |
| 496 | loadGlobalUpcoming | SDK.collectionGroup | `db` |
| 497 | loadGlobalUpcoming | SDK.get | `db.collection("users").where("subscriptionStatus", "==", "trialing").limit(500)` |
| 512 | loadGlobalUpcoming | SDK.getAll | `db` |
| 695 | POST /client/:id/send · module | SDK.get | `eventRef` |
| 795 | POST /client/:id/test · module | SDK.get | `eventRef` |
| 855 | POST /client/:id/retry/:eventId · module | SDK.get | `originalRef` |
| 872 | POST /client/:id/retry/:eventId · module | SDK.get | `originalRef` |
| 873 | POST /client/:id/retry/:eventId · module | SDK.get | `retryRef` |

</details>

<details>
<summary>backend/routes/adminSearch.js · 4 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 90 | queryEquals | SDK.get | `db.collection(col).where(field, '==', value).limit(limit)` |
| 97 | queryPrefix | SDK.get | `db .collection(col) .orderBy(field) .startAt(prefix) .endAt(prefix + '\uf8ff') .limit(limit)` |
| 113 | fetchRecent | SDK.get | `ref.orderBy('createdAt', 'desc').limit(limit)` |
| 116 | fetchRecent | SDK.get | `ref.limit(limit)` |

</details>

<details>
<summary>backend/routes/analytics.js · 29 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 358 | countSubcollection | SDK.get | `ref.collection(name).count()` |
| 394 | GET /admin/geo · module | SDK.get | `db.collection("analytics_geo")` |
| 395 | GET /admin/geo · module | SDK.get | `db.collection("analytics_geo_daily")` |
| 396 | GET /admin/geo · module | SDK.get | `db.collection("analytics_geo_hourly")` |
| 397 | GET /admin/geo · module | SDK.get | `db.collection("analytics_daily")` |
| 480 | GET /admin/geo · loadVisits | SDK.get | `db.collection("analytics_daily").doc(day).collection(name).orderBy(field, "desc").limit(120)` |
| 539 | GET /admin/geo · module | SDK.get | `db.collection("users").doc(uid)` |
| 684 | GET /admin/geo/:geoId/visitors · module | SDK.get | `db .collection("analytics_geo_daily") .doc( ${day}__${geoId} ) .collection("visitors") .limit(250)` |
| 693 | GET /admin/geo/:geoId/visitors · module | SDK.get | `db .collection("analytics_daily") .doc(day) .collection("visitors") .limit(500)` |
| 707 | GET /admin/geo/:geoId/visitors · module | SDK.get | `db.collection("analytics_geo").doc(candidateGeoId).collection("visitors_all").limit(500)` |
| 760 | GET /admin/geo/:geoId/visitors · module | SDK.get | `db.collection("users").doc(uid)` |
| 803 | GET /admin/visitor/:uid · module | SDK.get | `ref` |
| 805 | GET /admin/visitor/:uid · module | SDK.get | `db.collectionGroup("visitors") .where("visitorId", "==", visitorId) .limit(500)` |
| 805 | GET /admin/visitor/:uid · module | SDK.collectionGroup | `db` |
| 830 | GET /admin/visitor/:uid · module | SDK.get | `db.collection("analytics_daily").doc(latest.day) .collection("events").where("visitorId", "==", visitorId)` |
| 886 | GET /admin/visitor/:uid · module | SDK.get | `db.collection("users").doc(uid)` |
| 978 | POST /admin/geo/enrich · module | SDK.get | `ref` |
| 981 | POST /admin/geo/enrich · module | SDK.get | `db.collection("analytics_geo")` |
| 1107 | POST /pageview · findLinkedProfileRefs | SDK.get | `db.collection(collectionName).doc(uid)` |
| 1130 | POST /pageview · findLinkedProfileRefs | SDK.get | `q` |
| 1180 | POST /pageview · module | SDK.get | `dailyRef` |
| 1181 | POST /pageview · module | SDK.get | `dailyVisitorRef` |
| 1182 | POST /pageview · module | SDK.get | `visitEventRef` |
| 1198 | POST /pageview · module | SDK.get | `geoRef` |
| 1199 | POST /pageview · module | SDK.get | `geoAllVisitorRef` |
| 1200 | POST /pageview · module | SDK.get | `geoDailyRef` |
| 1201 | POST /pageview · module | SDK.get | `geoDailyVisitorRef` |
| 1202 | POST /pageview · module | SDK.get | `geoHourlyRef` |
| 1203 | POST /pageview · module | SDK.get | `geoHourlyVisitorRef` |

</details>

<details>
<summary>backend/routes/clientProfile.js · 9 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 165 | POST /email-change-verification · module | SDK.get | `admin.firestore().collection("users").doc(req.auth.uid)` |
| 232 | POST /activation-complete · module | SDK.get | `userRef` |
| 327 | addDocCandidate | SDK.get | `docRef` |
| 337 | addQueryCandidates | SDK.get | `queryRef` |
| 367 | findLinkedClient | SDK.get | `db.collection("clients").doc(linkedClientId)` |
| 423 | GET /resolve-client · module | SDK.get | `db.collection("users").doc(req.auth.uid)` |
| 432 | GET /resolve-client · module | SDK.get | `db.collection("clients").doc(linkedClientId)` |
| 532 | GET /email-preferences · module | SDK.get | `admin.firestore().collection("users").doc(req.auth.uid)` |
| 561 | PUT /email-preferences · module | SDK.get | `userRef` |

</details>

<details>
<summary>backend/routes/clubMessaging.js · 7 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 21 | GET /contacts · module | SDK.get | `db.collection('clubConversations').doc(c.id)` |
| 38 | USE middleware · module | SDK.get | `refFor(req.clubConversation)` |
| 49 | GET /messages · module | SDK.get | `ref.collection('messages').doc(req.query.before)` |
| 53 | GET /messages · module | SDK.get | `query.limit(51)` |
| 61 | POST /read · module | SDK.get | `ref` |
| 74 | POST /send · module | SDK.get | `receipt` |
| 80 | POST /send · module | SDK.get | `db.collection('clubs').doc(info.clubId).collection('appointments').doc(classId)` |

</details>

<details>
<summary>backend/routes/clubs.js · 76 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 46 | POST /client-administration/:clientId/welcome-retry · module | SDK.get | `scope.ref` |
| 53 | POST /client-administration/:clientId/welcome-retry · module | SDK.get | `db.collection('clubs').doc(scope.clubId)` |
| 444 | activationSenderName | SDK.get | `db.collection("users").doc(String(uid))` |
| 682 | getRequester | SDK.get | `db.collection("users").doc(uid)` |
| 736 | findUserProfileByEmail | SDK.get | `q` |
| 796 | getClubScope | SDK.get | `db.collection("clubs").doc(clubId)` |
| 797 | getClubScope | SDK.get | `db.collection("clubs").doc(clubId).collection("members").limit(200)` |
| 798 | getClubScope | SDK.get | `db.collection("users").where("clubId", "==", clubId).limit(200)` |
| 844 | POST /client-imports/:id/invite/:index · module | SDK.get | `batch` |
| 844 | POST /client-imports/:id/invite/:index · module | SDK.get | `receipt` |
| 847 | POST /client-imports/:id/invite/:index · module | SDK.get | `db.collection('clients').doc(clientId)` |
| 864 | POST /client-imports/:id/invite/:index · module | SDK.get | `clientRef` |
| 864 | POST /client-imports/:id/invite/:index · module | SDK.get | `userRef` |
| 877 | GET /client-imports/:id/rows · module | SDK.get | `s.club.collection('clientImports').doc(req.params.id).collection('rows')` |
| 895 | GET /summary · module | SDK.get | `db.collection("clients").where("clubId", "==", req.clubId).limit(1000)` |
| 896 | GET /summary · module | SDK.get | `db.collection("programmes").where("clubId", "==", req.clubId).limit(1000)` |
| 897 | GET /summary · module | SDK.get | `db.collection("clubs").doc(req.clubId).collection("appointments")` |
| 898 | GET /summary · module | SDK.get | `db.collection("clubs").doc(req.clubId).collection("goals").doc(currentGoalMonth)` |
| 901 | GET /summary · module | SDK.get | `db.collection("clients").where("clubIds", "array-contains", req.clubId)` |
| 921 | GET /summary · module | SDK.get | `db .collection("clients") .doc(client.id) .collection("programmes") .limit(50)` |
| 1029 | GET /summary · module | SDK.get | `clubRef.collection('privateClients')` |
| 1030 | GET /summary · module | SDK.get | `clubRef.collection('formerClients').where('status', '==', 'left')` |
| 1035 | GET /summary · module | SDK.get | `doc.ref.collection('paymentChecks').where('status', '==', 'unpaid').limit(1)` |
| 1123 | GET /summary · module | SDK.get | `db .collection("clients") .doc(client.id) .collection("nutrition_assessments") .limit(20)` |
| 1204 | GET /summary · module | SDK.get | `db.collection("clubs").doc(req.clubId).collection("goals").doc(goalDocId(period, key))` |
| 1265 | getClientCapacityForOwner | SDK.get | `db.collection("clubs").doc(owner.clubId)` |
| 1278 | getClientCapacityForOwner | SDK.get | `db.collection("clients").where("clubId", "==", owner.clubId).limit(limit + 1)` |
| 1279 | getClientCapacityForOwner | SDK.get | `db.collection("clients").where("clubIds", "array-contains", owner.clubId).limit(limit + 1)` |
| 1308 | getClientCapacityForOwner | SDK.get | `db.collection("clients").where("createdBy", "==", ownerUid).limit(limit + 1)` |
| 1309 | getClientCapacityForOwner | SDK.get | `db.collection("clients").where("coachId", "==", ownerUid).limit(limit + 1)` |
| 1310 | getClientCapacityForOwner | SDK.get | `db.collection("clients").where("coachIds", "array-contains", ownerUid).limit(limit + 1)` |
| 1347 | findClientSnapForUser | SDK.get | `db.collection("clients").doc(uid)` |
| 1348 | findClientSnapForUser | SDK.get | `db.collection("clients").doc("independent-" + require("../utils/independentFollowups").idFor(preferredCoachUid, uid))` |
| 1351 | findClientSnapForUser | SDK.get | `db.collection("clients").where("linkedUserId", "==", uid).limit(10)` |
| 1352 | findClientSnapForUser | SDK.get | `db.collection("clients").where("uid", "==", uid).limit(10)` |
| 1355 | findClientSnapForUser | SDK.get | `db.collection("clients").where("emailLower", "==", emailLower).limit(20)` |
| 1356 | findClientSnapForUser | SDK.get | `db.collection("clients").where("email", "==", emailLower).limit(20)` |
| 1378 | countClientPrograms | SDK.get | `clientRef.collection("programmes").limit(50)` |
| 1443 | resolveClientOwnerContext | SDK.get | `db.collection("clubs").doc(clubId)` |
| 1499 | POST /clients · module | SDK.get | `db .collection("clients") .where("emailLower", "==", email) .limit(1)` |
| 1741 | GET /client-lookup · module | SDK.get | `db.collection("clients").where("emailLower", "==", email).limit(1)` |
| 1763 | GET /client-lookup · module | SDK.get | `db.collection("users").doc(authUser.uid)` |
| 1803 | sendClubWelcome | SDK.get | `ref` |
| 1810 | finish | SDK.get | `ref` |
| 1850 | POST /link-existing-client · module | SDK.get | `userRef` |
| 1958 | POST /link-existing-client · module | SDK.get | `clientRef.collection("programmes").limit(1)` |
| 1981 | getCandidateClientRefsForRequester | SDK.get | `db.collection("clients").limit(1500)` |
| 1989 | getCandidateClientRefsForRequester | SDK.get | `db.collection("clients").where("createdBy", "==", uid).limit(500)` |
| 1990 | getCandidateClientRefsForRequester | SDK.get | `db.collection("clients").where("coachId", "==", uid).limit(500)` |
| 1991 | getCandidateClientRefsForRequester | SDK.get | `db.collection("clients").where("coachIds", "array-contains", uid).limit(500)` |
| 1994 | getCandidateClientRefsForRequester | SDK.get | `db.collection("clients").where("clubId", "==", requester.clubId).limit(1000)` |
| 2017 | PATCH /clients/:clientId · module | SDK.get | `clientRef` |
| 2054 | PATCH /clients/:clientId · module | SDK.get | `db.collection("clients").where("emailLower", "==", email).limit(5)` |
| 2122 | PATCH /clients/:clientId · module | SDK.get | `db.collection("users").doc(emailAuthUser.uid)` |
| 2134 | PATCH /clients/:clientId · module | SDK.get | `db.collection("users").doc(authUser.uid)` |
| 2301 | GET /resolve-program-link · module | SDK.get | `clientRef.collection("programmes").doc(programId)` |
| 2540 | GET /group-class-clients · module | SDK.get | `db.collection("clients").where("clubId", "==", req.clubId)` |
| 2541 | GET /group-class-clients · module | SDK.get | `db.collection("clients").where("clubIds", "array-contains", req.clubId)` |
| 2555 | validateGroupParticipants | SDK.get | `ref` |
| 2590 | POST /appointments · module | SDK.get | `db.collection("clients").doc(clientId)` |
| 2727 | GET /appointments/:appointmentId · module | SDK.get | `db.collection("clubs").doc(req.clubId).collection("appointments").doc(id)` |
| 2730 | GET /appointments/:appointmentId · module | SDK.get | `db.collection("sessions").doc(data.linkedSessionId)` |
| 2744 | PATCH /appointments/:appointmentId · module | SDK.get | `appointmentRef` |
| 2778 | PATCH /appointments/:appointmentId · module | SDK.get | `appointmentRef` |
| 2792 | PATCH /appointments/:appointmentId · module | SDK.get | `ref` |
| 2795 | PATCH /appointments/:appointmentId · module | SDK.get | `db.collection('clubs').doc(req.clubId).collection('privateClients').doc(id)` |
| 2810 | PATCH /appointments/:appointmentId · module | SDK.get | `db.collection('clubs').doc(req.clubId)` |
| 2886 | DELETE /appointments/:appointmentId · module | SDK.get | `appointmentRef` |
| 2928 | GET /coach-goals · module | SDK.get | `db.collection("clubs").doc(clubId).collection("members").doc(coachUid)` |
| 2938 | GET /coach-goals · module | SDK.get | `db.collection("clubs").doc(clubId).collection("goals").doc(goalDocId(period, key))` |
| 3023 | PATCH /audit/referent · module | SDK.get | `ref` |
| 3036 | PATCH /audit/referent · module | SDK.get | `clientRef` |
| 3043 | PATCH /audit/referent · module | SDK.get | `ref` |
| 3053 | PATCH /audit/referent · module | SDK.get | `clientRef` |
| 3081 | POST /nutrition-share-email · module | SDK.get | `clientRef` |
| 3081 | POST /nutrition-share-email · module | SDK.get | `assessmentRef` |

</details>

<details>
<summary>backend/routes/coachProgramRead.js · 3 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 18 | POST /dashboard-templates · module | SDK.get | `admin.firestore().collection("users").doc(uid)` |
| 32 | POST /dashboard-templates · module | SDK.get | `db.collection("programmes").where("createdBy", "==", coachId).limit(200) .select(...(summaries ? programListSummary.fields : []))` |
| 40 | POST /dashboard-templates · module | SDK.getAll | `db` |

</details>

<details>
<summary>backend/routes/coachSessions.js · 11 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 121 | POST / · module | SDK.get | `db.collection("users").doc(requesterUid)` |
| 122 | POST / · module | SDK.get | `db.collection("clients").doc(clientId)` |
| 188 | POST / · module | SDK.get | `db .collection("clients") .doc(clientId) .collection("programmes") .doc(programmeId)` |
| 274 | POST / · module | SDK.get | `sessionRef` |
| 275 | POST / · module | SDK.get | `db.collection("sessions").where("clientId", "==", clientId).limit(500)` |
| 384 | updateSessionCalendar | SDK.get | `db.collection('users').doc(req.auth.uid)` |
| 384 | updateSessionCalendar | SDK.get | `sessionRef` |
| 408 | updateSessionCalendar | SDK.get | `clientRef` |
| 414 | updateSessionCalendar | SDK.get | `clientRef.collection('programmes').doc(session.programmeId)` |
| 423 | updateSessionCalendar | SDK.get | `db.collection('clubs').doc(clubId).collection('members').doc(req.auth.uid)` |
| 429 | updateSessionCalendar | SDK.get | `appointmentRef` |

</details>

<details>
<summary>backend/routes/emailTracking.js · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 22 | GET /open/:eventId.gif · module | SDK.get | `ref` |

</details>

<details>
<summary>backend/routes/messaging.js · 6 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 37 | GET /client-records · module | SDK.get | `db.collection("clients").doc(uid)` |
| 38 | GET /client-records · module | SDK.get | `db.collection("clients").where(field, "==", uid)` |
| 54 | GET /access · module | SDK.get | `db.collection("clients").doc(clientId)` |
| 61 | GET /access · module | SDK.get | `db.collection("users").doc(professionalUid)` |
| 80 | POST /send · module | SDK.get | `db.collection("clients").doc(clientId)` |
| 97 | POST /send · module | SDK.get | `db.collection("users").doc(professionalUid)` |

</details>

<details>
<summary>backend/routes/payments.js · 34 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 254 | getClubCurrentUsage | SDK.get | `db.collection("users").doc(String(firebaseUid))` |
| 263 | getClubCurrentUsage | SDK.get | `db.collection("clubs").doc(clubId).collection("members").limit(200)` |
| 264 | getClubCurrentUsage | SDK.get | `db.collection("clients").where("clubId", "==", clubId).limit(1001)` |
| 282 | getCheckoutUser | SDK.get | `admin.firestore().collection("users").doc(String(firebaseUid))` |
| 355 | getUserByUidOrEmail | SDK.get | `db.collection("users").doc(uid)` |
| 359 | getUserByUidOrEmail | SDK.get | `db .collection("users") .where("email", "==", String(email).trim().toLowerCase()) .limit(1)` |
| 375 | addClientCandidate | SDK.get | `refOrQuery` |
| 397 | scoreClientForUser | SDK.get | `docSnap.ref.collection("programmes").limit(100)` |
| 398 | scoreClientForUser | SDK.get | `docSnap.ref.collection("nutrition_assessments").limit(50)` |
| 448 | requesterIsAdmin | SDK.get | `admin.firestore().collection("users").doc(uid)` |
| 492 | upsertUserSubscription | SDK.get | `userRef` |
| 666 | copyPremiumProgramToClient | SDK.get | `srcRef` |
| 677 | copyPremiumProgramToClient | SDK.get | `clientRef` |
| 702 | copyPremiumProgramToClient | SDK.get | `clientRef .collection("programmes") .where("stripe.checkoutSessionId", "==", checkoutSessionId) .limit(1)` |
| 717 | copyPremiumProgramToClient | SDK.get | `clientRef .collection("programmes") .where("sourceProgrammeId", "==", programmeId) .limit(10)` |
| 806 | requireAdminKey | SDK.get | `admin.firestore().collection("users").doc(decoded.uid)` |
| 835 | ensureCustomerIdForUser | SDK.get | `db.collection("users").doc(uid)` |
| 839 | ensureCustomerIdForUser | SDK.get | `db .collection("users") .where("email", "==", String(email).trim().toLowerCase()) .limit(1)` |
| 1041 | POST /admin/cancel-subscription · module | SDK.get | `db.collection("users").doc(String(uid))` |
| 1091 | POST /admin/set-trial · module | SDK.get | `db.collection("users").doc(String(uid))` |
| 1168 | POST /admin/set-access · module | SDK.get | `userRef` |
| 1244 | POST /admin/set-entitlements · module | SDK.get | `userRef` |
| 1807 | GET /premium-programs · module | SDK.get | `db.collection("programmes").where("origine", "==", "premium")` |
| 1808 | GET /premium-programs · module | SDK.get | `db.collection("programmes").where("isPremiumOnly", "==", true)` |
| 2136 | POST /create-checkout-session · module | SDK.get | `admin.firestore().collection('programmes').doc(programId)` |
| 2290 | fulfillCheckoutSession | SDK.get | `admin.firestore().collection('users').where('email', '==', email).limit(1)` |
| 2337 | loadSubscriptionForSync | SDK.get | `ref` |
| 2354 | syncSubscriptionToUser | SDK.get | `userRef` |
| 2380 | syncSubscriptionToUser | SDK.get | `userRef` |
| 2381 | syncSubscriptionToUser | SDK.get | `observation.ref` |
| 2471 | handleReconcile | SDK.get | `admin.firestore().collection('users').doc(userDoc.id)` |
| 2548 | webhookHandler | SDK.get | `admin.firestore().collection('users').where('stripeCustomerId', '==', customerId).limit(1)` |
| 2613 | POST /recompute-access · module | SDK.get | `docRef` |
| 2642 | POST /claim-first-free · module | SDK.get | `userRef` |

</details>

<details>
<summary>backend/routes/programs.js · 12 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 30 | resolveGenerationScope | SDK.get | `requesterRef` |
| 49 | resolveGenerationScope | SDK.get | `admin .firestore() .collection("users") .doc(String(requestedCreatorId))` |
| 73 | resolveGenerationScope | SDK.get | `admin.firestore().collection("clients").doc(targetClientId)` |
| 215 | findAssignedProgramDocs | SDK.get | `db.collectionGroup("programmes").where(field, "==", programId).limit(1000)` |
| 215 | findAssignedProgramDocs | SDK.collectionGroup | `db` |
| 236 | findAssignedProgramDocs | SDK.get | `db.collection("clients").limit(1000)` |
| 250 | findAssignedProgramDocs | SDK.get | `clientQuery` |
| 262 | findAssignedProgramDocs | SDK.get | `clientDoc.ref.collection("programmes").limit(150)` |
| 287 | syncChunk | SDK.get | `templateRef` |
| 288 | syncChunk | SDK.get | `ref` |
| 426 | POST /:programId/sync-assignments · module | SDK.get | `db.collection("users").doc(req.auth.uid)` |
| 427 | POST /:programId/sync-assignments · module | SDK.get | `db.collection("programmes").doc(programId)` |

</details>

<details>
<summary>backend/utils/adminAccountDeletion.js · 6 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 8 | collectPaths | SDK.get | `ref` |
| 9 | collectPaths | SDK.listCollections | `ref` |
| 10 | collectPaths | SDK.listDocuments | `collection` |
| 18 | previewAccountDeletion | SDK.get | `userRef` |
| 28 | previewAccountDeletion | SDK.get | `db.collection('clients').where(field, '==', uid)` |
| 35 | previewAccountDeletion | SDK.get | `ref` |

</details>

<details>
<summary>backend/utils/batchedFieldReads.js · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 11 | batchedFieldReads | SDK.get | `db.collection(collectionName).where(field, 'in', groups[index]).limit(500)` |

</details>

<details>
<summary>backend/utils/clientSessionCancellation.js · 19 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 25 | read | SDK.get | `ref` |
| 27 | read | SDK.get | `db.collection('clients').doc(cid)` |
| 31 | read | SDK.get | `db.collection('users').doc(coachId)` |
| 33 | read | SDK.get | `db.collection('users').doc(coachId).collection('professional').doc('offers')` |
| 40 | read | SDK.get | `clubRef` |
| 40 | read | SDK.get | `appointmentRef` |
| 47 | userScope | SDK.get | `db.collection('users').doc(uid)` |
| 56 | dismiss | SDK.get | `ref` |
| 58 | dismiss | SDK.get | `db.collection('clients').doc(r.clientId)` |
| 67 | mine | SDK.get | `db.collection('clients').doc(uid)` |
| 67 | mine | SDK.get | `db.collection('clients').where(field,'==',uid)` |
| 69 | mine | SDK.get | `db.collection([valeur]).where('clientId','==',id)` |
| 73 | get | SDK.get | `r` |
| 74 | list | SDK.get | `db.collection([valeur]).where(u.owner?'clubId':'coachId','==',u.owner?u.clubId:uid)` |
| 82 | review | SDK.get | `ref` |
| 88 | review | SDK.get | `sessionRef` |
| 99 | review | SDK.get | `reportRef` |
| 115 | cancel | SDK.get | `requestRef` |
| 129 | cancel | SDK.get | `s.clubRef.collection('privateClients').doc(s.cid).collection('eventReports').doc(s.s.clubAppointmentId)` |

</details>

<details>
<summary>backend/utils/clubAppointmentAccess.js · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 2 | get | SDK.get | `ref` |
| 2 | get | SDK.get | `ref` |

</details>

<details>
<summary>backend/utils/clubClassBooking.js · 10 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 45 | records | SDK.get | `db.collection('clients').doc(uid)` |
| 46 | records | SDK.get | `db.collection('clients').where(field, '==', uid)` |
| 56 | list | SDK.get | `ref` |
| 56 | list | SDK.get | `ref.collection('appointments').where('type', '==', 'group')` |
| 59 | list | SDK.get | `ref.collection('privateClients').doc(id)` |
| 76 | reserve | SDK.get | `ref` |
| 76 | reserve | SDK.get | `ref.collection('appointments').doc(eventId)` |
| 77 | reserve | SDK.get | `s.ref` |
| 80 | reserve | SDK.get | `ref.collection('privateClients').doc(id)` |
| 84 | reserve | SDK.get | `reportRef` |

</details>

<details>
<summary>backend/utils/clubClassEmail.js · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 23 | notifyClassParticipants | SDK.get | `db.doc( clients/${change.clientId} )` |
| 26 | notifyClassParticipants | SDK.get | `db.doc( users/${uid} )` |

</details>

<details>
<summary>backend/utils/clubClientAdministration.js · 9 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 73 | get | SDK.get | `ref` |
| 73 | get | SDK.get | `ref` |
| 103 | get | SDK.get | `s.ref` |
| 103 | get | SDK.get | `db.collection('clubs').doc(s.clubId).collection('appointments')` |
| 103 | get | SDK.get | `s.ref.collection('eventReports')` |
| 120 | save | SDK.get | `s.ref` |
| 154 | report | SDK.get | `db.collection('clubs').doc(s.clubId).collection('appointments').doc(eventId)` |
| 154 | report | SDK.get | `ref` |
| 159 | report | SDK.get | `db.collection('clubs').doc(s.clubId)` |

</details>

<details>
<summary>backend/utils/clubClientImport.js · 24 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 39 | get | SDK.get | `ref` |
| 39 | get | SDK.get | `ref` |
| 47 | get | SDK.get | `ref` |
| 47 | get | SDK.get | `ref` |
| 53 | checkCoach | SDK.get | `s.club.collection('members').doc(row.coachUid)` |
| 54 | checkCoach | SDK.get | `db.collection('users').doc(row.coachUid)` |
| 66 | get | SDK.get | `r` |
| 75 | history | SDK.get | `s.club.collection('clientImports').orderBy('createdAt','desc').limit(20)` |
| 84 | commitRow | SDK.get | `receipt` |
| 84 | commitRow | SDK.get | `batch` |
| 105 | commitRow | SDK.get | `privateRef` |
| 106 | commitRow | SDK.get | `privateRef.collection("sessionPacks")` |
| 107 | commitRow | SDK.get | `privateRef.collection('subscriptions')` |
| 128 | undo | SDK.get | `batch` |
| 128 | undo | SDK.get | `batch.collection('rows')` |
| 128 | undo | SDK.get | `s.club.collection('appointments')` |
| 135 | undo | SDK.get | `ref` |
| 135 | undo | SDK.get | `privateRef` |
| 135 | undo | SDK.get | `privateRef.collection('sessionPacks')` |
| 135 | undo | SDK.get | `db.collection('programmes').where('clientId','==',ref.id)` |
| 135 | undo | SDK.get | `db.collection('sessions').where('clientId','==',ref.id)` |
| 139 | undo | SDK.get | `privateRef.collection('subscriptions').doc(item.packId)` |
| 141 | undo | SDK.listCollections | `root` |
| 142 | undo | SDK.get | `collection` |

</details>

<details>
<summary>backend/utils/clubDeparture.js · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 23 | get | SDK.get | `ref` |
| 23 | get | SDK.get | `ref` |

</details>

<details>
<summary>backend/utils/clubMemberships.js · 28 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 21 | records | SDK.get | `db.collection('clients').doc(uid)` |
| 21 | records | SDK.get | `db.collection('clients').doc(uid)` |
| 24 | records | SDK.get | `query` |
| 24 | records | SDK.get | `query` |
| 26 | records | SDK.get | `db.collection('clients').doc(uid)` |
| 35 | expireClub | SDK.get | `db.collection('clubs').doc(clubId).collection('privateClients')` |
| 39 | expireClub | SDK.get | `db.collection('clients').doc(doc.id)` |
| 46 | expireAll | SDK.get | `db.collection('clubs')` |
| 59 | link | SDK.get | `clubRef` |
| 59 | link | SDK.get | `clubRef.collection('formerClients').doc(uid)` |
| 59 | link | SDK.get | `db.collection('users').doc(uid)` |
| 62 | link | SDK.get | `db.collection('clients').where('clubId', '==', clubId)` |
| 63 | link | SDK.get | `db.collection('clients').where('clubIds', 'array-contains', clubId)` |
| 77 | list | SDK.get | `db.collection('clubs').doc(id)` |
| 77 | list | SDK.get | `db.collection('users').doc(uid)` |
| 93 | leave | SDK.get | `archive` |
| 95 | leave | SDK.get | `club.collection('privateClients').doc(s.id).collection('subscriptions')` |
| 96 | leave | SDK.get | `club.collection('terminationRequests').doc(uid)` |
| 103 | leave | SDK.get | `club.collection('privateClients').doc(s.id)` |
| 116 | leave | SDK.get | `userRef` |
| 117 | leave | SDK.get | `club.collection('appointments').where('type', '==', 'group')` |
| 139 | former | SDK.get | `db.collection('clubs').doc(clubId).collection('formerClients').where('status', '==', 'left')` |
| 145 | reactivate | SDK.get | `archive` |
| 145 | reactivate | SDK.get | `clubRef` |
| 145 | reactivate | SDK.get | `db.collection('users').doc(uid)` |
| 148 | reactivate | SDK.get | `db.collection('clients').doc(r.id)` |
| 150 | reactivate | SDK.get | `db.collection('clients').where('clubId', '==', clubId)` |
| 151 | reactivate | SDK.get | `db.collection('clients').where('clubIds', 'array-contains', clubId)` |

</details>

<details>
<summary>backend/utils/clubMessaging.js · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 11 | get | SDK.get | `db.collection(collection).doc(id)` |
| 12 | rows | SDK.get | `query` |

</details>

<details>
<summary>backend/utils/clubReferents.js · 8 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 9 | get | SDK.get | `r` |
| 9 | get | SDK.get | `r` |
| 22 | directory | SDK.get | `db.collection('clients').where('clubId','==',s.clubId)` |
| 22 | directory | SDK.get | `db.collection('clients').where('clubIds','array-contains',s.clubId)` |
| 22 | directory | SDK.get | `s.club.collection('members')` |
| 30 | assign | SDK.get | `ref` |
| 38 | assign | SDK.get | `s.club.collection('members').doc(target)` |
| 38 | assign | SDK.get | `db.collection('users').doc(target)` |

</details>

<details>
<summary>backend/utils/clubSessionPacks.js · 25 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 50 | get | SDK.get | `r` |
| 50 | get | SDK.get | `r` |
| 65 | get | SDK.get | `r` |
| 65 | get | SDK.get | `r` |
| 82 | directoryBalances | SDK.get | `club.collection('appointments')` |
| 93 | coachClassRoster | SDK.get | `db.collection('users').doc(uid)` |
| 96 | coachClassRoster | SDK.get | `club.collection('members').doc(uid)` |
| 96 | coachClassRoster | SDK.get | `club.collection('appointments').doc(eventId)` |
| 100 | coachClassRoster | SDK.get | `db.collection('clients').doc(id)` |
| 110 | coachView | SDK.get | `db.collection('users').doc(uid)` |
| 110 | coachView | SDK.get | `db.collection('clients').doc(clientId)` |
| 113 | coachView | SDK.get | `club.collection('members').doc(uid)` |
| 125 | grant | SDK.get | `ref` |
| 135 | update | SDK.get | `ref` |
| 149 | remove | SDK.get | `ref` |
| 160 | changes | SDK.get | `ref` |
| 160 | changes | SDK.get | `ref.collection('changes')` |
| 178 | justify | SDK.get | `db.collection('clients').doc(clientId)` |
| 180 | justify | SDK.get | `club.collection('appointments').doc(eventId)` |
| 181 | justify | SDK.get | `ref` |
| 189 | acknowledgeLastSession | SDK.get | `db.collection('clients').doc(clientId)` |
| 200 | mine | SDK.get | `db.collection('clients').doc(uid)` |
| 201 | mine | SDK.get | `db.collection('clients').where(key,'==',uid)` |
| 207 | mine | SDK.get | `ref` |
| 211 | mine | SDK.get | `db.collection('users').doc(p.createdBy)` |

</details>

<details>
<summary>backend/utils/clubSubscriptions.js · 23 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 90 | get | SDK.get | `ref` |
| 90 | get | SDK.get | `ref` |
| 111 | owner | SDK.get | `db.collection('users').doc(uid)` |
| 117 | read | SDK.get | `s.ref.collection('subscriptions')` |
| 117 | read | SDK.get | `s.ref.collection('paymentChecks')` |
| 123 | mine | SDK.get | `db.collection('clients').doc(uid)` |
| 123 | mine | SDK.get | `db.collection('clients').where(key,'==',uid)` |
| 129 | mine | SDK.get | `clubRef` |
| 130 | mine | SDK.get | `ref` |
| 140 | catalog | SDK.get | `club.collection('subscriptionPlans')` |
| 158 | updatePlan | SDK.get | `ref` |
| 184 | deletePlan | SDK.get | `ref` |
| 199 | preview | SDK.get | `club.collection('subscriptionPlans').doc(input.planId)` |
| 212 | assign | SDK.get | `planRef` |
| 214 | assign | SDK.get | `s.ref.collection('subscriptions')` |
| 235 | updateContract | SDK.get | `ref` |
| 235 | updateContract | SDK.get | `scope.ref.collection('paymentChecks')` |
| 235 | updateContract | SDK.get | `scope.ref.collection('subscriptions')` |
| 258 | pending | SDK.get | `club.collection('privateClients')` |
| 295 | check | SDK.get | `s.ref.collection('subscriptions').doc(due.contractId)` |
| 298 | check | SDK.get | `ref` |
| 308 | finish | SDK.get | `ref` |
| 311 | check | SDK.get | `db.collection('clubs').doc(s.clubId)` |

</details>

<details>
<summary>backend/utils/clubTermination.js · 3 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 11 | get | SDK.get | `r` |
| 11 | get | SDK.get | `r` |
| 35 | history | SDK.get | `db.collection('users').doc(uid).collection('terminationRequests')` |

</details>

<details>
<summary>backend/utils/coachCreditGuard.js · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 7 | prepareCoachCredit | SDK.get | `ref` |
| 12 | prepareCoachCredit | SDK.get | `db.collection('sessions').where(k,'==',coachId)` |

</details>

<details>
<summary>backend/utils/coachOffers.js · 9 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 35 | get | SDK.get | `r` |
| 44 | get | SDK.get | `r` |
| 50 | get | SDK.get | `r` |
| 149 | change | SDK.get | `r` |
| 155 | mine | SDK.get | `db.collection('clients').doc(uid)` |
| 155 | mine | SDK.get | `db.collection('clients').where(k,'==',uid)` |
| 160 | mine | SDK.get | `r` |
| 161 | mine | SDK.get | `db.collection('users').doc(coachId)` |
| 162 | mine | SDK.get | `r` |

</details>

<details>
<summary>backend/utils/deleteCoachSession.js · 3 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 10 | createDeleteCoachSession | SDK.get | `db.collection('users').doc(uid)` |
| 10 | createDeleteCoachSession | SDK.get | `ref` |
| 26 | createDeleteCoachSession | SDK.get | `clientRef` |

</details>

<details>
<summary>backend/utils/deletePersonalSession.js · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 9 | createDeletePersonalSession | SDK.get | `ref` |

</details>

<details>
<summary>backend/utils/emailEvents.js · 4 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 8 | resolveClientId | SDK.get | `db.collection("users").doc(String(userId))` |
| 13 | resolveClientId | SDK.get | `db .collection("clients") .where(field, "==", String(userId)) .limit(1)` |
| 25 | resolveClientId | SDK.get | `db .collection("clients") .where("emailLower", "==", emailLower) .limit(1)` |
| 32 | resolveClientId | SDK.get | `db .collection("clients") .where("email", "==", emailLower) .limit(1)` |

</details>

<details>
<summary>backend/utils/firebaseAuth.js · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 19 | getUserRole | SDK.get | `admin.firestore().collection("users").doc(uid)` |

</details>

<details>
<summary>backend/utils/generateAutoProgram.js · 8 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 774 | buildClientTimingProfile | SDK.get | `db.collection("clients").doc(safeClientId).collection("programmes")` |
| 778 | buildClientTimingProfile | SDK.get | `programDoc.ref.collection("sessionsEffectuees")` |
| 3198 | generateAutoProgram | SDK.get | `db.collection("training")` |
| 3199 | generateAutoProgram | SDK.get | `db.collection("warmup")` |
| 3200 | generateAutoProgram | SDK.get | `db.collection("cooldown")` |
| 3201 | generateAutoProgram | SDK.get | `db.collection("ergometre")` |
| 4186 | generateAndSaveAutoProgram | SDK.get | `assignedRef` |
| 4281 | generateAndSaveAutoProgram | SDK.get | `assignedRef` |

</details>

<details>
<summary>backend/utils/independentFollowups.js · 15 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 16 | create | SDK.get | `r` |
| 23 | create | SDK.get | `r` |
| 25 | create | SDK.get | `db.collection('users').doc(account.uid)` |
| 25 | create | SDK.get | `ref` |
| 26 | create | SDK.get | `db.collection('clients').where('createdBy', '==', coachUid)` |
| 27 | create | SDK.get | `db.collection('clients').where('coachIds', 'array-contains', coachUid)` |
| 53 | finish | SDK.get | `ref` |
| 67 | list | SDK.get | `db.collection('users').doc(uid)` |
| 67 | list | SDK.get | `db.collection('clients').doc(uid)` |
| 68 | list | SDK.get | `db.collection('clients').where(k,'==',uid)` |
| 74 | list | SDK.get | `db.collection('users').doc(coachUid)` |
| 82 | visibility | SDK.get | `db.collection('users').doc(uid)` |
| 82 | visibility | SDK.get | `db.collection('clients').doc(clientId)` |
| 91 | select | SDK.get | `db.collection('users').doc(uid)` |
| 91 | select | SDK.get | `db.collection('clients').doc(clientId)` |

</details>

<details>
<summary>backend/utils/navigationBranding.js · 6 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 25 | resolveNavigationBrand | SDK.get | `db.collection('users').doc(uid)` |
| 26 | resolveNavigationBrand | SDK.get | `db.collection('clients').doc(uid)` |
| 27 | resolveNavigationBrand | SDK.get | `db.collection('clients').where(key, '==', uid)` |
| 36 | resolveNavigationBrand | SDK.get | `db.collection('users').doc(id)` |
| 45 | resolveNavigationBrand | SDK.get | `db.collection('clubs').doc(clubs[0])` |
| 55 | resolveNavigationBrand | SDK.get | `db.collection('users').doc(club.ownerUid)` |

</details>

<details>
<summary>backend/utils/paidProgramOrders.js · 6 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 48 | deliver | SDK.get | `orderRef` |
| 59 | deliver | SDK.get | `clientRef` |
| 59 | deliver | SDK.get | `db.collection('users').doc(uid)` |
| 67 | deliver | SDK.get | `db.collection([valeur]).doc(requestId)` |
| 74 | deliver | SDK.get | `orderRef` |
| 124 | deliver | SDK.get | `orderRef` |

</details>

<details>
<summary>backend/utils/professionalClientNotes.js · 4 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 12 | scope | SDK.get | `db.collection('users').doc(uid)` |
| 12 | scope | SDK.get | `db.collection('clients').doc(clientId)` |
| 20 | get | SDK.get | `ref` |
| 27 | save | SDK.get | `ref` |

</details>

<details>
<summary>backend/utils/subscriptionCycles.js · 12 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 48 | enroll | SDK.get | `clientRef` |
| 48 | enroll | SDK.get | `jobRef` |
| 56 | enroll | SDK.get | `clientRef.collection('programmes').doc(id)` |
| 68 | enroll | SDK.get | `clientRef` |
| 78 | process | SDK.get | `clientRef` |
| 78 | process | SDK.get | `jobRef` |
| 104 | process | SDK.get | `sourceRef` |
| 105 | process | SDK.get | `sourceRef.collection('sessionsEffectuees')` |
| 115 | process | SDK.get | `clientRef` |
| 115 | process | SDK.get | `jobRef` |
| 115 | process | SDK.get | `programRef` |
| 131 | process | SDK.get | `jobRef` |

</details>


### Functions

<details>
<summary>functions/backfillExerciseMedia.js · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 135 | findExerciseDocRef | SDK.get | `directRef` |
| 138 | findExerciseDocRef | SDK.get | `db .collection(collectionName) .where("id", "==", exerciseId) .limit(1)` |

</details>

<details>
<summary>functions/index.js · 50 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 90 | getRequesterProfile | SDK.get | `db.doc( users/${uid} )` |
| 104 | assertClientAccess | SDK.get | `db.doc( clients/${clientId} )` |
| 140 | assertCanInviteExistingClient | SDK.get | `db.doc( clients/${clientUid} )` |
| 142 | assertCanInviteExistingClient | SDK.get | `db.collection("clients").where("linkedUserId", "==", clientUid).limit(10)` |
| 143 | assertCanInviteExistingClient | SDK.get | `db.collection("clients").where("uid", "==", clientUid).limit(10)` |
| 146 | assertCanInviteExistingClient | SDK.get | `db.collection("clients").where("emailLower", "==", email).limit(10)` |
| 171 | enforceUserRateLimit | SDK.get | `ref` |
| 512 | findExerciseDocRef | SDK.get | `directRef` |
| 515 | findExerciseDocRef | SDK.get | `db .collection(collectionName) .where("id", "==", exerciseId) .limit(1)` |
| 1667 | claimLifecycleEmail | SDK.get | `ref` |
| 1789 | hasStartedProgram | SDK.get | `programRef.collection("sessionsEffectuees").limit(1)` |
| 1838 | getCompletedSessionCount | SDK.get | `programRef.collection("sessionsEffectuees")` |
| 1855 | sendProgramLifecycleEmail | SDK.get | `db.doc( clients/${clientId} )` |
| 1969 | claimMessagingEmail | SDK.get | `messageRef` |
| 1970 | claimMessagingEmail | SDK.get | `conversationRef` |
| 2038 | notifyConversationRecipient | SDK.get | `conversationRef` |
| 2049 | notifyConversationRecipient | SDK.get | `deliveryRef` |
| 2050 | notifyConversationRecipient | SDK.get | `conversationRef.collection('messages').where('createdAtIso',' ',message.createdAtIso).orderBy('createdAtIso','desc').limit(1)` |
| 2054 | notifyConversationRecipient | SDK.get | `recipientRef` |
| 2055 | notifyConversationRecipient | SDK.get | `db.doc( users/${senderUid} )` |
| 2182 | module | SDK.get | `db.doc( clubConversations/${event.params.conversationId} )` |
| 2184 | module | SDK.get | `db.collection('users').where('clubId','==',conversation.clubId)` |
| 2187 | module | SDK.get | `db.doc( clubs/${conversation.clubId} )` |
| 2226 | module | SDK.get | `db.doc( users/${uid} )` |
| 2267 | module | SDK.get | `userRef` |
| 2414 | module | SDK.get | `userRef` |
| 2672 | module | SDK.get | `db.doc( clients/${clientId} )` |
| 2950 | module | SDK.get | `jobRef` |
| 2976 | module | SDK.get | `programRef` |
| 3027 | sendTrialReminders | SDK.get | `db.collection("users").where("subscriptionStatus", "==", "trialing").limit(500)` |
| 3090 | sendPendingProgramCompletionEmails | SDK.get | `db .collectionGroup("programmes") .where("completionEmailDueAt", " =", nowTs) .limit(500)` |
| 3090 | sendPendingProgramCompletionEmails | SDK.collectionGroup | `db` |
| 3137 | sendInactivityReminders | SDK.get | `db .collectionGroup("programmes") .where("inactiveReminderDueAt", " =", nowTs) .limit(500)` |
| 3137 | sendInactivityReminders | SDK.collectionGroup | `db` |
| 3227 | module | SDK.get | `db.doc( clients/${clientId} )` |
| 3375 | module | SDK.get | `docRef` |
| 3481 | module | SDK.get | `ref` |
| 3547 | module | SDK.get | `ref` |
| 3577 | module | SDK.get | `ref` |
| 3662 | module | SDK.get | `calendarTokenRef(token)` |
| 3671 | module | SDK.get | `db.doc( clubs/${clubId}/private/calendar )` |
| 3679 | module | SDK.get | `db.collection("clubs").doc(clubId).collection("appointments")` |
| 3708 | module | SDK.get | `db .collectionGroup("private") .where("token", "==", token) .limit(5)` |
| 3708 | module | SDK.collectionGroup | `db` |
| 3743 | module | SDK.get | `clientRef` |
| 3753 | module | SDK.get | `clientRef .collection("calendarEvents") .orderBy("startAt", "asc")` |
| 3817 | module | SDK.get | `db .collection([valeur]) .doc(safeTrim(indexedToken.ownerId))` |
| 3830 | module | SDK.get | `db .collection([valeur]) .where("token", "==", token) .limit(5)` |
| 3881 | module | SDK.get | `db .collection("sessions") .where("coachId", "==", coachId)` |
| 3902 | module | SDK.get | `db.doc( clients/${clientId} )` |

</details>

<details>
<summary>functions/lib/sessionNotification.js · 5 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 70 | createSessionNotificationHandler | SDK.get | `sessionRef` |
| 75 | createSessionNotificationHandler | SDK.get | `clientRef` |
| 88 | createSessionNotificationHandler | SDK.get | `db.doc( users/${accountUid} )` |
| 100 | createSessionNotificationHandler | SDK.get | `receipt` |
| 136 | createSessionNotificationHandler | SDK.get | `receipt` |

</details>

<details>
<summary>functions/trainingCycleCompletion.js · 4 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 14 | advanceCompletedTrainingCycle | SDK.get | `clientRef` |
| 22 | advanceCompletedTrainingCycle | SDK.get | `programRef` |
| 28 | advanceCompletedTrainingCycle | SDK.get | `programRef.collection('sessionsEffectuees')` |
| 33 | advanceCompletedTrainingCycle | SDK.get | `clientRef.collection('programmes').doc(successor.programId)` |

</details>

<details>
<summary>functions/utils/generateAutoProgram.js · 4 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 743 | generateAutoProgram | SDK.get | `db.collection("training")` |
| 744 | generateAutoProgram | SDK.get | `db.collection("warmup")` |
| 745 | generateAutoProgram | SDK.get | `db.collection("cooldown")` |
| 746 | generateAutoProgram | SDK.get | `db.collection("ergometre")` |

</details>


### Scripts et tests

<details>
<summary>functions/scripts/testClubCalendar.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 17 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/addPremiumProgramI18n.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 417 | main | SDK.get | `db.collection("programmes").where("origine", "==", "premium")` |

</details>

<details>
<summary>scripts/addPulloverVariants.mjs · 5 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 22 | module | SDK.get | `db.collection('training')` |
| 29 | module | SDK.get | `machineRef` |
| 31 | module | SDK.get | `r` |
| 43 | module | SDK.get | `db.doc( training/${refFor(e).docId} )` |
| 44 | module | SDK.get | `machineRef` |

</details>

<details>
<summary>scripts/auditExerciseVariants.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 234 | loadExercises | SDK.get | `db.collection(collection)` |

</details>

<details>
<summary>scripts/auditFirestoreIdentity.cjs · 4 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 56 | collectByQuery | SDK.get | `db.collection(collectionName).where(field, "==", value).limit(50)` |
| 62 | enrichClient | SDK.get | `docSnap.ref.collection("programmes")` |
| 63 | enrichClient | SDK.get | `docSnap.ref.collection("nutrition_assessments")` |
| 64 | enrichClient | SDK.get | `docSnap.ref.collection("measurements").limit(20)` |

</details>

<details>
<summary>scripts/auditPremiumExerciseCoverage.cjs · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 32 | loadBank | SDK.get | `db.collection(collection)` |
| 72 | main | SDK.get | `db .collection("programmes") .where("origine", "==", "premium")` |

</details>

<details>
<summary>scripts/auditSecurityState.cjs · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 49 | main | SDK.get | `db.collection("users")` |
| 50 | main | SDK.get | `db.collection("clients")` |

</details>

<details>
<summary>scripts/auditSportEngineSamples.cjs · 4 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 213 | module | SDK.get | `db.collection("training")` |
| 214 | module | SDK.get | `db.collection("warmup")` |
| 215 | module | SDK.get | `db.collection("cooldown")` |
| 216 | module | SDK.get | `db.collection("ergometre")` |

</details>

<details>
<summary>scripts/auditWorkflowsRoutes.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 43 | get | SDK.get | `target` |

</details>

<details>
<summary>scripts/backfillProgramSessionCounts.cjs · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 11 | module | SDK.get | `db.collection('programmes').where('createdBy','==',coach).select(...summary.fields)` |
| 15 | module | SDK.get | `projected.ref` |

</details>

<details>
<summary>scripts/createAdditionalPremiumPrograms.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 670 | main | SDK.get | `ref` |

</details>

<details>
<summary>scripts/createClubClientInfrastructureTest.cjs · 4 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 30 | readDoc | SDK.get | `db.collection(collectionName).doc(id)` |
| 325 | main | SDK.get | `db.collection("clients").where("clubId", "==", CLUB_UID)` |
| 326 | main | SDK.get | `db.collection("clients").doc(clientId).collection("programmes")` |
| 327 | main | SDK.get | `db.collection("clients").doc(clientId).collection("nutrition_assessments")` |

</details>

<details>
<summary>scripts/createPremiumPrograms.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 287 | main | SDK.get | `ref` |

</details>

<details>
<summary>scripts/extendPremiumLongPrograms.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 274 | main | SDK.get | `ref` |

</details>

<details>
<summary>scripts/migrateClientVisitLinks.cjs · 4 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 38 | latestCompletedSessionAt | SDK.get | `db.collection("clients").doc(clientId).collection("programmes")` |
| 40 | latestCompletedSessionAt | SDK.get | `programDoc.ref.collection("sessionsEffectuees")` |
| 58 | main | SDK.get | `db.collection("users")` |
| 59 | main | SDK.get | `db.collection("clients")` |

</details>

<details>
<summary>scripts/normalizePremiumProgramMetrics.cjs · 3 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 181 | normalizeQuery | SDK.get | `query` |
| 203 | normalizeClientPrograms | SDK.get | `db.collection("clients")` |
| 207 | normalizeClientPrograms | SDK.get | `clientDoc.ref.collection("programmes")` |

</details>

<details>
<summary>scripts/planFirestoreIdentityMigration.cjs · 5 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 66 | listCollection | SDK.get | `q.startAfter(last)` |
| 66 | listCollection | SDK.get | `q` |
| 78 | enrichClient | SDK.get | `client.ref.collection("programmes")` |
| 79 | enrichClient | SDK.get | `client.ref.collection("nutrition_assessments")` |
| 80 | enrichClient | SDK.get | `client.ref.collection("measurements").limit(20)` |

</details>

<details>
<summary>scripts/repairExerciseVariants.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 224 | loadExercises | SDK.get | `db.collection(collection)` |

</details>

<details>
<summary>scripts/syncExerciseProgrammingTags.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 130 | syncCollection | SDK.get | `db.collection(source.collection)` |

</details>

<details>
<summary>scripts/syncProgramExerciseVariants.cjs · 5 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 167 | loadExercises | SDK.get | `db.collection(collection)` |
| 485 | loadProgramDocs | SDK.get | `db.collection("programmes")` |
| 486 | loadProgramDocs | SDK.get | `db.collectionGroup("programmes")` |
| 486 | loadProgramDocs | SDK.collectionGroup | `db` |
| 492 | loadClientDocs | SDK.get | `db.collection("clients")` |

</details>

<details>
<summary>scripts/testClientCancellationInbox.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 6 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testClubClassBooking.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 45 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testClubClientImport.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 10 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testClubDeparture.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 23 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testClubMemberships.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 28 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testClubMessaging.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 39 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testClubReferents.cjs · 2 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 12 | get | SDK.get | `coll(p)` |
| 14 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testClubSessionPacks.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 12 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testClubSubscriptions.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 12 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testClubTermination.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 26 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testCoachOffers.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 16 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testCoachSharedCalendar.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 18 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testConfirmedProgramWrites.mjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 103 | loadProgram | SDK.get | `ref({}, 'programmes', 'template')` |

</details>

<details>
<summary>scripts/testFirestoreRules.cjs · 3 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 64 | read | getDoc | `doc(db, key)` |
| 176 | loadProgram | SDK.get | `doc(db, 'programmes/private')` |
| 185 | loadProgram | SDK.get | `doc(db, 'programmes/private')` |

</details>

<details>
<summary>scripts/testIndependentFollowups.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 16 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testPaidProgramFirestore.cjs · 13 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 57 | generateProgram | SDK.get | `target` |
| 93 | module | SDK.get | `f.client.collection('programmes')` |
| 94 | module | SDK.get | `f.receipt()` |
| 95 | module | SDK.get | `f.user` |
| 112 | module | SDK.get | `f.client.collection('programmes')` |
| 117 | module | SDK.get | `f.receipt()` |
| 121 | module | SDK.get | `f.program()` |
| 124 | module | SDK.get | `f.receipt()` |
| 125 | module | SDK.get | `f.client.collection('programmes')` |
| 131 | module | SDK.get | `f.receipt()` |
| 139 | module | SDK.get | `f.user` |
| 144 | module | SDK.get | `f.receipt()` |
| 145 | module | SDK.get | `f.user` |

</details>

<details>
<summary>scripts/testProOfferLifecycle.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 9 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testProfessionalClientNotes.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 11 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testSessionNotifications.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 18 | get | SDK.get | `r` |

</details>

<details>
<summary>scripts/testSubscriptionCycles.cjs · 13 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 31 | main | SDK.get | `ref` |
| 45 | main | SDK.get | `ref` |
| 47 | main | SDK.get | `recovery` |
| 51 | main | SDK.get | `ref.collection('programmes')` |
| 56 | main | SDK.get | `ref` |
| 57 | main | SDK.get | `ref.collection('programmes')` |
| 60 | main | SDK.get | `ref.collection('programmes')` |
| 65 | main | SDK.get | `coach` |
| 68 | main | SDK.get | `independent` |
| 75 | main | SDK.get | `existing` |
| 78 | main | SDK.get | `looping` |
| 93 | main | SDK.get | `paid.collection('programmes')` |
| 99 | main | SDK.get | `conflict.collection('programmes')` |

</details>

<details>
<summary>scripts/testSubscriptionJourney.cjs · 7 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 51 | profile | SDK.get | `client` |
| 52 | screen | SDK.get | `client.collection('programmes')` |
| 57 | main | SDK.get | `ref` |
| 67 | main | SDK.get | `done` |
| 72 | main | SDK.get | `done` |
| 81 | main | SDK.get | `db.collection('subscription_cycle_jobs').where('status','==','pending').where('leaseUntil',' =',clock).orderBy('leaseUntil').limit(20)` |
| 89 | main | SDK.get | `client.collection('programmes')` |

</details>

<details>
<summary>scripts/updateLegacyPremiumSessionPreviews.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 96 | main | SDK.get | `ref` |

</details>

<details>
<summary>scripts/updatePremiumDetails.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 199 | main | SDK.get | `db .collection(COLLECTION) .where(QUERY_FIELD, "==", QUERY_VALUE)` |

</details>

<details>
<summary>scripts/updatePremiumPrograms.cjs · 1 sites</summary>

| Ligne | Route ou fonction englobante | Opération | Référence ou premier argument (abrégé) |
|---:|---|---|---|
| 58 | main | SDK.get | `db.collection(COLLECTION) .where(QUERY_FIELD, "==", QUERY_VALUE)` |

</details>


## Annexe B — points d’entrée API

Routes Express explicites dans backend/routes. Le chemin est relatif au montage de chaque routeur dans backend/app.js. Le déclencheur est une requête HTTP autorisée selon le middleware du fichier. Les symboles ci-dessous sont des points d’entrée dans le handler, à croiser avec l’annexe A et les services appelés. Certaines routes ne lisent Firestore que dans un middleware ou une branche conditionnelle et d’autres appellent exclusivement un prestataire externe.

<details>
<summary>backend/routes/adminEmails.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 578 | `GET /upcoming` | Voir le handler et ses middlewares |
| 588 | `POST /upcoming/:scheduleId/cancel` | rows.find, FieldValue.serverTimestamp |
| 613 | `GET /client/:id` | Voir le handler et ses middlewares |
| 646 | `PATCH /client/:id/preferences` | FieldValue.serverTimestamp, writes.push |
| 673 | `POST /client/:id/send` | hasOwnProperty.call, transaction.get, transaction.create, FieldValue.serverTimestamp, accepted.map, eventRef.update, accepted.includes |
| 756 | `POST /client/:id/preview` | Voir le handler et ses middlewares |
| 777 | `POST /client/:id/test` | crypto.createHash, transaction.get, transaction.create, FieldValue.serverTimestamp, eventRef.update |
| 849 | `POST /client/:id/retry/:eventId` | originalRef.get, originalSnap.data, transaction.get, freshOriginal.data, transaction.update, FieldValue.serverTimestamp, transaction.create |
| 935 | `POST /client/:id/upcoming/:scheduleId/cancel` | rows.find, FieldValue.serverTimestamp |
| 959 | `PATCH /client/:id/delivery` | FieldValue.serverTimestamp |
| 985 | `PATCH /client/:id/templates/:type` | FieldValue.serverTimestamp |
| 1012 | `DELETE /client/:id/templates/:type` | FieldValue.delete |

</details>

<details>
<summary>backend/routes/adminSearch.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 261 | `GET /search` | Voir le handler et ses middlewares |

</details>

<details>
<summary>backend/routes/adminUsers.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 21 | `POST /email-verification-statuses` | uids.slice, admin.auth, batch.map, users.forEach, providerData.map, notFound.forEach |

</details>

<details>
<summary>backend/routes/analytics.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 368 | `POST /admin/geo/address` | addressCache.get, addressQueue.then, promise.catch, addressCache.delete, addressCache.keys, addressCache.set |
| 388 | `GET /admin/geo` | admin.firestore, docs.map, d.data, city.toLowerCase, geoIdParts.join, startDate.setDate, startDate.getDate |
| 669 | `GET /admin/geo/:geoId/visitors` | admin.firestore, dayKeys.map, dayKeys.slice, geoId.includes, geoId.replace, docSnap.data, visitorId.startsWith |
| 787 | `GET /admin/visitor/:uid` | admin.firestore, refs.map, ref.get, snapshots.forEach, snap.data, docs.forEach, path.startsWith |
| 967 | `POST /admin/geo/enrich` | geoIds.map, admin.firestore, ref.get, snap.filter, docSnap.data, ref.set, FieldValue.serverTimestamp |
| 1008 | `POST /pageview` | admin.firestore, Number.isFinite, allowedGeoStatuses.has, admin.auth, requestedVisitorId.startsWith, city.toLowerCase, FieldValue.serverTimestamp |

</details>

<details>
<summary>backend/routes/clientProfile.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 51 | `POST /password-reset` | admin.auth, FieldValue.serverTimestamp, admin.firestore, writes.push |
| 139 | `POST /email-change-verification` | admin.auth, admin.firestore, userSnap.data, FieldValue.serverTimestamp, writes.push |
| 229 | `POST /activation-complete` | admin.firestore, userRef.get, userSnap.data, FieldValue.serverTimestamp, userRef.set, writes.push |
| 279 | `POST /firebase-email-event` | Voir le handler et ses middlewares |
| 420 | `GET /resolve-client` | admin.firestore, userSnap.data, linkedSnap.data, candidates.values, snap.data, exactIdentity.map, best.data |
| 518 | `GET /navigation-brand` | admin.firestore |
| 530 | `GET /email-preferences` | admin.firestore, userSnap.data |
| 550 | `PUT /email-preferences` | admin.firestore, userRef.get, userSnap.data, FieldValue.serverTimestamp, batch.update, batch.commit |
| 606 | `PUT /location-settings` | admin.firestore, FieldValue.serverTimestamp |

</details>

<details>
<summary>backend/routes/clubMessaging.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 16 | `GET /contacts` | service.contacts, contacts.map, snap.data, lastMessageAt.toMillis |
| 43 | `GET /messages` | ref.collection, query.startAfter, query.limit, docs.slice, docs.map, row.data, docs.at |
| 58 | `POST /read` | ref.get, ref.set, FieldValue.serverTimestamp |
| 65 | `POST /send` | text.trim, ref.collection, tx.get, existing.data, course.data, tx.set, text.slice |

</details>

<details>
<summary>backend/routes/clubs.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 21 | `GET /clients/:clientId/internal-note` | professionalNotes.get |
| 25 | `PUT /clients/:clientId/internal-note` | professionalNotes.save |
| 32 | `GET /client-administration/:clientId` | clientAdministration.get |
| 37 | `PATCH /client-administration/:clientId` | clientAdministration.save |
| 42 | `POST /client-administration/:clientId/welcome-retry` | clientAdministration.scope, ref.get, client.data, admin.auth |
| 57 | `PATCH /client-administration/:clientId/events/:eventId` | clientAdministration.report |
| 76 | `GET /my-subscriptions` | subscriptions.mine |
| 77 | `GET /subscription-plans` | subscriptions.catalog |
| 78 | `POST /subscription-plans` | subscriptions.addPlan |
| 79 | `PATCH /subscription-plans/:id` | subscriptions.updatePlan |
| 80 | `DELETE /subscription-plans/:id` | subscriptions.deletePlan |
| 101 | `POST /independent-followups` | followups.create |
| 102 | `GET /my-followups` | followups.list |
| 103 | `POST /my-followups/visibility` | followups.visibility |
| 104 | `POST /my-followups/select` | followups.select |
| 106 | `GET /my-departure` | departure.preview |
| 107 | `POST /my-departure` | departure.leave |
| 109 | `GET /client-directory` | referents.directory |
| 110 | `PATCH /client-directory/:clientId/referent` | referents.assign |
| 112 | `POST /my-session-packs/:clubId/:clientId/:eventId/justify` | sessionPacks.justify |
| 113 | `GET /coach-appointments/:eventId/participants` | sessionPacks.coachClassRoster |
| 114 | `GET /coach-clients/:clientId/session-packs` | sessionPacks.coachView |
| 115 | `POST /my-session-packs/:clubId/:clientId/:packId/acknowledge-last-session` | sessionPacks.acknowledgeLastSession |
| 116 | `GET /my-session-packs` | sessionPacks.mine |
| 117 | `GET /client-administration/:clientId/session-packs` | sessionPacks.get |
| 118 | `POST /client-administration/:clientId/session-packs` | sessionPacks.grant |
| 119 | `GET /client-administration/:clientId/session-packs/:id/history` | sessionPacks.changes |
| 120 | `PATCH /client-administration/:clientId/session-packs/:id` | sessionPacks.update |
| 121 | `DELETE /client-administration/:clientId/session-packs/:id` | sessionPacks.remove |
| 122 | `POST /client-administration/:clientId/session-packs/:id/cancel` | sessionPacks.cancel |
| 123 | `GET /payment-dues` | subscriptions.pending |
| 124 | `GET /client-administration/:clientId/subscriptions` | subscriptions.get |
| 125 | `POST /client-administration/:clientId/subscriptions/:id/preview` | subscriptions.updateContract |
| 126 | `PATCH /client-administration/:clientId/subscriptions/:id` | subscriptions.updateContract |
| 127 | `POST /client-administration/:clientId/subscriptions/preview` | subscriptions.preview |
| 128 | `POST /client-administration/:clientId/subscriptions` | subscriptions.assign |
| 129 | `POST /client-administration/:clientId/payment-checks/:id` | subscriptions.check |
| 133 | `GET /my-termination-requests` | termination.history |
| 134 | `GET /termination/:clubId` | termination.preview |
| 135 | `POST /termination/:clubId` | termination.request |
| 136 | `POST /termination/:clubId/:memberUid/decision` | termination.decide |
| 137 | `GET /my-memberships` | memberships.list |
| 141 | `POST /my-memberships/keep` | memberships.acknowledge |
| 145 | `POST /my-memberships/:clubId/leave` | memberships.leave |
| 150 | `GET /former-clients` | memberships.former |
| 154 | `POST /former-clients/:uid/reactivate` | memberships.reactivate |
| 161 | `GET /my-group-classes` | clientClassBooking.list |
| 165 | `POST /my-group-classes/:clubId/:eventId` | clientClassBooking.reserve |
| 832 | `GET /client-imports` | clientImports.history |
| 833 | `POST /client-imports/preview` | clientImports.preview |
| 834 | `POST /client-imports/row` | clientImports.commitRow |
| 835 | `POST /client-imports/:id/undo` | clientImports.undo |
| 836 | `POST /client-imports/:id/invite/:index` | clientImports.scope, club.collection, batch.collection, tx.get, meta.data, row.data, tx.set |
| 875 | `GET /client-imports/:id/rows` | clientImports.scope, club.collection, docs.map, d.data |
| 881 | `GET /summary` | memberships.expireClub, members.filter, otherClubClients.forEach, clients.set, doc.data, clientsByCoach.filter, programs.set |
| 1328 | `GET /client-capacity` | Voir le handler et ses middlewares |
| 1469 | `POST /clients` | admin.auth, existingClientDoc.data, FieldValue.serverTimestamp, batch.set, Number.isFinite, FieldValue.arrayUnion, batch.commit |
| 1724 | `GET /client-lookup` | admin.auth, clientSnap.data, userSnap.data |
| 1831 | `POST /link-existing-client` | admin.auth, userRef.get, userSnap.data, memberships.link, clientSnap.data, FieldValue.serverTimestamp, FieldValue.arrayUnion |
| 2007 | `PATCH /clients/:clientId` | clientRef.get, clientSnap.data, coachIds.includes, FieldValue.serverTimestamp, docSnap.data, Number.isFinite, admin.auth |
| 2291 | `GET /resolve-program-link` | clientRef.collection |
| 2319 | `PATCH /coaches/:uid` | members.find, FieldValue.serverTimestamp, admin.auth |
| 2383 | `POST /coaches` | members.filter, Number.isFinite, admin.auth, FieldValue.serverTimestamp, batch.set, batch.commit, userRef.set |
| 2537 | `GET /group-class-clients` | snaps.forEach, docs.forEach, doc.data, clients.set, sessionPacks.directoryBalances, clients.keys, clients.values |
| 2565 | `POST /appointments` | Number.isFinite, startsAtDate.getTime, members.find, clientSnap.data, Timestamp.fromDate, FieldValue.serverTimestamp, sessionPacks.credit |
| 2723 | `GET /appointments/:appointmentId` | id.includes, snap.data |
| 2739 | `PATCH /appointments/:appointmentId` | appointmentRef.get, appointmentSnap.data, FieldValue.serverTimestamp, hasOwnProperty.call, Number.isFinite, startsAt.getTime, Timestamp.fromDate |
| 2881 | `DELETE /appointments/:appointmentId` | appointmentRef.get, appointmentSnap.data, batch.delete |
| 2906 | `GET /coach-goals` | snap.data |
| 2955 | `PATCH /goals` | Number.isFinite, goalRef.set, FieldValue.serverTimestamp |
| 3000 | `PATCH /audit/referent` | members.find, FieldValue.serverTimestamp, ref.get, snap.data, referents.assign, itemId.includes, itemId.split |
| 3067 | `POST /nutrition-share-email` | clientRef.collection, clientRef.get, assessmentRef.get, clientSnap.data, assessmentSnap.data, clubIds.includes, coachIds.has |
| 3184 | `POST /logo` | dataUrl.includes, dataUrl.split, Buffer.from, buffer.subarray, crypto.randomUUID, admin.storage, bucket.file |
| 3247 | `PATCH /` | FieldValue.serverTimestamp, hasOwnProperty.call |
| 3285 | `DELETE /coaches/:uid` | members.find, FieldValue.serverTimestamp, admin.auth |

</details>

<details>
<summary>backend/routes/coachOffers.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 7 | `GET /booking` | service.booking |
| 8 | `GET /mine` | service.mine |
| 9 | `GET /` | service.get |
| 10 | `POST /` | service.change |

</details>

<details>
<summary>backend/routes/coachProgramRead.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 15 | `POST /dashboard-templates` | admin.firestore, requesterSnap.data, coachId.includes, docs.filter, changed.filter, programListSummary.sessionCount, document.data |

</details>

<details>
<summary>backend/routes/coachSessions.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 13 | `DELETE /:id/personal` | Voir le handler et ses middlewares |
| 19 | `POST /:id/cancellation-dismiss` | clientCancellation.dismiss |
| 22 | `GET /my-cancellations` | clientCancellation.mine |
| 25 | `GET /cancellation-requests` | clientCancellation.list |
| 28 | `POST /:id/cancellation-review` | clientCancellation.review |
| 31 | `GET /:id/cancellation-policy` | clientCancellation.policy |
| 34 | `POST /:id/client-cancel` | clientCancellation.cancel |
| 114 | `POST /` | requesterSnap.data, clientSnap.data, Number.isNaN, start.getTime, Number.isInteger, programmeSnap.data, start.toISOString |
| 474 | `DELETE /:sessionId` | Voir le handler et ses middlewares |
| 482 | `PATCH /:sessionId/schedule` | Voir le handler et ses middlewares |
| 483 | `PATCH /:sessionId/cancel` | Voir le handler et ses middlewares |
| 484 | `PATCH /:sessionId/edit` | Voir le handler et ses middlewares |
| 485 | `PATCH /:sessionId/status` | Voir le handler et ses middlewares |

</details>

<details>
<summary>backend/routes/contact.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 69 | `POST /` | admin.firestore, FieldValue.serverTimestamp, transporter.sendMail |

</details>

<details>
<summary>backend/routes/emailTracking.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 8 | `GET /open/:eventId.gif` | transaction.get, snap.data, transaction.update, FieldValue.serverTimestamp, FieldValue.increment |

</details>

<details>
<summary>backend/routes/messaging.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 34 | `GET /client-records` | results.flatMap, snap.data, records.set, records.values |
| 49 | `GET /access` | clientSnap.data, professional.data |
| 66 | `POST /send` | clientSnapshot.data, accounts.has, professionals.has, professionalSnapshot.data, conversationRef.collection, FieldValue.serverTimestamp, batch.set |

</details>

<details>
<summary>backend/routes/payments.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 904 | `POST /register-customer` | Voir le handler et ses middlewares |
| 948 | `POST /admin/delete-user/preview` | admin.firestore, admin.auth |
| 957 | `POST /admin/delete-user` | admin.firestore, admin.auth |
| 975 | `POST /admin/send-password-reset` | admin.auth, admin.firestore, FieldValue.serverTimestamp, message.includes |
| 1035 | `POST /admin/cancel-subscription` | admin.firestore, uSnap.data, subscriptions.update |
| 1081 | `POST /admin/set-trial` | Number.isFinite, admin.firestore, uSnap.data, Number.isNaN, trialEndDate.getTime, subscriptions.update, FieldValue.serverTimestamp |
| 1158 | `POST /admin/set-access` | allowed.has, admin.firestore, userRef.get, snap.data, now.getTime, FieldValue.serverTimestamp |
| 1208 | `POST /admin/set-entitlements` | Number.isInteger, admin.firestore, userRef.get, snap.data, userRef.set, FieldValue.serverTimestamp |
| 1285 | `POST /admin/assign-premium` | Voir le handler et ses middlewares |
| 1430 | `GET /admin/billing-summary` | customers.retrieve, subscriptions.list, invoices.list, invoiceList.filter, openInvoices.reduce, invoiceList.map |
| 1519 | `POST /admin/create-invoice` | Number.isFinite, prices.retrieve, invoices.create, invoiceItems.create, invoices.finalizeInvoice, invoices.sendInvoice |
| 1617 | `GET /admin/prices` | prices.list |
| 1640 | `POST /admin/invoice-action` | allowed.has, invoices.retrieve, invoices.finalizeInvoice, invoices.sendInvoice, invoices.pay, invoices.markUncollectible, invoices.del |
| 1759 | `POST /create-stripe-portal-session` | Voir le handler et ses middlewares |
| 1789 | `POST /pending-program` | Voir le handler et ses middlewares |
| 1792 | `POST /pending_program` | Voir le handler et ses middlewares |
| 1793 | `POST /pending-programs` | Voir le handler et ses middlewares |
| 1794 | `POST /pending_programs` | Voir le handler et ses middlewares |
| 1795 | `POST /pending` | Voir le handler et ses middlewares |
| 1796 | `POST /pending_prefs` | Voir le handler et ses middlewares |
| 1797 | `POST /pending-programme` | Voir le handler et ses middlewares |
| 1802 | `GET /premium-programs` | admin.firestore, snap.forEach, docSnap.data, map.set, map.values |
| 1862 | `GET /free-eligibility` | Voir le handler et ses middlewares |
| 1892 | `POST /recover-premium-purchases` | sessions.list, recovered.push |
| 1947 | `POST /create-checkout-session` | hostname.toLowerCase, host.endsWith, Number.isFinite, admin.firestore, programSnap.data, promotionCodes.list, discounts.push |
| 2411 | `GET /session` | sessions.retrieve |
| 2427 | `POST /finalize-session` | sessions.retrieve |
| 2495 | `POST /admin/reconcile` | Voir le handler et ses middlewares |
| 2496 | `POST /reconcile` | Voir le handler et ses middlewares |
| 2580 | `POST /start-trial-local` | Voir le handler et ses middlewares |
| 2605 | `POST /recompute-access` | admin.firestore, docRef.get, snap.data, docRef.set, FieldValue.serverTimestamp |
| 2634 | `POST /claim-first-free` | admin.firestore, userRef.get, userSnap.data, userRef.set, FieldValue.serverTimestamp |
| 2687 | `GET /_diag/stripe-key` | Voir le handler et ses middlewares |
| 2695 | `GET /_diag/echo` | Voir le handler et ses middlewares |

</details>

<details>
<summary>backend/routes/programs.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 324 | `POST /generate` | Number.isFinite |
| 419 | `POST /:programId/sync-assignments` | admin.firestore, requesterSnap.data, templateSnap.data |

</details>

<details>
<summary>backend/routes/stripePortal.js</summary>

| Ligne | Route | Appels du handler (extrait) |
|---:|---|---|
| 6 | `POST /session` | Voir le handler et ses middlewares |
| 7 | `POST /create-stripe-portal-session` | Voir le handler et ses middlewares |

</details>

