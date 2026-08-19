import assert from "node:assert/strict";
import {
  applyPlayerExerciseEdit,
  applyPlayerExerciseDeletion,
  buildPlayerExerciseFromBank,
  buildPlayerExerciseAuditDetails,
  getPlayerExerciseSourceId,
  getPlayerExerciseViewKey,
  getPlayerExerciseContinuation,
  remapPlayerExerciseTimings,
} from "../src/utils/playerExerciseEditing.js";

const previous = {
  id: "old-instance",
  exerciseId: "bench-press",
  nom: "Développé couché",
  optionsOrder: ["Répétitions", "Séries", "Charge (kg)"],
  "Répétitions": 8,
  "Séries": 4,
  "Charge (kg)": 70,
  notes: "Rester gainé",
};

const replacement = buildPlayerExerciseFromBank(
  { id: "chest-press", nom: "Chest press", __collection: "training" },
  { previousExercise: previous, instanceId: "new-instance" }
);

assert.equal(replacement.id, "new-instance");
assert.equal(replacement.exerciseId, "chest-press");
assert.equal(replacement.replacesExerciseId, "bench-press");
assert.equal(replacement["Répétitions"], 8);
assert.equal(replacement["Séries"], 4);
assert.equal(replacement["Charge (kg)"], 70);
assert.equal(replacement.notes, "Rester gainé");
assert.equal(getPlayerExerciseSourceId(replacement), "chest-press");
assert.notEqual(
  getPlayerExerciseViewKey(previous, { sessionIndex: 0, exerciseIndex: 0 }),
  getPlayerExerciseViewKey(replacement, { sessionIndex: 0, exerciseIndex: 0 })
);

const canonicalSourceWinsOverInstance = {
  id: "player-temporary-instance",
  exerciseId: "stable-bank-document",
  sourceExerciseId: "stable-bank-document",
};
assert.equal(
  getPlayerExerciseSourceId(canonicalSourceWinsOverInstance),
  "stable-bank-document"
);

const sourceProgram = {
  sessions: [
    {
      title: "Séance 1",
      corps: [
        previous,
        { id: "row", exerciseId: "row", nom: "Rowing" },
      ],
    },
  ],
};

const replaced = applyPlayerExerciseEdit({
  programData: sourceProgram,
  sessionIndex: 0,
  mapping: { sectionKey: "corps", index: 0 },
  selectedExercise: { id: "chest-press", nom: "Chest press" },
  mode: "replace",
  instanceId: "replacement-instance",
});

assert.equal(replaced.session.corps.length, 2);
assert.equal(replaced.session.corps[0].exerciseId, "chest-press");
assert.equal(replaced.session.corps[1].exerciseId, "row");
assert.equal(sourceProgram.sessions[0].corps[0].exerciseId, "bench-press");

const added = applyPlayerExerciseEdit({
  programData: sourceProgram,
  sessionIndex: 0,
  mapping: { sectionKey: "corps", index: 0 },
  selectedExercise: { docId: "fly", nom: "Écarté poulie" },
  mode: "addAfter",
  instanceId: "added-instance",
});

assert.equal(added.session.corps.length, 3);
assert.equal(added.session.corps[1].exerciseId, "fly");
assert.equal(added.session.corps[2].exerciseId, "row");

const deleted = applyPlayerExerciseDeletion({
  programData: sourceProgram,
  sessionIndex: 0,
  mapping: { sectionKey: "corps", index: 0 },
});

assert.equal(deleted.session.corps.length, 1);
assert.equal(deleted.removedExercise.exerciseId, "bench-press");
assert.equal(deleted.session.corps[0].exerciseId, "row");
assert.equal(sourceProgram.sessions[0].corps.length, 2);

const linkedProgram = {
  sessions: [
    {
      corps: [
        { id: "first", linkNext: true },
        { id: "middle", linkNext: false },
        { id: "last" },
      ],
    },
  ],
};
const deletedLinked = applyPlayerExerciseDeletion({
  programData: linkedProgram,
  sessionIndex: 0,
  mapping: { sectionKey: "corps", index: 1 },
});
assert.equal(deletedLinked.session.corps[0].linkNext, false);

const runningContinuation = getPlayerExerciseContinuation({
  mode: "replace",
  currentIndex: 2,
  currentSet: 3,
  phase: "rest",
  isPaused: true,
  updatedLength: 8,
});
assert.deepEqual(runningContinuation, {
  exerciseIndex: 2,
  currentSet: 3,
  phase: "rest",
  isPaused: true,
  preserveTimers: true,
});

const addContinuation = getPlayerExerciseContinuation({
  mode: "addAfter",
  currentIndex: 2,
  currentSet: 3,
  phase: "effort",
  isPaused: false,
  updatedLength: 9,
});
assert.equal(addContinuation.exerciseIndex, 2);
assert.equal(addContinuation.currentSet, 3);
assert.equal(addContinuation.phase, "effort");
assert.equal(addContinuation.preserveTimers, true);

const shiftedAfterAdd = remapPlayerExerciseTimings(
  new Map([[0, 12], [2, 34], [3, 56]]),
  { mode: "addAfter", currentIndex: 2 }
);
assert.deepEqual(Array.from(shiftedAfterAdd.entries()), [[0, 12], [2, 34], [4, 56]]);

const shiftedAfterDelete = remapPlayerExerciseTimings(
  new Map([[0, 12], [2, 34], [3, 56]]),
  { mode: "delete", currentIndex: 2 }
);
assert.deepEqual(Array.from(shiftedAfterDelete.entries()), [[0, 12], [2, 56]]);

const replacementAudit = buildPlayerExerciseAuditDetails({
  mode: "replace",
  beforeIdentity: { ids: ["old-id"], names: ["ancien exercice"] },
  afterIdentity: { ids: ["new-id"], names: ["nouvel exercice"] },
  beforeName: "Ancien exercice",
  afterName: "Nouvel exercice",
});
assert.equal(replacementAudit.operation, "replace");
assert.equal(replacementAudit.field, "Exercice remplacé");
assert.equal(replacementAudit.value, "Ancien exercice → Nouvel exercice");
assert.deepEqual(replacementAudit.exerciseIds, ["old-id", "new-id"]);
assert.deepEqual(replacementAudit.exerciseNames, ["ancien exercice", "nouvel exercice"]);

console.log("Player exercise editing tests passed.");
