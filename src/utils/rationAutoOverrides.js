const rationQuantityNumber = (value) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function isManualRationQuantity(slot = {}) {
  return slot?.manualQuantity === true;
}

const normalizedCompensationValue = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

export function getRationCompensationFamily(slot = {}) {
  const group = normalizedCompensationValue(slot?.group);
  const slotKey = normalizedCompensationValue(slot?.slotKey);

  // Only bread and the starch portion of main meals are interchangeable.
  // Breakfast/snack cereals remain in their own food category.
  if (group === "pain" || (group === "produits cerealiers" && slotKey === "feculents")) {
    return "pain_feculents";
  }

  return group || slotKey;
}

export function canCompensateRationQuantity(changedSlot = {}, candidateSlot = {}) {
  const changedFamily = getRationCompensationFamily(changedSlot);
  const candidateFamily = getRationCompensationFamily(candidateSlot);
  return Boolean(changedFamily && changedFamily === candidateFamily);
}

export function getRationMealEnergyDistribution({
  hasMorningSnack = false,
  hasAfternoonSnack = false,
  hasNightSnack = false,
} = {}) {
  const ratio = (value) => Math.round(value * 100) / 100;
  const morningSnack = hasMorningSnack ? 0.1 : 0;
  const afternoonSnack = hasAfternoonSnack ? 0.1 : 0;
  const nightSnack = hasNightSnack ? 0.1 : 0;

  return {
    petit_dej: 0.2,
    dejeuner: ratio(0.4 - morningSnack),
    diner: ratio(0.4 - afternoonSnack - nightSnack),
    collation_matin: morningSnack,
    collation_apm: afternoonSnack,
    collation_soir: nightSnack,
  };
}

export function markRationQuantityManual(slot = {}, multiplier = 0) {
  return {
    ...slot,
    multiplier: Math.max(0, rationQuantityNumber(multiplier)),
    manualQuantity: true,
  };
}

export function preserveManualRationQuantities(referenceSlots = {}, candidateSlots = {}) {
  let changed = false;
  const next = { ...candidateSlots };

  Object.entries(referenceSlots || {}).forEach(([slotId, reference]) => {
    if (!isManualRationQuantity(reference)) return;

    const candidate = next[slotId] || reference;
    const referenceMultiplier = Math.max(0, rationQuantityNumber(reference?.multiplier));
    if (
      !isManualRationQuantity(candidate) ||
      rationQuantityNumber(candidate?.multiplier) !== referenceMultiplier
    ) {
      changed = true;
    }

    next[slotId] = {
      ...candidate,
      multiplier: referenceMultiplier,
      manualQuantity: true,
    };
  });

  return changed ? next : candidateSlots;
}
