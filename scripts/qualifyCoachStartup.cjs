const fs=require('fs'),{spawnSync}=require('child_process');
const results=[];
for(let repetition=1;repetition<=3;repetition++)for(const label of ['before','after']){
 const fd=fs.openSync('audits/coach-startup/'+label+'-'+repetition+'.log','w'),start=Date.now();
 const r=spawnSync(process.execPath,['scripts/runCoachStartupBenchmark.cjs',label,String(repetition)],{stdio:['ignore',fd,fd],timeout:660000});fs.closeSync(fd);
 results.push({label,repetition,exitCode:r.status,ms:Date.now()-start});fs.writeFileSync('audits/coach-startup/runs.json',JSON.stringify(results,null,2));
 if(r.status!==0)process.exit(r.status||1);
}
