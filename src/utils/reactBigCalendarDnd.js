export function resolveDragAndDropFactory(candidate) {
  let current = candidate;
  const visited = new Set();

  while (current && typeof current !== "function" && !visited.has(current)) {
    visited.add(current);
    current = current.default ?? current["module.exports"] ?? null;
  }

  return typeof current === "function" ? current : null;
}
