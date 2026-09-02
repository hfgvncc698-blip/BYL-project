const crypto = require("crypto");
const express = require("express");
const admin = require("../firebaseAdmin");
const { requireFirebaseAuth, hasActiveProfessionalAccess } = require("../utils/firebaseAuth");

const router = express.Router();
const db = admin.firestore();

const cleanText = (value, maxLength = 240) =>
  String(value ?? "").trim().slice(0, maxLength);

const getSessionList = (programme = {}) => {
  const source = programme.sessions ?? programme.seances;
  if (Array.isArray(source)) return source;
  if (source && typeof source === "object") return Object.values(source);
  return [];
};

const getClientName = (client = {}) =>
  cleanText(
    client.fullName ||
      client.displayName ||
      [client.prenom || client.firstName, client.nom || client.lastName].filter(Boolean).join(" ") ||
      client.name ||
      "Client",
    180
  );

const getProgrammeName = (programme = {}) =>
  cleanText(
    programme.nomProgramme ||
      programme.programmeName ||
      programme.programName ||
      programme.title ||
      programme.name ||
      programme.objectifUI ||
      programme.objectif ||
      "Programme",
    220
  );

const calendarStatus = (status) => {
  const normalized = cleanText(status, 40).toLowerCase();
  if (["validée", "validee", "done"].includes(normalized)) return "done";
  if (["manquée", "manquee", "cancelled", "canceled"].includes(normalized)) return "cancelled";
  return "planned";
};

const normalizeStatus = (status) => {
  const normalized = cleanText(status, 40).toLowerCase();
  if (["validée", "validee", "done"].includes(normalized)) return "validée";
  if (["manquée", "manquee", "cancelled", "canceled"].includes(normalized)) return "manquée";
  return "à venir";
};

const isAdminRole = (role) =>
  ["admin", "super_admin", "superadmin"].includes(cleanText(role, 60).toLowerCase());

const clientBelongsToCoach = (client = {}, requester = {}, uid = "") => {
  const coachIds = Array.isArray(client.coachIds) ? client.coachIds.map(String) : [];
  const directIds = [
    client.createdBy,
    client.coachId,
    client.coachUid,
    client.ownerId,
  ].map((value) => cleanText(value, 180));
  const requesterClubId = cleanText(requester.clubId, 180);
  const clientClubId = cleanText(client.clubId, 180);
  return (
    directIds.includes(uid) ||
    coachIds.includes(uid) ||
    Boolean(requesterClubId && clientClubId && requesterClubId === clientClubId)
  );
};

const safeOrigin = (value) => {
  try {
    const url = new URL(cleanText(value, 500));
    return ["http:", "https:"].includes(url.protocol) ? url.origin : "";
  } catch (_) {
    return "";
  }
};

