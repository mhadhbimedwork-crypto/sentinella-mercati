// Day trading: prova ogni agente intraday (15 minuti) su dati reali Binance, con costi da futures, long e short, chiusura a fine giornata.
// Metodo: parametri scelti sul primo 60% della storia, verificati sul restante 40%; poi prove di robustezza. Output: risultati/day.json, day_storico.json
import fs from 'node:fs'; import { createRequire } from 'node:module';
import { U, histB, port, rd, slim, sleep, CAP } from './lib.mjs';
const { prep, AG, EXITS, simulate } = createRequire(import.meta.url)('../docs/dayagents.js');
const MS = 9e5, N = +process.env.DAYN || 35000, COST = 0.0014, RISKD = 0.005, MAXO = 4;
const SYN = process.env.SYN === '1';
const coins = U.filter(u => u.cls == 'cripto' && u.src == 'b');
function synth(seed) { let s = seed, r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296, p = 100, t = Date.UTC(2025, 0, 1), o = []; for (let i = 0; i < 20000; i++) { const ch = (r() - 0.5) * 0.006, op = p, cl = p * (1 + ch), h = Math.max(op, cl) * (1 + r() * 0.002), l = Math.min(op, cl) * (1 - r() * 0.002); o.push([t, op, h, l, cl, 100 + r() * 100, 50]); p = cl; t += MS } return o }
const S = []; const log = [];
for (const [q, u] of coins.entries()) {
  try { const raw = SYN ? synth(q + 7) : await histB(u.sym, '15m', N); if (raw.length < 3000) throw new Error('storia corta'); S.push({ u, q, K: prep(raw.filter(r => r[0] + MS <= Date.now()), MS) }); if (!SYN) await sleep(150) } catch (e) { log.push(u.sym + ': ' + e.message) }
}
if (S.length < 5) { fs.mkdirSync('risultati', { recursive: true }); fs.writeFileSync('risultati/day.json', JSON.stringify({ at: new Date().toISOString(), errore: 'dati insufficienti', log })); console.log('dati insufficienti', log); process.exit(0) }
const t0 = Math.max(...S.map(s => s.K.t[0])), t1 = Math.min(...S.map(s => s.K.t[s.K.n - 1])) + MS, tc = t0 + 0.6 * (t1 - t0);
// seed casuale per le varianti di uscita extra (cambia ogni 12 ore)
let seed = Math.floor(Date.now() / 432e5) % 100000 + 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const EX = EXITS.slice(); for (let i = 0; i < 12; i++) EX.push({ sd: +(0.7 + rnd() * 1.8).toFixed(2), tp: [0, 1, 1.5, 2, 2.5, 4][Math.floor(rnd() * 6)], be: rnd() < 0.5 ? 1 : 0, hrs: rnd() < 0.5 ? 1 : 0 });
const key = (a, p, x) => a + '|' + JSON.stringify(p) + '|' + [x.sd, x.tp, x.be, x.hrs].join('|');
function runAll(a, p, x, o = {}, sigs) {
  const T = []; for (const s of S) { const sg = sigs ? sigs[s.q] : AG[a].sig(s.K, p); T.push(...simulate(s.K, sg, x, { cost: COST, ix: s.q, delay: o.delay || 0 }).T) }
  return T.sort((u, v) => u[0] - v[0])
}
const P = (T, a, b, o) => port(T, a, b, { risk: RISKD, maxOpen: MAXO, ...o });
const cand = [];
for (const [a, def] of Object.entries(AG)) {
  for (const p of def.grid) {
    const sigs = {}; for (const s of S) sigs[s.q] = def.sig(s.K, p);
    for (const x of EX) {
      const T = runAll(a, p, x, {}, sigs), is = P(T, t0, tc); if (is.n < 80) continue;
      const oos = P(T, tc, t1); cand.push({ a, p, x, T, is, oos, sc: is.n >= 80 ? is.cagr / Math.max(-is.dd, 0.05) : -9, sigs })
    }
  }
}
// miglior candidato per agente (scelto SOLO sul periodo di prova), poi controlli sul periodo di verifica
const res = [];
for (const a of Object.keys(AG)) {
  const L = cand.filter(c => c.a == a).sort((u, v) => v.sc - u.sc); if (!L.length) { res.push({ agente: a, nome: AG[a].nome, stato: 'a riposo', motivo: 'pochi scambi' }); continue }
  const c = L[0], nb = L.filter(z => JSON.stringify(z.p) == JSON.stringify(c.p) && z !== c), nbOk = nb.length ? nb.filter(z => z.oos.cagr > 0).length / nb.length : 0;
  const c2 = P(c.T, tc, t1, { costMul: 2 }), T1 = runAll(c.a, c.p, c.x, { delay: 1 }, c.sigs), d1 = P(T1, tc, t1);
  const bs = Object.entries(c.oos.bySym).sort((u, v) => v[1] - u[1]); const Tn = c.T.filter(r => !bs.length || r[4] != +bs[0][0]), nb1 = P(Tn, tc, t1);
  const checks = { oosPositivo: c.oos.cagr > 0 && c.oos.n >= 30, costiDoppi: c2.cagr > 0, ritardo: d1.cagr > 0, senzaMigliore: nb1.cagr > 0, vicini: nbOk >= 0.5 };
  const ok = Object.values(checks).filter(Boolean).length;
  const stato = ok == 5 ? 'promosso' : checks.oosPositivo && ok >= 3 ? 'in prova' : 'a riposo';
  const ye = {}; for (const [y, e] of Object.entries(c.oos.byYear)) ye[y] = rd(e / CAP - 1, 3);
  res.push({ agente: a, nome: AG[a].nome, regola: AG[a].desc(c.p), par: c.p, uscita: c.x, chiave: key(a, c.p, c.x), stato, controlli: checks, passati: ok, prova: slim(c.is), verifica: slim(c.oos), costiDoppi: slim(c2), ritardo1: slim(d1), conSenzaMigliore: slim(nb1), vicini: rd(nbOk, 2), perAnno: ye })
}
res.sort((u, v) => ({ promosso: 0, 'in prova': 1, 'a riposo': 2 }[u.stato] - { promosso: 0, 'in prova': 1, 'a riposo': 2 }[v.stato]) || (v.verifica?.cagr ?? -9) - (u.verifica?.cagr ?? -9));
// portafoglio combinato dei promossi/in prova (agenti diversi insieme)
const top = res.filter(r => r.stato != 'a riposo'); let comb = null;
if (top.length) { const TT = []; for (const r of top) { const c = cand.find(z => z.a == r.agente && key(z.a, z.p, z.x) == r.chiave); if (c) TT.push(...c.T) } TT.sort((u, v) => u[0] - v[0]); comb = { prova: slim(P(TT, t0, tc, { maxOpen: 6 })), verifica: slim(P(TT, tc, t1, { maxOpen: 6 })), agenti: top.length } }
const out = { at: new Date().toISOString(), dati: { barre: S[0].K.n, giorni: Math.round((t1 - t0) / 864e5), mercati: S.map(s => s.u.sym), da: new Date(t0).toISOString().slice(0, 10), a: new Date(t1).toISOString().slice(0, 10), spezzaIl: new Date(tc).toISOString().slice(0, 10) }, ipotesi: { costoAndataRitorno: COST, rischioPerOperazione: RISKD, maxAperte: MAXO, capitale: CAP, uscitaFineGiornataUTC: true, stopPrimaDelTarget: true }, candidatiProvati: cand.length, agenti: res, combinato: comb, log };
if (!SYN) {
  fs.mkdirSync('risultati', { recursive: true }); fs.writeFileSync('risultati/day.json', JSON.stringify(out));
  let H = []; try { H = JSON.parse(fs.readFileSync('risultati/day_storico.json', 'utf8')) } catch (e) { }
  H.push({ at: out.at, scelte: res.filter(r => r.chiave).map(r => ({ a: r.agente, k: r.chiave, s: r.stato, o: r.verifica.cagr })) }); fs.writeFileSync('risultati/day_storico.json', JSON.stringify(H.slice(-60)))
}
console.log('candidati', cand.length, 'giorni', out.dati.giorni); for (const r of res) console.log(r.stato.padEnd(9), r.agente.padEnd(7), r.verifica ? `OOS cagr ${r.verifica.cagr} dd ${r.verifica.dd} n ${r.verifica.n} avgR ${r.verifica.avgR} | ok ${r.passati}/5` : r.motivo); if (comb) console.log('combinato', JSON.stringify(comb.verifica))
