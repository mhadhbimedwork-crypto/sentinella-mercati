// Day trading: prova ogni agente intraday (15 minuti) su dati reali Binance, con costi da futures, long e short, chiusura a fine giornata.
// Metodo: parametri scelti sul primo 60% della storia, verificati sul restante 40%; poi prove di robustezza. Output: risultati/day.json, day_storico.json
import fs from 'node:fs'; import { createRequire } from 'node:module';
import { port, rd, slim, sleep, CAP } from './lib.mjs';
import { CLASSI, MSTF, carica } from './daydata.mjs';
const { prep, AG, EXITS, simulate } = createRequire(import.meta.url)('../docs/dayagents.js');
const RISKD = 0.005, MAXO = 4, SYN = process.env.SYN === '1', log = [];
function synth(seed, ms) { let s = seed, r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296, p = 100, t = Date.UTC(2025, 0, 1), o = []; for (let i = 0; i < 5000; i++) { const ch = (r() - 0.5) * 0.006, op = p, cl = p * (1 + ch), h = Math.max(op, cl) * (1 + r() * 0.002), l = Math.min(op, cl) * (1 - r() * 0.002); o.push([t, op, h, l, cl, 100 + r() * 100, 50]); p = cl; t += ms } return o }
let seed = Math.floor(Date.now() / 432e5) % 100000 + 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const EX = EXITS.slice(); for (let i = 0; i < 12; i++) EX.push({ sd: +(0.7 + rnd() * 2.8).toFixed(2), tp: [0, 1, 1.5, 2, 2.5, 4][Math.floor(rnd() * 6)], be: rnd() < 0.5 ? 1 : 0, hrs: rnd() < 0.5 ? 1 : 0 });
const key = (a, p, x) => a + '|' + JSON.stringify(p) + '|' + [x.sd, x.tp, x.be, x.hrs].join('|');
const rankS = r => ({ promosso: 0, 'in prova': 1, 'a riposo': 2 })[r.stato];
async function classe(C) {
  const COST = +(process.env.COST ?? C.costo), P = (T, a, b, o) => port(T, a, b, { risk: RISKD, maxOpen: MAXO, ...o }), cand = [], CTX = {};
  for (const tf of C.tfs) {
    const ms = MSTF[tf], S = [];
    for (const [q, m] of C.mercati.entries()) {
      try { const raw = SYN ? synth(q + 7, ms) : await carica(m, tf, tf == '15m' ? 35000 : 9000); if (raw.length < 1500) throw new Error('storia corta'); const nov = !raw.some(r => r[5] > 0); S.push({ m, q, nov, K: prep(raw, ms) }); if (!SYN) await sleep(150) } catch (e) { log.push(C.id + ' ' + tf + ' ' + m.s + ': ' + e.message) }
    }
    if (S.length < 4) { log.push(C.id + ' ' + tf + ': dati insufficienti'); continue }
    const t0 = Math.max(...S.map(s => s.K.t[0])), t1 = Math.min(...S.map(s => s.K.t[s.K.n - 1])) + ms, tc = t0 + 0.6 * (t1 - t0); CTX[tf] = { S, t0, t1, tc, ms };
    for (const [a, def] of Object.entries(AG)) { if (a == 'burst' && S.every(s => s.nov)) continue; for (const p of def.grid) {
      const sigs = {}; for (const s of S) sigs[s.q] = def.sig(s.K, p); let any = false; for (const q in sigs) if (sigs[q].some(z => z)) { any = true; break } if (!any) continue;
      for (const x of EX) { const T = runAll(S, a, p, x, {}, sigs, COST), is = P(T, t0, tc); if (is.n < 80) continue; cand.push({ tf, a, p, x, T, is, oos: P(T, tc, t1), sc: is.cagr / Math.max(-is.dd, 0.05), sigs }) }
    } }
  }
  if (!Object.keys(CTX).length) return { id: C.id, nome: C.nome, errore: 'dati insufficienti', agenti: [] };
  const res = [];
  for (const a of Object.keys(AG)) {
    const L = cand.filter(c => c.a == a).sort((u, v) => v.sc - u.sc); if (!L.length) { res.push({ agente: a, nome: AG[a].nome, stato: 'a riposo', motivo: 'pochi scambi o dati assenti' }); continue }
    const c = L[0], X = CTX[c.tf], tc = X.tc, t1 = X.t1, nb = L.filter(z => z.tf == c.tf && JSON.stringify(z.p) == JSON.stringify(c.p) && z !== c), nbOk = nb.length ? nb.filter(z => z.oos.cagr > 0).length / nb.length : 0;
    const c2 = P(c.T, tc, t1, { costMul: 2 }), T1 = runAll(X.S, c.a, c.p, c.x, { delay: 1 }, c.sigs, COST), d1 = P(T1, tc, t1);
    const bs = Object.entries(c.oos.bySym).sort((u, v) => v[1] - u[1]), nb1 = P(c.T.filter(r => !bs.length || r[4] != +bs[0][0]), tc, t1);
    const checks = { oosPositivo: c.oos.cagr > 0 && c.oos.n >= 30, costiDoppi: c2.cagr > 0, ritardo: d1.cagr > 0, senzaMigliore: nb1.cagr > 0, vicini: nbOk >= 0.5 }, ok = Object.values(checks).filter(Boolean).length;
    const stato = ok == 5 ? 'promosso' : checks.oosPositivo && ok >= 3 ? 'in prova' : 'a riposo', W = c.T.filter(r => r[0] >= tc), mean = f => rd(W.reduce((u, r) => u + f(r), 0) / Math.max(1, W.length), 3);
    res.push({ agente: a, nome: AG[a].nome, tf: c.tf, regola: AG[a].desc(c.p), par: c.p, uscita: c.x, chiave: key(a, c.p, c.x), stato, controlli: checks, passati: ok, prova: slim(c.is), verifica: slim(c.oos), costiDoppi: slim(c2), ritardo1: slim(d1), conSenzaMigliore: slim(nb1), vicini: rd(nbOk, 2), lordoR: mean(r => r[2]), costoR: mean(r => r[3]) })
  }
  res.sort((u, v) => rankS(u) - rankS(v) || (v.verifica?.cagr ?? -9) - (u.verifica?.cagr ?? -9));
  const top = res.filter(r => r.stato != 'a riposo'); let comb = null;
  if (top.length) { const TT = []; for (const r of top) { const c = cand.find(z => z.a == r.agente && z.tf == r.tf && key(z.a, z.p, z.x) == r.chiave); if (c) TT.push(...c.T) } TT.sort((u, v) => u[0] - v[0]); const Z = CTX[top[0].tf]; comb = { verifica: slim(P(TT, Z.tc, Z.t1, { maxOpen: 6 })), agenti: top.length } }
  return { id: C.id, nome: C.nome, costo: COST, mercati: C.mercati.map(m => m.nome), dati: Object.fromEntries(Object.entries(CTX).map(([k, v]) => [k, { barre: v.S[0].K.n, giorni: Math.round((v.t1 - v.t0) / 864e5), da: new Date(v.t0).toISOString().slice(0, 10), a: new Date(v.t1).toISOString().slice(0, 10), spezzaIl: new Date(v.tc).toISOString().slice(0, 10), mercatiUsati: v.S.length }])), candidatiProvati: cand.length, agenti: res, combinato: comb }
}
function runAll(S, a, p, x, o = {}, sigs, COST) {
  const T = []; for (const s of S) { const sg = sigs ? sigs[s.q] : AG[a].sig(s.K, p); T.push(...simulate(s.K, sg, x, { cost: COST, ix: s.q, delay: o.delay || 0 }).T) }
  return T.sort((u, v) => u[0] - v[0])
}
const CL = []; for (const C of CLASSI) CL.push(await classe(C));
const out = { at: new Date().toISOString(), ipotesi: { rischioPerOperazione: RISKD, maxAperte: MAXO, capitale: CAP, uscitaFineGiornataUTC: true, stopPrimaDelTarget: true }, classi: CL, log };
if (!SYN) {
  fs.mkdirSync('risultati', { recursive: true }); fs.writeFileSync('risultati/day.json', JSON.stringify(out));
  let H = []; try { H = JSON.parse(fs.readFileSync('risultati/day_storico.json', 'utf8')) } catch (e) { }
  H.push({ at: out.at, scelte: CL.flatMap(c => (c.agenti || []).filter(r => r.chiave).map(r => ({ c: c.id, a: r.agente, k: r.chiave, s: r.stato, o: r.verifica.cagr }))) }); fs.writeFileSync('risultati/day_storico.json', JSON.stringify(H.slice(-60)))
}
for (const c of CL) { console.log('==', c.id, c.errore || '', c.candidatiProvati || ''); for (const r of c.agenti) console.log(r.stato.padEnd(9), r.agente.padEnd(7), r.tf || '', r.verifica ? `lordo ${r.lordoR} costo ${r.costoR} | OOS cagr ${r.verifica.cagr} dd ${r.verifica.dd} n ${r.verifica.n} | ok ${r.passati}/5` : r.motivo); if (c.combinato) console.log('combinato', JSON.stringify(c.combinato.verifica)) } console.log(log)
