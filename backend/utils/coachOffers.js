const {hasActiveProfessionalAccess}=require('./firebaseAuth');
const {calculateCoachCredits}=require('./coachOfferCredits');
const {installments,billingOptions,discountOptions}=require('./clubSubscriptions');
const proDues=c=>c.status==='cancelled'?[]:installments({...c,frequency:c.type==='recurring'?'monthly':'once',scheduleVersion:2,firstPaymentDate:c.firstPaymentDate||c.start,end:c.type==='recurring'?c.end:(c.firstPaymentDate||c.start),amountCents:Math.round(c.price*10**digits[c.currency]),unitScale:10**digits[c.currency]});
const currencies=require('./clubCurrencies.json');
const digits=require('./clubCurrencyDigits.json');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,180}$/.test(id);
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const belongs=(c,uid)=>[c.coachId,c.coachUid,c.createdBy,c.ownerId,...(Array.isArray(c.coachIds)?c.coachIds:[])].includes(uid)&&!c.clubId;
const owns=(c,id,uid)=>[id,c.uid,c.accountUid,c.authUid,c.linkedUserId,c.userId].includes(uid);
function cleanOffer(o){
 if(!validId(o.id)||typeof o.name!=='string'||!o.name.trim()||o.name.length>100||!['pack','single','recurring'].includes(o.type)||!['coaching','nutrition','mixed'].includes(o.service)||!currencies.includes(o.currency||'EUR'))fail('Offre invalide.');
 const currency=o.currency||'EUR',scale=10**digits[currency],price=Number(o.price),units=Math.round(price*scale);
 if(!Number.isFinite(price)||price<0||!Number.isSafeInteger(units)||units>100000000||Math.abs(price*scale-units)>1e-6||!Number.isInteger(o.quantity)||o.quantity<1||o.quantity>999||!Number.isInteger(o.months)||o.months<0||o.months>120)fail('Tarif ou nombre de séances invalide.');
 const description=typeof o.description==='string'?o.description.trim():'';
 if(description.length>1000)fail('Description trop longue.');
 return {id:o.id,name:o.name.trim(),description,type:o.type,service:o.service,price:units/scale,currency,quantity:o.type==='single'?1:o.quantity,months:o.months,prorata:o.prorata===true};
}
function createCoachOffers(db,sendEmail){
 const root=uid=>db.collection('users').doc(uid).collection('professional').doc('offers');
 const sessions=async(uid,get)=>{
  const snaps=await Promise.all(['coachId','createdBy','ownerId'].map(k=>get(db.collection('sessions').where(k,'==',uid))));
  return [...new Map(snaps.flatMap(s=>s.docs).map(d=>[d.id,{...d.data(),id:d.id}])).values()];
 };
 async function scope(uid,token,get){
  const user=(await get(db.collection('users').doc(uid))).data();
  const administrator=user?.role==='admin'&&token?.email_verified===true;
  if(!user||(!administrator&&(user.role!=='coach'||user.clubId))||user.disabledByClub||!hasActiveProfessionalAccess(user,token))fail('Accès professionnel indépendant requis.',403);
 }
 const read=async(uid,get)=>{const snap=await get(root(uid));return snap.data()||{contracts:[],checks:{},version:0};};
 const service={
  async booking(uid,token,input){
   const get=r=>r.get();await scope(uid,token,get);
   if(!validId(input.clientId)||!date(input.date)||!['coaching','nutrition'].includes(input.service))fail('Réservation invalide.');
   const client=(await get(db.collection('clients').doc(input.clientId))).data();
   if(!client||!belongs(client,uid))fail('Accès au client refusé.',403);
   const [state,events]=await Promise.all([read(uid,get),sessions(uid,get)]);
   const relevant=state.contracts.filter(c=>c.clientId===input.clientId&&(!c.service||c.service===input.service||c.service==='mixed'));
   const ledger=calculateCoachCredits(relevant,events.filter(e=>e.id!==input.exclude),uid,Date.parse(input.date+'T12:00:00Z'));
   return {managed:relevant.length>0,contracts:ledger.contracts.map(({id,name,available,reserved,quantity,state,expiresAt})=>({id,name,available,reserved,quantity,state,expiresAt}))};
  },
  async get(uid,token={}){const get=r=>r.get();await scope(uid,token,get);const [state,events]=await Promise.all([read(uid,get),sessions(uid,get)]);return {...state,...calculateCoachCredits(state.contracts,events,uid),loading:false};},
  async change(uid,token,input){
   if(!input||!['catalogue','assign','check','contract','policy'].includes(input.action))fail('Action invalide.');
   let delivery=null;
   await db.runTransaction(async tx=>{
    delivery=null;
    const get=r=>tx.get(r);await scope(uid,token,get);const state=await read(uid,get);
    if(input.version!==state.version)fail('Les offres ont changé. Rechargez la page.',409);
    let next={...state};
    if(input.action==='policy'){
     if(![0,60,120,1440,2880].includes(input.cancellationMinutes))fail('Délai invalide.');
     next.cancellationMinutes=input.cancellationMinutes;
    }
    if(input.action==='catalogue'){
     if(!Array.isArray(input.offers)||input.offers.length>200)fail('Catalogue invalide.');
     const offers=input.offers.map(cleanOffer);
     if(new Set(offers.map(o=>o.id)).size!==offers.length)fail('Offres en double.');
     const removed=[...(state.offers||[]),...state.contracts.map(c=>({id:c.offerId}))].filter(o=>o.id&&!offers.some(n=>n.id===o.id));
     if(removed.length){
      const ledger=calculateCoachCredits(state.contracts,await sessions(uid,get),uid);
      if(ledger.contracts.some(c=>c.status!=='cancelled'&&removed.some(o=>o.id===c.offerId)&&(c.type==='recurring'?c.end>=today():!['expired','exhausted'].includes(c.state))))fail('Une offre est encore attribuée à un client actif.',409);
     }
     next.offers=offers;
    }
    if(input.action==='assign'){
     const raw=input.contract;
     if(!raw||!validId(raw.id)||!validId(raw.clientId))fail('Attribution invalide.');
     if(state.contracts.some(c=>c.id===raw.id))return;
     if(state.contracts.length>=500)fail('Limite de contrats atteinte.');
     let offer=cleanOffer(raw);
     const scale=10**digits[offer.currency],basePrice=offer.price;
     const reduction=discountOptions(raw,{amountCents:Math.round(basePrice*scale)});
     if(reduction.discount)offer={...offer,basePrice,price:reduction.amountCents/scale,discount:reduction.discount};
     const client=(await get(db.collection('clients').doc(raw.clientId))).data();
     if(!client||!belongs(client,uid))fail('Accès au client refusé.',403);
     if(!date(raw.start)||!date(raw.end)||raw.end<raw.start||Date.parse(raw.end)-Date.parse(raw.start)>366*86400000*5)fail('Dates de contrat invalides.');
     if(offer.type==='recurring'&&(!Number.isInteger(raw.paymentDay)||raw.paymentDay<1||raw.paymentDay>31))fail('Jour du règlement invalide.');
     const firstPaymentDate=raw.firstPaymentDate||raw.start;
     const billing=billingOptions({...raw,firstPaymentDate,end:offer.type==='recurring'?raw.end:firstPaymentDate,prorata:offer.type==='recurring'&&offer.prorata},{frequency:offer.type==='recurring'?'monthly':'once'});
     if(!date(firstPaymentDate)||firstPaymentDate<raw.start||Date.parse(firstPaymentDate)-Date.parse(raw.start)>366*86400000*5)fail('Date de premier règlement invalide.');
     const openingUsed=raw.openingUsed??0,openingBalanceAt=raw.openingBalanceAt||(openingUsed?today():null);
     if(!Number.isInteger(openingUsed)||openingUsed<0||openingUsed>offer.quantity||((openingUsed||openingBalanceAt)&&offer.type!=='pack')||(openingBalanceAt&&(!date(openingBalanceAt)||openingBalanceAt<raw.start||openingBalanceAt>today())))fail('Solde de reprise invalide.');
     if(offer.type==='recurring'&&state.contracts.some(c=>c.clientId===raw.clientId&&c.type==='recurring'&&!['cancelled','ended'].includes(c.status)&&c.start<=raw.end&&c.end>=raw.start&&((c.offerId&&c.offerId===raw.offerId)||c.service===offer.service||c.service==='mixed'||offer.service==='mixed')))fail('Un abonnement pour ce même accompagnement couvre déjà cette période. Choisissez une autre date de début.',409);
     let expiresAt=null;
     if(offer.type==='recurring')expiresAt=raw.end;
     else if(offer.months){const d=new Date(raw.start+'T12:00:00Z'),m=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+offer.months,1,12));m.setUTCDate(Math.min(d.getUTCDate(),new Date(Date.UTC(m.getUTCFullYear(),m.getUTCMonth()+1,0)).getUTCDate()));expiresAt=m.toISOString().slice(0,10);}
     const contract={...offer,...billing,openingUsed,openingBalanceAt,offerId:validId(raw.offerId)?raw.offerId:null,clientId:raw.clientId,clientLanguage:client.preferredLang||client.langue||'fr',clientName:[client.prenom||client.firstName,client.nom||client.lastName].filter(Boolean).join(' ')||client.name||'Client',start:raw.start,end:offer.type==='recurring'?raw.end:raw.start,expiresAt,paymentDay:raw.paymentDay||1,createdAt:new Date().toISOString()};
     next.contracts=[...state.contracts,contract];
    }
    if(input.action==='contract'){
     const old=state.contracts.find(c=>c.id===input.id);
     if(!old)fail('Contrat introuvable.',404);
     if(!['update','cancel'].includes(input.operation))fail('Action invalide.');
     const events=await sessions(uid,get),before=calculateCoachCredits(state.contracts,events,uid);
     const current=before.contracts.find(c=>c.id===old.id);
     let changed;
     if(input.operation==='cancel'){
      if(current.history.length||old.openingUsed>0)fail('Ce contrat comporte des séances réalisées ou réservées. Modifiez sa validité ou annulez les rendez-vous futurs avant de le clôturer.',409);
      if(Object.entries(state.checks).some(([id,c])=>id.startsWith(old.id+':')&&c.paidCents>0))fail('Ce contrat comporte un règlement reçu. Conservez son historique et modifiez sa validité.',409);
      changed={...old,status:'cancelled'};
     }else{
      if(old.status==='cancelled')fail('Ce contrat est annulé.',409);
      const quantity=Number(input.quantity),expiresAt=input.expiresAt||null;
      if(quantity<(old.openingUsed||0)||!Number.isInteger(quantity)||quantity<1||quantity>999||(old.type==='single'&&quantity!==1)|| (expiresAt&&(!date(expiresAt)||expiresAt<old.start)) || (old.type==='recurring'&&!expiresAt))fail('Nombre de séances ou date de fin invalide.');
      changed={...old,quantity,expiresAt,...(old.type==='recurring'?{end:expiresAt}:{})};
      if(changed.type==='recurring'&&state.contracts.some(c=>c.id!==old.id&&c.clientId===old.clientId&&c.type==='recurring'&&!['cancelled','ended'].includes(c.status)&&c.start<=changed.end&&c.end>=changed.start&&(c.service===changed.service||c.service==='mixed'||changed.service==='mixed')))fail('Un autre abonnement couvre déjà cette période pour ce même accompagnement.',409);
      const after=calculateCoachCredits(state.contracts.map(c=>c.id===old.id?changed:c),events,uid);
      for(const c of before.contracts){const next=after.contracts.find(n=>n.id===c.id);if(c.history.some(e=>!next.history.some(n=>n.id===e.id)))fail('Cette modification retirerait une séance déjà utilisée ou réservée.',409);}
      if(old.type==='recurring'&&Object.entries(state.checks).some(([id,c])=>id.startsWith(old.id+':')&&id.slice(old.id.length+1)>expiresAt&&c.paidCents>0))fail('La date de fin ne peut pas précéder un règlement déjà reçu.',409);
     }
     const changes=[...(old.changes||[]),{at:new Date().toISOString(),by:uid,operation:input.operation,before:{quantity:old.quantity,expiresAt:old.expiresAt||null,status:old.status||'active'},after:{quantity:changed.quantity,expiresAt:changed.expiresAt||null,status:changed.status||'active'}}];
     next.contracts=state.contracts.map(c=>c.id===old.id?{...changed,changes}:c);
    }
    if(input.action==='check'){
     const [contractId,dueDate]=String(input.id||'').split(':');
     const c=state.contracts.find(c=>c.id===contractId);
     if(!c)fail('Contrat introuvable.',404);
     const due=proDues(c).find(d=>d.dueDate===dueDate);
     const check=input.check;
     if(!due||!check||!['paid','partial','unpaid'].includes(check.status))fail('Règlement invalide.');
     const old=state.checks[input.id]||{},paidCents=check.status==='paid'?due.amountCents:check.status==='partial'?check.paidCents:old.paidCents||0;
     if(!Number.isSafeInteger(paidCents)||paidCents<0||paidCents>due.amountCents||(check.status==='partial'&&(paidCents===0||paidCents===due.amountCents)))fail('Montant invalide.');
     const paidDate=check.status==='unpaid'?old.paidDate||'':check.paidDate;
     if(check.status!=='unpaid'&&(!date(paidDate)||paidDate>today()))fail('Date du règlement invalide.');
     let emailState=old.emailState||'';
     if(check.status==='unpaid'&&check.sendReminder===true&&emailState!=='sent'){
      if(['sending','uncertain'].includes(emailState))fail('Un envoi est en cours ou son résultat est incertain. Vérifiez la réception avant de relancer.',409);
      if(!sendEmail)fail('Envoi de mail indisponible.',503);
      if(typeof check.subject!=='string'||!check.subject.trim()||check.subject.length>200||/[\r\n]/.test(check.subject)||typeof check.body!=='string'||!check.body.trim()||check.body.length>5000)fail('Message invalide.');
      const client=(await get(db.collection('clients').doc(c.clientId))).data();
      if(!client||!belongs(client,uid)||!/^\S+@\S+\.\S+$/.test(client.email||''))fail('Le client doit avoir une adresse e-mail valide.');
      if(client.emailPreferences?.allAutomatic===false||client.settings?.emailNotificationsEnabled===false||client.emailDelivery?.suspended)fail('Les notifications par e-mail sont désactivées pour ce client.');
      emailState='sending';delivery={to:client.email,subject:check.subject.trim(),body:check.body.trim(),id:input.id};
     }else if(check.status==='unpaid'&&!emailState)emailState='skipped';
     if(check.status==='unpaid'&&due.dueDate>today())fail('Cette échéance n’est pas encore due.');
     const verified={status:check.status,paidCents,paidDate,checkedAt:new Date().toISOString(),checkedBy:uid,...(emailState?{emailState}:{}),...(old.emailSentAt?{emailSentAt:old.emailSentAt}:{}),...(delivery?{reminderSubject:delivery.subject,reminderBody:delivery.body}:{})};
     next.checks={...state.checks,[input.id]:verified};
     tx.set(root(uid).collection('paymentHistory').doc(),{...verified,dueId:input.id});
    }
    tx.set(root(uid),{...next,version:state.version+1,updatedAt:Date.now()});
   });
   if(delivery){
    let result;
    try{await sendEmail(delivery);result={emailState:'sent',emailSentAt:new Date().toISOString()};}
    catch(e){result={emailState:e.definitelyNotSent||['ECONNECTION','EDNS','EAUTH'].includes(e.code)||e.responseCode>=500?'failed':'uncertain'};}
    await db.runTransaction(async tx=>{const state=await read(uid,r=>tx.get(r));const check=state.checks[delivery.id];tx.set(root(uid),{...state,checks:{...state.checks,[delivery.id]:{...check,...result}},version:state.version+1});tx.set(root(uid).collection('paymentHistory').doc(),{dueId:delivery.id,...result,at:Date.now(),by:uid});});
    if(result.emailState!=='sent')fail(result.emailState==='failed'?'Paiement marqué non reçu, mais le mail n’a pas été envoyé. Vous pouvez réessayer.':'Résultat de l’envoi incertain. Vérifiez auprès du client avant toute nouvelle relance.',502);
   }
   return service.get(uid,token);
  },
  async mine(uid){
   const [direct,...snapshots]=await Promise.all([db.collection('clients').doc(uid).get(),...['uid','accountUid','authUid','linkedUserId','userId'].map(k=>db.collection('clients').where(k,'==',uid).get())]);
   const records=[...new Map([direct,...snapshots.flatMap(s=>s.docs)].filter(s=>s.exists&&owns(s.data(),s.id,uid)).map(s=>[s.id,s])).values()];
   const groups=[];
   for(const client of records){const c=client.data();if(c.clubId)continue;
    const coaches=[...new Set([c.coachId,c.coachUid,c.createdBy,c.ownerId,...(Array.isArray(c.coachIds)?c.coachIds:[])].filter(validId))];
    for(const coachId of coaches){const state=await read(coachId,r=>r.get());const contracts=state.contracts.filter(c=>c.clientId===client.id);if(!contracts.length)continue;
     const professional=(await db.collection('users').doc(coachId).get()).data()||{};
     const events=await sessions(coachId,r=>r.get());const ledger=calculateCoachCredits(contracts,events,coachId);
     groups.push({coachId,coachName:[professional.firstName||professional.prenom,professional.lastName||professional.nom].filter(Boolean).join(' ')||professional.displayName||'Votre professionnel',clientId:client.id,contracts:ledger.contracts.map(c=>({id:c.id,name:c.name,description:c.description||'',service:c.service,price:c.price,basePrice:c.basePrice??c.price,discount:c.discount||null,currency:c.currency,firstPaymentDate:c.firstPaymentDate||c.start,paymentDay:c.paymentDay,openingUsed:c.openingUsed||0,type:c.type,quantity:c.quantity,remaining:c.remaining,reserved:c.reserved,available:c.available,completedSessions:c.completedSessions,start:c.start,expiresAt:c.expiresAt,state:c.state,payments:proDues(c).map(d=>{const check=state.checks[`${c.id}:${d.dueDate}`]||{};return {id:d.id,date:d.dueDate,amount:d.amountCents,received:check.paidCents||0,status:check.status||'pending',paidDate:check.paidDate||null,validatedAt:check.checkedAt||null};})}))});
    }
   }return {groups};
  }
 };
 return service;
}
module.exports={createCoachOffers,cleanOffer};
