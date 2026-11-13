// Offline build tool: only public food names are sent; nutrients never leave the source file.
import fs from 'node:fs';
import { translateNutritionFoodName } from '../src/utils/nutritionFoodI18n.js';
const rows = JSON.parse(fs.readFileSync(new URL('../public/ciqual_2025.json', import.meta.url)));
const directory = new URL('../public/ciqual-locales/', import.meta.url);
fs.mkdirSync(directory, { recursive: true });
const separator = '\n###BYL_NUTRITION_TRANSLATION_SEPARATOR###\n';
export async function translate(names, lang, attempt = 0) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.search = new URLSearchParams({client:'gtx', sl:'fr', tl:lang, dt:'t', q:names.join(separator)});
  try {
    const res = await fetch(url, {signal: AbortSignal.timeout(30000)});
    if (!res.ok) throw Error(`HTTP ${res.status}`);
    const data = await res.json();
    const parts = data[0].map(p => p[0] || '').join('').split(separator).map(s => s.trim());
    if (parts.length !== names.length || parts.some(s => !s)) throw Error('Translation alignment mismatch');
    return parts;
  } catch(error) {
    if (attempt < 3) return translate(names, lang, attempt + 1);
    if (names.length > 1) {
      const middle = Math.ceil(names.length / 2);
      return [...await translate(names.slice(0,middle),lang), ...await translate(names.slice(middle),lang)];
    }
    throw error;
  }
}
if (process.argv[1] && new URL(import.meta.url).pathname === fs.realpathSync(process.argv[1])) await Promise.all(['en','es','de','it','ar','ru'].map(async lang => {
  const file = new URL(`${lang}.json`, directory);
  const names = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)).names : {};
  const missing = rows.filter(row => !names[row.code]);
  for (let i=0; i<missing.length; i+=25) {
    const batch = missing.slice(i,i+25);
    const translated = await translate(batch.map(row => row.name),lang);
    batch.forEach((row,j) => { const curated = translateNutritionFoodName(row.name,lang); names[row.code] = curated !== row.name ? curated : translated[j]; });
    fs.writeFileSync(file, JSON.stringify({source:'CIQUAL 2025', language:lang, translation:'machine-translated; reviewable by food code', names},null,2)+'\n');
    if (i%250===0) console.log(`${lang}: ${Object.keys(names).length}/${rows.length}`);
  }
}));
