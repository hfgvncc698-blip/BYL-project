import React from 'react';
import { Box, Text, Flex, IconButton, Popover, PopoverTrigger, PopoverContent, PopoverArrow, PopoverBody, Portal } from '@chakra-ui/react';
import { InfoOutlineIcon } from '@chakra-ui/icons';
import { useTranslation } from 'react-i18next';

const labels = {
  fr: ['Brouillon adapté au cycle · à valider par le coach', 'Les exercices compatibles sont adaptés au cycle. Les dernières charges exploitables du programme source sont utilisées sans augmentation automatique. Sans historique, la charge du programme sert de base. Cardio, séries avancées et exercices non reconnus restent à vérifier. Aucun programme n’est assigné automatiquement.', 'Adaptés / avec historique / inchangés'],
  en: ['Cycle-adapted draft · coach review required', 'Compatible exercises are adapted to the cycle. Latest usable loads from the source programme are used without automatic increases. Without history, programme loads are the baseline. Cardio, advanced sets and unrecognised exercises require review. Nothing is assigned automatically.', 'Adapted / with history / unchanged'],
  es: ['Borrador adaptado al ciclo · revisión del entrenador', 'Se adaptan los ejercicios compatibles. Se usan las últimas cargas disponibles del programa de origen sin aumentarlas automáticamente. Sin historial, se usan las cargas del programa. Revisa cardio, series avanzadas y ejercicios no reconocidos. No se asigna nada automáticamente.', 'Adaptados / con historial / sin cambios'],
  it: ['Bozza adattata al ciclo · verifica del coach', 'Gli esercizi compatibili vengono adattati. Si usano gli ultimi carichi disponibili del programma di origine senza aumenti automatici. Senza storico si usano i carichi del programma. Verifica cardio, serie avanzate ed esercizi non riconosciuti. Nessuna assegnazione automatica.', 'Adattati / con storico / invariati'],
  de: ['Zyklusentwurf · Prüfung durch den Coach', 'Geeignete Übungen werden angepasst. Die letzten nutzbaren Lasten des Ausgangsprogramms werden ohne automatische Erhöhung verwendet. Ohne Verlauf gelten die Programmlasten. Cardio, erweiterte Sätze und unbekannte Übungen prüfen. Keine automatische Zuweisung.', 'Angepasst / mit Verlauf / unverändert'],
  ru: ['План адаптирован к циклу · требуется проверка тренера', 'Подходящие упражнения адаптируются. Используются последние доступные нагрузки исходной программы без автоматического повышения. Без истории используются нагрузки программы. Кардио, сложные серии и нераспознанные упражнения требуют проверки. Автоматического назначения нет.', 'Адаптировано / с историей / без изменений'],
  ar: ['مسودة مكيّفة للدورة · تتطلب مراجعة المدرب', 'تُكيّف التمارين المناسبة وتُستخدم أحدث الأحمال المتاحة من البرنامج الأصلي دون زيادة تلقائية. عند غياب السجل تُستخدم أحمال البرنامج. يجب مراجعة الكارديو والمجموعات المتقدمة والتمارين غير المعروفة. لا يتم الإسناد تلقائياً.', 'مكيّفة / مع سجل / دون تغيير'],
};
export default function CyclePreparationNotice({ report, compact = false }) {
  const { i18n } = useTranslation();
  const [title, text, counts] = labels[(i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0]] || labels.fr;
  const info = <Popover placement="bottom-end" returnFocusOnClose>
        <PopoverTrigger><IconButton aria-label={title} icon={<InfoOutlineIcon />} variant="ghost" size="sm" borderRadius="full" flexShrink={0} /></PopoverTrigger>
        <Portal><PopoverContent width="min(340px, calc(100vw - 32px))" maxW="calc(100vw - 32px)">
          <PopoverArrow />
          <PopoverBody><Text fontSize="sm">{text}</Text></PopoverBody>
        </PopoverContent></Portal>
      </Popover>;
  if (compact) return info;
  return <Box borderWidth="1px" borderRadius="lg" p={3} my={3}>
    <Flex align="center" justify="space-between" gap={2}>
      <Text fontSize="sm" fontWeight="bold" minW={0}>{title}</Text>
      {info}
    </Flex>
    {report && <Text fontSize="sm">{counts} : {report.adapted} / {report.fromHistory} / {report.unchanged}</Text>}
  </Box>;
}
