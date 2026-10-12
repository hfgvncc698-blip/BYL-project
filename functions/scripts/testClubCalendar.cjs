const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');
const start = source.indexOf('exports.ensureClubCalendarSubscription =');
const end = source.indexOf('exports.ensureCoachCalendarSubscription =', start);
const rows = new Map(), indexed = [];
let user = { clubId: 'club', accountType: 'club_owner' };
const ref = path => ({path, get:async()=>({data:()=>rows.get(path)})});
const context = {
 exports:{}, onCall:(_options,handler)=>handler,
 HttpsError:class extends Error {constructor(code,message){super(message);this.code=code;}},
 safeTrim:x=>String(x||'').trim(), crypto,
 requireProfessionalCaller:async()=>user,
 normalizeCalendarTimezone:x=>x||'Europe/Paris',
 db:{doc:ref,runTransaction:async run=>run({get:r=>r.get(),set:(r,v)=>rows.set(r.path,v)})},
 admin:{firestore:{FieldValue:{serverTimestamp:()=>123}}},
 upsertCalendarTokenIndex:async x=>indexed.push(x),buildCalendarUrlFromToken:t=>'https://example.invalid/?token='+t,
};
vm.runInNewContext(source.slice(start,end),context);
(async()=>{
 const handler=context.exports.ensureClubCalendarSubscription;
 await assert.rejects(handler({data:{clubId:'club'}}),e=>e.code==='unauthenticated');
 user={clubId:'club',accountType:'coach'};
 await assert.rejects(handler({auth:{uid:'coach'},data:{clubId:'club'}}),e=>e.code==='permission-denied');
 user={clubId:'club',accountType:'club_owner'};
 await assert.rejects(handler({auth:{uid:'owner'},data:{clubId:'other'}}),e=>e.code==='permission-denied');
 const request={auth:{uid:'owner'},data:{clubId:'club'}};
 const first=await handler(request), second=await handler(request);
 assert.equal(first.url,second.url);
 assert.equal(indexed[0].kind,'club');
 assert.equal(rows.get('clubs/club/private/calendar').ownerUid,'owner');
 const feedStart=source.indexOf('      if (indexedToken?.kind === "club")');
 const feedEnd=source.indexOf('      /* ---------------------------------------------------',feedStart);
 const execute=vm.runInNewContext('(async () => {'+source.slice(feedStart,feedEnd)+'})', {
  ...context,indexedToken:{kind:'club',ownerId:'club'},indexedTokenEnabled:true,token:'wrong',
  getRequesterProfile:async()=>user,hasProfessionalAccess:()=>true,
  res:{status:code=>{assert.equal(code,404);return {send:()=>{}};}},
 });
 await execute();
 console.log('Club calendar: unauthenticated, coach and other-club denied; stable owner token; invalid feed token rejected.');
})().catch(e=>{console.error(e);process.exitCode=1});
