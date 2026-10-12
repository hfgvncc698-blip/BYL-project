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
  const formatTime = (date) => {
    if (getCalendarCulture(language) === "fr") {
      return `${date.getHours()} h${date.getMinutes() ? ` ${String(date.getMinutes()).padStart(2, "0")}` : ""}`;
    }
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      hour12: getCalendarCulture(language) === "en",
    }).format(date);
  };
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
    eventTimeRangeStartFormat: ({ start }) => `${formatTime(start)} –`,
    eventTimeRangeEndFormat: ({ end }) => `– ${formatTime(end)}`,
    selectRangeFormat: formatTimeRange,
    agendaDateFormat: (date) =>
      new Intl.DateTimeFormat(locale, { weekday: "short", day: "2-digit", month: "short" }).format(date),
    agendaTimeFormat: formatTime,
    agendaTimeRangeFormat: formatTimeRange,
  };
}

// Leave one hour of context above the current time when opening a time grid.
export function getCalendarScrollTime(now = new Date()) {
  const time = new Date(now);
  time.setHours(Math.max(0, time.getHours() - 1), 0, 0, 0);
  return time;
}

export function getCalendarAgendaMessages(language) {
  const labels = {
    fr: ['Date', 'Heure', 'Événement', 'Toute la journée'],
    en: ['Date', 'Time', 'Event', 'All day'],
    de: ['Datum', 'Uhrzeit', 'Termin', 'Ganztägig'],
    it: ['Data', 'Ora', 'Evento', 'Tutto il giorno'],
    es: ['Fecha', 'Hora', 'Evento', 'Todo el día'],
    ru: ['Дата', 'Время', 'Событие', 'Весь день'],
    ar: ['التاريخ', 'الوقت', 'الحدث', 'طوال اليوم'],
  }[getCalendarCulture(language)];
  return { date: labels[0], time: labels[1], event: labels[2], allDay: labels[3] };
}
