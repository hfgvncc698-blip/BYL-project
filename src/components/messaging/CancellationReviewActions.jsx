import {useState} from 'react';
import {Box,Button,FormControl,FormLabel,HStack,Text,Textarea} from '@chakra-ui/react';
import {clubText} from '../../i18n/clubText';

export default function CancellationReviewActions({busy,onReview}) {
 const [rejecting,setRejecting]=useState(false),[note,setNote]=useState('');
 return <Box mt={3}>{rejecting&&<FormControl><FormLabel fontSize="sm">{clubText('Motif du refus (facultatif)')}</FormLabel><Textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={2000} isDisabled={busy} autoFocus/><Text fontSize="xs" mt={1}>{clubText('Cette explication sera envoyée au client avec votre décision.')}</Text></FormControl>}<HStack mt={2} justify="flex-end" flexWrap="wrap">{rejecting?<><Button size="sm" variant="ghost" isDisabled={busy} onClick={()=>setRejecting(false)}>{clubText('Annuler')}</Button><Button size="sm" isLoading={busy} onClick={()=>onReview('rejected',note.trim())}>{clubText('Confirmer le refus')}</Button></>:<><Button size="sm" variant="outline" isDisabled={busy} onClick={()=>setRejecting(true)}>{clubText('Refuser la justification')}</Button><Button size="sm" isDisabled={busy} onClick={()=>onReview('accepted','')}>{clubText('Accepter la justification')}</Button></>}</HStack></Box>;
}
