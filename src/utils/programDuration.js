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
