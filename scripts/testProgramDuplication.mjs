import assert from "node:assert/strict";
import { buildDuplicatedProgramPayload } from "../src/utils/programDuplication.js";

const source = {
  id: "old-id",
  programId: "old-template-id",
  fromTemplateId: "old-template-id",
  clientId: "client-id",
  assignedAt: "old-assignment-date",
  progress: 80,
  statut: "en cours",
  nomProgramme: "Force",
  sessions: [{ name: "Séance 1", exercises: [{ name: "Squat" }] }],
  createdBy: "coach-id",
};

const timestamp = { kind: "server-timestamp" };
const duplicate = buildDuplicatedProgramPayload(source, {
  newProgramId: "new-id",
  sourceProgramId: "old-id",
  newName: "Force (copie)",
  timestamp,
  createdBy: "coach-id",
});

assert.equal(duplicate.id, "new-id");
assert.equal(duplicate.nomProgramme, "Force (copie)");
assert.equal(duplicate.name, "Force (copie)");
assert.equal(duplicate.duplicatedFrom, "old-id");
assert.equal(duplicate.createdAt, timestamp);
assert.deepEqual(duplicate.sessions, source.sessions);

for (const field of [
  "programId",
  "fromTemplateId",
  "clientId",
  "assignedAt",
  "progress",
  "statut",
]) {
  assert.equal(Object.hasOwn(duplicate, field), false, `${field} must be reset`);
}

console.log("Program duplication: OK");
