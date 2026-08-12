const MIN_ACTUAL_SECONDS = 5 * 60;
const MAX_ACTUAL_SECONDS = 4 * 60 * 60;
const MIN_RATIO = 0.4;
const MAX_RATIO = 2.5;
const MAX_SAMPLES = 12;
const MIN_FACTOR = 0.7;
const MAX_FACTOR = 1.4;

const finitePositive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function robustMean(values = []) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 1;
  const trimmed = sorted.length >= 5 ? sorted.slice(1, -1) : sorted;
  return trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
}

export function updateSessionTimingCalibration(
  currentProfile = {},
  {
    basePlannedDurationSec,
    actualDurationSec,
    completionId = "",
    completedAt = new Date().toISOString(),
  } = {}
) {
  const planned = finitePositive(basePlannedDurationSec);
  const actual = finitePositive(actualDurationSec);
  const ratio = planned > 0 ? actual / planned : 0;

  if (
    !planned ||
    actual < MIN_ACTUAL_SECONDS ||
    actual > MAX_ACTUAL_SECONDS ||
    ratio < MIN_RATIO ||
    ratio > MAX_RATIO
  ) {
    return { profile: currentProfile, accepted: false, ratio: ratio || null };
  }

  const previousSamples = Array.isArray(currentProfile?.recentSamples)
    ? currentProfile.recentSamples
        .map((sample) => ({
          ratio: Number(sample?.ratio),
          plannedSec: finitePositive(sample?.plannedSec),
          actualSec: finitePositive(sample?.actualSec),
          completionId: String(sample?.completionId || ""),
          completedAt: sample?.completedAt || "",
        }))
        .filter((sample) => Number.isFinite(sample.ratio))
    : [];
  if (completionId && previousSamples.some((sample) => sample.completionId === completionId)) {
    return { profile: currentProfile, accepted: false, duplicate: true, ratio };
  }
  const recentSamples = [
    ...previousSamples,
    {
      ratio: Number(ratio.toFixed(4)),
      plannedSec: Math.round(planned),
      actualSec: Math.round(actual),
      completionId: String(completionId || ""),
      completedAt,
    },
  ].slice(-MAX_SAMPLES);

  const observedFactor = robustMean(recentSamples.map((sample) => sample.ratio));
  // Start cautiously, then trust the personal history fully after five
  // reliable sessions. This keeps one unusual workout from skewing estimates.
  const confidence = Math.min(1, recentSamples.length / 5);
  const factor = clamp(1 + (observedFactor - 1) * confidence, MIN_FACTOR, MAX_FACTOR);

  return {
    accepted: true,
    ratio,
    profile: {
      version: 1,
      factor: Number(factor.toFixed(4)),
      observedFactor: Number(observedFactor.toFixed(4)),
      confidence: Number(confidence.toFixed(2)),
      sampleCount: recentSamples.length,
      recentSamples,
      updatedAt: completedAt,
      source: "validated_player_sessions",
    },
  };
}

export function applyTimingCalibrationToSessions(sessions = [], profile = {}) {
  const factor = Number(profile?.factor);
  if (!Number.isFinite(factor) || factor <= 0) return sessions;
  return (sessions || []).map((session) => ({
    ...session,
    timingCalibration: {
      version: 1,
      factor,
      confidence: Number(profile?.confidence) || 0,
      sampleCount: Number(profile?.sampleCount) || 0,
      updatedAt: profile?.updatedAt || "",
      source: profile?.source || "validated_player_sessions",
    },
  }));
}

export function getSessionTimingFactor(session = {}) {
  const factor = Number(session?.timingCalibration?.factor);
  return Number.isFinite(factor) && factor > 0 ? clamp(factor, MIN_FACTOR, MAX_FACTOR) : 1;
}
