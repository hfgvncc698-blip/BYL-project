import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(root, "../..");
const mediaIntakeStatePath = resolve(root, "marketing-agent/media-intake-state.json");
const shotLibraryPath = resolve(root, "media-library/shot-library.json");

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const videoExtensions = new Set([".mp4", ".mov", ".webm"]);

async function readJsonSafe(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function listFiles(dir, limit = 3000) {
  const output = [];
  async function visit(current) {
    if (output.length >= limit) return;
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) output.push(path);
      if (output.length >= limit) return;
    }
  }
  await visit(dir);
  return output;
}

function projectRelative(path = "") {
  return path.replace(`${projectRoot}/`, "");
}

function normalize(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function classifyAsset(path = "", date = "") {
  const text = normalize(path);
  const extension = extname(path).toLowerCase();
  const isImage = imageExtensions.has(extension);
  const isVideo = videoExtensions.has(extension);
  const currentDay = date && text.includes(`/daily/${date}/`);
  const generated = /chatgpt|openai|generated|auto/.test(text);
  const human = /coach|human|ugc|mains|visage|studio|nutrition|owner|client|scene-metier|telephone/.test(text);
  const product = /dashboard|mobile|interface|clients-mobile|planning|byl|app/.test(text);
  const source = /\/sources\//.test(text);
  const realVideoProvider = /real-video|provider-raw|real_video|external_video/.test(text);
  const autonomousProductVideo =
    currentDay && isVideo && /byl-autonomous|autonomous-product|product-video|social-media\/daily/.test(text);
  return {
    isImage,
    isVideo,
    currentDay,
    generated,
    human,
    product,
    source,
    publishCandidate: currentDay && (isVideo || isImage),
    freshHumanSource: currentDay && source && isImage && human && !product,
    freshVisualSource: currentDay && source && isImage && (human || product || generated),
    realVideoProvider,
    autonomousProductVideo,
    trueVideoCandidate: currentDay && isVideo && realVideoProvider,
    autonomousVideoCandidate: autonomousProductVideo,
    productProofSource: autonomousProductVideo || (product && (isImage || isVideo)),
  };
}

async function assetRecord(path, date) {
  const info = await stat(path).catch(() => null);
  const classification = classifyAsset(path, date);
  return {
    path: projectRelative(path),
    bytes: info?.size || 0,
    modifiedAt: info?.mtime?.toISOString?.() || "",
    extension: extname(path).toLowerCase(),
    ...classification,
  };
}

function summarizeAssets(assets = []) {
  return {
    total: assets.length,
    images: assets.filter((asset) => asset.isImage).length,
    videos: assets.filter((asset) => asset.isVideo).length,
    currentDayAssets: assets.filter((asset) => asset.currentDay).length,
    freshHumanSources: assets.filter((asset) => asset.freshHumanSource).length,
    freshVisualSources: assets.filter((asset) => asset.freshVisualSource).length,
    trueVideoCandidates: assets.filter((asset) => asset.trueVideoCandidate).length,
    autonomousVideoCandidates: assets.filter((asset) => asset.autonomousVideoCandidate).length,
    productProofSources: assets.filter((asset) => asset.productProofSource).length,
    publishCandidates: assets.filter((asset) => asset.publishCandidate).length,
  };
}

function mediaReadiness(summary = {}) {
  const blockers = [];
  if (summary.trueVideoCandidates < 1 && summary.autonomousVideoCandidates < 1 && summary.freshVisualSources < 3) {
    blockers.push("fresh_visual_sources_or_video_missing");
  }
  if (summary.productProofSources < 1) blockers.push("product_proof_source_missing");
  if (summary.publishCandidates < 1) blockers.push("publish_candidate_missing");
  return {
    ok: blockers.length === 0,
    blockers,
    recommendation: blockers.includes("fresh_visual_sources_or_video_missing")
      ? "Generer une video BYL autonome du jour, une vraie video provider ou au moins 3 sources visuelles fraiches dans public/social-media/daily/<date>/sources."
      : blockers.includes("publish_candidate_missing")
        ? "Generer ou importer un media final public pour le slot du jour."
        : "Stock media suffisant pour tenter la production, sous reserve du preflight qualite.",
  };
}

export async function runMediaIntakeAgent({ now = {}, statePath = mediaIntakeStatePath } = {}) {
  const date = now.date || new Date().toISOString().slice(0, 10);
  const roots = [
    resolve(projectRoot, "public/social-media/daily", date),
    resolve(root, "chatgpt-assets", date),
    resolve(root, "demo-assets"),
    resolve(projectRoot, "ad-samples/byl-video-hooks/frames-mobile"),
  ];
  const files = [];
  for (const dir of roots) {
    files.push(...(await listFiles(dir, 1200)));
  }
  const assets = [];
  for (const file of [...new Set(files)]) {
    const extension = extname(file).toLowerCase();
    if (!imageExtensions.has(extension) && !videoExtensions.has(extension)) continue;
    assets.push(await assetRecord(file, date));
  }

  const shotLibrary = await readJsonSafe(shotLibraryPath, { entries: [] });
  const historicalWinners = (shotLibrary.entries || [])
    .filter((entry) => Number(entry.qualityScore || 0) >= 90)
    .slice(-30)
    .map((entry) => ({
      date: entry.date || "",
      slotId: entry.slotId || "",
      platform: entry.platform || "",
      audienceSegment: entry.audienceSegment || "",
      sourceImage: entry.sourceImage || "",
      finalMediaUrl: entry.finalMediaUrl || "",
      reusable: Boolean(entry.reusable),
      qualityScore: entry.qualityScore || 0,
    }));

  const summary = summarizeAssets(assets);
  const readiness = mediaReadiness(summary);
  const state = {
    version: "1.0.0",
    updatedAt: new Date().toISOString(),
    date,
    status: readiness.ok ? "media_inventory_ready" : "media_inventory_needs_fresh_visual_sources_or_video",
    summary,
    readiness,
    roots: roots.map(projectRelative),
    assets: assets.slice(-500),
    reusableProductProofs: assets.filter((asset) => asset.productProofSource).slice(-50),
    currentFreshHumanSources: assets.filter((asset) => asset.freshHumanSource).slice(-50),
    currentFreshVisualSources: assets.filter((asset) => asset.freshVisualSource).slice(-50),
    trueVideoCandidates: assets.filter((asset) => asset.trueVideoCandidate).slice(-50),
    autonomousVideoCandidates: assets.filter((asset) => asset.autonomousVideoCandidate).slice(-50),
    historicalWinners,
  };
  await writeJson(statePath, state);
  return { ok: readiness.ok, statePath, status: state.status, summary, readiness };
}

async function main() {
  const dateArgIndex = process.argv.indexOf("--date");
  const date = dateArgIndex >= 0 ? process.argv[dateArgIndex + 1] : "";
  const result = await runMediaIntakeAgent({ now: { date } });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
    process.exitCode = 1;
  });
}
