const express = require("express");
const admin = require('../firebaseAdmin');
const crypto = require("crypto");
const { getBearerToken, getUserRole, safeSecretEqual } = require("../utils/firebaseAuth");

const router = express.Router();

const WINDOW_MS = 60 * 1000;
const MAX_EVENTS_PER_WINDOW = 120;
const hits = new Map();

function cleanText(value, max = 120, fallback = "") {
  const text = String(value || "").trim();
  return (text || fallback).slice(0, max);
}

function headerText(req, name, max = 120) {
  const raw = req.headers[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  try {
    return decodeURIComponent(String(value)).slice(0, max);
  } catch {
    return String(value).slice(0, max);
  }
}

function safeKey(value) {
  return String(value || "")
    .replaceAll(".", "·")
    .replaceAll("/", "∕")
    .replaceAll("#", "＃")
    .replaceAll("$", "＄")
    .replaceAll("[", "⟦")
    .replaceAll("]", "⟧")
    .slice(0, 180);
}

function slug(value) {
  return String(value || "unknown")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

function normalizeTimeZone(value) {
  const fallback = "Europe/Paris";
  const timeZone = cleanText(value, 80, fallback);
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return fallback;
  }
}

function fmtDay(date = new Date(), timeZone = "Europe/Paris") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function recentDayKeys(count = 60) {
  const days = [];
  const base = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    days.push(fmtDay(d));
  }
  return days;
}

function localHour(date = new Date(), timeZone = "Europe/Paris") {
  return Number(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: normalizeTimeZone(timeZone),
      hour: "2-digit",
      hour12: false,
    }).format(date)
  );
}

