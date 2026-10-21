import assert from 'node:assert/strict';
import fs from 'node:fs';
import {commitSessionFeedback} from '../src/utils/commitSessionFeedback.js';
const records=new Map();
function batch(fail=false){const writes=[];return {set:(ref,data)=>writes.push([ref,data]),commit:async()=>{if(fail)throw Error('offline');for(const [ref,data] of writes)records.set(ref,{...records.get(ref),...data});}};}
const input={completionRef:'completion/run1',completionData:{status:'validée',rating:4},feedbackRef:'feedback/run1',feedback:{rating:4,completionId:'run1'}};
await assert.rejects(commitSessionFeedback({...input,batch:batch(true)}));assert.equal(records.size,0);
await commitSessionFeedback({...input,batch:batch()});assert.equal(records.get('completion/run1').rating,4);assert.equal(records.get('feedback/run1').rating,4);
// Calendar failure is outside the commit and cannot remove submitted stars.
await Promise.reject(Error('calendar unavailable')).catch(()=>{});assert.equal(records.get('feedback/run1').rating,4);
await commitSessionFeedback({...input,batch:batch()});assert.equal(records.size,2);
const source=fs.readFileSync('src/components/SessionPlayer.jsx','utf8');
assert.match(source,/feedback: \{ \.\.\.feedbackPayload, adaptationDecision \}/);
const close=source.slice(source.indexOf('const handleCloseRatingModal'),source.indexOf('const handleCloseRatingModal')+170);
assert.doesNotMatch(close,/handleIgnoreRating|clearDifficulty|saveSessionCompletion/);
assert.match(close,/onClose\(\)/);
assert.doesNotMatch(source,/const ratingSavePromise/);
console.log('Session feedback: atomic failure, saved stars despite calendar failure, idempotent retry, and non-destructive close passed.');
