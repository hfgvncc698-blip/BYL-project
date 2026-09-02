const COMPLETED_STATUSES = new Set([
  "validée",
  "validee",
  "terminée",
  "terminee",
  "done",
  "completed",
]);

const PARTIAL_STATUSES = new Set([
  "en_cours",
  "in_progress",
  "partial",
]);

export function isSessionValidatedRecord(session) {
  if (!session) return false;
  const status = String(session.status || "").trim().toLowerCase();
  if (session.isPartial === true || PARTIAL_STATUSES.has(status)) return false;

  if (
    COMPLETED_STATUSES.has(status) ||
    session.validated === true ||
    session.isValidated === true ||
    Boolean(
      session.dateEffectuee ||
        session.completedAt ||
        session.validatedAt ||
        session.finishedAt ||
        session.playedAt
    )
  ) {
    return true;
  }

  const progress = Number(
    session.pourcentageTermine ??
      session.completionPct ??
      session.completionPercent
  );
  return Number.isFinite(progress) && progress >= 90;
}

const getSectionLength = (section) => {
  if (Array.isArray(section)) return section.length;
  if (section && typeof section === "object") return Object.keys(section).length;
  return 0;
};

export function hasReachedMainWorkoutCompletion(record, session) {
  if (!record || !session || typeof session !== "object") return false;
  if (isSessionValidatedRecord(record)) return true;

  const bodyLength = getSectionLength(session.corps);
  if (bodyLength <= 0) return false;

  const exerciseIndex = Number(
    record?.resumeState?.exerciseIndex ?? record?.lastExerciseIndex
  );
  if (!Number.isFinite(exerciseIndex)) return false;

  const firstPostBodyIndex = getSectionLength(session.echauffement) + bodyLength;
  return exerciseIndex >= firstPostBodyIndex;
}
