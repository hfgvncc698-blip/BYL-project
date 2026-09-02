import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  findNextClientHabit,
  findNextWorkoutRhythm,
  hasHabitScheduleConflict,
} from "./coachScheduleHabits";

export async function buildSessionScheduleSuggestion({
  isCoachContext,
  clientId,
  currentStart,
  completionDates,
  sessionsPerWeek,
  details,
}) {
  if (isCoachContext) {
    const snapshot = await getDocs(query(collection(db, "sessions"), where("clientId", "==", clientId), limit(80)));
    const events = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const habit = findNextClientHabit(events, { clientId, currentStart, nowMs: Date.now() });
    if (!habit || hasHabitScheduleConflict(events, habit)) return null;
    return { ...details, target: habit.target, source: "coach_habit" };
  }

  const snapshot = await getDocs(query(collection(db, "clients", clientId, "calendarEvents"), limit(80)));
  const events = snapshot.docs.map((item) => ({ id: item.id, clientId, ...item.data() }));
  const rhythm = findNextWorkoutRhythm(completionDates, { currentStart, sessionsPerWeek });
  const candidate = rhythm ? { ...rhythm, clientId } : null;
  if (!candidate || hasHabitScheduleConflict(events, candidate)) return null;
  return { ...details, target: rhythm.target, source: "client_rhythm" };
}

export async function saveSessionScheduleSuggestion({
  suggestion,
  isCoachContext,
  clientId,
  programId,
  durationMin,
  actingCoachId,
  userId,
}) {
  const start = suggestion.target;
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  const title = `${suggestion.clientName} - ${suggestion.programTitle} - ${suggestion.nextSessionTitle}`;
  const rootRef = isCoachContext ? doc(collection(db, "sessions")) : null;
  const clientEventRef = rootRef || doc(collection(db, "clients", clientId, "calendarEvents"));
  const eventId = clientEventRef.id;
  const commonData = {
    title,
    sessionTitle: suggestion.nextSessionTitle,
    start: Timestamp.fromDate(start),
    end: Timestamp.fromDate(end),
    startAt: Timestamp.fromDate(start),
    endAt: Timestamp.fromDate(end),
    durationMin,
    status: "à venir",
    eventType: "sport_session",
    type: "sport_session",
    clientId,
    clientName: suggestion.clientName,
    programmeId: programId,
    programId,
    sessionIndex: suggestion.nextSessionIndex,
    learnedScheduleSuggestion: true,
    learnedScheduleSource: suggestion.source,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const batch = writeBatch(db);
  if (rootRef) {
    batch.set(rootRef, { ...commonData, visibility: "both", coachId: actingCoachId || userId || null, createdBy: actingCoachId || userId || null });
    batch.set(doc(db, "clients", clientId, "calendarEvents", eventId), { ...commonData, visibility: "both", rootSessionId: eventId });
  } else {
    batch.set(clientEventRef, { ...commonData, visibility: "client", clientPrivate: true });
  }
  await batch.commit();
}
