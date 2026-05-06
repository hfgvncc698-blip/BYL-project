const express = require("express");
const admin = require("firebase-admin");

const router = express.Router();

const WINDOW_MS = 60 * 1000;
const MAX_EVENTS_PER_WINDOW = 120;
const hits = new Map();

function cleanText(value, max = 120, fallback = "") {
  const text = String(value || "").trim();
  return (text || fallback).slice(0, max);
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

function fmtDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getRequesterKey(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (
    (Array.isArray(fwd) ? fwd[0] : fwd || "").split(",")[0].trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  ).replace("::ffff:", "");
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

function normalizeVisitorId(value) {
  const raw = cleanText(value, 120, "anon");
  return raw.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 120) || "anon";
}

router.post("/pageview", async (req, res) => {
  try {
    if (!checkRateLimit(req)) {
      return res.status(429).json({ ok: false, error: "too-many-requests" });
    }

    const db = admin.firestore();
    const now = new Date();
    const day = fmtDay(now);
    const hour = now.getHours();
    const path = cleanText(req.body?.path, 180, "/");
    const role = cleanText(req.body?.roleEffectif || req.body?.role, 40, "unknown");
    const country = cleanText(req.body?.country, 2, "UN").toUpperCase();
    const city = cleanText(req.body?.city, 120, "unknown");
    const visitorId = normalizeVisitorId(req.body?.visitorId);
    const geoId = `${country}-${slug(city)}`.slice(0, 100);

    const FieldValue = admin.firestore.FieldValue;
    const dailyRef = db.collection("analytics_daily").doc(day);
    const dailyVisitorRef = dailyRef.collection("visitors").doc(visitorId);
    const geoRef = db.collection("analytics_geo").doc(geoId);
    const geoAllVisitorRef = geoRef.collection("visitors_all").doc(visitorId);
    const geoDailyRef = db.collection("analytics_geo_daily").doc(`${day}__${geoId}`);
    const geoDailyVisitorRef = geoDailyRef.collection("visitors").doc(visitorId);
    const hourKey = String(hour).padStart(2, "0");
    const geoHourlyRef = db.collection("analytics_geo_hourly").doc(`${day}__${hourKey}__${geoId}`);
    const geoHourlyVisitorRef = geoHourlyRef.collection("visitors").doc(visitorId);

    await db.runTransaction(async (tx) => {
      const [
        dailySnap,
        dailyVisitorSnap,
        geoSnap,
        geoAllVisitorSnap,
        geoDailySnap,
        geoDailyVisitorSnap,
        geoHourlySnap,
        geoHourlyVisitorSnap,
      ] = await Promise.all([
        tx.get(dailyRef),
        tx.get(dailyVisitorRef),
        tx.get(geoRef),
        tx.get(geoAllVisitorRef),
        tx.get(geoDailyRef),
        tx.get(geoDailyVisitorRef),
        tx.get(geoHourlyRef),
        tx.get(geoHourlyVisitorRef),
      ]);

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
        [`byPage.${safeKey(path)}`]: FieldValue.increment(1),
        [`byCountry.${safeKey(country)}`]: FieldValue.increment(1),
        [`byRole.${safeKey(role)}`]: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (!dailyVisitorSnap.exists) {
        tx.set(dailyVisitorRef, {
          visitorId,
          firstSeenAt: FieldValue.serverTimestamp(),
          pathFirst: path,
          country,
          city,
          role,
        });
        tx.set(dailyRef, { uniqueVisitors: FieldValue.increment(1) }, { merge: true });
      }

      if (!geoSnap.exists) {
        tx.set(geoRef, {
          country,
          city,
          pv: 0,
          users: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.set(geoRef, {
        pv: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (!geoAllVisitorSnap.exists) {
        tx.set(geoAllVisitorRef, {
          visitorId,
          firstSeenAt: FieldValue.serverTimestamp(),
          country,
          city,
        });
        tx.set(geoRef, { users: FieldValue.increment(1) }, { merge: true });
      }

      if (!geoDailySnap.exists) {
        tx.set(geoDailyRef, {
          day,
          geoId,
          country,
          city,
          pv: 0,
          uniqueVisitors: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.set(geoDailyRef, {
        pv: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (!geoDailyVisitorSnap.exists) {
        tx.set(geoDailyVisitorRef, {
          visitorId,
          firstSeenAt: FieldValue.serverTimestamp(),
          pathFirst: path,
          country,
          city,
          role,
        });
        tx.set(geoDailyRef, { uniqueVisitors: FieldValue.increment(1) }, { merge: true });
      }

      if (!geoHourlySnap.exists) {
        tx.set(geoHourlyRef, {
          day,
          hour,
          geoId,
          country,
          city,
          pv: 0,
          uniqueVisitors: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.set(geoHourlyRef, {
        pv: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (!geoHourlyVisitorSnap.exists) {
        tx.set(geoHourlyVisitorRef, {
          visitorId,
          firstSeenAt: FieldValue.serverTimestamp(),
          pathFirst: path,
          country,
          city,
          role,
        });
        tx.set(geoHourlyRef, { uniqueVisitors: FieldValue.increment(1) }, { merge: true });
      }
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error("[analytics/pageview] error:", error);
    return res.status(200).json({ ok: false, skipped: "error" });
  }
});

module.exports = router;
