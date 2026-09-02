export const PRO_PLAN_ACCESS = {
  sport: {
    solo: {
      clientLimit: 10,
      proLimit: 1,
      modules: ["sport"],
      branding: "none",
      brandingLabel: "Sans logo personnalisé",
    },
    growth: {
      clientLimit: 30,
      proLimit: 1,
      modules: ["sport"],
      branding: "documents",
      brandingLabel: "Logo sur PDF et documents partagés",
    },
    unlimited: {
      clientLimit: null,
      proLimit: 1,
      modules: ["sport"],
      branding: "full",
      brandingLabel: "Logo, nom affiché et support prioritaire",
    },
  },
  nutrition: {
    solo: {
      clientLimit: 10,
      proLimit: 1,
      modules: ["nutrition"],
      branding: "none",
      brandingLabel: "Sans logo personnalisé",
    },
    growth: {
      clientLimit: 30,
      proLimit: 1,
      modules: ["nutrition"],
      branding: "documents",
      brandingLabel: "Logo sur bilans, menus et documents",
    },
    unlimited: {
      clientLimit: null,
      proLimit: 1,
      modules: ["nutrition"],
      branding: "full",
      brandingLabel: "Logo, nom affiché et documents patients",
    },
  },
  complete: {
    solo: {
      clientLimit: 10,
      proLimit: 1,
      modules: ["sport", "nutrition"],
      branding: "none",
      brandingLabel: "Sans logo personnalisé",
    },
    growth: {
      clientLimit: 30,
      proLimit: 1,
      modules: ["sport", "nutrition"],
      branding: "documents",
      brandingLabel: "Logo sur PDF, bilans et documents",
    },
    unlimited: {
      clientLimit: null,
      proLimit: 1,
      modules: ["sport", "nutrition"],
      branding: "full",
      brandingLabel: "Logo et nom affiché dans l'espace client",
    },
  },
  club: {
    studio: {
      clientLimit: 100,
      proLimit: 3,
      modules: ["sport", "nutrition", "club"],
      branding: "club",
      brandingLabel: "Logo club sur espaces et invitations",
    },
    club: {
      clientLimit: 300,
      proLimit: 8,
      modules: ["sport", "nutrition", "club"],
      branding: "club_documents",
      brandingLabel: "Logo du club sur PDF et documents",
    },
    network: {
      clientLimit: null,
      proLimit: 20,
      modules: ["sport", "nutrition", "club"],
      branding: "club_full",
      brandingLabel: "Logo, nom affiché, exports et portail club",
    },
  },
};

export function normalizePlanKey(value) {
  const key = String(value || "complete").toLowerCase();
  return PRO_PLAN_ACCESS[key] ? key : "complete";
}

export function normalizePlanTier(packageKey, value) {
  const key = normalizePlanKey(packageKey);
  const tier = String(value || "").toLowerCase();
  if (PRO_PLAN_ACCESS[key]?.[tier]) return tier;
  if (PRO_PLAN_ACCESS[key]?.growth) return "growth";
  if (PRO_PLAN_ACCESS[key]?.club) return "club";
  return Object.keys(PRO_PLAN_ACCESS[key] || {})[0] || "solo";
}

export function getProPlanAccess(packageKey, packageTier) {
  const key = normalizePlanKey(packageKey);
  const tier = normalizePlanTier(key, packageTier);
  return {
    packageKey: key,
    packageTier: tier,
    ...(PRO_PLAN_ACCESS[key]?.[tier] || PRO_PLAN_ACCESS.complete.growth),
  };
}

export function hasUnlimitedClients(access) {
  return access?.clientLimit == null;
}

export function getPlanModules(accessOrUser) {
  return accessOrUser?.proAccess?.modules || accessOrUser?.modules || [];
}

export function hasPlanModule(accessOrUser, module) {
  if (!accessOrUser || !module) return false;
  if (accessOrUser.role === "admin") return true;

  const modules = getPlanModules(accessOrUser);
  const packageKey = accessOrUser.packageKey || accessOrUser.proAccess?.packageKey;
  if (Array.isArray(modules) && (modules.includes(module) || modules.includes("club"))) return true;
  if (modules?.[module] || modules?.club) return true;

  if (module === "nutrition") {
    return Boolean(
        accessOrUser.nutritionAccess ||
        accessOrUser.hasNutritionAccess ||
        accessOrUser.features?.nutrition ||
        ["nutrition", "complete", "club"].includes(packageKey)
    );
  }

  if (module === "sport") {
    return Boolean(
        accessOrUser.sportAccess ||
        accessOrUser.hasSportAccess ||
        accessOrUser.features?.sport ||
        ["sport", "complete", "club"].includes(packageKey)
    );
  }

  return false;
}

export function canUseCustomBranding(access) {
  const resolved = resolvePlanAccess(access);
  return resolved?.branding && resolved.branding !== "none";
}

export function canUseNavbarBranding(access) {
  const resolved = resolvePlanAccess(access);
  return ["full", "club_full"].includes(resolved?.branding);
}

export function canUseGuidedProgram(access) {
  const resolved = resolvePlanAccess(access);
  if (!resolved) return true;
  if (!["sport", "complete"].includes(resolved.packageKey)) return false;
  return resolved.packageTier !== "solo";
}

function resolvePlanAccess(access) {
  if (!access) return null;
  if (access.branding) return access;
  return getProPlanAccess(access.packageKey, access.packageTier);
}
