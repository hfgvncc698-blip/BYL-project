import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trendBriefPath = resolve(root, "marketing-agent/trend-brief.json");

const defaultSources = [
  {
    label: "TikTok Creative Center",
    url: "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/mobile/en",
  },
  {
    label: "Instagram for Creators",
    url: "https://creators.instagram.com/",
  },
  {
    label: "Google Trends France",
    url: "https://trends.google.com/trends/explore?geo=FR&q=coach%20sportif,nutritionniste,salle%20de%20sport",
  },
];

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

function stripHtml(value = "") {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html = "") {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const ogTitle = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
  return stripHtml(ogTitle || title).slice(0, 180);
}

function extractDescription(html = "") {
  const meta =
    html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    "";
  return stripHtml(meta).slice(0, 260);
}

async function fetchSource(source) {
  const startedAt = Date.now();
  try {
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "user-agent": "BYL-Marketing-Agent/2.0 (+https://boostyourlife.coach)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const text = await response.text();
    return {
      ...source,
      ok: response.ok,
      status: response.status,
      fetchedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      title: extractTitle(text),
      description: extractDescription(text),
      sample: stripHtml(text).slice(0, 500),
    };
  } catch (error) {
    return {
      ...source,
      ok: false,
      fetchedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      error: error?.message || String(error),
    };
  }
}

function enrichMechanics(existing = [], sourceSignals = []) {
  const okLabels = sourceSignals.filter((source) => source.ok).map((source) => source.label);
  return (existing || []).map((mechanic) => ({
    ...mechanic,
    lastScoutAt: new Date().toISOString(),
    liveSourceSignals: okLabels,
  }));
}

export async function runTrendScout({ briefPath = trendBriefPath } = {}) {
  const current = await readJsonSafe(briefPath, {
    version: "1.0.0",
    mechanics: [],
    antiPatterns: [],
    sources: defaultSources,
  });
  const sources = Array.isArray(current.sources) && current.sources.length ? current.sources : defaultSources;
  const sourceSignals = [];
  for (const source of sources) {
    sourceSignals.push(await fetchSource(source));
  }
  const okCount = sourceSignals.filter((source) => source.ok).length;
  const next = {
    ...current,
    updatedAt: new Date().toISOString().slice(0, 10),
    status: okCount > 0 ? "live_verified_partial" : "local_seed_network_unavailable",
    operatingRule:
      okCount > 0
        ? "Trend Scout live partiel effectue. Utiliser les mecaniques locales enrichies par les sources disponibles, sans copier de createur."
        : "Veille live indisponible. Utiliser le seed local et ne pas pretendre que les tendances sont verifiees aujourd'hui.",
    sourceSignals,
    mechanics: enrichMechanics(current.mechanics || [], sourceSignals),
    lastScoutAt: new Date().toISOString(),
  };
  await writeJson(briefPath, next);
  return { ok: true, status: next.status, okSourceCount: okCount, trendBriefPath: briefPath };
}

async function main() {
  const result = await runTrendScout();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
    process.exitCode = 1;
  });
}
