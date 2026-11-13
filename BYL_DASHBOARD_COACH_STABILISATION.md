# Dashboard Coach — démarrage, fiabilité et coûts

Branche `codex/firebase-performance-audit`. Périmètre : admission commune nécessaire au Dashboard et chargement du Dashboard Coach. Aucun déploiement, aucune donnée utilisateur importée dans les tests, aucun cache utilisateur purgé, aucune règle Firestore modifiée. P0-3/P0-4 restent ouverts.

## Diagnostic et corrections

### 1. Profil en cache : attente de confirmation qui n’arrive pas

AuthContext refuse volontairement un profil provenant du cache ou comportant des écritures en attente. Mais son abonnement `onSnapshot` ne demandait pas `includeMetadataChanges`. Lorsque le profil ne change pas entre sa lecture en mémoire et sa confirmation serveur, cette confirmation pouvait donc être supprimée par le SDK côté callback. La session restait en attente malgré un profil disponible sur le serveur.

Reproduction avec le vrai SDK Web sur émulateur : précharger le profil, ouvrir l’abonnement et observer 700 ms. Avant : un événement cache, aucune admission. Avec l’option : un événement cache, puis une confirmation serveur autorisant l’admission. Aucun profil fictivement admis, aucune écriture ajoutée, aucun abonnement supplémentaire. Les gardes `fromCache` et `hasPendingWrites` sont conservés.

Correction : `src/AuthContext.jsx`, option de métadonnées sur l’abonnement existant. Ce défaut est démontré séparément de l’erreur interne ca9 : les deux ne sont pas assimilés.

### 2. Erreur interne Firestore ca9/b815

