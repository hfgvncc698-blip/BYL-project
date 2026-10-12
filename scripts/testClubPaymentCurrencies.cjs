const assert = require('node:assert/strict');
const { validate } = require('../backend/utils/clubClientAdministration');
const row = { id: 'payment-test', label: 'Test', dueCents: 12550, paidCents: 2500, dueDate: '', paidDate: '2026-10-08', method: '', reference: '' };
const save = payments => validate({ entryDate: '', exitDate: '', accessStatus: 'active', payments }).payments;
assert.equal(save([row])[0].currency, 'EUR', 'Legacy payments remain EUR');
for (const currency of require('../backend/utils/clubCurrencies.json')) {
 const actual = save([{ ...row, currency }])[0];
 assert.equal(actual.currency, currency);
 assert.equal(actual.dueCents, 12550);
 assert.equal(actual.paidCents, 2500);
 assert.deepEqual(save([actual])[0], actual, 'Round-trip retains currency and amounts');
}
for (const currency of ['BAD']) assert.throws(() => save([{ ...row, currency }]), /Devise/);
assert.throws(() => save([{ ...row, currency: null }]), /Devise/);
console.log('Payment currencies: legacy EUR, supported precision, round trips and invalid codes passed.');

const legacyJPY={...row,currency:'JPY'};
assert.equal(validate({entryDate:'',exitDate:'',accessStatus:'active',payments:[legacyJPY]},[legacyJPY]).payments[0].currency,'JPY');
for (const [currency,unitScale,dueCents] of [['RUB',100,12345],['JPY',1,123],['KWD',1000,123456]]) {
 const actual=save([{...row,currency,unitScale,dueCents,paidCents:0}])[0];
 assert.equal(actual.unitScale,unitScale);assert.equal(actual.dueCents,dueCents);
}
assert.throws(()=>save([{...row,currency:'KWD',unitScale:100}]),/Devise/);
