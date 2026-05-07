import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { resolveClientSnapshotForUser } from "./clientResolver";

const DEBUG_STORAGE_KEY = "BYL_FIRESTORE_DIAGNOSTICS";

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

export function isFirestoreDiagnosticsEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    return (
      params.get("debugFirestore") === "1" ||
      params.get("bylDebug") === "firestore" ||
      window.localStorage.getItem(DEBUG_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function summarizeDoc(snap) {
  if (!snap?.exists?.()) return { exists: false };
  const data = snap.data() || {};
  return {
    exists: true,
    id: snap.id,
    email: data.email || null,
    emailLower: data.emailLower || null,
    uid: data.uid || null,
    linkedUserId: data.linkedUserId || null,
    linkedClientId: data.linkedClientId || null,
    role: data.role || null,
    createdBy: data.createdBy || null,
    coachId: data.coachId || null,
  };
}

function summarizeQuery(snap) {
  return {
    size: snap?.size || 0,
    ids: (snap?.docs || []).slice(0, 20).map((docSnap) => docSnap.id),
  };
}

async function attempt(label, run, summarize = (value) => value) {
  const startedAt = performance.now();
  try {
    const value = await run();
    return {
      label,
      ok: true,
      ms: Math.round(performance.now() - startedAt),
      ...summarize(value),
    };
  } catch (error) {
    return {
      label,
      ok: false,
      ms: Math.round(performance.now() - startedAt),
      code: error?.code || null,
      message: error?.message || String(error),
    };
  }
}

export async function runClientDataAccessDiagnostic(user, context = {}) {
  if (!user?.uid || !isFirestoreDiagnosticsEnabled()) return null;

  const email = String(user.email || "").trim();
  const emailLower = normalizeEmail(email);
  const attempts = [];

  attempts.push(
    await attempt("users/{uid}", () => getDoc(doc(db, "users", user.uid)), summarizeDoc)
  );

  attempts.push(
    await attempt("clients/{uid}", () => getDoc(doc(db, "clients", user.uid)), summarizeDoc)
  );

  if (user.linkedClientId) {
    attempts.push(
      await attempt(
        "clients/{linkedClientId}",
        () => getDoc(doc(db, "clients", user.linkedClientId)),
        summarizeDoc
      )
    );
  }

  if (emailLower) {
    attempts.push(
      await attempt(
        "clients where emailLower",
        () => getDocs(query(collection(db, "clients"), where("emailLower", "==", emailLower), limit(10))),
        summarizeQuery
      )
    );
  }

  if (email) {
    attempts.push(
      await attempt(
        "clients where email",
        () => getDocs(query(collection(db, "clients"), where("email", "==", email), limit(20))),
        summarizeQuery
      )
    );
  }

  attempts.push(
    await attempt(
      "clients where linkedUserId",
      () => getDocs(query(collection(db, "clients"), where("linkedUserId", "==", user.uid), limit(10))),
      summarizeQuery
    )
  );

  attempts.push(
    await attempt(
      "clients where uid",
      () => getDocs(query(collection(db, "clients"), where("uid", "==", user.uid), limit(10))),
      summarizeQuery
    )
  );

  let resolvedClientId = context.clientId || null;
  attempts.push(
    await attempt(
      "resolveClientSnapshotForUser",
      async () => {
        const snap = await resolveClientSnapshotForUser(user, {
          logPrefix: "FirestoreDiagnostics",
          programmesLimit: 100,
          nutritionLimit: 50,
        });
        resolvedClientId = snap?.id || resolvedClientId;
        return snap;
      },
      summarizeDoc
    )
  );

  if (resolvedClientId) {
    attempts.push(
      await attempt(
        "clients/{resolved}/programmes",
        () => getDocs(query(collection(db, "clients", resolvedClientId, "programmes"), limit(100))),
        summarizeQuery
      )
    );
    attempts.push(
      await attempt(
        "clients/{resolved}/nutrition_assessments",
        () => getDocs(query(collection(db, "clients", resolvedClientId, "nutrition_assessments"), limit(50))),
        summarizeQuery
      )
    );
    attempts.push(
      await attempt(
        "clients/{resolved}/measurements",
        () => getDocs(query(collection(db, "clients", resolvedClientId, "measurements"), limit(20))),
        summarizeQuery
      )
    );
    attempts.push(
      await attempt(
        "sessions where clientId = resolved",
        () => getDocs(query(collection(db, "sessions"), where("clientId", "==", resolvedClientId), limit(50))),
        summarizeQuery
      )
    );
  }

  attempts.push(
    await attempt(
      "sessions where clientId = auth.uid",
      () => getDocs(query(collection(db, "sessions"), where("clientId", "==", user.uid), limit(50))),
      summarizeQuery
    )
  );

  attempts.push(
    await attempt(
      "premium programmes",
      () => getDocs(query(collection(db, "programmes"), where("origine", "==", "premium"), limit(20))),
      summarizeQuery
    )
  );

  const report = {
    source: context.source || "unknown",
    generatedAt: new Date().toISOString(),
    auth: {
      uid: user.uid,
      email,
      emailLower,
      linkedClientId: user.linkedClientId || null,
      role: user.role || null,
    },
    resolvedClientId,
    attempts,
  };

  if (typeof window !== "undefined") {
    window.__BYL_FIRESTORE_LAST_DIAG__ = report;
    console.groupCollapsed(`[BYL Firestore Diagnostic] ${report.source}`);
    console.table(
      attempts.map((item) => ({
        label: item.label,
        ok: item.ok,
        size: item.size ?? "",
        id: item.id ?? "",
        ids: Array.isArray(item.ids) ? item.ids.join(", ") : "",
        code: item.code || "",
        ms: item.ms,
      }))
    );
    console.log(report);
    console.groupEnd();
  }

  return report;
}
