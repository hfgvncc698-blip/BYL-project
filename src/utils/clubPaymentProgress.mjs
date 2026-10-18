export function clubPaymentProgress(contract, dues, today) {
  const rows=dues.filter(d=>d.contractId===contract.id).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const next=rows.find(d=>d.status!=='paid');
  if(!next)return null;
  const days=Math.round((Date.parse(next.dueDate)-Date.parse(today))/86400000);
  const previous=rows.filter(d=>d.dueDate<next.dueDate).at(-1)?.dueDate||contract.start;
  const duration=Math.max(1,(Date.parse(next.dueDate)-Date.parse(previous))/86400000);
  return {date:next.dueDate,days,percent:Math.max(0,Math.min(100,(1-days/duration)*100))};
}
