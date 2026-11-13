# Costruisce risultati/RISULTATI_TEST.xlsx da risultati/backtest.json
import json
from openpyxl import Workbook
from openpyxl.styles import Font,PatternFill,Alignment
from openpyxl.utils import get_column_letter
D=json.load(open('risultati/backtest.json'))
H=Font(bold=True,color="FFFFFF");HF=PatternFill("solid",fgColor="1F3A5F");G=PatternFill("solid",fgColor="E2EFDA");Y=PatternFill("solid",fgColor="FFF2CC")
wb=Workbook()
def sh(name,head,rows,w=None,first=False):
    ws=wb.active if first else wb.create_sheet(name); ws.title=name; ws.append(head)
    for c in ws[1]: c.font=H;c.fill=HF;c.alignment=Alignment(wrap_text=True,vertical="center")
    for r in rows: ws.append(r)
    for i in range(1,len(head)+1): ws.column_dimensions[get_column_letter(i)].width=(w or {}).get(i,14)
    ws.freeze_panes="A2"; return ws
pc=lambda x: None if x is None else round(x*100,1)
par=lambda f: ', '.join(f"{k}={v}" for k,v in f['par'].items())
LATO={'L':'Acquisto','S':'Vendita'}
def desc(f):
    p=f['par'];fam=f['fam']
    e={'don':lambda:f"chiusura sopra il massimo delle ultime {p['lb']} barre"+({'n':'','e100':', solo sopra EMA 100','e200':', solo sopra EMA 200'}[p['f']]),
       'donadx':lambda:f"chiusura sopra il massimo di {p['lb']} barre, sopra EMA 200 e ADX >= {p['adx']}",
       'bb':lambda:f"chiusura sopra la banda di Bollinger (20, {p['k']}), solo sopra EMA 200",
       'kelt':lambda:f"chiusura sopra il canale di Keltner (EMA 20 + {p['k']} ATR), solo sopra EMA 200",
       'st':lambda:f"Supertrend ({p['p']}, {p['m']}) gira al rialzo",'emax':lambda:f"EMA {p['a']} incrocia sopra EMA {p['b']}",
       'mom':lambda:f"variazione a {p['n']} barre diventa positiva, sopra EMA 200",'macd':lambda:"istogramma MACD (12,26,9) diventa positivo, con filtro di trend",
       'pull':lambda:f"RSI 14 sceso sotto {p['th']} negli ultimi 5 giorni, poi chiusura sopra il massimo del giorno prima, sopra EMA 200",
       'rsi2':lambda:f"RSI 2 sotto {p['th']} sopra EMA 200",'squeeze':lambda:"volatilita' compressa e poi rottura della banda di Bollinger"}[fam]()
    x="uscita: chiusura sopra la media a 5 o dopo 10 barre" if fam=='rsi2' else f"stop mobile a {f['td']} ATR dal massimo raggiunto"
    return f"Ingresso (all'apertura della barra dopo): {e}. Stop iniziale {f['sd']} ATR; {x}."
# scelta dei 3 finali: un mercato ciascuno, il finalista con il miglior risultato nel periodo mai visto dopo costi doppi tra quelli robusti
PICK=[('cripto','1d'),('metalli','1d'),('indici','1d')]
fin3=[]
for cls,tf in PICK:
    g=next(g for g in D['groups'] if g['cls']==cls and g['tf']==tf)
    ok=[f for f in g['finals'] if f['t12_vicini']['positiviMaiVisto']==f['t12_vicini']['n'] and f['t14_costiDoppi']['oos']['cagr']>0 and f['t19_senzaMigliore']['cagr']>0 and f['t20_ritardo1barra']['oos']['cagr']>0 and f['oos']['n']>=60]
    ok.sort(key=lambda f: -min(f['t14_costiDoppi']['oos']['cagr'],f['t20_ritardo1barra']['oos']['cagr'])/max(-f['all']['dd'],0.05))
    if ok: fin3.append((g,ok[0]))
rows=[]
for i,(g,f) in enumerate(fin3,1):
    r05=next(x for x in f['t17_rischio'] if x['risk']==0.005)
    rows.append([i,f"{g['cls'].capitalize()} {g['tf']} ({len(g['mercati'])} mercati)",f['name'],desc(f),f"{g['from']} - {g['to']}",f['all']['yrs'],f['all']['n'],pc(f['all']['wr']),D['cap'],f['all']['eq'],pc(f['all']['cagr']),pc(f['all']['dd']),pc(f['is']['cagr']),pc(f['oos']['cagr']),pc(f['oos']['dd']),pc(f['t14_costiDoppi']['oos']['cagr']),pc(f['t20_ritardo1barra']['oos']['cagr']),pc(f['t16_monteCarlo']['dd95']),r05['eq'],pc(r05['cagr']),pc(r05['dd'])])
