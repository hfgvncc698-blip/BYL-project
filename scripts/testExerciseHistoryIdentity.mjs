import assert from "node:assert/strict";
import { exerciseHistoryMatches } from "../src/utils/exerciseHistoryIdentity.js";

assert.equal(
  exerciseHistoryMatches(
    { exerciseId: "smith-bench", exerciseName: "Développé couché à la Smith machine" },
    { id: "smith-bench", nom: "Smith machine bench press" }
  ),
  true,
  "a stable exercise id must match across languages"
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
