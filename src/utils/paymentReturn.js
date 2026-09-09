export function safePaymentDestination(value) {
  if (typeof value !== 'string') return null;
  if (/^\/clients\/[A-Za-z0-9_-]+\/programmes\/[A-Za-z0-9_-]+$/.test(value)) return value;
  return ['/coach-dashboard', '/account/billing', '/mes-programmes'].includes(value) ? value : null;
}

export function classifyPaymentReturn(result = {}) {
  if (result.paymentConfirmed !== true) return { phase: 'pending', paid: false };
  if (result.deliveryPending) return { phase: 'processing', paid: true };
  if (result.type === 'subscription' && !['active', 'trialing'].includes(result.status)) {
    return { phase: 'inactive', paid: true, destination: '/account/billing' };
  }
  const destination = safePaymentDestination(result.viewerUrl);
  if (result.ok !== true || !destination) return { phase: 'error', paid: true };
  return { phase: 'confirmed', paid: true, destination, type: result.type };
}
