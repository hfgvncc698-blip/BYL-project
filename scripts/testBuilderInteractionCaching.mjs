import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const listeners=[];const storage=new Map();let serialized=0;
let slots=[],cursor=0;
const context={Map,Array,JSON:{parse:JSON.parse,stringify(value){serialized++;return JSON.stringify(value);}},
 onPrivateSessionChange:fn=>listeners.push(fn),
 tabSessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k),get length(){return storage.size;},key:i=>[...storage.keys()][i]},
 useCallback:fn=>fn,useRef:value=>{const i=cursor++;return slots[i]??(slots[i]={current:value});},
 useState:init=>{const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
};
vm.createContext(context);
const source=fs.readFileSync('src/hooks/useSessionDraft.js','utf8').replace(/^import .*;$/gm,'').replace('export default function','function').replace('export function','function');
vm.runInContext(source+'\nthis.hook=useSessionDraft;this.clear=clearSessionDrafts;',context);
const render=(key,options)=>{cursor=0;return context.hook(key,()=>[],options);};
const fixture=[{name:'Synthetic',corps:[{id:'1',details:'x'.repeat(100000)}]}];
let [value,set]=render('program-builder:A:new:sessions',{memoryOnly:true});set(fixture);
assert.equal(serialized,0);assert.equal(storage.size,0);assert.equal(render('program-builder:A:new:sessions',{memoryOnly:true})[0],fixture);
slots=[];assert.equal(render('program-builder:A:new:sessions',{memoryOnly:true})[0],fixture,'remount retains immediate memory draft');
context.clear('program-builder:A:');slots=[];assert.equal(render('program-builder:A:new:sessions',{memoryOnly:true})[0].length,0);
render('program-builder:A:new:sessions',{memoryOnly:true})[1](fixture);
listeners.forEach(fn=>fn());slots=[];assert.equal(render('program-builder:A:new:sessions',{memoryOnly:true})[0].length,0,'identity transition clears private memory');
slots=[];render('legacy-default')[1](fixture);assert.equal(serialized,1,'other callers retain existing behavior');
const builder=fs.readFileSync('src/components/ProgramBuilder.jsx','utf8');
const comparator=builder.slice(builder.indexOf('  (prev, next) => {',builder.indexOf('const ExerciseCardRow = memo(')),builder.indexOf('/* ===================== Component ===================== */'));
const compare=vm.runInNewContext(comparator.slice(0,comparator.lastIndexOf('\n);')).trim());
const row={index:1,ex:fixture,historyItems:[],replaceIndex:null};
assert.equal(compare(row,{...row,replaceIndex:0}),true,'unaffected row skips replacement toggle');
assert.equal(compare(row,{...row,replaceIndex:1}),false,'selected row updates');
assert.equal(compare(row,{...row,historyItems:[{}]}),false,'new history renders');
assert.equal(compare(row,{...row,ex:[...fixture]}),false,'edited exercise renders');
assert.equal(compare(row,{...row,expanded:true}),false,'expansion renders');
console.log('PASS immediate draft retention, no redundant serialization, identity clearing, existing callers, memo selection/history/edit/expansion');
// Memoized cards require changed link flags to have a new exercise identity.
const actions={useCallback:fn=>fn,activeTab:0,currentSection:'corps',markDirty(){},sessions:[]};
actions.setSessions=updater=>{actions.sessions=updater(actions.sessions);};
vm.createContext(actions);
vm.runInContext(builder.slice(builder.indexOf('function updateSession('),builder.indexOf('/* ===================== StepperInput')),actions);
for(const name of ['onDeleteExercise','onDragEndExercises','moveExerciseTo']){
 const start=builder.indexOf('  const '+name+' = useCallback(');
 const end=builder.indexOf('\n  );',start)+6;
 vm.runInContext(builder.slice(start,end)+'\nthis.'+name+'='+name+';',actions);
}
const a={id:'a',linkNext:true},b={id:'b',linkNext:true},c={id:'c',linkNext:false};
actions.sessions=[{useSections:true,corps:[a,b,c],bonus:[]}];
actions.onDeleteExercise(1);
assert.equal(a.linkNext,true);assert.equal(actions.sessions[0].corps[0].linkNext,false);assert.notEqual(actions.sessions[0].corps[0],a);
actions.sessions=[{useSections:true,corps:[a,b,c],bonus:[]}];
actions.onDragEndExercises({source:{index:0},destination:{index:2}},0,'corps');
assert.equal(a.linkNext,true);assert.equal(actions.sessions[0].corps[2].linkNext,false);assert.notEqual(actions.sessions[0].corps[2],a);
actions.sessions=[{useSections:true,corps:[a,b,c],bonus:[]}];
actions.moveExerciseTo('corps','bonus',1);
assert.equal(b.linkNext,true);assert.equal(actions.sessions[0].bonus[0].linkNext,false);assert.notEqual(actions.sessions[0].bonus[0],b);
console.log('PASS linked exercises repaint after delete, reorder and move without mutating previous state');
