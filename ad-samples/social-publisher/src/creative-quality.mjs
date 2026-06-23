const defaultRecentHours = 72;
const defaultMinimumScore = 80;
const publishableProductionStatuses = new Set(["fresh_asset_attached", "auto_approved_daily_asset"]);

const requiredStrategyFields = [
  "angle",
  "pillar",
  "audience",
  "formatFamily",
  "humanScenario",
  "pointOfView",
  "shotPlan",
  "voiceDirection",
  "interactionMechanic",
  "primaryHypothesis",
];

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(value = "") {
  return new Set(
    normalizeText(value)
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

function similarityScore(a = "", b = "") {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

function publishedEntries(variant = {}) {
  return Object.entries(variant.publishedPosts || {})
    .map(([platform, post]) => ({
      platform,
      publishedAt: post?.publishedAt || null,
      time: post?.publishedAt ? Date.parse(post.publishedAt) : 0,
      providerId: post?.providerId || null,
      postUrl: post?.postUrl || null,
    }))
    .filter((entry) => entry.time || entry.providerId || entry.postUrl);
}

export function mostRecentPublishedAt(variant = {}) {
  const latest = publishedEntries(variant).sort((a, b) => b.time - a.time)[0];
  return latest?.publishedAt || null;
}

export function wasPublishedRecently(variant = {}, hours = defaultRecentHours, now = Date.now()) {
  return publishedEntries(variant).some((entry) => entry.time && now - entry.time < hours * 60 * 60 * 1000);
}

export function creativeStrategySummary(variant = {}) {
  const strategy = variant.creativeStrategy || {};
  return {
    angle: strategy.angle || "",
    pillar: strategy.pillar || "",
    audience: strategy.audience || "",
    formatFamily: strategy.formatFamily || "",
    humanScenario: strategy.humanScenario || "",
    pointOfView: strategy.pointOfView || "",
    shotPlan: strategy.shotPlan || "",
    voiceDirection: strategy.voiceDirection || "",
    interactionMechanic: strategy.interactionMechanic || "",
    primaryHypothesis: strategy.primaryHypothesis || "",
  };
}

function copySignature(copy = {}) {
  return normalizeText([copy.hook, copy.prompt, copy.caption, copy.cta].filter(Boolean).join(" ")).slice(0, 180);
}

function copyText(copy = {}) {
  return [copy.hook, copy.prompt, copy.caption, copy.cta].filter(Boolean).join(" ");
}

function mediaSignature(variant = {}, platform, copy = {}) {
  const platformSpecific = variant.platformCopy?.[platform] || {};
  return (
    (Array.isArray(copy.carouselMediaUrls) ? copy.carouselMediaUrls.join("|") : "") ||
    (Array.isArray(copy.mediaUrls) ? copy.mediaUrls.join("|") : "") ||
    copy.freshDailyMediaUrl ||
    copy.dailyMediaUrl ||
    copy.generatedMediaUrl ||
    copy.dailyVideoPath ||
    copy.mediaUrl ||
    copy.publishMediaUrl ||
    platformSpecific.freshDailyMediaUrl ||
    platformSpecific.dailyMediaUrl ||
    platformSpecific.generatedMediaUrl ||
    platformSpecific.dailyVideoPath ||
    variant.mediaUrls?.[platform] ||
    platformSpecific.mediaUrl ||
    platformSpecific.publishMediaUrl ||
    variant.publishMediaUrl ||
    variant.publishVideoPath ||
    variant.videoPath ||
    ""
  );
}

function strategyMatches(a = {}, b = {}) {
  const fields = ["angle", "pillar", "audience", "formatFamily", "pointOfView"];
  return fields.filter((field) => normalizeText(a[field]) && normalizeText(a[field]) === normalizeText(b[field]));
}

function copyForPlatform(variant = {}, platform) {
  return variant.platformCopy?.[platform] || {
    caption: variant.caption,
    hook: variant.hook,
    mediaUrl: variant.mediaUrls?.[platform] || variant.mediaUrl,
  };
}

function qualityScore(errors = [], warnings = []) {
  return Math.max(0, 100 - errors.length * 25 - warnings.length * 10);
}

export function scoreVariantForSlot({ variant, slot, weekIds = [], force = false, now = Date.now() }) {
  let score = 0;
  const strategy = variant.creativeStrategy || {};
  const recent = wasPublishedRecently(variant, defaultRecentHours, now);
  const platformAlreadyUsed = slot.platforms.some((platform) => variant.publishedPosts?.[platform]);

  if (weekIds.includes(variant.id)) score += 45;
  if (variant.status === "approved") score += 18;
  if (variant.status === "draft") score += 8;
  if (strategy.angle) score += 10;
  if (strategy.audience) score += 8;
  if (strategy.pointOfView) score += 6;
  if (strategy.shotPlan) score += 6;
  if (slot.platforms.includes("instagram_story") && normalizeText(strategy.formatFamily).includes("story")) score += 14;
  if (slot.platforms.includes("instagram") && normalizeText(strategy.formatFamily).includes("reel")) score += 10;
  if (slot.platforms.includes("facebook") && normalizeText(strategy.formatFamily).includes("b2b")) score += 10;
  if (slot.platforms.includes("tiktok") && normalizeText(strategy.formatFamily).includes("short")) score += 10;

  if (!force && recent) score -= 120;
  if (!force && platformAlreadyUsed) score -= 90;

  return score;
}

export function chooseDiverseVariant({ campaign, weekIds = [], slot, force = false, now = Date.now() }) {
  const candidates = (campaign.variants || []).filter(Boolean);
  if (!candidates.length) return null;

  const eligible = candidates
    .filter((variant) => force || ["approved", "draft", "published"].includes(variant.status))
    .map((variant) => ({
      variant,
      score: scoreVariantForSlot({ variant, slot, weekIds, force, now }),
      recent: wasPublishedRecently(variant, defaultRecentHours, now),
    }))
    .sort((a, b) => b.score - a.score);

  if (force) return eligible[0]?.variant || candidates[0];

  const platforms = Array.isArray(slot?.platforms) && slot.platforms.length ? slot.platforms : ["instagram"];
  const qualityEligible = eligible.filter(({ variant }) =>
    platforms.every((platform) =>
      validateCreativeQuality({
        campaign,
        variant,
        platform,
        copy: copyForPlatform(variant, platform),
        now,
      }).ok,
    ),
  );

  return qualityEligible[0]?.variant || null;
}

export function validateCreativeQuality({ campaign, variant, platform, copy = {}, force = false, now = Date.now() }) {
  const errors = [];
  const warnings = [];
  const strategy = creativeStrategySummary(variant);
  const missingFields = requiredStrategyFields.filter((field) => !strategy[field]);
  const signature = copySignature(copy);
  const media = mediaSignature(variant, platform, copy);

  if (variant.publishedPosts?.[platform]) {
    errors.push(`platform_variant_already_published:${platform}`);
  }
  if (missingFields.length) {
    errors.push(`creative_strategy_missing:${missingFields.join(",")}`);
  }
  if (!copy.caption || normalizeText(copy.caption).length < 24) {
    errors.push("caption_missing_or_too_short");
  }
  if (!strategy.angle || !strategy.humanScenario) {
    errors.push("angle_or_human_scenario_missing");
  }
  if (copy.productionStatus && !publishableProductionStatuses.has(copy.productionStatus)) {
    errors.push(`media_production_not_publishable:${copy.productionStatus}`);
  }
  if (copy.qualityReview && copy.qualityReview.ok === false) {
    errors.push(`media_quality_review_failed:${(copy.qualityReview.reasons || []).join(",") || "unknown"}`);
  }
  if (platform === "instagram_story") {
    const storyMedia =
      copy.freshDailyMediaUrl ||
      copy.dailyMediaUrl ||
      copy.generatedMediaUrl ||
      copy.dailyVideoPath ||
      copy.mediaUrl ||
      copy.publishMediaUrl ||
      "";
    if (!storyMedia) errors.push("story_dedicated_media_missing");
    const feedMedia = new Set(
      [
        variant.mediaUrls?.instagram,
        variant.instagramMediaUrl,
        variant.publishMediaUrl,
        variant.platformCopy?.instagram?.freshDailyMediaUrl,
        variant.platformCopy?.instagram?.dailyMediaUrl,
        variant.platformCopy?.instagram?.generatedMediaUrl,
        variant.platformCopy?.instagram?.dailyVideoPath,
        variant.platformCopy?.instagram?.mediaUrl,
        variant.platformCopy?.instagram?.publishMediaUrl,
      ].filter(Boolean),
    );
    if (storyMedia && feedMedia.has(storyMedia)) errors.push("story_reuses_reel_media");
    const storyText = normalizeText([copy.caption, copy.hook, copy.prompt].filter(Boolean).join(" "));
    const reelText = normalizeText(variant.platformCopy?.instagram?.caption || "");
    if (storyText && reelText && (storyText === reelText || reelText.includes(storyText))) {
      errors.push("story_reuses_reel_copy");
    }
  }

  if (!force && wasPublishedRecently(variant, defaultRecentHours, now)) {
    errors.push(`variant_recently_published:${mostRecentPublishedAt(variant)}`);
  }

  for (const other of campaign.variants || []) {
    if (!other || other.id === variant.id) continue;
    const otherCopy = other.platformCopy?.[platform] || {};
    const otherMedia = mediaSignature(other, platform, otherCopy);
    const otherPublishedOnPlatform = Boolean(other.publishedPosts?.[platform]);
    const recent = wasPublishedRecently(other, defaultRecentHours, now);

    if (otherPublishedOnPlatform) {
      if (signature && signature === copySignature(otherCopy)) {
        errors.push(`duplicate_platform_copy_ever:${platform}:${other.id}`);
      }
      if (media && media === otherMedia) {
        errors.push(`duplicate_platform_media_ever:${platform}:${other.id}`);
      }
      const platformCopyOverlap = similarityScore(copyText(copy), copyText(otherCopy));
      if (platformCopyOverlap >= 0.86) {
        errors.push(`duplicate_platform_copy_similarity_ever:${platform}:${other.id}:${platformCopyOverlap.toFixed(2)}`);
      }
    }

    if (!recent) continue;
    const matches = strategyMatches(strategy, creativeStrategySummary(other));
    const sameAngle = normalizeText(strategy.angle) && normalizeText(strategy.angle) === normalizeText(creativeStrategySummary(other).angle);
    if (sameAngle) {
      errors.push(`duplicate_recent_angle:${other.id}:${defaultRecentHours}h`);
    }
    if (matches.length >= 3) {
      errors.push(`recent_strategy_overlap_blocked:${other.id}:${matches.join(",")}`);
    }
    if (
      platform === "instagram_story" &&
      normalizeText(strategy.interactionMechanic) &&
        normalizeText(strategy.interactionMechanic) === normalizeText(creativeStrategySummary(other).interactionMechanic)
    ) {
      errors.push(`duplicate_recent_story_mechanic:${other.id}:${defaultRecentHours}h`);
    }
    if (signature && signature === copySignature(otherCopy)) {
      errors.push(`duplicate_recent_copy:${other.id}`);
    }
    const overlapScore = similarityScore(copyText(copy), copyText(otherCopy));
    if (overlapScore >= 0.72) {
      errors.push(`duplicate_recent_copy_similarity:${other.id}:${overlapScore.toFixed(2)}`);
    }
    if (media && media === otherMedia) {
      errors.push(`duplicate_recent_media:${other.id}`);
    }
  }

  const score = qualityScore(errors, warnings);
  if (score < defaultMinimumScore) {
    errors.push(`quality_score_below_minimum:${score}/${defaultMinimumScore}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    score,
    minimumScore: defaultMinimumScore,
    recentWindowHours: defaultRecentHours,
    strategy,
    signature,
    media,
  };
}
