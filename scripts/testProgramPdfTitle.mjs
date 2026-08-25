import assert from "node:assert/strict";
import { isUnmodifiedAutomaticProgramTitle } from "../src/utils/programPdfTitle.js";
import { settleWithTimeout } from "../src/utils/asyncTimeout.js";

const base = {
  isAutoProgram: true,
  objectiveKey: "endurance",
  objectiveKeyFromTitle: "endurance",
  sessionCount: 3,
};

assert.equal(
  isUnmodifiedAutomaticProgramTitle({ ...base, title: "Endurance — 3x/Sem" }),
  true,
  "An untouched automatic title can still be translated for the PDF"
);
assert.equal(
  isUnmodifiedAutomaticProgramTitle({ ...base, title: "Endurance — 3x/Sem (copie)" }),
  false,
  "A copied title must be preserved"
);
assert.equal(
  isUnmodifiedAutomaticProgramTitle({
    ...base,
    title: "Préparation marathon de Tom",
    objectiveKeyFromTitle: "",
  }),
  false,
  "A custom title must be preserved"
);
assert.equal(
  isUnmodifiedAutomaticProgramTitle({ ...base, title: "Endurance" }),
  false,
  "A shortened title is a user customization"
);
assert.equal(
  isUnmodifiedAutomaticProgramTitle({ ...base, title: "Endurance — 3x/Sem", isAutoProgram: false }),
  false,
  "Manual programs always keep their stored title"
);

assert.equal(
  await settleWithTimeout(new Promise(() => {}), 10, "timeout"),
  "timeout",
  "An unavailable PDF asset must never block generation indefinitely"
);

console.log("Program PDF title tests passed.");
