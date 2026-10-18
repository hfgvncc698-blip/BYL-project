import {clubText,clubLocale} from '../../i18n/clubText';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../AuthContext';
import { accountSignature, createOfferReminder } from '../../utils/offerReminder';
import OfferClientSummary from './OfferClientSummary';
import { FiCreditCard, FiChevronRight } from 'react-icons/fi';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Badge, Button, Heading, HStack, Stack, Text, Icon, Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, FormControl, FormLabel, Input, Textarea } from '@chakra-ui/react';
import { useOfferPreview } from './OfferPreviewStore';
import { offerSchedule, offerToday } from '../../utils/coachOfferSchedule';
import { currencyScale, formatClubMoney, amountUnits } from '../../utils/clubMoney';
export default function OfferPaymentPreview({uid,compact=false,contractId=null,clientId=null,onClearFilter}) {
 useTranslation();
  const {t,i18n}=useTranslation();
  const {user}=useAuth();
  const locale=i18n.resolvedLanguage||i18n.language||'fr';
  const [data,update]=useOfferPreview(uid);
  const [today,setToday]=useState(offerToday);
  useEffect(()=>{const timer=setInterval(()=>setToday(offerToday()),60000);return ()=>clearInterval(timer);},[]);
  const rows=data.contracts.flatMap(c=>offerSchedule(c,currencyScale(c.currency)).map(r=>({...r,contract:c,id:`${c.id}:${r.date}`}))).sort((a,b)=>a.date.localeCompare(b.date));
  const checkFor=id=>typeof data.checks[id]==='string'?{status:data.checks[id]}:(data.checks[id]||{});
  const due=rows.filter(r=>r.date<=today&&checkFor(r.id).status!=='paid');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const [payment,setPayment]=useState(null);
  const [summaryClient,setSummaryClient]=useState(null);
  const [reminder,setReminder]=useState(null);
  const confirm=async(row,status,extra={})=>{if(saving)return false;setSaving(true);try{setError('');await update(s=>{const raw=s.checks[row.id];const previous=typeof raw==='string'?{status:raw}:raw||{};const checkedAt=new Date().toISOString();return {...s,checks:{...s.checks,[row.id]:{...previous,status,checkedAt,...extra,history:[...(previous.history||[]),{status,checkedAt,paidCents:extra.paidCents??previous.paidCents??0,paidDate:extra.paidDate??previous.paidDate??''}]}}};});return true;}catch(e){setError(e.data?.error||clubText("Confirmation impossible. Réessayez."));return false;}finally{setSaving(false);}};
  const openPayment=row=>{setError('');setPayment({row,amount:String(row.amount/currencyScale(row.contract.currency)),date:today});};
  const paymentUnits=payment?amountUnits(payment.amount,payment.row.contract.currency):null;
  const validPayment=payment && payment.amount!=='' && paymentUnits!==null && paymentUnits>0 && paymentUnits<=payment.row.amount && /^\d{4}-\d{2}-\d{2}$/.test(payment.date) && payment.date<=today;
  const savePayment=async()=>{if(!validPayment)return;if(await confirm(payment.row,paymentUnits===payment.row.amount?'paid':'partial',{paidCents:paymentUnits,paidDate:payment.date}))setPayment(null);};
  const openReminder=row=>{
    setError('');
    setReminder({row,...createOfferReminder({row:{...row,amount:Math.max(0,row.amount-(checkFor(row.id).paidCents||0))},locale:row.contract.clientLanguage||locale,t:(key,options)=>t(key,{...options,lng:row.contract.clientLanguage||locale}),signature:accountSignature(user),formatMoney:formatClubMoney,scaleFor:currencyScale})});
  };
  const finishReminder=async send=>{
    if(!reminder || (send&&(!reminder.subject.trim()||!reminder.body.trim())))return;
    if(await confirm(reminder.row,'unpaid',{sendReminder:send,...(send?{subject:reminder.subject.trim(),body:reminder.body.trim()}:{})}))setReminder(null);
  };

  const filteredRows=rows.filter(r=>(!contractId||r.contract.id===contractId)&&(!clientId||r.contract.clientId===clientId));
  const pendingRows=filteredRows.filter(r=>checkFor(r.id).status!=='paid'&&r.date<=today);
  const upcomingRows=filteredRows.filter(r=>checkFor(r.id).status!=='paid'&&r.date>today);
  const paidRows=filteredRows.filter(r=>checkFor(r.id).status==='paid').reverse();
  const renderRow=r=>{
      const check=checkFor(r.id), paid=check.status==='paid';
      return <Box key={r.id} borderTopWidth="1px" pt={3}>
        <HStack justify="space-between" flexWrap="wrap"><Box><HStack flexWrap="wrap"><Button variant="link" color="inherit" whiteSpace="normal" textAlign="start" onClick={()=>setSummaryClient(r.contract)}>{r.contract.clientName}</Button><Text fontSize="sm">· {r.contract.name}</Text></HStack><Text fontSize="sm">{r.date} · {formatClubMoney(r.amount,r.contract.currency,currencyScale(r.contract.currency),clubLocale())}</Text>{r.prorata&&<Text fontSize="xs">{clubText("Prorata :")} {r.days}/{r.cycleDays} {clubText("jours")}</Text>}</Box><Badge colorScheme={paid?'green':check.status==='unpaid'?'red':'orange'}>{paid?clubText("Reçu"):check.status==='partial'?clubText("Partiel"):check.status==='unpaid'?clubText("Non reçu"):r.date<=today?clubText("À confirmer"):clubText("À venir")}</Badge></HStack>
        {paid?<Text mt={2} fontSize="sm" color="green.600" _dark={{color:'green.300'}}>{clubText("Réception validée")}{check.checkedAt?clubText(" le {{value0}}",{value0:new Date(check.checkedAt).toLocaleString(clubLocale())}):''} · {formatClubMoney(r.amount,r.contract.currency,currencyScale(r.contract.currency),clubLocale())} {clubText("reçus.")}</Text>:r.date<=today&&<><Text mt={2} fontSize="sm">{clubText("Le règlement a-t-il bien été reçu ?")}</Text><HStack mt={2} flexWrap="wrap"><Button size="sm" onClick={()=>openPayment(r)}>{clubText("Valider la réception")}</Button><Button size="sm" variant="outline" onClick={()=>openReminder(r)}>{clubText("Non reçu")}</Button></HStack></>}
        {check.status==='partial'&&<Text mt={2} fontSize="sm">{clubText("Reçu :")} {formatClubMoney(check.paidCents,r.contract.currency,currencyScale(r.contract.currency),locale)} {clubText("· Reste :")} {formatClubMoney(r.amount-check.paidCents,r.contract.currency,currencyScale(r.contract.currency),locale)}</Text>}
        {check.emailState==='skipped'&&<Text mt={2} fontSize="xs">{clubText("Paiement marqué non reçu · Aucun mail envoyé. Contact par vos propres moyens.")}</Text>}
        {check.emailState==='sent'&&<Text mt={2} fontSize="xs" color="green.600">{clubText("Relance envoyée le")} {new Date(check.emailSentAt||check.checkedAt).toLocaleString(clubLocale())}</Text>}{['sending','failed','uncertain'].includes(check.emailState)&&<Text mt={2} fontSize="xs" color="orange.600">{check.emailState==='sending'?clubText("Envoi en cours"):check.emailState==='failed'?clubText("Mail non envoyé : vous pouvez réessayer."):clubText("Envoi incertain : vérifiez la réception auprès du client.")}</Text>}{check.emailState==='simulated'&&<Text mt={2} fontSize="xs">{clubText("Relance simulée")}{check.checkedAt?clubText(" le {{value0}}",{value0:new Date(check.checkedAt).toLocaleString(clubLocale())}):''} {clubText("· Aucun mail envoyé au client.")}</Text>}
      </Box>;
  };
  if(compact&&!due.length)return null;
  if(compact)return <HStack as={Link} to="/coach/offers?tab=payments" aria-label={clubText('Paiements à vérifier : {{count}}',{count:due.length})} justify="space-between" spacing={2} py={2} mb={3} borderBottomWidth="1px" borderColor="blackAlpha.100" color="gray.800" _dark={{color:'gray.100',borderColor:'whiteAlpha.100'}} _hover={{textDecoration:'none',color:'blue.600',_dark:{color:'blue.300'}}}>
    <HStack spacing={2.5}><Icon as={FiCreditCard} boxSize={4} color="gray.500" _dark={{color:'gray.400'}}/><Box><Text fontSize="xs" fontWeight="700">{clubText("Paiements")}</Text><Text fontSize="11px" color="gray.500" _dark={{color:'gray.400'}}>{clubText("À vérifier aujourd’hui")}</Text></Box></HStack>
    <HStack spacing={1.5}><Box minW="23px" h="23px" px={1} borderRadius="full" bg="gray.100" color="gray.700" _dark={{bg:'whiteAlpha.200',color:'gray.100'}} display="grid" placeItems="center" fontSize="xs" fontWeight="800">{due.length}</Box><Icon as={FiChevronRight} boxSize={3.5}/></HStack>
  </HStack>;
  return <Box borderWidth="1px" borderRadius="2xl" p={5} bg="white" _dark={{bg:'gray.800'}}>
    <HStack justify="space-between" flexWrap="wrap"><Heading size="sm">{clubText("Échéances et vérification des paiements")}</Heading><Badge colorScheme="teal">{clubText("Suivi des règlements")}</Badge></HStack>
    <Text fontSize="sm" mt={2}>{clubText("Paiements effectués en dehors du site. Confirmez leur réception après vérification.")}</Text>
    {contractId&&<Button variant="ghost" size="sm" mt={2} onClick={onClearFilter}>{clubText("Voir toutes les échéances")}</Button>}
    {(error||data.error)&&<Text role="alert" color="red.500">{error||data.error}</Text>}
    <Stack spacing={3} mt={4}>{pendingRows.map(renderRow)}</Stack>
    {!pendingRows.length&&<Text mt={4} fontSize="sm">{clubText("Aucun paiement à confirmer pour le moment.")}</Text>}
    <Box as="details" mt={5}><Box as="summary" cursor="pointer" fontSize="sm" fontWeight="bold" py={2}>{clubText("Échéances à venir (")}{upcomingRows.length})</Box><Stack spacing={3} mt={2}>{upcomingRows.map(renderRow)}</Stack></Box>
    <Box as="details" mt={3}><Box as="summary" cursor="pointer" fontSize="sm" fontWeight="bold" py={2}>{clubText("Paiements validés (")}{paidRows.length})</Box><Stack spacing={3} mt={2}>{paidRows.map(renderRow)}</Stack></Box>
    {summaryClient&&<OfferClientSummary uid={uid} client={summaryClient} onClose={()=>setSummaryClient(null)}/>}
    <Modal isOpen={!!payment} onClose={()=>setPayment(null)} isCentered><ModalOverlay/><ModalContent mx={3}><ModalHeader>{clubText("Enregistrer le règlement")}</ModalHeader><ModalCloseButton/><ModalBody><Stack spacing={3}><Text>{payment?.row.contract.clientName} · {payment?.row.contract.name}</Text><FormControl><FormLabel>{clubText("Total reçu pour cette échéance (")}{payment?.row.contract.currency||'EUR'})</FormLabel><Input type="number" min={0} max={payment?payment.row.amount/currencyScale(payment.row.contract.currency):undefined} step={1/currencyScale(payment?.row.contract.currency)} value={payment?.amount??''} onChange={e=>setPayment(p=>({...p,amount:e.target.value}))}/></FormControl><Text fontSize="xs">{clubText("Indiquez le total reçu, y compris les acomptes déjà enregistrés. Un montant inférieur sera noté « Partiel ».")}</Text><FormControl><FormLabel>{clubText("Date du règlement reçu")}</FormLabel><Input type="date" max={today} value={payment?.date||''} onChange={e=>setPayment(p=>({...p,date:e.target.value}))}/></FormControl>{(error||data.error)&&<Text role="alert" color="red.500">{error||data.error}</Text>}</Stack></ModalBody><ModalFooter gap={2}><Button variant="ghost" onClick={()=>setPayment(null)}>{clubText("Annuler")}</Button><Button isLoading={saving} isDisabled={!validPayment} onClick={savePayment}>{clubText("Enregistrer")}</Button></ModalFooter></ModalContent></Modal>
    <Modal isOpen={!!reminder} onClose={()=>setReminder(null)} isCentered scrollBehavior="inside" size="xl">
      <ModalOverlay/><ModalContent mx={3} maxH="calc(100dvh - 48px)" dir={i18n.dir(locale)}><ModalHeader>{t('offerReminder.title')}</ModalHeader><ModalCloseButton/>
        <ModalBody><Stack spacing={4}>
          <Text fontSize="sm">{t('offerReminder.unpaid',{client:reminder?.row.contract.clientName})}</Text>
          <Text fontSize="xs" color="gray.500">{clubText("Le mail sera envoyé uniquement après votre confirmation.")}</Text>
          <FormControl><FormLabel>{t('offerReminder.subjectLabel')}</FormLabel><Input value={reminder?.subject||''} maxLength={200} onChange={e=>setReminder(current=>({...current,subject:e.target.value}))}/></FormControl>
          <FormControl><FormLabel>{t('offerReminder.messageLabel')}</FormLabel><Textarea value={reminder?.body||''} rows={10} maxLength={5000} onChange={e=>setReminder(current=>({...current,body:e.target.value}))}/></FormControl>
          <Text fontSize="xs">{t('offerReminder.skipHint')}</Text>
          {(error||data.error)&&<Text role="alert" color="red.500">{error||data.error}</Text>}
        </Stack></ModalBody>
        <ModalFooter gap={2} flexWrap="wrap"><Button variant="ghost" onClick={()=>setReminder(null)}>{t('offerReminder.cancel')}</Button><Button variant="outline" isDisabled={saving} onClick={()=>finishReminder(false)}>{t('offerReminder.skip')}</Button><Button isLoading={saving} isDisabled={!reminder?.subject.trim()||!reminder?.body.trim()} onClick={()=>finishReminder(true)}>{t('offerReminder.send')}</Button></ModalFooter>
      </ModalContent>
    </Modal>
    {!rows.length&&<Text mt={4} color="gray.500">{clubText("Attribuez une offre pour afficher son échéancier.")}</Text>}
  </Box>;
}
