# Lot 7A — matrice des tests et traçabilité

Campagne du 10 novembre 2026. Branche `codex/firebase-performance-audit`, version applicative `e476b0a4cfcd6bb9e27515c69a5416325e480f6e`. Campagne locale sur fixtures synthétiques.

## Confirmé par test

109 exécutions de test sur la version auditée, dont 101 réussies et 8 échouées. Le build est compté séparément. Une exécution est une commande de suite ou de scénario, même si elle contient plusieurs assertions. Des suites se recouvrent. Les 82 contrôles Rules et les 53 contrôles smoke ne sont pas ajoutés une seconde fois. Les contre-épreuves de la référence, le premier lancement sans option VM et le build sont hors dénominateur.

## Couverture des parcours


Parcours | Essais correspondants | Limite
--- | --- | ---
Coach | Connexion Auth émulateur, pages coach et Clients, création/modification du dossier par SDK, affectation et lecture par client, duplication, séance et calendrier, contrats et crédits, messagerie, nutrition et statistiques. Voir triple, browser-coach, offer et les tests spécialisés. | La création depuis chaque formulaire et le parcours navigateur continu du login jusqu’aux statistiques ne sont pas couverts. Nutrition a un banc cassé T3.
Client | browser-client exerce Dashboard → ProgramView → SessionPlayer, feedback, retour, annulation et deux onglets. devices contrôle appareils indépendants et rattrapage. Tests spécialisés reprise, anciens programmes, difficultés et indicateurs. | Le contexte d’authentification de la page est contrôlé par le banc. Détail de tous les réglages, nutrition et statistiques en parcours continu non vérifié.
Club | Calendrier, cours collectifs, dernière place, FIFO, séance validée vue par trois rôles, packs, adhésions, sorties, gestion des rattachements, messagerie et contrat PDF. | Export PDF réel parcouru visuellement, parcours complet d’import et administration de tous les coachs via UI non vérifiés.
Administration | admin-delete, coach-api, auth, lot1 et tests admin de navigation, diagnostics et géographie. Prévisualisation, autorisation, réactivation, suppression et conservation d’un compte témoin testées à différents niveaux. | Pas de parcours navigateur continu des écrans admin avec toute la pile d’authentification.
Paiements | Signature webhook réelle sur événement simulé, session impayée puis payée, événements concurrents et tardifs. Crédits/réservations et version côté serveur. Livraison, panne de marqueur et reprise du bail. | Prestataire et transport SMTP remplacés dans les bancs. Flux externes, chargebacks et rapprochement comptable non vérifiés.
Compatibilité | Clés de propriété et de session historiques, documents de dates mixtes, récurrences, heure d’été/hiver, validation, répétition/suppression, pagination de messages anciens et ajouts concurrents. Index absent injecté pour offres, expiration et calendrier personnel. calendar-index contrôle le rendu vide après refus du repli. | L’émulateur ne démontre pas le comportement du planificateur Cloud pour chaque index manquant.


## Traçabilité lots, fichiers et essais

Le diff cumulé depuis `a55018a75a877b4db7c4aa6e5b3fce2037d9eadb` couvre 149 fichiers, 13 308 insertions et 2 279 suppressions. La liste ci-dessous sélectionne les fichiers applicatifs pour guider la revue. La commande `git show --name-only <commit>` donne la liste intégrale du lot, y compris les fixtures et les rapports.

**Lot 1 · `4e65de8` · 25 fichiers.** `backend/app.js`, `backend/cron.worker.js`, `backend/membership-expiry.worker.js`, `backend/utils/firestoreMetrics.js`, `functions/index.js`, `package.json`, `src/components/Clients.jsx`, `src/components/CoachDashboard.jsx`, `src/components/messaging/clubMessagingApi.js`, `src/components/messaging/useMessagingContacts.js`, `src/components/offers/OfferPreviewStore.js`, `src/pages/AdminGeo.jsx`, `src/utils/api.js`, `src/utils/browserMetrics.js`, `src/utils/firestoreMetrics.js`, `src/utils/messaging.js`, `src/utils/requestCoordinator.js`. Essais associés · lot1. Retour arrière · Désactiver la collecte optionnelle. Conserver un moyen de comparer les compteurs.

**Lot 2A · `4b1d084` · 15 fichiers.** `backend/routes/coachOffers.js`, `backend/utils/coachOffers.js`, `firestore.indexes.json`, `src/components/CoachDashboard.jsx`, `src/components/offers/DashboardOfferAlerts.jsx`, `src/components/offers/OfferClientSummary.jsx`, `src/components/offers/OfferPaymentPreview.jsx`, `src/components/offers/OfferPreviewStore.js`, `src/components/offers/OfferRenewalAlerts.jsx`, `src/utils/api.js`. Essais associés · offer. Retour arrière · Rétablir ensemble le client et son API de prévisualisation. Maintenir la vérification serveur des crédits.

