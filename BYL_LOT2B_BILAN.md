# Lot 2B — Messagerie Club et professionnelle

**Branche** `codex/firebase-performance-audit`. La référence avant correction est le commit validé du Lot 2A, `4b1d084`. Tous les essais utilisent des identités synthétiques et les émulateurs locaux Auth et Firestore. Aucun déploiement.

## 1. Causes identifiées

- À l’ouverture du Dashboard Club, la bulle et le badge appelaient chacun la liste des contacts. Le hook membre renouvelait sa demande après 10 s. Le panneau et le fil avaient leurs propres minuteries de 10 et 20 s. Le focus et les événements de lecture pouvaient relancer ces parcours. Chaque onglet les répétait.
- La route Club `/contacts` assemblait le club, les utilisateurs, les membres et les clients liés par deux champs historiques. Elle lisait ensuite une racine de conversation par contact potentiel, y compris pour les conversations inexistantes. L’autorisation d’un fil pouvait elle-même reconstruire cet annuaire.
- Côté professionnel, les consommateurs chargeaient les dossiers pour découvrir leurs conversations puis installaient une écoute par contact. Le nombre de dossiers potentiels déterminait le coût d’ouverture. Côté Club, un fil ouvert relisait régulièrement ses 50 derniers messages.
- Un envoi pouvait avancer le curseur de lecture de l’expéditeur alors qu’il restait un message entrant non consulté. L’ancien accusé Club avançait à l’heure serveur du POST. Un message intervenu entre le GET et le POST pouvait ainsi être acquitté.

## 2. Architecture retenue

**Annuaire.** La recherche et la commande de nouvelle discussion ouvrent l’annuaire à la demande. Un lien profond vers un destinataire sans conversation active peut également le charger. Les vues ordinaires viennent de `/inbox`. La route Club historique `/contacts` reste disponible et joint les conversations en une seule requête.

**Conversations et notifications.** Un magasin React en mémoire mutualise les consommateurs par identité Firebase, rôle et périmètre. Le serveur écoute les racines de conversations existantes par club, par destinataire Club ou par participant professionnel. Il partage chaque écoute entre les requêtes du même processus et la détache 1,5 s après le dernier consommateur. Il n’ajoute ni collection de signaux ni écriture de télémétrie. L’onglet attend une réponse HTTP authentifiée pendant au plus 24 s. Un changement de racine réveille l’attente. À son terme, l’API revalide le périmètre et les destinataires avant de renvoyer les données. Une empreinte évite de retransmettre une projection identique.

**Autorisation.** La liste en mémoire du serveur contient des candidats. L’autorisation vient des documents actuels du club, du rôle, du dossier, du participant et, quand il est nécessaire, du statut de membre ou de l’existence d’un responsable actif. Les lectures répétées du même document sont regroupées pendant une seule vérification. La prévisualisation Club par un administrateur vérifié est en lecture seule. Les mutations contrôlent l’autorisation dans la transaction qui écrit le message ou l’accusé. Le tarif Solo garde son contrôle serveur.

**Fils et lectures.** Ouvrir un fil Club charge au plus 50 messages affichés et un document témoin pour la pagination. Un curseur de commit et d’identifiant récupère les changements, y compris plusieurs pages pendant une interruption. L’historique sans marqueur de commit reste accessible par son ordre historique. Le fil peut réconcilier les pages lorsqu’une racine signale une écriture ancienne. Les auteurs de messages système enregistrent les marqueurs dans leurs écritures atomiques existantes. Le fil professionnel utilise sa requête Firebase bornée, avec rattrapage si deux fenêtres successives ne se recouvrent plus. L’affichage initial attend une réponse du serveur.

Le badge compte les **conversations non lues**. Le navigateur confirme un message entrant qui a intersecté le panneau dans un onglet visible. Le serveur vérifie son identité, sa conversation et son horodatage. Le curseur avance de façon monotone. La messagerie Club départage aussi les messages de même horodatage par identifiant. Un envoi utilise un identifiant de requête réutilisé en cas de relance. Pour les anciens clients Club qui omettent le message dans le POST de lecture, l’API utilise un marqueur de page précédemment servie, limité dans le temps, puis revérifie l’accès. En l’absence de marqueur elle demande de relire le fil.

