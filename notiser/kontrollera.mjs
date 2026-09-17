#!/usr/bin/env node
/**
 * Kontrollerar om matcher flyttats och skickar webbnotis till dem som vill veta.
 *
 * Önskemål 2026-09-17: "Kan användaren få en notis när en match flyttas?"
 * Ragnar valde notis från sidans egen ikon på hemskärmen, byggd som i Ras/Domare.
 * Körs varje timme på GitHub (.github/workflows/notiser.yml).
 *
 * VEM SOM FÅR: prenumerationerna i databasen (notiser/{id}) bär grupp och lag.
 * Bara de grupper någon prenumererar på kontrolleras.
 *
 * VAD SOM ÄR FLYTTAT: en ospelad, kommande match (samma matchnummer och lag) som fått
 * annat datum, annan tid eller annan ishall sedan förra kontrollen. Förra
 * kontrollens schema ligger i senast/<grupp>.json och committas av GitHub.
 * Första gången en grupp kontrolleras sparas bara schemat — ingen notis.
 *
 * NYCKLAR, aldrig i repot:
 *   på GitHub: hemligheterna VAPID_JSON och FIREBASE_SERVICE_ACCOUNT, skrivs till filer av arbetsflödet
 *   lokalt:    ~/Claude/SweHockey-data/vapid.json och serviceAccount.json
 *
 *   node kontrollera.mjs            kontrollera och skicka
 *   node kontrollera.mjs --torr     visa vad som skulle skickas, spara inget
 *   node kontrollera.mjs --prov     en provnotis till alla prenumeranter
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import webpush from 'web-push';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { lasSchema } from '../docs/schema.js';

const HAR = dirname(fileURLToPath(import.meta.url));
const SENAST = resolve(HAR, 'senast');
const DATA = resolve(homedir(), 'Claude/SweHockey-data');
const VAPID = process.env.VAPID_FIL || resolve(DATA, 'vapid.json');
const KONTO = process.env.KONTO_FIL || resolve(DATA, 'serviceAccount.json');
const SIDA = 'https://ragnarferdinand.github.io/swe-hockey/';
const TORR = process.argv.includes('--torr');
const PROV = process.argv.includes('--prov');
const MAX_RADER = 3;

for (const [namn, fil] of [['notisnycklarna', VAPID], ['servicekontot', KONTO]]) {
  if (!existsSync(fil)) { console.error(`${namn} saknas: ${fil}`); process.exit(1); }
}
const vapid = JSON.parse(readFileSync(VAPID, 'utf8'));
webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
initializeApp({ credential: cert(JSON.parse(readFileSync(KONTO, 'utf8'))) });
const db = getFirestore();

const prenumeranter = (await db.collection('notiser').get()).docs;
console.log(`prenumerationer: ${prenumeranter.length}`);

/** Skickar; en prenumeration som telefonen slängt (404/410) raderas. */
async function skicka(doc, notis) {
  if (TORR) { console.log(`[torr] ${doc.id.slice(0, 8)}: ${notis.title} — ${notis.body.replace(/\n/g, ' / ')}`); return; }
  try {
    await webpush.sendNotification(doc.data().subscription, JSON.stringify({ url: SIDA, ...notis }), { TTL: 60 * 60 * 24 * 2 });
    console.log(`  skickad till ${doc.id.slice(0, 8)}`);
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) { await doc.ref.delete(); console.log(`  ${doc.id.slice(0, 8)} borttagen (${err.statusCode})`); }
    else console.warn(`  kunde inte skicka till ${doc.id.slice(0, 8)}: ${err.statusCode ?? ''} ${err.message}`);
  }
}

if (PROV) {
  for (const doc of prenumeranter) {
    await skicka(doc, { title: 'Provnotis från Matcher', body: 'Notiserna fungerar. Du får en notis när en match flyttas.', tag: 'matcher-prov' });
  }
  process.exit(0);
}

const idag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
const nar = m => {
  const dag = new Date(m.datum + 'T12:00:00').toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  return m.tid ? `${dag} ${m.tid}` : dag;
};

mkdirSync(SENAST, { recursive: true });
const grupper = [...new Set(prenumeranter.map(d => d.data().grupp).filter(g => /^\d+$/.test(g ?? '')))];

for (const grupp of grupper) {
  let matcher;
  try {
    const svar = await fetch(`https://stats.swehockey.se/ScheduleAndResults/Schedule/${grupp}`);
    if (!svar.ok) throw new Error(`svarade ${svar.status}`);
    matcher = lasSchema(parseHTML(await svar.text()).document);
  } catch (err) {
    console.warn(`grupp ${grupp}: kunde inte hämta schemat (${err.message}) — försöker nästa timme`);
    continue;
  }
  // Ett tomt schema är nästan alltid ett fel hos Swehockey. Då sparas inget,
  // annars skulle nästa lyckade hämtning se alla matcher som nya.
  if (matcher.length === 0) { console.warn(`grupp ${grupp}: inga matcher lästa — sparar inget`); continue; }

  // Nyckeln är matchnummer + lag: i sammandrag (U11P) delar alla matcher numret "Pool:1,Game:1".
  const nu = Object.fromEntries(matcher.filter(m => m.nr)
    .map(m => [`${m.nr}|${m.hemma}|${m.borta}`, { datum: m.datum, tid: m.tid, arena: m.arena, hemma: m.hemma, borta: m.borta, resultat: m.resultat }]));
  const fil = resolve(SENAST, `${grupp}.json`);
  const forut = existsSync(fil) ? JSON.parse(readFileSync(fil, 'utf8')).matcher : null;

  const flyttade = [];
  for (const [nyckel, fore] of Object.entries(forut ?? {})) {
    const efter = nu[nyckel];
    if (!efter || fore.resultat || efter.resultat) continue;
    if (fore.datum < idag && efter.datum < idag) continue;
    if (fore.datum === efter.datum && fore.tid === efter.tid && fore.arena === efter.arena) continue;
    flyttade.push({ fore, efter });
  }
  console.log(`grupp ${grupp}: ${matcher.length} matcher, ${forut ? `${flyttade.length} flyttade` : 'första kontrollen — sparar bara'}`);

  if (!TORR && JSON.stringify(nu) !== JSON.stringify(forut)) {
    writeFileSync(fil, JSON.stringify({ grupp, matcher: nu }, null, 1) + '\n');
  }
  if (flyttade.length === 0) continue;
  flyttade.sort((a, b) => (a.efter.datum + a.efter.tid).localeCompare(b.efter.datum + b.efter.tid));

  for (const doc of prenumeranter.filter(d => d.data().grupp === grupp)) {
    const lag = doc.data().lag;
    const mina = flyttade.filter(f => !lag || lag === 'Alla lag' || f.efter.hemma === lag || f.efter.borta === lag);
    if (mina.length === 0) continue;
    const rader = mina.map(({ fore, efter }) => {
      const ny = [fore.datum !== efter.datum || fore.tid !== efter.tid ? `${nar(fore)} → ${nar(efter)}` : nar(efter)];
      if (fore.arena !== efter.arena) ny.push(`${fore.arena} → ${efter.arena}`);
      return `${efter.hemma} – ${efter.borta}: ${ny.join(', ')}`;
    });
    await skicka(doc, {
      title: mina.length === 1 ? 'Match flyttad' : `${mina.length} matcher flyttade`,
      body: rader.slice(0, MAX_RADER).join('\n') + (rader.length > MAX_RADER ? `\n… och ${rader.length - MAX_RADER} till` : ''),
      tag: `matcher-${grupp}`,
    });
  }
}
