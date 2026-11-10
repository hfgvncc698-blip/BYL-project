import {useEffect,useRef,useState} from 'react';
import {apiFetch} from './api';
import {calendarWindow} from './calendarWindow.mjs';
const empty=[];
export function useClubCalendarPeriod(enabled,urlFor,date,view,scope){
  const [from,to]=calendarWindow(date,view);
  const path=urlFor('/clubs/calendar-period?from='+from+'&to='+to+(view==='upcoming'?'&upcoming=1':''));
  const key=JSON.stringify([scope,path]);
  const cache=useRef(new Map());
  const [state,setState]=useState(null);
  useEffect(()=>{
    if(!enabled)return;
    let active=true,controller,timer,attempt=0,lastConfirmation=0;
    async function load(initial){
      controller?.abort();
      const request=new AbortController();controller=request;
      const known=cache.current.get(key);
      try{
        const data=await apiFetch(path+(known?'&revision='+encodeURIComponent(known.revision):'')+(initial?'&immediate=1':''),{signal:request.signal});
        if(!active||request!==controller)return;
        const row={key,revision:data.revision,appointments:data.unchanged?known.appointments:data.appointments};
        cache.current.delete(key);cache.current.set(key,row);
        if(cache.current.size>8)cache.current.delete(cache.current.keys().next().value);
        setState(row);attempt=0;lastConfirmation=Date.now();
        timer=setTimeout(()=>load(false),0);
      }catch(e){
        if(!active||request!==controller)return;
        if([401,403,404].includes(e.status)){cache.current.clear();setState({key,error:true,denied:true,appointments:empty});return;}
        setState(prev=>({key,error:true,appointments:prev?.key===key?prev.appointments:empty}));
        timer=setTimeout(()=>load(true),Math.min(30000,1000*2**Math.min(5,attempt++)));
      }
    }
    function resume(){clearTimeout(timer);load(true);}
    const focus=()=>{if(document.visibilityState!=='hidden' && Date.now()-lastConfirmation>24000)resume();};
    load(true);window.addEventListener('online',resume);window.addEventListener('focus',focus);
    return ()=>{active=false;controller?.abort();clearTimeout(timer);window.removeEventListener('online',resume);window.removeEventListener('focus',focus);};
  },[enabled,path,key]);
  return enabled && state?.key===key ? state : {appointments:empty,loading:enabled};
}
