import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createVault, createRecoverySecret} from './fixtures/lot7b1bis/encryptedVaultPrototype.mjs';
const scope = {uid:'synthetic-a', role:'coach', club:'synthetic-club', revision:1};
const secret = createRecoverySecret();
const vault = createVault();
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
await vault.unlock(scope, secret);
const ticket = vault.ticket();
const domains = ['programs','history','nutrition','messages','drafts','club','progress'];
const envelopes = new Map();
for (const domain of domains) {
  await test(domain + ' encrypted roundtrip', async () => {
    const value = {syntheticPrivate: 'fixture-' + domain, entries:[1,2,3]};
    const envelope = await vault.seal(ticket, domain, value);
    assert(!JSON.stringify(envelope).includes(value.syntheticPrivate));
    assert.deepEqual(await vault.open(ticket, domain, envelope), value);
    envelopes.set(domain, JSON.parse(JSON.stringify(envelope)));
  });
}
await test('random IV for repeated plaintext', async () => {
  const a = await vault.seal(ticket,'x',{n:1}), b = await vault.seal(ticket,'x',{n:1});
  assert.notDeepEqual(a.iv,b.iv); assert.notDeepEqual(a.ciphertext,b.ciphertext);
});
await test('tampered ciphertext rejected', async () => {
  const bad = structuredClone(envelopes.get('programs')); bad.ciphertext[0] ^= 1;
  await assert.rejects(vault.open(ticket,'programs',bad));
});
await test('record substitution rejected', () => assert.rejects(vault.open(ticket,'nutrition',envelopes.get('programs'))));
for (const changed of [{uid:'synthetic-b'},{role:'client'},{club:'different'},{revision:2}]) {
  await test('scope change rejected ' + Object.keys(changed)[0], async () => {
    const other = createVault(); await other.unlock({...scope,...changed},secret);
    await assert.rejects(other.open(other.ticket(),'programs',envelopes.get('programs')));
  });
}
await test('wrong recovery secret rejected', async () => {
  const other = createVault(); await other.unlock(scope,createRecoverySecret());
  await assert.rejects(other.open(other.ticket(),'programs',envelopes.get('programs')));
});
await test('late encryption after logout rejected', async () => {
  const work = vault.seal(ticket,'late',{syntheticPrivate:'late'}); vault.lock();
  await assert.rejects(work,/locked-or-stale/);
});
await test('late unlock rejected', async () => {
  const work = vault.unlock(scope,secret); vault.lock(); await assert.rejects(work,/locked-or-stale/);
});
await vault.unlock(scope,secret);
await test('late decryption rejected', async () => {
  const work = vault.open(vault.ticket(),'programs',envelopes.get('programs')); vault.lock();
  await assert.rejects(work,/locked-or-stale/);
});
await test('late network response cannot deliver after identity transition', async () => {
  await vault.unlock(scope,secret); const old = vault.ticket();
  await vault.unlock({...scope,uid:'synthetic-b'},createRecoverySecret());
  let delivered = false;
  assert.throws(() => vault.deliver(old,{syntheticPrivate:'late'},()=>{delivered=true;}),/locked-or-stale/);
  assert.equal(delivered,false);
});
await test('fresh instance locked until secret supplied (restart model)', async () => {
  const reopened = createVault(); assert.throws(()=>reopened.ticket());
  await reopened.unlock(scope,secret);
  assert.equal((await reopened.open(reopened.ticket(),'programs',envelopes.get('programs'))).syntheticPrivate,'fixture-programs');
});
await test('independent instances cannot share private data with distinct secrets (tab model)', async () => {
  const b = createVault(); await b.unlock({...scope,uid:'synthetic-b'},createRecoverySecret());
  await assert.rejects(b.open(b.ticket(),'programs',envelopes.get('programs')));
});
await vault.unlock(scope,secret);
const times=[];
for (const size of [10_000,100_000,1_000_000]) {
  const value={syntheticPrivate:'x'.repeat(size)};
  const start=performance.now();const envelope=await vault.seal(vault.ticket(),'bench',value);
  const encrypted=performance.now();await vault.open(vault.ticket(),'bench',envelope);const end=performance.now();
  times.push({payloadBytes:size,sealMs:+(encrypted-start).toFixed(2),openMs:+(end-encrypted).toFixed(2),jsonEnvelopeBytes:JSON.stringify(envelope).length});
}
console.log(JSON.stringify({passed,engine:process.version,times,heapUsed:process.memoryUsage().heapUsed,
  limitation:'Prototype WebCrypto Node only. No browser, IDB transaction, SDK cache, application auth or migration integration.'}));
secret.fill(0);vault.lock();
