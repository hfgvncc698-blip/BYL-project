import { clubCoachKey } from './clubCalendarColors.mjs';

export function weekDays(value) {
  const start = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(start.getTime())) throw new Error('Choisissez une semaine valide.');
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 8 }, (_, i) => { const day = new Date(start); day.setDate(day.getDate() + i); return day; });
}
export function planningDays({ appointments, date, type = 'group', coaches = [] }) {
  const days = weekDays(date);
  return days.slice(0, 7).map((day, i) => ({ day, events: appointments.filter(event => {
    const start = new Date(event.startsAt);
    const end = new Date(+start + (Number(event.durationMin) || 60) * 60000);
    return start < days[i + 1] && end > day && event.status !== 'annulée'
      && (type === 'all' || (type === 'group' ? event.type === 'group' : event.type !== 'group'))
      && (!coaches.length || coaches.includes(clubCoachKey(event)));
  }).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)) }));
}

// Clip overnight events to the displayed day, using local calendar hours.
export function planningTimeRange(event, day) {
  const start = new Date(event.startsAt), end = new Date(+start + (Number(event.durationMin) || 60) * 60000);
  const next = new Date(day); next.setDate(next.getDate() + 1);
  return { start: start < day ? 0 : start.getHours() * 60 + start.getMinutes(), end: end >= next ? 1440 : end.getHours() * 60 + end.getMinutes() };
}
async function imageData(url) {
  if (!url) return null;
  if (typeof window === 'undefined' || url.startsWith('data:')) return url;
  return new Promise((resolve, reject) => {
    const image = new Image(); image.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => reject(new Error('Le logo ne peut pas être chargé. Réessayez.')), 10000);
    image.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 800 / Math.max(image.width, image.height));
        canvas.width = Math.max(1, image.width * scale); canvas.height = Math.max(1, image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch { reject(new Error('Le logo ne peut pas être intégré au PDF. Vérifiez son accès.')); }
    };
    image.onerror = () => { clearTimeout(timeout); reject(new Error('Le logo ne peut pas être chargé. Réessayez.')); };
    image.src = url;
  });
}
export async function createClubPlanningPdf(options) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: options.paper || 'a4' });
  const locale = options.locale || 'fr';
  const t = options.translate || ((text, values = {}) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? ''));
  let font = 'helvetica';
  if (typeof document !== 'undefined') {
    await Promise.all(['Arial', 'Arial-Bold'].map(async name => {
      const response = await fetch(`/fonts/${name}.ttf`);
      if (!response.ok) throw new Error(t('Impossible de télécharger le planning. Réessayez.'));
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      pdf.addFileToVFS(`${name}.ttf`, btoa(binary));
      pdf.addFont(`${name}.ttf`, 'Arial', name === 'Arial' ? 'normal' : 'bold');
    }));
    font = 'Arial';
  }
  const days = planningDays(options);
  const width = pdf.internal.pageSize.getWidth(), height = pdf.internal.pageSize.getHeight();
  const margin = 24, gutter = 40, column = (width - margin * 2 - gutter) / 7;
  const top = 140, bottom = height - 46, gridHeight = bottom - top;
  const names = new Map(options.coachNames || []);
  const clean = value => String(value || '').replace(/[\r\n]+/g, ' ').replace(/[–—]/g, '-');
  const dateText = date => date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const ranges = days.flatMap(({ day, events }) => events.map(event => planningTimeRange(event, day)));
  const first = ranges.length ? Math.max(0, Math.floor(Math.min(...ranges.map(r => r.start)) / 60) * 60) : 480;
  const last = ranges.length ? Math.min(1440, Math.max(first + 120, Math.ceil(Math.max(...ranges.map(r => r.end)) / 60) * 60)) : 1080;
  const yAt = minutes => top + (minutes - first) / (last - first) * gridHeight;
  const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  // Place simultaneous events side by side, never on top of one another.
  const dayBlocks = days.map(({ day, events }) => {
    const blocks = events.map(event => ({ event, ...planningTimeRange(event, day) }));
    let cluster = [], clusterEnd = -1;
    const finish = () => {
      const ends = [];
      cluster.forEach(block => {
        let lane = ends.findIndex(end => end <= block.start);
        if (lane < 0) lane = ends.length;
        ends[lane] = block.end; block.lane = lane;
      });
      cluster.forEach(block => { block.lanes = ends.length; });
      cluster = [];
    };
    blocks.forEach(block => { if (block.start >= clusterEnd) finish(); cluster.push(block); clusterEnd = Math.max(clusterEnd, block.end); });
    finish(); return blocks;
  });
  dayBlocks.flat().forEach(block => {
    const { event } = block;
    const boxWidth = column / block.lanes - 5, boxHeight = yAt(block.end) - yAt(block.start) - 3;
    for (let size = 11; size >= 8; size -= 0.5) {
      pdf.setFontSize(size); pdf.setFont(font, 'bold');
      const title = pdf.splitTextToSize(clean(event.title || (event.type === 'group' ? t('Cours collectif') : t('Coaching'))), boxWidth - 10).map(text => ({ text, bold: true }));
      pdf.setFont(font, 'normal');
      const lines = [...title, { text: `${clock(block.start)} - ${clock(block.end)}` },
        ...pdf.splitTextToSize(clean(names.get(clubCoachKey(event)) || event.coachName || t('Coach à préciser')), boxWidth - 10).map(text => ({ text })),
        ...(event.type === 'group' && event.capacity ? [{ text: t("{{count}} places", {count:event.capacity}) }] : [])];
      if (lines.length * size * 1.12 + 8 <= boxHeight && lines.every(line => pdf.getTextWidth(line.text) <= boxWidth - 10)) {
        Object.assign(block, { lines, size, boxWidth, boxHeight }); break;
      }
    }
    if (!block.lines) throw new Error('Cette semaine est trop dense pour une grille horaire lisible sur une page. Choisissez le format A3 ou réduisez les coaches / types sélectionnés.');
  });
  const [clubLogo, brandLogo] = await Promise.all([imageData(options.clubLogoUrl), imageData(options.brandLogoUrl || (typeof window !== 'undefined' ? '/logo-byl.png?v=palm-20261027' : null))]);
  const drawLogo = (data, x, y, maxWidth, maxHeight) => {
    if (!data) return;
    const props = pdf.getImageProperties(data), ratio = Math.min(maxWidth / props.width, maxHeight / props.height);
    const w = props.width * ratio, h = props.height * ratio;
    pdf.addImage(data, 'PNG', x + (maxWidth - w) / 2, y + (maxHeight - h) / 2, w, h);
  };
  drawLogo(clubLogo, width - margin - 68, 22, 68, 68);
  pdf.setTextColor('#172033'); pdf.setFont(font, 'bold');
  let titleSize = 20;
  while (titleSize > 10) { pdf.setFontSize(titleSize); if (pdf.getTextWidth(clean(options.clubName || t('Planning du club'))) <= width - 210) break; titleSize--; }
  pdf.text(clean(options.clubName || t('Planning du club')), width / 2, 42, { align: 'center', maxWidth: width - 210 });
  pdf.setFont(font, 'normal'); pdf.setFontSize(11);
  pdf.text(t("Semaine du {{start}} au {{end}}", {start:dateText(days[0].day),end:dateText(days[6].day)}), width / 2, 64, { align: 'center' });
  const label = t(options.type === 'group' ? 'Cours collectifs' : options.type === 'coaching' ? 'Coachings individuels (sport et nutrition)' : 'Tous les événements');
  pdf.text(`${label} | ${options.coaches?.length ? t("{{count}} coach(es) sélectionné(s)", {count:options.coaches.length}) : t('Toute l’équipe')}`, width / 2, 82, { align: 'center' });
  days.forEach(({ day }, i) => {
    const x = margin + gutter + i * column;
    pdf.setFillColor(i % 2 ? '#F3F6FA' : '#FAFBFD'); pdf.rect(x, top, column, gridHeight, 'F');
    pdf.setFillColor('#263F65'); pdf.roundedRect(x + 1, 108, column - 2, 28, 4, 4, 'F');
    pdf.setTextColor('#FFFFFF'); pdf.setFont(font, 'bold'); pdf.setFontSize(10);
    pdf.text(day.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' }), x + column / 2, 126, { align: 'center' });
  });
  for (let minute = first; minute <= last; minute += 30) {
    const y = yAt(minute), hour = minute % 60 === 0;
    pdf.setDrawColor(hour ? '#CBD5E1' : '#E8EDF3'); pdf.setLineWidth(hour ? 0.5 : 0.25);
    pdf.line(margin + gutter, y, width - margin, y);
    if (hour) { pdf.setFont(font, 'normal'); pdf.setFontSize(9); pdf.setTextColor('#475569'); pdf.text(`${minute / 60} h`, margin + gutter - 7, y + 3, { align: 'right' }); }
  }
  dayBlocks.forEach((blocks, i) => blocks.forEach(block => {
    const x = margin + gutter + i * column + block.lane * column / block.lanes + 2.5;
    const y = yAt(block.start) + 1;
    pdf.setFillColor('#E6EDF7'); pdf.setDrawColor('#8CA5C5'); pdf.setLineWidth(0.5);
    pdf.roundedRect(x, y, block.boxWidth, block.boxHeight, 3, 3, 'FD');
    pdf.setTextColor('#172033'); pdf.setFontSize(block.size);
    block.lines.forEach((line, index) => { pdf.setFont(font, line.bold ? 'bold' : 'normal'); pdf.text(line.text, x + 5, y + block.size + 3 + index * block.size * 1.12); });
  }));
  const footerText = t('Généré par Boost Your Life');
  pdf.setFont(font, 'normal'); pdf.setFontSize(9); pdf.setTextColor('#64748B');
  const footerWidth = pdf.getTextWidth(footerText) + (brandLogo ? 28 : 0), footerX = (width - footerWidth) / 2;
  drawLogo(brandLogo, footerX, height - 31, 21, 21);
  pdf.text(footerText, footerX + (brandLogo ? 28 : 0), height - 17);
  return pdf;
}
