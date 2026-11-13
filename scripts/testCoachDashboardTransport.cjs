const assert=require('node:assert/strict'),{gunzipSync}=require('node:zlib'),{randomBytes}=require('node:crypto');
const {dashboardTransport,MAX_TRANSFER_BYTES,MAX_V2_TRANSFER_BYTES,MAX_DECODED_BYTES}=require('../backend/utils/coachDashboardTransport');
(async()=>{
 const json=JSON.stringify({clients:{fixture:[{id:'p',data:{description:'Synthetic é🟢'.repeat(600000),sessions:[{exercises:[{sets:[1,2,3],unknownLegacy:{keep:true}}]}]},history:[{id:'old',data:{status:'partial',percentage:47,unknown:'preserve'}}]}]}});
 assert(Buffer.byteLength(json)>MAX_TRANSFER_BYTES);
 assert.equal(await dashboardTransport(json,{gzipAccepted:true}),null,'legacy contract');
 assert.equal(await dashboardTransport(json,{version:2,gzipAccepted:false}),null,'no compressed negotiation, no oversized transfer');
 const start=performance.now();const encoded=await dashboardTransport(json,{version:2,gzipAccepted:true});
 assert(encoded&&encoded.transferBytes<=MAX_TRANSFER_BYTES);assert.equal(gunzipSync(encoded.body).toString(),json,'every field and byte preserved');
 assert.equal(await dashboardTransport('x'.repeat(MAX_DECODED_BYTES+1),{version:2,gzipAccepted:true}),null,'decoded expansion bounded before compression');
 const incompressible=JSON.stringify({blob:randomBytes(MAX_V2_TRANSFER_BYTES+1024*1024).toString('base64')});
 assert.equal(await dashboardTransport(incompressible,{version:2,gzipAccepted:true}),null,'compressed transfer bounded');
 const tiny=await dashboardTransport('{}',{version:2,gzipAccepted:false});assert.equal(tiny.body,'{}');
 const poorCompression=JSON.stringify({synthetic:randomBytes(5*1024*1024).toString('base64')});
 const poorPacked=await dashboardTransport(poorCompression,{version:2,gzipAccepted:true});
 assert(poorPacked.transferBytes>MAX_TRANSFER_BYTES && poorPacked.transferBytes<=MAX_V2_TRANSFER_BYTES);
 assert.equal(gunzipSync(poorPacked.body).toString(),poorCompression,'poorly compressible data also remains complete');
 assert.equal(await dashboardTransport(poorCompression,{gzipAccepted:true}),null,'legacy rejects the same oversized payload');

 console.log(JSON.stringify({passed:true,decodedBytes:encoded.decodedBytes,transferBytes:encoded.transferBytes,qualificationMs:Math.round(performance.now()-start)}));
})().catch(e=>{console.error(e);process.exitCode=1;});
