#!/usr/bin/env node

require("../backend/node_modules/dotenv").config({ path: "backend/.env" });

const Stripe = require("../backend/node_modules/stripe");

const secretKey =
  process.env.STRIPE_SECRET_KEY ||
  process.env.STRIPE_LIVE_SECRET ||
  process.env.STRIPE_KEY ||
  process.env.STRIPE_API_KEY ||
  process.env.STRIPE_SECRET;

if (!secretKey) {
  console.error("Missing Stripe secret key in backend/.env");
  process.exit(1);
}

const stripe = Stripe(secretKey, { apiVersion: "2024-06-20" });

const plans = [
  {
    packageKey: "sport",
    title: "Pro Sport",
    tiers: [
      { key: "solo", label: "Solo", monthly: 3900, yearly: 39000, clientLimit: 10, proLimit: 1 },
      { key: "growth", label: "Croissance", monthly: 5900, yearly: 59000, clientLimit: 30, proLimit: 1 },
      { key: "unlimited", label: "Illimité", monthly: 7900, yearly: 79000, clientLimit: null, proLimit: 1 },
    ],
  },
  {
    packageKey: "nutrition",
    title: "Pro Nutrition",
    tiers: [
      { key: "solo", label: "Solo", monthly: 3900, yearly: 39000, clientLimit: 10, proLimit: 1 },
      { key: "growth", label: "Croissance", monthly: 5900, yearly: 59000, clientLimit: 30, proLimit: 1 },
      { key: "unlimited", label: "Illimité", monthly: 7900, yearly: 79000, clientLimit: null, proLimit: 1 },
    ],
  },
  {
    packageKey: "complete",
    title: "Pro Complet",
    tiers: [
      { key: "solo", label: "Solo", monthly: 6900, yearly: 69000, clientLimit: 10, proLimit: 1 },
      { key: "growth", label: "Croissance", monthly: 8400, yearly: 84000, clientLimit: 30, proLimit: 1 },
      { key: "unlimited", label: "Illimité", monthly: 9900, yearly: 99000, clientLimit: null, proLimit: 1 },
    ],
  },
  {
    packageKey: "club",
    title: "Licence Club",
    tiers: [
      { key: "studio", label: "Studio", monthly: 14900, yearly: 149000, clientLimit: 100, proLimit: 3 },
      { key: "club", label: "Club", monthly: 22900, yearly: 229000, clientLimit: 300, proLimit: 8 },
      { key: "network", label: "Réseau", monthly: 29900, yearly: 299000, clientLimit: null, proLimit: 20 },
    ],
  },
];

const envName = ({ packageKey, tierKey, billing }) =>
  `STRIPE_PRICE_PRO_${packageKey.toUpperCase()}_${tierKey.toUpperCase()}_${billing.toUpperCase()}`;

const isTaxExclusivePlan = (packageKey) => packageKey === "club";

const priceCodeFor = ({ packageKey, tierKey, billing }) => {
  const taxSuffix = isTaxExclusivePlan(packageKey) ? "_ht" : "";
  return `pro_${packageKey}_${tierKey}_${billing}${taxSuffix}`;
};

const metadataFor = ({ packageKey, tier, billing }) => ({
  app: "boostyourlife",
  scope: "pro_subscription",
  byl_plan_code: priceCodeFor({ packageKey, tierKey: tier.key, billing }),
  packageKey,
  packageTier: tier.key,
  billing,
  taxBehavior: isTaxExclusivePlan(packageKey) ? "exclusive" : "inclusive",
  clientLimit: tier.clientLimit == null ? "unlimited" : String(tier.clientLimit),
  proLimit: tier.proLimit == null ? "unlimited" : String(tier.proLimit),
});

async function searchPrice(planCode) {
  try {
    const result = await stripe.prices.search({
      query: `active:'true' AND metadata['byl_plan_code']:'${planCode}'`,
      limit: 1,
    });
    return result.data[0] || null;
  } catch {
    return null;
  }
}

async function searchProduct(productCode) {
  try {
    const result = await stripe.products.search({
      query: `active:'true' AND metadata['byl_product_code']:'${productCode}'`,
      limit: 1,
    });
    return result.data[0] || null;
  } catch {
    return null;
  }
}

async function ensureProduct({ plan, tier }) {
  const productCode = `pro_${plan.packageKey}_${tier.key}`;
  const existing = await searchProduct(productCode);
  if (existing) return existing;

  return stripe.products.create({
    name: `BoostYourLife ${plan.title} ${tier.label}`,
    description: `Abonnement ${plan.title} - ${tier.label}`,
    metadata: {
      app: "boostyourlife",
      scope: "pro_subscription",
      byl_product_code: productCode,
      packageKey: plan.packageKey,
      packageTier: tier.key,
      clientLimit: tier.clientLimit == null ? "unlimited" : String(tier.clientLimit),
      proLimit: tier.proLimit == null ? "unlimited" : String(tier.proLimit),
    },
  });
}

async function ensurePrice({ plan, tier, billing, unitAmount }) {
  const planCode = priceCodeFor({ packageKey: plan.packageKey, tierKey: tier.key, billing });
  const existing = await searchPrice(planCode);
  if (existing) return { price: existing, created: false };

  const product = await ensureProduct({ plan, tier });
  const taxBehavior = isTaxExclusivePlan(plan.packageKey) ? "exclusive" : "inclusive";
  const price = await stripe.prices.create({
    currency: "eur",
    unit_amount: unitAmount,
    tax_behavior: taxBehavior,
    recurring: { interval: billing === "yearly" ? "year" : "month" },
    product: product.id,
    nickname: `${plan.title} ${tier.label} ${billing === "yearly" ? "Annuel" : "Mensuel"}${taxBehavior === "exclusive" ? " HT" : ""}`,
    metadata: metadataFor({ packageKey: plan.packageKey, tier, billing }),
  });
  return { price, created: true };
}

(async () => {
  const rows = [];
  for (const plan of plans) {
    for (const tier of plan.tiers) {
      for (const [billing, amount] of [
        ["monthly", tier.monthly],
        ["yearly", tier.yearly],
      ]) {
        const { price, created } = await ensurePrice({ plan, tier, billing, unitAmount: amount });
        rows.push({
          env: envName({ packageKey: plan.packageKey, tierKey: tier.key, billing }),
          id: price.id,
          created,
          amount,
          taxBehavior: isTaxExclusivePlan(plan.packageKey) ? "exclusive" : "inclusive",
        });
      }
    }
  }

  console.log("# Add/update these lines in backend/.env");
  for (const row of rows) {
    console.log(`${row.env}=${row.id}`);
  }
  console.log("\n# Summary");
  for (const row of rows) {
    const taxLabel = row.taxBehavior === "exclusive" ? "HT" : "TTC";
    console.log(`${row.created ? "created" : "existing"} ${row.env} ${row.amount / 100} EUR ${taxLabel} -> ${row.id}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
