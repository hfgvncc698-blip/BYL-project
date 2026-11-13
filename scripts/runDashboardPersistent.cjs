const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),label=process.argv[2]||'before';
if(!['before','after'].includes(label))throw Error('before or after');
const compiled=process.argv.includes('--compiled');
const delayed=process.argv.includes('--slow-calendar');
const normalMode=process.argv.includes('--normal-mode');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'byl-dashboard-persistent-'));
try{
 execFileSync('tar',['-x','-C',dir],{input:execFileSync('git',['archive','HEAD'],{cwd:root,maxBuffer:150*1024*1024})});
 const files=execFileSync('git',['ls-files','-m','-o','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\n').filter(f=>/^(src|backend|scripts|functions)\//.test(f));
 for(const file of new Set(files)){if(!fs.statSync(path.join(root,file)).isFile())continue;fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(dir,file));}
 for(const name of ['node_modules','backend/node_modules','functions/node_modules'])fs.symlinkSync(path.join(root,name),path.join(dir,name));
 if(label==='before')for(const file of ['coachDashboardBundles.js'])fs.copyFileSync(path.join(root,'audits/dashboard-persistent/before/'+file),path.join(dir,'backend/utils/'+file));
 let probe=fs.readFileSync(path.join(root,'scripts/measureColdLot8A.cjs'),'utf8').replaceAll('audits/lot8a','audits/dashboard-persistent');
 const a=probe.indexOf(" if(label==='before'){"),b=probe.indexOf('\n const wrapper=',a);probe=probe.slice(0,a)+probe.slice(b);
 probe=probe.replace("sessions:[{name:'Session'}]","sessions:[{name:'Session',corps:Array.from({length:8},()=>({name:'Synthetic exercise',charge:10,reps:12,image:(global.syntheticMedia ||= require('node:crypto').randomBytes(24*1024).toString('base64'))}))}]");
 const s=probe.indexOf(' const scenarios='),e=probe.indexOf('\n const fixtures=',s);probe=probe.slice(0,s)+" const scenarios=[['coach',36,40],['coach',36,40]];"+probe.slice(e);

 if(process.argv.includes('--dev-probe'))probe=probe.replace("[['coach',36,40],['coach',36,40]]","[['coach',36,40]]");
 probe=probe.replace("fixtures.push(await seed(kind,n,h))","fixtures.push(fixtures.find(f=>f.kind===kind&&f.n===n&&f.h===h) || await seed(kind,n,h))");
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
  result.outlineDisk=require('../backend/utils/dashboardOutlineDisk').stats();
  result.dashboardTiming=await evaluate(cdp,"JSON.parse(document.querySelector('[data-testid=coach-dashboard-timing]').textContent)");
  result.activeCount=await evaluate(cdp,"document.querySelector('[data-active-probe]').getAttribute('data-active-probe')");
  assert.equal(Number(result.activeCount),n,'Exact activity count must match canonical histories');
  assert(primary!==null,'Activity statistic must be confirmed');
  if(label==='after' && n===36 && samples.length===1){
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

 probe=probe.replace('  selected=fixtures[scenarioIndex];', `  require('../backend/utils/dashboardOutlineCache').clear();\n  selected=fixtures[scenarioIndex];`);
 const adjustmentProbe=`
window.qualifyDashboardAdjustment=async()=>{
 const {db}=await import('./src/firebaseConfig');
 const {doc,getDoc,updateDoc}=await import('firebase/firestore');
 const {dashboardSessionSummary}=await import('./src/utils/dashboardPrescriptionSummary');
 const {writeDashboardAdjustment}=await import('./src/utils/dashboardPrescriptionWrite');
 const clientId=fixture.uid+'c0',ref=doc(db,'clients',clientId,'programmes','p0');
 const before=(await getDoc(ref)).data();
 const expected=dashboardSessionSummary(before.sessions[0]);
 const options={sessionKey:'sessions',index:0,expected,decision:{shouldAdapt:true,direction:-1,intensity:'light'},audit:{fixture:true}};
 await writeDashboardAdjustment(db,ref,options,()=>true);
 const after=(await getDoc(ref)).data();
 if(after.sessions[0].corps[0].charge!==9.5 || after.sessions[0].corps[0].image!==before.sessions[0].corps[0].image)throw Error('Canonical prescription changed incorrectly');
 await updateDoc(ref,{sessions:[{...after.sessions[0],name:'Synthetic changed session'}]});
 let conflict=false;try{await writeDashboardAdjustment(db,ref,options,()=>true);}catch(e){conflict=e.code==='dashboard-program-changed'}
 if(!conflict)throw Error('Stale review was not rejected');
 const token=await auth.currentUser.getIdToken();
 const request=coachId=>fetch('/api/programs/dashboard-client-programs',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({coachId,ids:[clientId],dashboardProjection:1,dashboardOutline:1,transferVersion:2})});
 const updated=await request(fixture.uid);if(!updated.ok)throw Error('Outline refresh refused');
 const data=(await updated.json()).clients[clientId].find(p=>p.id==='p0').data;
 if(data.sessions[0].name!=='Synthetic changed session' || data.sessions[0].corps[0].charge!==9.5)throw Error('Versioned cache returned old prescription');
 const denied=await request('synthetic-foreign-coach');if(denied.status!==403)throw Error('Cached outline bypassed authorization');
 return {canonicalMediaPreserved:true,transactionAdjustment:true,staleReviewRejected:true,versionInvalidation:true,foreignCoachDenied:true};
};`;
 probe=probe.replace(" const express=", " fs.appendFileSync(path.join(tmp,'entry.jsx'),"+JSON.stringify(adjustmentProbe)+");\n const express=");
 probe=probe.replace("result.interactions={remoteDeletion:true,remoteRevalidation:true};", "result.interactions={remoteDeletion:true,remoteRevalidation:true,...await evaluate(cdp,'window.qualifyDashboardAdjustment()')};");
 fs.writeFileSync(path.join(dir,'scripts/measureDashboardOutlines.cjs'),probe);
 const result=spawnSync('firebase',['emulators:exec','--config','firebase.performance-test.json','--project','demo-byl-performance','--only','auth,firestore','node scripts/measureDashboardOutlines.cjs '+label+' main'],{cwd:dir,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,JAVA_TOOL_OPTIONS:'-Xmx3g',TZ:'Europe/Paris',BYL_DASHBOARD_OUTLINE_DIR:path.join(dir,'private-outlines'),BYL_DASHBOARD_OUTLINE_KEY:require('node:crypto').randomBytes(32).toString('hex'),GCLOUD_PROJECT:'demo-byl-performance',GOOGLE_CLOUD_PROJECT:'demo-byl-performance'},stdio:'inherit',timeout:1200000});
 const output=path.join(dir,'audits/dashboard-persistent/'+label+'.json');if(fs.existsSync(output))fs.copyFileSync(output,path.join(root,'audits/dashboard-persistent/'+label+(compiled?'-compiled':'-development')+(delayed?'-slow-calendar':'')+(normalMode?'-normal-mode':'')+'.json'));
 if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