ws=sh('I 3 scelti',['#','Mercato','Strategia','Come è impostata','Periodo provato','Anni','Operazioni','Vinte %','Capitale iniziale €','Capitale finale € (rischio 1%)','Rendimento annuo %','Calo massimo %','Rend. annuo periodo di scelta %','Rend. annuo mai visto %','Calo mai visto %','Mai visto con costi doppi %','Mai visto con 1 barra di ritardo %','Calo nel 5% dei casi peggiori (Monte Carlo) %','Capitale finale € (rischio 0,5%)','Rend. annuo % (rischio 0,5%)','Calo max % (rischio 0,5%)'],rows,{2:24,3:28,4:70,5:24},first=True)
for r in ws.iter_rows(min_row=2):
    for c in r: c.alignment=Alignment(wrap_text=True,vertical="top")
ws.append([]);ws.append(['','Capitale usato: 10.000 € iniziali; ogni operazione rischia l\'1% del capitale del momento (100 € all\'inizio), massimo 6 posizioni aperte insieme, guadagni reinvestiti. Costi e interessi inclusi.'])
ws.append(['','Regola di scelta: parametri scelti sul primo 60% della storia, verificati sul 40% mai visto; poi 10 prove di robustezza. Risultati passati non garantiscono quelli futuri.'])
rows=[]
for g in D['groups']:
    for f in g['fams']:
        rows.append([g['cls'],g['tf'],f['name'],par(f),f['sd'],f['td'],LATO[f['side']],f['combos'],f['okBoth'],f['is']['n'],pc(f['is']['cagr']),pc(f['is']['dd']),f['oos']['n'],pc(f['oos']['cagr']),pc(f['oos']['dd']),pc(f['oos']['pos']),'Regge' if f['oos']['cagr']>0 and f['is']['cagr']>0 else 'Non regge'])
sh('Fase 1 - 11 strategie',['Mercati','TF','Strategia / indicatore','Parametri migliori (periodo di scelta)','Stop iniziale ATR','Stop mobile ATR','Lato','Combinazioni provate','Combinazioni positive su entrambi i periodi','Op. scelta','Rend. annuo scelta %','Calo scelta %','Op. mai viste','Rend. annuo mai visto %','Calo mai visto %','Mercati in guadagno %','Giudizio'],rows,{3:38,4:22})
rows=[]
for g in D['groups']:
    for f in g['finals']:
        c=f['t15_crisi'];r={x['risk']:x for x in f['t17_rischio']};o={x['maxOpen']:x for x in f['t18_maxAperte']}
        rows.append([g['cls'],g['tf'],f['name'],par(f),f['sd'],f['td'],LATO[f['side']],f['all']['n'],pc(f['all']['wr']),f['all']['eq'],pc(f['all']['cagr']),pc(f['all']['dd']),pc(f['is']['cagr']),pc(f['oos']['cagr']),pc(f['oos']['dd']),
          f"{f['t12_vicini']['positiviMaiVisto']}/{f['t12_vicini']['n']}",f"{f['t13_famiglia']['positiviMaiVisto']}/{f['t13_famiglia']['n']}",pc(f['t14_costiDoppi']['oos']['cagr']),pc(c[0]['ret']),pc(c[1]['ret']),pc(c[2]['ret']),pc(f['t16_monteCarlo']['ddMediano']),pc(f['t16_monteCarlo']['dd95']),
          pc(r[0.005]['cagr']),pc(r[0.005]['dd']),pc(r[0.02]['cagr']),pc(r[0.02]['dd']),pc(o[3]['cagr']),pc(o[10]['cagr']),f['t19_senzaMigliore']['tolto'],pc(f['t19_senzaMigliore']['cagr']),pc(f['t20_ritardo1barra']['oos']['cagr']),pc(f['lato_opposto']['all']['cagr']) if f['lato_opposto'] else None])
sh('Fase 2 - finalisti',['Mercati','TF','Strategia','Parametri','Stop iniziale ATR','Stop mobile ATR','Lato','Operazioni','Vinte %','Capitale finale €','Rend. annuo %','Calo max %','Rend. scelta %','Rend. mai visto %','Calo mai visto %',
  'T12 parametri vicini positivi','T13 stessa famiglia positiva','T14 costi doppi (mai visto) %','T15 crisi feb-apr 2020 %','T15 crisi nov 2021-2022 %','T15 anno 2018 %','T16 Monte Carlo calo mediano %','T16 Monte Carlo calo peggiore 5% %',
  'T17 rischio 0,5%: rend. %','T17 rischio 0,5%: calo %','T17 rischio 2%: rend. %','T17 rischio 2%: calo %','T18 max 3 posizioni: rend. %','T18 max 10 posizioni: rend. %','T19 mercato tolto','T19 rend. senza il mercato migliore %','T20 ingresso in ritardo di 1 barra (mai visto) %','Lato opposto: rend. %'],rows,{3:36,4:20})
