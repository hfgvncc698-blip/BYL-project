# Chaîne vidéo photoréaliste BYL — validation au 9 septembre 2026

## Décision

**Voie primaire : Runway Dev API.** C'est la seule voie examinée qui réunit, derrière un compte et une clé API uniques, de la vidéo photoréaliste text-to-video et image-to-video, des sorties verticales, un moteur de performance/avatars, de la synthèse vocale multilingue et une API directement pilotable depuis cet environnement. La chaîne proposée est :

1. plans photoréalistes 9:16 avec `gen4.5` (ou `gen4_turbo` pour les essais bon marché) ;
2. séquence parlée avec un avatar Runway prédéfini et une voix française, ou voix off française sur les plans générés ;
3. montage, sous-titres, musique autorisée et carte CTA BYL en local avec FFmpeg ;
4. contrôle humain de chaque export avant toute publication.

**Voie de secours : Gemini API / Veo 3.1 Fast.** Elle produit des clips 9:16 photoréalistes de 8 secondes avec audio natif et accepte texte, image et jusqu'à trois images de référence. Pour BYL, la voix française doit toutefois rester une voix off séparée tant qu'un test réel n'a pas validé la diction et les lèvres : Google indique encore que la parole courte, naturelle et cohérente est un domaine en cours d'amélioration.

**Pourquoi pas Sora :** le produit web et l'app ont fermé le 26 avril 2026 et l'API fermera le 24 septembre 2026. À quinze jours de cette échéance, ce n'est pas une dépendance de production raisonnable.

Cette décision est une **validation documentaire et technique de faisabilité**, pas un comparatif qualité issu de générations payantes : aucun compte n'a été créé, aucun crédit n'a été acheté et aucune génération externe n'a été lancée.

## Comparatif factuel

