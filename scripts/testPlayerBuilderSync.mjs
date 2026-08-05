import assert from "node:assert/strict";
import {
  isPerformanceOptionTracked,
  selectLatestExercisePerformance,
} from "../src/utils/playerBuilderSync.js";
import { estimateExerciseDurationSeconds } from "../src/utils/trainingEngine.js";

const exercise = { id: "squat", nom: "Squat" };
const set = (reps) => [{ setIndex: 1, reps, values: {} }];
const snapshot = (sessionPosition, reps, extra = {}) => ({
  exerciseId: "squat",
  exerciseName: "Squat",
  exerciseIndex: sessionPosition.exerciseIndex,
  sectionKey: sessionPosition.sectionKey,
  sectionIndex: sessionPosition.sectionIndex,
  sets: set(reps),
  ...extra,
});

const records = [
  {
    id: "session-2-newer",
    sessionIndex: 1,
    completedAt: "2026-08-05T12:00:00.000Z",
    exerciseSnapshots: [
      snapshot({ exerciseIndex: 0, sectionKey: "corps", sectionIndex: 0 }, 20),
    ],
  },
  {
    id: "session-1-older",
    sessionIndex: 0,
    completedAt: "2026-08-04T12:00:00.000Z",
    exerciseSnapshots: [
      snapshot({ exerciseIndex: 0, sectionKey: "corps", sectionIndex: 0 }, 8),
      snapshot({ exerciseIndex: 1, sectionKey: "corps", sectionIndex: 1 }, 12),
    ],
  },
];

const isolatedRecords = [
  {
    id: "other-client-program",
    clientId: "client-b",
    programId: "program-b",
    sessionIndex: 0,
    completedAt: "2026-08-06T12:00:00.000Z",
    exerciseSnapshots: [
      snapshot({ exerciseIndex: 0, sectionKey: "corps", sectionIndex: 0 }, 99),
    ],
  },
  {
    id: "correct-client-program",
    clientId: "client-a",
    programId: "program-a",
    sessionIndex: 0,
    completedAt: "2026-08-05T12:00:00.000Z",
    exerciseSnapshots: [
      snapshot({ exerciseIndex: 0, sectionKey: "corps", sectionIndex: 0 }, 7),
    ],
  },
];

assert.equal(
  selectLatestExercisePerformance(isolatedRecords, exercise, {
    clientId: "client-a",
    programId: "program-a",
    sessionIndex: 0,
    sectionKey: "corps",
    sectionIndex: 0,
    exerciseIndex: 0,
  })?.snapshot?.sets?.[0]?.reps,
  7,
  "a result from another client or program must never be synchronized"
);

assert.equal(
  selectLatestExercisePerformance(records, exercise, {
    sessionIndex: 0,
    sectionKey: "corps",
    sectionIndex: 0,
    exerciseIndex: 0,
  })?.snapshot?.sets?.[0]?.reps,
  8,
  "a newer result from another session must never update this session"
);

assert.equal(
  selectLatestExercisePerformance(records, exercise, {
    sessionIndex: 0,
    sectionKey: "corps",
    sectionIndex: 1,
    exerciseIndex: 1,
  })?.snapshot?.sets?.[0]?.reps,
  12,
  "duplicate exercises in one session must be matched by their exact position"
);

assert.equal(
  selectLatestExercisePerformance(
    [{
      id: "legacy",
      completedAt: "2025-01-01T00:00:00.000Z",
      exerciseSnapshots: [{ exerciseName: "Squat", sets: set(6) }],
    }],
    exercise,
    { sessionIndex: 0, sectionKey: "corps", sectionIndex: 0, exerciseIndex: 0 }
  )?.snapshot?.sets?.[0]?.reps,
  6,
  "legacy history without positional metadata must remain compatible"
);

assert.equal(
  isPerformanceOptionTracked(
    { optionsOrder: ["Séries", "Durée (min:sec)", "Charge (kg)"] },
    "Répétitions"
  ),
  false,
  "an unchecked metric must not be recorded"
);
assert.equal(
  isPerformanceOptionTracked(
    { optionsOrder: ["Séries", "Durée (min:sec)", "Charge (kg)"] },
    "Charge (kg)"
  ),
  true,
  "a checked metric must be recorded"
);

assert.equal(
  estimateExerciseDurationSeconds({
    "Séries": 2,
    "Répétitions": 12,
    "Durée (min:sec)": 300,
    "Repos (min:sec)": 600,
    optionsOrder: ["Séries", "Répétitions"],
  }),
  96,
  "unchecked stale duration and rest values must not affect total time"
);

assert.equal(
  estimateExerciseDurationSeconds({
    "Séries": 3,
    "Répétitions": 99,
    "Durée (min:sec)": 30,
    "Repos (min:sec)": 60,
    optionsOrder: ["Séries", "Durée (min:sec)", "Repos (min:sec)"],
  }),
  210,
  "a timed exercise must use duration and rest while ignoring stale repetitions"
);

console.log("Player → builder synchronization tests passed.");
