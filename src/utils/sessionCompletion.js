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