**Onglets et déconnexion.** Chaque onglet reçoit sa propre réponse autorisée. Les onglets d’un même processus API partagent l’écoute Firestore, et les navigateurs compatibles utilisent Web Locks pour coordonner les toasts. Les contenus ne transitent pas par le stockage inter-onglets. À la perte de connexion, les vues signalent l’indisponibilité. Au retour, elles reprennent auprès du serveur. Une réponse issue de l’ancienne identité est rejetée. La déconnexion retire le cache de messagerie, ses marqueurs de notification et les brouillons de messagerie du compte dans l’onglet.

## 3. Fichiers modifiés

| Périmètre | Fichiers |
|---|---|
| API et autorisation | `backend/routes/clubMessaging.js`, `backend/routes/messaging.js`, `backend/utils/clubMessaging.js`, `backend/utils/clubInboxWatch.js` |
| Écritures de messages système | `backend/utils/clientSessionCancellation.js`, `backend/utils/clubTermination.js` |
| Source partagée et intégration | Dans `src/components/messaging/` : `messagingFeed.js`, `clubMessagingApi.js`, `useClubThread.js`, `useVisibleReceipt.js`, `useClubUnreadCount.js`, `useMemberClubContacts.js`, `useMessagingContacts.js`, `ClubMessagingPanel.jsx`, `DashboardMessagingBubble.jsx`, `MessagingThread.jsx`. Également `src/pages/MessagingPage.jsx` et `src/utils/messaging.js` |
| Mesure | `backend/utils/firestoreMetrics.js`, `src/utils/browserMetrics.js`, `src/utils/firestoreMetrics.js`, `scripts/measureFirebaseBrowser.cjs`, `scripts/measureFirebaseLot1.cjs`, `scripts/measureClubMessaging.cjs`, `scripts/fixtures/firebaseMessagingBrowser.jsx` |
| Tests adaptés | `scripts/testClubMessaging.cjs`, `scripts/testMessagingClientRecords.cjs`, `scripts/testMessagingPlanAccess.cjs`, `scripts/testMessagingUnlinkedContacts.cjs`, `scripts/smokeCriticalFlows.mjs` |

## 4. Mesures avant et après

Le banc reprend les 12 dossiers du Lot 1, le propriétaire, le coach et un membre lié au dossier synthétique. Les fenêtres de repos commencent à froid, avec un annuaire non vide et aucune conversation active. Les fenêtres à deux onglets comprennent les deux démarrages. Le tableau additionne la messagerie Club et professionnelle. Les HTTP incluent les attentes annulées au démontage. Une souscription SDK initiale compte comme une opération. Les contrôles de droits exécutés avant une annulation sont inclus.

| Fenêtre | HTTP avant → après | Opérations SDK serveur avant → après | Documents avant → après | Estimation documentaire avant → après |
|---|---:|---:|---:|---:|
| 1 onglet, 22 s | 5 → 4 | 98 → 9 | 83 → 7 | 153 → 9 |
| 2 onglets, 22 s | 10 → 8 | 196 → 16 | 166 → 14 | 306 → 16 |
| 1 onglet, 62 s | 11 → 8 | 216 → 19 | 183 → 17 | 337 → 19 |
| Deux envois du membre et deux lectures du responsable, 1 440 px | 22 → 14 | 362 → 73 | 380 → 70 | 605 → 77 |

Sur la fenêtre de 62 s, l’écoute reste attachée pendant deux renouvellements de la requête. Le total après correction inclut les contrôles d’autorisation de ces renouvellements. À 500 px, les compteurs des deux fenêtres de 22 s sont identiques aux valeurs desktop corrigées.

La dernière ligne compare un parcours jusqu’à son achèvement. Le premier envoi arrive fil fermé, le second fil ouvert. Avant correction, 16 des 22 appels HTTP reconstruisent l’annuaire. Après correction, les 14 appels comprennent les attentes d’inbox, deux chargements du fil, deux envois et deux accusés. L’écoute Club compte quatre changements de racine. Le parcours corrigé se termine plus vite que l’ancien parcours soumis aux minuteries.

Le parent du 18 octobre donnait **2 HTTP, 38 opérations SDK et 32 documents** sur 22 s. Le commit du 18 octobre donnait **5, 98 et 83**. Pour l’ancienne version, Chrome a également tenté trois requêtes professionnelles directes refusées dans l’onglet observé. Elles n’ont retourné aucun document et sont séparées du tableau serveur. La version corrigée ne fait aucune lecture SDK directe du navigateur dans ces fenêtres de repos. Le SDK du fil professionnel intervient lorsque ce fil est ouvert.

