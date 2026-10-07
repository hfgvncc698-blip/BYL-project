import React, { useEffect, useState } from 'react';
import { Text } from '@chakra-ui/react';
import { getApiBase } from '../../utils/apiBase';
import { getAuthHeaders } from '../../utils/authHeaders';
import { isValidMapPoint } from '../../utils/geoMapViewport';

const cache = new Map();
function resolveAddress(lat, lng) {
  const key = `${lat},${lng}`;
  if (!cache.has(key)) {
    const request = (async () => {
      const headers = await getAuthHeaders();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(`${getApiBase()}/analytics/admin/geo/address`, {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ lat, lng }), signal: controller.signal,
        });
        if (!response.ok) return null;
        const result = await response.json();
        return typeof result.address === 'string' && result.address.trim() ? result.address : null;
      } finally { clearTimeout(timer); }
    })().catch(() => null);
    if (cache.size >= 500) cache.delete(cache.keys().next().value);
    cache.set(key, request);
  }
  return cache.get(key);
}

export default function VisitAddress({ visit }) {
  const { lat, lng, accuracy } = visit;
  const [resolved, setResolved] = useState(null);
  const key = `${lat},${lng}`;
  useEffect(() => {
    if (!isValidMapPoint({ lat, lon: lng })) return;
    let active = true;
    resolveAddress(lat, lng).then(address => { if (active) setResolved({ key, address }); });
    return () => { active = false; };
  }, [lat, lng, key]);
  if (!isValidMapPoint({ lat, lon: lng })) return null;
  const address = resolved?.key === key ? resolved.address : null;
  return <>
    <Text fontSize="xs" dir="auto">{address ? `Adresse du point estimé : ${address}` : `Coordonnées : ${lat.toFixed(4)}, ${lng.toFixed(4)}`}</Text>
    <Text fontSize="xs">{Number.isFinite(accuracy) && accuracy >= 0 ? `Précision ≈ ${Math.round(accuracy)} m` : 'Précision non fournie par l’appareil'}</Text>
  </>;
}
