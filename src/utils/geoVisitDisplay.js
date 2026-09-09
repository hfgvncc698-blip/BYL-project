export function getVisitLocationDisplay(visit = {}) {
  const city = String(visit.city || "").trim();
  const country = String(visit.country || "").trim().toUpperCase();
  const hasCity = Boolean(city) && city.toLowerCase() !== "unknown";
  const hasCountry = Boolean(country) && country !== "UN";
  const hasCoordinates = Number.isFinite(visit.lat) && Number.isFinite(visit.lng)
    && Math.abs(visit.lat) <= 90 && Math.abs(visit.lng) <= 180
    && !(visit.lat === 0 && visit.lng === 0);
  const coordinates = hasCoordinates ? `${visit.lat.toFixed(4)}, ${visit.lng.toFixed(4)}` : "";
  const accuracy = hasCoordinates && Number.isFinite(visit.accuracy) && visit.accuracy >= 0
    ? `Précision ≈ ${Math.round(visit.accuracy)} m` : "";

  return {
    label: hasCity ? [city, hasCountry ? country : ""].filter(Boolean).join(", ")
      : coordinates || (hasCountry ? country : "Position non disponible"),
    detail: [
      !hasCity && hasCoordinates ? "Coordonnées reçues, ville non déterminée." : "",
      !hasCity && !hasCoordinates && hasCountry ? "Localisation approximative : pays uniquement." : "",
      accuracy,
    ].filter(Boolean).join(" "),
  };
}
