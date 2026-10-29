import assert from 'node:assert/strict';
let current, count = 0, starts = 0, bufferStarts = 0;
class FakeAudioContext {
  constructor() { current = this; count++; this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
  async resume() { this.resumes = (this.resumes || 0) + 1; if (this.blocked) return new Promise(() => {}); this.state = 'running'; }
  createBuffer() { return {}; }
  createBufferSource() { return { connect() {}, disconnect() {}, start() { bufferStarts++; } }; }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() { starts++; }, stop() {} }; }
}
globalThis.window = { AudioContext: FakeAudioContext, navigator: {}, setTimeout: () => 0 };
const { primeFeedbackAudio, playFeedback } = await import('../src/utils/feedback.js');
assert.equal(await primeFeedbackAudio(), true);
assert.equal(current.resumes, 1);
await primeFeedbackAudio();
assert.equal(current.resumes, 1, 'running context is not needlessly resumed');
for (const state of ['interrupted', 'suspended']) {
  current.state = state;
  assert.equal(await playFeedback('exerciseStart', { hapticsEnabled: false }), true);
  assert.equal(current.state, 'running');
}
current.state = 'closed';
assert.equal(await primeFeedbackAudio(), true);
assert.equal(count, 2, 'closed audio is recreated');
current.state = 'interrupted'; current.blocked = true;
const before = starts;
assert.equal(await playFeedback('restStart', { hapticsEnabled: false }), false);
assert.equal(starts, before, 'blocked audio does not schedule stale cues');
current.blocked = false;
assert.equal(await primeFeedbackAudio(), true, 'later gesture can recover after timeout');
assert.equal(await playFeedback('restStart', { soundEnabled: false, hapticsEnabled: false }), false);
assert.equal(starts, before, 'disabled sounds stay silent');
console.log('Audio recovery: suspended/interrupted/closed, bounded resume, retry and disabled sound passed.');

assert.equal(bufferStarts, 0, 'Background priming never consumes gesture buffer unlock');
const unlock = primeFeedbackAudio({ userGesture: true });
assert.equal(bufferStarts, 1, 'Silent buffer starts synchronously before awaiting resume');
await unlock;
await primeFeedbackAudio({ userGesture: true });
assert.equal(bufferStarts, 1, 'Buffer is primed only once per context');
console.log('Gesture buffer unlock passed.');
