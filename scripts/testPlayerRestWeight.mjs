import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../src/components/SessionPlayer.jsx", import.meta.url), "utf8");
const build = source.slice(source.indexOf("function buildExercisePerformanceSet("), source.indexOf("function buildExercisePerformanceSnapshots("));
const stage = source.slice(source.indexOf("  function stageCurrentSetPerformance("), source.indexOf("  function seedFollowingSetPerformance("));
const drafts = new Map();
const performed = new Map([["0:1", { set: { chargeKg: 100, restSec: 42 } }], ["0:2", { set: { chargeKg: 100 } }]]);
const context = vm.createContext({
  exIndex: 0, currentSet: 1, phase: "rest", flat: [{ charge: 100 }],
  performanceDraftsRef: { current: drafts }, performedSetsRef: { current: performed },
  getPerformanceSetKey: (exercise, set) => `${exercise}:${set}`,
  refreshPerformanceDrafts: () => {},
  isPerformanceOptionTracked: (_, label) => label === "Charge (kg)",
  readExerciseMetric: (exercise, key) => exercise[key],
  parseMetricNumber: Number,
  formatHistoryValue: (_, value) => String(value),
});
vm.runInContext(`${build}\n${stage}\nstageCurrentSetPerformance("Charge (kg)", 80);`, context);
assert.equal(performed.get("0:1").set.chargeKg, 80);
assert.equal(performed.get("0:1").set.values["Charge (kg)"].raw, 80);
assert.equal(performed.get("0:2").set.chargeKg, 100);
// The editor keeps its original onChange closure when the timer advances.
context.phase = "ready";
vm.runInContext('stageCurrentSetPerformance("Charge (kg)", 75);', context);
assert.equal(performed.get("0:1").set.chargeKg, 75);
assert.equal(performed.get("0:1").set.restSec, 42);
assert.equal(performed.get("0:2").set.chargeKg, 100);
assert.ok(source.includes("editCommitRef.current = onChange"));
assert.ok(source.includes("commitValue(Number(normalized))"));
console.log("Player: prefilled weight, rest correction and late commit preserve the original set.");
