// @ts-nocheck
// Sentinella Investimenti: ETF UCITS, azioni USA con bilanci ufficiali SEC, profilo PAC dell'utente.
// GET  -> dati di mercato pubblici (ETF, azioni, prove di lungo periodo, broker)
// POST {act:'refresh'} con x-key -> aggiorna ETF (se vecchi) oppure le prossime 4 aziende (cron ogni 10 minuti la sera)
// POST {act:'get'|'save', pin, data} -> profilo personale (capitale mensile, orizzonte, rischio, posizioni), protetto da PIN
import { createClient } from "jsr:@supabase/supabase-js@2";
const sb=createClient(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const UA={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'};
const SEC={'User-Agent':'SentinellaMercati research-app/1.0','Accept':'application/json'};
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,x-key','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:CORS});

// Universo ETF: emittenti a zero commissioni su Fineco segnati con z:1 (iShares fino al 31/03/2027, Amundi fino al 28/03/2027, Xtrackers fino al 01/12/2026)
const ETF=[
 {t:'SWDA.MI',isin:'IE00B4L5Y983',n:'iShares Core MSCI World',k:'azioni',a:'Mondo sviluppato',ter:.20,z:1},
 {t:'VWCE.MI',isin:'IE00BK5BQT80',n:'Vanguard FTSE All-World',k:'azioni',a:'Mondo + emergenti',ter:.19,z:0},
 {t:'CSSPX.MI',isin:'IE00B5BMR087',n:'iShares Core S&P 500',k:'azioni',a:'USA',ter:.07,z:1},
 {t:'CSNDX.MI',isin:'IE00B53SZB19',n:'iShares Nasdaq 100',k:'azioni',a:'USA tecnologia',ter:.30,z:1},
 {t:'ANX.MI',isin:'LU1681038243',n:'Amundi Nasdaq-100',k:'azioni',a:'USA tecnologia',ter:.22,z:1},
 {t:'SMEA.MI',isin:'IE00B4K48X80',n:'iShares Core MSCI Europe',k:'azioni',a:'Europa',ter:.12,z:1},
 {t:'CSEMU.MI',isin:'IE00B53QG562',n:'iShares Core MSCI EMU',k:'azioni',a:'Eurozona',ter:.12,z:1},
 {t:'EIMI.MI',isin:'IE00BKM4GZ66',n:'iShares Core MSCI EM IMI',k:'azioni',a:'Paesi emergenti',ter:.18,z:1},
 {t:'IWQU.MI',isin:'IE00BP3QZ601',n:'iShares MSCI World Quality Factor',k:'azioni',a:'Mondo, aziende di qualità',ter:.25,z:1},
 {t:'IUSN.DE',isin:'IE00BF4RFH31',n:'iShares MSCI World Small Cap',k:'azioni',a:'Mondo piccole aziende (Xetra)',ter:.35,z:1},
 {t:'AGGH.MI',isin:'IE00BDBRDM35',n:'iShares Core Global Aggregate Bond EUR Hedged',k:'obbligazioni',a:'Obbligazioni mondo, cambio coperto',ter:.10,z:1},
 {t:'XGLE.MI',isin:'LU0290355717',n:'Xtrackers Eurozone Government Bond',k:'obbligazioni',a:'Titoli di Stato eurozona',ter:.15,z:1},
 {t:'IEAC.MI',isin:'IE00B3F81R35',n:'iShares Core € Corp Bond',k:'obbligazioni',a:'Obbligazioni societarie in euro',ter:.09,z:1},
 {t:'XEON.MI',isin:'LU0290358497',n:'Xtrackers EUR Overnight Rate Swap',k:'liquidità',a:'Tasso overnight euro (parcheggio)',ter:.10,z:1},
 {t:'SGLD.MI',isin:'IE00B579F325',n:'Invesco Physical Gold ETC',k:'oro',a:'Oro fisico',ter:.12,z:0},
];
// Temi in crescita per la parte "satellite": il motore ogni mese sceglie i piu' forti (momento a 3, 6 e 12 mesi) e li compra solo con i soldi nuovi.
const THEMES=[
 {t:'XAIX.MI',isin:'IE00BGV5VN51',n:'Xtrackers Artificial Intelligence & Big Data',k:'tema',a:'Intelligenza artificiale',ter:.35,z:1},
 {t:'SMH.MI',isin:'IE00BMC38736',n:'VanEck Semiconductor',k:'tema',a:'Semiconduttori (chip)',ter:.35,z:0},
 {t:'XDWT.MI',isin:'IE00BM67HT60',n:'Xtrackers MSCI World Information Technology',k:'tema',a:'Tecnologia',ter:.25,z:1},
 {t:'RBOT.MI',isin:'IE00BYZK4552',n:'iShares Automation & Robotics',k:'tema',a:'Robotica e automazione',ter:.40,z:1},
 {t:'XDWH.MI',isin:'IE00BM67HK77',n:'Xtrackers MSCI World Health Care',k:'tema',a:'Sanità',ter:.25,z:1},
 {t:'HEAL.MI',isin:'IE00BYZK4776',n:'iShares Healthcare Innovation',k:'tema',a:'Innovazione medica e biotech',ter:.40,z:1},
 {t:'LOCK.MI',isin:'IE00BG0J4C88',n:'iShares Digital Security',k:'tema',a:'Cybersicurezza',ter:.40,z:1},
 {t:'JEDI.MI',isin:'IE000YU9K6K2',n:'VanEck Space Innovators',k:'tema',a:'Spazio',ter:.55,z:0},
 {t:'DFNS.MI',isin:'IE000YYE6WK5',n:'VanEck Defense',k:'tema',a:'Difesa',ter:.55,z:0},
 {t:'INRG.MI',isin:'IE00B1XNHC34',n:'iShares Global Clean Energy Transition',k:'tema',a:'Energia pulita',ter:.65,z:1},
 {t:'URNU.MI',isin:'IE000NDWFGA5',n:'Global X Uranium',k:'tema',a:'Uranio e nucleare',ter:.65,z:0},
 {t:'XDW0.MI',isin:'IE00BM67HM91',n:'Xtrackers MSCI World Energy',k:'tema',a:'Petrolio e gas',ter:.25,z:1},
 {t:'XDWI.MI',isin:'IE00BM67HV82',n:'Xtrackers MSCI World Industrials',k:'tema',a:'Industria',ter:.25,z:1},
 {t:'XDWF.MI',isin:'IE00BM67HL84',n:'Xtrackers MSCI World Financials',k:'tema',a:'Banche e finanza',ter:.25,z:1},
 {t:'NDIA.MI',isin:'IE00BZCQB185',n:'iShares MSCI India',k:'tema',a:'India',ter:.65,z:1},
 {t:'GDX.MI',isin:'IE00BQQP9F84',n:'VanEck Gold Miners',k:'tema',a:'Miniere d\'oro',ter:.53,z:0},
];
// Aziende USA (bilanci ufficiali dalla SEC). Banche escluse: per loro il flusso di cassa libero non ha senso.
const STK=['AAPL','MSFT','NVDA','GOOGL','AMZN','META','AVGO','TSLA','LLY','V','MA','UNH','JNJ','PG','KO','PEP','COST','WMT','XOM','HD','MCD','ORCL','NFLX','AMD','ADBE','CRM','ABBV','MRK','ASML','NVO'];
const NAMES={AAPL:'Apple',MSFT:'Microsoft',NVDA:'Nvidia',GOOGL:'Alphabet (Google)',AMZN:'Amazon',META:'Meta',AVGO:'Broadcom',TSLA:'Tesla',LLY:'Eli Lilly',V:'Visa',MA:'Mastercard',UNH:'UnitedHealth',JNJ:'Johnson & Johnson',PG:'Procter & Gamble',KO:'Coca-Cola',PEP:'PepsiCo',COST:'Costco',WMT:'Walmart',XOM:'Exxon Mobil',HD:'Home Depot',MCD:"McDonald's",ORCL:'Oracle',NFLX:'Netflix',AMD:'AMD',ADBE:'Adobe',CRM:'Salesforce',ABBV:'AbbVie',MRK:'Merck',ASML:'ASML',NVO:'Novo Nordisk'};

