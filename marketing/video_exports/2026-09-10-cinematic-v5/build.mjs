#!/usr/bin/env node

import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "../../..");
const publicLogo = join(projectRoot, "public", "logo-byl.png");
const workDir = join(scriptDir, ".build-v5");
const outputFile = join(scriptDir, "byl-cinematic-v5.mp4");
const ffmpeg = process.env.FFMPEG_BIN || "ffmpeg";
const ffprobe = process.env.FFPROBE_BIN || "ffprobe";

const inputs = ["clip-01.mp4", "clip-02.mp4", "clip-03.mp4"].map((name) => join(scriptDir, name));
const voiceFile = join(scriptDir, "voice.mp3");

function fail(message) {
  console.error(`\n[BYL V5] ${message}\n`);
  process.exit(1);
}

function commandExists(command) {
  const result = spawnSync(command, ["-version"], { stdio: "ignore" });
  return result.status === 0;
}

function probe(file) {
  try {
    const stdout = execFileSync(
      ffprobe,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height:format=duration",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8" },
    );
    const data = JSON.parse(stdout);
    return {
      duration: Number(data.format?.duration || 0),
      width: Number(data.streams?.[0]?.width || 0),
      height: Number(data.streams?.[0]?.height || 0),
    };
  } catch (error) {
    fail(`Impossible d’analyser ${file}: ${error.message}`);
  }
}

function loadSharp() {
  const candidates = [
    process.env.SHARP_PATH,
    join(projectRoot, "node_modules", "sharp"),
    "/Users/tommarie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next known runtime location.
    }
  }

  fail(
    "Sharp est introuvable. Définissez SHARP_PATH vers le module Sharp du runtime Codex.",
  );
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function subtitleSvg({ width, height, lines, accentLine = -1 }) {
  const fontSize = Math.round(width * 0.054);
  const lineHeight = Math.round(fontSize * 1.16);
  const bottom = Math.round(height * 0.155);
  const startY = height - bottom - (lines.length - 1) * lineHeight;
  const tspans = lines
    .map((line, index) => {
      const color = index === accentLine ? "#7CB7FF" : "#FFFFFF";
      return `<tspan x="${width / 2}" y="${startY + index * lineHeight}" fill="${color}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="${Math.max(2, width * 0.004)}"/>
          <feOffset dy="${Math.max(2, width * 0.004)}"/>
          <feComponentTransfer><feFuncA type="linear" slope="0.88"/></feComponentTransfer>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <text text-anchor="middle" font-family="Inter, Arial, sans-serif"
        font-size="${fontSize}" font-weight="750" letter-spacing="-0.4"
        filter="url(#shadow)">${tspans}</text>
    </svg>
  `);
}

function ctaSvg({ width, height }) {
  const titleSize = Math.round(width * 0.062);
  const metaSize = Math.round(width * 0.031);
  const y = Math.round(height * 0.735);
  const lineWidth = Math.round(width * 0.16);

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="${Math.max(2, width * 0.005)}"/>
          <feOffset dy="${Math.max(2, width * 0.004)}"/>
          <feComponentTransfer><feFuncA type="linear" slope="0.9"/></feComponentTransfer>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <line x1="${width / 2 - lineWidth / 2}" y1="${y - titleSize * 0.9}"
        x2="${width / 2 + lineWidth / 2}" y2="${y - titleSize * 0.9}"
        stroke="#60A5FA" stroke-width="${Math.max(3, width * 0.004)}" stroke-linecap="round"/>
      <text x="${width / 2}" y="${y}" text-anchor="middle"
        font-family="Inter, Arial, sans-serif" font-size="${titleSize}"
        font-weight="800" fill="#FFFFFF" letter-spacing="-0.5" filter="url(#shadow)">
        Découvrez l’espace Pro
      </text>
      <text x="${width / 2}" y="${y + titleSize * 0.72}" text-anchor="middle"
        font-family="Inter, Arial, sans-serif" font-size="${metaSize}"
        font-weight="650" fill="#DCEBFF" filter="url(#shadow)">
        BoostYourLife.coach
      </text>
    </svg>
  `);
}

function aiDisclosureSvg({ width, height }) {
  const fontSize = Math.round(width * 0.024);
  const x = Math.round(width * 0.045);
  const y = Math.round(height * 0.052);

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="${Math.max(1, width * 0.002)}"/>
          <feOffset dy="${Math.max(1, width * 0.002)}"/>
          <feComponentTransfer><feFuncA type="linear" slope="0.7"/></feComponentTransfer>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <text x="${x}" y="${y}" font-family="Inter, Arial, sans-serif"
        font-size="${fontSize}" font-weight="600" fill="#FFFFFF" fill-opacity="0.76"
        letter-spacing="0.15" filter="url(#shadow)">Scènes générées par IA</text>
    </svg>
  `);
}

