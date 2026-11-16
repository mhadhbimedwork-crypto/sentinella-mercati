// Quadro macro per l'app: dollaro, paura, tassi, azionario, oro e bitcoin, con correlazioni a 90 giorni.
import fs from 'node:fs';
import { histY, histB, sleep } from './lib.mjs';
const ema = (a, p) => { const k = 2 / (p + 1), o = []; let e = a[0]; a.forEach((v, i) => { e = i ? v * k + e * (1 - k) : v; o.push(e) }); return o };
const SRC = [['dxy', 'Dollaro (DXY)', 'DX-Y.NYB', 'y'], ['vix', 'Paura (VIX)', '^VIX', 'y'], ['tnx', 'Tassi USA 10 anni', '^TNX', 'y'], ['spx', 'S&P 500', '^GSPC', 'y'], ['ndx', 'Nasdaq 100', '^NDX', 'y'], ['oro', 'Oro', 'GC=F', 'y'], ['btc', 'Bitcoin', 'BTCUSDT', 'b']];
const D = {}, out = { at: new Date().toISOString(), voci: [], log: [] };
for (const [id, nome, sym, src] of SRC) { try { const r = src == 'b' ? await histB(sym, '1d', 1200) : await histY(sym); D[id] = { nome, t: r.map(x => x[0]), c: r.map(x => x[4]) }; if (src == 'y') await sleep(300) } catch (e) { out.log.push(id + ': ' + e.message) } }
const ch = (c, n) => c.length > n ? c[c.length - 1] / c[c.length - 1 - n] - 1 : null;
for (const [id, d] of Object.entries(D)) { const c = d.c, e50 = ema(c, 50), e200 = ema(c, 200), n = c.length - 1; out.voci.push({ id, nome: d.nome, ultimo: c[n], v1m: ch(c, 21), v3m: ch(c, 63), sopra50: c[n] > e50[n], sopra200: c[n] > e200[n] }) }
const ret = (id) => { const d = D[id], m = new Map(); for (let i = 1; i < d.c.length; i++)m.set(Math.floor(d.t[i] / 864e5), d.c[i] / d.c[i - 1] - 1); return m };
const corr = (a, b, n = 90) => { if (!D[a] || !D[b]) return null; const A = ret(a), B = ret(b), ks = [...A.keys()].filter(k => B.has(k)).sort((x, y) => x - y).slice(-n), x = ks.map(k => A.get(k)), y = ks.map(k => B.get(k)), mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length; let sxy = 0, sx = 0, sy = 0; x.forEach((v, i) => { sxy += (v - mx) * (y[i] - my); sx += (v - mx) ** 2; sy += (y[i] - my) ** 2 }); return +(sxy / Math.sqrt(sx * sy)).toFixed(2) };
out.corr90 = { 'Bitcoin / Nasdaq 100': corr('btc', 'ndx'), 'Bitcoin / S&P 500': corr('btc', 'spx'), 'Bitcoin / Oro': corr('btc', 'oro'), 'Bitcoin / Dollaro': corr('btc', 'dxy') };
const g = id => out.voci.find(v => v.id == id), f = [];
if (g('dxy')) f.push(['Dollaro sotto la media a 50 giorni (aiuta il rischio)', !g('dxy').sopra50]);
if (g('vix')) f.push(['Paura (VIX) sotto 20', g('vix').ultimo < 20]);
if (g('tnx')) f.push(['Tassi a 10 anni sotto la media a 50 giorni', !g('tnx').sopra50]);
if (g('spx')) f.push(['S&P 500 sopra la media a 200', g('spx').sopra200]);
if (g('btc')) f.push(['Bitcoin sopra la media a 200', g('btc').sopra200]);
out.fattori = f.map(([t, ok]) => ({ t, ok })); out.punti = f.filter(x => x[1]).length; out.su = f.length;
fs.mkdirSync('risultati', { recursive: true }); fs.writeFileSync('risultati/macro.json', JSON.stringify(out)); console.log(out.punti + '/' + out.su, JSON.stringify(out.corr90), out.log);