| Solution | Continuité temporelle / contrôle | Français, voix et lèvres | Entrées vidéo | Droits commerciaux | Watermark | Coût public observé | Compte / faisabilité ici | Verdict BYL |
|---|---|---|---|---|---|---|---|---|
| **Runway Dev** | Gen-4.5 : instructions séquencées et mouvements de caméra ; clips de 2 à 10 s. Image de départ utile pour stabiliser l'identité. La continuité entre plusieurs clips reste à construire au montage et à tester. | Les voix génératives annoncent le français France/Canada. L'API expose TTS, doublage, performance de personnage et vidéo d'avatar. La synchro lèvres française doit être validée sur un pilote, elle n'est pas garantie par une mesure officielle publiée. | T2V et I2V Gen-4.5 ; Act-Two image/vidéo ; vertical `720:1280`. | Runway indique que les créations restent utilisables commercialement et sans attribution obligatoire. | Web gratuit : visible. Standard+ : sans watermark. Le statut exact du watermark API n'est pas explicité dans les pages officielles consultées ; à vérifier sur l'export pilote. | 1 crédit = 0,01 USD ; Gen-4.5 12 crédits/s = **0,12 USD/s** ; Turbo et Act-Two 0,05 USD/s ; voix Eleven Multilingual 1 crédit/50 caractères. Minimum de chargement API : 10 USD. | Compte Dev + organisation + crédits + `RUNWAYML_API_SECRET`. Appelable ici par cURL/Node sans navigateur. | **Primaire.** Meilleur compromis qualité, contrôle, API et chaîne complète dans un seul fournisseur. |
| **Google Veo 3.1** | Clips 8 s, première/dernière image, extension, trois références ; Google présente une forte fidélité et un bon réalisme. La continuité multi-clips doit rester pilotée par références et montage. | Audio natif avec dialogue, mais Google reconnaît encore des limites de cohérence de la parole courte. Aucune garantie officielle spécifique au français trouvée. | T2V, I2V, 9:16, 720p/1080p/4K. | Pour Google Cloud, les sorties sont des données client et Google ne revendique pas la nouvelle propriété intellectuelle créée dans la sortie ; l'utilisateur reste responsable des droits des entrées. | SynthID invisible et détectable, pas un logo visible annoncé pour l'API. | Gemini API : Fast audio **0,10 USD/s en 720p**, 0,12 USD/s en 1080p ; Standard audio 0,40 USD/s. Pas de palier gratuit Veo. | Clé Gemini payante ou projet Google Cloud facturé. Appelable ici par cURL ; résultats conservés 2 jours, donc téléchargement local requis. | **Secours.** Très bon moteur de plans, moins rassurant pour un présentateur français synchronisé. |
| **HeyGen** | Très stable pour un présentateur face caméra ; moins adapté à une narration cinématographique ou à des mouvements complexes. | Point fort : voix françaises Belgique/Canada/France/Suisse, avatars et lip-sync. | Script/audio vers avatar ; Video Agent pour prompt-to-video. Ce n'est pas un moteur T2V/I2V cinématique au même niveau que les deux précédents. | Creator/Pro/Business : l'utilisateur possède les sorties et peut les utiliser commercialement. Le plan gratuit est explicitement non commercial. Le statut commercial du nouveau PAYG API autonome mérite confirmation contractuelle avant publication. | Par défaut visible ; suppression sur plans payants. | API PAYG : Avatar III 1 USD/min ; Avatar IV 3 USD/min pour Photo Avatar, 4 USD/min pour Digital Twin/Studio en 720p/1080p ; Video Agent 2 USD/min. Plus de crédits API gratuits depuis février 2026. | Compte + achat PAYG + token API. Pilotable ici par API, mais la création d'un jumeau personnalisé est Enterprise ; avatar stock possible. | **Spécialiste avatar**, pas la voie générale. À retenir si la priorité devient exclusivement un porte-parole français. |
| **Kling 3.0** | Le guide officiel annonce 3–15 s, multi-shot, références d'éléments et meilleure cohérence de sujet. Ce sont des affirmations fournisseur non testées ici. | Audio natif et lèvres annoncés pour chinois, anglais, japonais, coréen et espagnol. **Le français n'est pas pris en charge** : une entrée non listée est traduite en anglais. | T2V, I2V, première/dernière image, références multiples, 720p/1080p. | Les conditions commerciales et la conversion crédits/USD n'ont pas pu être confirmées dans une source officielle accessible sans authentification. | Non confirmé dans une source officielle accessible. | 720p : 6 crédits/s sans audio, 9 avec audio ; 1080p : 8/12 crédits/s. Valeur monétaire non confirmée. | Compte requis ; documentation API publique directe insuffisamment accessible depuis ici. | **Écarté** pour BYL France malgré de bonnes capacités visuelles annoncées. |
| **Sora 2** | Historiquement fort en réalisme, physique et audio synchronisé ; non testable comme produit actuel. | Dialogue synchronisé annoncé, mais aucune validation française pertinente maintenant que le produit est fermé. | Historiquement texte/image ; API en extinction. | Sans objet pour une nouvelle chaîne durable. | Visible + C2PA sur les exports Sora. | Sans objet : produit fermé. | Web/app fermés ; API ferme le 24/09/2026. | **Écarté.** |
| **Open source local : Wan 2.2** | T2V/I2V 720p 24 fps ; S2V audio-driven disponible. Qualité et continuité nécessiteraient une vraie campagne de tests. | Le S2V accepte un audio, donc un fichier français est possible, sans garantie officielle de qualité labiale française. | T2V, I2V, S2V. | Code/modèles sous Apache 2.0 selon le dépôt officiel ; vérifier les droits de tous les actifs et voix. | Aucun logo de service ; obligations légales d'étiquetage restent à la charge de BYL. | Logiciel sans coût par génération, mais matériel/électricité ou GPU cloud à financer. | Le TI2V 5B demande au moins 24 Go de VRAM NVIDIA ; les modèles 14B jusqu'à 80 Go. Cette machine est un MacBook Air M1 16 Go sans CUDA : **non faisable localement**. | **Pas maintenant.** Nécessite un GPU cloud/NVIDIA et une installation lourde. |
| **Open source local : HunyuanVideo 1.5** | T2V/I2V, 8,3 B paramètres ; le dépôt annonce au moins 14 Go VRAM avec offload. | Pas de chaîne française/lip-sync complète documentée dans le dépôt de base. | T2V/I2V. | **Licence non applicable dans l'Union européenne**, le Royaume-Uni et la Corée du Sud. | Non pertinent ici. | Pas de coût par génération hors matériel. | Linux + NVIDIA CUDA requis. Incompatible avec la machine et juridiquement inutilisable ici en France selon sa licence. | **Écarté.** |
| **Open source local : LTX-2.5 + MuseTalk** | LTX propose T2V/I2V et audio-vidéo ; MuseTalk peut repasser les lèvres sur une vidéo. Assemblage complexe et risque d'artefacts cumulés. | Audio-to-video et Dub-It existent ; MuseTalk est audio-driven. Le français est techniquement possible via l'audio, sans métrique officielle de qualité française. | T2V/I2V/A2V, puis lip-sync. | LTX : gratuit sous 10 M USD de CA annuel, licence payante au-dessus ; les sorties restent à l'utilisateur. MuseTalk : code MIT, mais il faut aussi auditer les poids/dépendances. | Aucun logo de service par défaut ; LTX impose de préserver toute provenance intégrée et de déclarer l'IA lorsque requis. | Modèles gratuits ; coût matériel très élevé. | Le quickstart LTX télécharge environ 66 Gio, alors qu'il ne reste qu'environ 58 Gio ici, et cible surtout les backends CUDA. Machine M1 16 Go sans PyTorch installé : **non faisable localement aujourd'hui**. | **Laboratoire futur**, pas une chaîne production immédiate. |

