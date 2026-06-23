const appAdmin = require("firebase-admin/app");
const firestoreAdmin = require("firebase-admin/firestore");
const authAdmin = require("firebase-admin/auth");
const storageAdmin = require("firebase-admin/storage");

function firestore() {
  return firestoreAdmin.getFirestore();
}

firestore.FieldValue = firestoreAdmin.FieldValue;
firestore.Timestamp = firestoreAdmin.Timestamp;

function auth() {
  return authAdmin.getAuth();
}

function storage() {
  return storageAdmin.getStorage();
}

const admin = {
  initializeApp: appAdmin.initializeApp,
  app: appAdmin.getApp,
  getApp: appAdmin.getApp,
  getApps: appAdmin.getApps,
  deleteApp: appAdmin.deleteApp,
  credential: {
    applicationDefault: appAdmin.applicationDefault,
    cert: appAdmin.cert,
    refreshToken: appAdmin.refreshToken,
  },
  firestore,
  auth,
  storage,
};

Object.defineProperty(admin, "apps", {
  enumerable: true,
  get: appAdmin.getApps,
});

module.exports = admin;
