// Wait for the old-SDK measurements, then apply only the published SDK fix.
const fs=require('fs'),{spawnSync}=require('child_process');
(async()=>{
 while(true){let rows=[];try{rows=JSON.parse(fs.readFileSync('audits/coach-startup/final-checks.json'));}catch{}if(rows.some(r=>r.exitCode!==0&&!r.knownExistingFailure))throw Error('Pre-SDK qualification failed');if(rows.some(r=>r.name==='build'))break;await new Promise(r=>setTimeout(r,1000));}
 for(const file of ['package.json','package-lock.json'])fs.copyFileSync(file,'audits/coach-startup/baseline/'+file);
 for(let i=1;i<=3;i++)for(const ext of ['json','log'])fs.copyFileSync('audits/coach-startup/after-'+i+'-build.'+ext,'audits/coach-startup/after-'+i+'-build-sdk1212.'+ext);
 const results=[];
 const tasks=[['install','npm',['install','firebase@12.13.0','--save-exact','--ignore-scripts','--no-audit','--no-fund','--cache','/tmp/byl-startup-npm-cache']],['admission','node',['scripts/runCoachStartupChecks.cjs','--require-fix']]];
 for(let i=1;i<=3;i++)tasks.push(['after-'+i+'-build','node',['scripts/runCoachStartupBenchmark.cjs','after',String(i),'build']]);
 for(const suite of ['coach','progress','calendar','p01','p02','messaging'])tasks.push(['security-'+suite,'node',['scripts/runRegressionsLot8B.cjs',suite]]);
 tasks.push(['integrated-drafts','node',['scripts/runIntegratedDraftLot7B1Quater.cjs']],['draft-api','node',['scripts/runIntegratedDraftLot7B1Quater.cjs','api']],['smoke','npm',['run','test:smoke']],['build','npm',['run','build']]);
 for(const [name,command,args] of tasks){const fd=fs.openSync('audits/coach-startup/sdk-'+name+'.log','w'),start=Date.now();const r=spawnSync(command,args,{stdio:['ignore',fd,fd],timeout:660000});fs.closeSync(fd);results.push({name,exitCode:r.status,ms:Date.now()-start});fs.writeFileSync('audits/coach-startup/sdk-checks.json',JSON.stringify(results,null,2));if(r.status!==0)throw Error('Failed '+name);}
})().catch(e=>{console.error(e);process.exitCode=1;});
