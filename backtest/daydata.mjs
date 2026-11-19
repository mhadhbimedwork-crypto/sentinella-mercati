// Dati intraday condivisi: cripto da Binance (15m, 1h), forex/metalli/indici da Yahoo (1h, ultimi 2 anni).
import { histB, sleep } from './lib.mjs';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' };
export const CLASSI = [
  { id: 'cripto', nome: 'Cripto (Binance)', costo: 0.0014, tfs: ['15m', '1h'], mercati: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'LINKUSDT', 'AVAXUSDT', 'LTCUSDT', 'TRXUSDT'].map(s => ({ s, src: 'b', nome: s.replace('USDT', ''), mt5: s.replace('USDT', 'USD') })) },
  { id: 'forex', nome: 'Forex maggiori', costo: 0.00012, tfs: ['1h'], mercati: [['EURUSD=X', 'EURUSD'], ['GBPUSD=X', 'GBPUSD'], ['USDJPY=X', 'USDJPY'], ['AUDUSD=X', 'AUDUSD'], ['USDCAD=X', 'USDCAD'], ['USDCHF=X', 'USDCHF'], ['NZDUSD=X', 'NZDUSD'], ['EURJPY=X', 'EURJPY'], ['GBPJPY=X', 'GBPJPY'], ['EURGBP=X', 'EURGBP']].map(([s, n]) => ({ s, src: 'y', nome: n, mt5: n })) },
  { id: 'oroindici', nome: 'Oro, argento e indici', costo: 0.0004, tfs: ['1h'], mercati: [['GC=F', 'Oro', 'XAUUSD'], ['SI=F', 'Argento', 'XAGUSD'], ['^GSPC', 'S&P 500', 'US500'], ['^NDX', 'Nasdaq 100', 'US100'], ['^DJI', 'Dow Jones', 'US30'], ['^GDAXI', 'DAX', 'GER40'], ['^FTSE', 'FTSE 100', 'UK100'], ['^N225', 'Nikkei 225', 'JP225']].map(([s, n, m]) => ({ s, src: 'y', nome: n, mt5: m })) }];
export const MSTF = { '15m': 9e5, '1h': 36e5 };
async function histYH(sym) {
  let err;
  for (let k = 0; k < 5; k++) for (const h of ['query1', 'query2']) {
    try {
      const r = await fetch('https://' + h + '.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1h&range=730d', { headers: UA });
      if (!r.ok) throw new Error('yahoo http ' + r.status);
      const R = (await r.json()).chart.result[0], q = R.indicators.quote[0], out = [];
      R.timestamp.forEach((t, i) => { if (q.close[i] != null && q.open[i] != null && q.high[i] != null && q.low[i] != null) out.push([t * 1000, q.open[i], q.high[i], q.low[i], q.close[i], q.volume?.[i] || 0, 0]) });
      return out
    } catch (e) { err = e; await sleep(800) }
  }
  throw err
}
// ritorna barre chiuse: [t,o,h,l,c,v,tb]
export async function carica(m, tf, n) {
  const ms = MSTF[tf]; let raw = m.src == 'b' ? await histB(m.s, tf, n) : await histYH(m.s);
  raw = raw.filter(r => r[0] + ms <= Date.now()); return raw
}

// prezzo attuale (ultimo scambio) di un mercato Yahoo, piu' fresco dell'ultima barra chiusa
export async function quote(sym) {
  for (const h of ['query1', 'query2']) {
    try {
      const r = await fetch('https://' + h + '.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1d&range=1d', { headers: UA });
      if (!r.ok) continue; const m = (await r.json()).chart.result[0].meta;
      if (m.regularMarketPrice > 0) return { px: m.regularMarketPrice, t: (m.regularMarketTime || 0) * 1000 }
    } catch (e) { }
  }
  return null
}
