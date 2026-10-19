/* OTIF — On Time, In Full, kept as two numbers because a shipment can fail one
   without failing the other. Definitions are the dashboard's own legend.
   Two questions, two screens: how a factory has behaved over time, and what
   happened on one order. They used to be stacked on one scroll, which meant
   the scorecard — the thing that should sit beside a quote — was the only part
   anyone ever saw. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import { VendorLink } from './Vendors';
import { otifOf, fmtDate, riskOf, daysAgo, iso, TODAY, addDays, trackerConfig, type Risk } from '../domain/engines';
import { MILESTONES, MERCHANDISERS, GARMENT_CATEGORIES } from '../domain/reference';
import type { ProductionOrder } from '../domain/types';
import { Page, Card, Pill, Note, Tabs, Seg, Select, Input, Button, Empty, usePager, Pager, ExportButton, useExamples, Stats, Field, KV } from '../ui';
import { ActsBy } from './Who';

export function Otif() {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace:true }); };
  const top = params.get('view') ?? 'otif';
  const tab = params.get('tab') ?? 'factory';
  /* `?vendor=` is the app-wide handle for the vendor 360 drawer — this screen's
     own factory filter has to live under its own name or the two fight */
  const vendor = params.get('factory') ?? 'all';
  const [otifOnly, setOtifOnly] = useState('all');
  const [search, setSearch] = useState('');

  const vendorName = (id: string | null) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const rows = db.orders.filter(o => o.status === 'Open' || o.status === 'Closed').map(o => ({ o, otif: otifOf(o) }));
  const decided = rows.filter(r => r.otif !== 'Pending');

  /* vendor scorecard — the thing sourcing needs when the next quote comes in */
  const byVendor = db.vendors.filter(v => v.kind.endsWith('factory')).map(v => {
    const mine = decided.filter(r => r.o.vendorId === v.id);
    const open = db.orders.filter(o => o.vendorId === v.id && o.status === 'Open');
    return { v, n: mine.length, otif: mine.filter(r => r.otif === 'OTIF').length, late: mine.filter(r => r.otif === 'Delayed').length, short: mine.filter(r => r.otif === 'IF fail').length, openN: open.length, atRisk: open.filter(o => ['at-risk', 'critical', 'delayed'].includes(riskOf(o).risk)).length };
  }).filter(x => x.n || x.openN).sort((a, b) => (b.otif / Math.max(1, b.n)) - (a.otif / Math.max(1, a.n)));

  /* the order list, filtered — a factory's name in the scorecard brings you here */
  const orders = rows
    .filter(r => vendor === 'all' || r.o.vendorId === vendor)
    .filter(r => otifOnly === 'all' ? true : otifOnly === 'fail' ? (r.otif === 'Delayed' || r.otif === 'IF fail') : r.otif === otifOnly)
    .filter(r => { const t = search.trim().toLowerCase(); return !t || r.o.styleName.toLowerCase().includes(t) || (r.o.poNo ?? '').toLowerCase().includes(t); })
    .sort((a, b) => (a.otif === 'Pending' ? 1 : 0) - (b.otif === 'Pending' ? 1 : 0));
  /* one order per OTIF verdict — clean, late, short, not shipped yet */
  const ex = useExamples(orders, r => r.otif, { noun:'orders', done: r => r.otif === 'OTIF' });
  const pager = usePager(ex.rows, 25);
  const count = (k: string) => rows.filter(r => (vendor === 'all' || r.o.vendorId === vendor) && r.otif === k).length;
  const openFor = (id: string) => { const n = new URLSearchParams(params); n.set('tab', 'order'); n.set('factory', id); setParams(n, { replace:true }); };

  return (
    <Page title="RTW production analytics" lede={`The workbook's other tabs, read off the tracker: OTIF (on time = dispatched by the target inhouse date; in full = delivered within ±${Math.round(trackerConfig().otifTolerance * 100)}% of cut quantity), the daily monitor, the escalation log and the merchandiser alerts.`}
      replaces="the OTIF Dashboard, Daily Monitor, Escalation Log and Alert Dashboard tabs — four sheets of formulas over the tracker, rebuilt every morning">

      <Tabs active={top} onChange={t => set('view', t === 'otif' ? null : t)} tabs={[
        { id:'otif', label:'OTIF dashboard' },
        { id:'daily', label:'Daily monitor', count: db.orders.filter(o => o.status === 'Open').length },
        { id:'escalations', label:'Escalation log', count: db.orders.filter(o => o.status === 'Open' && ['delayed', 'critical', 'at-risk'].includes(riskOf(o).risk)).length },
        { id:'alerts', label:'Merchandiser alerts' },
      ]} />
      {top === 'daily' && <DailyMonitor />}
      {top === 'escalations' && <EscalationLog />}
      {top === 'alerts' && <AlertDashboard />}

      {top === 'otif' && <Seg value={tab} onChange={t => set('tab', t)} options={[
        { id:'factory', label:'By factory · the scorecard', count: byVendor.length },
        { id:'order', label:'By order · what happened', count: rows.length },
      ]} />}

      {top === 'otif' && tab === 'factory' && <>
        <Card><table className="t">
          <thead><tr><th>Factory</th><th>Type</th><th className="num">Dispatched</th><th className="num">OTIF</th><th className="num">Late</th><th className="num">Short</th><th className="num">OTIF %</th><th className="num">Open now</th><th className="num">At risk</th></tr></thead>
          <tbody>{byVendor.map(x => <tr key={x.v.id} className="row" onClick={() => openFor(x.v.id)}>
            <td className="font-medium">{x.v.name}<div className="text-[11px] font-normal" style={{ color:'var(--ink-faint)' }}>{x.v.location}</div></td>
            <td className="text-[12.5px]">{x.v.kind}</td>
            <td className="num">{x.n}</td><td className="num" style={{ color:'var(--good)' }}>{x.otif}</td><td className="num" style={{ color:'var(--risk)' }}>{x.late}</td><td className="num" style={{ color:'var(--warn)' }}>{x.short}</td>
            <td className="num font-semibold">{x.n ? `${Math.round((x.otif / x.n) * 100)}%` : '—'}</td>
            <td className="num">{x.openN}</td><td className="num" style={{ color: x.atRisk ? 'var(--risk)' : undefined }}>{x.atRisk || '—'}</td>
          </tr>)}</tbody>
        </table>
        <div className="flex justify-end px-3 py-2" style={{ borderTop:'1px solid var(--line)' }}>
          <ExportButton filename="otif-by-factory" rows={byVendor} cols={[
            { label:'Factory', get: (x: typeof byVendor[number]) => x.v.name },
            { label:'Type', get: x => x.v.kind },
            { label:'Location', get: x => x.v.location },
            { label:'Dispatched', get: x => x.n },
            { label:'OTIF', get: x => x.otif },
            { label:'Late', get: x => x.late },
            { label:'Short', get: x => x.short },
            { label:'OTIF %', get: x => x.n ? Math.round((x.otif / x.n) * 100) : '' },
            { label:'Open now', get: x => x.openN },
            { label:'At risk', get: x => x.atRisk },
          ]} />
        </div></Card>
        <div className="mt-3"><Note>A factory that is cheapest and 60% on time is not the cheapest — open a row for the orders behind its number.</Note></div>
      </>}

      {top === 'otif' && tab === 'order' && <>
        <Card className="mb-3"><div className="flex items-center gap-3 flex-wrap px-3 py-2.5">
          <Seg value={otifOnly} onChange={setOtifOnly} options={[
            { id:'all', label:'All', count: rows.filter(r => vendor === 'all' || r.o.vendorId === vendor).length },
            { id:'fail', label:'Failed one or both', count: count('Delayed') + count('IF fail'), hint:'late, short, or both — the orders worth asking about' },
            { id:'Delayed', label:'Late', count: count('Delayed') },
            { id:'IF fail', label:'Short', count: count('IF fail') },
            { id:'OTIF', label:'Clean', count: count('OTIF') },
            { id:'Pending', label:'Not shipped yet', count: count('Pending') },
          ]} />
          <Select value={vendor} onChange={v => set('factory', v === 'all' ? null : v)} style={{ width:'auto' }}
            options={[{ value:'all', label:`Every factory · ${byVendor.length}` }, ...byVendor.map(x => ({ value:x.v.id, label:`${x.v.name}${x.n ? ` · ${Math.round((x.otif / x.n) * 100)}% OTIF` : ''}` }))]} />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="PO number or style" style={{ width:180 }} />
          {(vendor !== 'all' || otifOnly !== 'all' || search.trim()) &&
            <Button size="sm" variant="ghost" onClick={() => { set('factory', null); setOtifOnly('all'); setSearch(''); }}>Clear</Button>}
          <span className="ml-auto flex items-center gap-3">{ex.strip}<ExportButton filename="otif-by-order" rows={orders} cols={[
            { label:'PO', get: (r: typeof orders[number]) => r.o.poNo ?? '' },
            { label:'Style', get: r => r.o.styleName },
            { label:'Factory', get: r => vendorName(r.o.vendorId) },
            { label:'Merchant', get: r => r.o.merchant },
            { label:'Target inhouse', get: r => r.o.targetInhouse },
            { label:'Dispatched', get: r => r.o.milestones.find(m => m.key === 'Dispatch')?.actual ?? '' },
            { label:'Cut', get: r => r.o.cutQty ?? '' },
            { label:'Delivered', get: r => r.o.deliveredQty ?? '' },
            { label:'OTIF', get: r => r.otif },
          ]} /></span>
        </div></Card>

        {orders.length === 0 ? <Card><Empty title="Nothing matches those filters." body="Loosen one, or clear the search." /></Card> : <Card><table className="t">
          <thead><tr><th>PO</th><th>Style</th><th>Factory</th><th>Merchant</th><th>Target</th><th>Dispatched</th><th className="num">Cut</th><th className="num">Delivered</th><th>OTIF</th></tr></thead>
          <tbody>{pager.pageRows.map(({ o, otif }) => <tr key={o.id}>
            <td className="mono text-[12.5px]">{o.poNo}</td><td className="text-[12.5px]">{o.styleName}</td>
            <td className="text-[12.5px]"><VendorLink id={o.vendorId}>{vendorName(o.vendorId)}</VendorLink></td><td className="text-[12.5px]">{o.merchant}</td>
            <td>{fmtDate(o.targetInhouse)}</td><td>{fmtDate(o.milestones.find(m => m.key === 'Dispatch')?.actual ?? null)}</td>
            <td className="num">{o.cutQty ?? '—'}</td><td className="num">{o.deliveredQty ?? '—'}</td>
            <td><Pill tone={otif === 'OTIF' ? 'good' : otif === 'Delayed' ? 'risk' : otif === 'IF fail' ? 'warn' : 'neutral'}>{otif}</Pill></td>
          </tr>)}</tbody>
        </table>
        <Pager page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} from={pager.from} to={pager.to} total={pager.total} noun="orders" />
        </Card>}
      </>}
    </Page>
  );
}


