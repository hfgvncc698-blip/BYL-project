# Lot 7B.1 BIS — tests et limites

## Exécutés

### Reproduction navigateur avant correction

Commande depuis le dépôt, dans un environnement avec Java 21 et Firebase CLI disponibles.

```sh
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" node scripts/runSecurityLot7B1.cjs cache current
```

Le lanceur archive la source, exclut les `.env`, utilise uniquement Auth/Firestore émulateurs du projet `demo-byl-performance`, et lance Chrome avec profils jetables. Les fixtures sont synthétiques. Code de sortie **1 attendu pour la reproduction de la vulnérabilité**, avec assertion de confidentialité réellement atteinte, pas un timeout.

| Contrôle | Résultat |
|---|---|
| A charge le programme synthétique | Oui |
| B récupère ce programme localement dans le même onglet | Oui, fuite |
| B récupère ce programme localement dans l’onglet voisin | Oui, fuite |
| B récupère ce programme après fermeture et réouverture Chrome | Oui, fuite |
| B récupère le snapshot nutrition après réouverture | Oui, fuite |
| B obtient le programme via lecture serveur | Non, refus |
| B récupère programme/snapshot dans un profil navigateur distinct | Non |

Preuve réduite sans secret dans `audits/lot7b1bis/browser-before.json`. La fixture et le lanceur proviennent du Lot 7B.1. La fixture utilise les utilitaires de cache et initialisation SDK réels, pas toutes les pages de BYL.

### Qualification cryptographique isolée

```sh
node scripts/testEncryptedVaultLot7B1Bis.mjs
```

**21 contrôles passent** sous Node v25.8.1. Preuve `audits/lot7b1bis/prototype-results.txt`.

Sept domaines synthétiques passent chiffrement/déchiffrement. IV différent pour deux écritures identiques. Rejet d’une altération, d’un déplacement entre identifiants d’enregistrement, d’un changement UID/rôle/club/révision et d’un autre secret. Rejet d’un chiffrement, import de clé, déchiffrement ou retour réseau tardif après verrouillage/transition. Nouveau coffre verrouillé, puis reprise avec secret externe. Deux instances avec secrets distincts ne peuvent partager le contenu.

Ces contrôles utilisent WebCrypto sous Node. « Restart model » crée un nouvel objet, « tab model » deux objets indépendants. **Ce ne sont pas des redémarrages ou onglets Chrome après correction.** Aucun test d’une transaction IndexedDB chiffrée, aucun contrôle de clé de récupération utilisateur et aucun parcours Firebase chiffré n’est déclaré passé.

## Matrice demandée

| Scénario | Couverture obtenue | Reste à qualifier |
|---|---|---|
| Deux comptes même onglet / deux onglets | Vulnérabilité réelle reproduite, isolation du prototype testée | Intégration Auth, SDK, React et deux onglets après correction |
| Fermeture/réouverture | Vulnérabilité réelle reproduite, modèle de nouveau coffre | Persistance chiffrée réelle et UI de déverrouillage |
| Déconnexion normale | Fixture de changement de compte et verrou du prototype | Nettoyage de chaque module BYL |
| Déconnexion pendant requête | Ticket tardif et opérations crypto rejetés dans prototype | HTTP, onSnapshot, compression et transactions IDB réelles |
| Connexion hors ligne | Déchiffrement local sans réseau dans prototype | Admission locale, clé, droits et rendu des pages |
| Changement rôle/club, révocation | Ancien périmètre/révision rejeté dans prototype | Signal serveur réel, nouveaux droits, délai de fermeture, appareils hors ligne |
| Programmes/historiques/progression | Payloads synthétiques et cache programme dans Chrome | SessionPlayer, corrections, Timestamp et sérialisation réelle |
| Nutrition | Snapshot hérité réellement récupéré par B, payload chiffré synthétique | Parcours de bilan/menu/journal après intégration |
| Messagerie/Club | Payloads synthétiques et inventaire | Réception, brouillon, accusé, annuaire, révocation intégrés |
| Brouillons | Roundtrip chiffré synthétique | Récupération/import, absence de perte, compte inconnu, conflits |
| Accès disque direct | Lecture ancienne forme démontrée, enveloppe ne contient pas le texte synthétique | Base chiffrée réelle, catalogue, clés, anciens fichiers et sauvegardes |
| Mobile/desktop | Chrome headless avant, Node prototype | Navigation UI, déverrouillage, restauration mobile, bfcache |

Les tests P0-1/P0-2 du Lot 7B.1 ne sont pas relancés ici. Aucun de leurs fichiers applicatifs ou de règles n’est modifié. Les 83 tests Rules et 53 smoke mentionnés dans le lot précédent sont des résultats historiques, pas des exécutions de ce lot.

## Conditions de validation finale

Tous les scénarios après intégration doivent passer sur les émulateurs et les mêmes fixtures, avec un lecteur de disque indépendant et sans clé de A accessible au profil de B. Tester également onglet ancien empêchant purge, transaction bloquée, redémarrage à chaque étape, outbox non vide, mauvais secret, récupération perdue, réponses A après A→B→A et absence de notification contenant une donnée privée. Tant que cette matrice est incomplète, aucune levée de P0-4.
