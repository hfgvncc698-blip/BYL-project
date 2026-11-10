import {collection,onSnapshot,or,query,where,getDocs} from 'firebase/firestore';
import {auth,db} from '../firebaseConfig';
import {onAuthStateChanged} from 'firebase/auth';
import {calendarSlices} from './calendarBootstrap';

// Other linked dossiers may have different permissions. Keep their admissions
// independent of the account query. Slices survive calendar navigation.
function openCalendar(user,dossiers,onRows,stale){
  const sessions=collection(db,'sessions');
  const clauses=[where('clientId','==',user.uid),where('userId','==',user.uid)];
  const extra=[];
  for(const id of dossiers){
    if(id===user.uid || id===user.linkedClientId)clauses.push(where('clientDocId','==',id));
    else extra.push(query(sessions,where('clientDocId','==',id)));
  }
  const allowed=new Set();
  const refs=[query(sessions,or(...clauses)),...extra],groups=new Map(),keys=new Set(),stops=new Set();
  let resolve,active=true;
  const ready=new Promise(done=>{resolve=done;});
  function publish(key,docs){
    groups.set(key,docs);
    const rows=new Map();
    for(const group of groups.values())for(const d of group)rows.set(d.id,{...d.data(),id:d.id});
    for(const row of rows.values())if(row.dedupeKey)keys.add(row.dedupeKey);
    if(groups.size===refs.length*3)resolve(keys);
    onRows([...rows.values()],groups.size===refs.length*3);
  }
  refs.forEach((ref,i)=>{
    const slices=calendarSlices(ref),ownStops=[];
    let tails=false,fallback=false;
    function listen(q,next,fail,slot){
      const stop=onSnapshot(q,{includeMetadataChanges:true},snap=>{
        if(!active)return;
        if(snap.metadata.fromCache || snap.metadata.hasPendingWrites){groups.delete(slot);stale();return;}
        next(snap.docs);
      },e=>{if(active)fail(e);});
      stops.add(stop);ownStops.push(stop);
    }
    function attach(j){
      listen(slices[j],docs=>{
        if(fallback)return;
        allowed.add(ref);publish(i*3+j,docs);
        if(!tails){tails=true;attach(1);attach(2);}
      },()=>{
        if(fallback)return;
        fallback=true;
        for(const stop of ownStops){stop();stops.delete(stop);}
        groups.delete(i*3);publish(i*3+1,[]);publish(i*3+2,[]);
        listen(ref,docs=>{allowed.add(ref);publish(i*3,docs);},()=>{allowed.delete(ref);publish(i*3,[]);},i*3);
      },i*3+j);
    }
    attach(0);
  });
  // Documents without a start date are not displayed, but may already carry
  // an old auto-completion key. Check them before creating a missing event.
  async function existing(keysToFind){
    const matches=await Promise.all([...allowed].map(ref=>getDocs(query(ref,where('dedupeKey','in',keysToFind)))));
    return matches.some(s=>!s.empty);
  }
  return {ready,existing,stop(){active=false;for(const stop of stops)stop();resolve(keys);}};
}

const feeds=new Map();
function retire(key,entry){
  clearTimeout(entry.timer);entry.feed.stop();entry.rows=null;
  if(feeds.get(key)===entry)feeds.delete(key);
}
onAuthStateChanged(auth,account=>{
  for(const [key,entry] of feeds)if(entry.account!==account){
    for(const render of entry.observers)render([]);
    retire(key,entry);
  }
});
export function watchClientCalendar(user,dossiers,onRows,scope){
  const key=JSON.stringify([scope,user.uid,user.linkedClientId,[...dossiers].sort()]);
  let entry=feeds.get(key);
  if(entry && entry.account!==auth.currentUser){retire(key,entry);entry=null;}
  if(!entry){
    entry={account:auth.currentUser,observers:new Set(),rows:null};
    entry.feed=openCalendar(user,dossiers,(rows,confirmed)=>{
      entry.rows=confirmed?rows:null;
      for(const render of entry.observers)render(rows);
    },()=>{entry.rows=null;});
    feeds.set(key,entry);
  }
  clearTimeout(entry.timer);entry.observers.add(onRows);
  if(entry.rows)onRows(entry.rows);
  return {ready:entry.feed.ready,existing:entry.feed.existing,stop(){
    entry.observers.delete(onRows);
    if(!entry.observers.size)entry.timer=setTimeout(()=>retire(key,entry),2000);
  }};
}

export function mapClientCalendarRows(rows,hiddenDossierIds,accountUid){
  return rows
  .filter(s => !hiddenDossierIds.has(s.clientDocId||s.clientId) && !s.supersededBy && (!s.visibility || s.visibility === 'client' || s.visibility === 'both'))
  .map(s => {
    const start = s.start?.toDate ? s.start.toDate() : new Date(s.start);
    const end   = s.end?.toDate ? s.end.toDate()   : new Date(s.end);

    const sessionIndex =
      typeof s.sessionIndex === "number"
        ? s.sessionIndex
        : Number.isFinite(Number(s.sessionIndex))
        ? Number(s.sessionIndex)
        : null;

    return {
      id: s.id,
      clientDocId: s.clientDocId || s.clientId,
      title: s.title,
      start,
      end,
      status: s.status,
      difficultyRating: s.difficultyRating ?? s.rating ?? null,
      validated: s.validated === true || Boolean(s.validatedAt) || Boolean(s.completedAt),
      managedByCoach: Boolean(s.coachUid || s.coachId || s.clubId || s.clubAppointmentId || s.coachIds?.length || [s.createdBy, s.ownerUid, s.assignedBy].some(uid => uid && uid !== accountUid)),
      coachUid: s.coachUid || s.coachId,
      coachName: s.coachName,
      clubId:s.clubId,clubAppointmentId:s.clubAppointmentId,excuseDecision:s.excuseDecision, cancellationReason:s.cancellationReason, excuseReviewNote:s.excuseReviewNote, excuseReviewedAt:s.excuseReviewedAt,
      visibility: s.visibility || 'client',
      dedupeKey: s.dedupeKey,
      programmeId: s.programmeId || s.programId || s.programID || null,
      sessionIndex,
    };
  });
}
