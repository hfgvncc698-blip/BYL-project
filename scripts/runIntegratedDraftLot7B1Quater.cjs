const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'byl-ter-'));
try{
 execFileSync('tar',['-x','-C',dir],{input:execFileSync('git',['archive','HEAD'],{cwd:root,maxBuffer:150*1024*1024})});
 for(const file of [...execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean),'src/utils/clientVisibleMetrics.js','src/utils/resilientLazy.jsx','backend/routes/programDrafts.js','backend/utils/programDraftAccess.js','backend/routes/cacheMigration.js','src/utils/cacheMigration.js','src/components/privacy/CacheMigrationNotice.jsx','src/utils/privateSession.js','src/utils/privateStorage.js','src/utils/programFingerprint.js','src/hooks/useProgramDraft.js','scripts/testProgramDraftsQuater.cjs','scripts/testIntegratedDraftLot7B1Quater.cjs','scripts/fixtures/lot7b1quater/builder.jsx']){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(dir,file));}
 for(const name of ['node_modules','backend/node_modules','functions/node_modules'])fs.symlinkSync(path.join(root,name),path.join(dir,name));
 for(const [source,dest] of [['src/firebaseConfig.js','fixtures-legacy-firebase.js'],['src/utils/dashboardSnapshotCache.js','fixtures-legacy-snapshot.js']])fs.writeFileSync(path.join(dir,dest),execFileSync('git',['show','5bdcd1b:'+source],{cwd:root}));
 const result=spawnSync('firebase',['emulators:exec','--config','firebase.performance-test.json','--project','demo-byl-performance','--only','auth,firestore',process.argv[2]==='api'?'node scripts/testProgramDraftsQuater.cjs':'node scripts/testIntegratedDraftLot7B1Quater.cjs'],{cwd:dir,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,TZ:'Europe/Paris',GCLOUD_PROJECT:'demo-byl-performance',GOOGLE_CLOUD_PROJECT:'demo-byl-performance'},stdio:'inherit',timeout:240000});
 if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
