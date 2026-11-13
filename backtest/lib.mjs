// Motore di backtest di Sentinella Mercati (gira su GitHub Actions).
// Fase 1: 11 famiglie di strategie/indicatori, ogni combinazione provata su tutti i mercati,
//         scelta sul primo 60% della storia (is) e verificata sul 40% mai visto (oos).
// Fase 2: 10 prove di robustezza sui finalisti. Capitale iniziale 10.000, rischio 1% per operazione.
import fs from 'node:fs';
export const SYN = process.argv.includes('--synthetic');
const CAP = 10000, RISK = 0.01, MAXOPEN = 6, YR = 365.25 * 864e5;
const U = [
  ...['BTC', 'ETH', 'BNB', 'XRP', 'SOL', 'ADA', 'DOGE', 'AVAX', 'DOT', 'LINK', 'LTC'].map(s => ({ sym: s + 'USDT', src: 'b', cls: 'cripto', cost: s == 'BTC' || s == 'ETH' ? 0.001 : 0.002, hc: 0.0005 })),
  ...['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY'].map(s => ({ sym: s + '=X', src: 'y', cls: 'valute', cost: 0.00012, hc: 0.00003 })),
  ...['^GSPC', '^NDX', '^DJI', '^GDAXI', '^FTSE', '^N225', '^STOXX50E', '^RUT'].map(s => ({ sym: s, src: 'y', cls: 'indici', cost: 0.0003, hc: 0.00012 })),
  ...['GC=F', 'SI=F', 'PL=F', 'HG=F', 'PA=F'].map(s => ({ sym: s, src: 'y', cls: 'metalli', cost: 0.0004, hc: 0.00012 })),
];
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function histB(sym, tf, n) {
  let out = [], end = null;
  while (out.length < n) {
    let j, err;
    for (const b of ['https://data-api.binance.vision', 'https://api.binance.com']) { try { const r = await fetch(b + '/api/v3/klines?symbol=' + sym + '&interval=' + tf + '&limit=1000' + (end ? '&endTime=' + end : '')); if (!r.ok) throw new Error('http ' + r.status); j = await r.json(); break } catch (e) { err = e } }
    if (!j) throw err; if (!j.length) break; out = j.concat(out); end = +j[0][0] - 1; if (j.length < 1000) break
  }
  return out.slice(0, -1).map(r => [+r[0], +r[1], +r[2], +r[3], +r[4], +r[5]])
}
async function histY(sym) {
  let err;
  for (let k = 0; k < 6; k++) for (const h of ['query1', 'query2']) {
    try {
      const r = await fetch('https://' + h + '.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1d&period1=1104537600&period2=' + Math.floor(Date.now() / 1000), { headers: UA });
      if (!r.ok) throw new Error('yahoo http ' + r.status);
      const R = (await r.json()).chart.result[0], q = R.indicators.quote[0], out = [];
      for (let i = 0; i < R.timestamp.length; i++) { const c = q.close[i]; if (c == null || !(c > 0)) continue; const o = q.open[i] > 0 ? q.open[i] : c, h2 = q.high[i] > 0 ? q.high[i] : c, l = q.low[i] > 0 ? q.low[i] : c; out.push([R.timestamp[i] * 1000, o, Math.max(h2, o, c), Math.min(l, o, c), c, q.volume[i] || 0]) }
      return out.slice(0, -1)
    } catch (e) { err = e; await sleep(1500 * (k + 1)) }
  }
  throw err
}
function synth(n, ms, seed) { let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }; const out = []; let p = 100, t = Date.now() - n * ms; for (let i = 0; i < n; i++) { const o = p, d = (rnd() + rnd() + rnd() - 1.5) * 0.03 + 0.0004; p = Math.max(1, p * (1 + d)); const h = Math.max(o, p) * (1 + rnd() * 0.01), l = Math.min(o, p) * (1 - rnd() * 0.01); out.push([t + i * ms, o, h, l, p, 1000 * (1 + rnd())]) } return out }
// ---------- indicatori ----------
const ema = (a, p) => { const k = 2 / (p + 1), o = new Float64Array(a.length); let e = a[0]; for (let i = 0; i < a.length; i++) { e = i ? a[i] * k + e * (1 - k) : a[0]; o[i] = e } return o };
const sma = (a, p) => { const o = new Float64Array(a.length).fill(NaN); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= p) s -= a[i - p]; if (i >= p - 1) o[i] = s / p } return o };
const wilder = (a, p) => { const o = new Float64Array(a.length).fill(NaN); let s = 0; for (let i = 0; i < a.length; i++) { if (i < p) { s += a[i]; if (i === p - 1) o[i] = s / p } else o[i] = (o[i - 1] * (p - 1) + a[i]) / p } return o };
function rsi(c, p) { const o = new Float64Array(c.length).fill(50); let g = 0, l = 0; for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], u = Math.max(d, 0), w = Math.max(-d, 0); if (i <= p) { g += u / p; l += w / p } else { g = (g * (p - 1) + u) / p; l = (l * (p - 1) + w) / p } if (i >= p) o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l) } return o }
// massimo/minimo delle p barre PRECEDENTI (esclusa la corrente)
function prevExt(a, p, mx) { const o = new Float64Array(a.length).fill(NaN); for (let i = p; i < a.length; i++) { let m = a[i - 1]; for (let j = i - p; j < i - 1; j++) m = mx ? Math.max(m, a[j]) : Math.min(m, a[j]); o[i] = m } return o }
function sd(a, p) { const m = sma(a, p), o = new Float64Array(a.length).fill(NaN); for (let i = p - 1; i < a.length; i++) { let s = 0; for (let j = i - p + 1; j <= i; j++)s += (a[j] - m[i]) ** 2; o[i] = Math.sqrt(s / p) } return o }
function prep(raw, ms) {
  const K = { ms, t: raw.map(r => r[0]), o: raw.map(r => r[1]), h: raw.map(r => r[2]), l: raw.map(r => r[3]), c: raw.map(r => r[4]), v: raw.map(r => r[5]), _: {} };
  const { h, l, c } = K, n = c.length;
  const tr = c.map((x, i) => i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[i] - l[i]);
  K.atr = wilder(tr, 14);
  const pdm = c.map((x, i) => { if (!i) return 0; const u = h[i] - h[i - 1], d = l[i - 1] - l[i]; return u > d && u > 0 ? u : 0 }), mdm = c.map((x, i) => { if (!i) return 0; const u = h[i] - h[i - 1], d = l[i - 1] - l[i]; return d > u && d > 0 ? d : 0 });
  const sp = wilder(pdm, 14), sm = wilder(mdm, 14);
  K.adx = wilder(c.map((x, i) => { const a = sp[i] / K.atr[i], b = sm[i] / K.atr[i]; return a + b > 0 ? 100 * Math.abs(a - b) / (a + b) : 0 }), 14);
  K.ema = p => K._['e' + p] ??= ema(c, p); K.sma = p => K._['s' + p] ??= sma(c, p); K.rsi = p => K._['r' + p] ??= rsi(c, p);
  K.hh = p => K._['hh' + p] ??= prevExt(h, p, 1); K.ll = p => K._['ll' + p] ??= prevExt(l, p, 0); K.sd = p => K._['sd' + p] ??= sd(c, p);
  K.n = n; return K
}
function supertrend(K, p, m) { const key = 'st' + p + '_' + m; if (K._[key]) return K._[key]; const n = K.n, tr = K.c.map((x, i) => i ? Math.max(K.h[i] - K.l[i], Math.abs(K.h[i] - K.c[i - 1]), Math.abs(K.l[i] - K.c[i - 1])) : K.h[i] - K.l[i]), a = wilder(tr, p), dir = new Int8Array(n); let ub = 0, lb = 0, d = 1; for (let i = 0; i < n; i++) { if (!(a[i] > 0)) { dir[i] = 0; continue } const mid = (K.h[i] + K.l[i]) / 2, u = mid + m * a[i], lo = mid - m * a[i]; ub = (u < ub || K.c[i - 1] > ub) ? u : ub; lb = (lo > lb || K.c[i - 1] < lb) ? lo : lb; if (!ub) ub = u; if (!lb) lb = lo; if (d > 0 && K.c[i] < lb) d = -1; else if (d < 0 && K.c[i] > ub) d = 1; dir[i] = d } return K._[key] = dir }
// ---------- ingressi: restituiscono Int8Array (+1 compra, -1 vendi) sulla chiusura della barra i ----------
const W0 = 210;
function trendOk(K, f, i, d) { if (f == 'n') return true; const e = K.ema(f == 'e100' ? 100 : 200)[i]; return d > 0 ? K.c[i] > e : K.c[i] < e }
const ENT = {
  don: (K, { lb, f }) => { const s = new Int8Array(K.n), hh = K.hh(lb), ll = K.ll(lb); for (let i = W0; i < K.n; i++) { if (K.c[i] > hh[i] && trendOk(K, f, i, 1)) s[i] = 1; else if (K.c[i] < ll[i] && trendOk(K, f, i, -1)) s[i] = -1 } return s },
  donadx: (K, { lb, adx }) => { const s = ENT.don(K, { lb, f: 'e200' }); for (let i = 0; i < K.n; i++)if (!(K.adx[i] >= adx)) s[i] = 0; return s },
  squeeze: (K, { q }) => { const s = new Int8Array(K.n), m = K.sma(20), d = K.sd(20); for (let i = W0; i < K.n; i++) { const w = d[i] / m[i]; let below = 0; for (let j = i - 120; j < i; j++)if (d[j] / m[j] < w) below++; let was = false; for (let j = i - 10; j < i; j++) { let b = 0; const wj = d[j] / m[j]; for (let k = j - 120; k < j; k += 4)if (d[k] / m[k] < wj) b++; if (b / 30 < q) { was = true; break } } if (!was) continue; if (K.c[i] > m[i] + 2 * d[i]) s[i] = 1; else if (K.c[i] < m[i] - 2 * d[i]) s[i] = -1 } return s },
  bb: (K, { k }) => { const s = new Int8Array(K.n), m = K.sma(20), d = K.sd(20); for (let i = W0; i < K.n; i++) { if (K.c[i] > m[i] + k * d[i] && K.c[i - 1] <= m[i - 1] + k * d[i - 1] && trendOk(K, 'e200', i, 1)) s[i] = 1; else if (K.c[i] < m[i] - k * d[i] && K.c[i - 1] >= m[i - 1] - k * d[i - 1] && trendOk(K, 'e200', i, -1)) s[i] = -1 } return s },
  kelt: (K, { k }) => { const s = new Int8Array(K.n), m = K.ema(20); for (let i = W0; i < K.n; i++) { const u = m[i] + k * K.atr[i], lo = m[i] - k * K.atr[i], pu = m[i - 1] + k * K.atr[i - 1], pl = m[i - 1] - k * K.atr[i - 1]; if (K.c[i] > u && K.c[i - 1] <= pu && trendOk(K, 'e200', i, 1)) s[i] = 1; else if (K.c[i] < lo && K.c[i - 1] >= pl && trendOk(K, 'e200', i, -1)) s[i] = -1 } return s },
  st: (K, { p, m }) => { const s = new Int8Array(K.n), d = supertrend(K, p, m); for (let i = W0; i < K.n; i++)if (d[i] && d[i] != d[i - 1]) s[i] = d[i]; return s },
  emax: (K, { a, b }) => { const s = new Int8Array(K.n), x = K.ema(a), y = K.ema(b); for (let i = W0; i < K.n; i++) { if (x[i] > y[i] && x[i - 1] <= y[i - 1]) s[i] = 1; else if (x[i] < y[i] && x[i - 1] >= y[i - 1]) s[i] = -1 } return s },
  mom: (K, { n }) => { const s = new Int8Array(K.n); for (let i = Math.max(W0, n + 1); i < K.n; i++) { const r = K.c[i] / K.c[i - n] - 1, p = K.c[i - 1] / K.c[i - 1 - n] - 1; if (r > 0 && p <= 0 && trendOk(K, 'e200', i, 1)) s[i] = 1; else if (r < 0 && p >= 0 && trendOk(K, 'e200', i, -1)) s[i] = -1 } return s },
  macd: (K, { f }) => { const s = new Int8Array(K.n), a = K.ema(12), b = K.ema(26), md = a.map((x, i) => x - b[i]), sg = ema(md, 9); for (let i = W0; i < K.n; i++) { const hN = md[i] - sg[i], hP = md[i - 1] - sg[i - 1]; if (hN > 0 && hP <= 0 && trendOk(K, f, i, 1)) s[i] = 1; else if (hN < 0 && hP >= 0 && trendOk(K, f, i, -1)) s[i] = -1 } return s },
  pull: (K, { th }) => { const s = new Int8Array(K.n), r = K.rsi(14); for (let i = W0; i < K.n; i++) { let dipL = false, dipS = false; for (let j = i - 5; j < i; j++) { if (r[j] < th) dipL = true; if (r[j] > 100 - th) dipS = true } if (dipL && K.c[i] > K.h[i - 1] && trendOk(K, 'e200', i, 1)) s[i] = 1; else if (dipS && K.c[i] < K.l[i - 1] && trendOk(K, 'e200', i, -1)) s[i] = -1 } return s },
  rsi2: (K, { th }) => { const s = new Int8Array(K.n), r = K.rsi(2); for (let i = W0; i < K.n; i++) { if (r[i] < th && trendOk(K, 'e200', i, 1)) s[i] = 1; else if (r[i] > 100 - th && trendOk(K, 'e200', i, -1)) s[i] = -1 } return s },
};
const NAMES = { don: 'Rottura del canale (Donchian)', donadx: 'Rottura canale + ADX', squeeze: 'Compressione di volatilità + rottura Bollinger', bb: 'Rottura bande di Bollinger', kelt: 'Rottura canale di Keltner', st: 'Supertrend', emax: 'Incrocio medie esponenziali', mom: 'Momentum (variazione a N barre)', macd: 'MACD con filtro di trend', pull: 'Ritracciamento RSI nel trend', rsi2: 'RSI a 2 periodi (rientro)' };
const cart = o => Object.entries(o).reduce((acc, [k, vs]) => acc.flatMap(a => vs.map(v => ({ ...a, [k]: v }))), [{}]);
const GRID = {
  don: cart({ lb: [10, 20, 30, 55, 100], f: ['n', 'e100', 'e200'] }), donadx: cart({ lb: [20, 30, 55], adx: [20, 25, 30] }), squeeze: cart({ q: [0.15, 0.3] }),
  bb: cart({ k: [2, 2.5] }), kelt: cart({ k: [1.5, 2, 2.5] }), st: cart({ p: [10, 14], m: [2, 3, 4] }),
  emax: [{ a: 10, b: 50 }, { a: 21, b: 50 }, { a: 21, b: 100 }, { a: 21, b: 200 }, { a: 50, b: 100 }, { a: 50, b: 200 }],
  mom: cart({ n: [60, 100, 200] }), macd: cart({ f: ['e100', 'e200'] }), pull: cart({ th: [35, 40, 45] }), rsi2: cart({ th: [5, 10, 15] }),
};
const EXIT_TRAIL = cart({ sd: [1, 1.5, 2, 3], td: [3, 4, 6, 8, 12] }), EXIT_MR = cart({ sd: [2, 3] }).map(x => ({ ...x, td: 0 }));
// ---------- simulazione di una operazione ----------
function sim(K, j0, d, E, SD, TD, mr) {
  const n = K.n; let stop = E - d * SD, best = E; const s5 = mr ? K.sma(5) : null;
  for (let j = j0; j < n; j++) {
    const hi = K.h[j], lo = K.l[j], op = K.o[j];
    if (d > 0 ? lo <= stop : hi >= stop) { const f = j > j0 ? (d > 0 ? Math.min(stop, op) : Math.max(stop, op)) : stop; return { r: d * (f - E) / SD, j } }
    if (mr) { if (d * (K.c[j] - s5[j]) > 0 || j - j0 >= 9) return { r: d * (K.c[j] - E) / SD, j }; continue }
    best = d > 0 ? Math.max(best, hi) : Math.min(best, lo); const t = best - d * TD; stop = d > 0 ? Math.max(stop, t) : Math.min(stop, t)
  }
  return { r: d * (K.c[n - 1] - E) / SD, j: n - 1 }
}
// operazioni di una combinazione su una serie: [tIn, tOut, rLordo, costoR, indiceSerie]
function trades(S, sig, d, x, mr, delay = 0) {
  const K = S.K, out = []; let busy = -1;
  for (let i = W0; i < K.n - 2 - delay; i++) {
    if (sig[i] !== d || i <= busy) continue; const a = K.atr[i]; if (!(a > 0)) continue;
    const j0 = i + 1 + delay, E = K.o[j0], SD = x.sd * a, o = sim(K, j0, d, E, SD, x.td * a, mr); busy = o.j;
    const days = (K.t[o.j] - K.t[j0]) / 864e5 + K.ms / 864e5; out.push([K.t[j0], K.t[o.j] + K.ms, o.r, (S.cost + S.hc * days) * E / SD, S.ix])
  }
  return out
}
// ---------- portafoglio: capitale, rischio % per operazione, massimo posizioni aperte ----------
function port(T, t0, t1, o = {}) {
  const risk = o.risk ?? RISK, maxOpen = o.maxOpen ?? MAXOPEN, cm = o.costMul ?? 1; let eq = CAP, pk = CAP, dd = 0, n = 0, w = 0, sr = 0, skipped = 0; const open = [], bySym = {}, byYear = {};
  const close = upTo => { open.sort((a, b) => a[0] - b[0]); while (open.length && open[0][0] <= upTo) { const [tx, pnl] = open.shift(); eq += pnl; pk = Math.max(pk, eq); dd = Math.min(dd, eq / pk - 1); const y = new Date(tx).getUTCFullYear(); byYear[y] = eq } };
  for (const tr of T) { if (tr[0] < t0 || tr[0] >= t1) continue; close(tr[0]); if (open.length >= maxOpen) { skipped++; continue } const r = tr[2] - cm * tr[3]; n++; if (r > 0) w++; sr += r; bySym[tr[4]] = (bySym[tr[4]] || 0) + r; open.push([tr[1], Math.max(eq, 0) * risk * r]) }
  close(Infinity); const yrs = Math.max((t1 - t0) / YR, 0.25), sy = Object.values(bySym);
  return { n, wr: n ? w / n : 0, avgR: n ? sr / n : 0, eq, ret: eq / CAP - 1, cagr: eq > 0 ? Math.pow(eq / CAP, 1 / yrs) - 1 : -1, dd, yrs, skipped, pos: sy.length ? sy.filter(x => x > 0).length / sy.length : 0, bySym, byYear }
}
const score = p => p.n >= 40 ? p.cagr / Math.max(-p.dd, 0.05) : -9;
const rd = (x, k = 4) => x == null || !isFinite(x) ? null : +x.toFixed(k);
const slim = p => ({ n: p.n, wr: rd(p.wr), avgR: rd(p.avgR), eq: rd(p.eq, 0), cagr: rd(p.cagr), dd: rd(p.dd), yrs: rd(p.yrs, 2), pos: rd(p.pos, 2) });
export { U, CAP, RISK, MAXOPEN, YR, W0, histB, histY, synth, prep, ENT, NAMES, GRID, EXIT_TRAIL, cart, port, score, rd, slim, sleep, ema };
