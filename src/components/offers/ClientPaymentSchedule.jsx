import {useId,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {clubText,clubLocale} from '../../i18n/clubText';
import {Box,Text,Stack,HStack,Badge,Progress,Button} from '@chakra-ui/react';
import {formatClubMoney} from '../../utils/clubMoney';
import {offerToday} from '../../utils/coachOfferSchedule';
import {clubPaymentProgress} from '../../utils/clubPaymentProgress.mjs';

export default function ClientPaymentSchedule({payments,currency,scale=100,start,action}){
 useTranslation();
 const [expanded,setExpanded]=useState(false);
 const detailsId=useId();
 const today=offerToday();
 const rows=[...payments].sort((a,b)=>a.date.localeCompare(b.date));
 const next=rows.find(p=>p.status!=='paid');
 const progress=start?clubPaymentProgress({id:'client',start},rows.map(p=>({...p,contractId:'client',dueDate:p.date})),today):null;
 const money=(value,p)=>formatClubMoney(value,p.currency||currency,p.unitScale||scale,clubLocale());
 const date=value=>new Date(value.length===10?value+'T12:00:00':value).toLocaleDateString(clubLocale());
 return <Box mt={4}>
  {next?<Box>
   <HStack justify="space-between" flexWrap="wrap" fontSize="sm" gap={2}>
    <Text>{clubText(next.date<today?'Paiement en retard':next.date===today?'Paiement aujourd’hui':'Prochain paiement')}</Text>
    {progress&&<Text fontWeight="600">{progress.days<0?clubText('{{count}} jours de retard',{count:-progress.days}):progress.days===0?date(next.date):clubText('Dans {{count}} jours',{count:progress.days})}</Text>}
   </HStack>
   <Text mt={1} fontSize="sm">{date(next.date)} · {money(Math.max(0,next.amount-(next.received||0)),next)}</Text>
   {progress&&<Progress mt={2} size="xs" borderRadius="full" value={progress.percent} colorScheme={progress.days<0?'red':progress.days<=3?'orange':'blue'} aria-label={clubText('Progression vers le prochain paiement')}/>}
  </Box>:rows.length>0?<Text fontSize="sm" color="gray.500">{clubText('Aucune échéance restante pour ce contrat.')}</Text>:null}
  <HStack mt={4} justify="space-between" align="center" flexWrap="wrap" gap={2}>
   <Button size="sm" variant="link" color="inherit" textAlign="start" whiteSpace="normal" aria-expanded={expanded} aria-controls={detailsId} onClick={()=>setExpanded(value=>!value)}><Box as="span" aria-hidden="true" me={1}>{expanded?'▾':'▸'}</Box>{clubText('Voir les paiements')} ({payments.length})</Button>
   {action}
  </HStack>
  <Box id={detailsId} hidden={!expanded}>
   <Text fontSize="xs" mt={2}>{clubText('Les paiements sont effectués en dehors du site. Leur réception est confirmée par votre professionnel ou votre club.')}</Text>
   <Stack mt={2} spacing={2} maxH="320px" overflowY="auto">{rows.map(p=><Box key={p.id} py={2} borderBottomWidth="1px">
    <HStack justify="space-between" flexWrap="wrap"><Text fontSize="sm">{date(p.date)} · {money(p.amount,p)}</Text><Badge colorScheme={p.status==='paid'?'green':p.date>today?'blue':'orange'}>{clubText(p.status==='paid'?'Réception confirmée':p.status==='partial'?'Partiellement reçu':p.status==='unpaid'?'Non reçu':p.date>today?'À venir':'Réception à confirmer')}</Badge></HStack>
    {p.received>0&&<Text fontSize="xs">{clubText('Reçu :')} {money(p.received,p)}{p.paidDate?clubText(' · Payé le {{value0}}',{value0:date(p.paidDate)}):''}{p.received<p.amount&&<> · {clubText('Reste :')} {money(p.amount-p.received,p)}</>}</Text>}
    {p.validatedAt&&<Text fontSize="xs">{clubText('Vérifié le')} {new Date(p.validatedAt).toLocaleString(clubLocale())}</Text>}
   </Box>)}{!payments.length&&<Text fontSize="sm">{clubText('Aucune échéance enregistrée.')}</Text>}</Stack>
  </Box>
 </Box>;
}
