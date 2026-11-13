// @ts-nocheck
// Ponte tra MetaTrader 5 e il server.
// GET            -> operazioni aperte e consigliate per il robot, una per riga:
//                   S;id;simbolo;direzione;entrata;stop;tp1;creata_ms;tp2;giudizio;movimento_R;moltiplicatore_rischio;uscita(B|C|D)
// POST (robot)   -> fotografia del conto: saldo, equity, posizioni, operazioni chiuse, fase FTMO. Salvata nella tabella acct.
// GET ?acct=1    -> stato del conto per l'app (numero di conto mascherato).
import { createClient } from "jsr:@supabase/supabase-js@2";
const sb=createClient(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const MS={'15m':9e5,'1h':36e5,'4h':144e5,'1d':864e5},WINC=6;
// regole FTMO a due fasi: obiettivo di profitto, perdita massima giornaliera e totale (in % del saldo iniziale)
const PHASES={0:{n:'Prova gratuita',tg:.10},1:{n:'Challenge (fase 1)',tg:.10},2:{n:'Verifica (fase 2)',tg:.05},3:{n:'Conto finanziato',tg:null}};
function code(e,P,now){
  const d=e.dir,E=e.entry,R=Math.abs(E-e.sl),m=d*(P-E)/R,risk=d*(P-e.sl)/R,rew=d*(e.tp1-P)/R,age=(now-e.tms)/MS[e.tf];
  let c;
  if(risk<=.05)c='INVALID';
  else if(rew<=0)c='DONE';
  else if(age>=WINC*2)c='STALE';
  else if(age>=WINC&&Math.abs(m)<.3&&!(e.stage>0))c='FLAT';
  else if(m>=-.15&&m<=.2&&age<=WINC)c='MARKET';
  else if(m>.2)c=m<=1?'LIMIT':'LATE';
  else if(m<-.15&&m>-.6)c='STOP';
  else if(m<=-.6)c='WEAK';
  else c='LATE';
  return{c,m}}
const num=x=>Number.isFinite(+x)?+x:null;
function clean(b){
  const phase=[0,1,2,3].includes(+b.phase)?+b.phase:0,init=num(b.init)||num(b.bal),P=PHASES[phase];
  const pos=(Array.isArray(b.pos)?b.pos:[]).slice(0,50).map(p=>({tk:String(p.tk),sym:String(p.sym).slice(0,20),type:+p.type,vol:num(p.vol),open:num(p.open),sl:num(p.sl),tp:num(p.tp),px:num(p.px),prof:num(p.prof),swap:num(p.swap),cmt:String(p.cmt||'').slice(0,30),magic:num(p.magic),time:num(p.time)}));
  const deals=(Array.isArray(b.deals)?b.deals:[]).slice(0,80).map(d=>({tk:String(d.tk),sym:String(d.sym||'').slice(0,20),type:+d.type,vol:num(d.vol),price:num(d.price),prof:num(d.prof),comm:num(d.comm),swap:num(d.swap),cmt:String(d.cmt||'').slice(0,30),magic:num(d.magic),time:num(d.time)}));
  const eq=num(b.eq),dayStart=num(b.dayStart)||num(b.bal);
  return{login:String(b.login).slice(0,20),server:String(b.server||'').slice(0,60),company:String(b.company||'').slice(0,60),cur:String(b.cur||'').slice(0,5),lev:num(b.lev),
    bal:num(b.bal),eq,mar:num(b.mar),free:num(b.free),prof:num(b.prof),init,dayStart,phase,phaseName:P.n,
    target:P.tg!=null?init*P.tg:null,dayLimit:init*.05,maxLimit:init*.10,
    dayLoss:Math.max(0,dayStart-eq),totLoss:Math.max(0,init-eq),pnl:eq-init,
    guard:String(b.guard||'').slice(0,200),ver:String(b.ver||'').slice(0,10),pos,deals,ts:Date.now()}}
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:CORS});
  const url=new URL(req.url);
  try{
    if(req.method==='POST'){
      const b=await req.json();if(!b||!b.login||!(+b.bal>0))return new Response('ERR dati mancanti',{status:400,headers:CORS});
      const d=clean(b);const {error}=await sb.from('acct').upsert({login:d.login,data:d,updated_at:new Date().toISOString()});
      if(error)return new Response('ERR '+error.message,{status:500,headers:CORS});
      return new Response('OK',{headers:{...CORS,'Content-Type':'text/plain'}})}
    if(url.searchParams.get('acct')){
      const {data}=await sb.from('acct').select('data,updated_at').order('updated_at',{ascending:false}).limit(3);
      const out=(data||[]).map(r=>({...r.data,login:'…'+String(r.data.login).slice(-4),age:Date.now()-Date.parse(r.updated_at)}));
      return new Response(JSON.stringify({accts:out}),{headers:{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'}})}
    const {data,error}=await sb.from('signals').select('id,sym,tf,dir,entry,sl,tp1,tp2,t,stage,why,cur').eq('status','open').eq('advised',true).order('id');
    if(error)return new Response('ERR '+error.message,{status:500});
    const rows=data||[],syms=[...new Set(rows.filter(e=>/USDT$/.test(e.sym)).map(e=>e.sym))],px={};
    if(syms.length){try{const r=await fetch('https://data-api.binance.vision/api/v3/ticker/price?symbols='+encodeURIComponent(JSON.stringify(syms)));const j=await r.json();for(const x of j)px[x.symbol]=+x.price}catch(e){}}
    const now=Date.now();
    const lines=rows.map(e=>{const P=px[e.sym]||e.cur;if(!P)return null;const w=e.why||{},tms=Date.parse(e.t),a=code({...e,tms},P,now);return ['S',e.id,w.fs||e.sym.replace('USDT','USD'),e.dir,e.entry,e.sl,e.tp1,tms,e.tp2,a.c,a.m.toFixed(3),w.rm||1,w.x||'B'].join(';')}).filter(Boolean);
    return new Response('OK\n'+lines.join('\n')+(lines.length?'\n':''),{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}})
  }catch(e){return new Response('ERR '+String(e.message||e).slice(0,200),{status:500,headers:CORS})}});
