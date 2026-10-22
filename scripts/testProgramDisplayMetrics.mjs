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
  "the first completed cycle remains displayed as week one"
);

assert.equal(
  formatProgramWeekProgress({ ...fourWeekProgram, sessionsEffectuees: fourWeekProgram.sessionsEffectuees.slice(0, 4) }),
  "Semaine 1/4",
  "a partial cycle must display the week currently in progress"
);

assert.equal(
  formatProgramWeekProgress({
    activeWeeks: 4,
    sessionsPerWeek: 3,
    sessions: Array.from({ length: 12 }, (_, index) => ({ id: `three-weekly-${index + 1}` })),
    sessionsEffectuees: Array.from({ length: 7 }, (_, index) => ({
      sessionIndex: index % 3,
      status: "completed",
      completedAt: "2026-08-31T10:00:00.000Z",
    })),
  }),
  "Semaine 3/4",
  "seven completed sessions at three sessions per week must display week three"
);

console.log("Program display metric priority: OK");

// Regression: calendar visibility must not remove historical validations from progress.
const completeHistory = [
  ...Array.from({ length: 10 }, (_, index) => ({
    id: `completion-${index}`,
    status: "validée",
    sessionIndex: index % 3,
    ...(index < 8 ? { calendarEventId: `event-${index}` } : {}),
  })),
  { id: "partial", status: "en_cours", isPartial: true, completedAt: "2026-10-21" },
];
const profileProgram = {
  activeWeeks: 4,
  sessionsPerWeek: 3,
  sessions: [{}, {}, {}],
  sessionsEffectuees: completeHistory,
};
const dashboardProgram = {
  ...profileProgram,
  sessionsEffectuees: completeHistory.filter((session) => session.calendarEventId),
  _progressSessionsEffectuees: completeHistory,
  _done: 8,
};
assert.equal(dashboardProgram.sessionsEffectuees.length, 8);
assert.equal(getProgramValidatedSessionCount(profileProgram), 10);
assert.equal(getProgramValidatedSessionCount(dashboardProgram), 10);
assert.equal(getProgramPlannedSessionTotal(dashboardProgram), 12);
assert.equal(formatProgramWeekProgress(dashboardProgram), "Semaine 4/4");
assert.equal(
  getProgramValidatedSessionCount({ ...dashboardProgram, _progressSessionsEffectuees: [] }),
  0,
  "an authoritative empty history must override stale counters"
);
console.log("Dashboard and profile progress consistency: OK");

const validationFormats = [
  {status:'validée'}, {status:'completed'}, {status:' DONE '},
  {validated:true}, {isValidated:true}, {playedAt:'2026-10-21'},
  {completionPct:100}, {completionPercent:100},
];
for (const record of validationFormats) {
  for (const scope of ['profile', 'dashboard']) {
    const program = scope === 'profile'
      ? {sessionsEffectuees:[record]}
      : {sessionsEffectuees:[], _progressSessionsEffectuees:[record]};
    assert.equal(getProgramValidatedSessionCount(program), 1, `${scope}: ${JSON.stringify(record)}`);
    for (const partial of [{isPartial:true}, {status:'partial'}, {status:'en_cours'}, {status:'in_progress'}]) {
      const history = [{...record, ...partial}];
      assert.equal(getProgramValidatedSessionCount({...program, sessionsEffectuees:history, _progressSessionsEffectuees:history}), 0);
    }
  }
}
console.log('Legacy validation formats and partial exclusions on both surfaces: OK');

// Missing programme is valid for clients without a cycle, waiting for the next
// assignment, or while dashboard data is still loading.
for (const missing of [null, undefined]) {
  assert.equal(getProgramValidatedSessionCount(missing), 0);
  assert.equal(getProgramPlannedSessionTotal(missing), 0);
  assert.doesNotThrow(() => formatProgramWeekProgress(missing));
}
console.log("Missing programme during dashboard loading and empty cycles: OK");
