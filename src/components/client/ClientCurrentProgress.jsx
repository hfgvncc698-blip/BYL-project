import React from 'react';
import { Box, Heading, Text, Flex, Progress, Button, Skeleton, Badge, useColorModeValue } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import useJourneyRecords from '../../hooks/useJourneyRecords';
import { journeyName, journeyProgress, journeyRecordTime } from '../../utils/clientJourney';
import { journeyLabels } from '../../i18n/clientJourney';

export default function ClientCurrentProgress({clientId,program}) {
  const {i18n,t}=useTranslation();
  const labels=journeyLabels(i18n.language);
  const {records=[],loading,error,retry}=useJourneyRecords(clientId,program?.id);
  const state=journeyProgress(program,records);
  const bg=useColorModeValue('linear-gradient(115deg,#fff,#edf5ff)','linear-gradient(115deg,#141c2a,#1d3047)');
  const muted=useColorModeValue('gray.600','gray.400');
  const last=state.validated.at(-1);
  const date=last && journeyRecordTime(last);
  if(!program)return null;
  return <Box bgImage={bg} borderWidth="1px" borderRadius="24px" p={{base:5,md:6}} data-testid="client-current-progress">
    <Flex justify="space-between" gap={3} align="center" wrap="wrap"><Text color={muted} fontSize="sm">{labels.current}</Text>{!loading&&!error&&state.complete&&<Badge colorScheme="green" borderRadius="full" px={3}>{labels.finished}</Badge>}</Flex>
    <Heading size="md" mt={2} mb={5}>{journeyName(program)}</Heading>
    {loading?<Skeleton height="70px"/>:error?<Box role="alert"><Text>{labels.error}</Text><Button mt={2} onClick={retry}>{labels.retry}</Button></Box>:<>
      <Flex justify="space-between" gap={3}><Text color={muted}>{labels.done}</Text><Text fontWeight="bold">{state.done} / {state.total}</Text></Flex>
      <Progress value={state.total?Math.min(100,state.done/state.total*100):0} aria-label={labels.done} h="7px" borderRadius="full" mt={3} mb={4} sx={{'& > div':{background:'linear-gradient(90deg,#2460ff,#04b7e9)'}}}/>
      <Text fontSize="sm" color={muted}>{last ? `${t('auto.ClientView.derniere_seance','Dernière séance')} · ${date?new Intl.DateTimeFormat(i18n.language,{day:'2-digit',month:'2-digit',year:'numeric'}).format(date):'—'}` : labels.empty}</Text>
    </>}
  </Box>;
}