function toIso(value) {
  if (!value) return null;
  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : value instanceof Date
        ? value
      : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function toDate(value) {
  if (!value) return null;
  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function pickPersonName(data = {}, fallback = "") {
  return (
    `${data.firstName || ""} ${data.lastName || ""}`.trim() ||
    `${data.prenom || ""} ${data.nom || ""}`.trim() ||
    data.displayName ||
    data.name ||
    fallback
  );
}

function getRequesterKey(req) {
  return (req.ip || req.socket?.remoteAddress || "unknown").replace("::ffff:", "");
}

function checkRateLimit(req) {
  const now = Date.now();
  const key = getRequesterKey(req);
  const entry = hits.get(key) || { count: 0, resetAt: now + WINDOW_MS };

  if (entry.resetAt <= now) {
    entry.count = 0;
    entry.resetAt = now + WINDOW_MS;
  }

  entry.count += 1;
  hits.set(key, entry);

  return entry.count <= MAX_EVENTS_PER_WINDOW;
}

async function requireAnalyticsAdmin(req, res, next) {
  const host = String(req.hostname || req.headers.host || "");
  const isLocalRequest =
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    req.ip === "::1" ||
    req.ip === "127.0.0.1";

  if (!process.env.ADMIN_SEARCH_KEY && process.env.NODE_ENV !== "production" && isLocalRequest) {
    req.auth = { uid: "local-admin", localDev: true };
    return next();
  }

  const key =
    req.headers["x-admin-key"] ||
    req.headers["x_admin_key"] ||
    "";
  const expected = process.env.ADMIN_SEARCH_KEY || "";
  if (safeSecretEqual(key, expected)) return next();

  try {
    const token = getBearerToken(req);
    if (token) {
      const decoded = await admin.auth().verifyIdToken(token);
      const role = await getUserRole(decoded.uid);
      if (decoded.email_verified === true && role === "admin") {
        req.auth = { uid: decoded.uid, email: decoded.email || null };
        return next();
      }
    }
  } catch (error) {
    console.warn("[analytics/admin] invalid auth:", error?.message || error);
  }

  return res.status(403).json({ error: "forbidden" });
}

function normalizeVisitorId(value) {
  const raw = cleanText(value, 120, "anon");
  return raw.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 120) || "anon";
}

function normalizeUid(value) {
  return String(value || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 120);
}

function anonVisitorIdFromRequest(req) {
  const digest = crypto
    .createHash("sha256")
    .update(getRequesterKey(req))
    .digest("hex")
    .slice(0, 32);
  return `anon:${digest}`;
}

function cleanCoordinate(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function isNullIsland(lat, lng) {
  return lat === 0 && lng === 0;
}

function pickCity(components = {}) {
  return (
    components.city ||
    components.town ||
    components.village ||
    components.municipality ||
    components.hamlet ||
    components.suburb ||
    components.city_district ||
    components.county ||
    null
  );
}

async function reverseGeocode({ lat, lng }) {
  if (lat == null || lng == null) return null;

  const openCageKey = process.env.OPENCAGE_API_KEY || process.env.VITE_GEOCODING_KEY;
  const openCageUrl =
    process.env.OPENCAGE_GEOCODING_URL ||
    process.env.VITE_GEOCODING_URL ||
    "https://api.opencagedata.com/geocode/v1/json";

  if (openCageKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const params = new URLSearchParams({
        q: `${lat},${lng}`,
        key: openCageKey,
        language: "fr",
        no_annotations: "1",
        limit: "1",
      });
      const response = await fetch(`${openCageUrl}?${params.toString()}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        const data = await response.json();
        const components = data?.results?.[0]?.components || {};
        const city = pickCity(components);
        const country = components.country_code ? String(components.country_code).toUpperCase() : null;
        if (city || country) return { city, country, provider: "opencage" };
      }
    } catch {
      // fallback Nominatim below
    } finally {
      clearTimeout(timeout);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lng),
      zoom: "10",
      addressdetails: "1",
      accept_language: "fr",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "BoostYourLifeAdminAnalytics/1.0",
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const address = data?.address || {};
    const city = pickCity(address);
    const country = address.country_code ? String(address.country_code).toUpperCase() : null;
    if (!city && !country) return null;
    return { city, country, provider: "nominatim" };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function geocodeCity({ country, city }) {
  const cleanCountry = cleanText(country, 2, "").toUpperCase();
  const cleanCity = cleanText(city, 120, "");
  if (!cleanCountry || !cleanCity || cleanCountry === "UN" || cleanCity.toLowerCase() === "unknown") {
    return null;
  }

  const openCageKey = process.env.OPENCAGE_API_KEY || process.env.VITE_GEOCODING_KEY;
  const openCageUrl =
    process.env.OPENCAGE_GEOCODING_URL ||
    process.env.VITE_GEOCODING_URL ||
    "https://api.opencagedata.com/geocode/v1/json";

  if (openCageKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const params = new URLSearchParams({
        q: `${cleanCity}, ${cleanCountry}`,
        key: openCageKey,
        language: "fr",
        no_annotations: "1",
        limit: "1",
      });
      const response = await fetch(`${openCageUrl}?${params.toString()}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        const data = await response.json();
        const geometry = data?.results?.[0]?.geometry;
        const lat = cleanCoordinate(geometry?.lat, -90, 90);
        const lon = cleanCoordinate(geometry?.lng, -180, 180);
        if (lat != null && lon != null && !isNullIsland(lat, lon)) return { lat, lon, provider: "opencage" };
      }
    } catch {
      // fallback Nominatim below
    } finally {
      clearTimeout(timeout);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const params = new URLSearchParams({
      city: cleanCity,
      countrycodes: cleanCountry.toLowerCase(),
      format: "json",
      limit: "1",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "BoostYourLifeAdminAnalytics/1.0",
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const best = Array.isArray(data) ? data[0] : null;
    const lat = cleanCoordinate(best?.lat, -90, 90);
    const lon = cleanCoordinate(best?.lon, -180, 180);
    if (lat != null && lon != null && !isNullIsland(lat, lon)) return { lat, lon, provider: "nominatim" };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }

  return null;
}

async function countSubcollection(ref, name) {
  try {
    const snap = await ref.collection(name).count().get();
    return Number(snap.data().count || 0);
  } catch {
    return 0;
  }
}

function pickLastVisitValue(data = {}) {
  return (
    data.lastVisitAt ||
    data.lastSeenAt ||
    data.lastActivityAt ||
    data.lastActiveAt ||
    data.location?.updatedAt ||
    null
  );
}

function normalizeLocation(data = {}) {
  const location = data.location || {};
  const lat = typeof location.lat === "number" ? location.lat : null;
  const lng =
    typeof location.lng === "number"
      ? location.lng
      : typeof location.lon === "number"
        ? location.lon
        : null;
  const country = cleanText(location.country || location.countryCode || location.country_code, 2, "UN").toUpperCase();
  const city = cleanText(location.city || location.town || location.village, 120, "unknown");
  return {
    country,
    city,
    lat: lat != null && lng != null && !isNullIsland(lat, lng) ? lat : null,
    lng: lat != null && lng != null && !isNullIsland(lat, lng) ? lng : null,
  };
}

router.get("/admin/geo", requireAnalyticsAdmin, async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const db = admin.firestore();
    const today = fmtDay(new Date());
    const [geoSnap, dailySnap, hourlySnap, globalDailySnap] = await Promise.all([
      db.collection("analytics_geo").get(),
      db.collection("analytics_geo_daily").get(),
      db.collection("analytics_geo_hourly").get(),
      db.collection("analytics_daily").get(),
    ]);

    const citiesBase = geoSnap.docs.map((d) => {
      const x = d.data() || {};
      const country = cleanText(x.country, 2, "UN").toUpperCase();
      const city = cleanText(x.city, 120, "unknown");
      const lat = typeof x.lat === "number" ? x.lat : null;
      const lon = typeof x.lon === "number" ? x.lon : null;
      const hasValidCoords = lat != null && lon != null && !isNullIsland(lat, lon);
      return {
        id: d.id,
        geoId: d.id,
        country,
        city,
        pv: Number(x.pv || 0),
        usersAllTime: Number(x.users || 0),
        lat: hasValidCoords ? lat : null,
        lon: hasValidCoords ? lon : null,
        lastSeenAt: toIso(x.lastSeenAt || x.updatedAt),
        updatedAt: toIso(x.updatedAt),
      };
    }).filter((row) => row.country !== "UN" && row.city.toLowerCase() !== "unknown");

    const geoDaily = await Promise.all(dailySnap.docs.map(async (d) => {
      const x = d.data() || {};
      const [docDay, ...geoIdParts] = String(d.id || "").split("__");
      const day = x.day || docDay || null;
      const visitorsCount = day === today ? await countSubcollection(d.ref, "visitors") : 0;
      const country = cleanText(x.country, 2, "UN").toUpperCase();
      const city = cleanText(x.city, 120, "unknown");
      return {
        id: d.id,
        day,
        geoId: x.geoId || geoIdParts.join("__") || null,
        country,
        city,
        pv: Number(x.pv || 0),
        uniqueVisitors: Math.max(Number(x.uniqueVisitors || 0), visitorsCount),
        lastSeenAt: toIso(x.lastSeenAt || x.updatedAt),
        updatedAt: toIso(x.updatedAt),
      };
    }));

    const geoHourly = hourlySnap.docs.map((d) => {
      const x = d.data() || {};
      const country = cleanText(x.country, 2, "UN").toUpperCase();
      const city = cleanText(x.city, 120, "unknown");
      return {
        id: d.id,
        day: x.day || null,
        hour: typeof x.hour === "number" ? x.hour : null,
        geoId: x.geoId || null,
        country,
        city,
        pv: Number(x.pv || 0),
        uniqueVisitors: Number(x.uniqueVisitors || 0),
        lastSeenAt: toIso(x.lastSeenAt || x.updatedAt),
        updatedAt: toIso(x.updatedAt),
      };
    }).filter((row) => row.country !== "UN" && row.city.toLowerCase() !== "unknown");

    const globalDaily = await Promise.all(globalDailySnap.docs.map(async (d) => {
      const x = d.data() || {};
      const day = x.day || d.id;
      if (!day) return null;
      const visitorsCount = day === today ? await countSubcollection(d.ref, "visitors") : 0;
      return {
        id: d.id,
        day,
        pv: Number(x.pageviews || x.pv || 0),
        uniqueVisitors: Math.max(Number(x.uniqueVisitors || 0), visitorsCount),
      };
    }));

    const todayVisitorSnap = await db
      .collection("analytics_daily")
      .doc(today)
      .collection("visitors")
      .limit(120)
      .get()
      .catch(() => ({ docs: [] }));
    const recentVisitorRefs = new Map();
    const recentVisitorsBase = todayVisitorSnap.docs.map((docSnap) => {
      recentVisitorRefs.set(docSnap.id, docSnap.ref);
      const x = docSnap.data() || {};
      const visitorId = x.visitorId || docSnap.id;
      const uid = String(visitorId || "").startsWith("uid:") ? String(visitorId).slice(4) : "";
      return {
        id: docSnap.id,
        visitorId,
        uid,
        role: cleanText(x.role, 40, "unknown"),
        pathFirst: cleanText(x.pathFirst, 180, ""),
        pathLast: cleanText(x.pathLast || x.pathFirst, 180, ""),
        country: cleanText(x.country, 2, "UN").toUpperCase(),
        city: cleanText(x.city, 120, "unknown"),
        lat: typeof x.lat === "number" ? x.lat : null,
        lng: typeof x.lng === "number" ? x.lng : null,
        timeZone: cleanText(x.timeZone, 80, ""),
        firstSeenAt: toIso(x.firstSeenAt),
        lastSeenAt: toIso(x.lastSeenAt || x.firstSeenAt),
      };
    });
    const todayVisitEventSnap = await db
      .collection("analytics_daily")
      .doc(today)
      .collection("events")
      .orderBy("seenAt", "desc")
      .limit(120)
      .get()
      .catch(() => ({ docs: [] }));
    const recentVisitEventsBase = todayVisitEventSnap.docs.map((docSnap) => {
      const x = docSnap.data() || {};
      const visitorId = x.visitorId || "";
      const uid = cleanText(x.uid, 120, "") || (String(visitorId).startsWith("uid:") ? String(visitorId).slice(4) : "");
      return {
        id: `event:${docSnap.id}`,
        eventId: docSnap.id,
        visitorId,
        uid,
        role: cleanText(x.role, 40, "unknown"),
        pathFirst: cleanText(x.path, 180, ""),
        pathLast: cleanText(x.path, 180, ""),
        country: cleanText(x.country, 2, "UN").toUpperCase(),
        city: cleanText(x.city, 120, "unknown"),
        lat: typeof x.lat === "number" ? x.lat : null,
        lng: typeof x.lng === "number" ? x.lng : null,
        timeZone: cleanText(x.timeZone, 80, ""),
        firstSeenAt: toIso(x.seenAt),
        lastSeenAt: toIso(x.seenAt),
        source: "event",
      };
    });
    const visitorUsers = new Map();
    await Promise.all(
      [...new Set([...recentVisitorsBase, ...recentVisitEventsBase].map((v) => v.uid).filter(Boolean))].map(async (uid) => {
        const snap = await db.collection("users").doc(uid).get().catch(() => null);
        if (!snap?.exists) return;
        const data = snap.data() || {};
        visitorUsers.set(uid, {
          name: pickPersonName(data, uid),
          email: data.email || "",
          role: data.role || "",
          location: data.location || null,
        });
      })
    );
    const recentVisitorsFromAnalytics = (await Promise.all(
      recentVisitorsBase.map(async (visit) => {
        const person = visitorUsers.get(visit.uid);
        const lat = visit.lat != null ? visit.lat : (typeof person?.location?.lat === "number" ? person.location.lat : null);
        const lng = visit.lng != null ? visit.lng : (typeof person?.location?.lng === "number" ? person.location.lng : null);
        let country =
          visit.country !== "UN"
            ? visit.country
            : cleanText(person?.location?.country, 2, visit.country).toUpperCase();
        let city =
          visit.city.toLowerCase() !== "unknown"
            ? visit.city
            : cleanText(person?.location?.city, 120, visit.city);

        if (
          lat != null &&
          lng != null &&
          (country === "UN" || city.toLowerCase() === "unknown")
        ) {
          const resolved = await reverseGeocode({ lat, lng });
          if (resolved?.country || resolved?.city) {
            country = resolved.country || country;
            city = resolved.city || city;
            const ref = recentVisitorRefs.get(visit.id);
            if (ref) {
              await ref.set(
                {
                  country,
                  city,
                  reverseGeocodedAt: admin.firestore.FieldValue.serverTimestamp(),
                  reverseGeocodingProvider: resolved.provider || "unknown",
                },
                { merge: true }
              ).catch(() => {});
            }
          }
        }

        return {
          ...visit,
          personName: person?.name || (visit.uid ? visit.uid : "Visiteur anonyme"),
          email: person?.email || "",
          role: person?.role || visit.role,
          country,
          city,
          lat,
          lng,
        };
      })
    ))
      .sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));

    const recentByKey = new Map();
    const upsertRecent = (visit) => {
      const key = visit.uid ? `uid:${visit.uid}` : visit.visitorId || visit.id;
      if (!key) return;
      const previous = recentByKey.get(key);
      const previousMs = Date.parse(previous?.lastSeenAt || previous?.firstSeenAt || "") || 0;
      const nextMs = Date.parse(visit.lastSeenAt || visit.firstSeenAt || "") || 0;
      if (!previous || nextMs >= previousMs) recentByKey.set(key, visit);
    };
    recentVisitorsFromAnalytics.forEach(upsertRecent);

    const recentVisitEvents = (await Promise.all(
      recentVisitEventsBase.map(async (visit) => {
        const person = visitorUsers.get(visit.uid);
        let country =
          visit.country !== "UN"
            ? visit.country
            : cleanText(person?.location?.country, 2, visit.country).toUpperCase();
        let city =
          visit.city.toLowerCase() !== "unknown"
            ? visit.city
            : cleanText(person?.location?.city, 120, visit.city);
        const lat = visit.lat != null ? visit.lat : (typeof person?.location?.lat === "number" ? person.location.lat : null);
        const lng = visit.lng != null ? visit.lng : (typeof person?.location?.lng === "number" ? person.location.lng : null);

        if (
          lat != null &&
          lng != null &&
          (country === "UN" || city.toLowerCase() === "unknown")
        ) {
          const resolved = await reverseGeocode({ lat, lng });
          if (resolved?.country || resolved?.city) {
            country = resolved.country || country;
            city = resolved.city || city;
          }
        }

        return {
          ...visit,
          personName: person?.name || (visit.uid ? visit.uid : "Visiteur anonyme"),
          email: person?.email || "",
          role: person?.role || visit.role,
          country,
          city,
          lat,
          lng,
        };
      })
    ))
      .sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));

    const accountCollections = [
      { name: "users", defaultRole: "user" },
      { name: "coachs", defaultRole: "coach" },
    ];
    await Promise.all(
      accountCollections.map(async ({ name, defaultRole }) => {
        const snap = await db.collection(name).get().catch(() => ({ docs: [] }));
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const lastVisitValue = pickLastVisitValue(data);
          const lastVisitDate = toDate(lastVisitValue);
          if (!lastVisitDate || fmtDay(lastVisitDate) !== today) return;
          const location = normalizeLocation(data);
          const uid = data.uid || data.linkedUserId || (name === "users" || name === "coachs" ? docSnap.id : "");
          upsertRecent({
            id: `${name}:${docSnap.id}`,
            visitorId: uid ? `uid:${uid}` : `${name}:${docSnap.id}`,
            uid,
            role: cleanText(data.role || defaultRole, 40, defaultRole),
            pathFirst: "",
            pathLast: cleanText(data.lastVisitedPath, 180, ""),
            country: location.country,
            city: location.city,
            lat: location.lat,
            lng: location.lng,
            firstSeenAt: toIso(lastVisitValue),
            lastSeenAt: toIso(lastVisitValue),
            personName: pickPersonName(data, docSnap.id),
            email: data.email || data.emailLower || "",
            source: name,
          });
        });
      })
    );

    const recentVisitors = (recentVisitEvents.length > 0 ? recentVisitEvents : [...recentByKey.values()])
      .sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));

    return res.json({
      ok: true,
      today,
      citiesBase,
      geoDaily: geoDaily.filter((row) => row.country !== "UN" && row.city.toLowerCase() !== "unknown"),
      geoHourly,
      globalDaily: globalDaily.filter(Boolean),
      recentVisitors,
    });
  } catch (error) {
    console.error("[analytics/admin/geo] error:", error);
    return res.status(500).json({ error: "analytics-admin-geo-failed" });
  }
});

