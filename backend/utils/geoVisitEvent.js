const crypto = require('crypto');

function geoVisitEventId(visitorId, visitId) {
  if (typeof visitId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(visitId)) return null;
  return crypto.createHash('sha256').update(`${visitorId}:${visitId}`).digest('hex');
}

function hasCoordinates(value) {
  return Number.isFinite(value?.lat) && Number.isFinite(value?.lng)
    && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180
    && !(value.lat === 0 && value.lng === 0);
}

function capturedTime(value) {
  return value?.toMillis?.() || (value ? new Date(value).getTime() : 0) || 0;
}

function isGeoVisitRegression(previous, incoming) {
  if (!hasCoordinates(previous)) return false;
  if (!hasCoordinates(incoming)) return true;
  const before = capturedTime(previous.geoCapturedAt);
  const after = capturedTime(incoming.geoCapturedAt);
  if (before > after) return true;
  return before === after && previous.city && previous.city !== 'unknown'
    && (!incoming.city || incoming.city === 'unknown');
}

module.exports = { geoVisitEventId, isGeoVisitRegression };
