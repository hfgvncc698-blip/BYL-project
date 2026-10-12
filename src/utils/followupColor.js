export const followupColor = key => ['#2563EB','#7C3AED','#0F766E','#BE185D'][[...String(key||'')].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0)%4];
