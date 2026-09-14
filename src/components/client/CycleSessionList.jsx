import RightDisclosureSummary from '../ui/RightDisclosureSummary';
import React, { lazy, Suspense, useState } from 'react';
import { Box, Badge, Button, Flex, Text, Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, Spinner, useColorModeValue } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { cycleSessionWeeks, cycleRecordDate } from '../../utils/cycleSessionWeeks';
import { isSessionValidatedRecord } from '../../utils/sessionCompletion';
import { previousComparableSession, previousExercise, setChanges, identicalSetSummary } from '../../utils/cycleSessionComparison';
const SessionComparator = lazy(() => import('../SessionComparator'));

export default function CycleSessionList({ clientId, program, cycle, tx, dateText, onViewPlanned, initialOpenWeek }) {
  const [comparison, setComparison] = useState(null);
  const { i18n } = useTranslation();
  const muted = useColorModeValue('gray.600', 'gray.400');
  const increase = useColorModeValue('teal.700', 'teal.200');
  const separator = useColorModeValue('blackAlpha.100', 'whiteAlpha.100');
  const exerciseBg = useColorModeValue('blackAlpha.50', 'whiteAlpha.50');
  const number = value => Number(value).toLocaleString(i18n.resolvedLanguage || i18n.language, { maximumFractionDigits: 2 });
  const setLabel = set => {
    const parts = [];
    if (set.reps != null && set.chargeKg != null) parts.push(`${number(set.reps)} × ${number(set.chargeKg)} kg`);
    else if (set.reps != null) parts.push(`${number(set.reps)} ${tx('repsShort', 'rép.')}`);
    else if (set.chargeKg != null) parts.push(`${number(set.chargeKg)} kg`);
    if (set.durationSec != null) {
      const seconds = Math.max(0, Number(set.durationSec));
      parts.push(seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')} min` : `${number(seconds)} s`);
    }
    return parts.join(' · ') || '—';
  };
  const sessions = program.sessions || program.seances || [];
  const records = program.sessionsEffectuees || [];
  const recordIndex = record => Number.isInteger(record.sessionIndex) ? record.sessionIndex : record.seanceIndex;
  const renderRecord = (record, index) => {
    const done = isSessionValidatedRecord(record);
    const sessionIndex = recordIndex(record);
    const previous = previousComparableSession(records, record);
    return <Box as="details" id={`cycle-session-${record.id}`} key={record.id || index} scrollMarginTop="90px" borderWidth="1px" borderRadius="xl" p={{ base: 2.5, md: 4 }} mt={2}>
      <RightDisclosureSummary py={0}>
        <Flex align="center" gap={2} wrap="wrap">
          <Text fontSize="sm" fontWeight="600">{record.sessionTitle || sessions[sessionIndex]?.name || `${tx('session', 'Séance')} ${index + 1}`}</Text>
          <Badge colorScheme={done ? 'green' : 'orange'} borderRadius="full" px={2} fontSize="10px" textTransform="none">{done ? tx('done', 'Terminé') : tx('partial', 'Partielle')}</Badge>
          <Text fontSize="xs" color={muted} ms={{ base: 0, md: 'auto' }}>{dateText(cycleRecordDate(record))}</Text>
        </Flex>
      </RightDisclosureSummary>
      {record.notes && <Text mt={2}>{record.notes}</Text>}
      <Flex gap={2} columnGap={4} wrap="wrap" mt={3} mb={3} fontSize="xs" color={muted}>
        {record.difficultyRating != null && <Text>{tx('rating', 'Difficulté')} · {record.difficultyRating}/5</Text>}
        {previous && <Text>{tx('changeSince', 'Écart par rapport au')} {dateText(cycleRecordDate(previous))}</Text>}
      </Flex>
      <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(min(100%, 270px), 1fr))" gap={2.5} alignItems="start">
      {(record.exerciseSnapshots || []).map((exercise, i) => {
        const priorExercise = previousExercise(previous, exercise);
        const sets = exercise.sets || [];
        const compact = identicalSetSummary(sets, priorExercise);
        const changes = (set, j) => <Flex gap={2} wrap="wrap" justify="flex-end" fontSize="xs">
          {setChanges(set, j, priorExercise).map(({ metric, delta }) => <Text key={metric} color={delta > 0 ? increase : muted} fontWeight="500" whiteSpace="nowrap">
            {delta > 0 ? '+' : '−'}{number(Math.abs(delta))} {metric === 'chargeKg' ? 'kg' : metric === 'durationSec' ? 's' : tx('repsShort', 'rép.')}
          </Text>)}
        </Flex>;
        const rows = sets.map((set, j) => <Flex key={j} align="baseline" gap={2} py={0.5} fontSize="sm" fontVariantNumeric="tabular-nums">
          <Text color={muted} fontSize="xs" minW="18px">{set.setIndex ?? j + 1}</Text>
          <Text flex="1" minW={0}>{setLabel(set)}</Text>
          {changes(set, j)}
        </Flex>);
        return <Box key={i} minW={0} p={3} bg={exerciseBg} borderRadius="lg">
        <Text fontWeight="600" fontSize="sm" mb={1}>{exercise.exerciseName || exercise.name}</Text>
        {compact ? <>
          <Flex gap={2} align="baseline" justify="space-between" wrap="wrap">
            <Text fontSize="sm">{setLabel(sets[0])}</Text>{changes(sets[0], 0)}
          </Flex>
          <Box as="details" mt={2}>
            <RightDisclosureSummary py={0} color={muted} fontSize="xs">{sets.length} {tx('identicalSets', 'séries identiques')}</RightDisclosureSummary>
            <Box mt={2} pt={2} borderTopWidth="1px" borderColor={separator}>{rows}</Box>
          </Box>
        </> : rows}
      </Box>; })}
      </Box>
      {!record.exerciseSnapshots?.length && <Text fontSize="sm" mt={2}>{tx('noResults', 'Aucun détail d’exercice enregistré pour cette séance.')}</Text>}
      {clientId && done && Number.isInteger(sessionIndex) && <Flex justify="flex-end" mt={3}><Button size="sm" borderRadius="full" variant="outline" onClick={() => setComparison({ sessionIndex, recordId: record.runId || record.completionId || record.id })}>{tx('compare', 'Comparer cette séance')}</Button></Flex>}
    </Box>;
  };
  const grouped = cycleSessionWeeks(records, sessions.length, cycle.weeks);
  return <>
    <Text fontSize="sm" mt={2}>{tx('sequentialWeeks', 'Les semaines avancent avec les séances terminées, même après une pause. Les dates affichées sont les dates réelles.')}</Text>
    {!program.__detailsLoaded && <Spinner size="sm" />}
    {Array.from({ length: cycle.weeks }, (_, index) => {
      const weekRecords = grouped.weeks[index];
      return <Box as="details" key={index} open={initialOpenWeek === index + 1 ? true : undefined} mt={2} borderWidth="1px" borderRadius="lg" p={3}>
        <RightDisclosureSummary py={0} fontWeight="bold">{tx('week', 'Semaine')} {index + 1} <Text as="span" fontWeight="normal" fontSize="sm">· {weekRecords.length}/{sessions.length}{sessions.length > 0 && weekRecords.length === sessions.length ? ' ✓' : ''}</Text></RightDisclosureSummary>
        {weekRecords.map(renderRecord)}
        {program.__detailsLoaded && sessions.map((session, sessionIndex) => sessionIndex < weekRecords.length ? null : <Flex key={sessionIndex} align="center" justify="space-between" gap={2} mt={2} p={2}>
          <Text>{session.name || session.nom || session.title || `${tx('session', 'Séance')} ${sessionIndex + 1}`}</Text><Flex gap={2} align="center"><Badge flexShrink={0}>{tx('todo', 'À faire')}</Badge>{onViewPlanned && <Button size="sm" variant="outline" borderRadius="full" onClick={() => onViewPlanned(session, sessionIndex)}>{tx('viewSession', 'Voir')}</Button>}</Flex>
        </Flex>)}
      </Box>;
    })}
    {grouped.partial.length > 0 && <Box as="details" mt={2} p={3} borderWidth="1px" borderRadius="lg"><RightDisclosureSummary py={0}>{tx('partialAttempts', 'Séances partielles — non comptées dans la progression')} ({grouped.partial.length})</RightDisclosureSummary>{grouped.partial.map(renderRecord)}</Box>}
    {grouped.extra.length > 0 && <Box as="details" mt={2} p={3} borderWidth="1px" borderRadius="lg"><RightDisclosureSummary py={0}>{tx('extraSessions', 'Séances supplémentaires après la fin du programme')} ({grouped.extra.length})</RightDisclosureSummary>{grouped.extra.map(renderRecord)}</Box>}
    <Modal isOpen={!!comparison} onClose={() => setComparison(null)} size="6xl" scrollBehavior="inside">
      <ModalOverlay /><ModalContent maxH="90dvh" mx={3}><ModalHeader>{tx('compare', 'Comparer cette séance')}</ModalHeader><ModalCloseButton /><ModalBody pb={4}>
        {comparison && <Suspense fallback={<Spinner />}><SessionComparator key={`${program.id}:${comparison.recordId}`} clientId={clientId} programmes={[program]} initialSessionIndex={comparison.sessionIndex} initialRunId={comparison.recordId} embedded /></Suspense>}
      </ModalBody></ModalContent>
    </Modal>
  </>;
}
