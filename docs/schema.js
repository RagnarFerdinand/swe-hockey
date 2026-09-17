// Läser Swehockeys schemasida (/ScheduleAndResults/Schedule/<grupp-id>) till en lista matcher.
// Används både av sidan i webbläsaren och av notiskontrollen på GitHub (notiser/kontrollera.mjs),
// så att båda ser matcherna på exakt samma sätt.

export const ren = s => (s || '').replace(/\s+/g, ' ').trim();

export function lasSchema(doc) {
  const rader = [];
  let datum = null;
  for (const tr of doc.querySelectorAll('table.tblContent tr, table tr')) {
    if (!tr.querySelector('.lnkTooltip')) continue;
    if (rader.some(r => r.tr === tr)) continue;
    const celler = [...tr.children].map(td => ren(td.textContent));
    const d = celler.join(' ').match(/\d{4}-\d{2}-\d{2}/);
    if (d) datum = d[0];
    const tip = tr.querySelector('.lnkTooltip');
    const tipText = ren(tip.textContent);
    const tid = /^\d{1,2}:\d{2}$/.test(tipText) ? tipText
      : (celler.find(c => /^\d{1,2}:\d{2}$/.test(c)) || (celler.join(' ').match(/\b\d{1,2}:\d{2}\b/) || [])[0] || '');
    const nrText = ren(tip.getAttribute('title'));
    const lagCell = /^\d{1,2}:\d{2}$/.test(tipText)
      ? celler.find(c => / - /.test(c) && !/^\d+ - \d+$/.test(c) && !/^\(/.test(c))
      : tipText;
    if (!lagCell) continue;
    const [hemma, borta] = lagCell.split(' - ').map(ren);
    const resultat = celler.find(c => /^\d+ - \d+$/.test(c)) || '';
    const perioder = celler.find(c => /^\(.*\)$/.test(c)) || '';
    const arena = celler[celler.length - 1];
    const lank = tr.querySelector('a[href*="openonlinewindow"]')?.getAttribute('href').match(/'([^']+)'/)?.[1];
    rader.push({ tr, datum, tid: tid === '00:00' ? '' : tid, nr: nrText, hemma, borta, resultat, perioder, arena, lank });
  }
  return rader.map(({ tr, ...r }, i) => ({ ...r, ordning: i }));
}
