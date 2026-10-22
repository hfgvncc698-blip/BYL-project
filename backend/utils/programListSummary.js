// Listing metadata only. Full prescriptions are always read when opening,
// duplicating or assigning the original programme.
const fields = [
  'createdBy','createdAt','updatedAt','duplicatedAt','dateCreation','date',
  'nomProgramme','name','title','objectifUI','objectif','origine','type',
  'activeWeeks','durationWeeks','programDurationWeeks','dureeSemaines','weeksActive',
  'sessionsPerWeek','seancesParSemaine','nbSeancesSemaine','nbSeancesParSemaine',
  'sessionCount','totalSessions','nbSeances','_total','status','libraryKind',
  'cycleDraft','cyclePreparation','preparedForClientId','preparedForClientName',
  'preparedForCycleId','clubId','clubName',
];
module.exports = function programListSummary(data) {
  const result = { __summaryOnly: true };
  for (const field of fields) if (data[field] !== undefined) result[field] = data[field];
  for (const field of ['sessions','seances']) {
    if (Array.isArray(data[field])) result[field] = data[field].map(session => ({
      name: session?.name || session?.nom || session?.title || '',
    }));
  }
  return result;
};

module.exports.fields = fields;
module.exports.sessionCount = data => {
  // The programme writer maintains nbSeances alongside the weekly template.
  const count = data.nbSeances ?? data.sessionCount ?? data.totalSessions;
  return Number.isInteger(count) && count >= 0 && count <= 100 ? count : null;
};
