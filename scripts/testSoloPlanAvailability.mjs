import assert from "node:assert/strict";
import { getProPlanAccess, hasPlanModule, canUseGuidedProgram, canUseCustomBranding, canUseNavbarBranding } from "../src/utils/proPlanAccess.js";

for (const packageKey of ["sport", "nutrition", "complete"]) {
  for (const packageTier of ["solo", "growth", "unlimited"]) {
    const access = getProPlanAccess(packageKey, packageTier);
    const user = { role: "coach", proAccess: access };
    assert.equal(hasPlanModule(user, "sport"), packageKey !== "nutrition");
    assert.equal(hasPlanModule(user, "nutrition"), packageKey !== "sport");
    assert.equal(Boolean(canUseCustomBranding(access)), packageTier !== "solo");
    assert.equal(canUseNavbarBranding(access), packageTier === "unlimited");
    assert.equal(canUseGuidedProgram(access), packageKey !== "nutrition" && packageTier !== "solo");
    if (packageTier === "solo") assert.equal(access.clientLimit, 10);
  }
}
console.log("Solo/Growth/Unlimited: module, guided program, branding and Solo limit matrix passed.");

const { canUseAdvancedCalendar } = await import('../src/utils/proPlanAccess.js');
const { default: serverCalendarAccess } = await import('../functions/calendarPlanAccess.cjs');
for (const pack of ['sport', 'nutrition', 'complete']) {
  for (const tier of ['solo', 'growth', 'unlimited']) {
    for (const user of [{packageKey:pack,packageTier:tier}, {proAccess:getProPlanAccess(pack,tier)}]) {
      assert.equal(canUseAdvancedCalendar(user), tier !== 'solo');
      assert.equal(serverCalendarAccess.canUseAdvancedCalendar(user), tier !== 'solo');
    }
  }
}
assert.equal(canUseAdvancedCalendar({proAccess:getProPlanAccess('club','studio')}),true);
console.log('Advanced calendar: all Solo packs blocked, higher tiers and clubs retained; client/server match.');

const { default: backendCalendarAccess } = await import("../backend/utils/calendarPlanAccess.js");
for (const packageKey of ["sport", "nutrition", "complete", "club"]) for (const packageTier of ["solo", "growth", "unlimited", "studio"]) { const user = {packageKey, packageTier}; assert.equal(backendCalendarAccess.canUseAdvancedCalendar(user), canUseAdvancedCalendar(user)); }
