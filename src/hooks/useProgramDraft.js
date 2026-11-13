import {useEffect,useRef,useState} from 'react';
import {apiFetch} from '../utils/api';
import {privateTicket,assertPrivateTicket} from '../utils/privateSession';
import {useNavigationSave} from './useNavigationSave';

// Server draft is distinct from the canonical programme. No browser persistence.
export function useProgramDraft(target, value, dirty, restore) {
  const key=JSON.stringify(target);
  const latest=useRef({value,dirty,restore});latest.current={value,dirty,restore};
  const session=useRef(null);
  const [state,setState]=useState({status:'Vérification du brouillon',remote:null});
  const [tick,setTick]=useState(0);
  useEffect(()=>{
    const entry={target,ticket:privateTicket(),revision:0,ready:false,pending:null,operation:null,saved:null,closed:false};
    session.current=entry;setState({status:'Vérification du brouillon',remote:null});
    entry.load = () => apiFetch('/program-drafts/read',{method:'POST',body:JSON.stringify({target})}).then(data=>{
      assertPrivateTicket(entry.ticket);if(entry.closed)return;
      Object.assign(entry,{ready:true,revision:data.revision,scope:data.scope,baseVersion:data.baseVersion});
      // Restoration is explicit: never overwrite edits made while loading.
      entry.remote=data.draft;
      setState({status:data.draft?'Brouillon disponible': 'Enregistré',remote:data.draft});setTick(n=>n+1);
    }).catch(error=>{if(!entry.closed)setState({status:[401,403].includes(error.status)?'Accès refusé':'Échec de sauvegarde',remote:null});});
    void entry.load();
    return ()=>{entry.closed=true;};
  },[key]);
  const flush=async()=>{
    const e=session.current;
    if(!e||e.closed||!e.ready||e.remote||!latest.current.dirty)return;
    assertPrivateTicket(e.ticket);
    const encoded=JSON.stringify(latest.current.value);
    if(e.saved===encoded){setState({status:'Synchronisé avec BYL',remote:null});return;}
    if(e.pending){await e.pending;return;}
    if(!navigator.onLine){setState({status:'En attente de synchronisation',remote:null});return;}
    const operation=e.operation||{operationId:crypto.randomUUID(),value:JSON.parse(encoded),revision:e.revision,baseVersion:e.baseVersion};
    e.operation=operation;
    setState({status:'En attente de synchronisation',remote:null});
    e.pending=apiFetch('/program-drafts/save',{method:'POST',body:JSON.stringify({target:e.target,scope:e.scope,...operation})}).then(result=>{
      assertPrivateTicket(e.ticket);if(e.closed)return;
      e.revision=result.revision;e.saved=JSON.stringify(operation.value);e.operation=null;
      setState({status:'Synchronisé avec BYL',remote:null});
    }).catch(error=>{
      if(e.closed)return;
      if(error.status===409){e.ready=false;e.conflict=true;}
      if([401,403].includes(error.status))e.ready=false;
      setState({status:error.status===409?'Conflit à résoudre':[401,403].includes(error.status)?'Accès refusé':'Échec de sauvegarde',remote:null});
    }).finally(()=>{e.pending=null;if(!e.closed&&e.ready&&!e.operation&&e.saved!==JSON.stringify(latest.current.value))queueMicrotask(()=>void flushRef.current());});
    await e.pending;
  };
  const flushRef=useRef(flush);flushRef.current=flush;
  useNavigationSave(()=>flushRef.current());
  useEffect(()=>{
    if(dirty)setState(s=>s.status==='Conflit à résoudre'||s.remote?s:{...s,status:'Enregistré localement (cet onglet)'});
    const timer=setTimeout(()=>void flushRef.current(),900);return ()=>clearTimeout(timer);
  },[key,value,dirty,tick]);
  useEffect(()=>{
    const online=()=>{const e=session.current;if(e&&!e.ready&&!e.conflict)void e.load();else void flushRef.current();};
    const before=event=>{const e=session.current;if(latest.current.dirty&&e?.saved!==JSON.stringify(latest.current.value)){event.preventDefault();event.returnValue='';}};
    const recovered=()=>{const e=session.current;if(e&&!latest.current.dirty&&!e.pending)void e.load();};
    window.addEventListener('byl:program-draft-recovered',recovered);
    window.addEventListener('online',online);window.addEventListener('beforeunload',before);
    return ()=>{window.removeEventListener('byl:program-draft-recovered',recovered);window.removeEventListener('online',online);window.removeEventListener('beforeunload',before);};
  },[]);
  return {...state,retry:()=>{const e=session.current;if(e&&!e.ready&&!e.conflict)return e.load();return flush();},
    restore:()=>{const e=session.current;if(!e?.remote)return;if(latest.current.dirty&&!window.confirm('Remplacer les modifications de cet onglet par le brouillon serveur ?'))return;assertPrivateTicket(e.ticket);const saved=e.remote;
      const conflict=saved.baseVersion!==e.baseVersion;e.remote=null;e.baseVersion=saved.baseVersion;e.saved=JSON.stringify(saved.value);e.conflict=conflict;e.ready=!conflict;latest.current.restore(saved.value);setState({status:conflict?'Conflit à résoudre':'Synchronisé avec BYL',remote:null});},
    complete:async()=>{const e=session.current;if(!e?.ready)return;await e.pending;await apiFetch('/program-drafts/complete',{method:'POST',body:JSON.stringify({target:e.target,scope:e.scope,revision:e.revision})});e.closed=true;},
  };
}
