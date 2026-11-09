import { recordMetric } from '../../utils/browserMetrics';
import { getApiBase } from '../../utils/apiBase';
import { auth } from '../../firebaseConfig';

export async function api(path, data, signal, account = auth.currentUser, professional = false) {
  if (!account || account !== auth.currentUser) throw Object.assign(new Error('auth-required'), { status: 401 });
  const token = await account.getIdToken();
  if (account !== auth.currentUser) throw new Error('account-changed');
  recordMetric(professional ? 'messaging-professional' : 'club-' + path.split('?')[0], 'http');
  const base = getApiBase() + (professional ? '/messaging/' : '/messaging/club/');
  const controller=new AbortController();
  const abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted) abort();
  const timeout=setTimeout(abort,40000);
  try {
    const response = await fetch(base + path, {
      method: data ? 'POST' : 'GET', signal:controller.signal, cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token, ...(data ? { 'Content-Type': 'application/json' } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    if (!response.ok) {
      const code=(await response.json().catch(()=>null))?.error;
      throw Object.assign(new Error(code==='messaging-not-included' ? code : 'messaging-request-failed'),{status:response.status});
    }
    const result = await response.json();
    if (account !== auth.currentUser) throw new Error('account-changed');
    return result;
  } finally {clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
