const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'byl-sexies-run-'));
try{
 execFileSync('tar',['-x','-C',dir],{input:execFileSync('git',['archive','HEAD'],{cwd:root,maxBuffer:150*1024*1024})});
 for(const f of ['scripts/testMigrationLot7B1Sexies.cjs','scripts/fixtures/lot7b1sexies/migration.js','scripts/fixtures/lot7b1sexies/firestore.js']){fs.mkdirSync(path.dirname(path.join(dir,f)),{recursive:true});fs.copyFileSync(path.join(root,f),path.join(dir,f));}
 for(const f of ['node_modules','backend/node_modules','functions/node_modules'])fs.symlinkSync(path.join(root,f),path.join(dir,f));
 const result=spawnSync('firebase',['emulators:exec','--config','firebase.performance-test.json','--project','demo-byl-performance','--only','auth,firestore','node scripts/testMigrationLot7B1Sexies.cjs'],{cwd:dir,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,TZ:'Europe/Paris',GCLOUD_PROJECT:'demo-byl-performance',GOOGLE_CLOUD_PROJECT:'demo-byl-performance'},stdio:'inherit',timeout:240000});
 if(result.error)throw result.error;
 if(result.status===0){fs.mkdirSync(path.join(root,'audits/lot7b1sexies'),{recursive:true});fs.copyFileSync(path.join(dir,'audits/lot7b1sexies/results.json'),path.join(root,'audits/lot7b1sexies/results.json'));}
 process.exitCode=result.status??1;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
