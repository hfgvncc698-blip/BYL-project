import { spawn } from 'node:child_process';
import http from 'node:http';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function isApiAlive() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5050/api/health', (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.setTimeout(700, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

function run(scriptName) {
  return spawn(npmCmd, ['run', scriptName], {
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  });
}

const processes = [];

if (await isApiAlive()) {
  console.log('[dev] API already available on http://127.0.0.1:5050');
} else {
  processes.push(run('dev:api'));
}

processes.push(run('dev:front'));

let shuttingDown = false;

function stopAll(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill(signal);
  }
}

for (const child of processes) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (code && code !== 0) {
      stopAll(signal || 'SIGTERM');
      process.exitCode = code;
    }
  });
}

process.on('SIGINT', () => stopAll('SIGINT'));
process.on('SIGTERM', () => stopAll('SIGTERM'));