rows=[]
for g in D['groups']:
    w=g['t11_walkForward']
    for x in w['folds']:
        p=x.get('pick');rows.append([g['cls'],g['tf'],x['fold'],x.get('from'),x.get('to'),p['name'] if p else 'nessuna',par(p) if p else '',p['sd'] if p else None,p['td'] if p else None,x.get('n'),pc(x.get('ret')),pc(x.get('dd'))])
    rows.append([g['cls'],g['tf'],'TOTALE','','','','','','','',pc(w['ret']),pc(w['dd']),f"rendimento annuo {pc(w['cagr'])}% su {w['yrs']} anni"])
sh('T11 walk-forward',['Mercati','TF','Finestra','Dal','Al','Strategia scelta sui dati precedenti','Parametri','Stop ATR','Stop mobile ATR','Operazioni','Rendimento %','Calo %','Nota'],rows,{6:38,7:20,13:34})
years=sorted({y for g,f in fin3 for y in f['byYear']})
sh('Anno per anno',['Anno']+[f"{g['cls']} {g['tf']}: capitale a fine anno €" for g,f in fin3],[[int(y)]+[f['byYear'].get(y) for g,f in fin3] for y in years],{2:34,3:34,4:34})
rows=[]
for g,f in fin3:
    for s in f['bySym']: rows.append([g['cls'],g['tf'],s['sym'],s['r']])
sh('Per mercato',['Classe','TF','Mercato','Somma dei risultati in R (1R = rischio di una operazione)'],rows,{4:50})
sh('Registro',['Test','Cosa','Dove','Esito'],[
 ['T1-T11','11 famiglie: Donchian, Donchian+ADX, compressione di volatilità, Bollinger, Keltner, Supertrend, incrocio EMA, momentum, MACD, ritracciamento RSI, RSI2. 2.052 combinazioni per gruppo, acquisto e vendita','Foglio Fase 1','Cripto, metalli e indici reggono in acquisto; valute 3 combinazioni su 2.052'],
 ['T11 bis','Walk-forward: ogni finestra usa la strategia migliore dei dati precedenti','Foglio T11','Risultati deboli: scegliere "la migliore del momento" non funziona'],
 ['T12','Parametri vicini (stop ±1 passo)','Fase 2',''],['T13','Tutta la famiglia sullo stesso lato','Fase 2',''],['T14','Costi raddoppiati','Fase 2',''],['T15','Periodi di crisi','Fase 2',''],
 ['T16','Monte Carlo: 500 ordini casuali delle operazioni','Fase 2',''],['T17','Rischio 0,5% / 1% / 2%','Fase 2',''],['T18','Massimo 3 / 6 / 10 posizioni aperte','Fase 2',''],
 ['T19','Senza il mercato migliore','Fase 2',''],['T20','Ingresso in ritardo di una barra','Fase 2',''],
 ['Prima','Test precedenti sul server (laboratorio, ottimizzazione 1 e 2)','Messaggi in chat','Coerenti: solo le rotture in acquisto reggono']],{2:90,3:16,4:60})
sh('Dati usati',['Serie scaricate'],[[l] for l in D['log']],{1:60})

