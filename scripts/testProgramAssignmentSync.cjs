const assert = require("node:assert/strict");
const programsRouter = require("../backend/routes/programs");

const { assignedProgramSyncPatch, buildProgressionPlan, findAssignedProgramDocs } = programsRouter._test;

const sessions = [{ name: "Séance corrigée", corps: [{ nom: "Squat", repetitions: 8 }] }];
const patch = assignedProgramSyncPatch(
  {
    nomProgramme: "Programme Alex",
    activeWeeks: 6,
    progressionStrategy: "undulating",
    sessions,
    _rev: 12345,
  },
  "base-program-1"
);

assert.deepEqual(patch.sessions, sessions);
assert.deepEqual(patch.seances, sessions);
assert.equal(patch.totalSessions, 1);
assert.equal(patch.nbSeances, 1);
assert.equal(patch.fromTemplateId, "base-program-1");
assert.equal(patch.templateId, "base-program-1");
assert.equal(patch.templateRevision, 12345);
assert.equal(patch.progressionPlan.length, 6);
assert.equal(patch.progression.mode, "assigned");
assert.equal(patch.sessionsEffectuees, undefined);

assert.equal(buildProgressionPlan(4, "linear").length, 4);
assert.equal(buildProgressionPlan(100, "secure").length, 52);
assert.equal(buildProgressionPlan(0, "unknown").length, 4);

const syncRoute = programsRouter.stack.find(
  (layer) => layer.route?.path === "/:programId/sync-assignments" && layer.route?.methods?.post
);
assert.ok(syncRoute, "The authenticated program assignment sync endpoint must be registered");

const matchingProgramDoc = {
  ref: { path: "clients/client-1/programmes/assigned-1" },
  data: () => ({ programId: "base-program-1" }),
};
const unrelatedProgramDoc = {
  ref: { path: "clients/client-1/programmes/assigned-2" },
  data: () => ({ programId: "another-program" }),
};
const clientDoc = {
  ref: {
    path: "clients/client-1",
    collection: () => ({
      limit: () => ({ get: async () => ({ docs: [matchingProgramDoc, unrelatedProgramDoc] }) }),
    }),
  },
};
const fallbackDb = {
  collectionGroup: () => ({
    where: () => ({
      limit: () => ({ get: async () => { const error = new Error("COLLECTION_GROUP index missing"); error.code = 9; throw error; } }),
    }),
  }),
  collection: () => ({
    where: () => ({ limit: () => ({ get: async () => ({ docs: [clientDoc] }) }) }),
  }),
};

(async () => {
  const fallbackMatches = await findAssignedProgramDocs(
    fallbackDb,
    "base-program-1",
    { uid: "coach-1", role: "coach" }
  );
  assert.deepEqual(fallbackMatches, [matchingProgramDoc]);
  console.log("Program assignment sync: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
