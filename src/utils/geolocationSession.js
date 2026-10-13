export const GEO_PAGE_LOAD_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const GEO_PAGE_LOAD_STORAGE_KEY = "BYL_GEO_PAGE_LOAD_ID";

// Persist the display itself, not only dismissal: refreshing an open reminder
// must not show it again. Authentication's lastSignInTime survives reloads.
const shownHelpSessions = new Set();
export function claimGeolocationHelp(sessionKey) {
  const key = "BYL_GEO_HELP_SESSION_V1";
  if (shownHelpSessions.has(sessionKey)) return false;
  try {
    if (localStorage.getItem(key) === sessionKey) return false;
    localStorage.setItem(key, sessionKey);
  } catch { /* In-memory protection when browser storage is unavailable. */ }
  shownHelpSessions.add(sessionKey);
  return true;
}
