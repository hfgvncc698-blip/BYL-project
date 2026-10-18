import CancellationReviewActions from './CancellationReviewActions';
import {useState} from 'react';
import {Badge,Text,Box} from '@chakra-ui/react';
import {useTranslation} from 'react-i18next';
import {clubText,clubLocale} from '../../i18n/clubText';
import {apiFetch} from '../../utils/api';
export default function CancellationMessage({request,canReview}){
 useTranslation();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const review=async (decision,reviewNote)=>{setBusy(true);setError('');try{await apiFetch(`/coach-sessions/${encodeURIComponent(request.sessionId)}/cancellation-review`,{method:'POST',body:JSON.stringify({decision,reviewNote,version:request.version})});window.dispatchEvent(new Event('cancellation-reviewed'));}catch(e){setError(clubText(e?.data?.error||'Enregistrement impossible.'));}finally{setBusy(false);}};
 return <Box><Text fontWeight="bold">{clubText('Annulations')} · {request.title}</Text><Text fontSize="xs">{new Date(request.startsAt).toLocaleString(clubLocale())}</Text><Text fontSize="sm" whiteSpace="pre-wrap" overflowWrap="anywhere" my={2}>{request.reason}</Text><Badge colorScheme={request.decision==='accepted'?'green':request.decision==='rejected'?'red':'orange'}>{clubText(request.decision==='accepted'?'Justification acceptée':request.decision==='rejected'?'Justification refusée':'En attente de validation')}</Badge>{request.decision==='pending'&&canReview&&<CancellationReviewActions busy={busy} onReview={review}/>}{error&&<Text role="alert" fontSize="xs">{error}</Text>}</Box>;
}
