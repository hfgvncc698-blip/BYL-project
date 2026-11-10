// Run under Auth + Firestore emulators. Every browser profile is disposable.
const {db,prepareAuth,accounts,projectId} = require('./measureFirebaseLot1.cjs');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawn} = require('node:child_process'), {once} = require('node:events');
const assert = require('node:assert/strict');

async function main() {
  await prepareAuth();
  await db.doc('users/coach').set({role:'particulier',linkedClientId:'private'});
  await db.doc('users/owner').set({role:'particulier'});
  await db.doc('clients/private').set({authUid:'coach'});
  await db.doc('clients/private/programmes/p').set({name:'synthetic-private'});
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'byl-shared-browser-'));
  fs.symlinkSync(path.resolve('node_modules'),path.join(tmp,'node_modules'));
  fs.mkdirSync(path.join(tmp,'utils'));
  for (const name of ['persistedPageCache','dashboardSnapshotCache']) {
    fs.copyFileSync('src/utils/'+name+'.js',path.join(tmp,'utils',name+'.js'));
  }
  // Preserve actual application cache initialization; substitute only demo project credentials.
  const config=fs.readFileSync('src/firebaseConfig.js','utf8');
  assert.match(config,/const firebaseConfig = \{[\s\S]*?\n\};/);
  fs.writeFileSync(path.join(tmp,'firebaseConfig.js'),config.replace(/const firebaseConfig = \{[\s\S]*?\n\};/,
    'const firebaseConfig = '+JSON.stringify({apiKey:'demo',appId:'demo',projectId})+';'));
  fs.writeFileSync(path.join(tmp,'index.html'),'<script type="module" src="/entry.js"></script>');
  fs.copyFileSync(path.join(__dirname,'fixtures/sharedBrowserLot7B1.js'),path.join(tmp,'entry.js'));
  let current, finish;
  const vite = await (await import('vite')).createServer({root:tmp,configFile:false,envDir:false,
    server:{host:'127.0.0.1',port:0},logLevel:'error',plugins:[{name:'local-fixture',configureServer(server){
      server.middlewares.use((req,res,next)=>{
        if(req.url==='/fixture'){
          res.setHeader('Content-Type','application/json');
          res.end(JSON.stringify({second:accounts.owner,account:accounts[current==='seed'?'coach':'owner'],stage:current,
            fsHost:process.env.FIRESTORE_EMULATOR_HOST,authHost:process.env.FIREBASE_AUTH_EMULATOR_HOST}));
        }else if(req.url==='/result' && req.method==='POST'){
          let body='';req.on('data',part=>body+=part);req.on('end',()=>{res.end();finish(JSON.parse(body));});
        }else next();
      });
    }}]});
  try {
    await vite.listen();
    const url='http://127.0.0.1:'+vite.httpServer.address().port;
    async function visit(profile,stage) {
      current=stage;
      let timer;
      const result=new Promise((resolve,reject)=>{
        finish=resolve;
        timer=setTimeout(()=>reject(Error('Timed out: '+stage)),75000);
      });
      const child=spawn(process.env.BYL_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        ['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--disable-sync',
          '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
          '--no-proxy-server','--disable-popup-blocking','--user-data-dir='+path.join(tmp,profile),url],{stdio:'ignore'});
      const closed=once(child,'exit');
      try {
        const value=await Promise.race([result,closed.then(()=>{throw Error('Browser exited early');})]);
        assert.ok(!value.error,JSON.stringify(value));
        return value;
      } finally {clearTimeout(timer);if(child.exitCode===null)child.kill();await closed;}
    }
    const seed=await visit('shared','seed'); assert.equal(seed.loaded,true);
    const shared=await visit('shared','reopen');
    const independent=await visit('isolated','separate');
    console.log(JSON.stringify({seed,shared,independent}));
    assert.equal(shared.serverDenied,true);assert.equal(independent.serverDenied,true);
    assert.equal(independent.cacheReadable,false);
    assert.equal(independent.snapshotReadable,false);
    assert.deepEqual([seed.samePageReadable,seed.peerReadable,shared.cacheReadable,shared.snapshotReadable],
      [false,false,false,false], 'Private data accessible to the second account');
  } finally {await vite.close();await db.terminate();fs.rmSync(tmp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
