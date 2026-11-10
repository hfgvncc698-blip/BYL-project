// An owner-authorized request leases a projection. A second tab may reuse the
// database listeners, but still has to pass its own admission and delivery checks.
const {createHash} = require('node:crypto');
const {Timestamp} = require('../firebaseAdmin').firestore;
const {clubAppointmentStatus} = require('./clubAppointmentStatus');

const periods = new Map();
const sources = new Map();
const graceMs = 4000;
const waitMs = 24000;
const digest=serialized=>createHash('sha256').update(serialized).digest('base64url');
const eventFields = ['title','note','coachUid','coachName','clientId','clientName','linkedSessionId',
  'type','registrationMode','capacity','participantIds','waitlistIds','eventType','appointmentKind',
  'excuseDecision','cancellationReason','excuseReviewNote','excuseReviewedAt','programId',
  'programTitle','sessionIndex','sessionTitle'];

function millis(value) {
  if(value == null) return NaN;
  if(typeof value.toMillis === 'function') return value.toMillis();
  if(typeof value === 'string' && /^-?\d{13}$/.test(value)) return Number(value);
  const seconds = value.seconds ?? value._seconds;
  if(typeof seconds === 'number') return seconds*1000 + (value.nanoseconds ?? value._nanoseconds ?? 0)/1e6;
  return new Date(value).getTime();
}

function bounds(from,to) {
  if(!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from>=to || to-from>50*86400000 ||
    from < -62135596800000+180*60000 || to>253402300799999) {
    throw Object.assign(Error('invalid-calendar-period'),{status:400});
  }
}

function queries(ref,from,to,upcoming=false) {
  // The current write path caps appointments at three hours. Older long and
  // string-duration records are admitted by separate compatibility queries.
  const low = from-180*60000;
  const range = (a,b) => ref.where('startsAt','>=',a).where('startsAt','<',b);
  return [
    range(Timestamp.fromMillis(low),Timestamp.fromMillis(upcoming?253402300799999:to)),
    range(low,upcoming?Number.MAX_SAFE_INTEGER:to),
    ref.where('startsAt','>=','').where('startsAt','<=','\uf8ff'),
    ref.where('durationMin','>',180),
    ref.where('durationMin','>=','').where('durationMin','<=','\uf8ff'),
    ref.orderBy('startsAt').startAt({}),
  ];
}

function inPeriod(data,from,to) {
  const start = millis(data.startsAt);
  return start<to && start+(Number(data.durationMin)||60)*60000>from;
}

function subscribe(key,ref,consume,fail) {
  let source=sources.get(key);
  const observer={consume,fail};
  if(!source) {
    source={observers:new Set()};
    sources.set(key,source);
    source.stop=ref.onSnapshot(snapshot=>{
      if(process.env.BYL_FIRESTORE_METRICS==='1') {
        const initial=!source.snapshot, size=snapshot.size ?? Number(snapshot.exists);
        const changed=initial?size:snapshot.docChanges?.().length??1;
        console.info('[byl-metrics]',JSON.stringify({scope:'listener',activity:'calendar-listener',httpRequests:0,
          sdkReads:Number(initial),documentsReturned:changed,estimatedDocumentReads:initial?Math.max(1,changed):changed,actualBilledReads:null}));
      }
      source.snapshot=snapshot;
      for(const client of source.observers)client.consume(snapshot);
    },error=>{
      if(sources.get(key)===source)sources.delete(key);
      for(const client of source.observers)client.fail(error);
    });
  }
  source.observers.add(observer);
  // The caller installs its unsubscribe before receiving an already-known value.
  if(source.snapshot)queueMicrotask(()=>{if(source.observers.has(observer))consume(source.snapshot);});
  return ()=>{
    source.observers.delete(observer);
    if(!source.observers.size) {
      source.stop();
      if(sources.get(key)===source)sources.delete(key);
    }
  };
}

