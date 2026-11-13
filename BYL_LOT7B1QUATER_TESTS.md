# Lot 7B.1 QUATER — tests

## Reproduction

Base vulnérable épinglée : `5bdcd1b`. Le runner extrait une copie temporaire du dépôt, superpose les modifications, emploie un projet `demo-byl-performance` et les émulateurs Auth/Firestore ; aucune variable `.env` de production copiée. Chrome utilise un profil temporaire synthétique. AuthProvider et ProgramBuilder sont les composants réels, avec Chakra et Router ; la configuration Firebase est remplacée par les émulateurs, les routes sans rapport avec le parcours sont simulées. Ce n’est pas un test de tout le routeur BYL en production.

```sh
node scripts/testPrivateSessionLot7B1Quater.mjs
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runIntegratedDraftLot7B1Quater.cjs api
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH node scripts/runIntegratedDraftLot7B1Quater.cjs
node scripts/testConfirmedProgramWrites.mjs
npm run test:smoke
npm run build
git diff --check
```

Le runner nécessite les dépendances déjà installées, Java, Firebase CLI et Chrome sur macOS. Ports locaux Auth 9198, Firestore 8180. Exécuter les deux commandes émulateurs séquentiellement. Les services non émulés du projet demo ne sont pas utilisables. Preuves compactes et empreintes : `audits/lot7b1quater/results.json`, `checks.txt`.

## Résultats

| Suite | Résultat final |
|---|---|
| Chrome, composants réels, fermeture/réouverture avec même profil | 20 contrôles réussis, sortie émulateurs 0 |
| API réelle et règles sur émulateurs | 18 contrôles réussis |
| Session privée / cache / transport retardé | Réussite ; le vrai `apiFetch` rejette une réponse arrivée après A→B, transport et fournisseur de jeton simulés |
| Écritures confirmées des programmes | Réussite |
| Smoke global | 53 contrôles réussis |
| Build Vite et budgets | Réussite, tous budgets respectés |
| Diff whitespace | Réussite |

### Avant/après confidentialité

Avant : le code Firebase/snapshot historique lit sous B le programme synthétique de A et le snapshot nutrition hérité. Après : lecteur de snapshot neutralisé, ancien SDK cache non accessible via l’instance courante, données RAM absentes après fermeture complète. Le profil Chrome est fermé via `Browser.close`, puis rouvert, pour ne pas confondre crash et fermeture effective.

La lecture brute de l’ancienne base retourne encore les deux marqueurs synthétiques. Le contrôle « disk copy remains explicit residual risk » **passe parce qu’il constate cette limite attendue** ; il ne valide pas la confidentialité du disque. P0-4 n’est donc pas clôturé.

### 20 contrôles navigateur

1. Admission par AuthProvider et ouverture du vrai Builder.
2. Autosauvegarde du nouveau brouillon serveur.
3. Modification réseau coupé, mémoire et avertissement beforeunload.
4. Synchronisation après rétablissement du réseau.
5. Conflit entre deux écritures du même brouillon.
6. Programme canonique inchangé par l’autosave.
7. Refus du périmètre d’un autre compte et d’une version canonique obsolète.
8. Ouverture d’un programme existant.
9. Autosave de ses modifications sans publication canonique.
10. Restauration d’un brouillon dont la base canonique a changé : conflit.
11. Publication explicite et suppression du nouveau brouillon serveur.
12. Conservation des données héritées, mais lecteur applicatif en quarantaine.
13. Fermeture complète et réouverture hors ligne : pas de données privées RAM.
14. Réouverture en ligne : brouillon serveur proposé au propriétaire autorisé.
15. Deux onglets : remplacement du contexte et du SDK lors d’A→B.
16. Compte B : pas de programme A dans le SDK/cache applicatif courant.
17. Anciennes données encore récupérables par lecture disque directe.
18. Changement de Club : mémoire retirée et contexte rechargé.
19. Changement de rôle : Builder retiré, API refusée.
20. Profil désactivé : Builder retiré.

### API et sécurité

Contrôles : sauvegarde/lecture, retry idempotent, réutilisation d’un identifiant avec contenu différent, conflit de révision, conflit canonique même sans `_rev`, propriété historique, refus autre compte, taille et chemin invalides, changement de périmètre/rôle, retrait d’appartenance Club, ancien jeton après désactivation Auth refusé par API, accès SDK direct au nouveau stockage de brouillons interdit. Aucun affaiblissement des règles pour faire passer les tests.

## Portée et tests restant à qualifier

Les tests de génération et transport couvrent la réponse tardive ; les tests Chrome couvrent l’interface réelle pendant les transitions. Ils ne simulent pas chaque interleaving possible de logout et requête dans tous les modules. La connexion hors ligne est testée dans la fixture déjà chargée : la disponibilité du shell BYL en démarrage totalement hors ligne n’est pas garantie.

Les familles programmes/nutrition sont reproduites en accès disque ; historiques, Club, messages et autres brouillons sont couverts par les adaptateurs transversaux et smoke, pas par une relecture de chaque parcours métier réel. Pas de matrice complète mobile/Safari/Firefox, anciens Service Workers, réseau production, deux appareils physiques ou migrations réelles. Les caches HTTP et médias ne sont pas certifiés. Ces limites restent des critères de préproduction, et non des tests réputés réussis.

Les assertions de stockage existantes ont été ajustées pour exiger la mémoire/quarantaine et la séparation draft/publication. Les contrôles de concurrence, confirmation canonique et sécurité n’ont pas été supprimés. Aucun changement fonctionnel du tutoriel pour satisfaire un test.
