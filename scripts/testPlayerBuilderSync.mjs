import assert from "node:assert/strict";
import {
  isPerformanceOptionTracked,
  haveDifferentPlayerSetValues,
  haveDifferentReachedPlayerSetValues,
  getPlayerSetCursor,
  isBuilderConfiguredDifferentSets,
  resolvePlayerSetMetricValue,
  selectLatestExercisePerformance,
  shouldShowPlayerSetDetails,
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

assert.deepEqual(
  getPlayerSetCursor({ currentSet: 2, totalSets: 4, phase: "rest" }),
  { editableSet: 2, displayedSet: 2, upcomingSet: 3 },
  "rest edits and the visible cursor must stay on the completed set"
);

assert.equal(
  isBuilderConfiguredDifferentSets({
    seriesDiff: true,
    useAdvancedSets: true,
    _playerValidatedSync: { version: 7 },
  }),
  false,
  "legacy performance-inferred custom sets must return to simple mode"
);
assert.equal(
  isBuilderConfiguredDifferentSets({
    seriesDiff: true,
    seriesDiffSource: "builder",
    _playerValidatedSync: { version: 7 },
  }),
  true,
  "builder-authored advanced sets must remain configured as different"
);
assert.equal(
  isBuilderConfiguredDifferentSets({
    seriesDiff: true,
    _playerValidatedSync: { version: 8, configuredSeriesDiff: true },
  }),
  true,
  "new sync metadata must preserve the builder intent"
);
assert.deepEqual(
  getPlayerSetCursor({ currentSet: 3, totalSets: 4, phase: "ready" }),
  { editableSet: 3, displayedSet: 3, upcomingSet: 3 },
  "the ready phase must focus the set about to start"
);

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
  resolvePlayerSetMetricValue({
    draftValues: { "Répétitions": 17 },
    detail: { "Répétitions": 15 },
    label: "Répétitions",
    baseValue: 20,
  }),
  17,
  "the active player edit must immediately replace the planned advanced-set value"
);
assert.equal(
  resolvePlayerSetMetricValue({
    draftValues: {},
    detail: { "Répétitions": 15 },
    label: "Répétitions",
    baseValue: 20,
  }),
  15,
  "an untouched advanced set must keep its own planned value"
);

assert.equal(
  haveDifferentPlayerSetValues(
    [
      { "Répétitions": 15, "Repos (min:sec)": "01:00" },
      { "Répétitions": 17, "Repos (min:sec)": 60 },
    ],
    ["Répétitions", "Repos (min:sec)"]
  ),
  true,
  "a set edited differently from the first one must enable custom sets"
);
assert.equal(
  haveDifferentPlayerSetValues(
    [
      { "Répétitions": 15, "Repos (min:sec)": "01:00" },
      { "Répétitions": 15, "Repos (min:sec)": 60 },
    ],
    ["Répétitions", "Repos (min:sec)"]
  ),
  false,
  "equivalent set values must keep the identical-sets state"
);

const plannedDifferentSets = [
  { "Répétitions": 20 },
  { "Répétitions": 15 },
  { "Répétitions": 12 },
];
assert.equal(
  haveDifferentReachedPlayerSetValues(plannedDifferentSets, ["Répétitions"], 1),
  false,
  "the first set must only establish the reference, even when future sets are planned differently"
);
assert.equal(
  haveDifferentReachedPlayerSetValues(plannedDifferentSets, ["Répétitions"], 2),
  true,
  "custom sets must activate once the second reached set differs from the first"
);
assert.equal(
  shouldShowPlayerSetDetails({
    configuredDifferentSets: true,
    rows: plannedDifferentSets,
    labels: ["Répétitions"],
    currentSet: 1,
  }),
  true,
  "sets deliberately configured as different in the builder must be visible from set 1"
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
