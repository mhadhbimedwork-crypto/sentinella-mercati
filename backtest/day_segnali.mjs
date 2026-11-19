// Segnali day trading dal vivo su cripto, forex, oro e indici: applica gli agenti scelti da day.json alle barre appena chiuse. Non invia ordini.
import fs from 'node:fs'; import { createRequire } from 'node:module';
import { CAP, sleep } from './lib.mjs';
import { CLASSI, MSTF, carica, quote } from './daydata.mjs';
const { prep, AG, simulate } = createRequire(import.meta.url)('../docs/dayagents.js');
const N = 96;
let D = null; try { D = JSON.parse(fs.readFileSync('risultati/day.json', 'utf8')) } catch (e) { }
let H = []; try { H = JSON.parse(fs.readFileSync('risultati/day_storico.json', 'utf8')).slice(-8) } catch (e) { }
const out = { at: new Date().toISOString(), cap: CAP, risk: 0.005, agenti: [], mercati: {}, snap: [], log: [] };
const save = () => { fs.writeFileSync('risultati/day_segnali.json', JSON.stringify(out)); console.log(out.agenti.map(a => a.cls + ':' + a.agente + ':' + a.stato + ':' + a.segnali.length).join(' '), out.log) };
if (!D || !D.classi) { out.errore = 'nessuna ottimizzazione disponibile'; save(); process.exit(0) }
const volte = (c, a, k) => H.filter(r => (r.scelte || []).some(s => s.c == c && s.a == a && s.k == k && s.s != 'a riposo')).length;
const now = Date.now(), cache = {}, show = new Set();
async function dati(C, tf) {
  const id = C.id + tf; if (cache[id]) return cache[id]; const S = [];
  for (const m of C.mercati) { try { const raw = await carica(m, tf, 1500); if (raw.length < 300) throw new Error('storia corta'); S.push({ m, K: prep(raw, MSTF[tf]) }); await sleep(120) } catch (e) { out.log.push(m.s + ' ' + tf + ': ' + e.message) } }
  return cache[id] = S
}
for (const CD of D.classi) {
  const C = CLASSI.find(c => c.id == CD.id); if (!C) continue; const COST = CD.costo ?? C.costo;
  for (const A of CD.agenti || []) {
    const att = (A.stato == 'promosso' || A.stato == 'in prova') && A.chiave; const base = { cls: C.id, clsNome: C.nome, agente: A.agente, nome: A.nome, stato: A.stato, regola: A.regola || null, tf: A.tf || null };
    if (!att) { out.agenti.push({ ...base, segnali: [] }); continue }
    const v = volte(C.id, A.agente, A.chiave), x = A.uscita, def = AG[A.agente], ms = MSTF[A.tf], rec = { ...base, stabile: v + ' su ' + H.length, adottabile: A.stato == 'promosso' && v >= 3, uscita: x, par: A.par, costo: COST, verifica: A.verifica, segnali: [] };
    for (const s of await dati(C, A.tf)) {
      const K = s.K, n = K.n, sig = def.sig(K, A.par), i = n - 1, fresca = now - (K.t[i] + ms) < ms + 5 * 6e4, a = K.atr[i]; if (!(a > 0)) continue;
      const sim = simulate(K, sig, x, { cost: COST, ix: 0 }), op = sim.open && K.dayId[sim.open.i0] === K.dayId[i] ? sim.open : null;
      const nuovo = fresca && sig[i] !== 0 && K.dayId[i] === Math.floor(now / 864e5) && !(x.hrs && !(K.hr[i] >= 7 && K.hr[i] < 21)) && !op;
      if (!nuovo && !op) continue;
      const d = nuovo ? sig[i] : op.dir, E = nuovo ? K.c[i] : op.E, SD = nuovo ? x.sd * a : op.SD; show.add(C.id + '|' + s.m.nome);
      rec.segnali.push({ sym: s.m.nome, mt5: s.m.mt5, dir: d > 0 ? 'compra' : 'vendi', stato: nuovo ? 'nuovo' : 'aperta', entrata: +E.toPrecision(6), px: K.c[i], stop: +(nuovo ? E - d * SD : op.stop).toPrecision(6), stopIniziale: +(E - d * SD).toPrecision(6), tp: x.tp ? +(E + d * x.tp * SD).toPrecision(6) : null, stopDist: +SD.toPrecision(5), R: +(d * (K.c[i] - E) / SD).toFixed(2), dal: new Date(nuovo ? K.t[i] + ms : op.t0).toISOString(), barraSegnale: K.t[i], chiusuraUTC: '23:45 UTC' })
    }
    out.agenti.push(rec)
  }
}
if (!cache['cripto15m']) await dati(CLASSI[0], '15m');
// istantanea di tutti i mercati (prezzo, variazione 24 ore, andamento, trend) per la pagina Live
for (const C of CLASSI) { const tf = C.tfs.includes('1h') ? '1h' : C.tfs[0]; const S = await dati(C, '1h'); for (const s of S) { const K = s.K, n = K.n, e = K.ema(200)[n - 1], step = 1, b24 = n - 1 - 24, sp = Array.from(K.c.slice(n - 48), z => +z.toPrecision(6)); const q = s.m.src == 'y' ? await quote(s.m.s) : null; out.snap.push({ cls: C.id, live: q ? q.px : null, liveT: q ? q.t : null, sym: s.m.nome, mt5: s.m.mt5, px: K.c[n - 1], ch24: b24 >= 0 ? +(K.c[n - 1] / K.c[b24] - 1).toFixed(4) : null, spark: sp, trend: K.c[n - 1] > e ? 'su' : 'giu', sopraEma200: K.c[n - 1] > e, ultimaBarra: K.t[n - 1] + MSTF['1h'], atr: +K.atr[n - 1].toPrecision(5), pdH: +K.pdH[n - 1].toPrecision(6), pdL: +K.pdL[n - 1].toPrecision(6) }) } }
for (const C of CLASSI) for (const tf of C.tfs) { const S = cache[C.id + tf]; if (!S) continue; for (const s of S) { const nm = s.m.nome; if (out.mercati[nm] || !(show.has(C.id + '|' + nm) || nm == 'BTC')) continue; const K = s.K, n = K.n, f = n - N; out.mercati[nm] = { cls: C.id, t: K.t.slice(f), c: Array.from(K.c.slice(f)), vwap: Array.from(K.vwap.slice(f), z => +z.toPrecision(6)), pdH: +K.pdH[n - 1].toPrecision(6), pdL: +K.pdL[n - 1].toPrecision(6), px: K.c[n - 1], atr: +K.atr[n - 1].toPrecision(5) } } }
// il grafico di un mercato con segnale deve esistere anche se la classe ha un solo agente su un altro tf
save()
