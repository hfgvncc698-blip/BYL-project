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

const localizer = momentLocalizer(moment);
const DnDCalendar = withDragAndDrop(Calendar);

export default function CoachDashboardCalendar({ calendarCulture = "fr", ...props }) {
  React.useEffect(() => {
    moment.locale(calendarCulture || "fr");
  }, [calendarCulture]);

  return <DnDCalendar localizer={localizer} culture={calendarCulture} {...props} />;
}
