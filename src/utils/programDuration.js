export function readProgramActiveWeeks(program = {}) {
  const raw =
    program.activeWeeks ??
    program.durationWeeks ??
    program.programDurationWeeks ??
    program.dureeSemaines ??
    program.weeksActive;
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
  const direct =
    program.sessionsPerWeek ??
    program.seancesParSemaine ??
    program.nbSeancesSemaine ??
    program.nbSeancesParSemaine ??
    program.sessions_per_week;
  const directValue = Number(direct);
  if (Number.isFinite(directValue) && directValue > 0) return Math.max(1, Math.round(directValue));

  const name = `${program.nomProgramme || ""} ${program.name || ""} ${program.title || ""}`;
  const match = name.match(/(\d+)\s*(?:x|fois|séances?|seances?)\s*(?:\/|par)?\s*(?:sem|semaine|week)/i);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) return Math.max(1, Math.round(value));
  }

  const totalWeeks = readProgramActiveWeeks(program);
  const totalSessions = getProgramTotalSessions(program);
  if (totalWeeks > 0 && totalSessions > 0) {
    return Math.max(1, Math.round(totalSessions / totalWeeks));
  }
  return 0;
}

export function getProgramValidatedSessionCount(program = {}) {
  if (typeof program._done === "number") return Math.max(0, Math.round(program._done));
  if (typeof program.doneCount === "number") return Math.max(0, Math.round(program.doneCount));
  if (typeof program.completedSessions === "number") return Math.max(0, Math.round(program.completedSessions));

  const sessionsEffectuees = Array.isArray(program?.sessionsEffectuees)
    ? program.sessionsEffectuees
    : [];
  const validatedIndexes = new Set();
  let fallbackCount = 0;

  sessionsEffectuees.forEach((sessionRecord) => {
    const status = String(sessionRecord?.status || "").toLowerCase();
    const explicit =
      ["validée", "validee", "terminée", "terminee", "done", "completed"].includes(status) ||
      Boolean(sessionRecord?.validatedAt) ||
      Boolean(sessionRecord?.completedAt) ||
      typeof sessionRecord?.pourcentageTermine !== "number" ||
      sessionRecord.pourcentageTermine >= 90;
    if (!explicit) return;

    const rawIndex =
      sessionRecord?.sessionIndex ??
      sessionRecord?.seanceIndex ??
      sessionRecord?.indexSeance ??
      sessionRecord?.index;
    const index = Number(rawIndex);
    if (Number.isFinite(index) && index >= 0) validatedIndexes.add(index);
    else fallbackCount += 1;
  });

  return validatedIndexes.size + fallbackCount;
}

export function formatProgramWeekProgress(program = {}, t = null, options = {}) {
  const totalWeeks = readProgramActiveWeeks(program);
  const sessionsPerWeek = getProgramSessionsPerWeek(program);
  if (!totalWeeks || !sessionsPerWeek) return "";

  const validatedCount = getProgramValidatedSessionCount(program);
  const completedWeeks = Math.floor(validatedCount / sessionsPerWeek);
  const hasPartialWeek = validatedCount > 0 && validatedCount % sessionsPerWeek > 0;
  const includeInitialWeek = options.includeInitialWeek === true;
  const current = Math.min(
    totalWeeks,
    Math.max(includeInitialWeek ? 1 : 0, completedWeeks + (hasPartialWeek ? 1 : 0))
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
