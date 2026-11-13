# Lot 7B.1 OCTIES — transition des anciennes données

Aucune migration réelle réalisée. Nettoyage toujours désactivé par défaut et limité au développement loopback / émulateurs demo. Les plans de test ne suppriment jamais la base Firestore contenant la mutation synthétique non synchronisée.

## Décisions par catégorie

| Catégorie | Traitement autorisable | Perte / information coach | Condition de nettoyage | Échec et retour arrière |
|---|---|---|---|---|
| Déjà synchronisée et version serveur confirmée | Reconstruire depuis le serveur après contrôle actuel | « Votre sauvegarde est disponible sur BYL. » ; vérifier que la copie locale n’a pas d’édition supplémentaire | Plan exact, absence de travail unique qualifiée, consentement | Conserver la quarantaine si doute ; recharge serveur après suppression |
| Brouillon récupérable avec provenance fiable | Autoriser serveur, empreinte + version + propriétaire + droits, confirmation, import non publié, reçu et relecture | « Un brouillon peut être récupéré. » ; aucun remplacement automatique | Reçu encore cohérent et contenu vérifié, original explicitement qualifié | Refuser conflit/retrait ; original conservé. Après suppression, seule copie serveur confirmée récupérable |
| Brouillon non attribuable | Aucune lecture/import depuis un autre compte ; pas de preuve déduite de l’UID | « Cette sauvegarde ne peut pas être récupérée automatiquement. » Risque réel de travail unique | Pas de suppression dans le parcours livré sans résolution indépendante et autorisée de la disposition | Bloquer, conserver zone ; pas de récupération générale garantie |
| Mutation Firestore potentiellement non synchronisée | Quarantaine ; aucun décodage/import/rejeu automatique des tables internes | « Des modifications peuvent ne pas avoir été enregistrées. Ne nettoyez pas cet appareil. » | Qualification distincte, confirmation serveur et/ou décision autorisée portant sur le travail unique | Ne jamais reconnecter aveuglément l’ancien client pour le vider ; maintenir bloqué |
| Obsolète ou révoquée | Aucun affichage/récupération sous d’anciens droits | « Cette sauvegarde n’est plus accessible avec les droits actuels. » | Décision de conservation/destruction distincte, pas de TTL implicite | Retrait de droits ne justifie pas une attribution au nouvel utilisateur ; récupération seulement après nouvelle autorisation valable |
| Nutrition, historique, messages, Club hérités | Reconstitution depuis sources canoniques si droits confirmés | Données locales uniques à traiter séparément | Qualification par zone, pas par seul nom de base | Ne pas importer une collection entière ; bloquer les formats inconnus |
| Auth, préférences, caches HTTP/médias, SW | Traitements distincts | Ne pas confondre déconnexion, suppression métier et préférences | Hors plan de suppression automatique livré ; audit spécifique | Ne pas effacer les préférences ni les credentials par une purge large improvisée |

## Procédure opérationnelle proposée, non exécutée sur un utilisateur

1. Sur un appareil suspect, conserver la quarantaine ; éviter l’alternance de comptes tant que les copies héritées sont présentes. Un profil navigateur neuf dédié à l’utilisateur permet de travailler sans importer l’ancien profil ; il ne nettoie pas celui-ci.
2. Confirmer l’identité en ligne et les droits actuels. Présenter une récupération seulement sur preuve serveur fiable ; ne pas afficher un extrait privé pour demander « à qui appartient-il ? ».
3. Confirmer et vérifier les brouillons récupérables côté serveur, sans publication. Garder le travail ambigu/non synchronisé en attente d’une décision autorisée. Aucun export brut de l’ensemble du profil.
4. Après qualification de toutes les zones du plan, demander la fermeture des autres onglets/fenêtres BYL, applications installées et anciens contextes. Contrôler les workers connus. Ne pas interpréter une absence de réponse BroadcastChannel comme une fermeture.
5. Si les contextes ne peuvent pas être maîtrisés, suspendre la purge et prévoir une intervention sur un profil jetable/dédié, après fermeture complète du navigateur et vérification des processus par un opérateur autorisé. La page web seule ne peut pas garantir cette étape.
6. Reprendre le journal ; vérifier identité/droits/plan/versions/reçus avant les étapes destructives. Connexion IndexedDB bloquante ou worker inconnu : arrêt, état incomplet. Une suppression IDB déjà émise peut aboutir tardivement ; un timeout ne l’annule pas.
7. Vérifier l’absence réelle des cibles, redémarrer complètement le navigateur, vérifier à nouveau. Toute recréation invalide le plan ; aucun nouveau nettoyage automatique. Conserver un statut local incomplet si l’absence des anciens contextes n’est pas démontrable.
8. Une décision distincte doit précéder tout nettoyage réel. Aucun rollback d’une suppression physique n’est garanti ; seules les données serveur autorisées et vérifiées permettent une reprise.

## Expérience

Première ouverture : détection de métadonnées après admission, pas de lecture automatique du contenu ancien. Travail normal : brouillons serveur automatiques, avertissement si non synchronisés. Interruption : message simple et reprise des vérifications, pas de faux succès. Réouverture : données serveur après confirmation ; pas de restauration depuis les caches privés historiques. Aucun deuxième mot de passe. Aucune suppression silencieuse de travail unique.

L’effacement logique ciblé n’efface pas les sauvegardes OS, exports, caches non recensés ni les restes forensiques. La clôture P0-4 exige une politique réaliste d’appareils partagés et une qualification complémentaire de ces limites.
