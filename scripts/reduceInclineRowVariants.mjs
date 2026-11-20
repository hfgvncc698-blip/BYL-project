import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Firestore, FieldValue} from '@google-cloud/firestore';
import {resolveCatalogVariants} from '../src/utils/exerciseVariantLabels.js';

// Only reduce the links introduced by completeInclineRows; preserve unrelated data.
const rowIds = ['tirage_scapulaire_a_plat_sur_bac_incline_halteres', 'rowing_halteres_banc_incline_pronation', 'rowing_halteres_banc_incline_supination'];
const oldAlternativeIds = [...Array.from({length:16}, (_,i)=>`T${200+i}`), 'T356', 'T357', 'T358'];
const keep = new Set(['T356', 'T357']);
const langs = ['fr','en','es','it','de','ru','ar'];
const credentials = JSON.parse(fs.readFileSync(new URL('../backend/serviceAccountKey.json', import.meta.url)));
const db = new Firestore({projectId:credentials.project_id, credentials, preferRest:true});
const refFor = d => ({id:d.data().id,docId:d.id,collection:'training',nom:d.data().nom});
try {
  const changes = await db.runTransaction(async tx => {
    const rows = await tx.getAll(...rowIds.map(id=>db.doc(`training/${id}`)));
    assert(rows.every(d=>d.exists), 'Missing rowing entry');
    const alternatives = await tx.get(db.collection('training').where('id','in',oldAlternativeIds));
    assert.equal(alternatives.size,19);
    const machines = alternatives.docs.filter(d=>keep.has(d.data().id));
    assert.equal(machines.length,2);
    const patches=[];
    for (const row of rows) {
      const targets=[...rows.filter(d=>d.id!==row.id),...machines];
      const patch={variantes:targets.map(refFor)};
      for (const lang of langs) patch[`translations.${lang}.variantes`]=targets.map(d=>{
        const name=lang==='fr'?d.data().nom:d.data().translations?.[lang]?.nom;
        assert(name,`Missing ${lang} name for ${d.id}`);return name;
      });
      patches.push({ref:row.ref,patch});
    }
    for (const d of alternatives.docs.filter(d=>!keep.has(d.data().id))) {
      const current=d.data();
      const rowNames=new Set(rows.map(r=>r.data().nom));
      const patch={variantes:(current.variantes||[]).filter(v=>!rowIds.includes(v?.docId)&&!rowIds.includes(v?.id)&&!rowNames.has(typeof v==='string'?v:v?.nom))};
      for (const lang of langs) {
        const existing=current.translations?.[lang]?.variantes;
        if (!existing) continue;
        const names=new Set(rows.map(r=>r.data().translations?.[lang]?.nom||r.data().nom));
        patch[`translations.${lang}.variantes`]=existing.filter(v=>!names.has(v));
      }
      patches.push({ref:d.ref,patch});
    }
    const catalog=[...rows,...machines].map(d=>({...d.data(),docId:d.id,__collection:'training',...(patches.find(p=>p.ref.path===d.ref.path)?.patch||{})}));
    const resolved=resolveCatalogVariants(catalog);
    for (const id of rowIds) assert.equal(resolved.find(d=>d.docId===id).variantes.length,4);
    if (process.argv.includes('--commit')) {
      fs.writeFileSync(`/tmp/byl-row-variants-before-reduction-${Date.now()}.json`,JSON.stringify([...rows,...alternatives.docs].map(d=>({path:d.ref.path,data:d.data()})),null,2),{mode:0o600});
      for(const {ref,patch} of patches) tx.update(ref,{...patch,updatedAt:FieldValue.serverTimestamp()});
    }
    return patches;
  });
  console.log('Validated: 4 existing alternatives per row; remove reciprocal additions from 17 other exercises.');
  if(process.argv.includes('--commit')) {
    for(const {ref,patch} of changes) {
      const saved=await ref.get();
      for(const [key,value] of Object.entries(patch)) assert.deepEqual(saved.get(key),value,`${ref.path}/${key}`);
    }
    console.log('Saved and verified all variant lists and translations. No exercises created or deleted.');
  }
} finally {await db.terminate();}
