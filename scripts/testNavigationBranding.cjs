const assert = require('node:assert/strict');
const { resolveNavigationBrand } = require('../backend/utils/navigationBranding');
const pro = {role:'coach',subscriptionStatus:'active',packageKey:'sport',packageTier:'unlimited',settings:{navbarBrandName:'Coach One'}};
function database(data) {
 const snap = (id, value) => ({id,exists:!!value,data:()=>value});
 return {
   collection: name => ({
     doc: id => ({ get: async () => snap(id, data[name]?.[id]) }),
     where: (key, op, value) => ({ get: async () => ({
       docs: Object.entries(data[name] || {}).filter(([, d]) => d[key] === value).map(([id, d]) => snap(id, d)),
     }) }),
   }),
 };
}
const base = () => ({users:{member:{role:'particulier'},one:{...pro}},clients:{a:{uid:'member',coachId:'one',coachIds:['one']}},clubs:{}});
(async()=>{
 const frontend = await import('../src/utils/proPlanAccess.js');
 const backend = require('../backend/utils/navigationBranding');
 for (const packageKey of ['sport','nutrition','complete','club']) {
   for (const packageTier of ['solo','growth','unlimited','studio','club','network']) {
     assert.equal(backend.canUseNavbarBranding({packageKey,packageTier}), frontend.canUseNavbarBranding({packageKey,packageTier}));
   }
 }

 let data=base(); assert.equal(await resolveNavigationBrand(database(data),'member'),'Coach One');
 data.clients.b={accountUid:'member',coachId:'two'};data.users.two={...pro}; assert.equal(await resolveNavigationBrand(database(data),'member'),null);
 data=base();data.users.one.subscriptionStatus='canceled';assert.equal(await resolveNavigationBrand(database(data),'member'),null);
 data=base();data.users.one.packageTier='solo';assert.equal(await resolveNavigationBrand(database(data),'member'),null);
 data=base();data.users.one.settings={};assert.equal(await resolveNavigationBrand(database(data),'member'),null);
 data=base();data.clients.a.clubId='club';data.clubs.club={name:'Club One',ownerUid:'one',status:'active'};assert.equal(await resolveNavigationBrand(database(data),'member'),'Club One');
 data.clients.b={linkedUserId:'member',clubId:'other'};assert.equal(await resolveNavigationBrand(database(data),'member'),null);
 data=base();data.clients.a.clubId='club';data.clubs.club={name:'Club One',ownerUid:'owner',status:'active'};data.users.owner={...pro};assert.equal(await resolveNavigationBrand(database(data),'member'),null);
 data=base();data.clients.a.clubId='club';data.clubs.club={name:'Club One',ownerUid:'owner',status:'active'};data.users.owner={...pro};
 data.users.one={...pro,accountType:'club_member',clubRole:'pro',clubId:'club'};
 assert.equal(await resolveNavigationBrand(database(data),'member'),'Club One');
 delete data.clients.a.clubId;
 assert.equal(await resolveNavigationBrand(database(data),'member'),'Club One');
 data.clients.b={uid:'member',coachId:'two'};data.users.two={...data.users.one};
 assert.equal(await resolveNavigationBrand(database(data),'member'),'Club One');
 data.users.two.clubId='other';assert.equal(await resolveNavigationBrand(database(data),'member'),null);
 data=base();data.users.member={role:'coach',accountType:'club_member',clubRole:'pro',clubId:'club'};data.clients={};data.clubs.club={name:'Club One',ownerUid:'one',status:'active'};
 assert.equal(await resolveNavigationBrand(database(data),'member'),'Club One');
 data=base();data.clients={'club-former':{uid:'member',coachId:'one',clubId:null,clubIds:[]}};assert.equal(await resolveNavigationBrand(database(data),'member'),null);
 data=base();data.clients={};assert.equal(await resolveNavigationBrand(database(data),'member'),null);
 assert.equal(await resolveNavigationBrand(database(data),'unknown'),null);
 console.log('Navigation branding: single coach/club, duplicate links, multiple profiles/providers, access loss, missing data OK');
})().catch(e=>{console.error(e);process.exitCode=1});
