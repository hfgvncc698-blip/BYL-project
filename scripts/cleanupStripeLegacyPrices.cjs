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
const apply = process.argv.includes("--apply");
const LEGACY_GENERIC_PRO_PRODUCTS = new Set([
  "Abonnement Pro Mensuel",
  "Abonnement Pro Annuel",
]);

const isLegacyPrice = (price) => {
  const product = price?.product && typeof price.product === "object" ? price.product : null;
  const productName = String(product?.name || "").trim();
  const planCode = String(price?.metadata?.byl_plan_code || "").trim();
  const isLegacyClubPrice =
    price?.metadata?.scope === "pro_subscription" &&
    price?.metadata?.packageKey === "club" &&
    planCode &&
    !planCode.endsWith("_ht");

  return LEGACY_GENERIC_PRO_PRODUCTS.has(productName) || isLegacyClubPrice;
};

async function archivePrice(price, activePrices) {
  const product = price?.product && typeof price.product === "object" ? price.product : null;
  const defaultPriceId =
    typeof product?.default_price === "string"
      ? product.default_price
      : product?.default_price?.id || null;

  if (product?.id && defaultPriceId === price.id) {
    const replacement = activePrices.find(
      (candidate) =>
        candidate.id !== price.id &&
        !isLegacyPrice(candidate) &&
        (typeof candidate.product === "string" ? candidate.product : candidate.product?.id) === product.id
    );
    await stripe.products.update(product.id, { default_price: replacement?.id || null });
  }

  await stripe.prices.update(price.id, { active: false });
}

async function listActivePrices() {
  const prices = [];
  let startingAfter = null;
  do {
    const page = await stripe.prices.list({
      active: true,
      limit: 100,
      expand: ["data.product"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    prices.push(...page.data);
    startingAfter = page.has_more ? page.data.at(-1)?.id || null : null;
  } while (startingAfter);
  return prices;
}

(async () => {
  const activePrices = await listActivePrices();
  const legacyPrices = activePrices.filter(isLegacyPrice);

  console.log(`${legacyPrices.length} ancien(s) prix Stripe actif(s) détecté(s).`);
  for (const price of legacyPrices) {
    const product = typeof price.product === "object" ? price.product : null;
    console.log(
      `${apply ? "désactivation" : "à désactiver"} ${price.id} · ${product?.name || price.nickname || "Sans nom"} · ${
        Number(price.unit_amount || 0) / 100
      } ${String(price.currency || "eur").toUpperCase()}`
    );
  }

  if (!apply) {
    console.log("Audit uniquement. Relancer avec --apply pour désactiver ces prix.");
    return;
  }

  let archivedCount = 0;
  for (const price of legacyPrices) {
    await archivePrice(price, activePrices);
    archivedCount += 1;
  }
  console.log(`${archivedCount} ancien(s) prix Stripe désactivé(s).`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
