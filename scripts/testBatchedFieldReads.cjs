const assert = require('node:assert/strict');
const { batchedFieldReads } = require('../backend/utils/batchedFieldReads');
(async () => {
  let active = 0, peak = 0, calls = 0;
  const db = { collection: name => ({ where: (field, op, ids) => ({ limit: limit => ({ get: async () => {
    assert.equal(name, 'clients'); assert.equal(field, 'createdBy'); assert.equal(op, 'in');
    assert.equal(limit, 500); assert.ok(ids.length <= 10);
    calls++; active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve)); active--;
    return { docs: ids.map(id => ({ id, data: () => ({ owner: id }) })) };
  } }) }) }) };
  const ids = Array.from({ length: 95 }, (_, i) => String(i));
  const rows = await batchedFieldReads(db, 'clients', 'createdBy', [...ids, '0', null]);
  assert.deepEqual(rows.map(row => row.id), ids);
  assert.equal(calls, 10); assert.equal(peak, 4);
  assert.deepEqual(await batchedFieldReads(db, 'clients', 'createdBy', []), []);
  assert.equal(calls, 10);
  const failing = { collection: () => ({ where: () => ({ limit: () => ({ get: async () => { throw new Error('denied'); } }) }) }) };
  await assert.rejects(batchedFieldReads(failing, 'clients', 'createdBy', ['a']), /denied/);
  console.log('Batched reads OK: bounded concurrency, stable ordering, deduplication, empty scope and failures.');
})().catch(error => { console.error(error); process.exitCode = 1; });
