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

export function getSessionResumeUpdatedAt(state) {
  if (!state || typeof state !== "object") return 0;
  const direct = Number(state.checkpointUpdatedAt || state.updatedAt || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const value = state.progressUpdatedAt || state.updatedAt;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function findLatestRemoteSessionResumeRecord(records, sessionIndex) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => {
      const recordSessionIndex = Number(record?.sessionIndex ?? record?.seanceIndex);
      const pct = Number(record?.pourcentageTermine);
      return (
        recordSessionIndex === Number(sessionIndex) &&
        (record?.isPartial === true || record?.status === "en_cours") &&
        Number.isFinite(pct) &&
        pct > 0 &&
        pct < 90
      );
    })
    .sort(
      (a, b) =>
        (getSessionResumeUpdatedAt(b?.resumeState) || getSessionResumeUpdatedAt(b)) -
        (getSessionResumeUpdatedAt(a?.resumeState) || getSessionResumeUpdatedAt(a))
    )[0] || null;
}

export function selectLatestSessionResumeState(localResume, remoteResume) {
  return getSessionResumeUpdatedAt(remoteResume) > getSessionResumeUpdatedAt(localResume)
    ? remoteResume
    : localResume || remoteResume || null;
}

export function buildFrozenElapsedState(seconds, checkpointUpdatedAt = Date.now()) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  return safeSeconds > 0
    ? {
        startedAt: checkpointUpdatedAt - safeSeconds * 1000,
        stoppedAt: checkpointUpdatedAt,
      }
    : { startedAt: 0, stoppedAt: 0 };
}

export function getRestoredCountdownSeconds(snapshot, now = Date.now()) {
  if (!snapshot || typeof snapshot !== "object") return 0;
  const targetAt = Number(snapshot.targetAt || 0);
  if (targetAt > 0) return Math.max(0, Math.ceil((targetAt - now) / 1000));
  return Math.max(0, Math.round(Number(snapshot.seconds) || 0));
}

export function getRestoredStopwatchSeconds(snapshot, now = Date.now()) {
  if (!snapshot || typeof snapshot !== "object") return 0;
  const startedAt = Number(snapshot.startedAt || 0);
  const baseSeconds = Math.max(0, Math.round(Number(snapshot.baseSeconds) || 0));
  return startedAt > 0
    ? baseSeconds + Math.max(0, Math.floor((now - startedAt) / 1000))
    : Math.max(0, Math.round(Number(snapshot.seconds) || 0));
}

export function getRemoteCheckpointDelay(previous, current, lastCheckpointAt, now = Date.now()) {
  const changed =
    !previous ||
    previous.exIndex !== current.exIndex ||
    previous.currentSet !== current.currentSet ||
    previous.phase !== current.phase ||
    previous.isPaused !== current.isPaused ||
    previous.performanceDraftRevision !== current.performanceDraftRevision ||
    previous.sessionObj !== current.sessionObj;
  return changed ? 450 : Math.max(350, 15000 - (now - lastCheckpointAt));
}

export function getPartialSessionProgress(exIndex, currentSet, totalSets, exerciseCount) {
  const count = Math.max(1, Number(exerciseCount) || 0);
  const exerciseFraction = Math.max(0, Number(exIndex) || 0) / count;
  const setFraction = Math.max(0, (Number(currentSet) || 1) - 1) / Math.max(1, Number(totalSets) || 0);
  return Math.max(1, Math.min(89, Math.round((exerciseFraction + setFraction / count) * 89)));
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
