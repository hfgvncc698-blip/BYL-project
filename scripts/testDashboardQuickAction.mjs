import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/components/CoachDashboard.jsx', 'utf8');
const start = source.indexOf('  const handledQuickActionRef = useRef(null);');
const end = source.indexOf('  const clientQuota = useMemo(', start);
assert.ok(start >= 0 && end > start);
const ref = { current: null };
let opens = 0, navigations = 0;
const location = { key: 'first', pathname: '/coach-dashboard', search: '?quickAction=plan', hash: '' };
const context = {
  useRef: () => ref, useEffect: fn => fn(), URLSearchParams, location,
  clientModal: { onOpen: () => opens++ },
  openEmptySessionModal: () => opens++, nutritionOnlyDashboard: false,
  navigate: () => navigations++, withAdminCoach: path => path,
};
const render = () => vm.runInNewContext(`{${source.slice(start, end)}}`, context);
// React can render again while replace navigation is still pending.
for (let i = 0; i < 100; i++) render();
assert.equal(opens, 1);
assert.equal(navigations, 1);
// Closing must not reopen the modal. New navigation still opens normally.
location.search = ''; render();
assert.equal(opens, 1);
location.key = 'second'; location.search = '?quickAction=plan'; render();
assert.equal(opens, 2);
location.key = 'third'; location.search = '?quickAction=client'; render();
assert.equal(opens, 3);
console.log('Dashboard quick actions: one opening per navigation, no render loop, subsequent actions allowed.');
