import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = (await readFile(new URL("../src/hooks/useLocationPreference.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "").replace("export default function", "function");
const storage = new Map();
const listeners = new Map();
const context = {
  Event,
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
  window: {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
    dispatchEvent: (event) => listeners.get(event.type)?.(),
  },
  useSyncExternalStore: (_subscribe, read) => read(),
};
vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.hook = useLocationPreference; globalThis.subscribe = subscribe;`, context);
assert.equal(context.hook()[0], null, "legacy preference remains unset");
let changes = 0;
const cleanup = context.subscribe(() => changes++);
storage.set("BYL_LAT", "43.5");
storage.set("BYL_CITY", "Cannes");
context.hook()[1](false);
assert.equal(context.hook()[0], false);
assert.equal(storage.has("BYL_LAT"), false);
assert.equal(storage.has("BYL_CITY"), false);
assert.equal(changes, 1);
storage.set("BYL_GEO_PERMISSION_DECISION_V1", "denied");
context.hook()[1](true);
assert.equal(context.hook()[0], true);
assert.equal(storage.has("BYL_GEO_PERMISSION_DECISION_V1"), false);
context.window.dispatchEvent(new Event("storage"));
assert.equal(changes, 3, "other tabs also notify the subscription");
cleanup();
assert.equal(listeners.size, 0);
console.log("Location preference: persistence, cache purge, explicit retry, cross-tab subscription and cleanup OK.");

const expectedKeys = ["title", "description", "toggle", "off", "unsupported", "consent", "granted", "blocked", "unknown", "saveError", "scope", "browserSettings", "analyticsHelp", "temporary", "reminderTitle", "reminderBody", "retryHelp", "retry", "later"].sort();
for (const language of ["fr", "en", "de", "it", "es", "ru", "ar"]) {
  const resource = JSON.parse(await readFile(new URL(`../src/i18n/locales/${language}/common.json`, import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(resource.locationPrivacy).sort(), expectedKeys, language);
  for (const value of Object.values(resource.locationPrivacy)) assert.ok(typeof value === "string" && value.trim(), language);
}
for (const page of ["SettingsPageClient", "SettingsPageCoach"]) {
  const content = await readFile(new URL(`../src/pages/${page}.jsx`, import.meta.url), "utf8");
  assert.ok(content.includes("<LocationPreferenceCard"), page);
}
console.log("Shared client/coach location settings and all 19 translations in seven languages OK.");
