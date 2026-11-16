// Segnali dal vivo: applica la strategia scelta dall'ottimizzazione (risultati/backtest2.json) a ogni gruppo di mercati.
// Gira dopo ogni ottimizzazione e ogni 4 ore. Non invia ordini: scrive risultati/segnali.json, letto dall'app.
import fs from 'node:fs';
import { U, histB, histY, prep, ENT, W0, CAP, NAMES, sleep } from './lib.mjs';
const RISK = 0.01, N = 120;
const NOMI = { 'GC=F': ['Oro', 'XAUUSD', 100], 'SI=F': ['Argento', 'XAGUSD', 5000], 'PL=F': ['Platino', 'XPTUSD'], 'HG=F': ['Rame', 'COPPER'], 'PA=F': ['Palladio', 'XPDUSD'],
  '^GSPC': ['S&P 500', 'US500'], '^NDX': ['Nasdaq 100', 'US100'], '^DJI': ['Dow Jones', 'US30'], '^GDAXI': ['DAX', 'GER40'], '^FTSE': ['FTSE 100', 'UK100'], '^N225': ['Nikkei 225', 'JP225'], '^STOXX50E': ['Euro Stoxx 50', 'EU50'], '^RUT': ['Russell 2000', 'US2000'] };
const GRUPPI = [
  { id: 'cripto', cls: 'cripto', tf: '4h', ms: 144e5, nome: 'Cripto, 4 ore', def: { fam: 'bb', par: { k: 2.5 }, sd: 3, td: 6, be: 0, ts: 10, reg: 'breadth', rs: 1 } },
  { id: 'metalli', cls: 'metalli', tf: '1d', ms: 864e5, nome: 'Metalli, giornaliero', def: { fam: 'don', par: { lb: 30, f: 'n' }, sd: 1.5, td: 8, be: 2, ts: 0, reg: 'breadth', rs: 1 } },
  { id: 'indici', cls: 'indici', tf: '1d', ms: 864e5, nome: 'Indici azionari, giornaliero', def: { fam: 'don', par: { lb: 10, f: 'e100' }, sd: 1.5, td: 12, be: 0, ts: 0, reg: 'n', rs: 0 } }];