router.get("/admin/visitor/:uid", requireAnalyticsAdmin, async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const uid = normalizeUid(req.params.uid);
    if (!uid) return res.status(400).json({ error: "missing-uid" });

    const days = Math.max(1, Math.min(Number(req.query.days || 60), 120));
    const db = admin.firestore();
    const visitorId = `uid:${uid}`;
    const refs = recentDayKeys(days).map((day) => ({
      day,
      ref: db.collection("analytics_daily").doc(day).collection("visitors").doc(visitorId),
    }));

    const snapshots = await Promise.all(
      refs.map(({ day, ref }) => ref.get().then((snap) => ({ day, ref, snap })).catch(() => null))
    );

    let latest = null;
    snapshots.forEach((entry) => {
      if (!entry?.snap?.exists) return;
      const data = entry.snap.data() || {};
      const seenIso = toIso(data.lastSeenAt || data.firstSeenAt);
      const seenMs = seenIso ? Date.parse(seenIso) : 0;
      if (!seenMs) return;
      if (!latest || seenMs > latest.seenMs) {
        latest = { day: entry.day, ref: entry.ref, data, seenIso, seenMs };
      }
    });

    if (!latest) {
      return res.json({ ok: true, found: false, uid, visitorId });
    }

    const userSnap = await db.collection("users").doc(uid).get().catch(() => null);
    const userData = userSnap?.exists ? userSnap.data() || {} : {};
    const lat =
      typeof latest.data.lat === "number"
        ? latest.data.lat
        : typeof userData?.location?.lat === "number"
          ? userData.location.lat
          : null;
    const lng =
      typeof latest.data.lng === "number"
        ? latest.data.lng
        : typeof userData?.location?.lng === "number"
          ? userData.location.lng
          : null;
    let country = cleanText(latest.data.country, 2, userData?.location?.country || "UN").toUpperCase();
    let city = cleanText(latest.data.city, 120, userData?.location?.city || "unknown");

    if (
      lat != null &&
      lng != null &&
      !isNullIsland(lat, lng) &&
      (country === "UN" || city.toLowerCase() === "unknown")
    ) {
      const resolved = await reverseGeocode({ lat, lng });
      if (resolved?.country || resolved?.city) {
        country = resolved.country || country;
        city = resolved.city || city;
        await latest.ref.set(
          {
            country,
            city,
            reverseGeocodedAt: admin.firestore.FieldValue.serverTimestamp(),
            reverseGeocodingProvider: resolved.provider || "unknown",
          },
          { merge: true }
        ).catch(() => {});
      }
    }

    return res.json({
      ok: true,
      found: true,
      uid,
      visitorId,
      visit: {
        day: latest.day,
        visitorId,
        firstSeenAt: toIso(latest.data.firstSeenAt),
        lastSeenAt: latest.seenIso,
        pathFirst: cleanText(latest.data.pathFirst, 180, ""),
        pathLast: cleanText(latest.data.pathLast || latest.data.pathFirst, 180, ""),
        role: cleanText(latest.data.role, 40, userData.role || "unknown"),
        city: city.toLowerCase() === "unknown" ? "" : city,
        country: country === "UN" ? "" : country,
        lat,
        lng,
        personName: pickPersonName(userData, uid),
        email: userData.email || "",
      },
    });
  } catch (error) {
    console.error("[analytics/admin/visitor] error:", error);
    return res.status(500).json({ error: "analytics-admin-visitor-failed" });
  }
});

