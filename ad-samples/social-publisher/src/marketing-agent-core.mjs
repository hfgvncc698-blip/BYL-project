const defaultAudienceProfiles = {
  coach_independant: {
    label: "Coach independant",
    audience: "Coachs sportifs independants et coachs online",
    pains: [
      "messages clients disperses",
      "programmes modifies trop tard",
      "Excel, Sheets, PDF et WhatsApp ouverts en meme temps",
      "relances oubliees",
      "experience client moins premium que le coaching reel",
    ],
    desiredEmotion: "soulagement credible",
    proof: "fiche client, programme, note et historique regroupes dans BYL",
    nativeCta: {
      instagram: "Essai gratuit 14 jours - lien en bio",
      instagram_story: "Reponds SUIVI si tu veux voir comment ca marche",
      facebook: "Decouvrir l'essai gratuit de 14 jours",
      tiktok: "Essai gratuit 14 jours dans la bio",
    },
  },
  nutritionniste: {
    label: "Nutritionniste",
    audience: "Nutritionnistes, dieteticiens et coachs nutrition",
    pains: [
      "adherence qui baisse entre deux rendez-vous",
      "retours alimentaires difficiles a suivre",
      "plans nutritionnels peu visibles cote client",
      "ajustements envoyes dans plusieurs canaux",
      "manque de continuite apres le bilan",
    ],
    desiredEmotion: "confiance calme",
    proof: "objectif nutrition, note de suivi et prochaine action visibles dans BYL",
    nativeCta: {
      instagram: "Essai gratuit 14 jours - lien en bio",
      instagram_story: "Reponds NUTRI si tu veux voir le suivi entre deux bilans",
      facebook: "Decouvrir le suivi nutrition centralise",
      tiktok: "Teste le suivi nutrition plus clair",
    },
  },
  salle_de_sport: {
    label: "Salle de sport",
    audience: "Salles de sport, studios premium et responsables de club",
    pains: [
      "planning equipe difficile a lire",
      "standards de suivi inegaux selon les coachs",
      "manque de visibilite sur les clients actifs",
      "priorites du jour dispersees",
      "pilotage club trop dependant de messages internes",
    ],
    desiredEmotion: "maitrise",
    proof: "planning, clients, coachs et priorites regroupes dans BYL",
    nativeCta: {
      instagram: "Essai gratuit 14 jours - lien en bio",
      instagram_story: "Reponds CLUB si tu veux voir le pilotage",
      facebook: "Decouvrir BYL pour une structure",
      tiktok: "Voir comment clarifier le pilotage club",
    },
  },
};

const fallbackObjections = [
  {
    id: "one_more_tool",
    label: "encore un outil de plus",
    answer: "montrer que BYL remplace plusieurs canaux au lieu d'en ajouter un",
  },
  {
    id: "migration_time",
    label: "je n'ai pas le temps de migrer",
    answer: "montrer une premiere action simple et rapide, pas une transformation totale",
  },
  {
    id: "human_touch",
    label: "j'ai peur de perdre l'humain",
    answer: "montrer que le contexte permet une reponse plus personnelle",
  },
  {
    id: "client_adherence",
    label: "mes clients ne suivront pas",
    answer: "montrer une experience client plus claire et plus facile a reprendre",
  },
  {
    id: "premium_trust",
    label: "est-ce assez pro pour mon image",
    answer: "montrer une experience sobre, claire et premium",
  },
];

