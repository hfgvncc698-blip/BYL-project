// Two tabs on one API, then one per API, using the same large authorization scope.
const {db,historicalBackend}=require('./measureFirebaseLot1.cjs');
const {launch,stop,users,seed,call,totals,post,wait}=require('./measureMessagingLot2B1.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
process.env.BYL_MEASURE_RESOURCES='1';
function resources(api){return new Promise(resolve=>{
  const cb=m=>{if(m.resources){api.proc.off('message',cb);resolve(m.resources);}};
  api.proc.on('message',cb);api.proc.send({resources:true});
});}
async function run(){
  const size=Number(process.env.BYL_TOPO_SIZE || 1000);
  assert.ok([12,100,500,1000].includes(size),'unsupported fixture size');
  const professional=process.env.BYL_TOPO_KIND==='professional';
  const kind=professional ? 'professional' : 'club';
  const visible=size-Math.floor(size/(professional ? 5 : 10));
  const actor=professional ? 'coach' : 'owner';
  const idOf=row=>professional ? row.clientId : row.targetId;
  await users();const temp=fs.mkdtempSync(path.join(os.tmpdir(),'byl22-topology-'));
  try{
    const baseline=historicalBackend('3955d59',temp);
    for(const [label,folder] of [['2B1',baseline],['2B2',path.resolve(__dirname,'../backend')]]){
      if(process.env.BYL_LABEL && label!==process.env.BYL_LABEL)continue;
      for(const twoInstances of [false,true]){
        if(process.env.BYL_TOPO_INSTANCES && Number(process.env.BYL_TOPO_INSTANCES)!==(twoInstances ? 2 : 1))continue;
        await seed(size);
        const a=await launch(folder),b=twoInstances?await launch(folder):a,hosts=[...new Set([a,b])];
        const tabs=[a,b],states=[];
        const base=professional ? 'inbox?' : 'club/inbox?clubId=sample';
        const poll=(host,state,uid=actor,route=base,signal)=>call(host,uid,route+(state?'&'+new URLSearchParams({since:state.version,known:state.known}):''),undefined,200,signal);
        async function phase(stage,fn){
          const offsets=hosts.map(h=>[h.rows.length,h.writes]);const t=performance.now();
          const extra=await fn();const ms=Math.round(performance.now()-t);await wait(80);
          const rows=hosts.flatMap((h,i)=>h.rows.slice(offsets[i][0]));
          const metrics=await Promise.all(hosts.map(resources));
          console.log('TOPOLOGY',JSON.stringify({stage,label,kind,n:size,tabs:2,instances:hosts.length,ms,...extra,...totals(rows),
            writes:hosts.reduce((n,h,i)=>n+h.writes-offsets[i][1],0),active:metrics.map(m=>m.listeners),rssMiB:metrics.map(m=>Math.round(m.rss/1048576))}));
        }
        try{
          await phase('open',async()=>{states.push(...await Promise.all(tabs.map(h=>poll(h))));assert.ok(states.every(s=>s.contacts.length===visible));});
          await phase('idle24',async()=>{const idle=await Promise.all(tabs.map((h,i)=>poll(h,states[i])));assert.ok(idle.every(s=>s.unchanged));});
          if(process.env.BYL_TOPO_IDLE_ONLY==='1' || process.env.BYL_TOPO_ALL==='1'){
            await phase('idle62',async()=>{
              const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),62000);
              try{
                await Promise.all(tabs.map(async(h,i)=>{
                  while(!ctrl.signal.aborted){
                    try{states[i]=await poll(h,states[i],actor,base,ctrl.signal);assert.equal(states[i].unchanged,true);}
                    catch(e){if(!ctrl.signal.aborted)throw e;}
                  }
                }));
              }finally{clearTimeout(timer);}
            });
            if(process.env.BYL_TOPO_IDLE_ONLY==='1') continue;
          }
          await phase('message',async()=>{
            let start;const received=[];
            const pending=tabs.map((h,i)=>poll(h,states[i]).then(s=>{received[i]=Math.round(performance.now()-start);return s;}));
            await wait(200);start=performance.now();
            if(professional)await call(a,'member0','send',{clientId:'c0',clientUid:'member0',professionalUid:'coach',text:'fanout',
              requestId:require('node:crypto').randomUUID()},201);
            else await post(a,'member0','fanout');
            Object.assign(states,await Promise.all(pending));assert.ok(states.every(s=>s.contacts.some(c=>c.lastMessage==='fanout')));
            return {received};
          });
          if(label==='2B2' || process.env.BYL_VALIDATE_WITHDRAWAL==='1'){
            if(twoInstances){
              const switched=await poll(b,{...states[0],version:'forced-reconnect'});
              assert.ok(switched.unchanged,'same independently authorized scope resumes across hosts');
            }
            const before=states[0];
            await phase('revoke-no-focus',async()=>{
              const waits=tabs.map((h,i)=>poll(h,states[i]));
              await wait(200);await db.doc('clients/c0').update({authUid:'replacement'});
              Object.assign(states,await Promise.all(waits));
              assert.ok(states.every(s=>!s.unchanged && s.contacts.length===visible-1 && !s.contacts.some(c=>idOf(c)==='c0')));
            });
            // A fingerprint of the owner's inbox must not admit the administrator
            // as owner even when the raw listener version is shared.
            const focus=base+(professional ? '&focusConversation=c3__coach' : '&focusClub=sample&focusKind=client&focusTarget=c3');
            const denied=professional ? '["","professional","c3__coach"]' : '["sample","client","c3"]';
            const scoped=await Promise.all(tabs.map(h=>poll(h,null,actor,focus)));
            await phase('revoke-focused',async()=>{
              const pending=tabs.map((h,i)=>poll(h,scoped[i],actor,focus));
              await wait(200);
              if(professional)await db.doc('clients/c3').update({authUid:'replacement'});
              else await db.doc('clubs/sample/members/member3').set({status:'removed'});
              const committed=performance.now(),responses=await Promise.all(pending);
              assert.ok(responses.every(s=>s.deniedThread===denied && !s.contacts.some(c=>idOf(c)==='c3')));
              return {afterCommitMs:Math.round(performance.now()-committed)};
            });
            const preview=await poll(a,before,'administrator',professional ? 'inbox?coach=coach' : base);
            if(!professional)assert.equal(preview.preview,true);
            assert.ok(!preview.unchanged);
            const forged=await poll(a,{since:'unused',version:'forged',known:states[0].known.slice(0,-1)+'X'});
            assert.equal(forged.contacts.length,visible-2);
            // The cut must interrupt a wait on the latest authorized data. An
            // earlier version can legitimately return before the socket is closed.
            const last=forged;
            const broken=poll(a,last).then(()=>false,()=>true);
            await wait(100);await stop(a);assert.equal(await broken,true);
            // Give the local emulator time to discard the killed listener streams.
            await wait(1800);
            await db.doc('clients/c1').update(professional ? {coachId:'otherCoach'} : {clubId:'other'});
            const start=performance.now(),resumed=await launch(folder);
            try {
              const result=await poll(resumed,last);
              assert.equal(result.contacts.length,visible-3);
              await wait(50);
              console.log('RESUME',JSON.stringify({kind,n:size,instances:hosts.length,ms:Math.round(performance.now()-start),...totals(resumed.rows)}));
            } finally {await stop(resumed);}
          }
        }finally{await Promise.all(hosts.map(stop));}
      }
    }
  }finally{fs.rmSync(temp,{recursive:true,force:true});await db.terminate();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
