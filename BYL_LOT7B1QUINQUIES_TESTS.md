# Lot 7B.1 QUINQUIES — qualification synthétique

## Exécution et isolation

Commande exécutée :

```sh
node scripts/testMigrationLot7B1Quinquies.cjs
```

**30 contrôles réussis**, Chrome Headless 157.0.8103.50, Node 25.8.1, SDK Firebase 12.12.0, le 10 novembre 2026. Résultats individuels : `audits/lot7b1quinquies/results.json` ; empreintes et contrôle de périmètre : `qualification.json`.

Le runner crée un nouveau répertoire temporaire `byl-quinquies-synthetic-*`, lance Chrome avec son propre `--user-data-dir`, puis le ferme et supprime ce seul répertoire de test. Serveur HTTP éphémère lié à 127.0.0.1. Aucun accès au profil Chrome habituel, aucun fichier `.env`, aucune donnée réelle, aucun import du backend de production. Le fixture SDK utilise `demo-byl-quinquies`, désactive le réseau avant toute opération documentaire et bloque les URL Google/Firebase via CDP. Pas d’écriture dans Firebase réel.

Les données représentatives couvrent programmes, brouillons, nutrition, historiques, messages et Club dans une base synthétique. **Cette base n’imite pas le schéma interne Firestore.** Cinq contrôles supplémentaires utilisent le vrai SDK persistant : écriture offline, refus de purge sur instance active, survie après terminaison/fermeture, purge de cette mutation synthétique, absence de la base après réouverture.

## Matrice exécutée

| Contrôle | Résultat / ce qui est établi |
|---|---|
| Données non résolues | Suppression refusée, base conservée |
| Compte absent | Récupération refusée avant lecture d’une entrée privée |
| A puis B | B ne lit pas le brouillon A ; compteur de lectures privées reste à zéro |
| Propriétaire inconnu | Refus avant lecture |
| Absence de confirmation explicite | Aucune lecture/import |
| Coupure réseau | Vérification impossible, aucune lecture privée ni import |
| Révocation avant récupération | Refus avant lecture |
| Changement de Club | Refus avant lecture |
| Réponse tardive après changement de compte | Rejet de l’admission, aucune lecture du contenu |
| Version modifiée au commit | Import refusé, canonique inchangé |
| Révocation au commit | Import refusé |
| Contenu ne correspondant plus à la provenance | Refus d’import |
| Accusé serveur perdu | Original local conservé |
| Reprise d’un brouillon déjà récupéré | Reçu vérifié sans duplication ; aucune publication |
| Second compte autorisé | B récupère seulement son propre brouillon |
| Deux onglets | Même reçu, pas de doublon d’import |
| Ancienne connexion IndexedDB ouverte | `blocked`, pas de succès déclaré |
| Fermeture de la connexion bloquante | La requête de suppression toujours vivante finit ensuite |
| Échec secondaire injecté | État interrompu, contenu local restant observé |
| Reprise | IDB représentatif, localStorage/sessionStorage courant, Cache Storage et SW synthétiques traités ; préférence langue conservée |
| Répétition idempotente | Même état vérifié, préférence inchangée |
| sessionStorage de l’autre onglet | Reste présent : limite constatée, pas succès global de confidentialité |
| Ancien onglet recréant la base | Recontamination détectée, état bloquant |
| Fermeture/réouverture après nettoyage | Absence API-visible des stores synthétiques ciblés |
| Réouverture pendant interruption | Journal et contenu secondaire restant retrouvés, reprise confirmée |
| SDK réel : écriture offline | Document cache présent avec `hasPendingWrites=true` |
| SDK réel : instance active | `clearIndexedDbPersistence` refusé avec `failed-precondition` |
| SDK réel : terminaison puis fermeture/réouverture | Même mutation non acquittée encore présente |
| SDK réel : effacement après terminaison | Base synthétique et mutation supprimées |
| SDK réel : nouvelle réouverture | Base du projet demo absente |

Deux brouillons synthétiques ont été écrits côté serveur de test, malgré les reprises et deux onglets. Le canonique synthétique reste inchangé. La confirmation de lecture des reçus et l’absence de duplication sont testées séparément de l’absence de copies navigateur après nettoyage.

## Portée exacte des preuves

L’autorité du banc est **simulée**, par un registre de propriétaires/droits/versions en mémoire serveur et un manifeste d’empreintes préparé pour les fixtures. Elle n’est pas une nouvelle API BYL et ne teste pas à nouveau la cryptographie des jetons Firebase. Les droits/révocations contrôlés ici sont des transitions du registre ; les contrôles Firebase réels de QUATER ne sont pas remplacés ni réputés rejoués.

La récupération positive ne s’applique pas aux anciens brouillons sans preuve de provenance. Les tests négatifs démontrent le refus avant lecture, mais ne rendent pas confidentiel un IndexedDB déjà accessible à du code arbitraire de même origine. La récupération des mutations internes Firestore n’est pas implémentée : seul leur maintien puis leur perte lors d’une purge sont réellement observés.

L’échec de suppression est couvert par `blocked` réel et `failed-precondition` SDK réel. L’échec secondaire est injecté ; panne disque, quota, corruption IndexedDB, crash OS pendant écriture et toutes les versions historiques du schéma ne sont pas qualifiés. L’interruption testée ferme Chrome normalement ; ce n’est pas une coupure électrique.

Le résultat « vérifié » du prototype est local au périmètre de test. Les tests de sessionStorage restant et de recréation par ancien onglet démontrent précisément pourquoi il ne peut pas constituer une autorisation de migration réelle. L’absence via API après réouverture ne démontre pas l’effacement forensique des fichiers du profil, caches HTTP, exports ou sauvegardes OS.

## Incidents pendant la mise au point

Le premier passage du SDK réel a exposé que la précondition d’effacement peut lever une erreur synchrone. Le test a été corrigé pour capturer les deux formes d’échec, sans modifier le SDK ni l’application. Le passage final complet réussit. Aucune assertion d’isolation ou de conservation n’a été relâchée.

Aucun build applicatif ni test métier global supplémentaire nécessaire ici : seuls un banc isolé et la documentation sont ajoutés. Le contrôle de périmètre vérifie que les fichiers de production et les modifications QUATER préexistantes n’ont pas changé pendant ce lot.
