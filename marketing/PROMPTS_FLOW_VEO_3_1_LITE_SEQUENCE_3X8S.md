# BYL — prompts Flow / Veo 3.1 Lite — séquence continue 3 × 8 s

Date : 9 septembre 2026  
Statut : prêt à générer après validation et vérification du solde gratuit.  
Format : 9:16, 8 secondes par clip, trois clips, puis carte CTA locale.  
Principe : Veo génère uniquement la scène humaine et l'écran neutre. Toute interface, tout texte et toute marque sont ajoutés en postproduction à partir d'actifs BYL réels et approuvés.

## Architecture marketing contrôlée

- **Clip 1 — WHY** : montrer une tension métier reconnaissable sans la dramatiser — l'attention partagée entre téléphone, carnet et ordinateur.
- **Clip 2 — HOW** : montrer le passage à un flux de travail calme et continu sur un seul écran, sans prétendre que le modèle génère le produit.
- **Clip 3 — WHAT** : préparer la preuve produit : le plan reste humain, mais l'écran neutre est conçu pour recevoir au montage les captures authentiques de l'espace Pro BYL.
- **Carte locale — CTA** : proposer l'essai avec la formulation commerciale préalablement confirmée. Le générateur ne crée jamais le CTA.

Le personnage est un interprète fictif de mise en situation, jamais un client, un utilisateur réel ou un témoignage. La séquence ne montre aucun résultat sportif, physique, financier ou médical.

## Verrou de continuité commun

Le bloc suivant est volontairement répété presque mot pour mot dans les trois prompts :

> A completely fictional adult male independent fitness coach, 35 years old, average athletic build, warm medium-brown skin, short tightly curled black hair, neat short stubble, no tattoos, no jewelry. He wears the exact same unbranded navy overshirt, light gray crew-neck T-shirt and dark charcoal trousers. The same small realistic coaching workspace: plain warm off-white wall with no poster, no writing and no branding; pale oak desk; matte anthracite 14-inch laptop centered and angled five degrees left; closed kraft-paper notebook to the laptop's left; matte white ceramic cup at the back left; plain black pen aligned horizontally above the notebook; black smartphone face down at the front left. Soft late-morning window light enters from frame left, neutral 5200 K white balance, moderate contrast. Eye-level 35 mm lens, medium depth of field, camera always behind the coach's right shoulder, never crossing the 180-degree axis. Natural skin, hands, fabric and restrained breathing. The laptop display is a perfectly flat, uniform medium gray with exactly four small white circular tracking markers, one inset near each screen corner. No other mark appears on the display.

## Clip 1 — WHY — dispersion puis décision

Réglage Flow : Veo 3.1 Lite, 9:16, 8 s, un seul plan continu. Si Flow accepte une image de référence, utiliser la même image d'ancrage pour les trois clips. Aucun audio généré n'est nécessaire.

### Prompt à coller

```text
Create one photorealistic vertical 9:16 live-action shot lasting exactly eight seconds, with no cut, no transition and no time jump.

A completely fictional adult male independent fitness coach, 35 years old, average athletic build, warm medium-brown skin, short tightly curled black hair, neat short stubble, no tattoos, no jewelry. He wears the exact same unbranded navy overshirt, light gray crew-neck T-shirt and dark charcoal trousers. The same small realistic coaching workspace: plain warm off-white wall with no poster, no writing and no branding; pale oak desk; matte anthracite 14-inch laptop centered and angled five degrees left; closed kraft-paper notebook to the laptop's left; matte white ceramic cup at the back left; plain black pen aligned horizontally above the notebook; black smartphone face down at the front left. Soft late-morning window light enters from frame left, neutral 5200 K white balance, moderate contrast. Eye-level 35 mm lens, medium depth of field, camera always behind the coach's right shoulder, never crossing the 180-degree axis. Natural skin, hands, fabric and restrained breathing. The laptop display is a perfectly flat, uniform medium gray with exactly four small white circular tracking markers, one inset near each screen corner. No other mark appears on the display.

At the first frame, his right hand is already moving into view. During seconds 0 to 2, he slides the already face-down black smartphone two centimeters into its exact front-left position and briefly rests his left fingertips on the closed notebook, a small natural moment of divided attention. During seconds 2 to 5, he turns his torso only slightly toward the laptop, wakes the neutral display with one calm trackpad tap and leans forward by a few centimeters. During seconds 5 to 8, a very slow handheld push-in begins, staying behind his right shoulder. His right index finger touches the trackpad and starts one deliberate horizontal swipe from right to left. End while the wrist and index finger are still moving left, before the swipe is complete, ready for a match-on-action cut.

Keep the performance understated and observational, like a real work moment, not an advertisement. The coach never looks at camera and never speaks. Faint natural room tone only; no dialogue, no voice, no music. No readable text, letters, numbers, icons, interface, notification, logo, brand, watermark-like graphic or health data anywhere. No other person, no child, no dramatic reaction, no transformation, no testimonial behavior.
```

