const express = require("express");
const { gzip } = require("node:zlib");
const { promisify } = require("node:util");
const admin = require("../firebaseAdmin");
const { requireFirebaseAuth, hasActiveProfessionalAccess } = require("../utils/firebaseAuth");
const programListSummary = require("../utils/programListSummary");
const compress = promisify(gzip);
const router = express.Router();

const versionOf = snapshot => `${snapshot.updateTime.seconds}:${snapshot.updateTime.nanoseconds}`;

// Compare Firestore's server updateTime, not optional application timestamps.
// Unchanged documents stay complete on the client; every changed document is
// returned in full. The projection also detects additions and deletions.
router.post("/dashboard-templates", requireFirebaseAuth, async (req, res) => {
  try {
    const uid = req.auth.uid;
    const requesterSnap = await admin.firestore().collection("users").doc(uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() : {};
    if (!hasActiveProfessionalAccess(requester, req.auth.token)) {
      return res.status(403).json({ error: "professional-access-required" });
    }
    const coachId = String(req.body?.coachId || uid).trim();
    const verifiedAdmin = requester.role === "admin" && req.auth.token.email_verified === true;
    if (!coachId || coachId.includes("/") || (coachId !== uid && !verifiedAdmin)) {
      return res.status(403).json({ error: "forbidden" });
    }
    const db = admin.firestore();
    const summaries = req.body?.summaries === true;
    // Firestore projects metadata on the server: no exercise bodies cross the
    // database connection for current templates with a stored session count.
    const snapshot = await db.collection("programmes").where("createdBy", "==", coachId).limit(200)
      .select(...(summaries ? programListSummary.fields : [])).get();
    const readVersion = document => summaries ? `summary:${versionOf(document)}` : versionOf(document);
    const knownVersions = req.body?.knownVersions || {};
    const changed = snapshot.docs.filter(document => knownVersions[document.id] !== readVersion(document));
    const needsFullDocument = changed.filter(document =>
      !summaries || programListSummary.sessionCount(document.data()) == null);
    const fullDocuments = needsFullDocument.length
      ? await db.getAll(...needsFullDocument.map(document => document.ref)) : [];
    const fullById = new Map(fullDocuments.map(document => [document.id, document]));
    const documents = changed.map(document => {
      if (!summaries || programListSummary.sessionCount(document.data()) == null) return fullById.get(document.id);
      const data = document.data();
      return {
        id: document.id, exists: true, updateTime: document.updateTime,
        data: () => ({ ...data, sessions: Array.from({length: programListSummary.sessionCount(data)}, () => ({})) }),
      };
    }).filter(Boolean);
    // Recheck ownership after the projection in case a document was transferred.
    const programs = documents.filter(document => document.exists && document.data().createdBy === coachId)
      .map(document => ({ ...(summaries ? programListSummary(document.data()) : document.data()), id: document.id, __dashboardReadVersion: readVersion(document) }));
    const unchanged = snapshot.docs.filter(document => knownVersions[document.id] === readVersion(document)).map(document => document.id);
    const serialized = JSON.stringify({ programs, unchanged }, function (key, value) {
      const original = this[key];
      // Match web SDK Timestamp.toJSON(), including nested exercise dates.
      return original && typeof original.toDate === "function" && typeof original.seconds === "number"
        ? { seconds: original.seconds, nanoseconds: original.nanoseconds || 0 }
        : value;
    });
    res.set("Cache-Control", "private, no-store");
    res.vary("Accept-Encoding");
    res.type("application/json");
    if (req.acceptsEncodings("gzip")) {
      const body = await compress(serialized);
      res.set("Content-Encoding", "gzip");
      return res.send(body);
    }
    return res.send(serialized);
  } catch (error) {
    console.error("[coach-program-read] failed", error?.message);
    return res.status(500).json({ error: "program-read-failed" });
  }
});

module.exports = router;
