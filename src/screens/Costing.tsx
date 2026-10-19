/* BOM and COGS — the tech pack's material list and the New Cogs Working sheet,
   computed on the record instead of retyped per season. Design owns
   the BOM; Sourcing owns the cost inputs; the FOB production closes wins. */
import { useState } from 'react';
import { useApp } from '../store';
import type { BomLine, Costing, ProductionOrder } from '../domain/types';
import { costingOf, fmtMoney } from '../domain/engines';
import { DISCOUNT_BAU, DISCOUNT_ADDITIONAL } from '../domain/reference';
import { Section, Pill, Button, Input, KV, Note } from '../ui';
import { ActsBy, OwnerPill } from './Who';

const KIND_LABEL: Record<BomLine['kind'], string> = { fabric:'Fabric', trim:'Trim card', packaging:'Packaging' };

export function BomSection({ o, editable }: { o: ProductionOrder; editable: boolean }) {
  const { updateBom } = useApp();
  const [lines, setLines] = useState<BomLine[]>(o.bom);
  const [editing, setEditing] = useState(false);
  const c = costingOf(o);
  const upd = (i: number, patch: Partial<BomLine>) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const groups = (['fabric', 'trim', 'packaging'] as const).map(k => ({ k, rows: (editing ? lines : o.bom).map((l, i) => ({ l, i })).filter(x => x.l.kind === k) }));
  return (
    <Section title={`BOM · ${o.bom.length} lines`} right={<div className="flex gap-2 items-center"><OwnerPill editable={editable} owner="Design" />{!editable && <ActsBy role="design" does="edits the BOM" inline />}{editable && !editing && <Button size="sm" onClick={() => { setLines(o.bom); setEditing(true); }}>Edit</Button>}</div>}>
      {groups.map(g => g.rows.length > 0 && <div key={g.k} className="py-1">
        <div className="label">{KIND_LABEL[g.k]}</div>
        {g.rows.map(({ l, i }) => editing ? (
          <div key={i} className="grid gap-1.5 py-1" style={{ gridTemplateColumns:'1.2fr 2fr .6fr .5fr' }}>
            <Input value={l.item} onChange={e => upd(i, { item: e.target.value })} />
            <Input value={l.spec ?? ''} placeholder="spec — mill, composition, size, finish" onChange={e => upd(i, { spec: e.target.value || null })} />
            <Input type="number" step="0.01" value={l.qtyPerPc ?? ''} placeholder="qty" onChange={e => upd(i, { qtyPerPc: e.target.value === '' ? null : Number(e.target.value) })} />
            <Input value={l.unit} onChange={e => upd(i, { unit: e.target.value })} />
          </div>
        ) : <KV key={i} k={l.item} v={l.qtyPerPc != null ? `${l.qtyPerPc} ${l.unit} / pc` : '—'} note={l.spec ?? undefined} />)}
      </div>)}
      {!editing && c.fabricMetres != null && <KV k="Fabric for the order" v={<b>{c.fabricMetres} {o.bom[0]?.unit ?? 'm'}</b>} note={`${o.costing.consumption} × ${o.orderQty} pcs — what the job card issues${o.fabricNominated ? '; deducted against the vendor invoice (CMT)' : ''}`} />}
      {editing && <div className="flex gap-2 pt-2">
        <Button variant="primary" size="sm" onClick={() => { updateBom(o.id, lines); setEditing(false); }}>Save BOM</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        <Button size="sm" variant="ghost" onClick={() => setLines(ls => [...ls, { kind:'trim', item:'', spec:null, qtyPerPc:null, unit:'pc' }])}>+ line</Button>
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
