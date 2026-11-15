# Scarica dai file pubblici di Binance (data.binance.vision) i dati dei futures che servono agli agenti:
# open interest e rapporti long/short ogni 5 minuti (file giornalieri "metrics") e storico del funding (file mensili).
# Scrive in tmp/ un file per mercato, con una riga per ora. Niente chiavi: sono dati pubblici.
import io, json, os, sys, zipfile, csv, urllib.request, datetime as dt
from concurrent.futures import ThreadPoolExecutor
BASE = 'https://data.binance.vision/data/futures/um'
SYMS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']
os.makedirs('tmp', exist_ok=True)
def get(url):
    for k in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30) as r:
                z = zipfile.ZipFile(io.BytesIO(r.read()))
                return z.read(z.namelist()[0]).decode()
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
        except Exception:
            pass
    return None
def ts(s):
    s = s.strip()
    if s.isdigit(): return int(s) if len(s) > 11 else int(s) * 1000
    return int(dt.datetime.strptime(s[:19], '%Y-%m-%d %H:%M:%S').replace(tzinfo=dt.timezone.utc).timestamp() * 1000)
def metrics_day(a):
    sym, d = a
    t = get(f'{BASE}/daily/metrics/{sym}/{sym}-metrics-{d}.zip')
    if not t: return []
    out = {}
    for r in csv.reader(io.StringIO(t)):
        if not r or not r[0][:1].isdigit(): continue
        try:
            t0 = ts(r[0]); h = t0 // 3600000 * 3600000
            f = lambda x: float(x) if x not in ('', 'null', 'None') else None
            out[h] = [h, f(r[2]), f(r[3]), f(r[5]), f(r[6]), f(r[7])]   # ora, OI (contratti), OI (valore), LS top trader, LS conti, taker buy/sell
        except Exception:
            continue
    return list(out.values())
log = {}
today = dt.date.today()
for sym in SYMS:
    days = []; d = dt.date(2021, 12, 1)
    while d < today: days.append((sym, d.isoformat())); d += dt.timedelta(days=1)
    with ThreadPoolExecutor(24) as ex: res = list(ex.map(metrics_day, days))
    rows = sorted([x for r in res for x in r if x[1]], key=lambda x: x[0])
    json.dump(rows, open(f'tmp/metrics_{sym}.json', 'w'))
    fund = []; y, m = 2019, 9
    months = []
    while (y, m) <= (today.year, today.month): months.append(f'{y}-{m:02d}'); m += 1; y, m = (y + 1, 1) if m > 12 else (y, m)
    with ThreadPoolExecutor(12) as ex: fr = list(ex.map(lambda mm: get(f'{BASE}/monthly/fundingRate/{sym}/{sym}-fundingRate-{mm}.zip'), months))
    for t in fr:
        if not t: continue
        for r in csv.reader(io.StringIO(t)):
            if not r or not r[0][:1].isdigit(): continue
            try: fund.append([ts(r[0]), float(r[-1])])
            except Exception: pass
    fund.sort(); json.dump(fund, open(f'tmp/funding_{sym}.json', 'w'))
    log[sym] = {'ore_metrics': len(rows), 'dal': dt.datetime.utcfromtimestamp(rows[0][0] / 1000).isoformat()[:10] if rows else None, 'al': dt.datetime.utcfromtimestamp(rows[-1][0] / 1000).isoformat()[:10] if rows else None, 'giorni_mancanti': sum(1 for r in res if not r), 'funding': len(fund)}
    print(sym, log[sym], flush=True)
json.dump(log, open('tmp/futures_log.json', 'w'))
