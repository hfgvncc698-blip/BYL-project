import assert from "node:assert/strict";
import {
  applyValidatedSnapshotToAssignedExercise,
  applyValidatedSnapshotsToAssignedProgram,
} from "../src/utils/playerProgramSync.js";

const exercise = {
  id: "T297",
  nom: "Développé écarté à la machine",
  series: 4,
  repetitions: 9,
  charge: 0,
  repos: 90,
  optionsOrder: ["Séries", "Répétitions", "Charge (kg)", "Repos (min:sec)"],
};
const snapshot = {
  exerciseId: "T297",
  exerciseName: exercise.nom,
  sectionKey: "corps",
  sectionIndex: 0,
  optionsOrder: ["Séries", "Répétitions", "Charge (kg)", "Repos (min:sec)"],
  seriesDiff: false,
  sets: [
    { setIndex: 1, reps: 12, chargeKg: 7.5, plannedRestSec: 75 },
    { setIndex: 2, reps: 15, chargeKg: 5, plannedRestSec: 75 },
    { setIndex: 3, reps: 15, chargeKg: 5, plannedRestSec: 75 },
    { setIndex: 4, reps: 15, chargeKg: 5, plannedRestSec: 75 },
  ],
};

const synced = applyValidatedSnapshotToAssignedExercise(exercise, snapshot);
assert.equal(synced["Séries"], 4);
assert.equal(synced["Répétitions"], 15);
assert.equal(synced["Charge (kg)"], 5);
assert.equal(synced["Repos (min:sec)"], 75);
for (const stale of ["series", "repetitions", "charge", "repos"]) {
  assert.equal(Object.hasOwn(synced, stale), false, `${stale} must be removed`);
}

const programResult = applyValidatedSnapshotsToAssignedProgram(
  { sessions: [{ useSections: true, corps: [exercise] }] },
  0,
  [snapshot],
  "completion-1"
);
assert.equal(programResult.updatedCount, 1);
assert.equal(programResult.sessions[0].corps[0]["Répétitions"], 15);
assert.equal(programResult.sessions[0].corps[0]._playerValidatedSync.completionId, "completion-1");

const timed = applyValidatedSnapshotToAssignedExercise(exercise, {
  ...snapshot,
  optionsOrder: ["Séries", "Durée (min:sec)", "Repos (min:sec)"],
  sets: [{ setIndex: 1, durationSec: 45, plannedRestSec: 30 }],
});
assert.equal(timed["Durée (min:sec)"], 45);
assert.equal(Object.hasOwn(timed, "Répétitions"), false);
assert.equal(Object.hasOwn(timed, "repetitions"), false);

const advanced = applyValidatedSnapshotToAssignedExercise(exercise, {
  ...snapshot,
  configuredSeriesDiff: true,
  seriesDiff: true,
  sets: [
    { setIndex: 1, reps: 10, chargeKg: 8, plannedRestSec: 60 },
    { setIndex: 2, reps: 12, chargeKg: 6, plannedRestSec: 45 },
  ],
});
assert.equal(advanced.seriesDiff, true);
assert.equal(advanced.sets[1].reps, 12);
assert.equal(advanced.seriesDetails[1]["Charge (kg)"], 6);

const performedDifferenceIsNotAConfiguration = applyValidatedSnapshotToAssignedExercise(exercise, {
  ...snapshot,
  configuredSeriesDiff: false,
  // Historical snapshots may still describe what was performed separately.
  seriesDiff: true,
  performedSetsAreDifferent: true,
  sets: [
    { setIndex: 1, reps: 12, chargeKg: 30, plannedRestSec: 45 },
    { setIndex: 2, reps: 12, chargeKg: 35, plannedRestSec: 45 },
    { setIndex: 3, reps: 12, chargeKg: 40, plannedRestSec: 45 },
    { setIndex: 4, reps: 12, chargeKg: 40, plannedRestSec: 45 },
  ],
});
assert.equal(performedDifferenceIsNotAConfiguration.seriesDiff, false);
assert.equal(performedDifferenceIsNotAConfiguration.useAdvancedSets, false);
assert.equal(performedDifferenceIsNotAConfiguration["Répétitions"], 12);
assert.equal(performedDifferenceIsNotAConfiguration["Charge (kg)"], 40);
assert.equal(performedDifferenceIsNotAConfiguration["Repos (min:sec)"], 45);
assert.equal(Object.hasOwn(performedDifferenceIsNotAConfiguration, "seriesDetails"), false);

const staleAdvanced = applyValidatedSnapshotToAssignedExercise(
  {
    ...exercise,
    sets: [{ reps: 9, chargeKg: 20, restSec: 90 }],
    seriesDetails: [{ "Répétitions": 9, "Charge (kg)": 20 }],
  },
  {
    ...snapshot,
    seriesDiff: true,
    optionsOrder: ["Séries", "Durée (min:sec)"],
    sets: [{ setIndex: 1, durationSec: 40, reps: 99, chargeKg: 99 }],
  }
);
assert.equal(staleAdvanced.sets[0].durationSec, 40);
assert.equal(Object.hasOwn(staleAdvanced.sets[0], "reps"), false);
assert.equal(Object.hasOwn(staleAdvanced.sets[0], "chargeKg"), false);
assert.equal(Object.hasOwn(staleAdvanced.seriesDetails[0], "Répétitions"), false);

const legacyElapsedRest = applyValidatedSnapshotToAssignedExercise(exercise, {
  ...snapshot,
  sets: [{ setIndex: 1, reps: 10, chargeKg: 5, restSec: 16 }],
});
assert.equal(Object.hasOwn(legacyElapsedRest, "Repos (min:sec)"), false);

console.log("Player → assigned program immediate synchronization: OK");
