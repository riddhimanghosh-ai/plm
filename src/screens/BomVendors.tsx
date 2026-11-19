/* Vendors on the BOM (17 Nov 2026): category adds the BOM on the requirement; sourcing fills, against each line, who
   supplies it (BSC sources and sends, a vendor BSC nominates, or the factory), the vendor and the rate. Sourcing can
   put several options on a line; category picks one. The picked option is the line's supplied-by, vendor and rate. */
import { useState } from 'react';
import { useApp, useAppStore } from '../store';
import type { ProductionOrder, SuppliedBy, BomLine } from '../domain/types';
import { fmtMoney } from '../domain/engines';
import { Button, Input, Select, Pill } from '../ui';
import { BOM_MULTI_OPTIONS } from '../domain/edition';
import { STATES, GST_RATES, BSC_STATE, defaultGstOf, gstSplit, stateOfPlace } from '../domain/invoicePdf';
import { bomCostOf, bomOpenOf, bomCopyOf, bomSourcesOf } from '../domain/rtwPack';

const BY: Record<SuppliedBy, string> = { bsc: 'We source · BSC sends', nominated: 'Nominated vendor', factory: 'By the factory' };
const KIND = { fabric: 'Fabric', trim: 'Trims', packaging: 'Packaging' } as const;
const faint = { color: 'var(--ink-faint)' } as const;
const SAMPLE_VENDORS = { fabric: ['Soktas', 'Arvind Mills'], trim: ['Trimco Accessories', 'Movium'], packaging: ['Packwell', 'Trimco Accessories'] } as const;

