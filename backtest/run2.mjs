// Terzo giro: miglioramenti (regime, forza relativa, pareggio, uscita a tempo) sopra le famiglie robuste, solo acquisto,
// e portafoglio unito con rischio ricavato dal calo massimo accettato.
import fs from 'node:fs';
import { U, CAP, YR, W0, SYN, histB, histY, synth, prep, ENT, NAMES, GRID, EXIT_TRAIL, port, score, rd, slim, sleep } from './lib.mjs';
function sim2(K, j0, E, SD, TD, be, ts) {
  const n = K.n; let stop = E - SD, best = E;
  for (let j = j0; j < n; j++) {
    const hi = K.h[j], lo = K.l[j], op = K.o[j];
    if (lo <= stop) { const f = j > j0 ? Math.min(stop, op) : stop; return { r: (f - E) / SD, j } }
    best = Math.max(best, hi); stop = Math.max(stop, best - TD);
    if (be && best - E >= be * SD) stop = Math.max(stop, E + 0.1 * SD);
    if (ts && j - j0 >= ts && K.c[j] - E < 0.5 * SD) return { r: (K.c[j] - E) / SD, j }
  }
  return { r: (K.c[n - 1] - E) / SD, j: n - 1 }
}
function trades2(S, sig, x, be, ts, delay = 0) {
  const K = S.K, out = []; let busy = -1;
  for (let i = W0; i < K.n - 2 - delay; i++) {
    if (sig[i] !== 1 || i <= busy) continue; const a = K.atr[i]; if (!(a > 0)) continue;
    const j0 = i + 1 + delay, E = K.o[j0], SD = x.sd * a, o = sim2(K, j0, E, SD, x.td * a, be, ts); busy = o.j;
    const days = (K.t[o.j] - K.t[j0]) / 864e5 + K.ms / 864e5; out.push([K.t[j0], K.t[o.j] + K.ms, o.r, (S.cost + S.hc * days) * E / SD, S.ix, K.t[i], i >= 90 ? K.c[i] / K.c[i - 90] - 1 : 0])
  }
  return out
}
const groups = [{ cls: 'cripto', tf: '1d', ms: 864e5 }, { cls: 'cripto', tf: '4h', ms: 144e5 }, { cls: 'metalli', tf: '1d', ms: 864e5 }, { cls: 'indici', tf: '1d', ms: 864e5 }];
const FAMS = ['don', 'donadx', 'bb', 'kelt'], REG = ['n', 'breadth', 'leader'], RS = [0, 1], BE = [0, 2], TS = [0, 10];
const OUT = { at: new Date().toISOString(), cap: CAP, groups: [], log: [] }, CH = [];
for (const G of groups) {
  const series = []; let k = 0;
  for (const u of U.filter(u => u.cls == G.cls)) {
    try {
      const raw = SYN ? synth(G.tf == '4h' ? 3000 : 1800, G.ms, 7 + k * 13 + G.ms % 97) : u.src == 'b' ? await histB(u.sym, G.tf, G.tf == '4h' ? 13000 : 3500) : await histY(u.sym);
      if (raw.length < 700) throw new Error('storia corta'); series.push({ ...u, ix: k++, K: prep(raw, G.ms), sig: {} }); if (!SYN && u.src == 'y') await sleep(400)
    } catch (e) { OUT.log.push(`${u.sym} ${G.tf}: ERRORE ${e.message}`) }
  }
  if (series.length < 3) continue;
  const starts = series.map(s => s.K.t[W0]).sort((a, b) => a - b), t0 = starts[Math.floor(starts.length / 2)], t1 = Math.max(...series.map(s => s.K.t[s.K.n - 1])), ts = t0 + 0.6 * (t1 - t0);
  // regime: per ogni istante di chiusura, quota di mercati sopra la EMA 200, stato del mercato guida, mediana della forza a 90 barre
  const M = new Map();
  for (const S of series) { const e = S.K.ema(200); for (let i = W0; i < S.K.n; i++) { const t = S.K.t[i]; let m = M.get(t); if (!m) M.set(t, m = { a: 0, n: 0, lead: null, rs: [] }); m.n++; if (S.K.c[i] > e[i]) m.a++; if (S.ix == 0) m.lead = S.K.c[i] > e[i]; m.rs.push(S.K.c[i] / S.K.c[i - 90] - 1) } }
  for (const m of M.values()) { m.rs.sort((a, b) => a - b); m.med = m.rs[Math.floor(m.rs.length / 2)] }
  const pass = (tr, reg, rs) => { const m = M.get(tr[5]); if (!m) return true; if (reg == 'breadth' && m.a / m.n < 0.5) return false; if (reg == 'leader' && m.lead === false) return false; if (rs && m.n >= 4 && tr[6] < m.med) return false; return true };
  const R = [];
  for (const fam of FAMS) for (const e of GRID[fam]) for (const x of EXIT_TRAIL) for (const be of BE) for (const tsb of TS) {
    let T = []; const key = fam + JSON.stringify(e); for (const S of series) { const sig = S.sig[key] ??= ENT[fam](S.K, e); T = T.concat(trades2(S, sig, x, be, tsb)) } T.sort((a, b) => a[0] - b[0]);
    for (const reg of REG) for (const rs of RS) { const F = reg == 'n' && !rs ? T : T.filter(t => pass(t, reg, rs)); R.push({ fam, e, x, be, tsb, reg, rs, T: F, is: port(F, t0, ts), oos: port(F, ts, t1), all: port(F, t0, t1) }) }
  }
  const sc = p => p.n >= 25 ? p.cagr / Math.max(-p.dd, 0.05) : null, avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  // effetto medio di ogni miglioramento su tutte le combinazioni (periodo mai visto)
  const eff = (name, f) => { const o = {}; for (const r of R) { const v = f(r); (o[v] ??= []).push(r) } return { name, vals: Object.entries(o).map(([v, rs]) => ({ v, cagrOos: rd(avg(rs.map(r => r.oos.cagr))), ddOos: rd(avg(rs.map(r => r.oos.dd))), scoreOos: rd(avg(rs.map(r => sc(r.oos)).filter(x => x != null))), scoreIs: rd(avg(rs.map(r => sc(r.is)).filter(x => x != null))), positivi: rd(rs.filter(r => r.oos.cagr > 0).length / rs.length, 2) })) } };
  const effects = [eff('Regime', r => r.reg), eff('Forza relativa', r => r.rs), eff('Stop a pareggio dopo +2R', r => r.be), eff('Uscita a tempo (10 barre)', r => r.tsb)];
  const rob = r => Math.min(score(r.is), r.oos.n >= 25 ? r.oos.cagr / Math.max(-r.oos.dd, 0.05) : -9);
  const cand = R.filter(r => r.is.n >= 50 && r.oos.n >= 30 && r.is.cagr > 0 && r.oos.cagr > 0 && r.oos.pos >= 0.5).sort((a, b) => rob(b) - rob(a));
  const lab = r => ({ fam: r.fam, name: NAMES[r.fam], par: r.e, sd: r.x.sd, td: r.x.td, be: r.be, ts: r.tsb, reg: r.reg, rs: r.rs });
  const fin = []; for (const r of cand) { if (fin.filter(f => f.fam == r.fam && f.reg == r.reg && f.rs == r.rs).length >= 1) continue; fin.push(r); if (fin.length >= 6) break }
  const finals = fin.map(r => {
    const neigh = R.filter(q => q.fam == r.fam && JSON.stringify(q.e) == JSON.stringify(r.e) && q.be == r.be && q.tsb == r.tsb && q.reg == r.reg && q.rs == r.rs && q != r && Math.abs([1, 1.5, 2, 3].indexOf(q.x.sd) - [1, 1.5, 2, 3].indexOf(r.x.sd)) <= 1 && Math.abs([3, 4, 6, 8, 12].indexOf(q.x.td) - [3, 4, 6, 8, 12].indexOf(r.x.td)) <= 1);
    const base = R.find(q => q.fam == r.fam && JSON.stringify(q.e) == JSON.stringify(r.e) && q.x == r.x && !q.be && !q.tsb && q.reg == 'n' && !q.rs);
    let D = []; for (const S of series) D = D.concat(trades2(S, S.sig[r.fam + JSON.stringify(r.e)], r.x, r.be, r.tsb, 1)); D = D.filter(t => pass(t, r.reg, r.rs)).sort((a, b) => a[0] - b[0]);
    const bs = Object.entries(r.all.bySym).sort((a, b) => b[1] - a[1]), top = +bs[0][0];
    return { ...lab(r), is: slim(r.is), oos: slim(r.oos), all: slim(r.all), byYear: Object.fromEntries(Object.entries(r.all.byYear).map(([y, e]) => [y, rd(e, 0)])), base: base ? { is: slim(base.is), oos: slim(base.oos), all: slim(base.all) } : null,
      vicini: { n: neigh.length, pos: neigh.filter(q => q.oos.cagr > 0).length }, costiDoppi: slim(port(r.T, ts, t1, { costMul: 2 })), ritardo: slim(port(D, ts, t1)), senzaMigliore: { tolto: series.find(s => s.ix == top).sym, ...slim(port(r.T.filter(t => t[4] != top), t0, t1)) } }
  });
  // scelta per il portafoglio unito: primo finalista che passa tutte le prove
  const okf = fin.map((r, i) => ({ r, f: finals[i] })).filter(({ f }) => f.vicini.pos == f.vicini.n && f.costiDoppi.cagr > 0 && f.ritardo.cagr > 0 && f.senzaMigliore.cagr > 0);
  if (okf.length) CH.push({ g: G, r: okf[0].r, f: okf[0].f, t0, ts, t1 });
  OUT.groups.push({ cls: G.cls, tf: G.tf, mercati: series.map(s => s.sym), from: new Date(t0).toISOString().slice(0, 10), split: new Date(ts).toISOString().slice(0, 10), to: new Date(t1).toISOString().slice(0, 10), combos: R.length, effects, finals, scelta: okf.length ? okf[0].f : null });
  console.log(G.cls, G.tf, R.length, 'combinazioni', finals.length, 'finalisti'); for (const r of R) if (!CH.some(c => c.r == r)) r.T = null
}
// portafoglio unito (cripto 1d + metalli + indici): rischio massimo che tiene il calo entro il 10% e il 25%
const uni = CH.filter(c => c.g.tf == '1d');
if (uni.length >= 2) {
  let T = []; uni.forEach((c, k) => { T = T.concat(c.r.T.map(t => [t[0], t[1], t[2], t[3], k * 100 + t[4]])) }); T.sort((a, b) => a[0] - b[0]);
  const t0 = Math.max(...uni.map(c => c.t0)), t1 = Math.max(...uni.map(c => c.t1)), ts = Math.max(...uni.map(c => c.ts));
  const scan = [0.001, 0.0015, 0.002, 0.0025, 0.003, 0.004, 0.005, 0.006, 0.0075, 0.01, 0.0125, 0.015].map(risk => { const a = port(T, t0, t1, { risk, maxOpen: 10 }), o = port(T, ts, t1, { risk, maxOpen: 10 }), x2 = port(T, t0, t1, { risk, maxOpen: 10, costMul: 2 }); return { risk, eq: rd(a.eq, 0), cagr: rd(a.cagr), dd: rd(a.dd), cagrOos: rd(o.cagr), ddOos: rd(o.dd), cagrX2: rd(x2.cagr), n: a.n, byYear: Object.fromEntries(Object.entries(a.byYear).map(([y, e]) => [y, rd(e, 0)])) } });
  const pick = lim => scan.filter(s => s.dd >= -lim).pop() || null;
  OUT.unito = { parti: uni.map(c => `${c.g.cls} ${c.g.tf}`), from: new Date(t0).toISOString().slice(0, 10), split: new Date(ts).toISOString().slice(0, 10), to: new Date(t1).toISOString().slice(0, 10), scan, perFtmo: pick(0.08), perCapitaleProprio: pick(0.25) }
}
fs.mkdirSync('risultati', { recursive: true }); fs.writeFileSync(SYN ? 'risultati/test2_sintetico.json' : 'risultati/backtest2.json', JSON.stringify(OUT)); console.log('fatto');
