import assert from "node:assert/strict";
import {
  applyTimingCalibrationToSessions,
  updateSessionTimingCalibration,
} from "../src/utils/sessionTimingCalibration.js";
import { estimateSessionDurationSeconds } from "../src/utils/trainingEngine.js";

const baseSession = {
  estimatedDurationSec: 3600,
  exercises: [{ "Séries": 1, "Durée (min:sec)": 60, optionsOrder: ["Séries", "Durée (min:sec)"] }],
};

let profile = {};
for (let index = 0; index < 5; index += 1) {
  const result = updateSessionTimingCalibration(profile, {
    basePlannedDurationSec: 3600,
    actualDurationSec: 4500,
    completionId: `completion-${index + 1}`,
    completedAt: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
  });
  assert.equal(result.accepted, true);
  profile = result.profile;
}

assert.equal(profile.sampleCount, 5);
assert.equal(profile.factor, 1.25);
const [calibratedSession] = applyTimingCalibrationToSessions([baseSession], profile);
assert.equal(
  estimateSessionDurationSeconds(calibratedSession),
  4500,
  "five reliable 75-minute sessions should calibrate a 60-minute estimate to 75 minutes"
);
assert.equal(
  estimateSessionDurationSeconds(calibratedSession, { ignoreTimingCalibration: true }),
  3600
);

const outlier = updateSessionTimingCalibration(profile, {
  basePlannedDurationSec: 3600,
  actualDurationSec: 8 * 3600,
});
assert.equal(outlier.accepted, false);
assert.deepEqual(outlier.profile, profile);

const duplicate = updateSessionTimingCalibration(profile, {
  basePlannedDurationSec: 3600,
  actualDurationSec: 4500,
  completionId: "completion-5",
});
assert.equal(duplicate.accepted, false);
assert.equal(duplicate.duplicate, true);
assert.equal(duplicate.profile.sampleCount, 5);

const robust = updateSessionTimingCalibration(
  {
    recentSamples: [
      { ratio: 1, plannedSec: 3600, actualSec: 3600 },
      { ratio: 1, plannedSec: 3600, actualSec: 3600 },
      { ratio: 1, plannedSec: 3600, actualSec: 3600 },
      { ratio: 2.4, plannedSec: 3600, actualSec: 8640 },
    ],
  },
  { basePlannedDurationSec: 3600, actualDurationSec: 3600 }
);
assert.equal(robust.profile.observedFactor, 1);

console.log("Background session timing calibration: OK");
