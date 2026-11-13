# Lot 7B.1 SEXIES — bilan du pilote

10 novembre 2026 — branche `codex/firebase-performance-audit`.

## Résultat

Pilote isolé construit et exécuté : **39 contrôles réussis**. Récupération conditionnelle avec Firebase Auth émulé, droits/provenance/version relus dans Firestore émulé, confirmation explicite, brouillon non publié et reçu atomique idempotent. Deux imports simultanés créent un seul résultat par cible. Le contenu récupéré est relu et vérifié.

Les suppressions sont limitées aux données créées dans des profils Chrome jetables. Aucun appareil utilisateur, donnée réelle, cache réel ou règle de production touché. Aucun déploiement, aucune intégration dans BYL, aucun P1/P2/P3.

**P0-4 reste ouvert pour le parc réel ; production bloquée.** La fuite des anciennes données est reproduite en accès brut avant purge. Après nettoyage et redémarrage du profil contrôlé, les bases ciblées sont absentes. Cela ne prouve ni la récupérabilité générale des anciens brouillons, ni un effacement forensique, ni l’arrêt de toutes les anciennes versions sur des appareils non contrôlés.

## Évolution depuis QUINQUIES

Les six rapports QUINQUIES ont été lus intégralement. Le pilote conserve leurs refus par défaut et remplace le registre d’autorité en mémoire par des documents Firestore et une vérification de jeton Firebase sur émulateurs. Les reçus de brouillons sont persistants et transactionnels, distincts du programme canonique. La provenance reste préparée par le serveur de fixtures : elle n’existe pas rétroactivement dans les anciens formats réels.

Une interface minimale présente la proposition et exige le clic de confirmation. BroadcastChannel coordonne les onglets actuels, mais les anciens peuvent ignorer le protocole. Le résultat local reste donc `local-checked-global-unproven`. Le reçu final est refusé tant qu’un harness externe n’a pas fermé Chrome, redémarré le profil, vérifié les stockages ciblés et exclu les anciens contextes dans ce profil jetable.

## Fichiers ajoutés

- `scripts/runMigrationLot7B1Sexies.cjs` : copie temporaire isolée et lancement des émulateurs.
- `scripts/testMigrationLot7B1Sexies.cjs` : serveur du pilote, contrôles Auth/transactions et matrice Chrome.
- `scripts/fixtures/lot7b1sexies/migration.js` : proposition/récupération, coordination, nettoyage synthétique et journal.
- `scripts/fixtures/lot7b1sexies/firestore.js` : SDK réel offline pour qualifier les mutations persistantes.
- `audits/lot7b1sexies/results.json`, `qualification.json` : résultats, mesures et empreintes.
- Les six rapports SEXIES.

Aucun fichier applicatif ou règle modifié par ce lot. Les 50 empreintes référencées dans QUATER restent identiques. Les corrections P0-1/P0-2 sont préservées ; leur qualification complète de production n’est pas remplacée par ce pilote.

## Résultats décisifs

| Cas | Observation |
|---|---|
| Compte B demandant A, provenance inconnue, réseau absent | Refus avant lecture du brouillon |
| Révocation Auth/Firestore, changement Club, conflit de version | Refus d’admission ou de commit |
| Confirmation perdue et import simultané | Reçu réutilisé, original conservé, pas de double création |
| Deux onglets actuels | Accusés et nettoyage de leur propre sessionStorage |
| Ancien onglet ouvert / fermeture tardive | Suppression bloquée puis réussite différée ; jamais d’annonce globale prématurée |
| Ancien onglet recréant IndexedDB | Recontamination détectée, fin globale refusée |
| Nettoyage interrompu | Reprise après réouverture et contrôle de l’état réel |
| Programme/nutrition hérités avant purge | P0-4 brut reproduit après fermeture/réouverture |
| Mutations SDK non synchronisées | Survivent à fermeture ; disparaissent après purge de test, donc risque de perte confirmé |
| Après purge + redémarrage A/B | Stockages ciblés absents ; reçu limité au profil contrôlé |

## Mesures et limites

Sur le passage final : 34 appels HTTP instrumentés hors login, 111 opérations SDK documentaires, 102 documents retournés, 5 écritures documentaires des endpoints. Facturation réelle non mesurée. Ces totaux excluent préparation des fixtures, injections d’erreur et sondes du runner ; ils ne constituent pas le coût d’une migration réelle complète.

Limites majeures : absence de provenance pour de nombreux anciens brouillons, absence de décodeur sûr des mutations Firestore, nécessité d’un contrôle externe des anciens contextes, absence de qualification du parc réel et des copies hors APIs navigateur. Les compteurs, temps, mémoire et portée exacte sont détaillés dans PERFORMANCES et TESTS.

## Livrables et arrêt

- [Sécurité](BYL_LOT7B1SEXIES_SECURITE.md)
- [Tests](BYL_LOT7B1SEXIES_TESTS.md)
- [Migration et reprise](BYL_LOT7B1SEXIES_MIGRATION.md)
- [Performances](BYL_LOT7B1SEXIES_PERFORMANCES.md)
- [Décision proposée](BYL_LOT7B1SEXIES_DECISION.md)

Arrêt après ce pilote. Attendre validation explicite avant toute intégration ou migration réelle ; aucune purge utilisateur n’est autorisée implicitement par ces résultats.