const platformDefaults = {
  instagram: {
    format: "reel_or_carousel",
    rhythm: "hook en moins de 2 secondes, 4 a 6 plans courts, sous-titres sobres",
    interaction: "sauvegarde, commentaire ou clic bio",
  },
  instagram_story: {
    format: "story_interactive",
    rhythm: "1 scene courte, 1 question claire, pas de recyclage du Reel",
    interaction: "sondage, question box ou reponse DM explicite",
  },
  facebook: {
    format: "b2b_post_or_reel",
    rhythm: "plus explicatif, preuve concrete, ton responsable/pro",
    interaction: "clic vers essai gratuit ou demande de demo",
  },
  tiktok: {
    format: "short_video",
    rhythm: "POV direct, coupes plus brutes, aucune intro institutionnelle",
    interaction: "commentaire ou visite profil",
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

function hashString(value = "") {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(items = [], key = "") {
  if (!items.length) return null;
  return items[hashString(key) % items.length];
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function entriesSince(memory = {}, nowDate = "", maxDays = 21) {
  const now = Date.parse(`${nowDate}T12:00:00Z`);
  return (memory.entries || []).filter((entry) => {
    const raw = entry.date || entry.publishedAt || "";
    const time = Date.parse(`${String(raw).slice(0, 10)}T12:00:00Z`);
    if (!Number.isFinite(now) || !Number.isFinite(time)) return false;
    return Math.abs(now - time) / 86_400_000 <= maxDays;
  });
}

function recentCount(memory = {}, nowDate = "", field = "audienceSegment", value = "") {
  const needle = normalize(value);
  return entriesSince(memory, nowDate, 21).filter((entry) => normalize(entry[field]) === needle).length;
}

function growthWinnerBonus(growthMemory = {}, listKey = "", value = "") {
  const needle = normalize(value);
  const winners = growthMemory.currentWinners?.[listKey] || [];
  const index = winners.findIndex((item) => normalize(item.value || item.segment || item.audienceSegment) === needle);
  if (index === -1) return 0;
  return Math.max(4, 16 - index * 3);
}

function scoreAudience({ audienceKey, slot = {}, platform = "", memory = {}, growthMemory = {}, now = {} }) {
  let score = 50;
  const text = normalize(`${slot.id || ""} ${slot.intent || ""} ${slot.format || ""}`);

  if (audienceKey === "coach_independant" && /coach|client|reel|tiktok|story/.test(text)) score += 18;
  if (audienceKey === "nutritionniste" && /nutrition|adherence|bilan/.test(text)) score += 24;
  if (audienceKey === "salle_de_sport" && /club|studio|b2b|facebook|structure|equipe/.test(text)) score += 24;
  if (platform === "facebook" && audienceKey === "salle_de_sport") score += 10;
  if (platform === "tiktok" && audienceKey === "coach_independant") score += 10;
  if (platform === "instagram_story" && audienceKey !== "salle_de_sport") score += 6;

  score += growthWinnerBonus(growthMemory, "activatedAudiences", audienceKey);
  score += growthWinnerBonus(growthMemory, "audiences", audienceKey);
  score -= recentCount(memory, now.date, "audienceSegment", audienceKey) * 6;
  score += hashString(`${now.date}:${slot.id}:${audienceKey}`) % 9;
  return score;
}

function chooseAudience({ slot = {}, platform = "", memory = {}, growthMemory = {}, now = {} }) {
  return Object.keys(defaultAudienceProfiles)
    .map((key) => ({ key, score: scoreAudience({ audienceKey: key, slot, platform, memory, growthMemory, now }) }))
    .sort((a, b) => b.score - a.score)[0]?.key || "coach_independant";
}

function readObjections(objectionDatabase = {}) {
  const fromList = (objectionDatabase.objections || []).map((item, index) => ({
    id: item.id || item.key || `objection_${index}`,
    label: item.label || item.title || item.objection || item.text || "",
    answer: item.answer || item.response || item.angle || "",
  })).filter((item) => item.label);

  const fromCategories = Object.entries(objectionDatabase.categories || {}).flatMap(([category, values]) =>
    (Array.isArray(values) ? values : []).map((value, index) => ({
      id: `${category}_${index}`,
      label: typeof value === "string" ? value : value.label || value.objection || value.text || "",
      answer: typeof value === "string" ? `traiter l'objection ${category} avec une preuve concrete` : value.answer || "",
    })),
  ).filter((item) => item.label);

  return [...fromList, ...fromCategories, ...fallbackObjections];
}

function chooseObjection({ audienceKey = "", platform = "", slot = {}, now = {}, objectionDatabase = {} }) {
  const objections = readObjections(objectionDatabase);
  const filtered = objections.filter((item) => {
    const text = normalize(`${item.id} ${item.label} ${item.answer}`);
    if (audienceKey === "nutritionniste") return /adherence|client|temps|confiance|outil|migration/.test(text);
    if (audienceKey === "salle_de_sport") return /equipe|process|outil|temps|confiance|migration|premium/.test(text);
    return true;
  });
  return pick(filtered.length ? filtered : objections, `${now.date}:${slot.id}:${platform}:${audienceKey}`);
}

function matchingTrendMechanics(trendBrief = {}, platform = "", slotId = "") {
  const mechanics = Array.isArray(trendBrief.mechanics) ? trendBrief.mechanics : [];
  return mechanics.filter((item) => {
    const platforms = item.platforms || [];
    const slots = item.slots || [];
    return (!platforms.length || platforms.includes(platform)) && (!slots.length || slots.includes(slotId));
  });
}

function chooseTrendMechanic({ trendBrief = {}, platform = "", slot = {}, now = {}, memory = {} }) {
  const candidates = matchingTrendMechanics(trendBrief, platform, slot.id);
  const scored = (candidates.length ? candidates : trendBrief.mechanics || []).map((item) => {
    const key = normalize(item.id || item.name || "");
    const used = entriesSince(memory, now.date, 14).filter((entry) => normalize(entry.trendMechanicId) === key).length;
    return {
      ...item,
      score: 60 - used * 10 + (hashString(`${now.date}:${slot.id}:${platform}:${key}`) % 17),
    };
  });
  return scored.sort((a, b) => b.score - a.score)[0] || null;
}

function proofLineForAudience(audienceKey, proofLibrary = {}) {
  const profile = defaultAudienceProfiles[audienceKey] || defaultAudienceProfiles.coach_independant;
  const proofs = proofLibrary.proofs || [];
  const matching = proofs.find((proof) => {
    const text = normalize(JSON.stringify(proof));
    if (audienceKey === "nutritionniste") return /nutrition|adherence|alimentaire/.test(text);
    if (audienceKey === "salle_de_sport") return /club|studio|salle|equipe/.test(text);
    return /coach|client|programme|whatsapp|excel/.test(text);
  });
  return matching?.claim || matching?.text || matching?.label || profile.proof;
}

function buildHookVariants({ profile, problem, objection, mechanic, platform }) {
  const mechanicHook = mechanic?.hookShape || "";
  const storyHook =
    /salle|studio|club/i.test(profile.label)
      ? "Avant le premier cours, tu dois deja voir quels clients actifs risquent de decrocher."
      : /nutrition/i.test(profile.label)
        ? "Entre deux bilans, le vrai risque c'est de perdre le fil des retours clients."
        : "Ton client t'ecrit entre deux seances: si tu cherches le contexte, il le ressent.";
  const hooks = [
    mechanicHook,
    storyHook,
    `POV: ${problem}, et tu dois quand meme rester pro.`,
    `Le probleme n'est pas ton coaching. C'est tout ce qui gravite autour.`,
    `Ton client ne voit pas ton admin. Il ressent juste si le suivi est clair.`,
    `Avant de vendre plus, il faut deja mieux suivre ceux qui sont la.`,
    `Encore un outil de plus ? Non: moins d'endroits ou chercher.`,
    `Ce moment ou ${problem}, et ou chaque minute compte.`,
  ];
  if (platform === "facebook") hooks.push(`${profile.label}: le suivi client ne peut plus dependre de messages disperses.`);
  if (platform === "instagram_story") hooks.unshift(storyHook);
  if (platform === "tiktok") hooks.push(`Si tu coaches encore avec 4 outils ouverts, regarde ca.`);
  if (objection?.label) hooks.push(`On m'a dit "${objection.label}". Justement.`);
  return unique(hooks).filter((hook) => hook.length >= 18).slice(0, 10);
}

function buildScenario({ profile, problem, objection, platform }) {
  if (platform === "instagram_story") {
    return `Une scene courte montre le moment ou ${problem} cree une decision floue. BYL apparait ensuite comme preuve visuelle, puis le contenu finit par une reponse DM simple pour qualifier la douleur sans forcer la vente.`;
  }
  return [
    `Un pro vit une situation concrete: ${problem}.`,
    `On voit le moment de friction, pas une demo logicielle au depart.`,
    objection?.answer ? `L'objection traitee: ${objection.answer}.` : "",
    `BYL apparait ensuite comme la maniere la plus claire de reprendre le controle.`,
    `Emotion cible: ${profile.desiredEmotion}.`,
  ].filter(Boolean).join(" ");
}

function buildShotPlan({ platform, mechanic, audienceKey }) {
  const base = [
    "Plan 1: friction humaine immediate, visage ou mains, environnement reel.",
    "Plan 2: preuve du desordre: message, planning, tableur, carnet ou retour client.",
    "Plan 3: micro-bascule: le pro retrouve le contexte dans BYL.",
    "Plan 4: insert produit court, mobile vertical lisible, jamais en premier.",
    "Plan 5: payoff humain: reponse envoyee, priorite clarifiee, journee lisible.",
  ];
  if (platform === "instagram_story") {
    return [
      "Plan 1: situation terrain en 1 seconde.",
      "Plan 2: question/sondage lisible.",
      "Plan 3: preuve BYL tres courte si utile.",
    ].join(" ");
  }
  if (platform === "tiktok") base.unshift("Ouverture: texte POV direct, coupe brute, pas de logo intro.");
  if (audienceKey === "salle_de_sport") base[1] = "Plan 2: preuve du desordre: planning equipe, priorites club ou suivi coachs.";
  if (audienceKey === "nutritionniste") base[1] = "Plan 2: preuve du desordre: retour alimentaire, note de bilan ou objectif client.";
  return [...base, mechanic?.editPattern ? `Mecanique montage: ${mechanic.editPattern}.` : ""].filter(Boolean).join(" ");
}

function buildScripts({ hook, scenario, cta, platform }) {
  const shortScene = scenario.split(".").map((part) => part.trim()).filter(Boolean).slice(0, 3);
  const voiceover =
    platform === "instagram_story"
      ? [hook, "Tu le vois souvent dans tes suivis ?", cta].join(" ")
      : [hook, ...shortScene, cta].join(" ");
  const subtitles = [hook, "Le probleme est concret.", "BYL remet le contexte au meme endroit.", cta].slice(
    0,
    platform === "instagram_story" ? 3 : 4,
  );
  return { voiceover, subtitles };
}

function buildProductDiscoveryPath({ profile, problem, proof, platform }) {
  const nativeAction = platform === "instagram_story" ? "reponse DM ou sticker" : platform === "facebook" ? "clic vers essai gratuit" : "visite bio";
  return [
    `Partir d'une scene ou le pro ressent: ${problem}.`,
    "Nommer la friction en langage terrain, sans jargon SaaS.",
    `Montrer BYL comme preuve courte: ${proof}.`,
    `Terminer par une action native: ${nativeAction}.`,
    `Promesse ressentie: ${profile.desiredEmotion}, pas une demonstration exhaustive.`,
  ];
}

function buildConcept({
  slot = {},
  platform = "",
  now = {},
  memory = {},
  growthMemory = {},
  trendBrief = {},
  proofLibrary = {},
  objectionDatabase = {},
}) {
  const audienceKey = chooseAudience({ slot, platform, memory, growthMemory, now });
  const profile = defaultAudienceProfiles[audienceKey] || defaultAudienceProfiles.coach_independant;
  const problem = pick(profile.pains, `${now.date}:${slot.id}:${platform}:pain`) || profile.pains[0];
  const objection = chooseObjection({ audienceKey, platform, slot, now, objectionDatabase });
  const mechanic = chooseTrendMechanic({ trendBrief, platform, slot, now, memory });
  const proof = proofLineForAudience(audienceKey, proofLibrary);
  const hooks = buildHookVariants({ profile, problem, objection, mechanic, platform });
  const selectedHook = hooks[0] || `${profile.label}: ${problem}`;
  const cta = profile.nativeCta[platform] || profile.nativeCta.instagram;
  const scenario = buildScenario({ profile, problem, objection, platform });
  const shotPlan = buildShotPlan({ platform, mechanic, audienceKey });
  const scripts = buildScripts({ hook: selectedHook, scenario, cta, platform });
  const platformDefault = platformDefaults[platform] || platformDefaults.instagram;
  const productDiscoveryPath = buildProductDiscoveryPath({ profile, problem, proof, platform });

  return {
    audienceSegment: audienceKey,
    audience: profile.audience,
    subject: `${profile.label} - ${problem}`,
    angle: `${problem} -> ${proof}`,
    hook: selectedHook,
    hookVariants: hooks,
    problem,
    objection,
    proof,
    trendMechanic: mechanic
      ? {
          id: mechanic.id || normalize(mechanic.name),
          name: mechanic.name || mechanic.id || "mecanique trend",
          instruction: mechanic.instruction || "",
          hookShape: mechanic.hookShape || "",
          editPattern: mechanic.editPattern || "",
          proofMoment: mechanic.proofMoment || "",
        }
      : null,
    scenario,
    pointOfView:
      platform === "facebook"
        ? "point de vue responsable/pro, preuve claire, ton pose"
        : "camera epaule, mobile vertical, gestes reels, lumiere naturelle",
    shotPlan,
    voiceDirection:
      platform === "tiktok"
        ? "voix directe, naturelle, pas institutionnelle"
        : "voix francaise naturelle, humaine, premium, sans lecture robotique",
    interaction:
      platform === "instagram_story"
        ? "question sticker ou sondage avec reponse DM seulement si explicite"
        : platformDefault.interaction,
    hypothesis:
      `Si on part de "${problem}" avec une preuve courte, le contenu doit augmenter les essais gratuits qualifies et l'activation J+7.`,
    productDiscoveryPath,
    discoveryMoment:
      "BYL doit etre decouvert comme la resolution naturelle de la friction, apres le moment humain et avant le CTA.",
    format: platformDefault.format,
    rhythm: platformDefault.rhythm,
    cta,
    scripts,
      mediaRequirements: {
      freshHumanSourcesMin: platform === "instagram_story" ? 3 : 4,
      productInsertTiming: "apres la friction, jamais en premier",
      forbidden: [
        "avatar IA",
        "fond statique texte",
        "image trop lisse",
        "voix robotique",
        "promesse garantie",
        "recyclage d'un ancien media",
      ],
      requiredDetails: [
        "mains ou visage credible",
        "contexte metier reel",
        "ecran mobile BYL lisible",
        "sous-titres courts",
        "variation de plans",
      ],
    },
    preflight: {
      mustPass: [
        "trend_brief_date",
        "strategy_selected",
        "fresh_media_current_day_slot_platform",
        "conversion_score_min_80",
        "creative_quality_min_90",
        "scheduler_dry_run_same_path_ok",
        "connector_ready",
      ],
      publishDecision: "publish_only_if_all_green",
    },
  };
}

function slotPlatforms(slot = {}) {
  return Array.isArray(slot.platforms) && slot.platforms.length ? slot.platforms : ["instagram"];
}

export function buildMarketingAgentDailyPlan({
  now = {},
  slots = [],
  campaign = {},
  marketingMemory = {},
  growthMemory = {},
  trendBrief = {},
  proofLibrary = {},
  objectionDatabase = {},
  recentReports = [],
  learningEntries = [],
} = {}) {
  const memoryEntries = marketingMemory.entries || [];
  const trendStatus = trendBrief.status || "missing";
  const liveTrendVerified = /^(live_verified|manual_verified)/i.test(trendStatus);
  const recentBlocks = recentReports.flatMap((report) => [...(report.results || []), ...(report.skipped || [])]).filter((item) => item.ok === false || item.reason);
  const growthWinners = growthMemory.currentWinners || {};
  const slotPlans = slots.map((slot) => {
    const platform = slotPlatforms(slot)[0];
    const concept = buildConcept({
      slot,
      platform,
      now,
      memory: marketingMemory,
      growthMemory,
      trendBrief,
      proofLibrary,
      objectionDatabase,
    });
    const conversionPotential = Math.min(
      100,
      72 +
        (concept.trendMechanic ? 8 : 0) +
        (concept.proof ? 8 : 0) +
        (concept.hookVariants.length >= 5 ? 6 : 0) -
        recentCount(marketingMemory, now.date, "angle", concept.angle) * 8,
    );
    return {
      slotId: slot.id,
      time: slot.time,
      platforms: slotPlatforms(slot),
      primaryPlatform: platform,
      status: liveTrendVerified ? "strategy_ready_with_live_trend" : "strategy_ready_pending_live_trend_audit",
      concept,
      conversionPotential,
      decision:
        conversionPotential >= 80
          ? "produce_fresh_asset_then_preflight"
          : "regenerate_strategy_before_media",
      blockedIf: [
        "asset frais absent",
        "trend non date pretendu live",
        "media reutilise",
        "conversion score sous 80",
        "rendu IA generique",
      ],
    };
  });

  return {
    version: "2.0.0",
    date: now.date,
    generatedAt: new Date().toISOString(),
    status: liveTrendVerified ? "ready_with_live_trend" : "usable_local_strategy_pending_live_audit",
    mission:
      "Construire des contenus qui meritent d'etre publies: veille, strategie, concept, media frais, preflight, publication, apprentissage.",
    agents: {
      trendScout: {
        status: liveTrendVerified ? "live_verified" : "local_seed_only",
        trendBriefUpdatedAt: trendBrief.updatedAt || "",
        sourceCount: Array.isArray(trendBrief.sources) ? trendBrief.sources.length : 0,
        mechanicCount: Array.isArray(trendBrief.mechanics) ? trendBrief.mechanics.length : 0,
      },
      strategyLead: {
        memoryEntries: memoryEntries.length,
        recentLearningEntries: learningEntries.length,
        recentBlocks: recentBlocks.length,
      },
      creativeDirector: {
        antiPatterns: trendBrief.antiPatterns || [],
        hardRule: "aucun media ancien, aucune story recyclee, aucun rendu IA generique",
      },
      analyst: {
        knownWinningHooks: (growthWinners.hooks || []).slice(0, 5),
        knownWinningFormats: (growthWinners.formats || []).slice(0, 5),
      },
    },
    slots: slotPlans,
  };
}

export function seedFromAgentSlot(agentSlot = {}) {
  const concept = agentSlot.concept || {};
  return {
    subject: concept.subject || "Concept BYL",
    audienceSegment: concept.audienceSegment || "coach_independant",
    angle: concept.angle || "",
    hook: concept.hook || "",
    scenario: concept.scenario || "",
    pointOfView: concept.pointOfView || "",
    shotPlan: concept.shotPlan || "",
    voiceDirection: concept.voiceDirection || "",
    interaction: concept.interaction || "",
    hypothesis: concept.hypothesis || "",
    productDiscoveryPath: concept.productDiscoveryPath || [],
    discoveryMoment: concept.discoveryMoment || "",
    trendMechanicId: concept.trendMechanic?.id || "",
    trendMechanicName: concept.trendMechanic?.name || "",
    conversionPotential: agentSlot.conversionPotential || 0,
  };
}

export function agentPlanMarkdown(agentPlan = {}) {
  const lines = [
    "## Agent marketing v2",
    "",
    `- Statut: ${agentPlan.status || "unknown"}`,
    `- Mission: ${agentPlan.mission || ""}`,
    `- Trend Scout: ${agentPlan.agents?.trendScout?.status || "unknown"} (${agentPlan.agents?.trendScout?.mechanicCount || 0} mecaniques)`,
    `- Blocages recents observes: ${agentPlan.agents?.strategyLead?.recentBlocks || 0}`,
    "",
    "### Decisions par slot",
    "",
  ];

  for (const slot of agentPlan.slots || []) {
    const concept = slot.concept || {};
    lines.push(
      `#### ${slot.time || ""} - ${slot.slotId || ""}`,
      "",
      `- Plateforme: ${(slot.platforms || []).join(", ")}`,
      `- Decision: ${slot.decision}`,
      `- Score potentiel conversion: ${slot.conversionPotential}/100`,
      `- Audience: ${concept.audience || concept.audienceSegment || ""}`,
      `- Probleme: ${concept.problem || ""}`,
      `- Objection: ${concept.objection?.label || ""}`,
      `- Mecanique trend: ${concept.trendMechanic?.name || "a verifier en live"}`,
      `- Hook choisi: ${concept.hook || ""}`,
      `- Preuve: ${concept.proof || ""}`,
      `- CTA: ${concept.cta || ""}`,
      `- Decouverte produit: ${(concept.productDiscoveryPath || []).join(" -> ")}`,
      `- Plans: ${concept.shotPlan || ""}`,
      `- Media requis: ${concept.mediaRequirements?.freshHumanSourcesMin || 0} sources humaines fraiches minimum; produit apres friction.`,
      "",
      "Hooks alternatifs:",
      ...((concept.hookVariants || []).slice(0, 5).map((hook) => `- ${hook}`)),
      "",
      "Script voix off:",
      concept.scripts?.voiceover || "",
      "",
    );
  }

  return lines.join("\n");
}
