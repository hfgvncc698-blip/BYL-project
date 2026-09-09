// Both suites fail closed unless the local demo Firestore emulator is present.
import { spawnSync } from 'node:child_process';
for (const script of ['testFirestoreRules.cjs', 'testPaidProgramFirestore.cjs']) {
  const result = spawnSync(process.execPath, [`scripts/${script}`], { stdio: 'inherit', timeout: 180000 });
  if (result.error || result.status !== 0) {
    console.error(`FAILED ${script}: ${result.error?.message || result.status}`);
    process.exit(1);
  }
}
console.log('Real Firestore audit-fix suites passed: Rules and paid delivery. Demo emulator only.');
