/* The factory's quote form (16 Nov 2026): the page the link in each counter-sourcing mail opens, no login.
   The factory sees the style, the files BSC chose to share with it, and the item lines by colour and size;
   it quotes a rate per line, its lead time, when it can start and a note. The reply lands on the record by itself.
   In the prototype it opens as a pop-up over the record. */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store';
import type { ProductionOrder, FabricBy } from '../domain/types';
import { fmtDate, fmtMoney } from '../domain/engines';
import { FABRIC_BY_LABEL, TECH_PACK_ITEMS } from '../domain/reference';
import { packOf, poDraftOf, deliveryLocationOf, needsHemmingOf, QUERY_FILES } from '../domain/rtwPack';
import { Button, Field, Input, Select, fromDateInput, dateInput } from '../ui';

const faint = { color: 'var(--ink-faint)' } as const;
const soft = { color: 'var(--ink-soft)' } as const;

export function QuoteFormModal({ o, vendorId, onClose }: { o: ProductionOrder; vendorId: string; onClose: () => void }) {
  const { db, replyCostQuery } = useApp();
  const v = db.vendors.find(x => x.id === vendorId); const cq = o.costQuery; const p = packOf(o);
  const prev = cq?.replies.find(r => r.vendorId === vendorId) ?? null;
  const files = cq?.files?.[vendorId] ?? [...QUERY_FILES];
  const lines = poDraftOf(o, 0).lines;
  const sizes = [...new Set(lines.flatMap(l => l.sizes.map(x => x.size)))];
  const qtyOf = (i: number) => lines[i].sizes.reduce((a, x) => a + x.qty, 0);
  const factoryCloth = (p.clothBy ?? 'factory') !== 'bsc';
  const HEADS = ['Trims and accessories', 'Cutting', 'Stitching', 'Washing / finishing', 'Pressing, checking and packing', 'Overheads and margin'];
  const prevAmt = (h: string) => { const x = prev?.breakdown?.find(b => b.head === h)?.amount; return x != null ? String(x) : ''; };
  const [amts, setAmts] = useState<Record<string, string>>(() => Object.fromEntries(HEADS.map(h => [h, prevAmt(h)])));
  const [fabRate, setFabRate] = useState(''); const [fabMtr, setFabMtr] = useState(o.fabricMetres && o.orderQty ? String(Math.round(o.fabricMetres / o.orderQty * 100) / 100) : '1.6');
  const fabricPc = factoryCloth ? (Number(fabRate) || 0) * (Number(fabMtr) || 0) : 0;
  const [extras, setExtras] = useState<{ colour: string; amount: string }[]>([]);
  const [lead, setLead] = useState(prev ? String(prev.leadDays) : '');
  const [start, setStart] = useState(dateInput(prev?.startOn));
  const [cloth, setCloth] = useState<FabricBy | ''>(prev?.fabricBy ?? '');
  const [note, setNote] = useState(prev?.note ?? '');
  const [done, setDone] = useState(false);
  const pcs = lines.reduce((a, _, i) => a + qtyOf(i), 0);
  const perPc = fabricPc + HEADS.reduce((a, h) => a + (Number(amts[h]) || 0), 0);
  const extraOf = (c: string) => extras.filter(e => e.colour === c).reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const value = lines.reduce((a, l, i) => a + qtyOf(i) * (perPc + extraOf(l.colour)), 0);
  const ok = perPc > 0 && Number(lead) > 0 && (!factoryCloth || fabricPc > 0);
  const deliver = o.deliverTo ?? deliveryLocationOf(needsHemmingOf(o));
  const submit = () => {
    const breakdown = [...(factoryCloth ? [{ head: `Fabric · ₹${fabRate}/m × ${fabMtr} m`, amount: Math.round(fabricPc * 100) / 100 }] : []), ...HEADS.filter(h => Number(amts[h]) > 0).map(h => ({ head: h, amount: Number(amts[h]) }))];
    replyCostQuery(o.id, vendorId, { cost: Math.round((value / (pcs || 1)) * 100) / 100, leadDays: Number(lead), note: note.trim() || null, fabricBy: cloth || null, breakdown,
      lines: lines.map(l => ({ colour: l.colour, rate: Math.round((perPc + extraOf(l.colour)) * 100) / 100 })), startOn: fromDateInput(start) });
    setDone(true);
  };
  const fileDetail: Record<string, string> = {
    'Style and production ask': `${o.category} · ${o.subCategory} · ${o.orderQty} pcs${o.semiStitched ? ' · semi-stitched' : ''}`,
    'Fabric info': [p.fabric.description, p.fabric.content, p.fabric.widthIn ? `${p.fabric.widthIn}"` : null].filter(Boolean).join(' · ') || 'see the file',
    'Tech pack': TECH_PACK_ITEMS.filter(t => p.techPack[t.key as keyof typeof p.techPack]).map(t => t.label).join(', ') || 'see the file',
    'Trim card': p.trimCard ?? `${(p.trimLines ?? []).length} trim lines`,
    'Size break-up': o.sizeBreakup.map(x => `${x.size}: ${x.qty}`).join(' · '),
    'BOM': `${o.bom.length} lines · ${o.bom.slice(0, 3).map(b => b.item).join(', ')}${o.bom.length > 3 ? '…' : ''}`,
    'Delivery instruction': deliver,
  };
  return createPortal(<div className="qf-back" onClick={onClose}>
    <div className="qf" onClick={e => e.stopPropagation()} role="dialog" aria-label="Quote form">
      <div className="qf-bar"><span className="mono text-[11px]" style={faint}>plm.bombayshirts.com/quote/{o.id} · demo of the factory's page</span><button type="button" className="vlink" onClick={onClose}>✕ close</button></div>
      <div className="qf-body">
        <div className="qf-brand">Bombay Shirt Company · request for quote</div>
        <h2 className="qf-title">{o.styleName}</h2>
        <div className="text-[13px]" style={soft}>For <b>{v?.name ?? vendorId}</b> · reply by <b>{cq ? fmtDate(cq.deadline) : '—'}</b> · no login needed</div>

        {done ? <div className="qf-done">
          <div className="text-[15px] font-semibold">Thank you, your quote has reached BSC.</div>
          <div className="text-[13px] pt-1" style={soft}>{fmtMoney(Math.round(value))} for {pcs} pcs · average {fmtMoney(Math.round(value / (pcs || 1)))}/pc · {lead} days. You can reopen this link to change it before the deadline.</div>
          <div className="pt-3"><Button variant="primary" onClick={onClose}>Back to the record</Button></div>
        </div> : <>
          <div className="qf-grid pt-3">
            <div><div className="cap">Quantity</div><div className="text-[14px] font-semibold">{o.orderQty} pcs</div></div>
            <div><div className="cap">Needed in-house by</div><div className="text-[14px] font-semibold">{fmtDate(o.targetInhouse)}</div></div>
            <div><div className="cap">Deliver to</div><div className="text-[14px] font-semibold">{deliver}</div></div>
            <div><div className="cap">Cloth</div><div className="text-[14px] font-semibold">{FABRIC_BY_LABEL[p.clothBy ?? 'factory']}</div></div>
          </div>

          <div className="cap pt-4">Files shared with you</div>
          <div className="qf-files">{files.map(f => <div key={f} className="qf-file" title={fileDetail[f]}><span className="qf-ic">📄</span><span className="qf-fn"><b>{f}</b><span>{fileDetail[f]}</span></span><button type="button" className="vlink text-[11.5px]">↓</button></div>)}
            {files.length === 0 && <div className="text-[12.5px]" style={faint}>No files shared.</div>}</div>

          <div className="cap pt-4">What you are quoting for</div>
          <div style={{ overflowX: 'auto' }}><table className="t compact po-lines">
            <thead><tr><th>#</th><th>Colour / option</th>{sizes.map(sz => <th key={sz} className="num">{sz}</th>)}<th className="num">Pcs</th></tr></thead>
            <tbody>{lines.map((l, i) => <tr key={l.id}><td className="mono text-[11px]" style={faint}>{String(i + 1).padStart(2, '0')}</td><td className="font-medium">{l.colour}</td>
              {sizes.map(sz => <td key={sz} className="num">{l.sizes.find(x => x.size === sz)?.qty ?? 0}</td>)}<td className="num font-semibold">{qtyOf(i)}</td></tr>)}</tbody>
          </table></div>

          <div className="cap pt-4">Your price per piece, by cost head</div>
          <div className="qf-cost">
            {factoryCloth && <div className="qf-row"><span>Fabric <span className="text-[11.5px]" style={faint}>you buy the cloth</span></span><span className="flex gap-1.5 items-center"><Input type="number" min={0} value={fabRate} onChange={e => setFabRate(e.target.value)} placeholder="₹/m" style={{ width: 80, textAlign: 'right' }} /><span style={faint}>×</span><Input type="number" min={0} step="0.01" value={fabMtr} onChange={e => setFabMtr(e.target.value)} style={{ width: 70, textAlign: 'right' }} /><span className="text-[12px]" style={faint}>m/pc</span></span><span className="num">{fabricPc ? fmtMoney(Math.round(fabricPc * 100) / 100) : '—'}</span></div>}
            {HEADS.map(h => <div key={h} className="qf-row"><span>{h}</span><span><Input type="number" min={0} value={amts[h]} onChange={e => setAmts(x => ({ ...x, [h]: e.target.value }))} placeholder="₹" style={{ width: 90, textAlign: 'right' }} /></span><span className="num">{Number(amts[h]) ? fmtMoney(Number(amts[h])) : '—'}</span></div>)}
            <div className="qf-row qf-tot"><span>Price per piece <span className="text-[11.5px] font-normal" style={faint}>before GST</span></span><span></span><span className="num">{perPc ? fmtMoney(Math.round(perPc * 100) / 100) : '—'}</span></div>
            <div className="qf-row"><span style={soft}>For {pcs} pcs</span><span></span><span className="num" style={soft}>{value ? fmtMoney(Math.round(value)) : '—'}</span></div>
          </div>
          {lines.length > 1 && <div className="pt-2">
            {extras.map((e, k) => <div key={k} className="flex gap-1.5 items-center pb-1"><Select value={e.colour} onChange={c => setExtras(x => x.map((y, j) => j === k ? { ...y, colour: c } : y))} options={lines.map(l => ({ value: l.colour, label: l.colour }))} /><Input type="number" min={0} value={e.amount} onChange={ev => setExtras(x => x.map((y, j) => j === k ? { ...y, amount: ev.target.value } : y))} placeholder="₹ extra / pc" style={{ width: 110 }} /><button type="button" className="vlink" onClick={() => setExtras(x => x.filter((_, j) => j !== k))}>×</button></div>)}
            <button type="button" className="vlink text-[12px]" onClick={() => setExtras(x => [...x, { colour: lines[0].colour, amount: '' }])}>+ extra for one colour (special dye, wash…)</button>
          </div>}

          <div className="qf-grid pt-3">
            <Field label="Lead time (days from PO)"><Input type="number" min={1} value={lead} onChange={e => setLead(e.target.value)} placeholder="e.g. 40" /></Field>
            <Field label="Can start from"><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></Field>
            <Field label="Cloth: your preference"><Select value={cloth} onChange={x => setCloth(x as FabricBy | '')} options={[{ value: '', label: 'as BSC decides' }, ...(Object.keys(FABRIC_BY_LABEL) as FabricBy[]).map(k => ({ value: k, label: FABRIC_BY_LABEL[k] }))]} /></Field>
          </div>
          <div className="pt-2"><Field label="Note for BSC"><textarea className="input" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="capacity, MOQ, anything in the tech pack you want to flag" style={{ width: '100%', fontFamily: 'inherit', fontSize: 13 }} /></Field></div>
          <div className="flex gap-2 items-center pt-3"><Button variant="primary" disabled={!ok} onClick={submit}>{prev ? 'Update the quote' : 'Send the quote to BSC'}</Button>{!ok && <span className="text-[12px]" style={faint}>the cost heads and the lead time</span>}</div>
        </>}
      </div>
    </div>
  </div>, document.body);
}