## Chaîne primaire concrète, sans rush utilisateur

### Format recommandé

- 24 à 30 secondes, 9:16, 4 à 6 plans réels générés (pas des photos animées).
- Hook visuel humain 0–2 s : coach fictif/non identifiable dans une situation professionnelle reconnaissable.
- 2 à 3 plans de contexte photoréalistes Gen-4.5, 3–6 s chacun.
- Démonstration produit uniquement à partir de captures BYL réelles approuvées ; aucun faux clic ni écran inventé.
- Une courte intervention parlée avec avatar stock, ou voix off française si le test lèvres n'est pas convaincant.
- Sous-titres brûlés, variations de cadrage toutes les 1,5–3 s, CTA final « Essayer BYL » selon l'offre réellement disponible.

### Budget de validation conseillé

Ne rien déclencher sans accord. Pour un pilote, demander un plafond **strict de 20 USD**, autobilling désactivé. À titre indicatif, 30 secondes finales ne signifient pas seulement 30 secondes facturées : les variantes et rejets comptent. Gen-4.5 coûte 3,60 USD pour 30 secondes brutes ; un ratio prudent de 3 variantes porte déjà les seuls plans à environ 10,80 USD, hors voix, avatars et éventuels upscales.

### Accès exacts à demander au propriétaire

1. Un **compte Runway Dev** au nom de BYL et une **organisation dédiée** « BYL Video Pilot ».
2. Le chargement manuel de **20 USD maximum** après approbation ; **autobilling désactivé**.
3. Une clé dédiée nommée `BYL-video-pilot`, fournie par canal secret et stockée localement sous `RUNWAYML_API_SECRET` ; ne jamais la coller dans un chat ni la committer.
4. Un rôle Runway **Developer** pour la génération seulement ; conserver Admin/Billing côté propriétaire. La révocation de l'accès d'un membre ne révoque pas automatiquement la clé, donc prévoir la désactivation explicite de cette clé en fin de pilote.
5. L'autorisation d'utiliser **un avatar stock Runway** précis et une voix française prédéfinie ; aucune imitation de personne réelle.
6. Les seuls actifs BYL approuvés : logo, charte, captures produit réelles expurgées, URL et formulation exacte de l'essai. Aucun fichier client, donnée de santé, témoignage ou résultat inventé.
7. Un accord séparé avant chaque génération payante, puis un accord séparé avant toute publication.

