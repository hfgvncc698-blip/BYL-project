import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const runtimeRequire = createRequire('/Users/tommarie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const sharp = runtimeRequire('sharp');
const here = path.resolve('marketing/video_exports/2026-09-09-golden-circle-v4');
const publicDir = path.resolve('public');
const assetsDir = path.join(here, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

const dataUrl = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
const mockup = dataUrl(path.join(publicDir, 'Mockup.png'));
const logo = dataUrl(path.join(publicDir, 'logo-byl.png'));

const product = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06162b"/><stop offset="1" stop-color="#15517f"/></linearGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="28" stdDeviation="30" flood-opacity=".34"/></filter>
  </defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <circle cx="920" cy="250" r="330" fill="#58bde8" opacity=".10"/>
  <text x="70" y="145" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="700" fill="#91d9f5">COMMENT</text>
  <text x="70" y="265" font-family="Arial,Helvetica,sans-serif" font-size="78" font-weight="800" fill="#fff">UN SEUL PARCOURS.</text>
  <text x="70" y="345" font-family="Arial,Helvetica,sans-serif" font-size="35" font-weight="500" fill="#d8ebf7">Client  •  Programme  •  Planning</text>
  <text x="70" y="395" font-family="Arial,Helvetica,sans-serif" font-size="35" font-weight="500" fill="#d8ebf7">•  Bilan nutritionnel</text>
  <rect x="50" y="505" width="980" height="870" rx="46" fill="#fff" opacity=".98" filter="url(#shadow)"/>
  <image href="${mockup}" x="73" y="592" width="934" height="650" preserveAspectRatio="xMidYMid meet"/>
  <line x1="88" y1="1378" x2="992" y2="1378" stroke="#63c7ee" stroke-width="3" opacity=".65"/>
  <text x="70" y="1468" font-family="Arial,Helvetica,sans-serif" font-size="38" font-weight="700" fill="#fff">L'outil reste au service de ta méthode.</text>
  <text x="70" y="1810" font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="700" fill="#a8dff4">BoostYourLife.coach · espace Pro</text>
</svg>`;

const cta = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs><linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06162b"/><stop offset=".58" stop-color="#0e385d"/><stop offset="1" stop-color="#1c6797"/></linearGradient></defs>
  <rect width="1080" height="1920" fill="url(#bg2)"/>
  <circle cx="540" cy="430" r="205" fill="#fff" opacity=".97"/>
  <image href="${logo}" x="380" y="270" width="320" height="320" preserveAspectRatio="xMidYMid meet"/>
  <text x="540" y="820" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="36" font-weight="700" fill="#8fd8f4">QUOI</text>
  <text x="540" y="930" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="76" font-weight="800" fill="#fff">DÉCOUVRE</text>
  <text x="540" y="1018" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="76" font-weight="800" fill="#fff">L'ESPACE PRO</text>
  <rect x="150" y="1165" width="780" height="132" rx="66" fill="#fff"/>
  <text x="540" y="1248" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="43" font-weight="800" fill="#071a33">14 jours · sans carte bancaire</text>
  <text x="540" y="1455" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="46" font-weight="800" fill="#fff">BoostYourLife.coach</text>
</svg>`;

await sharp(Buffer.from(product)).png().toFile(path.join(assetsDir, 'product-proof.png'));
await sharp(Buffer.from(cta)).png().toFile(path.join(assetsDir, 'cta.png'));

const esc = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const overlaySvg = ({ lines, position = 'bottom', size = 47, brand = false }) => {
  const isTop = position === 'top';
  const y = isTop ? 110 : 1550;
  const lineGap = Math.round(size * 1.14);
  const boxHeight = Math.max(116, lines.length * lineGap + 58);
  const textY = y + 42 + size;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    ${brand ? '<rect x="42" y="45" width="505" height="58" rx="29" fill="#071a33" opacity=".72"/><text x="67" y="84" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="700" fill="#fff">MISE EN SITUATION · PERSONNAGE FICTIF</text>' : ''}
    <rect x="60" y="${y}" width="960" height="${boxHeight}" rx="38" fill="#071a33" opacity=".78"/>
    <text x="540" y="${textY}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="${isTop ? 800 : 700}" fill="#fff">${lines.map((line, i) => `<tspan x="540" dy="${i ? lineGap : 0}">${esc(line)}</tspan>`).join('')}</text>
  </svg>`;
};

const overlays = {
  'hook-01.png': { lines: ['TU NE COACHES PAS', 'SEULEMENT UNE SÉANCE.'], position: 'top', size: 66, brand: true },
  'hook-02.png': { lines: ['TU AIDES UNE PERSONNE', 'À GARDER UN CAP.'], position: 'top', size: 66, brand: true },
  'hook-03.png': { lines: ['TA MÉTHODE', 'RESTE HUMAINE.'], position: 'top', size: 70, brand: true },
  'hook-04.png': { lines: ['BYL RÉUNIT', 'CE PARCOURS.'], position: 'top', size: 70, brand: true },
  'sub-01.png': { lines: ['Tu ne coaches pas seulement une séance.'] },
  'sub-02.png': { lines: ['Tu aides une personne à savoir où elle va.'] },
  'sub-03.png': { lines: ['Pour cela, chaque étape reste reliée :'] },
  'sub-04.png': { lines: ['dossier, programme, planning,'] },
  'sub-05.png': { lines: ['bilan nutritionnel.'] },
  'sub-06.png': { lines: ['BYL réunit ce parcours', 'dans un même espace professionnel.'], size: 44 },
  'sub-07.png': { lines: ['Pour que ta méthode reste lisible.'] },
  'sub-08.png': { lines: ["Découvre l'espace Pro pendant 14 jours,", 'sans carte bancaire.'], size: 43 },
};

for (const [name, options] of Object.entries(overlays)) {
  await sharp(Buffer.from(overlaySvg(options))).png().toFile(path.join(assetsDir, name));
}