**Lot 2B · `a14e066` · 31 fichiers.** `backend/routes/clubMessaging.js`, `backend/routes/messaging.js`, `backend/utils/clientSessionCancellation.js`, `backend/utils/clubInboxWatch.js`, `backend/utils/clubMessaging.js`, `backend/utils/clubTermination.js`, `backend/utils/firestoreMetrics.js`, `src/components/messaging/ClubMessagingPanel.jsx`, `src/components/messaging/DashboardMessagingBubble.jsx`, `src/components/messaging/MessagingThread.jsx`, `src/components/messaging/clubMessagingApi.js`, `src/components/messaging/messagingFeed.js`, `src/components/messaging/useClubThread.js`, `src/components/messaging/useClubUnreadCount.js`, `src/components/messaging/useMemberClubContacts.js`, `src/components/messaging/useMessagingContacts.js`, `src/components/messaging/useVisibleReceipt.js`, `src/pages/MessagingPage.jsx`, `src/utils/browserMetrics.js`, `src/utils/firestoreMetrics.js`, `src/utils/messaging.js`. Essais associés · msg-ui, testClubMessaging. Retour arrière · Maintenir les routes compatibles avec les anciens clients et vider les réponses en vol.

**Lot 2B.1 · `3955d59` · 18 fichiers.** `backend/routes/clubMessaging.js`, `backend/routes/clubs.js`, `backend/routes/messaging.js`, `backend/utils/clubInboxWatch.js`, `backend/utils/clubMessaging.js`, `backend/utils/firebaseAuth.js`, `firestore.rules`, `src/AuthContext.jsx`, `src/components/messaging/DashboardMessagingBubble.jsx`, `src/components/messaging/messagingFeed.js`, `src/components/messaging/useClubThread.js`, `src/components/messaging/useMessagingContacts.js`. Essais associés · intersection, auth. Retour arrière · Conserver les contrôles de droits au réveil et les protections des mutations.

**Lot 2B.2 · `31009aa` · 27 fichiers.** `backend/routes/clubMessaging.js`, `backend/routes/clubs.js`, `backend/routes/messaging.js`, `backend/routes/payments.js`, `backend/utils/adminAccountDeletion.js`, `backend/utils/clubInboxWatch.js`, `backend/utils/clubMessaging.js`, `backend/utils/firebaseAuth.js`, `backend/utils/inboxProjection.js`, `backend/utils/messagingRevocation.js`, `firestore.rules`, `functions/index.js`, `src/AuthContext.jsx`. Essais associés · inbox, auth-window. Retour arrière · Garder marqueurs et règles de révocation actifs. Revenir séparément sur la mutualisation après drainage des attentes.

**Lot 3 · `bff7eaf` · 20 fichiers.** `backend/cron.worker.js`, `backend/membership-expiry.worker.js`, `backend/utils/clubMemberships.js`, `backend/utils/legacyCronSubscriptions.js`, `backend/utils/membershipExpiryLease.js`, `backend/utils/subscriptionCycleWorker.js`, `backend/utils/subscriptionCycles.js`, `backend/utils/workerFirestoreError.js`, `firestore.indexes.json`, `functions/index.js`, `functions/lifecycleSchedule.js`. Essais associés · workers, scheduler. Retour arrière · Arrêter le consommateur, attendre les baux, reprendre sur un seul worker. Contrôler les opérations déjà livrées.

**Lot 4 · `a2661ad` · 32 fichiers.** `backend/routes/coachProgramRead.js`, `backend/utils/coachClientListSummary.js`, `backend/utils/coachPageWire.js`, `backend/utils/firestoreMetrics.js`, `firestore.indexes.json`, `firestore.rules`, `functions/coachPageRevision.js`, `functions/index.js`, `src/components/Clients.jsx`, `src/components/CoachDashboard.jsx`, `src/components/dashboard/CoachPageAccess.jsx`, `src/utils/api.js`, `src/utils/browserMetrics.js`, `src/utils/coachDirectoryFeed.js`, `src/utils/coachListRows.js`, `src/utils/coachPageSource.js`, `src/utils/coachProgramBatch.js`, `src/utils/firestoreMetrics.js`, `src/utils/pageDataCache.js`, `src/utils/useCoachPageViewer.js`. Essais associés · coach-api, browser-coach500. Retour arrière · Désactiver les vues de liste, vérifier la reconstruction canonique et renouveler les caches de périmètre.

**Lot 5 · `866241d` · 18 fichiers.** `functions/index.js`, `functions/programCompletionThreshold.js`, `src/components/AutoProgramPreview.jsx`, `src/components/Clientdashboard.jsx`, `src/components/ProgramView.jsx`, `src/components/SessionPlayer.jsx`, `src/hooks/useProgrammeDocument.js`, `src/pages/StatisticsPageClient.jsx`, `src/utils/clientProgramFeed.js`. Essais associés · devices, browser-client, browser-deep. Retour arrière · Réactiver les lecteurs historiques, vérifier les comptes sur les historiques canoniques. Aucune conversion destructive.

