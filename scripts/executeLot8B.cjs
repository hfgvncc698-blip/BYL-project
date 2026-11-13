// Synthetic local qualification only. Each runner scrubs production configuration.
const fs=require('node:fs'),{spawnSync}=require('node:child_process'),net=require('node:net');
const busy=()=>new Promise(r=>{const s=net.connect(8180,'127.0.0.1');s.once('connect',()=>{s.destroy();r(true)});s.once('error',()=>r(false));});
(async()=>{
for(let i=0;await busy();i++){if(i>1200)throw Error('Emulator busy');await new Promise(r=>setTimeout(r,500));}
if(fs.existsSync('audits/lot8b/after.json'))fs.copyFileSync('audits/lot8b/after.json','audits/lot8b/cards-only.json');
const results=[];
const jobs=[...['main','slow','cpu'].flatMap(g=>['before','after'].map(l=>[l+'-'+g,['scripts/runCoachLot8B.cjs',l,g]])),...['coach','progress','calendar','p01','p02','messaging'].map(s=>['regression-'+s,['scripts/runRegressionsLot8B.cjs',s]]),['security',['scripts/runIntegratedMigrationLot7B1Octies.cjs']]];
for(const [name,args]of jobs){console.log('START',name);const fd=fs.openSync('audits/lot8b/'+name+'.log','w');const start=Date.now();const p=spawnSync(process.execPath,args,{stdio:['ignore',fd,fd],timeout:1800000});fs.closeSync(fd);results.push({name,exitCode:p.status,error:p.error?.message,ms:Date.now()-start});fs.writeFileSync('audits/lot8b/suites.json',JSON.stringify(results,null,2));console.log('END',name,p.status);}
})().catch(e=>{console.error(e);process.exitCode=1;});
