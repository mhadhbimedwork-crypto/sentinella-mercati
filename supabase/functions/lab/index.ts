// @ts-nocheck
// Laboratorio v4: cripto, valute, indici, metalli. Strategie di trend, di rottura, di rientro dal ribasso (RSI2)
// e medie mobili 21/50/200 (esponenziali "ma" e semplici "mas"), separate per lato (L = compra, S = vendi).
// Costi inclusi: spread+commissioni per operazione e interessi per ogni giorno di posizione aperta.
// Periodo di scelta (is) = primo 60% della storia di ogni mercato, periodo mai visto (oos) = ultimo 40%.
// Modalita' "lt": prova di lungo periodo su un indice (compra e tieni contro filtro media 200 e medie 21/50/200).
import { createClient } from "jsr:@supabase/supabase-js@2";
const cl=(x,a=-1,b=1)=>Math.max(a,Math.min(b,x));
function ema(a,p){const k=2/(p+1),o=new Array(a.length);let e=a[0];for(let i=0;i<a.length;i++){e=i?a[i]*k+e*(1-k):a[0];o[i]=e}return o}
function sma(a,p){const o=new Array(a.length).fill(NaN);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=p)s-=a[i-p];if(i>=p-1)o[i]=s/p}return o}
function wilder(a,p){const o=new Array(a.length).fill(NaN);let s=0;for(let i=0;i<a.length;i++){if(i<p){s+=a[i];if(i===p-1)o[i]=s/p}else o[i]=(o[i-1]*(p-1)+a[i])/p}return o}
function rsi(c,p=14){const o=new Array(c.length).fill(50);let g=0,l=0;for(let i=1;i<c.length;i++){const d=c[i]-c[i-1],u=Math.max(d,0),w=Math.max(-d,0);if(i<=p){g+=u/p;l+=w/p}else{g=(g*(p-1)+u)/p;l=(l*(p-1)+w)/p}if(i>=p)o[i]=l===0?100:100-100/(1+g/l)}return o}
function roll(a,p,f){const o=new Array(a.length).fill(NaN);for(let i=p-1;i<a.length;i++){let m=a[i];for(let j=i-p+1;j<i;j++)m=f(m,a[j]);o[i]=m}return o}
function prep(raw){
  const K={t:[],o:[],h:[],l:[],c:[],v:[],tb:[]};
  for(const r of raw){K.t.push(+r[0]);K.o.push(+r[1]);K.h.push(+r[2]);K.l.push(+r[3]);K.c.push(+r[4]);K.v.push(+r[5]);K.tb.push(+r[9])}
  const n=K.c.length,{h,l,c,v}=K,mx=Math.max,mn=Math.min;
  K.e20=ema(c,20);K.e21=ema(c,21);K.e50=ema(c,50);K.e200=ema(c,200);K.rsi=rsi(c);K.rsi2=rsi(c,2);K.s5=sma(c,5);
  K.s21=sma(c,21);K.s50=sma(c,50);K.s200=sma(c,200);
  const tr=c.map((x,i)=>i?mx(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])):h[i]-l[i]);
  K.atr=wilder(tr,14);
  const pdm=c.map((x,i)=>{if(!i)return 0;const u=h[i]-h[i-1],d=l[i-1]-l[i];return u>d&&u>0?u:0}),mdm=c.map((x,i)=>{if(!i)return 0;const u=h[i]-h[i-1],d=l[i-1]-l[i];return d>u&&d>0?d:0});
  const sp=wilder(pdm,14),sm=wilder(mdm,14);
  K.adx=wilder(c.map((x,i)=>{const a=sp[i]/K.atr[i],b=sm[i]/K.atr[i];return a+b>0?100*Math.abs(a-b)/(a+b):0}),14);
  const md=ema(c,12),m26=ema(c,26);for(let i=0;i<n;i++)md[i]-=m26[i];const sg=ema(md,9);K.mh=md.map((x,i)=>x-sg[i]);
  const mid=p=>{const a=roll(h,p,(x,y)=>mx(x,y)),b=roll(l,p,(x,y)=>mn(x,y));return a.map((x,i)=>(x+b[i])/2)};
  K.ten=mid(9);K.kij=mid(26);const b52=mid(52);
  K.sa=c.map((x,i)=>i>=26?(K.ten[i-26]+K.kij[i-26])/2:NaN);K.sb=c.map((x,i)=>i>=26?b52[i-26]:NaN);
  const prev=a=>a.map((x,i)=>i?a[i-1]:NaN);
  K.dh=prev(roll(h,20,(x,y)=>mx(x,y)));K.dl=prev(roll(l,20,(x,y)=>mn(x,y)));
  K.dh55=prev(roll(h,55,(x,y)=>mx(x,y)));K.dl55=prev(roll(l,55,(x,y)=>mn(x,y)));
  const vm=sma(v,20);K.vz=v.map((x,i)=>{if(i<19)return 0;let s=0;for(let j=i-19;j<=i;j++)s+=(v[j]-vm[i])**2;s=Math.sqrt(s/20);return s?(x-vm[i])/s:0});
  K.sh=[];K.sl=[];
  for(let i=3;i<n-3;i++){let a=1,b=1;for(let j=i-3;j<=i+3;j++){if(h[j]>h[i])a=0;if(l[j]<l[i])b=0}if(a)K.sh.push(i);if(b)K.sl.push(i)}
  return K}
