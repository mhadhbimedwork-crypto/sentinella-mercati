// Segnali day trading dal vivo: applica gli agenti scelti da day.json alle barre a 15 minuti appena chiuse. Non invia ordini: scrive risultati/day_segnali.json.
import fs from 'node:fs'; import { createRequire } from 'node:module';
import { U, histB, sleep, CAP } from './lib.mjs';
const { prep, AG, simulate } = createRequire(import.meta.url)('../docs/dayagents.js');
const MS = 9e5, N = 96, COST = 0.0014;
let D = null; try { D = JSON.parse(fs.readFileSync('risultati/day.json', 'utf8')) } catch (e) { }
let H = []; try { H = JSON.parse(fs.readFileSync('risultati/day_storico.json', 'utf8')).slice(-8) } catch (e) { }
const out = { at: new Date().toISOString(), cap: CAP, risk: 0.005, agenti: [], mercati: {}, log: [] };
if (!D || !D.agenti) { out.errore = 'nessuna ottimizzazione disponibile'; fs.writeFileSync('risultati/day_segnali.json', JSON.stringify(out)); console.log(out.errore); process.exit(0) }
const volte = (a, k) => H.filter(r => (r.scelte || []).some(s => s.a == a && s.k == k && s.s != 'a riposo')).length;
const coins = U.filter(u => u.cls == 'cripto' && u.src == 'b'), S = [];
for (const u of coins) { try { const raw = (await histB(u.sym, '15m', 1500)).filter(r => r[0] + MS <= Date.now()); S.push({ u, K: prep(raw, MS) }); await sleep(120) } catch (e) { out.log.push(u.sym + ': ' + e.message) } }
const now = Date.now(), pr = [];
for (const A of D.agenti) {
  const att = A.stato == 'promosso' || A.stato == 'in prova'; if (!att || !A.chiave) { out.agenti.push({ agente: A.agente, nome: A.nome, stato: A.stato, regola: A.regola || null, segnali: [] }); continue }
  const v = volte(A.agente, A.chiave), x = A.uscita, def = AG[A.agente], rec = { agente: A.agente, nome: A.nome, stato: A.stato, stabile: v + ' su ' + H.length, adottabile: A.stato == 'promosso' && v >= 3, regola: A.regola, uscita: x, verifica: A.verifica, segnali: [] };
  for (const s of S) {
    const K = s.K, n = K.n, sig = def.sig(K, A.par), i = n - 1, fresca = now - (K.t[i] + MS) < 20 * 6e4, a = K.atr[i]; if (!(a > 0)) continue;
    const sim = simulate(K, sig, x, { cost: COST, ix: 0 }), op = sim.open && K.dayId[sim.open.i0] === K.dayId[i] ? sim.open : null;
    const nuovo = fresca && sig[i] !== 0 && K.dayId[i] === Math.floor(now / 864e5) && !(x.hrs && !(K.hr[i] >= 7 && K.hr[i] < 21)) && !op;
    if (!nuovo && !op) continue;
    const d = nuovo ? sig[i] : op.dir, E = nuovo ? K.c[i] : op.E, SD = nuovo ? x.sd * a : op.SD, nm = s.u.sym.replace('USDT', '');
    pr.push(s.u.sym); rec.segnali.push({ sym: nm, mt5: nm + 'USD', dir: d > 0 ? 'compra' : 'vendi', stato: nuovo ? 'nuovo' : 'aperta', entrata: +E.toPrecision(6), px: K.c[i], stop: +(nuovo ? E - d * SD : op.stop).toPrecision(6), stopIniziale: +(E - d * SD).toPrecision(6), tp: x.tp ? +(E + d * x.tp * SD).toPrecision(6) : null, stopDist: +SD.toPrecision(5), R: +(d * (K.c[i] - E) / SD).toFixed(2), dal: new Date(nuovo ? K.t[i] + MS : op.t0).toISOString(), chiusuraUTC: '23:45 UTC' })
  }
  out.agenti.push(rec)
}
const show = new Set([...pr, 'BTCUSDT']);
for (const s of S) if (show.has(s.u.sym)) { const K = s.K, n = K.n, f = n - N, nm = s.u.sym.replace('USDT', ''); out.mercati[nm] = { t: K.t.slice(f), c: Array.from(K.c.slice(f)), vwap: Array.from(K.vwap.slice(f), z => +z.toPrecision(6)), pdH: +K.pdH[n - 1].toPrecision(6), pdL: +K.pdL[n - 1].toPrecision(6), px: K.c[n - 1], atr: +K.atr[n - 1].toPrecision(5) } }
fs.writeFileSync('risultati/day_segnali.json', JSON.stringify(out));
console.log(out.agenti.map(a => a.agente + ':' + a.stato + ':' + a.segnali.length).join(' '), out.log)