## Accès pour la voie de secours

1. Une **clé Gemini API payante** dédiée, ou un projet Google Cloud « BYL Video Pilot » avec facturation et API Gemini/Veo activées.
2. Un plafond budgétaire explicite de 20 USD et les alertes de budget ; aucune génération avant accord.
3. La clé stockée sous `GEMINI_API_KEY` par canal secret, jamais dans Git.
4. Autorisation du modèle `veo-3.1-fast-generate-preview` ou de sa version GA disponible dans le projet, plus quota dans une région compatible avec la France.
5. Consentements et actifs identiques à la voie primaire. En UE, Veo limite la génération de personnes à des adultes ; ne fournir aucune photo de mineur.

## Ce qui est réellement validé dans cet environnement

- Machine : Apple M1, 16 Go de mémoire unifiée, pas de GPU NVIDIA/CUDA, environ 58 Gio libres.
- cURL, Node et FFmpeg sont disponibles : les API Runway et Gemini sont techniquement pilotables et les clips peuvent être montés/normalisés en local.
- Aucun navigateur pilotable n'est disponible dans cette session : une chaîne dépendant uniquement d'une interface web n'est pas automatisable ici.
- Aucun SDK vidéo externe, poids de modèle, compte ou secret n'est présent ; aucune génération photoréaliste payante n'a donc été exécutée.

## Sources officielles

- Runway : [Gen-4.5](https://help.runwayml.com/hc/en-us/articles/46974685288467-Creating-with-Gen-4-5), [guide API Gen-4.5](https://docs.dev.runwayml.com/guides/using-the-api/), [modèles API](https://docs.dev.runwayml.com/guides/models/), [tarifs API](https://docs.dev.runwayml.com/guides/pricing/), [configuration et minimum de crédits](https://docs.dev.runwayml.com/guides/setup/), [langues audio](https://help.runwayml.com/hc/en-us/articles/33505227741587-Supported-Languages-in-Generative-Audio), [usage commercial](https://help.runwayml.com/hc/en-us/articles/21668707517587-Can-I-use-the-content-I-made-in-Runway-for-commercial-purposes), [watermark du plan gratuit](https://help.runwayml.com/hc/en-us/articles/50404627334547-Free-plan-details).
- Google : [Veo 3.1 dans Gemini API](https://ai.google.dev/gemini-api/docs/video), [tarifs Gemini API](https://ai.google.dev/gemini-api/docs/pricing), [limitations et SynthID](https://deepmind.google/technologies/veo/), [conditions Google Cloud sur les sorties](https://cloud.google.com/terms/service-terms).
- HeyGen : [tarifs](https://www.heygen.com/pricing), [tarifs API PAYG](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained), [langues de voix](https://help.heygen.com/en/articles/11391932-voice-languages-we-support), [watermark](https://help.heygen.com/en/articles/11057301-how-to-remove-the-heygen-watermark), [conditions commerciales](https://www.heygen.com/terms).
- Kling : [guide officiel Kling Video 3.0](https://app.klingai.com/cn/quickstart/klingai-video-3-model-user-guide).
- OpenAI : [arrêt de Sora](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation), [capacités et provenance Sora 2](https://openai.com/index/sora-2-system-card/).
- Open source : [Wan 2.2 officiel](https://github.com/Wan-Video/Wan2.2), [licence Wan 2.2](https://raw.githubusercontent.com/Wan-Video/Wan2.2/main/LICENSE.txt), [HunyuanVideo 1.5](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5), [licence HunyuanVideo](https://raw.githubusercontent.com/Tencent-Hunyuan/HunyuanVideo-1.5/main/LICENSE), [LTX-2](https://github.com/Lightricks/LTX-2), [licence LTX-2.x](https://raw.githubusercontent.com/Lightricks/LTX-2/main/LICENSE-2_x), [MuseTalk](https://github.com/TMElyralab/MuseTalk).

