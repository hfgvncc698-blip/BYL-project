import assert from "node:assert/strict";
import { readProgramDisplayMetric } from "../src/utils/programDisplayMetrics.js";
import {
  getProgramPlannedSessionTotal,
  getProgramSessionsPerWeek,
  readProgramActiveWeeks,
} from "../src/utils/programDuration.js";

const synchronizedExercise = {
  repetitions: 9,
  "Répétitions": 15,
  charge: 7.5,
  "Charge (kg)": 5,
  repos: 90,
  "Repos (min:sec)": 75,
  duree: 30,
  "Durée (min:sec)": 45,
};

assert.equal(readProgramDisplayMetric(synchronizedExercise, "repetitions"), 15);
assert.equal(readProgramDisplayMetric(synchronizedExercise, "charge"), 5);
assert.equal(readProgramDisplayMetric(synchronizedExercise, "repos"), 75);
assert.equal(readProgramDisplayMetric(synchronizedExercise, "temps"), 45);

assert.equal(
  readProgramDisplayMetric({ repetitions: 9 }, "repetitions"),
  9,
  "legacy programs without canonical fields remain supported"
);

assert.equal(
  readProgramDisplayMetric({ details: { "Répétitions": 12 }, repetitions: 9 }, "repetitions"),
  12,
  "a canonical synchronized value wins even when stored in a supported nested pool"
);

assert.equal(readProgramActiveWeeks(null), 4, "a missing primary program must keep the dashboard renderable");
assert.equal(getProgramSessionsPerWeek(null), 0, "missing program data must not fabricate weekly sessions");
assert.equal(getProgramPlannedSessionTotal(null), 0, "missing program data must produce an empty total");

console.log("Program display metric priority: OK");
