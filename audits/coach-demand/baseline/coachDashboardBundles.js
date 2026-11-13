const {encode}=require('./coachPageWire');

// Bound all reads in a detailed request, including histories. The previous
// route admitted one simultaneous read per client (up to 32); do not exceed it.
async function readDashboardBundles(tx, refs) {
  const queue=[],concurrency=Math.max(1,Math.min(32,refs.length));
  let active=0, failed;
  function drain(){
    while(queue.length && (failed || active<concurrency)){
      const job=queue.shift();
      if(failed){job.reject(failed);continue;}
      active++;
      Promise.resolve().then(()=>tx.get(job.ref)).then(job.resolve,error=>{
        failed=error;job.reject(error);
      }).finally(()=>{active--;drain();});
    }
  }
  const read=ref=>new Promise((resolve,reject)=>{queue.push({ref,resolve,reject});drain();});
  return Object.fromEntries(await Promise.all(refs.map(async ref=>{
    const snapshot=await read(ref.collection('programmes'));
    const programs=await Promise.all(snapshot.docs.map(async program=>{
      const history=await read(program.ref.collection('sessionsEffectuees'));
      return {id:program.id,data:encode(program.data()),history:history.docs.map(d=>({id:d.id,data:encode(d.data())}))};
    }));
    return [ref.id,programs];
  })));
}
module.exports={readDashboardBundles};
