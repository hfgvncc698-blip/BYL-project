import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const apiPort = Number(process.env.PORT || 5050);
const frontPort = Number(process.env.VITE_PORT || 5173);
const apiUrl = `http://127.0.0.1:${apiPort}/api/health`;
const frontUrl = `http://127.0.0.1:${frontPort}/`;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isHttpAlive(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.setTimeout(700, () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

async function isServiceAlive(url, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (await isHttpAlive(url)) return true;
    if (attempt < attempts) await wait(200);
  }
  return false;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.listen({ host: "127.0.0.1", port }, () => {
      probe.close(() => resolve(true));
    });
  });
}

function run(scriptName, env = {}) {
  return spawn(npmCmd, ["run", scriptName], {
    stdio: "inherit",
    env: { ...process.env, ...env, FORCE_COLOR: "1" },
  });
}

function reportBlockedPort(label, port, url) {
  console.error(`\n[dev] Impossible de démarrer ${label}.`);
  console.error(`[dev] Le port ${port} est déjà occupé, mais ${url} ne répond pas correctement.`);
  console.error(`[dev] Vérifie le processus avec : lsof -nP -iTCP:${port} -sTCP:LISTEN`);
  console.error("[dev] Arrête uniquement l’ancienne instance BYL concernée, puis relance npm run dev.\n");
}

const [apiAlive, frontAlive] = await Promise.all([
  isServiceAlive(apiUrl),
  isServiceAlive(frontUrl),
]);
const [apiPortFree, frontPortFree] = await Promise.all([
  apiAlive ? Promise.resolve(false) : isPortFree(apiPort),
  frontAlive ? Promise.resolve(false) : isPortFree(frontPort),
]);

if (!apiAlive && !apiPortFree) {
  reportBlockedPort("l’API BYL", apiPort, apiUrl);
  process.exit(1);
}

if (!frontAlive && !frontPortFree) {
  reportBlockedPort("le front BYL", frontPort, frontUrl);
  process.exit(1);
}

const processes = [];

if (apiAlive) {
  console.log(`[dev] API BYL déjà disponible sur ${apiUrl}`);
} else {
  processes.push(run("dev:api", { PORT: String(apiPort) }));
}

if (frontAlive) {
  console.log(`[dev] Front BYL déjà disponible sur ${frontUrl}`);
} else {
  processes.push(run("dev:front", { VITE_PORT: String(frontPort) }));
}

if (processes.length === 0) {
  console.log("[dev] Les deux services sont déjà actifs. Aucun doublon n’a été lancé.");
}

let shuttingDown = false;

function stopAll(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill(signal);
  }
}

for (const child of processes) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (code && code !== 0) {
      stopAll(signal || "SIGTERM");
      process.exitCode = code;
    }
  });
}

process.on("SIGINT", () => stopAll("SIGINT"));
process.on("SIGTERM", () => stopAll("SIGTERM"));
