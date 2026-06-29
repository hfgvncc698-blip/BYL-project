const byGoal = {
  primaryKpi: "free_trial_starts",
  secondaryKpi: "activation_day_7",
  offer: "essai gratuit 14 jours",
  landingIntent: "amener des coachs sportifs, nutritionnistes et structures a tester BYL gratuitement",
};

const audienceVoice = {
  coach_independant: {
    label: "coach independant",
    world: "seances, clients, programmes, WhatsApp, notes et relances",
    proof: "fiche client, programme et historique retrouves au meme endroit",
    objection: "encore un outil de plus",
    dmKeyword: "SUIVI",
  },
  nutritionniste: {
    label: "nutritionniste",
    world: "bilans, retours alimentaires, objectifs, adherence et ajustements",
    proof: "objectif nutrition, note de suivi et prochaine action visibles clairement",
    objection: "mes clients ne suivront pas",
    dmKeyword: "NUTRI",
  },
  salle_de_sport: {
    label: "responsable de salle ou studio",
    world: "planning, equipe, coachs, clients actifs et priorites du jour",
    proof: "planning, clients, coachs et priorites regroupes dans BYL",
    objection: "je n'ai pas le temps de migrer",
    dmKeyword: "CLUB",
  },
};

const platformRules = {
  instagram: {
    postType: "reel_or_carousel",
    cta: "Essai gratuit 14 jours - lien en bio",
    maxCaptionLines: 9,
    hashtagLimit: 9,
    rhythm: "hook <2s, 5 plans, sous-titres courts, preuve produit apres friction",
  },
  instagram_story: {
    postType: "interactive_story",
    cta: "Reponds {{keyword}} si tu veux voir comment ca marche",
    maxCaptionLines: 5,
    hashtagLimit: 3,
    rhythm: "3 frames max, question claire, sticker ou reponse DM",
  },
  facebook: {
    postType: "b2b_post",
    cta: "Decouvrir l'essai gratuit de 14 jours",
    maxCaptionLines: 12,
    hashtagLimit: 5,
    rhythm: "explication concrete, preuve, phrase de decision",
  },
  tiktok: {
    postType: "short_video",
    cta: "Essai gratuit 14 jours dans la bio",
    maxCaptionLines: 6,
    hashtagLimit: 6,
    rhythm: "POV direct, coupes brutes, zero intro institutionnelle",
  },
};