/* ---------- Daily Monitor: today's snapshot, the stage tracker, PO status by group ---- */
function DailyMonitor() {
  const { db } = useApp();
  const open = db.orders.filter(o => o.status === 'Open');
  const withRisk = open.map(o => ({ o, r: riskOf(o) }));
  const today = iso(TODAY);
  const week = iso(addDays(TODAY, 7));
  const cfg = trackerConfig();
  const snap = {
    active: open.length,
    dueWeek: open.filter(o => o.targetInhouse >= today && o.targetInhouse <= week).length,
    overdue: open.filter(o => o.targetInhouse < today).length,
    onTrack: withRisk.filter(x => x.r.risk === 'on-track').length,
    risky: withRisk.filter(x => x.r.risk === 'at-risk' || x.r.risk === 'critical').length,
    delayed: withRisk.filter(x => x.r.risk === 'delayed').length,
    completed: db.orders.filter(o => o.status === 'Closed' && o.milestones.some(m => m.key === 'Inhouse ETA' && m.actual)).length,
  };
  const pct = (n: number, d: number) => d ? `${Math.round((n / d) * 100)}%` : '—';
  /* milestone stage tracker: should be complete = plan ≤ today; actually complete = actual set; delayed = actual > plan */
  const stages = (MILESTONES as readonly string[]).map(k => { const ms = open.map(o => o.milestones.find(m => m.key === k)).filter((m): m is NonNullable<typeof m> => !!m);
    const should = ms.filter(m => (m.revised ?? m.plan) <= today).length; const done = ms.filter(m => !!m.actual).length; const late = ms.filter(m => m.actual && m.actual > m.plan).length; const notYet = ms.filter(m => !m.actual && (m.revised ?? m.plan) <= today).length;
    const onTime = should ? Math.round(((done - late) / should) * 100) : null;
    return { k, n: ms.length, should, done, late, notYet, onTime, health: !should ? '—' : notYet === 0 && late === 0 ? 'on track' : notYet > 0 ? 'behind' : 'slipping' }; }).filter(s => s.n > 0);
  /* quantity progress by floor stage */
  const qty = [['Cutting', 'Cutting End'], ['Stitching', 'Stitching End'], ['Finishing', 'Finishing End'], ['Dispatch', 'Dispatch'], ['Inhouse', 'Inhouse ETA']].map(([label, key]) => {
    const ref = open.reduce((a, o) => a + (o.cutQty ?? o.orderQty), 0);
    const planned = open.filter(o => { const m = o.milestones.find(x => x.key === key); return m && (m.revised ?? m.plan) <= today; }).reduce((a, o) => a + (o.cutQty ?? o.orderQty), 0);
    const done = open.filter(o => o.milestones.find(x => x.key === key)?.actual).reduce((a, o) => a + (o.cutQty ?? o.orderQty), 0);
    return { label, ref, planned, done, pending: Math.max(0, planned - done) }; });
  /* PO-level status by category / vendor / merchant */
  const group = (label: string, keyOf: (o: ProductionOrder) => string, keys: string[]) => keys.map(k => { const mine = withRisk.filter(x => keyOf(x.o) === k); return { k, total: db.orders.filter(o => keyOf(o) === k && o.status !== 'Cancelled').length, active: mine.length, dueWeek: mine.filter(x => x.o.targetInhouse >= today && x.o.targetInhouse <= week).length, overdue: mine.filter(x => x.o.targetInhouse < today).length, onTrack: mine.filter(x => x.r.risk === 'on-track').length, risky: mine.filter(x => x.r.risk === 'at-risk' || x.r.risk === 'critical').length, delayed: mine.filter(x => x.r.risk === 'delayed').length, completed: db.orders.filter(o => keyOf(o) === k && o.status === 'Closed').length }; }).filter(r => r.total > 0);
  const vName = (o: ProductionOrder) => db.vendors.find(v => v.id === o.vendorId)?.name ?? '—';
  const groups = [
    { label:'By category', rows: group('category', o => o.category, [...GARMENT_CATEGORIES]) },
    { label:'By vendor', rows: group('vendor', vName, [...new Set(db.orders.map(vName))].sort()) },
    { label:'By merchant', rows: group('merchant', o => o.merchant ?? '—', [...MERCHANDISERS, '—']) },
  ];
  const faint = { color:'var(--ink-faint)' } as const;
  return <>
    <Stats items={[
      { label:'Active POs', value: snap.active },
      { label:'Due this week', value: snap.dueWeek, tone: snap.dueWeek ? 'warn' : undefined },
      { label:'Overdue · target passed', value: snap.overdue, tone: snap.overdue ? 'risk' : 'good' },
      { label:'On track', value: `${snap.onTrack} · ${pct(snap.onTrack, snap.active)}`, tone:'good' },
      { label:`At risk / critical · buffer ≤ ${cfg.risk.atRiskBufferDays}d`, value: snap.risky, tone: snap.risky ? 'warn' : 'good' },
      { label:'Delayed', value: snap.delayed, tone: snap.delayed ? 'risk' : 'good' },
      { label:'Completed · inhoused', value: snap.completed },
    ]} />
    <div className="label mt-3">Milestone stage tracker · open POs</div>
    <Card><table className="t compact">
      <thead><tr><th>Milestone</th><th className="num">On these POs</th><th className="num">Should be complete</th><th className="num">Actually complete</th><th className="num">Delayed · actual after plan</th><th className="num">Not yet started</th><th className="num">On time %</th><th>Stage health</th></tr></thead>
      <tbody>{stages.map(s => <tr key={s.k}><td className="font-medium">{s.k}</td><td className="num">{s.n}</td><td className="num">{s.should}</td><td className="num">{s.done}</td><td className="num" style={{ color: s.late ? 'var(--risk)' : undefined }}>{s.late}</td><td className="num" style={{ color: s.notYet ? 'var(--warn)' : undefined }}>{s.notYet}</td><td className="num">{s.onTime == null ? '—' : `${Math.max(0, s.onTime)}%`}</td><td><Pill tone={s.health === 'on track' ? 'good' : s.health === 'behind' ? 'risk' : s.health === 'slipping' ? 'warn' : 'neutral'}>{s.health}</Pill></td></tr>)}</tbody>
    </table></Card>
    <div className="text-[11.5px] mt-1" style={faint}>Should be complete = planned (or revised) date on or before today. On time % = completed on or before plan, over what should be complete.</div>
    <div className="label mt-3">Quantity progress · plan vs actual, pieces</div>
    <Card><table className="t compact">
      <thead><tr><th>Stage</th><th className="num">Ref qty</th><th className="num">Planned by today</th><th className="num">Done</th><th className="num">Pending</th><th className="num">Completion</th></tr></thead>
      <tbody>{qty.map(q => <tr key={q.label}><td className="font-medium">{q.label}</td><td className="num">{q.ref.toLocaleString('en-IN')}</td><td className="num">{q.planned.toLocaleString('en-IN')}</td><td className="num" style={{ color:'var(--good)' }}>{q.done.toLocaleString('en-IN')}</td><td className="num" style={{ color: q.pending ? 'var(--warn)' : undefined }}>{q.pending.toLocaleString('en-IN')}</td><td className="num">{pct(q.done, q.planned)}</td></tr>)}</tbody>
    </table></Card>
    {groups.map(g => <div key={g.label}><div className="label mt-3">PO-level status · {g.label.toLowerCase()}</div>
      <Card><table className="t compact">
        <thead><tr><th>{g.label.replace('By ', '')}</th><th className="num">Total POs</th><th className="num">Active</th><th className="num">Due this week</th><th className="num">Overdue</th><th className="num">On track</th><th className="num">At risk / critical</th><th className="num">Delayed</th><th className="num">Completed</th></tr></thead>
        <tbody>{g.rows.map(r => <tr key={r.k}><td className="font-medium">{r.k}</td><td className="num">{r.total}</td><td className="num">{r.active}</td><td className="num">{r.dueWeek}</td><td className="num" style={{ color: r.overdue ? 'var(--risk)' : undefined }}>{r.overdue}</td><td className="num">{r.onTrack}</td><td className="num" style={{ color: r.risky ? 'var(--warn)' : undefined }}>{r.risky}</td><td className="num" style={{ color: r.delayed ? 'var(--risk)' : undefined }}>{r.delayed}</td><td className="num">{r.completed}</td></tr>)}</tbody>
      </table></Card></div>)}
    <div className="mt-3"><Note>The Daily Monitor tab, with no reference-date cell to override: it is always today, read off the tracker's rows.</Note></div>
  </>;
}