async function chart(sym,p1=0){
  let err;for(const h of ['query1','query2']){for(let k=0;k<2;k++){try{
    const r=await fetch('https://'+h+'.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(sym)+'?interval=1d&period1='+p1+'&period2='+Math.floor(Date.now()/1000),{headers:UA});
    if(!r.ok)throw new Error('yahoo '+r.status);
    const R=(await r.json()).chart.result[0],q=R.indicators.quote[0],adj=R.indicators.adjclose?.[0]?.adjclose,t=[],c=[];
    for(let i=0;i<R.timestamp.length;i++){const v=(adj&&adj[i]>0)?adj[i]:q.close[i];if(v>0){t.push(R.timestamp[i]*1000);c.push(v)}}
    return{t,c,cur:R.meta.currency,px:R.meta.regularMarketPrice??c[c.length-1]}}catch(e){err=e;await new Promise(r=>setTimeout(r,600))}}}
  throw err}
function sma(c,p){if(c.length<p)return NaN;let s=0;for(let i=c.length-p;i<c.length;i++)s+=c[i];return s/p}
function stats(t,c){
  const n=c.length,last=c[n-1],now=t[n-1],at=yrs=>{const tt=now-yrs*365.25*864e5;if(t[0]>tt+20*864e5)return null;let i=0;while(t[i]<tt)i++;return Math.pow(last/c[i],1/yrs)-1};
  let pk=c[0],dd=0;for(const x of c){pk=Math.max(pk,x);dd=Math.min(dd,x/pk-1)}
  const ath=Math.max(...c),rs=[];for(let i=Math.max(1,n-756);i<n;i++)rs.push(Math.log(c[i]/c[i-1]));
  const mu=rs.reduce((a,b)=>a+b,0)/rs.length,vol=Math.sqrt(rs.reduce((a,b)=>a+(b-mu)**2,0)/rs.length*252);
  const s200=sma(c,200),i12=n>252?c[n-253]:null,i1=n>21?c[n-22]:null;
  // andamento degli ultimi 2 anni a punti settimanali per il grafico
  const sp=[];for(let i=Math.max(0,n-520);i<n;i+=5)sp.push(+c[i].toFixed(4));
  const w52=c.slice(Math.max(0,n-252));
  // rendimento di ogni anno solare e dei periodi mobili di 1, 3 e 5 anni (peggiore, mediano, migliore) su tutta la storia
  const yr={},yearly=[];for(let i=0;i<n;i++)yr[new Date(t[i]).getUTCFullYear()]=c[i];
  const ys=Object.keys(yr).sort();for(let k=1;k<ys.length;k++)yearly.push({y:+ys[k],r:yr[ys[k]]/yr[ys[k-1]]-1,part:k==ys.length-1});
  const mo=[];for(let i=n-1;i>=0;i-=21)mo.unshift(c[i]);
  const roll=m=>{if(mo.length<=m)return null;const a=[];for(let i=m;i<mo.length;i++)a.push(Math.pow(mo[i]/mo[i-m],12/m)-1);a.sort((x,y)=>x-y);return{min:a[0],p10:a[Math.floor(a.length*.1)],med:a[Math.floor(a.length/2)],p90:a[Math.floor(a.length*.9)],max:a[a.length-1],k:a.length}};
  return{from:new Date(t[0]).toISOString().slice(0,10),y1:at(1),y3:at(3),y5:at(5),y10:at(10),yAll:Math.pow(last/c[0],365.25*864e5/(now-t[0]))-1,maxdd:dd,ddNow:last/ath-1,vol,
    s200,above200:last>s200,mom12:i12&&i1?i1/i12-1:null,lo52:Math.min(...w52),hi52:Math.max(...w52),last,yearly,r1:roll(12),r3:roll(36),r5:roll(60),spark:sp}}

// ---- Bilanci SEC (XBRL companyfacts) ----
const TAG={rev:['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet','RevenueFromContractWithCustomerIncludingAssessedTax'],
 ni:['NetIncomeLoss','ProfitLoss'],op:['OperatingIncomeLoss'],ocf:['NetCashProvidedByUsedInOperatingActivities','NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
 capex:['PaymentsToAcquirePropertyPlantAndEquipment','PaymentsToAcquireProductiveAssets','PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets'],
 buy:['PaymentsForRepurchaseOfCommonStock'],div:['PaymentsOfDividendsCommonStock','PaymentsOfDividends'],acq:['PaymentsToAcquireBusinessesNetOfCashAcquired'],
 sbc:['ShareBasedCompensation','AllocatedShareBasedCompensationExpense'],rnd:['ResearchAndDevelopmentExpense'],
 dIss:['ProceedsFromIssuanceOfLongTermDebt','ProceedsFromIssuanceOfDebt'],dRep:['RepaymentsOfLongTermDebt','RepaymentsOfDebt'],
 sh:['WeightedAverageNumberOfDilutedSharesOutstanding']};
const BAL={cash:['CashAndCashEquivalentsAtCarryingValue','CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],sti:['MarketableSecuritiesCurrent','ShortTermInvestments','AvailableForSaleSecuritiesDebtSecuritiesCurrent'],
 debt:['LongTermDebtNoncurrent','LongTermDebt'],debtC:['LongTermDebtCurrent','CommercialPaper'],eq:['StockholdersEquity']};
// IFRS per le aziende estere che depositano il 20-F (ASML, Novo Nordisk)
const IFRS={rev:['Revenue'],ni:['ProfitLoss','ProfitLossAttributableToOwnersOfParent'],op:['ProfitLossFromOperatingActivities'],ocf:['CashFlowsFromUsedInOperatingActivities'],
 capex:['PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities','PurchaseOfPropertyPlantAndEquipment'],buy:['PaymentsToAcquireOrRedeemEntitysShares'],
 div:['DividendsPaidClassifiedAsFinancingActivities','DividendsPaid'],acq:['CashFlowsUsedInObtainingControlOfSubsidiariesOrOtherBusinessesClassifiedAsInvestingActivities'],
 sbc:['AdjustmentsForSharebasedPayments'],rnd:['ResearchAndDevelopmentExpense'],dIss:['ProceedsFromNoncurrentBorrowings','ProceedsFromBorrowingsClassifiedAsFinancingActivities'],
 dRep:['RepaymentsOfNoncurrentBorrowings','RepaymentsOfBorrowingsClassifiedAsFinancingActivities'],sh:['WeightedAverageNumberOfSharesOutstandingBasicAndDiluted','AdjustedWeightedAverageShares']};
const IBAL={cash:['CashAndCashEquivalents'],sti:['CurrentInvestments','OtherCurrentFinancialAssets'],debt:['NoncurrentPortionOfNoncurrentBorrowings','LongtermBorrowings','NoncurrentFinancialLiabilities'],debtC:['CurrentPortionOfNoncurrentBorrowings','CurrentBorrowings'],eq:['EquityAttributableToOwnersOfParent','Equity']};
function annual(f,tags){
  const by={};
  for(const tg of tags){const u=f[tg]?.units;if(!u)continue;const arr=u.USD||u.EUR||u.DKK||u.shares||Object.values(u)[0];const unit=u.USD?'USD':u.EUR?'EUR':u.DKK?'DKK':u.shares?'shares':Object.keys(u)[0];
    for(const x of arr){if(!/^(10-K|20-F|40-F)/.test(x.form||'')||!x.start)continue;const d=(Date.parse(x.end)-Date.parse(x.start))/864e5;if(d<330||d>400)continue;
      const k=x.end.slice(0,7);if(by[k]&&by[k].tag!==tg&&tags.indexOf(by[k].tag)<tags.indexOf(tg))continue;if(by[k]&&by[k].tag===tg&&by[k].filed>=x.filed)continue;by[k]={v:x.val,end:x.end,filed:x.filed,tag:tg,unit}}}
  return Object.values(by).sort((a,b)=>a.end<b.end?-1:1)}
function latestInstant(f,tags){let best=null;for(const tg of tags){const u=f[tg]?.units;if(!u)continue;const arr=u.USD||u.EUR||u.DKK||Object.values(u)[0];for(const x of arr){if(x.start)continue;if(!best||x.end>best.end||(x.end==best.end&&x.filed>best.filed))best={v:x.val,end:x.end,filed:x.filed}}if(best)break}return best}
let TICK=null;
async function cikOf(t){if(!TICK){const r=await fetch('https://www.sec.gov/files/company_tickers.json',{headers:SEC});TICK={};for(const v of Object.values(await r.json()))TICK[v.ticker]=v.cik_str}return TICK[t]}
async function fund(t){
  const cik=await cikOf(t);if(!cik)throw new Error('CIK non trovato per '+t);
  const r=await fetch('https://data.sec.gov/api/xbrl/companyfacts/CIK'+String(cik).padStart(10,'0')+'.json',{headers:SEC});if(!r.ok)throw new Error('SEC '+r.status);
  const j=await r.json(),us=j.facts['us-gaap'],ifrs=j.facts['ifrs-full'],dei=j.facts.dei||{};
  const useIfrs=!us||(!us.Revenues&&!us.RevenueFromContractWithCustomerExcludingAssessedTax&&ifrs),F=useIfrs?ifrs:us,TG=useIfrs?IFRS:TAG,BL=useIfrs?IBAL:BAL;
  const A={};for(const k in TG)A[k]=annual(F,TG[k]);
  const yrs=A.rev.slice(-5).map(x=>x.end.slice(0,7)),get=(k,y)=>{const e=A[k].find(x=>x.end.slice(0,7)===y);return e?e.v:null};
  const rows=yrs.map(y=>{const o={y};for(const k in TG)o[k]=get(k,y);o.fcf=o.ocf!=null?o.ocf-(o.capex||0):null;return o});
  const B={};for(const k in BL)B[k]=latestInstant(F,BL[k]);
  const shDei=latestInstant(dei,['EntityCommonStockSharesOutstanding']);
  const cur=A.rev.at(-1)?.unit||'USD';
  return{cik,name:j.entityName,ifrs:!!useIfrs,cur,rows,bal:{cash:B.cash?.v||0,sti:B.sti?.v||0,debt:(B.debt?.v||0)+(B.debtC?.v||0),eq:B.eq?.v??null,asOf:B.cash?.end||B.eq?.end||null},
    shares:shDei?.v||rows.at(-1)?.sh||null,src:'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK='+cik+'&type=10-K'}}
const pct=x=>(x*100).toFixed(1).replace('.',',')+'%';
function score(f,px,st){
  const R=f.rows,L=R.at(-1),P=R.length>=4?R.at(-4):R[0],why=[],bad=[];let s=0;
  if(!L||!L.rev)return{score:null,verdict:'Dati insufficienti',why:['Bilancio non leggibile in formato standard'],bad:[]};
  const yrs=R.length>=4?3:Math.max(1,R.length-1),g=P&&P.rev>0?Math.pow(L.rev/P.rev,1/yrs)-1:null;
  if(g!=null){if(g>=.15){s+=2;why.push('ricavi in crescita del '+pct(g)+' l\'anno')}else if(g>=.08){s+=1;why.push('ricavi in crescita del '+pct(g)+' l\'anno')}else if(g<0){s-=1;bad.push('ricavi in calo ('+pct(g)+' l\'anno)')}}
  const nm=L.ni!=null?L.ni/L.rev:null;if(nm!=null){if(nm>=.25){s+=2;why.push('margine netto '+pct(nm))}else if(nm>=.15){s+=1;why.push('margine netto '+pct(nm))}else if(nm<0){s-=2;bad.push('in perdita (margine '+pct(nm)+')')}}
  const fm=L.fcf!=null?L.fcf/L.rev:null;if(fm!=null){if(fm>=.15){s+=1;why.push('trasforma in cassa libera il '+pct(fm)+' dei ricavi')}else if(L.fcf<0){s-=2;bad.push('brucia cassa: flusso di cassa libero negativo')}}
  if(L.fcf!=null&&L.ni>0){const cv=L.fcf/L.ni;if(cv>=.8){s+=1;why.push('utili confermati dalla cassa (conversione '+cv.toFixed(2)+')')}else if(cv<.5){s-=1;bad.push('utili poco coperti dalla cassa (conversione '+cv.toFixed(2)+')')}}
  const nd=f.bal.debt-f.bal.cash-f.bal.sti;if(L.fcf>0){const lev=nd/L.fcf;if(lev<=2){s+=1;why.push(nd<0?'più liquidità che debiti':'debito netto ripagabile in '+lev.toFixed(1)+' anni di cassa')}else if(lev>4){s-=1;bad.push('debito netto pari a '+lev.toFixed(1)+' anni di cassa')}}
  const shL=L.sh,shP=P?.sh;if(shL&&shP){const d=shL/shP-1;if(d<-.01){s+=1;why.push('numero di azioni sceso del '+pct(-d)+' in '+yrs+' anni (riacquisti)')}else if(d>.05){s-=1;bad.push('azionisti diluiti: +'+pct(d)+' azioni in '+yrs+' anni')}}
  if(L.sbc&&L.fcf>0&&L.sbc/L.fcf>.25){s-=1;bad.push('pagamenti in azioni ai dipendenti pari al '+pct(L.sbc/L.fcf)+' della cassa libera')}
  let mcap=null,fy=null,pe=null;
  if(px&&f.shares){mcap=px*f.shares;
    if(f.cur!==st.cur){/* valute diverse (es. ADR in USD, bilancio in EUR/DKK): niente rapporti di prezzo */mcap=null}}
  if(mcap&&L.fcf!=null){fy=L.fcf/mcap;pe=L.ni>0?mcap/L.ni:null;
    if(fy>=.05){s+=2;why.push('prezzo basso rispetto alla cassa: rende il '+pct(fy)+' in flusso di cassa libero')}else if(fy>=.03){s+=1;why.push('prezzo ragionevole: rende il '+pct(fy)+' in cassa libera')}
    else if(fy<.01){s-=2;bad.push('prezzo molto caro: solo '+pct(fy)+' di cassa libera sul valore di borsa')}else if(fy<.015){s-=1;bad.push('prezzo caro: '+pct(fy)+' di cassa libera sul valore di borsa')}}
  if(st){if(st.above200&&st.mom12>0){s+=1;why.push('prezzo sopra la media a 200 giorni e in salita da 12 mesi')}else if(!st.above200&&st.mom12<0){s-=1;bad.push('prezzo sotto la media a 200 giorni e in calo da 12 mesi')}}
  // dove vanno i soldi: uso del flusso di cassa operativo nell'ultimo anno
  const ocf=L.ocf||0,alloc=ocf>0?{capex:(L.capex||0)/ocf,buy:(L.buy||0)/ocf,div:(L.div||0)/ocf,acq:(L.acq||0)/ocf,debt:((L.dRep||0)-(L.dIss||0))/ocf,rnd:L.rnd?L.rnd/L.rev:null}:null;
  // un'ottima azienda pagata troppo resta un cattivo acquisto: "Interessante" solo se il prezzo lascia almeno il 2,5% di cassa libera
  let verdict=s>=6?'Interessante':s>=3?'Da tenere d\'occhio':'Evita adesso';
  if(verdict==='Interessante'&&fy!=null&&fy<.025){verdict='Da tenere d\'occhio';bad.push('azienda solida ma prezzo pieno ('+pct(fy)+' di cassa libera sul valore di borsa): meglio comprarla dentro un ETF o aspettare un ribasso')}
  return{score:s,verdict,why,bad,growth:g,nm,fm,fy,pe,mcap,nd,alloc}}

// ---- motore satellite: momento dei temi e prova storica con versamenti mensili ----
function monthly(t,c){const m=new Map();for(let i=0;i<t.length;i++){const d=new Date(t[i]);m.set(d.getUTCFullYear()*12+d.getUTCMonth(),c[i])}return m}
function momScore(mm,k){const g=(a,b)=>{const x=mm.get(k-a),y=mm.get(k-b);return x&&y?x/y-1:null};const m3=g(0,3),m6=g(0,6),m12=g(1,12);if(m3==null||m6==null||m12==null)return null;return{m3,m6,m12,s:(m3+m6+m12)/3}}
function irr(flows,last){let lo=-.99,hi=2;for(let it=0;it<80;it++){const mid=(lo+hi)/2,r=Math.pow(1+mid,1/12)-1;let v=0;for(let i=0;i<flows.length;i++)v+=flows[i]*Math.pow(1+r,flows.length-i);if(v>last)hi=mid;else lo=mid}return(lo+hi)/2}
function satBacktest(H,core,share,topN){
  const C=H[core];if(!C)return null;const ks=[...C.keys()].sort((a,b)=>a-b),th=Object.keys(H).filter(t=>t!==core&&t!=='XEON.MI');
  const start=ks.find(k=>th.filter(t=>momScore(H[t],k)).length>=4);if(start==null)return null;
  const S={core:{},eq:{},mom:{},all:{}};for(const x in S)S[x]={u:{},flows:[],nav:[],pk:0,dd:0};
  const val=(x,k)=>Object.entries(S[x].u).reduce((a,[t,u])=>a+u*(H[t].get(k)||0),0);
  const buy=(x,t,amt,k)=>{const p=H[t].get(k);if(!p)return false;S[x].u[t]=(S[x].u[t]||0)+amt/p;return true};
  let prevV={},picksLog=[];
  for(const k of ks){if(k<start)continue;const avail=th.filter(t=>H[t].get(k)),sc=avail.map(t=>({t,m:momScore(H[t],k)})).filter(x=>x.m).sort((a,b)=>b.m.s-a.m.s);
    const top=sc.filter(x=>x.m.m12>0).slice(0,topN);
    for(const x in S){const v0=val(x,k);if(prevV[x]>0){const r=v0/prevV[x];S[x].nav.push((S[x].nav.at(-1)||1)*r)}}
    buy('core',core,100,k);
    buy('eq',core,100*(1-share),k);if(sc.length)for(const y of sc)buy('eq',y.t,100*share/sc.length,k);else buy('eq',core,100*share,k);
    buy('mom',core,100*(1-share),k);if(top.length)for(const y of top)buy('mom',y.t,100*share/top.length,k);else buy('mom',core,100*share,k);
    const topA=[{t:core,m:momScore(C,k)},...sc].filter(x=>x.m&&x.m.m12>0).sort((a,b)=>b.m.s-a.m.s).slice(0,topN);if(topA.length)for(const y of topA)buy('all',y.t,100/topA.length,k);else buy('all',core,100,k);
    for(const x in S){S[x].flows.push(100);prevV[x]=val(x,k)}
    if(k===ks.at(-1))picksLog=top.map(y=>y.t)}
  const last=ks.at(-1),out={from:new Date(Date.UTC(Math.floor(start/12),start%12,1)).toISOString().slice(0,7),to:new Date(Date.UTC(Math.floor(last/12),last%12,1)).toISOString().slice(0,7),months:S.core.flows.length,r:{}};
  for(const x in S){const v=val(x,last),inv=S[x].flows.reduce((a,b)=>a+b,0);let pk=0,dd=0;for(const n of S[x].nav){pk=Math.max(pk,n);dd=Math.min(dd,n/pk-1)}
    out.r[x]={irr:irr(S[x].flows,v),mult:v/inv,dd}}
  return out}
async function refreshSat(etfOut){
  const H={},meta={};for(const e of [...ETF.filter(e=>e.t==='SWDA.MI'),...THEMES]){try{const h=await chart(e.t);H[e.t]=monthly(h.t,h.c);meta[e.t]={...e,px:h.px,...stats(h.t,h.c)}}catch(err){}}
  const k=Math.max(...[...H['SWDA.MI'].keys()]),now=Object.keys(H).filter(t=>t!=='SWDA.MI').map(t=>({t,m:momScore(H[t],k)})).filter(x=>x.m).sort((a,b)=>b.m.s-a.m.s);
  const bt2=satBacktest(H,'SWDA.MI',.2,2),bt3=satBacktest(H,'SWDA.MI',.2,3);
  const rank=now.map(x=>{const e=meta[x.t];delete e.spark;delete e.yearly;return{...e,m3:x.m.m3,m6:x.m.m6,m12:x.m.m12,s:x.m.s}});
  const themes=THEMES.filter(t=>!rank.some(r=>r.t===t.t)).map(t=>meta[t.t]?{...meta[t.t],spark:undefined,yearly:undefined,young:true}:{...t,err:'storia non disponibile'});
  await sb.from('state').upsert({key:'inv_sat',value:{t:Date.now(),rank,young:themes,bt2,bt3,picks:rank.filter(r=>r.m12>0).slice(0,2).map(r=>r.t)}});
  return rank.length}
async function refreshEtf(){
  const out=[];
  for(const e of ETF){try{const h=await chart(e.t);out.push({...e,px:h.px,cur:h.cur,...stats(h.t,h.c)})}catch(err){out.push({...e,err:String(err).slice(0,80)})}}
  await sb.from('state').upsert({key:'inv_etf',value:{t:Date.now(),etf:out}});
  try{await refreshSat(out)}catch(e){await sb.from('state').upsert({key:'inv_sat',value:{t:Date.now(),err:String(e).slice(0,200)}})}
  return out.length}
async function refreshStocks(max=4){
  const {data:have}=await sb.from('inv_fund').select('sym,updated_at');const age={};for(const h of have||[])age[h.sym]=Date.parse(h.updated_at);
  const todo=STK.filter(s=>!age[s]||Date.now()-age[s]>20*36e5).slice(0,max),done=[];
  for(const s of todo){try{
    const f=await fund(s),h=await chart(s,1262304000),st={...stats(h.t,h.c),cur:h.cur};
    const sc=score(f,h.px,st);delete st.spark;delete st.yearly;
    await sb.from('inv_fund').upsert({sym:s,data:{sym:s,name:NAMES[s]||f.name,legal:f.name,px:h.px,cur:h.cur,fcur:f.cur,ifrs:f.ifrs,rows:f.rows,bal:f.bal,shares:f.shares,src:f.src,st,...sc},updated_at:new Date().toISOString()});done.push(s)}
    catch(e){await sb.from('inv_fund').upsert({sym:s,data:{sym:s,name:NAMES[s]||s,err:String(e).slice(0,120)},updated_at:new Date().toISOString()});done.push(s+' (errore)')}}
  return done}
async function hash(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('sm-inv|'+s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:CORS});
  try{
    if(req.method==='GET'){
      const [{data:e},{data:l},{data:b},{data:f},{data:ss},{data:sat}]=await Promise.all([sb.from('state').select('value').eq('key','inv_etf').maybeSingle(),sb.from('state').select('value').eq('key','lt').maybeSingle(),sb.from('state').select('value').eq('key','brokers').maybeSingle(),sb.from('inv_fund').select('data,updated_at'),sb.from('state').select('value').eq('key','strat_stats').maybeSingle(),sb.from('state').select('value').eq('key','inv_sat').maybeSingle()]);
      return J({etf:e?.value||null,lt:l?.value||null,brokers:b?.value||null,strat:ss?.value||null,sat:sat?.value||null,stocks:(f||[]).map(x=>({...x.data,at:x.updated_at}))})}
    const body=await req.json().catch(()=>({}));
    if(body.act==='refresh'){
      const {data}=await sb.from('state').select('value').eq('key','cfg').maybeSingle();
      if(!data||req.headers.get('x-key')!==data.value.key)return J({error:'no'},401);
      const {data:e}=await sb.from('state').select('value').eq('key','inv_etf').maybeSingle();
      if(body.etf||!e?.value?.t||Date.now()-e.value.t>12*36e5)return J({ok:true,etf:await refreshEtf()});
      return J({ok:true,stocks:await refreshStocks(body.max||4)})}
    if(body.act==='get'||body.act==='save'){
      const pin=String(body.pin||'');if(pin.length<4)return J({error:'PIN di almeno 4 cifre'},400);
      const h=await hash(pin),{data:p}=await sb.from('inv_profile').select('*').eq('id',1).maybeSingle();
      if(p?.pin_hash&&p.pin_hash!==h)return J({error:'PIN errato'},403);
      if(body.act==='get')return J({ok:true,data:p?.data||{},isNew:!p?.pin_hash});
      const d=body.data||{};if(JSON.stringify(d).length>50000)return J({error:'troppi dati'},400);
      await sb.from('inv_profile').upsert({id:1,pin_hash:h,data:d,updated_at:new Date().toISOString()});return J({ok:true})}
    return J({error:'azione sconosciuta'},400)
  }catch(e){return J({error:String(e&&e.stack||e).slice(0,300)},500)}
});
