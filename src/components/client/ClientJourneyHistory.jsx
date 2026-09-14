import React, { lazy, Suspense, useState } from 'react';
import { Box, Text, Heading, Flex, Button, Badge, Skeleton, Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, useColorModeValue } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { journeyLabels } from '../../i18n/clientJourney';
import { journeyName, journeyProgress, journeyRecordTime, journeyTime, isJourneyValidated } from '../../utils/clientJourney';
import useJourneyRecords from '../../hooks/useJourneyRecords';
import RightDisclosureSummary from '../ui/RightDisclosureSummary';
const SessionComparator = lazy(() => import('../SessionComparator'));

function ProgrammeHistory({clientId, program, labels, language, onSelect, current=false}) {
  const [open,setOpen] = useState(current);
  const [showAll,setShowAll] = useState(false);
  const {t}=useTranslation();
  const {records=[],loading,error,retry} = useJourneyRecords(clientId,open ? program.id : null);
  const muted = useColorModeValue('gray.600','gray.400');
  const progress = journeyProgress(program,records);
  const ordered=[...records].sort((a,b)=>journeyRecordTime(b)-journeyRecordTime(a));
  return <Box as="details" open={open} onToggle={e=>setOpen(e.currentTarget.open)} borderTopWidth="1px" py={2}>
    <RightDisclosureSummary fontWeight="semibold">{journeyName(program) || labels.program}</RightDisclosureSummary>
    {open && <Box pb={2}>
      {loading ? <Skeleton height="70px"/> : error ? <Button onClick={retry}>{labels.retry}</Button> : <>
        {!current && <Flex justify="space-between" mb={3}><Text color={muted} fontSize="sm">{labels.done} · {progress.done} / {progress.total}</Text><Badge colorScheme={progress.complete?'green':'blue'}>{progress.complete?labels.finished:labels.partial}</Badge></Flex>}
        {!records.length && <Text color={muted}>{labels.empty}</Text>}
        {(showAll?ordered:ordered.slice(0,3)).map((record,index)=> {
          const time=journeyRecordTime(record);
          const sessionIndex=Number(record.sessionIndex ?? record.seanceIndex ?? 0);
          return <Flex key={record.id || index} align="center" gap={3} borderTopWidth="1px" py={3}>
            <Box flex="1" minW={0}><Text fontWeight="semibold">{isJourneyValidated(record)?'✓ ':''}{record.sessionName || record.sessionTitle || record.title || `${labels.sessions} ${sessionIndex+1}`}</Text><Text fontSize="sm" color={muted}>{time ? new Intl.DateTimeFormat(language,{day:'2-digit',month:'2-digit',year:'numeric'}).format(time) : '—'}{!isJourneyValidated(record)?` · ${labels.partial}`:''}</Text></Box>
            <Button size="sm" variant="outline" borderRadius="full" onClick={()=>onSelect({program,record,sessionIndex,recordId:record.runId || record.completionId || record.id})}>{labels.view}</Button>
          </Flex>;
        })}
        {!showAll && ordered.length>3 && <Flex justify="flex-end"><Button variant="ghost" size="sm" onClick={()=>setShowAll(true)}>{t('client_dash.view_all','Voir tous')} ({ordered.length})</Button></Flex>}
      </>}
    </Box>}
  </Box>;
}

export default function ClientJourneyHistory({clientId,programmes=[],currentProgramId}) {
  const {i18n,t} = useTranslation();
  const labels = journeyLabels(i18n.language);
  const [selected,setSelected] = useState(null);
  const [compareOpen,setCompareOpen] = useState(false);
  const bg = useColorModeValue('white','gray.800');
  const muted = useColorModeValue('gray.600','gray.400');
  const sorted = programmes.filter(p=>p.status!=='draft').sort((a,b)=>(a.id===currentProgramId?-1:b.id===currentProgramId?1:journeyTime(b.assignedAt || b.createdAt)-journeyTime(a.assignedAt || a.createdAt)));
  const renderProgram = program => <ProgrammeHistory key={`${program.id}:${program.id===currentProgramId}`} clientId={clientId} program={program} current={program.id===currentProgramId} labels={labels} language={i18n.language} onSelect={value=>{setCompareOpen(false);setSelected(value);}}/>;
  if (!clientId || !programmes.length) return null;
  return <Box bg={bg} borderWidth="1px" borderRadius="24px" p={{base:4,md:6}} data-testid="client-journey-history" dir={i18n.dir()}>
    <Heading size="md" mb={4}>{labels.sessions}</Heading>
    {sorted.slice(0,1).map(renderProgram)}
    {sorted.length>1 && <Box as="details"><RightDisclosureSummary>{labels.all} ({sorted.length-1})</RightDisclosureSummary>{sorted.slice(1).map(renderProgram)}</Box>}
    <Modal isOpen={!!selected} onClose={()=>setSelected(null)} size="6xl" scrollBehavior="inside">
      <ModalOverlay/><ModalContent mx={3} maxH="90dvh"><ModalHeader>{labels.sessions}</ModalHeader><ModalCloseButton/><ModalBody pb={6}>
        {selected && <>
          <Text fontWeight="bold">{selected.record.sessionName || selected.record.sessionTitle || journeyName(selected.program)}</Text>
          {selected.record.notes && <Text mt={3}>{selected.record.notes}</Text>}
          {selected.record.difficultyRating != null && <Text mt={3}>{t('sessionPlayer.difficultyQuestion','Difficulté ressentie')} : {selected.record.difficultyRating}/5</Text>}
          {(selected.record.exerciseSnapshots || []).map((exercise,index)=><Box key={index} borderTopWidth="1px" mt={4} pt={3}>
            <Text fontWeight="semibold">{exercise.exerciseName || exercise.name}</Text>
            {(exercise.sets || []).map((set,j)=><Text key={j} mt={1} color={muted}>{j+1} · {set.reps ?? '—'} × {set.chargeKg ?? '—'} kg{set.durationSec != null?` · ${set.durationSec} s`:''}</Text>)}
          </Box>)}
          {!selected.record.exerciseSnapshots?.length && <Text color={muted} mt={3}>{t('common.noData','Aucune donnée')}</Text>}
          <Box as="details" mt={5} onToggle={e=>setCompareOpen(e.currentTarget.open)}><RightDisclosureSummary>{t('stats.compareSession','Comparer une séance')}</RightDisclosureSummary>{compareOpen && <Suspense fallback={<Skeleton height="160px"/>}><SessionComparator key={selected.recordId} clientId={clientId} programmes={[selected.program]} initialSessionIndex={selected.sessionIndex} initialRunId={selected.recordId} embedded/></Suspense>}</Box>
        </>}
      </ModalBody></ModalContent>
    </Modal>
  </Box>;
}
