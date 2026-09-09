import assert from 'node:assert/strict';
import { subscribeToProgram } from '../src/utils/programSubscription.js';

const listeners = [], values = [], errors = [];
const stop = subscribeToProgram({
  candidates: [{ id: 'assigned', ref: 'assigned' }, { id: 'base', ref: 'base' }],
  subscribe(ref, options, next, error) {
    assert.equal(options.includeMetadataChanges, true);
    const listener = { ref, next, error, stopped: false };
    listeners.push(listener);
    return () => { listener.stopped = true; };
  }, onValue: (...args) => values.push(args), onError: error => errors.push(error),
});
const snapshot = (exists, fromCache, hasPendingWrites = false) => ({ exists: () => exists, data: () => ({ sessions: [{ exercises: ['complete'] }] }), metadata: { fromCache, hasPendingWrites } });
assert.equal(listeners.length, 1, 'first load makes one subscription, not getDoc then subscription');
listeners[0].next(snapshot(false, true));
assert.equal(values.length, 0, 'empty cache is not not-found');
assert.equal(listeners.length, 1, 'empty cache cannot open a base template instead of the assigned version');
listeners[0].next(snapshot(true, true));
assert.equal(values[0][1], true, 'cached full program is displayed immediately');
listeners[0].next(snapshot(true, false, true));
assert.equal(values[1][1], true, 'unconfirmed local writes are not server confirmation');
listeners[0].next(snapshot(true, false));
assert.equal(values[2][1], false);
listeners[0].next(snapshot(false, false));
assert.equal(listeners[0].stopped, true);
assert.equal(listeners[1].ref, 'base');
listeners[0].next(snapshot(true, false));
assert.equal(values.length, 3, 'late assigned callbacks cannot overwrite the fallback');
listeners[1].error({ code: 'permission-denied' });
assert.equal(errors.length, 1);
stop();
assert.equal(listeners[1].stopped, true);
listeners[1].next(snapshot(true, false));
assert.equal(values.length, 3, 'unmounted viewer has no late state writes or listener leaks');
console.log('Program subscription OK: single read, cache/server distinction, fallback, permissions, cleanup.');
