import {useState} from 'react';
import {Badge,Button,HStack,Text,Box} from '@chakra-ui/react';
import {useTranslation} from 'react-i18next';
import {clubText,clubLocale} from '../../i18n/clubText';
import {apiFetch} from '../../utils/api';
export default function CancellationMessage({request,canReview}){
 useTranslation();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const review=async decision=>{setBusy(true);setError('');try{await apiFetch(`/coach-sessions/${encodeURIComponent(request.sessionId)}/cancellation-review`,{method:'POST',body:JSON.stringify({decision,version:request.version})});}catch(e){setError(clubText(e?.data?.error||'Enregistrement impossible.'));}finally{setBusy(false);}};
 return <Box><Text fontWeight="bold">{clubText('Annulations')} · {request.title}</Text><Text fontSize="xs">{new Date(request.startsAt).toLocaleString(clubLocale())}</Text><Text fontSize="sm" whiteSpace="pre-wrap" overflowWrap="anywhere" my={2}>{request.reason}</Text><Badge colorScheme={request.decision==='accepted'?'green':request.decision==='rejected'?'red':'orange'}>{clubText(request.decision==='accepted'?'Justification acceptée':request.decision==='rejected'?'Justification refusée':'En attente de validation')}</Badge>{request.decision==='pending'&&canReview&&<HStack mt={2} flexWrap="wrap"><Button size="sm" variant="outline" isDisabled={busy} onClick={()=>review('rejected')}>{clubText('Refuser la justification')}</Button><Button size="sm" isDisabled={busy} onClick={()=>review('accepted')}>{clubText('Accepter la justification')}</Button></HStack>}{error&&<Text role="alert" fontSize="xs">{error}</Text>}</Box>;
}
