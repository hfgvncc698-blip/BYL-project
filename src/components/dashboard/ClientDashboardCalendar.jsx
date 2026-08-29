import React, { useEffect } from "react";
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
// Le planning de l'application suit toujours une semaine européenne (lundi → dimanche),
// indépendamment de la langue active ou de l'état global mutable de Moment.
localizer.startOfWeek = () => 1;
const dragAndDropFactory = resolveDragAndDropFactory(withDragAndDrop);
const DnDCalendar = dragAndDropFactory ? dragAndDropFactory(Calendar) : Calendar;

export default function ClientDashboardCalendar(props) {
  useEffect(() => {
    moment.locale(props.culture);
  }, [props.culture]);

  return <DnDCalendar localizer={localizer} {...props} />;
}
