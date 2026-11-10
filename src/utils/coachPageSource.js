// Shared for the lifetime of the authenticated tab. Firebase multiplexes the same
// queries across tabs when persistentMultipleTabManager is available.
import { collection, or, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { coachConfirmedSnapshot, clientsConfirmedSnapshot, coachQuery, clientsQuery } from './firestoreMetrics';

import {coachDirectoryFeed} from './coachDirectoryFeed';
import {clearCoachViewCache} from './pageDataCache';
const sources = new Map();
const onLogout = new Set();
export function onCoachSessionEnd(callback) {onLogout.add(callback);}

const sessions = new WeakMap();
const TTL = 5 * 60000;
export function coachPageScope(user, target, club = '', preview = '') {
  const account = auth.currentUser;
  if (!user?.uid || account?.uid !== user.uid || !target) return '';
  if (!sessions.has(account)) sessions.set(account, crypto.randomUUID());
  return encodeURIComponent(JSON.stringify([sessions.get(account), user.uid, target, club, preview,
    user.role, user.clubId, user.clubIds, user.subscriptionStatus, user.hasActiveSubscription,
    user.trialEndsAt,user.trialEnd,user.nutritionAccess,user.hasNutritionAccess,user.features,user.packageKey, user.proAccess, user.modules, user.disabled, user.disabledByClub, user.emailVerificationRequired, account.emailVerified]));
}

function calendarFeed(target, purge, admin) {
  let unsubscribe, closeTimer, current, pending, resolve, reject;
  let prior = new Map(), confirmed=false;
  const observers = new Set();
  function start(page) {
    if (unsubscribe) return;
    pending = new Promise((yes,no) => {resolve=yes; reject=no;});
    pending.catch(()=>{});
    const q = page === 'clients' ? clientsQuery : coachQuery;
    const listen = page === 'clients' ? clientsConfirmedSnapshot : coachConfirmedSnapshot;
    const clauses = (admin ? ['coachId','createdBy','ownerId'] : ['coachId','createdBy']).map(field=>where(field,'==',target));
    unsubscribe = listen(q(collection(db,'sessions'),or(...clauses)), snap => {
      if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) {
        confirmed=false;
        for (const o of observers) o.stale?.();
        return;
      }
      confirmed=true;
      const initial = !current;
      const changes = snap.docChanges();
      const affected = new Set();
      for (const change of changes) {
        affected.add(prior.get(change.doc.id));
        affected.add(change.doc.data().clientId);
      }
      prior = new Map(snap.docs.map(d=>[d.id,d.data().clientId]));
      current = snap;
      resolve(snap);
      for (const o of observers) {
        if (!initial && changes.length) o.changed?.(snap,changes,affected);
        else o.confirmed?.(snap);
      }
    }, error => {
      current = null; confirmed=false; clearCoachViewCache(); purge();
      reject(error);
      for (const o of observers) o.error?.(error);
      unsubscribe?.(); unsubscribe = null;
    });
  }
  function close() {
    unsubscribe?.(); unsubscribe=null; current=null;confirmed=false; prior.clear();
    reject?.(new Error('feed-closed'));
  }
  return {
    current:()=>current, fresh:()=>confirmed, active:()=>observers.size>0,
    read(page) { start(page); return current ? Promise.resolve(current) : pending; },
    watch(page, observer) {
      clearTimeout(closeTimer); observers.add(observer); start(page);
      return () => { observers.delete(observer); if (!observers.size) closeTimer=setTimeout(close,1000); };
    },
    close() {clearTimeout(closeTimer);close();observers.clear();}
  };
}
export function coachPageSource(scope, target, admin=false) {
  if (sources.has(scope)) return sources.get(scope);
  const values = new Map();
  let templateVersion;
  function purge(id) {
    for (const [key,entry] of values) if (!id || entry.client === id) values.delete(key);
  }
  const roots = coachDirectoryFeed(target,purge), calendar = calendarFeed(target,purge,admin);
  const controller=new AbortController();
  const source = {
    account:auth.currentUser,roots, calendar, purge,
    purgeSport(id) {
      for(const key of ['bundle/'+id,'list/true/'+id])values.delete(key);
    }, signal:controller.signal, invalidate:key=>values.delete(key),
    allowsRows(rows) {
      if(!roots.fresh() || !Array.isArray(rows))return false;
      const ids=new Set(roots.current().docs.map(d=>d.id));
      return rows.every(c=>ids.has(c.id));
    },
    templatesChanged(version) {
      const changed=templateVersion!==undefined && templateVersion!==version;
      templateVersion=version;
      if(changed)values.delete('templates');
      return changed;
    },
    peek(key,version) {
      const entry=values.get(key);
      return entry && entry.version===version && Date.now()-entry.at<TTL ? entry.promise : null;
    },
    present(key,version) {
      const entry=values.get(key);
      return entry && entry.version===version && Date.now()-entry.at<TTL ? entry.value : null;
    },
    seed(key,version,data,client) {values.set(key,{version,client,value:data,at:Date.now(),promise:Promise.resolve(data)});},
    read(key, version, run, client = '') {
      if (controller.signal.aborted) return Promise.reject(new Error("coach-session-ended"));
      const old = values.get(key);
      if (old && old.version === version && Date.now()-old.at<TTL) return old.promise;
      const entry = {version, client, at:Date.now()};
      entry.promise = Promise.resolve().then(run).then(value=>{entry.value=value;return value;}).catch(error => {
        if (values.get(key) === entry) values.delete(key);
        throw error;
      });
      values.set(key,entry);
      return entry.promise;
    },
    close() {controller.abort();roots.close();calendar.close();values.clear();}
  };
  for(const [key,old] of sources) if(sources.size>=3 && !old.roots.active() && !old.calendar.active()){old.close();sources.delete(key);}
  sources.set(scope,source);
  return source;
}
let previous = auth.currentUser;
onAuthStateChanged(auth, account => {
  if (account !== previous) {
    for(const [key,source] of sources) if(source.account!==account){source.close();sources.delete(key);}
    clearCoachViewCache();for(const clear of onLogout)clear();
  }
  previous=account;
});