function eventRow(id,event,linked,clubId) {
  const session=linked && (!linked.clubId || linked.clubId===clubId) &&
    (linked.clubAppointmentId===id || (event.clientId && [linked.clientDocId,linked.clientId].includes(event.clientId))) ? linked:null;
  const completed=session && (session.validatedAt || session.completedAt ||
    ['validée','validee','done','completed','terminée','terminee'].includes(String(session.status||'').toLowerCase()));
  const startsAt=millis(event.startsAt);
  const row={id,startsAt,durationMin:Number(event.durationMin)||60,
    status:completed?'validée':clubAppointmentStatus({...event,startsAt}),
    difficultyRating:session?.difficultyRating??session?.rating??event.difficultyRating??null};
  for(const field of eventFields)if(event[field]!=null)row[field]=event[field];
  row.title ||= 'Rendez-vous';
  row.createdAt=millis(event.createdAt)||0;
  row.registrationMode ||= 'inherit';
  return row;
}

function watchPeriod(db,clubId,from,to,upcoming=false) {
  bounds(from,to);
  const key=JSON.stringify([clubId,from,to,upcoming]);
  let state=periods.get(key);
  if(!state) {
    const refs=queries(db.collection('clubs').doc(clubId).collection('appointments'),from,to,upcoming);
    const snapshots=new Map(),links=new Map(),listeners=new Set();
    let serialized='[]',revision=digest(serialized),ready=false,rows=[],failure,closed=false;
    const notify=()=>{for(const fn of [...listeners])fn();};
    function fail(error){failure=error;if(periods.get(key)===state)periods.delete(key);notify();}
    function rebuild(){
      if(closed || snapshots.size!==refs.length)return;
      const events=new Map();
      for(const snap of snapshots.values())for(const doc of snap.docs) {
        const event=doc.data();
        if(inPeriod(event,from,upcoming?Infinity:to))events.set(doc.id,event);
      }
      const ids=new Set([...events.values()].map(e=>e.linkedSessionId).filter(id=>typeof id==='string' && id && !id.includes('/')));
      for(const [id,entry] of links)if(!ids.has(id)){entry.stop();links.delete(id);}
      for(const id of ids)if(!links.has(id)){
        const entry={};links.set(id,entry);
        entry.stop=subscribe(JSON.stringify([clubId,'linked',id]),db.collection('sessions').doc(id),snap=>{
          if(links.get(id)===entry){entry.snapshot=snap;rebuild();}
        },fail);
      }
      ready=[...links.values()].every(entry=>entry.snapshot);
      if(!ready)return;
      const next=[...events].map(([id,event])=>eventRow(id,event,links.get(event.linkedSessionId)?.snapshot?.data(),clubId))
        .sort((a,b)=>a.startsAt-b.startsAt||a.id.localeCompare(b.id));
      const nextSerialized=JSON.stringify(next);
      if(serialized!==nextSerialized){rows=next;serialized=nextSerialized;revision=digest(serialized);}
      notify();
    }
    const stops=refs.map((ref,i)=>{
      const sourceKey=JSON.stringify(i<2?[clubId,i,from,upcoming?'future':to]:[clubId,i]);
      return subscribe(sourceKey,ref,snap=>{snapshots.set(i,snap);rebuild();},fail);
    });
    state={users:0,close(){closed=true;for(const stop of stops)stop();for(const entry of links.values())entry.stop();},
      wait(known,signal,immediate=false){return new Promise((resolve,reject)=>{
        let timer;
        function finish(error,value){clearTimeout(timer);listeners.delete(check);signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(value);}
        function abort(){finish(Error('aborted'));}
        function check(expired=false){
          if(failure)return finish(failure);
          if(ready && (known!==revision || expired || immediate))return finish(null,{revision,...(known===revision?{unchanged:true}:{appointments:rows})});
          if(expired)finish(Error('calendar-timeout'));
        }
        timer=setTimeout(()=>check(true),waitMs);
        listeners.add(check);signal?.addEventListener('abort',abort);
        if(signal?.aborted)abort();else check();
      });}};
    periods.set(key,state);
  }
  clearTimeout(state.cleanup);state.users++;
  return {wait:state.wait,release(){if(!--state.users)state.cleanup=setTimeout(()=>{
    state.close();if(periods.get(key)===state)periods.delete(key);
  },graceMs);}};
}
module.exports={bounds,queries,inPeriod,watchPeriod,millis};
