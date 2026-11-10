# Lot 7A — sécurité et révocation

Campagne du 10 novembre 2026. Branche `codex/firebase-performance-audit`, version applicative `e476b0a4cfcd6bb9e27515c69a5416325e480f6e`. Campagne locale sur fixtures synthétiques.

## Confirmé par test

**Décision de sécurité.** La lecture inter-clubs, la projection de difficulté hors club, la mutation directe avec un ancien jeton et la lecture locale par un second compte ont été reproduites. Les procédures détaillées et les préconditions figurent dans le [rapport des anomalies](BYL_LOT7A_ANOMALIES.md).

Frontière | Opération vérifiée | Résultat et portée
--- | --- | ---
Rules Firestore | 82 scénarios via test:security-rules, plus sondes SDK/REST contradictoires | Suite courante verte. La création déléguée d’un profil contenant isAdmin est autorisée (S1). Le responsable peut écrire la référence forgée dans son propre rendez-vous (S2).
API avec Admin SDK | Résumé Club et projections de période | Deux divulgations démontrées. Le refus SDK direct de la séance étrangère ne protège pas la projection du serveur.
Désactivation BYL | Deux connexions Firebase indépendantes, lecture/écriture directe, API read/send et attente HTTP | Le marqueur préalable bloque les jetons observés. Attente et mutation du banc traitées en 73 ms. L’utilisateur ne peut ni modifier ni supprimer le marqueur.
Désactivation Auth externe | Même jeton avant et après désactivation, sans passage préalable par BYL | Lecture et écriture directes encore acceptées immédiatement puis lors du contrôle à +5,105 s. Cette durée est une borne inférieure observée.
Réconciliation et réactivation | Deux refus API, relecture SDK, réactivation Auth seule, libération BYL et nouvelle connexion | Réparation en 34 ms pour les deux appels du premier essai. Ancien jeton refusé après réparation et après réactivation. Nouvelle connexion autorisée suivant la procédure.
Périmètre utilisateur | Transfert de propriétaire, dossier réattribué, changement de rôle/club, révocation en cours de lecture | devices, coach-api, calendar et intersection. Le fil ouvert est retiré en 132 ms après commit sur le test à deux API.
Suppression administrative | Prévisualisation, confirmation obsolète, suppression réelle sur émulateurs, témoin tiers | admin-delete confirme la suppression du compte Auth et du sous-document de programme, le maintien du témoin et la conservation du marqueur deleted. Le test unitaire couvre aussi les pannes partielles.
Cache disque brut | Deux essais Chromium, compte B après rechargement, programme privé du compte A | getDocFromCache restitue le nom exact à B sur le profil partagé. getDocFromServer est refusé. Le Dashboard B affiche zéro programme. S4.
Cache navigateur | Persistance Firestore multi-onglet, déconnexion, second utilisateur, réponse HTTP tardive et reconnexion | Les composants observés ne réaffichent pas les données du premier utilisateur dans les scénarios de changement. Le Dashboard client se vide à la révocation. Aucune preuve d’effacement physique global du profil Chromium.
Réservation et paiement | Dernière place concurrente/FIFO, crédits versionnés, livraison concurrente et redémarrage après bail | calendar, offer, paid-firestore et stripe. Une seule livraison payante, refus d’une signature invalide et absence de programme payé pour une session impayée.


## Observé dans le code

Le contrôle Firebase Auth des API et les règles Firestore suivent des chemins différents. Le marqueur protégé messagingRevocations/{uid} porte une interdiction ou une borne de révocation de jeton. La procédure scripts/messagingRevocation.cjs exige projet et UID, et requiert les deux émulateurs ensemble quand ils sont activés. Pour une opération planifiée, suivre disable ou prepare-delete avant la modification Auth. Pour une intervention externe déjà faite, inspect, puis reconcile sur le compte concerné et contrôle avec ancien jeton. La réactivation passe par reactivate et une nouvelle connexion. Cette procédure concerne la messagerie protégée.

## Hypothèse

Une autorisation accordée par d’autres routes qui réutilisent le champ de profil pourrait étendre S1. Une liaison acceptée dans un format ancien pourrait exposer d’autres projections de séance. Étendre les contre-tests avant toute correction.

## Non vérifié

Droits de console et IAM réellement accordés, détection de toutes les désactivations externes sans appel BYL, accès direct de chaque collection hors messagerie après désactivation, effacement du cache disque après arrêt complet du navigateur, et exhaustivité des contrôles des API administratives. Les identités de test indépendantes ne remplacent pas deux téléphones physiques.
