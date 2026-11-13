# BYL — Lot 8A : premiers chargements

Branche : `codex/firebase-performance-audit`. Aucun déploiement, aucune donnée réelle, aucune modification des règles. **P0-3 et P0-4 restent ouverts ; la production reste bloquée.**

## Résultat intégré

Trois causes démontrées ont reçu des corrections ciblées :

1. **Clients** : enrichissement des lignes visibles, au lieu des indicateurs de tout le répertoire. Recherche sur toutes les racines autorisées, filtres métier exhaustifs et contrôles serveur préservés. Le cache signale son caractère partiel.
2. **Messages** : rendu initial de 50 conversations, affichage supplémentaire explicite et recherche sur la source complète. Les rafales de plus de trois notifications sont regroupées. La référence à 1 000 non lus créait 1 000 toasts ; le callback corrigé en crée un, sans modifier les messages, badges ou accusés.
3. **Shell** : les navigations mobiles ne sont plus montées inutilement sur desktop ; le changement de largeur est réactif.

Les modifications concernent cinq fichiers applicatifs et un utilitaire, plus sept catalogues de traduction. La liste exacte et les causes sont dans `BYL_LOT8A_CAUSES.md`. Les fichiers d’audit, sondes et runners restent locaux. Les correctifs déjà présents des Lots 7 ne sont pas attribués à ce lot.

## Mesures et interprétation

La matrice comprend 16 scénarios avant/après : 11 pages/volumes, trois calendriers, deux inbox. Les tableaux détaillés, ressources, coûts documentaires, statuts d’erreur et limites se trouvent dans `BYL_LOT8A_AVANT_APRES.md`. Les fichiers JSON et journaux sont sous `audits/lot8a/`.

Le premier contenu utile est distinct de la disponibilité principale et de la stabilisation du réseau. **La fin complète de toutes les données secondaires n’est pas certifiée** : les routes secondaires absentes du banc renvoient 404, et les flux peuvent rester ouverts. Le banc utilise Vite en développement et les émulateurs ; les temps ne sont ni des percentiles de production ni une facture Firebase.

Résultats du dernier rejeu :

| Scénario | Avant | Après |
|---|---:|---:|
| Clients 100 — données principales | 2,16 s | 1,02 s |
| Clients 500 — données principales | 7,88 s | 1,36 s |
| Clients 500 — lectures estimées des routes instrumentées | 3 562 | 218 |
| Clients 500 — écritures backend de résumés à froid | 500 | 30 |
| Messages 1 000 — premier contenu / données principales | 1,51 s | 0,68 s |
| Messages 1 000 — stabilisation observée | non atteinte dans 30 s | 3,24 s |
| Coach 500 — données principales | 7,26 s | 7,12 s |

Les 504 lectures navigateur estimées de Clients 500 restent inchangées : le répertoire est toujours chargé. Les 30 écritures du dernier rejeu (31 dans un précédent) correspondent à plusieurs états successifs des premières lignes visibles. La page suivante crée 20 résumés supplémentaires ; le retour chaud en crée zéro. Les petites variations des pages sans correction ciblée, positives ou négatives, ne sont pas présentées comme des gains établis.

La réduction d’écritures de résumés Clients concerne leur création à froid sur les dossiers effectivement consultés. Parcourir ensuite toutes les pages peut retrouver le coût initial exhaustif. Les filtres métier globaux restent plus coûteux. Les gains de rendu Messages ne réduisent pas les lectures de l’inbox autorisée complète.

## Fonctionnalités et protections

Aucun contrôle d’identité, de rôle, de Club, de révocation ou de paiement supprimé. Les lectures privées restent après admission ; caches mémoire et protection contre les réponses tardives conservés. Aucun nouveau stockage, résumé persistant, index ou migration. Les règles sont inchangées. ProgramBuilder conserve sauvegarde serveur, conflits et confirmations. Les formats historiques et les filtres métier restent couverts par les suites de régression.

Les tests de sécurité intégrés passent 48 contrôles ; le smoke passe 53 contrôles. Les contre-tests P0-1 et P0-2, Coach, calendriers, messagerie, paiements simulés, nutrition et écritures confirmées passent. Le build respecte les budgets. Les détails de progression, reprises du banc et résultats définitifs sont consignés dans TESTS.

## Problèmes ouverts et décision

Le Dashboard Coach à 500 clients et le Dashboard Client avec de nombreux programmes dépassent encore la cible de données principales sous 2 secondes. Leur calcul exact et leurs données globales ne sont pas remplacés par des valeurs approximatives. Les racines Clients et l’inbox restent exhaustives. Les temps à chaud ne disposent pas ici d’une nouvelle matrice complète de percentiles : le retour Clients est vérifié sans nouvelles écritures et les suites de cache restent exécutées.

Les P0 ouverts, les copies historiques persistantes et les limites de révocation externe ne sont pas résolus. Aucun résultat de ce lot n’autorise la production. Avant publication : validation du lot, qualification des P0, benchmark répété du build distribué et couverture complète des routes secondaires sur appareils/réseaux cibles.

## Livrables

- `BYL_LOT8A_CAUSES.md` : preuves et changements.
- `BYL_LOT8A_AVANT_APRES.md` : matrice chiffrée.
- `BYL_LOT8A_FIREBASE.md` : périmètre des compteurs et limites économiques.
- `BYL_LOT8A_TESTS.md` : reproduction, succès, échecs et limites.
- `BYL_LOT8A_RISQUES.md` : compromis et conditions de publication.

**Arrêt à la fin du Lot 8A, en attente de validation. Aucun autre lot commencé.**
