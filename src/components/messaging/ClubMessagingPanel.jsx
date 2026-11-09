import CancellationMessage from './CancellationMessage';
import ClubTerminationModal from '../dashboard/ClubTerminationModal';
import { clubText } from '../../i18n/clubText';
import useSuggestedMessage from '../../hooks/useSuggestedMessage';
import useSessionDraft from "../../hooks/useSessionDraft";
import { useAuth } from "../../AuthContext";
import { useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, Flex, Heading, Input, Stack, Text, Textarea, Badge, Spinner } from '@chakra-ui/react';
import { ArrowBackIcon } from '@chakra-ui/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../../firebaseConfig';
import { useClubThread, stampOrder } from './useClubThread';
import { useVisibleReceipt } from './useVisibleReceipt';
import { useMessagingFeed, useMessagingIdentity } from './messagingFeed';
import { mergeContacts } from './useMemberClubContacts';
import { api } from './clubMessagingApi';
export { api } from './clubMessagingApi';
import { AppSurface } from '../ui/AppPrimitives';
import { useAppTheme } from '../../styles/appTheme';

const target = contact => ({ clubId: contact.clubId, kind: contact.kind, targetId: contact.targetId });

export function ClubThread({ contact, preview, ownerView, onBack, t, suggestedDraft, suggestedClassRequest, onDraftApplied, onOpenAppointment }) {

  const [termination,setTermination]=useState(null);
  const { user } = useAuth();
  const [draft, setDraft] = useSessionDraft(user?.uid ? `club-message:${user.uid}:${contact.clubId}:${contact.kind}:${contact.targetId}` : null, '');
  const navigate = useNavigate();
  const [classRequest, setClassRequest] = useSessionDraft(user?.uid ? `club-request:${user.uid}:${contact.id}` : null, null);
  useEffect(() => { if (suggestedClassRequest) setClassRequest(suggestedClassRequest); }, [suggestedClassRequest, setClassRequest]);
  useSuggestedMessage(suggestedDraft, setDraft, onDraftApplied);
  const thread=useClubThread(contact,ownerView);
  const {messages,loading,more}=thread;
  const [sendError,setError]=useState(false);
  const error=thread.error || sendError;
  const [sending,setSending]=useState(false);
  const [olderBusy,setOlderBusy]=useState(false);
  const pending=useRef(null), bottom=useRef(null), pane=useRef(null);
  const params=JSON.stringify(target(contact));
  useVisibleReceipt({pane,rows:messages,side:ownerView?'club':'member',account:auth.currentUser,
    params,enabled:!preview && !error && !loading,ownReadId:thread.active?.ownReadId,ownReadVersion:thread.active?.ownReadVersion});
  useEffect(()=>{bottom.current?.scrollIntoView({block:'nearest'});},[messages.at(-1)?.id]);
  useEffect(()=>{
    const refresh=()=>thread.reload();
    window.addEventListener('cancellation-reviewed',refresh);
    return ()=>window.removeEventListener('cancellation-reviewed',refresh);
  },[thread.reload]);
  async function older() {
    setOlderBusy(true);
    try { await thread.older(); } finally {setOlderBusy(false);}
  }
  async function send() {
    const text = draft.trim();
    if (!text || sending || preview) return;
    setSending(true);
    if (pending.current?.text !== text) pending.current = { text, ...(classRequest ? {classRequest} : {}), requestId: crypto.randomUUID() };
    try {
      await api('send', { ...target(contact), ...pending.current });
      thread.reload(); setDraft(''); setClassRequest(null); pending.current = null; setError(false);
    } catch { setError(true); } finally { setSending(false); }
  }
  if (thread.denied) return <Box role="alert"><Text>{t('clubMessaging.error')}</Text><Button onClick={onBack}>{t('common.back')}</Button></Box>;
  const lastOwn=messages.filter(m=>m.side===(ownerView?'club':'member')).at(-1);
  const order=stampOrder(thread.active?.readVersion,lastOwn?.watermark);
  const confirmed=thread.active?.readVersion && (order>0 || (order===0 && (!thread.active.readId || thread.active.readId>=lastOwn?.id)));
  return <Flex direction="column" h="full" minH={0}>
    {termination&&<ClubTerminationModal club={{id:termination.clubId,name:contact.title}} memberUid={termination.memberUid} ownerView={ownerView} onClose={()=>setTermination(null)}/>}
    <Flex p={4} gap={3} align="center"><IconButton size="sm" variant="ghost" borderRadius="full" aria-label={t('common.back', 'Retour')} icon={<ArrowBackIcon />} onClick={onBack} /><Heading size="sm">{contact.title}</Heading></Flex>
    {preview && <Text px={4} fontSize="sm">{t('clubMessaging.preview')}</Text>}
    <Stack ref={pane} flex={1} minH={0} overflowY="auto" p={4} spacing={3}>
      {more && <Button size="sm" isLoading={olderBusy} onClick={older}>{t('clubMessaging.older')}</Button>}
      {loading ? <Spinner /> : !error && !messages.length && <Text>{t('clubMessaging.noMessages')}</Text>}
      {messages.map(message => <Box key={message.id} data-message-id={message.id} alignSelf={message.side === (ownerView ? 'club' : 'member') ? 'flex-end' : 'flex-start'} bg={message.side === (ownerView ? 'club' : 'member') ? 'blue.100' : 'gray.100'} color="gray.900" borderRadius="xl" p={3} maxW="85%">
        <Text whiteSpace="pre-wrap" overflowWrap="anywhere" hidden={!!message.cancellation}>{message.terminationRequest?.label?`${clubText(message.terminationRequest.label)}\n${message.terminationRequest.clientName}${message.terminationRequest.end?' · '+message.terminationRequest.end:''}\n${message.terminationRequest.body}`:message.type==='cancellation-decision'?`${clubText(message.decision==='accepted'?'Justification acceptée':'Justification refusée')} · ${message.sessionTitle}${message.reviewNote?`\n${message.reviewNote}`:''}`:message.text}</Text><Text fontSize="xs" opacity={0.7}>{new Date(message.createdAtIso).toLocaleString()}</Text>
        {message.side === (ownerView?'club':'member') && message.id===lastOwn?.id &&
          <Text fontSize="xs">{confirmed ? t('messaging.read') : t('messaging.sent')}</Text>}
        {message.cancellation&&<CancellationMessage request={message.cancellation} canReview={ownerView&&!preview}/>}
        {message.terminationRequest&&<Button mt={2} size="sm" isDisabled={preview} onClick={()=>setTermination(message.terminationRequest)}>{clubText('Voir la demande de résiliation')}</Button>}
        {ownerView && message.classRequest?.classId && <Button mt={2} size="sm" onClick={() => onOpenAppointment ? onOpenAppointment({id:message.classRequest.classId}) : navigate(`/club-dashboard?appointment=${encodeURIComponent(message.classRequest.classId)}`)}>{clubText('Voir le cours et les inscriptions')}</Button>}
      </Box>)}<div ref={bottom} />
    </Stack>
    {error && <Text role="alert" px={4} color="red.500">{t('clubMessaging.error')}</Text>}
    {!preview && <Flex p={4} gap={2} as="form" onSubmit={e => { e.preventDefault(); send(); }}><Textarea onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); if (!e.repeat) void send(); } }} aria-label={t('messaging.placeholder', 'Message')} value={draft} onChange={e => setDraft(e.target.value)} maxLength={4000} isDisabled={sending} /><Button type="submit" colorScheme="blue" isLoading={sending} isDisabled={!draft.trim()}>{t('messaging.send', 'Envoyer')}</Button></Flex>}
  </Flex>;
}
export default function ClubMessagingPanel(props) {
  const scope=useMessagingIdentity();
  const [params]=useSearchParams();
  const club=props.clubId || params.get('clubId') || params.get('adminClubId') || '';
  return scope ? <ClubPanel key={JSON.stringify([scope,club])} {...props}/> : null;
}
function ClubPanel({ embedded = false, clubId: requestedClubId, onOpenAppointment } = {}) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const clubId = requestedClubId || params.get('clubId') || params.get('adminClubId') || '';
  const [picked,setPicked]=useState(null);
  const [category, setCategory] = useState('coach');
  const [composing, setComposing] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(()=>params.get('conversation')); 
  const inbox=useMessagingFeed({scope:clubId});
  const needsTarget=!!selected && !inbox.error && !inbox.loading && !inbox.contacts.some(c=>c.id===selected) && picked?.key!==inbox.scopeKey;
  const feed=useMessagingFeed({scope:clubId,compose:composing || needsTarget});
  const data={...feed,contacts:mergeContacts(feed.directory,feed.contacts)};
  const error=feed.error || feed.directoryError;
  const contact=!error && (data.contacts.find(c=>c.id===selected)
    || (picked?.key===feed.scopeKey && picked.contact.id===selected ? picked.contact : null));
  const contacts = (data?.contacts || []).filter(c => (composing ? (!data.ownerView || c.kind === category) : !!(c.lastMessageAt || c.lastMessage)) && `${c.title} ${c.email}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => (b.lastMessageAt || 0)-(a.lastMessageAt || 0));
  return <Box bg={theme.pageBg} color={theme.textColor} h={embedded ? "full" : undefined} minH={embedded ? 0 : "100vh"} p={embedded ? 0 : { base: 3, md: 6 }} pb={embedded ? 0 : 24}>
    <Box maxW="7xl" mx="auto" h={embedded ? "full" : undefined} display={embedded ? "flex" : undefined} flexDirection="column">{!embedded && <Flex gap={3} mb={4} align="center"><Button size="sm" variant="outline" leftIcon={<ArrowBackIcon />} flexShrink={0} onClick={() => navigate(data?.ownerView ? `/club-dashboard${clubId ? `?adminClubId=${encodeURIComponent(clubId)}` : ''}` : '/messages')}>{t('common.back', 'Retour')}</Button><Box><Heading size="md">{data?.clubName || t('clubMessaging.title')}</Heading></Box></Flex>}
    {data?.preview && <Text mb={3} fontSize="sm">{t('clubMessaging.preview')}</Text>}
    {error && <Flex role="alert" mb={3} gap={2}><Text>{t('clubMessaging.error')}</Text><Button size="sm" onClick={() => feed.retry()}>{t('clubMessaging.retry')}</Button></Flex>}
    {feed.loading && !error ? <Spinner /> : <AppSurface p={0} overflow="hidden" flex={embedded ? 1 : undefined} minH={0} borderRadius={embedded ? 0 : undefined}><Flex h={embedded ? "full" : "650px"} maxH={embedded ? undefined : "75dvh"} minH={embedded ? 0 : "460px"}>
      <Box display={embedded ? (contact ? 'none' : 'block') : { base: contact ? 'none' : 'block', md: 'block' }} w={embedded ? 'full' : { base: 'full', md: '330px' }} flexShrink={0} p={4} overflowY="auto" borderRightWidth="1px">
        <Button size="sm" mb={3} variant="outline" aria-pressed={composing} onClick={() => { setComposing(v => !v); setSearch(''); }}>{composing ? clubText('Conversations') : clubText('Nouvelle discussion')}</Button>
        {composing && data?.ownerView && <Flex gap={2} mb={3}>{['coach', 'client'].map(kind => <Button key={kind} size="sm" aria-pressed={category === kind} variant={category === kind ? 'solid' : 'outline'} onClick={() => { setCategory(kind); }}>{t(`clubMessaging.${kind}`)} ({data.contacts.filter(c => c.kind === kind).length}){data.contacts.some(c=>c.kind===kind&&c.unread)&&<Badge ml={2} bg="red.500" color="white" borderRadius="full">{data.contacts.filter(c=>c.kind===kind&&c.unread).length}</Badge>}</Button>)}</Flex>}
        {composing && <Input mb={3} aria-label={t('clubMessaging.search')} placeholder={t('clubMessaging.search')} value={search} onChange={e => setSearch(e.target.value)} />}
        {!contacts.length && <Text fontSize="sm">{composing ? t('clubMessaging.empty') : t('clubMessaging.noMessages')}</Text>}
        <Stack>{contacts.map(c => <Button key={c.id} h="auto" py={3} whiteSpace="normal" justifyContent="flex-start" variant={selected === c.id ? 'solid' : 'ghost'} isDisabled={!c.peerUid} onClick={() => { setPicked(c.lastMessageAt ? null : {key:feed.scopeKey,contact:c}); setSelected(c.id); setComposing(false); setSearch(''); }}><Box textAlign="start"><Text>{c.title || c.email}</Text>{c.unread && <Badge bg="red.500" color="white">{t('clubMessaging.unread')}</Badge>}<Text fontSize="xs" fontWeight="normal" noOfLines={1}>{c.peerUid ? clubText(c.lastMessage) : t('clubMessaging.unlinked')}</Text></Box></Button>)}</Stack>
      </Box><Box flex={1} minW={0} display={embedded ? (contact ? 'block' : 'none') : { base: contact ? 'block' : 'none', md: 'block' }}>{contact ? <ClubThread onOpenAppointment={onOpenAppointment} key={feed.scopeKey+contact.id} contact={contact} preview={data.preview} ownerView={data.ownerView} onBack={() => setSelected(null)} t={t} /> : <Flex h="full" p={6} align="center" justify="center"><Text>{t('messaging.selectTitle')}</Text></Flex>}</Box>
    </Flex></AppSurface>}</Box>
  </Box>;
}
