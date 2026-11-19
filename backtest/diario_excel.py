# Costruisce risultati/DIARIO_SEGNALI.xlsx da risultati/diario.json: tutti i segnali, i commenti e il riepilogo con le formule.
import json
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import CellIsRule
D = json.load(open('risultati/diario.json'))
ops = D['ops']
H = Font(bold=True, color="FFFFFF"); HF = PatternFill("solid", fgColor="1F3A5F")
def when(x):
    if not x: return None
    try: return datetime.fromisoformat(x.replace('Z', '+00:00')).replace(tzinfo=None)
    except Exception: return x
wb = Workbook(); ws = wb.active; ws.title = "Operazioni"
cols = [("N°",5),("Tipo",9),("Classe",20),("Mercato",12),("Simbolo MT5",12),("Strategia",30),("Qualità del segnale",30),("Barre",7),("Direzione",10),("Aperta (UTC)",17),("Entrata",12),("Stop iniziale",12),("Stop attuale",12),("Obiettivo",12),("Distanza stop",12),("Rischio %",9),("Rischio €",10),("Stato",9),("Esito",9),("Risultato R",11),("Guadagno/perdita €",14),("Chiusa (UTC)",17),("Motivo chiusura",42),("R massimo",10),("R minimo",10),("R ora (aperte)",11),("Regola di ingresso",60),("Ultimo commento",80),("ID",10)]
ws.append([c for c, _ in cols])
for i, (c, w) in enumerate(cols, 1):
    ws.cell(1, i).font = H; ws.cell(1, i).fill = HF; ws.cell(1, i).alignment = Alignment(wrap_text=True, vertical="center"); ws.column_dimensions[get_column_letter(i)].width = w
ordered = sorted(ops, key=lambda o: o['aperta'] or '', reverse=True)
for n, o in enumerate(ordered, 1):
    r = n + 1
    ws.append([len(ordered) - n + 1, 'Day trading' if o['tipo'] == 'day' else 'Swing', o['classe'], o['mercato'], o['mt5'], o['strategia'], o['qualita'], o.get('tf'), o['dir'], when(o['aperta']), o['entrata'], o['stopIniziale'], o['stop'], o['tp'], o['stopDist'], o['rischioPct'], o['rischioEuro'], o['stato'], o['esito'], o['R'], None, when(o['chiusa']), o['motivoChiusura'], round(o['rMax'], 2), round(o['rMin'], 2), o.get('Rora'), o['regola'], o['commenti'][-1]['testo'] if o['commenti'] else '', o['id'][:60]])
    ws.cell(r, 21).value = f'=IF(T{r}="","",ROUND(T{r}*Q{r},2))'
    ws.cell(r, 10).number_format = ws.cell(r, 22).number_format = 'dd/mm/yyyy hh:mm'; ws.cell(r, 16).number_format = '0.0%'
    for c in (27, 28): ws.cell(r, c).alignment = Alignment(wrap_text=True, vertical="top")
ws.freeze_panes = "E2"; ws.auto_filter.ref = ws.dimensions
last = max(len(ordered) + 1, 2)
green = PatternFill("solid", bgColor="C6EFCE"); red = PatternFill("solid", bgColor="FFC7CE")
ws.conditional_formatting.add(f"S2:S{last}", CellIsRule(operator='equal', formula=['"vinta"'], fill=green))
ws.conditional_formatting.add(f"S2:S{last}", CellIsRule(operator='equal', formula=['"persa"'], fill=red))
# Commenti
wc = wb.create_sheet("Commenti"); wc.append(["Operazione", "Mercato", "Direzione", "Data e ora (UTC)", "Commento"])
for c in wc[1]: c.font = H; c.fill = HF
for o in ordered:
    for k in o['commenti']: wc.append([o['id'][:60], o['mercato'], o['dir'], when(k['t']), k['testo']])
for i, w in enumerate([34, 12, 10, 17, 150], 1): wc.column_dimensions[get_column_letter(i)].width = w
for r in wc.iter_rows(min_row=2):
    r[3].number_format = 'dd/mm/yyyy hh:mm'; r[4].alignment = Alignment(wrap_text=True, vertical="top")
wc.freeze_panes = "A2"
# Riepilogo con formule vive
wr = wb.create_sheet("Riepilogo", 0); O = "Operazioni"
def blk(row, title, key_col, keys):
    wr.cell(row, 1, title).font = Font(bold=True, size=12); row += 1
    for j, h in enumerate([title.split(' per ')[-1].capitalize(), "Segnali", "Chiuse", "Vinte", "Perse", "Pareggi", "% vinte", "R totale", "Guadagno €"], 1):
        wr.cell(row, j, h).font = H; wr.cell(row, j).fill = HF
    for k in keys:
        row += 1; rng = f"{O}!${key_col}$2:${key_col}${last}"
        wr.cell(row, 1, k)
        wr.cell(row, 2, f'=COUNTIF({rng},A{row})')
        wr.cell(row, 3, f'=COUNTIFS({rng},A{row},{O}!$R$2:$R${last},"chiusa")')
        wr.cell(row, 4, f'=COUNTIFS({rng},A{row},{O}!$S$2:$S${last},"vinta")')
        wr.cell(row, 5, f'=COUNTIFS({rng},A{row},{O}!$S$2:$S${last},"persa")')
        wr.cell(row, 6, f'=COUNTIFS({rng},A{row},{O}!$S$2:$S${last},"pareggio")')
        wr.cell(row, 7, f'=IF(C{row}=0,"",D{row}/C{row})'); wr.cell(row, 7).number_format = '0%'
        wr.cell(row, 8, f'=SUMIFS({O}!$T$2:$T${last},{rng},A{row})'); wr.cell(row, 9, f'=SUMIFS({O}!$U$2:$U${last},{rng},A{row})')
    return row + 2
wr.cell(1, 1, "Diario dei segnali: riepilogo").font = Font(bold=True, size=14)
wr.cell(2, 1, "Aggiornato: " + (D.get('aggiornato') or '')[:16].replace('T', ' ') + " UTC. Risultati simulati a capitale 10.000 €, rischio 0,5% (day) e 1% (swing) per operazione, costi inclusi. Non sono guadagni reali.")
r = blk(4, "Totale", "R", ["aperta", "chiusa"]); 
wr.cell(4, 1, "Totale per stato")
r = blk(r, "Risultati per tipo", "B", ["Day trading", "Swing"])
r = blk(r, "Risultati per classe di mercato", "C", sorted({o['classe'] for o in ops}))
r = blk(r, "Risultati per strategia", "F", sorted({o['strategia'] for o in ops}))
r = blk(r, "Risultati per mercato", "D", sorted({o['mercato'] for o in ops}))
r = blk(r, "Risultati per qualità del segnale", "G", sorted({o['qualita'] for o in ops}))
for i, w in enumerate([44, 9, 9, 9, 9, 9, 9, 11, 13], 1): wr.column_dimensions[get_column_letter(i)].width = w
wb.save('risultati/DIARIO_SEGNALI.xlsx'); print('excel ok', len(ops))
