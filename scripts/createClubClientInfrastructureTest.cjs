require("../backend/node_modules/dotenv").config({ path: "backend/.env" });

const admin = require("../backend/node_modules/firebase-admin");
const path = require("path");
const fs = require("fs");

if (!admin.apps.length) {
  const rootKey = path.join(process.cwd(), "boost-your-life-f6b3e-firebase-adminsdk-fbsvc-f200c38fb3.json");
  const backendKey = path.join(process.cwd(), "backend/serviceAccountKey.json");
  const serviceAccount = require(fs.existsSync(rootKey) ? rootKey : backendKey);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const CLUB_UID = process.argv[2] || "zDK3ApGRnMSOYOlQs33y2EeFF1G2";
const PRO_UID = process.argv[3] || "TQ3uZKEDgOMv8ivYv0DTJfj51EL2";
const PASSWORD = "testbyl2026c";

function tsPlusHours(hours) {
  return Timestamp.fromDate(new Date(Date.now() + hours * 60 * 60 * 1000));
}

function displayName(data, fallback = "") {
  return [data?.firstName || data?.prenom, data?.lastName || data?.nom].filter(Boolean).join(" ").trim() || data?.name || fallback;
}

async function readDoc(collectionName, id, label) {
  const snap = await db.collection(collectionName).doc(id).get();
  if (!snap.exists) throw new Error(`${label} introuvable: ${collectionName}/${id}`);
  return { id: snap.id, ...snap.data() };
}

async function createOrReuseAuthUser(email, payload) {
  try {
    const existing = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(existing.uid, {
      password: PASSWORD,
      emailVerified: true,
      disabled: false,
      displayName: payload.displayName,
    });
    return { user: existing, created: false };
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }

  const user = await admin.auth().createUser({
    email,
    password: PASSWORD,
    displayName: payload.displayName,
    emailVerified: true,
  });
  return { user, created: true };
}

async function main() {
  const [club, pro] = await Promise.all([
    readDoc("users", CLUB_UID, "Club test"),
    readDoc("users", PRO_UID, "Pro test"),
  ]);

  if (pro.clubId !== CLUB_UID) {
    throw new Error(`Le pro ${PRO_UID} n'est pas rattaché au club ${CLUB_UID}. clubId actuel: ${pro.clubId || "vide"}`);
  }

  const stamp = Date.now();
  const firstName = "ClientTest";
  const lastName = `BYL${String(stamp).slice(-5)}`;
  const email = `byl.client.test.${stamp}@example.com`;
  const fullName = `${firstName} ${lastName}`;
  const now = FieldValue.serverTimestamp();
  const clubName = club.clubName || club.name || displayName(club, "Club test");
  const proName = displayName(pro, pro.email || "Pro test");

  const { user: clientAuth, created } = await createOrReuseAuthUser(email, { displayName: fullName });
  const clientId = clientAuth.uid;

  const clientPayload = {
    uid: clientId,
    linkedUserId: clientId,
    email,
    emailLower: email,
    firstName,
    lastName,
    prenom: firstName,
    nom: lastName,
    displayName: fullName,
    telephone: "+33600000000",
    sexe: "Homme",
    age: "31",
    naissance: "1995-05-11",
    taille: "178",
    poids: "78",
    heightCm: 178,
    weightKg: 78,
    objectif: "Remise en forme test club",
    niveau: "Intermédiaire",
    langue: "fr",
    settings: {
      defaultLanguage: "fr",
      langCode: "fr",
      units: { height: "cm", weight: "kg" },
    },
    createdBy: PRO_UID,
    coachId: PRO_UID,
    coachIds: [PRO_UID],
    clubId: CLUB_UID,
    clubName,
    completionPercent: 25,
    lastVisitAt: tsPlusHours(-4),
    lastActivityAt: now,
    creeLe: now,
    createdAt: now,
    updatedAt: now,
    testAccount: true,
    testRun: "club-dashboard-browser-test",
  };

  await db.collection("users").doc(clientId).set(
    {
      uid: clientId,
      email,
      emailLower: email,
      firstName,
      lastName,
      displayName: fullName,
      role: "particulier",
      linkedClientId: clientId,
      preferredLang: "fr",
      settings: { defaultLanguage: "fr", langCode: "fr" },
      createdAt: now,
      updatedAt: now,
      testAccount: true,
      testRun: "club-dashboard-browser-test",
    },
    { merge: true }
  );

  await db.collection("clients").doc(clientId).set(clientPayload, { merge: true });

  const baseProgramRef = db.collection("programmes").doc();
  const sessions = [
    {
      id: "session-1",
      name: "Séance test club 1",
      title: "Séance test club 1",
      dayOffset: 0,
      exercises: [
        {
          id: "squat-test",
          name: "Squat poids du corps",
          sets: 3,
          reps: 12,
          rest: 60,
        },
      ],
    },
    {
      id: "session-2",
      name: "Séance test club 2",
      title: "Séance test club 2",
      dayOffset: 2,
      exercises: [
        {
          id: "gainage-test",
          name: "Gainage",
          sets: 3,
          duration: 45,
          rest: 45,
        },
      ],
    },
  ];

  await baseProgramRef.set({
    id: baseProgramRef.id,
    nomProgramme: "Programme test infrastructure club",
    title: "Programme test infrastructure club",
    objectif: "Vérifier la remontée club",
    objectifUI: "remise_en_forme",
    sessions,
    createdBy: PRO_UID,
    createdByName: proName,
    clubId: CLUB_UID,
    clubName,
    assignedTo: clientId,
    assignedClients: [clientId],
    assignedClientIds: [clientId],
    createdAt: now,
    updatedAt: now,
    assignedAt: now,
    testAccount: true,
    testRun: "club-dashboard-browser-test",
  });

  const assignedRef = db.collection("clients").doc(clientId).collection("programmes").doc();
  await assignedRef.set({
    id: assignedRef.id,
    nomProgramme: "Programme assigné test club",
    name: "Programme assigné test club",
    programId: baseProgramRef.id,
    fromTemplateId: baseProgramRef.id,
    templateId: baseProgramRef.id,
    origin: "club-infrastructure-test",
    origine: "club-infrastructure-test",
    clientId,
    clientNom: fullName,
    sessions,
    seances: sessions,
    objectif: "Vérifier le parcours pro -> client -> club",
    objectifUI: "remise_en_forme",
    totalSessions: sessions.length,
    nbSeances: sessions.length,
    coachId: PRO_UID,
    createdBy: PRO_UID,
    assignedBy: PRO_UID,
    clubId: CLUB_UID,
    clubName,
    progress: 50,
    completionPercent: 50,
    status: "active",
    assignedAt: now,
    createdAt: now,
    updatedAt: now,
    testAccount: true,
    testRun: "club-dashboard-browser-test",
  });

  await db.collection("clients").doc(clientId).update({
    currentProgramme: assignedRef.id,
    programmes: FieldValue.arrayUnion(assignedRef.id),
    programmeIds: FieldValue.arrayUnion(assignedRef.id),
    updatedAt: now,
  });

  const sessionDoneRef = db
    .collection("clients")
    .doc(clientId)
    .collection("programmes")
    .doc(assignedRef.id)
    .collection("sessionsEffectuees")
    .doc("session-1");

  await sessionDoneRef.set({
    sessionIndex: 0,
    completedAt: tsPlusHours(-2),
    notes: "Séance de test terminée pour vérifier la progression club.",
    durationMinutes: 32,
    createdAt: now,
    testAccount: true,
    testRun: "club-dashboard-browser-test",
  });

  const nutritionRef = db.collection("clients").doc(clientId).collection("nutrition_assessments").doc();
  await nutritionRef.set({
    id: nutritionRef.id,
    title: "Bilan nutrition test club",
    status: "final",
    validated: true,
    coachId: PRO_UID,
    createdBy: PRO_UID,
    clubId: CLUB_UID,
    clubName,
    inputs: {
      objectif: "Rééquilibrage alimentaire",
      objective: "Rééquilibrage alimentaire",
      nutritionValidated: true,
    },
    ration: {
      calories: 2250,
      protein: 145,
      carbs: 250,
      fats: 70,
    },
    clientShare: {
      enabled: true,
      sections: {
        summary: true,
        ration: true,
        menu: true,
        recipes: false,
        shoppingList: true,
        adviceSheets: false,
      },
      sharedAt: now,
      sharedBy: PRO_UID,
      coachName: proName,
      snapshot: {
        menuDays: [
          {
            dayLabel: "Jour test",
            meals: [
              {
                name: "Petit-déjeuner",
                items: [{ label: "Flocons d’avoine", qty: 70, unit: "g" }],
              },
              {
                name: "Déjeuner",
                items: [{ label: "Poulet riz légumes", qty: 1, unit: "portion" }],
              },
            ],
          },
        ],
        shoppingList: [
          {
            title: "Liste test",
            items: [
              { label: "Flocons d’avoine", qty: 500, unit: "g" },
              { label: "Blanc de poulet", qty: 600, unit: "g" },
            ],
          },
        ],
        patientNote: { text: "Plan nutrition test partagé pour vérifier l’affichage client et club." },
      },
    },
    createdAt: now,
    updatedAt: now,
    testAccount: true,
    testRun: "club-dashboard-browser-test",
  });

  const [clientSnap, assignedSnap, nutritionSnap] = await Promise.all([
    db.collection("clients").where("clubId", "==", CLUB_UID).get(),
    db.collection("clients").doc(clientId).collection("programmes").get(),
    db.collection("clients").doc(clientId).collection("nutrition_assessments").get(),
  ]);

  const output = {
    ok: true,
    createdAuthUser: created,
    club: { uid: CLUB_UID, name: clubName },
    pro: { uid: PRO_UID, name: proName, email: pro.email },
    client: { uid: clientId, email, password: PASSWORD, name: fullName },
    paths: {
      user: `users/${clientId}`,
      client: `clients/${clientId}`,
      baseProgram: `programmes/${baseProgramRef.id}`,
      assignedProgram: `clients/${clientId}/programmes/${assignedRef.id}`,
      nutritionAssessment: `clients/${clientId}/nutrition_assessments/${nutritionRef.id}`,
      completedSession: `clients/${clientId}/programmes/${assignedRef.id}/sessionsEffectuees/session-1`,
    },
    verification: {
      clubClients: clientSnap.size,
      clientAssignedPrograms: assignedSnap.size,
      clientNutritionAssessments: nutritionSnap.size,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
