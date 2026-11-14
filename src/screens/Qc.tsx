/* QC's screen (15 Nov 2026), in the order QC works: the line inspections coming up on every PO at every
   factory (initial · mid-line · final, with how soon), the PP samples received, the size sets received —
   each passed or not passed with technical and aesthetic remarks — and the log of every result. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { ProductionOrder, QcPoint } from '../domain/types';
import { fmtDate, riskOf, daysAgo } from '../domain/engines';
import { qcPointsOf, type QcPointState } from '../domain/rtwPack';
import { Page, Card, Pill, Drawer, Empty, Seg, Input, Stats, Tabs } from '../ui';
import { VendorLink } from './Vendors';
import { RtwRequirement } from './RtwRequirement';
import { ActsBy } from './Who';
import { QcLog } from './QcLog';

type Row = { o: ProductionOrder; pt: QcPointState; plannedOn: string | null; inDays: number | null };
const INSPECTIONS: QcPoint[] = ['initial', 'midline', 'final'];

export function Qc() {
  const { db, role } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };
  const tab = params.get('tab') ?? 'inspections';
  const mine = role === 'qc' || role === 'owner';
  const [within, setWithin] = useState('7'); const [point, setPoint] = useState('all'); const [fac, setFac] = useState('all'); const [q, setQ] = useState('');
  const [sampleFilter, setSampleFilter] = useState<'open' | 'all'>('open');
  const open = db.orders.filter(o => o.status === 'Open' && o.poNo);
  const factoryName = (id: string | null) => db.vendors.find(v => v.id === id)?.name ?? '—';
  /* every point on every open PO, with the planned date of the block it closes, so an inspection shows before it is due */
  const rows: Row[] = open.flatMap(o => qcPointsOf(o).filter(pt => pt.state !== 'na').map(pt => { const m = o.milestones.find(x => x.key === pt.closes); const plannedOn = m ? (m.revised ?? m.plan) : null; return { o, pt, plannedOn, inDays: plannedOn ? -daysAgo(plannedOn) : null }; }));
  const match = (r: Row) => (fac === 'all' || r.o.vendorId === fac) && (!q.trim() || `${r.o.styleName} ${r.o.poNo ?? ''} ${factoryName(r.o.vendorId)}`.toLowerCase().includes(q.trim().toLowerCase()));
  const factories = [...new Set(rows.map(r => r.o.vendorId).filter(Boolean))] as string[];
  /* 1. inspections: due now, failed, or planned within N days */
  const insp = rows.filter(r => INSPECTIONS.includes(r.pt.key as QcPoint) && r.pt.state !== 'passed').filter(r => r.pt.state === 'due' || r.pt.state === 'failed' || (within === 'all' || (r.inDays != null && r.inDays <= Number(within))))
    .filter(r => point === 'all' || r.pt.key === point).filter(match).sort((a, b) => { const k = (r: Row) => r.pt.state === 'failed' ? -2 : r.pt.state === 'due' ? -1 : Math.max(0, r.inDays ?? 99); return k(a) - k(b); });
  /* 2 / 3. samples received: the factory has submitted; QC passes or not */
  const samples = (key: QcPoint) => rows.filter(r => r.pt.key === key && r.pt.due).filter(r => sampleFilter === 'all' || r.pt.state !== 'passed').filter(match).sort((a, b) => (a.pt.state === 'passed' ? 1 : 0) - (b.pt.state === 'passed' ? 1 : 0) || (b.pt.sinceDays ?? 0) - (a.pt.sinceDays ?? 0));
  const pps = samples('pps'); const sizeSet = samples('size-set');
  const due = rows.filter(r => r.pt.state === 'due'); const failed = rows.filter(r => r.pt.state === 'failed');
  const active = db.orders.find(o => o.id === params.get('open')) ?? null;
  const faint = { color: 'var(--ink-faint)' } as const;
  const nOpen = (key: QcPoint) => rows.filter(r => r.pt.key === key && (r.pt.state === 'due' || r.pt.state === 'failed')).length;

  const statusCell = (r: Row) => <Pill tone={r.pt.state === 'failed' ? 'risk' : r.pt.state === 'due' ? ((r.pt.sinceDays ?? 0) > 2 ? 'risk' : 'warn') : r.pt.state === 'passed' ? 'good' : 'neutral'}>{r.pt.state === 'failed' ? `not passed ${fmtDate(r.pt.last?.on)} · resubmission awaited` : r.pt.state === 'due' ? `to check · since ${fmtDate(r.pt.due)}${r.pt.sinceDays ? ` · ${r.pt.sinceDays}d` : ''}` : r.pt.state === 'passed' ? `passed ${fmtDate(r.pt.last?.on)}` : r.inDays != null ? (r.inDays <= 0 ? 'planned · factory yet to log the step before' : `planned ${fmtDate(r.plannedOn)} · in ${r.inDays}d`) : 'later'}</Pill>;
  const dueCell = (o: ProductionOrder) => { const rk = riskOf(o); return <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(o.targetInhouse)}{rk.bufferDays != null && <div className="text-[11px]" style={{ color: rk.bufferDays < 0 ? 'var(--risk)' : 'var(--ink-faint)' }}>{rk.bufferDays < 0 ? `${-rk.bufferDays}d late` : `${rk.bufferDays}d to spare`}</div>}</td>; };
  const action = (r: Row) => <td style={{ whiteSpace: 'nowrap' }}>{mine && (r.pt.state === 'due' || r.pt.state === 'failed') && <span className="cta">{r.pt.state === 'failed' ? 'check again →' : 'check now →'}</span>}</td>;
  const sampleTable = (list: Row[], label: string) => list.length === 0 ? <Card><Empty title={`No ${label} ${sampleFilter === 'open' ? 'waiting on QC' : 'received yet'}.`} body="" /></Card> : <Card><table className="t">
    <thead><tr><th>PO · style</th><th>Factory</th><th>Received</th><th>Status</th><th>Technical remarks</th><th>Aesthetic remarks</th><th>Due in-house</th><th></th></tr></thead>
    <tbody>{list.map(r => <tr key={r.o.id} className="row" onClick={() => set('open', r.o.id)}>
      <td><div className="mono text-[12px]">{r.o.poNo}</div><div className="font-medium text-[12.5px]">{r.o.styleName}</div><div className="text-[11px]" style={faint}>{r.o.category} · {r.o.orderQty} pcs</div></td>
      <td className="text-[12.5px]"><VendorLink id={r.o.vendorId} /></td>
      <td className="text-[12px]" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.pt.due)}</td>
      <td>{statusCell(r)}</td>
      <td className="text-[12px]" style={{ whiteSpace: 'normal', maxWidth: 240, color: r.pt.last?.result === 'fail' ? 'var(--risk)' : undefined }}>{r.pt.last?.remarks || <span style={faint}>—</span>}</td>
      <td className="text-[12px]" style={{ whiteSpace: 'normal', maxWidth: 220, fontStyle: 'italic', color: 'var(--ink-soft)' }}>{r.pt.last?.aesthetic || <span style={{ ...faint, fontStyle: 'normal' }}>—</span>}</td>
      {dueCell(r.o)}{action(r)}
    </tr>)}</tbody></table></Card>;

  return <Page title="QC · samples and inspections" lede="Inspections coming up on every PO at every factory, then the PP samples and size sets the factories have sent in. Open a row, tick the checklist, pass or not with technical and aesthetic remarks; the merchandiser sees every result."
    replaces="the QC remarks on WhatsApp and the inspection report photographed into the group">
    {!mine && <div className="mb-2"><ActsBy role="qc" does="passes or fails each point against the tech pack and the sizes" inline /></div>}
    <Stats items={[
      { label: 'Inspections to do', value: rows.filter(r => INSPECTIONS.includes(r.pt.key as QcPoint) && r.pt.state === 'due').length, tone: 'warn' },
      { label: 'PP samples received', value: nOpen('pps'), tone: nOpen('pps') ? 'warn' : undefined },
      { label: 'Size sets received', value: nOpen('size-set'), tone: nOpen('size-set') ? 'warn' : undefined },
      { label: 'Not passed · awaiting resubmission', value: failed.length, tone: failed.length ? 'risk' : undefined },
      { label: 'Waiting over 2 days', value: due.filter(r => (r.pt.sinceDays ?? 0) > 2).length, tone: due.some(r => (r.pt.sinceDays ?? 0) > 2) ? 'risk' : undefined },
    ]} />
    <Tabs active={tab} onChange={t => set('tab', t)} tabs={[
      { id: 'inspections', label: 'Inspections · initial, mid-line, final', count: insp.filter(r => r.pt.state === 'due' || r.pt.state === 'failed').length || undefined, hint: 'every PO near an inspection, with its factory' },
      { id: 'pps', label: 'PP samples received', count: nOpen('pps') || undefined, hint: 'passed or not, with technical and aesthetic remarks' },
      { id: 'sizeset', label: 'Size sets received', count: nOpen('size-set') || undefined },
      { id: 'log', label: 'Every result', hint: 'the log of passes and fails with remarks' },
    ]} />
    {tab === 'inspections' && <>
      <Card className="mb-3"><div className="px-3 py-2.5 flex items-center gap-2 flex-wrap">
        <Seg value={within} onChange={setWithin} label="Coming up" options={[{ id: '3', label: 'Within 3 days' }, { id: '7', label: '7 days' }, { id: '14', label: '14 days' }, { id: 'all', label: 'Everything planned' }]} />
        <Seg value={point} onChange={setPoint} label="Point" options={[{ id: 'all', label: 'All three' }, { id: 'initial', label: 'Initial', count: insp.filter(r => r.pt.key === 'initial').length }, { id: 'midline', label: 'Mid-line', count: insp.filter(r => r.pt.key === 'midline').length }, { id: 'final', label: 'Final', count: insp.filter(r => r.pt.key === 'final').length }]} />
        {factories.length > 1 && <Seg value={fac} onChange={setFac} label="Factory" options={[{ id: 'all', label: 'All' }, ...factories.map(id => ({ id, label: factoryName(id), count: insp.filter(r => r.o.vendorId === id).length }))]} />}
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="style, PO or factory" style={{ width: 190 }} />
      </div></Card>
      {insp.length === 0 ? <Card><Empty title="No inspection coming up in that window." body="Widen the window, or check the samples tabs." /></Card> : <Card><table className="t">
        <thead><tr><th>PO · style</th><th>Factory</th><th>Inspection</th><th>When</th><th>Last remarks</th><th>Due in-house</th><th></th></tr></thead>
        <tbody>{insp.map(r => <tr key={`${r.o.id}-${r.pt.key}`} className="row" onClick={() => set('open', r.o.id)} style={{ background: r.pt.state === 'failed' ? 'color-mix(in srgb, var(--risk) 4%, transparent)' : r.pt.state === 'due' ? 'color-mix(in srgb, var(--role-qc) 5%, transparent)' : undefined }}>
          <td><div className="mono text-[12px]">{r.o.poNo}</div><div className="font-medium text-[12.5px]">{r.o.styleName}</div><div className="text-[11px]" style={faint}>{r.o.category} · {r.o.orderQty} pcs</div></td>
          <td className="text-[12.5px]"><VendorLink id={r.o.vendorId} /><div className="text-[11px]" style={faint}>{db.vendors.find(v => v.id === r.o.vendorId)?.location}</div></td>
          <td><div className="font-medium">{r.pt.label}</div><div className="text-[11px]" style={faint}>{r.pt.hint}</div></td>
          <td>{statusCell(r)}</td>
          <td className="text-[12px]" style={{ whiteSpace: 'normal', maxWidth: 260, color: r.pt.last?.result === 'fail' ? 'var(--risk)' : undefined }}>{r.pt.last?.remarks || <span style={faint}>—</span>}</td>
          {dueCell(r.o)}{action(r)}
        </tr>)}</tbody>
      </table></Card>}
    </>}
    {(tab === 'pps' || tab === 'sizeset') && <>
      <Card className="mb-3"><div className="px-3 py-2.5 flex items-center gap-2 flex-wrap">
        <Seg value={sampleFilter} onChange={v => setSampleFilter(v as 'open' | 'all')} options={[{ id: 'open', label: 'Waiting on QC', count: (tab === 'pps' ? pps : sizeSet).filter(r => r.pt.state !== 'passed').length }, { id: 'all', label: 'All received' }]} />
        {factories.length > 1 && <Seg value={fac} onChange={setFac} label="Factory" options={[{ id: 'all', label: 'All' }, ...factories.map(id => ({ id, label: factoryName(id) }))]} />}
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="style, PO or factory" style={{ width: 190 }} />
      </div></Card>
      {tab === 'pps' ? sampleTable(pps, 'PP samples') : sampleTable(sizeSet, 'size sets')}
    </>}
    {tab === 'log' && <QcLog orders={db.orders.filter(o => o.poNo)} onOpen={id => set('open', id)} factoryName={factoryName} />}
    <Drawer open={!!active} onClose={() => set('open', null)} title={active?.poNo ?? ''} subtitle={active && <span>{active.styleName} · {factoryName(active.vendorId)} · {active.orderQty} pcs</span>}>
      {active && <RtwRequirement key={active.id} o={active} initial="tna" />}
    </Drawer>
  </Page>;
}