/* ---------- Escalation log: every open PO whose buffer is gone, with the ask ------- */
const RECOMMEND: Record<string, string> = { delayed:'URGENT: immediate recovery plan — agree a revised inhouse date with the factory and tell planning', critical:'CRITICAL: expedite the current stage — daily follow-up until the next milestone lands', 'at-risk':'WATCH: confirm the next milestone date with the factory this week' };
function EscalationLog() {
  const { db, updateEscalation } = useApp();
  const rows = db.orders.filter(o => o.status === 'Open').map(o => ({ o, r: riskOf(o), e: db.escalations.find(e => e.orderId === o.id && e.status !== 'Resolved') ?? null })).filter(x => ['delayed', 'critical', 'at-risk'].includes(x.r.risk))
    .sort((a, b) => ({ delayed:0, critical:1, 'at-risk':2 } as Record<string, number>)[a.r.risk] - ({ delayed:0, critical:1, 'at-risk':2 } as Record<string, number>)[b.r.risk] || (a.r.bufferDays ?? 0) - (b.r.bufferDays ?? 0));
  const [merchant, setMerchant] = useState('all');
  const vName = (id: string | null) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const shown = rows.filter(x => merchant === 'all' || x.o.merchant === merchant);
  const n = (k: Risk) => rows.filter(x => x.r.risk === k).length;
  const byM = MERCHANDISERS.map(m => ({ m, n: rows.filter(x => x.o.merchant === m).length }));
  return <>
    <Stats items={[{ label:'POs needing action', value: rows.length, tone: rows.length ? 'risk' : 'good' }, { label:'Delayed', value: n('delayed'), tone: n('delayed') ? 'risk' : undefined }, { label:'Critical', value: n('critical'), tone: n('critical') ? 'warn' : undefined }, { label:'At risk', value: n('at-risk') }, ...byM.map(x => ({ label: x.m, value: x.n }))]} />
    <Card className="mb-3"><div className="flex items-center gap-3 flex-wrap px-3 py-2.5"><Seg value={merchant} onChange={setMerchant} options={[{ id:'all', label:'Every merchant', count: rows.length }, ...byM.map(x => ({ id:x.m, label:x.m, count:x.n }))]} /></div></Card>
    {shown.length === 0 ? <Card><Empty title="Nothing to escalate." body="Every open PO still has its buffer." /></Card> : <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><th>Merchant</th><th>PO</th><th>Style</th><th>Vendor</th><th>Risk</th><th>Last milestone</th><th>Target inhouse</th><th>Expected</th><th className="num">Days impact</th><th>Recommended action</th><th>Escalation</th></tr></thead>
      <tbody>{shown.map(({ o, r, e }) => <tr key={o.id}>
        <td className="text-[12.5px]">{o.merchant ?? '—'}</td>
        <td className="mono text-[12.5px]"><a className="vlink" href={`#/tracker?open=${o.id}`}>{o.poNo}</a></td>
        <td className="text-[12.5px]">{o.styleName}<div style={{ color:'var(--ink-faint)' }}>{o.category}</div></td>
        <td className="text-[12.5px]"><VendorLink id={o.vendorId}>{vName(o.vendorId)}</VendorLink></td>
        <td><Pill tone={r.risk === 'delayed' ? 'risk' : r.risk === 'critical' ? 'warn' : 'info'}>{r.risk.replace('-', ' ')}</Pill></td>
        <td className="text-[12.5px]">{r.lastMilestone ?? '—'}{r.flagged && <div style={{ color:'var(--warn)' }}>stuck at {r.flagged.key}</div>}</td>
        <td>{fmtDate(o.targetInhouse)}</td><td style={{ color: r.bufferDays != null && r.bufferDays < 0 ? 'var(--risk)' : undefined }}>{fmtDate(r.expectedInhouse)}</td>
        <td className="num" style={{ color: r.bufferDays != null && r.bufferDays < 0 ? 'var(--risk)' : undefined }}>{r.bufferDays != null ? (r.bufferDays < 0 ? `${-r.bufferDays}d late` : `${r.bufferDays}d left`) : '—'}</td>
        <td className="text-[12px]" style={{ whiteSpace:'normal', minWidth: 220 }}>{e?.recoveryAction || RECOMMEND[r.risk]}</td>
        <td>{e ? <div className="flex gap-1 items-center flex-wrap"><Pill tone={e.status === 'Open' ? 'risk' : e.status === 'Acknowledged' ? 'warn' : 'good'}>{e.status.toLowerCase()}</Pill>{e.status === 'Open' && <Button size="sm" onClick={() => updateEscalation(e.id, { status:'Acknowledged' })}>Acknowledge</Button>}{e.status === 'Acknowledged' && <Button size="sm" onClick={() => updateEscalation(e.id, { status:'Resolved', resolutionNotes: 'recovered — closed from the escalation log' })}>Resolve</Button>}</div> : <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>not raised yet</span>}</td>
      </tr>)}</tbody>
    </table></div></Card>}
    <div className="mt-3"><Note>The Escalation Log tab, auto-populated: any open PO that is delayed, critical or at risk, with the last milestone that landed, the expected inhouse date, the days of impact and the recommended action. Raising, acknowledging and resolving lives on the order itself; this is the list.</Note></div>
  </>;
}

