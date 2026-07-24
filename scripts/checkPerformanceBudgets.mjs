import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const assetsDir = path.resolve("dist/assets");
const assetNames = readdirSync(assetsDir);

const gzipKiB = (assetName) =>
  gzipSync(readFileSync(path.join(assetsDir, assetName))).byteLength / 1024;

const findAsset = (prefix, { exclude = [] } = {}) =>
  assetNames.find(
    (name) =>
      name.startsWith(`${prefix}-`) &&
      name.endsWith(".js") &&
      exclude.every((excludedPrefix) => !name.startsWith(`${excludedPrefix}-`))
  );

const budgets = [
  { prefix: "index", maxGzipKiB: 150 },
  { prefix: "vendor-react", maxGzipKiB: 70 },
  { prefix: "vendor-ui", maxGzipKiB: 165 },
  {
    prefix: "vendor-firebase",
    exclude: ["vendor-firebase-functions", "vendor-firebase-storage"],
    maxGzipKiB: 150,
  },
  { prefix: "CoachDashboard", maxGzipKiB: 70 },
  { prefix: "Clientdashboard", maxGzipKiB: 35 },
  { prefix: "Clients", maxGzipKiB: 15 },
  { prefix: "ProgramsPage", maxGzipKiB: 10 },
  { prefix: "SessionPlayer", maxGzipKiB: 35 },
];

const failures = [];
const measured = [];

for (const budget of budgets) {
  const assetName = findAsset(budget.prefix, { exclude: budget.exclude || [] });
  if (!assetName) {
    failures.push(`asset manquant pour ${budget.prefix}`);
    continue;
  }

  const size = gzipKiB(assetName);
  measured.push(`${budget.prefix}: ${size.toFixed(1)} KiB / ${budget.maxGzipKiB} KiB`);
  if (size > budget.maxGzipKiB) {
    failures.push(`${budget.prefix}: ${size.toFixed(1)} KiB > ${budget.maxGzipKiB} KiB`);
  }
}

console.log(`[perf] Budgets gzip\n${measured.map((line) => `- ${line}`).join("\n")}`);

if (failures.length) {
  console.error(`[perf] Régression détectée\n${failures.map((line) => `- ${line}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("[perf] Tous les budgets sont respectés.");
}
