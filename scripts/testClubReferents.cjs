const assert=require('node:assert/strict');
const {createClubReferents,referent}=require('../backend/utils/clubReferents');
const data=new Map([
 ['users/owner',{role:'coach',accountType:'club_owner',clubId:'c'}],['clubs/c',{ownerUid:'owner'}],
 ['users/a',{role:'coach',clubId:'c'}],['users/b',{role:'coach',clubId:'c'}],['users/x',{role:'coach',clubId:'x'}],
 ['clubs/c/members/a',{status:'active',firstName:'Alex'}],['clubs/c/members/b',{status:'active',firstName:'Ben'}],
 ['clients/u',{clubId:'c',coachId:'owner',createdBy:'owner',firstName:'Client',objectif:'Endurance',niveau:'Débutant',privateNotes:'secret',medicalHistory:'secret'}],
 ['clients/foreign',{clubId:'x',coachId:'x',firstName:'Secret'}],
]);
const snap=p=>({id:p.split('/').pop(),exists:data.has(p),data:()=>data.get(p)});
const ref=p=>({get:async()=>snap(p),collection:n=>coll(p+'/'+n),path:p,id:p.split('/').pop()});
const coll=p=>({doc:id=>ref(p+'/'+id),get:async()=>({docs:[...data.keys()].filter(k=>k.startsWith(p+'/')&&k.split('/').length===p.split('/').length+1).map(snap)}),where:(f,op,v)=>({get:async()=>({docs:(await coll(p).get()).docs.filter(d=>op==='array-contains'?(d.data()[f]||[]).includes(v):d.data()[f]===v)})})});
let queue=Promise.resolve();
const db={collection:coll,runTransaction:fn=>{const n=queue.then(()=>fn({get:r=>r.get(),set:(r,d,o)=>data.set(r.path,{...(o?.merge?data.get(r.path):{}),...d})}));queue=n.catch(()=>{});return n;}};
(async()=>{
 const s=createClubReferents(db),directory=await s.directory('a');
 assert.equal(directory.clients.length,1);assert.equal(directory.clients[0].referentId,'');
 assert.equal('email' in directory.clients[0],false);
 assert.deepEqual(directory.clients[0].profile,{objective:'Endurance',level:'Débutant'});
 assert.equal('privateNotes' in directory.clients[0],false);
 assert.equal(JSON.stringify(directory.clients).includes('secret'),false);
 const race=await Promise.allSettled([s.assign('a','u',{version:0}),s.assign('b','u',{version:0})]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(data.get('clients/u').createdBy,'owner');
 assert.equal(referent(data.get('clients/u'),'c','owner'),'a');
 assert.ok(data.get('clients/u').followupStartedAtByCoach.a > 0);
 await assert.rejects(s.assign('b','u',{version:1}),e=>e.status===409);
 await s.assign('owner','u',{coachUid:'b',version:1});
 assert.equal(referent(data.get('clients/u'),'c','owner'),'b');
 assert.ok(data.get('clients/u').followupStartedAtByCoach.b > 0);
 assert.ok(data.get('clients/u').followupStartedAtByCoach.a > 0);
 await assert.rejects(s.assign('a','foreign',{version:0}),e=>e.status===403);
 data.get('clubs/c/members/a').status='disabled';
 await assert.rejects(s.directory('a'),e=>e.status===403);
 await assert.rejects(s.assign('owner','u',{coachUid:'a',version:2}));
 await s.assign('owner','u',{coachUid:'',version:2});
 assert.equal(referent(data.get('clients/u'),'c','owner'),'');
 console.log('Club referents: minimal directory, isolation, active membership, concurrent claims, reassignment and registration identity passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
