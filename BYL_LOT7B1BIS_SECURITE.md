# Lot 7B.1 BIS — sécurité

## Modèle de menace

Un utilisateur B reprend le même profil navigateur après A. Il peut appeler les API locales, inspecter IndexedDB, localStorage et sessionStorage, et connaître les UID et chemins. Une clé de stockage contenant un UID ne protège pas un contenu. Les règles Firestore contrôlent les accès serveur et ne contrôlent pas `getDocFromCache` ni l’accès brut au disque.

La reproduction actuelle conserve les protections serveur tout en exposant les copies locales. `AuthContext` hydrate aussi un profil local `user`, partagé par origine. Les caches de pages peuvent restaurer une ancienne réponse asynchrone sans génération d’identité globale. Ces mécanismes doivent rejoindre la même barrière avant de pouvoir conclure.

## Limites officielles vérifiées

Firebase indique que la persistance web n’est pas effacée automatiquement entre sessions. Sa référence précise que `clearIndexedDbPersistence` nécessite une instance arrêtée et ne constitue pas un effacement sécurisé des traces disque. Une autre connexion peut empêcher le nettoyage. Sources consultées le 10 novembre 2026 [persistance Firestore](https://firebase.google.com/docs/firestore/manage-data/enable-offline) et [référence API](https://firebase.google.com/docs/reference/js/firestore).

La séparation d’une clé de chiffrement et du stockage chiffré est essentielle. Le prototype utilise WebCrypto AES-GCM, avec clé externe aléatoire et non un UID, un token Firebase ou une clé livrée avec le JavaScript. Ce choix suit les principes de [stockage cryptographique OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html). Il ne constitue pas une certification cryptographique.

## Garanties du prototype uniquement

Secret aléatoire de 32 octets fourni par l’appelant, import AES-GCM non extractible, IV aléatoire de 12 octets à chaque écriture, tag de 128 bits. Version, identité, rôle, club, révision et identifiant de l’enregistrement sont authentifiés par les données associées. La clé ne figure pas dans l’enveloppe sérialisée. La qualification rejette substitution, altération, mauvais secret et mauvais périmètre.

Chaque verrouillage invalide une génération. Dérivation/import, chiffrement, déchiffrement et livraison vérifient encore la génération après attente. Un résultat commencé par A ne peut être livré après transition vers B dans ce prototype. Un changement A → B → A invalide également les anciens tickets.

Le prototype ne vérifie aucune identité Firebase et ne persiste rien lui-même. Un libellé de périmètre fourni par l’appelant n’est pas une autorisation. Celui qui possède le secret de A et son périmètre peut déchiffrer A. Les contrôles d’admission, le coffre de clés, les transactions IndexedDB et les onglets ne sont pas intégrés.

## Barrière proposée pour BYL

1. Fermer les rendus privés, incrémenter la génération, annuler les requêtes et abonnements, verrouiller les clés avant une transition.
2. Arrêter et remplacer l’instance Firestore mémoire et les modules qui retiennent des références. Un cache SDK mémoire vivant peut conserver A après connexion de B.
3. Purger les valeurs et promesses de tous les caches mémoire privés, pas uniquement celles des pages actuellement montées. Refuser toutes les livraisons tardives, y compris compression, URL Storage, restauration IndexedDB et écriture différée.
4. Authentifier en ligne le nouveau périmètre ou déverrouiller explicitement une session locale hors ligne déjà provisionnée. Ne jamais présenter ce mode local comme une vérification serveur récente.
5. Ne publier des données qu’avec une génération, une identité et un périmètre concordants. Renouveler cette barrière après changement de rôle, club, dossier lié ou révocation connue.
6. Coordonner les onglets par messages sans données privées ni clé. Une notification de changement de compte ne doit jamais déverrouiller un autre onglet. Les anciens onglets non coopératifs bloquent la migration.

## Limites restant bloquantes

- BYL utilise toujours ses caches actuels non chiffrés. P0-4 demeure reproductible.
- Hors ligne, une révocation distante est inconnue. L’accès aux copies préalablement autorisées peut continuer jusqu’à une politique de verrouillage validée. L’horloge locale et une date d’expiration modifiable ne garantissent pas une révocation face à un attaquant local.
- Le chiffrement au repos ne protège pas une session déjà déverrouillée, un script malveillant exécuté dans l’origine, une extension hostile, un compte OS compromis, un dump mémoire ou une copie déjà exportée.
- Un objet `CryptoKey` non extractible persisté dans la même origine pourrait être réutilisé pour déchiffrer. Il ne faut pas le stocker à côté du coffre comme substitut à un secret externe.
- Le ramasse-miettes JavaScript et la mémoire du navigateur ne permettent pas de promettre l’effacement physique des chaînes déchiffrées.
- Les UID, tailles et dates d’activité sont aussi des métadonnées. L’intégration devrait utiliser des identifiants de coffre opaques et chiffrer le catalogue privé.
- La récupération du secret, le provisionnement multi-appareils, le verrouillage inter-onglets, les droits hors ligne et la file d’écritures doivent être qualifiés avant activation.
