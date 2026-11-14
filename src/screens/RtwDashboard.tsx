/* The RTW production dashboard (15 Nov 2026): what Parag and Nitin look at first. OTIF and the numbers behind
   it, read straight off the POs — the KPIs themselves are to be settled with BSC during development, so each
   tile says how it is counted. The analytics screen (OTIF by factory, daily monitor, escalations) sits beside it. */
import { useApp } from '../store';
import { fmtDate, otifOf, riskOf, daysAgo, daysBetween } from '../domain/engines';
import { rtwStatusOf, RTW_STATUSES } from '../domain/rtwJourney';
import { qcPointsOf, targetReviseOpenOf } from '../domain/rtwPack';
import { Page, Card, Pill, Stats, Why } from '../ui';
import { VendorLink } from './Vendors';

export function RtwDashboard() {
  const { db } = useApp();
  const orders = db.orders.filter(o => o.status !== 'Cancelled');
  const open = orders.filter(o => o.status === 'Open' && o.poNo);
  const closed = orders.filter(o => o.status === 'Closed');
  const recent = closed.filter(o => { const d = o.milestones.find(m => m.key === 'Dispatch')?.actual; return d && daysAgo(d) <= 90; });
  const otif = recent.filter(o => otifOf(o) === 'OTIF').length; const otifPct = recent.length ? Math.round(otif * 100 / recent.length) : null;
  const late = open.filter(o => (riskOf(o).bufferDays ?? 0) < 0);
  const critical = open.filter(o => riskOf(o).risk === 'critical');
  const checks = orders.flatMap(o => o.qcChecks ?? []); const firstChecks = orders.flatMap(o => { const seen = new Set<string>(); return (o.qcChecks ?? []).filter(c => { if (seen.has(c.point)) return false; seen.add(c.point); return true; }); });
  const firstPass = firstChecks.length ? Math.round(firstChecks.filter(c => c.result === 'pass').length * 100 / firstChecks.length) : null;
  const queries = orders.filter(o => !o.poNo && o.costQuery); const queriesLate = queries.filter(o => daysAgo(o.costQuery!.deadline) > 0 && o.costQuery!.replies.length < o.costQuery!.factoryIds.length);
  const revise = orders.filter(o => targetReviseOpenOf(o).open);
  const formsOwed = open.filter(o => o.tnaPlan && !o.tnaPlan.submittedOn);
  const qcWaiting = open.flatMap(o => qcPointsOf(o).filter(p => p.state === 'due' || p.state === 'failed'));
  const ratioOpen = open.filter(o => (o.cutRatios ?? []).some(c => !c.given));
  const leadDays = recent.map(o => { const d = o.milestones.find(m => m.key === 'Dispatch')?.actual; return o.poDate && d ? daysBetween(o.poDate, d) : null; }).filter((x): x is number => x != null);
  const avgLead = leadDays.length ? Math.round(leadDays.reduce((a, b) => a + b, 0) / leadDays.length) : null;
  const pcsOpen = open.reduce((a, o) => a + o.orderQty, 0);
  /* by factory */
  const factories = [...new Set(open.map(o => o.vendorId).filter(Boolean))] as string[];
  const byFactory = factories.map(id => { const mine = open.filter(o => o.vendorId === id); const done = recent.filter(o => o.vendorId === id); const fails = orders.filter(o => o.vendorId === id).flatMap(o => o.qcChecks ?? []).filter(c => c.result === 'fail').length;
    return { id, pos: mine.length, pcs: mine.reduce((a, o) => a + o.orderQty, 0), late: mine.filter(o => (riskOf(o).bufferDays ?? 0) < 0).length, otif: done.length ? Math.round(done.filter(o => otifOf(o) === 'OTIF').length * 100 / done.length) : null, fails, next: mine.map(o => o.targetInhouse).sort()[0] ?? null }; })
    .sort((a, b) => b.late - a.late || b.pos - a.pos);
  const byStatus = RTW_STATUSES.map(s => ({ ...s, n: orders.filter(o => rtwStatusOf(db, o).key === s.key).length }));
  const faint = { color: 'var(--ink-faint)' } as const;
  return <Page title="RTW production dashboard" lede="One look at every bulk style: on time and in full, what is late, what is waiting on whom. The KPIs and their exact counting are to be settled with BSC during development; each tile says how it is counted today."
    replaces="the OTIF tab and Daily Monitor on the tracker sheet"
    actions={<a className="vlink text-[12.5px]" href="#/otif">Analytics · OTIF by factory, daily monitor, escalations →</a>}>
    <Stats items={[
      { label: 'OTIF · last 90 days', value: otifPct != null ? `${otifPct}%` : '—', tone: otifPct != null ? (otifPct >= 85 ? 'good' : otifPct >= 70 ? 'warn' : 'risk') : undefined },
      { label: 'Open POs · pieces', value: `${open.length} · ${pcsOpen.toLocaleString('en-IN')}` },
      { label: 'Running late', value: late.length, tone: late.length ? 'risk' : 'good' },
      { label: 'QC first-pass rate', value: firstPass != null ? `${firstPass}%` : '—', tone: firstPass != null ? (firstPass >= 85 ? 'good' : 'warn') : undefined },
      { label: 'PO → dispatch · avg days', value: avgLead ?? '—' },
    ]} />
    <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      <Card><div className="px-4 py-3">
        <div className="cap">Waiting on someone</div>
        {[
          ['Counter-sourcing replies past deadline', queriesLate.length, 'factories · merchandiser', '#/tracker'],
          ['Every reply over target · category to revise', revise.length, 'category', '#/design'],
          ['TNA forms owed', formsOwed.length, 'merchandiser', '#/factory?side=rtw&tab=desk'],
          ['QC points waiting', qcWaiting.length, 'QC', '#/qc'],
          ['New cut ratio pending', ratioOpen.length, 'category', '#/design?pending=New%20cut%20ratio%20pending'],
          ['Critical · under 7 days of buffer', critical.length, 'Nitin', '#/tracker'],
        ].map(([l, n, who, href]) => <div key={String(l)} className="kv"><span className="k"><a className="vlink" href={String(href)}>{l}</a><span className="text-[11px] block" style={faint}>{who}</span></span><span className="v"><b style={{ color: Number(n) ? 'var(--risk)' : 'var(--good)' }}>{n}</b></span></div>)}
      </div></Card>
      <Card><div className="px-4 py-3">
        <div className="cap">Where every style is</div>
        {byStatus.map(s => <div key={s.key} className="kv"><span className="k">{s.label}<span className="text-[11px] block" style={faint}>{s.hint}</span></span><span className="v"><b>{s.n}</b></span></div>)}
      </div></Card>
    </div>
    <Card>
      <div className="px-4 pt-3 pb-1 flex items-center gap-2"><div className="cap">By factory · open POs</div><Why rule="OTIF = dispatched on or before the target in-house date, and delivered within ±3% of the cut quantity; on POs dispatched in the last 90 days. Late = the expected in-house date is past the target.">how these are counted</Why></div>
      <table className="t">
        <thead><tr><th>Factory</th><th className="num">Open POs</th><th className="num">Pieces</th><th className="num">Late</th><th>OTIF · 90 d</th><th className="num">QC fails · all time</th><th>Next due</th></tr></thead>
        <tbody>{byFactory.map(f => <tr key={f.id}>
          <td><VendorLink id={f.id} /><div className="text-[11px]" style={faint}>{db.vendors.find(v => v.id === f.id)?.region}</div></td>
          <td className="num">{f.pos}</td><td className="num">{f.pcs.toLocaleString('en-IN')}</td>
          <td className="num" style={{ color: f.late ? 'var(--risk)' : undefined, fontWeight: f.late ? 600 : undefined }}>{f.late || '—'}</td>
          <td>{f.otif != null ? <Pill tone={f.otif >= 85 ? 'good' : f.otif >= 70 ? 'warn' : 'risk'}>{f.otif}%</Pill> : <span style={faint}>nothing delivered yet</span>}</td>
          <td className="num">{f.fails || '—'}</td>
          <td className="text-[12px]" style={{ whiteSpace: 'nowrap' }}>{f.next ? fmtDate(f.next) : '—'}</td>
        </tr>)}</tbody>
      </table>
      <div className="px-4 py-2 text-[11.5px]" style={faint}>{checks.length} QC results on record · {recent.length} POs dispatched in the last 90 days. OTIF, lead time and the QC rate will be re-defined with Parag during development.</div>
    </Card>
  </Page>;
}
