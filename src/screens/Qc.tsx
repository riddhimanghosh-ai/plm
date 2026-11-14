/* QC's screen (14 Nov 2026): every PO with a QC point open — the PP sample and the size set
   submitted by the factory, and the three line inspections once stitching and finishing start.
   QC passes or fails each one with remarks against the tech pack and the sizes; a pass closes
   the TNA block; the merchandiser sees the result either way. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { ProductionOrder } from '../domain/types';
import { fmtDate, riskOf } from '../domain/engines';
import { qcPointsOf, type QcPointState } from '../domain/rtwPack';
import { Page, Card, Pill, Drawer, Empty, Seg, Input, Stats } from '../ui';
import { VendorLink } from './Vendors';
import { RtwRequirement } from './RtwRequirement';
import { ActsBy } from './Who';

type Row = { o: ProductionOrder; pt: QcPointState };
export function Qc() {
  const { db, role } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };
  const mine = role === 'qc' || role === 'owner';
  const [filter, setFilter] = useState<'open' | 'failed' | 'done'>('open');
  const [point, setPoint] = useState('all'); const [q, setQ] = useState('');
  const open = db.orders.filter(o => o.status === 'Open' && o.poNo);
  const rows: Row[] = open.flatMap(o => qcPointsOf(o).filter(pt => pt.state !== 'na' && pt.state !== 'later').map(pt => ({ o, pt })));
  const due = rows.filter(r => r.pt.state === 'due'); const failed = rows.filter(r => r.pt.state === 'failed'); const passed = rows.filter(r => r.pt.state === 'passed');
  const base = filter === 'open' ? [...failed, ...due] : filter === 'failed' ? failed : passed;
  const shown = base.filter(r => point === 'all' || r.pt.key === point).filter(r => !q.trim() || `${r.o.styleName} ${r.o.poNo}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (b.pt.sinceDays ?? 0) - (a.pt.sinceDays ?? 0));
  const active = db.orders.find(o => o.id === params.get('open')) ?? null;
  const points = [...new Set(rows.map(r => r.pt.key))];
  const faint = { color: 'var(--ink-faint)' } as const;
  return <Page title="QC · samples and inspections" lede="Every PO waiting on QC: the PP sample and size set the factory submitted, and the line inspections due. Pass or fail each with remarks; the merchandiser sees them."
    replaces="the QC remarks on WhatsApp and the inspection report photographed into the group">
    {!mine && <div className="mb-2"><ActsBy role="qc" does="passes or fails each point against the tech pack and the sizes" inline /></div>}
    <Stats items={[
      { label: 'To check', value: due.length, tone: due.length ? 'warn' : undefined },
      { label: 'Failed · awaiting resubmission', value: failed.length, tone: failed.length ? 'risk' : undefined },
      { label: 'Waiting over 2 days', value: due.filter(r => (r.pt.sinceDays ?? 0) > 2).length, tone: due.some(r => (r.pt.sinceDays ?? 0) > 2) ? 'risk' : undefined },
      { label: 'Passed on open POs', value: passed.length, tone: 'good' },
    ]} />
    <Card className="mb-3"><div className="px-3 py-2.5 flex items-center gap-2 flex-wrap">
      <Seg value={filter} onChange={setFilter} options={[{ id: 'open', label: 'Open', count: due.length + failed.length }, { id: 'failed', label: 'Failed', count: failed.length }, { id: 'done', label: 'Passed', count: passed.length }]} />
      <Seg value={point} onChange={setPoint} label="Point" options={[{ id: 'all', label: 'Every point' }, ...points.map(k => ({ id: k, label: rows.find(r => r.pt.key === k)!.pt.label, count: base.filter(r => r.pt.key === k).length }))]} />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="style or PO" style={{ width: 180 }} />
    </div></Card>
    {shown.length === 0 ? <Card><Empty title={filter === 'open' ? 'Nothing waiting on QC.' : 'Nothing here.'} body="" /></Card> : <Card><table className="t">
      <thead><tr><th>PO</th><th>Style</th><th>Factory</th><th>Point</th><th>Status</th><th>Last remarks</th><th>Due in-house</th></tr></thead>
      <tbody>{shown.map(({ o, pt }) => { const r = riskOf(o);
        return <tr key={`${o.id}-${pt.key}`} className="row" onClick={() => set('open', o.id)}>
          <td className="mono text-[12.5px]" style={{ whiteSpace: 'nowrap' }}>{o.poNo}</td>
          <td><div className="font-medium">{o.styleName}</div><div className="text-[11.5px]" style={faint}>{o.category} · {o.orderQty} pcs</div></td>
          <td className="text-[12.5px]"><VendorLink id={o.vendorId} /></td>
          <td><div className="font-medium">{pt.label}</div><div className="text-[11px]" style={faint}>{pt.hint}</div></td>
          <td><Pill tone={pt.state === 'failed' ? 'risk' : pt.state === 'due' ? (pt.sinceDays && pt.sinceDays > 2 ? 'risk' : 'warn') : 'good'}>{pt.state === 'failed' ? `failed ${fmtDate(pt.last?.on)}` : pt.state === 'due' ? `to check · since ${fmtDate(pt.due)}${pt.sinceDays ? ` · ${pt.sinceDays}d` : ''}` : `passed ${fmtDate(pt.last?.on)}`}</Pill></td>
          <td className="text-[12px]" style={{ whiteSpace: 'normal', maxWidth: 280, color: pt.last?.result === 'fail' ? 'var(--risk)' : undefined }}>{pt.last?.remarks || <span style={faint}>—</span>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(o.targetInhouse)}{r.bufferDays != null && <div className="text-[11px]" style={{ color: r.bufferDays < 0 ? 'var(--risk)' : 'var(--ink-faint)' }}>{r.bufferDays < 0 ? `${-r.bufferDays}d late` : `${r.bufferDays}d to spare`}</div>}</td>
        </tr>; })}</tbody>
    </table></Card>}
    <Drawer open={!!active} onClose={() => set('open', null)} title={active?.poNo ?? ''} subtitle={active && <span>{active.styleName} · {db.vendors.find(v => v.id === active.vendorId)?.name ?? ''} · {active.orderQty} pcs</span>}>
      {active && <RtwRequirement key={active.id} o={active} initial="tna" />}
    </Drawer>
  </Page>;
}
