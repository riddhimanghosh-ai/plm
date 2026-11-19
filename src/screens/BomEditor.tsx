/* The bill of materials, built on the record instead of attached as a file.
   Design picks each trim and packaging line from the trims master, so the
   same names run through stock, the trim card and the COGS sheet, and every
   line shows at once whether the unit holds enough for this order. */
import { useState } from 'react';
import { useApp } from '../store';
import type { BomLine, TrimItem } from '../domain/types';
import { trimCoverageOf } from '../domain/engines';
import { Button, Input, Pill } from '../ui';

const KIND_LABEL = { fabric: 'Fabric', trim: 'Trims', packaging: 'Packaging' } as const;

export function masterFor(trims: TrimItem[], item: string) {
  const k = item.trim().toLowerCase();
  return k ? trims.find(t => t.name.toLowerCase() === k) ?? null : null;
}

/** One line's standing against the trims master and the unit's stock. */
export function lineStatus(trims: TrimItem[], db: Parameters<typeof trimCoverageOf>[0], l: BomLine, orderQty: number) {
  if (l.kind === 'fabric') return { tone: 'neutral' as const, text: 'the cloth — sourced against the fabric brief' };
  const t = masterFor(trims, l.item);
  if (!t) return { tone: 'warn' as const, text: 'not on the trims master — add it there, or pick a master item' };
  const c = trimCoverageOf(db, t);
  const need = l.qtyPerPc ? Math.ceil(l.qtyPerPc * orderQty) : null;
  if (need == null) return { tone: 'neutral' as const, text: `${c.available.toLocaleString('en-IN')} ${t.unit} free at the unit` };
  if (c.available >= need) return { tone: 'good' as const, text: `covers the order · ${c.available.toLocaleString('en-IN')} ${t.unit} free, ${need.toLocaleString('en-IN')} needed` };
  const short = need - c.available;
  return { tone: 'risk' as const, text: `short by ${short.toLocaleString('en-IN')} ${t.unit}${c.incoming ? ` · ${c.incoming.toLocaleString('en-IN')} on order` : ' · nothing on order'} — sourcing buys the rest` };
}

const SUP = { bsc: 'BSC', nominated: 'Nominated', factory: 'Factory' } as const;
const STOCK_SHORT = { good: 'in stock', risk: 'short', warn: 'not on master', neutral: '' } as const;
/* 19 Nov 2026: the BOM is still a form, laid out as the BOM sheet: one ruled row per material, typed in place.
   Sourcing's columns (supplier, vendor, rate) show beside each line, faded, until sourcing fills them. */
