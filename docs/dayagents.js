// Agenti di day trading: stesse regole nei test (Node) e nell'app (browser). Nessuna posizione resta aperta a fine giornata (UTC).
(function (root) {
  const ema = (a, p) => { const k = 2 / (p + 1), o = new Array(a.length); let e = a[0]; for (let i = 0; i < a.length; i++) { e = i ? a[i] * k + e * (1 - k) : a[0]; o[i] = e } return o };
  const sma = (a, p) => { const o = new Array(a.length); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= p) s -= a[i - p]; o[i] = i >= p - 1 ? s / p : a[i] } return o };
  const sdv = (a, p) => { const o = new Array(a.length), m = sma(a, p); for (let i = 0; i < a.length; i++) { if (i < p - 1) { o[i] = 0; continue } let s = 0; for (let j = i - p + 1; j <= i; j++) s += (a[j] - m[i]) ** 2; o[i] = Math.sqrt(s / p) } return o };
  const wilder = (a, p) => { const o = new Array(a.length); o[0] = a[0]; for (let i = 1; i < a.length; i++) o[i] = (o[i - 1] * (p - 1) + a[i]) / p; return o };
  const rsi = (c, p) => { const up = [0], dn = [0]; for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; up.push(d > 0 ? d : 0); dn.push(d < 0 ? -d : 0) } const u = wilder(up, p), d = wilder(dn, p); return c.map((_, i) => d[i] === 0 ? 100 : 100 - 100 / (1 + u[i] / d[i])) };
  function prep(raw, ms) {
    const n = raw.length, K = { n, ms, t: raw.map(r => r[0]), o: raw.map(r => r[1]), h: raw.map(r => r[2]), l: raw.map(r => r[3]), c: raw.map(r => r[4]), v: raw.map(r => r[5]), _: {} };
    const { h, l, c } = K;
    K.atr = wilder(c.map((x, i) => i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[i] - l[i]), 14);
    K.dayId = K.t.map(t => Math.floor(t / 864e5)); K.mn = K.t.map(t => Math.floor((t % 864e5) / 6e4)); K.hr = K.mn.map(m => Math.floor(m / 60));
    K.eod = K.t.map((_, i) => i == n - 1 || K.dayId[i + 1] !== K.dayId[i]);
    K.vwap = new Array(n); let pv = 0, vv = 0, d0 = -1; for (let i = 0; i < n; i++) { if (K.dayId[i] !== d0) { d0 = K.dayId[i]; pv = 0; vv = 0 } const tp = (h[i] + l[i] + c[i]) / 3; pv += tp * K.v[i]; vv += K.v[i]; K.vwap[i] = vv > 0 ? pv / vv : c[i] }
    K.pdH = new Array(n).fill(NaN); K.pdL = new Array(n).fill(NaN); { let cd = -1, ch = 0, cl = 0, ph = NaN, pl = NaN; for (let i = 0; i < n; i++) { if (K.dayId[i] !== cd) { if (cd >= 0) { ph = ch; pl = cl } cd = K.dayId[i]; ch = h[i]; cl = l[i] } else { ch = Math.max(ch, h[i]); cl = Math.min(cl, l[i]) } K.pdH[i] = ph; K.pdL[i] = pl } }
    K.ema = p => K._['e' + p] ??= ema(c, p); K.sma = p => K._['s' + p] ??= sma(c, p); K.sd = p => K._['d' + p] ??= sdv(c, p); K.rsi = p => K._['r' + p] ??= rsi(c, p); K.smaV = p => K._['v' + p] ??= sma(K.v, p);
    K.hh = p => K._['hh' + p] ??= h.map((_, i) => { if (i < p) return Infinity; let m = -Infinity; for (let j = i - p; j < i; j++) if (h[j] > m) m = h[j]; return m });
    K.ll = p => K._['ll' + p] ??= l.map((_, i) => { if (i < p) return -Infinity; let m = Infinity; for (let j = i - p; j < i; j++) if (l[j] < m) m = l[j]; return m });
    return K
  }
  const AG = {
    orb: { nome: 'Rottura del range di apertura', grid: [{ h0: 0, m: 60 }, { h0: 7, m: 60 }, { h0: 13, m: 60 }, { h0: 0, m: 30 }, { h0: 7, m: 30 }, { h0: 13, m: 30 }], desc: p => `si compra/vende la rottura del range delle ${p.m} minuti dopo le ${p.h0}:00 UTC, entro 8 ore`,
      sig(K, p) { const s = new Int8Array(K.n), a = p.h0 * 60, b = a + p.m, e = a + 480; let day = -1, hi = -Infinity, lo = Infinity, done = false; for (let i = 0; i < K.n; i++) { if (K.dayId[i] !== day) { day = K.dayId[i]; hi = -Infinity; lo = Infinity; done = false } const m = K.mn[i]; if (m >= a && m < b) { hi = Math.max(hi, K.h[i]); lo = Math.min(lo, K.l[i]) } else if (m >= b && m < e && !done && hi > -Infinity) { if (K.c[i] > hi) { s[i] = 1; done = true } else if (K.c[i] < lo) { s[i] = -1; done = true } } } return s } },
    vwapT: { nome: 'VWAP, seguire il trend', grid: [{ e: 20 }, { e: 50 }, { e: 100 }], desc: p => `il prezzo supera il VWAP di giornata e la media a ${p.e}: si segue la direzione`,
      sig(K, p) { const s = new Int8Array(K.n), E = K.ema(p.e); for (let i = 1; i < K.n; i++) { if (K.mn[i] < 120) continue; if (K.c[i] > K.vwap[i] && K.c[i - 1] <= K.vwap[i - 1] && K.c[i] > E[i]) s[i] = 1; else if (K.c[i] < K.vwap[i] && K.c[i - 1] >= K.vwap[i - 1] && K.c[i] < E[i]) s[i] = -1 } return s } },
    vwapR: { nome: 'VWAP, ritorno alla media', grid: [{ k: 2 }, { k: 2.5 }, { k: 3 }, { k: 3.5 }], desc: p => `il prezzo si allontana dal VWAP di ${p.k} ATR: si scommette sul ritorno`,
      sig(K, p) { const s = new Int8Array(K.n); for (let i = 1; i < K.n; i++) { if (K.mn[i] < 120 || !(K.atr[i] > 0)) continue; const d = (K.c[i] - K.vwap[i]) / K.atr[i], q = (K.c[i - 1] - K.vwap[i - 1]) / K.atr[i - 1]; if (d < -p.k && q >= -p.k) s[i] = 1; else if (d > p.k && q <= p.k) s[i] = -1 } return s } },
    rsi2: { nome: 'RSI(2) in controtendenza', grid: [{ r: 5 }, { r: 10 }, { r: 15 }], desc: p => `RSI a 2 periodi sotto ${p.r} (o sopra ${100 - p.r}) nella direzione della media a 200`,
      sig(K, p) { const s = new Int8Array(K.n), R = K.rsi(2), E = K.ema(200); for (let i = 1; i < K.n; i++) { if (R[i] < p.r && K.c[i] > E[i]) s[i] = 1; else if (R[i] > 100 - p.r && K.c[i] < E[i]) s[i] = -1 } return s } },
    bbk: { nome: 'Rottura delle bande di Bollinger', grid: [{ k: 2 }, { k: 2.5 }, { k: 3 }], desc: p => `chiusura fuori dalla banda di Bollinger 20/${p.k}`,
      sig(K, p) { const s = new Int8Array(K.n), M = K.sma(20), D = K.sd(20); for (let i = 21; i < K.n; i++) { const u = M[i] + p.k * D[i], dn = M[i] - p.k * D[i], pu = M[i - 1] + p.k * D[i - 1], pd = M[i - 1] - p.k * D[i - 1]; if (K.c[i] > u && K.c[i - 1] <= pu) s[i] = 1; else if (K.c[i] < dn && K.c[i - 1] >= pd) s[i] = -1 } return s } },
    pull: { nome: 'Ritracciamento sulla media', grid: [{ a: 20, b: 50 }, { a: 10, b: 30 }, { a: 30, b: 100 }], desc: p => `trend dato da medie ${p.a}/${p.b}; si entra quando il prezzo tocca la media ${p.a} e riparte`,
      sig(K, p) { const s = new Int8Array(K.n), A = K.ema(p.a), B = K.ema(p.b), R = K.rsi(14); for (let i = 1; i < K.n; i++) { if (A[i] > B[i] && K.l[i] <= A[i] && K.c[i] > A[i] && R[i] < 60) s[i] = 1; else if (A[i] < B[i] && K.h[i] >= A[i] && K.c[i] < A[i] && R[i] > 40) s[i] = -1 } return s } },
    don: { nome: 'Rottura del canale (Donchian)', grid: [{ p: 20 }, { p: 40 }, { p: 80 }], desc: p => `chiusura oltre massimo/minimo delle ultime ${p.p} barre`,
      sig(K, p) { const s = new Int8Array(K.n), H = K.hh(p.p), L = K.ll(p.p); for (let i = p.p; i < K.n; i++) { if (K.c[i] > H[i]) s[i] = 1; else if (K.c[i] < L[i]) s[i] = -1 } return s } },
    burst: { nome: 'Esplosione di volume', grid: [{ k: 3 }, { k: 4 }, { k: 5 }], desc: p => `volume oltre ${p.k} volte la media e candela lunga: si segue la direzione`,
      sig(K, p) { const s = new Int8Array(K.n), V = K.smaV(20); for (let i = 21; i < K.n; i++) { if (K.v[i] > p.k * V[i - 1] && Math.abs(K.c[i] - K.o[i]) > K.atr[i]) s[i] = K.c[i] > K.o[i] ? 1 : -1 } return s } },
    sweep: { nome: 'Caccia agli stop del giorno prima', grid: [{ w: 0.3 }, { w: 0.6 }, { w: 1 }], desc: p => `il prezzo buca massimo/minimo di ieri e rientra con ombra di almeno ${p.w} ATR: si scommette sul rientro`,
      sig(K, p) { const s = new Int8Array(K.n); for (let i = 1; i < K.n; i++) { if (K.mn[i] < 60 || !(K.pdH[i] > 0)) continue; if (K.h[i] > K.pdH[i] && K.c[i] < K.pdH[i] && K.h[i] - K.c[i] >= p.w * K.atr[i]) s[i] = -1; else if (K.l[i] < K.pdL[i] && K.c[i] > K.pdL[i] && K.c[i] - K.l[i] >= p.w * K.atr[i]) s[i] = 1 } return s } } };
  const EXITS = []; for (const sd of [1, 1.5, 2]) for (const tp of [0, 1.5, 2, 3]) for (const be of [0, 1]) for (const hrs of [0, 1]) EXITS.push({ sd, tp, be, hrs });
  // Simula le operazioni: ingresso all'apertura della barra dopo il segnale, stop, take profit, pareggio dopo +1R, chiusura a fine giornata.
  // Se stop e take profit cadono nella stessa barra vale lo stop (ipotesi prudente).
  function simulate(K, sig, x, o) {
    o = o || {}; const c0 = o.cost ?? 0.0014, delay = o.delay || 0, T = [], n = K.n; let busy = -1, open = null;
    for (let i = 0; i < n - 1 - delay; i++) {
      const d = sig[i]; if (!d || i <= busy) continue; if (x.hrs && !(K.hr[i] >= 7 && K.hr[i] < 21)) continue;
      const a = K.atr[i]; if (!(a > 0)) continue; const j0 = i + 1 + delay; if (j0 >= n || K.dayId[j0] !== K.dayId[i]) continue;
      const E = K.o[j0], SD = x.sd * a; let stop = E - d * SD; const tp = x.tp ? E + d * x.tp * SD : null; let px = null, jx = -1, best = E;
      for (let j = j0; j < n; j++) {
        if (d > 0 ? K.l[j] <= stop : K.h[j] >= stop) { px = d > 0 ? Math.min(stop, K.o[j]) : Math.max(stop, K.o[j]); jx = j; break }
        if (tp != null && (d > 0 ? K.h[j] >= tp : K.l[j] <= tp)) { px = tp; jx = j; break }
        best = d > 0 ? Math.max(best, K.h[j]) : Math.min(best, K.l[j]); if (x.be && d * (best - E) >= SD) stop = d > 0 ? Math.max(stop, E) : Math.min(stop, E);
        if (K.eod[j]) { px = K.c[j]; jx = j; break }
      }
      if (px == null) { open = { dir: d, E, SD, stop, tp, t0: K.t[j0], i0: j0, R: d * (K.c[n - 1] - E) / SD, atr: a }; busy = n; break }
      busy = jx; T.push([K.t[j0], K.t[jx] + K.ms, d * (px - E) / SD, c0 * E / SD, o.ix ?? 0])
    }
    return { T, open }
  }
  const api = { prep, AG, EXITS, simulate, ema, sma, rsi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DayAgents = api;
})(typeof self !== 'undefined' ? self : this);
