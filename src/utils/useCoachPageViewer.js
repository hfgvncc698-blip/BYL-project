import {useMemo,useSyncExternalStore} from 'react';
import {doc} from 'firebase/firestore';
import {auth,db} from '../firebaseConfig';
import {coachConfirmedSnapshot,clientsConfirmedSnapshot} from './firestoreMetrics';
import {onCoachSessionEnd} from './coachPageSource';

const viewers=new Map();
const empty=()=>null;
const inactive=()=>()=>{};
const grantFields=['role','clubId','clubIds','accountType','clubRole','subscriptionStatus','hasActiveSubscription','trialEnd','trialEndsAt',
  'packageKey','packageTier','modules','proAccess','features','nutritionAccess','hasNutritionAccess','disabled','disabledByClub',
  'deletedFromClub','status','emailVerificationRequired'];
function viewer(account,page) {
  if(viewers.has(account))return viewers.get(account);
  let value=null,stop,timer;
  const subscribers=new Set();
  function publish(data) { value=data;for(const fn of subscribers)fn(); }
  function close(){clearTimeout(timer);stop?.();stop=null;value=null;viewers.delete(account);}
  const store={read:()=>value,close,subscribe(fn){
    clearTimeout(timer);subscribers.add(fn);
    if(!stop) {
      const listen=page==='clients'?clientsConfirmedSnapshot:coachConfirmedSnapshot;
      stop=listen(doc(db,'users',account.uid),snap=>{
        if(account!==auth.currentUser || snap.metadata.hasPendingWrites || snap.metadata.fromCache)return;
        publish(snap.exists()?snap.data():false);
      },()=>publish(false));
    }
    return ()=>{subscribers.delete(fn);if(!subscribers.size)timer=setTimeout(close,1000);};
  }};
  viewers.set(account,store);return store;
}
onCoachSessionEnd(()=>{for(const [account,store] of viewers)if(account!==auth.currentUser)store.close();});
export function useCoachPageViewer(appUser,page) {
  const account=auth.currentUser;
  const store=account && account.uid===appUser?.uid ? viewer(account,page) : null;
  const profile=useSyncExternalStore(store?.subscribe || inactive,store?.read || empty,empty);
  return useMemo(()=>{
    if(profile===null && account)return undefined;
    if(!profile || !['coach','club','admin'].includes(profile.role) || profile.disabled || profile.disabledByClub || profile.deletedFromClub ||
      ['deleted','removed','inactive','disabled','club_deleted'].includes(profile.status))return null;
    const user={...appUser,...profile,uid:account.uid};
    for(const key of grantFields) if(!Object.hasOwn(profile,key))delete user[key];
    return user;
  },[profile,appUser,account]);
}
