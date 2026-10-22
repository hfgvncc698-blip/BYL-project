import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('src/components/ClientView.jsx', 'utf8');
const start = source.indexOf('const publishProgrammes = ');
const end = source.indexOf('\n\n    const paintQuickProgrammes', start);
assert.ok(start > 0 && end > start);
const cache = new Map([['client', {client:{id:'client'}}]]);
const sequence = {current:1};
let painted;
const context = vm.createContext({
  loadSeq:1, programmesLoadSeqRef:sequence, requestedClientId:'client',
  clientViewMemoryCache:cache, setProgrammes:rows=>{painted=rows;},
  visibleProgrammes:[],
});
vm.runInContext(source.slice(start,end) + '\npublishProgrammes([{id:"fast"},{id:"slow"}]);', context);
vm.runInContext('publishProgrammes(visibleProgrammes.map(p=>p.id==="fast"?{...p,__detailsLoaded:true}:p));', context);
assert.equal(painted[0].__detailsLoaded, true);
assert.equal(painted[1].__detailsLoaded, undefined, 'slow history must not delay completed programme');
assert.equal(cache.get('client').client.id, 'client', 'preserve profile cache fields');
assert.equal(cache.get('client').programmes, painted);
const last = painted;
sequence.current = 2;
vm.runInContext('publishProgrammes([]);', context);
assert.equal(painted, last, 'old client/request cannot repaint or replace cache');
assert.equal(cache.get('client').programmes, last);
assert.ok(source.includes('return enrichedProgramme;'), 'final aggregate retains all completed histories');
console.log('Client profile progressive details: early publication, preserved unfinished rows/cache and stale-load guard OK');