export function BomVendors({ o, canDesign, canSourcing }: { o: ProductionOrder; canDesign: boolean; canSourcing: boolean }) {
  const { db, addBomOptions, removeBomOption, pickBomOptions } = useApp(); const store = useAppStore;
  const [addFor, setAddFor] = useState<number | null>(null); const [more, setMore] = useState(false);
  /* each group folds; fabric starts open, a group with a line still open starts open, a finished group starts closed */
  const [fold, setFold] = useState<Record<string, boolean>>({});
  const [f, setF] = useState<{ by: SuppliedBy; vendor: string; rate: string; gst: string; state: string; code: string; note: string }>({ by: 'bsc', vendor: '', rate: '', gst: '5', state: BSC_STATE, code: '', note: '' });
  const pcs = o.orderQty; const qtyOf = (i: number) => { const l = o.bom[i]; return l.qtyPerPc != null ? Math.round(l.qtyPerPc * pcs * 100) / 100 : null; };
  /* a line is settled when an option is picked, a supplier is set on it, or (older records) the requirement went out with the supplier the BOM derives */
  const bc = bomCostOf(db, o);
  const { legacyDone, open: openLines } = bomOpenOf(o);
  const legacyOf = (i: number) => { const l = o.bom[i]; return (l.options ?? []).length ? (!!l.suppliedBy && !l.chosen) : (!!l.suppliedBy || legacyDone); };
  const rateOf = (i: number) => { const l = o.bom[i]; return (l.options ?? []).length ? (l.suppliedBy ? l.rate : null) : legacyOf(i) ? (bc.rows[i]?.rate ?? null) : null; };
  const vendors = db.vendors.filter(v => v.kind.endsWith('mill') || v.kind === 'Trims').map(v => v.name);
  const open = (i: number) => { setAddFor(i); setF({ by: 'bsc', vendor: '', rate: o.bom[i].rate != null ? String(o.bom[i].rate) : '', gst: String(defaultGstOf(o.bom[i].kind)), state: BSC_STATE, code: '', note: '' }); };
  const save = (again: boolean) => { if (addFor == null) return; addBomOptions(o.id, [{ idx: addFor, opt: { suppliedBy: f.by, vendor: f.by === 'factory' ? null : (f.vendor.trim() || null), rate: f.rate === '' ? null : Number(f.rate), gstPct: Number(f.gst), state: f.state, code: f.code.trim() || null, note: f.note.trim() || null } }]); if (again) setF(x => ({ ...x, vendor: '', rate: '', code: '', note: '' })); else setAddFor(null); };
  /* prototype only: two believable options on every line that has none */
  const sample = () => addBomOptions(o.id, o.bom.flatMap((l, idx): { idx: number; opt: { suppliedBy: SuppliedBy; vendor: string | null; rate: number | null; gstPct?: number | null; state?: string | null; code?: string | null; note?: string | null } }[] => { if ((l.options ?? []).length || legacyOf(idx)) return [];
    const base = l.rate ?? (l.kind === 'fabric' ? (o.pack?.fabric.rate ?? o.pack?.fabric.cpm ?? 240) : l.unit === 'pc' ? 3 : 30); const vs = SAMPLE_VENDORS[l.kind];
    return [{ idx, opt: { suppliedBy: 'bsc' as SuppliedBy, vendor: vs[0], rate: base, gstPct: defaultGstOf(l.kind), state: BSC_STATE, code: l.kind === 'fabric' ? `${vs[0].slice(0, 3).toUpperCase()}#${24000 + idx * 37 + pcs}` : null, note: 'in stock with the vendor' } },
      { idx, opt: l.kind === 'fabric' ? { suppliedBy: 'nominated' as SuppliedBy, vendor: vs[1], rate: Math.round(base * 0.94), gstPct: defaultGstOf(l.kind), state: 'Gujarat', code: `${vs[1].slice(0, 3).toUpperCase()}#${31000 + idx}`, note: 'factory raises its own PO · 12 days' } : { suppliedBy: 'factory' as SuppliedBy, vendor: null, rate: Math.round(base * 1.1 * 100) / 100, gstPct: defaultGstOf(l.kind), state: BSC_STATE, code: null, note: "factory's own supplier" } }].slice(0, BOM_MULTI_OPTIONS ? 2 : 1); }));
  /* prototype only: put sample vendors on every open line and, for category, pick the lowest rate so the BOM is done in one click */
  const sampleFill = () => { sample(); if (!canDesign) return;
    const o2 = store.getState().db.orders.find(x => x.id === o.id); if (!o2) return;
    const picks = o2.bom.flatMap((l, idx) => !l.suppliedBy && (l.options ?? []).length ? [{ idx, optId: [...l.options!].sort((a, b) => (a.rate ?? 1e9) - (b.rate ?? 1e9))[0].id }] : []);
    if (picks.length) pickBomOptions(o.id, picks); };
  const unpicked = o.bom.map((l, idx) => ({ l, idx })).filter(x => !x.l.suppliedBy && (x.l.options ?? []).length);
  const cheapest = () => pickBomOptions(o.id, unpicked.map(({ l, idx }) => ({ idx, optId: [...l.options!].sort((a, b) => (a.rate ?? 1e9) - (b.rate ?? 1e9))[0].id })));
  const noOpts = o.bom.filter((l, i) => !legacyOf(i) && !(l.options ?? []).length).length;
  const total = o.bom.reduce((a, _l, i) => { const r = rateOf(i); return a + (r != null && qtyOf(i) != null ? r * qtyOf(i)! : 0); }, 0);
  /* the buyer is BSC when BSC sources, the factory otherwise; both sit in the same state for the split unless the factory is elsewhere */
  const buyerState = stateOfPlace(db.vendors.find(v => v.id === (o.vendorId ?? o.poApproval?.vendorId))?.location);
  const taxCell = (pct: number, state: string | null, amount: number | null) => { const g = gstSplit(amount ?? 0, pct, state, buyerState);
    return <td className="text-[11.5px] c-x" style={{ whiteSpace: 'normal' }}><div>{g.label}{amount != null && pct ? <b className="mono"> {fmtMoney(Math.round(g.tax))}</b> : null}</div><div style={faint}>{state ?? 'state not given'}</div></td>; };
  const tax = o.bom.reduce((a, l, i) => { const r = rateOf(i); return a + (r != null && qtyOf(i) != null ? gstSplit(r * qtyOf(i)!, l.gstPct ?? defaultGstOf(l.kind), l.vendorState, buyerState).tax : 0); }, 0);
  if (!o.bom.length) return <div className="text-[12.5px] py-2" style={{ color: 'var(--warn)' }}>Category adds the BOM first (part 5). Sourcing then fills the vendor against each line.</div>;
  return <div>
    <div className="flex items-center gap-2 flex-wrap pb-2">
      <span className="cap" style={{ margin: 0 }}>Vendors on each BOM line</span>
      {noOpts > 0 && <span title="Until every line has its vendor, the requirement cannot go to Production RTW and no invoice is generated."><Pill tone="warn">{noOpts} line{noOpts === 1 ? '' : 's'} waiting on sourcing · blocks the send</Pill></span>}
      {unpicked.length > 0 && <Pill tone="warn">{unpicked.length} line{unpicked.length === 1 ? '' : 's'} for category to pick</Pill>}
      <span className="ml-auto flex gap-2 items-center"><button type="button" className="bom-cols" onClick={() => setMore(v => !v)} aria-pressed={more}>{more ? '− fewer columns' : '+ per pc, GST, state, code'}</button>{(canSourcing || canDesign) && openLines.length > 0 && <Button size="sm" variant="ghost" onClick={sampleFill}>Sample fill{canDesign ? ' · vendors and picks' : ' · vendor options'}</Button>}{canDesign && unpicked.length > 0 && <Button size="sm" onClick={cheapest}>Pick the lowest rate on every line</Button>}</span>
    </div>

    <div style={{ overflowX: 'auto' }}><table className={`t compact bom-t bomv${more ? '' : ' lean'}`}><thead><tr><th>BOM line</th><th className="num c-x">Per pc</th><th className="num">For {pcs} pcs</th><th>Supplied by</th><th>Vendor</th><th className="num">Rate ₹</th><th className="num">Cost ₹</th><th className="c-x">GST · vendor state</th><th className="c-x">Code · note</th><th></th></tr></thead>
      <tbody>{(['fabric', 'trim', 'packaging'] as const).flatMap(k => { const rows = o.bom.map((l, i) => ({ l, i })).filter(x => x.l.kind === k); if (!rows.length) return [];
        const pend = rows.filter(x => !legacyOf(x.i) && !x.l.chosen && !x.l.suppliedBy).length; const sub = rows.reduce((a, x) => { const r0 = rateOf(x.i); const q0 = qtyOf(x.i); return a + (r0 != null && q0 != null ? r0 * q0 : 0); }, 0);
        const shut = fold[k] ?? (k !== 'fabric' && pend === 0 && addFor == null);
        return [<tr key={k} className={`grp bomv-grp g-${k}`} onClick={() => setFold(x => ({ ...x, [k]: !shut }))}><td colSpan={10}><span className="flex items-center gap-2"><span className="bomv-car">{shut ? '▸' : '▾'}</span><span className="bomv-dot" aria-hidden /><b>{KIND[k]}</b><span style={faint}>{rows.length} line{rows.length === 1 ? '' : 's'}{sub ? ` · ${fmtMoney(Math.round(sub))}` : ''}</span>{pend > 0 ? <Pill tone="warn">{pend} without a vendor</Pill> : <span style={{ color: 'var(--good)' }}>✓ every line has a vendor</span>}</span></td></tr>, ...(shut ? [] : rows).flatMap(({ l, i }) => { const opts = l.options ?? []; const q = qtyOf(i); const legacy = legacyOf(i); const r = bc.rows[i];
          const head = (span: number) => <td rowSpan={span} style={{ whiteSpace: 'normal', verticalAlign: 'top' }}><div className="font-medium">{l.item || '—'}</div>{l.spec && <div className="text-[11.5px]" style={faint}>{l.spec}</div>}</td>;
          const qty = (span: number) => <><td rowSpan={span} className="num c-x" style={{ verticalAlign: 'top' }}>{l.qtyPerPc != null ? `${l.qtyPerPc} ${l.unit}` : '—'}</td><td rowSpan={span} className="num" style={{ verticalAlign: 'top' }}>{q != null ? `${q.toLocaleString('en-IN')} ${l.unit}` : '—'}</td></>;
          const adding = addFor === i; const showNone = !opts.length && !legacy && !canSourcing;
          const n = opts.length + (legacy && !opts.length ? 1 : 0) + (showNone ? 1 : 0) + (adding ? 1 : 0) + (canSourcing && !adding && (BOM_MULTI_OPTIONS || (!opts.length && !legacy)) ? 1 : 0);
          const out = [];
          if (legacy && !opts.length) out.push(<tr key={`${i}-set`} className="bomv-on">{head(n)}{qty(n)}<td><Pill tone="good">{BY[l.suppliedBy ?? r.by]}</Pill></td><td className="text-[12.5px]">{l.vendor ?? r.vendor ?? ((l.suppliedBy ?? r.by) === 'factory' ? <span style={faint}>factory's own</span> : '—')}</td><td className="num">{r.rate ?? '—'}</td><td className="num">{r.rate != null && q != null ? fmtMoney(Math.round(r.rate * q)) : '—'}</td>{taxCell(l.gstPct ?? defaultGstOf(l.kind), l.vendorState ?? null, r.rate != null && q != null ? r.rate * q : null)}<td className="text-[11.5px] c-x" style={faint}>set on the BOM</td><td></td></tr>);
          else if (showNone) out.push(<tr key={`${i}-none`}>{head(n)}{qty(n)}{['supplied by', 'vendor', 'rate', 'cost', 'GST · state', 'code · note'].map(x => <td key={x} className={`bomv-blank${x === 'GST · state' || x === 'code · note' ? ' c-x' : ''}`}>{x}</td>)}<td className="text-[11px]" style={{ color: 'var(--warn)', whiteSpace: 'nowrap' }}>sourcing adds</td></tr>);
          opts.forEach((op, k2) => { const on = l.chosen === op.id; out.push(<tr key={op.id} className={on ? 'bomv-on' : ''}>{k2 === 0 && head(n)}{k2 === 0 && qty(n)}
            <td><span className="flex items-center gap-1.5">{canDesign ? <button type="button" className={`dest-opt${on ? ' on' : ''}`} style={{ padding: '3px 9px', fontSize: 11.5 }} onClick={() => pickBomOptions(o.id, [{ idx: i, optId: op.id }])}><span className="dest-dot" />{on ? 'picked' : 'pick'}</button> : on ? <Pill tone="good">picked</Pill> : null}<span className="text-[12.5px]">{BY[op.suppliedBy]}</span></span></td>
            <td className="text-[12.5px]">{op.vendor ?? <span style={faint}>{op.suppliedBy === 'factory' ? "factory's own" : '—'}</span>}</td>
            <td className="num">{op.rate ?? '—'}</td><td className="num">{op.rate != null && q != null ? fmtMoney(Math.round(op.rate * q)) : '—'}</td>
            {taxCell(op.gstPct ?? defaultGstOf(l.kind), op.state ?? null, op.rate != null && q != null ? op.rate * q : null)}
            <td className="text-[11.5px] c-x" style={{ ...faint, whiteSpace: 'normal' }}>{[op.code, op.note].filter(Boolean).join(' · ') || '—'}</td>
            <td>{canSourcing && !on && <button type="button" className="vlink text-[11.5px]" onClick={() => removeBomOption(o.id, i, op.id)}>remove</button>}</td></tr>); });
          if (adding) out.push(<tr key={`${i}-add`} className="bomv-add">{out.length === 0 && head(n)}{out.length === 0 && qty(n)}
            <td colSpan={7}><div className="bomv-form">
              <label><span>Supplied by</span><Select value={f.by} onChange={v => setF(x => ({ ...x, by: v as SuppliedBy }))} options={(Object.keys(BY) as SuppliedBy[]).map(b => ({ value: b, label: BY[b] }))} style={{ width: 190 }} /></label>
              <label><span>Vendor</span><Input list="bomv-vendors" disabled={f.by === 'factory'} value={f.by === 'factory' ? '' : f.vendor} onChange={e => { const name = e.target.value; const v = db.vendors.find(y => y.name.toLowerCase() === name.toLowerCase()); setF(x => ({ ...x, vendor: name, state: v ? stateOfPlace(v.location) : x.state })); }} placeholder={f.by === 'factory' ? "factory's own" : 'type or pick a vendor'} style={{ width: 180 }} /></label>
              <label><span>Rate ₹ / {l.unit}</span><Input type="number" min={0} step="0.01" value={f.rate} onChange={e => setF(x => ({ ...x, rate: e.target.value }))} style={{ width: 90 }} /></label>
              <label><span>GST</span><Select value={f.gst} onChange={v => setF(x => ({ ...x, gst: v }))} options={GST_RATES.map(r => ({ value: String(r), label: `${r}%` }))} style={{ width: 76 }} /></label>
              <label><span>Vendor state</span><Select value={f.state} onChange={v => setF(x => ({ ...x, state: v }))} options={STATES.map(st => ({ value: st, label: st }))} style={{ width: 150 }} /></label>
              <label><span>Vendor code</span><Input value={f.code} onChange={e => setF(x => ({ ...x, code: e.target.value }))} style={{ width: 110 }} /></label>
              <label style={{ flex: '1 1 150px' }}><span>Note</span><Input value={f.note} onChange={e => setF(x => ({ ...x, note: e.target.value }))} placeholder="ready by, lead time" /></label>
              <span className="bomv-acts">{f.rate !== '' && q != null && <span className="text-[12px]" style={faint}>cost {fmtMoney(Math.round(Number(f.rate) * q))}</span>}
                <Button size="sm" variant="primary" disabled={f.by !== 'factory' && !f.vendor.trim()} onClick={() => save(false)}>{BOM_MULTI_OPTIONS ? 'Add this option' : 'Add the vendor'}</Button>
                {BOM_MULTI_OPTIONS && <Button size="sm" disabled={f.by !== 'factory' && !f.vendor.trim()} onClick={() => save(true)}>Add and add another</Button>}
                <button type="button" className="vlink text-[11.5px]" onClick={() => setAddFor(null)}>cancel</button></span>
            </div></td></tr>);
          else if (canSourcing && (BOM_MULTI_OPTIONS || (!opts.length && !legacy))) out.push(<tr key={`${i}-plus`}>{out.length === 0 && head(n)}{out.length === 0 && qty(n)}<td colSpan={7}><button type="button" className={`bomv-addbtn${opts.length || legacy ? ' more' : ''}`} onClick={() => open(i)}>+ {opts.length || legacy ? 'Another vendor option' : 'Add vendor'}</button>{(opts.length > 0) && <span className="text-[11.5px] pl-2" style={faint}>{opts.length} option{opts.length === 1 ? '' : 's'} · category picks one</span>}</td></tr>);
          return out; })]; })}</tbody>
      <tfoot><tr><td colSpan={more ? 6 : 5} className="text-[12.5px]" style={{ textAlign: 'right' }}>Material cost on what is picked</td><td className="num font-semibold">{fmtMoney(Math.round(total))}</td><td className="text-[12px]">GST <b className="mono">{fmtMoney(Math.round(tax))}</b> · with GST <b className="mono">{fmtMoney(Math.round(total + tax))}</b></td>{more && <td colSpan={2}></td>}</tr></tfoot>
    </table></div>
    <datalist id="bomv-vendors">{[...new Set([...vendors, 'Movium'])].map(v => <option key={v} value={v} />)}</datalist>
    {!canDesign && !canSourcing && <div className="text-[11.5px] pt-1.5" style={faint}>Sourcing fills the options; category picks one per line.</div>}
  </div>;
}

/* pick any style and start this BOM from its lines; the same category is listed first */
export function CopyBomPicker({ category, excludeId, onPick, note }: { category: string; excludeId?: string | null; onPick: (lines: BomLine[], from: string) => void; note?: string }) {
  const { db } = useApp(); const [id, setId] = useState('');
  const { same, other } = bomSourcesOf(db, category, excludeId);
  const label = (x: ProductionOrder) => `${x.styleName} · ${x.bom.length} lines${x.poNo ? ` · ${x.poNo}` : ''}`;
  const groups = [...(same.length ? [{ label: `Same category · ${category}`, options: same.map(x => ({ value: x.id, label: label(x) })) }] : []),
    ...[...new Set(other.map(x => x.category))].map(c => ({ label: c, options: other.filter(x => x.category === c).map(x => ({ value: x.id, label: label(x) })) }))];
  const src = db.orders.find(x => x.id === id) ?? null;
  return <div className="bom-copy">
    <span className="text-[12.5px] font-medium">Start from another style</span>
    <Select value={id} onChange={setId} groups={[{ label: 'Pick a style', options: [{ value: '', label: 'pick a style, any category' }] }, ...groups]} style={{ minWidth: 260, maxWidth: 380 }} />
    <Button size="sm" disabled={!src} onClick={() => { if (src) { onPick(bomCopyOf(db, src), src.styleName); setId(''); } }}>Copy its BOM</Button>
    <span className="text-[11.5px]" style={faint}>{note ?? 'trims and packaging come with their vendor and rate; the cloth line with its consumption only'}</span>
  </div>;
}
