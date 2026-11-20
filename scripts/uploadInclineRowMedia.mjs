import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {Storage} from '@google-cloud/storage';
import {Firestore,FieldValue} from '@google-cloud/firestore';
const downloads='/Users/tommarie/Downloads';
const entries=[
 ['Rowing haltères sur banc incliné (prise neutre)','tirage_scapulaire_a_plat_sur_bac_incline_halteres'],
 ['Rowing haltères sur banc incliné (pronation)','rowing_halteres_banc_incline_pronation'],
 ['Rowing haltères sur banc incliné (supination)','rowing_halteres_banc_incline_supination'],
];
const files=['homme-depart.png','homme-arrivee.png','homme.mp4','femme-depart.png','femme-arrivee.png','femme.mp4'];
const credentials=JSON.parse(fs.readFileSync(new URL('../backend/serviceAccountKey.json',import.meta.url)));
const db=new Firestore({projectId:credentials.project_id,credentials,preferRest:true});
const bucket=new Storage({projectId:credentials.project_id,credentials}).bucket('boost-your-life-f6b3e.firebasestorage.app');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const plans=entries.map(([name,id])=>{
 const dir=fs.readdirSync(downloads).find(n=>n.normalize('NFC')===name);
 assert(dir,`Missing folder ${name}`);
 return {name,id,files:files.map(file=>{const source=path.join(downloads,dir,file);const bytes=fs.readFileSync(source);assert(bytes.length>0);return {file,source,sha256:hash(bytes),size:bytes.length,destination:`Exercices/${id}/${file}`};})};
});
try{
 const refs=plans.map(p=>db.doc(`training/${p.id}`));
 const before=await db.getAll(...refs);
 before.forEach((d,i)=>assert(d.exists&&d.data().nom===plans[i].name));
 const backupPath=`/tmp/byl-incline-row-media-before-${Date.now()}.json`;
 fs.writeFileSync(backupPath,JSON.stringify(before.map(d=>({path:d.ref.path,data:d.data()})),null,2),{mode:0o600});
 const updates=[];
 for(const plan of plans){
  const media={homme:{images:[],video:null},femme:{images:[],video:null}};
  for(const item of plan.files){
   const file=bucket.file(item.destination);
   const [exists]=await file.exists();
   if(exists){
    const [bytes]=await file.download();assert.equal(hash(bytes),item.sha256,`Different file already exists: ${item.destination}`);
   }else{
    await bucket.upload(item.source,{destination:item.destination,resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:item.file.endsWith('.mp4')?'video/mp4':'image/png',cacheControl:'public, max-age=3600',metadata:{sha256:item.sha256}}});
   }
   const [url]=await file.getSignedUrl({action:'read',expires:'03-01-2500'});
   const response=await fetch(url);assert(response.ok,`Media URL: HTTP ${response.status}`);
   const bytes=Buffer.from(await response.arrayBuffer());assert.equal(hash(bytes),item.sha256,'Downloaded bytes differ');
   const sex=item.file.startsWith('homme')?'homme':'femme';
   if(item.file.endsWith('.mp4'))media[sex].video={path:item.destination,url};
   else media[sex].images.push({key:item.file.includes('depart')?'depart':'arrivee',path:item.destination,url});
  }
  updates.push({media,image_homme:media.homme.images[0].url,image_femme:media.femme.images[0].url});
  console.log('Uploaded and verified 6 files:',plan.name);
 }
 // Publish only after every media file is uploaded and its URL verified.
 const batch=db.batch();
 updates.forEach((update,i)=>batch.update(refs[i],{...update,updatedAt:FieldValue.serverTimestamp()},{lastUpdateTime:before[i].updateTime}));
 await batch.commit();
 const saved=await db.getAll(...refs);
 saved.forEach((d,i)=>{for(const [k,v]of Object.entries(updates[i]))assert.deepEqual(d.get(k),v);});
 console.log('Verified 3 Firestore records: 12 images and 6 videos attached.');
}finally{await db.terminate();}
