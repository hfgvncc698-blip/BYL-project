import assert from "node:assert/strict";
import {
  buildFrozenElapsedState,
  findLatestRemoteSessionResumeRecord,
  getRemoteCheckpointDelay,
  getSessionResumeStorageKey,
  readSessionResumeState,
  selectLatestSessionResumeState,
  writeSessionResumeState,
} from "../src/utils/sessionResume.js";

const memory = new Map();
const storage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};

const storageKey = getSessionResumeStorageKey({
  clientId: "client-1",
  programId: "program-1",
  sessionIndex: 2,
});
writeSessionResumeState(storageKey, { exerciseIndex: 3, currentSet: 2 }, storage);
assert.deepEqual(
  (({ exerciseIndex, currentSet }) => ({ exerciseIndex, currentSet }))(
    readSessionResumeState(storageKey, storage)
  ),
  { exerciseIndex: 3, currentSet: 2 }
);

const remote = { checkpointUpdatedAt: 200, exerciseIndex: 4 };
const local = { updatedAt: 100, exerciseIndex: 1 };
assert.equal(selectLatestSessionResumeState(local, remote), remote);
assert.equal(selectLatestSessionResumeState({ ...local, updatedAt: 300 }, remote).exerciseIndex, 1);

const latest = findLatestRemoteSessionResumeRecord(
  [
    { id: "completed", sessionIndex: 2, pourcentageTermine: 100, updatedAt: "2026-01-03" },
    {
      id: "old-partial",
      sessionIndex: 2,
      pourcentageTermine: 20,
      isPartial: true,
      resumeState: { checkpointUpdatedAt: 100 },
    },
    {
      id: "new-partial",
      sessionIndex: 2,
      pourcentageTermine: 40,
      status: "en_cours",
      resumeState: { checkpointUpdatedAt: 300 },
    },
  ],
  2
);
assert.equal(latest?.id, "new-partial");

assert.deepEqual(buildFrozenElapsedState(45, 100_000), {
  startedAt: 55_000,
  stoppedAt: 100_000,
});

const checkpointState = {
  exIndex: 1,
  currentSet: 2,
  phase: "rest",
  isPaused: false,
  performanceDraftRevision: 4,
  sessionObj: {},
};
assert.equal(getRemoteCheckpointDelay(null, checkpointState, 99_000, 100_000), 450);
assert.equal(getRemoteCheckpointDelay(checkpointState, checkpointState, 99_000, 100_000), 14_000);

console.log("Cross-device session resume tests passed.");
