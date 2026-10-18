import { offerExpiry } from './coachOfferSchedule';

// A catalogue model can disappear only after every assigned entitlement ends.
// Contracts retain their own snapshot so history is never removed with the model.
export function activeOfferContracts(offer, contracts, today) {
  return contracts.filter(contract => {
    const linked = contract.offerId ? contract.offerId === offer.id :
      (contract.titleKey && contract.titleKey === offer.titleKey) ||
      (contract.type === offer.type && contract.name === offer.name);
    if (!linked || ['cancelled', 'ended'].includes(contract.status)) return false;
    if (contract.type === 'recurring') return !contract.end || contract.end >= today;
    const expiry = contract.expiresAt || offerExpiry(contract.start, Number(contract.months));
    if (expiry && expiry < today) return false;
    // Unknown consumption must not be treated as zero remaining credits.
    const remaining = contract.remaining ?? (Number.isFinite(contract.completedSessions)
      ? Math.max(0, contract.quantity - contract.completedSessions) : contract.quantity);
    return remaining > 0;
  });
}
