# Lot 7B.1 — coûts et performances

10 novembre 2026. Branche `codex/firebase-performance-audit`. Référence applicative `e476b0a4cfcd6bb9e27515c69a5416325e480f6e`, départ du travail `27a9515`. Tests locaux sur données synthétiques et émulateurs uniquement.

## Mesure comparative

Fixture Club de 12 dossiers, desktop 1 440 px, périodes et mutations identiques. Le banc compare e476b0a et les corrections de ce sous-lot. Les compteurs API sont séparés des événements d’écoute serveur. Les fonctions Cloud ne sont pas déployées. Les lectures internes aux règles, les entrées d’index et les factures ne sont pas mesurées. Les durées correspondent à un passage, sans percentile.

Phase | Version | HTTP | SDK serveur | Docs retournés | Lectures estimées | Écritures synthèses | Temps ms | Tas navigateur Mio | Tas serveur Mio
--- | --- | --- | --- | --- | --- | --- | --- | --- | ---
calendar | avant | 3 | 24 | 13 | 25 | 0 | 582 | 72 | 90
calendar | après | 3 | 32 | 23 | 35 | 0 | 340 | 72 | 168
warm | avant | 5 | 19 | 12 | 20 | 0 | 164 | 77 | 94
warm | après | 5 | 27 | 22 | 30 | 0 | 126 | 77 | 173
week | avant | 2 | 8 | 3 | 8 | 0 | 91 | 83 | 96
week | après | 2 | 11 | 6 | 11 | 0 | 86 | 83 | 101
month | avant | 3 | 14 | 7 | 14 | 0 | 90 | 82 | 98
month | après | 3 | 20 | 15 | 22 | 0 | 82 | 83 | 105
focus | avant | 1 | 6 | 3 | 6 | 0 | 10 | 88 | 99
focus | après | 1 | 8 | 5 | 8 | 0 | 8 | 88 | 106
twoTabs | avant | 3 | 17 | 11 | 18 | 0 | 359 | 82 | 114
twoTabs | après | 3 | 24 | 20 | 27 | 0 | 265 | 98 | 122
idleTwoTabs | avant | 6 | 8 | 4 | 8 | 0 | 25002 | 103 | 88
idleTwoTabs | après | 6 | 12 | 8 | 12 | 0 | 25002 | 77 | 88
remote | avant | 4 | 20 | 12 | 22 | 1 | 160 | 95 | 88
remote | après | 4 | 28 | 20 | 30 | 1 | 108 | 98 | 89
validate | avant | 4 | 15 | 8 | 15 | 1 | 131 | 90 | 89
validate | après | 3 | 16 | 10 | 16 | 1 | 60 | 90 | 91
cancel | avant | 4 | 20 | 13 | 23 | 2 | 185 | 100 | 90
cancel | après | 2 | 14 | 12 | 17 | 2 | 126 | 98 | 92
home | avant | 8 | 60 | 41 | 71 | 0 | 345 | 99 | 92
home | après | 8 | 71 | 56 | 86 | 0 | 236 | 107 | 89


## Interprétation

Le contrôle de propriété coûte une lecture de club à l’admission et au contrôle de livraison. Le calendrier ajoute un abonnement au dossier de chaque liaison distincte et une relecture des références enrichies avant livraison. Les mêmes dossiers sont dédupliqués au sein de la projection. Une attente inchangée n’effectue pas cette relecture de toutes les séances.

L’enrichissement historique peut effectuer deux lectures ciblées supplémentaires lorsque son annuaire ne contient pas la séance ou le dossier. Les mutations ajoutent des lectures de contrôle dans la transaction. Une concurrence peut entraîner une nouvelle tentative.

La commande prepare-disable écrit un seul marqueur. La procédure disable existante marque déjà avant Auth. Exécuter séparément prepare-disable puis disable peut donc écrire deux fois ce marqueur. L’écriture préalable est utile pour une intervention console. Elle ne crée aucun abonnement permanent.

Aucune collection de projection, aucun index et aucune écriture de maintenance applicative ajoutés par ce sous-lot. La colonne écritures synthèses mesure les événements déjà produits par le harnais, et peut varier entre fenêtres lorsque des requêtes se terminent après une mutation. Les lectures de Rules en plus des lectures des documents demandés restent à mesurer en préproduction.

Les gains historiques sont conservés dans leur mécanisme. Les requêtes de période et la mutualisation restent actives. Le surcoût chiffré est celui de la vérification de sécurité. Le test de 12 dossiers ne qualifie pas le coût d’un calendrier comportant des centaines de liaisons visibles.

## Cache et coûts non décidés

Le code applicatif des caches conserve son comportement actuel car P0-4 reste bloquant. Le prototype mémoire n’est pas livré. Un mode éphémère peut augmenter les lectures après rechargement et entre onglets. Un chiffrement pourrait conserver les retours rapides mais ajouter calcul et maintenance des clés. Aucun gain chiffré n’est attribué à ces options.

Les workers, offres et grandes inbox n’ont pas fait l’objet d’une correction dans ce sous-lot. Leurs gains antérieurs ne sont pas ajoutés au comparatif. Aucun montant monétaire n’est extrapolé.
