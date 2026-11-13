# Lot 8B — risques et conditions

**P0-3 et P0-4 restent ouverts. Aucun déploiement autorisé.** Aucun cache utilisateur supprimé, aucun compte réel, aucune règle modifiée. Les protections des Lots 7 restent nécessaires et ne sont pas remplacées par les mesures de performance.

- Les lots de 32 réduisent les aller-retours mais augmentent le travail simultané par transaction. Les grands historiques peuvent atteindre la limite 4 Mio plus tôt et provoquer le repli SDK existant, avec relectures. Pas de promesse d’économie universelle.
- Le nouveau frontend requiert le backend acceptant 32 dossiers ; un ancien backend limité à huit retourne 400. Toute future qualification de livraison doit rendre le backend compatible en premier. Aucun déploiement effectué.
- Les types de cartes sont stables, mais le Dashboard monolithique continue de se recalculer à l’arrivée des données. La baisse des montages n’équivaut pas automatiquement à une baisse du CPU.
- Les racines, historiques et données nutritionnelles globales restent coûteux. Les filtres et totaux ne sont pas remplacés par des résultats partiels. Les premiers clients affichés ne suffisent pas à confirmer la progression globale.
- Mesures Vite de développement sur machine locale, une observation par cellule. Les gros transferts de modules sous débit réduit ne représentent pas le build distribué. Pas de percentile/SLA, pas de facture réelle, pas de charge multiutilisateur.
- Des routes secondaires du banc renvoient 404. La stabilisation réseau et le marqueur painted ne prouvent pas que tous les services secondaires ont réussi.
- Long Tasks/heartbeat mesurent la disponibilité du thread, pas l’INP réel. Les sondes DevTools ajoutent une surcharge commune avant/après.
- La navigation interne et le retour chaud restent mesurés avec les contrôles d’identité ; les changements de rôle/Club et les révocations sont couverts séparément par les suites de sécurité.

Avant toute publication : validation explicite, qualification des P0, benchmark sur build distribué et appareils cibles, charge backend concurrente, gros historiques/413 et mémoire serveur, couverture des routes secondaires. Aucun autre lot ni optimisation d’autre page engagé.

Les essais CPU ×4 montrent encore des retards de heartbeat proches d’une seconde, même après correction. La promesse d’interactivité sans blocage n’est pas atteinte dans toutes les conditions. Les premiers noms, statistiques partielles disponibles et calendrier ne doivent pas servir à masquer les totaux globaux encore en attente.

Les temps sont variables entre passages. Le bilan retient la dernière paire normale exécutée successivement, pas les meilleurs temps isolés. Les anciens reload sans preuve de nouveau document sont exclus. La matrice ralentie a des limites de qualification explicites dans TESTS ; elle n’autorise aucune garantie de production ni de non-régression chronométrique sur tous les appareils.
