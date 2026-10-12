import React from "react";
import CoachDashboardCalendar from "./CoachDashboardCalendar";

// Share slot hints, quarter-hour selection, collision layout and stable DnD wrappers.
export default function ClientDashboardCalendar({ culture, ...props }) {
  return <CoachDashboardCalendar {...props} calendarCulture={culture} slotHintScope='[data-tour="client-calendar"]' />;
}
