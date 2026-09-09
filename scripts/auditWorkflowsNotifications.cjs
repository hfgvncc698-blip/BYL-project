// Extract real Firestore notification handlers and guards; external delivery,
// Firebase and Auth are replaced by synthetic, in-memory dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
function block(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, 'notification source markers must exist');
  return source.slice(first, last);
}
function scenario({ client = {}, failDelivery = false } = {}) {
  const sent = [], events = [];
  const profile = { email: 'client@example.invalid', prenom: 'Synthetic', ...client };
  const stored = {};
  const update = async patch => {
    for (const [key, value] of Object.entries(patch)) {
      const fields = key.split('.'); let parent = stored;
      for (const field of fields.slice(0, -1)) parent = parent[field] ||= {};
      parent[fields.at(-1)] = value;
    }
  };
  const ref = { set: update, update };
  const mail = async payload => {
    sent.push(payload);
    if (failDelivery) throw new Error('synthetic-SMTP-failure');
    return { messageId: 'synthetic-message' };
  };
  const template = () => ({ subject: 'Synthetic subject', html: '<p>Synthetic</p>', text: 'Synthetic body' });
  const capture = (options, handler) => ({ options, handler });
  const context = vm.createContext({
    exports: {}, onDocumentCreated: capture, onDocumentWritten: capture,
    SMTP_HOST: '', SMTP_PORT: '', SMTP_SECURE: '', SMTP_USER: '', SMTP_PASS: '', APP_BASE_URL: '',
    db: { doc: () => ({ get: async () => ({ exists: true, data: () => profile }) }), runTransaction: async work => work({ get: async () => ({ exists: true, data: () => stored }), update: (_ref, patch) => update(patch) }) },
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'synthetic-timestamp' }, Timestamp: { fromDate: date => date } } },
    getAuth: () => ({ getUser: async () => ({ displayName: 'Synthetic coach' }) }),
    safeTrim: value => String(value || '').trim(), normalizeSpaces: value => value.trim(),
    getClientLngFromDoc: () => 'fr', pickProgramName: () => 'Synthetic program', pickNutritionPlanName: () => 'Synthetic nutrition',
    getCoachUidFromNutritionShare: () => 'coach', getBaseUrlFromSecret: () => 'https://example.invalid',
    isPremiumProgram: data => data.premium === true, readActiveWeeks: () => 4, addDays: date => date,
    lifecycleCopy: template, sendLifecycleEmail: mail, sendTrackedTemplateEmail: mail,
    programViewerUrl: () => 'https://example.invalid/program',
    recordEmailEvent: async event => { events.push(event); }, emailDeliveryEvent: () => ({ status: 'sent' }),
    buildProgramAssignedTemplate: template, buildNutritionAssignedTemplate: template, buildLifecycleTemplate: template,
    suspendAutomaticEmailDelivery: async () => false,
    console: { log() {}, error() {} },
  });
  vm.runInContext(block('function sentField(name)', 'async function recordEmailEvent(event)'), context);
  vm.runInContext(block('async function markLifecycleEmail(', 'function countProgramSessions('), context);
  vm.runInContext(block('function hasSharedNutritionContent(', 'function pickNutritionPlanName('), context);
  vm.runInContext(block('exports.onProgramAssigned =', '/* =======================================================================\n * 5)'), context);
  vm.runInContext(block('exports.onNutritionProgramAttached =', '/* =======================================================================\n * 6)'), context);
  return { sent, events, stored,
    programOptions: context.exports.onProgramAssigned.options,
    program: data => context.exports.onProgramAssigned.handler({ params: { clientId: 'client', programmeId: 'program' }, data: { data: () => data, ref } }),
    nutrition: (data, before = null) => context.exports.onNutritionProgramAttached.handler({ params: { clientId: 'client', assessmentId: 'assessment' }, data: { before: { exists: !!before, data: () => before }, after: { exists: !!data, data: () => data, ref } } }),
  };
}
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
(async () => {
  await test('program assigned trigger is on creation of the client copy', async () => {
    assert.equal(scenario().programOptions.document, 'clients/{clientId}/programmes/{programmeId}');
  });
  await test('program notification sends once on trigger replay', async () => {
    const s = scenario(); await s.program({ assignedBy: 'coach' }); await s.program({ assignedBy: 'coach' });
    assert.equal(s.sent.length, 1); assert.equal(s.events[0].status, 'sent');
  });
  await test('program noNotify suppresses automatic mail', async () => {
    const s = scenario(); await s.program({ noNotify: true }); assert.equal(s.sent.length, 0);
  });
  await test('missing email suppresses automatic mail', async () => {
    const s = scenario({ client: { email: '' } }); await s.program({}); assert.equal(s.sent.length, 0);
  });
  for (const client of [{ emailPreferences: { allAutomatic: false } }, { emailPreferences: { programAssigned: false } }, { emailDelivery: { suspended: true } }, { settings: { emailNotificationsEnabled: false } }]) {
    await test(`program honors preference ${JSON.stringify(client)}`, async () => {
      const s = scenario({ client }); await s.program({}); assert.equal(s.sent.length, 0);
    });
  }
  await test('SMTP failure recorded and replay blocked pending manual retry', async () => {
    const s = scenario({ failDelivery: true }); await s.program({}); await s.program({});
    assert.equal(s.events[0].status, 'failed'); assert.equal(s.sent.length, 1);
    assert.ok(s.stored.lifecycleEmails.programAssignedAttemptedAt);
    assert.equal(s.stored.lifecycleEmails.programAssignedSentAt, undefined);
  });
  await test('draft nutrition does not send mail', async () => {
    const s = scenario(); await s.nutrition({ status: 'draft' }); assert.equal(s.sent.length, 0);
  });
  await test('shared nutrition trigger sends once', async () => {
    const s = scenario(); const data = { clientShare: { enabled: true, sections: { menu: true } } };
    await s.nutrition(data); await s.nutrition(data); assert.equal(s.sent.length, 1);
    assert.ok(s.stored.clientShare.emailSentAt);
  });
  await test('explicit frontend noNotify avoids duplicate nutrition trigger mail', async () => {
    const s = scenario(); await s.nutrition({ clientShare: { enabled: true, noNotify: true, sections: { menu: true } } });
    assert.equal(s.sent.length, 0);
  });
  console.log(`Notification callback audit: ${passed} passed. SMTP delivery and deployed triggers were not exercised.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
