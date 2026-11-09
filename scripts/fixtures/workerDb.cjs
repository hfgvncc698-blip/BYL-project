// The REST fallback requests credentials even on the emulator. Use its reserved
// local owner identity, after the Lot 1 guard checks the exact project and hosts.
const { projectId } = require('../measureFirebaseLot1.cjs');
const { Firestore, FieldValue } = require('../../backend/node_modules/@google-cloud/firestore');
const gax = require('node:module').createRequire(require.resolve('../../backend/node_modules/google-gax'));
const { OAuth2Client } = gax('google-auth-library');
const authClient = new OAuth2Client();
authClient.setCredentials({access_token:'owner'});
const db = new Firestore({projectId, preferRest:true, authClient});
module.exports = { db, FieldValue };
