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

  const known = visit.knownLocation;
  const knownLabel = known ? [known.city, known.country].filter(value => value && !['unknown', 'UN'].includes(value)).join(', ') : '';
  const knownDate = known?.capturedAt ? new Date(known.capturedAt) : null;
  const knownDateLabel = knownDate && Number.isFinite(knownDate.getTime()) ? knownDate.toLocaleString('fr-FR') : 'date non enregistrée';

  return {
    label: hasCity ? [city, hasCountry ? country : ""].filter(Boolean).join(", ")
      : coordinates || (hasCountry ? country : "Position non disponible"),
    detail: [
      !hasCity && hasCoordinates ? "Coordonnées reçues, ville non déterminée." : "",
      hasCity && !hasCoordinates ? "Ville connue, mais aucune coordonnée enregistrée : impossible de placer un point précis pour cette visite." : "",
      !hasCity && !hasCoordinates && hasCountry ? "Localisation approximative : pays uniquement." : "",
      hasCoordinates && hasCity ? `Coordonnées : ${coordinates}.` : "",
      !hasCoordinates ? ({
        analytics_disabled: 'Collecte désactivée : le consentement aux statistiques n’est pas activé. Aucune demande de position n’a été lancée.',
        disabled: 'Localisation désactivée dans les préférences du site.',
        denied: 'Ancien diagnostic : accès à la localisation non autorisé. Le motif précis n’a pas été enregistré ; impossible de savoir si la personne a cliqué sur « Refuser ».',
        browser_denied: 'Permission du navigateur : bloquée. Le navigateur ne précise pas si cela vient d’un ancien refus, de ses réglages ou du système ; aucun clic sur « Refuser » n’est confirmé pour cette visite.',
        remembered_denied: 'Un précédent accès refusé est mémorisé par le site. Aucune nouvelle demande de localisation n’a été lancée lors de cette ouverture.',
        permission_error: 'Une demande a été lancée ; le navigateur a répondu « accès non autorisé ». Cette réponse ne permet pas de confirmer un clic sur « Refuser ».',
        checking: 'Vérification de la permission du navigateur en cours ; aucun résultat reçu.',
        renewal_required: 'L’autorisation précédente a expiré. Aucune nouvelle demande n’a été lancée ; la personne doit la renouveler.',
        granted: 'Autorisation accordée, mais aucune coordonnée exploitable n’a été enregistrée pour cette visite.',
        prompt: 'Autorisation pas encore accordée. Aucun refus confirmé pour cette visite.',
        requesting: 'Position pas encore reçue au moment de la visite.',
        timeout: 'Délai dépassé lors de la recherche de position.',
        unavailable: 'Le navigateur n’a pas pu déterminer la position.',
        unsupported: 'Géolocalisation non prise en charge par ce navigateur.',
      }[visit.geoStatus] || 'Motif non enregistré pour cette visite ; un refus ne peut pas être déduit.') : "",
      !hasCoordinates && !hasCity && knownLabel ? `Dernière localisation connue du profil : ${knownLabel} (${knownDateLabel}). Elle ne confirme pas le lieu de cette visite.` : '',
      accuracy,
    ].filter(Boolean).join(" "),
  };
}
