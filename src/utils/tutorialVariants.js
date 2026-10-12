export const CLUB_TOUR_PAGES = {
  clubManagement: ['/club-dashboard/actions-groupees','Gestion','club-management','management'],
  clubClients: ['/club-dashboard/clients', 'Clients', 'club-activity', 'clients'],
  clubTeam: ['/club-dashboard/team', 'Pros du club', 'club-team', 'team'],
  clubCalendar: ['/club-dashboard/calendrier', 'Calendrier club', 'club-calendar', 'calendar'],
  clubStatistics: ['/club-dashboard/statistiques', 'Statistiques', 'club-activity', 'statistics'],
  clubSettings: ['/club-dashboard/settings', 'Réglages', 'club-settings', 'settings'],
};
export const tutorialDevice = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop';
export function reviseTutorial(id, tour, device, t, label) {
  const mobile=device==='mobile';
  const step=(selector,key,title)=>({selector,title:label(title),text:t(`guidedTutorial.v2.${key}`),skipIfMissing:true});
  const navigation=step(mobile?`[data-tour='${tour.role}-mobile-nav']`:"[data-tour='main-navigation']",`${tour.role}.${device}`,'Navigation');
  const page=CLUB_TOUR_PAGES[id];
  if(page){
    const steps=[step(`[data-tour='${page[2]}']`,`${page[3]}.${device}`,page[1])];
    if(id==='clubClients')steps.push(step("[data-tour='club-client-import']",'import','Importer mes clients'));
    return {...tour,steps:[navigation,...steps]};
  }
  if(id==='clubDashboard')return {...tour,steps:[navigation,
    step("[data-tour='club-hero']",'overview','Tableau de bord'),
    step("[data-tour='club-dashboard-calendar']",`calendar.${device}`,'Calendrier club'),
    step("[data-tour='club-messaging']",'messages','Messages')]};
  let steps=tour.steps.map(s=>({...s,skipIfMissing:true}));
  if(id==='clientDashboard'){
    steps=steps.filter(s=>!s.selector.includes('premium'));
    steps=steps.map(s=>s.selector.includes('client-calendar')?{...s,text:t(`guidedTutorial.v2.calendar.${device}`)}:s);
  }
  if(id==='coachDashboard')steps=steps.filter(s=>!s.selector.includes('calendar-sync')&&!s.selector.includes('radar'));
  if(mobile){
    // On a phone, teach the primary action before the wider overview.
    if(steps.length>2)steps=[steps[1],steps[0],...steps.slice(2)];
    if(id==='coachPrograms')steps=steps.map(s=>s.selector.includes("program-builder")?{...s,text:t('guidedTutorial.v2.builder.mobile')}:s);
    if(id==='coachClients')steps=steps.filter(s=>!s.selector.includes('clients-demo-row'));
  }
  return {...tour,steps:[navigation,...steps]};
}
