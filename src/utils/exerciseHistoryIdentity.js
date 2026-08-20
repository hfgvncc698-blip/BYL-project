export const normalizeExerciseHistoryToken = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const collectTranslationNames = (translations = {}) => {
  if (!translations || typeof translations !== "object") return [];
  return Object.values(translations).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    return [entry.nom, entry.name, entry.title, entry.label];
  });
};

export function getExerciseHistoryIdentity(exercise = {}) {
  const ids = [
    exercise?.id,
    exercise?._id,
    exercise?.exerciseId,
    exercise?.exercise_id,
    ...(Array.isArray(exercise?.exerciseIds) ? exercise.exerciseIds : []),
    exercise?.uid,
    exercise?.__docId,
    exercise?.sourceId,
    exercise?.bankId,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const names = [
    exercise?.nom,
    exercise?.name,
    exercise?.title,
    exercise?.label,
    exercise?.exerciseName,
    exercise?.nameFr,
    exercise?.nameEn,
    exercise?.nomFr,
    exercise?.nomEn,
    exercise?.displayName,
    ...(Array.isArray(exercise?.exerciseNames) ? exercise.exerciseNames : []),
    ...(Array.isArray(exercise?.aliases) ? exercise.aliases : []),
    ...(Array.isArray(exercise?.alias) ? exercise.alias : []),
    ...(Array.isArray(exercise?.synonyms) ? exercise.synonyms : []),
    ...collectTranslationNames(exercise?.translations),
  ]
    .map(normalizeExerciseHistoryToken)
    .filter(Boolean);

  return {
    ids: Array.from(new Set(ids)),
    names: Array.from(new Set(names)),
    primaryName:
      exercise?.nom ||
      exercise?.name ||
      exercise?.title ||
      exercise?.label ||
      exercise?.exerciseName ||
      "Exercice",
  };
}

export function exerciseHistoryMatches(snapshot = {}, exercise = {}) {
  if (!snapshot || !exercise) return false;
  const stored = getExerciseHistoryIdentity(snapshot);
  const current = getExerciseHistoryIdentity(exercise);

  if (current.ids.some((id) => stored.ids.includes(id))) return true;

  // Exact after accent/punctuation normalization on purpose: sharing a generic
  // word such as "poulie" or "développé" must not merge two exercises.
  return current.names.some((name) => stored.names.includes(name));
}

const getIndexedValues = (value) => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .sort(([a], [b]) => {
      const left = Number(a);
      const right = Number(b);
      if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
      return String(a).localeCompare(String(b), "fr", { numeric: true });
    })
    .map(([, item]) => item)
    .filter(Boolean);
};

const getSessionExercises = (session = {}) => {
  if (Array.isArray(session)) return session;
  const direct = getIndexedValues(session?.exercises || session?.exercices);
  if (direct.length) return direct;
  return ["echauffement", "corps", "bonus", "retourCalme"]
    .flatMap((key) => getIndexedValues(session?.[key]));
};

/**
 * Returns the detailed snapshot when it exists. For legacy completion records
 * (date + percentage only), returns an occurrence marker if the completed
 * session still contains the exercise. The marker is deliberately metric-free:
 * old player versions did not persist the performed sets, so inventing loads or
 * repetitions from today's programme would corrupt the RM history.
 */
export function findCompletionExerciseSnapshot(record = {}, exercise = {}) {
  const snapshots = Array.isArray(record?.exerciseSnapshots)
    ? record.exerciseSnapshots
    : [];
  const detailed = snapshots.find((snapshot) =>
    exerciseHistoryMatches(snapshot, exercise)
  );
  if (detailed) return detailed;

  // A modern record with snapshots represents only exercises actually
  // performed. Do not turn omitted exercises into legacy occurrences.
  if (snapshots.length > 0) return null;

  const sessions = getIndexedValues(record?.programSessions);
  const sessionIndex = Number(record?.sessionIndex);
  if (!Number.isInteger(sessionIndex) || !sessions[sessionIndex]) return null;
  const matched = getSessionExercises(sessions[sessionIndex]).find((candidate) =>
    exerciseHistoryMatches(candidate, exercise)
  );
  if (!matched) return null;

  const identity = getExerciseHistoryIdentity(matched);
  return {
    exerciseIndex: null,
    exerciseId: identity.ids[0] || "",
    exerciseIds: identity.ids,
    exerciseName: identity.primaryName,
    exerciseNames: identity.names,
    sets: [],
    summary: {},
    legacyDetailsUnavailable: true,
  };
}

export function isValidatedExerciseCompletion(record = {}) {
  const status = String(record?.status || "").trim().toLowerCase();
  return (
    !record?.isPartial &&
    (
      status === "validée" ||
      status === "validee" ||
      status === "done" ||
      status === "completed" ||
      status === "terminée" ||
      status === "terminee" ||
      Boolean(record?.dateEffectuee) ||
      Boolean(record?.validatedAt) ||
      Boolean(record?.completedAt)
    )
  );
}
