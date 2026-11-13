const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),label=process.argv[2]||'before';
if(!['before','after'].includes(label))throw Error('before or after');
const compiled=process.argv.includes('--compiled');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'byl-coach-calendar-loading-'));
try{
 execFileSync('tar',['-x','-C',dir],{input:execFileSync('git',['archive','HEAD'],{cwd:root,maxBuffer:150*1024*1024})});
 const files=execFileSync('git',['ls-files','-m','-o','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\n').filter(f=>/^(src|backend|scripts|functions)\//.test(f));
 for(const file of new Set(files)){if(!fs.statSync(path.join(root,file)).isFile())continue;fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(dir,file));}
 for(const name of ['node_modules','backend/node_modules','functions/node_modules'])fs.symlinkSync(path.join(root,name),path.join(dir,name));
 if(label==='before')for(const [file,target] of [['CoachDashboard.jsx','src/components/CoachDashboard.jsx'],['coachPageSource.js','src/utils/coachPageSource.js']])fs.copyFileSync(path.join(root,'audits/coach-calendar-loading/before/'+file),path.join(dir,target));
 let probe=fs.readFileSync(path.join(root,'scripts/measureColdLot8A.cjs'),'utf8').replaceAll('audits/lot8a','audits/coach-calendar-loading');
 const a=probe.indexOf(" if(label==='before'){"),b=probe.indexOf('\n const wrapper=',a);probe=probe.slice(0,a)+probe.slice(b);
 const s=probe.indexOf(' const scenarios='),e=probe.indexOf('\n const fixtures=',s);probe=probe.slice(0,s)+" const scenarios=[['coach',12,40],['coach',100,1000],['coach',500,5000]];"+probe.slice(e);

 probe=probe.replace("state.ready&&state.useful&&!calendarScrolled","state.ready&&!calendarScrolled");
 probe=probe.replace("const heading=[...document.querySelectorAll('h2,h3')].find(e=>e.textContent.includes('Calendrier'))", "const heading=document.getElementById('coach-calendar-card')");
 probe=probe.replace('for(let i=0;i<40;i++)','for(let i=0;i<h;i++)');
 probe=probe.replace('Date.now()-i*7*86400000','Date.now()-i*86400000');
 if(compiled){
  probe=probe.replace(" const wrapper=",` const dashboardPath=path.join(tmp,'src/components/CoachDashboard.jsx');fs.writeFileSync(dashboardPath,fs.readFileSync(dashboardPath,'utf8').replace('import.meta.env.DEV && new URLSearchParams(location.search).has("dashboardPerf")','new URLSearchParams(location.search).has("dashboardPerf")'));
 const timingPath=path.join(tmp,'src/hooks/usePageLoading.js');fs.writeFileSync(timingPath,fs.readFileSync(timingPath,'utf8').replace('import.meta.env.DEV && ',''));
 const wrapper=`);
  const start=probe.indexOf(" vite=await(await import('vite')).createServer("),end=probe.indexOf("\n const base=",start);
  if(start<0||end<0)throw Error('build anchor');
  probe=probe.slice(0,start)+`
 const buildConfig=(await import(require('node:url').pathToFileURL(path.resolve('vite.config.js')).href)).default;
 await(await import('vite')).build({...buildConfig,root:tmp,configFile:false,envDir:false,logLevel:'error',define:{'import.meta.env.VITE_BYL_FIRESTORE_METRICS':'"1"'},plugins:[...buildConfig.plugins,{name:'sdk-probe',enforce:'pre',resolveId(id,importer){if(id==='firebase/firestore'&&importer!==wrapper)return wrapper;}}],build:{...buildConfig.build,target:'esnext',outDir:path.join(tmp,'dist'),emptyOutDir:true}});
 app.use(express.static(path.join(tmp,'dist')));app.use((_req,res)=>res.sendFile(path.join(tmp,'dist/index.html')));
 const httpServer=app.listen(0,'127.0.0.1');await once(httpServer,'listening');vite={httpServer,close:async()=>{httpServer.closeAllConnections();await new Promise(r=>httpServer.close(r));}};
 `+probe.slice(end);
 }
 // No unrelated 8A interactions; measure the same initial page for both versions.
 probe=probe.replace("if(label==='after'&&kind==='clients'&&n===500)","if(false)");
 probe=probe.replace("includes('50%')","includes('100%')");
 probe=probe.replace('  samples.push(result);', `
  result.calendarTiming=await evaluate(cdp,"JSON.parse(document.querySelector('[data-testid=coach-dashboard-timing]').textContent)");
  if(label==='after' && n===500){
   const reads=await evaluate(cdp,'window.coldFirestoreMetrics.sdkCalls');
   const labelBefore=await evaluate(cdp,"document.querySelector('.rbc-toolbar-label').textContent");
   await evaluate(cdp,"[...document.querySelectorAll('.rbc-toolbar button')].find(b=>b.textContent.startsWith('Préc')).click()");
   await waitFor(cdp,"document.querySelector('.rbc-toolbar-label').textContent!=="+JSON.stringify(labelBefore));
   assert(await evaluate(cdp,"document.querySelectorAll('.rbc-event').length>0"));
   await evaluate(cdp,"[...document.querySelectorAll('.rbc-toolbar button')].find(b=>b.textContent.startsWith('Aujourd')).click()");
   await waitFor(cdp,"document.querySelector('.rbc-toolbar-label').textContent==="+JSON.stringify(labelBefore));
   assert.equal(await evaluate(cdp,'window.coldFirestoreMetrics.sdkCalls'),reads);
   await db.doc('sessions/'+selected.uid+'e0').update({title:'Synthetic remote calendar',sessionTitle:'Synthetic remote calendar'});
   await waitFor(cdp,"[...document.querySelectorAll('.rbc-event')].some(e=>e.textContent.includes('Synthetic remote calendar'))");
   await evaluate(cdp,"[...document.querySelectorAll('.rbc-event')].find(e=>e.textContent.includes('Synthetic remote calendar')).click()");
   await waitFor(cdp,"!!document.querySelector('[role=dialog]')");
   result.interactions={previousWeek:true,returnToToday:true,navigationExtraSdkCalls:0,remoteEvent:true,eventDetails:true};
  }
  samples.push(result);`);
 fs.writeFileSync(path.join(dir,'scripts/measureCoachCalendarLoading.cjs'),probe);
 const result=spawnSync('firebase',['emulators:exec','--config','firebase.performance-test.json','--project','demo-byl-performance','--only','auth,firestore','node scripts/measureCoachCalendarLoading.cjs '+label+' calendar'],{cwd:dir,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,JAVA_TOOL_OPTIONS:'-Xmx3g',TZ:'Europe/Paris',GCLOUD_PROJECT:'demo-byl-performance',GOOGLE_CLOUD_PROJECT:'demo-byl-performance'},stdio:'inherit',timeout:1200000});
 const output=path.join(dir,'audits/coach-calendar-loading/'+label+'-calendar.json');if(fs.existsSync(output))fs.copyFileSync(output,path.join(root,'audits/coach-calendar-loading/'+label+(compiled?'-compiled':'')+'.json'));
 if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
