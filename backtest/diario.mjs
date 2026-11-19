// Diario dei segnali: registra ogni segnale individuato (day trading e swing), lo commenta mentre e' aperto e alla chiusura, e ne calcola l'esito.
// Scrive risultati/diario.json solo se qualcosa cambia. L'Excel si costruisce da li' (diario_excel.py).
import fs from 'node:fs'; import { createRequire } from 'node:module';
import { CAP } from './lib.mjs';
import { CLASSI, MSTF, carica } from './daydata.mjs';
const { prep, AG, simulate } = createRequire(import.meta.url)('../docs/dayagents.js');
const rj = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { return null } };
const DS = rj('risultati/day_segnali.json'), SW = rj('risultati/segnali.json'); let Dia = rj('risultati/diario.json') || { ops: [] };
Dia.ops = Dia.ops.filter(z => !(z.tipo == 'swing' && (z.commenti[0]?.testo || '').startsWith('Operazione già in corso')));
const before = JSON.stringify(Dia), now = new Date().toISOString(), it = x => new Date(x).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmt = x => x == null ? '–' : (+x).toPrecision(6).replace(/\.?0+$/, '');
const com = (o, t) => o.commenti.push({ t: now, testo: t });
const seen = new Set();
const mk = o => { const ex = Dia.ops.find(z => z.id == o.id); if (ex) return ex; const n = { ...o, stato: 'aperta', esito: null, R: null, pnl: null, chiusa: null, motivoChiusura: null, rMax: o.R0 ?? 0, rMin: o.R0 ?? 0, commenti: [] }; Dia.ops.push(n); return n };
// ---- day trading
for (const A of DS?.agenti || []) for (const s of A.segnali || []) {
  const id = ['day', A.cls, A.agente, s.sym, s.dir, s.dal].join('|'); seen.add(id);
  const nuovo = !Dia.ops.some(z => z.id == id);
  const o = mk({ id, tipo: 'day', cls: A.cls, classe: A.clsNome, mercato: s.sym, mt5: s.mt5, strategia: A.nome, agente: A.agente, qualita: A.adottabile ? 'agente promosso e stabile' : A.stato == 'promosso' ? 'promosso, non ancora stabile' : 'in prova (solo osservazione)', tf: A.tf, dir: s.dir, aperta: s.dal, entrata: s.entrata, stopIniziale: s.stopIniziale, stop: s.stop, tp: s.tp, stopDist: s.stopDist, rischioPct: DS.risk, rischioEuro: +(CAP * DS.risk).toFixed(2), regola: A.regola, uscita: A.uscita, par: A.par, costo: A.costo, barraSegnale: s.barraSegnale, R0: 0 });
  if (nuovo) { o.barraSegnale = s.barraSegnale; com(o, `Segnale individuato alle ${it(s.dal)}: ${s.dir} ${s.sym} a ${fmt(s.entrata)} con stop ${fmt(s.stopIniziale)}${s.tp ? ' e obiettivo ' + fmt(s.tp) : ' (nessun obiettivo, chiusura a fine giornata)'}. Regola: ${A.regola}. Qualità: ${o.qualita}. Rischio ${(DS.risk * 100).toFixed(1)}% = ${o.rischioEuro} € su ${CAP} €.`) }
  if (o.stato != 'aperta') continue;
  if (Math.abs(s.stop - o.stop) > 1e-9 * Math.abs(o.stop)) { com(o, `Stop spostato da ${fmt(o.stop)} a ${fmt(s.stop)}${Math.abs(s.stop - s.entrata) < s.stopDist * 0.02 ? ' (a pareggio: l\'operazione non può più perdere)' : ''}. Risultato ora ${s.R} R.`); o.stop = s.stop }
  o.rMax = Math.max(o.rMax, s.R); o.rMin = Math.min(o.rMin, s.R); o.Rora = s.R; o.px = s.px;
  for (const th of [1, 2, 3, -0.5, -0.8]) { const f = 't' + th; o.soglie = o.soglie || {}; if (!o.soglie[f] && (th > 0 ? s.R >= th : s.R <= th)) { o.soglie[f] = 1; com(o, th > 0 ? `Raggiunti +${th} R (prezzo ${fmt(s.px)}).` : `Sotto ${th} R: il prezzo (${fmt(s.px)}) si avvicina allo stop ${fmt(s.stop)}.`) } }
}
// ---- swing: si registra solo un segnale NUOVO (o un trend entrato negli ultimi 2 giorni); i trend gia' in corso da mesi non sono operazioni
for (const G of SW?.gruppi || []) for (const m of G.mercati || []) {
  const p = m.posizioneAperta, cur = Dia.ops.find(z => z.tipo == 'swing' && z.cls == G.id && z.mercato == m.sym && z.stato == 'aperta');
  const recente = p && Date.now() - new Date(p.dal) < 2 * 864e5 + 4 * 36e5 * 6;
  if (!cur && !(m.puoiEntrare && !p) && !recente) continue;
  const id = cur ? cur.id : ['swing', G.id, m.sym, 'compra', p ? p.dal : now.slice(0, 10)].join('|'); seen.add(id);
  const nuovo = !cur, E = p ? p.entrata : m.px, SD = m.stopDist;
  const o = mk({ id, tipo: 'swing', cls: G.id, classe: G.nome, mercato: m.sym, mt5: m.mt5, strategia: G.strategia?.nome || '', qualita: G.strategia?.stabile ? 'strategia adottata (' + G.strategia.stabile + ' ottimizzazioni)' : 'strategia di riserva/in prova', tf: G.tf, dir: 'compra', aperta: p ? p.dal : now, entrata: E, stopIniziale: p ? +(E - SD).toPrecision(6) : m.stopIniziale, stop: p ? p.stop : m.stopIniziale, tp: p ? p.tp2R : m.tp2R, stopDist: SD, rischioPct: SW.risk, rischioEuro: +(CAP * SW.risk).toFixed(2), regola: G.strategia?.testo || '', costo: null, R0: p ? p.R : 0 });
  if (nuovo) com(o, `Segnale individuato: compra ${m.sym} a ${fmt(E)} (${G.nome}). Stop ${fmt(o.stop)}, inseguimento ${fmt(m.trailDist)}, obiettivi indicativi +2R ${fmt(m.tp2R)} / +3R ${fmt(m.tp3R)}. ${G.strategia?.testo || ''}`);
  if (o.stato != 'aperta') continue;
  if (p && Math.abs(p.stop - o.stop) > 1e-9 * Math.abs(o.stop)) { com(o, `Stop mobile alzato da ${fmt(o.stop)} a ${fmt(p.stop)}. Risultato ora ${p.R} R.`); o.stop = p.stop }
  if (p) { o.rMax = Math.max(o.rMax, p.R); o.rMin = Math.min(o.rMin, p.R); o.Rora = p.R; o.px = m.px; for (const th of [1, 2, 3]) { o.soglie = o.soglie || {}; const f = 't' + th; if (!o.soglie[f] && p.R >= th) { o.soglie[f] = 1; com(o, `Raggiunti +${th} R (prezzo ${fmt(m.px)}).`) } } }
}
// ---- chiusure
const chiudi = (o, R, motivo, tc) => { o.stato = 'chiusa'; o.R = +R.toFixed(2); o.pnl = +(R * o.rischioEuro).toFixed(2); o.esito = R > 0.05 ? 'vinta' : R < -0.05 ? 'persa' : 'pareggio'; o.chiusa = tc; o.motivoChiusura = motivo; com(o, `CHIUSA (${o.esito.toUpperCase()}): ${motivo}. Risultato ${o.R} R = ${o.pnl} € simulati su ${o.rischioEuro} € a rischio. Massimo raggiunto ${o.rMax.toFixed(2)} R, minimo ${o.rMin.toFixed(2)} R.${o.esito == 'persa' ? ' Da rivedere: ' + (o.rMax >= 1 ? 'era arrivata a +' + o.rMax.toFixed(1) + ' R e poi è tornata indietro: valutare stop a pareggio più precoce.' : 'lo stop è stato colpito senza mai andare in guadagno: segnale di ingresso debole in quel contesto.') : o.esito == 'vinta' && o.rMax - R > 1 ? ' Nota: il massimo era ' + o.rMax.toFixed(1) + ' R, parte del guadagno è stata restituita: valutare uscita parziale.' : ''}`) };
for (const o of Dia.ops.filter(z => z.stato == 'aperta' && !seen.has(z.id))) {
  try {
    if (o.tipo == 'day') {
      const C = CLASSI.find(c => c.id == o.cls), m = C.mercati.find(z => z.nome == o.mercato), ms = MSTF[o.tf], K = prep(await carica(m, o.tf, 1500), ms), i0 = K.t.findIndex(t => t == o.barraSignale || t == o.barraSegnale);
      if (i0 < 0) { if (Date.now() - new Date(o.aperta) > 36e5 * 30) chiudi(o, o.Rora ?? 0, 'dati non più disponibili, stimata sull\'ultimo risultato noto', now); continue }
      const sg = new Int8Array(K.n); sg[i0] = o.dir == 'compra' ? 1 : -1; const r = simulate(K, sg, o.uscita, { cost: o.costo ?? 0.0014, ix: 0 });
      if (!r.T.length) { if (r.open) continue; chiudi(o, 0, 'segnale non eseguibile (nessun ingresso nella stessa giornata)', now); continue }
      const t = r.T[0], R = t[2] - t[3], mot = o.tp && Math.abs(t[2] - o.uscita.tp) < 0.02 ? 'obiettivo raggiunto' : Math.abs(t[2] + 1) < 0.02 ? 'stop colpito' : t[2] > -0.02 && t[2] < 0.1 && o.uscita.be ? 'stop a pareggio colpito dopo +1 R' : 'chiusura a fine giornata (UTC) o stop spostato';
      chiudi(o, R, mot + ` (costi ${t[3].toFixed(2)} R inclusi)`, new Date(t[1]).toISOString())
    } else {
      if (!(SW?.gruppi || []).some(g => g.id == o.cls && (g.mercati || []).length)) continue;
      // swing: la posizione non risulta più aperta, si stima l'uscita all'ultimo stop noto
      const R = (o.stop - o.entrata) / o.stopDist; chiudi(o, R, 'stop mobile colpito o strategia uscita (stima sull\'ultimo stop noto ' + fmt(o.stop) + ')', now)
    }
  } catch (e) { console.log('chiusura', o.id, e.message) }
}
const st = Dia.ops.filter(z => z.stato == 'chiusa'); Dia.riepilogo = { aperte: Dia.ops.filter(z => z.stato == 'aperta').length, chiuse: st.length, vinte: st.filter(z => z.esito == 'vinta').length, perse: st.filter(z => z.esito == 'persa').length, pareggi: st.filter(z => z.esito == 'pareggio').length, R: +st.reduce((u, z) => u + z.R, 0).toFixed(2), pnl: +st.reduce((u, z) => u + z.pnl, 0).toFixed(2) };
Dia.ops = Dia.ops.slice(-3000);
if (JSON.stringify(Dia) != before) { Dia.aggiornato = now; fs.writeFileSync('risultati/diario.json', JSON.stringify(Dia)); console.log('diario aggiornato', JSON.stringify(Dia.riepilogo)) } else console.log('diario invariato')
