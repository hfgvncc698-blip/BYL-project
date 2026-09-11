import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Execute the real hook with a small deterministic React/browser harness.
// No network, real location, Firebase writes, or browser permission changes.
const source = (await readFile(new URL("../src/hooks/useGeolocation.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
  .replace("export const GEO_PERMISSION_DECISION_KEY", "const GEO_PERMISSION_DECISION_KEY")
  .replace("export default function useGeolocation", "function useGeolocation");

const PAGE_LOAD_KEY = "BYL_GEO_PAGE_LOAD_ID";
const DECISION_KEY = "BYL_GEO_PERMISSION_DECISION_V1";
const pageLoadId = "current-test-page";
const sample = {
  coords: { latitude: 43.552, longitude: 7.017, accuracy: 15 },
  timestamp: Date.now(),
};

function createHarness({ permission = "granted", permissionsSupported = true, stored = {}, geocode = async () => null } = {}) {
  let cursor = 0;
  let pendingEffects = [];
  let props = { enabled: true, watch: true, saveAnalytics: true, uid: null };
  const slots = [];
  const storage = new Map(Object.entries(stored));
  const events = [];
  const watches = [];
  const permissionStatus = { state: permission, onchange: null };
  const context = {
    console, Date, Number, Math, JSON, Infinity, Error, Event,
    GEO_PAGE_LOAD_ID: pageLoadId,
    GEO_PAGE_LOAD_STORAGE_KEY: PAGE_LOAD_KEY,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    window: { dispatchEvent: (event) => events.push(event.type) },
    navigator: {
      ...(permissionsSupported ? { permissions: { query: async () => permissionStatus } } : {}),
      geolocation: {
        watchPosition(success, fail, options) {
          watches.push({ success, fail, options });
          return watches.length - 1;
        },
        getCurrentPosition(success, fail) { watches.push({ success, fail }); },
        clearWatch(id) { watches[id].cleared = true; },
      },
    },
    resolveCityCountry: geocode,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => {
        slots[index] = typeof value === "function" ? value(slots[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          slots[index] = { dependencies, cleanup: effect() };
        });
      }
    },
  };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.runHook = useGeolocation;`, context);

  const render = (nextProps = {}) => {
    props = { ...props, ...nextProps };
    cursor = 0;
    pendingEffects = [];
    const result = context.runHook(props);
    pendingEffects.forEach((effect) => effect());
    return result;
  };

  return {
    storage, events, watches, render,
    async start() { render(); await Promise.resolve(); return render(); },
    changePermission(state) {
      permissionStatus.state = state;
      permissionStatus.onchange?.();
      return render();
    },
    async publish(position = sample) { await watches.at(-1).success(position); },
    fail(code) { watches.at(-1).fail({ code }); },
  };
}

let passed = 0;
async function test(name, run) {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
}

await test("only an explicit retry restarts a previously refused request", async () => {
  const h = createHarness({ permission: "prompt", stored: { [DECISION_KEY]: "denied" } });
  await h.start();
  assert.equal(h.watches.length, 0);
  h.render().retryPermission();
  h.render();
  assert.equal(h.watches.length, 1);
  await h.publish();
  h.changePermission("granted");
  assert.equal(h.watches.length, 1);
  assert.equal(h.storage.get(DECISION_KEY), "granted");
});

await test("retry cannot bypass a browser-level denial", async () => {
  const h = createHarness({ permission: "denied", stored: { [DECISION_KEY]: "denied" } });
  await h.start();
  assert.equal(h.render().permissionBlocked, true);
  h.render().retryPermission();
  h.render();
  assert.equal(h.watches.length, 0);
  assert.equal(h.storage.get(DECISION_KEY), "denied");
  h.changePermission("granted");
  assert.equal(h.watches.length, 1, "changing browser settings resumes location");
});

await test("retry supports browsers without Permissions API and respects consent", async () => {
  const h = createHarness({ permissionsSupported: false, stored: { [DECISION_KEY]: "denied" } });
  await h.start();
  h.render({ enabled: false }).retryPermission();
  h.render();
  assert.equal(h.watches.length, 0);
  h.render({ enabled: true }).retryPermission();
  h.render();
  assert.equal(h.watches.length, 1);
});

await test("a new page immediately discards coordinates from an older opening", async () => {
  const h = createHarness({ stored: { [PAGE_LOAD_KEY]: "old-page", BYL_LAT: "44", BYL_LNG: "8" } });
  h.render();
  assert.equal(h.storage.has("BYL_LAT"), false);
  assert.equal(h.storage.has(PAGE_LOAD_KEY), false);
  await Promise.resolve();
  h.render();
  await h.publish();
  assert.equal(h.storage.get("BYL_LAT"), "43.552");
  assert.equal(h.storage.get(PAGE_LOAD_KEY), pageLoadId);
});

await test("authentication resolving preserves fresh same-page coordinates", async () => {
  const h = createHarness();
  await h.start();
  await h.publish();
  h.render({ uid: "authenticated-user", saveUserLocation: true });
  assert.equal(h.watches.length, 1, "authentication must not request permission again");
  assert.equal(h.watches[0].cleared, undefined);
  await h.publish();
  assert.equal(h.storage.get("BYL_LAT"), "43.552");
  assert.equal(h.storage.get(PAGE_LOAD_KEY), pageLoadId);
  assert.equal(h.events.length, 1, "same location must not generate duplicate notifications");
});

await test("prompt becoming granted preserves a position already received", async () => {
  const h = createHarness({ permission: "prompt" });
  await h.start();
  await h.publish();
  h.changePermission("granted");
  assert.equal(h.watches.length, 1, "accepting permission must retain the original request");
  assert.equal(h.watches[0].cleared, undefined);
  await h.publish();
  assert.equal(h.storage.get("BYL_LAT"), "43.552");
  assert.equal(h.storage.get(PAGE_LOAD_KEY), pageLoadId);
  assert.equal(h.events.length, 1);
});

await test("accepting permission before the GPS callback keeps that callback active", async () => {
  const h = createHarness({ permission: "prompt" });
  await h.start();
  const original = h.watches[0];
  h.changePermission("granted");
  await original.success(sample);
  assert.equal(h.watches.length, 1);
  assert.equal(h.storage.get("BYL_LAT"), "43.552");
  assert.equal(h.storage.get(DECISION_KEY), "granted");
});

await test("remembering a grant still requests fresh coordinates at each opening", async () => {
  for (let opening = 0; opening < 2; opening += 1) {
    const h = createHarness({ stored: { [DECISION_KEY]: "granted" } });
    await h.start();
    assert.equal(h.watches.length, 1);
    assert.equal(h.watches[0].options.maximumAge, 0);
    await h.publish();
    assert.equal(h.storage.get(DECISION_KEY), "granted");
  }
});

await test("without Permissions API, identity changes do not restart GPS either", async () => {
  const h = createHarness({ permissionsSupported: false });
  await h.start();
  h.render({ uid: "authenticated-user", saveUserLocation: true });
  assert.equal(h.watches.length, 1);
  assert.equal(h.watches[0].cleared, undefined);
});

await test("permission revocation clears coordinates and invalidates old callbacks", async () => {
  const h = createHarness();
  await h.start();
  await h.publish();
  const oldWatch = h.watches.at(-1);
  h.changePermission("denied");
  assert.equal(h.storage.has("BYL_LAT"), false);
  assert.equal(h.storage.get(DECISION_KEY), "denied");
  await oldWatch.success(sample);
  assert.equal(h.storage.has("BYL_LAT"), false);
  h.changePermission("prompt");
  assert.equal(h.watches.length, 1, "remembered refusal must not prompt again automatically");
});

await test("remembered refusal prevents a prompt when Permissions API is unavailable", async () => {
  const h = createHarness({ permissionsSupported: false, stored: { [DECISION_KEY]: "denied" } });
  await h.start();
  assert.equal(h.watches.length, 0);
});

await test("an explicit browser grant can supersede a remembered refusal", async () => {
  const h = createHarness({ stored: { [DECISION_KEY]: "denied" } });
  await h.start();
  await h.publish();
  assert.equal(h.storage.get(DECISION_KEY), "granted");
  assert.equal(h.storage.get("BYL_LAT"), "43.552");
});

await test("permission errors clear the cache even without Permissions API", async () => {
  const h = createHarness({ permissionsSupported: false });
  await h.start();
  await h.publish();
  h.fail(1);
  assert.equal(h.storage.has("BYL_LAT"), false);
  assert.equal(h.storage.get(DECISION_KEY), "denied");
  await h.publish();
  assert.equal(h.storage.has("BYL_LAT"), false);
});

await test("late geocoding cannot republish a position after permission is denied", async () => {
  let finishGeocoding;
  const h = createHarness({ geocode: () => new Promise((resolve) => { finishGeocoding = resolve; }) });
  await h.start();
  const pending = h.publish();
  assert.equal(h.storage.get("BYL_LAT"), "43.552", "coordinates are available before geocoding finishes");
  h.fail(1);
  finishGeocoding({ city: "Cannes", country: "FR" });
  await pending;
  assert.equal(h.storage.has("BYL_LAT"), false);
  assert.equal(h.events.length, 1, "no new notification after refusal");
});

await test("identity changes preserve in-flight geocoding and newer measurements", async () => {
  const completions = [];
  const h = createHarness({ geocode: () => new Promise((resolve) => completions.push(resolve)) });
  await h.start();
  const oldRequest = h.publish();
  h.render({ uid: "authenticated-user" });
  const replacement = h.publish();
  assert.equal(completions.length, 2);
  completions[0]({ city: "Old result", country: "FR" });
  await oldRequest;
  assert.equal(h.events.length, 2, "both GPS measurements were published without waiting for their city");
  completions[1]({ city: "Cannes", country: "FR" });
  await replacement;
  assert.equal(h.storage.get("BYL_CITY"), "Cannes");
  assert.equal(h.storage.get("BYL_LAT"), "43.552");
});

await test("out-of-order geocoding never overwrites a newer published position", async () => {
  const completions = [];
  const h = createHarness({ geocode: () => new Promise((resolve) => completions.push(resolve)) });
  await h.start();
  const older = h.publish();
  const newerSample = {
    coords: { latitude: 43.601, longitude: 6.995, accuracy: 12 },
    timestamp: sample.timestamp + 60_000,
  };
  const newer = h.publish(newerSample);
  completions[1]({ city: "Mougins", country: "FR" });
  await newer;
  completions[0]({ city: "Cannes", country: "FR" });
  await older;
  assert.equal(h.storage.get("BYL_CITY"), "Mougins");
  assert.equal(h.storage.get("BYL_LAT"), "43.601");
  assert.equal(h.storage.get("BYL_GEO_UPDATED_AT"), String(newerSample.timestamp));
  assert.equal(h.events.length, 3, "two immediate positions and only the newest city enrichment");
});

for (const option of ["saveAnalytics", "enabled"]) {
  await test(`turning ${option} off clears cached coordinates and stops publication`, async () => {
    const h = createHarness();
    await h.start();
    await h.publish();
    const previousWatch = h.watches.at(-1);
    h.render({ [option]: false });
    assert.equal(h.storage.has("BYL_LAT"), false);
    assert.equal(h.storage.has(PAGE_LOAD_KEY), false);
    await previousWatch.success(sample);
    if (option === "saveAnalytics") await h.publish();
    assert.equal(h.storage.has("BYL_LAT"), false);
    assert.equal(h.events.length, 1);
  });

  await test(`turning ${option} off invalidates in-flight geocoding`, async () => {
    let finishGeocoding;
    const h = createHarness({ geocode: () => new Promise((resolve) => { finishGeocoding = resolve; }) });
    await h.start();
    const pending = h.publish();
    h.render({ [option]: false });
    finishGeocoding({ city: "Cannes", country: "FR" });
    await pending;
    assert.equal(h.storage.has("BYL_LAT"), false);
    assert.equal(h.storage.has(PAGE_LOAD_KEY), false);
    assert.equal(h.events.length, 1, "pending city cannot republish after disabling");
  });
}

console.log(`${passed} geolocation lifecycle checks passed.`);