# ---------- giro 3 ----------
import os
if os.path.exists('risultati/backtest2.json'):
    D2=json.load(open('risultati/backtest2.json'))
    REG={'n':'nessuno','breadth':'almeno metà dei mercati sopra la EMA 200','leader':'mercato guida sopra la EMA 200'}
    def d3(f):
        b=desc({'fam':f['fam'],'par':f['par'],'sd':f['sd'],'td':f['td']})
        ex=[]
        if f['reg']!='n': ex.append('Semaforo: si entra solo con '+REG[f['reg']])
        if f['rs']: ex.append('solo i mercati più forti della mediana a 90 barre')
        if f['be']: ex.append('stop a pareggio dopo +2R')
        if f['ts']: ex.append('si esce se dopo 10 barre il guadagno è sotto 0,5R')
        return b+(' '+'; '.join(ex)+'.' if ex else '')
    rows=[]
    for g in D2['groups']:
        f=g['scelta']
        if not f: continue
        b=f['base']
        rows.append([f"{g['cls'].capitalize()} {g['tf']}",f['name'],d3(f),f"{g['from']} - {g['to']}",f['all']['n'],pc(f['all']['wr']),D2['cap'],f['all']['eq'],pc(f['all']['cagr']),pc(f['all']['dd']),pc(f['is']['cagr']),pc(f['oos']['cagr']),pc(f['oos']['dd']),pc(f['costiDoppi']['cagr']),pc(f['ritardo']['cagr']),f"{f['vicini']['pos']}/{f['vicini']['n']}",f['senzaMigliore']['tolto'],pc(f['senzaMigliore']['cagr']),pc(b['all']['cagr']),pc(b['all']['dd'])])
    ws=sh('Giro 3 - scelte finali',['Mercato','Strategia','Come è impostata','Periodo','Operazioni','Vinte %','Capitale iniziale €','Capitale finale € (rischio 1%)','Rend. annuo %','Calo max %','Rend. scelta %','Rend. mai visto %','Calo mai visto %','Mai visto costi doppi %','Mai visto 1 barra di ritardo %','Parametri vicini positivi','Mercato tolto','Rend. senza il migliore %','Prima dei miglioramenti: rend. %','Prima dei miglioramenti: calo %'],rows,{1:16,2:28,3:80,4:24})
    for r in ws.iter_rows(min_row=2):
        for c in r: c.alignment=Alignment(wrap_text=True,vertical="top")
    rows=[]
    for g in D2['groups']:
        for e in g['effects']:
            for v in e['vals']:
                lab=REG.get(v['v'],{'0':'no','1':'sì','2':'sì','10':'sì'}.get(v['v'],v['v']))
                rows.append([g['cls'],g['tf'],e['name'],lab,pc(v['cagrOos']),pc(v['ddOos']),v['scoreOos'],v['scoreIs'],pc(v['positivi'])])
    sh('Giro 3 - miglioramenti',['Mercati','TF','Miglioramento','Valore','Rend. annuo medio mai visto %','Calo medio mai visto %','Rendimento/calo mai visto','Rendimento/calo scelta','Combinazioni positive mai visto %'],rows,{3:28,4:40})
    rows=[]
    for g in D2['groups']:
        for f in g['finals']:
            rows.append([g['cls'],g['tf'],f['name'],par(f),f['sd'],f['td'],'sì' if f['be'] else 'no','sì' if f['ts'] else 'no',REG[f['reg']],'sì' if f['rs'] else 'no',f['all']['n'],f['all']['eq'],pc(f['all']['cagr']),pc(f['all']['dd']),pc(f['is']['cagr']),pc(f['oos']['cagr']),pc(f['oos']['dd']),pc(f['costiDoppi']['cagr']),pc(f['ritardo']['cagr']),pc(f['senzaMigliore']['cagr'])])
    sh('Giro 3 - finalisti',['Mercati','TF','Strategia','Parametri','Stop ATR','Stop mobile ATR','Pareggio +2R','Uscita a tempo','Semaforo','Forza relativa','Operazioni','Capitale finale €','Rend. annuo %','Calo max %','Rend. scelta %','Rend. mai visto %','Calo mai visto %','Costi doppi %','Ritardo 1 barra %','Senza il migliore %'],rows,{3:34,4:20,9:38})
    u=D2.get('unito')
    if u:
        ys=sorted({y for x in u['scan'] for y in x['byYear']})
        rows=[[x['risk']*100,x['eq'],pc(x['cagr']),pc(x['dd']),pc(x['cagrOos']),pc(x['ddOos']),pc(x['cagrX2']),x['n']]+[x['byYear'].get(y) for y in ys] for x in u['scan']]
        ws=sh('Portafoglio unito',['Rischio per operazione %','Capitale finale €','Rend. annuo %','Calo max %','Rend. annuo mai visto %','Calo mai visto %','Rend. annuo con costi doppi %','Operazioni']+[f'Capitale fine {y} €' for y in ys],rows)
        ws.append([]);ws.append([f"Portafoglio: {', '.join(u['parti'])} insieme, {u['from']} - {u['to']}, capitale iniziale 10.000 €, massimo 10 posizioni aperte."])
        ws.append([f"Per FTMO (calo entro 8%): rischio {u['perFtmo']['risk']*100}% per operazione. Per capitale proprio (calo entro 25%): rischio {u['perCapitaleProprio']['risk']*100}%."])
    wb.save('risultati/RISULTATI_TEST.xlsx')
for g,f in fin3: print(g['cls'],g['tf'],f['name'],f['par'],f['sd'],f['td'],f['all'],'oos',f['oos'],'x2',f['t14_costiDoppi']['oos']['cagr'],'r05',f['t17_rischio'][0])
