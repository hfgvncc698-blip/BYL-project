const express = require("express");
const admin = require("../firebaseAdmin");
const { requireFirebaseAuth, getUserRole } = require("../utils/firebaseAuth");

const router = express.Router();

async function requireAdmin(req, res, next) {
  try {
    if (req.auth?.token?.email_verified !== true || (await getUserRole(req.auth?.uid)) !== "admin") {
      return res.status(403).json({ error: "admin-required" });
    }
    return next();
  } catch (error) {
    console.error("[admin-users] admin check failed:", error);
    return res.status(500).json({ error: "admin-check-failed" });
  }
}

router.use(requireFirebaseAuth, requireAdmin);

router.post("/email-verification-statuses", async (req, res) => {
  try {
    const uids = [...new Set(
      (Array.isArray(req.body?.uids) ? req.body.uids : [])
        .map((uid) => String(uid || "").trim())
        .filter(Boolean)
    )].slice(0, 500);

    if (!uids.length) return res.json({ statuses: {} });

    const statuses = {};
    for (let index = 0; index < uids.length; index += 100) {
      const batch = uids.slice(index, index + 100);
      const result = await admin.auth().getUsers(batch.map((uid) => ({ uid })));
      result.users.forEach((record) => {
        statuses[record.uid] = {
          emailVerified: record.emailVerified === true,
          disabled: record.disabled === true,
          providerIds: record.providerData.map((provider) => provider.providerId),
        };
      });
      result.notFound.forEach((identifier) => {
        if (identifier.uid) statuses[identifier.uid] = { notFound: true };
      });
    }

    return res.json({ statuses });
  } catch (error) {
    console.error("[admin-users] email verification lookup failed:", error);
    return res.status(500).json({ error: "email-verification-lookup-failed" });
  }
});

module.exports = router;
