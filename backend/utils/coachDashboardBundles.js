const {encode}=require('./coachPageWire');

// Bound all reads in a detailed request, including histories. The previous
// route allowed up to 32. Outlines retain this ceiling independently of the
// number of visible dossiers, so histories do not queue behind a five-read cap.
// Every completion remains present, in canonical query order. Only detail fields
// unused by dashboard calculations are deferred to ProgramView/SessionPlayer.
// A projection changes bytes, not billed document count; there are no new writes.
const dashboardHistoryFields = [
  'id','status','isPartial','validated','isValidated','pourcentageTermine','completionPct','completionPercent',
  'sessionIndex','seanceIndex','indexSeance','index','session_number','sessionNumber',
  'sessionTitle','title','name','nom','titre',
  'updatedAt','dateEffectuee','completedAt','playedAt','timestamp','date','validatedAt',
  'startedAt','endedAt','endAt','finishedAt','createdAt',
  'calendarEventId','plannedEventId',
  'difficultyRating','rating','difficultyAt','ratingAt','difficulty','difficultyNote','feedback',
  'lastExerciseIndex','lastSet','exerciseTimings',
  'launchedFrom','completionSource','source','origin','launchedByRole','startedByRole',
  'coachVisible','coachSession','coachId',
];
function dashboardProgram(data) {
  // Preserve full prescribed sessions: Radar edits their array in place. Never
  // let a projected exercise replace the canonical exercise during a mutation.
  const {description, ...view}=data;
  return {...view,__dashboardPartial:true};
}
async function readDashboardBundles(tx, refs, {dashboard=false,outline=false}={}) {
  const queue=[],concurrency=outline ? 32 : Math.max(1,Math.min(32,refs.length));
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
    const programsRef=ref.collection('programmes');
    const cache=outline ? require('./dashboardOutlineCache') : null;
    const disk=outline ? require('./dashboardOutlineDisk') : null;
    const saved=outline && !cache.hasCollection(programsRef) ? await disk.read(programsRef) : new Map();
    const metadataOnly=outline && (cache.hasCollection(programsRef) || saved.size>0);
    const persist=[];let changed=false;
    const snapshot=await read(metadataOnly ? programsRef.select() : programsRef);
    const programs=await Promise.all(snapshot.docs.map(async program=>{
      let data;
      if(outline){
        const memory=cache.get(program);
        data=memory || saved.get(disk.version(program));
        if(!data){
          if(saved.size)changed=true;
          const full=metadataOnly ? await read(program.ref) : program;
          const {dashboardPrescriptionSummary}=await import('../../src/utils/dashboardPrescriptionSummary.js');
          data=encode(dashboardPrescriptionSummary(full.data()));
          cache.put(full,data);
          // Persist only materially smaller outlines; no writes for tiny programs.
          if(disk.enabled()){
            const fullBytes=Buffer.byteLength(JSON.stringify(encode(full.data())));
            if(fullBytes>=64*1024 && Buffer.byteLength(JSON.stringify(data))*2<fullBytes){persist.push([disk.version(full),data]);changed=true;}
          }
        }
        else {if(!memory)cache.put(program,data);persist.push([disk.version(program),data]);}
      }else data=encode(dashboard ? dashboardProgram(program.data()) : program.data());
      const historyRef=program.ref.collection('sessionsEffectuees');
      const history=await read(dashboard ? historyRef.select(...dashboardHistoryFields) : historyRef);
      return {id:program.id,data,history:history.docs.map(d=>({id:d.id,data:encode(d.data())}))};
    }));
    // Do not persist a partial collection: otherwise every restart would pay a
    // metadata read plus a full read for each small, ineligible program.
    if(changed && (!metadataOnly || saved.size)){
      if(persist.length===programs.length)await disk.save(programsRef,persist);
      else if(saved.size)await disk.save(programsRef,[]);
    }
    return [ref.id,programs];
  })));
}
module.exports={readDashboardBundles,dashboardHistoryFields,dashboardProgram};