**Lot 6 · `e476b0a` · 33 fichiers.** `backend/routes/clubs.js`, `backend/routes/coachSessions.js`, `backend/utils/clientSessionCancellation.js`, `backend/utils/clubCalendarPeriod.js`, `backend/utils/clubClassBooking.js`, `backend/utils/clubSessionPacks.js`, `backend/utils/clubSubscriptions.js`, `backend/utils/firestoreMetrics.js`, `firestore.indexes.json`, `src/components/Clientdashboard.jsx`, `src/components/CoachDashboard.jsx`, `src/components/dashboard/ClubLogo.jsx`, `src/components/dashboard/ClubMobileCalendar.jsx`, `src/components/dashboard/ClubPlanningDownload.jsx`, `src/components/dashboard/CoachDashboardCalendar.jsx`, `src/components/dashboard/useClientClubClasses.jsx`, `src/pages/ClubDashboard.jsx`, `src/utils/api.js`, `src/utils/calendarBootstrap.js`, `src/utils/calendarWindow.mjs`, `src/utils/clientCalendarFeed.js`, `src/utils/coachPageSource.js`, `src/utils/useClubCalendarPeriod.js`. Essais associés · calendar, triple, foreign-link. Retour arrière · Rétablir ensemble les routes et lecteurs de période. Garder les index tant que des lecteurs en dépendent.

## Registre des exécutions

Les commandes firebase ci-dessous s’exécutent dans une enveloppe emulators:exec Auth + Firestore en loopback, projet demo-byl-performance. Les run* ouvrent eux-mêmes leurs émulateurs. Les temps incluent leur démarrage. Les sondes spécifiques sont reproduites en annexe.