function lastSw(a,i){let lo=0,hi=a.length-1,p=-1;while(lo<=hi){const m=(lo+hi)>>1;if(a[m]<=i-3){p=m;lo=m+1}else hi=m-1}const o=[];if(p>=0)o.push(a[p]);if(p>=1)o.push(a[p-1]);return o}
const W={trend:1.2,smc:1,mom:.8,flow:.8};
function analyze(K,i){
  const c=K.c[i],atr=K.atr[i];
  let t=0;const top=Math.max(K.sa[i],K.sb[i]),bot=Math.min(K.sa[i],K.sb[i]);
  t+=c>K.e200[i]?.4:-.4;t+=K.e50[i]>K.e200[i]?.2:-.2;if(c>top)t+=.3;else if(c<bot)t-=.3;t+=K.ten[i]>K.kij[i]?.1:-.1;
  let s=0;const H=lastSw(K.sh,i),L=lastSw(K.sl,i);
  if(H.length==2&&L.length==2){const hh=K.h[H[0]]>K.h[H[1]],hl=K.l[L[0]]>K.l[L[1]];if(hh&&hl)s+=.4;else if(!hh&&!hl)s-=.4}
  for(let j=i;j>i-3;j--){if(L.length&&K.l[j]<K.l[L[0]]&&K.c[j]>K.l[L[0]]){s+=.4;break}if(H.length&&K.h[j]>K.h[H[0]]&&K.c[j]<K.h[H[0]]){s-=.4;break}}
  for(let j=i;j>i-10;j--){if(K.l[j]>K.h[j-2]&&c>=K.h[j-2]){s+=.2;break}if(K.h[j]<K.l[j-2]&&c<=K.l[j-2]){s-=.2;break}}
  let m=0;const r=K.rsi[i],mh=K.mh[i];
  m+=r>55?.3:r<45?-.3:0;m+=mh>0&&mh>K.mh[i-1]?.4:mh<0&&mh<K.mh[i-1]?-.4:0;m+=r<30?.3:r>70?-.3:0;
  let dv=0,tv=0;for(let j=i-19;j<=i;j++){dv+=2*K.tb[j]-K.v[j];tv+=K.v[j]}
  const votes={trend:cl(t),smc:cl(s),mom:cl(m),flow:tv?cl(dv/tv*6):0};
  let cons=0,ws=0;for(const k in votes){cons+=W[k]*votes[k];ws+=W[k]}cons/=ws;
  const adx=K.adx[i];let dir=0,st=null,d=1.5*atr;
  if(adx>=25){st='trend';if(Math.abs(cons)>=.35&&Math.sign(votes.trend)==Math.sign(cons)&&Math.abs(c-K.e20[i])<=1.2*atr){dir=Math.sign(cons);const sw=dir>0?(L.length?K.l[L[0]]:NaN):(H.length?K.h[H[0]]:NaN),ds=(dir>0?c-sw:sw-c)+.3*atr;if(isFinite(ds)&&ds>0)d=cl(ds,atr,3*atr)}}
  else if(adx>=18){st='brkv';if(c>K.dh[i]&&K.vz[i]>1)dir=1;else if(c<K.dl[i]&&K.vz[i]>1)dir=-1}
  return dir?{s:st,dir,R:d}:null}
