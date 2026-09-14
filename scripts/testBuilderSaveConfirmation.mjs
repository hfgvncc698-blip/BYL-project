import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { awaitWriteConfirmation } from "../src/utils/awaitWriteConfirmation.js";

let confirm;
let slow = 0;
let settled = false;
const request = new Promise(resolve => { confirm = resolve; });
const pending = awaitWriteConfirmation(request, () => { slow++; }, 5)
  .then(value => { settled = true; return value; });
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(slow, 1);
assert.equal(settled, false, "slow confirmation must not reject or release the save lock");
confirm("saved");
assert.equal(await pending, "saved", "late acknowledgement must reach the UI");
await assert.rejects(awaitWriteConfirmation(Promise.reject(new Error("denied")), () => {}, 5), /denied/);
await awaitWriteConfirmation(Promise.resolve(), () => { slow++; }, 5);
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(slow, 1, "settled operations must clear the notification timer");
const builder = await readFile(new URL("../src/components/ProgramBuilder.jsx", import.meta.url), "utf8");
for (const prop of ["cardBg", "border", "subBg", "textMute", "hoverRow", "strongShadow"]) {
  assert.ok(builder.includes(`prev.${prop} === next.${prop}`), `${prop} must invalidate the exercise card memo`);
}
assert.ok(!/saveWithTimeout\(\s*updateDoc/.test(builder));
console.log("Builder: late confirmation, rejection, timer cleanup and dark-theme invalidation passed.");
