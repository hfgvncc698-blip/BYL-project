# Lot 8B — tests et reproduction

## Matrice de démarrage

```sh
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachLot8B.cjs before
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachLot8B.cjs after
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachLot8B.cjs before slow
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachLot8B.cjs after slow
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachLot8B.cjs before cpu
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachLot8B.cjs after cpu
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachLot8B.cjs before transitions
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runCoachLot8B.cjs after transitions
python3 scripts/reportCoachLot8B.py
```

Chaque runner copie HEAD, les changements de travail nécessaires et les dépendances non suivies des Lots 7 dans un dossier temporaire sans `.env`. Le baseline restaure les quatre fichiers ciblés depuis `audits/lot8b/baseline/`. Auth et Firestore ciblent exclusivement les émulateurs. Les profils Chrome sont jetables, le profil de l’utilisateur n’est jamais piloté ni purgé.

Quatre volumes : 12/100/500/1 000 dossiers, formats de propriété alternés createdBy/coachId/coachIds, deux programmes et deux validations par dossier, cinq modèles, 40 événements. Le premier diagnostic sans modèles reste dans `diagnostic-before.json`. L’essai cartes seules reste dans `cards-only.json` ; il ne doit pas être comparé comme s’il contenait la correction des lots réseau.

Le groupe main mesure aussi la navigation interne (1,5 s ailleurs), le retour chaud (200 ms ailleurs) et le rafraîchissement complet. Les groupes slow/cpu mesurent le premier lancement sous contraintes CDP. Le groupe `transitions` complète les navigations, retours chauds et rechargements sous réseau puis CPU ralentis, sur les quatre volumes. Les cibles sont évaluées uniquement dans les cellules observées.

Le rapport vérifie la parité des totaux core : deux validations et deux séances prévues par client. Le marqueur d’admission, les racines, modèles, calendrier, détails, core et painted sont conservés avec les Long Tasks, heartbeat, CPU, heap, requêtes et octets. Les états de chargement ne sont pas comptés comme des données confirmées.

## Non-régression

```sh
node scripts/testCoachProgramBatchLot8B.mjs
node scripts/testCoachConfirmedCountersLot8B.cjs
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runRegressionsLot8B.cjs coach
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runRegressionsLot8B.cjs progress
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runRegressionsLot8B.cjs calendar
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runRegressionsLot8B.cjs p01
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runRegressionsLot8B.cjs p02
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runRegressionsLot8B.cjs messaging
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runIntegratedMigrationLot7B1Octies.cjs
npm run test:smoke
npm run build
```

Le test du vrai chargeur vérifie 100 dossiers répartis 32/32/32/4, aucun doublon ni oubli, contenu des historiques, réutilisation des promesses et refus 400/401/403 sans repli SDK. Les cas 404/413 exercent aussi le vrai chemin de repli avec lecteurs synthétiques : 32 programmes et leurs historiques sont récupérés une seule fois chacun.

Le test API étend les contrôles Lot 4 : 32 dossiers autorisés, parité avec une requête singleton, rejet de 33, refus de tout le lot contenant un dossier étranger et refus 413 de réponse trop grande. Les contrôles de rôle, Club, révocation, transfert, formats anciens, validation/suppression et résumés existants sont rejoués.

Les suites séparées vérifient progression sur deux appareils et reconnexion ; calendriers et réservations concurrentes ; messagerie et révocation Auth ; contre-tests P0-1/P0-2 ; identité, brouillons ProgramBuilder, conflits et migration synthétique. Les refus Firestore attendus dans les tests négatifs ne sont pas des régressions.

Les tests unitaires complémentaires couvrent Clients (sélection visible), notifications, nutrition, écritures confirmées, chargement différé résilient, barrière privée et paiements simulés. Aucun paiement réel.

## Limites et incidents à conserver

- La disponibilité des noms ou du calendrier ne signifie pas que toutes les statistiques sont confirmées.
- Les routes secondaires non montées retournent 404 et sont comptées ; aucune substitution par un faux succès vide.
- Les profils à froid sont neufs ; la mémoire de session est conservée seulement pour les parcours internes prévus. Le rafraîchissement restaure Auth et réadmet l’identité.
- Le compteur de montages DevTools et le profil CPU ajoutent du travail de mesure commun avant/après.
- Une interface réactive selon heartbeat n’est pas une certification de tous les boutons ; les opérations métier importantes sont couvertes par les suites séparées.
- Aucun test ne ferme P0-3/P0-4, ne certifie les anciennes copies privées sur disque ni les délais de révocation externe en production.

Les sorties de la première série, durées et éventuels échecs sont consignés dans `audits/lot8b/suites.json`. Les reprises sont indexées par `accepted.json`, `paired.json`, `final-checks.json` et le manifeste final `qualification.json`. Les logs intermédiaires sont conservés, sans les présenter comme des résultats finaux.