ID | Commande interne ou locale | Résultat | Secondes
--- | --- | --- | ---
admin-delete | `node admin7.cjs` | réussi | 8.9
auth-window | `node scripts/probeExternalWindow.cjs` | réussi | 30.1
auth | `node scripts/testMessagingLot2B2.cjs` | réussi | 46.1
browser-100 | `node scripts/runCalendarLot6.cjs after 100 1440 18` | réussi | 19.5
browser-client | `node scripts/runClientProgressLot5.cjs after 1 10 500 15 journey` | réussi | 37.9
browser-club | `node scripts/runCalendarLot6.cjs after 12 1440 14` | réussi | 48.0
browser-coach | `node scripts/runCoachPagesLot4.cjs after 12 1440 12` | réussi | 40.2
browser-coach500 | `node scripts/runCoachPagesLot4.cjs after 500 1440 13` | réussi | 40.5
browser-deep | `node scripts/runClientProgressLot5.cjs after 20 1000 1440 16` | réussi | 45.7
browser-empty | `node scripts/runCalendarLot6.cjs after 0 1440 17` | réussi | 22.2
calendar-index | `node --experimental-vm-modules fallback7.cjs` | réussi | 2.1
calendar | `node scripts/testCalendarLot6.cjs` | réussi | 30.0
club500 | `node scripts/runCalendarLot6.cjs after 500 500 20` | réussi | 18.1
coach-api | `node scripts/testCoachPagesLot4.cjs` | réussi | 23.5
coach100-control | `node scripts/runCoachPagesLot4.cjs after 100 500 21` | réussi | 16.1
coach100 | `node scripts/runCoachPagesLot4.cjs after 100 500 21` | échec | 12.3
cycle-journey | `node scripts/testCycleValidationJourney.mjs` | réussi | 0.2
cycles | `node scripts/testCyclesToPrepare.mjs` | réussi | 0.1
devices | `node scripts/testClientProgressLot5.cjs` | réussi | 18.1
display-metrics | `node scripts/testProgramDisplayMetrics.mjs` | réussi | 0.1
doc-size | `node scripts/testProgramDocumentSize.mjs` | réussi | 0.1
emulator-fixes | `npm run test:emulator-fixes` | réussi | 11.4
foreign-link | `node cross7.cjs legacy-link` | échec | 12.9
functions | `npm --prefix functions test` | réussi | 0.8
inbox | `BYL_LABEL=2B2 BYL_SIZES=1000 node scripts/measureMessagingLot2B2.cjs` | réussi | 133.1
intersection | `BYL_LABEL=2B2 BYL_TOPO_INSTANCES=2 BYL_TOPO_SIZE=100 BYL_VALIDATE_WITHDRAWAL=1 node scripts/testMessagingLargeInbox.cjs` | réussi | 38.9
lot1 | `node scripts/measureFirebaseLot1.cjs --current` | réussi | 14.9
msg-ui | `BYL_MSG_CASE=after1440 node scripts/measureClubMessaging.cjs` | réussi | 182.1
offer | `node scripts/measureCoachOffers.cjs` | réussi | 410.1
paid-firestore | `node scripts/testPaidProgramFirestore.cjs` | réussi | 15.8
persistent-content | `node scripts/runClientProgressLot5.cjs after 1 10 500 25` | réussi | 10.8
persistent-profile | `node scripts/runClientProgressLot5.cjs after 1 10 500 25` | réussi | 11.1
personal-client | `node scripts/runCalendarLot6.cjs after 12 500 23 client` | réussi | 15.5
personal-coach | `node scripts/runCalendarLot6.cjs after 12 1440 22 coach` | réussi | 17.5
privilege | `node probe7.cjs head` | échec | 12.9
release | `npm run test:release-regressions` | échec | 0.3
rules | `npm run test:security-rules` | réussi | 16.1
scheduler | `node scripts/testWorkerSchedulerLot3.cjs after` | réussi | 12.7
smoke | `npm run test:smoke` | réussi | 8.0
stripe | `node stripe7.cjs` | réussi | 9.5
testAdminAccountDeletion | `node scripts/testAdminAccountDeletion.cjs` | réussi | 1.24
testAdminClientNavigation | `node scripts/testAdminClientNavigation.mjs` | réussi | 0.85
testAdminClientPreferences | `node scripts/testAdminClientPreferences.cjs` | réussi | 0.35
testAdminCoachDeletion | `node scripts/testAdminCoachDeletion.mjs` | réussi | 0.35
testAdminDiagnostics | `node scripts/testAdminDiagnostics.mjs` | réussi | 1.06
testAdminGeoInteraction | `node scripts/testAdminGeoInteraction.mjs` | réussi | 0.45
testAppResume | `node scripts/testAppResume.mjs` | réussi | 0.15
testBuilderSaveConfirmation | `node scripts/testBuilderSaveConfirmation.mjs` | réussi | 0.19
testClientCreationDelivery | `node scripts/testClientCreationDelivery.cjs` | réussi | 0.36
testClientCycleTimeline | `node scripts/testClientCycleTimeline.mjs` | réussi | 0.13
testClientMobileCalendar | `node scripts/testClientMobileCalendar.mjs` | réussi | 0.13
testClientProfilePublication | `node scripts/testClientProfilePublication.mjs` | réussi | 0.14
testClientSessionCancellation | `node scripts/testClientSessionCancellation.cjs` | réussi | 0.24
testClientWeekSessions | `node scripts/testClientWeekSessions.mjs` | échec | 0.14
testClubClassBooking | `node scripts/testClubClassBooking.cjs` | réussi | 0.34
testClubClientImport | `node scripts/testClubClientImport.cjs` | réussi | 0.3
testClubClientNames | `node scripts/testClubClientNames.cjs` | réussi | 0.19
testClubDeparture | `node scripts/testClubDeparture.cjs` | réussi | 0.19
testClubMemberships | `node scripts/testClubMemberships.cjs` | réussi | 0.44
testClubMessaging | `node scripts/testClubMessaging.cjs` | réussi | 0.29
testClubPlanningPdf | `node scripts/testClubPlanningPdf.mjs` | réussi | 2.4
testClubRecurrence | `node scripts/testClubRecurrence.cjs` | réussi | 0.13
testClubReferents | `node scripts/testClubReferents.cjs` | réussi | 0.24
testClubSessionPacks | `node scripts/testClubSessionPacks.cjs` | réussi | 0.14
testClubSubscriptions | `node scripts/testClubSubscriptions.cjs` | réussi | 0.19
testClubTermination | `node scripts/testClubTermination.cjs` | réussi | 0.44
testCoachMeasurements | `node scripts/testCoachMeasurements.mjs` | réussi | 0.08
testCoachOfferCredits | `node scripts/testCoachOfferCredits.cjs` | réussi | 0.13
testCoachOffers | `node scripts/testCoachOffers.cjs` | réussi | 0.23
testCoachSessionCreation | `node scripts/testCoachSessionCreation.cjs` | réussi | 0.29
testCoachSessionMove | `node scripts/testCoachSessionMove.cjs` | réussi | 0.29
testConfirmedProgramWrites | `node scripts/testConfirmedProgramWrites.mjs` | réussi | 0.19
testCurrentCoachProgram | `node scripts/testCurrentCoachProgram.mjs` | réussi | 0.13
testCycleResultsProgression | `node scripts/testCycleResultsProgression.mjs` | réussi | 0.13
testDashboardNutritionRecords | `node scripts/testDashboardNutritionRecords.mjs` | échec | 0.13
testDashboardTemplates | `node scripts/testDashboardTemplates.cjs` | réussi | 0.29
testDeployContract | `node scripts/testDeployContract.mjs` | réussi | 0.13
testGeoVisitEnrichment | `node scripts/testGeoVisitEnrichment.cjs` | réussi | 0.46
testGeoVisitWindow | `node scripts/testGeoVisitWindow.cjs` | réussi | 0.13
testIndependentFollowups | `node scripts/testIndependentFollowups.cjs` | réussi | 0.3
testMessagingClientRecords | `node scripts/testMessagingClientRecords.cjs` | réussi | 0.13
testMessagingEmailPolicy | `node scripts/testMessagingEmailPolicy.cjs` | réussi | 0.14
testMessagingMultipleProfessionals | `node scripts/testMessagingMultipleProfessionals.cjs` | réussi | 0.15
testMessagingPlanAccess | `node scripts/testMessagingPlanAccess.cjs` | réussi | 0.13
testMessagingUnlinkedContacts | `node scripts/testMessagingUnlinkedContacts.cjs` | réussi | 0.13
testNutritionAssessmentCalendar | `node scripts/testNutritionAssessmentCalendar.mjs` | réussi | 0.13
testNutritionDailyLog | `node scripts/testNutritionDailyLog.mjs` | réussi | 0.47
testNutritionLoading | `node scripts/testNutritionLoading.mjs` | réussi | 0.14
testNutritionMultipleRecords | `node scripts/testNutritionMultipleRecords.mjs` | réussi | 0.13
testNutritionShare | `node scripts/testNutritionShare.mjs` | réussi | 0.14
testOfferDeletion | `node scripts/testOfferDeletion.mjs` | réussi | 0.14
testOfferRenewals | `node scripts/testOfferRenewals.mjs` | réussi | 0.13
testPaidProgramDelivery | `node scripts/testPaidProgramDelivery.cjs` | échec | 0.13
testPaymentReturn | `node scripts/testPaymentReturn.mjs` | réussi | 0.13
testPlayerBuilderSync | `node scripts/testPlayerBuilderSync.mjs` | réussi | 0.13
testPlayerLoadRecovery | `node scripts/testPlayerLoadRecovery.mjs` | réussi | 0.13
testPlayerProgramSync | `node scripts/testPlayerProgramSync.mjs` | réussi | 0.13
testProOfferLifecycle | `node scripts/testProOfferLifecycle.cjs` | réussi | 0.53
testProfessionalWorkspaceAccess | `node scripts/testProfessionalWorkspaceAccess.mjs` | réussi | 0.19
testProgramAssignmentSync | `node scripts/testProgramAssignmentSync.cjs` | réussi | 0.51
testProgramDuplication | `node scripts/testProgramDuplication.mjs` | réussi | 0.14
testProgramSubscription | `node scripts/testProgramSubscription.mjs` | réussi | 0.24
testProgramSyncConcurrency | `node scripts/testProgramSyncConcurrency.cjs` | réussi | 0.33
testSessionFeedbackAtomic | `node scripts/testSessionFeedbackAtomic.mjs` | réussi | 0.13
testSessionResume | `node scripts/testSessionResume.mjs` | réussi | 0.13
testStatisticsSave | `node scripts/testStatisticsSave.mjs` | réussi | 0.13
triple | `node cross7.cjs` | réussi | 13.3
vm-loading | `node --experimental-vm-modules scripts/testGlobalLoading.mjs` | échec | 0.2
workers | `node scripts/testWorkersLot3.cjs` | réussi | 298.2


