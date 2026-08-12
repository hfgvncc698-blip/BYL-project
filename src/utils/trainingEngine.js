const FIELD_MAP = {
  series: ["Séries", "series", "séries"],
  repetitions: ["Répétitions", "repetitions", "répétitions", "reps"],
  repos: ["Repos (min:sec)", "Repos", "repos", "pause", "duree_repos", "rest"],
  temps: ["Durée (min:sec)", "duree", "durée", "duree_effort", "temps_effort", "temps", "time"],
  charge: ["Charge (kg)", "charge", "poids", "weight"],
  distance: ["Distance", "distance", "metrage", "m", "meters", "metres", "km"],
  intensite: ["Intensité", "intensite", "intensity", "rpe", "percent_1rm"],
  tempo: ["Tempo", "tempo", "tempo_pattern", "cadence"],
};

export function toSeconds(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") {
    const safe = Math.max(0, value);
    return safe > 10000 ? Math.round(safe / 1000) : safe;
  }

  const s = String(value).trim();
  if (!s) return 0;

  const min = s.match(/(\d+(?:[.,]\d+)?)\s*(min|minute|minutes)/i);
  const sec = s.match(/(\d+(?:[.,]\d+)?)\s*(s|sec|seconde|secondes)/i);
  if (min || sec) {
    const m = min ? Number(min[1].replace(",", ".")) * 60 : 0;
    const x = sec ? Number(sec[1].replace(",", ".")) : 0;
    return Math.max(0, Math.round(m + x));
  }

  if (s.includes(":")) {
    const parts = s.split(":").map((p) => Number(String(p).replace(",", ".")) || 0);
    if (parts.length === 2) return Math.max(0, Math.round(parts[0] * 60 + parts[1]));
    if (parts.length === 3) return Math.max(0, Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]));
  }

  return Math.max(0, Number(s.replace(",", ".")) || 0);
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total} sec`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes < 60) return rest ? `${minutes} min ${rest} sec` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours} h ${mins} min` : `${hours} h`;
}

export function getFieldValue(obj, keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return undefined;
}

function setFieldValue(obj, keys, canonicalKey, value) {
  const existing = keys.find((key) => obj?.[key] !== undefined && obj[key] !== null);
  obj[existing || canonicalKey] = value;
}

