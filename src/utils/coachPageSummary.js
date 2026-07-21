import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

const COACH_PAGE_SUMMARY_VERSION = 1;
const SUMMARY_COLLECTION = "coachPageSummaries";

const cleanPart = (value = "") =>
  String(value || "default")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 120);

const getSummaryDocId = (coachUid = "", pageKey = "") =>
  `${cleanPart(coachUid || "coach")}__${cleanPart(pageKey || "page")}`;

const sanitizeForFirestore = (value) => {
  try {
    return JSON.parse(JSON.stringify(value || {}));
  } catch {
    return {};
  }
};

const toMillis = (value) =>
  value?.toMillis?.() ||
  value?.toDate?.()?.getTime?.() ||
  (value?.seconds ? Number(value.seconds) * 1000 : 0) ||
  (typeof value === "number" ? (value > 1e12 ? value : value * 1000) : 0) ||
  (typeof value === "string" ? Date.parse(value) || 0 : 0);

export async function readCoachPageSummary({ coachUid, pageKey, ttlMs } = {}) {
  if (!coachUid || !pageKey) return null;
  const snap = await getDoc(doc(db, SUMMARY_COLLECTION, getSummaryDocId(coachUid, pageKey)));
  if (!snap.exists()) return null;

  const payload = snap.data() || {};
  if (payload.version !== COACH_PAGE_SUMMARY_VERSION) return null;
  if (payload.coachUid !== coachUid || payload.pageKey !== pageKey) return null;
  if (Number.isFinite(ttlMs) && ttlMs > 0) {
    const updatedMs = toMillis(payload.updatedAt) || Number(payload.updatedAtMs || 0) || 0;
    if (updatedMs && Date.now() - updatedMs > ttlMs) return null;
  }

  return payload.data || null;
}

export async function writeCoachPageSummary({ coachUid, pageKey, data } = {}) {
  if (!coachUid || !pageKey) return;
  await setDoc(
    doc(db, SUMMARY_COLLECTION, getSummaryDocId(coachUid, pageKey)),
    {
      version: COACH_PAGE_SUMMARY_VERSION,
      coachUid,
      pageKey,
      data: sanitizeForFirestore(data),
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    },
    { merge: true }
  );
}
