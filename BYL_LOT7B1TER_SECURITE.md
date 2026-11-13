# Lot 7B.1 TER — sécurité

## Périmètre démontré

Prototype isolé, programme et brouillon synthétiques. API locale de test, Firebase Auth et Firestore émulateurs uniquement. Aucun routage vers BYL production. L’API du prototype n’est pas une nouvelle route applicative déployable.

Le mode A+D n’instancie pas Firestore dans le navigateur. Il conserve l’authentification du prototype en mémoire et lit/sauvegarde par une API qui vérifie le jeton avec révocation, puis relit les droits et le programme dans une transaction. L’absence de copie métier persistante réduit l’exposition après fermeture. Cela ne prouve pas le nettoyage de l’instance SDK et de toutes les mémoires de l’application BYL existante.

## Trois niveaux distincts

1. **Interface** — les transitions vident programme et brouillon dans le DOM. Une réponse commencée avant déconnexion ne peut les réafficher. Les onglets s’avertissent par un signal sans contenu métier.
2. **API applicative du prototype** — B n’accède pas au programme de A. Le serveur vérifie propriétaire, rôle, club, état actif et révision de périmètre. Les sauvegardes vérifient aussi versions du programme et du brouillon. Un ancien jeton d’un compte désactivé est refusé par la vérification Auth serveur.
3. **Stockage direct** — dans le profil vierge du prototype, aucune donnée programme/brouillon n’est écrite dans localStorage, sessionStorage ou les bases IndexedDB inspectées. Une base technique `firebase-heartbeat-database` est créée par le SDK. Son contenu a été inspecté pour les marqueurs privés synthétiques. Cela ne constitue pas un audit forensique complet des caches HTTP, swap ou fichiers Chrome.

Un cache nutritionnel hérité synthétique ajouté séparément reste lisible par B et après redémarrage. Ce résultat est un **échec de confidentialité connu**, conservé explicitement comme test de caractérisation. Il démontre pourquoi P0-4 n’est pas résolu par ce prototype.

## Barrière d’identité

Une génération invalide les requêtes, réponses et sauvegardes différées. Le changement d’identité annule les demandes et retire immédiatement les objets exposés par l’API locale du prototype. BroadcastChannel transporte uniquement `lock`. Une fermeture de page verrouille aussi le contexte. Les nouveaux onglets commencent sans données privées.

Le verrou retire les objets applicatifs. Il ne révoque pas à lui seul les jetons Firebase déjà émis, et une référence ou un jeton capturé auparavant ne peut pas être effacé rétroactivement. La fin de session SDK de tous les onglets et leurs courses doit être traitée lors de l’intégration.

Le verrou inter-onglets est volontairement conservateur. Une connexion B verrouille A et peut faire perdre un brouillon A non synchronisé. Il faudra une expérience de protection des modifications avant intégration, sans retarder le retrait des données de A. Le prototype ne prétend pas gérer toutes les courses entre onglets suspendus, anciens scripts et bfcache.

## Contrôle des mutations

Le brouillon conserve `programId`, `baseVersion`, `baseDraftRevision`, modifications locales et `operationId`. Une transaction compare les deux versions avant sauvegarde. Une opération répétée retrouve son résultat sans nouvelle écriture. Les opérations engagent seulement le brouillon, jamais la publication du programme.

Le document d’idempotence est écrit avec le brouillon. Le prototype ne définit pas encore sa rétention ni le comportement d’une même clé réutilisée avec un corps différent. Ces validations et limites de taille doivent être durcies avant toute route de production. Une sauvegarde déjà confirmée par le serveur juste avant déconnexion peut subsister légitimement, même si le navigateur ignore ensuite sa réponse.

## Révocation

Rôle, club ou état actif révoqués sont pris en compte à la prochaine lecture/sauvegarde serveur. Le prototype ne fait pas de polling de droits et ne garantit pas le retrait immédiat d’un programme déjà affiché pendant une coupure. La consultation hors ligne conserve les données autorisées lors de l’ouverture. Une révocation distante immédiatement vérifiable exige une connexion.

La désactivation Auth est testée via API, pas comme nouvelle correction des règles Firestore de tous les modules. P0-3 reste hors périmètre. Les Rules existantes sont inchangées.

## PRF et menace locale

Les essais PRF vérifient une sortie répétable pour un credential et le refus du déchiffrement avec un autre credential. Ils ne prouvent pas l’identité humaine, la liaison Firebase, la récupération après perte d’appareil ni une protection matérielle. La vérification utilisateur virtuelle est simulée.

Si B peut satisfaire la vérification de l’appareil pour le credential de A, une vérification dans l’interface BYL ne suffit pas contre un appel direct à WebAuthn et la lecture du ciphertext. Même un coffre chiffré exige donc un moyen de déverrouillage effectivement séparé entre personnes. Ne pas conserver une clé brute ou un `CryptoKey` utilisable dans le même stockage persistant comme repli silencieux.

Aucune protection annoncée contre script malveillant dans une session déverrouillée, navigateur/OS compromis, dumps mémoire ou copies déjà exportées. Aucun cache hérité n’est supprimé. **P0-4 reste ouvert, production bloquée.**
