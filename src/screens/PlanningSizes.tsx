/* Sizes to add (19 Nov 2026, second call): the requirement has two halves. Category fills the style, tech pack, fabric,
   trims and BOM; Charanjeet in planning adds the quantity for each size. This is his list: every requirement still
   waiting on its sizes, and whether category's half is done or was already sent to counter sourcing (then the PO waits). */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import { fmtDate, daysAgo } from '../domain/engines';
import { packReadyOf } from '../domain/rtwPack';
import { Page, Card, Pill, Drawer, Empty, Stats, Input, Seg, MultiFilter, passes } from '../ui';
import { RtwRequirement } from './RtwRequirement';

const faint = { color: 'var(--ink-faint)' } as const;

export function PlanningSizes() {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };
  const view = (params.get('view') ?? 'todo') as 'todo' | 'done';
  const [cats, setCats] = useState<string[]>([]); const [q, setQ] = useState('');
  const live = db.orders.filter(o => o.status !== 'Cancelled' && !o.poNo);
  const todo = live.filter(o => packReadyOf(o).sizesMissing).sort((a, b) => Number(!!b.queryEarly) - Number(!!a.queryEarly) || a.targetInhouse.localeCompare(b.targetInhouse));
  const done = db.orders.filter(o => o.sizesBy && daysAgo(o.sizesBy.on) <= 30).sort((a, b) => b.sizesBy!.on.localeCompare(a.sizesBy!.on));
  const catsAll = [...new Set(live.map(o => o.category))];
  const shown = (view === 'todo' ? todo : done).filter(o => passes(cats, o.category)).filter(o => !q.trim() || o.styleName.toLowerCase().includes(q.trim().toLowerCase()));
  const active = db.orders.find(o => o.id === params.get('open')) ?? null;
  return <Page title="Sizes to add" lede="Planning's half of every RTW requirement: the quantity for each size. Category fills the rest.">
    <Stats items={[
      { label: 'Waiting on sizes', value: todo.length, tone: todo.length ? 'warn' : 'good' },
      { label: 'Category half done', value: todo.filter(o => packReadyOf(o).categoryReady).length, tone: todo.some(o => packReadyOf(o).categoryReady) ? 'warn' : undefined },
      { label: 'In counter sourcing · PO waits', value: todo.filter(o => o.queryEarly).length, tone: todo.some(o => o.queryEarly) ? 'risk' : undefined },
      { label: 'Added in 30 days', value: done.length, tone: 'good' },
    ]} />
    <div className="pb-3"><Seg value={view} onChange={v => set('view', v === 'todo' ? null : v)} options={[{ id: 'todo', label: 'Pending for me', count: todo.length }, { id: 'done', label: 'Added', count: done.length }]} /></div>
    <Card className="mb-3"><div className="px-3 py-2.5 flex items-end gap-3 flex-wrap">
      <MultiFilter value={cats} onChange={setCats} label="Category" options={[{ id: 'all', label: 'Every category' }, ...catsAll.map(c => ({ id: c, label: c, count: todo.filter(o => o.category === c).length }))]} />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="style" style={{ width: 200 }} />
    </div></Card>
    {shown.length === 0 ? <Card><Empty title={view === 'todo' ? 'No requirement is waiting on sizes.' : 'No sizes added in the last 30 days.'} body="" /></Card>
      : <Card><table className="t">
        <thead><tr><th>Style</th><th className="num">Category's ask</th><th>Target in-house</th><th>Category's half</th><th>Where it is</th></tr></thead>
        <tbody>{shown.map(o => { const rd = packReadyOf(o); const catMissing = rd.parts.filter(x => x.key !== 'sizes').reduce((a, x) => a + x.missing.length, 0);
          return <tr key={o.id} className="row" onClick={() => set('open', o.id)}>
            <td><div className="font-medium text-[12.5px]">{o.styleName}</div><div className="text-[11.5px]" style={faint}>{o.category} · raised {fmtDate(o.styleHandover)}</div></td>
            <td className="num">{view === 'done' ? `${o.orderQty} pcs · ${o.sizeBreakup.length} sizes` : `~${o.orderQty} pcs`}</td>
            <td className="text-[12px]">{fmtDate(o.targetInhouse)}</td>
            <td>{rd.categoryReady ? <Pill tone="good">done</Pill> : <Pill tone="neutral">{catMissing} to fill</Pill>}</td>
            <td>{view === 'done' ? <span className="text-[12px]" style={faint}>added {fmtDate(o.sizesBy!.on)} · {o.sizesBy!.by}</span> : o.queryEarly ? <Pill tone="risk">in counter sourcing · the PO waits for your sizes</Pill> : <Pill tone="warn">requirement · sizes pending</Pill>}</td>
          </tr>; })}</tbody></table></Card>}
    <Drawer open={!!active} onClose={() => set('open', null)} title={active?.styleName ?? ''} subtitle={active && <span>{active.category}</span>}>
      {active && <RtwRequirement key={active.id} o={active} initial="pack" />}
    </Drawer>
  </Page>;
}
