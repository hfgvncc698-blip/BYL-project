// Reproducible tests with no application .env, external credentials or real data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync,spawnSync} = require('node:child_process');

const root = path.resolve(__dirname,'..');
const [scenario='profile',version='current'] = process.argv.slice(2);
const commands = {
  profile:'node scripts/testClubBoundariesLot7B1.cjs profile',
  session:'node scripts/testClubBoundariesLot7B1.cjs session',
  auth:'node scripts/testMessagingLot2B2.cjs',
  cache:'node scripts/testSharedBrowserLot7B1.cjs',
};
if (!commands[scenario] || !['current','reference'].includes(version)) throw Error('Expected profile|session|auth|cache and current|reference');
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'byl-security7b1-'));
try {
  const ref=version==='reference'?'e476b0a4cfcd6bb9e27515c69a5416325e480f6e':'HEAD';
  execFileSync('tar',['-x','-C',dir],{input:execFileSync('git',['archive',ref],{cwd:root,maxBuffer:150*1024*1024})});
  const applicationFiles = [
    'firestore.rules','backend/routes/clubs.js','backend/utils/batchedFieldReads.js',
    'backend/utils/clubAppointmentSession.js','backend/utils/clubCalendarPeriod.js',
    'scripts/messagingRevocation.cjs','scripts/measureFirebaseLot1.cjs',
  ];
  const testFiles = ['scripts/testClubBoundariesLot7B1.cjs','scripts/testSharedBrowserLot7B1.cjs',
    'scripts/fixtures/sharedBrowserLot7B1.js','scripts/testMessagingLot2B2.cjs','scripts/testFirestoreRules.cjs'];
  for (const file of [...testFiles,...(version==='current'?applicationFiles:[])]) {
    fs.copyFileSync(path.join(root,file),path.join(dir,file));
  }
  for (const name of ['node_modules','backend/node_modules','functions/node_modules']) {
    fs.symlinkSync(path.join(root,name),path.join(dir,name));
  }
  const env = {PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,
    TZ:'Europe/Paris',GCLOUD_PROJECT:'demo-byl-performance',GOOGLE_CLOUD_PROJECT:'demo-byl-performance'};
  const result=spawnSync('firebase',['emulators:exec','--config','firebase.performance-test.json',
    '--project','demo-byl-performance','--only','auth,firestore',commands[scenario]],
    {cwd:dir,env,stdio:'inherit',timeout:240000});
  if (result.error) throw result.error;
  process.exitCode=result.status ?? 1;
} finally {
  fs.rmSync(dir,{recursive:true,force:true});
}