async function makeOverlay(sharp, file, svg, width, height) {
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: svg, top: 0, left: 0 }])
    .png()
    .toFile(file);
}

async function makeLogoOverlay(sharp, file, width, height) {
  const logoSize = Math.round(width * 0.105);
  const marginX = Math.round(width * 0.045);
  const marginY = Math.round(height * 0.035);
  const resizedLogo = await sharp(publicLogo)
    .resize(logoSize, logoSize, { fit: "contain" })
    .modulate({ brightness: 1.06 })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: resizedLogo,
        top: marginY,
        left: width - marginX - logoSize,
        blend: "over",
      },
    ])
    .png()
    .toFile(file);
}

function overlayPrep(inputIndex, label, start, end) {
  const duration = end - start;
  const fadeIn = Math.min(0.22, duration / 5);
  const fadeOut = Math.min(0.25, duration / 5);
  const fadeOutStart = Math.max(fadeIn, duration - fadeOut);
  return `[${inputIndex}:v]format=rgba,trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS,fade=t=in:st=0:d=${fadeIn.toFixed(3)}:alpha=1,fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOut.toFixed(3)}:alpha=1,setpts=PTS+${start.toFixed(3)}/TB[${label}]`;
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(`BYL cinematic V5\n\nPlacez dans ce dossier :\n  clip-01.mp4\n  clip-02.mp4\n  clip-03.mp4\n  voice.mp3\n\nPuis lancez :\n  node build.mjs\n\nSortie :\n  byl-cinematic-v5.mp4`);
    return;
  }

  if (!commandExists(ffmpeg) || !commandExists(ffprobe)) {
    fail("FFmpeg et ffprobe doivent être disponibles dans le PATH (ou via FFMPEG_BIN/FFPROBE_BIN). ");
  }

  for (const file of [...inputs, voiceFile, publicLogo]) {
    if (!existsSync(file)) fail(`Fichier requis manquant : ${file}`);
  }

  const metadata = inputs.map(probe);
  metadata.forEach((item, index) => {
    if (item.duration < 7.98) {
      fail(`clip-0${index + 1}.mp4 dure ${item.duration.toFixed(2)} s ; 8,00 s minimum sont requis.`);
    }
    if (item.width <= 0 || item.height <= 0 || item.height <= item.width) {
      fail(`clip-0${index + 1}.mp4 doit être une vidéo verticale valide.`);
    }
  });

  const first = metadata[0];
  const useFullHd = first.width >= 1000 || first.height >= 1800;
  const width = useFullHd ? 1080 : 720;
  const height = useFullHd ? 1920 : 1280;
  const sharp = loadSharp();

  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  const overlays = [
    {
      file: join(workDir, "subtitle-01.png"),
      start: 0.25,
      end: 4.1,
      svg: subtitleSvg({ width, height, lines: ["Coacher, c’est rester présent", "bien au-delà d’une séance."], accentLine: 1 }),
    },
    {
      file: join(workDir, "subtitle-02.png"),
      start: 4.1,
      end: 6.75,
      svg: subtitleSvg({
        width,
        height,
        lines: ["Pour garder le fil", "de chaque accompagnement,"],
        accentLine: 0,
      }),
    },
    {
      file: join(workDir, "subtitle-03.png"),
      start: 6.75,
      end: 9.4,
      svg: subtitleSvg({
        width,
        height,
        lines: ["Il faut une", "organisation claire."],
        accentLine: 1,
      }),
    },
    {
      file: join(workDir, "subtitle-04.png"),
      start: 9.4,
      end: 12.3,
      svg: subtitleSvg({
        width,
        height,
        lines: ["BYL réunit clients,", "programmes,"],
        accentLine: 0,
      }),
    },
    {
      file: join(workDir, "subtitle-05.png"),
      start: 12.3,
      end: 13.85,
      svg: subtitleSvg({
        width,
        height,
        lines: ["planning et", "bilans nutritionnels"],
        accentLine: 1,
      }),
    },
    {
      file: join(workDir, "subtitle-06.png"),
      start: 13.85,
      end: 16.4,
      svg: subtitleSvg({
        width,
        height,
        lines: ["dans un même espace."],
        accentLine: 0,
      }),
    },
    {
      file: join(workDir, "subtitle-07.png"),
      start: 16.4,
      end: 18.8,
      svg: subtitleSvg({ width, height, lines: ["Votre méthode reste la vôtre."], accentLine: 0 }),
    },
  ];

  for (const overlay of overlays) {
    await makeOverlay(sharp, overlay.file, overlay.svg, width, height);
  }

  const logoOverlay = join(workDir, "logo.png");
  const ctaOverlay = join(workDir, "cta.png");
  const aiDisclosureOverlay = join(workDir, "ai-disclosure.png");
  await makeLogoOverlay(sharp, logoOverlay, width, height);
  await makeOverlay(sharp, ctaOverlay, ctaSvg({ width, height }), width, height);
  await makeOverlay(sharp, aiDisclosureOverlay, aiDisclosureSvg({ width, height }), width, height);

  const allOverlayInputs = [
    ...overlays.map((item) => item.file),
    logoOverlay,
    ctaOverlay,
    aiDisclosureOverlay,
  ];
  const args = ["-hide_banner", "-y"];
  for (const input of inputs) args.push("-i", input);
  args.push("-i", voiceFile);
  for (const overlay of allOverlayInputs) args.push("-loop", "1", "-i", overlay);

  const filters = [];
  for (let index = 0; index < 3; index += 1) {
    filters.push(
      `[${index}:v]trim=start=0:end=8,setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=30,format=yuv420p[v${index}]`,
    );
  }
  filters.push("[v0][v1][v2]concat=n=3:v=1:a=0[base]");

  // ffmpeg inputs: 0..2 clips, 3 voice, then overlays from index 4.
  overlays.forEach((overlay, index) => {
    filters.push(overlayPrep(4 + index, `o${index}`, overlay.start, overlay.end));
  });
  filters.push(overlayPrep(4 + overlays.length, "logo", 0.8, 23.6));
  filters.push(overlayPrep(5 + overlays.length, "cta", 18.8, 24.0));
  filters.push(overlayPrep(6 + overlays.length, "ai", 0.2, 23.8));

  let previous = "base";
  const layers = [...overlays.map((_, index) => `o${index}`), "logo", "cta", "ai"];
  layers.forEach((layer, index) => {
    const next = index === layers.length - 1 ? "video" : `mix${index}`;
    filters.push(`[${previous}][${layer}]overlay=0:0:eof_action=pass:shortest=0[${next}]`);
    previous = next;
  });

  filters.push(
    "[3:a]highpass=f=70,lowpass=f=10000,dynaudnorm=f=150:g=7,alimiter=limit=0.95,apad=pad_dur=24,atrim=duration=24,afade=t=out:st=23.6:d=0.4[audio]",
  );

  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[video]",
    "-map",
    "[audio]",
    "-t",
    "24",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    outputFile,
  );

  console.log(`[BYL V5] Montage ${width}×${height} en cours…`);
  const result = spawnSync(ffmpeg, args, { stdio: "inherit" });
  if (result.status !== 0) fail(`FFmpeg a quitté avec le code ${result.status}.`);

  const built = probe(outputFile);
  if (Math.abs(built.duration - 24) > 0.12 || built.width !== width || built.height !== height) {
    fail(`Sortie invalide : ${built.width}×${built.height}, ${built.duration.toFixed(2)} s.`);
  }

  console.log(`\n[BYL V5] Terminé : ${outputFile}`);
  console.log(`[BYL V5] ${built.width}×${built.height} · ${built.duration.toFixed(2)} s`);
}

main().catch((error) => fail(error.stack || error.message));
