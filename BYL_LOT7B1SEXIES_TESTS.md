# Lot 7B.1 SEXIES — tests

## Reproduction

```sh
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runMigrationLot7B1Sexies.cjs
```

Le runner crée un checkout temporaire depuis HEAD, ajoute uniquement les trois fichiers du banc, démarre les émulateurs Auth 9198 et Firestore 8180 sur le projet demo, puis copie les résultats uniquement en cas de succès. Java, Firebase CLI, dépendances du dépôt et Chrome macOS sont nécessaires. Aucun fichier `.env` ou profil personnel n’est copié.

Fichiers : `scripts/runMigrationLot7B1Sexies.cjs`, `scripts/testMigrationLot7B1Sexies.cjs`, `scripts/fixtures/lot7b1sexies/migration.js`, `scripts/fixtures/lot7b1sexies/firestore.js`. Ce ne sont pas des modules importés par l’application BYL.

## Couverture et portée

39 contrôles réussis. Les noms et durées exacts figurent dans `audits/lot7b1sexies/results.json`. Le fichier de qualification associe ces résultats aux empreintes des sources.

- Authentification réelle sur émulateur, A/B, compte absent, propriétaire inconnu, confirmation requise avant lecture, réseau coupé, révocation Firestore et désactivation Firebase Auth, changement de Club, réponse tardive après changement de compte.
- Proposition affichée, clic explicite, conflit sur version canonique, révocation au commit, contenu altéré, reçu perdu, retry, vérification du contenu serveur et du drapeau non publié.
- Imports simultanés : un brouillon et un reçu par cible, transaction concurrente reprise sans duplication.
- Deux onglets actuels : reçus partagés, coordination BroadcastChannel et nettoyage du sessionStorage de chaque onglet coopérant.
- Ancien onglet : absence d’ACK, connexion bloquante, fermeture tardive, succès différé de la suppression, sessionStorage restant et recontamination détectée.
- Échec secondaire injecté, reprise, idempotence, interruption et fermeture/réouverture.
- SDK Firestore réel : écriture locale non synchronisée, refus de purge à chaud, survie à la fermeture, suppression après arrêt et absence après redémarrage.
- P0-4 avant nettoyage : lecture brute du programme et de la nutrition sous B après réouverture ; l’API de récupération refuse simultanément le brouillon A et n’affiche pas son contenu.
- P0-4 après nettoyage : A puis B, proposition vidée, récupération A refusée, absence des bases/clé/cache/worker ciblés après nouveau redémarrage ; reçu final refusé tant que les anciens contextes ne sont pas exclus.

## Ce que signifie un contrôle réussi

La lecture brute avant purge, la survie d’une mutation offline et la persistance du sessionStorage d’un ancien onglet sont des constats de risques attendus. Leur test réussi ne signifie pas que ces risques ont disparu. Le lecteur `q.get` est volontairement privilégié et réservé au banc de reproduction ; il ne constitue pas une API applicative autorisée pour B.

Après purge, les vérifications utilisent `indexedDB.databases()`, les clés ciblées, Cache Storage et l’inventaire des Service Workers, puis redémarrent Chrome. Il s’agit de l’absence accessible aux API sur ce profil synthétique, pas d’une analyse forensique du disque. Le SDK demo et la base représentative nutrition sont vérifiés séparément.

## Limites et tests non couverts

Le manifeste de provenance est préinstallé côté serveur par le fixture, pas découvert dans les données historiques réelles. Les droits `pilotUsers` sont ceux du pilote, non une qualification complète de tous les rôles BYL. Les endpoints ne sont pas montés dans l’application. Les jetons émulés ne constituent pas un test des signatures Auth de production.

Les tests ne couvrent pas un importeur des mutations internes Firestore, une migration de toutes les versions historiques de schéma, une panne disque/corruption, un crash OS, toutes les restaurations d’onglets, les extensions, Firefox/Safari/mobile, un ancien Service Worker réel ou le cache HTTP/médias. L’échec secondaire est injecté ; le blocage IndexedDB et le refus SDK `failed-precondition` sont réels.

Le nettoyage global ne peut pas être établi par le navigateur seul. Le harness de ce pilote ferme le profil et vérifie ses contextes avant de permettre un reçu strictement limité au profil jetable. Aucun résultat ne permet de lever P0-4 sur un parc non inspecté.

## Vérification de périmètre

Aucun fichier applicatif/règle modifié par ce lot ; comparaison des 50 empreintes QUATER dans le fichier de qualification. Les tests métier globaux et build de QUATER ne sont pas réputés rejoués. Contrôles syntaxiques des scripts et `git diff --check` exécutés ; pas de test artificiel ajouté aux autres modules.
