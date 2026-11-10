// Reproduce one measurement with the actual Rules of the selected revision.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const [label='after',size='12',width='1440',offset='0']=process.argv.slice(2);
assert.ok(['before','after'].includes(label) && ['0','12','100','500'].includes(size));
assert.ok(['500','1440'].includes(width) && /^\d{1,2}$/.test(offset));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'byl-lot4-rules-'));
const port=Number(offset);
try{
  fs.writeFileSync(path.join(tmp,'firestore.rules'),label==='before' ? execFileSync('git',['show','bff7eaf:firestore.rules']) : fs.readFileSync('firestore.rules'));
  const endpoint=base=>({host:'127.0.0.1',port:base+port});
  fs.writeFileSync(path.join(tmp,'firebase.json'),JSON.stringify({firestore:{rules:'firestore.rules'},emulators:{
    firestore:{...endpoint(8500),websocketPort:9500+port},auth:endpoint(9600),hub:endpoint(4500),logging:endpoint(4600),
    ui:{enabled:false},singleProjectMode:true}}));
  execFileSync('firebase',['emulators:exec','--config',path.join(tmp,'firebase.json'),'--project','demo-byl-performance','--only','auth,firestore',
    'node scripts/measureCoachPagesLot4.cjs'],{stdio:'inherit',env:{...process.env,BYL_LOT4_SIZE:size,BYL_LOT4_WIDTH:width,BYL_LOT4_LABEL:label}});
} finally {fs.rmSync(tmp,{force:true,recursive:true});}
