import assert from "node:assert/strict";
import {
  exerciseHistoryMatches,
  findCompletionExerciseSnapshot,
  isValidatedExerciseCompletion,
} from "../src/utils/exerciseHistoryIdentity.js";
import { getExerciseNoteLines } from "../src/utils/exerciseNotes.js";

assert.equal(
  exerciseHistoryMatches(
    { exerciseId: "smith-bench", exerciseName: "Développé couché à la Smith machine" },
    { id: "smith-bench", nom: "Smith machine bench press" }
  ),
  true,
  "a stable exercise id must match across languages"
);

assert.deepEqual(
  getExerciseNoteLines({ notes: "10’’ hold", consigne: "À réaliser par jambe." }, "en"),
  ["10’’ hold", "Perform on each leg."],
  "PDF note extraction must preserve custom notes and localize known instructions"
);

assert.equal(
  isValidatedExerciseCompletion({ status: "validée", isPartial: false }),
  true,
  "a validated session must count as a performance follow-up"
);

assert.equal(
  isValidatedExerciseCompletion({ status: "en_cours", isPartial: true }),
  false,
  "a partial session must not count as a performance follow-up"
);

assert.equal(
  isValidatedExerciseCompletion({ field: "Répétitions", value: 15, runId: "edit-1" }),
  false,
  "a programme setting change must not count as a completed performance or PR"
);

assert.equal(
  isValidatedExerciseCompletion({ dateEffectuee: new Date(), pourcentageTermine: 100 }),
  true,
  "legacy completions identified by dateEffectuee must remain visible"
);

const legacySnapshot = findCompletionExerciseSnapshot(
  {
    dateEffectuee: new Date(),
    sessionIndex: 0,
    programSessions: [{ corps: [{ id: "legacy-lunge", nom: "Fente Bulgare Haltères" }] }],
  },
  { id: "new-lunge-id", nom: "Fente Bulgare Haltères" }
);
assert.equal(
  legacySnapshot?.legacyDetailsUnavailable,
  true,
  "legacy sessions must count the exercise occurrence without inventing performance metrics"
);
assert.deepEqual(
  legacySnapshot?.sets,
  [],
  "legacy occurrence markers must not fabricate loads or repetitions"
);

assert.equal(
  exerciseHistoryMatches(
    { exerciseName: "Développé couché à la Smith machine" },
    { nom: "Développé couché à la Smith-machine" }
  ),
  true,
  "punctuation and accents must not break an exact normalized name"
);

assert.equal(
  exerciseHistoryMatches(
    { exerciseName: "Développé militaire à la machine" },
    { nom: "Développé couché à la Smith machine" }
  ),
  false,
  "a generic shared word must not mix two exercises"
);

assert.equal(
  exerciseHistoryMatches(
    { exerciseName: "Écarté à la poulie" },
    { nom: "Curl à la poulie" }
  ),
  false,
  "a shared equipment name must not mix two exercises"
);

assert.equal(
  exerciseHistoryMatches(
    { exerciseId: "other-id", exerciseName: "Presse à cuisses" },
    { id: "leg-press", translations: { fr: { nom: "Presse à cuisses" } } }
  ),
  true,
  "exact stored names remain compatible with legacy records whose local ids changed"
);

console.log("Exercise history identity tests passed.");
