// server.js
require("dotenv").config();

const express = require("express");
const admin = require("firebase-admin");
try { admin.app(); } catch { admin.initializeApp(); }

const app = express();

/* =================== PAYMENTS (Stripe) =================== */
// IMPORTANT : webhook en RAW AVANT express.json()
const paymentsRouter = require("./routes/payments");
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  paymentsRouter.webhookHandler
);

// Le reste en JSON
app.use(express.json());

// CORS simple pour /api/*
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.1.77:5173",
  "https://boostyourlife.coach",
];
function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).send("");
  }
  next();
});

// Monte les routes paiements
app.use("/api/payments", paymentsRouter);

/* =================== Analytics (même que Functions) =================== */
function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(fwd) ? fwd[0] : fwd || "").split(",")[0].trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "";
  return ip.replace("::ffff:", "");
}
function slug(s) {
  return (s || "unknown")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

app.options("/api/analytics/pageview", (req, res) => res.status(204).send(""));

app.post("/api/analytics/pageview", async (req, res) => {
  try {
    let ip = getClientIp(req);
    if (process.env.NODE_ENV !== "production" && req.query && req.query.ip) {
      ip = String(req.query.ip);
    }
    if (!ip || ip.startsWith("127.") || ip === "::1") {
      return res.json({ ok: true, skipped: "local" });
    }

    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 4000);
    let geo = null;
    try {
      const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
        signal: controller.signal,
      });
      geo = await r.json();
    } finally {
      clearTimeout(to);
    }

    const countryCode = (geo?.country || "UN").toUpperCase();
    const cityName = geo?.city || "Unknown";
    const docId = `${countryCode}-${slug(cityName)}`.slice(0, 100);

    await admin.firestore().collection("analytics_geo").doc(docId).set(
      {
        country: countryCode,
        city: cityName,
        pv: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("analytics/pageview error:", e.message || e);
    res.status(200).json({ ok: true, skipped: "error" });
  }
});

app.get("/api/_healthz", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[BYL] API listening on http://localhost:${PORT}`);
});

