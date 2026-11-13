# Lot 8A — opérations Firebase et portée économique

## Sources de mesure

Le banc exécute la vraie application, l’admission Auth/Firestore et les routes API listées dans `measureColdLot8A.cjs`. Les seules configurations Firebase substituées ciblent `demo-byl-performance` sur loopback. Aucun compte ou projet réel n’est utilisé.

Les résultats JSON séparent :

- `api` : toutes les requêtes `/api/` du banc, requêtes achevées, statuts, somme des durées serveur et octets des réponses achevées. La somme de durées concurrentes n’est pas une durée murale.
- `http` : métriques Firestore par route instrumentée, opérations SDK, documents retournés et lectures estimées. Ce sous-ensemble ne doit pas être confondu avec tous les appels API.
- `listeners` : snapshots Admin SDK d’inbox et de contrôles d’autorisation ; documents retournés et changements, hors compteur HTTP.
- `allBrowser` : compteur ajouté aux frontières du SDK dans la copie de mesure ; getDoc/getDocs, variantes serveur/cache et onSnapshot. Les écritures unitaires, batch et transactions sont comptées après confirmation. Les lectures internes d’une transaction ne sont pas toutes détaillées par ce wrapper.
- `backend.writes` : écritures confirmées au commit du SDK Admin, remises à zéro après création des fixtures. Les écritures de seed sont exclues.
- `backend.reads/documents/estimated` : sonde générique partielle, qui ne couvre pas getAll et les transactions ; elle n’est pas additionnée aux métriques de route pour éviter le double comptage.

Les estimations navigateur comptent les documents serveur retournés et les changements d’écouteur, avec un minimum documentaire conservateur. Les événements de métadonnées peuvent rendre cette estimation supérieure aux seules lectures facturables. Les snapshots complets retournés ne sont pas équivalents aux documents facturés lors d’un changement. Les lignes de comparaison indiquent des **estimations observées**, pas une facture ni un décompte exhaustif certifié.

Aucune facturation réelle n’est mesurée. Index, bande passante facturée, coûts Auth, fonctions de production et infrastructure distante ne sont pas extrapolés depuis les émulateurs.

## Effet attendu et vérifié des corrections

La vue générale Clients ne demande plus les résumés des 500 dossiers dès l’ouverture. Elle enrichit les 25 lignes affichées par sélection ; les états successifs du répertoire à froid conduisent à 30 ou 31 dossiers enrichis dans les passages observés. Le backend existant reste responsable des contrôles actuels et des versions ; son cache de résumés n’est pas contourné. À froid, seules les vues effectivement consultées doivent être créées. Visiter ensuite toutes les pages peut retrouver le coût total antérieur : le gain dépend du parcours, pas d’une suppression des fonctions métier.

Le retour à une page déjà enrichie utilise la source mémoire autorisée ; les versions/invalidation existantes restent nécessaires. Les filtres de progression, activité et nutrition conservent les lectures exhaustives requises par leur résultat exact. La recherche nominative porte toujours sur toutes les racines autorisées, puis enrichit les résultats visibles.

Les navigations mobiles et les notifications récapitulatives ne créent aucune nouvelle requête Firebase. L’affichage progressif des conversations ne change pas le volume de l’inbox chargée. Aucun gain de lectures de messagerie n’est attribué à une simple réduction de composants montés.

## Garanties conservées

Pas de nouvelle collection, index, fonction, service externe ou migration. Aucun changement de règles ni assouplissement des vérifications. Les nouveaux caches privés restent en mémoire ; la pagination de rendu et le cache ne confèrent pas de droit. Les opérations engageantes gardent leurs validations côté serveur.

P0-3 et P0-4 restent ouverts. La baisse d’un nombre d’opérations dans une fixture ne vaut ni autorisation de publication ni preuve de confidentialité des anciennes copies persistantes.

Les valeurs avant/après, par page et volume, sont dans `BYL_LOT8A_AVANT_APRES.md` ; les données détaillées et les statuts des API restent dans `audits/lot8a/`.