## Contrôles hors décompte

Build Vite avec budgets réussi. Sur a55018a, S1, les tests semaine client et livraison payante produisent le même échec. Nutrition, publication des modèles et chargement global (avec modules VM) passent. Le premier lancement de testGlobalLoading sans --experimental-vm-modules échoue dans les deux révisions avant les assertions pertinentes. Le contrôle mobile de 100 clients rejoué sur les liens rendus retrouve le dernier client et exclut la carte de la page antérieure. Seule la sonde temporaire a changé.

## Observé dans le code

Les suites mêlent tests de services, exercices avec services simulés et assertions sur le texte JSX. Les parcours Chromium exécutent les composants réels et les API instrumentées du domaine. Les mesures de trois rôles et les deux contre-exemples de sécurité traversent la frontière de confiance SDK/API.

## Hypothèse

La réussite des parcours témoins suggère une parité pour leurs données synthétiques. Une branche métier ou une forme historique absente de ces données pourrait se comporter différemment.

## Non vérifié

Application complète depuis chaque page de connexion, tous les emails et exports rendus, appareil physique, déploiement et trafic réel. Voir le [rapport de sécurité](BYL_LOT7A_SECURITE.md) pour les limites de persistance navigateur.

## Annexe · reproduire les sondes transversales

Dans deux copies isolées nommées work (HEAD) et base (référence) avec dépendances locales, enregistrer les blocs sous les noms indiqués dans work. Utiliser les vraies règles de la révision visée et les deux émulateurs en loopback. Les helpers exigent un projet demo. Ne pas réutiliser de fichier .env de fonctionnement. La référence S1 utilise le contrôleur de base, les règles de base et le même harnais synthétique.

<details><summary>probe7.cjs</summary>