Raccord sortant obligatoire : dernier mouvement visible = index et poignet droits glissant vers la gauche sur le trackpad ; caméra encore en léger travelling avant.

## Clip 2 — HOW — un flux de travail continu

Réglage Flow : **préférer Extend** depuis le clip 1. Si Extend n'est pas disponible, extraire la dernière image acceptée du clip 1 et l'utiliser comme première image du clip 2. Garder l'image d'ancrage commune comme référence secondaire si l'interface le permet.

### Prompt à coller

```text
Continue directly from the supplied final frame as one photorealistic vertical 9:16 live-action shot lasting exactly eight seconds, with no cut, no transition and no time jump. Preserve the exact identity, body proportions, hairstyle, stubble, wardrobe, desk geometry, object positions, laptop shape, screen markers, camera axis, lens, exposure, color temperature and shadows from the starting frame.

A completely fictional adult male independent fitness coach, 35 years old, average athletic build, warm medium-brown skin, short tightly curled black hair, neat short stubble, no tattoos, no jewelry. He wears the exact same unbranded navy overshirt, light gray crew-neck T-shirt and dark charcoal trousers. The same small realistic coaching workspace: plain warm off-white wall with no poster, no writing and no branding; pale oak desk; matte anthracite 14-inch laptop centered and angled five degrees left; closed kraft-paper notebook to the laptop's left; matte white ceramic cup at the back left; plain black pen aligned horizontally above the notebook; black smartphone face down at the front left. Soft late-morning window light enters from frame left, neutral 5200 K white balance, moderate contrast. Eye-level 35 mm lens, medium depth of field, camera always behind the coach's right shoulder, never crossing the 180-degree axis. Natural skin, hands, fabric and restrained breathing. The laptop display is a perfectly flat, uniform medium gray with exactly four small white circular tracking markers, one inset near each screen corner. No other mark appears on the display.

At second 0, complete the same right-to-left trackpad swipe already in progress, with the finger, wrist and camera moving at exactly the same speed and direction as in the supplied frame. During seconds 1 to 5, the right hand performs two calm, clearly separated work gestures on the trackpad: one short vertical scroll, a half-second pause, then one single tap. Keep the shoulder, head and breathing subtle; the coach is focused on the screen. The slow push-in continues only until the laptop display occupies about sixty-five percent of the frame, while the right shoulder, both hands and notebook remain visible. During seconds 5 to 8, the camera becomes nearly still. The right hand remains relaxed on the trackpad while the left hand leaves the notebook and reaches toward the black pen. End with the left thumb and index finger just gripping the pen and lifting it exactly three centimeters, pen tip pointing diagonally up and right, motion still continuing upward.

Keep the performance understated and observational, like a real work moment, not an advertisement. The coach never looks at camera and never speaks. Faint natural room tone only; no dialogue, no voice, no music. No readable text, letters, numbers, icons, interface, notification, logo, brand, watermark-like graphic or health data anywhere. Do not change the gray display or the four white circular markers. No other person, no child, no dramatic reaction, no transformation, no testimonial behavior.
```

Raccord entrant obligatoire : continuation du swipe du clip 1.  
Raccord sortant obligatoire : stylo noir soulevé de 3 cm, pointe en diagonale vers le haut et la droite, mouvement ascendant non terminé.

## Clip 3 — WHAT — espace prêt pour la preuve produit

Réglage Flow : **préférer Extend** depuis le clip 2 ; sinon utiliser sa dernière image comme première image. L'écran reste neutre pendant toute la génération : les vraies vues BYL seront incrustées ensuite.

### Prompt à coller

