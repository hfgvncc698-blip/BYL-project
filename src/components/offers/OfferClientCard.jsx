import {useTranslation} from 'react-i18next';
import {clubText,clubLocale} from '../../i18n/clubText';
import { useEffect, useState } from 'react';
import { Box, Badge, Button, Flex, HStack, Progress, Text } from '@chakra-ui/react';
import { FiChevronRight } from 'react-icons/fi';
import { offerSchedule, offerToday } from '../../utils/coachOfferSchedule';
import { useAppTheme } from '../../styles/appTheme';

export default function OfferClientCard({contract,checks,money,onOpen,onSummary,onEdit}) {
 useTranslation();
  const theme=useAppTheme();
  const [today,setToday]=useState(offerToday);
  useEffect(()=>{const timer=setInterval(()=>setToday(offerToday()),60000);return ()=>clearInterval(timer);},[]);
  const monthly=contract.type==='recurring';
  const rows=monthly?offerSchedule(contract):[];
  const paid=row=>{const check=checks[`${contract.id}:${row.date}`];return (typeof check==='string'?check:check?.status)==='paid';};
  const pending=rows.filter(row=>!paid(row));
  const overdue=pending.some(row=>row.date<=today);
  const next=pending.find(row=>row.date>today);
  const days=next?Math.round((Date.parse(next.date)-Date.parse(today))/86400000):0;
  const index=next?rows.findIndex(row=>row.date===next.date):-1;
  const cycleStart=index>0?rows[index-1].date:contract.start;
  const cycleDays=next?Math.max(1,(Date.parse(next.date)-Date.parse(cycleStart))/86400000):1;
  const expired=contract.expiresAt&&contract.expiresAt<today;
  const remaining=contract.remaining??contract.quantity;
  const value=monthly?(next?Math.min(100,Math.max(0,(1-days/cycleDays)*100)):100):Math.min(100,Math.max(0,(contract.quantity-remaining)/Math.max(1,contract.quantity)*100));
  const label=contract.status==='cancelled'?clubText("Contrat annulé"):expired&&!monthly?clubText("Validité terminée"):monthly?(next?clubText('Paiement dans {{days}} jours',{days}):overdue?clubText("Paiement à confirmer"):clubText("Échéances réglées")): clubText("{{value0}}/{{value1}} séances restantes",{value0:remaining,value1:contract.quantity});
  return <Flex {...theme.cardProps} px={4} py={3} gap={{base:3,md:5}} align={{base:'stretch',md:'center'}} direction={{base:'column',md:'row'}}>
    <Box flex="1" minW={0}><Button variant="link" size="sm" color="inherit" whiteSpace="normal" textAlign="start" onClick={onSummary}>{contract.clientName}</Button><Text fontSize="xs" color={theme.mutedText} mt={0.5}>{contract.name} · {money(contract.price,contract.currency)}{monthly?clubText(" / mois"):''}</Text></Box>
    <Box flex="1" minW={0}><HStack justify="space-between" spacing={2} mb={1.5} flexWrap="wrap"><Text fontSize="xs" fontWeight="700">{label}</Text>{expired&&!monthly?<Badge fontSize="9px" colorScheme="gray">{clubText("Expiré")}</Badge>:monthly&&overdue?<Badge fontSize="9px" colorScheme="orange">{clubText("À confirmer")}</Badge>:!monthly&&remaining<=1?<Badge fontSize="9px" colorScheme="orange">{clubText("À renouveler")}</Badge>:null}</HStack><Text fontSize="10px" mb={1} color={theme.mutedText}>{contract.reserved||0} {clubText("réservée(s) ·")} {contract.available??remaining} {clubText("disponible(s)")}</Text><Progress size="xs" borderRadius="full" value={value} colorScheme={monthly?(overdue?'orange':'blue'):remaining<=1?'orange':'teal'} aria-label={monthly?clubText("Progression vers le prochain paiement"):clubText("Séances réalisées")}/>{!monthly&&contract.expiresAt&&<Text fontSize="10px" color={theme.mutedText} mt={1}>{clubText("Valable jusqu’au")} {new Date(contract.expiresAt+'T12:00:00').toLocaleDateString(clubLocale())}</Text>}{monthly&&next&&<Text fontSize="10px" color={theme.mutedText} mt={1}>{clubText("Prochaine échéance :")} {new Date(`${next.date}T12:00:00`).toLocaleDateString(clubLocale())}</Text>}</Box>
    <Button size="xs" variant="ghost" onClick={onEdit}>{clubText("Gérer")}</Button>
    <Button size="xs" variant="ghost" rightIcon={<FiChevronRight/>} flexShrink={0} alignSelf={{base:'end',md:'center'}} onClick={onOpen}>{clubText("Échéances")}</Button>
  </Flex>;
}
