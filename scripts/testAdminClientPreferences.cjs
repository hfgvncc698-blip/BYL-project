const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../backend/routes/adminEmails.js'), 'utf8');
const read = vm.runInNewContext(`(${source.slice(source.indexOf('function readPreferences('),source.indexOf('\nfunction automaticPreferenceKey'))})`, {
 DEFAULT_PREFERENCES: {allAutomatic:true,messaging:true,welcome:true}, asBool: (v,f) => typeof v==='boolean'?v:f,
});
assert.equal(read({user:{emailPreferences:{messaging:false}},client:{emailPreferences:{messaging:true}}}).messaging,false);
assert.equal(read({user:{settings:{emailNotificationsEnabled:false}}}).allAutomatic,false);
assert.equal(read({client:{settings:{emailNotificationsEnabled:false}}}).allAutomatic,false);
assert.equal(read({user:{emailPreferences:{allAutomatic:true}},client:{emailPreferences:{allAutomatic:false}}}).allAutomatic,true);
const profile = fs.readFileSync(require.resolve('../backend/routes/clientProfile.js'), 'utf8');
let handler;let write;
const begin=profile.indexOf('router.put("/location-settings"');
vm.runInNewContext(profile.slice(begin,profile.indexOf('\nmodule.exports',begin)),{
 router:{put:(path,auth,h)=>{assert.equal(path,'/location-settings');handler=h;}},requireFirebaseAuth:()=>{},
 admin:{firestore:Object.assign(()=>({collection:()=>({doc:uid=>({update:async data=>{write={uid,data};}})})}),{FieldValue:{serverTimestamp:()=>123}})},
});
(async()=>{
 const res={statusCode:200,status(c){this.statusCode=c;return this;},json(data){this.data=data;return this;}};
 await handler({auth:{uid:'self'},body:{preference:false,analyticsEnabled:true,browserPermission:'denied',uid:'other'}},res);
 assert.equal(write.uid,'self');assert.equal(write.data.locationSettings.preference,false);
 write=null;
 await handler({auth:{uid:'self'},body:{preference:'true',analyticsEnabled:true,browserPermission:'granted'}},res);
 assert.equal(res.statusCode,400);assert.equal(write,null);
 console.log('Client settings: account preference precedence, legacy global flag, own-account reports and input validation passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
