import * as sdk from 'firebase/firestore';
export * from 'firebase/firestore';
const totals={sdkCalls:0,documentsReturned:0,estimatedReads:0,confirmedWrites:0,failures:0,activeListeners:0,peakListeners:0,subscriptions:0};
globalThis.coldFirestoreMetrics=totals;
function record(snapshot,listener=false){const n=snapshot.size??Number(snapshot.exists());totals.documentsReturned+=n;if(!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites)totals.estimatedReads+=Math.max(1,listener&&snapshot.docChanges?snapshot.docChanges().length:n);}
function read(fn){return async(...args)=>{totals.sdkCalls++;try{const s=await fn(...args);record(s);return s;}catch(e){totals.failures++;throw e;}};}
export const getDoc=read(sdk.getDoc),getDocs=read(sdk.getDocs),getDocFromServer=read(sdk.getDocFromServer),getDocsFromServer=read(sdk.getDocsFromServer),getDocFromCache=read(sdk.getDocFromCache),getDocsFromCache=read(sdk.getDocsFromCache);
export function onSnapshot(...args) {
  totals.sdkCalls++;totals.subscriptions++;totals.activeListeners++;totals.peakListeners=Math.max(totals.peakListeners,totals.activeListeners);let live=true;const finish=()=>{if(live){live=false;totals.activeListeners--;}};
  const index=args.findIndex(x=>typeof x==='function'||x&&typeof x.next==='function');
  if(index>=0) {
    const original=args[index];
    if(typeof original==='function') args[index]=s=>{record(s,true);original(s);};
    else args[index]={...original,next:s=>{record(s,true);original.next(s);}};
  }
  const errorIndex=index+1;if(typeof args[errorIndex]==='function'){const error=args[errorIndex];args[errorIndex]=e=>{finish();error(e);};}else if(args[index]&&typeof args[index]==='object'){const error=args[index].error;args[index]={...args[index],error:e=>{finish();error?.(e);}};}
  try{const stop=sdk.onSnapshot(...args);return ()=>{finish();stop();};}catch(e){finish();throw e;}
}
function write(fn){return async(...args)=>{const r=await fn(...args);totals.confirmedWrites++;return r;};}
export const setDoc=write(sdk.setDoc),updateDoc=write(sdk.updateDoc),addDoc=write(sdk.addDoc),deleteDoc=write(sdk.deleteDoc);
export function writeBatch(...args){const batch=sdk.writeBatch(...args);let count=0;for(const name of ['set','update','delete']){const fn=batch[name].bind(batch);batch[name]=(...values)=>{count++;fn(...values);return batch;};}const commit=batch.commit.bind(batch);batch.commit=async()=>{const r=await commit();totals.confirmedWrites+=count;return r;};return batch;}
export async function runTransaction(db,callback,...options){let count=0;const result=await sdk.runTransaction(db,async tx=>{count=0;for(const name of ['set','update','delete']){const fn=tx[name].bind(tx);tx[name]=(...args)=>{count++;fn(...args);return tx;};}return callback(tx);},...options);totals.confirmedWrites+=count;return result;}
