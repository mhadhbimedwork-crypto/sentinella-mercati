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
