const copy={
  fr:['Votre prochain programme se prépare automatiquement.','La préparation du prochain programme reprendra avec un abonnement actif.'],
  en:['Your next programme is being prepared automatically.','Preparation of your next programme will resume with an active subscription.'],
  es:['Tu próximo programa se está preparando automáticamente.','La preparación de tu próximo programa se reanudará con una suscripción activa.'],
  it:['Il tuo prossimo programma viene preparato automaticamente.','La preparazione del prossimo programma riprenderà con un abbonamento attivo.'],
  de:['Dein nächstes Programm wird automatisch vorbereitet.','Die Vorbereitung deines nächsten Programms wird mit einem aktiven Abonnement fortgesetzt.'],
  ru:['Ваша следующая программа готовится автоматически.','Подготовка следующей программы возобновится при активной подписке.'],
  ar:['يتم إعداد برنامجك التالي تلقائيًا.','سيُستأنف إعداد برنامجك التالي عند تفعيل الاشتراك.'],
};
export function subscriptionCycleMessage(profile,language) {
  if(!profile?.subscriptionCycle?.enabled || profile.sportFollowView==='programs')return null;
  const cycle=profile.trainingPlan?.cycles?.find(c=>!c.closedAt);
  if(cycle?.draftProgramId || (cycle&&!['general','endurance','hypertrophy','strength','recovery'].includes(cycle.type)))return null;
  const until=profile.subscriptionAccessUntil;
  const end=until?.toMillis?.() || (until?.seconds?until.seconds*1000:Date.parse(until));
  return (copy[String(language||'fr').split('-')[0]]||copy.fr)[profile.abonnementActif && end>Date.now()?0:1];
}
