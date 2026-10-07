import RightDisclosureSummary from '../ui/RightDisclosureSummary';
import React from 'react';
import { Badge, Box, Text, Stack } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';

const frequencyLabels = { fr: 'séance(s) / semaine', en: 'session(s) / week', es: 'sesión(es) / semana', it: 'sessioni / settimana', de: 'Einheiten / Woche', ru: 'тренировок / неделю', ar: 'حصص / أسبوع' };
const restLabels = { fr: 'Repos', en: 'Rest', es: 'Descanso', it: 'Recupero', de: 'Pause', ru: 'Отдых', ar: 'الراحة' };
const messages = {
  fr: ['Programme prévisionnel', 'Base :', 'Nouvel exercice', 'Voir les séances proposées', 'Séance'],
  en: ['Projected programme', 'Based on:', 'New exercise', 'View suggested sessions', 'Session'],
  es: ['Programa provisional', 'Base:', 'Nuevo ejercicio', 'Ver sesiones propuestas', 'Sesión'],
  it: ['Programma previsionale', 'Base:', 'Nuovo esercizio', 'Vedi sessioni proposte', 'Sessione'],
  de: ['Vorläufiges Programm', 'Grundlage:', 'Neue Übung', 'Vorgeschlagene Einheiten ansehen', 'Einheit'],
  ru: ['Предварительная программа', 'Основа:', 'Новое упражнение', 'Посмотреть предложенные тренировки', 'Тренировка'],
  ar: ['برنامج مبدئي', 'الأساس:', 'تمرين جديد', 'عرض الحصص المقترحة', 'الحصة'],
};
export default function CyclePreview({ preview }) {
  const { i18n } = useTranslation();
  const language = (i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0];
  const restLabel = restLabels[(i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0]] || restLabels.fr;
  const [title, based, newExercise, view, sessionLabel] = messages[(i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0]] || messages.fr;
  return <Box>
    <Text fontWeight="semibold" fontSize="sm">{title}</Text>
    <Text fontSize="sm">{based} {preview.sourceName}</Text>
    <Text fontSize="sm" fontWeight="medium">{preview.sessions.length} {frequencyLabels[language] || frequencyLabels.fr}</Text>
    <Box as="details" mt={3}>
      <RightDisclosureSummary py={0} fontSize="sm" fontWeight="semibold">{view}</RightDisclosureSummary>
      <Stack spacing={3} mt={2}>
        {preview.sessions.map((session, index) => <Box key={index} borderWidth="1px" borderRadius="lg" p={3}>
          <Text fontWeight="semibold" fontSize="sm">{session.name || `${sessionLabel} ${index + 1}`}</Text>
          {(session.useSections ? ['echauffement', 'corps', 'bonus', 'retourCalme'] : ['exercises', 'corps']).flatMap(key => session[key] || []).map((exercise, n) => <Text fontSize="sm" mt={1} key={n}>
            {exercise.translations?.[language]?.nom || exercise.translations?.[language]?.name || exercise.nom || exercise.name || '—'}{exercise['Répétitions'] ? ` · ${exercise['Séries'] || '—'} × ${exercise['Répétitions']}` : ''}{exercise['Charge (kg)'] > 0 ? ` · ${exercise['Charge (kg)']} kg` : ''}
            {exercise['Repos (min:sec)'] > 0 ? ` · ${restLabel} ${exercise['Repos (min:sec)']} s` : ''}
            {exercise.cycleVariation?.proposed && <Badge ml={2} colorScheme="purple" fontSize="2xs" textTransform="none">{newExercise}</Badge>}
          </Text>)}
        </Box>)}
      </Stack>
    </Box>
  </Box>;
}
