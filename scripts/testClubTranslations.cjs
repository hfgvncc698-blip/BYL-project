const assert = require('node:assert/strict');
const fs = require('node:fs');
const parser = require('@babel/parser');
const { emailCopy, languages } = require('../backend/utils/clubEmailCopy');
const key = text => { let hash = 2166136261; for (const c of text) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619); return 't' + (hash >>> 0).toString(36); };
const dictionaries = Object.fromEntries(languages.map(lang => [lang, lang === 'fr' ? require('../src/i18n/locales/fr/clubRecent.json') : require(`../src/i18n/locales/${lang}/common.json`).clubRecent]));
const placeholders = value => [...value.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();
for (const lang of languages) {
 assert.deepEqual(Object.keys(dictionaries[lang]).sort(), Object.keys(dictionaries.fr).sort(), `${lang}: key coverage`);
 for (const [id,text] of Object.entries(dictionaries.fr)) {
  assert.ok(dictionaries[lang][id]?.trim(), `${lang}: ${id}`);
  assert.deepEqual(placeholders(dictionaries[lang][id]), placeholders(text), `${lang}: ${id} placeholders`);
 }
 const mail = emailCopy(lang, {club:'Demo',client:'Test',amount:'100',label:'Plan',date:'2026-10-08'});
 assert.equal(mail.locale,lang);
 for (const field of ['welcomeSubject','welcomeTitle','clubSubject','clubText','login','paymentSubject','paymentText']) assert.ok(mail[field] && !mail[field].includes('{{'), `${lang}: email ${field}`);
 if(lang !== 'fr') assert.notEqual(mail.clubText,emailCopy('fr',{club:'Demo'}).clubText);
}
const files = fs.readdirSync('src/components/dashboard').filter(name => /^(Club|FormerClub).*\.jsx$/.test(name)).map(name => `src/components/dashboard/${name}`).concat('src/pages/ClubDashboard.jsx','src/components/ClientCreation.jsx','src/components/dashboard/useClientClubClasses.jsx','src/components/dashboard/ClientMemberships.jsx','src/components/dashboard/ClientFollowups.jsx','src/components/ClientDashboard.jsx','src/pages/ProfilePageClient.jsx','src/pages/MessagingPage.jsx');
files.push('src/components/dashboard/ClientCancellationForm.jsx','src/components/dashboard/ClientClubSubscriptions.jsx','src/components/dashboard/ClientCancellationUpdates.jsx','src/components/dashboard/SessionCancellationRequests.jsx','src/components/messaging/CancellationMessage.jsx');
const literalAlternatives=node=>node?.type==='StringLiteral'?[node.value]:node?.type==='ConditionalExpression'?[...literalAlternatives(node.consequent),...literalAlternatives(node.alternate)]:[];
let calls=0;
for(const file of files){const tree=parser.parse(fs.readFileSync(file,'utf8'),{sourceType:'module',plugins:['jsx']});function walk(node){if(!node||typeof node!=='object')return;if(node.type==='JSXText' && /[A-Za-zÀ-ÿ]/.test(node.value)) assert.ok(['OK'].includes(node.value.trim()), `${file}: hardcoded visible text ${node.value.trim()}`);if(node.type==='CallExpression'&&node.callee?.name==='clubText'&&node.arguments[0]){for(const text of literalAlternatives(node.arguments[0])){assert.ok(dictionaries.fr[key(text)],`${file}: untranslated ${text}`);calls++;}}for(const [k,v] of Object.entries(node))if(!['loc','extra'].includes(k))Array.isArray(v)?v.forEach(walk):walk(v);}walk(tree);}
console.log(`Club translations: ${Object.keys(dictionaries.fr).length} entries × 7 languages; ${calls} UI references and email templates verified.`);
const reviewedKeys = ['clubDashboard.todaySchedule.title', 'clubDashboard.todaySchedule.progressLabel', 'clubDashboard.todaySchedule.next', 'clubDashboard.todaySchedule.doneForToday', 'clubDashboard.todaySchedule.empty', 'clubDashboard.calendar.eventDetails', 'common.cancelled'];
const at = (d, path) => path.split('.').reduce((v, k) => v?.[k], d);
for (const lang of languages) {
 const d = require(`../src/i18n/locales/${lang}/common.json`);
 for (const path of reviewedKeys) {
  const text = at(d, path), french = at(require('../src/i18n/locales/fr/common.json'), path);
  assert.ok(text, `${lang}: missing ${path}`);
  assert.deepEqual(placeholders(text), placeholders(french));
  if (lang !== 'fr') assert.notEqual(text, french, `${lang}: French fallback at ${path}`);
 }
}
console.log('Reviewed dashboard labels: all seven languages verified without French fallbacks.');
// Audit the entire club catalogue, including dynamic keys used by cards and menus.
const flatten = (obj, prefix = '', result = {}) => {
 for (const [key, value] of Object.entries(obj)) {
  if (typeof value === 'string') result[prefix + key] = value;
  else if (value && typeof value === 'object') flatten(value, prefix + key + '.', result);
 }
 return result;
};
const clubFrench = flatten(require('../src/i18n/locales/fr/common.json').clubDashboard);
const validEnglishMatches = new Set(['stats.actions', 'log.types.nutrition', 'audit.kind', 'tools.exports', 'views.nutrition', 'guide.badge', 'group.participants']);
for (const lang of languages.filter(l => l !== 'fr')) {
 const translated = flatten(require(`../src/i18n/locales/${lang}/common.json`).clubDashboard);
 for (const [key, french] of Object.entries(clubFrench)) {
  assert.ok(translated[key]?.trim(), `${lang}: missing clubDashboard.${key}`);
  if (!(lang === 'en' && validEnglishMatches.has(key))) assert.notEqual(translated[key], french, `${lang}: French copy in clubDashboard.${key}`);
 }
}
console.log(`Full club catalogue: ${Object.keys(clubFrench).length} keys checked in six translated languages.`);
for (const match of fs.readFileSync('src/components/dashboard/ClubSessionPacks.jsx','utf8').matchAll(/<Field label="([^"]+)"/g)) {
 assert.ok(dictionaries.fr[key(match[1])], `Session pack field: ${match[1]}`);
}
