# Lot 7B.1 — sécurité et garanties

10 novembre 2026. Branche `codex/firebase-performance-audit`. Référence applicative `e476b0a4cfcd6bb9e27515c69a5416325e480f6e`, départ du travail `27a9515`. Tests locaux sur données synthétiques et émulateurs uniquement.

## P0-1 · source de confiance

**Reproduit avant correction — oui. Corrigé dans le code — oui. Contre-test — réussi. Statut — corrigé.**

Sur la référence, le coach crée users/<UID tiers> avec isAdmin=true et le second compte obtient le résumé d’un club étranger. Après correction, la création reçoit 403. Un profil déjà forgé avec isAdmin/admin reçoit 403 sur l’API. Les changements de club, le remplacement du propriétaire, la désactivation et le retrait de membre sont contrôlés. Un administrateur ayant role=admin ou une claim admin signée conserve son accès.

La branche déléguée Rules autorise uniquement rôle particulier, lien prévu, absence d’abonnement actif et champs de contact énumérés. Les identifiants retournés par les lectures backend proviennent du chemin Firestore. L’identité du propriétaire utilisée pour le résumé provient du club. Le profil seul ne crée plus un droit de propriété. Les données de membership sont contrôlées pour les droits SDK partagés.

**Coût.** Lecture ponctuelle du club à l’admission et au contrôle final. Les règles peuvent consulter le club ou la fiche de membre, sans nouvelle écriture métier. Les lectures internes aux règles ne sont pas chiffrées par l’émulateur.

**Compatibilité.** Le profil de client minimal, l’administrateur légitime, les clubs avec ownerUid et les anciens clubs identifiés par l’UID de leur propriétaire passent. Les anciens administrateurs dont la seule preuve serait isAdmin et les clubs sans preuve de propriétaire restent à qualifier. Aucun reclassement automatique.

## P0-2 · projections, détail et mutations

**Reproduit avant correction — oui. Corrigé dans le code — oui. Contre-test — réussi. Statut — corrigé.**

Les refus couvrent une séance indépendante sans clubId, un club étranger avec le même identifiant de rendez-vous, un dossier réattribué, des identifiants client divergents, une visibilité privée et le retrait de l’accès du dossier. Le scénario légitime coach/client/responsable continue à partager la séance.

Le prédicat commun exige le club de la séance, son identifiant de rendez-vous, le dossier de l’événement et l’appartenance actuelle du dossier. Les anciens clientId qui représentent un UID Auth sont admis seulement s’ils correspondent à une identité du dossier canonique. Le format historique client.club.id est pris en charge. Les séances sans preuve de club restent exclues de l’enrichissement.

Le calendrier écoute les dossiers associés aux seules séances liées de la période. Avant de transmettre une ligne enrichie provenant d’un écouteur, le serveur relit les documents concernés, y compris le rendez-vous, pour éviter une autorisation fondée sur un cache qui précède un transfert déjà commité. Les réponses d’attente inchangée ne transmettent aucune nouvelle ligne privée.

Le résumé historique et le détail utilisent aussi le contrôle. Les lecteurs historiques absents de l’annuaire sont vérifiés par lecture ciblée. Le statut et la difficulté des séances étrangères ne sont plus fusionnés. Les PATCH/DELETE relisent l’état et les droits dans la transaction avant de toucher la séance et le calendrier client. Les règles interdisent la création directe d’une liaison Club et le remplacement de sa portée par un SDK client.

**Coût.** Une écoute de dossier par dossier lié distinct, puis lectures ciblées lors de l’envoi de lignes enrichies. Aucun index nouveau ni écriture technique supplémentaire. Voir la comparaison mesurée.

**Limite.** Les données d’un ancien lien ambigu sont conservées. Leur enrichissement nécessite une réassociation vérifiable par le serveur. Aucun backfill destructif.

## P0-3 · confinement Auth

**Reproduit avant correction — oui. Corrigé dans le code — partiellement. Contre-test du confinement — réussi. Contre-test Auth seule — non. Statut — partiellement corrigé.**

