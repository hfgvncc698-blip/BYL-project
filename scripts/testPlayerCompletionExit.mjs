import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { withPlayerDeadline } from '../src/utils/playerRequestDeadline.js';

const source = fs.readFileSync('src/components/SessionPlayer.jsx', 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const flow = extract('  const showScheduleSuggestionOrLeave =', '  const scheduleSuggestedSession =');
const exit = extract('  const leaveCompletedSession =', '  const showCompletionSaveError =');
async function run(build, { coach = true, journey = false } = {}) {
  const events = [];
  const context = {
    isCoachContext: coach, location: { state: { clientJourney: journey } }, programId: 'program',
    onClose: () => events.push('close'),
    clearPlayerResumeSnapshot: () => events.push('clear'),
    setCompletionSubmitting: value => events.push(['submitting', value]),
    completionSubmitActionRef: { current: 'submit' },
    buildScheduleSuggestionAfterCompletion: build,
    withPlayerDeadline: (promise, ms) => {
      assert.equal(ms, 2500);
      return withPlayerDeadline(promise, 5);
    },
    setScheduleSuggestion: value => events.push(['suggestion', value]),
    openScheduleSuggestion: () => events.push('suggestion-open'),
    navigate: (path, options) => events.push(['navigate', path, options]),
  };
  vm.createContext(context);
  vm.runInContext(exit + flow + '\nthis.run = showScheduleSuggestionOrLeave;', context);
  const pending = context.run();
  assert.equal(events[0], 'close', 'rating closes before optional network lookup');
  assert.equal(context.completionSubmitActionRef.current, '');
  await pending;
  return events;
}
for (const build of [() => new Promise(() => {}), () => Promise.reject(new Error('offline')), () => Promise.resolve(null)]) {
  const events = await run(build);
  assert.equal(events.find(e => e[0] === 'navigate')[1], '/coach-dashboard');
  assert.ok(!events.includes('suggestion-open'));
}
let resolveLate;
const events = await run(() => new Promise(resolve => { resolveLate = resolve; }));
resolveLate({ target: 'late' });
await new Promise(resolve => setTimeout(resolve, 10));
assert.ok(!events.includes('suggestion-open'), 'late responses cannot reopen a modal');
const suggested = await run(() => Promise.resolve({ target: 'tomorrow' }));
assert.ok(suggested.includes('suggestion-open'));
assert.ok(!suggested.some(e => e[0] === 'navigate'));
const client = await run(() => { throw new Error('must not query'); }, { coach: false, journey: true });
assert.equal(client.find(e => e[0] === 'navigate')[1], '/user-dashboard');
console.log('Completion exit: stalled/failed/empty reads, late response, valid suggestion and client journey passed.');
