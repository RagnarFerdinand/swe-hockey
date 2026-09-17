// Läser Swehockeys schemasida (/ScheduleAndResults/Schedule/<grupp-id>) till en lista matcher.
// Används både av sidan i webbläsaren och av notiskontrollen på GitHub (notiser/kontrollera.mjs),
// så att båda ser matcherna på exakt samma sätt.
//
// Serierna skriver schemat olika (sett 2026-09-17):
//   U14P  datum på egen rad, tiden i länken, lagen i en egen cell, matchnummer som "15946015"
//   U14F  datum och tid i samma cell ("2026-09-17 18:30"), ordnat per omgång — inte efter datum
//   U11P  sammandrag: tiden står bara på varannan rad (raden under spelas samtidigt på andra
//         halvan av isen), "00:00" = tid inte satt, och alla matcher i ett sammandrag delar
//         nummer ("Pool:1,Game:1")
// Sidan har tabeller i tabeller, så bara de innersta raderna läses.

export const ren = s => (s || '').replace(/\s+/g, ' ').trim();

const DATUM = /\d{4}-\d{2}-\d{2}/;
const TID = /\b\d{1,2}:\d{2}\b/;
const RESULTAT = /^\d+ - \d+$/;

export function lasSchema(doc) {
  const rader = [];
  let datum = null;
  let forra = null;
  for (const tr of doc.querySelectorAll('tr')) {
    const tip = tr.querySelector('.lnkTooltip');
    if (!tip || tr.querySelector('table')) continue;
    const celler = [...tr.children].map(td => ren(td.textContent));

    const d = celler.map(c => c.match(DATUM)?.[0]).find(Boolean);
    if (d) datum = d;
    const nr = ren(tip.getAttribute('title'));

    let tid = celler.map(c => c.match(TID)?.[0]).find(Boolean) || '';
    // Sammandrag: tom tid = samma tid som matchen ovanför i samma sammandrag
    if (!tid && forra && forra.nr === nr && forra.datum === datum) tid = forra.tid;
    if (tid === '00:00') tid = '';

    const lagCell = celler.find(c => c.includes(' - ') && !RESULTAT.test(c) && !c.startsWith('(') && !DATUM.test(c));
    if (!lagCell) continue;
    const delning = lagCell.indexOf(' - ');
    const hemma = ren(lagCell.slice(0, delning));
    const borta = ren(lagCell.slice(delning + 3));

    const resultat = celler.find(c => RESULTAT.test(c)) || '';
    const perioder = celler.find(c => /^\(.*\)$/.test(c)) || '';
    const arena = celler[celler.length - 1];
    const lank = tr.querySelector('a[href*="openonlinewindow"]')?.getAttribute('href').match(/'([^']+)'/)?.[1];
    forra = { datum, tid, nr };
    rader.push({ datum, tid, nr, hemma, borta, resultat, perioder, arena, lank, ordning: rader.length });
  }
  return rader;
}
