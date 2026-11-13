// Build and extract the exact backend archive recipe used by deploy.sh.
// No SSH, deployment, credentials, or production services are involved.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'byl-backend-package-'));
const artifact=path.join(temporary,'release'),stage=path.join(temporary,'stage'),archive=path.join(temporary,'backend.tgz');
const recipe=fs.readFileSync(path.join(root,'deploy.sh'),'utf8');
const start=recipe.indexOf('rm -rf "${BACKEND_STAGE}"',recipe.indexOf('echo "Archive backend'));
const end=recipe.indexOf('echo "Preparation du script distant',start);
assert(start>0&&end>start,'Deployment archive recipe not found');
const smoke=`
const assert=require('node:assert/strict');
const {readDashboardBundles}=require('./utils/coachDashboardBundles');
const disk=require('./utils/dashboardOutlineDisk');
let fullReads=0;
const program={id:'p',updateTime:{seconds:1,nanoseconds:0},data:()=>({name:'Synthetic',sessions:[{name:'Session',corps:[{name:'Exercise',charge:10,image:'X'.repeat(100000)}]}]})};
const programs={path:'clients/c/programmes',firestore:{projectId:'demo-byl-performance'},select(){return {...this,metadata:true}}};
program.ref={...programs,path:programs.path+'/p',collection:()=>({history:true,select(){return this}})};
const tx={async get(ref){if(ref.history)return {docs:[{id:'s',data:()=>({status:'completed',sessionIndex:0})}]};if(ref.path===programs.path){if(!ref.metadata)fullReads++;return {docs:[ref.metadata?{...program,data:()=>({})}:program]};}fullReads++;return program;}};
(async()=>{const result=await readDashboardBundles(tx,[{id:'c',collection:()=>programs}],{dashboard:true,outline:true});assert.equal(result.c[0].data.sessions[0].corps[0].charge,10);assert.equal(result.c[0].data.sessions[0].corps[0].image,undefined);assert.equal(result.c[0].history[0].data.status,'completed');console.log(JSON.stringify({fullReads,disk:disk.stats()}));})().catch(e=>{console.error(e);process.exitCode=1});`;
function run(extra={}){return JSON.parse(execFileSync(process.execPath,['-e',smoke],{cwd:artifact,env:{...process.env,NODE_PATH:'',BYL_DASHBOARD_OUTLINE_DIR:'',BYL_DASHBOARD_OUTLINE_KEY:'',...extra},encoding:'utf8',stdio:'pipe'}));}
try{
 execFileSync('bash',['-euo','pipefail','-c',recipe.slice(start,end)],{cwd:root,env:{...process.env,BACKEND_STAGE:stage,BACKEND_ARCHIVE:archive},stdio:'pipe'});
 fs.mkdirSync(artifact);execFileSync('tar',['-xzf',archive,'-C',artifact]);
 for(const file of ['.env','serviceAccountKey.json','firebase-service-account.json','node_modules'])assert(!fs.existsSync(path.join(artifact,file)),file+' must not be archived');
 assert(!fs.existsSync(path.join(temporary,'src')),'No frontend source may be available');
 assert(fs.existsSync(path.join(artifact,'utils/dashboardPrescriptionSummary.mjs')));
 const before=fs.readFileSync(path.join(artifact,'utils/dashboardOutlineDisk.js'),'utf8');
 fs.writeFileSync(path.join(artifact,'utils/dashboardOutlineDisk.js'),before.replace("'dashboardPrescriptionSummary.mjs'","'../../src/utils/dashboardPrescriptionSummary.js'"));
 let rejected=false;try{run();}catch(e){rejected=String(e.stderr).includes('ENOENT');}finally{fs.writeFileSync(path.join(artifact,'utils/dashboardOutlineDisk.js'),before);}
 assert(rejected,'Negative control must catch the original missing-source regression');
 const bundlePath=path.join(artifact,'utils/coachDashboardBundles.js');
 const bundle=fs.readFileSync(bundlePath,'utf8');
 fs.writeFileSync(bundlePath,bundle.replace('./dashboardPrescriptionSummary.mjs','../../src/utils/dashboardPrescriptionSummary.js'));
 rejected=false;try{run();}catch(e){rejected=String(e.stderr).includes('ERR_MODULE_NOT_FOUND');}finally{fs.writeFileSync(bundlePath,bundle);}
 assert(rejected,'Negative control must catch the missing dynamic summary import');
 const disabled=run();assert.equal(disabled.fullReads,1);assert.equal(disabled.disk.enabled,false);
 const options={BYL_DASHBOARD_OUTLINE_DIR:path.join(temporary,'cache'),BYL_DASHBOARD_OUTLINE_KEY:require('node:crypto').randomBytes(32).toString('hex')};
 assert.equal(run(options).fullReads,1);assert.equal(run(options).fullReads,0);
 console.log('PASS exact deployment archive: missing-source negative control; disabled cache; fresh summaries; restart with disk cache; canonical history; no frontend dependency.');
 if(process.argv.includes('--emulators')){
  // An installed-dependency copy is offline and checked against the archive lock.
  // Default CI mode performs a clean offline npm ci instead.
  if(process.argv.includes('--installed-dependencies')){
    const lock=JSON.parse(fs.readFileSync(path.join(artifact,'package-lock.json'),'utf8'));
    for(const [name,entry] of Object.entries(lock.packages))if(name.startsWith('node_modules/')){
      const manifest=path.join(root,'backend',name,'package.json');
      if(!fs.existsSync(manifest) && entry.optional)continue;
      assert.equal(JSON.parse(fs.readFileSync(manifest,'utf8')).version,entry.version,'Installed version differs: '+name);
    }
    fs.cpSync(path.join(root,'backend/node_modules'),path.join(artifact,'node_modules'),{recursive:true,dereference:true});
  }else execFileSync('npm',['ci','--omit=dev','--ignore-scripts','--offline','--no-audit'],{cwd:artifact,stdio:'pipe'});
  execFileSync(process.execPath,[path.join(root,'scripts/testDashboardPersistentEmulator.cjs')],{cwd:root,env:{...process.env,BYL_PACKAGED_BACKEND:artifact},stdio:'inherit'});
 }
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
