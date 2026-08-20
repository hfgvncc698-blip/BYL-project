export function readProgramActiveWeeks(program = {}) {
  const safeProgram = program && typeof program === "object" ? program : {};
  const raw =
    safeProgram.activeWeeks ??
    safeProgram.durationWeeks ??
    safeProgram.programDurationWeeks ??
    safeProgram.dureeSemaines ??
    safeProgram.weeksActive;
  const weeks = Math.round(Number(raw) || 4);
  if (!Number.isFinite(weeks) || weeks <= 0) return 4;
  return Math.max(1, Math.min(52, weeks));
}

export function formatProgramActiveWeeks(program = {}, t = null) {
  const weeks = readProgramActiveWeeks(program);
  if (!weeks) return "";
  if (typeof t === "function") {
    return t("programs.activeWeeksValue", "{{count}} semaine", {
      count: weeks,
      defaultValue: weeks > 1 ? "{{count}} semaines" : "{{count}} semaine",
    });
  }
  return `${weeks} semaine${weeks > 1 ? "s" : ""}`;
}

export function getProgramActiveWeeksLabel(t = null) {
  if (typeof t === "function") {
    return t("programs.activeDuration", "Durée active");
  }
  return "Durée active";
}

export function getProgramTotalSessions(program = {}) {
  if (!program) return 0;
  if (Array.isArray(program.sessions)) return program.sessions.length;
  if (Array.isArray(program.seances)) return program.seances.length;
  if (typeof program._total === "number") return program._total;
  if (typeof program.sessionCount === "number") return program.sessionCount;
  if (typeof program.totalSessions === "number") return program.totalSessions;
  if (typeof program.nbSeances === "number") return program.nbSeances;
  return 0;
}

export function getProgramSessionsPerWeek(program = {}) {
  const safeProgram = program && typeof program === "object" ? program : {};
  const name = `${safeProgram.nomProgramme || ""} ${safeProgram.name || ""} ${safeProgram.title || ""}`;
  const match = name.match(/(\d+)\s*(?:x|fois|séances?|seances?)\s*(?:\/|par)?\s*(?:sem|semaine|week)/i);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) return Math.max(1, Math.round(value));
  }

  const direct =
    safeProgram.sessionsPerWeek ??
    safeProgram.seancesParSemaine ??
    safeProgram.nbSeancesSemaine ??
    safeProgram.nbSeancesParSemaine ??
    safeProgram.sessions_per_week;
  const directValue = Number(direct);
  if (Number.isFinite(directValue) && directValue > 0) return Math.max(1, Math.round(directValue));

  const totalWeeks = readProgramActiveWeeks(safeProgram);
  const totalSessions = getProgramTotalSessions(safeProgram);
  if (totalWeeks > 0 && totalSessions > 0) {
    // Les sessions du builder constituent la semaine type du programme. Elles
    // sont rejouees chaque semaine pendant toute la duree active.
    return Math.max(1, Math.round(totalSessions));
  }
  return 0;
}

export function getProgramPlannedSessionTotal(program = {}) {
  const templateTotal = getProgramTotalSessions(program);
  const totalWeeks = readProgramActiveWeeks(program);
  const sessionsPerWeek = getProgramSessionsPerWeek(program);
  const activeTotal = totalWeeks > 1 && sessionsPerWeek > 0 ? totalWeeks * sessionsPerWeek : 0;
  return Math.max(templateTotal, activeTotal);
}

export function getProgramValidatedSessionCount(program = {}) {
  const sessionsEffectuees = Array.isArray(program?.sessionsEffectuees)
    ? program.sessionsEffectuees
    : [];
  let validatedCount = 0;

  sessionsEffectuees.forEach((sessionRecord) => {
    const status = String(sessionRecord?.status || "").toLowerCase();
    if (!sessionRecord || sessionRecord?.isPartial === true || status === "en_cours" || status === "in_progress") {
      return;
    }

    const explicit =
      ["validée", "validee", "terminée", "terminee", "done", "completed"].includes(status) ||
      Boolean(sessionRecord?.validatedAt) ||
      Boolean(sessionRecord?.completedAt) ||
      Boolean(sessionRecord?.dateEffectuee) ||
      Boolean(sessionRecord?.finishedAt) ||
      sessionRecord.pourcentageTermine >= 90;
    if (!explicit) return;
    validatedCount += 1;
  });

  if (sessionsEffectuees.length > 0) return validatedCount;
  if (typeof program._done === "number") return Math.max(0, Math.round(program._done));
  if (typeof program.doneCount === "number") return Math.max(0, Math.round(program.doneCount));
  if (typeof program.completedSessions === "number") return Math.max(0, Math.round(program.completedSessions));
  return validatedCount;
}

function programDateToMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return Number(value.toMillis()) || 0;
  if (typeof value?.toDate === "function") return value.toDate()?.getTime?.() || 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  if (typeof value === "object" && Number.isFinite(Number(value.seconds))) {
    return Number(value.seconds) * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6);
  }
  if (typeof value === "number") return value > 0 && value < 1e12 ? value * 1000 : value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function getProgramStartMillis(program = {}) {
  const safeProgram = program && typeof program === "object" ? program : {};
  const candidates = [
    safeProgram.assignedAt,
    safeProgram.assigned_at,
    safeProgram.dateAssignation,
    safeProgram.dateAffectation,
    safeProgram.startDate,
    safeProgram.startedAt,
    safeProgram._assignedAtMs,
    safeProgram.createdAt,
    safeProgram.created_at,
    safeProgram._createdAtMs,
    safeProgram.purchasedAt,
    safeProgram.boughtAt,
  ];
  for (const candidate of candidates) {
    const millis = programDateToMillis(candidate);
    if (millis > 0) return millis;
  }
  return 0;
}

export function getProgramCurrentWeek(program = {}, options = {}) {
  const totalWeeks = readProgramActiveWeeks(program);
  if (!totalWeeks) return 0;

  const startMillis = getProgramStartMillis(program);
  if (startMillis > 0) {
    const requestedNow = programDateToMillis(options.now ?? options.nowMs);
    const nowMillis = requestedNow > 0 ? requestedNow : Date.now();
    const elapsedDays = Math.max(0, Math.floor((nowMillis - startMillis) / 86_400_000));
    return Math.min(totalWeeks, Math.floor(elapsedDays / 7) + 1);
  }

  // Compatibilite avec les anciens documents sans date d'assignation.
  const sessionsPerWeek = getProgramSessionsPerWeek(program);
  if (!sessionsPerWeek) return options.includeInitialWeek === true ? 1 : 0;
  const validatedCount = getProgramValidatedSessionCount(program);
  return Math.min(
    totalWeeks,
    Math.max(options.includeInitialWeek === true ? 1 : 0, Math.ceil(validatedCount / sessionsPerWeek))
  );
}

export function formatProgramWeekProgress(program = {}, t = null, options = {}) {
  const totalWeeks = readProgramActiveWeeks(program);
  if (!totalWeeks) return "";
  const current = getProgramCurrentWeek(program, options);
  if (current <= 0) return "";

  if (typeof t === "function") {
    return t("dashboard.program_week_progress", "Semaine {{current}}/{{total}}", {
      current,
      total: totalWeeks,
    });
  }
  return `Semaine ${current}/${totalWeeks}`;
}
