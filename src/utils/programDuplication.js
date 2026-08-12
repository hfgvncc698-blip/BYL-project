const DUPLICATION_RESET_FIELDS = new Set([
  "id",
  "programId",
  "programID",
  "baseId",
  "fromTemplateId",
  "templateId",
  "clientId",
  "clientNom",
  "assignedTo",
  "assignedBy",
  "assignedAt",
  "assigned_at",
  "status",
  "statut",
  "progress",
  "progression",
  "pourcentageTermine",
  "completedSessions",
  "completedAt",
  "lastCompletedAt",
  "startedAt",
  "duplicatedAt",
  "duplicatedFrom",
]);

export function buildDuplicatedProgramPayload(
  source = {},
  {
    newProgramId,
    sourceProgramId,
    newName,
    createdBy,
    clubId = null,
    clubName = null,
    timestamp,
    origin = "duplicate-from-programs-page",
  } = {}
) {
  if (!newProgramId) throw new Error("newProgramId is required");

  const cleanSource = Object.fromEntries(
    Object.entries(source || {}).filter(([key]) => !DUPLICATION_RESET_FIELDS.has(key))
  );

  return {
    ...cleanSource,
    id: newProgramId,
    nomProgramme: newName,
    name: newName,
    createdAt: timestamp,
    updatedAt: timestamp,
    duplicatedAt: timestamp,
    duplicatedFrom: sourceProgramId || null,
    createdBy: createdBy || source?.createdBy || null,
    clubId,
    clubName,
    origine: origin,
    source: "duplicate",
  };
}
