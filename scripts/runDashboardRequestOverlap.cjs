const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),label=process.argv[2]||'before';
if(!['before','after'].includes(label))throw Error('before or after');
const compiled=process.argv.includes('--compiled');
const delayed=process.argv.includes('--slow-calendar');
const normalMode=process.argv.includes('--normal-mode');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'byl-dashboard-request-overlap-'));
try{
 execFileSync('tar',['-x','-C',dir],{input:execFileSync('git',['archive','HEAD'],{cwd:root,maxBuffer:150*1024*1024})});
 const files=execFileSync('git',['ls-files','-m','-o','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\n').filter(f=>/^(src|backend|scripts|functions)\//.test(f));
 for(const file of new Set(files)){if(!fs.statSync(path.join(root,file)).isFile())continue;fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(dir,file));}
 for(const name of ['node_modules','backend/node_modules','functions/node_modules'])fs.symlinkSync(path.join(root,name),path.join(dir,name));
 if(label==='before')for(const [file,target] of [['CoachDashboard.jsx','src/components/CoachDashboard.jsx'],['coachProgramBatch.js','src/utils/coachProgramBatch.js'],['coachDashboardLoading.js','src/utils/coachDashboardLoading.js']])fs.copyFileSync(path.join(root,'audits/dashboard-request-overlap/before/'+file),path.join(dir,target));
 let probe=fs.readFileSync(path.join(root,'scripts/measureColdLot8A.cjs'),'utf8').replaceAll('audits/lot8a','audits/dashboard-request-overlap');
 const a=probe.indexOf(" if(label==='before'){"),b=probe.indexOf('\n const wrapper=',a);probe=probe.slice(0,a)+probe.slice(b);
 const s=probe.indexOf(' const scenarios='),e=probe.indexOf('\n const fixtures=',s);probe=probe.slice(0,s)+" const scenarios=[['coach',36,40],['coach',100,40]];"+probe.slice(e);

 if(process.argv.includes('--dev-probe'))probe=probe.replace("[['coach',36,40],['coach',100,40]]","[['coach',36,40]]");
 probe=probe.replace("state.ready&&state.useful&&!calendarScrolled","state.ready&&!calendarScrolled");
 probe=probe.replace("const heading=[...document.querySelectorAll('h2,h3')].find(e=>e.textContent.includes('Calendrier'))", "const heading=document.getElementById('coach-calendar-card')");
 probe=probe.replace('for(let i=0;i<40;i++)','for(let i=0;i<h;i++)');
 probe=probe.replace('Date.now()-i*7*86400000','Date.now()-i*86400000');
 probe=probe.replace("createdAt:now,updatedAt:now});", "createdAt:admin.firestore.Timestamp.fromMillis(now.toMillis()-i*1000),updatedAt:admin.firestore.Timestamp.fromMillis(now.toMillis()-i*1000),lastCoachInteractionAt:admin.firestore.Timestamp.fromMillis(now.toMillis()-i*1000)});");
 probe=probe.replace("primary:!!window.fixturePrimary","primary:!!document.querySelector('[data-active-probe]:not([data-active-probe=\"…\"])')");
 probe=probe.replace("if(state.primary||state.timing?.core?.status==='ready'||state.timing?.ready?.status==='ready'||state.timing?.status==='ready')","if(state.primary)");
 probe=probe.replace("  if(kind==='messages')", `  if(i>=5)for(let p=0;p<2;p++)for(let k=1;k<25;k++)await put('clients/'+id+'/programmes/p'+p+'/sessionsEffectuees/s'+k,{status:'completed',sessionIndex:0,dateEffectuee:admin.firestore.Timestamp.fromMillis(now.toMillis()-k*86400000)});
  if(kind==='messages')`);
 probe=probe.replace("if(state.ready&&state.useful&&stable>=15)","if(state.ready&&state.useful&&state.timing?.core?.status==='ready'&&state.timing?.nutrition?.status==='ready'&&stable>=15)");
 probe=probe.replace(" const wrapper=",` const dashboardPath=path.join(tmp,'src/components/CoachDashboard.jsx');fs.writeFileSync(dashboardPath,fs.readFileSync(dashboardPath,'utf8').replace('import.meta.env.DEV && new URLSearchParams(location.search).has("dashboardPerf")','new URLSearchParams(location.search).has("dashboardPerf")'));
 fs.writeFileSync(dashboardPath,fs.readFileSync(dashboardPath,'utf8').replace('key={c.id}\\n                        position="relative"', 'key={c.id}\\n                        data-testid="recent-client-probe" data-ready={c.programmesAssignes?.length > 0 && c.programmesAssignes.every(p=>!p._quickPlaceholder) ? "yes" : "no"}\\n                        position="relative"'));
 fs.writeFileSync(dashboardPath,fs.readFileSync(dashboardPath,'utf8').replace("aria-busy={value === '…'}", "aria-busy={value === '…'} data-active-probe={label === t('dashboard.stats_active_30') ? String(value) : undefined}"));
 const timingPath=path.join(tmp,'src/hooks/usePageLoading.js');fs.writeFileSync(timingPath,fs.readFileSync(timingPath,'utf8').replace('import.meta.env.DEV && ',''));
 const wrapper=`);
 if(compiled){
  const start=probe.indexOf(" vite=await(await import('vite')).createServer("),end=probe.indexOf("\n const base=",start);
  if(start<0||end<0)throw Error('build anchor');
  probe=probe.slice(0,start)+`
 const buildConfig=(await import(require('node:url').pathToFileURL(path.resolve('vite.config.js')).href)).default;
 await(await import('vite')).build({...buildConfig,root:tmp,configFile:false,envDir:false,logLevel:'error',define:{'import.meta.env.VITE_BYL_FIRESTORE_METRICS':'"1"'},plugins:[...buildConfig.plugins,{name:'sdk-probe',enforce:'pre',resolveId(id,importer){if(id==='firebase/firestore'&&importer!==wrapper)return wrapper;}}],build:{...buildConfig.build,target:'esnext',outDir:path.join(tmp,'dist'),emptyOutDir:true}});
 app.use(express.static(path.join(tmp,'dist')));app.use((_req,res)=>res.sendFile(path.join(tmp,'dist/index.html')));
 const httpServer=app.listen(0,'127.0.0.1');await once(httpServer,'listening');vite={httpServer,close:async()=>{httpServer.closeAllConnections();await new Promise(r=>httpServer.close(r));}};
 `+probe.slice(end);
 }
 probe=probe.replace("if(label==='after'&&kind==='coach'&&n===12)","if(false)");
 // No unrelated 8A interactions; measure the same initial page for both versions.
 probe=probe.replace("if(label==='after'&&kind==='clients'&&n===500)","if(false)");
 probe=probe.replace("includes('50%')","includes('100%')");
 probe=probe.replace('  samples.push(result);', `
  assert(complete!==null,'Full observation did not finish');
  assert.equal(result.http.filter(r=>r.activity==='dashboard-client-programs'&&r.status===200).length,Math.ceil(n/32),'All program batches must finish before cost comparison');
  result.dashboardTiming=await evaluate(cdp,"JSON.parse(document.querySelector('[data-testid=coach-dashboard-timing]').textContent)");
  result.activeCount=await evaluate(cdp,"document.querySelector('[data-active-probe]').getAttribute('data-active-probe')");
  assert.equal(Number(result.activeCount),n,'Exact activity count must match canonical histories');
  assert(primary!==null,'Activity statistic must be confirmed');
  if(label==='after' && n===36){
   const basePath='clients/'+selected.uid+'c0';
   const batch=db.batch();
   batch.delete(db.doc(basePath+'/programmes/p0/sessionsEffectuees/s0'));
   batch.delete(db.doc(basePath+'/programmes/p1/sessionsEffectuees/s0'));
   batch.update(db.doc(basePath),{dashboardProgramRevision:2});await batch.commit();
   await waitFor(cdp,"document.querySelector('[data-active-probe]')?.getAttribute('data-active-probe')==='35'");
   const restored=db.batch();
   for(let p=0;p<2;p++)restored.set(db.doc(basePath+'/programmes/p'+p+'/sessionsEffectuees/s0'),{status:'completed',sessionIndex:0,dateEffectuee:admin.firestore.Timestamp.now()});
   restored.update(db.doc(basePath),{dashboardProgramRevision:3});await restored.commit();
   await waitFor(cdp,"document.querySelector('[data-active-probe]')?.getAttribute('data-active-probe')==='36'");
   result.interactions={remoteDeletion:true,remoteRevalidation:true};
  }
  samples.push(result);`);
 if(delayed)probe=probe.replace("const wrapper=","fs.writeFileSync(dashboardPath,fs.readFileSync(dashboardPath,'utf8').replace('const quickCalendarPromise = (async () => {','const quickCalendarPromise = (async () => { await new Promise(resolve => setTimeout(resolve, 4000));')); const wrapper=");
 if(normalMode){
  probe=probe.replaceAll('/coach-dashboard?dashboardPerf','/coach-dashboard');
  // Observe existing functional state without enabling diagnostic behavior.
  probe=probe.replace(" const wrapper=", "fs.writeFileSync(dashboardPath,fs.readFileSync(dashboardPath,'utf8').replace('{dashboardPerfEnabled && <Box as=\"output\"','{true && <Box as=\"output\"')); const wrapper=");
  probe=probe.replace("  result.activeCount=", "  assert.equal(await evaluate(cdp,'location.search'),'', 'Real normal mode must have no diagnostic query');\n  result.activeCount=");
 }
 fs.writeFileSync(path.join(dir,'scripts/measureDashboardRequestOverlap.cjs'),probe);
 const result=spawnSync('firebase',['emulators:exec','--config','firebase.performance-test.json','--project','demo-byl-performance','--only','auth,firestore','node scripts/measureDashboardRequestOverlap.cjs '+label+' main'],{cwd:dir,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,JAVA_TOOL_OPTIONS:'-Xmx3g',TZ:'Europe/Paris',GCLOUD_PROJECT:'demo-byl-performance',GOOGLE_CLOUD_PROJECT:'demo-byl-performance'},stdio:'inherit',timeout:1200000});
 const output=path.join(dir,'audits/dashboard-request-overlap/'+label+'.json');if(fs.existsSync(output))fs.copyFileSync(output,path.join(root,'audits/dashboard-request-overlap/'+label+(compiled?'-compiled':'-development')+(delayed?'-slow-calendar':'')+(normalMode?'-normal-mode':'')+'.json'));
 if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
