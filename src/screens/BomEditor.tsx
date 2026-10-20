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

export function BomEditor({ lines, onChange, orderQty, editable = true }: { lines: BomLine[]; onChange: (l: BomLine[]) => void; orderQty: number; editable?: boolean }) {
  const { db } = useApp();
  const trims = db.trims ?? [];
  const [pick, setPick] = useState('');
  const upd = (i: number, patch: Partial<BomLine>) => onChange(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => onChange(lines.filter((_, k) => k !== i));
  const addFromMaster = (name: string) => { const t = masterFor(trims, name); if (!t) return; if (lines.some(l => l.item.toLowerCase() === t.name.toLowerCase())) return;
    onChange([...lines, { kind: t.kind, item: t.name, spec: null, qtyPerPc: t.kind === 'trim' && t.name === 'Button' ? 12 : 1, unit: t.unit }]); setPick(''); };
  const groups = (['fabric', 'trim', 'packaging'] as const).map(k => ({ k, rows: lines.map((l, i) => ({ l, i })).filter(x => x.l.kind === k) }));
  const notOnMaster = lines.filter(l => l.kind !== 'fabric' && !masterFor(trims, l.item)).length;
  const short = lines.filter(l => lineStatus(trims, db, l, orderQty).tone === 'risk').length;
  return <div>
    <div className="flex gap-2 flex-wrap pb-2 text-[12px]">
      <Pill tone={notOnMaster ? 'warn' : 'good'}>{notOnMaster ? `${notOnMaster} line${notOnMaster === 1 ? '' : 's'} not on the trims master` : 'every trim is on the master'}</Pill>
      <Pill tone={short ? 'risk' : 'good'}>{short ? `${short} line${short === 1 ? '' : 's'} short at the unit for ${orderQty} pcs` : `stock covers ${orderQty} pcs`}</Pill>
    </div>
    {groups.map(g => g.rows.length > 0 && <div key={g.k} className="py-1">
      <div className="label">{KIND_LABEL[g.k]}</div>
      {g.rows.map(({ l, i }) => { const st = lineStatus(trims, db, l, orderQty); return <div key={i} className="py-1" style={{ borderBottom: '1px solid var(--line-soft)' }}>
        {editable && l.kind !== 'fabric' ? <div className="grid gap-1.5" style={{ gridTemplateColumns: '1.3fr 2fr .6fr .5fr auto' }}>
          <Input list="trims-master" value={l.item} onChange={e => upd(i, { item: e.target.value })} placeholder="item — from the trims master" />
          <Input value={l.spec ?? ''} placeholder="spec — size, finish, colour" onChange={e => upd(i, { spec: e.target.value || null })} />
          <Input type="number" step="0.01" value={l.qtyPerPc ?? ''} placeholder="per pc" onChange={e => upd(i, { qtyPerPc: e.target.value === '' ? null : Number(e.target.value) })} />
          <Input value={l.unit} onChange={e => upd(i, { unit: e.target.value })} />
          <button type="button" className="vlink text-[11.5px]" onClick={() => remove(i)}>remove</button>
        </div> : <div className="flex items-baseline gap-2 flex-wrap"><span className="font-medium">{l.item}</span><span className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>{l.spec ?? ''}</span><span className="flex-1" /><span className="mono text-[12px]">{l.qtyPerPc != null ? `${l.qtyPerPc} ${l.unit} / pc` : '—'}</span></div>}
        <div className="text-[11.5px] pt-0.5" style={{ color: st.tone === 'risk' ? 'var(--risk)' : st.tone === 'warn' ? 'var(--warn)' : st.tone === 'good' ? 'var(--good)' : 'var(--ink-faint)' }}>{st.text}{st.tone === 'warn' && <> · <a className="vlink" href="#/fabrics?tab=trims">trims master →</a></>}</div>
      </div>; })}
    </div>)}
    {editable && <div className="flex gap-2 items-end flex-wrap pt-2">
      <div style={{ width: 260 }}><Input list="trims-master" value={pick} onChange={e => setPick(e.target.value)} placeholder="add a line from the trims master…" onKeyDown={e => { if (e.key === 'Enter') addFromMaster(pick); }} /></div>
      <Button size="sm" disabled={!masterFor(trims, pick)} onClick={() => addFromMaster(pick)}>+ Add from master</Button>
      <Button size="sm" variant="ghost" onClick={() => onChange([...lines, { kind: 'trim', item: '', spec: null, qtyPerPc: 1, unit: 'pc' }])}>+ blank line</Button>
      <datalist id="trims-master">{trims.map(t => <option key={t.id} value={t.name}>{t.kind} · {t.stock.toLocaleString('en-IN')} {t.unit} at the unit</option>)}</datalist>
    </div>}
  </div>;
}
