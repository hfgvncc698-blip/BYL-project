# Lot 7B.1 — tests et preuves

10 novembre 2026. Branche `codex/firebase-performance-audit`. Référence applicative `e476b0a4cfcd6bb9e27515c69a5416325e480f6e`, départ du travail `27a9515`. Tests locaux sur données synthétiques et émulateurs uniquement.

## Méthode

Les reproductions initiales ont été rejouées sur une extraction de la référence e476b0a. Les corrections ont été copiées dans un répertoire isolé avec dépendances locales et émulateurs de démonstration. Aucun fichier .env de l’application n’est chargé dans ces copies. Les tests cache utilisent l’initialisation Firebase de la révision, en substituant uniquement les paramètres du projet demo. Les autres parcours navigateur emploient les harnais existants et leurs contextes contrôlés.

Le nouveau lanceur runSecurityLot7B1.cjs crée sa propre copie isolée, retire les variables externes de l’environnement lancé et n’accepte que quatre scénarios et deux versions. Les tests cache rendent délibérément un code de sortie non nul tant que la confidentialité n’est pas obtenue.

## Reproduire


Depuis la racine, avec Node, Java compatible et Firebase CLI installés, et les ports de firebase.performance-test.json libres, lancer séquentiellement.

```sh
node scripts/runSecurityLot7B1.cjs profile reference
node scripts/runSecurityLot7B1.cjs profile current
node scripts/runSecurityLot7B1.cjs session reference
node scripts/runSecurityLot7B1.cjs session current
node scripts/runSecurityLot7B1.cjs auth current
node scripts/runSecurityLot7B1.cjs cache current
```

Les deux premiers scénarios reference doivent échouer. Le scénario cache current doit encore échouer sur l’assertion de confidentialité. Le scénario auth caractérise séparément le confinement réussi et la limite Auth seule. Avec auth reference, le nouveau test s’arrête sur l’absence de prepare-disable. La reproduction indépendante Auth seule provient du test du Lot 7A rejoué avant correction avec le même ancien jeton et une attente de cinq secondes.

## Résultats retenus


Essai | Portée | Code sortie | Secondes | Résultat
--- | --- | --- | --- | ---
before-profile | P0-1 référence | 1 | 9.9 | Échec attendu, création 200 et résumé étranger 200
before-session | P0-2 référence | 1 | 12.0 | Échec attendu, difficulté étrangère 4
before-auth | P0-3 référence | 0 | 26.9 | Risque reproduit, accès direct après 5,062 s
red-profile | Nouveau contre-test sur référence | 1 | 8.9 | Échec attendu
red-session | Nouveau contre-test sur référence | 1 | 11.6 | Échec attendu
sdk-final | P0-1 livré | 0 | 10.4 | Profils, ancienne propriété, claims signées, propriétaire remplacé, SDK/API
mutation-parity | P0-2 mutations légitimes | 0 | 15.0 | Modification et suppression autorisées, session étrangère conservée
projection-final | P0-2 livré | 0 | 12.6 | Anciennes identités, transfert, privé, résumé/détail/période, PATCH/DELETE
operator | P0-3 livré | 0 | 21.3 | Deux appareils logiques, marqueur protégé, attentes HTTP, réactivation, confinement opérateur
storage-result | P0-4 livré | 1 | 11.4 | Échec attendu, lecture locale dans l’onglet, deuxième onglet, redémarrage et cache nutrition
rules-delivered | Rules | 0 | 8.9 | 83 scénarios, création légitime et retrait de membre compris
membership-calendar | Calendriers | 0 | 16.2 | Récurrence, dates anciennes, DST, concurrence, dossier étranger et retrait
devices | Appareils SDK | 0 | 9.4 | Validation, suppression, rattrapage hors ligne, retrait et changement de compte
valid-link | Trois profils | 0 | 12.6 | Programme et séance légitimes partagés, difficulté confirmée
two-tabs | Coach navigateur | 0 | 21.7 | Deux onglets, réponse tardive, changement de compte et rôle
player | Client mobile navigateur | 0 | 18.5 | Dashboard, Player, feedback, annulation, retour, deux onglets, hors ligne
smoke | Smoke | 0 | 1.9 | 53 vérifications critiques
build | Build | 0 | 1.8 | Vite et budgets de bundles réussis
cost-delivered | Coût comparé | 0 | 43.7 | Même fixture et fenêtres que la référence


Ces 19 exécutions retenues contiennent des suites et des scénarios recouvrants. Les contrôles Rules et smoke ne constituent pas un dénominateur indépendant à additionner. Les échecs de référence et de cache décrivent une propriété de sécurité non satisfaite. Le lanceur profile current a également été vérifié depuis la racine et a terminé avec le code 0.

## Tests et fixtures ajoutés ou adaptés


