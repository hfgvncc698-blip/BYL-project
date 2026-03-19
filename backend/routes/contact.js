// routes/contact.js
const express = require("express");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const router = express.Router();

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

// POST /api/contact
router.post("/", async (req, res) => {
  try {
    const { name, email, message } = req.body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanMessage = String(message).trim();

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

