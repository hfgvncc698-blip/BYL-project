// Read-only availability check, including the site's canonical redirects.
// HTTP/app-shell success is not a substitute for rendered browser tests.
import { SEO_PUBLIC_LINKS } from '../src/seo/seoConfig.js';
const base = process.env.PUBLIC_AUDIT_BASE_URL || 'https://boostyourlife.coach';
const routes = [...SEO_PUBLIC_LINKS.map(link => link.href),
  ...['en', 'es', 'de', 'it', 'ru', 'ar'].flatMap(lng => [`/sales-policy?lng=${lng}`, `/logiciel-coach-sportif?lng=${lng}`]),
];
const results = [];
for (const path of routes) {
  const start = Date.now();
  try {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000) });
    const html = await response.text();
    results.push({ path, status: response.status, finalPath: new URL(response.url).pathname,
      redirected: response.redirected, appShell: html.includes('<div id="root">'), ms: Date.now() - start });
  } catch (error) { results.push({ path, error: error.message }); }
}
const failed = results.filter(row => row.status !== 200 || !row.appShell);
console.log(JSON.stringify({ base, checks: results.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exitCode = 1;
