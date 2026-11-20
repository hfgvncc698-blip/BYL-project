import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createNutritionReflectionDrafts} from '../src/utils/nutritionReflectionDrafts.js';

const drafts = createNutritionReflectionDrafts();
const empty = {hunger:'',energy:'',digestion:'',note:''};
const yesterday = 'client-a/2026-11-18';
const today = 'client-a/2026-11-19';
const first = drafts.edit(yesterday, empty, {note:'These are four words'});
assert.equal(drafts.read(yesterday, empty), first, 'late server data preserves local text');
assert.equal(drafts.read(today, empty), empty, 'days remain isolated');
assert.equal(drafts.read('client-b/2026-11-18', empty), empty, 'dossiers remain isolated');
const newer = drafts.edit(yesterday, first, {note:first.note+' and more'});
drafts.acknowledge(yesterday, first);
assert.equal(drafts.read(yesterday, empty), newer, 'an earlier save cannot erase later typing');
drafts.acknowledge(yesterday, newer);
assert.equal(drafts.read(yesterday, empty), empty, 'successful save releases its exact draft');

// Execute the real subscription effect: cache/server snapshots and a snapshot
// queued after switching days must not replace the active local reflection.
const source = fs.readFileSync('src/components/ClientNutritionDailyJournal.jsx','utf8');
const start = source.indexOf('    if (!clientId || !dateKey) return undefined;');
const end = source.indexOf('  }, [clientId, dateKey, draftEntries]);', start);
assert.ok(start >= 0 && end > start);
const body = source.slice(start,end);
let reflection = empty, snapshotCallback, stopped = false;
const loadedDayRef = {current:null};
const subscribe = new Function('clientId','dateKey','draftEntries','loadedDayRef','reflectionDraftsRef',
 'setLoading','doc','logCollection','onSnapshot','setEntries','normalizeNutritionLogEntry','setReflection','setSavedAt',body);
const cleanup = subscribe('client-a','2026-11-18',[],loadedDayRef,{current:drafts},
 ()=>{},(_,date)=>date,id=>id,(_ref,callback)=>{snapshotCallback=callback;return ()=>{stopped=true;};},
 ()=>{},entry=>entry,value=>{reflection=value;},()=>{});
const snapshot = {exists:()=>true,data:()=>({reflection:empty})};
snapshotCallback(snapshot);
assert.equal(loadedDayRef.current,yesterday);
reflection = drafts.edit(yesterday,reflection,{note:'A note longer than four words remains visible'});
snapshotCallback(snapshot);
assert.equal(reflection.note,'A note longer than four words remains visible');
cleanup();
assert.equal(stopped,true);
reflection = { ...empty, note:'Another day' };
snapshotCallback(snapshot);
assert.equal(reflection.note,'Another day','late callbacks from the previous day are ignored');

// Execute date selection: manual navigation cancels delayed automatic jumps,
// and saving remains blocked until the newly selected day has loaded.
const selectionStart=source.indexOf('  const selectJournalDate = (nextDate) => {');
const selectionEnd=source.indexOf('\n  };',selectionStart)+5;
let selected='2026-11-19',loading=false;
const handledUnreadFeedbackRef={current:false};
const select = new Function('dateKey','nutritionDateKey','handledUnreadFeedbackRef','loadedDayRef','setLoading','setDateKey',
 source.slice(selectionStart,selectionEnd)+';return selectJournalDate;')(
 selected,()=> '2026-11-19',handledUnreadFeedbackRef,loadedDayRef,value=>{loading=value;},value=>{selected=value;});
select('2026-11-18');
assert.equal(selected,'2026-11-18');assert.equal(loading,true);
assert.equal(handledUnreadFeedbackRef.current,true);assert.equal(loadedDayRef.current,null);
select('');select('2026-11-20');assert.equal(selected,'2026-11-18');
assert.match(source,/loadedDayRef.current !== journalDayKey\) \{/);
assert.match(source,/type="date"[^\n]+selectJournalDate/);
console.log('PASS journal: past dates, late snapshots, long notes, day isolation and concurrent save/typing.');
