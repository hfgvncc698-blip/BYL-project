# Lot 7B.1 OCTIES — sécurité des stockages

## Résultat et portée

P0-4 reste ouvert. Isolation par l’application actuelle et absence de nouvelles copies métier dans les stockages contrôlés ne signifient pas effacement des anciennes copies. Les tests n’autorisent aucune purge réelle.

L’inventaire de références source est conservé dans `audits/lot7b1octies/storage-references.txt`. Il complète les inventaires BIS/QUINQUIES et les mécanismes QUATER/SEPTIES ; ce n’est pas un catalogue exhaustif des anciens navigateurs déployés.

| Stockage / domaine | Écriture et lecture actuelles | Vérification / garantie | Limite |
|---|---|---|---|
| Firestore métier : programmes, historique, Club, progression | `memoryLocalCache` dans firebaseConfig | SDK courant isolé après A/B et redémarrage ; nouveaux marqueurs Builder absents des anciennes bases | Les bases héritées et mutations non synchronisées existent encore |
| Programmes / snapshots de pages | pageDataCache et privateStorage en mémoire ; dashboardSnapshotCache ne lit plus les snapshots persistants | Sentinelles en mémoire, lecteurs hérités en quarantaine | Pas de mesure de tous les écrans de programmes |
| Nutrition | mêmes adaptateurs mémoire ; ancien snapshot IDB non lu | Fuite brute initiale reproduite ; absence de nutrition après nettoyage synthétique autorisé | Données brutes lisibles avant nettoyage |
| Messagerie | feed/cache mémoire et effacement de génération | Inspection source + adaptateur commun | Pas de nouvelle qualification exhaustive des médias/messages réels |
| Géolocalisation | coordonnées via localSessionStorage mémoire | Inspection useGeolocation ; tests du stockage partagé | Consentement de géolocalisation reste une préférence native |
| SessionPlayer / reprise | sessionResume et useSessionDraft via adaptateurs mémoire | Inspection source + sentinelles de domaine | Travail temporaire perdu à fermeture s’il n’est pas synchronisé ; pas de scénario complet de lecture vidéo |
| Brouillons ProgramBuilder | serveur ; travail temporaire dans l’onglet | Autosauvegarde, restauration, conflits, publication, offline et IDB testés | Pas de reprise du travail uniquement RAM après fermeture |
| LocalStorage / SessionStorage privés | Maps ; effacement à transition d’identité | Anciennes valeurs jamais lues par l’adaptateur ; API tardive rejetée | Les anciennes valeurs natives restent présentes |
| Préférences | langue, thème, unités, consentements, sons/haptique | Liste blanche ; plan visant une préférence refusé | Ce n’est pas une preuve que toute clé tierce est publique |
| Journal de migration | protocole, état, étapes techniques bornées | Aucun contenu privé / UID ajouté | Ne constitue ni preuve de fermeture des onglets ni autorisation |
| Firebase Authentication | persistance gérée par Firebase Auth (`getAuth`) | Distincte du cache Firestore métier | Des identifiants de session sensibles peuvent rester persistants ; fermeture du navigateur ≠ déconnexion. Pas de garantie contre inspection locale des credentials |
| HTTP authentifié via apiFetch | ajout forcé de `cache: no-store` après les options appelant | Test réel du wrapper : même force-cache est neutralisé ; ticket tardif rejeté | N’efface pas les anciennes réponses ; ne couvre pas les fetch directs ni un ancien worker |
| Brouillons / migration API | réponses private, no-store existantes | Routes réelles exercées | Ni proxy ni CDN de production testés |
| Médias et ressources publiques | URL directe Firebase Storage et ressources statiques | Inspection des chemins ExerciseCard / SessionPlayer | En-têtes des objets distants non interrogés : confidentialité du cache des médias privés NON démontrée |
| Cache Storage / Service Worker | aucun enregistrement applicatif actuel recensé ; détection migration | Cache inconnu et worker synthétique bloquent la suppression | Anciennes versions et workers non coopérants restent possibles |

## Garanties conservées

Admission serveur, contrôles de droits, rôle/Club, marqueur de révocation, preuve de provenance serveur, empreinte/version, confirmation et reçu idempotent restent inchangés. Les tests refusent la falsification de provenance SDK, les cibles interdites, les preuves révoquées et les imports ambigus. Une clé UID n’est pas une preuve.

Aucun changement des règles Firestore, des permissions métier ou des prix ; P0-1/P0-2 préservés. Les limitations Auth externe P0-3 des lots antérieurs restent applicables. Pas de traitement P1/P2/P3.

## Conditions supplémentaires

Avant publication : qualifier les fetch authentifiés directs, les en-têtes des médias privés, les caches du proxy/CDN, les sessions Auth sur appareils partagés et le catalogue réel des anciennes versions. La présente branche ne peut pas être déclarée exempte de toute donnée privée persistante en clair à partir du seul passage des tests métier.
