// routes/stripePortal.js
const express = require("express");
const Stripe = require("stripe");
const admin = require("firebase-admin");

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

router.post("/session", async (req, res) => {
  try {
    const { userId } = req.body;              // ou { uid } si tu préfères
    if (!userId) return res.status(400).json({ error: "userId manquant" });

    const snap = await admin.firestore().collection("users").doc(userId).get();
    if (!snap.exists) return res.status(404).json({ error: "user introuvable" });

    const user = snap.data();
    if (!user.stripeCustomerId) {
      return res.status(400).json({ error: "stripeCustomerId manquant" });
    }

    const returnUrl =
      (process.env.FRONTEND_BASE_URL || "http://localhost:5173") + "/settings-coach";

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("[STRIPE PORTAL] error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;

