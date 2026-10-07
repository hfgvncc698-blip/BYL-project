# Préparation des cycles (coach)

Le bouton crée un **brouillon**, jamais une assignation automatique. Les anciennes versions restent dans la bibliothèque. Une nouvelle version relit les résultats du programme source ; les brouillons existants ne sont pas modifiés silencieusement.

## Règles v1

Ces valeurs sont des préréglages de produit, modifiables par le coach, pas une prescription individualisée ni des seuils physiologiques obligatoires.

| Cycle | Répétitions | Séries | Repos |
| --- | --- | --- | --- |
| Préparation générale | 15 | 2 | 90 s |
| Endurance musculaire | 20 | 3 | 60 s |
| Hypertrophie | 10 | 3 | 90 s |
| Force, mouvements polyarticulaires reconnus | 6 | 3 | 180 s |
| Force, autres mouvements | 10 | 3 | 90 s |
| Récupération | Inchangées | Moitié, arrondie au-dessus, minimum 1 | Au moins 90 s |
| Personnalisée | Inchangées | Inchangées | Inchangé |

Le corps de séance et les bonus compatibles sont adaptés. L'échauffement, le retour au calme, le cardio minuté et les séries avancées sont conservés et nécessitent une vérification. Les identités d'exercices utilisent le rapprochement existant de l'application (identifiant ou nom normalisé exact).

La charge de base provient de la première série exploitable de la séance validée la plus récente du **programme source**, sinon du programme. Les séances partielles ne servent pas de référence. La récupération propose 60 % de cette charge. Pour les autres cycles, un ajustement conservateur `(1 + répétitions source / 30) / (1 + répétitions cibles / 30)` ne peut que diminuer ou maintenir la charge ; arrondi inférieur à 0,5 kg. Aucune estimation maximale ni augmentation automatique n'est prescrite. Il faut vérifier les incréments du matériel, les sensations, la fatigue, les contre-indications et les objectifs avec le coach.

Référence générale consultée : [ACSM, recommandations 2026](https://acsm.org/resistance-training-guidelines-update-2026/). Les paramètres exacts ci-dessus sont nos choix de démarrage prudents, **pas** une reproduction des recommandations ACSM. La périodisation seule ne garantit pas un résultat.

## Cohérence

- Variation automatique lors de la création d'une nouvelle version : exercices principaux et secondaires remplacés lorsque possible par des variantes répertoriées dans la banque `training`. Les poussées horizontales (chest press convergente, développé couché, pompes) peuvent également être échangées entre elles. Même groupe musculaire, niveau débutant/tous niveaux ou intermédiaire si la référence l’est déjà, et matériel déjà présent dans le programme (ou poids du corps). Pas de nouvelle variante pour la récupération, les cycles personnalisés, les exercices minutés ou les séries avancées. Si aucune variante compatible n'existe, l'exercice est conservé. Il ne s'agit pas d'une progression technique certifiée ni d'une analyse des contre-indications.
- Les variantes ont leur propre identité, leurs médias et leurs consignes ; aucune charge de l'ancien mouvement n'est transférée. Un badge traduit signale le nouvel exercice, sans validation supplémentaire.
- Les charges générées sont désormais des **suggestions vertes**, stockées dans `cyclePrescription.suggestedKg` : les champs de charge restent à zéro tant que le coach n'a rien saisi. L'historique du client est aussi chargé dans les brouillons préparés pour lui. Une variante peut donc avoir une suggestion basée sur son propre historique ; sans historique exploitable, aucun poids n'est inventé.

- Les cycles sans programme ni brouillon ont un aperçu préconfiguré, dérivé du programme précédent disponible. Il est recalculé en lecture sans dupliquer six mois de programmes en base. Après une récupération, un cycle de travail reprend la dernière référence non-récupération disponible.
- Deux séances validées distinctes ayant toutes les séries attendues réussies permettent de proposer une répétition supplémentaire, dans la plage du cycle (préparation : 20, endurance : 25, hypertrophie : 12, force : 6 pour les mouvements reconnus, 12 sinon). Une proposition future ne compte jamais comme un résultat accompli. Les charges ne sont pas augmentées automatiquement.
- Les aperçus n'écrasent jamais les programmes assignés ni les brouillons ouverts ; pour les actualiser, préparer explicitement une nouvelle version. Les limites de l'historique disponible restent affichées.

- Lecture serveur de l'historique avant création, délai maximal de 12 secondes pour cette lecture. Un échec ne crée aucun brouillon.
- Transaction avec révision du plan : deux préparations concurrentes ne peuvent pas remplacer silencieusement le même lien.
- Stockage canonique `sessions`, sans duplication `seances`.
- Les prescriptions de cycle ne sont pas écrasées par l'estimation de charge du builder lors de l'assignation.
- Le brouillon retrouve son cycle par son identifiant lors de l'assignation (sauf choix explicite d'ajout séparé).
- La clôture active le programme associé au premier cycle ouvert, ou efface le programme courant si le prochain cycle n'est pas encore préparé.

