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
      Boolean(record?.validatedAt) ||
      Boolean(record?.completedAt)
    )
  );
}
