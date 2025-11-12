// src/utils/geocoding.js
export async function resolveCityCountry(lat, lng) {
  // Configure dans .env.local si tu veux activer :
  // VITE_GEOCODING_URL=https://api.opencagedata.com/geocode/v1/json
  // VITE_GEOCODING_KEY=xxxxx
  const URL = import.meta.env.VITE_GEOCODING_URL;
  const KEY = import.meta.env.VITE_GEOCODING_KEY;
  if (!URL || !KEY) return null;

  try {
    const params = new URLSearchParams({
      key: KEY,
      q: `${lat},${lng}`,
      no_annotations: "1",
      language: "fr",
      limit: "1",
    });
    const res = await fetch(`${URL}?${params.toString()}`);
    if (!res.ok) throw new Error("reverse geocoding failed");
    const data = await res.json();
    const comp = data?.results?.[0]?.components;
    if (!comp) return null;
    return {
      city: comp.city || comp.town || comp.village || comp.county || null,
      country: comp.country_code?.toUpperCase() || null,
    };
  } catch {
    return null;
  }
}

