import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {applyPlayerExerciseEdit} from '../src/utils/playerExerciseEditing.js';
const source=fs.readFileSync('src/components/ExerciseBank.jsx','utf8');
const body=source.slice(source.indexOf('  const handleSaveExercise = async () => {'),source.indexOf('  const addingRef = useRef(false);'));
for(const fail of [false,true]){
 let created,closed=false,writes=0,published,callbackAfterWrite=false;
 const context={section:'training',newExercise:{nom:'Brand new movement',groupe_musculaire:['dos']},defaultExercise:{},
  normalizeNameKey:x=>x,buildFamilyKey:x=>x,buildFamilyTokens:x=>[x],buildNameSlug:()=> 'brand-new',
  TXT:{addedWithId:id=>id},i18n:{t:()=>''},toast:()=>{},setSavingExercise:()=>{},
  exerciseExistsLocally:()=>false,exerciseExistsInFirestore:async()=>false,
  currentUser:{uid:'coach'},sanitizeArrayValues:x=>x||[],generateDefaultParams:()=>({}),
  serverTimestamp:()=>({sentinel:true}),doc:(_,id)=>id,collection:()=>null,db:{},
  setDoc:async()=>{writes++;if(fail)throw Error('permission-denied');callbackAfterWrite=true;},
  getDocs:()=>{throw Error('Must not reload whole catalog after creation');},
  closeAddModal:()=>{closed=true;},exerciseBankDataCache:null,exercises:[],
  publishExerciseBankData:rows=>{published=rows;},dedupeByUid:x=>x,startTransition:fn=>fn(),setExercises:fn=>fn([]),
  onCreated:async item=>{assert.equal(callbackAfterWrite,true);created=item;},
 };
 await vm.runInNewContext(body+';handleSaveExercise();',context);
 assert.equal(writes,1);
 if(fail){assert.equal(created,undefined);assert.equal(closed,false);continue;}
 assert.equal(closed,true);assert.equal(created.docId,'brand-new');assert.equal(published[0],created);
 assert.equal(created.createdAt.sentinel,undefined);
 const programData={sessions:[{corps:[{id:'old',nom:'Old',series:3}]}]};
 for(const mode of ['replace','addAfter']){
  const edit=applyPlayerExerciseEdit({programData,sessionIndex:0,mapping:{sectionKey:'corps',index:0},selectedExercise:created,mode,instanceId:'new-instance'});
  assert.equal(edit.exercise.nom,'Brand new movement');
 }
}
const player=fs.readFileSync('src/components/SessionPlayer.jsx','utf8');
assert.match(player,/onCreated=\{handlePlayerExerciseSelection\}/);
console.log('PASS confirmed creation immediately selects in player; failure retains form; no catalog reload or nested timestamp sentinel.');
