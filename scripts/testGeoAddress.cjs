const assert = require('node:assert/strict');
const { formatGeoAddress } = require('../backend/utils/geoAddress');
assert.equal(formatGeoAddress({ city: 'Zanzibar', country: 'Tanzania' }), null);
assert.equal(formatGeoAddress({ house_number: '12', road: 'Rue du Port', postcode: '06400', city: 'Cannes', country: 'France' }), '12 Rue du Port, 06400 Cannes, France');
assert.equal(formatGeoAddress({ road: 'شارع فلسطين', city: 'جدة', country: 'السعودية' }), 'شارع فلسطين, جدة, السعودية');
assert.equal(formatGeoAddress({ building: 'Gare', town: 'Antibes' }), 'Gare, Antibes');
assert.equal(formatGeoAddress({}), null);
console.log('Addresses: street/number, non-Latin scripts, building, and coordinate fallback for city-only responses passed.');
