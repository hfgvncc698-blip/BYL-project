# Connecter les reseaux sociaux

Objectif : tout preparer et valider dans le dashboard local, puis publier sur Instagram, Facebook et TikTok sans saisir les mots de passe dans le projet.

## Etat actuel

- Le dashboard local gere deja les brouillons, validations et controles.
- Les videos sont encore en WebM pour preview. Pour publication robuste, il faudra exporter en MP4 H.264/AAC.
- Facebook et Instagram peuvent publier via Meta une fois les tokens officiels configures.
- Instagram demande une URL HTTPS publique pour les images/videos; un fichier local `localhost` ne peut pas etre publie directement.
- Les secrets doivent rester dans `ad-samples/social-publisher/.env.social`, jamais dans Git.

## 1. Facebook via Meta

### Pre-requis compte

- Une Page Facebook dont tu es admin.
- Un compte Instagram professionnel relie a cette Page Facebook.
- Un compte Meta for Developers.
- Une app Meta en mode developpement au debut, puis review/live pour publier en production.

### Produits / permissions a preparer

Dans l'app Meta :

- Facebook Login ou Instagram API avec Facebook Login, selon le parcours disponible dans ton app.
- Permissions probables :
  - `pages_show_list`
  - `pages_read_engagement`
  - `pages_manage_posts`
  - `instagram_basic`
  - `instagram_content_publish`

Meta peut demander une App Review avant que ces permissions fonctionnent pour des utilisateurs hors testeurs/admins.

### Valeurs a recuperer

Dans `.env.social` :

```text
META_ACCESS_TOKEN=
META_PAGE_ID=
META_INSTAGRAM_ACTOR_ID=
```

Plus tard, pour un vrai OAuth integre au dashboard :

```text
META_APP_ID=
META_APP_SECRET=
META_CONFIG_ID=
META_REDIRECT_URI=http://127.0.0.1:5182/oauth/meta/callback
```

Le dashboard affiche cette Redirect URI dans la section `Connexions reseaux`.

Avec `Facebook Login for Business`, il faut creer une configuration dans `Facebook Login for Business > Configurations`, puis copier son `Configuration ID` dans `META_CONFIG_ID`. Le flux OAuth utilise `config_id`, pas `scope`.

### Flux technique

Facebook Page :

1. Obtenir un Page Access Token.
2. Publier la video sur la Page.
3. Enregistrer l'ID du post dans la campagne locale.

## 2. Instagram direct

Meta expose maintenant un flux Instagram Login separe. Le dashboard supporte donc une connexion `Instagram direct` en plus de Facebook.

Redirect URI :

```text
https://localhost:5443/oauth/instagram/callback
```

Valeurs a renseigner dans le dashboard :

```text
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_REDIRECT_URI=https://localhost:5443/oauth/instagram/callback
```

Scopes demandes :

```text
instagram_business_basic
instagram_business_content_publish
```

Instagram Reels :

1. Obtenir le token via Meta / Facebook Login for Business.
2. Heberger le MP4 sur une URL HTTPS publique.
3. Renseigner cette URL dans `platformCopy.instagram.mediaUrl`, `variant.instagramMediaUrl` ou `INSTAGRAM_FALLBACK_MEDIA_URL`.
4. Creer un container media Reel.
5. Attendre que le container soit pret.
6. Publier le container.

## 3. TikTok

### Pre-requis compte

- Un compte TikTok for Developers.
- Une app TikTok.
- Produit Content Posting API active.
- Direct Post active dans l'app.
- Scope `video.publish` approuve et autorise par le compte TikTok cible.

Important : TikTok limite les clients non audites. Les contenus postes par une app non auditee peuvent rester en prive jusqu'a validation de l'app.

### Valeurs a recuperer

Dans `.env.social` :

```text
TIKTOK_ACCESS_TOKEN=
TIKTOK_OPEN_ID=
```

Plus tard, pour OAuth integre :

```text
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=https://boostyourlife.coach/oauth/tiktok/callback
TIKTOK_OAUTH_SCOPES=user.info.basic,video.publish
TIKTOK_PRIVACY_LEVEL=SELF_ONLY
```

Le dashboard affiche cette Redirect URI dans la section `Connexions reseaux`. Elle doit etre ajoutee dans l'app TikTok avant de cliquer sur `Connecter TikTok`.

### Flux technique

TikTok Direct Post :

1. Interroger `creator_info/query` pour connaitre les options du compte.
2. Creer une session `post/publish/video/init` avec `FILE_UPLOAD`.
3. Envoyer le MP4 local sur l'URL d'upload retournee.
4. Suivre le statut via `post/publish/status/fetch`.

`TIKTOK_PRIVACY_LEVEL=SELF_ONLY` garde les premiers tests en prive. Pour publier publiquement, il faudra que TikTok retourne une option de confidentialite publique et que l'app ait les droits de publication requis.

1. Interroger `creator_info/query` pour connaitre les options de confidentialite.
2. Initialiser la publication video avec `video.publish`.
3. Envoyer le fichier video a l'`upload_url` TikTok.
4. Verifier le statut de publication.

## 3. OpenAI TTS premium

Pour remplacer les voix Apple par des voix plus naturelles :

```text
OPENAI_API_KEY=
OPENAI_TTS_MODEL=gpt-4o-mini-tts
```

Commande :

```bash
BYL_VOICE_PROVIDER=openai node ad-samples/byl-video-ugc-variants/generate-voiceovers.mjs
```

Puis reexporter les videos depuis le generateur.

## Ordre recommande

1. Ajouter `OPENAI_API_KEY` dans `.env.social`.
2. Generer les voix IA premium et reexporter les 5 videos.
3. Creer l'app Meta et obtenir un token de test pour ta Page + Instagram.
4. Creer l'app TikTok et obtenir un token de test.
5. Valider un post dans le dashboard.
6. Tester une publication en mode controle.
7. Brancher les appels API reels/post/video reels.
