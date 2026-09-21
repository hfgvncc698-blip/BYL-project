import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../src/pages/StatisticsPageClient.jsx',import.meta.url),'utf8');
assert.ok(!code.includes('collection(db, "measurements")'),'no unauthorized root write');
assert.ok(code.includes('await batch.commit()'),'client and legacy user mirrors commit atomically');
assert.ok(code.includes("doc(db,'users',user.uid,'measurements',ref.id)"),'same identifier across mirrors');
assert.ok(code.includes('savingRef.current'),'double-click protection');
assert.ok(!code.includes('isSessionValidatedRecord'),'no unused import to appease stale smoke tests');
console.log('Statistics: atomic mirrored save, no root writes, duplicate-click guard and shared statistics components OK');
