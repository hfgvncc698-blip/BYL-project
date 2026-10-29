export const RESUME_AFTER_MS = 5 * 60 * 1000;

export function canAutoReloadOnResume({ pathname, dirty, dialogOpen }) {
  if (dirty || dialogOpen) return false;
  // Only known consultation screens may reload automatically. Editors, offer
  // management and session players retain their local work.
  return /^\/(coach-dashboard|user-dashboard|club-dashboard|admin)\/?$/.test(pathname) ||
    /^\/(clients|programmes|mes-programmes|nutrition|statistiques|statistics-coach|plans\/professionnel)\/?$/.test(pathname) ||
    /^\/clients\/[^/]+\/?$/.test(pathname) ||
    /^\/programmes\/[^/]+\/?$/.test(pathname) ||
    /^\/clients\/[^/]+\/(programmes|programmes-auto)\/[^/]+\/?$/.test(pathname) ||
    /^\/auto-program-preview\/[^/]+(?:\/[^/]+)?\/?$/.test(pathname);
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

// Retain a refresh request while the user is editing or a session is running.
// It is consumed only on a safe, visible, connected page, once per mount.
export function createResumeRefresh(now = Date.now) {
  const detect = createResumeDetector(now);
  let pending = false;
  let reloading = false;
  return state => {
    if (reloading) return false;
    if (detect(state)) pending = true;
    if (!pending || !state.visible || !state.online || state.away ||
        !canAutoReloadOnResume(state)) return false;
    reloading = true;
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
