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
