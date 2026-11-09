import { recordMetric } from '../../utils/browserMetrics';
import { getApiBase } from '../../utils/apiBase';
import { getAuthHeaders } from '../../utils/authHeaders';

export async function api(path, data, signal) {
  const headers = { ...(await getAuthHeaders()), ...(data ? { 'Content-Type': 'application/json' } : {}) };
  recordMetric('club-' + path.split('?')[0], 'http');
  const response = await fetch(`${getApiBase()}/messaging/club/${path}`, {
    method: data ? 'POST' : 'GET', signal,
    headers,
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'unavailable');
  return result;
}
