/* Vendors on the BOM (17 Nov 2026): category adds the BOM on the requirement; sourcing fills, against each line, who
   supplies it (BSC sources and sends, a vendor BSC nominates, or the factory), the vendor and the rate. Sourcing can
   put several options on a line; category picks one. The picked option is the line's supplied-by, vendor and rate. */
import { useState } from 'react';
import { useApp } from '../store';
import type { ProductionOrder, SuppliedBy } from '../domain/types';
import { fmtMoney } from '../domain/engines';
import { Button, Input, Select, Pill } from '../ui';
import { STATES, GST_RATES, BSC_STATE, defaultGstOf, gstSplit, stateOfPlace } from '../domain/invoicePdf';

const BY: Record<SuppliedBy, string> = { bsc: 'We source · BSC sends', nominated: 'Nominated vendor', factory: 'By the factory' };
const KIND = { fabric: 'Fabric', trim: 'Trims', packaging: 'Packaging' } as const;
const faint = { color: 'var(--ink-faint)' } as const;
const SAMPLE_VENDORS = { fabric: ['Soktas', 'Arvind Mills'], trim: ['Trimco Accessories', 'Movium'], packaging: ['Packwell', 'Trimco Accessories'] } as const;

export function BomVendors({ o, canDesign, canSourcing }: { o: ProductionOrder; canDesign: boolean; canSourcing: boolean }) {
  const { db, addBomOptions, removeBomOption, pickBomOptions } = useApp();
  const [addFor, setAddFor] = useState<number | null>(null);
  const [f, setF] = useState<{ by: SuppliedBy; vendor: string; rate: string; gst: string; state: string; code: string; note: string }>({ by: 'bsc', vendor: '', rate: '', gst: '5', state: BSC_STATE, code: '', note: '' });
  const pcs = o.orderQty; const qtyOf = (i: number) => { const l = o.bom[i]; return l.qtyPerPc != null ? Math.round(l.qtyPerPc * pcs * 100) / 100 : null; };
  const vendors = db.vendors.filter(v => v.kind.endsWith('mill') || v.kind === 'Trims').map(v => v.name);
  const open = (i: number) => { setAddFor(i); setF({ by: 'bsc', vendor: '', rate: o.bom[i].rate != null ? String(o.bom[i].rate) : '', gst: String(defaultGstOf(o.bom[i].kind)), state: BSC_STATE, code: '', note: '' }); };
  const save = () => { if (addFor == null) return; addBomOptions(o.id, [{ idx: addFor, opt: { suppliedBy: f.by, vendor: f.by === 'factory' ? null : (f.vendor.trim() || null), rate: f.rate === '' ? null : Number(f.rate), gstPct: Number(f.gst), state: f.state, code: f.code.trim() || null, note: f.note.trim() || null } }]); setAddFor(null); };
  /* prototype only: two believable options on every line that has none */
  const sample = () => addBomOptions(o.id, o.bom.flatMap((l, idx) => { if ((l.options ?? []).length || l.suppliedBy) return [];
    const base = l.rate ?? (l.kind === 'fabric' ? (o.pack?.fabric.rate ?? o.pack?.fabric.cpm ?? 240) : l.unit === 'pc' ? 3 : 30); const vs = SAMPLE_VENDORS[l.kind];
    return [{ idx, opt: { suppliedBy: 'bsc' as SuppliedBy, vendor: vs[0], rate: base, gstPct: defaultGstOf(l.kind), state: BSC_STATE, code: l.kind === 'fabric' ? `${vs[0].slice(0, 3).toUpperCase()}#${24000 + idx * 37 + pcs}` : null, note: 'in stock with the vendor' } },
      { idx, opt: l.kind === 'fabric' ? { suppliedBy: 'nominated' as SuppliedBy, vendor: vs[1], rate: Math.round(base * 0.94), gstPct: defaultGstOf(l.kind), state: 'Gujarat', code: `${vs[1].slice(0, 3).toUpperCase()}#${31000 + idx}`, note: 'factory raises its own PO · 12 days' } : { suppliedBy: 'factory' as SuppliedBy, vendor: null, rate: Math.round(base * 1.1 * 100) / 100, gstPct: defaultGstOf(l.kind), state: BSC_STATE, code: null, note: "factory's own supplier" } }]; }));
  const unpicked = o.bom.map((l, idx) => ({ l, idx })).filter(x => !x.l.suppliedBy && (x.l.options ?? []).length);
  const cheapest = () => pickBomOptions(o.id, unpicked.map(({ l, idx }) => ({ idx, optId: [...l.options!].sort((a, b) => (a.rate ?? 1e9) - (b.rate ?? 1e9))[0].id })));
  const noOpts = o.bom.filter(l => !l.suppliedBy && !(l.options ?? []).length).length;
  const total = o.bom.reduce((a, l, i) => a + (l.suppliedBy && l.rate != null && qtyOf(i) != null ? l.rate * qtyOf(i)! : 0), 0);
  /* the buyer is BSC when BSC sources, the factory otherwise; both sit in the same state for the split unless the factory is elsewhere */
  const buyerState = stateOfPlace(db.vendors.find(v => v.id === (o.vendorId ?? o.poApproval?.vendorId))?.location);
  const taxCell = (pct: number, state: string | null, amount: number | null) => { const g = gstSplit(amount ?? 0, pct, state, buyerState);
    return <td className="text-[11.5px]" style={{ whiteSpace: 'normal' }}><div>{g.label}{amount != null && pct ? <b className="mono"> {fmtMoney(Math.round(g.tax))}</b> : null}</div><div style={faint}>{state ?? 'state not given'}</div></td>; };
  const tax = o.bom.reduce((a, l, i) => a + (l.suppliedBy && l.rate != null && qtyOf(i) != null ? gstSplit(l.rate * qtyOf(i)!, l.gstPct ?? defaultGstOf(l.kind), l.vendorState, buyerState).tax : 0), 0);
  if (!o.bom.length) return <div className="text-[12.5px] py-2" style={{ color: 'var(--warn)' }}>Category adds the BOM first (part 5). Sourcing then fills the vendor against each line.</div>;
  return <div>
    <div className="flex items-center gap-2 flex-wrap pb-2">
      <Pill tone={noOpts ? 'warn' : 'good'}>{noOpts ? `${noOpts} line${noOpts === 1 ? '' : 's'} waiting on sourcing` : 'sourcing has filled every line'}</Pill>
      <Pill tone={unpicked.length ? 'warn' : 'good'}>{unpicked.length ? `${unpicked.length} line${unpicked.length === 1 ? '' : 's'} for category to pick` : 'nothing to pick'}</Pill>
      <span className="ml-auto flex gap-2">{canSourcing && noOpts > 0 && <Button size="sm" variant="ghost" onClick={sample}>Fill sample options</Button>}{canDesign && unpicked.length > 0 && <Button size="sm" onClick={cheapest}>Pick the lowest rate on every line</Button>}</span>
    </div>
    <div style={{ overflowX: 'auto' }}><table className="t compact bom-t bomv"><thead><tr><th>BOM line</th><th className="num">For {pcs} pcs</th><th>Supplied by</th><th>Vendor</th><th className="num">Rate ₹</th><th className="num">Cost ₹</th><th>GST · vendor state</th><th>Code · note</th><th></th></tr></thead>
      <tbody>{(['fabric', 'trim', 'packaging'] as const).flatMap(k => { const rows = o.bom.map((l, i) => ({ l, i })).filter(x => x.l.kind === k); if (!rows.length) return [];
        return [<tr key={k} className="grp"><td colSpan={9}>{KIND[k]}</td></tr>, ...rows.flatMap(({ l, i }) => { const opts = l.options ?? []; const q = qtyOf(i); const legacy = !!l.suppliedBy && !l.chosen;
          const head = (span: number) => <td rowSpan={span} style={{ whiteSpace: 'normal', verticalAlign: 'top' }}><div className="font-medium">{l.item || '—'}</div>{l.spec && <div className="text-[11.5px]" style={faint}>{l.spec}</div>}</td>;
          const qty = (span: number) => <td rowSpan={span} className="num" style={{ verticalAlign: 'top' }}>{q != null ? `${q.toLocaleString('en-IN')} ${l.unit}` : '—'}</td>;
          const adding = addFor === i; const showNone = !opts.length && !legacy && !canSourcing;
          const n = opts.length + (legacy && !opts.length ? 1 : 0) + (showNone ? 1 : 0) + (adding ? 1 : 0) + (canSourcing && !adding ? 1 : 0);
          const out = [];
          if (legacy && !opts.length) out.push(<tr key={`${i}-set`} className="bomv-on">{head(n)}{qty(n)}<td><Pill tone="good">{BY[l.suppliedBy!]}</Pill></td><td className="text-[12.5px]">{l.vendor ?? (l.suppliedBy === 'factory' ? <span style={faint}>factory's own</span> : '—')}</td><td className="num">{l.rate ?? '—'}</td><td className="num">{l.rate != null && q != null ? fmtMoney(Math.round(l.rate * q)) : '—'}</td>{taxCell(l.gstPct ?? defaultGstOf(l.kind), l.vendorState ?? null, l.rate != null && q != null ? l.rate * q : null)}<td className="text-[11.5px]" style={faint}>set on the BOM</td><td></td></tr>);
          else if (showNone) out.push(<tr key={`${i}-none`}>{head(n)}{qty(n)}<td colSpan={7} className="text-[12px]" style={{ color: 'var(--warn)' }}>sourcing to add the vendor</td></tr>);
          opts.forEach((op, k2) => { const on = l.chosen === op.id; out.push(<tr key={op.id} className={on ? 'bomv-on' : ''}>{k2 === 0 && head(n)}{k2 === 0 && qty(n)}
            <td><span className="flex items-center gap-1.5">{canDesign ? <button type="button" className={`dest-opt${on ? ' on' : ''}`} style={{ padding: '3px 9px', fontSize: 11.5 }} onClick={() => pickBomOptions(o.id, [{ idx: i, optId: op.id }])}><span className="dest-dot" />{on ? 'picked' : 'pick'}</button> : on ? <Pill tone="good">picked</Pill> : null}<span className="text-[12.5px]">{BY[op.suppliedBy]}</span></span></td>
            <td className="text-[12.5px]">{op.vendor ?? <span style={faint}>{op.suppliedBy === 'factory' ? "factory's own" : '—'}</span>}</td>
            <td className="num">{op.rate ?? '—'}</td><td className="num">{op.rate != null && q != null ? fmtMoney(Math.round(op.rate * q)) : '—'}</td>
            {taxCell(op.gstPct ?? defaultGstOf(l.kind), op.state ?? null, op.rate != null && q != null ? op.rate * q : null)}
            <td className="text-[11.5px]" style={{ ...faint, whiteSpace: 'normal' }}>{[op.code, op.note].filter(Boolean).join(' · ') || '—'}</td>
            <td>{canSourcing && !on && <button type="button" className="vlink text-[11.5px]" onClick={() => removeBomOption(o.id, i, op.id)}>remove</button>}</td></tr>); });
          if (adding) out.push(<tr key={`${i}-add`} className="bomv-add">{out.length === 0 && head(n)}{out.length === 0 && qty(n)}
            <td><Select value={f.by} onChange={v => setF(x => ({ ...x, by: v as SuppliedBy }))} options={(Object.keys(BY) as SuppliedBy[]).map(b => ({ value: b, label: BY[b] }))} /></td>
            <td><Input list="bomv-vendors" disabled={f.by === 'factory'} value={f.by === 'factory' ? '' : f.vendor} onChange={e => { const name = e.target.value; const v = db.vendors.find(y => y.name.toLowerCase() === name.toLowerCase()); setF(x => ({ ...x, vendor: name, state: v ? stateOfPlace(v.location) : x.state })); }} placeholder={f.by === 'factory' ? "factory's own" : 'vendor'} style={{ width: 150 }} /></td>
            <td className="num"><Input type="number" min={0} step="0.01" value={f.rate} onChange={e => setF(x => ({ ...x, rate: e.target.value }))} placeholder={`₹ / ${l.unit}`} style={{ width: 80 }} /></td>
            <td className="num">{f.rate !== '' && q != null ? fmtMoney(Math.round(Number(f.rate) * q)) : '—'}</td>
            <td><span className="flex gap-1"><Select value={f.gst} onChange={v => setF(x => ({ ...x, gst: v }))} options={GST_RATES.map(r => ({ value: String(r), label: `${r}%` }))} style={{ width: 70 }} /><Select value={f.state} onChange={v => setF(x => ({ ...x, state: v }))} options={STATES.map(st => ({ value: st, label: st }))} style={{ width: 130 }} /></span></td>
            <td><span className="flex gap-1"><Input value={f.code} onChange={e => setF(x => ({ ...x, code: e.target.value }))} placeholder="vendor code" style={{ width: 100 }} /><Input value={f.note} onChange={e => setF(x => ({ ...x, note: e.target.value }))} placeholder="ready by, lead time" style={{ width: 130 }} /></span></td>
            <td><span className="flex gap-1.5"><Button size="sm" variant="primary" disabled={f.by !== 'factory' && !f.vendor.trim()} onClick={save}>Add</Button><button type="button" className="vlink text-[11.5px]" onClick={() => setAddFor(null)}>cancel</button></span></td></tr>);
          else if (canSourcing) out.push(<tr key={`${i}-plus`}>{out.length === 0 && head(n)}{out.length === 0 && qty(n)}<td colSpan={7}><button type="button" className="vlink text-[11.5px]" style={opts.length || legacy ? undefined : { color: 'var(--warn)' }} onClick={() => open(i)}>+ {opts.length || legacy ? 'another option' : 'add the vendor'}</button></td></tr>);
          return out; })]; })}</tbody>
      <tfoot><tr><td colSpan={5} className="text-[12.5px]" style={{ textAlign: 'right' }}>Material cost on what is picked</td><td className="num font-semibold">{fmtMoney(Math.round(total))}</td><td className="text-[12px]">GST <b className="mono">{fmtMoney(Math.round(tax))}</b> · with GST <b className="mono">{fmtMoney(Math.round(total + tax))}</b></td><td colSpan={2}></td></tr></tfoot>
    </table></div>
    <datalist id="bomv-vendors">{[...new Set([...vendors, 'Movium'])].map(v => <option key={v} value={v} />)}</datalist>
    {!canDesign && !canSourcing && <div className="text-[11.5px] pt-1.5" style={faint}>Sourcing fills the options; category picks one per line.</div>}
  </div>;
}
