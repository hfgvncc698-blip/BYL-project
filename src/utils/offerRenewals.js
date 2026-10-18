export function offerRenewals(contracts,today,translate=(text, values={})=>text.replace(/\{\{(\w+)\}\}/g,(_,key)=>values[key])){
 return contracts.flatMap(c=>{
  if(['cancelled','expired','scheduled'].includes(c.state)||c.status==='cancelled')return [];
  const days=c.expiresAt?Math.round((Date.parse(c.expiresAt)-Date.parse(today))/86400000):null;
  const reasons=[];
  if(c.type!=='recurring'&&c.available<=1)reasons.push(translate(c.available===0?'Aucun crédit disponible':'Dernier crédit disponible'));
  if(days!==null&&days>=0&&days<=14)reasons.push(`${translate(c.type==='recurring'?'Abonnement':'Pack')} : ${days===0?translate('expire aujourd’hui'):translate('expire dans {{days}} jour(s)',{days})}`);
  return reasons.length?[{...c,reasons,days}]:[];
 }).sort((a,b)=>(a.days??Infinity)-(b.days??Infinity)||a.clientName.localeCompare(b.clientName));
}
