import {clientClubOfferGroups} from '../../utils/clientClubOfferGroups.mjs';
import ClientPaymentSchedule from '../offers/ClientPaymentSchedule';
import {useEffect,useState} from 'react';
import {Badge,Box,Button,Heading,HStack,SimpleGrid,Stack,Text} from '@chakra-ui/react';
import {useTranslation} from 'react-i18next';
import {apiFetch} from '../../utils/api';
import {clubText,clubLocale} from '../../i18n/clubText';
import {formatClubMoney,storedScale} from '../../utils/clubMoney';
import {useAppTheme} from '../../styles/appTheme';

const frequencies={monthly:'Mensuel',yearly:'Annuel',once:'Paiement unique'};
const services={coaching:'Coaching',nutrition:'Nutrition',group:'Cours collectifs',club:'Accès au club',club_group:'Accès au club + cours collectifs'};
export function useClientClubSubscriptions(){
 const [groups,setGroups]=useState(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  let active=true;
  const load=()=>apiFetch('/clubs/my-subscriptions').then(d=>{if(active){setGroups(d.groups);setError('');}}).catch(()=>{if(active)setError('Impossible de charger les abonnements.');});
  load();window.addEventListener('focus',load);const timer=setInterval(load,30000);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);};
 },[refresh]);
 return {groups,error,refresh:()=>setRefresh(n=>n+1)};
}

export default function ClientClubSubscriptions({data,accessOnly=false,clubId,embedded=false}){
 useTranslation();
 const theme=useAppTheme();
 const {groups:allGroups,error,refresh}=data;
 const groups=allGroups?clientClubOfferGroups(allGroups,{accessOnly,clubId}):null;
 const date=value=>value?new Date(value.length===10?`${value}T12:00:00`:value).toLocaleDateString(clubLocale()):'—';
 const money=(value,row)=>formatClubMoney(value,row.currency,storedScale(row),clubLocale());
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(groups?.length===0&&!error)return null;
 return <Box {...(embedded?{}:theme.cardProps)} p={embedded?0:{base:4,md:5}} borderTopWidth={embedded?0:"3px"} borderTopColor="purple.400">
  {!embedded&&<HStack justify="space-between" gap={3} mb={4}><Heading size="md">{clubText('Mes offres dans les clubs')}</Heading><Button size="sm" variant="ghost" onClick={refresh}>{clubText('Actualiser')}</Button></HStack>}
  {error&&<Text role="alert">{clubText(error)}</Text>}
  {!groups&&!error&&<Text>{clubText('Chargement…')}</Text>}
  {groups?.length===0&&<Text>{clubText('Aucun abonnement ou paiement enregistré par vos clubs.')}</Text>}
  <Stack spacing={6}>{groups?.map(g=><Box key={`${g.clubId}:${g.clientId}`}>
   {!embedded&&<Heading size="sm" mb={3}>{g.clubName}</Heading>}
   <SimpleGrid columns={{base:1,lg:2}} gap={3} alignItems="start">{g.contracts.map(c=><Box key={c.id} borderWidth="1px" borderRadius="xl" p={4} minW={0}>
    <HStack justify="space-between" align="start" gap={3}><Heading size="sm" overflowWrap="anywhere">{c.name}</Heading><Badge flexShrink={0} colorScheme={c.end<today?'gray':c.start>today?'blue':'green'}>{clubText(c.end<today?'Terminé':c.start>today?'À venir':'Actif')}</Badge></HStack>
    {c.description&&<Text mt={2} fontSize="sm" color={theme.mutedText} whiteSpace="pre-wrap" overflowWrap="anywhere">{c.description}</Text>}
    {!c.importedOpening&&<Box mt={4}><Text fontSize="xl" fontWeight="800">{money(c.amountCents,c)}</Text><Text fontSize="sm" color={theme.mutedText}>{clubText(frequencies[c.frequency])}</Text></Box>}
    {services[c.service]&&<Text mt={2} fontSize="sm" color={theme.mutedText}>{clubText(services[c.service])}</Text>}
    {c.discount&&<Text mt={2} fontSize="xs" color={theme.mutedText}>{clubText('Tarif initial')} : {money(c.baseAmountCents,c)} · {clubText('Réduction')} : {c.discount.type==='percent'?`${c.discount.value/100} %`:money(c.discount.value,c)}</Text>}
    <Stack spacing={1} mt={3} fontSize="sm"><Text>{clubText('Début de validité')} : {date(c.start)}</Text><Text>{clubText('Fin de validité (incluse)')} : {date(c.end)}</Text></Stack>
    <ClientPaymentSchedule start={c.start} payments={(g.dues||[]).filter(d=>d.contractId===c.id)} currency={c.currency} scale={storedScale(c)}/>
   </Box>)}</SimpleGrid>
   {g.payments.some(p=>!p.contractId)&&<Box as="details" mt={4}><Box as="summary" cursor="pointer" fontWeight="bold" fontSize="sm">{clubText('Autres règlements')} ({g.payments.filter(p=>!p.contractId).length})</Box><Stack mt={2} spacing={2} maxH="320px" overflowY="auto">{g.payments.filter(p=>!p.contractId).map(p=><Box key={p.id} borderWidth="1px" borderRadius="lg" p={3}><HStack justify="space-between" flexWrap="wrap"><Text fontWeight="bold">{p.label}</Text><Badge colorScheme={p.status==='paid'?'green':'orange'}>{clubText(p.status==='paid'?'Reçu':'Partiel')}</Badge></HStack><Text>{money(p.amountCents,p)} · {clubText('Date du règlement reçu')} : {date(p.paidDate)}</Text>{p.validatedAt&&<Text fontSize="xs">{clubText('Validé le {{date}}',{date:date(p.validatedAt)})}</Text>}{p.status==='partial'&&<Text fontSize="sm">{clubText('Reste :')} {money(Math.max(0,p.dueCents-p.amountCents),p)}</Text>}</Box>)}</Stack></Box>}
  </Box>)}</Stack>
 </Box>;
}
