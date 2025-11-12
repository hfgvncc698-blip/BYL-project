// Normalise la base API pour tous les appels front
export function getApiBase() {
  const raw = (import.meta.env.VITE_API_URL || '').trim();

  if (raw) {
    // enlève le "/" de fin, puis assure un "/api" à la fin
    let base = raw.replace(/\/+$/,'');
    if (!/\/api$/.test(base)) base += '/api';
    return base; // ex: https://boostyourlife.coach/api
  }

  // fallback propre: même origine que le front, via reverse-proxy Nginx
  return `${window.location.origin}/api`;
}

