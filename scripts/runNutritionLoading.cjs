const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),label=process.argv[2]||'before';
if(!['before','after'].includes(label))throw Error('before or after');
const compiled=process.argv.includes('--compiled');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'byl-nutrition-loading-'));
try{
 execFileSync('tar',['-x','-C',dir],{input:execFileSync('git',['archive','HEAD'],{cwd:root,maxBuffer:150*1024*1024})});
 const files=execFileSync('git',['ls-files','-m','-o','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\n').filter(f=>/^(src|backend|scripts|functions)\//.test(f));
 for(const file of new Set(files)){if(!fs.statSync(path.join(root,file)).isFile())continue;fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(dir,file));}
 for(const name of ['node_modules','backend/node_modules','functions/node_modules'])fs.symlinkSync(path.join(root,name),path.join(dir,name));
 if(label==='before')fs.copyFileSync(path.join(root,'audits/nutrition-loading/before/CoachNutritionPage.jsx'),path.join(dir,'src/pages/CoachNutritionPage.jsx'));
 if(label==='before')fs.copyFileSync(path.join(root,'audits/nutrition-loading/before/coachProgramRead.js'),path.join(dir,'backend/routes/coachProgramRead.js'));
 let probe=fs.readFileSync(path.join(root,'scripts/measureColdLot8A.cjs'),'utf8').replaceAll('audits/lot8a','audits/nutrition-loading');
 const a=probe.indexOf(" if(label==='before'){"),b=probe.indexOf('\n const wrapper=',a);probe=probe.slice(0,a)+probe.slice(b);
 const s=probe.indexOf(' const scenarios='),e=probe.indexOf('\n const fixtures=',s);probe=probe.slice(0,s)+" const scenarios=[['nutrition',12,2],['nutrition',100,2],['nutrition',500,2]];"+probe.slice(e);

 probe=probe.replace("selected.route=kind==='clients'?", "selected.route=kind==='nutrition'?'/nutrition-coach?pagePerf':kind==='clients'?");
 probe=probe.replace("  if(kind==='messages')", `  if(kind==='nutrition')for(let j=0;j<h;j++)await put('clients/'+id+'/nutrition_assessments/a'+j,{inputs:{prenom:'Synthetic',nom:String(i).padStart(4,'0'),objectif:'Synthetic objective '+j},createdAt:now,updatedAt:now,status:j?'final':'draft',ration:j?null:{notes:'Synthetic food '.repeat(1000)},clientShare:{enabled:j===1,sections:{ration:true}}});
  if(kind==='messages')`);
 if(compiled){
  probe=probe.replace(" const wrapper=",` const timingPath=path.join(tmp,'src/hooks/usePageLoading.js');fs.writeFileSync(timingPath,fs.readFileSync(timingPath,'utf8').replace('import.meta.env.DEV && ',''));
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
  if(label==='after'){
   assert.equal(await evaluate(cdp,"document.querySelector('[data-tour=nutrition-stats]').innerText.includes('"+(n*2)+"')"),true);
  }
  if(label==='after' && n===500){
   const reads=await evaluate(cdp,'window.coldFirestoreMetrics.sdkCalls');
   assert.equal(await evaluate(cdp,"document.querySelectorAll('tbody tr').length"),25);
   await evaluate(cdp,"document.querySelector('[data-testid=nutrition-next]').click()");
   await waitFor(cdp,"document.querySelector('[data-testid=nutrition-page]')?.textContent==='2 / 40'");
   await evaluate(cdp,\`(()=>{const el=document.querySelector('[data-tour=nutrition-bilans] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'0499');el.dispatchEvent(new Event('input',{bubbles:true}));})()\`);
   await waitFor(cdp,"document.querySelectorAll('tbody tr').length===2");
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:500,height:900,deviceScaleFactor:1,mobile:false});
   await waitFor(cdp,"!document.querySelector('tbody') && document.body.innerText.includes('0499')");
   assert.equal(await evaluate(cdp,'window.coldFirestoreMetrics.sdkCalls'),reads);
   result.interactions={pagination:true,searchOutsideFirstPage:true,mobile:true,extraSdkReads:0};
  }
  samples.push(result);`);
 fs.writeFileSync(path.join(dir,'scripts/measureNutritionLoading.cjs'),probe);
 const result=spawnSync('firebase',['emulators:exec','--config','firebase.performance-test.json','--project','demo-byl-performance','--only','auth,firestore',(process.argv.includes('--security-only')?'node scripts/testNutritionList.cjs':'node scripts/measureNutritionLoading.cjs '+label+(label==='after'?' && node scripts/testNutritionList.cjs':''))],{cwd:dir,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,JAVA_TOOL_OPTIONS:'-Xmx3g',TZ:'Europe/Paris',GCLOUD_PROJECT:'demo-byl-performance',GOOGLE_CLOUD_PROJECT:'demo-byl-performance'},stdio:'inherit',timeout:1200000});
 const output=path.join(dir,'audits/nutrition-loading/'+label+'.json');if(fs.existsSync(output))fs.copyFileSync(output,path.join(root,'audits/nutrition-loading/'+label+(compiled?'-compiled':'')+'.json'));
 if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
