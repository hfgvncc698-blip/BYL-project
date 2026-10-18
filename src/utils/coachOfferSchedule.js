// Calendar arithmetic uses UTC so daylight-saving changes never alter day counts.
export const offerToday = () => new Intl.DateTimeFormat('en-CA', { year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
const cycle = (start, offset, day) => {
  const d = new Date(`${start}T12:00:00Z`);
  const month = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+offset, 1, 12));
  month.setUTCDate(Math.min(day, new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate()));
  return month.toISOString().slice(0,10);
};
export function offerExpiry(start, months) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'') || !Number.isInteger(months) || months<=0)return null;
  return cycle(start,months,Number(start.slice(8)));
}
export function offerSchedule(contract, scale=100) {
  if(contract.status==='cancelled')return [];
  const {start,end,paymentDay=1,price,type,prorata=false}=contract;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start||'') || !/^\d{4}-\d{2}-\d{2}$/.test(end||'') || start>end || !Number.isFinite(Number(price)) || Number(price)<0 || paymentDay<1 || paymentDay>31) return [];
  const amount=Math.round(Number(price)*scale);
  if(type!=='recurring') return [{date:contract.firstPaymentDate||start,amount}];
  const offset=cycle(start,0,paymentDay)>start?0:1;
  const next=cycle(start,offset,paymentDay), previous=cycle(start,offset-1,paymentDay);
  const endExclusive=new Date(Date.parse(end)+86400000).toISOString().slice(0,10);
  const days=Math.round((Date.parse(endExclusive<next?endExclusive:next)-Date.parse(start))/86400000);
  const cycleDays=Math.round((Date.parse(next)-Date.parse(previous))/86400000);
  const rows=[{date:contract.firstPaymentDate||start,amount:prorata?Math.round(amount*days/cycleDays):amount,days,cycleDays,prorata}];
  for(let i=offset;i<120;i++){const date=cycle(start,i,paymentDay);if(date>end)break;rows.push({date,amount});}
  return rows;
}
