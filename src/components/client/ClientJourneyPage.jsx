import RightDisclosureSummary from '../ui/RightDisclosureSummary';
import ClientCycleTimeline from './ClientCycleTimeline';
import PageBackButton from '../ui/PageBackButton';
import { AppSectionHeader, AppSurface } from '../ui/AppPrimitives';
import React, { useEffect, useState } from 'react';
import { Box, Heading, Text, Button, Flex, VStack, Progress, Badge, Skeleton, Icon, useColorModeValue } from '@chakra-ui/react';
import { MdOutlinePlayArrow, MdOutlineCheckCircle } from 'react-icons/md';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../AuthContext';
import { db } from '../../firebaseConfig';
import { resolveClientSnapshotForUser } from '../../utils/clientResolver';
import { journeyLabels } from '../../i18n/clientJourney';
import { subscriptionCycleMessage } from '../../i18n/subscriptionCycle';
import { journeyName, journeySessions, journeyProgress, selectJourneyProgram, isCoachedJourney } from '../../utils/clientJourney';
import { readProgramActiveWeeks, getProgramSessionsPerWeek, formatProgramActiveWeeks } from '../../utils/programDuration';
import useJourneyRecords from '../../hooks/useJourneyRecords';

function Journey({clientId,profile,programs,view}) {
  const {i18n,t}=useTranslation();
  const labels=journeyLabels(i18n.language);
  const waiting=subscriptionCycleMessage(profile,i18n.language)||labels.waiting;
  const navigate=useNavigate();
  const location=useLocation();
  const current=selectJourneyProgram(profile,programs);
  const {records=[],loading,error,retry}=useJourneyRecords(clientId,current?.id);
  const progress=journeyProgress(current,records);
  const bg=useColorModeValue('#f4f6fa','#0b101b');
  const paper=useColorModeValue('white','#171e2b');
  const muted=useColorModeValue('gray.600','gray.400');
  const gradient=useColorModeValue('linear-gradient(115deg,white,#edf3ff)','linear-gradient(115deg,#171e2b,#1e304a)');
  const sessions=journeySessions(current);
  const next=sessions[progress.nextIndex];
  const title=next?.name || next?.nom || next?.title || t('client_dash.session_n',{n:progress.nextIndex+1});
  const perWeek=getProgramSessionsPerWeek(current || {});
  const week=Math.min(readProgramActiveWeeks(current || {}),Math.floor(progress.done/Math.max(1,perWeek))+1);
  const completedReturn=location.state?.completedJourneyProgramId;
  const start=()=>{
    if (!current || loading || error || progress.complete || !sessions.length) return;
    navigate(`/clients/${clientId}/programmes/${current.id}/session/${progress.nextIndex}/play`,{state:{
      clientJourney:true, resumeSessionIndex:progress.nextIndex,
      exerciseIndex:Number(progress.resume?.lastExerciseIndex)||0,
      resumeExerciseIndex:Number(progress.resume?.lastExerciseIndex)||0,
      currentSet:Number(progress.resume?.lastSet)||1, resumeSet:Number(progress.resume?.lastSet)||1,
      resumePct:progress.resume?.pourcentageTermine ?? null,
    }});
  };
  return <Box bg={bg} p={{base:4,md:7}} pb={{base:28,md:10}} minH="80vh" dir={i18n.dir()} data-testid="client-journey">
    <VStack maxW="900px" mx="auto" align="stretch" spacing={5}>
      <AppSurface p={{base:4,md:5}}>
        <Flex align="flex-start" gap={3}>
          <PageBackButton label={t('common.back', 'Retour')} />
          <AppSectionHeader flex="1" headingAs="h1"
            title={view==='program'?t('client_dash.my_programs','Mes programmes'):t('client_dash.hello_name',{name:profile.prenom || profile.firstName || profile.name?.split(' ')[0] || profile.fullName?.split(' ')[0] || t('client_dash.client')})}
            subtitle={labels.step}/>
        </Flex>
      </AppSurface>
      {completedReturn && <Flex bg={paper} borderWidth="1px" borderRadius="20px" p={4} gap={3} align="center" role="status"><Icon as={MdOutlineCheckCircle} color="green.500" boxSize={7}/><Text fontWeight="semibold">{progress.complete && current?.id===completedReturn ? labels.finished : labels.saved}</Text></Flex>}
      <Box bg={paper} bgImage={gradient} borderWidth="1px" borderRadius="24px" p={{base:5,md:7}}>
        <Flex justify="space-between" align="center" gap={3} wrap="wrap"><Text color={muted} fontSize="sm">{completedReturn && current && current.id!==completedReturn?labels.next:labels.current}</Text>{current && <Badge colorScheme={progress.complete?'green':'blue'} borderRadius="full" px={3} py={1}>{progress.complete?labels.finished:labels.partial}</Badge>}</Flex>
        {!current ? <Text mt={4}>{waiting}</Text> : <>
          <Heading size="lg" mt={3}>{journeyName(current)}</Heading><Text mt={2} mb={5} color={muted}>{formatProgramActiveWeeks(current,t)}</Text>
          {loading ? <Skeleton height="100px"/> : error ? <Box role="alert"><Text>{labels.error}</Text><Button onClick={retry} mt={3}>{labels.retry}</Button></Box> : <>
            <Flex justify="space-between" gap={3}><Text color={muted}>{labels.done}</Text><Text fontWeight="bold">{progress.done} / {progress.total}</Text></Flex>
            <Progress value={progress.total?Math.min(100,progress.done/progress.total*100):0} mt={3} mb={5} height="7px" borderRadius="full" aria-label={labels.done} sx={{'& > div':{background:'linear-gradient(90deg,#2460ff,#04b7e9)'}}}/>
            {progress.complete ? <Text>{waiting}</Text> : <><Text fontSize="sm" color={muted}>{labels.week} {week} / {readProgramActiveWeeks(current)} · {progress.resume?labels.resume:labels.nextSession}</Text><Heading size="md" mt={1}>{title}</Heading><Button onClick={start} isDisabled={!sessions.length || !progress.total} w="full" mt={5} size="lg" borderRadius="full" leftIcon={<MdOutlinePlayArrow/>}>{progress.resume?labels.resume:labels.start}</Button></>}
          </>}
          <Flex justify="flex-end" mt={3}><Button variant="ghost" size="sm" onClick={()=>navigate(String(current.origine || '').includes('auto')?`/auto-program-preview/${clientId}/${current.id}`:`/clients/${clientId}/programmes/${current.id}`)}>{labels.view}</Button></Flex>
        </>}
      </Box>
      {view==='program' && <ClientCycleTimeline profile={profile} programs={programs} clientId={clientId}/>}
      {view==='program' && programs.some(p=>p.id!==current?.id && p.status!=='draft') && <Box as="details" bg={paper} borderWidth="1px" borderRadius="24px" p={5}><RightDisclosureSummary py={0} fontWeight="semibold">{labels.all}</RightDisclosureSummary>{programs.filter(p=>p.id!==current?.id && p.status!=='draft').map(p=><Flex key={p.id} align="center" gap={3} py={3} borderTopWidth="1px"><Text flex="1">{journeyName(p)}</Text><Button variant="outline" size="sm" borderRadius="full" onClick={()=>navigate(String(p.origine || '').includes('auto')?`/auto-program-preview/${clientId}/${p.id}`:`/clients/${clientId}/programmes/${p.id}`)}>{labels.view}</Button></Flex>)}</Box>}
    </VStack>
  </Box>;
}

