import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { DEFAULT_OG_IMAGE, SEO_PUBLIC_LINKS, SITE_URL, getSeoForPath, seoUrlForPath } from "../seo/seoConfig";

const setMeta = (selector, attrs) => {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement("meta");
    document.head.appendChild(node);
  }
  Object.entries(attrs).forEach(([key, value]) => {
    node.setAttribute(key, value);
  });
};

const setLink = (rel, href) => {
  let node = document.head.querySelector(`link[rel="${rel}"]`);
  if (!node) {
    node = document.createElement("link");
    node.setAttribute("rel", rel);
    document.head.appendChild(node);
  }
  node.setAttribute("href", href);
};

const setJsonLd = (id, data) => {
  let node = document.head.querySelector(`script#${id}`);
  if (!node) {
    node = document.createElement("script");
    node.id = id;
    node.type = "application/ld+json";
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(data);
};

const removeJsonLd = (id) => {
  const node = document.head.querySelector(`script#${id}`);
  if (node) node.remove();
};

export default function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const seo = getSeoForPath(location.pathname);
    const canonicalUrl = seoUrlForPath(seo.canonicalPath);

    document.title = seo.title;
    setMeta('meta[name="description"]', { name: "description", content: seo.description });
    setMeta('meta[name="robots"]', { name: "robots", content: seo.robots });
    if (seo.keywords) {
      setMeta('meta[name="keywords"]', { name: "keywords", content: seo.keywords });
    }
    setLink("canonical", canonicalUrl);

    setMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    setMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl });
    setMeta('meta[property="og:title"]', { property: "og:title", content: seo.title });
    setMeta('meta[property="og:description"]', { property: "og:description", content: seo.description });
    setMeta('meta[property="og:image"]', { property: "og:image", content: DEFAULT_OG_IMAGE });
    setMeta('meta[property="og:site_name"]', { property: "og:site_name", content: "BoostYourLife.coach" });
    setMeta('meta[property="og:locale"]', { property: "og:locale", content: "fr_FR" });

    setMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    setMeta('meta[name="twitter:url"]', { name: "twitter:url", content: canonicalUrl });
    setMeta('meta[name="twitter:title"]', { name: "twitter:title", content: seo.title });
    setMeta('meta[name="twitter:description"]', { name: "twitter:description", content: seo.description });
    setMeta('meta[name="twitter:image"]', { name: "twitter:image", content: DEFAULT_OG_IMAGE });

    setJsonLd("byl-organization-jsonld", {
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
    });

    setJsonLd("byl-website-jsonld", {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "BoostYourLife.coach",
      url: SITE_URL,
    });

    setJsonLd("byl-software-jsonld", {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "BoostYourLife.coach",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      image: DEFAULT_OG_IMAGE,
      description:
        "Logiciel web pour coachs sportifs, pros nutrition et clubs : programmes, suivi client, bilans nutrition, exports et facturation.",
      offers: {
        "@type": "Offer",
        url: seoUrlForPath("/plans/professionnel"),
        priceCurrency: "EUR",
      },
      featureList: [
        "Création de programmes sportifs",
        "Suivi client",
        "Bilans nutrition",
        "Menus et listes de courses",
        "Exports PDF",
        "Gestion club",
      ],
      audience: {
        "@type": "Audience",
        audienceType: "Coachs sportifs, professionnels de la nutrition et clubs de sport",
      },
    });

    setJsonLd("byl-breadcrumb-jsonld", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Accueil",
          item: `${SITE_URL}/`,
        },
        ...(seo.canonicalPath === "/"
          ? []
          : [{
              "@type": "ListItem",
              position: 2,
              name: seo.title.replace(/\s*\|.*$/, "").replace(/\s*-\s*BoostYourLife.*$/, ""),
              item: canonicalUrl,
            }]),
      ],
    });

    if (seo.robots === "index,follow") {
      setJsonLd("byl-page-jsonld", {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: seo.title,
        description: seo.description,
        url: canonicalUrl,
        isPartOf: {
          "@type": "WebSite",
          name: "BoostYourLife.coach",
          url: SITE_URL,
        },
      });
    }

    setJsonLd("byl-sitelinks-jsonld", {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: SEO_PUBLIC_LINKS.map((link, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: link.label,
        url: seoUrlForPath(link.href),
      })),
    });

    removeJsonLd("byl-faq-jsonld");
    removeJsonLd("byl-static-faq");
  }, [location.pathname]);

  return null;
}
