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

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    throw new Error("Usage: node scripts/setTestUserPassword.cjs <email> <password>");
  }
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().updateUser(user.uid, { password, emailVerified: true, disabled: false });
  await admin.firestore().collection("users").doc(user.uid).set(
    {
      testAccount: true,
      testRun: "club-dashboard-browser-test",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  console.log(JSON.stringify({ uid: user.uid, email }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