// Keep autonomous subscriptions and nutrition-only dashboards unchanged.
export default function ClientJourneyPage({children,view='home'}) {
  const {user}=useAuth();
  const location=useLocation();
  const {i18n}=useTranslation();
  const [state,setState]=useState({loading:true});
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!user?.uid)return;
    let alive=true;let stopProfile;let stopPrograms;
    setState({loading:true});
    const timer=setTimeout(()=>{if(alive)setState(s=>s.loading?{...s,loading:false,error:true}:s)},15000);
    resolveClientSnapshotForUser(user).then(snapshot=>{
      if(!alive)return;
      if(!snapshot){clearTimeout(timer);setState({loading:false});return;}
      const clientId=snapshot.id;
      setState(s=>({...s,clientId,profile:snapshot.data()}));
      stopProfile=onSnapshot(doc(db,'clients',clientId),d=>{if(alive)setState(s=>({...s,profile:d.data()}));},()=>{if(alive)setState(s=>({...s,error:true,loading:false}));});
      stopPrograms=onSnapshot(collection(db,'clients',clientId,'programmes'),s=>{clearTimeout(timer);if(alive)setState(previous=>({...previous,loading:false,programs:s.docs.map(d=>({...d.data(),id:d.id}))}));},()=>{clearTimeout(timer);if(alive)setState(s=>({...s,error:true,loading:false}));});
    }).catch(()=>{clearTimeout(timer);if(alive)setState({loading:false,error:true});});
    return ()=>{alive=false;clearTimeout(timer);stopProfile?.();stopPrograms?.();};
  // User identity, not profile object changes, owns these subscriptions.
  },[user?.uid,attempt]);
  if(state.loading)return <Box p={6}><Skeleton height="260px" borderRadius="24px"/></Box>;
  if(state.error)return <Box p={6} role="alert"><Text>{journeyLabels(i18n.language).error}</Text><Button mt={3} onClick={()=>setAttempt(n=>n+1)}>{journeyLabels(i18n.language).retry}</Button></Box>;
  const showExistingProgrammeJourney=view==='program' && state.profile?.sportFollowView!=='programs' && state.programs?.length>0;
  if(new URLSearchParams(location.search).get('view')==='agenda' || (!showExistingProgrammeJourney && !isCoachedJourney(state.profile,state.programs || [])))return children;
  return <Journey {...state} view={view}/>;
}
