export function calculateEntryBmi(height, weight, heightUnit='cm', weightUnit='kg') {
  const number=value=>value == null || String(value).trim()===''?NaN:Number(String(value).replace(',','.'));
  const cm=number(height)*(heightUnit==='in'?2.54:1);
  const kg=number(weight)/(weightUnit==='lb'?2.20462262185:1);
  if(!Number.isFinite(cm)||!Number.isFinite(kg)||cm<=0||kg<=0)return null;
  return Math.round(kg/(cm/100)**2*10)/10;
}

export function latestEntryValue(measures, profile, user, readValue, field) {
  for(const source of [...measures].reverse().concat([profile,user])) {
    const value=readValue(source,field);
    if(Number.isFinite(value)&&value>0)return value;
  }
  return null;
}

export function convertEntryUnit(value, from, to, kind) {
  if(value == null || value==='')return '';
  const n=Number(value);
  if(!Number.isFinite(n))return '';
  const metric=kind==='height'?(from==='in'?n*2.54:n):(from==='lb'?n/2.20462262185:n);
  const converted=kind==='height'?(to==='in'?metric/2.54:metric):(to==='lb'?metric*2.20462262185:metric);
  return Number(converted.toFixed(6));
}