```javascript
const assert=require('node:assert/strict');
const {db,prepareAuth,accounts,projectId}=require('./scripts/measureFirebaseLot1.cjs');
const express=require('./backend/node_modules/express');
const mode=process.argv[2],base=mode==='base';
const fs=require('node:fs'),path=require('node:path');
const tree=base?path.join(__dirname,'../base'):__dirname;
async function main(){
 await prepareAuth();
 const tokens={};for(const [u,c] of Object.entries(accounts)){let r=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...c,returnSecureToken:true})});tokens[u]=(await r.json()).idToken;}
 const app=express();app.use(express.json());app.use('/clubs',require(tree+'/backend/routes/clubs'));
 const srv=app.listen(0,'127.0.0.1');await new Promise(r=>srv.once('listening',r));const host='http://127.0.0.1:'+srv.address().port;
 const read=()=>fetch(host+'/clubs/summary?view=calendar&clubId=foreign',{headers:{authorization:'Bearer '+tokens.owner}});
 try{
  await db.doc('users/coach').set({role:'coach',subscriptionStatus:'active',hasActiveSubscription:true});
  await db.doc('clubs/foreign').set({name:'Synthetic foreign club',ownerUid:'someone-else'});
  await db.doc('clubs/foreign/members/secretMember').set({role:'pro',firstName:'Synthetic target'});
  await db.doc('users/owner').delete();
  const denied=await read();console.log('CONTROL',denied.status);assert.notEqual(denied.status,200);
  const types={role:{stringValue:'particulier'},linkedClientId:{stringValue:'owner'},hasActiveSubscription:{booleanValue:false},isAdmin:{booleanValue:true}};
  const url='http://'+process.env.FIRESTORE_EMULATOR_HOST+'/v1/projects/'+projectId+'/databases/(default)/documents/users/owner';
  const created=await fetch(url,{method:'PATCH',headers:{authorization:'Bearer '+tokens.coach,'content-type':'application/json'},body:JSON.stringify({fields:types})});
  const response=await read();const body=await response.json();const exposed=body.club?.name==='Synthetic foreign club'&&body.coaches.some(c=>c.uid==='secretMember');
  console.log('AUDIT',JSON.stringify({mode,sdkCreate:created.status,foreignApi:response.status,foreignRows:exposed}));assert.equal(exposed,false,'A coach-created patient profile must not confer cross-club admin access');
 }finally{srv.closeAllConnections();await new Promise(r=>srv.close(r));await db.terminate();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
```

</details>

<details><summary>cross7.cjs</summary>

```javascript
const assert=require('node:assert/strict'),{db,prepareAuth,accounts,projectId}=require('./scripts/measureFirebaseLot1.cjs');
const express=require('./backend/node_modules/express');
async function main(){
 await prepareAuth();const sdk=await import('firebase/firestore'),auth=await import('firebase/auth'),apps=await import('firebase/app');const clients={};
 for(const uid of ['owner','coach','administrator']){
  const app=apps.initializeApp({projectId,apiKey:'demo',appId:'synthetic'},uid),login=auth.initializeAuth(app,{persistence:auth.inMemoryPersistence});
  auth.connectAuthEmulator(login,'http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});
  const {user}=await auth.signInWithEmailAndPassword(login,accounts[uid].email,accounts[uid].password);const store=sdk.initializeFirestore(app,{});sdk.connectFirestoreEmulator(store,'127.0.0.1',+process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]);
  clients[uid]={app,store,token:await user.getIdToken()};
 }
 const app=express();app.use(express.json());app.use('/clubs',require('./backend/routes/clubs'));const srv=app.listen(0,'127.0.0.1');await new Promise(r=>srv.once('listening',r));
 const call=async(path,body)=>{const r=await fetch('http://127.0.0.1:'+srv.address().port+'/clubs'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+clients.owner.token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(r.status,200);return r.json();};
 const stops=[],club=db.doc('clubs/synthetic');const prof={role:'coach',clubId:club.id,hasActiveSubscription:true,subscriptionStatus:'active'};
 try{
 await club.set({ownerUid:'owner'});await db.doc('users/owner').set({...prof,clubRole:'owner',accountType:'club_owner'});await db.doc('users/coach').set(prof);await club.collection('members').doc('coach').set({role:'pro',status:'active'});await db.doc('users/administrator').set({role:'particulier',linkedClientId:'person'});
 const coach=clients.coach.store,member=clients.administrator.store;
 await sdk.setDoc(sdk.doc(coach,'clients/person'),{createdBy:'coach',coachId:'coach',clubId:'synthetic',uid:'administrator',authUid:'administrator'});
 await sdk.updateDoc(sdk.doc(coach,'clients/person'),{prenom:'Fixture modified'});
 await sdk.setDoc(sdk.doc(coach,'clients/person/programmes/p'),{createdBy:'coach',nomProgramme:'Synthetic',sessions:[{nom:'Session A'}]});
 assert.equal((await sdk.getDocFromServer(sdk.doc(member,'clients/person/programmes/p'))).data().nomProgramme,'Synthetic');
 const now=Date.now();const path='/calendar-period?from='+(now-3600000)+'&to='+(now+86400000);
 if(process.argv[2]==='legacy-link'){
  await db.doc('sessions/legacy').set({clientId:'unrelated',clientDocId:'unrelated',coachId:'external',createdBy:'external',status:'done',difficultyRating:4});
  await assert.rejects(sdk.getDocFromServer(sdk.doc(clients.owner.store,'sessions/legacy')),e=>e.code==='permission-denied');
  await sdk.setDoc(sdk.doc(clients.owner.store,'clubs/synthetic/appointments/forged'),{clientId:'unrelated',linkedSessionId:'legacy',startsAt:new Date(now),durationMin:40});
  const row=(await call(path)).appointments.find(v=>v.id==='forged');console.log('PROJECTION',JSON.stringify({directDenied:true,rating:row.difficultyRating,status:row.status}));
  assert.notEqual(row.difficultyRating,4,'Foreign session rating disclosed by forged reference');return;
 }
 await call('/appointments',{coachUid:'coach',clientId:'person',type:'sport',startsAt:new Date(now).toISOString(),programId:'p',sessionIndex:0,title:'Fixture booking'});
 const first=await call(path);assert.equal(first.appointments.length,1);const id=first.appointments[0].linkedSessionId;
 const views={};for(const [uid,store] of [['coach',coach],['client',member]])stops.push(sdk.onSnapshot(sdk.doc(store,'sessions/'+id),s=>{views[uid]=s.data()?.status;}));
 for(let i=0;i<100&&(!views.coach||!views.client);i++)await new Promise(r=>setTimeout(r,30));
 assert.ok(views.coach&&views.client);const pending=call(path+'&revision='+encodeURIComponent(first.revision));const t=performance.now();
 await sdk.updateDoc(sdk.doc(coach,'sessions/'+id),{status:'done',difficultyRating:4});
 const next=await pending;for(let i=0;i<100&&(views.coach!=='done'||views.client!=='done');i++)await new Promise(r=>setTimeout(r,30));
 assert.deepEqual(views,{coach:'done',client:'done'});assert.equal(next.appointments[0].status,'validée');assert.equal(next.appointments[0].difficultyRating,4);
 console.log('TRIPLE',JSON.stringify({ms:Math.round(performance.now()-t),devices:3,programVisible:true,clubRating:4}));
 }finally{for(const f of stops)f();srv.closeAllConnections();await new Promise(r=>srv.close(r));await Promise.all(Object.values(clients).map(c=>apps.deleteApp(c.app)));await new Promise(r=>setTimeout(r,4500));await db.terminate();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
```

