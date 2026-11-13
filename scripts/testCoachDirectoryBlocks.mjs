import assert from 'node:assert/strict';
import fs from 'node:fs';
const code=fs.readFileSync('src/utils/coachDirectoryFeed.js','utf8').replace(/^import .*;\n/gm,'').replace('export function','function');
function harness(){
 const listeners=[];let purged=0;
 const clause=(...args)=>args;
 const factory=new Function('collection','documentId','limit','or','orderBy','snapshotEqual','startAfter','where','db','coachConfirmedSnapshot','clientsConfirmedSnapshot','coachQuery','clientsQuery',code+';return coachDirectoryFeed;');
 const listen=(q,ok,fail)=>{const entry={q,ok,fail,closed:false};listeners.push(entry);return()=>entry.closed=true;};
 return {listeners,feed:factory(clause,()=>'$id',n=>({limit:n}),clause,clause,(a,b)=>a===b,clause,clause,{},listen,listen,clause,clause)('coach',()=>purged++),purged:()=>purged};
}
const docs=n=>Array.from({length:n},(_,i)=>({id:'c'+i,data:()=>({createdBy:'coach'})}));
const snap=(docs,fromCache=false)=>({docs,size:docs.length,empty:!docs.length,metadata:{fromCache,hasPendingWrites:false}});
for(const n of [0,12,36,100,500,1000]){
 const h=harness(),events=[];const stop=h.feed.watch('coach-dashboard',{changed:(_s,c)=>events.push(c),error:e=>events.push(e)});
 const pending=h.feed.read('coach-dashboard');assert.equal(h.listeners.length,1);
 assert(!h.listeners[0].q.some(c=>c?.limit),'Dashboard full totals require all roots exactly once');
 h.listeners[0].ok(snap(docs(n),true));assert.equal(h.feed.fresh(),false);
 const rows=docs(n);h.listeners[0].ok(snap(rows));assert.equal((await pending).size,n);assert.equal(h.feed.fresh(),true);assert.equal(h.listeners.length,1);
 h.listeners[0].ok(snap(rows.slice(1)));if(n)assert.equal(events[0][0].type,'removed');
 h.listeners[0].fail(Object.assign(Error('revoked'),{code:'permission-denied'}));assert.equal(h.feed.current(),null);assert.equal(h.feed.fresh(),false);assert(h.purged()>0);
 stop();h.feed.close();
}
const h=harness();h.feed.watch('clients',{});assert(h.listeners[0].q.some(c=>c?.limit===25));h.listeners[0].ok(snap(docs(25)));assert.equal(h.listeners.length,2);assert(h.listeners[1].q.some(c=>c?.limit===100));h.feed.close();
console.log('PASS Dashboard 0/12/36/100/500/1000: one confirmed query, cache rejected, removal and revocation; Clients pagination preserved.');
