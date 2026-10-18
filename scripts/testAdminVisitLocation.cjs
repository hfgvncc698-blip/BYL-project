const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../backend/routes/analytics.js'), 'utf8');
const start = source.indexOf('    const lat = typeof latest.data.lat', source.indexOf('router.get("/admin/visitor/:uid"'));
const end = source.indexOf('\n    if (\n', start);
const code = source.slice(start, end);
const read = data => vm.runInNewContext(`${code}; ({lat,lng,city,country})`, {
 latest: {data}, userData: {location: {lat:21.5,lng:39.2,city:'Jeddah',country:'SA'}},
 cleanText: (value, length, fallback) => String(value || fallback).slice(0,length),
});
const missing = read({geoStatus:'permission_error'});
assert.equal(missing.lat, null);
assert.equal(missing.lng, null);
assert.equal(missing.city, 'unknown');
assert.equal(missing.country, 'UN');
const located = read({lat:43.5,lng:7,city:'Cannes',country:'FR'});
assert.equal(located.city,'Cannes');assert.equal(located.lat,43.5);
console.log('Admin visit: old profile coordinates cannot become the location of a new visit.');
