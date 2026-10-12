const currencyDigits = require('./clubCurrencyDigits.json');
const currencies = require('./clubCurrencies.json');
const crypto = require('crypto');
const { createClubClientAdministration } = require('./clubClientAdministration');
const staleEmail = data => data.emailState === 'sending' && Date.now() - (data.checkedAt || 0) >= 30 * 60000;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
function cycleDate(start, offset, day) {
 const d=new Date(start+'T12:00:00Z'),month=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+offset,1,12));
 month.setUTCDate(Math.min(day,new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate()));
 return month.toISOString().slice(0,10);
}
function billingOptions(input,plan){
 if(input.firstPaymentDate===undefined)return {};
 if(!validDate(input.firstPaymentDate)||input.firstPaymentDate<input.start||input.firstPaymentDate>input.end||typeof input.prorata!=='boolean')fail('Dates de règlement invalides.');
 if(plan.frequency!=='monthly') {
  if(input.prorata)fail('Dates de règlement invalides.');
  return {scheduleVersion:2,firstPaymentDate:input.firstPaymentDate,prorata:false};
 }
 if(!Number.isInteger(input.paymentDay)||input.paymentDay<1||input.paymentDay>31)fail('Dates de règlement invalides.');
 const same=cycleDate(input.start,0,input.paymentDay),next=cycleDate(input.start,same>input.start?0:1,input.paymentDay);
 if(input.firstPaymentDate>=next)fail('Le premier règlement doit précéder la prochaine échéance mensuelle.');
 return {scheduleVersion:2,firstPaymentDate:input.firstPaymentDate,paymentDay:input.paymentDay,prorata:input.prorata};
}
function discountOptions(input,plan){
 const discount=input.discount;
 if(discount===undefined||discount===null)return {};
 if(!discount||!['percent','fixed'].includes(discount.type)||!Number.isSafeInteger(discount.value)||discount.value<=0)fail('Réduction invalide.');
 // Percentage values use basis points; fixed values use the plan's stored currency scale.
 const reduction=discount.type==='percent'?Math.round(plan.amountCents*discount.value/10000):discount.value;
 if((discount.type==='percent'&&discount.value>=10000)||reduction>=plan.amountCents||reduction<=0)fail('La réduction doit être inférieure au tarif de l’abonnement.');
 return {baseAmountCents:plan.amountCents,amountCents:plan.amountCents-reduction,discount:{type:discount.type,value:discount.value}};
}
function installments(contract) {
 if(contract.importedOpening)return [];
 if(contract.scheduleVersion===2 && contract.frequency==='monthly'){
  const same=cycleDate(contract.start,0,contract.paymentDay),offset=same>contract.start?0:1;
  const next=cycleDate(contract.start,offset,contract.paymentDay),previous=cycleDate(contract.start,offset-1,contract.paymentDay);
  const days=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000);
  const endExclusive=new Date(Date.parse(contract.end)+86400000).toISOString().slice(0,10);
  const numerator=days(contract.start,endExclusive<next?endExclusive:next),denominator=days(previous,next);
  const firstAmount=contract.prorata?Math.round(contract.amountCents*numerator/denominator):contract.amountCents;
  const row=(date,amount,extra={})=>({id:`${contract.id}_${date}`,contractId:contract.id,dueDate:date,amountCents:amount,currency:contract.currency||'EUR',unitScale:contract.unitScale??100,label:contract.name,...extra});
  const rows=[row(contract.firstPaymentDate,firstAmount,{prorata:contract.prorata,periodDays:numerator,cycleDays:denominator})];
  for(let i=offset;i<120;i++){const date=cycleDate(contract.start,i,contract.paymentDay);if(date>contract.end)break;rows.push(row(date,contract.amountCents));}
  return rows;
 }
 if(contract.scheduleVersion===2)return installments({...contract,scheduleVersion:1,start:contract.firstPaymentDate});

  const rows = [], start = new Date(`${contract.start}T12:00:00Z`), step = contract.frequency === 'yearly' ? 12 : contract.frequency === 'monthly' ? 1 : 0;
  for (let i=0;i<120;i++) {
    const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth()+step*i, 1,12));
    const last = new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();
    month.setUTCDate(Math.min(start.getUTCDate(),last));
    const dueDate=month.toISOString().slice(0,10);
    if (dueDate > contract.end) break;
    rows.push({ id:`${contract.id}_${dueDate}`, contractId:contract.id, dueDate, amountCents:contract.amountCents,currency:contract.currency || 'EUR',unitScale:contract.unitScale ?? 100,label:contract.name });
    if (!step) break;
  }
  return rows;
}
function createClubSubscriptions(db, sendEmail) {
  const administration = createClubClientAdministration(db);
  async function owner(uid) {
    const u=(await db.collection('users').doc(uid).get()).data();
    if (!u?.clubId || u.role !== 'coach' || !(u.accountType==='club_owner' || u.clubRole==='owner')) fail('Réservé au responsable du club.',403);
    return db.collection('clubs').doc(u.clubId);
  }
  async function dossier(uid,clientId) { if(typeof clientId !== 'string' || !/^[^/]{1,160}$/.test(clientId)) fail('Client invalide.'); const club=await owner(uid); return administration.scope(uid,clientId,club.id); }
  async function read(s) {
    const [contracts,checks]=await Promise.all([s.ref.collection('subscriptions').get(),s.ref.collection('paymentChecks').get()]);
    const statuses=new Map(checks.docs.map(d=>[d.id,{...d.data(),...(staleEmail(d.data()) ? {emailState:'failed'} : {})}]));
    return { contracts:contracts.docs.map(d=>({id:d.id,...d.data()})), dues:contracts.docs.flatMap(d=>installments({id:d.id,...d.data()})).map(row=>({...row,...statuses.get(row.id), id:row.id})).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)) };
  }
  return {
    async mine(uid) {
      const [direct,...matches]=await Promise.all([db.collection('clients').doc(uid).get(),...['authUid','accountUid','linkedUserId','userId','uid'].map(key=>db.collection('clients').where(key,'==',uid).get())]);
      const records=[...new Map([direct,...matches.flatMap(s=>s.docs)].filter(s=>s.exists).map(s=>[s.id,s])).values()];
      const groups=[];
      for(const record of records){
        const client=record.data();
        for(const clubId of [...new Set([client.clubId,...(Array.isArray(client.clubIds)?client.clubIds:[]),client.club?.id].filter(id=>typeof id==='string'&&id&&!id.includes('/')))]){
          const clubRef=db.collection('clubs').doc(clubId),club=await clubRef.get();if(!club.exists)continue;
          const ref=clubRef.collection('privateClients').doc(record.id),[billing,privateDoc]=await Promise.all([read({ref}),ref.get()]);
          // Explicit public projection: no confidential notes, internal references or staff identifiers.
          const contracts=billing.contracts.map(c=>({id:c.id,name:c.name,start:c.start,end:c.end,importedOpening:!!c.importedOpening,...(!c.importedOpening?{amountCents:c.amountCents,currency:c.currency||'EUR',unitScale:c.unitScale??100,frequency:c.frequency}:{} )}));
          const payments=billing.dues.filter(d=>['paid','partial'].includes(d.status)&&d.paidCents>0).map(d=>({id:d.id,contractId:d.contractId,label:d.label,amountCents:d.paidCents,dueCents:d.amountCents,currency:d.currency,unitScale:d.unitScale,paidDate:d.paidDate||'',validatedAt:d.checkedAt||null,status:d.status}));
          for(const p of privateDoc.data()?.payments||[]){if(p.paidCents>0)payments.push({id:`manual_${p.id}`,label:p.label,amountCents:p.paidCents,dueCents:p.dueCents,currency:p.currency||'EUR',unitScale:p.unitScale??100,paidDate:p.paidDate||'',status:p.paidCents>=p.dueCents?'paid':'partial'});}
          if(contracts.length||payments.length)groups.push({clubId,clientId:record.id,clubName:club.data().name||club.data().nom||'Club',contracts,payments:payments.sort((a,b)=>b.paidDate.localeCompare(a.paidDate))});
        }
      }
      return {groups};
    },
    async catalog(uid) { const club=await owner(uid); const snap=await club.collection('subscriptionPlans').get(); return snap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>!p.deleted); },
    async addPlan(uid,input) {
      const club=await owner(uid);
      const name=String(input.name||'').trim();
      const currency=input.currency === undefined ? 'EUR' : input.currency;
      if(!currencies.includes(currency)) fail('Devise invalide.');
      const unitScale=input.unitScale ?? 100;
      if(input.unitScale!==undefined && unitScale!==10 ** currencyDigits[currency]) fail('Devise invalide.');
      if (!name || name.length>100 || !Number.isSafeInteger(input.amountCents) || input.amountCents<=0 || input.amountCents>100000000 || !['monthly','yearly','once'].includes(input.frequency)) fail('Nom, montant et périodicité valides requis.');
      const ref=club.collection('subscriptionPlans').doc(crypto.randomUUID());
      await ref.set({name,currency,unitScale,amountCents:input.amountCents,frequency:input.frequency,createdAt:Date.now(),createdBy:uid});
      return {id:ref.id};
    },
    async updatePlan(uid,id,input) {
      const club=await owner(uid);
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id||'')) fail('Abonnement invalide.');
      const ref=club.collection('subscriptionPlans').doc(id);
      await db.runTransaction(async tx=>{
        const snapshot=await tx.get(ref);
        if(!snapshot.exists||snapshot.data().deleted) fail('Abonnement introuvable.',404);
        const previous=snapshot.data();
        if((input.version||0)!==(previous.version||0)) fail('Cette échéance a changé. Rechargez la liste.',409);
        let patch;
        if(typeof input.archived==='boolean') patch={archived:input.archived};
        else {
          const name=String(input.name||'').trim(), currency=input.currency;
          if(!currencies.includes(currency)) fail('Devise invalide.');
      const unitScale=input.unitScale ?? 100;
      if(input.unitScale!==undefined && unitScale!==10 ** currencyDigits[currency]) fail('Devise invalide.');
          if(!name || name.length>100 || !Number.isSafeInteger(input.amountCents) || input.amountCents<=0 || input.amountCents>100000000 || !['monthly','yearly','once'].includes(input.frequency)) fail('Nom, montant et périodicité valides requis.');
          patch={name,currency,unitScale,amountCents:input.amountCents,frequency:input.frequency};
        }
        tx.set(ref,{...patch,version:(previous.version||0)+1,updatedAt:Date.now(),updatedBy:uid},{merge:true});
      });
      return {ok:true};
    },
    async deletePlan(uid,id,input={}) {
      const club=await owner(uid);
      if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id||'')) fail('Abonnement invalide.');
      const ref=club.collection('subscriptionPlans').doc(id);
      await db.runTransaction(async tx=>{
        const snapshot=await tx.get(ref);
        if(!snapshot.exists||snapshot.data().deleted) fail('Abonnement introuvable.',404);
        const previous=snapshot.data();
        if((input.version||0)!==(previous.version||0)) fail('Cette échéance a changé. Rechargez la liste.',409);
        // Keep the catalog record for history; assigned contracts retain their own snapshot.
        tx.set(ref,{deleted:true,archived:true,deletedAt:Date.now(),deletedBy:uid,version:(previous.version||0)+1},{merge:true});
      });
      return {ok:true};
    },
    async get(uid,clientId) { return read(await dossier(uid,clientId)); },
    async preview(uid,clientId,input){
      await dossier(uid,clientId);
      if(!validDate(input.start)||!validDate(input.end)||input.end<input.start||Date.parse(input.end)-Date.parse(input.start)>366*86400000*5)fail('Indiquez une période valide de cinq ans maximum.');
      if(!/^[a-zA-Z0-9_-]{1,80}$/.test(input.planId||''))fail('Abonnement invalide.');
      const club=await owner(uid),snapshot=await club.collection('subscriptionPlans').doc(input.planId).get();
      if(!snapshot.exists||snapshot.data().deleted||snapshot.data().archived)fail('Abonnement introuvable.',404);
      const plan=snapshot.data(),options=billingOptions(input,plan);
      return {dues:installments({...plan,...options,...discountOptions(input,plan),id:'preview',start:input.start,end:input.end})};
    },
    async assign(uid,clientId,input) {
      const s=await dossier(uid,clientId);
      if (s.former) fail('Réactivez d’abord l’adhésion au club.');
      if (!validDate(input.start)||!validDate(input.end)||input.end<input.start || +new Date(input.end)-new Date(input.start)>366*86400000*5) fail('Indiquez une période valide de cinq ans maximum.');
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(input.planId||'')) fail('Abonnement invalide.');
      const planRef=db.collection('clubs').doc(s.clubId).collection('subscriptionPlans').doc(input.planId);
      const ref=s.ref.collection('subscriptions').doc(`${input.planId}_${input.start}`);
      await db.runTransaction(async tx=>{
        const plan=await tx.get(planRef);
        if (!plan.exists||plan.data().deleted) fail('Abonnement introuvable.',404);
        const existing=await tx.get(s.ref.collection('subscriptions'));
        if (existing.docs.some(d=>d.id===ref.id)) return;
        if(plan.data().archived) fail('Abonnement archivé.');
        if(!currencies.includes(plan.data().currency || 'EUR')) fail('Devise invalide.');
        if (existing.docs.some(d=>d.data().start<=input.end && d.data().end>=input.start)) fail('Un abonnement couvre déjà cette période.');
        tx.set(s.ref,{billingEnabled:true},{merge:true});
        tx.set(ref,{...plan.data(),...billingOptions(input,plan.data()),...discountOptions(input,plan.data()),planId:plan.id,start:input.start,end:input.end,assignedAt:Date.now(),assignedBy:uid});
      });
    },
    async pending(uid) {
      const club=await owner(uid), docs=await club.collection('privateClients').get();
      const result=await Promise.all(docs.docs.map(async doc=>{
        let s; try {s=await administration.scope(uid,doc.id,club.id);}catch(e){if(e.status===403||e.status===404)return [];throw e;}
        const manual=(doc.data().payments||[]).filter(p=>validDate(p.dueDate)&&p.dueDate<=today()&&p.dueCents>p.paidCents).map(p=>({
          id:`manual_${p.id}`,paymentId:p.id,source:'manual',clientId:doc.id,clientName:s.clientName,
          dueDate:p.dueDate,amountCents:p.dueCents-p.paidCents,currency:p.currency||'EUR',unitScale:p.unitScale??100,label:p.label,kind:p.kind||'regular',status:p.paidCents>0?'partial':'pending'
        }));
        if(s.former)return manual;
        const data=await read(s);
        return [...manual,...data.dues.filter(d=>d.dueDate<=today() && (!d.status || d.status==='pending' || d.status==='unpaid' || d.status==='partial')).map(d=>({...d,clientId:doc.id,clientName:s.clientName}))];
      }));
      return result.flat().sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
    },
    async check(uid,clientId,id,input) {
      if(typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,180}$/.test(id))fail('Échéance invalide.');
      if(!['paid','unpaid','partial'].includes(input.status))fail('Décision invalide.');
      const s=await dossier(uid,clientId), data=await read(s), due=data.dues.find(d=>d.id===id);
      if(!due || (input.status==='unpaid'&&due.dueDate>today()))fail('Échéance non exigible.');
      const paidCents=input.status==='paid'?due.amountCents:input.status==='partial'?input.paidCents:(due.paidCents||0);
      const paidDate=input.status==='unpaid'?(due.paidDate||''):(input.paidDate||today());
      if(!Number.isSafeInteger(paidCents)||paidCents<0||paidCents>due.amountCents||(input.status==='partial'&&(!paidCents||paidCents>=due.amountCents)))fail('Montants invalides.');
      if(input.status!=='unpaid'&&(!validDate(paidDate)||paidDate>today()))fail('Dates de règlement invalides.');
      const recipient=s.client.data().email;
      const ref=s.ref.collection('paymentChecks').doc(id);
      if(input.status==='unpaid' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient||''))fail('Le client doit avoir une adresse e-mail valide avant cette action.');
      let send=false, attemptVersion;
      await db.runTransaction(async tx=>{
        send=false;
        const previous=(await tx.get(ref)).data()||{};
        if((input.version || 0)!==(previous.version || 0))fail('Cette échéance a changé. Rechargez la liste.',409);
        if(previous.emailState==='sending' && !staleEmail(previous))fail('Un envoi est déjà en cours. Vérifiez son état avant de réessayer.',409);
        // A repeated decision cannot send the reminder again. A failed delivery can be retried explicitly.
        if(previous.status===input.status && (previous.paidCents??paidCents)===paidCents && (previous.paidDate??paidDate)===paidDate && !(input.status==='unpaid' && (previous.emailState==='failed' || staleEmail(previous))))return;
        attemptVersion=(previous.version||0)+1;
        send=input.status==='unpaid' && previous.emailState!=='sent';
        tx.set(ref.collection('history').doc(String(attemptVersion)),{at:Date.now(),by:uid,previous:{status:previous.status||'pending',paidCents:previous.paidCents||0,paidDate:previous.paidDate||''},next:{status:input.status,paidCents,paidDate}});
        tx.set(ref,{status:input.status,paidCents,paidDate,checkedAt:Date.now(),checkedBy:uid,emailState:send?'sending':previous.emailState||'',version:(previous.version||0)+1},{merge:true});
      });
      const finish=patch=>db.runTransaction(async tx=>{const latest=(await tx.get(ref)).data();if(latest?.version===attemptVersion)tx.set(ref,patch,{merge:true});});
      if(send) {
        try {
          const club=(await db.collection('clubs').doc(s.clubId).get()).data();
          await sendEmail({to:recipient,clubName:club?.name||'Votre club',clientName:s.clientName,due,language:s.client.data()?.preferredLang || s.client.data()?.langue || "fr"});
          await finish({emailState:'sent',emailSentAt:Date.now()});
        }catch {
          await finish({emailState:'failed'});
          fail('Paiement marqué non reçu, mais le mail n’a pas pu être envoyé. Réessayez depuis cette échéance.',502);
        }
      }
      return {ok:true};
    },
  };
}
module.exports={createClubSubscriptions,installments,billingOptions,discountOptions};
