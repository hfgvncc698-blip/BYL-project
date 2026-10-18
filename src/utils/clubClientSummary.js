// Normalize stored monetary scales to thousandths without mixing currencies.
export function summarizeClubClient(administration, billing, balances, today, now=Date.now()) {
  const payments=[...(administration.payments||[]).map(p=>({...p,key:`manual:${p.id}`,amount:p.dueCents,received:p.paidCents||0,date:p.dueDate,name:p.label})),...(billing.dues||[]).map(p=>({...p,key:`subscription:${p.id}`,amount:p.amountCents,received:p.status==='paid'?p.amountCents:p.paidCents||0,date:p.dueDate,name:p.label}))];
  const totals={};
  for(const p of payments){
    const currency=p.currency||'EUR',scale=p.unitScale??100;
    totals[currency]??={received:0,due:0,upcoming:0};
    const amount=Math.round((p.amount||0)*1000/scale),received=Math.round(p.received*1000/scale);
    totals[currency].received+=received;
    totals[currency][p.date&&p.date<=today?'due':'upcoming']+=Math.max(0,amount-received);
  }
  const packs=balances.packs||[];
  const packed=new Set(packs.flatMap(p=>(p.history||[]).filter(e=>e.attendance==='present').map(e=>e.id)));
  const events=[...new Map((administration.events||[]).map(e=>[e.id,e])).values()].filter(e=>e.startsAt<=now&&e.report?.attendance==='present'&&!['annulée','annulee','cancelled'].includes(e.status));
  const inPack=events.filter(e=>packed.has(e.id)).length;
  return {totals,payments:payments.sort((a,b)=>(b.date||'').localeCompare(a.date||'')),packs,contracts:billing.contracts||[],sessions:{total:events.length,inPack,outside:events.length-inPack},imported: packs.reduce((n,p)=>n+(Number(p.openingUsed)||0),0)};
}