</details>

<details><summary>stripe7.cjs</summary>

```javascript
const assert=require('node:assert/strict');
const {db}=require('./scripts/measureFirebaseLot1.cjs');
process.env.STRIPE_WEBHOOK_SECRET='whsec_fixture';process.env.STRIPE_SECRET_KEY='sk_test_fixture';
const stripeModule=require.resolve('stripe',{paths:[__dirname+'/backend']});
const Stripe=require(stripeModule),webhooks=new Stripe('sk_test_fixture').webhooks;
let payment='unpaid';
const session=()=>({id:'cs_fixture',status:'complete',mode:'payment',payment_status:payment,amount_total:2500,currency:'eur',metadata:{firebaseUid:'buyer',programmeId:'catalogue',audience:'premium'}});
require.cache[stripeModule].exports=()=>({webhooks,checkout:{sessions:{retrieve:async()=>session()}}});
const {webhookHandler}=require('./backend/routes/payments');
async function receive(type,bad=false){
 const body=JSON.stringify({id:'evt_fixture',type,livemode:false,data:{object:{id:'cs_fixture'}}});
 const sig=webhooks.generateTestHeaderString({payload:body,secret:bad?'wrong':'whsec_fixture'});
 const res={code:200,status(c){this.code=c;return this},send(){return this},json(){return this}};
 await webhookHandler({body:Buffer.from(body),headers:{'stripe-signature':sig}},res);return res.code;
}
(async()=>{
 await db.doc('programmes/catalogue').set({origine:'premium',nomProgramme:'Synthetic plan',sessions:[{name:'Fixture'}]});
 await db.doc('clients/buyer').set({uid:'buyer',linkedUserId:'buyer'});
 await db.doc('users/buyer').set({role:'particulier'});
 const list=db.collection('clients/buyer/programmes');
 assert.equal(await receive('checkout.session.completed',true),400);
 assert.equal(await receive('checkout.session.completed'),200);assert.equal((await list.get()).size,0);
 payment='paid';assert.deepEqual(await Promise.all([receive('checkout.session.completed'),receive('checkout.session.completed')]),[200,200]);
 assert.equal(await receive('checkout.session.async_payment_failed'),200);assert.equal((await list.get()).size,1);
 assert.equal((await db.doc('stripe_events/evt_fixture').get()).get('status'),'processed');
 console.log('PASS signature refused, unpaid deferred, two simultaneous paid webhooks plus late failure, one premium program');await db.terminate();
})().catch(e=>{console.error(e);process.exitCode=1});
```

</details>

<details><summary>admin7.cjs</summary>

