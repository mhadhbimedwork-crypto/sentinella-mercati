// "Zero o luna": elenco settimanale di mercati ad altissimo rischio con potenziale asimmetrico.
// Non sono consigli d'acquisto: e' una lista di osservazione ordinata con regole fisse sui dati reali.
import fs from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms)), rd = (x, k = 4) => x == null || !isFinite(x) ? null : +x.toFixed(k);
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' };
const OUT = { at: new Date().toISOString(), log: [] };
// ---- cripto: dati CoinGecko, prime 500 per capitalizzazione ----
try {
  let all = [];
  for (const page of [1, 2]) {
    let j = null;
    for (let k = 0; k < 5 && !j; k++) { try { const r = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&order=market_cap_desc&per_page=250&page=' + page + '&price_change_percentage=30d,200d,1y', { headers: UA }); if (!r.ok) throw new Error('http ' + r.status); j = await r.json() } catch (e) { OUT.log.push('coingecko ' + e.message); await sleep(8000 * (k + 1)) } }
    if (j) all = all.concat(j); await sleep(3000)
  }
  const bad = /usd|eur|dai|wrapped|staked|bridged|tether|wbtc|weth|steth|restaked|token$/i;
  const C = all.filter(c => c.market_cap > 0 && !bad.test(c.name) && !bad.test(c.id) && !/^(usd|w|st)/i.test(c.symbol) || ['sol', 'sui', 'stx', 'strk', 'wld', 'wif'].includes(c.symbol));
  const below = x => C.filter(c => c.ath_change_percentage <= -x).length / C.length;
  OUT.cripto = {
    n: C.length, sotto80: rd(below(80), 3), sotto50: rd(below(50), 3), sopra100_1anno: rd(C.filter(c => c.price_change_percentage_1y_in_currency >= 100).length / C.length, 3), negativi_1anno: rd(C.filter(c => c.price_change_percentage_1y_in_currency < 0).length / C.length, 3),
    lista: C.filter(c => c.market_cap_rank >= 30 && c.market_cap_rank <= 400 && c.market_cap >= 1e8 && c.price_change_percentage_1y_in_currency != null && c.total_volume / c.market_cap >= 0.02).map(c => {
      const p30 = c.price_change_percentage_30d_in_currency, p200 = c.price_change_percentage_200d_in_currency, p1y = c.price_change_percentage_1y_in_currency, vm = c.total_volume / c.market_cap, ath = c.ath_change_percentage;
      const s = (p200 > 0 ? 2 : 0) + (p30 > 0 ? 1 : 0) + (vm >= 0.05 ? 1 : 0) + (ath <= -30 && ath >= -85 ? 1 : 0) + (p1y > 0 ? 1 : 0);
      return { id: c.id, sym: c.symbol.toUpperCase(), n: c.name, rank: c.market_cap_rank, px: c.current_price, mcap: c.market_cap, vm: rd(vm, 3), p30: rd(p30 / 100), p200: rd(p200 / 100), p1y: rd(p1y / 100), ath: rd(ath / 100), xAth: rd(c.ath / c.current_price, 1), s }
    }).sort((a, b) => b.s - a.s || (b.p200 ?? -9) - (a.p200 ?? -9)).slice(0, 15)
  }
} catch (e) { OUT.log.push('cripto: ' + e.message) }
// ---- azioni di frontiera: lista di osservazione per tema, dati Yahoo ----
const W = [['IONQ', 'IonQ', 'Calcolo quantistico'], ['RGTI', 'Rigetti', 'Calcolo quantistico'], ['QBTS', 'D-Wave', 'Calcolo quantistico'], ['RKLB', 'Rocket Lab', 'Spazio'], ['ASTS', 'AST SpaceMobile', 'Spazio'], ['LUNR', 'Intuitive Machines', 'Spazio'],
['OKLO', 'Oklo', 'Nucleare di nuova generazione'], ['SMR', 'NuScale', 'Nucleare di nuova generazione'], ['JOBY', 'Joby Aviation', 'Taxi volanti'], ['ACHR', 'Archer Aviation', 'Taxi volanti'], ['CRSP', 'CRISPR Therapeutics', 'Editing genetico'], ['BEAM', 'Beam Therapeutics', 'Editing genetico'],
['SOUN', 'SoundHound AI', 'Intelligenza artificiale'], ['BBAI', 'BigBear.ai', 'Intelligenza artificiale'], ['SERV', 'Serve Robotics', 'Robot'], ['RR', 'Richtech Robotics', 'Robot'], ['TEM', 'Tempus AI', 'Medicina con IA'], ['RXRX', 'Recursion', 'Medicina con IA']];
OUT.azioni = [];
for (const [t, n, tema] of W) {
  try {
    let R = null; for (let k = 0; k < 4 && !R; k++) { try { const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + t + '?interval=1d&range=5y', { headers: UA }); if (!r.ok) throw new Error('http ' + r.status); R = (await r.json()).chart.result[0] } catch (e) { await sleep(1500 * (k + 1)) } }
    if (!R) throw new Error('nessun dato');
    const c = (R.indicators.adjclose?.[0]?.adjclose || R.indicators.quote[0].close).filter(x => x > 0), N = c.length, px = c[N - 1], ret = d => N > d ? px / c[N - 1 - d] - 1 : null;
    const y = c.slice(-252), hi = Math.max(...y), lo = Math.min(...y), s200 = N >= 200 ? c.slice(-200).reduce((a, b) => a + b, 0) / 200 : null, peak = Math.max(...c);
    let pk = c[0], dd = 0; for (const x of c) { pk = Math.max(pk, x); dd = Math.min(dd, x / pk - 1) }
    const lr = y.slice(1).map((x, i) => Math.log(x / y[i])), mu = lr.reduce((a, b) => a + b, 0) / lr.length, vol = Math.sqrt(lr.reduce((a, b) => a + (b - mu) ** 2, 0) / lr.length * 252);
    const r3 = ret(63), r6 = ret(126), r12 = ret(252), s = (s200 && px > s200 ? 1 : 0) + (r3 > 0 ? 1 : 0) + (r6 > 0 ? 1 : 0) + (r12 > 0 ? 1 : 0);
    OUT.azioni.push({ t, n, tema, px: rd(px, 2), r3: rd(r3), r6: rd(r6), r12: rd(r12), hi52: rd(hi, 2), lo52: rd(lo, 2), s200: rd(s200, 2), daPicco: rd(px / peak - 1), maxdd: rd(dd), vol: rd(vol, 2), s }); await sleep(400)
  } catch (e) { OUT.log.push(t + ': ' + e.message) }
}
OUT.azioni.sort((a, b) => b.s - a.s || (b.r6 ?? -9) - (a.r6 ?? -9));
fs.mkdirSync('risultati', { recursive: true }); fs.writeFileSync('risultati/luna.json', JSON.stringify(OUT)); console.log('luna', OUT.cripto?.lista?.length, OUT.azioni.length, OUT.log);