let B = null; try { B = JSON.parse(fs.readFileSync('risultati/backtest2.json', 'utf8')) } catch (e) { }
const REGN = { n: 'nessun filtro di mercato', breadth: 'compra solo se almeno metà dei mercati è sopra la media a 200 periodi', leader: 'compra solo se il mercato guida è sopra la media a 200' };
const desc = c => `${NAMES[c.fam] || c.fam} ${Object.values(c.par).join('/')}; stop iniziale ${c.sd} ATR, inseguimento ${c.td} ATR${c.be ? ', stop a pareggio dopo +' + c.be + 'R' : ''}${c.ts ? ', uscita dopo ' + c.ts + ' barre se non va' : ''}; ${REGN[c.reg]}${c.rs ? '; solo i più forti' : ''}`;
// livello di rottura per la prossima barra (quello che deve superare la chiusura)
function livello(K, c) {
  const n = K.n, i = n - 1;
  if (c.fam == 'bb') return K.sma(20)[i] + c.par.k * K.sd(20)[i];
  if (c.fam == 'kelt') return K.ema(20)[i] + c.par.k * K.atr[i];
  if (c.fam == 'don' || c.fam == 'donadx') return Math.max(...K.h.slice(n - c.par.lb, n));
  return null
}
const out = { at: new Date().toISOString(), cap: CAP, risk: RISK, gruppi: [], log: [] };
for (const G of GRUPPI) {
  const sc = B?.groups?.find(g => g.cls == G.cls && g.tf == G.tf)?.scelta, c = sc ? { fam: sc.fam, par: sc.par, sd: sc.sd, td: sc.td, be: sc.be, ts: sc.ts, reg: sc.reg, rs: sc.rs } : G.def, S = [];
  for (const u of U.filter(u => u.cls == G.cls)) {
    try { let raw = u.src == 'b' ? await histB(u.sym, G.tf, 1500) : await histY(u.sym); raw = raw.filter(r => r[0] + G.ms <= Date.now()); if (raw.length < 300) throw new Error('storia corta'); S.push({ u, K: prep(raw, G.ms) }); if (u.src == 'y') await sleep(300) }
    catch (e) { out.log.push(u.sym + ': ' + e.message) }
  }
  if (S.length < 3) { out.gruppi.push({ id: G.id, nome: G.nome, tf: G.tf, errore: 'dati insufficienti', mercati: [] }); continue }
  let up = 0; const rets = [];
  S.forEach((s, q) => { const K = s.K, i = K.n - 1; const a = K.c[i] > K.ema(200)[i]; if (a) up++; if (q == 0) s.lead = a; s.rs = K.c[i] / K.c[i - 90] - 1; rets.push(s.rs) });
  rets.sort((a, b) => a - b); const med = rets[Math.floor(rets.length / 2)], quota = up / S.length;
  const regOk = c.reg == 'n' ? true : c.reg == 'breadth' ? quota >= 0.5 : S[0].lead !== false;
  const G2 = { id: G.id, nome: G.nome, tf: G.tf, ottimizzata: !!sc, aggiornataIl: B?.at || null, strategia: { ...c, nome: NAMES[c.fam], testo: desc(c) }, regime: { sopraEma200: up, su: S.length, quota: +quota.toFixed(2), attivo: regOk, mediana: +med.toFixed(4) }, mercati: [] };
  for (const s of S) {
    const K = s.K, n = K.n, sig = ENT[c.fam](K, c.par); let busy = -1, pos = null;
    for (let i = W0; i < n - 1; i++) {
      if (sig[i] !== 1 || i <= busy) continue; const a = K.atr[i]; if (!(a > 0)) continue;
      const j0 = i + 1, E = K.o[j0], SD = c.sd * a, TD = c.td * a; let stop = E - SD, best = E, closed = false; const hist = [];
      for (let j = j0; j < n; j++) {
        if (K.l[j] <= stop) { closed = true; busy = j; break }
        best = Math.max(best, K.h[j]); stop = Math.max(stop, best - TD); if (c.be && best - E >= c.be * SD) stop = Math.max(stop, E + 0.1 * SD);
        hist.push(stop); if (c.ts && j - j0 >= c.ts && K.c[j] - E < 0.5 * SD) { closed = true; busy = j; break }
      }
      if (!closed) { busy = n; const from = n - N; pos = { entrata: E, dal: new Date(K.t[j0]).toISOString(), stop: +stop.toPrecision(6), R: +((K.c[n - 1] - E) / SD).toFixed(2), barre: n - j0, entrataIdx: j0 - from, stopSerie: Array.from({ length: N }, (_, q) => { const j = from + q; return j >= j0 && j - j0 < hist.length ? +hist[j - j0].toPrecision(6) : null }), tp2R: +(E + 2 * SD).toPrecision(6), tp3R: +(E + 3 * SD).toPrecision(6) } }
    }
    const i = n - 1, a = K.atr[i], px = K.c[i], nuovo = sig[i] === 1 && !pos, okRS = !c.rs || S.length < 4 || s.rs >= med, nm = NOMI[s.u.sym] || [s.u.sym.replace('USDT', ''), s.u.sym.replace('USDT', '') + 'USD'];
    const sm = K.sma(20), sdv = K.sd(20), e2 = K.ema(200), from = n - N, lv = livello(K, c);
    const serie = { t: K.t.slice(from), c: Array.from(K.c.slice(from)), e: Array.from(e2.slice(from), x => +x.toPrecision(6)), up: c.fam == 'bb' ? Array.from({ length: N }, (_, q) => +(sm[from + q] + c.par.k * sdv[from + q]).toPrecision(6)) : null };
    const SD = c.sd * a;
    G2.mercati.push({ sym: nm[0], mt5: nm[1], px, atr: +a.toPrecision(5), livelloAcquisto: lv ? +lv.toPrecision(6) : null, sopraEma200: px > e2[i], serie, forza90: +s.rs.toFixed(3), segnaleNuovo: nuovo, puoiEntrare: nuovo && regOk && okRS,
      motivoNo: nuovo ? (!regOk ? 'mercato debole' : !okRS ? 'forza relativa sotto la mediana' : null) : null, stopDist: +SD.toPrecision(5), trailDist: +(c.td * a).toPrecision(5), stopIniziale: +(px - SD).toPrecision(6), tp2R: +(px + 2 * SD).toPrecision(6), tp3R: +(px + 3 * SD).toPrecision(6), contratto: nm[2] || null, posizioneAperta: pos })
  }
  out.gruppi.push(G2)
}
fs.mkdirSync('risultati', { recursive: true }); fs.writeFileSync('risultati/segnali.json', JSON.stringify(out));
console.log(out.gruppi.map(g => g.id + ' ' + (g.regime ? (g.regime.attivo ? 'ON' : 'off') + ' ' + g.mercati.map(m => m.sym + (m.puoiEntrare ? '*' : m.posizioneAperta ? '+' : '')).join(' ') : g.errore)).join(' | '), out.log.length ? out.log : '')