/* ---------- Merchandiser alerts: overdue and due-soon milestones, per merchant ------- */
function AlertDashboard() {
  const { db, notifyMerchant, role } = useApp();
  const [window, setWindow] = useState('3');
  const [merchant, setMerchant] = useState('all');
  const [kind, setKind] = useState<'all' | 'overdue' | 'due'>('all');
  const w = Math.max(0, Number(window) || 0);
  const today = iso(TODAY); const until = iso(addDays(TODAY, w));
  const canSend = role === 'production' || role === 'planning' || role === 'owner';
  const vName = (id: string | null) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const rows = db.orders.filter(o => o.status === 'Open').flatMap(o => o.milestones.filter(m => !m.actual).map(m => { const eff = m.revised ?? m.plan; const type: 'overdue' | 'due' | null = eff < today ? 'overdue' : eff <= until ? 'due' : null; return type ? { o, m, eff, type, daysLeft: -daysAgo(eff), r: riskOf(o), sent: o.activity.some(a => a.what.startsWith(`Alert sent to`) && a.what.includes(m.key)) } : null; }).filter((x): x is NonNullable<typeof x> => !!x))
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const shown = rows.filter(x => (merchant === 'all' || x.o.merchant === merchant) && (kind === 'all' || x.type === kind));
  const byM = MERCHANDISERS.map(m => ({ m, n: rows.filter(x => x.o.merchant === m).length, overdue: rows.filter(x => x.o.merchant === m && x.type === 'overdue').length }));
  const pager = usePager(shown, 40);
  return <>
    <Stats items={[{ label:'Alerts', value: rows.length }, { label:'Overdue', value: rows.filter(x => x.type === 'overdue').length, tone: rows.some(x => x.type === 'overdue') ? 'risk' : 'good' }, { label:`Due within ${w} day${w === 1 ? '' : 's'}`, value: rows.filter(x => x.type === 'due').length, tone:'warn' }, ...byM.map(x => ({ label: x.m, value: `${x.n} · ${x.overdue} overdue` }))]} />
    <Card className="mb-3"><div className="flex items-center gap-3 flex-wrap px-3 py-2.5">
      <Seg value={kind} onChange={v => setKind(v as typeof kind)} options={[{ id:'all', label:'All', count: rows.length }, { id:'overdue', label:'Overdue', count: rows.filter(x => x.type === 'overdue').length }, { id:'due', label:'Due soon', count: rows.filter(x => x.type === 'due').length }]} />
      <Select value={merchant} onChange={setMerchant} style={{ width:'auto' }} options={[{ value:'all', label:'Every merchant' }, ...MERCHANDISERS.map(m => ({ value:m, label:m }))]} />
      <div style={{ width: 150 }}><Field label="Alert window · days ahead"><Input type="number" min={0} max={30} value={window} onChange={e => setWindow(e.target.value)} /></Field></div>
    </div></Card>
    {shown.length === 0 ? <Card><Empty title="No alerts." body="Nothing is overdue or due inside the window." /></Card> : <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><th>Merchant</th><th>PO</th><th>Style</th><th>Vendor</th><th>Stage</th><th>Alert</th><th>Effective date</th><th className="num">Days left</th><th>Planned</th><th>Revised</th><th>Target inhouse</th><th>Risk</th><th></th></tr></thead>
      <tbody>{pager.pageRows.map(({ o, m, eff, type, daysLeft, r, sent }) => <tr key={`${o.id}-${m.key}`}>
        <td className="text-[12.5px]">{o.merchant ?? '—'}</td>
        <td className="mono text-[12.5px]"><a className="vlink" href={`#/tracker?open=${o.id}`}>{o.poNo}</a></td>
        <td className="text-[12.5px]">{o.styleName}<div style={{ color:'var(--ink-faint)' }}>{o.category}</div></td>
        <td className="text-[12.5px]"><VendorLink id={o.vendorId}>{vName(o.vendorId)}</VendorLink></td>
        <td className="font-medium">{m.key}</td>
        <td><Pill tone={type === 'overdue' ? 'risk' : 'warn'}>{type === 'overdue' ? 'overdue' : `due in ${daysLeft}d`}</Pill></td>
        <td>{fmtDate(eff)}</td><td className="num" style={{ color: daysLeft < 0 ? 'var(--risk)' : undefined }}>{daysLeft}</td>
        <td style={{ color:'var(--ink-faint)' }}>{fmtDate(m.plan)}</td><td style={{ color: m.revised ? 'var(--warn)' : 'var(--line)' }}>{m.revised ? fmtDate(m.revised) : '—'}</td><td>{fmtDate(o.targetInhouse)}</td>
        <td><Pill tone={r.risk === 'delayed' ? 'risk' : r.risk === 'critical' || r.risk === 'at-risk' ? 'warn' : 'neutral'}>{r.risk.replace('-', ' ')}</Pill></td>
        <td>{sent ? <Pill tone="good">sent</Pill> : canSend ? <Button size="sm" onClick={() => notifyMerchant(o.id, m.key, type)}>Send to {o.merchant?.split(' ')[0] ?? 'merchant'}</Button> : <ActsBy role="production" does="sends the alert to the merchandiser" inline />}</td>
      </tr>)}</tbody>
    </table></div><Pager page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} from={pager.from} to={pager.to} total={pager.total} noun="alerts" /></Card>}
    <div className="mt-3"><Note>The Alert Dashboard tab: one line per milestone that is overdue or falls inside the window, grouped by merchandiser. "Send" puts the alert on the order's log instead of an email drafted in a cell; the merchandiser sees it on their own screen.</Note></div>
  </>;
}
