const express = require("express");
const admin = require("../firebaseAdmin");

const router = express.Router();
const db = admin.firestore();
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

router.get("/open/:eventId.gif", async (req, res) => {
  res.set({
    "Content-Type": "image/gif",
    "Content-Length": String(PIXEL.length),
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });

  const eventId = String(req.params.eventId || "");
  if (/^[A-Za-z0-9_-]{10,100}$/.test(eventId)) {
    const ref = db.collection("email_events").doc(eventId);
    try {
      await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists) return;
        const data = snap.data() || {};
        transaction.update(ref, {
          openedAt: admin.firestore.FieldValue.serverTimestamp(),
          openCount: admin.firestore.FieldValue.increment(1),
          ...(!data.firstOpenedAt
            ? { firstOpenedAt: admin.firestore.FieldValue.serverTimestamp() }
            : {}),
        });
      });
    } catch (error) {
      console.warn("[email-tracking] open event failed:", error?.message || error);
    }
  }

  return res.status(200).end(PIXEL);
});

module.exports = router;
