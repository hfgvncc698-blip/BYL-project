import assert from "node:assert/strict";
import {
  applyPlayerExerciseEdit,
  applyPlayerExerciseDeletion,
  buildPlayerExerciseFromBank,
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

console.log("Player exercise editing tests passed.");
