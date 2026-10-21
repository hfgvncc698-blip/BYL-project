import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../utils/api';

export default function useInternalClientNote(clientId, userId) {
  const [state, setState] = useState({text:'', version:0, loading:true, error:false});
  const url = `/clubs/clients/${encodeURIComponent(clientId)}/internal-note`;
  useEffect(() => {
    let active = true;
    setState({text:'', version:0, loading:true, error:false});
    if (clientId && userId) apiFetch(url).then(note => {
      if (active) setState({...note, loading:false, error:false});
    }).catch(() => { if (active) setState({text:'',version:0,loading:false,error:true}); });
    return () => { active = false; };
  }, [clientId, userId, url]);
  const save = useCallback(async text => {
    if (state.loading || state.error) throw new Error('notes-unavailable');
    const note = await apiFetch(url, {method:'PUT',body:JSON.stringify({text,version:state.version})});
    setState({...note,loading:false,error:false});
  }, [state.loading, state.error, state.version, url]);
  return {...state,save};
}
