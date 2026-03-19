// src/utils/sunTimes.js
// Calcul approximatif du lever/coucher (NOAA simplifiée) — suffisant pour thème

function deg2rad(d) {
  return (d * Math.PI) / 180;
}

function getJulian(date) {
  return date / 86400000 + 2440587.5;
}

function isValidDate(d) {
  return d instanceof Date && Number.isFinite(d.getTime());
}

function getSunTimeApprox(lat, lng, date, isSunrise) {
  // Sécurise les inputs (évite NaN)
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return null;

  const lw = deg2rad(-lngN);
  const phi = deg2rad(latN);

  const d =
    getJulian(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) -
    2451545.0;

  const n = Math.round(d - lw / (2 * Math.PI));
  const ds = n + lw / (2 * Math.PI);

  const M = deg2rad((357.5291 + 0.98560028 * ds) % 360);
  const C = deg2rad(
    (1.9148 * Math.sin(M) +
      0.02 * Math.sin(2 * M) +
      0.0003 * Math.sin(3 * M)) %
      360
  );

  const L =
    (M + C + deg2rad(102.9372) + Math.PI) % (2 * Math.PI);

  const Jtransit =
    2451545.0 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

  const h0 = deg2rad(-0.83);
  const sinDec = Math.sin(L) * Math.sin(deg2rad(23.4397));
  const cosDec = Math.cos(Math.asin(sinDec));

  const denom = Math.cos(phi) * cosDec;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) return null;

  const cosH = (Math.sin(h0) - Math.sin(phi) * sinDec) / denom;

  // zones polaires ou calcul instable
  if (!Number.isFinite(cosH) || cosH < -1 || cosH > 1) return null;

  const H = isSunrise ? -Math.acos(cosH) : Math.acos(cosH);

  if (!Number.isFinite(H) || !Number.isFinite(Jtransit)) return null;

  const JriseSet = Jtransit + H / (2 * Math.PI);

  const ms = (JriseSet - 2440587.5) * 86400000;
  if (!Number.isFinite(ms)) return null;

  const dt = new Date(ms);
  if (!isValidDate(dt)) return null;

  return dt; // Date locale ok pour notre usage
}

export function getSunTimes(lat, lng, date = new Date()) {
  const sunrise = getSunTimeApprox(lat, lng, date, true);
  const sunset = getSunTimeApprox(lat, lng, date, false);

  if (!sunrise || !sunset) return null;

  // sécurité supplémentaire : si incohérent, fallback
  if (!isValidDate(sunrise) || !isValidDate(sunset)) return null;
  if (sunset <= sunrise) return null;

  return { sunrise, sunset };
}

export function isDaylightNow(lat, lng, now = new Date()) {
  const times = getSunTimes(lat, lng, now);
  if (!times) return null;

  return now >= times.sunrise && now < times.sunset;
}

function toDateLocal(date, h = 0, m = 0, s = 0, ms = 0) {
  const d = new Date(date);
  d.setHours(h, m, s, ms);
  return d;
}

// Repli simple 7h–19h locale
export function isDayByFallback(now = new Date()) {
  const start = toDateLocal(now, 7, 0, 0, 0);
  const end = toDateLocal(now, 19, 0, 0, 0);
  return now >= start && now < end;
}

