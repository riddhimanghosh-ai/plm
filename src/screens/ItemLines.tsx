/* Every item for the PO, at the factory (25 Nov 2026).
   One table of every BOM line (cloth, trims, packaging): how much the PO needs, who gets it to the factory
   (BSC sends it through Desai · the factory buys it from BSC's nominated vendor · the factory's own) and where it is.
   The factory and its merchandiser see what is coming and what they still have to order; the merchandiser logs
   the factory's side on its behalf: its PO and due date, then what landed. Anything short asks category for a new cut ratio. */
import { useState } from 'react';
import { useApp } from '../store';
import type { ProductionOrder, SuppliedBy } from '../domain/types';
import { fmtDate } from '../domain/engines';
import { itemLinesOf, factoryBuyOf, packOf, WHO_LABEL, type ItemState } from '../domain/rtwPack';
import { Section, Pill, Button, Field, Input, Seg, fromDateInput, dateInput, type Tone } from '../ui';
import { ActsBy } from './Who';

const STATE: Record<ItemState, { tone: Tone; word: string }> = {
  'to-order': { tone: 'warn', word: 'to order' }, 'with-desai': { tone: 'warn', word: 'with Desai' }, ordered: { tone: 'info', word: 'ordered' },
  sent: { tone: 'info', word: 'on the way' }, late: { tone: 'risk', word: 'late' }, received: { tone: 'good', word: 'at the factory' }, short: { tone: 'risk', word: 'short' } };
const WHO_CLASS: Record<SuppliedBy, string> = { bsc: 'role-materials', nominated: 'role-sourcing', factory: 'role-production' };
const KIND: Record<string, string> = { fabric: 'Cloth', trim: 'Trim', packaging: 'Packaging' };

