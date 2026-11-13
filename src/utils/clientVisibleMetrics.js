// Directory authorization remains separate. Only enrichment is bounded here;
// filters depending on activity/nutrition/programs still need complete metrics.
export function selectClientMetricRows(clients, visibleIds, exhaustive) {
  if (exhaustive) return clients;
  const ids = new Set(visibleIds);
  const visible = ids.size ? clients.filter(client => ids.has(client.id)) : [];
  return visible.length ? visible.slice(0, 25) : clients.slice(0, 25);
}

export const normalizeClientSearchText = value => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();

// Use the confirmed directory, not the preceding partial render, to choose
// enrichment. Firestore document-ID order differs from the visible name order.
export function clientListPage(clients, search = "", page = 0) {
  const needle = normalizeClientSearchText(search);
  const filtered = clients.filter(c => c.__tourDemo ||
    normalizeClientSearchText(`${c.prenom ?? ''} ${c.nom ?? ''}`).includes(needle))
    .sort((a,b) => `${a.prenom ?? ''} ${a.nom ?? ''}`.localeCompare(`${b.prenom ?? ''} ${b.nom ?? ''}`));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.max(0, Math.min(page, pageCount - 1));
  return { filtered, pageCount, currentPage, rows: filtered.slice(currentPage * 25, (currentPage + 1) * 25) };
}
