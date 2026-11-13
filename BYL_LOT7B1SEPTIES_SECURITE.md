# Lot 7B.1 SEPTIES — sécurité

## Protections conservées et ajoutées

Firestore reste en mémoire, les anciennes lectures persistantes restent en quarantaine et le profil doit être confirmé par le serveur. Les tickets de génération de QUATER encadrent la découverte, l’autorisation, la lecture locale autorisée et les réponses API. Un changement de compte retire les propositions et empêche une réponse tardive d’être réutilisée dans la nouvelle session.

Les mêmes contrôles que `programDrafts` sont réutilisés : Firebase Auth non révoqué, marqueur de révocation, profil/accès professionnel, rôle admin vérifié le cas échéant, propriété et appartenance Club actuelles. La preuve est relue dans la transaction d’import. Les changements de périmètre et de version canonique sont refusés. Aucun changement des règles Firestore ; les corrections P0-1/P0-2 ne sont pas affaiblies.

Une preuve contenant seulement un UID n’est pas acceptée : elle doit aussi être serveur, valide, non révoquée, liée à une cible autorisée, une version et une empreinte de contenu. Les clients ne peuvent ni écrire la provenance via les règles ni qualifier un plan via l’API. La confirmation explicite est nécessaire dans l’interface et sur la route d’import.

Le descripteur complet des champs est validé avant la première lecture de leur contenu. Les données extraites ne sont ni affichées ni envoyées si elles ne correspondent pas à l’empreinte. La garantie dépend de la qualification de la preuve par un acteur serveur de confiance ; elle ne protège pas contre du code hostile ayant déjà accès à tout le stockage de la même origine.

## Isolation et confidentialité

La détection ne lit que noms et clés, jamais les anciens documents, noms de programmes ou textes nutritionnels. Ces métadonnées ne sont pas affichées au compte suivant ni enregistrées en télémétrie. Les propositions sont numérotées, sans extrait privé. Aucun deuxième mot de passe.

Les requêtes serveur sont `private, no-store`. Les erreurs techniques ne renvoient pas de contenu privé. Les métriques opt-in utilisent des labels fixes, des nombres et les identifiants de mesure existants ; pas de UID, de contenu client, de secret ou de jeton ajouté.

Un reçu n’est pas une autorisation permanente. S’il n’est plus cohérent avec le brouillon serveur, la récupération ou le plan qui en dépend échoue. Une édition ou publication ultérieure peut donc nécessiter une nouvelle qualification avant suppression de l’original historique.

## Nettoyage : garanties limitées

Aucune suppression automatique. Le nettoyage est désactivé par défaut et, dans cette livraison, limité techniquement au développement loopback sur émulateurs demo, même si un flag est activé par erreur en production. Il exige un plan serveur qualifié et un consentement explicite.

Les clés publiques sont rejetées. Les zones inconnues Cache Storage/Service Workers entraînent un arrêt. Les autres onglets connus entraînent un arrêt ; leur silence n’est pas une preuve de fermeture. Les verrous ne contraignent pas un ancien code qui ne participe pas au protocole.

Une suppression IndexedDB bloquée reste potentiellement active. Le changement de session arrête les nouvelles étapes, mais ne peut annuler rétroactivement une requête de suppression déjà émise. Le service ne prétend pas le contraire. Les droits sont recontrôlés avant la suppression des stockages secondaires.

Après nettoyage, le statut reste incomplet. Une zone recréée ne peut pas être repurgée automatiquement avec le même plan. Le journal serveur bloque aussi cet ancien plan après constat de recontamination ; effacer le journal local ne suffit pas à le réautoriser.

## P0-4 et risques résiduels

**P0-4 reste ouvert.** Dans le test, le compte B ne lit pas les données A via les lecteurs applicatifs/SDK courants, mais la copie Firestore historique reste lisible par inspection brute. Le plan synthétique ne supprimait volontairement que nutrition et certaines clés secondaires ; la base contenant une mutation non synchronisée est restée hors périmètre.

La majorité des anciens brouillons réels n’a pas la provenance exigée : ils restent non récupérables automatiquement. Aucun décodeur/migrateur des mutations internes Firestore n’est livré. Aucune garantie d’effacement forensique, de sauvegardes OS ou de copies exportées.

Les limites P0-3 de désactivation Firebase Auth externe restent applicables. Les vérifications Auth à l’entrée de l’API et les transactions Firestore ne constituent pas une transaction atomique entre ces deux services. Pas de promesse de révocation instantanée universelle hors ligne.

Autres limites : catalogue des anciennes versions incomplet, onglets restaurés/bfcache et anciens workers non exhaustivement qualifiés, pagination de provenance limitée, rétention des preuves/reçus à définir. Le shell complet en développement a également affiché son écran d’erreur lors d’une coupure réseau très précoce ; voir TESTS. Aucun P1/P2/P3 entrepris pour contourner cette limite.
