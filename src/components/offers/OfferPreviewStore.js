import { useEffect, useState } from 'react';
import { apiFetch } from '../../utils/api';

// Keep the exported name for existing consumers. Data now comes from the
// authenticated API; browser demo contracts are deliberately never imported.
const cache=new Map();
const empty=()=>({contracts:[],checks:{},version:0,loading:true,error:''});
const eventName='coach-offers-changed';
const publish=(uid,state)=>{if((cache.get(uid)?.version??-1)>state.version)return;cache.set(uid,state);window.dispatchEvent(new CustomEvent(eventName,{detail:uid}));};
const load=async uid=>{
 try {const state=await apiFetch('/coach-offers');
  // Preserve the coach's edited catalogue as a starting point only. It is
  // saved to the account on the next explicit save, never with sample clients.
  if(!state.offers){try{const saved=JSON.parse(sessionStorage.getItem(`byl-offer-preview-v2:${uid}`));if(saved?.offers)state.offers=saved.offers;}catch{/* No local catalogue. */}}
  publish(uid,{...state,loading:false,error:''});
 }catch(e){publish(uid,{...(cache.get(uid)||empty()),loading:false,error:e.data?.error||'Impossible de charger les offres. Réessayez.'});}
};
export function useOfferPreview(uid){
 const [state,setState]=useState(()=>cache.get(uid)||empty());
 useEffect(()=>{
  if(!uid){setState(empty());return;}
  const sync=e=>{if(e.detail===uid)setState(cache.get(uid));};
  window.addEventListener(eventName,sync);
  setState(cache.get(uid)||empty());
  const refresh=()=>load(uid);refresh();
  window.addEventListener('focus',refresh);window.addEventListener('cancellation-reviewed',refresh);
  const timer=setInterval(refresh,30000);
  return()=>{window.removeEventListener(eventName,sync);window.removeEventListener('focus',refresh);window.removeEventListener('cancellation-reviewed',refresh);clearInterval(timer);};
 },[uid]);
 const update=async fn=>{
  const previous=cache.get(uid);
  if(!uid||!previous||previous.loading||previous.error)throw new Error('Données indisponibles. Actualisez la page.');
  const next=typeof fn==='function'?fn(previous):previous;
  let command=typeof fn==='function'?null:fn;
  if(!command){
  if(JSON.stringify(next.offers)!==JSON.stringify(previous.offers))command={action:'catalogue',offers:next.offers};
  else if(next.contracts.length===previous.contracts.length+1)command={action:'assign',contract:next.contracts[next.contracts.length-1]};
  else {const id=Object.keys(next.checks).find(id=>JSON.stringify(next.checks[id])!==JSON.stringify(previous.checks[id]));if(id)command={action:'check',id,check:next.checks[id]};}
  }
  if(!command)return;
  if(command.action==='assign'&&previous.contracts.some(c=>c.id===command.contract.id))return;
  try{const result=await apiFetch('/coach-offers',{method:'POST',body:JSON.stringify({...command,version:previous.version})});publish(uid,{...result,loading:false,error:''});}
  catch(e){await load(uid);throw e;}
 };
 return [state,update];
}
