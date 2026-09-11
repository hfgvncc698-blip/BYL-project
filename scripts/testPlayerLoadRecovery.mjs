import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { withPlayerDeadline } from '../src/utils/playerRequestDeadline.js';

const source = fs.readFileSync('src/components/SessionPlayer.jsx', 'utf8');
const start = source.indexOf('  useEffect(() => {', source.indexOf('/* ---------------------- Live load programme'));
const end = source.indexOf('/* ---------------------- Load client exercise history', start);
assert.ok(start > 0 && end > start);
let loading, error, timeout, next, fail, cleanup, unsubscribed;
const context = {
  useEffect: fn => { cleanup = fn(); }, programDocRef: {}, sessionIndex: 0, programLoadAttempt: 0,
  setLoading: value => { loading = value; }, setProgramLoadError: value => { error = value; },
  setProgramData: () => {}, setSessionObj: () => {}, setFlat: () => {}, setMapIdx: () => {},
  setTimeout: fn => { timeout = fn; return 1; }, clearTimeout: () => {},
  onSnapshot: (_, onNext, onError) => { next = onNext; fail = onError; return () => { unsubscribed = true; }; },
  getProgramSessionList: () => [], flattenSession: () => ({ flat: [], map: [] }),
};
vm.runInNewContext(source.slice(start, end), context);
assert.equal(loading, true);
timeout(); assert.equal(loading, false); assert.ok(error);
next({ exists: () => true, data: () => ({}) }); assert.equal(error, '');
fail({ code: 'permission-denied' }); assert.match(error, /accès/);
cleanup(); assert.equal(unsubscribed, true);
assert.equal(await withPlayerDeadline(Promise.resolve('saved'), 20), 'saved');
await assert.rejects(withPlayerDeadline(new Promise(() => {}), 5), /timeout/);
console.log('Player: stalled load, late recovery, denied access, cleanup and request deadlines passed.');
