// React browser qualification with synthetic failures; no Firebase or private data.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'byl-mobile-start-'));let chrome,server,ws;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.symlinkSync(path.resolve('node_modules'),path.join(tmp,'node_modules'));
 fs.copyFileSync('src/utils/resilientLazy.jsx',path.join(tmp,'resilientLazy.jsx'));
 fs.writeFileSync(path.join(tmp,'index.html'),'<div id="root"></div><script type="module" src="/entry.jsx"></script>');
 fs.writeFileSync(path.join(tmp,'entry.jsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import {resilientLazy} from './resilientLazy.jsx';
const mode=new URLSearchParams(location.search).get('mode');let attempts=0;
class RootBoundary extends React.Component{state={error:false};static getDerivedStateFromError(){return {error:true}}render(){return this.state.error?<p data-root-error>Page failed</p>:this.props.children}}
const loader=async()=>{attempts++;document.documentElement.dataset.attempts=attempts;if(mode==='business')throw Error('Synthetic rendering initialization failure');if(mode==='permanent'||attempts===1)throw new TypeError('Importing a module script failed.');return {default:()=> <p data-content>Ready</p>}};
const Child=mode==='before'?React.lazy(loader):resilientLazy(loader);
const Page=resilientLazy(async()=>({default:()=> <><p data-shell>Shell</p><React.Suspense fallback={<p>Loading</p>}><Child/></React.Suspense></>}));
createRoot(document.getElementById('root')).render(<RootBoundary><React.Suspense fallback={null}><Page/></React.Suspense></RootBoundary>);`);
 server=await(await import('vite')).createServer({root:tmp,configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0}});await server.listen();
 chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+path.join(tmp,'profile'),'about:blank'],{stdio:'ignore'});
 for(let i=0;i<100&&!fs.existsSync(path.join(tmp,'profile/DevToolsActivePort'));i++)await wait(100);
 const port=fs.readFileSync(path.join(tmp,'profile/DevToolsActivePort'),'utf8').split('\n')[0];const targets=await(await fetch('http://127.0.0.1:'+port+'/json')).json();
 ws=new WebSocket(targets[0].webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let id=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(!m.id)return;const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Timeout '+method))},10000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
 await send('Page.enable');await send('Network.enable');await send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:750000,uploadThroughput:250000});await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setCPUThrottlingRate',{rate:4});
 const results=[];
 for(const mode of ['before','after','permanent','business']){
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.httpServer.address().port+'/?mode='+mode});let result;
  for(let i=0;i<100;i++){await wait(100);const r=await send('Runtime.evaluate',{expression:`({shell:!!document.querySelector('[data-shell]'),root:!!document.querySelector('[data-root-error]'),ready:!!document.querySelector('[data-content]'),local:!!document.querySelector('[data-module-unavailable]'),attempts:Number(document.documentElement.dataset.attempts||0)})`,returnByValue:true});result=r.result.value;if(result?.root||result?.ready||result?.local)break;}
  if(mode==='before'||mode==='business')assert(result.root);
  if(mode==='after'){assert(result.ready&&result.shell&&!result.root);assert.equal(result.attempts,2);}
  if(mode==='permanent'){assert(result.local&&result.shell&&!result.root);assert.equal(result.attempts,2);}
  results.push({mode,...result});
 }
 const report={passed:true,browser:'Chrome mobile emulation; Safari error text injected, not an iPhone test',width:390,cpu:4,latencyMs:150,results};
 fs.mkdirSync('audits/mobile-startup',{recursive:true});fs.writeFileSync('audits/mobile-startup/module-recovery.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{ws?.close();if(chrome){chrome.kill();await new Promise(r=>chrome.exitCode!==null?r():chrome.once('exit',r));}await server?.close();fs.rmSync(tmp,{recursive:true,force:true});});
