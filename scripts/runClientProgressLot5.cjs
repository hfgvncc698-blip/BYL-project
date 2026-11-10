// Each invocation owns its localhost emulators and synthetic demo project.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const [label='after',size='5',history='100',width='1440',offset='0',journey='']=process.argv.slice(2);
if(!['before','after'].includes(label)||!['0','1','5','20'].includes(size)||!['10','100','1000'].includes(history)||
  !['500','1440'].includes(width)||!/^\d{1,2}$/.test(offset)||!['','journey'].includes(journey))throw Error('Invalid fixture');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'byl-progress-emulator-'));
const endpoint=port=>({host:'127.0.0.1',port:port+Number(offset)});
try{
  fs.copyFileSync('firestore.rules',path.join(tmp,'firestore.rules'));
  fs.writeFileSync(path.join(tmp,'firebase.json'),JSON.stringify({firestore:{rules:'firestore.rules'},emulators:{
    firestore:{...endpoint(8700),websocketPort:9700+Number(offset)},auth:endpoint(8800),hub:endpoint(4700),logging:endpoint(4800),ui:{enabled:false}}}));
  execFileSync('firebase',['emulators:exec','--project','demo-byl-performance','--config',path.join(tmp,'firebase.json'),'--only','auth,firestore',
    ['node scripts/measureClientProgressLot5.cjs',label,size,history,width,journey].join(' ')],{stdio:'inherit'});
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
