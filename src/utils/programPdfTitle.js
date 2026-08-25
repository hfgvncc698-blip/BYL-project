export function isUnmodifiedAutomaticProgramTitle({
  title,
  isAutoProgram,
  objectiveKey,
  objectiveKeyFromTitle,
  sessionCount,
}) {
  if (!isAutoProgram) return false;
  const value = String(title || "").trim();
  if (!value) return true;
  if (!objectiveKey || objectiveKeyFromTitle !== objectiveKey) return false;

  const dashMatch = value.match(/\s(?:—|-)\s/);
  if (!dashMatch) return false;
  const suffix = value.slice((dashMatch.index || 0) + dashMatch[0].length).trim();
  const frequencyMatch = suffix.match(/^(\d+)\s*x\s*\/?\s*[\p{L}.]+$/iu);
  if (!frequencyMatch) return false;
  const expectedCount = Math.max(1, Number(sessionCount) || 1);
  return Number(frequencyMatch[1]) === expectedCount;
}
