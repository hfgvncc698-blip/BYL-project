import assert from "node:assert/strict";
import { readProgramDisplayMetric } from "../src/utils/programDisplayMetrics.js";

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

console.log("Program display metric priority: OK");
