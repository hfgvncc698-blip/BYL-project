# Lot 7B.1 QUINQUIES — récupération conditionnelle

## Décision fondamentale

**La récupération générale des anciens brouillons ne peut pas être garantie.** Les formats historiques n’offrent pas de preuve indépendante du propriétaire. Refuser l’import est obligatoire dans ce cas ; l’accès actuel à un programme ne suffit pas à attribuer un texte privé trouvé sur un navigateur partagé.

Le prototype de qualification utilise un manifeste de provenance **synthétique fourni par un serveur de test** : propriétaire, périmètre et empreinte du contenu. Ce manifeste n’existe pas rétroactivement pour les anciens brouillons BYL. Le test positif démontre une récupération sous ces préconditions, pas une capacité actuellement disponible sur tous les anciens caches. Le header `X-Synthetic-Account` du banc n’est pas une authentification de production.

## Protocole proposé avant tout lecteur de contenu hérité

1. Quarantaine de l’origine : pas d’hydratation privée, pas de listing de textes, noms ou dossiers de l’ancien compte. Le simple message « vérification nécessaire » ne révèle aucun auteur.
2. Connexion Firebase habituelle et, si nécessaire, réauthentification avec la même méthode, sans second mot de passe applicatif. Vérification serveur actuelle de la session, révocation, rôle et périmètre.
3. Identifier une provenance indépendante liée au contenu et au propriétaire. Le vieux profil local, un UID dans une clé, la forme du chemin ou la déclaration du compte B ne sont pas des preuves. En leur absence : arrêter avant lecture. Une procédure d’assistance future nécessiterait une décision de sécurité distincte ; elle n’est pas implicitement autorisée à explorer le disque.
4. Vérifier les droits actuels sur la cible et la correspondance du périmètre. Hors ligne, compte révoqué ou Club changé : pas de récupération. La création d’un nouveau brouillon ne doit pas servir à contourner un droit retiré sur l’ancien contenu.
5. Demander explicitement la récupération. Lecture bornée de la seule entrée approuvée, dans le contexte A ; vérifier empreinte et format. Ne pas parcourir toutes les entrées de la base partagée pour afficher celles qui « semblent » appartenir à A.
6. Comparer les versions et préserver la version serveur actuelle. Si version de base absente, ne pas écraser le canonique ni un brouillon courant : état « comparaison nécessaire », éventuelle copie séparée seulement si provenance déjà prouvée et décision explicite. Le modèle testé refuse un conflit de version ; aucune fusion automatique.
7. Créer uniquement un brouillon serveur, dans une transaction qui recontrôle les droits et versions au moment de l’écriture. Idempotence par opération liée au propriétaire/cible/empreinte ; ne pas confondre contenu identique et autorisation.
8. Relire un reçu serveur confirmant la version et l’empreinte. Une réponse perdue doit laisser l’original intact ; retenter sans dupliquer. Ne marquer la copie locale « récupérée » qu’après vérification.
9. La publication métier reste une action séparée. Aucun ancien message envoyé, séance validée, paiement, réservation ou crédit engagé par cette procédure.

## Cas non récupérables automatiquement

- Brouillon sans provenance ou propriétaire confirmé : conserver en quarantaine, refuser lecture/import. Aucune attribution au compte courant.
- Droit révoqué : refus, même si l’auteur est connu. La donnée reste à traiter dans une procédure administrative autorisée, pas via le navigateur de B.
- Mutation Firestore en attente : ne pas redémarrer l’ancien SDK en ligne. `terminate()` ne l’annule pas, et le prochain démarrage persistant peut la renvoyer. `waitForPendingWrites()` n’est pas un exporteur de brouillons et n’établit ni intention actuelle ni absence de nouvelles écritures.
- Champ de formulaire fragmentaire ou incompatible : ne pas fabriquer un programme complet ; conserver l’original jusqu’à une disposition explicitement validée.
- Déjà synchronisé : confirmation serveur sous droits courants ; pas de nouvelle publication. Une empreinte de contenu sans provenance n’autorise pas une lecture préalable du disque pour la calculer.

## Interface coach proposée, non intégrée

| Moment | Affichage et action |
|---|---|
| Premier lancement | « Vérification des anciennes données de cet appareil. Vos données actuelles seront chargées après connexion. » Ne pas annoncer « appareil nettoyé ». |
| Ancien brouillon prouvé et autorisé | « Un brouillon peut être récupéré sans publier votre programme. » Bouton Reprendre ; comparaison ensuite sous l’identité autorisée. |
| Propriétaire non établi / récupération impossible | « Certaines anciennes données ne peuvent pas être récupérées automatiquement. Rien n’a été supprimé. » Pas d’extrait du contenu ni d’identité de l’ancien compte. |
| Conflit | « Le programme a changé. Votre brouillon n’a pas été publié. » Garder original et version serveur ; aucune fusion silencieuse. |
| Réseau coupé / droits retirés | « Vérification impossible pour le moment » ou accès refusé. Aucun aperçu restauré depuis le cache. |
| Fermeture nécessaire | Avertir avant fermeture que les saisies uniques d’autres onglets pourraient être perdues ; récupérer ce qui est prouvable avant toute fermeture imposée. |
| Après réouverture | Reprendre les vérifications d’état, demander la connexion, proposer les brouillons confirmés côté serveur. Ne pas faire confiance au journal local seul. |

Aucun écran produit, endpoint BYL ou règle n’a été changé dans ce lot. La résolution des données uniques non attribuables reste un prérequis à toute purge réelle ; l’utilisateur doit valider en connaissance de cause un éventuel abandon, sans que cette validation donne au compte suivant le droit de lire ces données.