L’onglet signalé précédemment affichait ces erreurs avec Firebase 12.12.0. Firebase décrit une course lors de l’arrêt puis de la recréation d’une écoute : une réponse ancienne peut être appliquée à une nouvelle cible. Le correctif attribue des identifiants réseau distincts. Voir le [correctif officiel #9842](https://github.com/firebase/firebase-js-sdk/pull/9842) et les [notes de version 12.13.0](https://firebase.google.com/support/release-notes/js#version_12130_-_may_7_2026).

La version 12.13.0 est qualifiée séparément, avec verrouillage exact de la dépendance et du lockfile. Aucun changement de stockage mémoire, d’App Check, de règles, de droits ou de protocole de récupération des brouillons. Aucun redémarrage automatique répété ni boucle de retry n’est ajouté.

**Limite :** le scénario exact ca9 de l’onglet utilisateur n’est pas reproduit localement. Un [signalement résiduel avec 12.13.0](https://github.com/firebase/firebase-js-sdk/issues/10008) existe. La mise à jour traite une cause connue ; elle ne prouve pas l’éradication de tous les ca9/b815 ni la résolution du délai réel de vingt secondes. L’absence d’erreur sur des profils synthétiques ne clôt pas ce point.

### 3. Historiques des programmes lus en série

La route détaillée lisait les programmes des clients en parallèle, mais tous les historiques d’un même client l’un après l’autre. Un client ayant vingt programmes imposait vingt étapes successives, même lorsque les autres lectures étaient déjà terminées.

`backend/utils/coachDashboardBundles.js` mutualise les créneaux des lectures détaillées. Le plafond vaut le nombre de clients distincts du lot, maximum 32 : il ne dépasse pas le parallélisme de l’ancien code, y compris pour un petit lot. Les réponses restent ordonnées et complètes. Une erreur arrête les travaux encore en file, sans retry ajouté.

Les vérifications transactionnelles d’identité, de rôle, d’abonnement et de propriété de chaque dossier restent dans `backend/routes/coachProgramRead.js`, avant les lectures détaillées. Les limites de 32 dossiers et 4 Mio sont conservées ; aucune lecture n’est déplacée vers une nouvelle collection ou un nouveau service.

Le test comparatif vérifie le contenu complet, les historiques, l’ensemble des références lues, l’absence de doublon, la taille des réponses et le plafond de concurrence. Son délai artificiel de 10 ms par lecture est uniquement un test d’ordonnancement, pas une mesure de production. Pour un seul client, le plafond reste un : aucun gain n’est revendiqué.

### 4. Bandeau de synchronisation

Le même texte « Actualisation impossible » était utilisé pour un échec et pour un état temporairement non confirmé. Le Dashboard affiche désormais « Synchronisation en cours. Les données affichées restent à confirmer. » tant qu’aucune erreur core/nutrition n’a été constatée. En cas d’erreur, le bandeau d’échec reste présent. Les compteurs non confirmés ne sont pas présentés comme des résultats à jour. Cette distinction ne sert pas à arrêter le chronomètre avant la disponibilité réelle des données.

## Mesures et contrôle des coûts

Les résultats retenus figurent dans `BYL_DASHBOARD_COACH_MESURES.md`. Trois passages par scénario, 36 et 100 clients, un client avec vingt programmes, 10 ou 100 validations par programme. Le premier contenu, core confirmé, retour chaud et reload sont distincts. Les reload exigent une nouvelle origine temporelle du document.

Les premiers essais Vite de développement n’ont pas montré de gain net du temps total : ils sont conservés, pas remplacés par le meilleur passage. Une seconde comparaison utilise le bundle compilé avec la configuration du projet. Le serveur et Firebase restent locaux ; ce n’est pas une certification de latence sur le compte réel ou un serveur distant.

Aucun nouveau polling, listener, index, résumé persistant, service Google ou appel à une API Google payante. Le même ensemble de documents détaillés est lu et la même réponse est produite ; aucune écriture métier supplémentaire. La concurrence serveur n’augmente pas. Les écritures de préparation des fixtures sont exclues des consultations.

Les estimations de documents et les événements SDK ne sont pas une facture Firebase. L’augmentation des notifications locales de métadonnées ne signifie pas une nouvelle lecture serveur. La facture globale, les coûts d’index et la mémoire/CPU de l’instance Google déployée ne sont pas mesurés : aucune économie réelle de facture n’est annoncée.

## Tests et preuves

- `scripts/testCoachAdmissionMetadata.cjs` et `scripts/runCoachStartupChecks.cjs` : reproduction avant/après avec le SDK réel et Auth/Firestore émulés.
- `scripts/testCoachHistoryScheduling.cjs` : parité des données, mêmes lectures et octets, concurrence bornée, erreurs sans retry.
- `scripts/runCoachStartupBenchmark.cjs` : réutilise le banc Lot 8B et la vraie application dans une copie temporaire, sans fichier `.env`.
- `scripts/qualifyCoachStartup.cjs`, `scripts/finishCoachStartupQualification.cjs`, `scripts/qualifyCoachStartupSdk.cjs` : séries séquentielles ; aucun build en parallèle des passages chronométrés.
- Suites existantes : Coach, progression, calendrier, P0-1/P0-2, messagerie, sécurité/brouillons intégrés, smoke et build.
- Données brutes et journaux : `audits/coach-startup/`. Baselines conservées avant modification des fichiers concernés.

Deux incidents du banc compilé sont conservés : fichier source nutrition non suivi manquant dans la copie initiale, puis marqueur de temps désactivé par le mode compilé. La copie inclut désormais les sources réelles complètes ; le marqueur est activé uniquement dans la copie de qualification. Le passage sans marqueur a été arrêté et exclu. Aucun code nutrition n’a été modifié pour ces incidents.

Les premières séries après en développement utilisaient un plafond global de 32 ; cette expérimentation a été resserrée au nombre de clients du lot avant la qualification finale compilée. Ces observations intermédiaires ne décrivent pas le plafond final.

## Risques et arrêt

Les programmes et historiques complets restent nécessaires aux calculs actuels et demeurent coûteux pour de grands dossiers. Le repli SDK après réponse 413 peut relire des données : mécanisme existant, non ajouté par cette correction. Les routes secondaires non montées dans le banc empêchent de certifier un chargement exhaustif de tous les services.

Aucune promesse générale « moins de deux secondes » ne doit être déduite d’un résultat local. La compatibilité du backend réellement utilisé doit aussi être vérifiée avant toute publication. P0-3/P0-4, les cas résiduels ca9 et la qualification sur infrastructure distante restent ouverts. Aucun autre parcours n’est optimisé dans cette intervention.

## Résultat final de cette intervention

La stabilité d’admission est corrigée et testée ; **le gain de temps total n’est pas démontré et la cible de deux secondes n’est pas atteinte**. Médianes compilées avant → après : 36 clients/10 validations par programme, 2,228 → 2,385 s ; 36/100, 1,986 → 2,024 s ; 100/10, 1,946 → 2,144 s. Ces hausses sont conservées comme régressions observées, sans attribution causale certaine sur seulement trois répétitions. Le premier contenu utile reste entre 0,49 et 0,64 s en médiane ; le retour chaud entre 0,28 et 0,35 s. Ni l’un ni l’autre ne remplace la mesure principale.

Le pool de lectures corrige une séquence évitable dans le code et réussit la parité, mais son gain sur latence injectée ne se retrouve pas dans le temps global mesuré. Il reste à qualifier sur une latence représentative avant de le considérer comme une optimisation acquise. L’augmentation du heap sur certains passages est également visible dans le tableau, pas masquée. La mise à jour SDK et le pool sont combinés dans la comparaison finale : celle-ci ne permet pas d’attribuer leur effet individuel.

Les trois causes étudiées sont l’attente d’admission sans notification de confirmation, la course interne SDK connue, et la lecture complète des programmes/historiques avec dépendances séquentielles. Seule la première est reproduite comme blocage dans ce banc ; la cause exacte des vingt secondes du compte utilisateur reste non reproduite. L’étape suivante dans le même Dashboard est de séparer les besoins des blocs et les calculs historiques, avec parité métier, avant d’envisager un résumé persistant et ses coûts.

### Vérifications finales

Firebase 12.13.0 : admission, trois passages compilés, six suites de sécurité/régression (Coach, progression, calendrier, P0-1, P0-2, messagerie), vingt contrôles intégrés Auth/ProgramBuilder, API brouillons, 53 contrôles smoke et build avec budgets : réussis. Vérification mobile par redimensionnement des scénarios 36 clients : réussie ; ce n’est pas une qualification exhaustive de tous les téléphones. `git diff --check` réussit.

**Échec conservé :** la suite intégrée OCTIES échoue sur l’attente du message de détection d’ancienne sauvegarde. L’application actuelle ne monte pas `CacheMigrationNotice`. Le même échec est reproduit avec AuthContext d’avant cette intervention (`integrated-baseline-auth.log`). Aucun tutoriel ni écran de migration n’a été réintroduit pour faire passer ce test. Ce contrôle reste en échec et empêche de déclarer toute la suite historique verte.

La seule dépendance directe modifiée par cette intervention est Firebase. Le lockfile adapte également ses dépendances transitives ; le détail est conservé dans `audits/coach-startup/sdk-dependency-diff.json`. Les modifications nutritionnelles présentes dans l’espace de travail sont préservées.

### Portée des coûts et du fonctionnement local

Les références lues côté backend, les appels SDK navigateur, les écritures et les écouteurs restent identiques sur les fixtures. L’estimation navigateur du premier scénario augmente de 102 à 112 en médiane ; ce compteur inclut des notifications de métadonnées et ne prouve pas dix lectures facturées supplémentaires. Aucune augmentation de facture n’est démontrée, mais aucune garantie comptable globale ne peut être déduite des émulateurs. Le coût CPU/mémoire Google en production reste non mesuré.

Le processus API local observé sur le port 5050 avait été lancé le 9 novembre. Le lanceur de développement peut réutiliser une API existante et `node backend/app.js` ne recharge pas automatiquement son code. Les modifications backend ne sont donc pas garanties actives dans l’onglet utilisateur. Aucun redémarrage de ce processus, appel métier réel ou lecture de santé Firestore n’a été provoqué pour ces tests. Le SDK peut être actualisé par le serveur de développement, mais cela ne qualifie pas le backend déjà lancé.

Aucun déploiement effectué. Aucun P0 déclaré clos. Les observations de l’onglet réel sont distinctes des mesures sur profils synthétiques et ne constituent pas une preuve de correction des vingt secondes.