## Limites de validation

La clôture automatique utilise les fonctions serveur `onTrainingCycleSessionValidated` et `onTrainingPlanUpdated`. Leur déploiement est nécessaire ; le navigateur local seul ne peut pas activer ce comportement. Chaque transition relit dans une transaction le plan, le programme et les séances validées. Une notification rejouée est sans effet après clôture. Les séances partielles et le simple pourcentage sans validation ne déclenchent pas de transition. Le mode « programmes uniquement » n'est pas modifié. Si le prochain programme n'est pas prêt, le cycle est clôturé mais aucun brouillon n'est assigné automatiquement. La réconciliation d'une programmation existante se fait à sa prochaine modification ; ce changement ne migre pas en masse les anciennes données.

Tests unitaires : `testCyclePrescription.mjs`, `testTrainingCycles.mjs`, `testCycleAssignment.mjs`, `testConfirmedProgramWrites.mjs`. Lint et compilation à exécuter également. La validation intégrale Firebase/Safari sur appareils réels reste nécessaire ; ne pas considérer les tests unitaires comme un déploiement ou une validation clinique. L'historique des autres programmes n'est pas agrégé dans cette version.

La frise reprend les programmes antérieurs même quand le premier cycle est vide. Un plan dont les seuls liens pointent vers des programmes supprimés peut reprendre la dernière assignation disponible en lecture. Les liens valides et les brouillons sont préservés ; enregistrer la programmation confirme cette réconciliation.

## Propositions fondées sur les résultats

L’aperçu coach et la préparation utilisent la même banque et les mêmes règles de variation. L’ouverture du brouillon relit toujours les résultats serveur : des résultats nouveaux peuvent donc actualiser une proposition.

Les deux dernières séances validées distinctes contenant l’exercice doivent atteindre la cible sur toutes les séries attendues du programme source. Une série manquante ou un échec récent ne sont pas ignorés pour rechercher des réussites anciennes. Les exercices au poids du corps avec charge explicitement nulle sont pris en compte. Les séances partielles et les doublons ne permettent pas de confirmer une progression.

Les mouvements principaux peuvent aussi être renouvelés après une séance réussie, selon les mêmes critères de compatibilité. Les répétitions peuvent progresser dans la plage du cycle uniquement avec des résultats propres à l’exercice proposé. À la borne haute, le mouvement reste conservé ; le coach peut choisir une variante plus complexe après vérification de la technique. Les secondaires peuvent être renouvelés après une dernière séance validée atteignant la cible sur toutes les séries attendues, avec une variante compatible connue (lien de variante dans un sens ou dans l’autre). Cette rotation ne certifie pas une progression technique. Une variante peut être réutilisée dans une autre séance, mais pas faire doublon dans la même séance. Aucun quota ne limite le nombre de secondaires renouvelés. Pendant la récupération, les exercices sont conservés. Les charges restent des suggestions à valider et ne sont pas transférées à une nouvelle identité d’exercice.

L’aperçu reste compact : exercices, séries et répétitions, repos, avec un badge « Nouvel exercice » pour les exercices remplacés. Les raisons et références des résultats restent stockées dans les métadonnées, sans blocs explicatifs dans l’aperçu. En l’absence de données suffisantes, les paramètres du cycle sont utilisés sans progression supplémentaire. Les retours subjectifs (fatigue, douleur, préférence) ne sont pas inférés des performances.

Les prescriptions standards du cycle sont appliquées après le choix des variantes : préparation générale 2 × 15 / 90 s, endurance 3 × 20 / 60 s, hypertrophie 3 × 10 / 90 s, force 3 × 6 / 180 s pour les mouvements de base (dont les poussées horizontales), 3 × 10 / 90 s pour les isolations. La récupération conserve les mouvements et les répétitions, réduit de moitié les séries (arrondi supérieur, minimum une) et prévoit au moins 90 s de repos. Les formats minutés, séries avancées et cycles personnalisés restent préservés.

### Semaine de récupération

Les propositions de récupération gardent la moitié des séances de la semaine source (arrondi supérieur, minimum une), réparties dans leur ordre : 4 séances deviennent 2, 3 deviennent 2. Les séances retenues conservent leurs exercices et appliquent les séries réduites et charges suggérées de récupération. Le coach peut ajuster cette sélection dans le brouillon, notamment pour un split. L’aperçu affiche la fréquence proposée séparément du nom du programme source. Les compteurs du brouillon utilisent le nombre réel de séances retenues. Les programmes assignés et brouillons existants ne sont pas réécrits. Le cycle de travail suivant utilise toujours la dernière référence hors récupération quand elle existe.
