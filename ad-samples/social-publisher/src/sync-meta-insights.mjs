import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syncMarketingPerformanceFromMeta } from "./marketing-intelligence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.social");

async function loadEnvFile(path) {
  try {
    const raw = await readFile(path, "utf8");
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index === -1) continue;
      const key = line.slice(0, index);
      if (process.env[key]) continue;
      process.env[key] = line.slice(index + 1).replace(/^["']|["']$/g, "");
    }
  } catch {
    // The command can still run with environment variables injected by the caller.
  }
}

await loadEnvFile(envPath);
const result = await syncMarketingPerformanceFromMeta({ env: process.env });
console.log(JSON.stringify(result, null, 2));