export function BomEditor({ lines, onChange, orderQty, editable = true, sourcingCols }: { lines: BomLine[]; onChange: (l: BomLine[]) => void; orderQty: number; editable?: boolean; sourcingCols?: boolean }) {
  const { db } = useApp();
  const trims = db.trims ?? [];
  const [pick, setPick] = useState('');
  const upd = (i: number, patch: Partial<BomLine>) => onChange(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => onChange(lines.filter((_, k) => k !== i));
  const addFromMaster = (name: string) => { const t = masterFor(trims, name); if (!t) return; if (lines.some(l => l.item.toLowerCase() === t.name.toLowerCase())) return;
    onChange([...lines, { kind: t.kind, item: t.name, spec: null, qtyPerPc: t.kind === 'trim' && t.name === 'Button' ? 12 : 1, unit: t.unit }]); setPick(''); };
  const order = (['fabric', 'trim', 'packaging'] as const).flatMap(k => lines.map((l, i) => ({ l, i })).filter(x => x.l.kind === k));
  const notOnMaster = lines.filter(l => l.kind !== 'fabric' && !masterFor(trims, l.item)).length;
  const short = lines.filter(l => lineStatus(trims, db, l, orderQty).tone === 'risk').length;
  const num = (v: string) => (v === '' ? null : Number(v));
  const faded = (v: string | number | null | undefined) => v == null || v === '' ? <span className="bom-src-empty">sourcing adds</span> : v;
  const cols = 9 + (sourcingCols ? 3 : 0) + (editable ? 1 : 0);
  return <div>
    <div className="flex gap-2 flex-wrap pb-2 text-[12px]">
      <Pill tone={notOnMaster ? 'warn' : 'good'}>{notOnMaster ? `${notOnMaster} line${notOnMaster === 1 ? '' : 's'} not on the trims master` : 'every trim is on the master'}</Pill>
      <Pill tone={short ? 'risk' : 'good'}>{short ? `${short} line${short === 1 ? '' : 's'} short at the unit for ${orderQty} pcs` : `stock covers ${orderQty} pcs`}</Pill>
      <span className="text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>quantities are optional now; they are completed once a factory quotes</span>
    </div>
    <div className="bom-sheet"><div className="bom-sheet-title" style={{ borderTop: 0 }}>Bill of materials</div>
    <div style={{ overflowX: 'auto' }}><table className="bom-sheet-t bom-form-t">
      <thead><tr><th>No.</th><th>Type</th><th>Item</th><th>Description</th><th className="num">Qty / pc</th><th>UOM</th><th className="num">Extra %</th><th className="num">For {orderQty} pcs</th><th>Stock</th>
        {sourcingCols && <><th>Supplier</th><th>Vendor</th><th className="num">Rate ₹</th></>}{editable && <th></th>}</tr></thead>
      <tbody>{order.map(({ l, i }, n) => { const st = lineStatus(trims, db, l, orderQty); const need = l.qtyPerPc != null ? Math.ceil(l.qtyPerPc * (1 + (l.wastagePct ?? 0) / 100) * orderQty) : null;
        return <tr key={i} className={`k-${l.kind}`}>
          <td className="c">{n + 1}</td>
          <td>{editable && l.kind !== 'fabric' ? <select className="bom-cell" value={l.kind} onChange={e => upd(i, { kind: e.target.value as BomLine['kind'] })}><option value="trim">Trim</option><option value="packaging">Packaging</option></select> : <span className="bom-kind">{KIND_LABEL[l.kind]}</span>}</td>
          <td className="b">{editable && l.kind !== 'fabric' ? <input className="bom-cell" list="trims-master" value={l.item} onChange={e => upd(i, { item: e.target.value })} placeholder="from the trims master" /> : l.item}</td>
          <td>{editable ? <input className="bom-cell" value={l.spec ?? ''} placeholder="size, finish, colour" onChange={e => upd(i, { spec: e.target.value || null })} /> : (l.spec ?? '')}</td>
          <td className="num">{editable ? <input className="bom-cell num" type="number" step="0.01" min={0} value={l.qtyPerPc ?? ''} placeholder="—" onChange={e => upd(i, { qtyPerPc: num(e.target.value) })} /> : (l.qtyPerPc ?? '—')}</td>
          <td>{editable ? <input className="bom-cell sm" value={l.unit} onChange={e => upd(i, { unit: e.target.value })} /> : l.unit}</td>
          <td className="num">{editable ? <input className="bom-cell num sm" type="number" step="0.5" min={0} value={l.wastagePct ?? ''} placeholder="—" onChange={e => upd(i, { wastagePct: num(e.target.value) })} /> : (l.wastagePct != null ? `${l.wastagePct}%` : '—')}</td>
          <td className="num">{need != null ? `${need.toLocaleString('en-IN')} ${l.unit}` : '—'}</td>
          <td title={st.text}><span className={`bom-stock ${st.tone}`}>{STOCK_SHORT[st.tone] || (l.kind === 'fabric' ? 'cloth' : 'free')}</span>{st.tone === 'warn' && <a className="vlink text-[11px] ml-1" href="#/fabrics?tab=trims">master →</a>}</td>
          {sourcingCols && <><td>{l.suppliedBy ? SUP[l.suppliedBy] : faded(null)}</td><td>{faded(l.vendor)}</td><td className="num">{faded(l.rate)}</td></>}
          {editable && <td className="c">{l.kind !== 'fabric' && <button type="button" className="bom-x" onClick={() => remove(i)} aria-label={`remove ${l.item}`} title="remove the line">×</button>}</td>}
        </tr>; })}
        {order.length === 0 && <tr><td colSpan={cols} className="c" style={{ padding: 12 }}>No lines yet. Add from the trims master below.</td></tr>}
      </tbody>
      {editable && <tfoot><tr><td colSpan={cols}><div className="flex gap-2 items-center flex-wrap">
        <input className="bom-cell" style={{ width: 260 }} list="trims-master" value={pick} onChange={e => setPick(e.target.value)} placeholder="add a line from the trims master…" onKeyDown={e => { if (e.key === 'Enter') addFromMaster(pick); }} />
        <Button size="sm" disabled={!masterFor(trims, pick)} onClick={() => addFromMaster(pick)}>+ Add from master</Button>
        <Button size="sm" variant="ghost" onClick={() => onChange([...lines, { kind: 'trim', item: '', spec: null, qtyPerPc: null, unit: 'pc' }])}>+ blank line</Button>
      </div></td></tr></tfoot>}
    </table></div></div>
    {editable && <datalist id="trims-master">{trims.map(t => <option key={t.id} value={t.name}>{t.kind} · {t.stock.toLocaleString('en-IN')} {t.unit} at the unit</option>)}</datalist>}
  </div>;
}