router.post("/", requireFirebaseAuth, async (req, res) => {
  try {
    const requesterUid = req.auth.uid;
    const clientId = cleanText(req.body?.clientId, 180);
    if (!clientId) return res.status(400).json({ error: "client-required" });

    const [requesterSnap, clientSnap] = await Promise.all([
      db.collection("users").doc(requesterUid).get(),
      db.collection("clients").doc(clientId).get(),
    ]);
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    const role = cleanText(requester.role || req.auth.token?.role, 60).toLowerCase();
    const adminRequester = isAdminRole(role) && req.auth?.token?.email_verified === true;
    if (isAdminRole(role) && !adminRequester) {
      return res.status(403).json({ error: "verified-admin-required" });
    }
    if (!adminRequester && !hasActiveProfessionalAccess(requester, req.auth?.token || {})) {
      return res.status(403).json({ error: "professional-access-required" });
    }

    if (!clientSnap.exists) return res.status(404).json({ error: "client-not-found" });

    const client = clientSnap.data() || {};
    if (!adminRequester && !clientBelongsToCoach(client, requester, requesterUid)) {
      return res.status(403).json({ error: "client-forbidden" });
    }

    const requestedCoachId = cleanText(req.body?.coachId, 180);
    const coachId = adminRequester && requestedCoachId ? requestedCoachId : requesterUid;
    const type = req.body?.type === "nutrition" ? "nutrition" : "sport";
    const start = new Date(req.body?.startDateTime);
    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ error: "invalid-start-date" });
    }

    const status = normalizeStatus(req.body?.status);
    const recurrenceGroupId = cleanText(req.body?.recurrenceGroupId, 180);
    const requestedRecurrenceFrequency = cleanText(req.body?.recurrenceFrequency, 20).toLowerCase();
    const recurrenceFrequency = ["daily", "weekly", "monthly", "yearly"].includes(requestedRecurrenceFrequency)
      ? requestedRecurrenceFrequency
      : "none";
    const recurrenceIndex = Math.max(0, Math.min(99, Number(req.body?.recurrenceIndex) || 0));
    const recurrenceCount = Math.max(1, Math.min(100, Number(req.body?.recurrenceCount) || 1));
    let programmeId = "";
    let sessionIndex = null;
    let title = "";
    let description = "";
    let eventType = "sport_session";
    let appointmentKind = "";
    let durationMin = 60;

    if (type === "nutrition") {
      appointmentKind = cleanText(req.body?.nutritionKind || "suivi", 80);
      durationMin = Math.min(240, Math.max(15, Number(req.body?.nutritionDurationMin) || 30));
      const labels = {
        bilan: "Bilan nutrition",
        suivi: "Suivi nutrition",
        mesure: "Prise de mesures",
      };
      title = labels[appointmentKind] || "Rendez-vous nutrition";
      description = cleanText(req.body?.nutritionNotes, 4000);
      eventType = "nutrition_appointment";
    } else {
      programmeId = cleanText(req.body?.programmeId, 180);
      sessionIndex = Number(req.body?.sessionIndex);
      if (!programmeId) return res.status(400).json({ error: "programme-required" });
      if (!Number.isInteger(sessionIndex) || sessionIndex < 0) {
        return res.status(400).json({ error: "invalid-session-index" });
      }

      const programmeSnap = await db
        .collection("clients")
        .doc(clientId)
        .collection("programmes")
        .doc(programmeId)
        .get();
      if (!programmeSnap.exists) return res.status(404).json({ error: "assigned-programme-not-found" });

      const programme = programmeSnap.data() || {};
      const session = getSessionList(programme)[sessionIndex];
      if (!session) return res.status(400).json({ error: "session-not-found" });
      title =
        cleanText(
          session.name || session.title || session.nom || session.sessionTitle || session.titre,
          220
        ) || `Séance ${sessionIndex + 1}`;
      description = getProgrammeName(programme);
    }

    const end = new Date(start.getTime() + durationMin * 60_000);
    const fingerprint = [
      type,
      coachId,
      clientId,
      programmeId,
      sessionIndex ?? "",
      start.toISOString(),
      appointmentKind,
    ].join("|");
    const deterministicSessionId = `planned_${crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 32)}`;
    const sessionRef = db.collection("sessions").doc(deterministicSessionId);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const startTimestamp = admin.firestore.Timestamp.fromDate(start);
    const endTimestamp = admin.firestore.Timestamp.fromDate(end);
    const clientName = getClientName(client);
    const origin = safeOrigin(req.body?.appOrigin);
    const deepLink =
      type === "nutrition"
        ? `${origin}/nutrition`
        : `${origin}/clients/${encodeURIComponent(clientId)}/programmes/${encodeURIComponent(programmeId)}`;

    let sessionId = deterministicSessionId;
    let created = false;
    await db.runTransaction(async (transaction) => {
      const rootPayload = {
        clientId,
        clientName,
        title,
        start: startTimestamp,
        end: endTimestamp,
        status,
        visibility: "both",
        coachId,
        createdBy: requesterUid,
        createdAt: now,
        updatedAt: now,
      };
      if (recurrenceGroupId && recurrenceCount > 1) {
        Object.assign(rootPayload, {
          recurrenceGroupId,
          recurrenceFrequency,
          recurrenceIndex,
          recurrenceCount,
        });
      }
      if (type === "nutrition") {
        Object.assign(rootPayload, {
          type: "nutrition_appointment",
          eventType,
          appointmentKind,
          durationMin,
          description,
          notes: description,
        });
      } else {
        Object.assign(rootPayload, { programmeId, sessionIndex });
      }

      const [existing, clientSessions] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(db.collection("sessions").where("clientId", "==", clientId).limit(500)),
      ]);
      const matchingLegacySession = clientSessions.docs.find((candidate) => {
        if (candidate.id === deterministicSessionId) return false;
        const data = candidate.data() || {};
        const candidateStart = data.start?.toDate?.();
        const sameStart =
          candidateStart instanceof Date &&
          Math.abs(candidateStart.getTime() - start.getTime()) < 60_000;
        const sameCoach = cleanText(data.coachId || data.createdBy, 180) === coachId;
        if (!sameStart || !sameCoach) return false;
        if (type === "nutrition") {
          return (
            cleanText(data.eventType || data.type, 80) === "nutrition_appointment" &&
            cleanText(data.appointmentKind || "suivi", 80) === appointmentKind
          );
        }
        return (
          cleanText(data.programmeId || data.programId, 180) === programmeId &&
          Number(data.sessionIndex) === sessionIndex
        );
      });
      const duplicateSession = existing.exists ? existing : matchingLegacySession;
      if (duplicateSession) {
        sessionId = duplicateSession.id;
      } else {
        created = true;
        transaction.create(sessionRef, rootPayload);
      }

      const calendarRef = db
        .collection("clients")
        .doc(clientId)
        .collection("calendarEvents")
        .doc(sessionId);
      const calendarPayload = {
        title: type === "nutrition" ? title : `${title} - ${description}`,
        start: startTimestamp,
        end: endTimestamp,
        startAt: startTimestamp,
        endAt: endTimestamp,
        status: calendarStatus(status),
        description: description || (type === "nutrition" ? "Rendez-vous nutrition" : ""),
        location: "",
        deepLink,
        programId: programmeId,
        sessionId,
        sessionIndex,
        eventType,
        appointmentKind,
        durationMin: type === "nutrition" ? durationMin : null,
        updatedAt: now,
      };
      if (recurrenceGroupId && recurrenceCount > 1) {
        Object.assign(calendarPayload, {
          recurrenceGroupId,
          recurrenceFrequency,
          recurrenceIndex,
          recurrenceCount,
        });
      }
      if (!duplicateSession) calendarPayload.createdAt = now;

      if (duplicateSession) transaction.set(calendarRef, calendarPayload, { merge: true });
      else transaction.create(calendarRef, calendarPayload);
    });

    return res.status(created ? 201 : 200).json({
      ok: true,
      id: sessionId,
      created,
      duplicate: !created,
    });
  } catch (error) {
    console.error("[coach-sessions] create failed:", error);
    return res.status(500).json({
      error: "session-create-failed",
      message: process.env.NODE_ENV === "production" ? undefined : error?.message,
    });
  }
});

module.exports = router;
