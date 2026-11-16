// Vendite allo scoperto solo nei regimi ribassisti, con filtri macro (dollaro, paura, azionario, tassi). Cripto 1d e 4h.
// Regole scelte sul primo 60% della storia, verificate sul 40% mai visto (include il calo 2025-26).
import fs from 'node:fs';
import { U, histB, histY, prep, ENT, GRID, EXIT_TRAIL, W0, port, slim, rd, trades, sleep } from './lib.mjs';
const ema = (a, p) => { const k = 2 / (p + 1), o = new Array(a.length); let e = a[0]; for (let i = 0; i < a.length; i++) { e = i ? a[i] * k + e * (1 - k) : a[0]; o[i] = e } return o };
const MAC = {}; for (const [id, sym] of [['dxy', 'DX-Y.NYB'], ['vix', '^VIX'], ['spx', '^GSPC'], ['tnx', '^TNX']]) { try { const r = await histY(sym); const c = r.map(x => x[4]); MAC[id] = { t: r.map(x => x[0]), c, e50: ema(c, 50), e100: ema(c, 100) }; await sleep(400) } catch (e) { console.log('macro', id, e.message) } }
const at = (id, t) => { const m = MAC[id]; if (!m) return null; let lo = 0, hi = m.t.length - 1, r = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (m.t[mid] <= t - 864e5) { r = mid; lo = mid + 1 } else hi = mid - 1 } return r < 0 ? null : r };
const F = {
  dollaro: t => { const i = at('dxy', t); return i != null && MAC.dxy.c[i] > MAC.dxy.e50[i] },
  paura: t => { const i = at('vix', t); return i != null && MAC.vix.c[i] > 20 },
  azionario: t => { const i = at('spx', t); return i != null && MAC.spx.c[i] < MAC.spx.e100[i] },
  tassi: t => { const i = at('tnx', t); return i != null && MAC.tnx.c[i] > MAC.tnx.e50[i] } };
const OUT = { at: new Date().toISOString(), note: 'vendite solo in regime ribassista', prove: [] };
const FAMS = ['don', 'bb', 'kelt', 'st'];
for (const G of [{ tf: '1d', ms: 864e5 }, { tf: '4h', ms: 144e5 }]) {
  const series = []; let k = 0;
  for (const u of U.filter(u => u.cls == 'cripto')) { try { series.push({ ...u, ix: k++, K: prep(await histB(u.sym, G.tf, G.tf == '4h' ? 13000 : 3500), G.ms), sig: {} }) } catch (e) { console.log(u.sym, e.message) } }
  const starts = series.map(s => s.K.t[W0]).sort((a, b) => a - b), t0 = starts[Math.floor(starts.length / 2)], t1 = Math.max(...series.map(s => s.K.t[s.K.n - 1])), ts = t0 + 0.6 * (t1 - t0);
  const M = new Map(); for (const S of series) { const e = S.K.ema(200); for (let i = W0; i < S.K.n; i++) { const t = S.K.t[i]; let m = M.get(t); if (!m) M.set(t, m = { a: 0, n: 0 }); m.n++; if (S.K.c[i] > e[i]) m.a++ } }
  const reg = (tIn, th) => { const m = M.get(tIn - G.ms); return m ? m.a / m.n < th : false };
  const VAR = [['nessun filtro (come prima)', () => true], ['mercato debole (meno della metà sopra la media a 200)', t => reg(t, .5)], ['mercato molto debole (meno del 30%)', t => reg(t, .3)],
    ['debole + dollaro forte', t => reg(t, .5) && F.dollaro(t)], ['debole + paura alta (VIX sopra 20)', t => reg(t, .5) && F.paura(t)], ['debole + azionario debole', t => reg(t, .5) && F.azionario(t)], ['debole + tassi in salita', t => reg(t, .5) && F.tassi(t)]];
  for (const prof of [['CFD (interessi giornalieri alti)', 0.002, 0.0005], ['futures perpetui (costi bassi)', 0.0015, 0.0001]]) {
    for (const S of series) { S.cost = prof[1]; S.hc = prof[2] }
    const R = []; for (const fam of FAMS) for (const e of GRID[fam]) for (const x of EXIT_TRAIL) { let T = []; const key = fam + JSON.stringify(e); for (const S of series) { const sig = S.sig[key] ??= ENT[fam](S.K, e); T = T.concat(trades(S, sig, -1, x, false)) } T.sort((a, b) => a[0] - b[0]); R.push({ fam, e, x, T }) }
    for (const [nome, f] of VAR) {
      const C = []; for (const r of R) { const Fl = r.T.filter(t => f(t[0])); const is = port(Fl, t0, ts); if (is.n < 40) continue; C.push({ r, Fl, is }) }
      C.sort((a, b) => b.is.cagr / Math.max(-b.is.dd, .05) - a.is.cagr / Math.max(-a.is.dd, .05)); const best = C[0];
      if (!best) { OUT.prove.push({ tf: G.tf, costi: prof[0], filtro: nome, nessuna: true }); continue }
      const oos = port(best.Fl, ts, t1), all = port(best.Fl, t0, t1), pos = C.filter(c => { const o = port(c.Fl, ts, t1); return o.n >= 20 && o.cagr > 0 }).length;
      OUT.prove.push({ tf: G.tf, costi: prof[0], filtro: nome, fam: best.r.fam, par: best.r.e, sd: best.r.x.sd, td: best.r.x.td, is: slim(best.is), oos: slim(oos), all: slim(all), candidate: C.length, oosPositive: pos });
      console.log(G.tf, prof[0].slice(0, 4), nome.slice(0, 34).padEnd(34), best.r.fam, 'is', rd(best.is.cagr), 'oos', rd(oos.cagr), rd(oos.dd), 'n', oos.n, 'positive', pos + '/' + C.length)
    }
  }
}
fs.mkdirSync('risultati', { recursive: true }); fs.writeFileSync('risultati/test5_vendite.json', JSON.stringify(OUT));
