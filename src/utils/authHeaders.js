import { auth } from "../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";

function waitForCurrentUser(timeoutMs = 2500) {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    let timer = null;
    const done = (user) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      resolve(user || auth.currentUser || null);
    };

    timer = setTimeout(() => done(null), timeoutMs);
    unsubscribe = onAuthStateChanged(auth, (user) => done(user));
    if (settled) unsubscribe();
  });
}

export async function getAuthHeaders(options = {}) {
  const currentUser = await waitForCurrentUser(options.timeoutMs);
  if (!currentUser) return {};

  const token = await currentUser.getIdToken(!!options.forceRefresh);
  return {
    Authorization: `Bearer ${token}`,
  };
}
