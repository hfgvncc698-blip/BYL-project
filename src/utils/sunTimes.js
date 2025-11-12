// src/utils/sunTimes.js
// Calcul approximatif du lever/coucher (NOAA simplifiée) — suffisant pour thème

function deg2rad(d){return (d*Math.PI)/180;}
function getJulian(date){ return date/86400000 + 2440587.5; }

function getSunTimeApprox(lat, lng, date, isSunrise){
  const lw = deg2rad(-lng);
  const phi = deg2rad(lat);
  const d = getJulian(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))) - 2451545.0;
  const n = Math.round(d - lw/(2*Math.PI));
  const Jnoon = 2451545.0009 + lw/(2*Math.PI) + n;
  const M = ((357.5291 + 0.98560028*(Jnoon-2451545))%360) * Math.PI/180;
  const C = (1.9148*Math.sin(M) + 0.02*Math.sin(2*M) + 0.0003*Math.sin(3*M)) * Math.PI/180;
  const L = (M + C + (102.9372*Math.PI/180) + Math.PI)%(2*Math.PI);
  const Jtransit = Jnoon + 0.0053*Math.sin(M) - 0.0069*Math.sin(2*L);
  const h0 = -0.83 * Math.PI/180;
  const sinDec = Math.sin(L)*Math.sin(23.4397*Math.PI/180);
  const cosDec = Math.cos(L)*Math.cos(23.4397*Math.PI/180);
  const cosH = (Math.sin(h0) - Math.sin(phi)*sinDec) / (Math.cos(phi)*cosDec);
  if (cosH < -1 || cosH > 1) return null; // zones polaires
  const H = isSunrise ? -Math.acos(cosH) : Math.acos(cosH);
  const JriseSet = Jtransit + H/(2*Math.PI);
  const ms = (JriseSet - 2440587.5)*86400000;
  return new Date(ms); // Date “locale” correcte pour nos besoins de thème
}

export function getSunTimes(lat, lng, date=new Date()) {
  const r = getSunTimeApprox(lat, lng, date, true);
  const s = getSunTimeApprox(lat, lng, date, false);
  if (!r || !s) return null;
  return { sunrise: r, sunset: s };
}

export function isDaylightNow(lat, lng, now=new Date()) {
  const times = getSunTimes(lat, lng, now);
  if (!times) return null;
  return now >= times.sunrise && now < times.sunset;
}

function toDateLocal(date, h=0, m=0, s=0, ms=0){
  const d = new Date(date);
  d.setHours(h, m, s, ms);
  return d;
}

// Repli simple 7h–19h locale
export function isDayByFallback(now=new Date()) {
  const start = toDateLocal(now, 7,0,0,0);
  const end   = toDateLocal(now,19,0,0,0);
  return now >= start && now < end;
}

