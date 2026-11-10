# Lot 7A — bilan exécutif

Campagne du 10 novembre 2026. Branche `codex/firebase-performance-audit`, version applicative `e476b0a4cfcd6bb9e27515c69a5416325e480f6e`. Campagne locale sur fixtures synthétiques.

## Décision

**Production bloquée.** Un profil créé par un coach peut conférer un accès transversal au résumé des clubs. Un responsable peut obtenir la difficulté d’une séance étrangère par la projection du calendrier. De plus, la désactivation dans Firebase Auth seule laisse utilisable un ancien jeton en accès direct. Sur un profil navigateur partagé, le second compte peut aussi relire un programme du premier depuis IndexedDB, malgré le refus du serveur.

## Confirmé par test

109 exécutions de test sur la version auditée, dont 101 réussies et 8 échouées. Le build est compté séparément. **4 P0, 1 P1, 1 P2, 6 P3.** Les échecs se répartissent entre les deux sondes qui exigent la confidentialité et les six bancs de test défaillants. Les deux autres P0 sont révélés par des tests de caractérisation réussis, sur la désactivation externe et le cache disque partagé.

Le passage d’expiration sans travail sur 4 000 dossiers tombe de 4 020 à une lecture estimée. Au repos stabilisé de 24 s, les inbox de 1 000 conversations coûtent 3 lectures estimées pour le professionnel et 6 pour le club. Après un message, ces chiffres remontent à 1 011 et 1 948. Une séance validée apparaît chez les trois rôles en 38 ms dans le parcours croisé. La réception de deux webhooks payés simultanés n’accorde qu’un programme dans la fixture.

## Observé dans le code

Branche initialement propre. Les neuf commits fonctionnels ou d’instrumentation sont répertoriés dans la matrice. Deux interactions méritent un suivi prioritaire. La confiance de l’API Club dans le profil amplifie une permission de création Firestore antérieure. Le rapprochement du calendrier par identifiants historiques étend les données exposées par une nouvelle projection. Le Lot 7A ajoute uniquement ces sept rapports au dépôt.

## Hypothèse

Les profils administratifs anciens, la distribution des historiques et le nombre réel de réplicas pourraient modifier l’exposition et les coûts. Les mesures locales ne quantifient ni l’exploitation passée ni la facture.

## Non vérifié

Le parcours UI intégral de chaque rôle, l’effacement disque après fermeture complète, les coûts réels, les règles et index effectivement publiés, PM2 et le proxy en service restent à qualifier. Les mesures de référence reprises des anciens bilans sont identifiées comme telles.

## Travaux à valider

Traiter les quatre P0 en priorité, ajouter leurs contre-tests aux parcours normaux, restaurer les six bancs en échec, puis qualifier les grandes inbox et les progressions à froid en préproduction autorisée. Contrôler séparément les coûts d’index, de déclencheurs et de reconnexion. Le Lot 7B attend une décision explicite.

[matrice des tests](BYL_LOT7A_MATRICE_TESTS.md), [rapport des anomalies](BYL_LOT7A_ANOMALIES.md), [rapport de performances](BYL_LOT7A_PERFORMANCES.md), [rapport de sécurité](BYL_LOT7A_SECURITE.md), [rapport des coûts Firebase](BYL_LOT7A_COUTS_FIREBASE.md), [rapport de préparation à la production](BYL_LOT7A_PREPARATION_PRODUCTION.md).
