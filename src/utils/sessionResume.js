const SESSION_RESUME_VERSION = 1;

const resolveStorage = (storage) => {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
};

export function getSessionResumeStorageKey({ clientId, programId, sessionIndex }) {
  return [
    "byl-session-player-resume",
    clientId || "no-client",
    programId || "no-program",
    Number.isFinite(Number(sessionIndex)) ? Number(sessionIndex) : 0,
  ].join(":");
}

export function readSessionResumeState(storageKey, storage = null) {
  if (!storageKey) return null;
  try {
    const target = resolveStorage(storage);
    if (!target) return null;
    const parsed = JSON.parse(target.getItem(storageKey) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== SESSION_RESUME_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSessionResumeState(storageKey, state, storage = null) {
  if (!storageKey) return;
  try {
    const target = resolveStorage(storage);
    if (!target) return;
    target.setItem(
      storageKey,
      JSON.stringify({
        ...(state || {}),
        version: SESSION_RESUME_VERSION,
        updatedAt: Date.now(),
      })
    );
  } catch {}
}

export function clearSessionResumeState(storageKey, storage = null) {
  if (!storageKey) return;
  try {
    resolveStorage(storage)?.removeItem(storageKey);
  } catch {}
}

export function findLatestSessionResumeState({
  clientId,
  programId,
  sessionCount,
  storage = null,
}) {
  const count = Math.max(0, Number(sessionCount) || 0);
  let latest = null;
  for (let sessionIndex = 0; sessionIndex < count; sessionIndex += 1) {
    const state = readSessionResumeState(
      getSessionResumeStorageKey({ clientId, programId, sessionIndex }),
      storage
    );
    if (!state) continue;
    const updatedAt = Number(state.updatedAt || 0);
    if (!latest || updatedAt > latest.updatedAt) {
      latest = {
        ...state,
        sessionIndex,
        updatedAt,
      };
    }
  }
  return latest;
}

export function clearProgramSessionResumeStates({
  clientId,
  programId,
  sessionCount,
  storage = null,
}) {
  const count = Math.max(0, Number(sessionCount) || 0);
  for (let sessionIndex = 0; sessionIndex < count; sessionIndex += 1) {
    clearSessionResumeState(
      getSessionResumeStorageKey({ clientId, programId, sessionIndex }),
      storage
    );
  }
}