```javascript
const {db,prepareAuth}=require('./scripts/measureFirebaseLot1.cjs');
const auth=require('./backend/firebaseAdmin').auth(),assert=require('node:assert/strict');
const {previewAccountDeletion,executeAccountDeletion}=require('./backend/utils/adminAccountDeletion');
(async()=>{await prepareAuth();await db.doc('users/coach').set({linkedClientId:'crm'});await db.doc('clients/crm').set({accountUid:'coach'});await db.doc('clients/crm/programmes/p1').set({legacy:true});await db.doc('users/owner').set({role:'coach'});const args={db,auth,uid:'coach',actorUid:'administrator'};const plan=await previewAccountDeletion(args);await assert.rejects(executeAccountDeletion({...args,confirmation:'obsolete'}));await executeAccountDeletion({...args,confirmation:plan.confirmation});assert.equal((await db.doc('users/coach').get()).exists,false);assert.equal((await db.doc('clients/crm/programmes/p1').get()).exists,false);assert.equal((await db.doc('users/owner').get()).exists,true);assert.equal((await db.doc('messagingRevocations/coach').get()).data().deleted,true);await assert.rejects(auth.getUser('coach'),e=>e.code==='auth/user-not-found');console.log('PASS preview, stale confirmation refused, recursive deletion, tombstone, unrelated account intact');})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.terminate());
```

</details>

<details><summary>fallback7.cjs</summary>

```javascript
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
(async()=>{
 const auth={currentUser:{}},ctx=vm.createContext({setTimeout,clearTimeout});
 const pending=[], op=(...x)=>x;
 const deps={'firebase/firestore':{collection:op,or:op,query:op,where:op,getDocs:async()=>({empty:true}),onSnapshot:(q,_,ok,fail)=>{const row={q,ok,fail,stopped:false};pending.push(row);return ()=>row.stopped=true;}},'../firebaseConfig':{auth,db:{}},'firebase/auth':{onAuthStateChanged:()=>{}},'./calendarBootstrap':{calendarSlices:()=>['period','before','after']}};
 const m=new vm.SourceTextModule(fs.readFileSync('src/utils/clientCalendarFeed.js','utf8'),{context:ctx});
 await m.link(async name=>new vm.SyntheticModule(Object.keys(deps[name]),function(){for(const [k,v] of Object.entries(deps[name]))this.setExport(k,v);},{context:ctx}));await m.evaluate();
 for(const allowed of [true,false]){
 const out=[];const feed=m.namespace.watchClientCalendar({uid:'a'},[],rows=>out.push(rows),'scope'+allowed);
 const slice=pending.at(-1);assert.equal(slice.q,'period');slice.fail({code:'failed-precondition'});
 const fallback=pending.at(-1);assert.ok(slice.stopped);assert.match(JSON.stringify(fallback.q),/clientId/);assert.match(JSON.stringify(fallback.q),/userId/);
 if(allowed)fallback.ok({docs:[{id:'legacy',data:()=>({title:'legacy'})}],metadata:{}});else fallback.fail({code:'permission-denied'});
 await feed.ready;assert.equal(out.at(-1).length,allowed?1:0);feed.stop();
 }console.log('PASS missing-index fallback retains scope and denied fallback returns no rows');
})().catch(e=>{console.error(e);process.exitCode=1});
```

</details>

Pour auth-window, reprendre scripts/testMessagingLot2B2.cjs et, immédiatement après le premier contrôle external/Auth-only before reconciliation, attendre 5 000 ms et répéter la même lecture et la même écriture avec le même jeton avant toute requête API. Chronométrer depuis le début du premier contrôle.

## Sonde Chromium sur cache persistant

Dans la copie temporaire de scripts/fixtures/clientProgressLot5.jsx, importer doc, getDocFromServer et getDocFromCache. Avant le parcours ordinaire, insérer le bloc ci-dessous dans la fonction asynchrone principale. Lancer la commande persistent-content du registre sur un profil vierge. La configuration de la fixture reproduit persistentLocalCache et persistentMultipleTabManager. Le remplacement de page recrée le contexte JavaScript avec le même profil disque.

```javascript
const privateRef=doc(db,'clients/client/programmes/p0');
  if(location.search!=='?cache-restart'){
    await login('coach');
    if(!(await getDocFromServer(privateRef)).exists())throw Error('missing A');
    await signOut(auth);await login('owner');
    location.replace('/?cache-restart');return;
  }
  await auth.authStateReady();if(auth.currentUser?.uid!=='owner')throw Error('identity');
  window.otherAccount=true;await disableNetwork(db);
  let sdkCached=false;try{sdkCached=(await getDocFromCache(privateRef)).data()?.nomProgramme==='Fixture 0';}catch(e){if(e.code!=='unavailable')throw e;}
  show(Dashboard);await wait(1200);
  if(window.pageResult?.n || document.body.textContent.includes('Fixture 0'))throw Error('cross-account display');
  await enableNetwork(db);
  let denied=false;try{await getDocFromServer(privateRef);}catch(e){denied=e.code==='permission-denied';}
  if(!denied || !sdkCached)throw Error('missing control');root.unmount();
  await fetch('/fixture-results',{method:'POST',body:JSON.stringify({sdkCached,serverDenied:denied,renderedPrograms:window.pageResult?.n??null})});return;
```
