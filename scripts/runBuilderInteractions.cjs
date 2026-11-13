// Disposable emulator qualification of the actual ProgramBuilder component.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),mode=process.argv[2];
if(!['before','after'].includes(mode))throw Error('Use before or after');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'byl-builder-interactions-'));
try {
 execFileSync('tar',['-x','-C',dir],{input:execFileSync('git',['archive','HEAD'],{cwd:root,maxBuffer:150*1024*1024})});
 const files=execFileSync('git',['ls-files','-m','-o','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(f=>/^(src|backend|scripts)\//.test(f));
 for(const f of files){if(!fs.statSync(path.join(root,f)).isFile())continue;fs.mkdirSync(path.dirname(path.join(dir,f)),{recursive:true});fs.copyFileSync(path.join(root,f),path.join(dir,f));}
 for(const name of ['node_modules','backend/node_modules','functions/node_modules'])fs.symlinkSync(path.join(root,name),path.join(dir,name));
 if(mode==='before')for(const f of ['src/components/ProgramBuilder.jsx','src/components/ProgramBuilderPage.jsx','src/hooks/useSessionDraft.js'])fs.copyFileSync(path.join(root,'audits/builder-interactions/before',path.basename(f)),path.join(dir,f));
 for(const [source,dest] of [['src/firebaseConfig.js','fixtures-legacy-firebase.js'],['src/utils/dashboardSnapshotCache.js','fixtures-legacy-snapshot.js']])fs.writeFileSync(path.join(dir,dest),execFileSync('git',['show','5bdcd1b:'+source],{cwd:root}));
 const builder=path.join(dir,'src/components/ProgramBuilder.jsx');
 fs.writeFileSync(builder,fs.readFileSync(builder,'utf8').replace('    const displayWeight =','    window.__rowRenders=(window.__rowRenders||0)+1;\n    const displayWeight ='));
 const fixture=path.join(dir,'scripts/fixtures/lot7b1quater/builder.jsx');
 let f=fs.readFileSync(fixture,'utf8');
 f=f.replace('function Gate(){const {user}=useAuth();return user?<Builder/>:<p>Session fermée</p>;}',`function Gate(){const {user}=useAuth();const [selected,setSelected]=React.useState([]);const [replace,setReplace]=React.useState(null);
 React.useEffect(()=>{window.builderSelect=(rows,index=null)=>{setReplace(index);setSelected(rows);};},[]);
 return user?<Builder selectedExercises={selected} setSelectedExercises={setSelected} replaceIndex={replace} setReplaceIndex={setReplace}/>:<p>Session fermée</p>;}`);
 fs.writeFileSync(fixture,f);
 let test=fs.readFileSync(path.join(root,'scripts/testIntegratedDraftLot7B1Quater.cjs'),'utf8');
 const start=test.indexOf(" let port=await start();");
 const end=test.indexOf(" const ev=x=>evaluate(cdp,x);",start);
 test=test.slice(0,start)+" let port=await start();await cdp.send('Page.navigate',{url});await waitFor(cdp,'!!window.q');\n"+test.slice(end);
 const a=test.indexOf(" const saved=await request('read',token,{target});");
 test=test.slice(0,a)+fs.readFileSync(path.join(root,process.argv.includes('--multi')?'scripts/fixtures/builderMultiSessionChecks.txt':'scripts/fixtures/builderInteractionsChecks.txt'),'utf8')+'\n}\n'+test.slice(test.indexOf('run().catch('));
 if(process.argv.includes('--regression'))test=fs.readFileSync(path.join(root,'scripts/testIntegratedDraftLot7B1Quater.cjs'),'utf8');
 fs.writeFileSync(path.join(dir,'scripts/testBuilderInteractions.cjs'),test);
 const result=spawnSync('firebase',['emulators:exec','--config','firebase.performance-test.json','--project','demo-byl-performance','--only','auth,firestore','node scripts/testBuilderInteractions.cjs'],{cwd:dir,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,TZ:'Europe/Paris',GCLOUD_PROJECT:'demo-byl-performance',GOOGLE_CLOUD_PROJECT:'demo-byl-performance',BUILDER_RESULT:path.join(root,'audits/builder-interactions',mode+(process.argv.includes('--multi')?'-multi':'')+'.json')},stdio:'inherit',timeout:360000});
 if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
