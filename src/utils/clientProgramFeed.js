// A replay is available only while the same Firebase user still holds a live
// subscription. Stored SDK snapshots alone never admit a new session.
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, snapshotEqual } from 'firebase/firestore';
import { auth } from '../firebaseConfig';

const feeds = new Map();
// Bound the initial backfill, not the number of already synchronized streams.
// Thousands of historical executions must not saturate the SDK listen channel.
const queued = new Map();
const starting = new Set();
function pump() {
  while (starting.size < 4 && queued.size) {
    const [feed, start] = queued.entries().next().value;
    queued.delete(feed);
    starting.add(feed);
    start();
  }
}
function release(feed) {
  queued.delete(feed);
  if (starting.delete(feed)) queueMicrotask(pump);
}

export function programAccessScope(user, effectiveRole = user?.role, preview = '') {
  return JSON.stringify([user?.uid, user?.role, effectiveRole, user?.clubId, user?.linkedClientId,
    user?.subscriptionStatus, user?.disabled, user?.disabledByClub, preview]);
}

function close(feed, error) {
  clearTimeout(feed.timer);
  release(feed);
  feed.stop?.();
  feed.snapshot = null;
  if (feeds.get(feed.key) === feed) feeds.delete(feed.key);
  if (error) for (const observer of feed.observers) observer.fail(error);
  feed.observers.clear();
}

const accessError = () => Object.assign(new Error('Session changed'), { code: 'permission-denied' });
onAuthStateChanged(auth, account => {
  for (const feed of feeds.values()) if (feed.account !== account) close(feed, accessError());
});

export function confirmedProgram(scope, clientId, programId) {
  const path = 'clients/' + clientId + '/programmes';
  const feed = feeds.get(JSON.stringify([scope,path]));
  if (!feed?.replay || feed.account !== auth.currentUser) return null;
  const doc = feed.snapshot.docs.find(d => d.id === programId);
  return doc ? {...doc.data(),id:doc.id} : null;
}

export function watchProgramCollection(scope, ref, next, fail) {
  const account = auth.currentUser;
  if (!account || account.uid !== JSON.parse(scope)[0]) {
    fail(accessError());
    return () => {};
  }
  const key = JSON.stringify([scope, ref.path]);
  let feed = feeds.get(key);
  if (feed && feed.account !== account) { close(feed, accessError()); feed = null; }
  const observer = { next, fail };
  if (!feed) {
    feed = { key, account, observers: new Set(), snapshot: null };
    feeds.set(key, feed);
    queued.set(feed, () => {
      feed.stop = onSnapshot(ref, {includeMetadataChanges:true}, snapshot => {
        if (feeds.get(key) !== feed || auth.currentUser !== account) return;
        // On reconnect require fresh server confirmation before replay to a new
        // consumer. Mounted consumers keep their previously confirmed display.
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          feed.replay = false;
          if (snapshot.docChanges().length) feed.skipped = true;
          return;
        }
        release(feed);
        const first = !feed.snapshot;
        const changes = snapshot.docChanges();
        feed.snapshot = snapshot;
        feed.replay = true;
        for (const sub of feed.observers) {
          // A subscriber may have joined during disconnection. A full snapshot
          // also covers changes first observed locally before server confirmation.
          if (first || !sub.ready || changes.length || feed.skipped) sub.next(snapshot, !sub.ready || feed.skipped);
          sub.ready = true;
        }
        feed.skipped = false;
      }, error => close(feed, error));
    });
    queueMicrotask(pump);
  }
  clearTimeout(feed.timer);
  feed.observers.add(observer);
  if (feed.replay) { observer.ready = true; next(feed.snapshot, true); }
  return () => {
    feed.observers.delete(observer);
    if (!feed.observers.size) feed.timer = setTimeout(() => close(feed), 2000);
  };
}

export function watchDashboardPrograms(accessScope,progCol,{onRows,onDirectory,compute,authorLabel,authorName,syncCalendar,difficultyBySession}) {
  const rows = new Map();
  const entries = new Map();
  const cId = progCol.parent.id;
  const publish = () => onRows([...rows.values()], rows.size === entries.size);
  function remove(id) {
    const entry = entries.get(id);
    entries.delete(id);
    for (const stop of entry?.stops || []) stop();
    rows.delete(id);
  }
  function update(d) {
    let entry = entries.get(d.id);
    if (entry?.doc && snapshotEqual(entry.doc,d)) return;
    const fresh = !entry;
    if (fresh) {
      entry = {stops:[], notes:[[],[]]};
      entries.set(d.id,entry);
    }
    const p = { ...d.data(), id:d.id, clientDocId:cId };
    entry.doc = d;
    entry.program = p;
    entry.author = authorLabel(p);
    const render = () => {
      if (entries.get(d.id)!==entry || !entry.history) return;
      const notes = entry.notes[0].length ? entry.notes[0] : entry.notes[1];
      rows.set(d.id,compute(entry.program,entry.history,entry.author,difficultyBySession(notes)));
      publish();
    };
    authorName(p).then(name=>{
      if (entry.program===p && name!==entry.author) { entry.author=name; render(); }
    }).catch(()=>{});
    if (!fresh) { render(); return; }
    entry.stops.push(watchProgramCollection(accessScope,collection(d.ref,'sessionsEffectuees'),(snap,reconcile)=>{
      void syncCalendar(entry.program,snap,reconcile,()=>entries.get(d.id)===entry);
      entry.history=snap;
      render();
    },()=>{remove(d.id);publish();}));
    let stopLegacy;
    function readNotes(snap) {
      return snap.docs.map(note=>({id:note.id,...note.data()}));
    }
    function selectNotes(primary) {
      if (entries.get(d.id)!==entry) return;
      const previous=entry.notes[0];
      entry.notes[0]=primary;
      if (primary.length) {
        stopLegacy?.();
        stopLegacy=null;
        entry.notes[1]=[];
      } else if (!stopLegacy) {
        stopLegacy=watchProgramCollection(accessScope,collection(d.ref,'difficulte_notes'),snap=>{
          if (!snap.size && !entry.notes[1].length) return;
          entry.notes[1]=readNotes(snap);
          render();
        },()=>{entry.notes[1]=[];render();});
      }
      if (primary.length || previous.length) render();
    }
    entry.stops.push(watchProgramCollection(accessScope,collection(d.ref,'difficulté_notes'),
      snap=>selectNotes(readNotes(snap)),()=>selectNotes([])));
    entry.stops.push(()=>stopLegacy?.());
  }
  const stop=watchProgramCollection(accessScope,progCol,(snap,reconcile)=>{

    if (reconcile) {
      const ids=new Set(snap.docs.map(d=>d.id));
      for (const id of entries.keys()) if (!ids.has(id)) remove(id);
      for (const d of snap.docs) update(d);
    } else for (const change of snap.docChanges()) {
      if (change.type==='removed') remove(change.doc.id);
      else update(change.doc);
    }
    onDirectory([...entries.values()].map(entry=>entry.program));
    publish();
  },()=>{
    onDirectory([]);
    for (const id of entries.keys()) remove(id);
    publish();
  });
  return ()=>{stop();for (const id of entries.keys()) remove(id);};
}
