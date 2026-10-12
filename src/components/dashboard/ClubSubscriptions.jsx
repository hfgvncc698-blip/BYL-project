import { Link as RouterLink } from 'react-router-dom';
import { currencyScale, storedScale, amountUnits, formatClubMoney } from '../../utils/clubMoney';
import { useTranslation } from "react-i18next";
import { clubText, clubLocale } from "../../i18n/clubText";
import React, {useCallback,useEffect,useState,useRef} from 'react';
import {Box,Button,FormControl,FormLabel,Input,Select,Stack,HStack,Text,Heading,Badge,SimpleGrid,IconButton,AlertDialog,AlertDialogOverlay,AlertDialogContent,AlertDialogHeader,AlertDialogBody,AlertDialogFooter} from '@chakra-ui/react';
import {apiFetch} from '../../utils/api';
import {FiTrash2} from 'react-icons/fi';
import currencies from '../../../backend/utils/clubCurrencies.json';
const money=(value,currency='EUR',scale=100)=>formatClubMoney(value,currency,scale,clubLocale());
const frequencies={monthly:'Mensuel',yearly:'Annuel',once:'Paiement unique'};
const dateNow=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function Field({label,children}){return <FormControl><FormLabel fontSize="sm">{label}</FormLabel>{children}</FormControl>;}
export function ClubSubscriptionPlans(){
  useTranslation();
 const [plans,setPlans]=useState([]),[name,setName]=useState(''),[amount,setAmount]=useState(''),[frequency,setFrequency]=useState('monthly'),[currency,setCurrency]=useState('EUR'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState(null);
 const [confirmDelete,setConfirmDelete]=useState(false);
 const cancelRef=useRef(null);
 const reset=()=>{setEditing(null);setName('');setAmount('');setError('');};
 const remove=async()=>{setBusy(true);setError('');try{await apiFetch(`/clubs/subscription-plans/${editing.id}`,{method:'DELETE',body:JSON.stringify({version:editing.version||0})});setConfirmDelete(false);reset();await load();}catch(e){setConfirmDelete(false);setError(clubText(e?.data?.error)||clubText('Enregistrement impossible.'));}finally{setBusy(false);}};
 const load=()=>apiFetch('/clubs/subscription-plans').then(d=>setPlans(d.plans));
 useEffect(()=>{load().catch(()=>setError(clubText("Impossible de charger les abonnements.")));},[]);
 const add=async()=>{setBusy(true);setError('');try{await apiFetch(editing ? `/clubs/subscription-plans/${editing.id}` : '/clubs/subscription-plans',{method:editing?'PATCH':'POST',body:JSON.stringify({name,amountCents:amountUnits(amount,currency),unitScale:currencyScale(currency),frequency,currency,version:editing?.version||0})});setEditing(null);setName('');setAmount('');await load();}catch(e){setError(clubText(e?.data?.error)||clubText("Enregistrement impossible."));}finally{setBusy(false);}};
 const archive=async p=>{setBusy(true);setError('');try{await apiFetch(`/clubs/subscription-plans/${p.id}`,{method:'PATCH',body:JSON.stringify({archived:!p.archived,version:p.version||0})});await load();}catch(e){setError(clubText(e?.data?.error)||clubText("Enregistrement impossible."));}finally{setBusy(false);}};
 return <Box borderWidth="1px" borderRadius="2xl" p={5}><Heading size="md" mb={3}>{clubText("Abonnements du club")}</Heading><Stack spacing={3}>
 {plans.map(p=><HStack key={p.id} justify="space-between" flexWrap="wrap"><Text color={p.archived?'gray.500':undefined}>{p.name}{p.archived ? ` · ${clubText("Archivé")}` : ''}</Text><Badge>{money(p.amountCents,p.currency,storedScale(p))} · {clubText(frequencies[p.frequency])}</Badge><HStack><Button size="sm" variant="ghost" isDisabled={busy} onClick={()=>{setEditing(p);setName(p.name);setAmount(String(p.amountCents/storedScale(p)));setCurrency(p.currency||'EUR');setFrequency(p.frequency);}}>{clubText("Modifier")}</Button><Button size="sm" variant="ghost" isDisabled={busy||!!editing} onClick={()=>archive(p)}>{p.archived?clubText("Réactiver"):clubText("Archiver")}</Button></HStack></HStack>)}
 <Text fontSize="xs">{clubText("Les modifications et l’archivage ne changent pas les contrats déjà attribués.")}</Text>
 <HStack justify="flex-end" spacing={2}><Text as="label" htmlFor="subscription-currency" fontSize="sm">{clubText("Devise")}</Text><Select id="subscription-currency" size="sm" w="110px" minW="110px" borderRadius="md" value={currency} onChange={e=>setCurrency(e.target.value)}>{!currencies.includes(currency)&&<option value={currency} disabled>{currency}</option>}{currencies.map(code=><option key={code} value={code} label={code}>{code} — {new Intl.DisplayNames([clubLocale()],{type:"currency"}).of(code)}</option>)}</Select></HStack>
 <SimpleGrid columns={{base:1,md:3}} gap={3}><Field label={clubText("Nom de l’abonnement")}><Input value={name} maxLength={100} onChange={e=>setName(e.target.value)}/></Field><Field label={`${clubText("Montant par échéance")} (${currency})`}><Input type="number" min={1/currencyScale(currency)} step={1/currencyScale(currency)} value={amount} onChange={e=>setAmount(e.target.value)}/></Field><Field label={clubText("Périodicité")}><Select value={frequency} onChange={e=>setFrequency(e.target.value)}>{Object.entries(frequencies).map(([key,label])=><option key={key} value={key}>{clubText(label)}</option>)}</Select></Field></SimpleGrid>
 {error&&<Text color="red.500" role="alert">{error}</Text>}
 <HStack justify="space-between" align="center" pt={2} spacing={2}>
 <Box>{editing&&<IconButton aria-label={clubText('Supprimer le modèle d’abonnement')} title={clubText('Supprimer le modèle d’abonnement')} icon={<FiTrash2/>} variant="ghost" colorScheme="red" size="sm" isDisabled={busy} onClick={()=>setConfirmDelete(true)}/>}</Box>
 <HStack spacing={2}>{editing&&<Button variant="ghost" isDisabled={busy} onClick={reset}>{clubText('Annuler')}</Button>}<Button isLoading={busy} isDisabled={!name.trim()||!(Number(amount)>0)||amountUnits(amount,currency)===null} onClick={add}>{editing?clubText('Enregistrer'):clubText('Créer l’abonnement')}</Button></HStack>
 </HStack>
 </Stack>
 <AlertDialog isOpen={confirmDelete} leastDestructiveRef={cancelRef} onClose={()=>{if(!busy)setConfirmDelete(false);}} isCentered closeOnOverlayClick={!busy} closeOnEsc={!busy}>
 <AlertDialogOverlay><AlertDialogContent mx={4}><AlertDialogHeader>{clubText('Supprimer le modèle d’abonnement')}</AlertDialogHeader><AlertDialogBody><Text fontWeight="bold" mb={2}>{editing?.name}</Text>{clubText('Ce modèle sera retiré de la liste. Les contrats déjà attribués aux clients seront conservés.')}</AlertDialogBody><AlertDialogFooter gap={2}><Button ref={cancelRef} variant="ghost" isDisabled={busy} onClick={()=>setConfirmDelete(false)}>{clubText('Annuler')}</Button><Button colorScheme="red" isLoading={busy} onClick={remove}>{clubText('Supprimer')}</Button></AlertDialogFooter></AlertDialogContent></AlertDialogOverlay>
 </AlertDialog></Box>;

}
function PaymentRows({dues,reload}){
  useTranslation();
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[partial,setPartial]=useState({});
 const check=async(row,status)=>{setBusy(row.id);setError('');try{await apiFetch(`/clubs/client-administration/${encodeURIComponent(row.clientId)}/payment-checks/${encodeURIComponent(row.id)}`,{method:'POST',body:JSON.stringify({status,version:row.version||0,paidDate:partial[row.id]?.date||dateNow(),...(status==='partial'?{paidCents:Math.round(Number(partial[row.id]?.amount)*storedScale(row)),paidDate:partial[row.id]?.date||dateNow()}:{} )})});await reload();}catch(e){setError(clubText(e?.data?.error)||clubText("Confirmation impossible."));await reload().catch(()=>{});}finally{setBusy('');}};
 return <Stack spacing={2}>{error&&<Text color="red.500" role="alert">{error}</Text>}{dues.map(row=><Box key={`${row.clientId}:${row.id}`} borderWidth="1px" borderRadius="lg" p={3}><HStack justify="space-between" flexWrap="wrap"><Box><Text fontWeight="bold">{row.clientName ? `${row.clientName} · `:''}{row.label}</Text><Text fontSize="sm">{row.dueDate} · {money(row.amountCents,row.currency,storedScale(row))}</Text>{row.prorata&&<Text fontSize="xs">{clubText("Prorata : {{days}} / {{total}} jours",{days:row.periodDays,total:row.cycleDays})}</Text>}</Box><Badge>{row.status==='paid'?clubText("Reçu"):row.status==='partial'?clubText('Partiel'):row.status==='unpaid'?clubText("Non reçu"):clubText("À confirmer")}</Badge></HStack>
 {row.source==='manual'&&<Button mt={2} size="sm" as={RouterLink} to={`/clients/${encodeURIComponent(row.clientId)}`}>{clubText("Vérifier dans la fiche client")}</Button>}
 {row.source!=='manual'&&row.status!=='paid'&&<><Text fontSize="sm" mt={2}>{clubText("Le règlement a-t-il bien été reçu ?")}</Text><HStack mt={2} flexWrap="wrap"><Button size="sm" isDisabled={!!busy||row.emailState==='sending'} onClick={()=>check(row,'paid')}>{clubText("Valider la réception")}</Button><Button size="sm" variant="outline" isDisabled={row.dueDate>dateNow()||!!busy||row.emailState==='sending'||row.emailState==='sent'} onClick={()=>check(row,'unpaid')}>{row.emailState==='failed'?clubText("Réessayer l’envoi du mail"):clubText("Non reçu · envoyer un mail")}</Button></HStack></>}
 {row.paidCents>0&&<Text fontSize="sm">{clubText("Reçu :")} {money(row.paidCents,row.currency,storedScale(row))} · {clubText("Reste :")} {money(row.amountCents-row.paidCents,row.currency,storedScale(row))}</Text>}
 {row.dueDate<dateNow()&&row.status!=='paid'&&<Badge colorScheme="orange">{clubText("En retard")}</Badge>}
 {row.paidDate&&row.paidDate<row.dueDate&&<Badge colorScheme="blue">{clubText("Réglé en avance")}</Badge>}
 {row.source!=='manual'&&row.status!=='paid'&&<Box mt={3}><SimpleGrid columns={{base:1,md:2}} gap={2}><Field label={clubText("Total reçu à ce jour")}><Input type="number" min="0" step={1/storedScale(row)} value={partial[row.id]?.amount??''} onChange={e=>setPartial({...partial,[row.id]:{...partial[row.id],amount:e.target.value}})}/></Field><Field label={clubText("Date du règlement reçu")}><Input type="date" max={dateNow()} value={partial[row.id]?.date||dateNow()} onChange={e=>setPartial({...partial,[row.id]:{...partial[row.id],date:e.target.value}})}/></Field></SimpleGrid><Button mt={2} size="sm" isDisabled={!!busy||!partial[row.id]?.amount} onClick={()=>check(row,'partial')}>{clubText("Enregistrer le paiement partiel")}</Button></Box>}
 {row.emailState==='sent'&&<Text mt={1} fontSize="xs">{clubText("Mail envoyé au client.")}</Text>}{row.emailState==='sending'&&<Text mt={1} fontSize="xs">{clubText("Envoi en cours.")}</Text>}
 </Box>)}</Stack>;
}
export function ClubClientSubscription({clientId,former}){
  useTranslation();
 const [data,setData]=useState({contracts:[],dues:[]}),[plans,setPlans]=useState([]),[planId,setPlanId]=useState(''),[start,setStart]=useState(dateNow),[end,setEnd]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [firstPaymentDate,setFirstPaymentDate]=useState(dateNow),[paymentDay,setPaymentDay]=useState(()=>Number(dateNow().slice(8))),[prorata,setProrata]=useState(false),[preview,setPreview]=useState(null),[previewError,setPreviewError]=useState('');
 const [discountType,setDiscountType]=useState('none'),[discountValue,setDiscountValue]=useState('');
 const selectedPlan=plans.find(p=>p.id===planId);
 const discountUnits=discountType==='percent'?Math.round(Number(discountValue)*100):Math.round(Number(discountValue)*storedScale(selectedPlan||{}));
 const discountValid=discountType==='none'||(discountValue.trim()!==''&&Number(discountValue)>0&&Number.isSafeInteger(discountUnits)&&Math.abs(Number(discountValue)*(discountType==='percent'?100:storedScale(selectedPlan||{}))-discountUnits)<1e-7);
 const monthly=selectedPlan?.frequency==='monthly';
 const payload=JSON.stringify({planId,start,end,firstPaymentDate,paymentDay,prorata:monthly&&prorata,discount:discountType==='none'?null:{type:discountType,value:discountValid?discountUnits:null}});
 const url=`/clubs/client-administration/${encodeURIComponent(clientId)}/subscriptions`;
 const load=useCallback(async()=>{const [d,p]=await Promise.all([apiFetch(url),apiFetch('/clubs/subscription-plans')]);setData(d);setPlans(p.plans.filter(plan=>!plan.archived));},[url]);
 useEffect(()=>{load().catch(()=>setError(clubText("Impossible de charger les abonnements.")));},[load]);
 useEffect(()=>{
  let active=true;setPreview(null);setPreviewError('');
  if(!planId||!start||!end||!firstPaymentDate)return;
  const timer=setTimeout(()=>apiFetch(url+'/preview',{method:'POST',body:payload}).then(d=>{if(active)setPreview({payload,dues:d.dues});}).catch(e=>{if(active)setPreviewError(clubText(e?.data?.error)||clubText('Impossible de charger les échéances.'));}),250);
  return()=>{active=false;clearTimeout(timer);};
 },[url,payload,planId,start,end,firstPaymentDate]);
 const assign=async()=>{setBusy(true);setError('');try{await apiFetch(url,{method:'POST',body:payload});await load();setPlanId('');setDiscountType('none');setDiscountValue('');}catch(e){setError(clubText(e?.data?.error)||clubText("Affectation impossible."));}finally{setBusy(false);}};
 return <Stack spacing={3}><Heading size="sm">{clubText("Abonnement du client")}</Heading>{data.contracts.map(c=><Text key={c.id}>{c.name} · {c.importedOpening?clubText('Abonnement repris de l’ancien outil'): `${money(c.amountCents,c.currency,storedScale(c))} · ${clubText(frequencies[c.frequency])}`} · {c.start} {clubText("au")} {c.end}{c.discount&&<Text as="span" display="block" fontSize="sm">{clubText('Réduction')} : {c.discount.type==='percent'?`${c.discount.value/100}%`:money(c.discount.value,c.currency,storedScale(c))} · {clubText('Tarif initial')} : {money(c.baseAmountCents,c.currency,storedScale(c))}</Text>}</Text>)}
 {!former&&<><Field label={clubText("Choisir un abonnement")}><Select value={planId} onChange={e=>{setPlanId(e.target.value);setDiscountType('none');setDiscountValue('');}} placeholder={clubText("Sélectionner")}>{plans.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.amountCents,p.currency,storedScale(p))} · {clubText(frequencies[p.frequency])}</option>)}</Select></Field>{!plans.length&&<Text fontSize="sm">{clubText("Créez les abonnements dans les paramètres du club.")}</Text>}
 <SimpleGrid columns={{base:1,md:2}} gap={3}><Field label={clubText('Réduction')}><Select value={discountType} onChange={e=>{setDiscountType(e.target.value);setDiscountValue('');}}><option value="none">{clubText('Aucune réduction')}</option><option value="percent">{clubText('Pourcentage (%)')}</option><option value="fixed">{clubText('Montant fixe')}</option></Select></Field>{discountType!=='none'&&<Field label={discountType==='percent'?clubText('Réduction (%)'):`${clubText('Réduction')} (${selectedPlan?.currency||'EUR'})`}><Input type="number" min="0" step={discountType==='percent'?0.01:1/storedScale(selectedPlan||{})} value={discountValue} onChange={e=>setDiscountValue(e.target.value)}/></Field>}</SimpleGrid>
 {discountType!=='none'&&<Text fontSize="xs">{clubText('La réduction s’applique à chaque échéance de ce contrat, avant le calcul du prorata. Le modèle d’abonnement reste inchangé.')}</Text>}
 <SimpleGrid columns={{base:1,md:2}} gap={3}><Field label={clubText("Début de l’abonnement")} ><Input type="date" value={start} onChange={e=>{setStart(e.target.value);setFirstPaymentDate(e.target.value);}}/></Field><Field label={clubText("Fin de l’abonnement (incluse)")}><Input type="date" min={start} value={end} onChange={e=>setEnd(e.target.value)}/></Field><Field label={clubText("Date du premier règlement")}><Input type="date" min={start} max={end||undefined} value={firstPaymentDate} onChange={e=>setFirstPaymentDate(e.target.value)}/></Field>
 {monthly&&<><Field label={clubText("Jour du règlement mensuel")}><Select value={paymentDay} onChange={e=>setPaymentDay(Number(e.target.value))}>{Array.from({length:31},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</Select></Field><Field label={clubText("Prorata du premier règlement")}><Select value={prorata?'yes':'no'} onChange={e=>setProrata(e.target.value==='yes')}><option value="no">{clubText("Sans prorata")}</option><option value="yes">{clubText("Au prorata des jours")}</option></Select></Field></>}
 </SimpleGrid>
 {monthly&&<Text fontSize="xs">{clubText("Le prorata porte uniquement sur la première période, jusqu’à la prochaine échéance. Pour les mois plus courts, le paiement est fixé au dernier jour du mois.")}</Text>}
 {previewError&&<Text role="alert" color="red.500">{previewError}</Text>}
 {preview?.payload===payload&&<Box borderWidth="1px" borderRadius="lg" p={3}><Heading size="sm" mb={2}>{clubText("Aperçu des échéances")}</Heading><Stack maxH="220px" overflowY="auto" spacing={1}>{preview.dues.map(d=><Text key={d.id} fontSize="sm">{d.dueDate} · {money(d.amountCents,d.currency,storedScale(d))}{d.prorata?' · '+clubText("Prorata : {{days}} / {{total}} jours",{days:d.periodDays,total:d.cycleDays}):''}</Text>)}</Stack></Box>}
 <Button alignSelf="start" isLoading={busy} isDisabled={!planId||!start||!end||preview?.payload!==payload||!discountValid} onClick={assign}>{clubText("Appliquer l’abonnement")}</Button></>}
 {error&&<Text role="alert" color="red.500">{error}</Text>}<PaymentRows dues={data.dues.map(d=>({...d,clientId}))} reload={load}/></Stack>;
}
export function ClubPaymentTasks({onCount}){
  useTranslation();
 const [dues,setDues]=useState([]),[error,setError]=useState('');
 const load=useCallback(async()=>{const d=await apiFetch('/clubs/payment-dues');setDues(d.dues);onCount?.(d.dues.length);setError('');},[onCount]);
 useEffect(()=>{const refresh=()=>load().catch(()=>setError(clubText("Impossible de charger les échéances.")));refresh();const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[load]);
 return <Box borderWidth="1px" borderRadius="2xl" p={5}><Heading size="sm" mb={3}>{clubText("Règlements à vérifier (")}{dues.length})</Heading>{error?<Text role="alert" color="red.500">{error}</Text>:!dues.length?<Text fontSize="sm">{clubText("Aucun règlement à vérifier.")}</Text>:<PaymentRows dues={dues} reload={load}/>}</Box>;
}