router.post("/admin/geo/enrich", requireAnalyticsAdmin, async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const limit = Math.min(Math.max(Number(req.body?.limit || 30), 1), 100);
    const geoIds = Array.isArray(req.body?.geoIds)
      ? req.body.geoIds.map((id) => cleanText(id, 120, "")).filter(Boolean)
      : [];
    const db = admin.firestore();
    const snap = geoIds.length
      ? await Promise.all(geoIds.map(async (id) => {
          const ref = db.collection("analytics_geo").doc(id);
          const docSnap = await ref.get();
          return docSnap.exists ? docSnap : null;
        }))
      : (await db.collection("analytics_geo").get()).docs;

    const updated = [];
    for (const docSnap of snap.filter(Boolean).slice(0, limit)) {
      const data = docSnap.data() || {};
      if (typeof data.lat === "number" && typeof data.lon === "number") continue;
      const result = await geocodeCity({ country: data.country, city: data.city });
      if (!result) continue;
      await docSnap.ref.set(
        {
          lat: result.lat,
          lon: result.lon,
          geocodingProvider: result.provider,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      updated.push({ geoId: docSnap.id, lat: result.lat, lon: result.lon });
    }

    return res.json({ ok: true, updated });
  } catch (error) {
    console.error("[analytics/admin/geo/enrich] error:", error);
    return res.status(500).json({ error: "analytics-geo-enrich-failed" });
  }
});

