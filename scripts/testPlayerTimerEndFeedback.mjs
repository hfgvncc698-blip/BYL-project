import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/components/SessionPlayer.jsx', 'utf8');
const start = source.indexOf('  const restTimer = useTimer(() => {');
const end = source.indexOf('\n  });', start) + '\n  });'.length;
for (const inChain of [false, true]) {
  for (const autoFlowEnabled of [false, true]) {
    for (const currentSet of [1, 2]) {
      const cues = [];
      let completed;
      const scope = {
        useTimer: callback => { completed = callback; },
        emitPlayerFeedback: cue => cues.push(cue),
        finalizeCurrentSetRestPerformance() {},
        buildChainInfo: () => ({ inChain }),
        sessionObj: {}, flat: [], exIndex: 0, currentSet,
        autoFlowEnabled, isTimerOnlyChain: () => false,
        advanceInsideChain() {}, totalSetsRef: { current: 2 },
        seedFollowingSetPerformance() {}, autoStartNextRef: { current: false },
        setCurrentSet() {}, setPhase() {},
        effortTimer: { reset() {} }, durSecRef: { current: 30 },
        effortElapsedTimer: { reset() {} }, nextExercise() {},
      };
      vm.runInNewContext(source.slice(start, end), scope);
      completed();
      assert.deepEqual(cues, ['setComplete'], 'Rest completion must signal even without auto-start');
    }
  }
}
console.log('Timer end signal: manual/automatic, chained/standalone and last/intermediate sets passed.');
