export const SITE_URL = "https://boostyourlife.coach";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/logo-byl.png`;
export const SEO_LASTMOD = "2026-05-30";

export function normalizeSeoPath(pathname = "/") {
  const path = String(pathname || "/").split("?")[0].split("#")[0] || "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

export function seoUrlForPath(pathname = "/") {
  const path = normalizeSeoPath(pathname);
  return `${SITE_URL}${path === "/" ? "/" : `${path}/`}`;
}

export function seoHrefForPath(pathname = "/") {
  const path = normalizeSeoPath(pathname);
  return path === "/" ? "/" : `${path}/`;
}

export const SEO_ROUTES = {
  "/": {
    title: "Logiciel coach sportif et nutrition | BoostYourLife.coach",
    description:
      "Logiciel tout-en-un pour coachs sportifs, nutritionnistes et clubs : programmes, suivi client, bilans nutrition, agenda, exports et facturation.",
    priority: "1.0",
    changefreq: "weekly",
    keywords: "logiciel coach sportif, logiciel nutrition, application coaching sportif, suivi client coach, programme entraînement",
    faqs: [
      {
        question: "À qui s'adresse BoostYourLife.coach ?",
        answer:
          "BoostYourLife.coach s'adresse aux coachs sportifs, professionnels de la nutrition, profils hybrides sport-nutrition et clubs qui veulent centraliser leur suivi client.",
      },
      {
        question: "La plateforme convient-elle au coaching en ligne et en présentiel ?",
        answer:
          "Oui. Les programmes, bilans, documents et espaces clients peuvent être utilisés pour un accompagnement à distance, en salle, à domicile ou en cabinet.",
      },
    ],
  },
  "/plans/professionnel": {
    title: "Tarifs logiciel coach sportif, nutrition et club | BoostYourLife",
    description:
      "Comparez les offres Pro Sport, Pro Nutrition, Pro Complet et Licence Club pour gérer clients, programmes, nutrition, équipes et documents.",
    priority: "0.9",
    changefreq: "monthly",
    keywords: "tarif logiciel coach sportif, abonnement logiciel nutrition, logiciel club sport prix",
    faqs: [
      {
        question: "Quelle formule choisir pour un coach sportif indépendant ?",
        answer:
          "La formule Pro Sport est pensée pour créer des programmes, suivre les séances, gérer les clients et exporter des documents professionnels.",
      },
      {
        question: "Les packs Club sont-ils adaptés aux salles et studios ?",
        answer:
          "Oui. Les licences Club ajoutent une vue responsable, plusieurs comptes professionnels, des capacités plus larges et une identité club sur les documents.",
      },
    ],
  },
  "/logiciel-coach-sportif": {
    title: "Logiciel coach sportif - Programmes et suivi client | BYL",
    description:
      "Logiciel pour coach sportif indépendant : créez des programmes personnalisés, suivez vos clients, planifiez les séances et exportez vos documents.",
    priority: "0.88",
    changefreq: "monthly",
    keywords: "logiciel coach sportif, outil coach sportif, suivi client coach sportif, programme musculation client",
    faqs: [
      {
        question: "Que permet le logiciel pour un coach sportif ?",
        answer:
          "Il permet de créer des programmes, structurer les séances, suivre la progression, centraliser les retours client et générer des exports PDF.",
      },
      {
        question: "Puis-je gérer plusieurs clients depuis le même espace ?",
        answer:
          "Oui. Le dashboard pro regroupe les clients, programmes, statistiques, documents et actions récentes pour travailler plus vite.",
      },
    ],
  },
  "/application-coach-sportif": {
    title: "Application coach sportif - Suivi client et entraînement | BYL",
    description:
      "Application web pour coach sportif : espace client, programmes d'entraînement, suivi des séances, progression, notes et exports professionnels.",
    priority: "0.86",
    changefreq: "monthly",
    keywords: "application coach sportif, app coaching sportif, application suivi entraînement client",
    faqs: [
      {
        question: "L'application est-elle accessible depuis mobile ?",
        answer:
          "Oui. BoostYourLife.coach est une application web accessible depuis ordinateur, tablette et mobile, sans installation obligatoire.",
      },
      {
        question: "Le client peut-il voir son programme ?",
        answer:
          "Oui. Chaque client peut accéder à son espace pour consulter ses contenus, suivre ses séances et retrouver les informations partagées.",
      },
    ],
  },
  "/logiciel-suivi-client-coach": {
    title: "Logiciel suivi client coach - Sport, nutrition et progression",
    description:
      "Centralisez le suivi client coach : programmes, séances, bilans nutrition, progression, historique, documents partagés et espace client.",
    priority: "0.85",
    changefreq: "monthly",
    keywords: "logiciel suivi client coach, suivi client coaching, CRM coach sportif",
    faqs: [
      {
        question: "Pourquoi centraliser le suivi client ?",
        answer:
          "Centraliser le suivi évite de disperser les programmes, notes, bilans et documents entre plusieurs outils, ce qui rend l'accompagnement plus lisible.",
      },
      {
        question: "Le suivi peut-il mélanger sport et nutrition ?",
        answer:
          "Oui. Selon la formule, le coach peut gérer le sport, la nutrition ou un suivi complet combinant les deux modules.",
      },
    ],
  },
  "/application-coaching-nutrition": {
    title: "Application coaching nutrition - Bilans, menus et suivi patient",
    description:
      "Application de coaching nutrition pour gérer bilans, rations, menus, recettes, listes de courses, partage patient et historique de suivi.",
    priority: "0.86",
    changefreq: "monthly",
    keywords: "application coaching nutrition, logiciel nutrition, bilan nutrition, menu nutrition client",
    faqs: [
      {
        question: "Quels contenus nutrition peut-on préparer ?",
        answer:
          "La plateforme aide à structurer les bilans, rations, menus, recettes, listes de courses et supports partagés avec le client.",
      },
      {
        question: "Les clients peuvent-ils retrouver les documents nutrition ?",
        answer:
          "Oui. Les contenus validés peuvent être partagés dans l'espace client afin de faciliter le suivi entre deux rendez-vous.",
      },
    ],
  },
  "/logiciel-nutritionniste": {
    title: "Logiciel nutritionniste - Bilans, rations et menus clients",
    description:
      "Logiciel nutritionniste pour structurer bilans, objectifs, rations, menus, recettes, listes de courses et partage avec le patient.",
    priority: "0.85",
    changefreq: "monthly",
    keywords: "logiciel nutritionniste, logiciel diététicien, bilan nutrition logiciel, ration alimentaire",
    faqs: [
      {
        question: "BoostYourLife.coach remplace-t-il les documents nutrition dispersés ?",
        answer:
          "Il permet de regrouper les bilans, objectifs, menus, recettes et listes de courses dans un espace plus clair et réutilisable.",
      },
      {
        question: "Le logiciel convient-il aux diététiciens et nutritionnistes ?",
        answer:
          "Oui. Les outils nutrition sont conçus pour structurer le suivi, préparer les supports et partager les informations utiles avec le patient.",
      },
    ],
  },
  "/logiciel-coach-sportif-nutrition": {
    title: "Logiciel coach sportif et nutrition - Suivi complet client",
    description:
      "Une plateforme sport et nutrition pour coachs hybrides : programmes, bilans, menus, documents et suivi client dans un seul outil.",
    priority: "0.87",
    changefreq: "monthly",
    keywords: "logiciel coach sportif nutrition, coaching sport nutrition, suivi sportif et nutrition",
    faqs: [
      {
        question: "Peut-on suivre le sport et la nutrition dans le même dossier ?",
        answer:
          "Oui. Les profils hybrides peuvent regrouper programmes sportifs, bilans nutrition, menus, documents et historique client.",
      },
      {
        question: "À qui s'adresse la formule complète ?",
        answer:
          "Elle s'adresse aux coachs qui accompagnent leurs clients sur l'entraînement, l'alimentation et le suivi global de progression.",
      },
    ],
  },
  "/logiciel-club-sport": {
    title: "Logiciel club de sport - Gestion coachs, clients et programmes",
    description:
      "Logiciel club de sport pour salles, studios et structures : comptes coachs, suivi clients, programmes, activité globale et documents club.",
    priority: "0.84",
    changefreq: "monthly",
    keywords: "logiciel club sport, logiciel salle de sport, gestion coachs club, suivi clients salle sport",
    faqs: [
      {
        question: "Que permet la licence Club ?",
        answer:
          "Elle permet de rattacher plusieurs pros, suivre les clients, consolider l'activité et harmoniser les documents avec l'identité du club.",
      },
      {
        question: "Est-ce adapté à un studio ou une salle indépendante ?",
        answer:
          "Oui. Les packs Club conviennent aux studios, salles, structures sportives et réseaux qui veulent mieux organiser leur équipe.",
      },
    ],
  },
  "/logiciel-salle-de-sport": {
    title: "Logiciel salle de sport - Coachs, clients et programmes",
    description:
      "Solution pour salle de sport, studio ou club : organisez les coachs, les clients, les programmes, les exports et le suivi global de l'activité.",
    priority: "0.83",
    changefreq: "monthly",
    keywords: "logiciel salle de sport, logiciel studio sport, gestion salle coaching",
    faqs: [
      {
        question: "Pourquoi utiliser un logiciel pour une salle de sport ?",
        answer:
          "Un logiciel permet de suivre les coachs, clients, programmes, documents et actions récentes dans une organisation plus lisible.",
      },
      {
        question: "Peut-on personnaliser les documents au nom de la salle ?",
        answer:
          "Selon le pack choisi, les documents peuvent intégrer l'identité du club ou de la salle pour renforcer la cohérence professionnelle.",
      },
    ],
  },
  "/about": {
    title: "À propos - BoostYourLife.coach",
    description:
      "Découvrez BoostYourLife.coach, la plateforme pensée pour rendre le coaching sportif et nutrition plus clair, suivi et personnalisé.",
    priority: "0.6",
    changefreq: "monthly",
  },
  "/contact": {
    title: "Contact - BoostYourLife.coach",
    description:
      "Contactez BoostYourLife.coach pour une question, une demande pro, un club ou un accompagnement autour de la plateforme.",
    priority: "0.6",
    changefreq: "monthly",
  },
  "/privacy": {
    title: "Politique de confidentialité - BoostYourLife.coach",
    description:
      "Consultez la politique de confidentialité de BoostYourLife.coach et les informations sur la gestion des données personnelles.",
    priority: "0.3",
    changefreq: "yearly",
  },
  "/terms": {
    title: "Conditions d'utilisation - BoostYourLife.coach",
    description:
      "Consultez les conditions d'utilisation de BoostYourLife.coach pour les particuliers, professionnels et clubs.",
    priority: "0.3",
    changefreq: "yearly",
  },
  "/sales-policy": {
    title: "Conditions de vente - BoostYourLife.coach",
    description:
      "Consultez les conditions de vente, abonnements, paiements et facturation de BoostYourLife.coach.",
    priority: "0.3",
    changefreq: "yearly",
  },
};

export const NOINDEX_PREFIXES = [
  "/admin",
  "/account",
  "/auto-program-preview",
  "/cancel",
  "/checkout",
  "/clients",
  "/club-dashboard",
  "/coach-dashboard",
  "/coach",
  "/exercise-bank",
  "/login",
  "/mes-programmes",
  "/nutrition",
  "/nutrition-coach",
  "/payment-cancel",
  "/payment-success",
  "/profile",
  "/programmes-premium",
  "/programmes/",
  "/questionnaire",
  "/register",
  "/settings",
  "/settings-coach",
  "/statistics-coach",
  "/statistiques",
  "/success",
  "/user-dashboard",
];

export const NOINDEX_STATIC_ROUTES = [
  "/login",
  "/register",
  "/programmes-premium",
  "/coach-dashboard",
  "/user-dashboard",
  "/club-dashboard",
  "/settings",
  "/settings-coach",
  "/account/billing",
  "/checkout",
  "/success",
  "/cancel",
];

export const SEO_PUBLIC_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/plans/professionnel", label: "Tarifs professionnels" },
  { href: "/logiciel-coach-sportif", label: "Logiciel coach sportif" },
  { href: "/application-coach-sportif", label: "Application coach sportif" },
  { href: "/logiciel-suivi-client-coach", label: "Suivi client coach" },
  { href: "/application-coaching-nutrition", label: "Coaching nutrition" },
  { href: "/logiciel-nutritionniste", label: "Logiciel nutritionniste" },
  { href: "/logiciel-coach-sportif-nutrition", label: "Sport et nutrition" },
  { href: "/logiciel-club-sport", label: "Logiciel club de sport" },
  { href: "/logiciel-salle-de-sport", label: "Logiciel salle de sport" },
  { href: "/about", label: "À propos" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Confidentialité" },
  { href: "/terms", label: "Conditions" },
  { href: "/sales-policy", label: "Conditions de vente" },
];

export function getSeoForPath(pathname = "/") {
  const path = normalizeSeoPath(pathname);
  const route = SEO_ROUTES[path];
  if (route) {
    return {
      ...route,
      path,
      canonicalPath: path,
      robots: "index,follow",
    };
  }

  const noindex = NOINDEX_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  return {
    title: "BoostYourLife.coach",
    description:
      "Plateforme de coaching sportif et nutrition pour programmes, suivi client et progression.",
    path,
    canonicalPath: "/",
    robots: noindex ? "noindex,nofollow" : "noindex,follow",
  };
}
