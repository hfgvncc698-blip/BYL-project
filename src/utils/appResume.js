export const RESUME_AFTER_MS = 5 * 60 * 1000;

export function canAutoReloadOnResume({ pathname, dirty, dialogOpen }) {
  if (dirty || dialogOpen) return false;
  // Only known consultation screens may reload automatically. Editors, offer
  // management and session players retain their local work.
  return /^\/(coach-dashboard|user-dashboard|club-dashboard|admin)\/?$/.test(pathname) ||
    /^\/clients\/[^/]+\/?$/.test(pathname);
}

export function createResumeDetector(now = Date.now) {
  let lastTick = now();
  let awaySince = null;
  let pending = false;
  return ({ visible, online, away = false }) => {
    const current = now();
    if (current - lastTick >= RESUME_AFTER_MS) pending = true;
    lastTick = current;
    if (!visible || !online || away) {
      if (awaySince === null) awaySince = current;
      return false;
    }
    if (awaySince !== null && current - awaySince >= RESUME_AFTER_MS) pending = true;
    awaySince = null;
    if (!pending) return false;
    pending = false;
    return true;
  };
}

export async function withAuthTimeout(promise, timeoutMs = 15000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(
        new Error('La reconnexion prend trop de temps. Vérifiez votre connexion puis réessayez.'),
        { code: 'auth/request-timeout' }
      )), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
