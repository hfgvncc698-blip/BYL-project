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
// react-big-calendar exposes this CommonJS addon differently depending on the
// bundler. Vite 8 can return { default: factory } for the default import.
const dragAndDropFactory =
  typeof withDragAndDrop === "function"
    ? withDragAndDrop
    : typeof withDragAndDrop?.default === "function"
      ? withDragAndDrop.default
      : null;
const DnDCalendar = dragAndDropFactory ? dragAndDropFactory(Calendar) : Calendar;

export default function CoachDashboardCalendar({ calendarCulture = "fr", ...props }) {
  React.useEffect(() => {
    moment.locale(calendarCulture || "fr");
  }, [calendarCulture]);

  return <DnDCalendar localizer={localizer} culture={calendarCulture} {...props} />;
}
