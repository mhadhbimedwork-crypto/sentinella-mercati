//+------------------------------------------------------------------+
//| SentinellaTrader.mq5  v1.4                                       |
//| Esegue in MT5 i segnali di Sentinella Mercati.                   |
//| - legge dal server le operazioni aperte ogni 30 secondi          |
//| - entra a mercato SOLO se il server dice che l'ingresso e'       |
//|   ancora valido (prezzo vicino all'entrata, in tempo)            |
//| - lotto dal rischio %, stop loss, take profit 2                  |
//| - stop mobile fino al take profit 2 (R = distanza entrata-stop)  |
//+------------------------------------------------------------------+
#property strict
#property version "1.40"
#include <Trade\Trade.mqh>

input string ApiUrl          = "https://jkvvfzpvwbjxtdzsesct.supabase.co/functions/v1/ea";
input double RiskPercent     = 1.0;    // rischio per operazione, % del saldo
input int    MaxOpen         = 6;      // massimo posizioni aperte insieme
input double MaxPriceGapPct  = 2.5;    // scarto massimo tra prezzo del segnale e del broker (%)
input double DayStopPercent  = 3.0;    // niente nuove operazioni se oggi sei a -X% dal saldo di inizio giornata
input string SymbolSuffix    = "";     // suffisso dei simboli del broker, se serve
input ulong  MagicNumber     = 770011;
// Stop mobile (multipli di R)
input bool   UseTrailing     = true;
input double BreakEvenAtR    = 1.0;    // a +1.0R lo stop va in pareggio
input double BreakEvenLockR  = 0.1;    // ... piu' 0.1R di profitto garantito
input double TrailStartR     = 1.5;    // da +1.5R lo stop insegue il prezzo
input double TrailDistR      = 0.75;   // a distanza 0.75R dal prezzo

CTrade trade;
int tickCount = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(50);
   EventSetTimer(5);
   Print("SentinellaTrader avviato. Conto ", AccountInfoInteger(ACCOUNT_LOGIN),
         " saldo ", DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2));
   return INIT_SUCCEEDED;
  }
//+------------------------------------------------------------------+
void OnDeinit(const int reason) { EventKillTimer(); }
//+------------------------------------------------------------------+
int CountOpen()
  {
   int n = 0;
   for(int i = 0; i < PositionsTotal(); i++)
     {
      ulong t = PositionGetTicket(i);
      if(t > 0 && PositionGetInteger(POSITION_MAGIC) == (long)MagicNumber) n++;
     }
   return n;
  }
