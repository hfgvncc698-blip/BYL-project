import React from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
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
const DnDCalendar = dragAndDropFactory ? dragAndDropFactory(Calendar) : Calendar;

export default function CoachDashboardCalendar({ calendarCulture = "fr", ...props }) {
  React.useEffect(() => {
    moment.locale(calendarCulture || "fr");
  }, [calendarCulture]);

  return <DnDCalendar localizer={localizer} culture={calendarCulture} {...props} />;
}
