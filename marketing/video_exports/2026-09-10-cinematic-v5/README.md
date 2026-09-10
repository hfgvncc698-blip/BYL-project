# Montage BYL cinematic V5

Déposer dans ce dossier :

- `clip-01.mp4`
- `clip-02.mp4`
- `clip-03.mp4`
- `voice.mp3`

Chaque clip doit être vertical et durer au moins 8 secondes. Le montage utilise exactement les huit premières secondes de chacun, soit 24 secondes au total.

Lancer avec le Node du runtime Codex :

```bash
/Users/tommarie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node build.mjs
```

Sortie : `byl-cinematic-v5.mp4`.

Le script :

- conserve le ratio vertical et choisit 720 × 1280 ou 1080 × 1920 selon le premier rush ;
- génère les sous-titres, le logo discret et le CTA avec Sharp ;
- affiche la mention discrète « Scènes générées par IA » pour la transparence ;
- assemble et encode avec FFmpeg sans `libass` ;
- ne conserve pas l’audio des rushes et utilise uniquement `voice.mp3` ;
- vérifie la durée et les dimensions du fichier final.
