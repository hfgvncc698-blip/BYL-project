// Same authenticated routes, historical backend and project guard as Lot 2B.1.
const {seed,launch,stop,users,call,totals,post,wait}=require('./measureMessagingLot2B1.cjs');
const {historicalBackend,db}=require('./measureFirebaseLot1.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
process.env.BYL_MEASURE_RESOURCES='1';
function resources(api){
  return new Promise(resolve=>{
    const handler=m=>{if(m.resources){api.proc.off('message',handler);resolve(m.resources);}};
    api.proc.on('message',handler);api.proc.send({resources:true});
  });
}
async function channel(folder,label,n,kind){
  const api=await launch(folder);
  const route=kind==='club'?'club/inbox?clubId=sample':'inbox?', uid=kind==='club'?'owner':'coach';
  const cold=await resources(api);
  let state;
  const poll=(signal)=>call(api,uid,route+(state?'&'+new URLSearchParams({since:state.version,known:state.known}):''),undefined,200,signal);
  async function phase(stage,fn){
    const start=api.rows.length,writes=api.writes,t=performance.now();
    const extra=await fn();const ms=Math.round(performance.now()-t);await wait(50);
    const usage=await resources(api);
    console.log('MEASURE',JSON.stringify({label,n,kind,stage,ms,...extra,...totals(api.rows.slice(start)),
      writes:api.writes-writes,active:usage.listeners,heapMiB:Math.round((usage.heapUsed-cold.heapUsed)/1048576),
      rssMiB:Math.round((usage.rss-cold.rss)/1048576)}));
  }
  try{
    await phase('open',async()=>{state=await poll();assert.equal(state.contacts.length,n-Math.floor(n/(kind==='club'?10:5)));});
    await phase('idle24',async()=>{state=await poll();assert.equal(state.unchanged,true);});
    await phase('steady24',async()=>{state=await poll();assert.equal(state.unchanged,true);});
    await phase('message',async()=>{
      let sentAt,receiveMs;
      const received=poll().then(data=>{receiveMs=Math.round(performance.now()-sentAt);return data;});
      await wait(150);sentAt=performance.now();
      if(kind==='club')await post(api,'member0','volume');
      else await call(api,'member0','send',{clientId:'c0',clientUid:'member0',professionalUid:'coach',text:'volume',requestId:require('node:crypto').randomUUID()},201);
      state=await received;assert.ok(state.contacts.some(c=>c.lastMessage==='volume'&&c.unread));
      return {receiveMs};
    });
    if(process.env.BYL_SHORT!=='1')await phase('idle62',async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),62000);
      try{while(!controller.signal.aborted){state=await poll(controller.signal);assert.equal(state.unchanged,true);}}
      catch(error){if(!controller.signal.aborted)throw error;}
      finally{clearTimeout(timer);}
    });
  }finally{await stop(api);}
}
(async()=>{
  await users();const temp=fs.mkdtempSync(path.join(os.tmpdir(),'byl2b2-'));
  try{
    const historical=historicalBackend('3955d59',temp),local=path.resolve(__dirname,'../backend');
    for(const n of [12,100,500,1000]){
      if(process.env.BYL_SIZES && !process.env.BYL_SIZES.split(',').includes(String(n)))continue;
      for(const [label,folder] of [['2B1',historical],['2B2',local]]){
        if(process.env.BYL_LABEL && label!==process.env.BYL_LABEL)continue;
        await seed(n);
        await Promise.all(['club','professional'].map(kind=>channel(folder,label,n,kind)));
      }
    }
  }finally{fs.rmSync(temp,{recursive:true,force:true});await db.terminate();}
})().catch(e=>{console.error(e);process.exitCode=1;});
