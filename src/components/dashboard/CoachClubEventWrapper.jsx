import { eventLastPacks } from '../../utils/lastPackSession.mjs';
import { useState, useEffect } from 'react';
import { coachEventCategory, coachEventDisplayState } from '../../utils/calendarEventAppearance.mjs';
import { Box, Stack, Text } from '@chakra-ui/react';
import ClubCalendarEventPreview from './ClubCalendarEventPreview';
import { apiFetch } from '../../utils/api';
import { clubText } from '../../i18n/clubText';
import { useTranslation } from 'react-i18next';
export default function CoachClubEventWrapper({event,children,onSelect,clubId}) {
 const { t } = useTranslation();
 const [previewRequested, setPreviewRequested] = useState(false);
 const [cancellation, setCancellation] = useState(null);
 const displayState = coachEventDisplayState(event);
 const statusKey = ({cancelled:'common.cancelled',validated:'status.validated',missed:'status.missed',pending:'status.cancellation_pending',review:'status.to_validate',upcoming:'status.upcoming'})[displayState];
 useEffect(() => {
  setCancellation(null);
  if (!previewRequested || !event.excuseDecision) return;
  let active = true;
  apiFetch('/coach-sessions/cancellation-requests?history=true').then(data => {
   if (active) setCancellation((data.requests || []).find(item => item.id === event._sourceId) || null);
  }).catch(() => {});
  return () => { active = false; };
 }, [previewRequested,event._sourceId,event.excuseDecision,event._updatedMs]);
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
   cancellationDetails={false} statusKey={statusKey} onPreviewOpen={() => setPreviewRequested(true)}
   actionLabel={clubText('Voir les détails et modifier')}
   details={<Stack spacing={1}>
     {displayState === 'cancelled' && <Box mb={2}>
       {event.excuseDecision && <Text fontSize="sm" fontWeight="bold">{t(`status.cancellation_${cancellation?.decision || event.excuseDecision}`)}</Text>}
       <Text fontSize="sm" whiteSpace="pre-wrap">{t('status.cancellation_reason')}: {cancellation?.reason || event.cancellationReason || t('status.reason_unavailable')}</Text>
       {(cancellation?.reviewNote || event.excuseReviewNote) && <Text fontSize="sm" whiteSpace="pre-wrap">{t('status.review_reason')}: {cancellation?.reviewNote || event.excuseReviewNote}</Text>}
     </Box>}
     <Text fontSize="sm" fontWeight="bold">{clubText(coachEventCategory(event)==='nutrition'?'Nutrition':coachEventCategory(event)==='internal'?'Interne':'Coaching individuel')}</Text>
     {event._clientName && <Text fontWeight="bold">{event._clientName}</Text>}
     {event._programmeName && <Text fontSize="sm">{event._programmeName}</Text>}
     {event._sessionTitle && <Text fontSize="sm">{event._sessionTitle}</Text>}
     {(event._note || event.notes || event.description) && <Text fontSize="sm" whiteSpace="pre-wrap">{event._note || event.notes || event.description}</Text>}
   </Stack>}>{children}</ClubCalendarEventPreview>;
 const load=async()=>{setLoading(true);setError('');try{const result=await apiFetch(`/clubs/coach-appointments/${event._sourceId}/participants`);setClients(result.clients);}catch{setError(clubText('Chargement impossible.'));}finally{setLoading(false);}};
 return <Box display="contents" onMouseEnter={load} onFocus={load}><ClubCalendarEventPreview statusKey={statusKey} event={{...event,title:event._sessionTitle||event.title}} clients={clients} loading={loading} error={error} onSelect={()=>onSelect(event)}>{children}</ClubCalendarEventPreview></Box>;
}
