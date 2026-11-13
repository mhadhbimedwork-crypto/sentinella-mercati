# Sentinella Mercati

App personale per due cose: **trading** (segnali su cripto e metalli con regole provate su anni di dati, per il conto FTMO e il robot MT5) e **investimenti** (piano mensile in ETF, bilanci ufficiali delle aziende, calcolatore di interesse composto con rendimenti reali, confronto broker, obiettivo di libertà finanziaria).

- **App web:** https://mhadhbimedwork-crypto.github.io/sentinella-mercati/
- **APK Android:** https://github.com/mhadhbimedwork-crypto/sentinella-mercati/releases/latest/download/SentinellaMercati.apk
  Si installa una volta: carica la versione online, quindi ogni aggiornamento arriva da solo.

## Struttura
| Cartella | Cosa contiene |
|---|---|
| `docs/` | L'app (un solo file `index.html`), pubblicata su GitHub Pages |
| `android/` | Guscio Android (WebView) costruito in automatico da GitHub Actions |
| `supabase/functions/` | Motore sul server: laboratorio delle strategie (`lab`) e investimenti (`inv`) |
| `SentinellaTrader.mq5` | Robot per MetaTrader 5 che esegue i segnali operativi |

## Dati
Binance e Yahoo Finance (prezzi), SEC EDGAR (bilanci ufficiali), Alternative.me (sentiment), justETF e Fineco (costi e promozioni dei broker). Il server gira 24 ore su 24 su Supabase: trading ogni 5 minuti, ETF e bilanci ogni sera.

Rendimenti passati e prove sullo storico non garantiscono quelli futuri.

## Novità v1.5 (13/11/2026)
- **Robot MT5 v1.5**: invia ogni 30 s il conto all'app (saldo, equity, posizioni, chiusure, fase FTMO) e applica i limiti FTMO in tempo reale: freno a -3% giornaliero, chiude tutto a -4,5% giornaliero o -9% totale, si ferma all'obiettivo di profitto. Parametri: `FtmoPhase` (0 prova gratuita, 1 challenge, 2 verifica, 3 finanziato), `InitialBalance`.
- **App**: pannello "Il tuo conto MT5" con posizioni sulla barra stop–entrata–obiettivo, sezione "Temi in crescita" (motore a spinta, prova sui dati veri), lista notizie con blocco degli ingressi dopo notizie gravi.
- **Server** `ea` v8: notizie RSS (CoinDesk, Cointelegraph, Decrypt, MarketWatch); `?news=1`, `?acct=1`.