export function ItemLinesSection({ o, merchant }: { o: ProductionOrder; merchant: boolean }) {
  const { db, logFactoryBuy, receiveMaterial, askCutRatio } = useApp();
  const rows = itemLinesOf(o); const p = packOf(o);
  const [show, setShow] = useState<'all' | 'coming' | 'in'>('all');
  const [open, setOpen] = useState<number | null>(null);
  const [f, setF] = useState({ poNo: '', orderedOn: '', expectedOn: '', receivedOn: '', receivedQty: '', note: '' });
  const faint = { color: 'var(--ink-faint)' } as const;
  const atFactory = rows.filter(r => r.state === 'received').length; const short = rows.filter(r => r.state === 'short');
  const openCr = (o.cutRatios ?? []).some(c => !c.given);
  const groups = (['bsc', 'nominated', 'factory'] as SuppliedBy[]).map(w => ({ w, rs: rows.filter(r => r.who === w) })).filter(g => g.rs.length);
  const shown = rows.filter(r => show === 'all' ? true : show === 'in' ? r.state === 'received' : r.state !== 'received');
  const edit = (idx: number) => { const fb = factoryBuyOf(o, idx); const r = rows.find(x => x.idx === idx)!;
    setF({ poNo: fb?.poNo ?? '', orderedOn: dateInput(fb?.orderedOn), expectedOn: dateInput(fb?.expectedOn), receivedOn: dateInput(fb?.receivedOn), receivedQty: fb?.receivedQty != null ? String(fb.receivedQty) : String(r.need), note: fb?.note ?? '' }); setOpen(open === idx ? null : idx); };
  const fabVendor = db.vendors.find(v => v.id === p.fabric.vendorId)?.name ?? null;

  return <Section title={`Every item for ${o.poNo} · who gets it to the factory`} collapsible={false} right={<span className="flex gap-2 items-center">{short.length > 0 && <Pill tone="risk">{short.length} short</Pill>}<Pill tone={atFactory === rows.length ? 'good' : 'warn'}>{atFactory} of {rows.length} at the factory</Pill></span>}>
    <div className="il-groups">
      {groups.map(g => { const done = g.rs.filter(r => r.state === 'received').length; const todo = g.rs.filter(r => r.state === 'to-order' || r.state === 'with-desai').length;
        return <div key={g.w} className={`il-group ${WHO_CLASS[g.w]}`}>
          <span className={`pill ${WHO_CLASS[g.w]}`}>{WHO_LABEL[g.w]}</span>
          <b>{g.rs.length} item{g.rs.length === 1 ? '' : 's'}</b>
          <span style={faint}>{done} at the factory{todo ? ` · ${todo} ${g.w === 'bsc' ? 'not sent yet' : 'not ordered yet'}` : ''}</span>
        </div>; })}
    </div>
    <div className="flex items-center gap-2 py-2 flex-wrap"><Seg value={show} onChange={setShow} options={[{ id: 'all', label: 'Every item', count: rows.length }, { id: 'coming', label: 'Still to come', count: rows.length - atFactory }, { id: 'in', label: 'At the factory', count: atFactory }]} />
      <span className="text-[12px] ml-auto" style={faint}>{merchant ? 'Log the factory\'s order and what landed on its behalf.' : 'The merchandiser logs the factory\'s side.'}</span></div>
    <div style={{ overflowX: 'auto' }}><table className="t compact il-table">
      <thead><tr><th style={{ width: '30%' }}>Item</th><th className="num" style={{ width: '14%' }}>Needed for the PO</th><th style={{ width: '24%' }}>Who gets it to the factory</th><th>Where it is</th></tr></thead>
      <tbody>{shown.map(r => { const st = STATE[r.state]; const isOpen = open === r.idx; const fb = factoryBuyOf(o, r.idx);
        const vendor = r.l.kind === 'fabric' && r.who === 'nominated' ? [r.vendor ?? fabVendor, p.fabric.vendorFabricCode, p.fabric.blockedMetres != null ? `${p.fabric.blockedMetres} m blocked` : null].filter(Boolean).join(' · ') : r.vendor;
        const colours = r.l.kind === 'fabric' && (o.poFabrics ?? []).length > 0;   // cloth by colour is counted in on the colours table above
        const canLog = merchant && o.status !== 'Closed' && r.state !== 'received' && r.state !== 'short' && (r.who !== 'bsc' || r.state === 'sent') && !(colours && r.state !== 'to-order');
        return [<tr key={r.idx} className={`il-row il-${r.state}${isOpen ? ' il-open' : ''}`}>
          <td><div className="flex items-center gap-2"><span className="il-kind">{KIND[r.l.kind] ?? r.l.kind}</span><b className="text-[13px]">{r.l.item}</b></div>{r.l.spec && <div className="text-[11.5px] pt-0.5" style={faint}>{r.l.spec}</div>}</td>
          <td className="num">{r.need > 0 ? <><b>{r.need.toLocaleString('en-IN')}</b> {r.unit}<div className="text-[11px]" style={faint}>{r.l.kind === 'fabric' && (o.poFabrics ?? []).length ? `${(o.poFabrics ?? []).length} colours` : `${r.l.qtyPerPc} ${r.unit}/pc`}</div></> : <span className="text-[12px]" style={faint}>as per the BOM</span>}</td>
          <td><span className={`pill ${WHO_CLASS[r.who]}`}>{WHO_LABEL[r.who]}</span>{vendor && <div className="text-[11.5px] pt-1" style={faint}>from {vendor}</div>}</td>
          <td><div className="flex items-center gap-2 flex-wrap"><Pill tone={st.tone}>{st.word}</Pill><span className="text-[12.5px]">{r.label}</span></div>
            <div className="text-[11.5px] pt-0.5" style={faint}>{[r.on && r.state !== 'ordered' && r.state !== 'late' ? fmtDate(r.on) : null, fb?.receivedOn && r.who !== 'bsc' && fb.poNo ? `factory PO ${fb.poNo}` : null, r.detail].filter(Boolean).join(' · ')}</div>
            {r.state === 'short' && <div className="text-[11.5px] pt-0.5" style={{ color: 'var(--risk)' }}>{r.need - (r.got ?? 0)} {r.unit} short{openCr ? ' · new cut ratio asked' : ''}</div>}
          <div className="pt-1">{canLog ? <Button size="sm" variant={isOpen ? 'ghost' : undefined} onClick={() => edit(r.idx)}>{isOpen ? 'Close' : r.who === 'bsc' ? 'Count it in' : r.state === 'to-order' ? 'Log the order' : 'Log received'}</Button>
            : r.state === 'short' && merchant && !openCr ? <Button size="sm" onClick={() => { const k = Math.max(0, Math.min(1, (r.got ?? 0) / Math.max(1, r.need))); askCutRatio(o.id, `${r.l.item} short at the factory: ${r.got} of ${r.need} ${r.unit}`, 'cut-short', o.sizeBreakup.map(x => ({ size: x.size, qty: Math.floor(x.qty * k) })), r.l.kind === 'fabric' ? 'fabric-short' : 'trim-short'); }}>Ask for a new cut ratio</Button> : null}</div></td>
        </tr>,
        isOpen && <tr key={`${r.idx}-e`} className="il-edit"><td colSpan={4}>
          {r.who !== 'bsc' && <div className="grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <Field label="Factory's PO no."><Input value={f.poNo} onChange={e => setF({ ...f, poNo: e.target.value })} placeholder="FPO-712" /></Field>
            <Field label="Ordered on"><Input type="date" value={f.orderedOn} onChange={e => setF({ ...f, orderedOn: e.target.value })} /></Field>
            <Field label="Due at the factory"><Input type="date" value={f.expectedOn} onChange={e => setF({ ...f, expectedOn: e.target.value })} /></Field>
          </div>}
          <div className="grid gap-x-3 gap-y-1 pt-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <Field label="Received on"><Input type="date" value={f.receivedOn} onChange={e => setF({ ...f, receivedOn: e.target.value })} /></Field>
            <Field label={`Received (${r.unit})`} hint={`${r.need} needed`}><Input type="number" value={f.receivedQty} onChange={e => setF({ ...f, receivedQty: e.target.value })} /></Field>
            <div style={{ gridColumn: 'span 2' }}><Field label="Note"><Input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="lot, shade, anything short" /></Field></div>
          </div>
          <div className="flex gap-2 pt-1">
            {r.who !== 'bsc' && !f.receivedOn && <Button size="sm" variant="primary" disabled={!f.orderedOn} onClick={() => { logFactoryBuy(o.id, r.idx, { poNo: f.poNo.trim() || null, orderedOn: fromDateInput(f.orderedOn), expectedOn: fromDateInput(f.expectedOn), note: f.note.trim() || null }); setOpen(null); }}>Save the order</Button>}
            <Button size="sm" variant={f.receivedOn ? 'primary' : undefined} disabled={!f.receivedOn || f.receivedQty === ''} onClick={() => { const q = Number(f.receivedQty) || 0;
              if (r.who === 'bsc') receiveMaterial(o.id, r.idx, q >= r.need ? 'ok' : 'fail', q, f.note.trim());
              else logFactoryBuy(o.id, r.idx, { poNo: f.poNo.trim() || null, orderedOn: fromDateInput(f.orderedOn) ?? fromDateInput(f.receivedOn), expectedOn: fromDateInput(f.expectedOn), receivedOn: fromDateInput(f.receivedOn), receivedQty: q, note: f.note.trim() || null });
              setOpen(null); }}>Received at the factory</Button>
          </div>
        </td></tr>]; })}</tbody>
    </table></div>
    {!merchant && rows.some(r => r.state !== 'received') && <div className="pt-2"><ActsBy role="merchandiser" does="logs the factory's orders and what lands at the factory" /></div>}
  </Section>;
}