Incident du banc : une première série réseau lent a lu le fichier DevToolsActivePort alors qu’il était encore vide, provoquant ECONNREFUSED sur le port 80. La connexion attend désormais un port valide et une cible Chrome disponible. Ce défaut du lanceur n’est pas attribué à BYL ; la série est rejouée et son journal initial conservé.

Les suites métier et de sécurité de la série principale se terminent avec succès : Coach (dont les nouveaux cas 32/33/étranger/413), progression, calendrier, P0-1, P0-2, messagerie ; 48 contrôles intégrés OCTIES. Le smoke passe 53 contrôles et le build respecte ses budgets. Les tests unitaires du chargeur, Clients, notifications, nutrition, paiements simulés, écritures et identité passent. Cela ne clôt pas les risques P0 ouverts ni ne certifie l’ensemble des scénarios de production.

Les rechargements ont également révélé des défauts de sonde : contexte JavaScript détruit, document.body temporairement absent et signal core encore issu de la visite précédente. Les profils sont désormais distincts à chaque lancement, les lectures DOM tolèrent la phase sans body et un retour requiert un nouveau signal core. Les séries interrompues restent dans les journaux ; seules les observations qualifiées alimentent les tableaux. Un ND ou un ancien signal n’est jamais transformé en retour instantané. Les volumes manquants sont rejoués séparément et fusionnés par volume, sans inventer de moyenne.

La version finale ajoute le test des prédicats réels de confirmation des compteurs : annuaire partiel, total clients indépendant, statistiques sport en attente de core/calendrier, nutrition en attente de sa source et actions sans compteur. Le banc relève pendingCountObserved puis vérifie la sortie de l’état occupé après confirmation. La série delivered-after-* et delivered-security requalifie cette version finale ; les résultats intermédiaires restent archivés séparément.

Une version intermédiaire a dépassé le budget CoachDashboard (70,1 Kio / 70). La factorisation et la suppression du seul callback sans référence ramènent le bundle final à 69,5 Kio, sans relever le budget. Le log intermédiaire et la preuve de référence nulle sont archivés. `final-source.json` fige les quatre fichiers applicatifs ; les séries accepted-after-* reprennent les mesures après cette stabilisation.

Les premières séries delivered ont chevauché les builds nécessaires au contrôle du budget et montrent une forte variabilité CPU. Elles ne servent pas à la conclusion finale : les séries accepted reprennent les trois conditions après gel du code, sans build lancé en parallèle. La série transitions finale et la sécurité sont exécutées après stabilisation du code. Les journaux défavorables restent conservés. Aucun percentile ni causalité exclusive n’est déduit d’un passage unique.

### Contrôle final des sondes et des variantes d’affichage

Le rechargement pouvait observer l’ancien document avant sa destruction. La sonde exige maintenant `performance.timeOrigin > previousTimeOrigin` pour valider un reload ; les mesures précédentes sans cette preuve sont exclues, y compris les valeurs apparemment plausibles. La série `paired-before.log` / `paired-after.log` rejoue les quatre volumes et les trois retours avec cette sonde. Les ND des reload sous contraintes ne constituent pas des succès.

La revue finale a également appliqué le même prédicat de confirmation à la seconde disposition desktop des statistiques. Le test ciblé vérifie les deux usages JSX et les vrais prédicats, et le smoke/build sont rejoués après cette correction. Les séries slow/cpu et transitions sont des observations de la révision précédant ce dernier alignement d’affichage ; elles ne constituent pas une certification chronométrique de toutes les variantes finales. La série normale paired porte sur les quatre fichiers finaux. Les suites de sécurité précèdent uniquement cet alignement d’affichage ; les contrôles serveur et la barrière d’identité n’ont pas changé depuis leur exécution.

Les résultats précédents favorables et défavorables restent disponibles. Une baisse de CPU ou un gain de temps sur un passage ne suffit pas à attribuer la variabilité à la machine, à Chrome ou à Firebase. Aucun de ces facteurs n’est déclaré cause exclusive sans preuve.

### Conclusion de qualification

`paired.json` : avant et après terminés avec code 0. `final-checks.json` : compteurs, chargeur, smoke (53) et build terminés avec code 0. Les quatre reload normaux démontrent un nouveau timeOrigin. La dernière paire n’atteint pas les cibles de temps à tous les volumes ; elle contient une régression à 12 clients. Les reload sous contraintes non démontrés restent ND. La mémoire/CPU serveur et un succès exhaustif de toutes les routes secondaires restent non qualifiés. Aucun test ne ferme P0-3/P0-4.

Le navigateur est froid par volume ; le serveur Vite est partagé à l’intérieur d’une série et peut avoir préparé des modules lors des volumes précédents. Les valeurs entre volumes ne doivent pas être interprétées comme un seul effet du nombre de clients.

La revue des horloges a distingué la première admission observée (`startup.admitted`) des confirmations répétées du profil. Les tableaux utilisent la première ; les anciennes valeurs `profileAuthorized` restent des dernières confirmations, pas une mesure de blocage initial. La sonde future préserve désormais la première occurrence. Cela ne change ni les temps core collectés ni les résultats applicatifs.
