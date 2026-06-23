const express = require("express");
const http = require("http");
const admin = require("firebase-admin");
const helmet = require("helmet");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, ".env"), override: true });

// Init Firebase Admin
try {
  admin.app();
} catch {
  const localServiceAccountPath = path.join(__dirname, "serviceAccountKey.json");
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || fs.existsSync(localServiceAccountPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(
        require(process.env.GOOGLE_APPLICATION_CREDENTIALS || localServiceAccountPath)
      ),
    });
  } else {
    admin.initializeApp();
  }
}

const app = express();
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

/* =================== PAYMENTS (Stripe) =================== */
// IMPORTANT : webhook en RAW AVANT express.json()
const paymentsRouter = require("./routes/payments");
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  paymentsRouter.webhookHandler
);

// Le reste en JSON
app.use(express.json({ limit: "1mb" }));

/* =================== CORS (UNIQUEMENT ICI) =================== */
// CORS simple pour /api/*
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.1.77:5173",
  "https://boostyourlife.coach",
  "https://www.boostyourlife.coach",
];

function setCors(req, res) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    // Renvoie UNE SEULE origine
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
}

// Applique CORS uniquement sur /api/*
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    setCors(req, res);

    // Preflight
    if (req.method === "OPTIONS") return res.status(204).send("");
  }
  next();
});

// Monte les routes paiements
app.use("/api/payments", paymentsRouter);

// ✅ Contact
const contactRouter = require("./routes/contact");
app.use("/api/contact", contactRouter);

const analyticsRouter = require("./routes/analytics");
app.use("/api/analytics", analyticsRouter);

const clientProfileRouter = require("./routes/clientProfile");
app.use("/api/client-profile", clientProfileRouter);

// ✅✅✅ PROGRAMS (génération auto)
// IMPORTANT : c’est CE router qui doit gérer /api/programs/generate
const programsRouter = require("./routes/programs");
app.use("/api/programs", programsRouter);

app.get("/api/_healthz", (_req, res) => res.json({ ok: true }));
app.get("/_healthz", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 5050;
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`[BYL] API listening on http://localhost:${PORT}`);
});

module.exports = { app, server };
