import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the actual publication callback with client/history work unresolved.
const source = fs.readFileSync('src/components/CoachDashboard.jsx', 'utf8');
const start = source.indexOf('}).then((snapshot) => {', source.indexOf('const programmesSnapPromise'));
assert.ok(start > 0);
const end = source.indexOf('\n       // It runs in parallel', start);
const callback = source.slice(start + 8, end).trim().replace(/\);$/, '');
let active = true;
let published = null;
const publish = vm.runInNewContext(callback, {
  isLatestLoad: () => active,
  setProgrammesBase: value => { published = value; },
  toMillis: value => value || 0,
});
const snapshot = {docs:[
  {id:'old', data:()=>({createdAt:1})},
  {id:'new', data:()=>({createdAt:2})},
]};
assert.equal(publish(snapshot), snapshot);
assert.equal(published.map(p=>p.id).join(','), 'new,old');
active = false;
published = null;
publish(snapshot);
assert.equal(published, null, 'outdated coach/load must not overwrite current results');
active = true;
publish({docs:[]});
assert.equal(published.length, 0, 'deleted templates clear stale cached results');
console.log('Dashboard templates publish before client histories, including refresh, with stale-load protection: OK');

// Execute the list's real loading sequence with deliberately slow client reads.
const listSource = fs.readFileSync('src/components/ProgramsPage.jsx', 'utf8');
const listStart = listSource.indexOf('const pSnap = await readDashboardTemplates');
const listEnd = listSource.indexOf('const clientsById', listStart);
assert.ok(listStart > 0 && listEnd > listStart);
let resolveClients;
const clientSnapsPromise = new Promise(resolve => { resolveClients = resolve; });
let listPrograms = null;
let listLoading = true;
let listActive = true;
const runList = vm.runInNewContext(`(async () => { ${listSource.slice(listStart, listEnd)} })`, {
  readDashboardTemplates: async () => snapshot,
  effectiveCoachUid:'coach', apiFetch:()=>{}, getDocs:()=>{}, progQ:{},
  force:false, forceFresh:false, cached:null,
  load:{current:()=>listActive}, getMillis:p=>p.createdAt,
  setProgrammes:value=>{listPrograms=value;},
  setLoading:value=>{listLoading=value;},
  clientSnapsPromise,
});
const pendingList = runList();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(listLoading, false, 'slow client queries must not block the list');
assert.equal(listPrograms.map(p=>p.id).join(','), 'new,old');
resolveClients([]);
await pendingList;
listActive = false;
listPrograms = null;
await runList();
assert.equal(listPrograms, null, 'stale list response must not update the new account');
console.log('Programme list displays before slow client queries and protects stale loads: OK');
