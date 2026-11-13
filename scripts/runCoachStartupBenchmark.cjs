// Reuse the Lot 8B real-app harness, in a disposable copy with demo Firebase only.
const fs=require('fs'),os=require('os'),path=require('path'),{execFileSync,spawnSync}=require('child_process');
const label=process.argv[2],run=Number(process.argv[3]||1),built=process.argv[4]==='build';if(!['before','after'].includes(label)||!Number.isInteger(run)||run<1||run>3)throw Error('before|after, repetition 1..3 required');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'byl-startup-bench-'));
try{
 execFileSync('tar',['-x','-C',dir],{input:execFileSync('git',['archive','HEAD'],{cwd:root,maxBuffer:150*1024*1024})});
 // Reuse the previous runner's explicit dependencies as well as current edits.
 const original=fs.readFileSync(path.join(root,'scripts/runCoachLot8B.cjs'),'utf8');
 const extra=[...original.matchAll(/'([^']+\.(?:jsx?|cjs))'/g)].map(x=>x[1]).filter(x=>fs.existsSync(path.join(root,x)));
 const changed=execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
 const baselines=fs.readdirSync(path.join(root,'audits/coach-startup/baseline')).map(x=>'audits/coach-startup/baseline/'+x);
 for(const file of [...changed,...extra,...baselines,'backend/utils/coachDashboardBundles.js','backend/utils/coachDashboardTransport.js']){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(dir,file));}
 fs.cpSync(path.join(root,'src'),path.join(dir,'src'),{recursive:true});
 for(const name of ['node_modules','backend/node_modules','functions/node_modules'])fs.symlinkSync(path.join(root,name),path.join(dir,name));
 let probe=fs.readFileSync(path.join(root,'scripts/measureCoachLot8B.cjs'),'utf8').replaceAll('audits/lot8b','audits/coach-startup');
 const start=probe.indexOf(' const scenarios='),end=probe.indexOf('\n const fixtures=',start);if(start<0||end<0)throw Error('fixture anchor');
 probe=probe.slice(0,start)+" const scenarios=[['coach',36,10],['coach',36,100],['coach',100,10]];"+probe.slice(end);
 if(!probe.includes('for(let j=0;j<2;j++)'))throw Error('program fixture anchor');
 probe=probe.replace('for(let j=0;j<2;j++)','for(let j=0;j<(i===0?20:2);j++)');
 const history="await put(p+'/sessionsEffectuees/s0',{status:'completed',sessionIndex:0,dateEffectuee:now});";
 if(!probe.includes(history))throw Error('history fixture anchor');
 probe=probe.replace(history,"for(let k=0;k<h;k++)await put(p+'/sessionsEffectuees/s'+k,{status:'completed',sessionIndex:k,dateEffectuee:now});");
 if(built){
  probe=probe.replace(" const authPath=", ` const dashboardPath=path.join(tmp,'src/components/CoachDashboard.jsx');fs.writeFileSync(dashboardPath,fs.readFileSync(dashboardPath,'utf8').replace('const dashboardPerfEnabled = import.meta.env.DEV &&','const dashboardPerfEnabled ='));
 const authPath=`);
  const a=probe.indexOf(" vite=await(await import('vite')).createServer("),b=probe.indexOf("\n const base=",a);if(a<0||b<0)throw Error('server anchor');
  probe=probe.slice(0,a)+`
 const buildConfig=(await import(require('node:url').pathToFileURL(path.resolve('vite.config.js')).href)).default;
 await(await import('vite')).build({...buildConfig,root:tmp,configFile:false,envDir:false,logLevel:'error',define:{'import.meta.env.VITE_BYL_FIRESTORE_METRICS':'"1"'},plugins:[...buildConfig.plugins,{name:'sdk-probe',enforce:'pre',resolveId(id,importer){if(id==='firebase/firestore'&&importer!==wrapper)return wrapper;}}],build:{...buildConfig.build,target:'esnext',outDir:path.join(tmp,'dist'),emptyOutDir:true}});
 app.use(express.static(path.join(tmp,'dist')));app.use((_req,res)=>res.sendFile(path.join(tmp,'dist/index.html')));
 const httpServer=app.listen(0,'127.0.0.1');await once(httpServer,'listening');vite={httpServer,close:async()=>{httpServer.closeAllConnections();await new Promise(r=>httpServer.close(r));}};
 `+probe.slice(b);
 }
 probe=probe.replaceAll("if(label==='after'&&kind==='coach'&&n===12)","if(label==='after'&&kind==='coach'&&n===36)");
 fs.writeFileSync(path.join(dir,'scripts/measureCoachStartup.cjs'),probe);
 if(label==='before')for(const [file,base] of [['src/AuthContext.jsx','AuthContext.jsx'],['backend/routes/coachProgramRead.js','coachProgramRead.js']])fs.copyFileSync(path.join(root,'audits/coach-startup/baseline',base),path.join(dir,file));
 const result=spawnSync('firebase',['emulators:exec','--config','firebase.performance-test.json','--project','demo-byl-performance','--only','auth,firestore','node scripts/measureCoachStartup.cjs '+label+' main'],{cwd:dir,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,JAVA_TOOL_OPTIONS:'-Xmx3g',TZ:'Europe/Paris',GCLOUD_PROJECT:'demo-byl-performance',GOOGLE_CLOUD_PROJECT:'demo-byl-performance'},stdio:'inherit',timeout:600000});
 const output=path.join(dir,'audits/coach-startup/'+label+'.json');if(fs.existsSync(output))fs.copyFileSync(output,path.join(root,'audits/coach-startup/'+label+'-'+run+(built?'-build':'')+'.json'));
 process.exitCode=result.status??1;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
