import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import i18next from 'i18next';

const languages = ['fr', 'en', 'es', 'de', 'it', 'ru', 'ar'];
const files = ['../src/pages/Success.jsx', '../src/pages/Checkout.jsx', '../src/utils/paymentReturn.js'];
const keys = [...new Set(files.flatMap(file =>
  [...readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(/["'](payment\.(?:return|legacy)\.[A-Za-z0-9_]+)["']/g)].map(match => match[1])
))];
assert.equal(keys.filter(key => key.startsWith('payment.return.')).length, 15);
assert.equal(keys.filter(key => key.startsWith('payment.legacy.')).length, 5);
const registrationKeys = ['auth.register.googleDetailsRequired', 'auth.register.googleRegistrationRequired'];
const registrationSource = ['../src/pages/Register.jsx', '../src/AuthContext.jsx']
  .map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
const usedRegistrationKeys = [...new Set([...registrationSource.matchAll(/["'](auth\.register\.google[A-Za-z0-9_]+)["']/g)].map(match => match[1]))];
assert.deepEqual(usedRegistrationKeys.sort(), [...registrationKeys].sort(), 'Every new Google registration key must be explicitly covered');
keys.push(...registrationKeys);

const resources = Object.fromEntries(languages.map(language => [language, {
  common: JSON.parse(readFileSync(new URL(`../src/i18n/locales/${language}/common.json`, import.meta.url), 'utf8')),
}]));
const nested = (data, key) => key.split('.').reduce((node, part) => node?.[part], data);
const i18n = i18next.createInstance();
await i18n.init({ resources, lng: 'fr', ns: ['common'], defaultNS: 'common', fallbackLng: false, interpolation: { escapeValue: false } });

for (const language of languages) {
  await i18n.changeLanguage(language);
  for (const key of keys) {
    const value = nested(resources[language].common, key);
    assert.equal(typeof value, 'string', `${language}: missing ${key}`);
    assert.ok(value.trim(), `${language}: empty ${key}`);
    assert.equal(i18n.t(key), value, `${language}: ${key} did not resolve locally`);
    if (language !== 'fr') assert.notEqual(value, nested(resources.fr.common, key), `${language}: French fallback copied into ${key}`);
  }
  for (const namespace of ['return', 'legacy']) {
    const localeKeys = Object.keys(resources[language].common.payment[namespace]).sort();
    assert.deepEqual(localeKeys, Object.keys(resources.fr.common.payment[namespace]).sort(), `${language}: namespace parity`);
  }
}
console.log(`Payment return + Google registration translations: ${keys.length} used keys × ${languages.length} languages = ${keys.length * languages.length} local resolutions; all JSON valid, no French fallback in non-French languages.`);
