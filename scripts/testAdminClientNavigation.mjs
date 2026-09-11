import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const dashboard = await readFile(new URL("../src/components/AdminDashboard.jsx", import.meta.url), "utf8");
const profile = await readFile(new URL("../src/pages/AdminClient.jsx", import.meta.url), "utf8");
assert.ok(dashboard.includes('navigate(`/admin/client/${encodeURIComponent(row.id)}`)'));
assert.ok(dashboard.includes("onClick={() => openClientProfile(c)}"));
assert.ok(dashboard.includes("onPreview={() => openClientDrawer(c)}"));
assert.ok(dashboard.includes("event.stopPropagation(); onClick();"));
assert.ok(dashboard.includes("<ClientPreviewButton onClick={() => openClientDrawer(c)}"));
assert.ok(dashboard.includes('aria-label={label}'));
assert.ok(dashboard.includes(": openClientProfile(r)"));
assert.ok(dashboard.includes('get("clientPreview")'));
assert.ok(profile.includes('navigate(`/admin?clientPreview=${encodeURIComponent(id)}`)'));
assert.ok(dashboard.includes("const handleSaveAdminNote"), "existing notes editor remains intact");
for (const language of ["fr", "en", "de", "it", "es", "ru", "ar"]) {
  const resource = JSON.parse(await readFile(new URL(`../src/i18n/locales/${language}/common.json`, import.meta.url), "utf8"));
  for (const key of ["preview", "hint", "notes"]) assert.ok(resource.adminClientNavigation[key], `${language}: ${key}`);
}
console.log("Admin client navigation source checks: direct profile, separate preview, notes shortcut and seven languages OK.");
