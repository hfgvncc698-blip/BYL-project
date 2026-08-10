const normalizedWords = (value = "") =>
  String(value || "")
    .split(/\s+/)
    .filter(Boolean);

const tokenQuality = (words, token) => {
  if (words.some((word) => word === token)) return 3;
  if (words.some((word) => word.startsWith(token))) return 2;
  if (words.some((word) => word.includes(token))) return 1;
  return 0;
};

const fieldMatch = (value, queryTokens) => {
  const words = normalizedWords(value);
  const qualities = queryTokens.map((token) => tokenQuality(words, token));
  return {
    matched: qualities.filter(Boolean).length,
    quality: qualities.reduce((sum, value) => sum + value, 0),
    allStrong:
      queryTokens.length > 0 && qualities.every((value) => value >= 2),
  };
};

/**
 * Ranks exercise results without letting a loose metadata match compete with
 * a real exercise-name match. Inputs are expected to already be normalized.
 */
export const scoreExerciseSearch = ({
  queryNorm,
  queryTokens,
  primaryNameNorm,
  aliasNorms = [],
  idNorm = "",
  blob = "",
}) => {
  if (!queryTokens.length) return 0;

  const primary = fieldMatch(primaryNameNorm, queryTokens);
  const primaryExact = primaryNameNorm === queryNorm;
  const primaryPhrase = Boolean(queryNorm && primaryNameNorm.includes(queryNorm));

  let score = primary.matched * 250 + primary.quality * 20;
  if (primary.allStrong) score += 2200;
  if (primaryPhrase) score += 2800;
  if (primaryExact) score += 4000;

  let bestAliasScore = 0;
  for (const aliasNorm of aliasNorms) {
    const alias = fieldMatch(aliasNorm, queryTokens);
    let aliasScore = alias.matched * 140 + alias.quality * 12;
    if (alias.allStrong) aliasScore += 1400;
    if (queryNorm && aliasNorm.includes(queryNorm)) aliasScore += 1800;
    if (aliasNorm === queryNorm) aliasScore += 2400;
    bestAliasScore = Math.max(bestAliasScore, aliasScore);
  }
  score += bestAliasScore;

  const idMatch = fieldMatch(idNorm, queryTokens);
  const blobMatch = fieldMatch(blob, queryTokens);
  score += idMatch.matched * 25 + idMatch.quality * 3;
  score += blobMatch.matched * 5 + blobMatch.quality;

  return score;
};

