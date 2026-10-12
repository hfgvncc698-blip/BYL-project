// Dedicated expiry worker for installations that do not run cron.worker.js.
require('dotenv').config();
const { db } = require('./utils/db');
const memberships = require('./utils/clubMemberships').createClubMemberships(db);
let busy = false;
let firstPass = true;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const result = await memberships.expireAll();
    if (firstPass || result.failed) console.log('[MEMBERSHIP-EXPIRY]', new Date().toISOString(), JSON.stringify(result));
    firstPass = false;
  }
  catch (error) { console.error('[MEMBERSHIP-EXPIRY]', error.message); }
  finally { busy = false; }
}
tick();
const timer = setInterval(tick, 60000);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { clearInterval(timer); process.exit(0); });