```text
Continue directly from the supplied final frame as one photorealistic vertical 9:16 live-action shot lasting exactly eight seconds, with no cut, no transition and no time jump. Preserve the exact identity, body proportions, hairstyle, stubble, wardrobe, desk geometry, object positions, laptop shape, screen markers, camera axis, lens, exposure, color temperature and shadows from the starting frame.

A completely fictional adult male independent fitness coach, 35 years old, average athletic build, warm medium-brown skin, short tightly curled black hair, neat short stubble, no tattoos, no jewelry. He wears the exact same unbranded navy overshirt, light gray crew-neck T-shirt and dark charcoal trousers. The same small realistic coaching workspace: plain warm off-white wall with no poster, no writing and no branding; pale oak desk; matte anthracite 14-inch laptop centered and angled five degrees left; closed kraft-paper notebook to the laptop's left; matte white ceramic cup at the back left; the same plain black pen already held exactly three centimeters above the notebook as shown in the supplied starting frame; black smartphone face down at the front left. Soft late-morning window light enters from frame left, neutral 5200 K white balance, moderate contrast. Eye-level 35 mm lens, medium depth of field, camera always behind the coach's right shoulder, never crossing the 180-degree axis. Natural skin, hands, fabric and restrained breathing. The laptop display is a perfectly flat, uniform medium gray with exactly four small white circular tracking markers, one inset near each screen corner. No other mark appears on the display.

At second 0, continue the exact upward movement of the black pen already held between the left thumb and index finger, with identical position, speed and direction. During seconds 0 to 3, the coach brings the pen gently over the closed kraft-paper notebook but does not write or draw anything; he rests the pen horizontally in its original place above the notebook. During seconds 3 to 5, his right index finger makes one final deliberate trackpad tap, then the hand becomes still. During seconds 5 to 8, he exhales naturally and releases a small amount of tension in his shoulders. The camera performs a very slow fifteen-centimeter pullback on the same right-shoulder axis, keeping the neutral laptop display large, unobstructed and planar for screen replacement. End on a stable frame with both hands visible, the pen still, the smartphone face down and the four tracking markers clear.

Keep the performance understated and observational, like a real work moment, not an advertisement. No smile of victory, celebration or sales gesture. The coach never looks at camera and never speaks. Faint natural room tone only; no dialogue, no voice, no music. No readable text, letters, numbers, icons, interface, notification, logo, brand, watermark-like graphic or health data anywhere. Do not change the gray display or the four white circular markers. No writing appears on the notebook. No other person, no child, no dramatic reaction, no transformation, no testimonial behavior.
```

Raccord entrant obligatoire : reprise exacte du stylo montant du clip 2.  
Fin obligatoire : plan stable, écran largement visible pour l'incrustation et assez de calme pour basculer vers la carte CTA.

## Contrôle de conformité des prompts

| Exigence | Clip 1 | Clip 2 | Clip 3 |
|---|---|---|---|
| WHY → HOW → WHAT | Tension métier visuelle, sans promesse | Geste organisé, sans faux produit | Support de preuve réelle à incruster |
| Adulte fictif | Déclaré explicitement | Identité préservée depuis l'image de départ | Identité préservée depuis l'image de départ |
| Même personnage, décor, axe et lumière | Bible complète | Bible complète + conservation stricte | Bible complète + conservation stricte |
| Raccord sur geste | Swipe sortant | Swipe entrant, stylo sortant | Stylo entrant, fin stable |
| Écran neutre trackable | Gris + 4 repères | Gris + 4 repères inchangés | Gris + 4 repères inchangés |
| Aucune interface ou fonction inventée | Interdite | Interdite | Interdite ; vraie interface en postproduction |
| Aucune donnée / santé | Interdite | Interdite | Interdite |
| Aucun texte, logo ou marque généré | Interdit | Interdit | Interdit |
| Aucun faux témoignage | Regard hors caméra, aucune parole | Regard hors caméra, aucune parole | Aucune célébration ou posture de vente |

## Critères de rejet avant montage

### Rejet immédiat

- clip différent de 8 s, mauvais format ou présence d'une coupe interne ;
- changement de personne, âge apparent, couleur de peau, cheveux, barbe, corpulence ou tenue ;
- visage ressemblant manifestement à une personne connue ou identifiable ;
- franchissement de l'axe des 180°, caméra passant devant le coach ou lumière changeant de côté ;
- meuble, ordinateur, tasse, téléphone, carnet ou stylo qui apparaît, disparaît, change de forme, de couleur ou de position sans action visible ;
- anatomie anormale : doigt surnuméraire, fusion de main, articulation impossible, objet traversant la main ou le corps ;
- écran autre que gris uniforme, écran qui scintille ou se déforme, nombre de repères différent de quatre, repère qui dérive par rapport à la dalle ;
- texte, pseudo-texte, chiffre, icône, notification, interface, logo ou donnée visible dans le décor ou sur l'écran ;
- présence d'un enfant, d'un tiers, d'une donnée personnelle, corporelle ou de santé ;
- parole, mouvement labial manifeste, musique, voix ou son intelligible ;
- geste de raccord absent, inversé, terminé trop tôt ou incompatible avec le plan précédent ;
- regard caméra, sourire commercial, célébration, avant/après ou comportement assimilable à un témoignage.

