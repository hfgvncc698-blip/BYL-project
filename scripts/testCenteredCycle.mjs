import assert from 'node:assert/strict';
import { centerCycle } from '../src/hooks/useCenteredCycle.js';
let vertical = 80;
const container = {
  clientWidth: 600, scrollLeft: 0,
  get scrollTop() { return vertical; },
  set scrollTop(value) { vertical = value; },
  getBoundingClientRect: () => ({ left: 100 }),
  querySelector: () => ({ getBoundingClientRect: () => ({ left: 2100 - container.scrollLeft, width: 160 }) }),
};
centerCycle(container);
assert.equal(container.scrollLeft, 1780, 'late current cycle is centered');
assert.equal(vertical, 80, 'vertical position is untouched');
centerCycle(container);
assert.equal(container.scrollLeft, 1780, 'centering is idempotent');
container.clientWidth = 300;
centerCycle(container);
assert.equal(container.scrollLeft, 1930, 'mobile resize recenters the card');
container.querySelector = () => null;
centerCycle(container);
assert.equal(container.scrollLeft, 1930);
centerCycle(null);
console.log('Cycle centering: long history, mobile width, no vertical scroll and empty state passed.');
