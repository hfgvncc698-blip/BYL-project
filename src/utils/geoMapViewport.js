export function isValidMapPoint(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lon)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180
    && !(point.lat === 0 && point.lon === 0);
}

// Data polling and popup loading must never take control of the user's view.
// Only the initial data, a changed filter, or an explicit recenter may fit it.
export function createGeoMapAutoFit(fitBounds) {
  let previousRequest;
  let fitted = false;
  return (points, requestKey, pending = false) => {
    if (requestKey !== previousRequest) {
      previousRequest = requestKey;
      fitted = false;
    }
    if (fitted || pending) return false;
    const positions = points.filter(isValidMapPoint).map(({ lat, lon }) => [lat, lon]);
    if (!positions.length) return false;
    fitBounds(positions, { padding: [32, 32], maxZoom: 13, animate: false });
    fitted = true;
    return true;
  };
}

export function getGeoVisitorLoadBatch(points, visitors, windowKey, concurrency = 6) {
  const stateFor = (point) => visitors[`${windowKey}:${point.geoId}`];
  const loading = points.filter((point) => stateFor(point)?.loading).length;
  return points.filter((point) => !stateFor(point)).slice(0, Math.max(0, concurrency - loading));
}

// A city label/reverse-geocoding result is optional: measured coordinates suffice.
// Preserve distinct locations visited by the same person during the period.
export function visitMapPoints(visits = []) {
  const points = new Map();
  for (const visit of visits) {
    const point = { ...visit, lon: visit.lng };
    if (!isValidMapPoint(point)) continue;
    const key = `${visit.visitorId || visit.uid || visit.id}:${point.lat}:${point.lon}`;
    const previous = points.get(key);
    if (!previous || String(visit.lastSeenAt || '') > String(previous.lastSeenAt || '')) {
      points.set(key, { ...point, pointId: key });
    }
  }
  return [...points.values()];
}

export function visitorVisitHistory(visits, person) {
  return visits.filter(visit => person.uid ? visit.uid === person.uid
    : person.visitorId ? visit.visitorId === person.visitorId : visit.id === person.id)
    .sort((a, b) => String(b.lastSeenAt || b.firstSeenAt || '').localeCompare(String(a.lastSeenAt || a.firstSeenAt || '')));
}

function distanceKm(a, b) {
  const toRadians = (value) => (Number(value) * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function clusterGeoPoints(points, radiusKm) {
  const groups = [];
  [...points]
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .forEach((point) => {
      const group = groups.find((candidate) => distanceKm(candidate, point) <= radiusKm);
      if (!group) {
        groups.push({ ...point, members: [point] });
        return;
      }
      group.members.push(point);
      const totalWeight = group.members.reduce((sum, member) => sum + Math.max(1, Number(member.value || 0)), 0);
      group.lat = group.members.reduce((sum, member) => sum + member.lat * Math.max(1, Number(member.value || 0)), 0) / totalWeight;
      group.lon = group.members.reduce((sum, member) => sum + member.lon * Math.max(1, Number(member.value || 0)), 0) / totalWeight;
      group.value = group.members.reduce((sum, member) => sum + Number(member.value || 0), 0);
    });
  return groups.map((group) => ({
    ...group,
    clusterId: group.members.map((member) => member.pointId).sort().join("|"),
    isCluster: group.members.length > 1,
  }));
}
