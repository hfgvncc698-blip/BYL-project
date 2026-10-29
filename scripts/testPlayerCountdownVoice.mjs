import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let now = 10000;
const starts = [];
const sources = [];
const requests = [];
let pendingFetch;
const context = {
  currentTime: 50,
  destination: {},
  decodeAudioData: async data => data,
  createBufferSource() {
    const source = { connect() {}, disconnect() {}, stop() { this.stopped = true; }, start(at) { starts.push(at); } };
    sources.push(source); return source;
  },
};
const scope = {
  getAudioContext: () => context, primeFeedbackAudio: async () => true,
  Date: { now: () => now }, AbortController, setTimeout, clearTimeout,
  fetch: async url => {
    requests.push(url);
    if (pendingFetch) await pendingFetch;
    return { ok: true, arrayBuffer: async () => url };
  },
};
const source = fs.readFileSync('src/utils/playerCountdownVoice.js', 'utf8')
  .replace(/^import .*\n/, '').replaceAll('export ', '');
vm.createContext(scope); vm.runInContext(source, scope);
for (const lang of ['fr', 'en', 'de', 'es', 'it', 'ru', 'ar']) {
  await scope.preloadCountdownVoice(lang);
  for (const number of [3,2,1]) {
    assert.ok(requests.includes(`/audio/countdown/${lang}-${number}.wav`));
    const wav = fs.readFileSync(`public/audio/countdown/${lang}-${number}.wav`);
    assert.ok(wav.length > 5000, 'Audio clip must contain samples');
  }
}
await scope.scheduleCountdownVoice(15000, 'fr-FR');
assert.deepEqual(starts, [52,53,54], 'All three numbers scheduled ahead on audio clock');
// No JS callback or React render is needed between the three starts.
now += 2200;
assert.deepEqual(starts,[52,53,54]);
scope.stopCountdownVoice();
assert.ok(sources.every(s => s.stopped), 'Pause cancels all scheduled numbers');
starts.length=0;
await scope.scheduleCountdownVoice(14000,'fr');
assert.deepEqual(starts,[50.8], 'Skip stale numbers instead of queuing them late');

// Stop while asset loading: resolving later must not restart an old countdown.
const freshScope = {...scope};
vm.createContext(freshScope); vm.runInContext(source, freshScope);
let release;
pendingFetch = new Promise(resolve => { release=resolve; });
starts.length=0;
const loading = freshScope.scheduleCountdownVoice(20000,'fr');
freshScope.stopCountdownVoice(); release(); await loading;
assert.deepEqual(starts,[]);

// Effect identity follows the deadline, not individual displayed seconds.
const player = fs.readFileSync('src/components/SessionPlayer.jsx','utf8');
assert.match(player,/\[countdownTarget, isPaused, soundEnabled, activeLanguage\]/);
assert.match(player,/setInterval\(tick, 100\)/);
assert.ok(!player.includes('speakCountdown('));
console.log('Countdown: seven locales, audio samples, exact 3/2/1 scheduling, cancellation, stale loading and late-start checks passed.');

// Safari callback decoding and a first resume refused before a user gesture.
pendingFetch = null;
let retry;
let ready = false;
const listeners = new Set();
const safariContext = {
  ...context,
  state: 'running',
  decodeAudioData(data, success) { success(data); },
  addEventListener(_event, listener) { listeners.add(listener); },
  removeEventListener(_event, listener) { listeners.delete(listener); },
};
const safariScope = {
  ...scope,
  getAudioContext: () => safariContext,
  primeFeedbackAudio: async () => ready,
  setTimeout(callback, delay) { if (delay === 250) retry = callback; return callback; },
  clearTimeout(timer) { if (retry === timer) retry = null; },
};
vm.createContext(safariScope); vm.runInContext(source, safariScope);
starts.length = 0;
assert.equal(await safariScope.scheduleCountdownVoice(20000, 'fr'), false);
assert.equal(typeof retry, 'function');
ready = true;
retry();
await new Promise(resolve => setImmediate(resolve));
assert.equal(starts.length, 3, 'Late audio unlock retries all remaining numbers');
safariContext.state = 'interrupted';
for (const listener of [...listeners]) listener();
safariContext.state = 'running';
for (const listener of [...listeners]) listener();
await new Promise(resolve => setImmediate(resolve));
assert.equal(starts.length, 6, 'Resuming audio rebuilds scheduling against original deadline');
safariScope.stopCountdownVoice();
assert.equal(listeners.size, 0, 'Stopping removes recovery listener');
ready = false;
await safariScope.scheduleCountdownVoice(20000, 'fr');
safariScope.stopCountdownVoice();
assert.equal(retry, null, 'Pause cancels audio-unlock retries');
console.log('Safari: callback decoding, delayed unlock, interruption recovery and retry cancellation passed.');
