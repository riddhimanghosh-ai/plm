/* BOM and COGS — the tech pack's material list and the New Cogs Working sheet,
   computed on the record instead of retyped per season. Design owns
   the BOM; Sourcing owns the cost inputs; the FOB production closes wins. */
import { useState } from 'react';
import { useApp } from '../store';
import type { BomLine, Costing, ProductionOrder } from '../domain/types';
import { costingOf, fmtMoney, fmtDate } from '../domain/engines';
import { DISCOUNT_BAU, DISCOUNT_ADDITIONAL } from '../domain/reference';
import { Section, Pill, Button, Input, KV, Note } from '../ui';
import { bomCostOf } from '../domain/rtwPack';
import { SupplyInvoiceBar } from './InvoicePreview';
import { BomEditor } from './BomEditor';
import { CopyBomPicker } from './BomVendors';
import { ActsBy, OwnerPill } from './Who';

const KIND_LABEL: Record<BomLine['kind'], string> = { fabric:'Fabric', trim:'Trim card', packaging:'Packaging' };

/* summary: on the requirement the vendors table below already lists every line, so the BOM shows its totals and the edit, not the same lines again */
export function BomSection({ o, editable, open, summary }: { o: ProductionOrder; editable: boolean; open?: boolean; summary?: boolean }) {
  const { db, updateBom } = useApp();
  const bc = bomCostOf(db, o);
  const [lines, setLines] = useState<BomLine[]>(o.bom);
  const [editing, setEditing] = useState(false);
  const c = costingOf(o);
  const upd = (i: number, patch: Partial<BomLine>) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const groups = (['fabric', 'trim', 'packaging'] as const).map(k => ({ k, rows: (editing ? lines : o.bom).map((l, i) => ({ l, i })).filter(x => x.l.kind === k) }));
  return (
    <Section title={summary ? `BOM · ${o.bom.length} lines · the lines and their vendors are below` : `BOM · ${o.bom.length} lines`} defaultOpen={open} right={<div className="flex gap-2 items-center"><OwnerPill editable={editable} owner="Design" />{!editable && <ActsBy role="design" does="edits the BOM" inline />}{editable && !editing && <Button size="sm" onClick={() => { setLines(o.bom); setEditing(true); }}>Edit</Button>}</div>}>
      {!editing && summary && editable && !o.poNo && <CopyBomPicker category={o.category} excludeId={o.id} note="replaces this BOM; trims and packaging come with their vendor and rate" onPick={(ls, from) => { if (window.confirm(`Replace this BOM with the ${ls.length} lines of ${from}?`)) updateBom(o.id, ls); }} />}
      {!editing && summary && <div className="bom-sum">
        <div><span>Material cost</span><b>{fmtMoney(bc.total)}</b><i>{fmtMoney(Math.round(bc.perPc))} per piece · {bc.pcs} pcs</i></div>
        <div><span>Sent by BSC</span><b>{fmtMoney(bc.bsc)}</b><i>{bc.rows.filter(r => r.by === 'bsc').length} lines</i></div>
        <div><span>Nominated by BSC</span><b>{fmtMoney(bc.nominated)}</b><i>{bc.rows.filter(r => r.by === 'nominated').length} lines</i></div>
        <div><span>By the factory</span><b>{fmtMoney(bc.factory)}</b><i>{bc.rows.filter(r => r.by === 'factory').length} lines</i></div>
        {c.fabricMetres != null && <div><span>Fabric for the order</span><b>{c.fabricMetres} {o.bom[0]?.unit ?? 'm'}</b><i>{o.costing.consumption} × {o.orderQty} pcs</i></div>}
        {bc.unpriced > 0 && <div><span>Without a rate</span><b style={{ color: 'var(--warn)' }}>{bc.unpriced}</b><i>line{bc.unpriced === 1 ? '' : 's'}</i></div>}
      </div>}
      {editing ? <BomEditor lines={lines} onChange={setLines} orderQty={o.orderQty} /> : summary ? null : <div style={{ overflowX: 'auto' }}><table className="t compact bom-t">
        <thead><tr><th>Item</th><th className="num">Per pc</th><th className="num">For {bc.pcs} pcs</th><th>Supplied by</th><th>Vendor</th><th className="num">Rate ₹</th><th className="num">Cost ₹</th></tr></thead>
        <tbody>{groups.map(g => g.rows.length > 0 && [
          <tr key={g.k} className="bom-g"><td colSpan={7}>{KIND_LABEL[g.k]}</td></tr>,
          ...g.rows.map(({ i }) => { const r = bc.rows[i]; const l = r.l; return <tr key={i}>
            <td style={{ whiteSpace: 'normal' }}><span className="font-medium">{l.item}</span>{l.spec && <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{l.spec}</div>}</td>
            <td className="num">{l.qtyPerPc != null ? `${l.qtyPerPc} ${l.unit}` : '—'}</td>
            <td className="num">{r.qty != null ? `${r.qty.toLocaleString('en-IN')} ${l.unit}` : '—'}</td>
            <td><span className={`pill sup-${r.by}`}>{r.by === 'bsc' ? 'sent by BSC' : r.by === 'nominated' ? 'nominated by BSC' : 'by the factory'}</span></td>
            <td className="text-[12px]">{r.vendor ?? <span style={{ color: 'var(--ink-faint)' }}>{r.by === 'factory' ? "factory's own" : '—'}</span>}</td>
            <td className="num">{r.rate != null ? r.rate : <span style={{ color: 'var(--ink-faint)' }}>—</span>}</td>
            <td className="num">{r.cost != null ? fmtMoney(r.cost) : <span style={{ color: 'var(--ink-faint)' }}>—</span>}</td></tr>; })])}</tbody>
        <tfoot><tr><td colSpan={6} className="text-[12.5px]" style={{ textAlign: 'right' }}>Material cost for the order{bc.unpriced ? ` · ${bc.unpriced} line${bc.unpriced === 1 ? '' : 's'} without a rate` : ''}</td><td className="num font-semibold">{fmtMoney(bc.total)}</td></tr>
          <tr><td colSpan={6} className="text-[12px]" style={{ textAlign: 'right', color: 'var(--ink-soft)' }}>per piece</td><td className="num">{fmtMoney(Math.round(bc.perPc))}</td></tr></tfoot>
      </table></div>}
      {!editing && !summary && <div className="flex gap-4 flex-wrap text-[12.5px] pt-2"><span><span style={{ color: 'var(--ink-faint)' }}>Sent by BSC </span><b>{fmtMoney(bc.bsc)}</b></span><span><span style={{ color: 'var(--ink-faint)' }}>Nominated by BSC </span><b>{fmtMoney(bc.nominated)}</b></span><span><span style={{ color: 'var(--ink-faint)' }}>By the factory </span><b>{fmtMoney(bc.factory)}</b></span></div>}
      {!editing && <SupplyInvoiceBar o={o} editable={editable} className="mt-2" />}
      {!editing && !summary && c.fabricMetres != null && <KV k="Fabric for the order" v={<b>{c.fabricMetres} {o.bom[0]?.unit ?? 'm'}</b>} note={`${o.costing.consumption} × ${o.orderQty} pcs — what the job card issues${o.fabricNominated ? '; deducted against the vendor invoice (CMT)' : ''}`} />}
      {editing && <div className="flex gap-2 pt-2">
        <Button variant="primary" size="sm" onClick={() => { updateBom(o.id, lines); setEditing(false); }}>Save BOM</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      </div>}
    </Section>
  );
}