router.post("/pageview", async (req, res) => {
  try {
    if (!checkRateLimit(req)) {
      return res.status(429).json({ ok: false, error: "too-many-requests" });
    }

    const db = admin.firestore();
    const now = new Date();
    const visitorTimeZone = normalizeTimeZone(req.body?.timeZone);
    const day = fmtDay(now, visitorTimeZone);
    const hour = localHour(now, visitorTimeZone);
    const path = cleanText(req.body?.path, 180, "/");
    const role = cleanText(req.body?.roleEffectif || req.body?.role, 40, "unknown");
    const rawLat = cleanCoordinate(req.body?.lat, -90, 90);
    const rawLng = cleanCoordinate(req.body?.lng, -180, 180);
    const hasUsableCoords = rawLat != null && rawLng != null && !isNullIsland(rawLat, rawLng);
    const lat = hasUsableCoords ? rawLat : null;
    const lng = hasUsableCoords ? rawLng : null;
    const reverseGeo = await reverseGeocode({ lat, lng });
    const countrySource =
      reverseGeo?.country ||
      req.body?.country ||
      headerText(req, "cf-ipcountry", 2) ||
      headerText(req, "x-vercel-ip-country", 2);
    const citySource =
      reverseGeo?.city ||
      req.body?.city ||
      headerText(req, "x-vercel-ip-city") ||
      headerText(req, "x-appengine-city");
    const country = cleanText(countrySource, 2, "UN").toUpperCase();
    const city = cleanText(citySource, 120, "unknown");
    let verifiedUid = "";
    let verifiedEmail = "";
    try {
      const token = getBearerToken(req);
      if (token) {
        const decoded = await admin.auth().verifyIdToken(token);
        verifiedUid = normalizeUid(decoded?.uid);
        verifiedEmail = cleanText(decoded?.email, 180, "").toLowerCase();
      }
    } catch (error) {
      console.warn("[analytics/pageview] invalid auth token:", error?.message || error);
    }

    const requestedVisitorId = normalizeVisitorId(req.body?.visitorId);
    const uid = verifiedUid;
    const visitorId = uid
      ? `uid:${uid}`
      : requestedVisitorId.startsWith("uid:")
        ? anonVisitorIdFromRequest(req)
        : requestedVisitorId;
    const analyticsAllowed = req.body?.analyticsAllowed !== false;
    const hasGeoLabel = country !== "UN" && city.toLowerCase() !== "unknown";
    const geoId = `${country}-${slug(city)}`.slice(0, 100);

    const FieldValue = admin.firestore.FieldValue;
    const lastVisitPatch = () => {
      const patch = {
        lastVisitAt: FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp(),
        lastVisitedPath: path,
          lastVisitSource: analyticsAllowed ? "pageview-analytics" : "pageview-last-seen",
          lastVisitActorUid: uid,
          lastVisitTimeZone: visitorTimeZone,
      };
      if (analyticsAllowed && (hasGeoLabel || lat != null || lng != null)) {
        patch.location = {
          ...(hasGeoLabel ? { country, city } : {}),
          ...(lat != null ? { lat } : {}),
          ...(lng != null ? { lng } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        };
      }
      return patch;
    };

    const addProfileRef = (refs, ref) => {
      if (!ref?.path) return;
      refs.set(ref.path, ref);
    };

    const findLinkedProfileRefs = async () => {
      const refs = new Map();
      if (!uid) return refs;

      await Promise.all(
        ["clients", "coachs"].map(async (collectionName) => {
          const docSnap = await db.collection(collectionName).doc(uid).get().catch(() => null);
          if (docSnap?.exists) addProfileRef(refs, docSnap.ref);
        })
      );

      const queries = [
        db.collection("clients").where("linkedUserId", "==", uid).limit(10),
        db.collection("clients").where("uid", "==", uid).limit(10),
        db.collection("clients").where("userUid", "==", uid).limit(10),
        db.collection("clients").where("clientUid", "==", uid).limit(10),
      ];

      if (verifiedEmail) {
        queries.push(
          db.collection("clients").where("emailLower", "==", verifiedEmail).limit(10),
          db.collection("clients").where("email", "==", verifiedEmail).limit(10),
          db.collection("coachs").where("emailLower", "==", verifiedEmail).limit(10),
          db.collection("coachs").where("email", "==", verifiedEmail).limit(10)
        );
      }

      await Promise.all(
        queries.map(async (q) => {
          const snap = await q.get().catch(() => null);
          snap?.forEach((docSnap) => addProfileRef(refs, docSnap.ref));
        })
      );

      return refs;
    };

    const updateUserLastVisit = async () => {
      if (!uid) return;
      const patch = lastVisitPatch();
      const linkedRefs = await findLinkedProfileRefs();
      const batch = db.batch();
      batch.set(db.collection("users").doc(uid), patch, { merge: true });
      linkedRefs.forEach((ref) => batch.set(ref, patch, { merge: true }));
      await batch.commit();
    };

    if (!analyticsAllowed) {
      await updateUserLastVisit();
      return res.json({
        ok: true,
        day,
        tracked: "last-seen-only",
        country: null,
        city: null,
        geoId: null,
        geolocated: false,
      });
    }

    const dailyRef = db.collection("analytics_daily").doc(day);
    const dailyVisitorRef = dailyRef.collection("visitors").doc(visitorId);
    const geoRef = hasGeoLabel ? db.collection("analytics_geo").doc(geoId) : null;
    const geoAllVisitorRef = geoRef ? geoRef.collection("visitors_all").doc(visitorId) : null;
    const geoDailyRef = hasGeoLabel ? db.collection("analytics_geo_daily").doc(`${day}__${geoId}`) : null;
    const geoDailyVisitorRef = geoDailyRef ? geoDailyRef.collection("visitors").doc(visitorId) : null;
    const hourKey = String(hour).padStart(2, "0");
    const geoHourlyRef = hasGeoLabel ? db.collection("analytics_geo_hourly").doc(`${day}__${hourKey}__${geoId}`) : null;
    const geoHourlyVisitorRef = geoHourlyRef ? geoHourlyRef.collection("visitors").doc(visitorId) : null;

    await db.runTransaction(async (tx) => {
      const [dailySnap, dailyVisitorSnap] = await Promise.all([
        tx.get(dailyRef),
        tx.get(dailyVisitorRef),
      ]);

      const [
        geoSnap,
        geoAllVisitorSnap,
        geoDailySnap,
        geoDailyVisitorSnap,
        geoHourlySnap,
        geoHourlyVisitorSnap,
      ] = hasGeoLabel
        ? await Promise.all([
            tx.get(geoRef),
            tx.get(geoAllVisitorRef),
            tx.get(geoDailyRef),
            tx.get(geoDailyVisitorRef),
            tx.get(geoHourlyRef),
            tx.get(geoHourlyVisitorRef),
          ])
        : [];

      if (!dailySnap.exists) {
        tx.set(dailyRef, {
          day,
          pageviews: 0,
          uniqueVisitors: 0,
          byPage: {},
          byCountry: {},
          byRole: {},
          events: {},
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.set(dailyRef, {
        pageviews: FieldValue.increment(1),
        byPage: { [safeKey(path)]: FieldValue.increment(1) },
        byCountry: { [safeKey(country)]: FieldValue.increment(1) },
        byRole: { [safeKey(role)]: FieldValue.increment(1) },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (!dailyVisitorSnap.exists) {
        tx.set(dailyVisitorRef, {
          visitorId,
          firstSeenAt: FieldValue.serverTimestamp(),
          lastSeenAt: FieldValue.serverTimestamp(),
          pathFirst: path,
          pathLast: path,
          country,
          city,
          role,
          lat,
          lng,
          timeZone: visitorTimeZone,
        });
        tx.set(dailyRef, { uniqueVisitors: FieldValue.increment(1) }, { merge: true });
      } else {
        tx.set(dailyVisitorRef, {
          lastSeenAt: FieldValue.serverTimestamp(),
          pathLast: path,
          country,
          city,
          role,
          lat,
          lng,
          timeZone: visitorTimeZone,
        }, { merge: true });
      }

      if (!hasGeoLabel) return;

      if (!geoSnap.exists) {
        tx.set(geoRef, {
          country,
          city,
          ...(lat != null ? { lat } : {}),
          ...(lng != null ? { lon: lng } : {}),
          pv: 0,
          users: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastSeenAt: FieldValue.serverTimestamp(),
        });
      }
      tx.set(geoRef, {
        pv: FieldValue.increment(1),
        ...(lat != null ? { lat } : {}),
        ...(lng != null ? { lon: lng } : {}),
        lastSeenAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (!geoAllVisitorSnap.exists) {
        tx.set(geoAllVisitorRef, {
          visitorId,
          firstSeenAt: FieldValue.serverTimestamp(),
          country,
          city,
          lat,
          lng,
          timeZone: visitorTimeZone,
        });
        tx.set(geoRef, { users: FieldValue.increment(1) }, { merge: true });
      }

      if (!geoDailySnap.exists) {
        tx.set(geoDailyRef, {
          day,
          geoId,
          country,
          city,
          ...(lat != null ? { lat } : {}),
          ...(lng != null ? { lon: lng } : {}),
          pv: 0,
          uniqueVisitors: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastSeenAt: FieldValue.serverTimestamp(),
        });
      }
      tx.set(geoDailyRef, {
        pv: FieldValue.increment(1),
        ...(lat != null ? { lat } : {}),
        ...(lng != null ? { lon: lng } : {}),
        lastSeenAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (!geoDailyVisitorSnap.exists) {
        tx.set(geoDailyVisitorRef, {
          visitorId,
          firstSeenAt: FieldValue.serverTimestamp(),
          lastSeenAt: FieldValue.serverTimestamp(),
          pathFirst: path,
          pathLast: path,
          country,
          city,
          role,
          lat,
          lng,
          timeZone: visitorTimeZone,
        });
        tx.set(geoDailyRef, { uniqueVisitors: FieldValue.increment(1) }, { merge: true });
      } else {
        tx.set(geoDailyVisitorRef, {
          lastSeenAt: FieldValue.serverTimestamp(),
          pathLast: path,
          country,
          city,
          role,
          lat,
          lng,
          timeZone: visitorTimeZone,
        }, { merge: true });
      }

      if (!geoHourlySnap.exists) {
        tx.set(geoHourlyRef, {
          day,
          hour,
          geoId,
          country,
          city,
          ...(lat != null ? { lat } : {}),
          ...(lng != null ? { lon: lng } : {}),
          pv: 0,
          uniqueVisitors: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastSeenAt: FieldValue.serverTimestamp(),
        });
      }
      tx.set(geoHourlyRef, {
        pv: FieldValue.increment(1),
        ...(lat != null ? { lat } : {}),
        ...(lng != null ? { lon: lng } : {}),
        lastSeenAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (!geoHourlyVisitorSnap.exists) {
        tx.set(geoHourlyVisitorRef, {
          visitorId,
          firstSeenAt: FieldValue.serverTimestamp(),
          lastSeenAt: FieldValue.serverTimestamp(),
          pathFirst: path,
          pathLast: path,
          country,
          city,
          role,
          lat,
          lng,
          timeZone: visitorTimeZone,
        });
        tx.set(geoHourlyRef, { uniqueVisitors: FieldValue.increment(1) }, { merge: true });
      } else {
        tx.set(geoHourlyVisitorRef, {
          lastSeenAt: FieldValue.serverTimestamp(),
          pathLast: path,
          country,
          city,
          role,
          lat,
          lng,
          timeZone: visitorTimeZone,
        }, { merge: true });
      }
    });

    await updateUserLastVisit();
    await dailyRef.collection("events").add({
      visitorId,
      uid: uid || null,
      role,
      path,
      country,
      city,
      lat,
      lng,
      timeZone: visitorTimeZone,
      analyticsAllowed,
      seenAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }).catch((eventError) => {
      console.warn("[analytics/pageview] visit event write failed:", eventError?.message || eventError);
    });

    return res.json({
      ok: true,
      day,
      country,
      city,
      geoId,
      geolocated: lat != null && lng != null,
      timeZone: visitorTimeZone,
      geocodingProvider: reverseGeo?.provider || null,
    });
  } catch (error) {
    console.error("[analytics/pageview] error:", error);
    return res.status(200).json({ ok: false, skipped: "error" });
  }
});

module.exports = router;
