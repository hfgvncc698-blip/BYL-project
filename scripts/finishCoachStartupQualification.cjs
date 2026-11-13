const fs=require('fs'),{spawnSync}=require('child_process');
(async()=>{
 while(true){let rows=[];try{rows=JSON.parse(fs.readFileSync('audits/coach-startup/runs.json'));}catch{}if(rows.some(r=>r.exitCode!==0))throw Error('initial benchmark failed');if(rows.length===6)break;await new Promise(r=>setTimeout(r,1000));}
 const results=[];
 const tasks=[];
 for(let i=1;i<=3;i++)for(const label of ['before','after'])tasks.push([label+'-'+i+'-build','node',['scripts/runCoachStartupBenchmark.cjs',label,String(i),'build']]);
 for(const suite of ['coach','progress','calendar','p01','p02','messaging'])tasks.push(['security-'+suite,'node',['scripts/runRegressionsLot8B.cjs',suite]]);
 tasks.push(['integrated','node',['scripts/runIntegratedMigrationLot7B1Octies.cjs']],['smoke','npm',['run','test:smoke']],['build','npm',['run','build']]);
 for(const [name,command,args] of tasks){const fd=fs.openSync('audits/coach-startup/'+name+'.log','w'),start=Date.now();const r=spawnSync(command,args,{stdio:['ignore',fd,fd],timeout:660000});fs.closeSync(fd);results.push({name,exitCode:r.status,ms:Date.now()-start});fs.writeFileSync('audits/coach-startup/final-checks.json',JSON.stringify(results,null,2));if(r.status!==0)throw Error('Failed '+name);}
})().catch(e=>{console.error(e);process.exitCode=1;});
