const ms = value => value?.toMillis?.() ?? (typeof value === 'number' ? value : Date.parse(value));
const day = value => new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const cycle = (start, offset, date) => {
 const d=new Date(start+'T12:00:00Z'),m=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+offset,1,12));
 m.setUTCDate(Math.min(date,new Date(Date.UTC(m.getUTCFullYear(),m.getUTCMonth()+1,0)).getUTCDate()));
 return m.toISOString().slice(0,10);
};
function creditPeriod(c,date) {
 if(date<c.start || (c.expiresAt && date>c.expiresAt) || (c.type==='recurring' && date>c.end))return null;
 if(c.type!=='recurring')return {key:c.start,end:c.expiresAt||'9999-12-31'};
 const d=new Date(date+'T12:00:00Z'),s=new Date(c.start+'T12:00:00Z');
 let offset=(d.getUTCFullYear()-s.getUTCFullYear())*12+d.getUTCMonth()-s.getUTCMonth();
 if(cycle(c.start,offset,c.paymentDay||1)>date)offset--;
 const key=cycle(c.start,offset,c.paymentDay||1);
 const next=cycle(c.start,offset+1,c.paymentDay||1);
 return {key:key<c.start?c.start:key,end:day(Date.parse(next+'T12:00:00Z')-86400000)};
}
// Derivation from canonical sessions is idempotent: no increment on a retry,
// no second charge from the calendar mirror, and cancellation releases credit.
function calculateCoachCredits(contracts,sessions,coachId,now=Date.now()) {
 const today=day(now),buckets=new Map(),history=new Map(contracts.map(c=>[c.id,[]])),uncovered=[];
 for(const c of contracts)if(c.type!=='recurring'&&c.openingUsed)buckets.set(`${c.id}:${c.start}`,{total:c.openingUsed,used:c.openingUsed,reserved:0});
 const events=[...new Map(sessions.map(s=>[s.id,s])).values()].filter(s=>
  !s.clubId && s.visibility==='both' && (s.coachId||s.ownerId||s.createdBy)===coachId && Number.isFinite(ms(s.start))
 ).sort((a,b)=>ms(a.start)-ms(b.start)||a.id.localeCompare(b.id));
 const eligible=s=>!['annulée','annulee','cancelled','canceled'].includes(s.status)&&s.excuseDecision!=='accepted';
 const completed=s=>['validée','validee','done','completed','manquée','manquee'].includes(s.status);
 const allocate=(s,used)=>{
  const date=day(ms(s.start)),clientId=s.clientDocId||s.clientId;
  const service=(s.eventType||s.type)==='nutrition_appointment'?'nutrition':'coaching';
  const matches=contracts.filter(c=>s.creditMode!=='outside'&&(!s.coachContractId||c.id===s.coachContractId)&&c.clientId===clientId&&(!c.openingBalanceAt||date>=c.openingBalanceAt)&&(!c.service||c.service===service||c.service==='mixed')&&!['cancelled','ended'].includes(c.status))
   .map(c=>({c,period:creditPeriod(c,date)})).filter(x=>x.period)
   .sort((a,b)=>a.period.end.localeCompare(b.period.end)||(a.c.createdAt||'').localeCompare(b.c.createdAt||'')||a.c.id.localeCompare(b.c.id));
  const target=matches.find(({c,period})=>(buckets.get(`${c.id}:${period.key}`)?.total||0)<c.quantity);
  const event={id:s.id,title:s.title||'Séance',startsAt:ms(s.start),status:s.status,attendance:['manquée','manquee'].includes(s.status)?'absent':'present'};
  if(!target){if(used)uncovered.push({...event,clientId});return;}
  const {c,period}=target,key=`${c.id}:${period.key}`,bucket=buckets.get(key)||{total:0,used:0,reserved:0};
  bucket.total++;bucket[used?'used':'reserved']++;buckets.set(key,bucket);
  history.get(c.id).push({...event,period:period.key,reserved:!used});
 };
 for(const s of events)if(eligible(s)&&completed(s)&&ms(s.start)<=now)allocate(s,true);
 for(const s of events)if(eligible(s)&&(!completed(s)||ms(s.start)>now))allocate(s,false);
 return {contracts:contracts.map(c=>{
  const period=creditPeriod(c,today);
  // A one-off pack keeps its usage history after expiry. Only monthly
  // allowances reset when there is no current billing period.
  const bucketKey=c.type==='recurring'?period?.key:c.start;
  const bucket=bucketKey?buckets.get(`${c.id}:${bucketKey}`):null;
  const entries=history.get(c.id),used=bucket?.used||0,reserved=bucket?.reserved||0;
  const ended=(c.expiresAt&&c.expiresAt<today)||(c.type==='recurring'&&c.end<today);
  return {...c,used,reserved,remaining:ended||c.status==='cancelled'?0:c.quantity-used,available:ended||c.status==='cancelled'?0:Math.max(0,c.quantity-used-reserved),
   completedSessions:entries.filter(e=>!e.reserved&&e.attendance==='present').length,
   history:entries,state:c.status==='cancelled'?'cancelled':ended?'expired':c.start>today?'scheduled':used>=c.quantity?'exhausted':'active',
   creditPeriod:period?.key||null};
 }),uncovered,timeline:events.map(s=>{
  const contract=contracts.find(c=>history.get(c.id).some(e=>e.id===s.id));
  const entry=contract?history.get(contract.id).find(e=>e.id===s.id):null;
  const cancelled=!eligible(s),missed=['manquée','manquee'].includes(s.status),done=completed(s)&&ms(s.start)<=now;
  const previous=contracts.find(c=>c.id===s.coachContractId);
  return {id:s.id,clientId:s.clientDocId||s.clientId,title:s.title||'Séance',startsAt:ms(s.start),status:cancelled?(s.excuseDecision==='accepted'?'excused':'cancelled'):done?(missed?'missed':'completed'):'reserved',contractId:contract?.id||previous?.id||null,contractName:contract?.name||previous?.name||null,creditMode:s.creditMode||'auto',credit:cancelled?(previous?'released':'none'):entry?(entry.reserved?'reserved':'used'):'outside'};
 }).sort((a,b)=>b.startsAt-a.startsAt)};
}
module.exports={calculateCoachCredits,creditPeriod};
