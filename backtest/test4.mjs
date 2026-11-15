// Prova order flow: la strategia cripto 4 ore con filtro sul volume a mercato (taker buy / volume totale, dai dati Binance).
import fs from 'node:fs';
process.env.COSTI = 'exchange';
const { U, histB, prep, ENT, W0, port, slim, rd } = await import('./lib.mjs');
const P = { k: 2.5, sd: 3, td: 6, ts: 10 }, MS = 144e5, series = []; let q = 0;
for (const u of U.filter(u => u.cls == 'cripto')) { const K = prep(await histB(u.sym, '4h', 13000), MS); series.push({ ...u, ix: q++, K, sig: ENT.bb(K, { k: P.k }) }) }
const starts = series.map(s => s.K.t[W0]).sort((a, b) => a - b), t0 = starts[Math.floor(starts.length / 2)], t1 = Math.max(...series.map(s => s.K.t[s.K.n - 1])), ts = t0 + 0.6 * (t1 - t0);
const M = new Map();
for (const S of series) { const e = S.K.ema(200); for (let i = W0; i < S.K.n; i++) { const t = S.K.t[i]; let m = M.get(t); if (!m) M.set(t, m = { a: 0, n: 0, rs: [] }); m.n++; if (S.K.c[i] > e[i]) m.a++; m.rs.push(S.K.c[i] / S.K.c[i - 90] - 1) } }
for (const m of M.values()) { m.rs.sort((a, b) => a - b); m.med = m.rs[Math.floor(m.rs.length / 2)] }
function trades(S, delay = 0) {
  const K = S.K, out = []; let busy = -1;
  for (let i = W0; i < K.n - 2 - delay; i++) {
    if (S.sig[i] !== 1 || i <= busy) continue; const a = K.atr[i]; if (!(a > 0)) continue;
    const j0 = i + 1 + delay, E = K.o[j0], SD = P.sd * a, TD = P.td * a; let stop = E - SD, best = E, r = null, jx = K.n - 1;
    for (let j = j0; j < K.n; j++) { if (K.l[j] <= stop) { r = (Math.min(stop, K.o[j]) - E) / SD; jx = j; break } best = Math.max(best, K.h[j]); stop = Math.max(stop, best - TD); if (j - j0 >= P.ts && K.c[j] - E < 0.5 * SD) { r = (K.c[j] - E) / SD; jx = j; break } }
    if (r == null) r = (K.c[K.n - 1] - E) / SD; busy = jx;
    const days = (K.t[jx] - K.t[j0]) / 864e5 + MS / 864e5, r1 = K.tb[i] / K.v[i]; let s3 = 0, v3 = 0; for (let b = i - 5; b <= i; b++) { s3 += K.tb[b]; v3 += K.v[b] }
    out.push([K.t[j0], K.t[jx] + MS, r, (S.cost + S.hc * days) * E / SD, S.ix, K.t[i], i >= 90 ? K.c[i] / K.c[i - 90] - 1 : 0, r1, s3 / v3])
  }
  return out
}
let T = []; for (const S of series) T = T.concat(trades(S)); T.sort((a, b) => a[0] - b[0]);
const base = T.filter(t => { const m = M.get(t[5]); return !m || (m.a / m.n >= 0.5 && t[6] >= m.med) });
const res = [];
for (const [nome, f] of [['base (come oggi)', () => true], ['barra: compratori >50%', t => t[7] > 0.5], ['barra: compratori >52%', t => t[7] > 0.52], ['barra: compratori >55%', t => t[7] > 0.55], ['6 barre: compratori >50%', t => t[8] > 0.5], ['6 barre: compratori >52%', t => t[8] > 0.52], ['barra: compratori <50% (contrario)', t => t[7] < 0.5]]) {
  const F = base.filter(f); res.push({ nome, is: slim(port(F, t0, ts)), oos: slim(port(F, ts, t1)), all: slim(port(F, t0, t1)) });
  console.log(nome, 'n', F.length, 'is', rd(port(F, t0, ts).cagr), 'oos', rd(port(F, ts, t1).cagr), rd(port(F, ts, t1).dd))
}
fs.writeFileSync('risultati/test4_orderflow.json', JSON.stringify({ at: new Date().toISOString(), res }));
