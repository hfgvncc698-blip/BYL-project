const {createHash,randomUUID}=require('node:crypto');
const {assertProgramSize}=require('./programDocumentSize.cjs');
const hash=value=>createHash('sha256').update(String(value)).digest('hex').slice(0,32);
const ROTATION=[['hypertrophy',4],['recovery',1],['strength',3],['recovery',1]];
const GOALS={general:'endurance',endurance:'endurance',hypertrophy:'prise_de_masse',strength:'force',recovery:'endurance'};
const NAMES={general:'Préparation générale',endurance:'Endurance musculaire',hypertrophy:'Hypertrophie',strength:'Force',recovery:'Récupération'};
const TITLES={
  fr:[...Object.values(NAMES),'Séance'],
  en:['General preparation','Muscular endurance','Hypertrophy','Strength','Recovery','Session'],
  es:['Preparación general','Resistencia muscular','Hipertrofia','Fuerza','Recuperación','Sesión'],
  it:['Preparazione generale','Resistenza muscolare','Ipertrofia','Forza','Recupero','Sessione'],
  de:['Allgemeine Vorbereitung','Kraftausdauer','Hypertrophie','Kraft','Erholung','Einheit'],
  ru:['Общая подготовка','Мышечная выносливость','Гипертрофия','Сила','Восстановление','Тренировка'],
  ar:['الإعداد العام','التحمل العضلي','تضخم العضلات','القوة','التعافي','جلسة'],
};
function orientation(value='') {
  const key=String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if (/force|strength/.test(key)) return 'strength';
  if (/endurance/.test(key)) return 'endurance';
  if (/masse|muscl|hypertroph/.test(key)) return 'hypertrophy';
  if (/perte|weight|preparation|general/.test(key)) return 'general';
  return 'endurance';
}
function newCycles(firstType,seed,startIndex=0,weeks=26) {
  const start=ROTATION.findIndex(([type])=>type===firstType);
  const sequence=start<0?ROTATION:[...ROTATION.slice(start),...ROTATION.slice(0,start)];
  const cycles=[]; let total=0;
  while(total<weeks) {
    const [type,duration]=start<0 && !cycles.length ? [firstType,4] : sequence[(cycles.length-(start<0?1:0))%sequence.length];
    const count=duration;
    cycles.push({id:`auto_${hash(`${seed}:${startIndex+cycles.length}`)}`,type,weeks:count,programId:'',notes:''});
    total+=count;
  }
  return cycles;
}
function millis(value){return value?.toMillis?.()??(value?.seconds?value.seconds*1000:value instanceof Date?value.getTime():Date.parse(value));}
function entitled(client,now=Date.now()) {
  return client.abonnementActif===true && !!client.stripeSubscriptionId && millis(client.subscriptionAccessUntil)>now;
}
function automatic(client) {
  return client.subscriptionCycle?.enabled===true && client.sportFollowView!=='programs';
}
// Generated data never become an assigned document until the plan revision and entitlement are rechecked.
function createSubscriptionCycles({db,FieldValue,generateProgram,now=Date.now}) {
  async function enroll({clientRef,options,uid}) {
    await db.runTransaction(async tx=>{
      const jobRef=db.collection('subscription_cycle_jobs').doc(clientRef.id);
      const [snap,jobSnap]=await Promise.all([tx.get(clientRef),tx.get(jobRef)]);const client=snap.data()||{};
      if (!entitled(client,now())) throw new Error('subscription-not-active');
      if ((client.trainingPlan?.cycles?.length || client.trainingPlan?.revision>0) && !client.subscriptionCycle?.enabled) return; // Coach-owned plan, including an intentionally empty one.
      if (client.sportFollowView==='programs') return; // Explicit coach preference wins.
      const hasPlan=client.trainingPlan?.cycles?.length || client.trainingPlan?.revision>0;
      const plan=hasPlan?client.trainingPlan:{start:new Date(now()).toISOString().slice(0,10),revision:1,cycles:newCycles(orientation(options.objectifUI||options.objectif),clientRef.id)};
      if(!hasPlan && client.currentProgramme) {
        const id=typeof client.currentProgramme==='string'?client.currentProgramme:client.currentProgramme.id;
        const previous=id?(await tx.get(clientRef.collection('programmes').doc(id))).data():null;
        if(previous && previous.origine!=='auto')return; // Existing coach assignment stays coach-managed.
        if(previous && previous.status!=='draft' && !previous.excludeFromCyclePlanning) {
          const type=GOALS[previous.cycleType]?previous.cycleType:orientation(previous.objectif||previous.nomProgramme);
          plan.cycles=newCycles(type,clientRef.id);
          plan.cycles[0]={...plan.cycles[0],programId:id,weeks:Number(previous.activeWeeks||previous.durationWeeks)||4};
        }
      }
      tx.set(clientRef,{trainingPlan:plan,subscriptionCycle:{enabled:true,uid,options,subscriptionId:client.stripeSubscriptionId},updatedAt:FieldValue.serverTimestamp()},{merge:true});
      if(!(jobSnap.data()?.leaseUntil>now())) tx.set(jobRef,{status:'pending',leaseUntil:0,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    });
    await process(clientRef.id);
    const current=(await clientRef.get()).data()||{};
    const id=current.trainingPlan?.cycles?.length ? current.trainingPlan.cycles.find(c=>!c.closedAt)?.programId||null : current.currentProgramme||null;
    const next=current.trainingPlan?.cycles?.find(c=>!c.closedAt);
    if(automatic(current)&&!id&&next&&GOALS[next.type]&&!next.draftProgramId)throw new Error('subscription-cycle-pending');
    return {clientId:clientRef.id,programAssignmentId:id,viewerUrl:id?`/clients/${clientRef.id}/programmes/${id}`:'/mes-programmes'};
  }
  async function process(clientId) {
    const clientRef=db.collection('clients').doc(clientId),jobRef=db.collection('subscription_cycle_jobs').doc(clientId);
    const token=randomUUID();
    const claim=await db.runTransaction(async tx=>{
      const [cs,js]=await Promise.all([tx.get(clientRef),tx.get(jobRef)]);
      const client=cs.data()||{},job=js.data()||{};
      if(!automatic(client)||!entitled(client,now())) {if(js.exists)tx.set(jobRef,{status:'paused',leaseUntil:0},{merge:true});return null;}
      if(job.leaseUntil>now())return null;
      let plan=client.trainingPlan;
      if(!plan?.cycles?.length){tx.set(jobRef,{status:'idle',leaseUntil:0},{merge:true});return null;}
      if(plan.cycles.every(c=>c.closedAt)) {
        // Repeat the actual timeline, including coach edits, not a separate billing rotation.
        const pattern=plan.cycles.filter(c=>!c.autoRepeat && c.type!=='general');
        if(!pattern.length)return null;
        const repeated=pattern.map((c,i)=>({id:`auto_${hash(`${clientId}:${plan.cycles.length+i}`)}`,type:c.type,weeks:c.weeks,programId:'',notes:c.notes||'',...(c.name?{name:c.name}:{}),autoRepeat:true}));
        plan={...plan,cycles:[...plan.cycles,...repeated]};
      }
      const index=plan.cycles.findIndex(c=>!c.closedAt),cycle=plan.cycles[index];
      if(cycle.programId||cycle.draftProgramId||!GOALS[cycle.type]) {tx.set(jobRef,{status:'idle',leaseUntil:0},{merge:true});return null;}
      if(!Number.isInteger(cycle.weeks)||cycle.weeks<1||cycle.weeks>52)throw new Error('invalid-cycle-duration');
      tx.set(jobRef,{status:'pending',leaseToken:token,leaseUntil:now()+120000,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      return {client,plan,cycle,index,revision:client.trainingPlan.revision||0};
    });
    if(!claim)return;
    try {
      const {client,cycle,index,plan,revision}=claim;
      const previous=plan.cycles.slice(0,index).reverse().find(c=>c.programId && (cycle.type==='recovery'||c.type!=='recovery'));
      let history=[],source=null;
      if(previous) {
        const sourceRef=clientRef.collection('programmes').doc(previous.programId);
        source=(await sourceRef.get()).data();
        history=(await sourceRef.collection('sessionsEffectuees').get()).docs.map(d=>({id:d.id,...d.data()}));
      }
      const options=client.subscriptionCycle.options;
      const generated=cycle.type==='recovery'&&source?source:await generateProgram({...options,clientId,objectif:GOALS[cycle.type],objectifUI:GOALS[cycle.type],objectifParamsKey:GOALS[cycle.type],generationSeed:cycle.id,prepareOnly:true});
      const sessions=adaptSessions(generated.sessions||generated.seances,cycle.type,history);
      const locale=String(client.language||client.preferredLanguage||client.langue||client.lang||'fr').split('-')[0];
      const titles=TITLES[locale]||TITLES.fr;
      sessions.forEach((session,i)=>{if(!session.sessionName || /^Séance \d+$/.test(session.sessionName))session.sessionName=`${titles[5]} ${i+1}`;});
      const programId=`cycle_${hash(`${clientId}:${cycle.id}`)}`,programRef=clientRef.collection('programmes').doc(programId);
      await db.runTransaction(async tx=>{
        const [cs,js,ps]=await Promise.all([tx.get(clientRef),tx.get(jobRef),tx.get(programRef)]);
        const fresh=cs.data()||{};
        if(js.data()?.leaseToken!==token)throw new Error('cycle-lease-lost');
        if(!automatic(fresh)||!entitled(fresh,now()))throw new Error('subscription-not-active');
        if((fresh.trainingPlan?.revision||0)!==revision || JSON.stringify(fresh.trainingPlan?.cycles)!==JSON.stringify(client.trainingPlan.cycles))throw new Error('cycle-plan-changed');
        if(ps.exists && ps.data().subscriptionCycleId!==cycle.id)throw new Error('cycle-id-conflict');
        if(!ps.exists){
          const program={sessions,nomProgramme:cycle.name||cycle.nom||titles[Object.keys(NAMES).indexOf(cycle.type)],cycleType:cycle.type,activeWeeks:cycle.weeks,durationWeeks:cycle.weeks,nbSeances:sessions.length,totalSessions:sessions.length,clientId,origine:'auto',createdBy:'subscription-cycle',subscriptionCycleId:cycle.id,objectif:GOALS[cycle.type],niveauSportif:generated.niveauSportif||options.niveau,sexe:options.sexe,trainingLocation:options.trainingLocation||'gym',equipmentAccess:options.equipmentAccess||'full',injuryProfile:options.injuryProfile||'none',sourceProgramId:previous?.programId||null,status:'active',assignedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp()};
          assertProgramSize(program,programRef.path);
          tx.create(programRef,program);
        }
        tx.set(clientRef,{currentProgramme:programId,trainingPlan:{...plan,revision:revision+1,updatedAt:new Date(now()).toISOString(),cycles:plan.cycles.map(c=>c.id===cycle.id?{...c,programId}:c)},updatedAt:FieldValue.serverTimestamp()},{merge:true});
        tx.set(jobRef,{status:'idle',leaseUntil:0,error:null,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      });
    } catch(error) {
      await db.runTransaction(async tx=>{
        const job=(await tx.get(jobRef)).data()||{};
        if(job.leaseToken===token)tx.set(jobRef,{status:'pending',leaseUntil:now()+30000,error:String(error.message).slice(0,120),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      });
      throw error;
    }
  }
  return {enroll,process};
}
// Preserve warm-ups, cooldowns and timed/advanced exercises. Do not transfer loads to different movements.
function adaptSessions(input,type,history=[]) {
  if(!Array.isArray(input)||!input.length)throw new Error('empty-cycle-program');
  const sessions=structuredClone(input);
  const presets={general:[2,15,90],endurance:[3,20,60],hypertrophy:[3,10,90],strength:[3,6,180]};
  const records=history.filter(r=>!r.isPartial && !['partial','in_progress','en_cours'].includes(r.status) && (r.validated===true||r.isValidated===true||['validée','validee','completed','done','terminée','terminee'].includes(r.status)||r.completedAt||r.validatedAt||r.dateEffectuee)).sort((a,b)=>millis(b.completedAt||b.validatedAt||b.dateEffectuee)-millis(a.completedAt||a.validatedAt||a.dateEffectuee));
  for(const session of sessions)for(const key of ['corps','bonus','exercises'])if(Array.isArray(session[key]))for(const ex of session[key]) {
    const reps=Number(ex['Répétitions']??ex.repetitions??ex.reps);
    if(!reps||ex.useAdvancedSets||ex.seriesDiff||ex.seriesDifferentes||Number(ex['Durée (min:sec)']||ex.temps_effort)>0)continue;
    const compound=ex.isCompound===true||/squat|deadlift|bench press|développé couché|rowing|traction|leg press/i.test(ex.nom||ex.name||'');
    const preset=type==='recovery'?[Math.max(1,Math.ceil(Number(ex['Séries']??ex.series??3)/2)),reps,90]:presets[type==='strength'&&!compound?'hypertrophy':type];
    if(!preset)continue;
    const [sets,target,rest]=preset;
    ex['Séries']=ex.series=sets;ex['Répétitions']=ex.repetitions=target;ex['Repos (min:sec)']=ex.repos=rest;
    const id=ex.exerciseId||ex.id; const name=String(ex.nom||ex.name||'').trim().toLowerCase();
    const snapshot=records.flatMap(r=>r.exerciseSnapshots||[]).find(e=>(id&&(e.exerciseId||e.id)===id)||(!id&&name&&String(e.exerciseName||e.name||e.nom||'').trim().toLowerCase()===name));
    const set=snapshot?.sets?.find(s=>Number(s.chargeKg)>0&&Number(s.reps)>0);
    const base=Number(set?.chargeKg)||0;
    const load=Math.floor(base*(type==='recovery'?0.6:Math.min(1,(1+Number(set?.reps||reps)/30)/(1+target/30)))*2)/2;
    ex['Charge (kg)']=0;ex.charge=0;
    ex.cyclePrescription={type,suggestedKg:load,source:set?'history':'none',reviewRequired:true};
    if(Array.isArray(ex.sets))ex.sets=Array.from({length:sets},()=>({reps:target,chargeKg:0,restSec:rest}));
    delete ex.seriesDetails;delete ex._historyLoadAuto;
  }
  return sessions;
}
module.exports={createSubscriptionCycles,newCycles,orientation,entitled,automatic,adaptSessions};
