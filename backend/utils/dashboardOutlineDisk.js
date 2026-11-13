// Optional server-only optimization. Never an authorization or canonical store.
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const schema=crypto.createHash('sha256').update(sync.readFileSync(path.join(__dirname,'dashboardPrescriptionSummary.mjs'))).update(sync.readFileSync(path.join(__dirname,'coachPageWire.js'))).digest('hex');
const ttl=24*60*60*1000,maxFile=8*1024*1024,budget=64*1024*1024;
const metrics={hits:0,misses:0,writes:0,bytesWritten:0,failures:0};
let serial=Promise.resolve();
function config(){
 const dir=process.env.BYL_DASHBOARD_OUTLINE_DIR,key=process.env.BYL_DASHBOARD_OUTLINE_KEY;
 if(!dir||!path.isAbsolute(dir)||!(/^[a-f0-9]{64}$/i.test(key||'')))return null;
 return {dir,key:Buffer.from(key,'hex')};
}
function scope(ref){return `${ref.firestore?.projectId || ''}/${ref.path}`;}
function version(doc){return `${doc.id}@${doc.updateTime.seconds}:${doc.updateTime.nanoseconds}`;}
function filename(ref){return crypto.createHash('sha256').update(scope(ref)).digest('hex')+'.outline';}
async function directory(c){
 await fs.mkdir(c.dir,{recursive:true,mode:0o700});
 const stat=await fs.lstat(c.dir);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('unsafe-cache-directory');
}
async function read(ref){
 const c=config();if(!c)return new Map();
 try{
  await directory(c);
  const file=await fs.open(path.join(c.dir,filename(ref)),sync.constants.O_RDONLY|sync.constants.O_NOFOLLOW);
  let bytes;try{const stat=await file.stat();if(!stat.isFile()||stat.size>maxFile||(stat.mode&0o077))throw Error('invalid-cache-file');bytes=await file.readFile();}finally{await file.close();}
  const decipher=crypto.createDecipheriv('aes-256-gcm',c.key,bytes.subarray(0,12));
  decipher.setAAD(Buffer.from(schema+'|'+scope(ref)));decipher.setAuthTag(bytes.subarray(12,28));
  const data=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString());
  if(!Number.isFinite(data.at)||Date.now()-data.at>ttl||data.at>Date.now()||!Array.isArray(data.entries))throw Error('expired-cache');
  metrics.hits++;return new Map(data.entries);
 }catch(error){metrics.misses++;if(error.code!=='ENOENT')metrics.failures++;return new Map();}
}
function save(ref,entries){
 const c=config();if(!c)return Promise.resolve();
 // Serialize atomic replacements and eviction within a process. Separate processes
 // may replace the same immutable-version cache; either valid file is safe.
 const job=serial.then(async()=>{
  let temporary;
  try{
   await directory(c);
   const plain=Buffer.from(JSON.stringify({at:Date.now(),entries}));if(plain.length+28>maxFile)return;
   const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',c.key,iv);
   cipher.setAAD(Buffer.from(schema+'|'+scope(ref)));
   const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);
   const bytes=Buffer.concat([iv,cipher.getAuthTag(),encrypted]);
   const files=[];
   for(const name of await fs.readdir(c.dir))if(/^[a-f0-9]{64}\.outline$/.test(name)){
    const stat=await fs.lstat(path.join(c.dir,name));if(stat.isFile())files.push({name,size:stat.size,at:stat.mtimeMs});
   }
   let total=files.reduce((n,f)=>n+f.size,0);
   for(const f of files.sort((a,b)=>a.at-b.at))if(total+bytes.length>budget||Date.now()-f.at>ttl){await fs.unlink(path.join(c.dir,f.name));total-=f.size;}
   temporary=path.join(c.dir,crypto.randomBytes(16).toString('hex')+'.tmp');
   await fs.writeFile(temporary,bytes,{flag:'wx',mode:0o600});
   await fs.rename(temporary,path.join(c.dir,filename(ref)));temporary=null;
   metrics.writes++;metrics.bytesWritten+=bytes.length;
  }catch{metrics.failures++;}finally{if(temporary)await fs.unlink(temporary).catch(()=>{});}
 });
 serial=job.catch(()=>{});return job;
}
module.exports={read,save,version,enabled:()=>!!config(),stats:()=>({...metrics,enabled:!!config(),budget,maxFile}),flush:()=>serial};
