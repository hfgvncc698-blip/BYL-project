import assert from "node:assert/strict";
import {
  buildCompletionRecordsFromModifications,
  mergeCompletionHistoryRecords,
} from "../src/utils/exerciseModificationHistory.js";

const sessions = [{
  name: "Séance 1",
  corps: [
    { id: "lunge", nom: "Fente Bulgare Haltères", Séries: 3, Répétitions: 10, "Charge (kg)": 5 },
  ],
}];

const modifications = [
  { runId: "run-1", sessionIndex: 0, exerciseIndex: 0, field: "Répétitions", value: 14, updatedAt: new Date("2026-04-18T10:05:11Z") },
  { runId: "run-1", sessionIndex: 0, exerciseIndex: 0, field: "Charge (kg)", value: 7, updatedAt: new Date("2026-04-18T10:05:11Z") },
  { runId: "run-2", sessionIndex: 0, exerciseIndex: 0, field: "Répétitions", value: 12, updatedAt: new Date("2026-06-17T10:01:22Z") },
  { runId: "run-2", sessionIndex: 0, exerciseIndex: 0, field: "Séries", value: 4, updatedAt: new Date("2026-06-17T10:01:22Z") },
  { sessionIndex: 0, exerciseIndex: 0, field: "Charge (kg)", value: 99, updatedAt: new Date("2025-01-01T00:00:00Z") },
];

const records = buildCompletionRecordsFromModifications({
  modifications,
  programSessions: sessions,
  programId: "programme-1",
});

assert.equal(records.length, 2, "one detailed record must be reconstructed per reliable runId");
const latest = records[0].exerciseSnapshots[0];
assert.equal(latest.sets.length, 4, "the latest recorded series count must be restored");
assert.equal(latest.sets[0].reps, 12, "the latest repetitions must be restored");
assert.equal(latest.sets[0].chargeKg, 7, "unchanged load must carry forward from the previous occurrence");

const merged = mergeCompletionHistoryRecords(
  [{
    id: "completion-1",
    completionId: "completion-1",
    programId: "programme-1",
    sessionIndex: 0,
    dateEffectuee: new Date("2026-06-17T10:01:30Z"),
    status: "completed",
  }],
  records
);
assert.equal(merged.length, 2, "the matching completion and modification run must not be duplicated");
assert.equal(
  merged.find((record) => record.completionId === "completion-1")?.exerciseSnapshots?.[0]?.sets?.[0]?.reps,
  12,
  "the detailed modification snapshot must enrich its matching completion"
);

console.log("Exercise modification history tests passed.");
