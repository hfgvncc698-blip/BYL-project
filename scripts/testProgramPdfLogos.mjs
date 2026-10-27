import assert from "node:assert/strict";
import { loadProgramPdfLogos } from "../src/utils/programPdfLogos.js";

const user = { proAccess: { branding: "documents" }, logoUrl: "logos/coach/new.png" };
let finishCustom;
const pending = loadProgramPdfLogos({ user, convertImage: (source) => source.startsWith("/")
  ? Promise.resolve("site-image")
  : new Promise((resolve) => { finishCustom = resolve; }) });
let ready = false;
pending.then(() => { ready = true; });
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(ready, false, "Export must wait for the custom logo");
finishCustom("custom-image");
assert.deepEqual(await pending, { headerLogo: "custom-image", footerLogo: "site-image" });
assert.deepEqual(await loadProgramPdfLogos({ user: { proAccess: { branding: "none" } }, convertImage: async () => "site-image" }),
  { headerLogo: "site-image", footerLogo: "site-image" });
await assert.rejects(loadProgramPdfLogos({ user, convertImage: async () => null }), /logos/);
console.log("PDF logos: delayed loading, separate branding, default and failure verified.");
