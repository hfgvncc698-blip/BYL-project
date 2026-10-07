const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../backend/routes/analytics.js'), 'utf8');
const begin = source.indexOf('    const windowKey = _req.query.window');
const end = source.indexOf('    const recentVisitorRefs', begin);
const code = source.slice(begin, end);
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-06T12:00:00Z'])); } }
(async () => {
  for (const [window, expected] of [['today', ['2026-10-06']], ['7d', ['2026-10-06', '2026-10-05', '2026-09-30']], ['30d', ['2026-10-06', '2026-10-05', '2026-09-30', '2026-09-07']], ['all', ['2026-10-06', '2026-10-05', '2026-09-30', '2026-09-07', '2026-08-01']]]) {
    const requested = [];
    const chain = day => ({
      doc: day => chain(day), collection: () => chain(day),
      orderBy: (field, direction) => { assert.equal(field, 'lastSeenAt'); assert.equal(direction, 'desc'); return chain(day); },
      limit: n => { assert.equal(n, 120); return chain(day); },
      get: async () => { requested.push(day); return { docs: [] }; },
    });
    await vm.runInNewContext(`(async () => { ${code} })()`, {
      Date: FixedDate, _req: { query: { window } }, today: '2026-10-06',
      fmtDay: d => d.toISOString().slice(0, 10), db: { collection: () => chain() },
      globalDailySnap: { docs: ['2026-10-06', '2026-10-05', '2026-09-30', '2026-09-07', '2026-08-01'].map(id => ({ id })) },
    });
    assert.deepEqual(requested, expected, window);
  }
  console.log('Geo visits: today, seven days, thirty days and all-time load the correct daily collections.');
})().catch(error => { console.error(error); process.exitCode = 1; });
