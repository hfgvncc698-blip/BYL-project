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
    return Math.max(1, Math.round(totalSessions / totalWeeks));
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

export function formatProgramWeekProgress(program = {}, t = null, options = {}) {
  const totalWeeks = readProgramActiveWeeks(program);
  const sessionsPerWeek = getProgramSessionsPerWeek(program);
  if (!totalWeeks || !sessionsPerWeek) return "";

  const validatedCount = getProgramValidatedSessionCount(program);
  const includeInitialWeek = options.includeInitialWeek === true;
  const current = Math.min(
    totalWeeks,
    Math.max(includeInitialWeek ? 1 : 0, Math.ceil(validatedCount / sessionsPerWeek))
  );
  if (current <= 0) return "";

  if (typeof t === "function") {
    return t("dashboard.program_week_progress", "Semaine {{current}}/{{total}}", {
      current,
      total: totalWeeks,
    });
  }
  return `Semaine ${current}/${totalWeeks}`;
}
