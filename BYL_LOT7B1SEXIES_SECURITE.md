# Lot 7B.1 SEXIES — sécurité du pilote

## Isolation

Pilote non importé par BYL, sans déploiement ni modification des règles ou parcours applicatifs. Le runner extrait `HEAD` dans un répertoire temporaire sans `.env`, ajoute seulement les fichiers du pilote et utilise `demo-byl-performance` avec Auth/Firestore sur 127.0.0.1. Chrome utilise un `--user-data-dir` jetable distinct des profils personnels. Les fixtures et bases à supprimer sont créées par le test. Le SDK de persistance utilise un autre projet demo, `demo-byl-sexies`, réseau documentaire désactivé et URL Google/Firebase bloquées par CDP.

Les identifiants et mots de passe de comptes synthétiques sont générés dans l’émulateur. Le petit endpoint `/login` sert uniquement à connecter ces comptes de fixture par l’API Auth de l’émulateur ; il n’est pas une route de connexion déployable. Le navigateur garde le jeton en mémoire. Chaque endpoint de récupération vérifie `verifyIdToken(..., true)` avant les lectures Firestore. Aucun jeton ou contenu de brouillon n’est inscrit dans les mesures.

## Provenance et données éligibles

Éligibles au pilote : uniquement les brouillons fabriqués pour lesquels le serveur possède déjà un manifeste protégé liant propriétaire, périmètre et empreinte du contenu. Le navigateur n’est pas autorisé à créer ou modifier ce manifeste. Un UID dans la clé, un ancien profil `user` ou une déclaration du navigateur ne suffisent pas.

Les anciens formats réels BYL ne disposent généralement pas de ce manifeste. Le pilote **ne crée pas rétroactivement de preuve**. Données ambiguës, mutations internes Firestore non converties, contenu révoqué ou Club ne correspondant plus au périmètre : refus de récupération. Les copies serveur reconstructibles doivent être relues sous droits actuels, non réimportées comme des brouillons.

## Parcours vérifié

1. Connexion à Firebase Auth émulé.
2. Vérification serveur des droits courants `pilotUsers`, de `pilotProvenance` et de la version du canonique `pilotCanonical`.
3. Proposition générique affichée sans lecture de contenu privé ni publication ; confirmation explicite par bouton.
4. Lecture de la seule entrée autorisée et vérification de l’empreinte.
5. Transaction serveur : relecture des droits, provenance, version canonique, brouillon et reçu. Refus de conflit ou révocation.
6. Création atomique d’un `pilotDrafts` non publié et d’un `pilotReceipts` ; une reprise réutilise le reçu existant.
7. Relecture du contenu serveur et vérification de son empreinte contre le reçu. L’original reste intact si l’accusé manque.

Les contrôles de version portent sur un vrai document canonique de l’émulateur. Les droits du pilote sont volontairement restreints aux fixtures ; ce n’est pas une nouvelle implémentation de tous les droits coach/client/club de BYL. Aucune fonction de publication n’est disponible dans le pilote.

## Isolation A/B et réponses tardives

Une génération d’identité change à chaque connexion ; les autorisations tardives de l’ancienne session sont rejetées avant lecture locale. La proposition affichée est vidée à la transition. B ne reçoit ni brouillon ni reçu A par l’API. Les tests incluent rôle de propriétaire incorrect, droits retirés dans Firestore, compte désactivé dans Firebase Auth et changement de Club.

Le lecteur brut `q.get` est un **instrument de test privilégié**, pas un lecteur applicatif sécurisé. Il reproduit l’exposition P0-4 des anciennes bases avant purge, y compris après fermeture/réouverture sous B. Cette exposition reste distincte de l’API de récupération, qui refuse A sous B. La présence d’un garde applicatif ne protège pas à elle seule un ancien IndexedDB en clair.

## Nettoyage et statut final

BroadcastChannel permet aux onglets actuels de fermer leur connexion et de vider leur propre sessionStorage synthétique. Les accusés ne sont jamais interprétés comme une preuve globale. Un ancien onglet non coopérant bloque la suppression ou peut recréer la base après celle-ci.

Le nettoyage local termine à `local-checked-global-unproven`, jamais « appareil nettoyé ». `/cleanup-final` refuse tant que le **harness externe** n’a pas fermé entièrement Chrome, relancé le profil, vérifié l’absence des bases/clé/cache/worker ciblés et compté l’unique onglet contrôlé. Alors seulement un reçu Firestore `verified-disposable-profile-only` est écrit et relu. Le navigateur ne peut pas soumettre un booléen pour s’octroyer cette attestation.

Cette preuve externe est propre à un profil jetable dont le test contrôle le cycle de vie. Elle ne fournit pas une capacité web générale d’énumérer ou neutraliser tous les anciens contextes sur les appareils des utilisateurs. Une future intégration doit soit disposer d’une preuve opérationnelle équivalente, soit rester bloquée.

## Limites

P0-4 reste ouvert sur le parc réel. Aucun décodeur des mutations internes Firestore, aucune récupération générale des brouillons sans provenance, aucun effacement forensique des blocs disque, exports ou sauvegardes. Les Service Workers et Cache Storage testés sont synthétiques ; les versions historiques déployées ne sont pas inventoriées sur des appareils réels. Les essais de révocation Auth sur API ne résolvent pas P0-3 et ses limites externes de révocation Firestore.

Les corrections P0-1/P0-2 et QUATER sont préservées par absence de changement aux fichiers applicatifs et aux règles ; elles ne sont pas réputées intégralement requalifiées par ce pilote. Aucun P1/P2/P3 traité.
