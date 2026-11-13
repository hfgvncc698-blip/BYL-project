// Only metadata derived from an already authorized snapshot is retained.
// Every use is preceded by current parent authorization and a fresh Firestore
// program updateTime. No authorization result or completion history is cached.
const entries=new Map();let bytes=0;
const budget=32*1024*1024,ttl=24*60*60*1000;
function key(doc){return `${doc.ref.firestore?.projectId || ''}/${doc.ref.path}@${doc.updateTime.seconds}:${doc.updateTime.nanoseconds}`;}
function remove(k){const old=entries.get(k);if(old){bytes-=old.bytes;entries.delete(k);}}
function get(doc){
  const k=key(doc),entry=entries.get(k);
  if(!entry)return null;
  if(Date.now()-entry.at>ttl){remove(k);return null;}
  entries.delete(k);entries.set(k,entry);return entry.value;
}
function put(doc,value){
  const k=key(doc),size=Buffer.byteLength(JSON.stringify(value));
  if(size>budget)return;
  remove(k);
  while(bytes+size>budget && entries.size)remove(entries.keys().next().value);
  entries.set(k,{value,bytes:size,at:Date.now()});bytes+=size;
}
module.exports={get,put,clear(){entries.clear();bytes=0;},stats(){return {entries:entries.size,bytes,budget};}};