function roundTo(value, step) {
  const n = Number(value) || 0;
  const s = Number(step) || 1;
  return Math.round(n / s) * s;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getExerciseName(exercise) {
  return exercise?.nom || exercise?.name || exercise?.title || exercise?.label || "Exercice";
}

const SESSION_TRANSITION_SECONDS = {
  echauffement: 45,
  corps: 105,
  bonus: 75,
  retourCalme: 30,
  exercices: 90,
};

export function flattenSession(session) {
  if (!session || typeof session !== "object") return [];
  if (Array.isArray(session.exercises)) return session.exercises;
  return ["echauffement", "corps", "bonus", "retourCalme", "exercices"]
    .flatMap((key) => (Array.isArray(session[key]) ? session[key] : []));
}

function flattenSessionEntries(session) {
  if (!session || typeof session !== "object") return [];
  if (Array.isArray(session.exercises)) {
    return session.exercises.map((exercise) => ({ exercise, sectionKey: "exercices" }));
  }
  return ["echauffement", "corps", "bonus", "retourCalme", "exercices"].flatMap((sectionKey) =>
    Array.isArray(session[sectionKey])
      ? session[sectionKey].map((exercise) => ({ exercise, sectionKey }))
      : []
  );
}

function getSeriesDetails(exercise) {
  if (Array.isArray(exercise?.seriesDetails)) return exercise.seriesDetails;
  if (Array.isArray(exercise?.series_sets)) return exercise.series_sets;
  return null;
}

function isMetricTracked(exercise, label) {
  return !Array.isArray(exercise?.optionsOrder) || exercise.optionsOrder.includes(label);
}

function getAdvancedSets(exercise) {
  const trackRest = isMetricTracked(exercise, "Repos (min:sec)");
  const trackDuration = isMetricTracked(exercise, "Durée (min:sec)");
  const trackReps = isMetricTracked(exercise, "Répétitions");
  const globalRest = trackRest
    ? toSeconds(getFieldValue(exercise, FIELD_MAP.repos) ?? 0)
    : 0;
  const globalDuration = trackDuration
    ? toSeconds(getFieldValue(exercise, FIELD_MAP.temps) ?? 0)
    : 0;
  const globalReps = trackReps
    ? Number(getFieldValue(exercise, FIELD_MAP.repetitions) ?? 0) || 0
    : 0;

  if (Array.isArray(exercise?.sets) && exercise.sets.length) {
    return exercise.sets.map((set) => ({
      reps: trackReps
        ? Number(set?.reps ?? set?.repetitions ?? set?.["Répétitions"] ?? globalReps) || 0
        : 0,
      restSec: trackRest
        ? toSeconds(set?.restSec ?? set?.rest ?? set?.repos ?? set?.["Repos (min:sec)"] ?? globalRest)
        : 0,
      durationSec: trackDuration
        ? toSeconds(set?.durationSec ?? set?.duration ?? set?.temps ?? set?.["Durée (min:sec)"] ?? globalDuration)
        : 0,
    }));
  }

  const details = getSeriesDetails(exercise);
  if (Array.isArray(details) && details.length) {
    return details.map((set) => ({
      reps: trackReps
        ? Number(set?.reps ?? set?.repetitions ?? set?.["Répétitions"] ?? globalReps) || 0
        : 0,
      restSec: trackRest
        ? toSeconds(set?.restSec ?? set?.rest ?? set?.repos ?? set?.["Repos (min:sec)"] ?? globalRest)
        : 0,
      durationSec: trackDuration
        ? toSeconds(set?.durationSec ?? set?.duration ?? set?.temps ?? set?.["Durée (min:sec)"] ?? globalDuration)
        : 0,
    }));
  }

  return [];
}

function getTempoSecondsPerRep(exercise) {
  if (!isMetricTracked(exercise, "Tempo")) return 4;
  const rawTempo = getFieldValue(exercise, FIELD_MAP.tempo);
  const tempoText = String(rawTempo || "").trim();
  if (tempoText) {
    const parts = tempoText.match(/\d+(?:[.,]\d+)?/g);
    if (parts?.length >= 2) {
      const total = parts.reduce((sum, part) => sum + (Number(String(part).replace(",", ".")) || 0), 0);
      if (total > 0) return clamp(total, 1.5, 10);
    }
    if (/^\d{3,4}$/.test(tempoText)) {
      const total = tempoText.split("").reduce((sum, part) => sum + (Number(part) || 0), 0);
      if (total > 0) return clamp(total, 1.5, 10);
    }
  }

  const explicitTempo = Number(exercise?.tempsParRep ?? exercise?.secondsPerRep ?? exercise?.secPerRep);
  if (Number.isFinite(explicitTempo) && explicitTempo > 1.25) return clamp(explicitTempo, 1.5, 10);
  return 4;
}

function getEffortAndRestForSet(exercise, setIndex) {
  const tempoPerRep = getTempoSecondsPerRep(exercise);
  const globalRest = isMetricTracked(exercise, "Repos (min:sec)")
    ? toSeconds(getFieldValue(exercise, FIELD_MAP.repos) ?? 0)
    : 0;
  const globalDuration = isMetricTracked(exercise, "Durée (min:sec)")
    ? toSeconds(getFieldValue(exercise, FIELD_MAP.temps) ?? 0)
    : 0;
  const globalReps = isMetricTracked(exercise, "Répétitions")
    ? Number(getFieldValue(exercise, FIELD_MAP.repetitions) ?? 0) || 0
    : 0;
  const advancedSets = getAdvancedSets(exercise);

  if (advancedSets.length) {
    const set = advancedSets[Math.min(setIndex, advancedSets.length - 1)] || {};
    const effortSec = set.durationSec > 0
      ? set.durationSec
      : set.reps > 0
        ? set.reps * tempoPerRep
        : 30;
    return {
      effortSec,
      restSecAfter: set.restSec || globalRest || 0,
    };
  }

  return {
    effortSec: globalDuration > 0 ? globalDuration : globalReps > 0 ? globalReps * tempoPerRep : 30,
    restSecAfter: globalRest || 0,
  };
}

export function estimateExerciseDurationSeconds(exercise) {
  if (!exercise) return 0;
  const advancedSets = getAdvancedSets(exercise);
  const setCount = Math.max(1, Number(getFieldValue(exercise, FIELD_MAP.series) ?? advancedSets.length ?? 1) || 1);

  let total = 0;
  for (let setIndex = 0; setIndex < setCount; setIndex += 1) {
    const { effortSec, restSecAfter } = getEffortAndRestForSet(exercise, setIndex);
    total += effortSec;
    if (setIndex < setCount - 1) total += restSecAfter;
  }
  return Math.max(0, Math.round(total));
}

function groupLinkedExercises(list = []) {
  const groups = [];
  let index = 0;
  while (index < list.length) {
    const items = [list[index]];
    while (index < list.length - 1 && (list[index]?.linkNext || list[index]?.exercise?.linkNext)) {
      index += 1;
      items.push(list[index]);
    }
    groups.push(items);
    index += 1;
  }
  return groups;
}

export function estimateSessionDurationSeconds(session, options = {}) {
  const engineEstimated = Number(session?.engineMeta?.estimatedDurationSec ?? session?.estimatedDurationSec);
  const entries = flattenSessionEntries(session);
  if (!entries.length) return Number.isFinite(engineEstimated) && engineEstimated > 0 ? Math.round(engineEstimated) : 0;

  const computed = groupLinkedExercises(entries).reduce((sum, group) => {
    const maxSets = Math.max(
      ...group.map(({ exercise }) => {
        const advancedSets = getAdvancedSets(exercise);
        return Math.max(1, Number(getFieldValue(exercise, FIELD_MAP.series) ?? advancedSets.length ?? 1) || 1);
      })
    );

    let groupTotal = 0;
    for (let setIndex = 0; setIndex < maxSets; setIndex += 1) {
      group.forEach(({ exercise }, exerciseIndex) => {
        const { effortSec, restSecAfter } = getEffortAndRestForSet(exercise, setIndex);
        groupTotal += effortSec;
        const isLastExerciseInGroup = exerciseIndex === group.length - 1;
        const isLastSet = setIndex === maxSets - 1;
        if (!isLastExerciseInGroup || !isLastSet) groupTotal += restSecAfter;
      });
    }

    const mainEntry = group.find(({ sectionKey }) => sectionKey === "corps") || group[0];
    groupTotal += SESSION_TRANSITION_SECONDS[mainEntry?.sectionKey] ?? 60;
    return sum + groupTotal;
  }, 0);

  const baseline = Number.isFinite(engineEstimated) && engineEstimated > 0
    ? Math.max(Math.round(computed), Math.round(engineEstimated))
    : Math.max(0, Math.round(computed));
  if (options?.ignoreTimingCalibration === true) return baseline;

  const timingFactor = Number(session?.timingCalibration?.factor);
  const safeFactor = Number.isFinite(timingFactor)
    ? Math.max(0.7, Math.min(1.4, timingFactor))
    : 1;
  return Math.max(0, Math.round(baseline * safeFactor));
}

export function estimateSessionDurationBreakdown(session) {
  const list = flattenSession(session);
  return list.map((exercise, index) => ({
    exerciseIndex: index,
    exerciseName: getExerciseName(exercise),
    seconds: estimateExerciseDurationSeconds(exercise),
  }));
}

export function getExerciseTimingAdjustmentTargets(exerciseTimings = [], direction = -1) {
  if (!Array.isArray(exerciseTimings) || !direction) return [];

  const sortedEntries = exerciseTimings
    .map((entry) => {
      const exerciseIndex = Number(entry?.exerciseIndex);
      const plannedSeconds = Number(entry?.plannedSeconds);
      const actualSeconds = Number(entry?.actualSeconds);
      if (!Number.isFinite(exerciseIndex) || !Number.isFinite(plannedSeconds) || !Number.isFinite(actualSeconds)) {
        return null;
      }
      if (plannedSeconds <= 0 || actualSeconds <= 0) return null;
      const deltaSeconds = actualSeconds - plannedSeconds;
      const ratio = actualSeconds / plannedSeconds;
      return {
        ...entry,
        exerciseIndex,
        plannedSeconds,
        actualSeconds,
        deltaSeconds,
        ratio,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (direction < 0) return b.deltaSeconds - a.deltaSeconds || b.ratio - a.ratio;
      return a.deltaSeconds - b.deltaSeconds || a.ratio - b.ratio;
    });

  const thresholdEntries = sortedEntries.filter((entry) => {
    if (direction < 0) return entry.deltaSeconds >= 30 || entry.ratio >= 1.15;
    return entry.deltaSeconds <= -30 || entry.ratio <= 0.85;
  });

  return (thresholdEntries.length ? thresholdEntries : sortedEntries)
    .map((entry) => entry.exerciseIndex);
}

function normalizeEnergy(value) {
  const v = String(value || "").trim().toLowerCase();
  if (["low", "basse", "faible"].includes(v)) return "low";
  if (["high", "bonne", "haute"].includes(v)) return "high";
  return "normal";
}

function normalizePainLevel(value) {
  const v = String(value || "").trim().toLowerCase();
  if (["mild", "legere", "légère", "faible"].includes(v)) return "mild";
  if (["moderate", "moyenne", "gene", "gêne"].includes(v)) return "moderate";
  if (["severe", "forte", "important"].includes(v)) return "severe";
  return "";
}

export function evaluateSportAdaptation({ rating, energy = "normal", energyLevel, pain = false, painLevel = "", completionPct = 100 } = {}) {
  const r = Number(rating);
  const safeRating = Number.isFinite(r) ? clamp(Math.round(r), 1, 5) : null;
  const safeEnergy = normalizeEnergy(energyLevel || energy);
  const safePainLevel = normalizePainLevel(painLevel);
  const hasPain = Boolean(pain) || Boolean(safePainLevel);
  const pct = clamp(Number(completionPct) || 0, 0, 100);

  if (hasPain && (safePainLevel === "moderate" || safePainLevel === "severe")) {
    return {
      action: "coach_review",
      direction: -1,
      intensity: safePainLevel === "severe" ? "strong" : "light",
      reason: "Douleur signalée : l'intensité est sécurisée et le coach doit vérifier.",
      shouldAdapt: safePainLevel !== "severe",
      alertCoach: true,
    };
  }

  if (safeRating == null) {
    return {
      action: "no_feedback",
      direction: 0,
      intensity: "none",
      reason: "Aucune note exploitable.",
      shouldAdapt: false,
      alertCoach: false,
    };
  }

  if (pct < 70) {
    return {
      action: "repeat_or_reduce",
      direction: -1,
      intensity: "light",
      reason: "Séance incomplète : on privilégie une répétition ou une légère baisse.",
      shouldAdapt: true,
      alertCoach: false,
    };
  }

  if (safeRating <= 2 && safeEnergy === "high" && !hasPain) {
    return {
      action: "increase",
      direction: 1,
      intensity: "light",
      reason: "Séance facile, bonne énergie et aucune douleur.",
      shouldAdapt: true,
      alertCoach: false,
    };
  }

  if (safeRating <= 2 && safeEnergy !== "low" && !hasPain) {
    return {
      action: "increase",
      direction: 1,
      intensity: "very_light",
      reason: "Séance facile sans signal de fatigue.",
      shouldAdapt: true,
      alertCoach: false,
    };
  }

  if (safeRating >= 4 || safeEnergy === "low" || hasPain) {
    return {
      action: safeRating >= 5 || safeEnergy === "low" ? "reduce" : "maintain_safe",
      direction: safeRating >= 5 || safeEnergy === "low" ? -1 : 0,
      intensity: "light",
      reason: hasPain
        ? "Douleur légère signalée : pas de progression automatique."
        : "Séance difficile ou énergie basse : on sécurise la progression.",
      shouldAdapt: safeRating >= 5 || safeEnergy === "low",
      alertCoach: hasPain,
    };
  }

  return {
    action: "maintain",
    direction: 0,
    intensity: "none",
    reason: "Charge adaptée : maintien.",
    shouldAdapt: false,
    alertCoach: false,
  };
}

export function applyProgressionStrategyToDecision(decision = {}, strategyValue = "linear") {
  const strategy = ["secure", "linear", "undulating"].includes(strategyValue)
    ? strategyValue
    : "linear";
  const next = {
    ...(decision || {}),
    progressionStrategy: strategy,
  };

  if (!next.shouldAdapt || !next.direction) return next;

  if (strategy === "secure" && next.direction > 0) {
    next.intensity = "very_light";
    next.reason = `${next.reason || "Progression proposée."} Mode sécurisé : hausse volontairement limitée.`;
    return next;
  }

  if (strategy === "undulating" && next.direction > 0) {
    next.fieldPriority = ["repetitions", "duration", "charge", "distance", "rest"];
    next.reason = `${next.reason || "Progression proposée."} Mode ondulatoire : priorité au volume avant la charge.`;
    return next;
  }

  if (strategy === "linear") {
    next.reason = `${next.reason || "Progression proposée."} Mode linéaire : progression régulière.`;
  }

  return next;
}

function isTrainingLike(exercise, sectionKey = "") {
  const key = String(sectionKey || "").toLowerCase();
  if (key.includes("echauffement") || key.includes("retourcalme")) return false;
  const collectionName = String(exercise?.__collection || exercise?.collection || "").toLowerCase();
  if (collectionName.includes("warmup") || collectionName.includes("cooldown")) return false;
  return true;
}

function getAdaptationScale(decision = {}) {
  if (decision.intensity === "strong") return 1.5;
  if (decision.intensity === "light") return 1;
  if (decision.intensity === "very_light") return 0.5;
  return 0;
}

function adaptExercise(exercise, decision) {
  const next = structuredClone(exercise || {});
  const direction = Number(decision?.direction) || 0;
  const scale = getAdaptationScale(decision);
  if (!direction || !scale) return { exercise: next, changed: false, field: null, detail: null };

  const charge = Number(getFieldValue(next, FIELD_MAP.charge));
  const reps = Number(getFieldValue(next, FIELD_MAP.repetitions));
  const duration = toSeconds(getFieldValue(next, FIELD_MAP.temps));
  const distance = Number(getFieldValue(next, FIELD_MAP.distance));
  const rest = toSeconds(getFieldValue(next, FIELD_MAP.repos));
  const exerciseName = next?.nom || next?.name || next?.title || next?.label || "Exercice";
  const changedResult = (field, before, after) => ({
    exercise: next,
    changed: true,
    field,
    detail: {
      field,
      exerciseName,
      before,
      after,
    },
  });

  const adaptField = (field) => {
    if (field === "charge" && Number.isFinite(charge) && charge > 0) {
    const factor = direction > 0 ? 1 + 0.025 * scale : 1 - 0.05 * scale;
    const nextCharge = roundTo(Math.max(0, charge * factor), 0.25);
    setFieldValue(next, FIELD_MAP.charge, "Charge (kg)", nextCharge);
    return changedResult("charge", charge, nextCharge);
    }

    if (field === "repetitions" && Number.isFinite(reps) && reps > 0) {
    const delta = direction > 0 && scale < 1 ? 0 : Math.sign(direction) * Math.max(1, Math.round(scale));
    if (!delta) return { exercise: next, changed: false, field: null, detail: null };
    const nextReps = Math.max(1, Math.round(reps + delta));
    setFieldValue(next, FIELD_MAP.repetitions, "Répétitions", nextReps);
    return changedResult("repetitions", reps, nextReps);
    }

    if (field === "duration" && duration > 0) {
    const nextDuration = Math.max(15, duration + direction * 15 * scale);
    setFieldValue(next, FIELD_MAP.temps, "Durée (min:sec)", nextDuration);
    return changedResult("duration", duration, nextDuration);
    }

    if (field === "distance" && Number.isFinite(distance) && distance > 0) {
    const factor = direction > 0 ? 1 + 0.05 * scale : 1 - 0.05 * scale;
    const nextDistance = Math.max(1, Math.round(distance * factor));
    setFieldValue(next, FIELD_MAP.distance, "Distance", nextDistance);
    return changedResult("distance", distance, nextDistance);
    }

    if (field === "rest" && rest > 0) {
    const nextRest = direction > 0 ? Math.max(15, rest - 15 * scale) : rest + 15 * scale;
    setFieldValue(next, FIELD_MAP.repos, "Repos (min:sec)", nextRest);
    return changedResult("rest", rest, nextRest);
    }

    return { exercise: next, changed: false, field: null, detail: null };
  };

  const defaultPriority = ["charge", "repetitions", "duration", "distance", "rest"];
  const memoryPriority = Array.isArray(decision?.fieldPriority) ? decision.fieldPriority : [];
  const strictPriority = decision?.strictFieldPriority === true;
  const priority = strictPriority
    ? memoryPriority.filter((field) => defaultPriority.includes(field))
    : [
        ...memoryPriority.filter((field) => defaultPriority.includes(field)),
        ...defaultPriority.filter((field) => !memoryPriority.includes(field)),
      ];

  for (const field of priority) {
    const result = adaptField(field);
    if (result.changed) return result;
  }

  return { exercise: next, changed: false, field: null, detail: null };
}

export function applySportProgressionToSession(session, decision) {
  if (!session || !decision?.shouldAdapt || !decision.direction) {
    return { session: structuredClone(session || {}), changedCount: 0, changedFields: [], changedDetails: [] };
  }

  const nextSession = structuredClone(session);
  const changedFields = [];
  const changedDetails = [];
  let changedCount = 0;
  const targetIndexes = Array.isArray(decision.targetExerciseIndexes)
    ? decision.targetExerciseIndexes.map((value) => Number(value)).filter(Number.isFinite)
    : [];
  const targetRank = new Map(targetIndexes.map((value, index) => [value, index]));
  const maxChanges =
    decision.direction < 0
      ? decision.intensity === "strong" ? 6 : 4
      : decision.intensity === "very_light" ? 2 : 4;

  const candidates = [];
  const collectCandidates = () => {
    const collectList = (list, sectionKey) => {
      if (!Array.isArray(list)) return;
      list.forEach((exercise, index) => {
        const exerciseIndex = candidates.length
          ? Math.max(...candidates.map((candidate) => candidate.exerciseIndex)) + 1
          : 0;
        if (!isTrainingLike(exercise, sectionKey)) {
          candidates.push({ sectionKey, index, exerciseIndex, skipped: true });
          return;
        }
        candidates.push({
          sectionKey,
          index,
          exerciseIndex,
          rank: targetRank.has(exerciseIndex) ? targetRank.get(exerciseIndex) : Number.MAX_SAFE_INTEGER,
        });
      });
    };

    if (Array.isArray(nextSession.exercises)) {
      collectList(nextSession.exercises, "exercises");
      return;
    }

    ["echauffement", "corps", "bonus", "retourCalme", "exercices"].forEach((sectionKey) => {
      collectList(nextSession[sectionKey], sectionKey);
    });
  };

  collectCandidates();

  const adaptableCandidates = candidates
    .filter((candidate) => !candidate.skipped)
    .filter((candidate) => !targetRank.size || targetRank.has(candidate.exerciseIndex))
    .sort((a, b) => a.rank - b.rank || a.exerciseIndex - b.exerciseIndex);
  adaptableCandidates.some((candidate) => {
    if (changedCount >= maxChanges) return true;
    const list = nextSession[candidate.sectionKey];
    const exercise = Array.isArray(list) ? list[candidate.index] : null;
    if (!exercise) return false;

    const result = adaptExercise(exercise, decision);
    if (result.changed) {
      list[candidate.index] = result.exercise;
      changedCount += 1;
      changedFields.push(result.field);
      if (result.detail) {
        changedDetails.push({
          ...result.detail,
          exerciseIndex: candidate.exerciseIndex,
        });
      }
    }
    return false;
  });

  return { session: nextSession, changedCount, changedFields, changedDetails };
}
