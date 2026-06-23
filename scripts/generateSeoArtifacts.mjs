import fs from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_OG_IMAGE,
  NOINDEX_STATIC_ROUTES,
  SEO_LASTMOD,
  SEO_PUBLIC_LINKS,
  SEO_ROUTES,
  SITE_URL,
  seoUrlForPath,
} from "../src/seo/seoConfig.js";

const rootDir = process.cwd();
const publicDir = path.join(rootDir, "public");
const distDir = path.join(rootDir, "dist");

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const routeEntries = Object.entries(SEO_ROUTES)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([route, seo]) => ({
    route,
    url: seoUrlForPath(route),
    ...seo,
  }));

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routeEntries.map((entry) => `  <url>
    <loc>${entry.url}</loc>
    <lastmod>${SEO_LASTMOD}</lastmod>
    <changefreq>${entry.changefreq || "monthly"}</changefreq>
    <priority>${entry.priority || "0.5"}</priority>
  </url>`).join("\n")}
</urlset>
`;

const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;

const setTitle = (html, title) =>
  html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);

const setMeta = (html, selector, attrs) => {
  const attrName = selector.startsWith("property:") ? "property" : "name";
  const attrValue = selector.replace(/^(name|property):/, "");
  const tag = `<meta ${attrName}="${escapeHtml(attrValue)}" ${Object.entries(attrs)
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
    .join(" ")} />`;
  const re = new RegExp(`<meta\\s+[^>]*${attrName}=["']${attrValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i");
  return re.test(html) ? html.replace(re, tag) : html.replace("</head>", `    ${tag}\n  </head>`);
};

const setCanonical = (html, href) => {
  const tag = `<link rel="canonical" href="${escapeHtml(href)}" />`;
  return /<link\s+[^>]*rel=["']canonical["'][^>]*>/i.test(html)
    ? html.replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/i, tag)
    : html.replace("</head>", `    ${tag}\n  </head>`);
};

const removeStaticJsonLd = (html) =>
  html.replace(/\s*<script id="byl-static-[^"]+" type="application\/ld\+json">[\s\S]*?<\/script>/g, "");

const staticJsonLd = (id, data) =>
  `<script id="byl-static-${id}" type="application/ld+json">${JSON.stringify(data)}</script>`;

const buildRouteHtml = (baseHtml, route, seo) => {
  const canonical = seoUrlForPath(route);
  let html = removeStaticJsonLd(baseHtml);
  html = setTitle(html, seo.title);
  html = setMeta(html, "name:description", { content: seo.description });
  html = setMeta(html, "name:robots", { content: "index,follow" });
  if (seo.keywords) html = setMeta(html, "name:keywords", { content: seo.keywords });
  html = setCanonical(html, canonical);
  html = setMeta(html, "property:og:type", { content: "website" });
  html = setMeta(html, "property:og:url", { content: canonical });
  html = setMeta(html, "property:og:title", { content: seo.title });
  html = setMeta(html, "property:og:description", { content: seo.description });
  html = setMeta(html, "property:og:image", { content: DEFAULT_OG_IMAGE });
  html = setMeta(html, "property:og:site_name", { content: "BoostYourLife.coach" });
  html = setMeta(html, "name:twitter:card", { content: "summary_large_image" });
  html = setMeta(html, "name:twitter:url", { content: canonical });
  html = setMeta(html, "name:twitter:title", { content: seo.title });
  html = setMeta(html, "name:twitter:description", { content: seo.description });
  html = setMeta(html, "name:twitter:image", { content: DEFAULT_OG_IMAGE });

  const jsonLd = [
    staticJsonLd("organization", {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "BoostYourLife.coach",
      url: SITE_URL,
      logo: DEFAULT_OG_IMAGE,
      brand: {
        "@type": "Brand",
        name: "BoostYourLife.coach",
      },
      sameAs: [
        "https://www.facebook.com/boostUlife",
        "https://www.instagram.com/boost_your_life",
      ],
    }),
    staticJsonLd("website", {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "BoostYourLife.coach",
      url: SITE_URL,
    }),
    staticJsonLd("webpage", {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: seo.title,
      description: seo.description,
      url: canonical,
      isPartOf: {
        "@type": "WebSite",
        name: "BoostYourLife.coach",
        url: SITE_URL,
      },
    }),
    staticJsonLd("sitelinks", {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: SEO_PUBLIC_LINKS.map((link, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: link.label,
        url: seoUrlForPath(link.href),
      })),
    }),
    staticJsonLd("software", {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "BoostYourLife.coach",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      image: DEFAULT_OG_IMAGE,
      description: "Logiciel web pour coachs sportifs, pros nutrition et clubs.",
      offers: {
        "@type": "Offer",
        url: seoUrlForPath("/plans/professionnel"),
        priceCurrency: "EUR",
      },
    }),
  ].join("\n    ");

  return html.replace("</head>", `    ${jsonLd}\n  </head>`);
};

const buildNoindexHtml = (baseHtml, route) => {
  const title = "BoostYourLife.coach";
  const description = "Espace privé BoostYourLife.coach.";
  let html = removeStaticJsonLd(baseHtml);
  html = setTitle(html, title);
  html = setMeta(html, "name:description", { content: description });
  html = setMeta(html, "name:robots", { content: "noindex,nofollow,noarchive" });
  html = setCanonical(html, SITE_URL);
  html = setMeta(html, "property:og:url", { content: SITE_URL });
  html = setMeta(html, "property:og:title", { content: title });
  html = setMeta(html, "property:og:description", { content: description });
  html = setMeta(html, "name:twitter:url", { content: SITE_URL });
  html = setMeta(html, "name:twitter:title", { content: title });
  html = setMeta(html, "name:twitter:description", { content: description });
  html = html.replace("</head>", `    ${staticJsonLd("private-route", {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: `${SITE_URL}${route}`,
  })}\n  </head>`);
  return html;
};

await fs.mkdir(publicDir, { recursive: true });
await fs.writeFile(path.join(publicDir, "sitemap.xml"), sitemapXml, "utf8");
await fs.writeFile(path.join(publicDir, "robots.txt"), robotsTxt, "utf8");

try {
  const baseHtmlPath = path.join(distDir, "index.html");
  const baseHtml = await fs.readFile(baseHtmlPath, "utf8");
  for (const [route, seo] of Object.entries(SEO_ROUTES)) {
    const routeHtml = buildRouteHtml(baseHtml, route, seo);
    const targetDir = route === "/" ? distDir : path.join(distDir, route.replace(/^\//, ""));
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, "index.html"), routeHtml, "utf8");
  }
  for (const route of NOINDEX_STATIC_ROUTES) {
    const targetDir = path.join(distDir, route.replace(/^\//, ""));
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, "index.html"), buildNoindexHtml(baseHtml, route), "utf8");
  }
  await fs.writeFile(baseHtmlPath, buildRouteHtml(baseHtml, "/", SEO_ROUTES["/"]), "utf8");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log(`[seo] Generated ${routeEntries.length} sitemap routes and ${NOINDEX_STATIC_ROUTES.length} noindex static routes.`);
