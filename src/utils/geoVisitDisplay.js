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
  const missingReasons = {
    denied: "Accès à la position refusé ou bloqué par le navigateur.",
    unavailable: "Le téléphone ou le navigateur n'a pas pu déterminer la position.",
    timeout: "La recherche GPS a dépassé le délai du navigateur.",
    unsupported: "Géolocalisation non prise en charge par ce navigateur.",
    pending: "Position non reçue au moment de cette visite.",
    disabled: "Localisation désactivée dans les réglages BYL.",
    "consent-off": "Statistiques désactivées pour cette visite.",
    error: "Erreur de géolocalisation non précisée par le navigateur.",
    unknown: "Cause inconnue : cette visite ne fournit aucun diagnostic.",
  };

  return {
    label: hasCity ? [city, hasCountry ? country : ""].filter(Boolean).join(", ")
      : coordinates || (hasCountry ? country : "Position non disponible"),
    detail: [
      !hasCity && hasCoordinates ? "Coordonnées reçues, ville non déterminée." : "",
      !hasCity && !hasCoordinates && hasCountry ? "Localisation approximative : pays uniquement." : "",
      !hasCoordinates ? missingReasons[visit.geoStatus] || missingReasons.unknown : "",
      !hasCoordinates && !["denied", "disabled", "consent-off"].includes(visit.geoStatus) &&
        Number.isFinite(visit.lastKnownLocation?.lat) && Number.isFinite(visit.lastKnownLocation?.lng)
        ? `Dernière position connue (visite antérieure) : ${visit.lastKnownLocation.city || `${visit.lastKnownLocation.lat.toFixed(4)}, ${visit.lastKnownLocation.lng.toFixed(4)}`}.`
        : "",
      accuracy,
    ].filter(Boolean).join(" "),
  };
}