// Medie 21/50/200: ingresso quando la 21 incrocia la 50 nel verso del trend lungo (prezzo e 50 dallo stesso lato della 200).
function maSig(K,i,F,M,S,name){
  const c=K.c[i];if(!(S[i]>0)||!(M[i-1]>0))return null;
  const up=F[i]>M[i]&&F[i-1]<=M[i-1],dn=F[i]<M[i]&&F[i-1]>=M[i-1];
  if(up&&c>S[i]&&M[i]>S[i])return{s:name,dir:1,R:3*K.atr[i]};
  if(dn&&c<S[i]&&M[i]<S[i])return{s:name,dir:-1,R:3*K.atr[i]};
  return null}
// ma2: entra quando la 21 e la 50 superano entrambe la 200 (l'ultima delle due la incrocia oggi); la 200 fa da stop mobile.
function ma2Sig(K,i){
  const a=K.e21,b=K.e50,s=K.e200,c=K.c[i];if(!(s[i]>0)||!(s[i-1]>0))return null;
  const up=a[i]>s[i]&&b[i]>s[i]&&!(a[i-1]>s[i-1]&&b[i-1]>s[i-1]),dn=a[i]<s[i]&&b[i]<s[i]&&!(a[i-1]<s[i-1]&&b[i-1]<s[i-1]);
  const R=Math.abs(c-s[i]);if(!(R>0)||R>6*K.atr[i]||R<.3*K.atr[i])return null;
  if(up&&c>s[i])return{s:'ma2',dir:1,R};if(dn&&c<s[i])return{s:'ma2',dir:-1,R};return null}
function signals(K,i){
  const o=[],a=analyze(K,i);if(a)o.push(a);
  const c=K.c[i],atr=K.atr[i],R=2*atr,e2=K.e200[i],e5=K.e50[i];
  if(c>K.dh[i]&&c>e2&&e5>e2)o.push({s:'d20',dir:1,R});else if(c<K.dl[i]&&c<e2&&e5<e2)o.push({s:'d20',dir:-1,R});
  if(c>K.dh55[i]&&c>e2)o.push({s:'d55',dir:1,R});else if(c<K.dl55[i]&&c<e2)o.push({s:'d55',dir:-1,R});
  if(c>e2&&K.rsi2[i]<10)o.push({s:'rsi2',dir:1,R:2.5*atr});else if(c<e2&&K.rsi2[i]>90)o.push({s:'rsi2',dir:-1,R:2.5*atr});
  const m1=maSig(K,i,K.e21,K.e50,K.e200,'ma');if(m1)o.push(m1);
  const m2=maSig(K,i,K.s21,K.s50,K.s200,'mas');if(m2)o.push(m2);
  const m3=ma2Sig(K,i);if(m3)o.push(m3);
  return o}
const EXITS={rsi2:['M'],ma:['X','C','D'],mas:['X','C','D'],ma2:['E']};
function sim(K,j0,d,E,R,x,s){
  const n=K.c.length;let stop=E-d*R,best=E,stage=0;const tp=x=='B'?E+d*3*R:null,tr=x=='C'?1.5:2.5;
  const F=s=='mas'?K.s21:K.e21,M=s=='mas'?K.s50:K.e50;
  for(let j=j0;j<n;j++){
    const hi=K.h[j],lo=K.l[j],op=K.o[j];
    if(x=='E'&&j>j0)stop=K.e200[j-1];
    if(d>0?lo<=stop:hi>=stop){const f=j>j0?(d>0?Math.min(stop,op):Math.max(stop,op)):stop;return{r:d*(f-E)/R,j}}
    if(x=='E'){if(d*(K.e21[j]-K.e200[j])<0&&d*(K.e50[j]-K.e200[j])<0)return{r:d*(K.c[j]-E)/R,j};continue}
    if(x=='M'){if(d*(K.c[j]-K.s5[j])>0||j-j0>=9)return{r:d*(K.c[j]-E)/R,j};continue}
    // uscita a medie: la 21 torna dall'altra parte della 50 (chiusura della candela)
    if(x=='X'){if(d*(F[j]-M[j])<0)return{r:d*(K.c[j]-E)/R,j};continue}
    if(tp!=null&&(d>0?hi>=tp:lo<=tp))return{r:3,j};
    best=d>0?Math.max(best,hi):Math.min(best,lo);
    if(x=='B'){const pd=d*(best-E)/R;let c=stop;
      if(pd>=1){c=d>0?Math.max(c,E+.1*R):Math.min(c,E-.1*R);stage=Math.max(stage,1)}
      if(pd>=1.5){const t=best-d*.75*R;c=d>0?Math.max(c,t):Math.min(c,t);stage=2}
      stop=c;if(stage==0&&j-j0>=11)return{r:cl(d*(K.c[j]-E)/R,-1,3),j}}
    else{const t=best-d*tr*R;stop=d>0?Math.max(stop,t):Math.min(stop,t)}}
  return{r:d*(K.c[n-1]-E)/R,j:n-1}}
