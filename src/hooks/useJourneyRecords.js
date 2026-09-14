import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Subscribe only to the current/opened programme, not the entire client history.
export default function useJourneyRecords(clientId, programId) {
  const key = `${clientId}:${programId}`;
  const [state,setState] = useState({});
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    if (!clientId || !programId) return;
    let active = true;
    setState({key,loading:true,records:[]});
    const timer = setTimeout(() => { if(active)setState(s => s.key === key && s.loading ? {...s,loading:false,error:true} : s); },15000);
    const unsubscribe = onSnapshot(collection(db,'clients',clientId,'programmes',programId,'sessionsEffectuees'), snapshot => {
      clearTimeout(timer);
      setState({key,loading:false,records:snapshot.docs.map(d => ({...d.data(),id:d.id})), cached:snapshot.metadata.fromCache});
    }, () => {clearTimeout(timer);setState({key,loading:false,error:true,records:[]});});
    return () => {active=false;clearTimeout(timer);unsubscribe();};
  },[clientId,programId,key,attempt]);
  return {...(state.key === key ? state : {loading:!!programId,records:[]}), retry:()=>setAttempt(n=>n+1)};
}
