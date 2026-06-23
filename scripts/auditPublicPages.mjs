import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SEO_PUBLIC_LINKS, SEO_ROUTES, seoUrlForPath } from "../src/seo/seoConfig.js";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const baseUrl = process.env.PUBLIC_AUDIT_BASE_URL || "http://localhost:5173";
const languages = ["fr", "en", "es", "de", "it", "ru", "ar"];
const publicPaths = SEO_PUBLIC_LINKS.map((link) => link.href);
const resourcePaths = [
  "/logiciel-coach-sportif",
  "/application-coach-sportif",
  "/logiciel-suivi-client-coach",
  "/application-coaching-nutrition",
  "/logiciel-nutritionniste",
  "/logiciel-coach-sportif-nutrition",
  "/logiciel-club-sport",
  "/logiciel-salle-de-sport",
];

function distIndexFor(route) {
  if (route === "/") return "dist/index.html";
  return `dist${route}/index.html`;
}

async function assertHttpOk(route, lng) {
  const url = new URL(route, baseUrl);
  if (lng !== "fr") url.searchParams.set("lng", lng);
  const response = await fetch(url, { redirect: "manual" });
  assert.equal(response.status, 200, `${url.href} must return HTTP 200`);
  const html = await response.text();
  assert.ok(html.includes('<div id="root">'), `${url.href} must serve the app shell`);
}

for (const route of publicPaths) {
  assert.ok(SEO_ROUTES[route], `${route} is listed publicly but missing from SEO_ROUTES`);
}

const appSource = read("src/App.jsx");
assert.ok(appSource.includes('path="/plans/professionnel"'), "Pricing route must be registered");
assert.ok(appSource.includes('path="/:slug"'), "SEO resource slug route must be registered");
for (const route of ["/about", "/contact", "/privacy", "/terms", "/sales-policy"]) {
  assert.ok(appSource.includes(`path="${route}"`), `${route} route must be registered`);
}

const sitemap = read("public/sitemap.xml");
for (const route of Object.keys(SEO_ROUTES)) {
  const expected = seoUrlForPath(route);
  assert.ok(sitemap.includes(`<loc>${expected}</loc>`), `sitemap must include ${expected}`);
}

for (const route of Object.keys(SEO_ROUTES)) {
  const file = distIndexFor(route);
  assert.ok(exists(file), `${file} must exist after build`);
  const html = read(file);
  assert.ok(html.includes(`<title>${SEO_ROUTES[route].title}</title>`), `${file} must contain the route title`);
  assert.ok(html.includes(`content="${SEO_ROUTES[route].description}"`), `${file} must contain the route description`);
}

const seoLanding = read("src/pages/SeoLandingPage.jsx");
for (const lng of ["es", "de", "it", "ru", "ar"]) {
  assert.ok(seoLanding.includes(`  ${lng}: {`), `Resource pages must include ${lng} translations`);
  for (const route of resourcePaths) {
    const slug = route.slice(1);
    assert.ok(
      new RegExp(`\\b${lng}: \\{[\\s\\S]*?"${slug}"`).test(seoLanding),
      `Resource pages must include ${lng} translation for ${slug}`
    );
  }
}

for (const route of publicPaths) {
  await assertHttpOk(route, "fr");
}

for (const lng of languages.filter((item) => item !== "fr")) {
  await assertHttpOk("/sales-policy", lng);
  await assertHttpOk("/logiciel-coach-sportif", lng);
}

console.log(`Public pages audit OK: ${publicPaths.length} public routes checked on ${baseUrl}.`);
