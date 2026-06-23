import { copyFile, mkdtemp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OVERLAY_RENDERER_SOURCE = resolve(SCRIPT_DIR, "render-overlay.m");
const VOICE_SYNTH_SOURCE = resolve(SCRIPT_DIR, "synthesize-voice.m");
const SOCIAL_ENV_PATH = resolve(SCRIPT_DIR, "../.env.social");
const FALLBACK_VOICEOVER_DIR = resolve(SCRIPT_DIR, "../../byl-video-ugc-variants/voiceovers");

process.env.PATH = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
  process.env.PATH || "",
]
  .filter(Boolean)
  .join(":");

async function loadEnvFile(path) {
  try {
    const text = await readFile(path, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // The finalizer can still run with explicit environment variables.
  }
}

function displayText(value = "") {
  return String(value || "")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function displayLabel(value = "") {
  return displayText(value)
    .replace(/[^a-zA-ZÀ-ÿ0-9 '#+?!:.,/-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function wrapLines(value = "", max = 22, limit = 4) {
  const words = displayLabel(value).split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, limit);
}

function splitVoiceText(text, maxLength = 180) {
  const sentences = String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length <= maxLength) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    if (sentence.length <= maxLength) {
      current = sentence;
    } else {
      const words = sentence.split(/\s+/);
      current = "";
      for (const word of words) {
        const wordNext = current ? `${current} ${word}` : word;
        if (wordNext.length > maxLength && current) {
          chunks.push(current);
          current = word;
        } else {
          current = wordNext;
        }
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function compileOverlayRenderer(tempDir) {
  const moduleCache = resolve(tempDir, "clang-module-cache");
  const binaryPath = resolve(tempDir, "render-overlay");
  await mkdir(moduleCache, { recursive: true });
  await run("clang", ["-fobjc-arc", "-framework", "AppKit", OVERLAY_RENDERER_SOURCE, "-o", binaryPath], {
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: moduleCache,
      MODULE_CACHE_DIR: moduleCache,
    },
  });
  return binaryPath;
}

async function compileNativeHelper({ source, binaryName, tempDir }) {
  const moduleCache = resolve(tempDir, "clang-module-cache");
  const binaryPath = resolve(tempDir, binaryName);
  await mkdir(moduleCache, { recursive: true });
  await run("clang", ["-fobjc-arc", "-framework", "AppKit", "-framework", "AVFoundation", "-framework", "ImageIO", source, "-o", binaryPath], {
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: moduleCache,
      MODULE_CACHE_DIR: moduleCache,
    },
  });
  return binaryPath;
}

async function createOverlay({ rendererPath, outPath, payloadPath, title, kicker = "", footer = "" }) {
  const titleLines = wrapLines(title, 18, 4);
  const kickerLines = kicker ? wrapLines(kicker, 34, 1) : [];
  const footerLines = footer ? wrapLines(footer, 34, 2) : [];
  const titleFontSize = titleLines.length >= 4 ? 70 : 78;
  await writeFile(payloadPath, JSON.stringify({ titleLines, kickerLines, footerLines, titleFontSize }), "utf8");
  await run(rendererPath, [payloadPath, outPath]);
}

async function synthesizeGoogleVoice({ text, outPath }) {
  const chunks = splitVoiceText(text);
  const audioParts = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const url = new URL("https://translate.google.com/translate_tts");
    url.searchParams.set("ie", "UTF-8");
    url.searchParams.set("tl", "fr");
    url.searchParams.set("client", "tw-ob");
    url.searchParams.set("q", chunks[index]);
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!response.ok) throw new Error(`Google TTS failed: ${response.status} ${await response.text()}`);
    const partPath = outPath.replace(/\.wav$/i, `-part-${index}.mp3`);
    await writeFile(partPath, Buffer.from(await response.arrayBuffer()));
    audioParts.push(partPath);
  }

  const concatPath = outPath.replace(/\.wav$/i, "-concat.txt");
  const concatText = audioParts.map((part) => `file '${part.replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(concatPath, concatText, "utf8");
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-ac", "1", "-ar", "44100", outPath], {
    maxBuffer: 1024 * 1024 * 16,
  });
}

async function copyFallbackVoice({ fallbackVoiceoverPath, outPath }) {
  if (!fallbackVoiceoverPath) return false;
  try {
    await copyFile(resolve(fallbackVoiceoverPath), outPath);
    const fallbackStat = await stat(outPath);
    return fallbackStat.size >= 16384;
  } catch {
    return false;
  }
}

async function ensureVoiceFileReady({ outPath, fallbackVoiceoverPath, errorMessage }) {
  try {
    const voiceStat = await stat(outPath);
    if (voiceStat.size >= 16384) return;
  } catch {
    // Fall back to a packaged voiceover when the provider produced no file.
  }
  if (await copyFallbackVoice({ fallbackVoiceoverPath, outPath })) return;
  throw new Error(errorMessage);
}

function pickFallbackVoiceoverPath({ fallbackVoiceoverPath, text, voice }) {
  if (fallbackVoiceoverPath) return fallbackVoiceoverPath;
  const normalized = displayText(text).toLowerCase();
  if (/(nutrition|menus|repas|bilan)/.test(normalized)) {
    return resolve(FALLBACK_VOICEOVER_DIR, "03-nutrition.wav");
  }
  if (/(studio|gerante|club|equipe|premier client|relances|programmes a verifier)/.test(normalized)) {
    return resolve(FALLBACK_VOICEOVER_DIR, "05-studio-owner.wav");
  }
  if (/(client|contexte|reponse|excel|scaler|suivi)/.test(normalized)) {
    return resolve(FALLBACK_VOICEOVER_DIR, "04-voice-note.wav");
  }
  return resolve(FALLBACK_VOICEOVER_DIR, /am[eé]lie/i.test(String(voice || "")) ? "05-studio-owner.wav" : "04-voice-note.wav");
}

async function synthesizeVoice({ text, voice, aiVoice, rate, outPath, fallbackVoiceoverPath }) {
  const resolvedFallbackVoiceoverPath = pickFallbackVoiceoverPath({ fallbackVoiceoverPath, text, voice });
  const voiceProvider = process.env.BYL_VOICE_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "local");
  if (voiceProvider === "google") {
    await synthesizeGoogleVoice({ text, outPath });
    await ensureVoiceFileReady({
      outPath,
      fallbackVoiceoverPath: resolvedFallbackVoiceoverPath,
      errorMessage: "Google voice export is empty. Provide a fallback voiceover or switch providers.",
    });
    return;
  }

  if (voiceProvider === "openai") {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required when BYL_VOICE_PROVIDER=openai");
    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
          voice: aiVoice || "cedar",
          input: text,
          instructions:
            "Voix off française naturelle, humaine, conversationnelle et premium. Marquer de petites pauses. Pas de voix radio, pas de ton publicitaire, pas de lecture robotique.",
          response_format: "wav",
          speed: Number(process.env.BYL_VOICE_SPEED || "1.02"),
        }),
      });
      if (!response.ok) throw new Error(`OpenAI TTS failed: ${response.status} ${await response.text()}`);
      await writeFile(outPath, Buffer.from(await response.arrayBuffer()));
      await ensureVoiceFileReady({
        outPath,
        fallbackVoiceoverPath: resolvedFallbackVoiceoverPath,
        errorMessage: "OpenAI voice export is empty. Provide a fallback voiceover or switch providers.",
      });
      return;
    } catch (error) {
      if (process.env.BYL_VOICE_STRICT === "1") throw error;
      console.warn(`OpenAI voice unavailable, falling back to web voice: ${error.message}`);
      try {
        await synthesizeGoogleVoice({ text, outPath });
        await ensureVoiceFileReady({
          outPath,
          fallbackVoiceoverPath: resolvedFallbackVoiceoverPath,
          errorMessage: "Web voice export is empty. Provide a fallback voiceover or switch providers.",
        });
        return;
      } catch (googleError) {
        console.warn(`Web voice unavailable, falling back to native voice: ${googleError.message}`);
      }
    }
  }

  const nativePath = outPath.replace(/\.wav$/i, ".caf");
  const nativeVoicePath = process.env.BYL_NATIVE_VOICE_HELPER;
  try {
    if (nativeVoicePath) await run(nativeVoicePath, [voice, String(rate), nativePath, text]);
    else await run("say", ["-v", voice, "-r", String(rate), "-o", nativePath, text]);
  } catch (error) {
    console.warn(`Native voice helper unavailable, falling back to macOS say: ${error.message}`);
    try {
      await run("say", ["-v", voice, "-r", String(rate), "-o", nativePath, text]);
    } catch (sayError) {
      if (await copyFallbackVoice({ fallbackVoiceoverPath: resolvedFallbackVoiceoverPath, outPath })) return;
      throw sayError;
    }
  }
  try {
    await run("afconvert", [nativePath, outPath, "-f", "WAVE", "-d", "LEI16@44100"]);
  } catch (convertError) {
    if (await copyFallbackVoice({ fallbackVoiceoverPath: resolvedFallbackVoiceoverPath, outPath })) return;
    throw convertError;
  }
  await ensureVoiceFileReady({
    outPath,
    fallbackVoiceoverPath: resolvedFallbackVoiceoverPath,
    errorMessage: "Local macOS voice export is empty. Use BYL_VOICE_PROVIDER=openai or export the voice from CapCut.",
  });
}

function buildFilter({ overlays, duration, voiceInput, musicInputA, musicInputB }) {
  const filters = [`[0:v]trim=0:${duration},setpts=PTS-STARTPTS,format=rgba[basev]`];
  let previous = "[basev]";
  overlays.forEach((overlay, index) => {
    const input = index + 1;
    const out = index === overlays.length - 1 ? "[vout]" : `[v${index}]`;
    filters.push(`[${input}:v]format=rgba[ov${index}]`);
    filters.push(`${previous}[ov${index}]overlay=0:0:enable='between(t,${overlay.start},${overlay.end})'${out}`);
    previous = out;
  });
  if (!overlays.length) filters.push("[basev]format=yuv420p[vout]");
  else filters.push(`${previous.replace("[vout]", "[vout]")}format=yuv420p[vfinal]`);

  filters.push(
    `[${voiceInput}:a]highpass=f=85,lowpass=f=10500,acompressor=threshold=-22dB:ratio=2.6:attack=10:release=160,volume=1.85,apad,atrim=0:${duration}[vo]`,
  );
  filters.push(
    `[${musicInputA}:a][${musicInputB}:a]amix=inputs=2:duration=longest,lowpass=f=1200,volume=0.012,afade=t=in:st=0:d=0.8,afade=t=out:st=${Math.max(
      0,
      duration - 1.2,
    )}:d=1.2[music]`,
  );
  filters.push(`[vo][music]amix=inputs=2:duration=longest:weights='1 0.22',loudnorm=I=-15:TP=-1.5:LRA=8,atrim=0:${duration}[aout]`);
  return filters.join(";");
}

async function finalizeJob(job, tempDir) {
  const inputPath = resolve(job.input);
  const outputPath = resolve(job.output || job.input);
  const tempOutput = resolve(tempDir, `${job.id || "daily"}-final.mp4`);
  const voicePath = resolve(tempDir, `${job.id || "daily"}-voice.wav`);
  await synthesizeVoice({
    text: job.voiceover,
    voice: job.voice || "Thomas",
    aiVoice: job.aiVoice || "cedar",
    rate: job.rate || 162,
    outPath: voicePath,
    fallbackVoiceoverPath: job.fallbackVoiceoverPath || "",
  });

  const overlayPaths = [];
  const rendererPath = (job.overlays || []).length ? await compileOverlayRenderer(tempDir) : null;
  for (let index = 0; index < (job.overlays || []).length; index += 1) {
    const overlayPath = resolve(tempDir, `${job.id || "daily"}-overlay-${index}.png`);
    const payloadPath = resolve(tempDir, `${job.id || "daily"}-overlay-${index}.json`);
    await createOverlay({ rendererPath, outPath: overlayPath, payloadPath, ...job.overlays[index] });
    overlayPaths.push(overlayPath);
  }

  const args = ["-y", "-i", inputPath];
  for (const overlayPath of overlayPaths) args.push("-loop", "1", "-t", String(job.duration), "-i", overlayPath);
  const voiceInput = 1 + overlayPaths.length;
  const musicInputA = voiceInput + 1;
  const musicInputB = voiceInput + 2;
  args.push("-i", voicePath);
  args.push("-f", "lavfi", "-t", String(job.duration), "-i", "sine=frequency=174:sample_rate=44100");
  args.push("-f", "lavfi", "-t", String(job.duration), "-i", "sine=frequency=261:sample_rate=44100");

  const filter = buildFilter({
    overlays: job.overlays || [],
    duration: job.duration,
    voiceInput,
    musicInputA,
    musicInputB,
  });
  args.push("-filter_complex", filter);
  args.push("-map", overlayPaths.length ? "[vfinal]" : "[vout]", "-map", "[aout]");
  args.push(
    "-t",
    String(job.duration),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    tempOutput,
  );
  await run("ffmpeg", args, { maxBuffer: 1024 * 1024 * 32 });
  await mkdir(dirname(outputPath), { recursive: true });
  await rename(tempOutput, outputPath);
  return outputPath;
}

const configPath = process.argv[2];
if (!configPath) {
  throw new Error("Usage: node src/finalize-daily-media.mjs <config.json>");
}

await loadEnvFile(SOCIAL_ENV_PATH);
const config = JSON.parse(await readFile(resolve(configPath), "utf8"));
const tempDir = await mkdtemp(resolve(tmpdir(), "byl-finalize-"));
try {
  if (process.env.BYL_USE_NATIVE_VOICE_HELPER === "1") {
    process.env.BYL_NATIVE_VOICE_HELPER = await compileNativeHelper({
      source: VOICE_SYNTH_SOURCE,
      binaryName: "synthesize-voice",
      tempDir,
    });
  }
  for (const job of config.jobs || []) {
    const output = await finalizeJob(job, tempDir);
    console.log(`finalized ${output}`);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
