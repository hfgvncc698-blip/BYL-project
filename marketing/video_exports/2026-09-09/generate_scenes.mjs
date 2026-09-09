import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const runtimeRequire = createRequire('/Users/tommarie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const sharp = runtimeRequire('sharp');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const generated = path.join(here, 'sources', 'generated');
fs.mkdirSync(generated, { recursive: true });

const dataUrl = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
const hero = dataUrl(path.join(root, 'public/hero-coach-v2.jpg'), 'image/jpeg');
const mockup = dataUrl(path.join(root, 'public/Mockup.png'), 'image/png');
const logo = dataUrl(path.join(root, 'public/logo-byl.png'), 'image/png');

const videos = {
  'video-01-suivi-disperse': [
    [3, 'hero', 'Votre suivi tient dans', 'combien d’endroits ?', ['Votre suivi client tient dans', 'combien d’endroits ?'], 'QUESTION MÉTIER'],
    [4, 'hero', 'MESSAGES • PLANNING', 'PROGRAMMES', ['Les messages d’un côté. Le planning de l’autre.', 'Les programmes ailleurs.'], 'DISPERSION'],
    [3, 'product', 'Où est la bonne', 'information ?', ['Et au moment d’ajuster une séance…', 'où est la bonne information ?'], 'APERÇU OFFICIEL STATIQUE'],
    [4, 'product', 'UN MÊME ESPACE', '', ['BYL réunit vos clients, vos programmes', 'et vos séances dans un même espace.'], 'CLARTÉ'],
    [6, 'product', 'CLIENT → PROGRAMME', '→ VALIDATIONS', ['Vous ouvrez le dossier du client, retrouvez', 'son programme et consultez ses validations.'], 'PARCOURS RELIÉ'],
    [3, 'product', 'VOTRE MÉTHODE', 'UN SUIVI PLUS LISIBLE', ['Votre méthode reste la vôtre.', 'Le suivi devient plus lisible.'], 'SANS INTERACTION SIMULÉE'],
    [4, 'cta', 'ESSAI PRO COMPLET', '14 JOURS • SANS CARTE', ['Testez l’espace Pro pendant 14 jours,', 'sans carte bancaire.'], 'DÉMARRER MON ESSAI PRO']
  ],
  'video-02-programme-vs-suivi': [
    [2, 'hero', 'UN PROGRAMME', '≠ UN SUIVI', ['Un programme n’est pas un suivi.'], 'IDÉE À RETENIR'],
    [4, 'hero', 'PRÉVOIR', '', ['Le programme indique', 'ce qui est prévu.'], 'PROGRAMME'],
    [5, 'product', 'PLANIFIER → VALIDER', '→ SUIVRE', ['Le suivi montre quand la séance a lieu, si elle est validée', 'et comment le parcours avance.'], 'APERÇU OFFICIEL STATIQUE'],
    [4, 'product', 'DOCUMENT', '≠ CONTINUITÉ', ['Sans ces informations, vous avez un document.', 'Pas encore une continuité.'], 'DISTINCTION'],
    [6, 'product', 'PROGRAMME + CLIENT', '+ SÉANCES', ['Dans BYL, le programme reste relié', 'au client et à ses séances.'], 'PARCOURS RELIÉ'],
    [4, 'cta', 'DÉCOUVREZ L’ESPACE PRO', '14 JOURS • SANS CARTE', ['Découvrez l’espace Pro pendant 14 jours,', 'sans carte bancaire.'], 'DÉMARRER MON ESSAI PRO']
  ],
  'video-03-creer-assigner-suivre': [
    [3, 'hero', 'LE PARCOURS', 'D’UN PROGRAMME', ['Voici le parcours d’un programme', 'dans BYL, en trois étapes.'], '1 / 3'],
    [7, 'product', '1. CRÉER', 'PROGRAMME • SÉANCES', ['Première étape : créez votre programme', 'et structurez ses séances.'], '1 / 3 • APERÇU STATIQUE'],
    [7, 'product', '2. ASSIGNER', 'PROGRAMME → CLIENT', ['Deuxième étape : choisissez le client', 'et assignez-lui ce programme.'], '2 / 3 • APERÇU STATIQUE'],
    [7, 'product', '3. SUIVRE', 'SÉANCES • VALIDATIONS', ['Troisième étape : consultez les séances et les validations', 'qui mettent la progression à jour.'], '3 / 3 • APERÇU STATIQUE'],
    [3, 'product', 'CRÉER → ASSIGNER', '→ SUIVRE', ['Créer. Assigner. Suivre.', 'Le parcours reste relié.'], 'PARCOURS RELIÉ'],
    [4, 'cta', 'ESSAI PRO COMPLET', '14 JOURS • SANS CARTE', ['Essayez l’espace Pro complet pendant 14 jours,', 'sans carte bancaire.'], 'TESTER CE PARCOURS']
  ]
};

function esc(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function lines(items, x, y, size, weight = 700, fill = '#ffffff', anchor = 'middle', gap = 1.18) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial" font-size="${size}" font-weight="${weight}" fill="${fill}">${items.map((line, i) => `<tspan x="${x}" dy="${i ? size * gap : 0}">${esc(line)}</tspan>`).join('')}</text>`;
}

function svgFor(kind, title1, title2, subtitle, badge, index, count) {
  const title = [title1, title2].filter(Boolean);
  const progress = Math.round(((index + 1) / count) * 900);
  const longestSubtitle = Math.max(...subtitle.map((line) => line.length));
  const subtitleSize = longestSubtitle > 64 ? 34 : longestSubtitle > 52 ? 38 : longestSubtitle > 44 ? 42 : 47;
  const media = kind === 'hero'
    ? `<image href="${hero}" x="0" y="0" width="1080" height="1920" preserveAspectRatio="xMinYMid slice"/><rect width="1080" height="1920" fill="#07192e" opacity="0.54"/>`
    : kind === 'product'
      ? `<rect width="1080" height="1920" fill="url(#bg)"/><rect x="46" y="475" width="988" height="850" rx="42" fill="#ffffff" opacity="0.08"/><image href="${mockup}" x="-155" y="535" width="1390" height="808" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect width="1080" height="1920" fill="url(#bg)"/><circle cx="540" cy="490" r="220" fill="#163f69" opacity="0.52"/><image href="${logo}" x="390" y="340" width="300" height="300" preserveAspectRatio="xMidYMid meet"/>`;
  const titleY = kind === 'cta' ? 800 : 245;
  const subtitleY = kind === 'cta' ? 1375 : 1470;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#07192e"/><stop offset="1" stop-color="#123e69"/></linearGradient></defs>
${media}
<rect x="90" y="105" width="900" height="10" rx="5" fill="#ffffff" opacity="0.20"/><rect x="90" y="105" width="${progress}" height="10" rx="5" fill="#50c8ff"/>
<rect x="90" y="145" width="${Math.min(850, badge.length * 23 + 60)}" height="62" rx="31" fill="#0a3765" opacity="0.96"/>
${lines([badge], 120, 187, 31, 700, '#76d7ff', 'start')}
${lines(title, 540, titleY, kind === 'cta' ? 68 : 72)}
<rect x="70" y="1390" width="940" height="275" rx="38" fill="#07192e" opacity="0.92"/>
${lines(subtitle, 540, subtitleY, subtitleSize, 700)}
${kind === 'cta' ? `<rect x="150" y="1120" width="780" height="130" rx="65" fill="#2c9dea"/>${lines(['BoostYourLife.coach'], 540, 1202, 48, 700)}` : `<text x="540" y="1740" text-anchor="middle" font-family="Arial" font-size="30" fill="#b9cde2">Prototype • aucune interaction produit simulée</text>`}
</svg>`;
}

for (const [slug, scenes] of Object.entries(videos)) {
  const dir = path.join(generated, slug);
  fs.mkdirSync(dir, { recursive: true });
  const rows = [];
  for (const [index, scene] of scenes.entries()) {
    const [duration, kind, t1, t2, subtitle, badge] = scene;
    const basename = String(index + 1).padStart(2, '0');
    const svgName = `${basename}.svg`;
    const pngName = `${basename}.png`;
    const svg = svgFor(kind, t1, t2, subtitle, badge, index, scenes.length);
    fs.writeFileSync(path.join(dir, svgName), svg);
    await sharp(Buffer.from(svg)).png().toFile(path.join(dir, pngName));
    rows.push(`${pngName}\t${duration}`);
  }
  fs.writeFileSync(path.join(dir, 'scenes.tsv'), `${rows.join('\n')}\n`);
}