Le test unitaire de la route historique `/contacts?clubId=sample` passe de **19 à 9 opérations SDK** et d’une estimation de **30 à 20**. Il retourne **17 documents contre 16** auparavant. Cette hausse d’un document provient des contrôles ciblés. Les écrans corrigés ne passent plus par cette route pour surveiller les notifications.

Une confirmation de lecture Club sur un fil actif a demandé 8 opérations SDK, 7 documents et une estimation de 8. L’accusé professionnel a demandé 4 opérations, 4 documents et une estimation de 4. Une page Club de 50 messages avec un témoin et les vérifications d’accès a rendu 57 documents. Les économies au repos ne suppriment pas le coût de lire un fil réellement consulté.

L’estimation compte les documents retournés par lecture, avec un minimum pour une requête vide ou un document absent. Pour l’écoute, elle compte le résultat initial, puis les changements observés. Les frais d’index, les relectures internes, les dépendances des règles et la facturation effective ne sont pas connus. Les émulateurs ne produisent aucune mesure Cloud Billing. Les logs de métriques sont opt-in et contiennent des compteurs, jamais les messages, les identités ou les jetons.

## 5. Sécurité et fonctionnement

- Les tests API couvrent l’envoi simultané, la relance idempotente, une réponse envoyée avant d’avoir tout lu, l’accusé partiel, un accusé ancien arrivé en retard et l’isolation entre les deux sens de la conversation.
- La pagination a restitué **64 messages distincts** sur deux pages avec un historique ancien. Le rattrapage de **63 écritures portant le même horodatage** a rendu 50 puis 13 messages distincts. La lecture du premier message du lot a conservé le badge. La lecture du dernier l’a effacé.
- Les contrôles portent sur le membre retiré, le changement de club du responsable pendant une attente, le remplacement du compte lié à un dossier, un tiers qui tente d’ouvrir le fil, la prévisualisation administrateur et le refus d’envoyer en prévisualisation. Un changement de périmètre ne transporte pas l’historique vers son nouveau titulaire.
- Tests ciblés réussis pour les clients sans compte, plusieurs professionnels, les dossiers liés par des champs historiques, les 18 combinaisons d’expéditeur et d’offre, les messages d’annulation et de résiliation, les notifications e-mail et leurs conditions de déduplication. Aucun e-mail réel envoyé. La suite Firestore a réussi **78 tests** sur les règles existantes.
- La compilation de production et les budgets de taille passent. Le contrôle messagerie de `npm run test:smoke` passe. La suite globale s’arrête ensuite sur le contrôle préexistant du tutoriel `coach-today` : le test cherche un attribut JSX littéral, alors que le Dashboard validé au Lot 2A le fournit via un objet de propriétés. La même assertion a été rejouée directement sur les sources de `4b1d084` et y échoue à l’identique.

## 6. Un et deux onglets

Sur 22 s, les deux onglets ouvrent au total une écoute Club et une écoute professionnelle sur le processus serveur. Les deux contrôles d’accès et les réponses HTTP restent propres aux onglets. Aucun appel à l’annuaire et aucun chargement de fil dans ces fenêtres. Monter ensemble le badge, la bulle, la page Messages et le panneau Club produit les mêmes **4 HTTP, 9 opérations SDK, 7 documents et 9 lectures estimées** que l’onglet au repos.

Deux onglets du responsable ont reçu le message du membre, affiché chacun le badge puis convergé vers zéro après l’accusé de l’un des onglets. Le résultat est vérifié à 1 440 et 500 px. Dans un passage mobile complémentaire avec l’application finale, le même envoi a déclenché **un toast visible au total** entre les deux onglets. Ouvrir explicitement l’annuaire dans le panneau a déclenché un seul HTTP, 8 opérations SDK, 17 documents retournés et une estimation de 19.

## 7. Réception et lecture

