// Deterministic, network-free regression suite for the 2026-09 audit fixes.
// The real Rules emulator is deliberately separate: npm run test:security-rules.
import { spawnSync } from 'node:child_process';
const scripts = [
  'auditAccounts.cjs',
  'auditAccountsSmtpClassification.cjs',
  'auditPaymentsMock.cjs',
  'testPaidProgramDelivery.cjs',
  'testPaymentReturn.mjs',
  'testPaymentReturnI18n.mjs',
  'auditWorkflowsRoutes.cjs',
  'auditWorkflowsClientActions.cjs',
  'auditWorkflowsNotifications.cjs',
  'testProgramSyncConcurrency.cjs',
  'testConfirmedProgramWrites.mjs',
  'testSessionNotifications.cjs',
];
let failures = 0;
for (const script of scripts) {
  const result = spawnSync(process.execPath, [`scripts/${script}`], { stdio: 'inherit', timeout: 120000 });
  if (result.error || result.status !== 0) { failures++; console.error(`FAILED ${script}: ${result.error?.message || result.status}`); }
}
console.log(`Audit-fix regression: ${scripts.length - failures}/${scripts.length} scripts passed.`);
process.exitCode = failures ? 1 : 0;
