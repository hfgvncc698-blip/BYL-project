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

async function main() {
  const stamp = Date.now();
  const email = `byl.club.test.${stamp}@example.com`;
  const password = "testbyl2026a";
  const firstName = "ClubTest";
  const lastName = `BYL${String(stamp).slice(-5)}`;

  const user = await admin.auth().createUser({
    email,
    password,
    displayName: `${firstName} ${lastName}`,
    emailVerified: true,
  });

  const now = admin.firestore.FieldValue.serverTimestamp();
  const clubId = user.uid;
  const proAccess = {
    packageKey: "club",
    packageTier: "club",
    clientLimit: 300,
    proLimit: 8,
    modules: { sport: true, nutrition: true, club: true },
  };

  await db.collection("users").doc(user.uid).set(
    {
      uid: user.uid,
      email,
      firstName,
      lastName,
      birthDate: "1990-01-15",
      role: "coach",
      accountType: "club_owner",
      clubId,
      clubRole: "owner",
      clubName: `${firstName} ${lastName}`,
      subscriptionStatus: "trialing",
      trialStartAt: now,
      trialEndsAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
      packageKey: "club",
      packageTier: "club",
      clientLimit: 300,
      proLimit: 8,
      modules: proAccess.modules,
      proAccess,
      settings: { defaultLanguage: "fr" },
      createdAt: now,
      updatedAt: now,
      testAccount: true,
      testRun: "club-dashboard-browser-test",
    },
    { merge: true }
  );

  await db.collection("clubs").doc(clubId).set(
    {
      id: clubId,
      name: `${firstName} ${lastName}`,
      ownerUid: user.uid,
      planKey: "club",
      planTier: "club",
      proLimit: 8,
      clientLimit: 300,
      testAccount: true,
      testRun: "club-dashboard-browser-test",
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  await db.collection("clubs").doc(clubId).collection("members").doc(user.uid).set(
    {
      uid: user.uid,
      role: "owner",
      email,
      firstName,
      lastName,
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  console.log(JSON.stringify({ uid: user.uid, email, password, clubId }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
