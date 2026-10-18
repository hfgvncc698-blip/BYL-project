export function clientClubOfferGroups(groups, { accessOnly = false, clubId } = {}) {
  return (groups || []).filter(group => !clubId || group.clubId === clubId).map(group => {
    const contracts = group.contracts.filter(contract => ['club', 'club_group'].includes(contract.service) === accessOnly);
    const ids = new Set(contracts.map(contract => contract.id));
    return {...group, contracts, dues: (group.dues || []).filter(due => ids.has(due.contractId)),
      payments: group.payments.filter(payment => ids.has(payment.contractId) || (!accessOnly && !payment.contractId))};
  }).filter(group => group.contracts.length || group.payments.length);
}
