import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initializeApp,cert} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';

// Only these two complete catalog entries and the machine's variant links are written.
const bank=JSON.parse(fs.readFileSync(new URL('../training.json',import.meta.url)));
const entries=['T400','T401'].map(id=>bank.exercices.find(e=>e.id===id));
const refFor=e=>({nom:e.nom,id:e.id,docId:e.nom.replace(/\s+/g,'_'),collection:'training'});
for(const e of entries){
 assert(e?.nom && e.programmingTags);
 for(const key of ['Positionnement','Mouvement','Retour','Respiration','Posture'])assert(e.consignes[key]);
 for(const objective of Object.values(e.parametres_objectif))for(const key of ['series','repetitions','repos','temps_effort'])assert(objective[key].length===2);
 for(const lang of ['en','it','es','de','ru','ar'])assert(e.translations[lang]?.nom && Object.values(e.translations[lang].consignes).every(Boolean));
 assert(e.variantes.some(v=>v.id==='T348'));
}
if(!process.argv.includes('--commit')){
 console.log('Validated complete entries:',entries.map(e=>({id:e.id,nom:e.nom,objectives:Object.keys(e.parametres_objectif),languages:Object.keys(e.translations)})));
}else{
 initializeApp({credential:cert(JSON.parse(fs.readFileSync(new URL('../backend/serviceAccountKey.json',import.meta.url))))});
 const db=getFirestore();
 const existing=await db.collection('training').get();
 for(const e of entries){
  const collision=existing.docs.find(d=>(d.data().id===e.id || d.data().nom===e.nom)&&d.id!==refFor(e).docId);
  assert(!collision,`Existing exercise collision: ${e.id}`);
 }
 const machineRef=db.collection('training').doc('Pullover_à_la_machine');
 await db.runTransaction(async tx=>{
  const machine=await tx.get(machineRef);assert(machine.exists && machine.data().id==='T348');
  const refs=entries.map(e=>db.collection('training').doc(refFor(e).docId));
  const docs=await Promise.all(refs.map(r=>tx.get(r)));
  const links=entries.map(refFor);
  for(let i=0;i<entries.length;i++){
   if(docs[i].exists){assert(docs[i].data().id===entries[i].id);continue;}
   tx.create(refs[i],{...entries[i],createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  }
  const variants=[...(machine.data().variantes||[])];
  for(const link of links)if(!variants.some(v=>v?.id===link.id))variants.push(link);
  const update={variantes:variants,updatedAt:FieldValue.serverTimestamp()};
  for(const lang of ['en','it','es','de','ru','ar'])update[`translations.${lang}.variantes`]=[...new Set([...(machine.data().translations?.[lang]?.variantes||[]),...entries.map(e=>e.translations[lang].nom)])];
  tx.update(machineRef,update);
 });
 for(const e of entries){const saved=(await db.doc(`training/${refFor(e).docId}`).get()).data();assert.equal(saved.id,e.id);assert.deepEqual(saved.parametres_objectif,e.parametres_objectif);assert.deepEqual(saved.consignes,e.consignes);assert.deepEqual(saved.variantes,e.variantes);console.log('Verified:',saved.id,saved.nom);}
 const machine=(await machineRef.get()).data();assert(entries.every(e=>machine.variantes.some(v=>v.id===e.id)));console.log('Verified machine replacement links.');
}
