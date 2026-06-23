# Social Publisher

Ce dossier prepare la validation et l'envoi de posts organiques vers Instagram, Facebook et TikTok.

Par securite, tout fonctionne d'abord en `dry-run`. Le tableau local permet de regarder les videos, valider les posts, verifier les captions/hashtags et controler les connexions avant toute publication reelle.

## Interface locale

```bash
node ad-samples/social-publisher/src/dashboard-server.mjs
```

Puis ouvrir :

```text
http://127.0.0.1:5182
```

L'interface sert a :

- regarder les 5 variantes video ;
- passer un post en `draft`, `approved`, `rejected` ou `published` ;
- choisir les reseaux cibles ;
- lancer un controle de publication ;
- verifier si Meta et TikTok sont connectes.

Guide de connexion detaille : `CONNECT_SOCIALS.md`.

Calendrier editorial recommande : `CONTENT_CALENDAR.md`.

Socle agent marketing IA : `marketing-agent/README.md`.

## Workflow recommande

1. Generer les videos dans `ad-samples/byl-video-ugc-variants/output/`.
2. Ouvrir l'interface locale.
3. Valider ou refuser chaque variante.
4. Lancer un controle sur les reseaux cibles.
5. Configurer les tokens API dans `.env.social`.
6. Activer la publication reelle quand les connecteurs sont prets.

## Dry-run

```bash
node ad-samples/social-publisher/src/publish.mjs --network all
```

Une variante seulement :

```bash
node ad-samples/social-publisher/src/publish.mjs --variant 01-evening-reply --network instagram,facebook
```

## Variables d'environnement

Copier `.env.social.example` vers `.env.social`, puis remplir les valeurs. `.env.social` est ignore par Git.

Meta / Instagram / Facebook :

```text
META_ACCESS_TOKEN=
META_PAGE_ID=
META_INSTAGRAM_ACTOR_ID=
INSTAGRAM_FALLBACK_MEDIA_URL=
```

`INSTAGRAM_FALLBACK_MEDIA_URL` est optionnel. Les variantes BYL pointent deja vers les MP4 publics servis apres deploy dans `/social-media/*.mp4`. Meta ne peut pas recuperer les MP4 locaux servis par `localhost`; pour des Reels, il faut toujours une URL HTTPS publique dans `platformCopy.instagram.mediaUrl`, `variant.instagramMediaUrl`, `variant.mediaUrls.instagram` ou `INSTAGRAM_FALLBACK_MEDIA_URL`.

TikTok :

```text
TIKTOK_ACCESS_TOKEN=
TIKTOK_OPEN_ID=
TIKTOK_PRIVACY_LEVEL=SELF_ONLY
```

## Publication reelle

```bash
node ad-samples/social-publisher/src/publish.mjs --network instagram,facebook --variant 01-evening-reply --execute
```

```bash
node ad-samples/social-publisher/src/publish.mjs --network tiktok --variant 01-evening-reply --execute
```

## Notes importantes

- Les API Meta et TikTok demandent des comptes professionnels, des permissions et parfois une validation d'application.
- Pour Instagram, le compte doit etre professionnel ou createur et relie a une Page Facebook.
- Pour Instagram, la creation de media utilise une URL publique `image_url` ou `video_url`; l'upload direct d'un fichier local n'est pas accepte par l'API Graph.
- Pour Facebook, la publication organique passe par la Page.
- Pour TikTok, l'API Direct Post peut publier les MP4 locaux par upload fichier. Si l'app n'est pas auditee ou si `video.publish` n'est pas approuve, TikTok peut limiter la publication au prive.
- Facebook et Instagram sont branches pour la publication organique. TikTok reste en preparation tant que l'app n'est pas approuvee en production.
