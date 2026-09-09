# Manifeste — prototypes vidéo BYL

Date de production : 9 septembre 2026  
Statut : exports locaux à valider — aucune publication, programmation ou dépense.

## Exports

| Fichier | Durée cible | Angle |
|---|---:|---|
| `video-01-suivi-disperse.mp4` | 27 s | Reconnaissance du problème puis clarification |
| `video-02-programme-vs-suivi.mp4` | 25 s | Contraste programme / suivi |
| `video-03-creer-assigner-suivre.mp4` | 31 s | Progression en trois étapes |

Spécifications : 1080 × 1920, 30 i/s, H.264, audio AAC, sous-titres français incrustés, carte CTA finale.

## Sources et provenance

- `public/Mockup.png` : mockup produit officiel local, réutilisé sans altérer son contenu.
- `public/hero-coach-v2.jpg` : visuel coach officiel local.
- `public/logo-byl.png` : logo officiel local.
- `public/fonts/Arial.ttf` et `public/fonts/Arial-Bold.ttf` : polices locales.
- Voix : synthèse vocale macOS locale `Thomas (fr_FR)` ; aucun service externe.
- Texte : `marketing/SCRIPTS_VIDEO_SOCIAL_SEMAINE_1.md`, adapté uniquement pour prononcer « quatorze » à l’oral.
- Composition : scènes SVG déterministes rendues en PNG avec le module local `sharp`, puis mouvements, transitions et encodage avec FFmpeg ; pipeline reproductible via `generate_scenes.mjs` et `build_videos.sh`.
- Aucun actif téléchargé, extrait tiers, témoignage, résultat ou donnée personnelle/de santé.

## Limites explicites

Ces vidéos sont des prototypes en motion design. Le mockup produit fourni est une image statique ; il n’est donc jamais présenté comme un enregistrement interactif. Une mention « aperçu officiel statique » ou équivalente reste visible sur les séquences produit. Les mouvements sont des mouvements de caméra sur l’image, pas des interactions simulées.

Avant publication, remplacer idéalement les séquences statiques par un enregistrement réel d’un compte de démonstration entièrement fictif, vérifier l’URL finale du CTA et reconfirmer au jour de publication l’offre « essai Pro complet de 14 jours, sans carte bancaire ».

## Reproduction

Depuis la racine du dépôt :

```bash
bash marketing/video_exports/2026-09-09/build_videos.sh
```

Le script régénère aussi un rapport `ffprobe` JSON et une planche-contact JPEG par vidéo. La première génération des fichiers de voix doit s’exécuter dans un contexte macOS autorisant le service vocal local ; le script détecte et refuse automatiquement un fichier audio vide.
