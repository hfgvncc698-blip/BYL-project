// utils/db.js
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const path = require('path');

/**
 * Utilise ADC si dispo (GOOGLE_APPLICATION_CREDENTIALS),
 * sinon retombe sur le serviceAccountKey.json local.
 */
const saPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, '..', 'serviceAccountKey.json');

const db = new Firestore({
  // projectId: process.env.GOOGLE_CLOUD_PROJECT, // optionnel si le JSON a le project_id
  keyFilename: saPath,
  preferRest: true, // <= évite gRPC (contourne l'erreur "dns: firestore.googleapis.com:443")
  retrySettings: {
    retryCodes: [14, 4, 2], // UNAVAILABLE, DEADLINE_EXCEEDED, UNKNOWN
    backoffSettings: {
      initialRetryDelayMillis: 500,
      retryDelayMultiplier: 1.7,
      maxRetryDelayMillis: 8000,
      initialRpcTimeoutMillis: 10000,
      rpcTimeoutMultiplier: 1.5,
      maxRpcTimeoutMillis: 30000,
      totalTimeoutMillis: 60000,
    },
  },
});

module.exports = { db, FieldValue };