function normalize(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slug(value = "") {
  return normalize(value).replace(/\s+/g, "-").slice(0, 72) || "byl-content";
}

function stableHash(value = "") {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function audienceKey(concept = {}) {
  const key = concept.audienceSegment || "";
  if (audienceVoice[key]) return key;
  const text = normalize(`${concept.audience || ""} ${concept.subject || ""} ${concept.problem || ""}`);
  if (/nutrition|dieteticien|alimentaire/.test(text)) return "nutritionniste";
  if (/salle|studio|club|equipe|planning/.test(text)) return "salle_de_sport";
  return "coach_independant";
}

function platformCta(platform, voice) {
  const rule = platformRules[platform] || platformRules.instagram;
  return rule.cta.replace("{{keyword}}", voice.dmKeyword);
}

function lineLimit(lines = [], max = 8) {
  return lines.filter(Boolean).slice(0, max).join("\n");
}

function hashtagsFor({ platform, voice, concept }) {
  const base = ["#BoostYourLife", "#EssaiGratuit", "#GestionClient"];
  const audienceTags = {
    coach_independant: ["#CoachSportif", "#PersonalTrainer", "#CoachingEnLigne"],
    nutritionniste: ["#Nutritionniste", "#SuiviNutrition", "#Dieteticien"],
    salle_de_sport: ["#SalleDeSport", "#StudioFitness", "#GestionClub"],
  };
  const platformTags = {
    instagram: ["#FitnessBusiness", "#SuiviClient"],
    instagram_story: ["#Organisation", "#Suivi"],
    facebook: ["#BusinessFitness", "#GestionCoach"],
    tiktok: ["#FitnessTok", "#CoachBusiness"],
  };
  const mechanicTag = concept.trendMechanic?.id ? `#${slug(concept.trendMechanic.id).replace(/-/g, "")}` : "";
  const rule = platformRules[platform] || platformRules.instagram;
  return unique([...base, ...(audienceTags[voice.key] || []), ...(platformTags[platform] || []), mechanicTag]).slice(
    0,
    rule.hashtagLimit,
  );
}

function hookSet({ concept, voice, platform }) {
  const problem = concept.problem || `suivi disperse cote ${voice.label}`;
  const objection = concept.objection?.label || voice.objection;
  const storyHook =
    voice.key === "salle_de_sport"
      ? `Avant le premier cours, tu dois deja savoir quels clients actifs risquent de decrocher.`
      : voice.key === "nutritionniste"
        ? `Entre deux bilans, le vrai risque c'est de perdre le fil des retours clients.`
        : `Ton client t'ecrit entre deux seances: si tu cherches le contexte, il le ressent.`;
  const hooks = [
    concept.hook,
    storyHook,
    `POV: ${problem}, et tu dois quand meme rester pro.`,
    `Le vrai probleme, ce n'est pas ton coaching. C'est ce que tu dois retrouver avant de repondre.`,
    `On m'a dit: "${objection}". Justement, c'est pour ca que BYL existe.`,
    `Ton client ne voit pas ton admin. Il ressent juste si le suivi est clair.`,
    `Avant de vendre plus, rends deja ton suivi plus lisible.`,
  ];
  if (platform === "instagram_story") hooks.unshift(storyHook);
  if (platform === "facebook") hooks.unshift(`${voice.label}: ton suivi ne devrait pas dependre de 4 endroits differents.`);
  if (platform === "tiktok") hooks.unshift(`Si tu coaches encore avec trop d'onglets ouverts, regarde ca.`);
  return unique(hooks).filter((hook) => hook && hook.length >= 18).slice(0, 8);
}

function buildStoryboard({ platform, concept, voice }) {
  const problem = concept.problem || "suivi client disperse";
  const proof = concept.proof || voice.proof;
  if (platform === "instagram_story") {
    return [
      { frame: 1, visual: `scene terrain: ${problem}`, text: "Ca t'arrive aussi ?", durationSeconds: 2 },
      { frame: 2, visual: "sticker sondage ou question", text: "Le plus dur: retrouver quoi ?", durationSeconds: 3 },
      { frame: 3, visual: "micro preuve BYL sur mobile", text: "Tout le contexte au meme endroit.", durationSeconds: 3 },
    ];
  }
  return [
    { frame: 1, visual: `visage ou mains dans une situation concrete: ${problem}`, text: "Le suivi se joue ici.", durationSeconds: 2 },
    { frame: 2, visual: `preuve du desordre: ${voice.world}`, text: "Trop d'endroits a verifier.", durationSeconds: 3 },
    { frame: 3, visual: "transition vers BYL, mobile vertical lisible", text: proof, durationSeconds: 4 },
    { frame: 4, visual: "action simple dans BYL", text: "Une prochaine action claire.", durationSeconds: 3 },
    { frame: 5, visual: "retour humain: message ou priorite clarifiee", text: "Essai gratuit 14 jours.", durationSeconds: 3 },
  ];
}

function buildCarousel({ concept, voice }) {
  const proof = concept.proof || voice.proof;
  return [
    { slide: 1, title: concept.hook || "Ton suivi client parait clair ?", body: "Regarde ce qui se passe entre deux rendez-vous." },
    { slide: 2, title: "Le vrai cout", body: `${voice.world}: tout existe, mais rien n'est au meme endroit.` },
    { slide: 3, title: "La friction", body: concept.problem || "Le pro perd du temps avant meme de repondre." },
    { slide: 4, title: "La bascule BYL", body: proof },
    { slide: 5, title: "A tester", body: byGoal.offer },
  ];
}

function buildCaption({ platform, concept, voice, hooks }) {
  const rule = platformRules[platform] || platformRules.instagram;
  const hook = hooks[0];
  const proof = concept.proof || voice.proof;
  const objection = concept.objection?.label || voice.objection;
  if (platform === "instagram_story") {
    return lineLimit([hook, "", "Le but n'est pas de rajouter un outil.", "C'est de retrouver le bon contexte plus vite.", "", platformCta(platform, voice)], rule.maxCaptionLines);
  }
  if (platform === "facebook") {
    return lineLimit(
      [
        hook,
        "",
        `Quand ${voice.label} doit gerer ${voice.world}, le probleme n'est pas seulement l'organisation.`,
        `C'est la qualite du suivi qui devient plus difficile a maintenir.`,
        "",
        `BYL remet le contexte au meme endroit: ${proof}.`,
        `Objection traitee: "${objection}" -> commencer par une action simple, pas une migration totale.`,
        "",
        platformCta(platform, voice),
      ],
      rule.maxCaptionLines,
    );
  }
  return lineLimit(
    [
      hook,
      "",
      `Situation: ${concept.problem || "le suivi est disperse"}.`,
      `Ce que le client ressent: un suivi moins clair, meme quand le pro fait bien son travail.`,
      "",
      `BYL sert a remettre le contexte au meme endroit: ${proof}.`,
      "",
      platformCta(platform, voice),
    ],
    rule.maxCaptionLines,
  );
}

function buildVoiceover({ platform, concept, voice, hooks }) {
  const proof = concept.proof || voice.proof;
  if (platform === "instagram_story") {
    return `${hooks[0]} Tu le vis dans tes suivis ? Reponds ${voice.dmKeyword} si tu veux voir comment BYL clarifie ca.`;
  }
  return [
    hooks[0],
    `Le moment penible, c'est quand tu dois retrouver ${voice.world}.`,
    `BYL remet le contexte au meme endroit: ${proof}.`,
    "Moins de recherche, plus de suivi clair.",
    platformCta(platform, voice),
  ].join(" ");
}

function buildUtm({ now, slot, platform, concept }) {
  const campaign = `social_agent_${String(now.date || "").replace(/-/g, "")}`;
  const content = slug(`${slot.id || "slot"}-${platform}-${concept.audienceSegment || ""}-${concept.problem || ""}`);
  return {
    url: `https://boostyourlife.coach/?utm_source=${platform}&utm_medium=organic_social&utm_campaign=${campaign}&utm_content=${content}`,
    params: {
      utm_source: platform,
      utm_medium: "organic_social",
      utm_campaign: campaign,
      utm_content: content,
    },
  };
}

function experimentBucket({ now, slot, platform }) {
  const n = stableHash(`${now.date}:${slot.id}:${platform}`) % 10;
  if (n < 2) return "experiment";
  if (n < 5) return "optimization";
  return "proven";
}

function buildPlatformPost({ now, slot, platform, concept, trendBrief }) {
  const key = audienceKey(concept);
  const voice = { key, ...(audienceVoice[key] || audienceVoice.coach_independant) };
  const rule = platformRules[platform] || platformRules.instagram;
  const hooks = hookSet({ concept, voice, platform });
  const storyboard = buildStoryboard({ platform, concept, voice });
  const carousel = buildCarousel({ concept, voice });
  const hashtags = hashtagsFor({ platform, voice, concept });
  const cta = platformCta(platform, voice);
  const caption = buildCaption({ platform, concept, voice, hooks });
  const voiceover = buildVoiceover({ platform, concept, voice, hooks });
  return {
    platform,
    postType: rule.postType,
    objective: byGoal.primaryKpi,
    secondaryObjective: byGoal.secondaryKpi,
    offer: byGoal.offer,
    audience: voice.label,
    hook: hooks[0],
    hookVariants: hooks,
    caption,
    cta,
    hashtags,
    voiceover,
    subtitles: storyboard.map((scene) => scene.text),
    onScreenText: storyboard.map((scene) => scene.text),
    storyboard,
    carousel,
    altText: `Contenu BYL pour ${voice.label}: ${concept.problem || "suivi client plus clair"}.`,
    rhythm: rule.rhythm,
    trendAdaptation: {
      status: trendBrief.status || "local",
      mechanic: concept.trendMechanic?.name || concept.trendMechanic?.id || "",
      instruction: concept.trendMechanic?.instruction || "",
      copyPolicy: "s'inspirer de la mecanique, jamais copier un createur, un son ou un script exact",
    },
    productDiscoveryPath: concept.productDiscoveryPath || [],
    mediaBrief: {
      requiredFreshVisualSources: concept.mediaRequirements?.freshHumanSourcesMin || (platform === "instagram_story" ? 3 : 4),
      preferredFinalMode: "true_video_provider_when_available",
      firstShot: "friction humaine visible avant tout ecran produit",
      productShot: "mobile BYL lisible apres la friction",
      forbidden: concept.mediaRequirements?.forbidden || [],
      requiredDetails: concept.mediaRequirements?.requiredDetails || [],
    },
    utm: buildUtm({ now, slot, platform, concept }),
  };
}

export function buildAutonomousContentPackage({ now = {}, slot = {}, agentSlotPlan = {}, trendBrief = {} } = {}) {
  const concept = agentSlotPlan.concept || {};
  const platforms = Array.isArray(slot.platforms) && slot.platforms.length ? slot.platforms : agentSlotPlan.platforms || ["instagram"];
  const posts = Object.fromEntries(platforms.map((platform) => [platform, buildPlatformPost({ now, slot, platform, concept, trendBrief })]));
  const experimentId = `exp-${slug(`${now.date}-${slot.id}-${concept.audienceSegment}-${concept.problem}`)}`;
  const bucket = experimentBucket({ now, slot, platform: platforms[0] || "instagram" });
  return {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    date: now.date || "",
    slotId: slot.id || "",
    platforms,
    status: "content_ready_pending_fresh_media",
    campaignObjective: byGoal,
    experiment: {
      id: experimentId,
      bucket,
      hypothesis:
        concept.hypothesis ||
        "Un contenu qui part d'une friction metier concrete et fait decouvrir BYL naturellement doit augmenter les essais gratuits qualifies.",
      decisionRule:
        "Garder seulement si le contenu genere essais gratuits, activation J+7 ou signaux de discussion qualifies; sinon produire une variante plus concrete.",
    },
    concept,
    posts,
    publishingPolicy: {
      autonomous: true,
      requiresFreshMedia: true,
      requiresPreflight: true,
      publishOnlyIfAllGreen: true,
      primaryGoal: "essai gratuit 14 jours",
    },
  };
}

export function platformCopyFromContentPackage(contentPackage = {}, platform = "") {
  const post = contentPackage.posts?.[platform] || {};
  return {
    caption: post.caption || "",
    hashtags: post.hashtags || [],
    cta: post.cta || "",
    hook: post.hook || "",
    overlay: (post.onScreenText || []).join(" / "),
    sequence: post.storyboard || [],
    prompt: post.voiceover || "",
    voiceover: post.voiceover || "",
    subtitles: post.subtitles || [],
    carouselSlides: post.carousel || [],
    altText: post.altText || "",
    postType: post.postType || "",
    utm: post.utm || {},
    experimentId: contentPackage.experiment?.id || "",
    experimentBucket: contentPackage.experiment?.bucket || "",
    experimentHypothesis: contentPackage.experiment?.hypothesis || "",
    attributionLandingUrl: post.utm?.url || "",
    creativeBrief: post.mediaBrief || {},
    productDiscoveryPath: post.productDiscoveryPath || [],
  };
}

export function contentPackageMarkdown(contentPackage = {}) {
  const lines = [
    `### Content Factory - ${contentPackage.slotId || ""}`,
    "",
    `- Statut: ${contentPackage.status || "unknown"}`,
    `- Objectif: ${contentPackage.campaignObjective?.offer || byGoal.offer}`,
    `- Experience: ${contentPackage.experiment?.id || ""} (${contentPackage.experiment?.bucket || ""})`,
    `- Hypothese: ${contentPackage.experiment?.hypothesis || ""}`,
    "",
  ];
  for (const [platform, post] of Object.entries(contentPackage.posts || {})) {
    lines.push(
      `#### ${platform}`,
      "",
      `- Type: ${post.postType || ""}`,
      `- Hook: ${post.hook || ""}`,
      `- CTA: ${post.cta || ""}`,
      `- UTM: ${post.utm?.url || ""}`,
      "",
      "Caption:",
      post.caption || "",
      "",
      "Storyboard:",
      ...(post.storyboard || []).map((scene) => `- ${scene.frame}. ${scene.visual} | texte: ${scene.text}`),
      "",
    );
  }
  return lines.join("\n");
}
