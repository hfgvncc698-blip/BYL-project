import {useNavigate} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {clubText,clubLocale} from '../../i18n/clubText';
import ClientPaymentSchedule from './ClientPaymentSchedule';
import {currencyScale,formatClubMoney} from '../../utils/clubMoney';
import {clientProfessionalOffers} from '../../utils/clientProfessionalOffers.mjs';
import {followupColor} from '../../utils/followupColor';
import {useEffect,useState} from 'react';
import {Box,Heading,Stack,Text,HStack,Progress,SimpleGrid,Badge,Button,Circle} from '@chakra-ui/react';
import {apiFetch} from '../../utils/api';
import {useAppTheme} from '../../styles/appTheme';

const states={active:'Actif',exhausted:'Épuisé',expired:'Terminé',scheduled:'À venir',cancelled:'Annulé'};
const services={coaching:'Accompagnement coaching',nutrition:'Accompagnement nutrition',mixed:'Accompagnement sport et nutrition'};
export default function ClientCoachingPacks({hiddenFollowupIds=[]}){
 useTranslation();
 const theme=useAppTheme();
 const navigate=useNavigate();
 const [allGroups,setGroups]=useState([]),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  let active=true;
  const load=()=>apiFetch('/coach-offers/mine').then(d=>{if(active){setGroups(d.groups);setError('');}}).catch(()=>{if(active)setError('Vos packs de coaching sont momentanément indisponibles.');});
  load();const timer=setInterval(load,30000);window.addEventListener('focus',load);window.addEventListener('client-cancellation-updated',load);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('client-cancellation-updated',load);};
 },[refresh]);
 const groups=clientProfessionalOffers(allGroups.filter(g=>!hiddenFollowupIds.includes(g.clientId)));
 const date=value=>value?new Date(value+'T12:00:00').toLocaleDateString(clubLocale()):'—';
 const money=(value,c)=>formatClubMoney(Math.round(value*currencyScale(c.currency)),c.currency,currencyScale(c.currency),clubLocale());
 if(!groups.length&&!error)return null;
 return <Box {...theme.cardProps} p={{base:4,md:5}} borderTopWidth="3px" borderTopColor="teal.400">
  <HStack justify="space-between" gap={3} mb={4}><Heading size="md">{clubText('Mes offres avec les professionnels')}</Heading><Button size="sm" variant="ghost" onClick={()=>setRefresh(n=>n+1)}>{clubText('Actualiser')}</Button></HStack>
  {error&&<Text role="alert" fontSize="sm">{clubText(error)}</Text>}
  <Stack spacing={6}>{groups.map(g=><Box key={g.coachId}>
   <HStack mb={3} spacing={2}><Circle size="10px" bg={followupColor(g.coachId)} flexShrink={0}/><Heading size="sm">{g.coachName}</Heading></HStack>
   <SimpleGrid columns={{base:1,lg:2}} gap={3} alignItems="start">{g.contracts.map(c=><Box key={c.id} borderWidth="1px" borderRadius="xl" p={4} minW={0}>
    <HStack justify="space-between" align="start" gap={3}><Heading size="sm" overflowWrap="anywhere">{c.name}</Heading><Badge flexShrink={0} colorScheme={c.state==='active'?'green':c.state==='scheduled'?'blue':'gray'}>{clubText(states[c.state]||'Actif')}</Badge></HStack>
    {c.description&&<Text mt={2} fontSize="sm" color={theme.mutedText} whiteSpace="pre-wrap" overflowWrap="anywhere">{c.description}</Text>}
    <Box mt={4}><Text fontSize="xl" fontWeight="800">{money(c.price,c)}</Text><Text fontSize="sm" color={theme.mutedText}>{clubText(c.type==='recurring'?'Mensuel':'Paiement unique')}</Text></Box>
    <Text mt={2} fontSize="sm" color={theme.mutedText}>{clubText(services[c.service])}</Text>
    {c.discount&&<Text mt={2} fontSize="xs" color={theme.mutedText}>{clubText('Tarif initial')} : {money(c.basePrice,c)} · {clubText('Réduction')} : {c.discount.type==='percent'?`${c.discount.value/100} %`:formatClubMoney(c.discount.value,c.currency,currencyScale(c.currency),clubLocale())}</Text>}
    <Stack spacing={1} mt={3} fontSize="sm"><Text>{clubText('Début de validité')} : {date(c.start)}</Text><Text>{clubText('Fin de validité (incluse)')} : {c.expiresAt?date(c.expiresAt):clubText('Sans expiration')}</Text></Stack>
    <Box mt={3}><Text fontSize="sm">{clubText('{{remaining}} / {{total}} séances restantes',{remaining:c.remaining,total:c.quantity})}</Text><Text fontSize="sm" color={theme.mutedText}>{clubText('{{reserved}} réservées · {{available}} disponibles',{reserved:c.reserved||0,available:c.available??c.remaining})}</Text><Progress mt={2} size="xs" value={Math.max(0,Math.min(100,100*(c.quantity-c.remaining)/Math.max(1,c.quantity)))} colorScheme="blue" borderRadius="full" aria-label={clubText('Séances utilisées')}/></Box>
    {c.openingUsed>0&&<Text mt={2} fontSize="xs" color={theme.mutedText}>{c.openingUsed} {clubText('séance(s) déjà utilisée(s) à la reprise du pack.')}</Text>}
    <ClientPaymentSchedule start={c.start} payments={c.payments||[]} currency={c.currency} scale={currencyScale(c.currency)} action={<Button size="sm" variant="outline" onClick={()=>navigate('/messages',{state:{packRequest:{text:clubText('Bonjour, je souhaiterais acheter un nouveau pack « {{name}} » ({{quantity}} séances). Pouvez-vous m’indiquer les modalités ?',{name:c.name,quantity:c.quantity,interpolation:{escapeValue:false}}),name:c.name}}})}>{clubText('Demander un nouveau pack')}</Button>}/>

   </Box>)}</SimpleGrid>
  </Box>)}</Stack>
 </Box>;
}
