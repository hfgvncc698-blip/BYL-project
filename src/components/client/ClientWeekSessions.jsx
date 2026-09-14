import React, {useState} from 'react';
import {Box,Text,Heading,Modal,ModalOverlay,ModalContent,ModalHeader,ModalCloseButton,ModalBody,useColorModeValue} from '@chakra-ui/react';
import {useTranslation} from 'react-i18next';
import CycleSessionList from './CycleSessionList';
import {cycleTranslations} from '../../i18n/cycleTranslations';
import {formatCycleDate} from '../../utils/trainingCycles';
import {readProgramActiveWeeks} from '../../utils/programDuration';

const copy={
  fr:['Résultats enregistrés','Contenu prévu — séance non terminée','Semaine précédente','Semaine suivante'],
  en:['Recorded results','Planned content — session not completed','Previous week','Next week'],
  es:['Resultados registrados','Contenido previsto — sesión no terminada','Semana anterior','Semana siguiente'],
  it:['Risultati registrati','Contenuto previsto — sessione non completata','Settimana precedente','Settimana successiva'],
  de:['Gespeicherte Ergebnisse','Geplanter Inhalt — Einheit nicht abgeschlossen','Vorherige Woche','Nächste Woche'],
  ru:['Записанные результаты','План — тренировка не завершена','Предыдущая неделя','Следующая неделя'],
  ar:['النتائج المسجلة','المحتوى المخطط — الحصة غير مكتملة','الأسبوع السابق','الأسبوع التالي'],
};
export default function ClientWeekSessions({clientId,program,records,currentWeek,embedded=false}) {
  const {i18n,t}=useTranslation();
  const tx=(key,fallback)=>cycleTranslations[String(i18n.language||'fr').split('-')[0]]?.[key]||fallback;
  const words=copy[String(i18n.language||'fr').split('-')[0]]||copy.fr;
  const [selected,setSelected]=useState(null);
  const bg=useColorModeValue('white','#171e2b');
  const muted=useColorModeValue('gray.600','gray.400');
  const weeks=readProgramActiveWeeks(program);
  const name=(session,index)=>session?.sessionName||session?.name||session?.nom||session?.title||t('client_dash.session_n',{n:index+1});
  const planned=selected?.session;
  const exercises=selected?.record ? selected.record.exerciseSnapshots||[] : planned?.useSections || planned?.echauffement?.length || planned?.retourCalme?.length
    ? ['echauffement','corps','bonus','retourCalme'].flatMap(key=>planned?.[key]||[]) : planned?.exercises?.length?planned.exercises:planned?.corps||[];
  return <Box bg={embedded?undefined:bg} borderWidth={embedded?0:'1px'} borderRadius={embedded?0:'24px'} p={embedded?0:5}>
    <Heading size="sm" mb={3}>{tx('sessionsResults','Séances et résultats')}</Heading>
    <CycleSessionList clientId={clientId} program={{...program,sessionsEffectuees:records,__detailsLoaded:true}} cycle={{weeks}} tx={tx} dateText={value=>formatCycleDate(value,i18n.language)} initialOpenWeek={Math.max(1,Math.min(weeks,currentWeek||1))} onViewPlanned={(session,index)=>setSelected({session,title:name(session,index)})}/>
    <Modal isOpen={!!selected} onClose={()=>setSelected(null)} size="xl" scrollBehavior="inside">
      <ModalOverlay/><ModalContent mx={3} maxH="85dvh"><ModalHeader>{selected?.title}</ModalHeader><ModalCloseButton/><ModalBody pb={5}>
        <Text fontSize="sm" color={muted} mb={3}>{selected?.record?words[0]:words[1]}</Text>
        {selected?.record?.notes&&<Text mb={3}>{selected.record.notes}</Text>}
        {selected?.record?.difficultyRating!=null&&<Text mb={3}>{t('sessionPlayer.difficultyQuestion','Difficulté ressentie')} : {selected.record.difficultyRating}/5</Text>}
        {exercises.map((exercise,i)=><Box key={i} borderTopWidth="1px" py={3}>
          <Text fontWeight="semibold">{exercise.exerciseName||exercise.nom||exercise.name||'—'}</Text>
          {selected?.record?(exercise.sets||[]).map((set,j)=><Text key={j} fontSize="sm" mt={1}>{j+1} · {set.reps??'—'} × {set.chargeKg??'—'} kg{set.durationSec!=null?` · ${set.durationSec} s`:''}{set.restSec!=null?` · ${set.restSec} s`:''}</Text>):<Text fontSize="sm" mt={1}>{exercise['Séries']??exercise.series??'—'} × {exercise['Répétitions']??exercise.repetitions??exercise.reps??'—'}{(exercise['Charge (kg)']??exercise.charge)>0?` · ${exercise['Charge (kg)']??exercise.charge} kg`:''}{exercise.temps_effort?` · ${exercise.temps_effort} s`:''}</Text>}
        </Box>)}
        {!exercises.length&&<Text color={muted}>{t('common.noData','Aucune donnée')}</Text>}
      </ModalBody></ModalContent>
    </Modal>
  </Box>;
}
