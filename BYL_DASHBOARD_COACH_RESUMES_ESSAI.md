# Dashboard Coach — essai de résumés exacts sur émulateurs

Branche : `codex/firebase-performance-audit`.

## Décision

**Essai réalisé, intérêt technique confirmé, activation générale refusée en l'état.** Les consultations avec résumé prêt sont beaucoup plus économiques en lectures. En revanche, la création/reconstruction ajoute des écritures et la fraîcheur exacte exige une coordination atomique de tous les auteurs de modifications. Les parcours actuels ne garantissent pas encore cette coordination.

Le pilote reste dans `scripts/experiments/` et n'est importé par aucun fichier de l'application active. Les routes sont adaptées uniquement dans les copies temporaires du banc. Aucun redémarrage du backend local habituel, aucune donnée réelle traitée, aucun déploiement, aucune règle de production modifiée, aucune migration ou purge utilisateur. Les P0-3 et P0-4 restent ouverts.

## Résultats principaux

Application réelle compilée, 36 clients, 90 programmes et 900 validations synthétiques ; deux séries alternées avant/après :

| Mesure | Référence actuelle | Pilote |
|---|---:|---:|
| Premier contenu réel | 827 ms | 750 ms |
| Données principales, première création des résumés | 1 845 ms | 1 740 ms |
| Rechargement avec résumés présents | 1 046 ms | 658 ms |
| Navigation à chaud | 280 ms | 276 ms |
| Lectures estimées programmes à la création | 1 032 | 1 068 |
| Écritures serveur à la création | 0 | 36 |

Ces résultats ne remplacent pas la mesure locale précédente de 13,77 secondes : le compte réel n'a pas été mesuré avec le pilote et les fixtures sont différentes. Il ne faut pas présenter le temps d'API comme le temps du Dashboard complet.

Sur la fixture API de 500 clients / 1 000 programmes / 10 000 validations :

- référence : **7 214 ms, 11 548 lectures documentaires estimées** ;
- création : **7 314 ms, 12 048 lectures estimées et 500 écritures** ;
- consultations avec résumé présent : **136 ms en médiane, 1 048 lectures estimées, aucune écriture**.

La réduction de lectures sur ces consultations est d'environ 91 %. Le coût initial est explicitement inclus dans le bilan. Les variations de temps d'une série à l'autre sont importantes sur émulateur ; le rapport conserve les données brutes et distingue les phases.

## Choix du résumé

Le pilote matérialise, par dossier, la **projection exacte déjà utilisée par le Dashboard**, dans un document serveur compressé et versionné. Ce n'est pas un compteur approximatif ni une copie de la seule carte « progression ».

Il conserve :

- tous les programmes attribués, leurs anciens formats et leurs prescriptions nécessaires au Radar ;
- toutes les métadonnées de validation nécessaires aux calculs, aux répétitions, au dédoublonnage et au calendrier ;
- dates, statuts, titres, difficulté, reprise de séance et visibilité ;
- les types Firestore via le codec existant.

Le frontend reçoit la même réponse que la route canonique : l'empreinte de l'intégralité des réponses est comparée, pas seulement trois compteurs. Aucun changement de logique métier ou de rendu n'est requis. Les vues Programme et SessionPlayer gardent leurs accès canoniques. Les statistiques ne deviennent confirmées qu'après la même admission et le même parcours de chargement.

Ce compromis économise les nombreuses lectures backend tout en préservant les fonctionnalités. **Il ne réduit pas davantage le volume de données envoyé au navigateur**, ni la complexité des calculs locaux. Ce n'est donc pas encore un résumé de taille constante : sa taille dépend des programmes et historiques. La compression est très favorable aux fixtures répétitives ; elle ne garantit pas le même ratio sur un dossier réel.

## Exactitude et invalidation

Chaque mutation synthétique contrôlée écrit la modification et une nouvelle génération dans la même transaction. Le champ de révision du Dashboard est mis à jour au même moment, afin que ses caches mémoire s'invalident aussi. Le résumé est reconstruit à la prochaine consultation du dossier concerné, pas au repos.

Le lecteur :

1. passe par les vrais contrôles de session, révocation, rôle et propriété de la route ;
2. lit les dossiers et résumés dans la transaction ;
3. utilise le résumé seulement si sa génération et son schéma correspondent ;
4. sinon relit les données canoniques, puis écrit le résumé après toutes les lectures ;
5. retombe sur le calcul canonique en cas de corruption, schéma différent ou taille excessive.

Une transaction concurrente est rejouée si nécessaire. Les invalidations répétées ne cumulent pas des compteurs : le résumé est reconstruit depuis la source actuelle. Les écritures du résumé restent des coûts réels du modèle et ne sont pas effacées des mesures.

**Contre-test bloquant :** une modification canonique effectuée sans mise à jour atomique de la génération laisse un résumé ancien considéré comme valide. Ce cas a été reproduit, puis détecté en comparant la réponse au calcul canonique. Il ne doit pas être qualifié de réussite fonctionnelle.

