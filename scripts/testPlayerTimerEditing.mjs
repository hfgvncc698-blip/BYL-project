import assert from "node:assert/strict";
import {
  getCappedCountdownSeconds,
  getTrackedTimerSeconds,
} from "../src/utils/playerTimerEditing.js";

assert.equal(getCappedCountdownSeconds(60, 45), 45);
assert.equal(getCappedCountdownSeconds(32, 45), 32);
assert.equal(getCappedCountdownSeconds(32, 20), 20);
assert.equal(getCappedCountdownSeconds(0, 45), 0);
assert.equal(getCappedCountdownSeconds(32, -10), 0);

const repetitionsOnly = {
  optionsOrder: ["Séries", "Répétitions", "Repos (min:sec)"],
  "Durée (min:sec)": 30,
};
assert.equal(
  getTrackedTimerSeconds(repetitionsOnly, "Durée (min:sec)", 30),
  0
);
assert.equal(
  getTrackedTimerSeconds(repetitionsOnly, "Repos (min:sec)", 60),
  60
);
assert.equal(
  getTrackedTimerSeconds({ "Durée (min:sec)": 30 }, "Durée (min:sec)", 30),
  30
);

console.log("Player timer editing tests passed.");
