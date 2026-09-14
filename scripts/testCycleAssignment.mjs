import assert from 'node:assert/strict';
import { cycleAssignmentPatch, cycleAssignmentError, recommendedCyclePlacement } from '../src/utils/cycleAssignment.js';

const plan = { revision: 2, start: '2026-09-11', cycles: [
  { id: 'past', closedAt: '2026-09-10', programId: 'historic' },
  { id: 'current', programId: 'old', weeks: 4, type: 'hypertrophy' },
  { id: 'next', weeks: 1, type: 'recovery' },
] };
const client = { trainingPlan: plan, currentProgramme: 'old' };
assert.equal(recommendedCyclePlacement({ ...client, sportFollowView: 'programs' }), 'separate');
assert.equal(recommendedCyclePlacement({ ...client, sportFollowView: 'cycles' }), 'next');
assert.equal(recommendedCyclePlacement({ sportFollowView: 'programs' }), 'separate');
const before = JSON.stringify(client);
assert.deepEqual(cycleAssignmentPatch(client, 'new', 'separate', null, 0), {});
const replacement = cycleAssignmentPatch(client, 'new', 'current', null, 2);
assert.equal(replacement.currentProgramme, 'new');
assert.equal(replacement.trainingPlan.revision, 3);
assert.deepEqual(replacement.trainingPlan.cycles[1].previousProgramIds, ['old']);
assert.deepEqual(replacement.trainingPlan.cycles[0], plan.cycles[0]);
const next = cycleAssignmentPatch(client, 'new', 'next', null, 2);
assert.equal(next.currentProgramme, undefined);
assert.equal(next.trainingPlan.cycles[2].programId, 'new');
assert.equal(next.trainingPlan.cycles[1].programId, 'old');
assert.equal(JSON.stringify(client), before, 'no history or original object is mutated');
assert.throws(() => cycleAssignmentPatch(client, 'new', 'current', null, 1), /cycle-conflict/);
assert.throws(() => cycleAssignmentPatch({ trainingPlan: next.trainingPlan }, 'other', 'next', null, 3), /next-cycle-unavailable/);
const occupiedDraft = structuredClone(client);
occupiedDraft.trainingPlan.cycles[2].draftProgramId = 'draft';
assert.throws(() => cycleAssignmentPatch(occupiedDraft, 'other', 'next', null, 2), /next-cycle-unavailable/);
const prepared = cycleAssignmentPatch(occupiedDraft, 'assigned', 'next', null, 2, { templateId: 'draft', cycleType: 'recovery' });
assert.equal(prepared.trainingPlan.cycles[2].programId, 'assigned');
assert.equal(prepared.trainingPlan.cycles[2].draftProgramId, '');
assert.equal(prepared.currentProgramme, undefined);
const afterClosing = structuredClone(occupiedDraft);
afterClosing.trainingPlan.cycles[1].closedAt = '2026-09-14';
assert.equal(cycleAssignmentPatch(afterClosing, 'assigned', 'next', null, 2, { templateId: 'draft' }).currentProgramme, 'assigned');
assert.throws(() => cycleAssignmentPatch({}, 'new', 'current', { cycles: [] }, 0), /cycle-missing/);
assert.equal(cycleAssignmentPatch({}, 'new', 'current', plan, 0).trainingPlan.revision, 1);
for (const lang of ['fr', 'en', 'es', 'it', 'de', 'ru', 'ar']) assert.ok(cycleAssignmentError(new Error('cycle-conflict'), lang));
assert.equal(cycleAssignmentError(new Error('network')), null);
console.log('Cycle assignment tests passed');
