import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const runtimeRequire = createRequire('/Users/tommarie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const sharp = runtimeRequire('sharp');
const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, 'assets');
const framesDir = path.join(here, 'frames');
fs.mkdirSync(framesDir, { recursive: true });

const dataUrl = (name) => `data:image/png;base64,${fs.readFileSync(path.join(assets, name)).toString('base64')}`;
const photo1 = dataUrl('coach-desk-phone.png');
const photo2 = dataUrl('coach-desk-laptop.png');
const photo3 = dataUrl('coach-finished.png');
const mockup = dataUrl('byl-mockup.png');
const logo = dataUrl('byl-logo.png');

const scenes = [
  [2.60, 'human1', ['DERNIÈRE SÉANCE.'], 70],
  [2.60, 'human1', ['ET LA 2e JOURNÉE', 'COMMENCE.'], 64],
  [2.00, 'human2', ['UN PROGRAMME ICI.'], 66],
  [1.90, 'human2', ['LE PLANNING AILLEURS.'], 62],
  [1.90, 'human2', ['LE SUIVI À REPRENDRE.'], 60],
  [2.70, 'product', ['BYL RASSEMBLE', 'VOTRE ESPACE PRO'], 64],
  [1.80, 'product', ['CLIENTS'], 76],
  [1.90, 'product', ['PROGRAMMES SPORTIFS'], 59],
  [1.40, 'product', ['PLANNING'], 76],
  [1.63, 'product', ['BILANS NUTRITIONNELS'], 56],
  [1.99, 'human3', ["MOINS D'ALLERS-RETOURS."], 58],
  [2.22, 'human3', ['PLUS DE TEMPS', 'POUR COACHER.'], 66],
  [3.36, 'cta', ['ESSAI PRO', '14 JOURS'], 82],
];

function esc(s) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function textLines(lines, y, size, fill, weight = 800) {
  const gap = Math.round(size * 1.12);
  return `<text x="540" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map((line, i) => `<tspan x="540" dy="${i ? gap : 0}">${esc(line)}</tspan>`).join('')}</text>`;
}

function humanBackground(src) {
  return `<image href="${src}" x="0" y="0" width="1080" height="1920" preserveAspectRatio="xMidYMid slice"/><rect width="1080" height="1920" fill="#071a33" opacity="0.10"/>`;
}

function svgFor(kind, lines, size) {
  if (kind === 'cta') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#071a33"/><stop offset="1" stop-color="#164f83"/></linearGradient></defs>
      <rect width="1080" height="1920" fill="url(#g)"/>
      <circle cx="540" cy="520" r="190" fill="#ffffff" opacity="0.96"/>
      <image href="${logo}" x="410" y="390" width="260" height="260" preserveAspectRatio="xMidYMid meet"/>
      ${textLines(lines, 890, size, '#ffffff')}
      <rect x="185" y="1160" width="710" height="116" rx="58" fill="#ffffff"/>
      <text x="540" y="1235" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="43" font-weight="800" fill="#071a33">BoostYourLife.coach</text>
      <text x="540" y="1395" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="31" font-weight="600" fill="#b9d6ef">Espace professionnel</text>
    </svg>`;
  }

  const human = kind.startsWith('human');
  const base = kind === 'human1' ? humanBackground(photo1) : kind === 'human2' ? humanBackground(photo2) : kind === 'human3' ? humanBackground(photo3) : `
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#071a33"/><stop offset="1" stop-color="#123e69"/></linearGradient></defs>
    <rect width="1080" height="1920" fill="url(#bg)"/>
    <rect x="42" y="505" width="996" height="815" rx="42" fill="#ffffff" opacity="0.09"/>
    <image href="${mockup}" x="-150" y="590" width="1380" height="802" preserveAspectRatio="xMidYMid meet"/>
    <text x="70" y="105" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="#8dd8ff">BYL • ESPACE PRO</text>`;

  const lineCount = lines.length;
  const boxHeight = lineCount === 1 ? 145 : 225;
  const boxY = human ? 1325 : 250;
  const textY = boxY + (lineCount === 1 ? 92 : 82);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    ${base}
    <rect x="62" y="${boxY}" width="956" height="${boxHeight}" rx="42" fill="#ffffff" opacity="0.96"/>
    ${textLines(lines, textY, size, '#071a33')}
    ${human ? '<text x="80" y="1815" font-family="Arial, Helvetica, sans-serif" font-size="29" font-weight="700" fill="#ffffff">BoostYourLife.coach</text>' : ''}
  </svg>`;
}

const rows = [];
for (const [index, [duration, kind, lines, size]] of scenes.entries()) {
  const basename = String(index + 1).padStart(2, '0');
  const svg = svgFor(kind, lines, size);
  fs.writeFileSync(path.join(framesDir, `${basename}.svg`), svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(framesDir, `${basename}.png`));
  rows.push(`${basename}.png\t${duration}`);
}
fs.writeFileSync(path.join(framesDir, 'scenes.tsv'), `${rows.join('\n')}\n`);
