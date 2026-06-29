# Agent marketing BYL v2

Objectif: transformer le publisher social en boucle marketing complete. Le systeme ne doit plus essayer de remplir le calendrier. Il doit choisir une opportunite, creer un concept publiable, produire un media frais, verifier le meme chemin que le scheduler, publier seulement si tout est vert, puis apprendre.

## Boucle agent

1. Trend Scout
   - Lit `trend-brief.json`.
   - Distingue une veille live verifiee d'un seed local.
   - Donne des mecaniques natives: POV, reponse a objection, story diagnostic, montage anti-IA.

2. Strategy Lead
   - Choisit une cible par slot: coach independant, nutritionniste ou salle/studio.
   - Choisit une douleur, une objection, une preuve et un CTA.
   - Bloque les angles fatigues ou trop proches de la memoire.

3. Concept Builder
   - Produit hooks alternatifs, hook choisi, scenario, script voix off, sous-titres, storyboard et exigences media.
   - Le produit BYL arrive apres la friction, jamais en premier.

4. Content Factory
   - Cree les posts complets par plateforme: caption, hook, CTA, hashtags, story frames, voiceover, carousel, UTM et hypothese d'experience.
   - Oriente tout vers l'objectif: essai gratuit 14 jours.

5. Media Intake
   - Inventorie les assets disponibles du jour.
   - Verifie le minimum de sources visuelles fraiches, de preuves produit ou de vraie video provider.
   - Ecrit `media-intake-state.json`.

6. Creative Director
   - Prefere une vraie video provider quand elle est disponible.
   - Produit par defaut une video BYL autonome quand aucun provider externe n'est configure: motion video, inserts produit mobile, voix off, musique discrete, overlays et CTA.
   - Accepte le mode autonome seulement s'il reste frais, utile, audible, lisible et premium.
   - Refuse avatar IA, fond statique texte, promesse garantie, voix robotique, media recycle et slideshow faible.

7. Real Video Provider
   - Cree une requete video structurée: prompt, storyboard, CTA, duree, format 9:16, objectif essai gratuit.
   - Si `BYL_REAL_VIDEO_PROVIDER_COMMAND` ou `BYL_REAL_VIDEO_PROVIDER_WEBHOOK_URL` est configure, recupere un vrai MP4 provider.
   - Passe ensuite le MP4 dans le finalizer BYL pour voix off, musique discrete et overlays.

8. Autonomous Product Video
   - Mode par defaut sans Pippit/CapCut/Sora.
   - Genere un vrai MP4 vertical avec mouvement, preuves produit BYL, voix, musique et overlays.
   - Ne pretend pas etre une video humaine tournee: il est juge comme video produit autonome.
   - Publication possible si le score qualite, le score conversion, le media frais et le watchdog passent.

9. Preflight Gate
   - Verifie `trend_brief_date`, strategie, media frais date/slot/platform, score conversion, score qualite, dry-run scheduler, connecteur.
   - Decision unique: `publish_only_if_all_green`.

10. Publisher
   - Publie seulement apres preflight.
   - Journalise le resultat et l'attribution.

11. Analyst
   - Compare vues, watch time, clics, essais gratuits, activation J+7, reponses story et erreurs operationnelles.
   - Alimente les memoires pour changer les prochaines decisions.

## Fichiers produits

- `campaigns/<date>-agent-plan.json`: decision strategique complete par slot.
- `campaigns/<date>-content-plan.json`: posts autonomes complets par plateforme.
- `campaigns/<date>-content-plan.md`: version lisible des posts, scripts, storyboards, UTM et hypotheses.
- `campaigns/<date>-daily-marketing-pack.md`: version lisible avec trend brief, decisions, hooks, scripts et controles.
- `campaigns/<date>-studio-plan.json`: variantes studio rattachees aux slots.
- `marketing-agent/autopilot-state.json`: dernier etat lisible de l'agent autonome, blocages et prochaine action.
- `marketing-agent/media-intake-state.json`: inventaire media du jour et readiness media.
- `runs/<date>-autopilot-<mode>.json`: rapport complet du cycle autonome.
- `runs/<date>-<slot>-dry-run.json`: controle exact du chemin de publication.
- `marketing-agent/learning-log.jsonl`: historique operationnel et apprentissage.

## Commandes

```bash
npm run social:agent:scout
```

Tente une veille live et met a jour `trend-brief.json`. Si le reseau ou une source bloque, le fichier garde un statut explicite au lieu de pretendre que la tendance est verifiee.

```bash
npm run social:agent:strategy
```

Genere seulement `campaigns/<date>-agent-plan.json` et `.md`, sans lancer le studio media. Utile pour valider strategie, hooks, objections et storyboard avant de consommer du quota image/video.

```bash
npm run social:agent:daily
```

Prepare la journee: trend brief, strategie, concepts, studio plan, assets et rapport daily. Sans provider externe, cette commande utilise `byl_autonomous` et produit des MP4 produit autonomes.

```bash
npm run social:agent:daily:real-video
```

Prepare la journee en mode vraie video provider. Si aucun provider n'est configure, l'agent cree les requetes video mais bloque la publication au lieu de revenir silencieusement a un simple slideshow.

```bash
npm run social:agent:autopilot
```

Lance le cycle autonome complet en dry-run: veille trends, apprentissage, inventaire media, strategie, creation des posts, preparation, preflight et rapport. C'est la commande de controle quotidienne.

```bash
npm run social:agent:autopilot:execute
```

Lance le meme cycle avec publication des slots dus, uniquement si les medias frais, les scores qualite, les connecteurs et les garde-fous sont verts.

```bash
npm run social:agent:autopilot:real-video
```

Lance l'autopilot en dry-run avec priorité vraie video provider.

```bash
npm run social:agent:media-intake
```

Inventorie les medias disponibles du jour et dit si l'agent a assez de videos BYL autonomes, de videos provider ou de sources visuelles fraiches pour tenter une publication.

```bash
node ad-samples/social-publisher/src/automation-runner.mjs --mode daily --date 2026-06-29
```

Prepare une date explicite.

```bash
node ad-samples/social-publisher/src/automation-runner.mjs --slot monday-12h30-story --date 2026-06-29 --dry-run
```

Teste le meme chemin qu'un slot scheduler sans publier.

## Regles non negociables

- Aucun vieux media ne peut etre publie automatiquement.
- Un media doit contenir `/daily/<date>/`, le slot et la plateforme dans sa source.
- Une story ne peut pas recycler un Reel.
- Une tendance ne peut pas etre annoncee live si elle n'a pas ete verifiee le jour meme.
- Si la generation media echoue, l'agent distingue la cause: contenu faible, media absent, provider externe absent, upload public indisponible ou connecteur social bloque.
- Le calendrier donne une opportunite de diffusion, pas une obligation de publier.

## Prochaine amelioration majeure

Le cycle autonome existe. La dependance qui determine maintenant la qualite video finale est:

- un provider vraie video capable de livrer un MP4 vertical premium depuis les requetes `real-video`;
- des connecteurs reseau stables pour scout trends, upload public media, publication Meta/TikTok et analytics.

Sans provider vraie video, l'agent fonctionne en `byl_autonomous`: il produit une video produit autonome publiable si elle passe les scores. Le branchement d'un provider vraie video reste une amelioration premium, pas une condition pour que l'agent travaille de A a Z en dry-run.