Aujourd'hui, `functions/coachPageRevision.js` actualise la révision après l'événement Firestore. Le délai entre la mutation et le déclencheur suffit à créer cette fenêtre. Le pilote ne transforme pas les auteurs réels de modifications ; les anciens onglets, scripts et opérations administratives restent donc à qualifier avant intégration. Une simple clé de révision côté navigateur n'est pas une preuve de fraîcheur.

## Coûts et conditions d'éligibilité

Aucun coût cloud réel n'a été mesuré. Les tableaux portent sur les opérations d'émulateur, estimations documentaires, octets, temps et ressources du banc. Aucun nouveau service n'a été créé.

- Première lecture : lectures habituelles + consultation des documents de résumé + une écriture par dossier mis en cache.
- Résumé valide : admission actuelle + dossiers + résumés ; aucune relecture des programmes/historiques et aucune écriture.
- Dossier modifié : reconstruction de ce dossier, avec une lecture et une écriture de résumé supplémentaires par rapport à sa lecture canonique.
- Dossier sans programme : le résumé ne fait pas économiser de lectures ; ses écritures ne s'amortissent jamais dans ce modèle.
- Consultation après chaque modification : le surcoût de reconstruction peut se répéter sans bénéfice.
- Navigation déjà servie depuis la mémoire du navigateur : aucune consultation backend économisée par ce pilote.

Avec les hypothèses illustratives W/R = 1, 3 ou 5, les fixtures avec historiques amortissent les opérations initiales dès la deuxième consultation serveur sans modification. Ce ne sont pas des tarifs Firebase, et ce calcul ne couvre pas la facture de stockage, les index ou toutes les ressources Google. Les dossiers sans historique ont un seuil moins favorable.

Le writer synthétique réalise une lecture du dossier et écrit la donnée canonique plus la génération. Ses coûts figurent séparément dans les résultats. L'intégration réelle devra comparer ce mécanisme aux déclencheurs existants : leur exécution, les invalidations secondaires et les écritures éventuelles ne doivent pas être comptées comme gratuites ni supposées disparaître.

## Sécurité et bornes

- Garde stricte : projet `demo-byl-performance`, Auth et Firestore sur `127.0.0.1`, sinon refus avant lecture.
- Tous les accès aux résumés passent après l'autorisation de chaque dossier. Un cache ne confère aucun droit.
- Lecture et falsification directe des documents de résumé refusées au coach par les règles existantes sur émulateur.
- Révocation de session, changement de rôle, désactivation, réaffectation du dossier et suppression restent contrôlés même lorsque le résumé existe.
- Aucun résumé persistant privé ajouté au navigateur.
- Plafond par résumé : 256 Kio compressés, 64 Mio décompressés ; écritures d'un lot plafonnées à 4 Mio de payload. Au-delà, réponse canonique sans mise en cache.
- Les documents trop volumineux et la croissance de l'historique restent un risque économique : le fallback y ajoute une lecture de résumé sans garantir d'économie. Une activation réelle devra exclure ces dossiers en amont.
- Aucun nettoyage de résumés orphelins n'est déployé. Dans une intégration, leur rétention, suppression et exclusion d'index des payloads doivent être définies et chiffrées.

## Fonctions préservées et vérification

Le payload canonique et celui du pilote sont identiques pour tous les volumes testés. Dans le Dashboard complet, les compteurs correspondent avant/après ; une validation puis sa suppression sont visibles. Les autres dossiers restent réutilisables sans reconstruction globale. Desktop/mobile, navigation et rechargement passent.

Les contrôles de sécurité et cohérence sont décrits dans `BYL_DASHBOARD_COACH_RESUMES_TESTS.md`. Les essais de concurrence couvrent deux lectures et une course lecture/écriture. Ils ne constituent pas une qualification de toute l'infrastructure distribuée, des coupures réelles, de tous les parcours de paiement ou de chaque bouton de l'application.

## Recommandation

Ne pas intégrer automatiquement ce pilote dans BYL. Avant toute activation, il faut :

1. Démontrer l'invalidation atomique pour chaque auteur de modifications, ou définir un mécanisme qui refuse de présenter comme confirmé un résumé dont la fraîcheur n'est pas établie.
2. Exclure les dossiers vides et non amortissables, ainsi que les résumés trop volumineux ; fixer un budget total incluant écritures, index, stockage et traitements.
3. Qualifier les anciennes versions et les modifications hors des parcours contrôlés, sans affaiblir les règles existantes.
4. Mesurer le Dashboard complet à plus grand volume, sur réseau/CPU contraints, puis la préproduction sous les conditions de sécurité déjà ouvertes.

L'essai répond au diagnostic : le chemin backend peut devenir très rapide sans sacrifier les données métier, mais **les garanties générales d'exactitude et de coût inférieur ne sont pas encore acquises pour les auteurs et usages actuels**. Le mécanisme reste désactivé hors du banc. Aucun autre lot commencé.
