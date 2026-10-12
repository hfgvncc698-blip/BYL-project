import { eventLastPacks } from '../../utils/lastPackSession.mjs';
import { useState, useEffect } from 'react';
import { coachEventCategory } from '../../utils/calendarEventAppearance.mjs';
import { Box, Stack, Text } from '@chakra-ui/react';
import ClubCalendarEventPreview from './ClubCalendarEventPreview';
import { apiFetch } from '../../utils/api';
import { clubText } from '../../i18n/clubText';
export default function CoachClubEventWrapper({event,children,onSelect,clubId}) {
 const [packs,setPacks]=useState([]);
 const [clients,setClients]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  const url=event.type==='group'&&event._kind==='club_appointment' ? `/clubs/coach-appointments/${event._sourceId}/participants` : clubId && event.clientId ? `/clubs/coach-clients/${encodeURIComponent(event.clientId)}/session-packs` : null;
  const refresh=async()=>{if(!url)return;try{const data=await apiFetch(url);if(active){if(data.clients)setClients(data.clients);setPacks(data.packs||[]);}}catch{/* Pack information is restricted to authorized club follow-ups. */}};
  refresh();const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
 },[event._sourceId,event.clientId,event.type,event._kind,clubId]);
 if(event.type!=='group'||event._kind!=='club_appointment')return <ClubCalendarEventPreview
   event={{...event,lastSessionPacks:eventLastPacks(packs,event)}} clients={[]} onSelect={()=>onSelect(event)}
   actionLabel={clubText('Voir les détails et modifier')}
   details={<Stack spacing={1}>
     <Text fontSize="sm" fontWeight="bold">{clubText(coachEventCategory(event)==='nutrition'?'Nutrition':coachEventCategory(event)==='internal'?'Interne':'Coaching individuel')}</Text>
     {event._clientName && <Text fontWeight="bold">{event._clientName}</Text>}
     {event._programmeName && <Text fontSize="sm">{event._programmeName}</Text>}
     {event._sessionTitle && <Text fontSize="sm">{event._sessionTitle}</Text>}
     {(event._note || event.notes || event.description) && <Text fontSize="sm" whiteSpace="pre-wrap">{event._note || event.notes || event.description}</Text>}
   </Stack>}>{children}</ClubCalendarEventPreview>;
 const load=async()=>{setLoading(true);setError('');try{const result=await apiFetch(`/clubs/coach-appointments/${event._sourceId}/participants`);setClients(result.clients);}catch{setError(clubText('Chargement impossible.'));}finally{setLoading(false);}};
 return <Box display="contents" onMouseEnter={load} onFocus={load}><ClubCalendarEventPreview event={{...event,title:event._sessionTitle||event.title}} clients={clients} loading={loading} error={error} onSelect={()=>onSelect(event)}>{children}</ClubCalendarEventPreview></Box>;
}
