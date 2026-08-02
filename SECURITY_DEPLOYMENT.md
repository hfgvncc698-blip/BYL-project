# Déploiement sécurité BoostYourLife

Les protections de ce lot ne sont actives en production qu'après le déploiement coordonné du front, de l'API, des Cloud Functions et des règles Firebase.

## 1. Prévol local

```bash
npm run lint
npm run build
npm run test:smoke
npm audit
(cd backend && npm audit)
(cd functions && npm audit)
npm run audit:security-state
```

Réauthentifier ensuite la CLI Firebase, puis compiler les règles sans les publier :

```bash
firebase login --reauth
firebase deploy --only firestore:rules,storage --dry-run
```

## 2. App Check

1. Créer une clé de site reCAPTCHA Enterprise pour `boostyourlife.coach`.
2. Enregistrer l'application web dans Firebase > App Check.
3. Ajouter `VITE_FIREBASE_APPCHECK_SITE_KEY` à l'environnement de build du front.
4. Déployer le front et observer les métriques App Check.
5. Quand les requêtes légitimes sont bien attestées, activer progressivement l'enforcement pour Authentication, Firestore, Storage et les fonctions appelables.
6. Pour le développement local uniquement, utiliser `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN`; ne jamais placer ce jeton en production ni dans Git.

## 3. Authentication / Identity Platform

- Activer la protection contre l'énumération des emails.
- Appliquer une politique de mot de passe en mode `Require` (12 caractères minimum recommandés, minuscules, majuscules, chiffre et caractère spécial).
- Activer TOTP MFA, puis enrôler le compte administrateur avant d'imposer la MFA aux routes d'administration.
- Vérifier et réduire la liste des domaines autorisés Firebase Authentication.

## 4. Nginx

Installer `nginx/boostyourlife-security-headers.conf` sur le serveur et l'inclure dans le bloc HTTPS principal :

```nginx
include /etc/nginx/snippets/boostyourlife-security-headers.conf;
```

Valider avant rechargement :

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I https://boostyourlife.coach/
```

La réponse finale doit contenir au minimum `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` et `Permissions-Policy`.

## 5. Déploiement coordonné

Déployer les règles Firestore et Storage, les fonctions, puis l'API et le front dans la même fenêtre de maintenance. Vérifier ensuite les parcours inscription, connexion, administration, paiement Stripe, upload de logo, création client, programme et nutrition.

## 6. Éléments à traiter manuellement

- Examiner les six groupes d'anciens documents `users` partageant un email avec un seul compte Firebase Auth réel. Ne pas les supprimer sans vérifier leurs liens clients/programmes.
- Examiner le document orphelin sans rôle détecté par `npm run audit:security-state`.
- Faire tourner les clés serveur après le déploiement : compte de service Firebase, Stripe, SMTP, Resend/SendGrid et `ADMIN_SEARCH_KEY`. Mettre à jour le serveur/gestionnaire de secrets avant de révoquer l'ancienne clé.
- Sauvegarder Firestore avant toute migration ou suppression de document.
