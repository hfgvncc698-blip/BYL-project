import i18n from './index';
// Load the club dictionary only when club features are used.
import('./locales/fr/clubRecent.json').then(module => {
  i18n.addResourceBundle('fr', 'common', { clubRecent: module.default }, true, true);
  i18n.emit('languageChanged', i18n.language);
});
// Stable keys keep the original wording readable without shipping a second dictionary.
export const clubTextKey = text => {
  let hash = 2166136261;
  for (const char of String(text || '')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return 'clubRecent.t' + (hash >>> 0).toString(36);
};
export const clubText = (text, options = {}) => text == null ? text : i18n.t(clubTextKey(text), { defaultValue: text, ...options });
export const clubLocale = () => i18n.language || i18n.resolvedLanguage || 'fr';
