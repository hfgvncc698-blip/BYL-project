import assert from "node:assert/strict";
import { runLimited } from "../src/utils/pageDataCache.js";
import { trimPersistedPageCaches } from "../src/utils/persistedPageCache.js";

const entries = new Map([["byl:programs-page:test", JSON.stringify({ savedAt: 123, data: { text: "x".repeat(10000) } })]]);
const storage = { get length() { return entries.size; }, key: i => [...entries.keys()][i], getItem: k => entries.get(k), removeItem: k => entries.delete(k) };
const parse = JSON.parse;
let parses = 0;
try {
  JSON.parse = (...args) => { parses++; return parse(...args); };
  assert.equal(trimPersistedPageCaches(storage, 100), true);
  assert.equal(parses, 0, "cache within budget must not deserialize payloads");
} finally { JSON.parse = parse; }

const previousWindow = globalThis.window;
const previousNow = Date.now;
let clock = 0;
let yields = 0;
try {
  Date.now = () => clock;
  globalThis.window = { setTimeout: callback => { yields++; return setTimeout(callback, 0); } };
  const result = await runLimited([1, 2, 3, 4, 5], async value => { clock += 5; return value * 2; }, 1);
  assert.deepEqual(result, [2, 4, 6, 8, 10]);
  assert.equal(yields, 2, "cached-work batches yield to browser input");
  await assert.rejects(runLimited([1], async () => { throw new Error("failure"); }), /failure/);
} finally {
  Date.now = previousNow;
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
}
console.log("Interaction scheduling: no unnecessary cache parsing, browser yields, ordered results and error propagation OK.");