Le test initial retrouve un accès direct après 5,062 secondes. Cette observation donne une borne inférieure de la fenêtre locale. L’émulateur ne prouve pas la durée d’expiration des jetons en production.

**Garantie technique.** Dans les collections de messagerie dont les règles vérifient messagingRevocations/{uid}, un marqueur bloqué préalablement commité empêche les nouvelles lectures et écritures testées avec l’ancien jeton. Les utilisateurs ne peuvent pas modifier ni supprimer ce marqueur. Les API utilisant la vérification de révocation refusent aussi les jetons testés. Réactivation et nouvelle connexion sont vérifiées.

**Mesure opérationnelle à imposer pour ce périmètre.**

1. Utiliser le chemin BYL de désactivation ou la commande disable, qui marque avant de modifier Auth.
2. Si une action console ou externe est nécessaire, exécuter prepare-disable sur le projet et l’UID vérifiés, attendre son succès, puis inspect et vérifier blocked=true.
3. Effectuer ensuite la désactivation Auth. Conserver le marqueur. Une panne intermédiaire laisse le compte bloqué dans la messagerie.
4. Pour une suppression, utiliser prepare-delete avant Auth. Pour une réactivation, employer reactivate et une nouvelle connexion. Ne pas effacer manuellement le marqueur.
5. Si Auth a déjà été modifié seul, appliquer reconcile à l’UID concerné et vérifier le refus avec l’ancien jeton. L’accès antérieur à cette réparation reste possible.

Exemples réservés au projet synthétique avec les deux émulateurs locaux déjà configurés.

```sh
node scripts/messagingRevocation.cjs demo-byl-performance member0 prepare-disable
node scripts/messagingRevocation.cjs demo-byl-performance member0 inspect
```

**Limite non résolue.** Une opération Auth externe qui contourne ce préalable ne met pas atomiquement à jour Firestore. Aucune garantie instantanée SDK pour cette opération. La portée du marqueur demeure celle des règles et des API qui le consultent, notamment la messagerie. Ce sous-lot ne garantit pas la révocation globale de toutes les collections.

Les jetons Firebase sont autonomes et la détection de révocation nécessite un contrôle serveur ou des métadonnées de révocation vérifiées par les règles. [Gestion des sessions Firebase](https://firebase.google.com/docs/auth/admin/manage-sessions)

La documentation des événements Auth consultée décrit les créations et suppressions. Elle n’établit aucun mécanisme synchrone permettant de bloquer les lectures Firestore avant une désactivation console. Une réconciliation par événement, journal ou balayage doit être qualifiée avec son retard et ses permissions. [Événements Authentication](https://firebase.google.com/docs/functions/auth-events)

## P0-4 · données locales

**Reproduit avant correction — oui. Corrigé dans le code — non. Contre-test — échoué. Statut — bloquant.**

Le nouveau test utilise l’initialisation Firebase réelle, avec seule substitution du projet par le projet demo. Trois processus Chromium sont ouverts successivement. Le premier met en cache le programme, se déconnecte, connecte le second compte et ouvre un deuxième onglet. Le deuxième redémarre avec le même profil disque. Le troisième utilise un autre profil disque. Les contrôles hors ligne utilisent getDocFromCache. Le serveur refuse les lectures du second compte.

La configuration Firestore persistante conserve le contenu dans le profil partagé. Le prototype memoryLocalCache ne protège pas l’instance déjà chargée après changement de compte. Le cache indépendant byl-dashboard-snapshots reste également lisible. Cette base comporte notamment des programmes, listes de clients et données nutritionnelles. Les clés de compte évitent des collisions applicatives mais ne constituent pas un contrôle d’accès au stockage d’une même origine.

La documentation Firebase précise que la persistance web survit aux sessions et recommande de la réserver à un appareil de confiance pour les données sensibles. [Persistance hors ligne](https://firebase.google.com/docs/firestore/manage-data/enable-offline)

L’arrêt du point est motivé par la conservation des écritures et des travaux hors ligne. Une suppression générale avant synchronisation peut perdre ces données. Les options et leurs conséquences sont présentées dans le rapport des risques résiduels.