const NUM = (v: string) => (v === '' ? null : Number(v));

export function CostingSection({ o, editable }: { o: ProductionOrder; editable: boolean }) {
  const { updateCosting } = useApp();
  const c = costingOf(o);
  const [d, setD] = useState<Record<keyof Costing, string>>(() => Object.fromEntries(Object.entries(o.costing).map(([k, v]) => [k, v == null ? '' : String(v)])) as Record<keyof Costing, string>);
  const [editing, setEditing] = useState(false);
  const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  const money = (x: number | null, dash = 'not costed') => (x == null ? dash : fmtMoney(Math.round(x)));
  const field = (k: keyof Costing, label: string, step = '1') => <label className="flex flex-col gap-1 text-[11px]" style={{ color:'var(--ink-faint)' }}>{label}<Input type="number" step={step} value={d[k]} onChange={e => setD({ ...d, [k]: e.target.value })} /></label>;
  return (
    <Section title="Costing · COGS" right={<div className="flex gap-2 items-center"><OwnerPill editable={editable} owner="Sourcing" />{!editable && <ActsBy role="sourcing" does="enters CPM, consumption and CMP" inline />}{editable && !editing && <Button size="sm" onClick={() => setEditing(true)}>Edit inputs</Button>}</div>}>
      {editing && <div className="grid gap-2 py-2" style={{ gridTemplateColumns:'repeat(3, 1fr)' }}>
        {field('cpm', 'CPM · ₹ / m')}{field('consumption', 'Consumption · per pc', '0.01')}{field('cmp', 'CMP · ₹ / pc')}
        {field('trimsPackaging', 'Trims & packaging', '0.01')}{field('transportation', 'Transportation')}{field('hemming', 'Hemming')}
        {field('shipping', 'Shipping')}{field('factoryOverheads', 'Factory overheads', '0.1')}{field('multiple', 'Multiple → MRP', '0.1')}
        <div className="flex gap-2" style={{ gridColumn:'1 / -1' }}>
          <Button variant="primary" size="sm" onClick={() => { updateCosting(o.id, Object.fromEntries(Object.entries(d).map(([k, v]) => [k, k === 'cpm' || k === 'consumption' || k === 'cmp' ? NUM(v) : Number(v || 0)])) as Partial<Costing>); setEditing(false); }}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </div>}
      <KV k="Fabric cost" v={money(c.fabricCost)} note={o.costing.cpm != null && o.costing.consumption != null ? `₹${o.costing.cpm} / m × ${o.costing.consumption}` : 'CPM × consumption — needs both'} />
      <KV k="CMP" v={money(o.costing.cmp)} note="cut · make · pack" />
      <KV k="FOB" v={<b>{money(c.fob)}</b>} note={o.finalFob != null ? `agreed FOB, closed by production${c.fobFromSheet != null && Math.abs(c.fobFromSheet - o.finalFob) > 5 ? ` · sheet says ${fmtMoney(Math.round(c.fobFromSheet))}` : ''}` : 'fabric + CMP, until production closes costing'} />
      {c.vsTarget != null && <KV k="vs target cost" v={<span style={{ color: c.vsTarget > 0 ? 'var(--risk)' : 'var(--good)' }}>{c.vsTarget > 0 ? '+' : ''}{fmtMoney(Math.round(c.vsTarget))}</span>} note={`target ${fmtMoney(o.targetCost)} set by planning`} />}
      <KV k="Trims & packaging · transport · hemming · shipping · overheads" v={`+ ${fmtMoney(Math.round(c.adders))}`} note={`${o.costing.trimsPackaging} · ${o.costing.transportation} · ${o.costing.hemming} · ${o.costing.shipping} · ${o.costing.factoryOverheads}`} />
      <KV k="Total cost · COGS" v={<b>{money(c.cogs)}</b>} />
      <KV k="Derived MRP" v={money(c.finalMrp)} note={c.derivedMrp != null ? `× ${o.costing.multiple} = ${fmtMoney(Math.round(c.derivedMrp))}, rounded to a price point` : `× ${o.costing.multiple}`} />
      <KV k="Net MRP" v={money(c.netMrp)} note={c.gst != null ? `after ${Math.round(DISCOUNT_BAU * 100)}% BAU + ${Math.round(DISCOUNT_ADDITIONAL * 100)}% discount, net of ${Math.round(c.gst * 100)}% GST` : undefined} />
      <KV k="Intake margin" v={<b style={{ color: c.intakeMargin == null ? undefined : c.intakeMargin < 0.55 ? 'var(--risk)' : 'var(--good)' }}>{pct(c.intakeMargin)}</b>} note="(net MRP − COGS) / net MRP" />
      {c.cogs == null && <div className="pt-2"><Note>Not costed yet — CPM and consumption come from the BOM's fabric line, CMP from the chosen quote.</Note></div>}
    </Section>
  );
}
