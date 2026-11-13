const fs=require('fs'),os=require('os'),path=require('path'),{execFileSync,spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'byl-summary-trial-'));
try{
 execFileSync('tar',['-x','-C',dir],{input:execFileSync('git',['archive','HEAD'],{cwd:root,maxBuffer:150*1024*1024})});
 const source=fs.readFileSync(path.join(root,'scripts/runRegressionsLot8B.cjs'),'utf8');
 const extras=[...source.matchAll(/'([^']+\.(?:jsx?|cjs))'/g)].map(x=>x[1]).filter(x=>fs.existsSync(path.join(root,x)));
 const changed=execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
 for(const file of [...changed,...extras,'scripts/experiments/coachSummaryPilot.cjs','scripts/testCoachSummaryPilot.cjs']){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(dir,file));}
 for(const name of ['node_modules','backend/node_modules','functions/node_modules'])fs.symlinkSync(path.join(root,name),path.join(dir,name));
 // Integrate into the genuine protected route in the disposable emulator copy.
 const route=path.join(dir,'backend/routes/coachProgramRead.js'),text=fs.readFileSync(route,'utf8'),needle='return readDashboardBundles(tx,refs,{dashboard:req.body.dashboardProjection===1});';
 if(!text.includes(needle))throw Error('Route anchor changed');
 fs.writeFileSync(route,text.replace(needle,"if(req.body.summaryPilot===true)return require('../../scripts/experiments/coachSummaryPilot.cjs').readSummaries(db,tx,refs,docs);\n        "+needle));
 const result=spawnSync('firebase',['emulators:exec','--config','firebase.performance-test.json','--project','demo-byl-performance','--only','auth,firestore','node scripts/testCoachSummaryPilot.cjs'],{cwd:dir,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,JAVA_TOOL_OPTIONS:'-Xmx3g',TZ:'Europe/Paris',GCLOUD_PROJECT:'demo-byl-performance',GOOGLE_CLOUD_PROJECT:'demo-byl-performance'},stdio:'inherit',timeout:600000});
 const output=path.join(dir,'audits/coach-summary-pilot/trial.json');if(fs.existsSync(output))fs.copyFileSync(output,path.join(root,'audits/coach-summary-pilot/trial.json'));
 if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