| Délai local en ms | Avant, 1 440 px | Après, 1 440 px | Après, 500 px |
|---|---:|---:|---:|
| Envoi → badge, fil fermé | 20 000 | 999 | 999 |
| Ouverture du fil → premier message affiché | 153 | 85 | 77 |
| Envoi → message affiché, fil ouvert | 9 239 | 112 | 111 |
| Envoi → affichage et confirmation du badge à zéro | 9 314 | 150 | 147 |
| Révocation du responsable → retrait du fil affiché | Non chronométré | 23 038 | 22 997 |

Les quatre premiers délais desktop proviennent du parcours comparatif des deux envois. Lors d’un autre passage, la révocation a été détectée en 14 ms quand elle a coïncidé avec un changement déjà en cours.

Le test maintient aussi une réponse de l’ancien compte en attente pendant la déconnexion et la connexion du membre. Sa libération est rejetée par le client. Dans le fil professionnel ouvert, le client a vu l’historique puis le nouvel envoi du coach. Le coach a reçu la réponse du client. Les deux comptes ont été authentifiés simultanément.

La coupure est simulée dans Chrome par le refus du transport HTTP de messagerie dans l’onglet observé et par les événements hors ligne/en ligne. Le second compte envoie pendant l’interruption. Le test exige que le message apparaisse au retour. Le banc vérifie aussi les échanges coach/client et Club/membre avec des sessions Firebase séparées. Les temps sont des observations Chrome local, commandes et contrôles DOM compris. Une attente d’onglet en arrière-plan peut être ralentie par Chrome. Ces observations ne fournissent pas de percentile de production.

## 8. Risques résiduels

- Le volume initial dépend du nombre de **racines de conversation existantes** dans le périmètre. La requête peut aussi rapporter des racines anciennes, masquées ou dont le participant a perdu l’accès. Le filtrage précède leur restitution. Les contrôles des dossiers actifs se répètent lors des réponses, notamment aux échéances de 24 s. Un grand club, un trafic continu ou plusieurs instances API peuvent coûter davantage que la fixture. Le partage est local au processus. Un réveil ou un redémarrage peut relire la requête initiale.
- Une révocation qui ne modifie que l’appartenance peut laisser la projection déjà affichée à l’écran jusqu’au contrôle suivant. Une tentative de lecture, d’envoi ou d’accusé repasse immédiatement par le serveur. Une rupture réseau ou un proxy qui coupe les attentes peut allonger la reconnexion. Le navigateur relance avec temporisation progressive.
- Les annuaires ouverts explicitement gardent leurs limites historiques de requête. Les clients installés qui utilisent encore `/contacts` conservent leurs propres minuteries. Pour leurs accusés, une bascule d’instance sans cookie utilisable peut demander un nouveau chargement du fil. La nouvelle interface transmet son marqueur directement.
- L’essai mobile utilise un viewport Chrome de 500 px. Les suspensions du système sur téléphone physique, les notifications en arrière-plan de l’OS, les intermédiaires réseau de production et une flotte de plusieurs processus n’ont pas été mesurés. Sans Web Locks, les onglets utilisent le marqueur partagé en stockage local et deux toasts peuvent encore se chevaucher. Les compteurs et les accusés restent indépendants de ces toasts.
- Le contrôle d’offre professionnelle à 60 s reste limité au fil professionnel consulté. Les résultats de facturation nécessiteraient des mesures réelles sur un environnement autorisé.

## 9. Reproduction et lot suivant

Avec les dépendances du dépôt, Java 21, Firebase CLI et Chrome local :

```sh
firebase emulators:exec --config firebase.performance-test.json \
  --project demo-byl-performance --only auth,firestore \
  "node scripts/measureClubMessaging.cjs"
```

Le script publie un JSON par révision et largeur. `BYL_MSG_CASE=before1440`, `after1440` ou `after500` sélectionne un passage. `BYL_MSG_API_ONLY=1` exécute les assertions API. `BYL_MSG_ACTIVE_ONLY=1` compare uniquement le parcours actif desktop après les assertions API. Le script refuse un autre projet ou une adresse Firebase non locale. La préparation extrait les sources historiques dans un répertoire temporaire.

Pour le prochain lot, je recommande de conserver cette fixture comme contrôle de non-régression et d’ajouter une distribution réaliste du nombre de conversations actives, un proxy à délai court et plusieurs processus API. Cela permettrait de comparer le coût marginal par changement, le délai de révocation et les reprises d’écoute avant d’envisager une architecture supplémentaire.
