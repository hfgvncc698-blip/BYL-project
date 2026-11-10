// Observe sizes only. No request URLs, headers, query strings, bodies or tokens
// are retained. Open Firestore WebChannels and completed transfers are separate.
const fs=require('node:fs'),path=require('node:path');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async function connect(profile,origin){
  const file=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<150 && !fs.existsSync(file);i++)await wait(100);
  const [port]=fs.readFileSync(file,'utf8').trim().split(/\r?\n/);
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let seq=0,counts={};const pending=new Map(),requests=new Map();
  function send(method,params={},sessionId){
    return new Promise((resolve,reject)=>{
      const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,sessionId}));
    });
  }
  function group(raw){
    const u=new URL(raw);
    if(u.host===process.env.FIRESTORE_EMULATOR_HOST)return 'firestore';
    if(u.origin!==origin || !u.pathname.startsWith('/api/'))return null;
    if(u.pathname.startsWith('/api/coach-offers'))return 'offers';
    if(u.pathname.startsWith('/api/messaging'))return 'messaging';
    if(u.pathname.startsWith('/api/programs/'))return 'programs';
    return 'otherApi';
  }

    socket.onmessage=e=>{
      const m=JSON.parse(e.data);
      if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p){if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);}return;}

      const id=m.sessionId+'/'+m.params?.requestId;
      if(m.method==='Network.requestWillBeSent'){
        const key=group(m.params.request.url);
        if(key){requests.set(id,key);(counts[key] ||= {requests:0,decoded:0,finishedWire:0}).requests++;}
      } else if(requests.has(id)){
        const row=counts[requests.get(id)] ||= {requests:0,decoded:0,finishedWire:0};
        if(m.method==='Network.dataReceived')row.decoded+=m.params.dataLength;
        if(m.method==='Network.loadingFinished'){row.finishedWire+=m.params.encodedDataLength;requests.delete(id);}
        if(m.method==='Network.loadingFailed')requests.delete(id);
      }
    };
  await send('Network.enable');
  await send('Page.navigate',{url:origin});
  return {reset(){counts={};},snapshot(){return counts;},close(){socket.close();}};
};
