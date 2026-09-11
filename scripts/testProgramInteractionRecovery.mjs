import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { programReadDeadline } from "../src/utils/programReadDeadline.js";

assert.equal(await programReadDeadline(Promise.resolve("loaded"), 20), "loaded");
await assert.rejects(programReadDeadline(new Promise(() => {}), 5), { code: "deadline-exceeded" });
await assert.rejects(programReadDeadline(Promise.reject(new Error("denied")), 20), /denied/);
const builder = await readFile(new URL("../src/components/ProgramBuilder.jsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/components/ProgramBuilderPage.jsx", import.meta.url), "utf8");
const list = await readFile(new URL("../src/components/ProgramsPage.jsx", import.meta.url), "utf8");
assert.ok(!layout.includes('root.style.overflow = "hidden"'), "builder cannot leave the application scroll locked");
assert.ok(layout.includes('display={{ base: "none", lg: "block" }}'), "bank cannot squeeze the mobile builder");
const mobile = builder.slice(builder.indexOf('"@media (max-width: 768px)"'));
assert.ok(!mobile.slice(0, 500).includes('position: "fixed"'), "mobile builder uses the parent scroll container");
assert.ok(builder.includes('onSnapshot(programDocRef, (snap) => programSnapshotHandlerRef.current(snap))'));
assert.ok(builder.includes('}, [programDocRef]);'), "edits do not recreate the subscription");
assert.ok(!list.includes('backdropFilter="blur(16px)"'));
assert.ok(list.includes('programReadDeadline(firestoreGetDocs(ref))'));
console.log("Read deadlines, mobile scroll ownership, no global scroll lock, stable subscription and lighter list source checks passed.");