//+------------------------------------------------------------------+
double TodayClosedResult()
  {
   MqlDateTime d; TimeToStruct(TimeCurrent(), d);
   d.hour = 0; d.min = 0; d.sec = 0;
   datetime from = StructToTime(d);
   if(!HistorySelect(from, TimeCurrent() + 60)) return 0;
   double sum = 0;
   for(int i = 0; i < HistoryDealsTotal(); i++)
     {
      ulong t = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(t, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      sum += HistoryDealGetDouble(t, DEAL_PROFIT) + HistoryDealGetDouble(t, DEAL_COMMISSION) + HistoryDealGetDouble(t, DEAL_SWAP);
     }
   return sum;
  }
//+------------------------------------------------------------------+
bool DayGuardHit()
  {
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double dayStart = bal - TodayClosedResult();
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   return (eq <= dayStart * (1.0 - DayStopPercent / 100.0));
  }
//+------------------------------------------------------------------+
// adv = giudizio del server sull'ingresso: MARKET, LIMIT, STOP, LATE, WEAK, FLAT, STALE, DONE, INVALID
void Handle(const long id, const string sym, const int dir, const double entry,
            const double sl, const double tp1, const double tp2, const long createdMs,
            const string adv, const double mR, const double rm, const string xm)
  {
   string gv = "SM_done_" + (string)id;
   if(GlobalVariableCheck(gv)) return;

   if(adv != "MARKET")
     {
      if(adv == "LIMIT" || adv == "STOP") return;               // potrebbe tornare valido: riprova al prossimo giro
      GlobalVariableSet(gv, 1);
      Print("Segnale ", id, " non piu' entrabile (", adv, ", prezzo a ", DoubleToString(mR, 2), "R dal segnale): non aperto");
      return;
     }

   string s = sym + SymbolSuffix;
   if(!SymbolSelect(s, true)) { GlobalVariableSet(gv, 1); Print("Simbolo non trovato in MT5: ", s, ". Controlla Market Watch o SymbolSuffix"); return; }
   if(CountOpen() >= MaxOpen) return;
   if(DayGuardHit()) { Print("Freno giornaliero attivo: nessuna nuova operazione"); return; }

   double ask = SymbolInfoDouble(s, SYMBOL_ASK), bid = SymbolInfoDouble(s, SYMBOL_BID);
   double px = dir > 0 ? ask : bid;
   if(px <= 0) return;
   if(MathAbs(px - entry) / entry * 100.0 > MaxPriceGapPct)
     { GlobalVariableSet(gv, 1); Print("Prezzo broker ", px, " troppo diverso dal segnale ", entry, ": ignorato"); return; }

   bool hasTp = (xm == "B");   // uscite C e D: nessun take profit, solo stop mobile
   double slD = MathAbs(entry - sl), tpD = MathAbs((tp2 > 0 ? tp2 : tp1) - entry);
   int digits = (int)SymbolInfoInteger(s, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(s, SYMBOL_POINT);
   double minStop = SymbolInfoInteger(s, SYMBOL_TRADE_STOPS_LEVEL) * point;
   if(slD < minStop || (hasTp && tpD < minStop)) { GlobalVariableSet(gv, 1); Print("Stop o target sotto la distanza minima del broker: ignorato"); return; }

   double slP = NormalizeDouble(px - dir * slD, digits);
   double tpP = hasTp ? NormalizeDouble(px + dir * tpD, digits) : 0.0;

   double riskMoney = AccountInfoDouble(ACCOUNT_BALANCE) * RiskPercent / 100.0 * rm;   // rm = 0.5 dopo due perdite di fila
   double pl = 0;
   ENUM_ORDER_TYPE ot = dir > 0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(!OrderCalcProfit(ot, s, 1.0, px, slP, pl) || pl >= 0) { Print("Calcolo del lotto non riuscito per ", s); return; }
   double lots = riskMoney / MathAbs(pl);
   double step = SymbolInfoDouble(s, SYMBOL_VOLUME_STEP), vmin = SymbolInfoDouble(s, SYMBOL_VOLUME_MIN), vmax = SymbolInfoDouble(s, SYMBOL_VOLUME_MAX);
   lots = MathFloor(lots / step) * step;
   if(lots < vmin) { GlobalVariableSet(gv, 1); Print("Lotto calcolato ", lots, " sotto il minimo ", vmin, " per ", s, ": rischio troppo alto per questo simbolo"); return; }
   lots = MathMin(lots, vmax);

   double margin = 0;
   if(OrderCalcMargin(ot, s, lots, px, margin) && margin > AccountInfoDouble(ACCOUNT_MARGIN_FREE) * 0.9)
     { GlobalVariableSet(gv, 1); Print("Margine insufficiente per ", s, " (servono ", margin, ")"); return; }

   trade.SetTypeFillingBySymbol(s);
   string cmt = "SM" + (string)id;
   bool ok = dir > 0 ? trade.Buy(lots, s, 0, slP, tpP, cmt) : trade.Sell(lots, s, 0, slP, tpP, cmt);
   GlobalVariableSet(gv, 1);
   if(ok)
     {
      GlobalVariableSet("SM_R_" + (string)id, slD);
      GlobalVariableSet("SM_X_" + (string)id, xm == "C" ? 2 : xm == "D" ? 3 : 1);
      Print("Aperta ", (dir > 0 ? "BUY " : "SELL "), s, " lotti ", lots, " SL ", slP, " TP ", tpP, " uscita ", xm, " (segnale ", id, ")");
     }
   else Print("Errore apertura ", s, ": ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
  }
//+------------------------------------------------------------------+
void ManagePositions()
  {
   if(!UseTrailing) return;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || PositionGetInteger(POSITION_MAGIC) != (long)MagicNumber) continue;
      string cmt = PositionGetString(POSITION_COMMENT);
      if(StringSubstr(cmt, 0, 2) != "SM") continue;
      string gk = "SM_R_" + StringSubstr(cmt, 2);
      if(!GlobalVariableCheck(gk)) continue;
      double R = GlobalVariableGet(gk);
      if(R <= 0) continue;

      string s = PositionGetString(POSITION_SYMBOL);
      bool buy = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY);
      double open = PositionGetDouble(POSITION_PRICE_OPEN), sl = PositionGetDouble(POSITION_SL), tp = PositionGetDouble(POSITION_TP);
      double px = buy ? SymbolInfoDouble(s, SYMBOL_BID) : SymbolInfoDouble(s, SYMBOL_ASK);
      if(px <= 0) continue;
      double pd = buy ? px - open : open - px;
      int digits = (int)SymbolInfoInteger(s, SYMBOL_DIGITS);
      double point = SymbolInfoDouble(s, SYMBOL_POINT);
      double minStop = MathMax(SymbolInfoInteger(s, SYMBOL_TRADE_STOPS_LEVEL), SymbolInfoInteger(s, SYMBOL_TRADE_FREEZE_LEVEL)) * point;

      bool has = false; double cand = 0;
      string xk = "SM_X_" + StringSubstr(cmt, 2);
      int xmode = GlobalVariableCheck(xk) ? (int)GlobalVariableGet(xk) : 1;
      if(xmode == 1)
        {
         if(pd >= BreakEvenAtR * R) { cand = buy ? open + BreakEvenLockR * R : open - BreakEvenLockR * R; has = true; }
         if(pd >= TrailStartR * R)
           {
            double t = buy ? px - TrailDistR * R : px + TrailDistR * R;
            cand = has ? (buy ? MathMax(cand, t) : MathMin(cand, t)) : t; has = true;
           }
        }
      else
        {
         // lascia correre: lo stop segue il prezzo a 1,5R (C) o 2,5R (D), senza obiettivo
         double dist = (xmode == 2 ? 1.5 : 2.5) * R;
         cand = buy ? px - dist : px + dist; has = true;
        }
      if(!has) continue;

      if(buy  && px - cand < minStop) cand = px - minStop;
      if(!buy && cand - px < minStop) cand = px + minStop;
      cand = NormalizeDouble(cand, digits);

      bool better = buy ? (cand > sl + 0.05 * R) : (sl == 0 || cand < sl - 0.05 * R);
      if(!better) continue;
      if(trade.PositionModify(ticket, cand, tp))
         Print("Stop mobile ", s, " ticket ", ticket, ": SL ", sl, " -> ", cand, " (profitto ", DoubleToString(pd / R, 2), "R)");
      else
         Print("Modifica stop fallita ", s, ": ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
     }
  }
//+------------------------------------------------------------------+
void Poll()
  {
   char post[], res[]; string hdr;
   ResetLastError();
   int code = WebRequest("GET", ApiUrl, "", 8000, post, res, hdr);
   if(code != 200)
     {
      Print("Server non raggiungibile (codice ", code, ", errore ", GetLastError(),
            "). In MT5: Strumenti > Opzioni > Expert Advisors > consenti WebRequest per l'indirizzo del server.");
      return;
     }
   string body = CharArrayToString(res);
   string lines[];
   int n = StringSplit(body, '\n', lines);
   for(int i = 0; i < n; i++)
     {
      string f[];
      int nf = StringSplit(lines[i], ';', f);
      if(nf < 11 || f[0] != "S") continue;
      double rm = nf >= 12 ? StringToDouble(f[11]) : 1.0;
      if(rm <= 0 || rm > 1) rm = 1.0;
      Handle(StringToInteger(f[1]), f[2], (int)StringToInteger(f[3]), StringToDouble(f[4]),
             StringToDouble(f[5]), StringToDouble(f[6]), StringToDouble(f[8]), StringToInteger(f[7]),
             f[9], StringToDouble(f[10]), rm, nf >= 13 ? f[12] : "B");
     }
  }
//+------------------------------------------------------------------+
void OnTimer()
  {
   ManagePositions();
   if(++tickCount % 6 == 0) Poll();
  }
//+------------------------------------------------------------------+
