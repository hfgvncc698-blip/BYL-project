export function accountSignature(user) {
  const first=String(user?.firstName || user?.prenom || '').trim();
  const last=String(user?.lastName || user?.nom || '').trim();
  return [first,last].filter(Boolean).join(' ') || String(user?.displayName || '').trim();
}
export function createOfferReminder({row,locale,t,signature,formatMoney,scaleFor}) {
  const values={client:row.contract.clientName,offer:row.contract.name,
    amount:formatMoney(row.amount,row.contract.currency,scaleFor(row.contract.currency),locale),
    date:new Date(`${row.date}T12:00:00`).toLocaleDateString(locale)};
  const options={...values,interpolation:{escapeValue:false}};
  return {subject:t('offerReminder.subject',options),body:[t('offerReminder.body',options),signature].filter(Boolean).join('\n')};
}