- testClubBoundariesLot7B1.cjs vérifie l’autorité des profils, les champs falsifiés, les propriétaires historiques, les claims et la conservation du parcours autorisé. Le scénario session vérifie trois projections, les identités historiques, le dossier transféré et les mutations protégées.
- testSharedBrowserLot7B1.cjs et sa fixture utilisent de vrais processus Chromium avec profils jetables, le SDK direct et le cache de snapshots BYL. La valeur privée est comparée à la fixture.
- testMessagingLot2B2.cjs vérifie prepare-disable avant la mutation Auth et conserve la caractérisation de l’exposition Auth seule.
- testFirestoreRules.cjs ajoute une appartenance canonique aux fixtures de club et un scénario de retrait. Les assertions historiques de fonctionnalité autorisée sont conservées.
- measureFirebaseLot1.cjs donne un ownerUid au club synthétique pour représenter une propriété vérifiable. La référence et les mesures historiques restent archivées.

## Itérations et limites

Les premiers essais ont révélé trois défauts de l’implémentation en cours, corrigés avant livraison. La lecture SDK des données partagées pouvait encore se fonder sur le club du profil, l’enrichissement historique dépendait trop de l’annuaire courant, et la composition initiale des règles dépassait la limite de 1 000 expressions pour un membre autorisé. Les versions finales refusent le retrait et conservent les accès positifs du banc.

Un premier test de session a terminé ses assertions mais fermé Firestore avant la fin du délai de grâce des écouteurs. Le test attend désormais leur fermeture. Un appel de helper local manquant dans le nouveau scénario Rules a été corrigé. Plusieurs tentatives Chromium ont reçu unavailable ou expiré avant le résultat. Les reprises bornées ne traitent jamais unavailable comme un refus d’autorisation. Les résultats retenus contiennent bien serverDenied=true et la valeur privée attendue.

Les tests hors ligne du cache effectuent une lecture après connexion, réseau Firestore coupé. Une première authentification entièrement hors ligne n’est pas qualifiée. La déconnexion pendant une requête et la révocation de l’affichage sont exercées dans les harnais applicatifs existants. Ils ne garantissent pas l’effacement du stockage brut. Deux profils indépendants et plusieurs identités SDK ont été testés, sans certification d’appareils physiques.

Le prototype mémoire, exécuté uniquement dans une copie, retrouve le programme du premier compte dans l’instance courante et le snapshot nutritionnel après redémarrage. Les tests complets échouent aussi avec ce prototype.

## Registre complet des exécutions enregistrées


Arbre | Identifiant de journal | Code sortie | Secondes
--- | --- | --- | ---
travail | all-projections | 0 | 14.3
travail | auth | 0 | 26.5
travail | authorized | 0 | 14.8
travail | before-auth | 0 | 26.9
travail | before-cache | 1 | 12.2
travail | before-profile | 1 | 9.9
travail | before-session | 1 | 12.0
travail | bounded-rules | 1 | 7.1
travail | build | 0 | 1.8
travail | cache-final | 1 | 18.6
travail | calendar | 0 | 21.9
travail | claims | 0 | 9.1
travail | cost-after | 0 | 48.3
travail | cost-delivered | 0 | 43.7
travail | cost-final | 0 | 45.3
travail | devices | 0 | 9.4
travail | final-auth | 0 | 21.0
travail | final-calendar | 0 | 17.4
travail | final-ownership | 0 | 10.7
travail | final-profile | 0 | 9.2
travail | final-projections | 0 | 12.5
travail | final-session | 0 | 12.5
travail | final-triple | 0 | 12.4
travail | last-rules | 0 | 8.4
travail | legacy-projections | 0 | 15.4
travail | legitimate | 0 | 13.5
travail | links-checked | 1 | 15.5
travail | membership-calendar | 0 | 16.2
travail | membership-profile | 0 | 10.6
travail | membership-rules | 1 | 8.5
travail | mutation-parity | 0 | 15.0
travail | operator | 0 | 21.3
travail | owner-legacy | 0 | 10.2
travail | player | 0 | 18.5
travail | profile | 1 | 12.9
travail | projection-final | 0 | 12.6
travail | red-profile | 1 | 8.9
travail | red-session | 1 | 11.6
travail | restart-cache | 1 | 17.6
travail | rules-delivered | 0 | 8.9
travail | rules-final | 0 | 8.9
travail | rules | 0 | 12.0
travail | sdk-final | 0 | 10.4
travail | session | 1 | 12.8
travail | shared-tabs | 1 | 55.2
travail | smoke | 0 | 1.9
travail | storage-current | 1 | 11.9
travail | storage-result | 1 | 11.4
travail | storage-tabs-final | 1 | 8.7
travail | two-tabs | 0 | 21.7
travail | valid-link | 0 | 12.6
travail | verify-profile | 0 | 9.7
travail | verify-rules | 0 | 8.2
travail | verify-session | 0 | 14.3
travail | verify-triple | 0 | 16.9
référence | cost-before | 0 | 48.1
référence | red-operator | 1 | 21.0
référence | reference-cache | 1 | 18.0
référence | storage-before | 1 | 20.6
prototype mémoire | memory-prototype | 0 | 10.9
prototype mémoire | memory-tabs | 1 | 13.2
prototype mémoire | storage-prototype | 0 | 12.3
