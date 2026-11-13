// Only metadata derived from an already authorized snapshot is retained.
// Every use is preceded by current parent authorization and a fresh Firestore
// program updateTime. No authorization result or completion history is cached.
const entries=new Map(),collections=new Map();let bytes=0;
const budget=32*1024*1024,ttl=24*60*60*1000;
function key(doc){return `${doc.ref.firestore?.projectId || ''}/${doc.ref.path}@${doc.updateTime.seconds}:${doc.updateTime.nanoseconds}`;}
function collectionKey(ref){return `${ref.firestore?.projectId || ''}/${ref.path}`;}
function remove(k){
  const old=entries.get(k);if(!old)return;
  bytes-=old.bytes;entries.delete(k);
  const keys=collections.get(old.collection);keys?.delete(k);
  if(!keys?.size)collections.delete(old.collection);
}
// Performance hint only: this never supplies data or authorizes an operation.
// With no reusable outline, read the canonical query directly rather than pay
// for a metadata query followed by a second read of every program.
function hasCollection(ref){
  const keys=collections.get(collectionKey(ref));if(!keys)return false;
  for(const k of keys){
    const entry=entries.get(k);
    if(entry && Date.now()-entry.at<=ttl)return true;
    remove(k);
  }
  return false;
}
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
  const collection=collectionKey({firestore:doc.ref.firestore,path:doc.ref.path.slice(0,doc.ref.path.lastIndexOf('/'))});
  entries.set(k,{value,bytes:size,at:Date.now(),collection});bytes+=size;
  if(!collections.has(collection))collections.set(collection,new Set());
  collections.get(collection).add(k);
}
module.exports={get,put,hasCollection,clear(){entries.clear();collections.clear();bytes=0;},stats(){return {entries:entries.size,bytes,budget};}};