const MS={'4h':144e5,'1d':864e5};
const UA={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'};
const BASES=['https://data-api.binance.vision','https://api.binance.com'];
async function api(p){let err;for(const b of BASES){for(let k=0;k<2;k++){try{const r=await fetch(b+p);if(!r.ok)throw new Error('http '+r.status);return await r.json()}catch(e){err=e}}}throw err}
async function histB(sym,tf,n){let out=[],end=null;while(out.length<n){const j=await api('/api/v3/klines?symbol='+sym+'&interval='+tf+'&limit=1000'+(end?'&endTime='+end:''));if(!j.length)break;out=j.concat(out);end=+j[0][0]-1;if(j.length<1000)break}return out.slice(0,-1)}
async function histY(sym,p1=1262304000){
  let err;for(const h of ['query1','query2']){for(let k=0;k<3;k++){try{
    const r=await fetch('https://'+h+'.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(sym)+'?interval=1d&period1='+p1+'&period2='+Math.floor(Date.now()/1000),{headers:UA});
    if(!r.ok)throw new Error('yahoo http '+r.status);
    const R=(await r.json()).chart.result[0],q=R.indicators.quote[0],out=[];
    for(let i=0;i<R.timestamp.length;i++){const c=q.close[i];if(c==null||!(c>0))continue;const o=q.open[i]>0?q.open[i]:c,h2=q.high[i]>0?q.high[i]:c,l=q.low[i]>0?q.low[i]:c;const v=q.volume[i]||0;out.push([R.timestamp[i]*1000,o,Math.max(h2,o,c),Math.min(l,o,c),c,v,0,0,0,v/2])}
    return out.slice(0,-1)}catch(e){err=e;await new Promise(r=>setTimeout(r,800*(k+1)))}}}
  throw err}
function run(K,tf,dT,dS,cost,hc,only){
  const n=K.c.length,ms=MS[tf],res={},busy={},split=K.t[Math.floor(260+(n-260)*.6)];let dk=0;
  for(let i=260;i<n-2;i++){
    let sg=signals(K,i);if(only)sg=sg.filter(s=>only.includes(s.s));if(!sg.length)continue;
    let dtr;
    if(tf=='1d')dtr=Math.sign(K.c[i]-K.e200[i]);
    else{const tcl=K.t[i]+ms;while(dk+1<dT.length&&dT[dk+1]+864e5<=tcl)dk++;dtr=dT.length&&dT[dk]+864e5<=tcl?dS[dk]:0}
    const E=K.o[i+1];
    for(const s of sg){if(s.dir!==dtr)continue;
      for(const x of EXITS[s.s]||['B','C','D']){const key=s.s+'|'+x+'|'+(s.dir>0?'L':'S');if((busy[key]??-1)>=i)continue;
        const o=sim(K,i+1,s.dir,E,s.R,x,s.s);busy[key]=o.j;
        const days=(K.t[o.j]-K.t[i+1])/864e5+ms/864e5,r=o.r-(cost+hc*days)*E/s.R,k2=key+'|'+(K.t[i]<split?'is':'oos');
        const a=(res[k2]??={n:0,w:0,r:0,r2:0,days:0});a.n++;if(r>0)a.w++;a.r+=r;a.r2+=r*r;a.days+=days}}}
  return res}
function effRatio(c){let s=0,k=0;for(let i=260;i<c.length;i+=5){let p=0;for(let j=i-19;j<=i;j++)p+=Math.abs(c[j]-c[j-1]);if(p>0){s+=Math.abs(c[i]-c[i-20])/p;k++}}return k?s/k:0}
// Prova di lungo periodo su indice: equity giornaliera con segnale alla chiusura e posizione dal giorno dopo.
function longTerm(raw,cost){
  const t=raw.map(r=>+r[0]),c=raw.map(r=>+r[4]),n=c.length,s21=sma(c,21),s50=sma(c,50),s200=sma(c,200);
  const rules={bh:i=>1,ma200:i=>c[i]>s200[i]?1:0,stack:i=>s21[i]>s50[i]&&c[i]>s200[i]?1:0,cross:i=>s50[i]>s200[i]?1:0};
  const out={from:new Date(t[200]).toISOString().slice(0,10),to:new Date(t[n-1]).toISOString().slice(0,10),years:(t[n-1]-t[200])/(365.25*864e5),r:{}};
  for(const [k,f] of Object.entries(rules)){
    let eq=1,pk=1,dd=0,pos=f(200),sw=0,inm=0,rs=[];const yr={};
    for(let i=201;i<n;i++){const ret=c[i]/c[i-1]-1;let d=pos*ret;const np=f(i);if(np!==pos){d-=cost;sw++}eq*=1+d;rs.push(d);if(pos)inm++;pk=Math.max(pk,eq);dd=Math.min(dd,eq/pk-1);pos=np;
      const y=new Date(t[i]).getUTCFullYear();yr[y]=eq}
    const yrs=out.years,mu=rs.reduce((a,b)=>a+b,0)/rs.length,sd=Math.sqrt(rs.reduce((a,b)=>a+(b-mu)**2,0)/rs.length);
    let prev=1,worst=0;for(const y of Object.keys(yr).sort()){worst=Math.min(worst,yr[y]/prev-1);prev=yr[y]}
    out.r[k]={cagr:Math.pow(eq,1/yrs)-1,maxdd:dd,vol:sd*Math.sqrt(252),sharpe:sd?mu/sd*Math.sqrt(252):0,inMkt:inm/(n-201),switches:sw/yrs,worstYear:worst}}
  return out}
const sb=createClient(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
Deno.serve(async req=>{
  try{
    const {data}=await sb.from('state').select('value').eq('key','cfg').maybeSingle();
    if(!data||req.headers.get('x-key')!==data.value.key)return new Response('no',{status:401});
    const body=await req.json(),{sym,src,cls,tf,n,cost,hc,only}=body;
    if(body.lt){
      const raw=await histY(sym,body.p1??-1325376000),res=longTerm(raw,body.cost??0.001);
      const {data:cur}=await sb.from('state').select('value').eq('key','lt').maybeSingle();
      const v=cur?.value||{};v[sym]={...res,name:body.name||sym,at:new Date().toISOString()};
      await sb.from('state').upsert({key:'lt',value:v});
      return new Response(JSON.stringify({ok:true,sym,res}))}
    let raw,dT=[],dS=[];
    if(src=='y')raw=await histY(sym);
    else{raw=await histB(sym,tf,n);if(tf!='1d'){const rd=await histB(sym,'1d',3000),dc=rd.map(r=>+r[4]),de=ema(dc,200);dT=rd.map(r=>+r[0]);dS=dc.map((c,i)=>i<200?0:Math.sign(c-de[i]))}}
    if(raw.length<600)throw new Error('storia troppo corta: '+raw.length);
    const K=prep(raw),res=run(K,tf,dT,dS,cost,hc,only),t0=new Date(K.t[0]).toISOString(),now=new Date().toISOString();
    const rows=Object.entries(res).map(([k,s])=>{const [strat,exitm,side,seg]=k.split('|');return{sym,cls,tf,strat,exitm,side,seg,n:s.n,w:s.w,r:s.r,r2:s.r2,days:s.days,candles:K.c.length,t0,updated_at:now}});
    let del=sb.from('lab2').delete().eq('sym',sym).eq('tf',tf);if(only)del=del.in('strat',only);await del;
    if(rows.length){const ins=await sb.from('lab2').insert(rows);if(ins.error)throw new Error(ins.error.message)}
    if(tf=='1d'&&!only){const up=await sb.from('mkt').upsert({sym,cls,src,er:effRatio(K.c),candles:K.c.length,t0,updated_at:now});if(up.error)throw new Error(up.error.message)}
    return new Response(JSON.stringify({ok:true,sym,tf,candles:K.c.length,rows:rows.length}))
  }catch(e){return new Response(JSON.stringify({error:String(e&&e.stack||e).slice(0,400)}),{status:500})}
});
