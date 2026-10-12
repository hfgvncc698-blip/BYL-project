import { getApiBase } from '../../utils/apiBase';
import { getAuthHeaders } from '../../utils/authHeaders';

export async function api(path, data, signal) {
  const response = await fetch(`${getApiBase()}/messaging/club/${path}`, {
    method: data ? 'POST' : 'GET', signal,
    headers: { ...(await getAuthHeaders()), ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'unavailable');
  return result;
}
