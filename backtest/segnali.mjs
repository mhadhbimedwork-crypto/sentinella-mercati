// Segnali dal vivo della strategia cripto 4 ore (Bollinger 20/2,5 + regime di mercato + forza relativa + uscita a tempo).
// Gira ogni 4 ore su GitHub Actions. Non invia ordini: scrive risultati/segnali.json, letto dall'app.
import fs from 'node:fs';
import { U, histB, prep, ENT, W0, CAP } from './lib.mjs';
const P = { k: 2.5, sd: 3, td: 6, ts: 10, risk: 0.01 }, MS = 144e5, out = { at: new Date().toISOString(), strategia: P, cap: CAP, mercati: [], log: [] };
const coins = U.filter(u => u.cls == 'cripto'); const S = [];
for (const u of coins) { try { const raw = await histB(u.sym, '4h', 1500); S.push({ u, K: prep(raw, MS) }) } catch (e) { out.log.push(u.sym + ': ' + e.message) } }
if (S.length < 6) { out.errore = 'dati insufficienti'; fs.writeFileSync('risultati/segnali.json', JSON.stringify(out)); process.exit(0) }
const last = S.map(s => s.K.n - 1); let up = 0, rets = [];
S.forEach((s, q) => { const K = s.K, i = last[q]; if (K.c[i] > K.ema(200)[i]) up++; s.rs = K.c[i] / K.c[i - 90] - 1; rets.push(s.rs) });
rets.sort((a, b) => a - b); const med = rets[Math.floor(rets.length / 2)], breadth = up / S.length;
out.regime = { sopraEma200: up, su: S.length, quota: +breadth.toFixed(2), attivo: breadth >= 0.5, medianaForza90: +med.toFixed(4) };
for (const s of S) {
  const K = s.K, n = K.n, sig = ENT.bb(K, { k: P.k }); let busy = -1, pos = null;
  for (let i = W0; i < n - 1; i++) {
    if (sig[i] !== 1 || i <= busy) continue; const a = K.atr[i]; if (!(a > 0)) continue;
    const j0 = i + 1, E = K.o[j0], SD = P.sd * a, TD = P.td * a; let stop = E - SD, best = E, closed = false;
    for (let j = j0; j < n; j++) { if (K.l[j] <= stop) { closed = true; busy = j; break } best = Math.max(best, K.h[j]); stop = Math.max(stop, best - TD); if (j - j0 >= P.ts && K.c[j] - E < 0.5 * SD) { closed = true; busy = j; break } }
    if (!closed) { busy = n; pos = { entrata: E, dal: new Date(K.t[j0]).toISOString(), stop: +stop.toPrecision(6), R: +((K.c[n - 1] - E) / SD).toFixed(2), barre: n - j0 } }
  }
  const sm = K.sma(20), sdv = K.sd(20), e2 = K.ema(200), N = 120, from = n - N, serie = { t: K.t.slice(from), c: K.c.slice(from), up: Array.from({ length: N }, (_, q) => +(sm[from + q] + P.k * sdv[from + q]).toPrecision(6)), e: e2.slice(from).map(x => +x.toPrecision(6)) };
  const i = n - 1, a = K.atr[i], px = K.c[i], nuovo = sig[i] === 1 && !pos, okRegime = breadth >= 0.5, okRS = s.rs >= med;
  const stopNuovo = px - P.sd * a, perUnita = px - stopNuovo, qty = CAP * P.risk / perUnita;
  out.mercati.push({ sym: s.u.sym.replace('USDT', ''), px, livelloAcquisto: serie.up[N - 1], sopraEma200: px > e2[i], serie, forza90: +s.rs.toFixed(3), segnaleNuovo: nuovo, puoiEntrare: nuovo && okRegime && okRS, motivoNo: nuovo ? (!okRegime ? 'mercato debole (meno della metà sopra la media a 200)' : !okRS ? 'forza relativa sotto la mediana' : null) : null, stopIniziale: +stopNuovo.toPrecision(6), quantita: +qty.toPrecision(3), valore: Math.round(qty * px), posizioneAperta: pos })
}
fs.mkdirSync('risultati', { recursive: true }); fs.writeFileSync('risultati/segnali.json', JSON.stringify(out)); console.log(JSON.stringify(out.regime), out.mercati.map(m => m.sym + (m.puoiEntrare ? '*' : m.posizioneAperta ? '+' : '')).join(' '));
