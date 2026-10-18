// One section per professional, even when the account has several client records.
export function clientProfessionalOffers(groups = []) {
  const professionals = new Map();
  for (const group of groups) {
    let professional = professionals.get(group.coachId);
    if (!professional) {
      professional = {...group, contracts: []};
      professionals.set(group.coachId, professional);
    }
    for (const contract of group.contracts || []) {
      if (!professional.contracts.some(row => row.id === contract.id)) professional.contracts.push(contract);
    }
  }
  return [...professionals.values()].filter(group => group.contracts.length);
}
