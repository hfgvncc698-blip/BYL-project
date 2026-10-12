import { getCalendarScrollTime, getCalendarAgendaMessages } from "../../utils/calendarLocale";
import React from "react";
import ClubCalendarSlotHint from "./ClubCalendarSlotHint";
import StableCalendar from "../calendar/StableCalendar";
import { momentLocalizer } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import moment from "moment";
import "moment/locale/fr";
import "moment/locale/de";
import "moment/locale/it";
import "moment/locale/es";
import "moment/locale/ru";
import "moment/locale/ar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { resolveDragAndDropFactory } from "../../utils/reactBigCalendarDnd";

const MONDAY_FIRST_LOCALES = ["fr", "en", "de", "it", "es", "ru", "ar"];
MONDAY_FIRST_LOCALES.forEach((locale) => {
  moment.updateLocale(locale, { week: { dow: 1, doy: 4 } });
});

const localizer = momentLocalizer(moment);
// Conserver la même semaine visuelle sur les dashboards coach et client.
localizer.startOfWeek = () => 1;
const dragAndDropFactory = resolveDragAndDropFactory(withDragAndDrop);
const DnDCalendar = dragAndDropFactory ? dragAndDropFactory(StableCalendar) : StableCalendar;

export default function CoachDashboardCalendar({ calendarCulture = "fr", onReady, slotHintScope = "#coach-calendar-card", ...props }) {
  React.useEffect(() => { onReady?.(); }, [onReady]);
  React.useEffect(() => {
    moment.locale(calendarCulture || "fr");
  }, [calendarCulture]);

  const [scrollToTime, setScrollToTime] = React.useState(getCalendarScrollTime);
  const [view, setView] = React.useState('week');
  const hintRef = React.useRef(null);
  const formatTime = React.useCallback(date => new Intl.DateTimeFormat(calendarCulture, { hour: '2-digit', minute: '2-digit' }).format(date), [calendarCulture]);
  const handleView = view => {
    setView(view);
    setScrollToTime(getCalendarScrollTime());
    props.onView?.(view);
  };

  return <>
    <ClubCalendarSlotHint ref={hintRef} formatTime={formatTime} scope={slotHintScope} disabled={!["week", "day"].includes(view)} />
    <DnDCalendar dayLayoutAlgorithm="no-overlap" componentIdentity={props.components} localizer={localizer} culture={calendarCulture} defaultView="week" scrollToTime={scrollToTime} {...props} messages={{ ...props.messages, ...getCalendarAgendaMessages(calendarCulture) }} onView={handleView}
    step={15} timeslots={4}
    slotPropGetter={date => ({ 'data-club-slot-time': date.getTime() })}
    onSelecting={range => { hintRef.current?.select(range); return range.end - range.start <= 180 * 60000; }}
    />
  </>;
}
