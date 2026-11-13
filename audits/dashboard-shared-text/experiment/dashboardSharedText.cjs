// Lossless, request-local dictionary for repeated large strings. No cache,
// document writes, permission state or user identifiers are retained.
function shareDashboardText(payload) {
  const counts=new Map(),keys=new WeakMap();
  const visit=value=>{
    if(typeof value==='string'){if(value.length>=1024)counts.set('s'+value,(counts.get('s'+value)||0)+1);return;}
    if(!value || typeof value!=='object' || value.__bylWire)return;
    const json=JSON.stringify(value);
    if(json.length>=512 && json.length<=65536){
      const key='j'+json;keys.set(value,key);counts.set(key,(counts.get(key)||0)+1);
    }
    for(const child of Object.values(value))visit(child);
  };
  for(const rows of Object.values(payload.clients))for(const row of rows){visit(row.data);for(const h of row.history)visit(h.data);}
  const table=[],indices=new Map();
  const reference=(key,type)=>{
    if((counts.get(key)||0)<2)return null;
    if(!indices.has(key)){indices.set(key,table.length);table.push(key.slice(1));}
    return {__bylWire:[type,indices.get(key)]};
  };
  const pack=value=>{
    if(typeof value==='string')return reference('s'+value,'shared-text') || value;
    if(!value || typeof value!=='object' || value.__bylWire)return value;
    const key=keys.get(value);
    const reused=key && reference(key,'shared-json');if(reused)return reused;
    if(Array.isArray(value))return value.map(pack);
    return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,pack(child)]));
  };
  return {clients:Object.fromEntries(Object.entries(payload.clients).map(([id,rows])=>[id,rows.map(row=>({...row,data:pack(row.data),history:row.history.map(h=>({...h,data:pack(h.data)}))}))])),sharedText:table};
}
module.exports={shareDashboardText};
