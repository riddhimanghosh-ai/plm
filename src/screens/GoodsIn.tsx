/* Warehouse · goods in (17 Nov 2026): Prince's screen. Everything a factory has dispatched: the invoice, the packing
   list and what the PO asked for. He counts it in size by size and says what he received; a short or damaged count is
   flagged, and what is not received comes off the payable. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import { fmtDate, fmtMoney, receiptOf, daysAgo } from '../domain/engines';
import { sentPcsOf, poLedgerOf, countedBy3plOf } from '../domain/rtwPack';
import { Page, Card, Pill, Drawer, Empty, Seg, Stats, Input, MultiFilter, passes } from '../ui';
import { RtwRequirement } from './RtwRequirement';

export function GoodsIn() {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };
  const view = (params.get('view') ?? 'todo') as 'todo' | 'done';
  const [q, setQ] = useState(''); const [facs, setFacs] = useState<string[]>([]);
  const nameOf = (id: string | null) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const all = db.orders.filter(o => o.poNo && o.invoice?.mailedOn && !(countedBy3plOf(o) && !receiptOf(o).lots.length)).map(o => { const rc = receiptOf(o); const sent = sentPcsOf(o); const l = poLedgerOf(o);
    const done = rc.lots.length > 0 && (o.status === 'Closed' || rc.received + rc.rejected >= sent);
    const state = !rc.lots.length ? 'to-count' : !done ? 'balance' : l.shortPcs > 0 || rc.rejected > 0 ? 'short' : 'ok';
    return { o, rc, sent, l, done, state }; });
  const STATE: Record<string, [string, 'warn' | 'risk' | 'good' | 'info']> = { 'to-count': ['to count in', 'warn'], balance: ['balance to come', 'info'], short: ['received short', 'risk'], ok: ['received in full', 'good'] };
  const todo = all.filter(x => !x.done); const done = all.filter(x => x.done);
  const rows = (view === 'todo' ? todo : done).filter(x => passes(facs, x.o.vendorId ?? '')).filter(x => !q.trim() || `${x.o.poNo} ${x.o.styleName} ${x.o.invoice!.no}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (view === 'todo' ? (a.o.invoice!.mailedOn ?? '').localeCompare(b.o.invoice!.mailedOn ?? '') : (b.rc.lots[b.rc.lots.length - 1]?.at ?? '').localeCompare(a.rc.lots[a.rc.lots.length - 1]?.at ?? '')));
  const active = db.orders.find(o => o.id === params.get('open')) ?? null;
  const faint = { color: 'var(--ink-faint)' } as const;

  return <Page title="Goods in" lede="What factories have dispatched: the invoice, the packing list and what was ordered. Count it in and say what you received.">
    <Stats items={[
      { label: 'To count in', value: todo.filter(x => x.state === 'to-count').length, tone: todo.length ? 'warn' : 'good' },
      { label: 'Pieces on the way', value: todo.reduce((a, x) => a + Math.max(0, x.sent - x.rc.received - x.rc.rejected), 0).toLocaleString('en-IN') },
      { label: 'Balance to come', value: todo.filter(x => x.state === 'balance').length },
      { label: 'Received short', value: done.filter(x => x.state === 'short').length, tone: done.some(x => x.state === 'short') ? 'risk' : 'good' },
    ]} />
    <Card className="mb-3"><div className="px-3 py-2.5 flex items-end gap-3 flex-wrap">
      <Seg value={view} onChange={v => set('view', v === 'todo' ? null : v)} options={[{ id: 'todo', label: 'Dispatched · to count in', count: todo.length }, { id: 'done', label: 'Counted in', count: done.length }]} />
      <MultiFilter label="Factory" value={facs} onChange={setFacs} width={220} options={[{ id: 'all', label: 'Every factory' }, ...[...new Set(all.map(x => x.o.vendorId ?? ''))].filter(Boolean).map(id => ({ id, label: nameOf(id) }))]} />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="PO, style or invoice" style={{ width: 210 }} />
    </div></Card>
    {rows.length === 0 ? <Card><Empty title={view === 'todo' ? 'Nothing waiting to be counted in.' : 'Nothing matches.'} body="" /></Card> : <Card><table className="t">
      <thead><tr><th>PO · style</th><th>Factory</th><th>Invoice</th><th className="num">Ordered</th><th className="num">Packing list</th><th className="num">Received</th><th className="num">Short</th><th>Status</th></tr></thead>
      <tbody>{rows.slice(0, params.get('all') === '1' ? undefined : 40).map(({ o, rc, sent, l, state }) => { const [lab, tone] = STATE[state]; const inv = o.invoice!; const short = rc.lots.length ? Math.max(0, sent - rc.received) : null;
        return <tr key={o.id} className="row" onClick={() => set('open', o.id)}>
          <td><div className="mono text-[12.5px]">{o.poNo}</div><div className="text-[11.5px]" style={faint}>{o.styleName}</div></td>
          <td className="text-[12.5px]">{nameOf(o.vendorId)}<div className="text-[11px]" style={faint}>to {o.poMail?.deliveryLocation ?? '—'}</div></td>
          <td className="text-[12.5px]"><span className="mono">{inv.no}</span> · {fmtMoney(inv.amount)}{(inv.part ?? 1) > 1 && <span className="pill ml-1">part {inv.part}</span>}<div className="text-[11px]" style={faint}>{inv.eway ? <>e-way <span className="mono">{inv.eway.no}</span> · </> : null}sent {fmtDate(inv.mailedOn)}{!rc.lots.length && daysAgo(inv.mailedOn!) > 0 ? ` · ${daysAgo(inv.mailedOn!)}d ago` : ''}</div></td>
          <td className="num">{l.poPcs}</td><td className="num">{sent}</td>
          <td className="num font-semibold">{rc.lots.length ? rc.received : '—'}{rc.rejected > 0 && <div className="text-[11px]" style={{ color: 'var(--risk)', fontWeight: 400 }}>{rc.rejected} damaged</div>}</td>
          <td className="num" style={{ color: short ? 'var(--risk)' : undefined }}>{short == null ? '—' : short || '✓'}</td>
          <td><Pill tone={tone}>{lab}</Pill></td>
        </tr>; })}</tbody>
    </table>
    {rows.length > 40 && params.get('all') !== '1' && <div className="px-4 py-2 text-[12px]" style={faint}>40 of {rows.length} shown · <button type="button" className="vlink" onClick={() => set('all', '1')}>show all</button></div>}
    </Card>}
    <Drawer open={!!active} onClose={() => set('open', null)} title={active?.poNo ?? ''} subtitle={active && <span>{active.styleName} · {nameOf(active.vendorId)}</span>}>
      {active && <RtwRequirement key={active.id} o={active} initial="received" scope="warehouse" />}
    </Drawer>
  </Page>;
}
