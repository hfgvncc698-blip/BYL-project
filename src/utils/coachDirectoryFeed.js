import {collection,documentId,limit,or,orderBy,snapshotEqual,startAfter,where} from 'firebase/firestore';
import {db} from '../firebaseConfig';
import {coachConfirmedSnapshot,clientsConfirmedSnapshot,coachQuery,clientsQuery} from './firestoreMetrics';

// The Clients page paints its first 25 roots. The Dashboard needs every root
// for exact totals and legacy identity deduplication: use one shared query,
// instead of serial pages that eventually read the same complete directory.
// Each subsequent listener starts strictly after its preceding page. If that
// boundary moves, discard its old tail before accepting any new full view.
export function coachDirectoryFeed(target,purge) {
  const observers=new Set(),pages=[];
  let hasPublished=false,current,last=new Map(),pending,resolve,reject,stopTimer;
  function defer(){
    current=null;
    if(pending)return;
    pending=new Promise((yes,no)=>{resolve=yes;reject=no;});pending.catch(()=>{});
  }
  function truncate(index){
    for(const page of pages.splice(index))page.stop?.();
  }
  function start(pageName){
    if(pages.length)return;
    defer();
    const q=pageName==='clients'?clientsQuery:coachQuery;
    const listen=pageName==='clients'?clientsConfirmedSnapshot:coachConfirmedSnapshot;
    const filter=or(where('createdBy','==',target),where('coachId','==',target),where('coachIds','array-contains',target));
    function attach(after){
      const i=pages.length, size=pageName==='coach-dashboard'?Infinity:(i===0?25:100), page={after,confirmed:false,docs:[],size};
      pages.push(page);
      const query=q(collection(db,'clients'),filter,orderBy(documentId()),...(after?[startAfter(after)]:[]),...(Number.isFinite(size)?[limit(size)]:[]));
      page.stop=listen(query,snap=>{
        if(pages[i]!==page)return;
        if(snap.metadata.fromCache || snap.metadata.hasPendingWrites){
          page.confirmed=false;for(const o of observers)o.stale?.();return;
        }
        page.confirmed=true;page.docs=snap.docs;
        const boundary=snap.size===size?snap.docs.at(-1).id:null;
        if(pages[i+1] && pages[i+1].after!==boundary)truncate(i+1);
        if(boundary && !pages[i+1]){
          defer();
          const prefix=pages.flatMap(p=>p.docs);
          for(const o of observers)o.partial?.(prefix,hasPublished);
          attach(boundary);return;
        }
        const tail=pages.at(-1);
        if(!pages.every(p=>p.confirmed) || tail.docs.length===tail.size)return;
        const docs=pages.flatMap(p=>p.docs);
        const next=new Map(docs.map(d=>[d.id,d]));
        const changes=[];
        for(const d of docs){
          const previous=last.get(d.id);
          if(!previous || !snapshotEqual(previous,d))changes.push({type:previous?'modified':'added',doc:d});
        }
        for(const [id,d] of last)if(!next.has(id)){purge(id);changes.push({type:'removed',doc:d});}
        const initial=!hasPublished, rebuilt=hasPublished && !current;
        hasPublished=true;
        last=next;current={docs,size:docs.length,empty:!docs.length};
        resolve?.(current);pending=null;
        for(const o of observers){
          if(!initial && (changes.length || rebuilt))o.changed?.(current,changes);
          else o.confirmed?.(current);
        }
      },error=>{
        if(pages[i]!==page)return;
        truncate(0);hasPublished=false;last.clear();current=null;reject?.(error);pending=null;purge();
        for(const o of observers)o.error?.(error);
      });
    }
    attach(null);
  }
  function close(){
    truncate(0);hasPublished=false;last.clear();current=null;reject?.(new Error('directory-closed'));pending=null;
  }
  return {
    current:()=>current,fresh:()=>!!current && pages.every(p=>p.confirmed),active:()=>observers.size>0,
    read(name){start(name);return current?Promise.resolve(current):pending;},
    watch(name,o){
      clearTimeout(stopTimer);observers.add(o);start(name);
      return ()=>{observers.delete(o);if(!observers.size)stopTimer=setTimeout(close,1000);};
    },
    close(){clearTimeout(stopTimer);close();observers.clear();}
  };
}