### Rejet qualité

- action initiale du clip 1 commençant après 0,5 s ;
- caméra flottante, accélération artificielle, ralenti, zoom numérique perceptible ou esthétique publicitaire brillante ;
- mouvement trop rapide pour permettre le tracking d'écran ;
- reflet ou occlusion cachant durablement plus de 20 % de l'écran ;
- écran trop petit : moins de 50 % du cadre pendant la majorité des clips 2 et 3 ;
- variation d'exposition, de balance des blancs ou de focale perceptible au raccord ;
- posture figée, respiration mécanique ou texture de peau cireuse ;
- fin du clip 3 instable ou sans au moins 0,5 s exploitable pour le raccord vers le CTA.

Un seul rejet immédiat suffit à écarter le clip. Ne pas tenter de masquer une anomalie structurelle par un recadrage agressif ou du motion blur.

## Procédure de génération et téléchargement

1. Avant toute génération, vérifier visuellement dans Flow : modèle **Veo 3.1 Lite**, durée **8 s**, format **vertical 9:16**, solde gratuit suffisant et absence d'achat ou d'abonnement proposé.
2. Générer le clip 1. Ne générer le clip 2 que si le clip 1 satisfait les critères bloquants de personnage, axe, écran et geste final.
3. Pour le clip 2, utiliser la fonction **Extend** du clip 1. Si elle n'est pas proposée, télécharger le clip 1 en qualité originale et extraire sa dernière image :

   ```bash
   ffmpeg -sseof -0.04 -i clip-01-why-original.mp4 -frames:v 1 clip-01-last-frame.png
   ```

   Importer cette image comme première image du clip 2, puis coller le prompt 2.
4. Répéter la même méthode entre les clips 2 et 3.
5. Télécharger chaque sortie dans sa qualité originale, sans compression sociale ni capture d'écran. Conserver les noms :

   - `clip-01-why-original.mp4`
   - `clip-02-how-original.mp4`
   - `clip-03-what-original.mp4`
   - `clip-01-last-frame.png`
   - `clip-02-last-frame.png`

6. Copier dans un manifeste local : prompt exact, modèle affiché, durée, format, date, identifiant de génération et crédits consommés. Ne jamais inscrire de clé API ou donnée de compte dans ce manifeste.
7. Si Flow affiche un coût, un achat, un abonnement ou un dépassement du solde gratuit, s'arrêter avant confirmation et demander l'accord du propriétaire.

## Instructions de montage local

1. Monter les clips dans l'ordre WHY → HOW → WHAT avec des **coupes franches sur mouvement**, sans fondu entre les clips. Ajuster les points d'entrée/sortie de 1 à 3 images maximum pour supprimer une image dupliquée par Extend.
2. Normaliser la séquence finale en 1080 × 1920, 30 fps, H.264, sans interpoler artificiellement si cela crée des doubles contours sur les mains.
3. Effectuer un tracking planaire à quatre points sur la dalle. Incruster uniquement des captures réelles d'un compte BYL de démonstration expurgé :

   - clip 1 : écran encore neutre jusqu'au réveil, puis tableau de bord authentique si validé ;
   - clip 2 : vues réelles clients → programmes → planning, dans l'ordre réellement supporté ;
   - clip 3 : bilan nutritionnel réel de démonstration, sans mesure personnelle ou de santé identifiable.

4. Conserver les reflets légers et reconstruire l'occlusion des doigts au-dessus de l'interface. Rejeter le compositing si l'interface glisse par rapport aux quatre repères.
5. Ajouter la voix française autorisée et les sous-titres en local. Le personnage ne doit pas sembler prononcer cette voix : privilégier clairement une **voix off** et éviter un gros plan de bouche.
6. Ajouter après les 24 s une carte CTA locale de 4 s avec les actifs officiels. Formulation seulement après reconfirmation commerciale : « Démarrer mon essai complet de 14 jours » et `BoostYourLife.coach`.
7. Mixer à niveau social raisonnable, vérifier la compréhension sans son, puis visionner l'export trois fois : continuité humaine, exactitude produit, conformité données/claims.
8. Présenter l'export local à validation. Aucune publication, programmation, dépense publicitaire ou envoi ne découle de cette génération.
