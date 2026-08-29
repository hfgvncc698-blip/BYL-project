import assert from "node:assert/strict";
import { readProgramDisplayMetric } from "../src/utils/programDisplayMetrics.js";
import {
  formatProgramWeekProgress,
  getProgramPlannedSessionTotal,
  getProgramSessionsPerWeek,
  getProgramValidatedSessionCount,
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

const fourWeekProgram = {
  activeWeeks: 4,
  assignedAt: "2026-08-12T10:00:00.000Z",
  sessions: Array.from({ length: 5 }, (_, index) => ({ id: `session-${index + 1}` })),
  sessionsEffectuees: Array.from({ length: 5 }, (_, index) => ({
    sessionIndex: index,
    status: "completed",
    completedAt: "2026-08-19T10:00:00.000Z",
  })),
};

assert.equal(
  getProgramSessionsPerWeek(fourWeekProgram),
  5,
  "builder sessions describe the weekly template"
);
assert.equal(
  getProgramPlannedSessionTotal(fourWeekProgram),
  20,
  "a five-session weekly template over four weeks plans twenty sessions"
);
assert.equal(
  getProgramValidatedSessionCount({
    ...fourWeekProgram,
    sessionsEffectuees: Array.from({ length: 10 }, (_, index) => ({
      sessionIndex: index % 5,
      status: "completed",
      completedAt: "2026-08-27T10:00:00.000Z",
    })),
  }),
  10,
  "weekly repetitions must count every validation rather than deduplicating template indexes"
);
assert.equal(
  formatProgramWeekProgress(fourWeekProgram, null, {
    includeInitialWeek: true,
    now: "2026-08-20T10:00:00.000Z",
  }),
  "Semaine 1/4",
  "a displayed week is validated only after every weekly session is completed"
);

assert.equal(
  formatProgramWeekProgress({ ...fourWeekProgram, sessionsEffectuees: fourWeekProgram.sessionsEffectuees.slice(0, 4) }),
  "Semaine 0/4",
  "a partial week must not be presented as validated"
);

console.log("Program display metric priority: OK");
