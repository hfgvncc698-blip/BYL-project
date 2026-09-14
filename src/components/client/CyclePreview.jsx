import RightDisclosureSummary from '../ui/RightDisclosureSummary';
import React from 'react';
import { Box, Text, Stack } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';

const messages = {
  fr: ['Programme prévisionnel', 'Base :', 'La proposition évolue avec les résultats enregistrés, jusqu’à l’ouverture du brouillon. Les modifications du coach ne sont jamais remplacées.', 'Voir les séances proposées', 'Séance'],
  en: ['Projected programme', 'Based on:', 'The suggestion evolves with recorded results until the draft is opened. Coach edits are never replaced.', 'View suggested sessions', 'Session'],
  es: ['Programa provisional', 'Base:', 'La propuesta evoluciona con los resultados hasta abrir el borrador. Nunca se sustituyen los cambios del entrenador.', 'Ver sesiones propuestas', 'Sesión'],
  it: ['Programma previsionale', 'Base:', 'La proposta evolve con i risultati fino all’apertura della bozza. Le modifiche del coach non vengono sostituite.', 'Vedi sessioni proposte', 'Sessione'],
  de: ['Vorläufiges Programm', 'Grundlage:', 'Der Vorschlag entwickelt sich mit den Ergebnissen bis zum Öffnen des Entwurfs. Änderungen des Coaches werden nie ersetzt.', 'Vorgeschlagene Einheiten ansehen', 'Einheit'],
  ru: ['Предварительная программа', 'Основа:', 'Предложение обновляется по результатам до открытия черновика. Изменения тренера не заменяются.', 'Посмотреть предложенные тренировки', 'Тренировка'],
  ar: ['برنامج مبدئي', 'الأساس:', 'يتطور الاقتراح مع النتائج المسجلة حتى فتح المسودة. لا تُستبدل تعديلات المدرب مطلقاً.', 'عرض الحصص المقترحة', 'الحصة'],
};
export default function CyclePreview({ preview }) {
  const { i18n } = useTranslation();
  const [title, based, hint, view, sessionLabel] = messages[(i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0]] || messages.fr;
  return <Box>
    <Text fontWeight="semibold" fontSize="sm">{title}</Text>
    <Text fontSize="sm">{based} {preview.sourceName}</Text>
    <Text fontSize="xs" mt={1}>{hint}</Text>
    <Box as="details" mt={3}>
      <RightDisclosureSummary py={0} fontSize="sm" fontWeight="semibold">{view}</RightDisclosureSummary>
      <Stack spacing={3} mt={2}>
        {preview.sessions.map((session, index) => <Box key={index} borderWidth="1px" borderRadius="lg" p={3}>
          <Text fontWeight="semibold" fontSize="sm">{session.name || `${sessionLabel} ${index + 1}`}</Text>
          {(session.useSections ? ['echauffement', 'corps', 'bonus', 'retourCalme'] : ['exercises', 'corps']).flatMap(key => session[key] || []).map((exercise, n) => <Text fontSize="sm" mt={1} key={n}>
            {exercise.nom || exercise.name || '—'}{exercise['Répétitions'] ? ` · ${exercise['Séries'] || '—'} × ${exercise['Répétitions']}` : ''}{exercise['Charge (kg)'] > 0 ? ` · ${exercise['Charge (kg)']} kg` : ''}
          </Text>)}
        </Box>)}
      </Stack>
    </Box>
  </Box>;
}
