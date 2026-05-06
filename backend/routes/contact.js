// routes/contact.js
const express = require("express");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const router = express.Router();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_CONTACT_REQUESTS = 5;
const contactHits = new Map();

function asBool(v) {
  return String(v || "").toLowerCase() === "true";
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE ? asBool(process.env.SMTP_SECURE) : port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP config missing: SMTP_HOST/SMTP_USER/SMTP_PASS");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function getRequesterKey(req) {
  const fwd = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(fwd) ? fwd[0] : fwd || "").split(",")[0].trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown";
  return ip.replace("::ffff:", "");
}

function checkContactRateLimit(req) {
  const now = Date.now();
  const key = getRequesterKey(req);
  const entry = contactHits.get(key) || { count: 0, resetAt: now + WINDOW_MS };

  if (entry.resetAt <= now) {
    entry.count = 0;
    entry.resetAt = now + WINDOW_MS;
  }

  entry.count += 1;
  contactHits.set(key, entry);

  return entry.count <= MAX_CONTACT_REQUESTS;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

// POST /api/contact
router.post("/", async (req, res) => {
  try {
    if (!checkContactRateLimit(req)) {
      return res.status(429).json({ error: "Too many requests" });
    }

    const { name, email, message } = req.body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const cleanName = String(name).trim().slice(0, 120);
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanMessage = String(message).trim().slice(0, 4000);

    if (!isEmail(cleanEmail)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    if (cleanName.length < 2 || cleanMessage.length < 10) {
      return res.status(400).json({ error: "Invalid fields" });
    }

    // 1) Stocke dans Firestore
    const docRef = await admin.firestore().collection("contact_messages").add({
      name: cleanName,
      email: cleanEmail,
      message: cleanMessage,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "web",
    });

    // 2) Envoi email
    const to = process.env.CONTACT_TO || process.env.SMTP_USER;
    const fromName = process.env.CONTACT_FROM_NAME || "BoostYourLife";
    const fromEmail = process.env.SMTP_USER;

    if (!to || !fromEmail) {
      console.warn("[contact] CONTACT_TO/SMTP_USER missing -> email skipped");
      return res.status(200).json({ ok: true, stored: true, emailed: false, id: docRef.id });
    }

    const transporter = getTransporter();

    const subject = `Nouveau message - Contact (${cleanName})`;
    const text = [
      "Nouveau message depuis BoostYourLife.coach",
      "",
      `Nom: ${cleanName}`,
      `Email: ${cleanEmail}`,
      "",
      "Message:",
      cleanMessage,
      "",
      `Firestore: contact_messages/${docRef.id}`,
    ].join("\n");

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Nouveau message (BoostYourLife.coach)</h2>
        <p><b>Nom :</b> ${escapeHtml(cleanName)}</p>
        <p><b>Email :</b> ${escapeHtml(cleanEmail)}</p>
        <p><b>Message :</b></p>
        <pre style="white-space:pre-wrap;background:#f6f6f6;padding:12px;border-radius:8px">${escapeHtml(
          cleanMessage
        )}</pre>
        <p style="color:#666">Firestore : <code>contact_messages/${escapeHtml(docRef.id)}</code></p>
      </div>
    `;

    await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to,
      subject,
      text,
      html,
      replyTo: cleanEmail, // tu peux répondre direct au client
    });

    return res.status(200).json({ ok: true, stored: true, emailed: true, id: docRef.id });
  } catch (e) {
    console.error("contact error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
});

module.exports = router;
