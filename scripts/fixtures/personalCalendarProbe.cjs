const fs=require('node:fs'),path=require('node:path');
module.exports=function instrument(folder,role) {
  const file=rel=>path.join(folder,rel);
  for(const rel of ['components/Clientdashboard.jsx','components/CoachDashboard.jsx','utils/clientCalendarFeed.js','utils/coachPageSource.js','utils/firestoreMetrics.js']){
    if(!fs.existsSync(file('src/'+rel)))continue;
    const p=file('src/'+rel);
    let source=fs.readFileSync(p,'utf8').replaceAll(/from ['"]firebase\/firestore['"]/g,"from '/calendarSdk.js'");
    const isCoach=rel.endsWith('CoachDashboard.jsx'),isClient=rel.endsWith('Clientdashboard.jsx');
    if(isCoach||isClient){
      const marker=isCoach?'  const getClubAppointmentIdFromEvent =':'  const clubClassFilterButtons =';
      if(!source.includes(marker))throw Error('unknown render boundary');
      source=source.replace(marker,`  React.useEffect(()=>{window.personalCalendar={count:sessions.length,
        original:sessions.some(s=>s.title?.includes('Fixture now')),changed:sessions.some(s=>s.title?.includes('Remote edit'))};},[sessions]);\n`+marker);
    }
    fs.writeFileSync(p,source);
  }
  fs.writeFileSync(file('calendarSdk.js'),`
    export * from 'firebase/firestore';import * as sdk from 'firebase/firestore';
    const measured=r=>['sessions','appointments'].includes((r.path || r._query?.path?.canonicalString() || '').split('/').pop());
    const counters=()=>window.calendarSDK ||= {starts:0,reads:0,views:0,changes:0,estimate:0};
    async function read(fn,r){if(!measured(r))return fn(r);counters().reads++;const s=await fn(r),c=counters();c.views+=s.size;c.estimate+=s.metadata.fromCache?0:Math.max(1,s.size);return s;}
    export const getDocs=r=>read(sdk.getDocs,r);export const getDocsFromServer=r=>read(sdk.getDocsFromServer,r);
    export function onSnapshot(ref,...args){
      if(!measured(ref))return sdk.onSnapshot(ref,...args);
      const i=args.findIndex(f=>typeof f==='function'),next=args[i];let first=true;counters().starts++;
      args[i]=snap=>{const c=counters();c.views+=snap.size;if(!snap.metadata.fromCache && !snap.metadata.hasPendingWrites){const n=first?snap.size:snap.docChanges().length;c.changes+=n;c.estimate+=first?Math.max(1,n):n;first=false;}next(snap);};
      return sdk.onSnapshot(ref,...args);
    }
  `);
  const profile={uid:'coach',role:role==='client'?'particulier':'coach',subscriptionStatus:'active',hasActiveSubscription:true,linkedClientId:'coach',clubId:'sample',modules:['sport']};
  fs.writeFileSync(file('src/AuthContext.jsx'),`const user=${JSON.stringify(profile)};export const useAuth=()=>({user,isAdmin:false,isCoach:user.role==='coach',effectiveRole:user.role,isAuthenticated:true});export const AuthProvider=({children})=>children;`);
};
