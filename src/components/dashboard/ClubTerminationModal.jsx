import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Modal,ModalOverlay,ModalContent,ModalHeader,ModalCloseButton,ModalBody,ModalFooter,Button,Stack,Text,Textarea,Select,Input,FormControl,FormLabel,Box,Badge} from '@chakra-ui/react';
import {apiFetch} from '../../utils/api';
import {clubText,clubLocale} from '../../i18n/clubText';
import {formatClubMoney} from '../../utils/clubMoney';
const labels={pending:'Demande en attente',accepted:'Résiliation acceptée',rejected:'Résiliation refusée',end_of_term:'Départ à la fin de l’abonnement'};
export default function ClubTerminationModal({club,onClose,memberUid,ownerView=false}){
 useTranslation();
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[status,setStatus]=useState('end_of_term'),[end,setEnd]=useState('');
 const url=club?`/clubs/termination/${encodeURIComponent(club.id)}`:'';
 useEffect(()=>{if(!url)return;let active=true;setData(null);setNote('');setError('');apiFetch(url+(memberUid?`?memberUid=${encodeURIComponent(memberUid)}`:'')).then(d=>{if(active)setData(d);}).catch(()=>{if(active)setError('Chargement impossible.');});return()=>{active=false;};},[url,memberUid]);
 const send=async()=>{setBusy(true);setError('');try{const result=await apiFetch(ownerView?`${url}/${encodeURIComponent(memberUid)}/decision`:url,{method:'POST',body:JSON.stringify(ownerView?{status,end,note,revision:data.request.revision}:{reason:note})});setData(d=>({...d,request:result.request}));window.dispatchEvent(new Event('club-memberships-changed'));}catch(e){setError(e?.data?.error||'Enregistrement impossible.');}finally{setBusy(false);}};
 const request=data?.request,canSend=data&&(ownerView?request?.status==='pending':!request||request.status==='rejected');
 return <Modal isOpen={!!club} onClose={()=>!busy&&onClose()} size="xl" scrollBehavior="inside" isCentered><ModalOverlay/><ModalContent mx={4}><ModalHeader>{clubText('Demande de résiliation')} · {club?.name}</ModalHeader><ModalCloseButton isDisabled={busy}/><ModalBody><Stack spacing={4}>
 {!data&&!error&&<Text>{clubText('Chargement…')}</Text>}
 {request&&<Box borderWidth="1px" borderRadius="lg" p={3}><Badge>{clubText(labels[request.status])}</Badge><Text fontWeight="bold" mt={2}>{request.clientName}</Text><Text whiteSpace="pre-wrap">{request.reason}</Text>{request.note&&<Text mt={2} whiteSpace="pre-wrap">{request.note}</Text>}{request.end&&<Text mt={2}>{clubText('Accès conservés jusqu’au {{date}} inclus.',{date:request.end})}</Text>}</Box>}
 {data&&<><Text>{clubText('La demande est envoyée au club dans la messagerie. Vos accès restent actifs tant que le départ n’est pas validé.')}</Text>
 {data.contracts.map(c=><Text key={c.id}>{c.name} · {clubText('Fin de validité (incluse)')} : {c.end}</Text>)}
 <Box as="details"><Box as="summary" cursor="pointer" fontWeight="bold">{clubText('Échéances restant à régler')} ({data.dues.length})</Box>{data.dues.map((d,i)=><Text key={`${d.id}-${i}`} fontSize="sm" mt={2}>{d.label} · {d.dueDate} · {formatClubMoney(d.amountCents,d.currency||'EUR',d.unitScale||100,clubLocale())}</Text>)}</Box>
 <Text fontSize="sm">{clubText('Les échéances passées ou déjà enregistrées restent conservées. Aucun remboursement ni prorata automatique n’est effectué.')}</Text></>}
 {canSend&&<>{ownerView&&<><FormControl><FormLabel>{clubText('Décision du club')}</FormLabel><Select value={status} onChange={e=>setStatus(e.target.value)}><option value="end_of_term">{clubText('Départ à la fin de l’abonnement')}</option><option value="accepted">{clubText('Accepter à une date choisie')}</option><option value="rejected">{clubText('Refuser la demande')}</option></Select></FormControl>{status==='accepted'&&<FormControl><FormLabel>{clubText('Dernier jour d’accès inclus')}</FormLabel><Input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></FormControl>}<Text fontSize="sm">{clubText('La date validée fixe la fin des accès et des abonnements. Les échéances futures non enregistrées après cette date seront retirées.')}</Text></>}
 <FormControl isRequired><FormLabel>{clubText(ownerView?'Réponse au membre':'Motif de la demande')}</FormLabel><Textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={2000}/></FormControl></>}
 {error&&<Text role="alert" color="red.500">{clubText(error)}</Text>}
 </Stack></ModalBody><ModalFooter gap={2}><Button variant="ghost" onClick={onClose} isDisabled={busy}>{clubText('Fermer')}</Button>{canSend&&<Button isLoading={busy} isDisabled={!note.trim()||(ownerView&&status==='accepted'&&!end)} onClick={send}>{clubText(ownerView?'Envoyer la décision':'Envoyer la demande au club')}</Button>}</ModalFooter></ModalContent></Modal>;
}
