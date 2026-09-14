import React, { useEffect, useRef, useState } from 'react';
import useCenteredCycle from '../../hooks/useCenteredCycle';
import ClientWeekSessions from './ClientWeekSessions';
import { Box, Flex, Heading, Text, Button, useColorModeValue } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { clientCycleTimeline } from '../../utils/clientCycleTimeline';
import { journeyName, journeyProgress } from '../../utils/clientJourney';
import { journeyLabels } from '../../i18n/clientJourney';
import useJourneyRecords from '../../hooks/useJourneyRecords';
import { formatProgramActiveWeeks, getProgramSessionsPerWeek } from '../../utils/programDuration';

export const cycleTimelineCopy={
  fr:['Mon parcours','Cycles validés et disponibles','En cours','À venir','Terminé','Voir le programme','Ce programme sera activé à son tour dans votre parcours.','Préparation générale','Endurance','Hypertrophie','Force','Récupération','Personnalisé'],
  en:['My training plan','Approved and available cycles','Current','Upcoming','Completed','View programme','This programme will become active when its turn comes in your plan.','General preparation','Endurance','Hypertrophy','Strength','Recovery','Custom'],
  es:['Mi planificación','Ciclos aprobados y disponibles','En curso','Próximo','Terminado','Ver programa','Este programa se activará cuando llegue su turno en tu planificación.','Preparación general','Resistencia','Hipertrofia','Fuerza','Recuperación','Personalizado'],
  it:['Il mio percorso','Cicli approvati e disponibili','In corso','Prossimo','Completato','Vedi programma','Questo programma si attiverà quando arriverà il suo turno nel percorso.','Preparazione generale','Resistenza','Ipertrofia','Forza','Recupero','Personalizzato'],
  de:['Mein Trainingsplan','Freigegebene und verfügbare Zyklen','Aktuell','Demnächst','Abgeschlossen','Programm ansehen','Dieses Programm wird aktiviert, sobald es in deinem Plan an der Reihe ist.','Allgemeine Vorbereitung','Ausdauer','Hypertrophie','Kraft','Erholung','Individuell'],
  ru:['Мой план','Подтверждённые и доступные циклы','Текущий','Предстоящий','Завершён','Посмотреть программу','Эта программа станет активной, когда подойдёт её очередь в вашем плане.','Общая подготовка','Выносливость','Гипертрофия','Сила','Восстановление','Индивидуальный'],
  ar:['خطتي التدريبية','الدورات المعتمدة والمتاحة','الحالية','القادمة','مكتملة','عرض البرنامج','سيتم تفعيل هذا البرنامج عندما يحين دوره في خطتك.','الإعداد العام','التحمل','تضخم العضلات','القوة','التعافي','مخصص'],
};
const types=['general','endurance','hypertrophy','strength','recovery','custom'];
const historyCopy={fr:['Antérieur','Disponible'],en:['Previous','Available'],es:['Anterior','Disponible'],it:['Precedente','Disponibile'],de:['Früher','Verfügbar'],ru:['Предыдущий','Доступен'],ar:['سابق','متاح']};
const returnCopy={fr:'Revenir au cycle en cours',en:'Back to current cycle',es:'Volver al ciclo actual',it:'Torna al ciclo attuale',de:'Zurück zum aktuellen Zyklus',ru:'Вернуться к текущему циклу',ar:'العودة إلى الدورة الحالية'};
export default function ClientCycleTimeline({profile,programs,clientId,...props}) {
  const {i18n,t}=useTranslation();
  const navigate=useNavigate();
  const [selection,setSelection]=useState(null);
  const cardRef=useRef(null);
  const resultsRef=useRef(null);
  const [reservedHeight,setReservedHeight]=useState({card:0,results:0});
  const selectCycle=id=>{
    // Keep enough page height while results are replaced, without scrolling the user.
    const top=cardRef.current?.getBoundingClientRect().top??0;
    setReservedHeight({card:Math.max(0,window.innerHeight-top),results:resultsRef.current?.getBoundingClientRect().height||0});
    setSelection(id);
  };
  const background=useColorModeValue('white','#171e2b');
  const muted=useColorModeValue('gray.600','gray.400');
  const activeBg=useColorModeValue('#111827','#e2e8f0');
  const activeText=useColorModeValue('white','#111827');
  const rows=clientCycleTimeline(profile,programs);
  const copy=cycleTimelineCopy[String(i18n.language||'fr').split('-')[0]]||cycleTimelineCopy.fr;
  const selected=rows.find(c=>c.id===selection)||rows.find(c=>c.state==='current')||rows[0];
  const currentCycle=rows.find(c=>c.state==='current');
  const stripRef=useCenteredCycle(selected?.id,JSON.stringify([clientId,rows.map(c=>c.id)]));
  useEffect(()=>{setSelection(null);setReservedHeight({card:0,results:0});},[clientId]);
  const {records,loading,error,retry}=useJourneyRecords(clientId,selected?.program.id);
  const progress=journeyProgress(selected?.program,records);
  const labels=journeyLabels(i18n.language);
  const history=historyCopy[String(i18n.language||'fr').split('-')[0]]||historyCopy.fr;
  if(!rows.length)return null;
  const title=c=>c.name||copy[7+(types.includes(c.type)?types.indexOf(c.type):5)];
  const state=c=>c.id===selected.id&&!loading&&!error&&progress.complete?copy[4]:c.state==='past'?history[0]:c.state==='available'?history[1]:copy[{current:2,upcoming:3,completed:4}[c.state]];
  return <Box ref={cardRef} minH={`${reservedHeight.card}px`} bg={background} borderWidth="1px" borderRadius="24px" p={{base:4,md:5}} dir={i18n.dir()} data-testid="client-cycle-timeline" {...props}>
    <Flex align="center" justify="space-between" gap={3} wrap="wrap" mb={2}>
      <Heading size="sm">{copy[0]}</Heading>
      {currentCycle&&<Button visibility={selected.id===currentCycle.id?'hidden':'visible'} size="sm" variant="outline" borderRadius="full" onClick={()=>selectCycle(currentCycle.id)}>{returnCopy[String(i18n.language||'fr').split('-')[0]]||returnCopy.fr}</Button>}
    </Flex>
    <Flex ref={stripRef} gap={2} overflowX="auto" py={2} role="group" aria-label={copy[0]}>
      {rows.map((c,index)=><Button key={c.id} onClick={()=>selectCycle(c.id)} aria-pressed={selected.id===c.id} h="auto" minH="44px" py={2} px={3} minW="128px" flexShrink={0} borderRadius="12px" variant="outline" bg={selected.id===c.id?activeBg:undefined} color={selected.id===c.id?activeText:undefined} _hover={{opacity:.85}}>
        <Box textAlign="start"><Text fontSize="xs" fontWeight="normal" opacity={.8}>{String(index + 1).padStart(2,'0')} · {state(c)}</Text><Text mt={.5} fontSize="sm">{title(c)}</Text><Text mt={.5} fontSize="xs" fontWeight="normal" opacity={.8}>{formatProgramActiveWeeks({activeWeeks:c.weeks},t)}</Text></Box>
      </Button>)}
    </Flex>
    <Flex align="center" justify="space-between" gap={2} wrap="wrap" pt={1}>
      <Box flex="1" minW="120px"><Text fontSize="sm" fontWeight="semibold">{journeyName(selected.program)}</Text><Text fontSize="xs" color={muted}>{state(selected)}</Text></Box>
      <Button size="sm" variant="outline" borderRadius="full" onClick={()=>navigate(`/clients/${clientId}/programmes/${selected.program.id}`)}>{copy[5]}</Button>
    </Flex>
    <Box ref={resultsRef} overflowAnchor="none" minH={loading?`${reservedHeight.results}px`:undefined}>
    {loading?<Text role="status" color={muted}>…</Text>:error?<Box role="alert" mt={3}><Text>{labels.error}</Text><Button size="sm" variant="outline" onClick={retry}>{labels.retry}</Button></Box>:<>
      <Text fontSize="xs" color={muted} mt={1}>{labels.done} · {progress.done} / {progress.total}</Text>
      <Box borderTopWidth="1px" mt={4} pt={4}>
        <ClientWeekSessions key={selected.id} embedded clientId={clientId} program={selected.program} records={records} currentWeek={Math.floor(progress.done/Math.max(1,getProgramSessionsPerWeek(selected.program)))+1}/>
      </Box>
    </>}
    </Box>
    {selected.state==='upcoming'&&<Text mt={2} fontSize="xs" color={muted}>{copy[6]}</Text>}
  </Box>;
}
