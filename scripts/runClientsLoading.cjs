const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),label=process.argv[2]||'before';
if(!['before','after'].includes(label))throw Error('before or after');
const compiled=process.argv.includes('--compiled');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'byl-clients-loading-'));
try{
 execFileSync('tar',['-x','-C',dir],{input:execFileSync('git',['archive','HEAD'],{cwd:root,maxBuffer:150*1024*1024})});
 const files=execFileSync('git',['ls-files','-m','-o','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\n').filter(f=>/^(src|backend|scripts|functions)\//.test(f));
 for(const file of new Set(files)){if(!fs.statSync(path.join(root,file)).isFile())continue;fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(dir,file));}
 for(const name of ['node_modules','backend/node_modules','functions/node_modules'])fs.symlinkSync(path.join(root,name),path.join(dir,name));
 if(label==='before')fs.copyFileSync(path.join(root,'audits/clients-loading/before/coachClientListSummary.js'),path.join(dir,'backend/utils/coachClientListSummary.js'));
 if(label==='before')fs.copyFileSync(path.join(root,'audits/clients-loading/before/Clients.jsx'),path.join(dir,'src/components/Clients.jsx'));
 let probe=fs.readFileSync(path.join(root,'scripts/measureColdLot8A.cjs'),'utf8').replaceAll('audits/lot8a','audits/clients-loading');
 const a=probe.indexOf(" if(label==='before'){"),b=probe.indexOf('\n const wrapper=',a);probe=probe.slice(0,a)+probe.slice(b);
 const s=probe.indexOf(' const scenarios='),e=probe.indexOf('\n const fixtures=',s);probe=probe.slice(0,s)+" const scenarios=[['clients',36],['clients',100],['clients',500]];"+probe.slice(e);
 probe=probe.replace('for(let j=0;j<2;j++)','for(let j=0;j<(i===0?20:2);j++)');
 probe=probe.replace("await put(p+'/sessionsEffectuees/s0',{status:'completed',sessionIndex:0,dateEffectuee:now});","for(let k=0;k<10;k++)await put(p+'/sessionsEffectuees/s'+k,{status:'completed',sessionIndex:0,dateEffectuee:now});");
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
 probe=probe.replace("if(label==='after'&&kind==='clients'&&n===500)",compiled?"if(label==='after'&&kind==='clients'&&n===500)":"if(false)");
 probe=probe.replace("includes('50%')","includes('100%')");
 fs.writeFileSync(path.join(dir,'scripts/measureClientsLoading.cjs'),probe);
 const result=spawnSync('firebase',['emulators:exec','--config','firebase.performance-test.json','--project','demo-byl-performance','--only','auth,firestore','node scripts/measureClientsLoading.cjs '+label+(compiled && label==='after'?' && node scripts/testCoachPagesLot4.cjs':'')],{cwd:dir,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,JAVA_TOOL_OPTIONS:'-Xmx3g',TZ:'Europe/Paris',GCLOUD_PROJECT:'demo-byl-performance',GOOGLE_CLOUD_PROJECT:'demo-byl-performance'},stdio:'inherit',timeout:1200000});
 const output=path.join(dir,'audits/clients-loading/'+label+'.json');if(fs.existsSync(output))fs.copyFileSync(output,path.join(root,'audits/clients-loading/'+label+(compiled?'-compiled':'')+'.json'));
 if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
