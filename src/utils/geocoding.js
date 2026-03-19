// src/utils/geocoding.js

export async function resolveCityCountry(lat, lng) {
  // Configure dans .env.local si tu veux activer :
  // VITE_GEOCODING_URL=https://api.opencagedata.com/geocode/v1/json
  // VITE_GEOCODING_KEY=xxxxxx
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
    if (!res.ok) throw new Error(`reverse geocoding failed (${res.status})`);

    const data = await res.json();
    const comp = data?.results?.[0]?.components;
    if (!comp) return null;

    // OpenCage peut mettre la "ville" dans town/village/municipality/suburb/etc.
    const city =
      comp.city ||
      comp.town ||
      comp.village ||
      comp.municipality ||
      comp.hamlet ||
      comp.suburb ||
      comp.city_district ||
      comp.county ||
      null;

    const country =
      (comp.country_code ? String(comp.country_code).toUpperCase() : null) ||
      null;

    return { city, country };
  } catch (e) {
    console.warn("resolveCityCountry error:", e);
    return null;
  }
}

