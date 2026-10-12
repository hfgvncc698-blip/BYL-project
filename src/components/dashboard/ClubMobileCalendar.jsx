import LastPackSessionBadge from "../calendar/LastPackSessionBadge";
import CalendarValidationMark from "../calendar/CalendarValidationMark";
import { calendarEventAppearance } from "../../utils/calendarEventAppearance.mjs";
import { useMemo, useState } from 'react';
import { Badge, Box, Button, Circle, HStack, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../styles/appTheme';
import { clubCoachKey } from '../../utils/clubCalendarColors.mjs';

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export default function ClubMobileCalendar({ events, colors, onSelectEvent }) {
  const { t, i18n } = useTranslation();
  const theme = useAppTheme();
  const [selected, setSelected] = useState(() => new Date());
  const days = useMemo(() => {
    const monday = new Date(selected);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + index);
      return date;
    });
  }, [selected]);
  const locale = i18n.language || i18n.resolvedLanguage || 'fr';
  const format = (date, options) => date.toLocaleDateString(locale, options);
  const appointments = events.filter(event => sameDay(event.start, selected)).sort((a, b) => a.start - b.start);
  const moveWeek = amount => setSelected(current => {
    const next = new Date(current);
    next.setDate(next.getDate() + amount * 7);
    return next;
  });
  return <Box display={{ base: 'block', md: 'none' }}>
    <HStack justify="space-between" mb={3} spacing={2}>
      <Button size="sm" variant="outline" onClick={() => moveWeek(-1)}>{t('calendar.previous', 'Précédent')}</Button>
      <Box textAlign="center" minW={0}>
        <Text fontSize="xs" color={theme.mutedText} fontWeight="900">{t('calendar.week', 'Semaine')}</Text>
        <Text fontSize="xs" fontWeight="700">{format(days[0], { day: '2-digit', month: 'short' })} – {format(days[6], { day: '2-digit', month: 'short' })}</Text>
      </Box>
      <Button size="sm" variant="outline" onClick={() => moveWeek(1)}>{t('calendar.next', 'Suivant')}</Button>
    </HStack>
    <SimpleGrid columns={7} spacing={1} mb={4}>
      {days.map(date => {
        const active = sameDay(date, selected);
        const dayEvents = events.filter(event => sameDay(event.start, date));
        const dayColors = [...new Set(dayEvents.map(event => calendarEventAppearance(event,colors.get(clubCoachKey(event)) || '#475569').backgroundColor))];
        return <Box as="button" type="button" key={date.toISOString()} aria-pressed={active} aria-label={format(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          border="1px solid" borderColor={active ? theme.accentBlue : theme.borderColor} borderRadius="14px" py={2} px={0.5} minW={0}
          bg={active ? 'rgba(59,130,246,0.08)' : theme.surfaceSoft} onClick={() => setSelected(date)}>
          <Text fontSize="10px" fontWeight="800" color={theme.mutedText}>{format(date, { weekday: 'short' }).replace('.', '')}</Text>
          <Text fontWeight="900" mt={1}>{date.getDate()}</Text>
          <HStack spacing={0.5} justify="center" mt={2} minH="6px">{dayColors.slice(0, 3).map(color => <Circle key={color} size="5px" bg={color} />)}</HStack>
        </Box>;
      })}
    </SimpleGrid>
    <Button size="xs" variant="ghost" mb={3} onClick={() => setSelected(new Date())}>{t('calendar.today', 'Aujourd’hui')}</Button>
    <Text fontWeight="800" mb={3}>{format(selected, { weekday: 'long', day: '2-digit', month: 'long' })}</Text>
    <Stack spacing={3}>
      {appointments.map(event => <Box as="button" type="button" key={event.id} textAlign="start" {...theme.tileProps} position="relative" borderLeftWidth="4px" borderLeftColor={event.lastSessionPacks?.length && !calendarEventAppearance(event).cancelled ? "orange.400" : calendarEventAppearance(event).backgroundColor} bg={`${calendarEventAppearance(event).backgroundColor}18`} p={3} pr={7} onClick={() => onSelectEvent(event)}>
        <CalendarValidationMark event={event} /><HStack align="start"><Circle size="10px" mt={1} flexShrink={0} bg={calendarEventAppearance(event).backgroundColor} /><Box minW={0}>
          <Text fontWeight="700" overflowWrap="anywhere">{event.title}</Text>
          <Text fontSize="sm" color={theme.mutedText}>{event.start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} – {event.end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</Text>
          <Badge mt={1}>{event.status}</Badge>
          {!!event.lastSessionPacks?.length && <Box mt={2}><LastPackSessionBadge/>{event.lastSessionPacks.map((pack,index)=><Text key={`${pack.id}:${index}`} fontSize="xs">{pack.clientName ? `${pack.clientName} · ` : ""}{pack.name}</Text>)}</Box>}
        </Box></HStack>
      </Box>)}
      {!appointments.length && <Box {...theme.tileProps} p={4}><Text fontSize="sm" color={theme.mutedText}>{t('calendar.no_events_in_range', 'Aucun rendez-vous sur cette période.')}</Text></Box>}
    </Stack>
  </Box>;
}
