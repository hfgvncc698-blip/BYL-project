const fs=require('fs'),os=require('os'),path=require('path'),{execFileSync,spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'byl-startup-check-'));
try{
 execFileSync('tar',['-x','-C',dir],{input:execFileSync('git',['archive','HEAD'],{cwd:root,maxBuffer:150*1024*1024})});
 const changed=execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
 const extra=['scripts/testCoachAdmissionMetadata.cjs','backend/utils/coachDashboardBundles.js','backend/utils/coachDashboardTransport.js'];
 for(const file of [...changed,...extra]){const source=path.join(root,file);if(!fs.existsSync(source))continue;fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.copyFileSync(source,path.join(dir,file));}
 for(const name of ['node_modules','backend/node_modules','functions/node_modules'])fs.symlinkSync(path.join(root,name),path.join(dir,name));
 const result=spawnSync('firebase',['emulators:exec','--config','firebase.performance-test.json','--project','demo-byl-performance','--only','auth,firestore','node scripts/testCoachAdmissionMetadata.cjs '+(process.argv.includes('--require-fix')?'--require-fix':'')],{cwd:dir,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,TZ:'Europe/Paris',GCLOUD_PROJECT:'demo-byl-performance',GOOGLE_CLOUD_PROJECT:'demo-byl-performance'},stdio:'inherit',timeout:180000});process.exitCode=result.status??1;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
