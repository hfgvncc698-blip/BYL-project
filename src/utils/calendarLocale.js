const SUPPORTED_CALENDAR_CULTURES = new Set(["fr", "en", "de", "it", "es", "ru", "ar"]);

export function getCalendarCulture(language) {
  const culture = String(language || "fr").split("-")[0].toLowerCase();
  return SUPPORTED_CALENDAR_CULTURES.has(culture) ? culture : "fr";
}

export function getCalendarIntlLocale(language) {
  const culture = getCalendarCulture(language);
  if (culture === "en") return "en-US";
  if (culture === "ar") return "ar";
  return culture;
}

export function getCalendarFormats(language) {
  const locale = getCalendarIntlLocale(language);
  const formatTime = (date) =>
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  const formatTimeRange = ({ start, end }) => `${formatTime(start)} - ${formatTime(end)}`;
  return {
    monthHeaderFormat: (date) =>
      new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date),
    weekdayFormat: (date) =>
      new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date).replace(".", ""),
    dayFormat: (date) =>
      new Intl.DateTimeFormat(locale, { day: "2-digit", weekday: "short" }).format(date).replace(".", ""),
    dayHeaderFormat: (date) =>
      new Intl.DateTimeFormat(locale, { weekday: "long", day: "2-digit", month: "long" }).format(date),
    dayRangeHeaderFormat: ({ start, end }) => {
      const formatter = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });
      return `${formatter.format(start)} - ${formatter.format(end)}`;
    },
    timeGutterFormat: formatTime,
    eventTimeRangeFormat: formatTimeRange,
    eventTimeRangeStartFormat: formatTimeRange,
    eventTimeRangeEndFormat: formatTimeRange,
    selectRangeFormat: formatTimeRange,
    agendaDateFormat: (date) =>
      new Intl.DateTimeFormat(locale, { weekday: "short", day: "2-digit", month: "short" }).format(date),
    agendaTimeFormat: formatTime,
    agendaTimeRangeFormat: formatTimeRange,
  };
}
