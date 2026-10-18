import { offerSchedule } from './coachOfferSchedule';
export const offerClientKey = contract => contract.clientId || contract.id;
export function summarizeOfferClient(contracts, checks, clientKey, today, scaleFor) {
  const selected=contracts.filter(c=>offerClientKey(c)===clientKey);
  const totals={};
  const payments=[];
  let packSessions=0, standaloneSessions=0, subscriptionSessions=0;
  let unknownSessions=false;
  for(const contract of selected){
    if(Number.isFinite(contract.completedSessions)||Number.isFinite(contract.remaining)){
      const done=contract.completedSessions??Math.max(0,contract.quantity-contract.remaining);
      if(contract.type==='pack')packSessions+=done;
      else if(contract.type==='single')standaloneSessions+=done;
      else subscriptionSessions+=done;
    }else unknownSessions=true;
    const currency=contract.currency||'EUR',scale=scaleFor(currency);
    totals[currency]??={received:0,due:0,upcoming:0};
    for(const row of offerSchedule(contract,scale)){
      const raw=checks[`${contract.id}:${row.date}`];
      const check=typeof raw==='string'?{status:raw}:raw||{};
      const received=check.status==='paid'?row.amount:Math.min(row.amount,Math.max(0,check.paidCents||0));
      totals[currency].received+=received;
      totals[currency][row.date<=today?'due':'upcoming']+=row.amount-received;
      payments.push({...row,contract,check,received,currency,scale});
    }
  }
  return {contracts:selected,totals,payments:payments.sort((a,b)=>a.date.localeCompare(b.date)),packSessions,standaloneSessions,subscriptionSessions,unknownSessions};
}
