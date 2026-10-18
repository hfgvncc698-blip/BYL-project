import { useAppTheme } from '../../styles/appTheme';
import ClubClientSummary from './ClubClientSummary';
import ClubPhoneInput from './ClubPhoneInput';
import ClubReferents from './ClubReferents';
import { ClubClientSessionPacks } from './ClubSessionPacks';
import { currencyScale, storedScale, amountUnits, formatClubMoney } from '../../utils/clubMoney';
import { useTranslation } from "react-i18next";
import { clubText, clubLocale } from "../../i18n/clubText";
import { ClubClientSubscription } from "./ClubSubscriptions";
import { AddIcon, ArrowBackIcon, ChevronDownIcon, ChevronUpIcon, DeleteIcon } from "@chakra-ui/icons";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertDialog, AlertDialogOverlay, AlertDialogContent, AlertDialogHeader, AlertDialogBody, AlertDialogFooter, IconButton, Tooltip, Badge, Box, Button, FormControl, FormLabel, Heading, HStack, Input, Modal, ModalOverlay, ModalContent, Select, SimpleGrid, Stack, Tab, TabList, TabPanel, TabPanels, Tabs, Text, Textarea, useToast } from '@chakra-ui/react';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../AuthContext';
// Private drafts stay in memory and are scoped to the authenticated club owner.
const drafts = new Map();
const labels = { inactive: 'Abonnement désactivé', active: 'Accès actif', scheduled: 'Entrée à venir', expired: 'Accès expiré', suspended: 'Accès suspendu', left: 'Ancien membre' };
import currencies from '../../../backend/utils/clubCurrencies.json';
const money = (cents, currency) => formatClubMoney(cents,currency,1000,clubLocale());
function Field({ label, children }) { return <FormControl><FormLabel fontSize="sm">{label}</FormLabel>{children}</FormControl>; }
export function EventFollowup({ event, url, onSaved, draftKey, openInitially=false, request=apiFetch }) {
  useTranslation();
  const [expanded, setExpanded] = useState(openInitially);
  const [form, setForm] = useState(() => drafts.get(draftKey) || event.report), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => setForm(drafts.get(draftKey) || event.report), [event.report, draftKey]);
  useEffect(()=>{const refresh=()=>onSaved().catch(()=>{});window.addEventListener('cancellation-reviewed',refresh);return()=>window.removeEventListener('cancellation-reviewed',refresh);},[onSaved]);
  const decision=['accepted','rejected'].includes(event.report.excuseDecision)?event.report.excuseDecision:form.excuseDecision;
  const decided=!!form.excuse&&['accepted','rejected'].includes(decision);
  const attendance=decided?(decision==='accepted'?'excused':'absent'):form.attendance;
  const cancelled=['annulée','annulee','cancelled'].includes(event.status);
  const cancellationLabel=event.report.excuseDecision==='accepted'?'Annulé · justification acceptée':event.report.excuseDecision==='rejected'?'Annulé · justification refusée':event.report.excuse?'Annulé · justification en attente':'Annulé · sans justification';

  const change = value => { drafts.set(draftKey, value); setForm(value); };
  const save = async (value=form) => {
    setBusy(true); setError('');
    try { await request(url, { method: 'PATCH', body: JSON.stringify(value) }); drafts.delete(draftKey); await onSaved(); window.dispatchEvent(new Event('club-offers-updated')); }
    catch (e) { setError(clubText(e?.data?.error) || clubText("Enregistrement impossible.")); }
    finally { setBusy(false); }
  };
  return <Box borderWidth="1px" borderRadius="lg" p={4}>
    <Button variant="ghost" w="full" h="auto" py={2} px={0} whiteSpace="normal" justifyContent="space-between" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} rightIcon={expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}><Box textAlign="left"><Text fontWeight="bold">{event.title}</Text><Text fontSize="xs" fontWeight="normal">{new Date(event.startsAt).toLocaleString(clubLocale(), {dateStyle:"short",timeStyle:"short"})} · {event.coachName}</Text></Box><Badge ml={2} whiteSpace="normal" textAlign="center" flexShrink={0} maxW={{base:"45%",md:"none"}} colorScheme={cancelled?(event.report.excuseDecision==='accepted'?'yellow':event.report.excuseDecision==='rejected'?'red':event.report.excuse?'blue':'gray'):['validée','validee','validated'].includes(event.status)?'green':['manquée','manquee'].includes(event.status)?'red':'blue'}>{clubText(cancelled?cancellationLabel:event.status)}</Badge></Button>
    {expanded && <>
    {event.report.reservation === 'left_club' && <Text fontSize="sm">{clubText("Inscription retirée lors du départ du club")}</Text>}
    {event.report.reservation === 'removed_by_club' && <Text fontSize="sm">{clubText("Inscription retirée par le club")}</Text>}
    {event.report.reservation === 'withdrawn_by_client' && <Text fontSize="sm">{clubText("Désinscription demandée par le client")}</Text>}
    <Text fontSize="sm" mb={3}>{new Date(event.startsAt).toLocaleString(clubLocale())} · {event.coachName}{event.waiting ? clubText(" · Liste d’attente") : ''}</Text>
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
      {event.type !== 'group' && <Field label={clubText('Réponse du client au rendez-vous')}>
        {form.source==='client'||form.cancellationRequestId||decided?<Box borderWidth="1px" borderRadius="xl" px={4} py={3}><Text fontSize="sm">{clubText(form.response==='declined'?'Le client a décliné le rendez-vous':form.response==='accepted'?'Le client a accepté le rendez-vous':'Le client n’a pas encore répondu')}</Text></Box>:<Select value={form.response} onChange={e=>change({...form,response:e.target.value})}><option value="unknown">{clubText('Aucune réponse au rendez-vous')}</option><option value="accepted">{clubText('Rendez-vous accepté par le client')}</option><option value="declined">{clubText('Rendez-vous décliné par le client')}</option></Select>}
      </Field>}
      <Field label={clubText('Présence')}>
        {decided?<Box borderWidth="1px" borderRadius="xl" px={4} py={3}><Text fontSize="sm" fontWeight="semibold">{clubText(decision==='accepted'?'Absence excusée — justification acceptée':'Absence non excusée — justification refusée')}</Text></Box>:<Select value={attendance} onChange={e=>change({...form,attendance:e.target.value})} isDisabled={busy||event.startsAt>Date.now()}><option value="unknown">{clubText('Non renseignée')}</option><option value="present">{clubText('Présent')}</option><option value="absent">{clubText('Absence non excusée')}</option><option value="excused" disabled>{clubText('Absence excusée')}</option></Select>}
      </Field>
    </SimpleGrid>
    {event.report.excuse && <Box mt={3} borderWidth="1px" borderRadius="lg" p={3}><Text fontWeight="bold">{clubText("Justification d’absence")}</Text><Text whiteSpace="pre-wrap">{event.report.excuse}</Text>{decided?<Badge mt={2} colorScheme={decision==='accepted'?'yellow':'red'}>{clubText(decision==='accepted'?'Justification acceptée':'Justification refusée')}</Badge>:form.cancellationRequestId?<Text mt={2} fontSize="sm">{clubText('Cette demande est à examiner dans les annulations du tableau de bord ou dans la messagerie.')}</Text>:<Button mt={2} size="sm" variant="outline" isLoading={busy} isDisabled={event.startsAt>Date.now()} onClick={()=>save({...form,attendance:'absent',excuseDecision:'rejected'})}>{clubText('Refuser la justification')}</Button>}</Box>}
    <Field label={clubText("Note confidentielle sur ce rendez-vous")}><Textarea mt={2} maxLength={1000} value={form.note} onChange={e => change({ ...form, note: e.target.value })} /></Field>
    {error && <Box><Text role="alert" color="red.500">{error}</Text><Button size="sm" variant="outline" onClick={() => { drafts.delete(draftKey); onSaved().catch(() => {}); }}>{clubText("Abandonner mes modifications et recharger ce suivi")}</Button></Box>}
    <HStack mt={2} justify="space-between"><Text fontSize="xs">{form.updatedAt ? clubText("Mis à jour le {{date}}", { date: new Date(form.updatedAt).toLocaleString(clubLocale()) }) : ''}</Text><Button size="sm" isLoading={busy} onClick={()=>save({...form,attendance})}>{clubText("Enregistrer ce suivi")}</Button></HStack>
    </>}
  </Box>;
}
export default function ClubClientAdministration({ client, clubId, urlFor, onClose, embedded = false, onOpenGlobal }) {
  useTranslation();
  const theme = useAppTheme();
  const sectionProps = { ...theme.cardProps, p: {base:4,md:5} };
  const [server, setServer] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [filter, setFilter] = useState('all'), [tabIndex, setTabIndex] = useState(0);
  const { user } = useAuth();
  const draftKey = `${user?.uid}:${clubId}:${client.id}`;
  const [draft, updateDraft] = useState(() => drafts.get(draftKey) || null);
  const setDraft = value => { if (value) drafts.set(draftKey, value); else drafts.delete(draftKey); updateDraft(value); };
  const toast = useToast();
  const [summaryOpen,setSummaryOpen]=useState(false);
  const [reviewEvent,setReviewEvent]=useState(null);
  const [expandedPayments, setExpandedPayments] = useState({});
  const [paymentToDelete, setPaymentToDelete] = useState(null);
  const cancelDeleteRef = useRef(null);
  const url = urlFor(`/clubs/client-administration/${encodeURIComponent(client.id)}`);
  const load = useCallback(async () => { const data = await apiFetch(url); setServer(data); setError(''); return data; }, [url]);
  useEffect(() => { let alive = true; apiFetch(url).then(data => { if (alive) setServer(data); }).catch(e => { if (alive) setError(clubText(e?.data?.error) || clubText("Chargement impossible.")); }); return () => { alive = false; }; }, [url]);
  useEffect(() => {
    const refresh = () => load().catch(() => {});
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load]);
  const form = draft || server;
  const [paymentSaving,setPaymentSaving]=useState(false);
  const [paymentSaveError,setPaymentSaveError]=useState('');
  const paymentSnapshot=JSON.stringify(form?.payments||[]);
  const savedPaymentSnapshot=JSON.stringify(server?.payments||[]);
  const paymentAttempt=useRef('');
  const [paymentRetry,setPaymentRetry]=useState(0);
  useEffect(()=>{
    if(!server||paymentSaving||busy||paymentSnapshot===savedPaymentSnapshot)return;
    const payments=JSON.parse(paymentSnapshot);
    if(payments.some(p=>!p.label.trim()||!Number.isSafeInteger(p.dueCents)||!Number.isSafeInteger(p.paidCents)||p.dueCents<0||p.paidCents<0||p.paidCents>p.dueCents||(p.paidCents>0&&!p.paidDate)))return;
    const attempt=server.version+':'+paymentSnapshot;
    if(paymentAttempt.current===attempt)return;
    const timer=setTimeout(async()=>{
      paymentAttempt.current=attempt;setPaymentSaving(true);setPaymentSaveError('');
      try{
        const {entryDate,exitDate,membershipStatus,membershipReason,accessStatus,privateNotes,administrativeContact,version}=server;
        await apiFetch(url,{method:'PATCH',body:JSON.stringify({entryDate,exitDate,membershipStatus,membershipReason,accessStatus,privateNotes,administrativeContact,version,payments})});
        const fresh=await apiFetch(url);setServer(fresh);
        updateDraft(current=>{
          if(!current)return current;
          const next={...current,version:fresh.version,payments:JSON.stringify(current.payments)===paymentSnapshot?fresh.payments:current.payments};
          const unchanged=Object.keys(next).filter(k=>!['events','audit','access','welcomeEmailStatus'].includes(k)).every(k=>JSON.stringify(next[k])===JSON.stringify(fresh[k]));
          if(unchanged){drafts.delete(draftKey);return null;}drafts.set(draftKey,next);return next;
        });
        setExpandedPayments(current=>({...current,...Object.fromEntries(payments.filter(p=>p.dueCents>0&&p.paidCents>=p.dueCents).map(p=>[p.id,false]))}));
        window.dispatchEvent(new Event('club-memberships-changed'));
      }catch(e){setPaymentSaveError(clubText(e?.data?.error)||clubText('Enregistrement impossible.'));}
      finally{setPaymentSaving(false);}
    },1200);
    return()=>clearTimeout(timer);
  },[paymentSnapshot,savedPaymentSnapshot,server,paymentSaving,busy,url,draftKey,paymentRetry]);

  const change = patch => setDraft({ ...form, ...patch });
  const save = async () => {
    setBusy(true); setError('');
    try {
      const { entryDate, exitDate, membershipStatus, membershipReason, accessStatus, privateNotes, administrativeContact, payments, version } = form;
      await apiFetch(url, { method: 'PATCH', body: JSON.stringify({ entryDate, exitDate, membershipStatus, membershipReason, accessStatus, privateNotes, administrativeContact, payments, version, ...(form.contactEdited ? {contact: form.contact, previousContact: form.previousContact} : {}) }) });
      setDraft(null); await load(); setExpandedPayments({}); window.dispatchEvent(new Event('club-memberships-changed'));
      toast({ title: clubText("Fiche confidentielle enregistrée"), status: 'success' });
    } catch (e) { setError(clubText(e?.data?.error) || clubText("Enregistrement impossible.")); }
    finally { setBusy(false); }
  };
  const retryWelcome = async () => {
    setBusy(true);setError('');
    try { const result=await apiFetch(urlFor(`/clubs/client-administration/${encodeURIComponent(client.id)}/welcome-retry`),{method:'POST'});await load();if(result.emailSent===false)setError(clubText("Envoi impossible. Réessayez.")); }
    catch {setError(clubText("Envoi impossible. Réessayez."));}
    finally {setBusy(false);}
  };
  const paymentChange = (id, patch) => change({ payments: form.payments.map(p => p.id === id ? { ...p, ...patch } : p) });
  const allEvents = server?.events || [];
  const attendanceCounts = allEvents.reduce((counts, event) => {
    if (event.report.attendance === 'present' || event.report.attendance === 'absent') counts[event.report.attendance]++;
    return counts;
  }, { present: 0, absent: 0 });
  const events = allEvents.filter(event => filter === 'all' || event.report.attendance === filter);
  const contents = <>
    {summaryOpen&&<ClubClientSummary clientId={client.id} clientName={server?.clientName||client.name} urlFor={urlFor} onClose={()=>setSummaryOpen(false)}/>}
    <AlertDialog isOpen={!!paymentToDelete} leastDestructiveRef={cancelDeleteRef} onClose={() => setPaymentToDelete(null)} isCentered>
      <AlertDialogOverlay><AlertDialogContent mx={4}><AlertDialogHeader>{clubText("Supprimer ce règlement ?")}</AlertDialogHeader><AlertDialogBody>{clubText("Voulez-vous supprimer ce règlement ? La suppression sera enregistrée automatiquement.")}</AlertDialogBody><AlertDialogFooter gap={3}><Button ref={cancelDeleteRef} variant="ghost" onClick={() => setPaymentToDelete(null)}>{clubText("Annuler")}</Button><Button colorScheme="red" onClick={() => { change({ payments: form.payments.filter(row => row.id !== paymentToDelete) }); setPaymentToDelete(null); }}>{clubText("Supprimer")}</Button></AlertDialogFooter></AlertDialogContent></AlertDialogOverlay>
    </AlertDialog>
    <Box {...sectionProps} mb={5}>
      <Stack direction={{base:'column',lg:'row'}} align={{base:'stretch',lg:'center'}} justify="space-between" spacing={4}>
        <HStack align="start" spacing={3}>
          {embedded && <IconButton size="sm" variant="outline" borderRadius="full" icon={<ArrowBackIcon/>} aria-label={clubText("Retour")} isDisabled={busy} onClick={onClose}/>}
          <Box minW={0}>
            <HStack flexWrap="wrap" gap={2}><Heading fontSize={{base:'20px',md:'24px'}}>{server?.clientName || client.name || clubText("Fiche client")}</Heading>
              {server && <Badge borderRadius="full" px={2} colorScheme={server.access==='active'?'teal':'gray'}>{clubText(labels[server.access])}</Badge>}
            </HStack>
            <Text fontSize="sm" color={theme.mutedText} mt={1}>{clubText("Gestion confidentielle · Réservée au responsable du club")}</Text>
          </Box>
        </HStack>
        <HStack spacing={2} flexWrap="wrap">
          <Button size="sm" {...theme.primaryButtonProps} onClick={()=>setSummaryOpen(true)}>{clubText("Résumé de l’accompagnement")}</Button>
          {onOpenGlobal && server && !server.former && <Button size="sm" variant="outline" isDisabled={busy} onClick={onOpenGlobal}>{clubText("Voir la fiche globale")}</Button>}
        </HStack>
      </Stack>
    </Box>
      <Box>
        {error && <Box mb={3}><Text role="alert" color="red.500">{error}</Text>{server && <Button size="sm" variant="outline" onClick={() => { setDraft(null); load().catch(() => {}); }}>{clubText("Abandonner mes modifications et recharger la fiche")}</Button>}</Box>}
        {!server ? <Button onClick={() => load().catch(() => {})}>{clubText("Recharger la fiche")}</Button> : <>
          {draft && <Badge mb={3} colorScheme="orange" borderRadius="full" px={3}>{clubText("Brouillon non enregistré")}</Badge>}
          {server.welcomeEmailStatus === 'failed' && !server.former && <Box mb={3}><Text fontSize="sm">{clubText("Le mail de bienvenue n’a pas été confirmé. Vérifiez sa réception avant de le renvoyer.")}</Text><Button size="sm" variant="outline" isLoading={busy} onClick={retryWelcome}>{clubText("Réessayer l’envoi du mail")}</Button></Box>}
          <Tabs isLazy variant="unstyled" index={tabIndex} onChange={setTabIndex}>
            <Box overflowX="auto" pb={1}><TabList w="max-content" bg={theme.surfaceBgStrong} borderWidth="1px" borderColor={theme.borderColor} p={1} gap={1} borderRadius="full" sx={{'& > button':{borderRadius:'999px',fontSize:'sm',fontWeight:600,whiteSpace:'nowrap',minHeight:'40px',px:4},'& > button[aria-selected=true]':{bg:theme.primaryButtonProps.bg || '#111827',color:'white'}}}><Tab>{clubText("Accès et dossier")}</Tab><Tab>{clubText("Paiements")}</Tab><Tab>{clubText("Rendez-vous (")}{server.events.length})</Tab><Tab>{clubText("Offres et packs")}</Tab></TabList></Box><TabPanels>
            <TabPanel px={0}><Stack spacing={4}><ClubReferents clientId={client.id} compact/>
              <Box {...sectionProps}>
                <Heading size="sm" mb={4}>{clubText("Coordonnées du client")}</Heading>
                <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
                  {[
                    [clubText("Prénom"), 'firstName'], [clubText("Nom"), 'lastName'], [clubText("Adresse e-mail"), 'email'], [clubText("Téléphone"), 'phone'],
                    [clubText("Date de naissance"), 'birthDate'], [clubText("Adresse"), 'address'], [clubText("Code postal"), 'postalCode'], [clubText("Ville"), 'city'], [clubText("Pays"), 'country'],
                  ].map(([label, key]) => <Field key={key} label={label}>{key === 'phone' ? <ClubPhoneInput isReadOnly={server.former} value={(form.contact || server.contact)?.phone || ''} onChange={phone => change({contact:{...(form.contact || server.contact),phone},contactEdited:true,previousContact:form.previousContact || server.contact})}/> : <Input
                    type={key === 'email' ? 'email' : key === 'birthDate' ? 'date' : 'text'}
                    max={key === 'birthDate' ? new Date().toISOString().slice(0,10) : undefined}
                    isReadOnly={server.former} value={(form.contact || server.contact)?.[key] || ''}
                    onChange={e => change({ contact: { ...(form.contact || server.contact), [key]: e.target.value }, contactEdited: true, previousContact: form.previousContact || server.contact })}
                  />}</Field>)}
                </SimpleGrid>
                <Text fontSize="xs">{clubText("Cette adresse sert aux échanges avec le club. La modifier ne change pas l’adresse de connexion.")}</Text>
              </Box>
              <Box {...sectionProps}>
              <Heading size="sm" mb={4}>{clubText("Adhésion et gestion du club")}</Heading>
              <Stack spacing={4}>
              <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
                <Field label={clubText("Abonnement au club")}><Select value={form.membershipStatus || 'active'} isDisabled={server.former} onChange={e => change({ membershipStatus: e.target.value, membershipReason: '' })}><option value="active">{clubText("Actif")}</option><option value="inactive">{clubText("Désactivé")}</option></Select></Field>
                {form.membershipStatus === 'inactive' && <Field label={clubText("Motif")}><Select value={form.membershipReason || ''} onChange={e => change({ membershipReason: e.target.value })}><option value="">{clubText("Non renseigné")}</option><option value="unpaid">{clubText("Impayé")}</option><option value="contract_end">{clubText("Fin de contrat")}</option><option value="other">{clubText("Autre")}</option></Select></Field>}
              </SimpleGrid>
              <Text fontSize="sm">{clubText("La désactivation bloque les nouvelles inscriptions aux cours. Le dossier et les réservations existantes sont conservés. Après la date de sortie prévue, le client passe dans les anciens membres et ses réservations futures aux cours sont retirées.")}</Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
                <Field label={clubText("Date d’entrée")}><Input type="date" value={form.entryDate} onChange={e => change({ entryDate: e.target.value })} /></Field>
                <Field label={clubText("Date de sortie prévue (incluse)")}><Input type="date" min={form.entryDate || undefined} value={form.exitDate} onChange={e => change({ exitDate: e.target.value })} /></Field>
              </SimpleGrid>
              {server.former && <Text>{clubText("Le client a quitté le club : modifier ces dates ne réactive pas son adhésion. Utilisez « Réactiver l’adhésion » dans les anciens membres.")}</Text>}
              <Field label={clubText("Coordonnées administratives privées")}><Textarea maxLength={2000} value={form.administrativeContact} onChange={e => change({ administrativeContact: e.target.value })} placeholder={clubText("Adresse de facturation, contact administratif…")} /></Field>
              <Field label={clubText("Notes confidentielles du club")}><Textarea minH="150px" maxLength={8000} value={form.privateNotes} onChange={e => change({ privateNotes: e.target.value })} /></Field>
              <Text fontSize="xs">{clubText("Ces champs ne sont pas partagés avec les coachs ni les clients.")}</Text>
              {!!server.audit.length && <Text fontSize="xs">{clubText("Dernière modification enregistrée :")} {new Date(server.audit.at(-1).at).toLocaleString(clubLocale())}.</Text>}
              </Stack></Box>
            </Stack></TabPanel>
            <TabPanel px={0}><Stack spacing={4}>
              <Box {...sectionProps} borderTop="3px solid" borderTopColor="purple.400"><ClubClientSubscription clientId={client.id} former={server.former} view="payments" /></Box>
              <HStack justify="space-between" flexWrap="wrap" gap={3}><Heading size="sm">{clubText("Autres règlements")}</Heading><Button {...theme.primaryButtonProps} size="sm" borderRadius="full" leftIcon={<AddIcon/>} isDisabled={paymentSaving||form.payments.length >= 100} onClick={() => change({ payments: [...form.payments, { id: crypto.randomUUID(), label: '', currency: 'EUR', dueCents: 0, paidCents: 0, dueDate: '', paidDate: '', method: '', reference: '' }] })}>{clubText("Ajouter un règlement")}</Button></HStack><Text fontSize="sm" color={paymentSaveError?"red.500":theme.mutedText} role="status">{paymentSaveError||clubText(paymentSaving?"Enregistrement en cours…":paymentSnapshot!==savedPaymentSnapshot?"Les règlements complets sont enregistrés automatiquement.":"Tous les règlements sont enregistrés.")}</Text>{paymentSaveError&&<Button alignSelf="flex-end" size="sm" variant="outline" onClick={()=>{paymentAttempt.current='';setPaymentRetry(n=>n+1);}}>{clubText('Réessayer l’enregistrement')}</Button>}
              {[...new Set(form.payments.map(p => p.currency || 'EUR'))].map(currency => {
                const rows = form.payments.filter(p => (p.currency || 'EUR') === currency);
                return <HStack key={currency} flexWrap="wrap"><Badge>{clubText("Dû :")} {money(rows.reduce((a, p) => a + p.dueCents / storedScale(p) * 1000, 0), currency)}</Badge><Badge>{clubText("Reçu :")} {money(rows.reduce((a, p) => a + p.paidCents / storedScale(p) * 1000, 0), currency)}</Badge><Badge>{clubText("Reste :")} {money(rows.reduce((a, p) => a + (p.dueCents - p.paidCents) / storedScale(p) * 1000, 0), currency)}</Badge></HStack>;
              })}
              {[...form.payments].sort((a,b)=>Number(a.dueCents>0&&a.paidCents>=a.dueCents)-Number(b.dueCents>0&&b.paidCents>=b.dueCents)||(a.dueDate||'9999').localeCompare(b.dueDate||'9999')).map(p => {
                const savedPayment = server.payments.find(row => row.id === p.id);
                const savedPaid = savedPayment?.dueCents > 0 && savedPayment.paidCents >= savedPayment.dueCents;
                const paid = p.dueCents > 0 && p.paidCents >= p.dueCents;
                const expanded = expandedPayments[p.id] ?? !savedPaid;
                return <Box key={p.id} {...sectionProps}>
                <Button variant="ghost" w="full" h="auto" px={0} py={1} whiteSpace="normal" justifyContent="space-between" aria-expanded={expanded} aria-controls={`payment-details-${p.id}`} onClick={() => setExpandedPayments(current => ({...current, [p.id]: !expanded}))} rightIcon={expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}>
                  <Box textAlign="left" minW={0} flex="1"><Text fontWeight="bold">{p.label || clubText("Nouveau règlement")}</Text><Text fontSize="sm" fontWeight="normal" mt={1}>{formatClubMoney(p.paidCents, p.currency || 'EUR', storedScale(p), clubLocale())}{p.paidDate ? ` · ${p.paidDate.split('-').reverse().join('/')}` : ''}</Text></Box>
                  <Badge ml={2} colorScheme={paid ? 'green' : 'gray'}>{paid ? clubText("Payé") : p.paidCents > 0 ? clubText("Partiel") : clubText("À régler")}</Badge>
                </Button>
                {expanded && <Box id={`payment-details-${p.id}`} mt={3}>
                {p.dueDate&&p.dueDate<new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())&&p.paidCents<p.dueCents&&<Badge colorScheme="orange">{clubText("En retard")}</Badge>}{p.paidDate&&p.dueDate&&p.paidDate<p.dueDate&&p.paidCents>0&&<Badge colorScheme="blue">{clubText("Réglé en avance")}</Badge>}

                <HStack justify="flex-end" mb={3} spacing={2}>
                  <Text as="label" htmlFor={`currency-${p.id}`} fontSize="sm">{clubText("Devise")}</Text>
                  <Select id={`currency-${p.id}`} size="sm" w="110px" minW="110px" borderRadius="md" value={p.currency || "EUR"} onChange={e => paymentChange(p.id, { currency: e.target.value, unitScale: currencyScale(e.target.value), dueInput: p.dueInput ?? String(p.dueCents / storedScale(p)), paidInput: p.paidInput ?? String(p.paidCents / storedScale(p)), dueCents: amountUnits(p.dueInput ?? p.dueCents / storedScale(p),e.target.value), paidCents: amountUnits(p.paidInput ?? p.paidCents / storedScale(p),e.target.value) })}>
                    {p.currency && !currencies.includes(p.currency) && <option value={p.currency} disabled>{p.currency}</option>}
                    {currencies.map(code => <option key={code} value={code} label={code}>{code} — {new Intl.DisplayNames([clubLocale()], { type: "currency" }).of(code)}</option>)}
                  </Select>
                </HStack>
                <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
                  <Field label={clubText("Libellé")}><Input value={p.label} maxLength={120} onChange={e => paymentChange(p.id, { label: e.target.value })} /></Field>
                  <Field label={clubText("Échéance")}><Input type="date" value={p.dueDate} onChange={e => paymentChange(p.id, { dueDate: e.target.value })} /></Field>
                  <Field label={`${clubText("Montant dû")} (${p.currency || "EUR"})`}><Input type="number" min="0" step={1/currencyScale(p.currency)} value={p.dueInput ?? p.dueCents / storedScale(p)} onChange={e => paymentChange(p.id, { dueInput: e.target.value, dueCents: amountUnits(e.target.value, p.currency), paidCents: amountUnits(p.paidInput ?? p.paidCents / storedScale(p),p.currency), unitScale: currencyScale(p.currency) })} /></Field>
                  <Field label={`${clubText("Montant reçu")} (${p.currency || "EUR"})`}><Input type="number" min="0" step={1/currencyScale(p.currency)} value={p.paidInput ?? p.paidCents / storedScale(p)} onChange={e => paymentChange(p.id, { paidInput: e.target.value, paidCents: amountUnits(e.target.value, p.currency), dueCents: amountUnits(p.dueInput ?? p.dueCents / storedScale(p),p.currency), unitScale: currencyScale(p.currency) })} /></Field>
                  <Field label={clubText("Date du règlement reçu")}><Input type="date" value={p.paidDate} onChange={e => paymentChange(p.id, { paidDate: e.target.value })} /></Field>
                  <Field label={clubText("Mode de règlement")}><Select value={p.method} onChange={e => paymentChange(p.id, { method: e.target.value })}><option value="">{clubText("Non renseigné")}</option><option value="card">{clubText("Carte")}</option><option value="cash">{clubText("Espèces")}</option><option value="transfer">{clubText("Virement")}</option><option value="cheque">{clubText("Chèque")}</option><option value="other">{clubText("Autre")}</option></Select></Field>
                  <Field label={clubText("Nature du règlement")}><Select value={p.kind||'regular'} onChange={e=>paymentChange(p.id,{kind:e.target.value})}><option value="regular">{clubText("Règlement")}</option><option value="termination">{clubText("Frais de résiliation anticipée")}</option><option value="late_fee">{clubText("Frais de retard")}</option></Select></Field>
                  <Field label={clubText("Référence interne")}><Input value={p.reference} maxLength={120} onChange={e => paymentChange(p.id, { reference: e.target.value })} /></Field>
                </SimpleGrid>
                <HStack justify="flex-end" mt={3}><Tooltip label={clubText("Supprimer ce règlement")}><IconButton size="sm" variant="ghost" colorScheme="red" icon={<DeleteIcon />} aria-label={clubText("Supprimer ce règlement")} isDisabled={busy} onClick={() => setPaymentToDelete(p.id)} /></Tooltip></HStack>
                </Box>}
              </Box>;})}

            </Stack></TabPanel>
            <TabPanel px={0}><Stack {...sectionProps} spacing={4}>
                <Field label={clubText("Accès aux cours du club")}><Select value={form.accessStatus} onChange={e => change({ accessStatus: e.target.value })}><option value="active">{clubText("Autorisé pendant la période")}</option><option value="suspended">{clubText("Suspendu")}</option></Select></Field>
              <Field label={clubText("Filtrer le suivi")}><Select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{clubText("Tous les rendez-vous (")}{allEvents.length})</option><option value="present">{clubText("Présences (")}{attendanceCounts.present})</option><option value="absent">{clubText("Absences (")}{attendanceCounts.absent})</option></Select></Field>
              <Text fontSize="sm" color="gray.500" role="status">{clubText("{{shown}} rendez-vous affichés sur {{total}}", { shown: events.length, total: allEvents.length })}</Text>
              {!events.length && <Text>{clubText("Aucun rendez-vous dans ce filtre.")}</Text>}
              {events.map(event => <EventFollowup key={`${event.id}:${reviewEvent===event.id}`} openInitially={reviewEvent===event.id} draftKey={`${draftKey}:event:${event.id}`} event={event} url={urlFor(`/clubs/client-administration/${encodeURIComponent(client.id)}/events/${encodeURIComponent(event.id)}`)} onSaved={load} />)}
            </Stack></TabPanel>
            <TabPanel px={0}><Stack spacing={4}><Box {...sectionProps} borderTop="3px solid" borderTopColor="purple.400"><ClubClientSubscription clientId={client.id} former={server.former} view="offers" onViewPayments={()=>setTabIndex(1)} /></Box><Box {...sectionProps} borderTop="3px solid" borderTopColor="blue.400"><ClubClientSessionPacks clientId={client.id} former={server.former} urlFor={urlFor} onReview={id=>{setReviewEvent(id);setTabIndex(2);}} /></Box></Stack></TabPanel>
          </TabPanels></Tabs>
        </>}
      </Box><HStack borderTopWidth="1px" borderColor={theme.borderColor} py={4} justify="flex-end" gap={2}><>{!embedded && <Button variant="ghost" isDisabled={busy} onClick={onClose}>{clubText("Fermer")}</Button>}</>{tabIndex!==3&&tabIndex!==1&&<Button {...theme.primaryButtonProps} isLoading={busy} isDisabled={!server||paymentSaving} onClick={save}>{clubText("Enregistrer la fiche")}</Button>}</HStack>
  </>;
  return embedded ? <Box>{contents}</Box> : <Modal isOpen onClose={() => !busy && onClose()} size="4xl" scrollBehavior="inside" closeOnOverlayClick={false}><ModalOverlay /><ModalContent p={{base:3,md:5}}>{contents}</ModalContent></Modal>;
}
