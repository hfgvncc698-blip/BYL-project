const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { geoVisitEventId, isGeoVisitRegression } = require('../backend/utils/geoVisitEvent');

const source = fs.readFileSync(require.resolve('../backend/routes/analytics.js'), 'utf8');
const start = source.indexOf('    const dailyRef = db.collection("analytics_daily").doc(day);', source.indexOf('router.post("/pageview"'));
const end = source.indexOf('    if (acceptedVisit) await updateUserLastVisit();', start);
assert.ok(start > 0 && end > start);
const transactionCode = source.slice(start, end);
const stored = new Map();
let clock = 1000;
let autoId = 0;
const ref = path => ({ path, collection: name => col(`${path}/${name}`) });
const col = path => ({ doc: id => ref(`${path}/${id || `generated-${++autoId}`}`) });
const merge = (previous, patch) => {
  const result = { ...previous };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && 'increment' in value) result[key] = (result[key] || 0) + value.increment;
    else if (value && typeof value === 'object' && !(value instanceof Date)) result[key] = merge(result[key] || {}, value);
    else result[key] = value;
  }
  return result;
};
const db = {
  collection: col,
  async runTransaction(work) {
    let writing = false;
    const writes = [];
    const tx = {
      get: async reference => {
        assert.equal(writing, false, 'Firestore reads must precede writes');
        const data = stored.get(reference.path);
        return { exists: !!data, data: () => data };
      },
      set: (reference, patch, options) => { writing = true; writes.push({ reference, patch, options }); },
    };
    await work(tx);
    for (const { reference, patch, options } of writes) {
      stored.set(reference.path, merge(options?.merge ? stored.get(reference.path) : {}, patch));
    }
  },
};
async function send({ visitId = 'opening-one', visitorId = 'uid:one', lat = null, lng = null, city = 'unknown', country = 'UN', captured = 0 } = {}) {
  clock += 1000;
  const context = vm.createContext({
    db, req: { body: { visitId } }, geoVisitEventId, isGeoVisitRegression,
    FieldValue: { serverTimestamp: () => clock, increment: n => ({ increment: n }) },
    day: '2026-09-09', hour: 12, visitorTimeZone: 'Europe/Paris', visitorId,
    uid: visitorId, role: 'coach', path: '/coach-dashboard', country, city, lat, lng,
    accuracy: lat === null ? null : 15, geoCapturedAt: captured ? new Date(captured) : null,
    geoSource: lat === null ? 'network' : 'browser', analyticsAllowed: true,
    geoId: `${country}-${city}`, hasGeoLabel: country !== 'UN' && city !== 'unknown', safeKey: value => value,
  });
  await vm.runInContext(`(async () => {${transactionCode}})()`, context);
}
const events = () => [...stored.entries()].filter(([key]) => key.startsWith('analytics_daily/2026-09-09/events/'));
const day = () => stored.get('analytics_daily/2026-09-09');
(async () => {
  assert.notEqual(geoVisitEventId('uid:one', 'same'), geoVisitEventId('uid:two', 'same'), 'identities isolate event IDs');
  assert.equal(geoVisitEventId('uid:one', '../bad'), null);
  await send();
  const openedAt = events()[0][1].seenAt;
  assert.equal(events().length, 1);
  assert.equal(day().pageviews, 1);
  await send({ lat: 43.5, lng: 7, captured: 2000 });
  assert.equal(events().length, 1, 'GPS enriches the existing visit');
  assert.equal(events()[0][1].lat, 43.5);
  assert.equal(events()[0][1].seenAt, openedAt, 'opening time is preserved');
  await send({ lat: 43.5, lng: 7, city: 'Cannes', country: 'FR', captured: 2000 });
  assert.equal(events()[0][1].city, 'Cannes', 'late city name enriches the same event');
  assert.equal(day().pageviews, 1);
  assert.equal(day().uniqueVisitors, 1);
  assert.equal(day().byCountry.FR, 1);
  assert.equal(day().byCountry.UN, 0);
  assert.equal(stored.get('analytics_geo/FR-Cannes').pv, 1);
  await send();
  await send({ lat: 43.5, lng: 7, captured: 2000 });
  await send({ lat: 42, lng: 6, city: 'Old', country: 'FR', captured: 1000 });
  assert.equal(events()[0][1].city, 'Cannes', 'late empty, unresolved or older replies cannot erase the location');
  await send({ lat: 43.5, lng: 7, city: 'Cannes', country: 'FR', captured: 2000 });
  assert.equal(day().pageviews, 1, 'replay does not inflate visits');
  assert.equal(stored.get('analytics_geo/FR-Cannes').pv, 1, 'replay does not inflate city visits');
  await send({ visitId: 'opening-two' });
  assert.equal(events().length, 2, 'a genuine new opening remains separate');
  await send({ visitorId: 'uid:two' });
  assert.equal(events().length, 3, 'another user cannot overwrite this visit');
  await send({ visitId: null });
  await send({ visitId: null });
  assert.equal(events().length, 5, 'legacy clients still create separate events');
  console.log('Geo visit enrichment: real transaction logic passes late GPS/city, ordering, idempotence, counters, identities and legacy tests (in-memory Firestore).');
})().catch(error => { console.error(error); process.exitCode = 1; });
