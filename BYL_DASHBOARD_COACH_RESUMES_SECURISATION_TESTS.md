# Résumés sécurisés — traces de qualification

## Exécutions finales

`audits/coach-summary-guarded/qualified-checks.json` contient les codes de sortie :

- essai métier/sécurité : 0 ;
- P0-1 : 0 ;
- P0-2 : 0 ;
- deux paires de benchmarks Dashboard compilé : tous 0.

`memory-tests.log` confirme les tests ciblés de génération, incarnation du dossier, quarantaine, isolation de l'appelant, identifiant `__proto__`, absence de lecture supplémentaire et absence d'écriture de cache.

Les données API sont dans `trial.json`. Les données navigateur finales sont les fichiers `*-build.json` de `audits/coach-summary-guarded-browser/`. Les fichiers `*-pre-final.json` conservent les mesures intermédiaires et ne sont pas utilisés dans le tableau final.

## Tests négatifs et limites

- Les journaux comportent des `PERMISSION_DENIED` attendus pour les tentatives interdites. Certaines évaluations refusées mentionnent aussi la limite de 1 000 expressions ; les opérations autorisées testées passent. Ce signal reste à surveiller lors de la qualification des autres profils et de leurs variantes de droits. Aucune limite de règles n'a été relevée ou désactivée pour les faire passer.
- `unfenced-admin-bypass` reste un **échec attendu de la garantie pour un auteur privilégié non coordonné**. Le banc vérifie sa reproduction puis le retour au canonique après quarantaine. Un code de sortie global 0 ne signifie pas que ce risque est corrigé.
- Aucun dossier réel ne passe à l'état qualifié. Les anciennes écritures testées sur un dossier non qualifié restent autorisées selon les règles existantes et n'ajoutent pas de lectures de cache.
- Les règles renforcées ne sont appliquées qu'à une copie temporaire de `firestore.rules`. Le fichier de travail et les règles de production restent inchangés.
- Les derniers ajustements de protection des clés d'objets sont couverts par le test mémoire ; ils ne changent pas le calcul métier des fixtures de performance.
- Les coûts d'évaluation des règles, de migration du protocole et les factures Google réelles ne sont pas mesurés. Le résultat démontré est l'absence de lectures/écritures supplémentaires **du cache** et la non-augmentation des opérations explicites sur les parcours comparés.

## Décision

Pilote qualifié pour les dossiers synthétiques dont les auteurs sont contrôlés, avec garde d'invalidation, contrôles de droits et cache mémoire borné. Généralisation à BYL et déploiement non autorisés tant que la couverture des auteurs privilégiés et le budget complet ne sont pas démontrés. Les fonctionnalités actives de BYL n'ont pas été modifiées.
