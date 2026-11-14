/* The merchandiser's follow-ups (14 Nov 2026): a regional head over several factories, who chases
   what the factories owe BSC — cost replies past their deadline, TNA forms not returned, TNA steps
   running late, QC fails awaiting resubmission — and sees QC's remarks. How they reach the factory
   is theirs; PLM shows what is owed and by whom. */
import { useState } from 'react';
import { useApp } from '../store';
import type { ProductionOrder } from '../domain/types';
import { fmtDate, daysAgo } from '../domain/engines';
import { qcPointsOf } from '../domain/rtwPack';
import { Card, Pill, Empty, Seg, Stats, Input } from '../ui';
import { VendorLink } from './Vendors';

type Kind = 'cost' | 'form' | 'late' | 'qc';
type Item = { kind: Kind; o: ProductionOrder; vendorId: string | null; what: string; since: string | null; days: number; tone: 'warn' | 'risk' | 'good'; step: string; remarks?: string };
const KIND_LABEL: Record<Kind, string> = { cost: 'Cost reply owed', form: 'TNA form owed', late: 'TNA step late', qc: 'QC remarks' };

export function merchandiserItemsOf(orders: ProductionOrder[]): Item[] {
  const out: Item[] = [];
  orders.forEach(o => {
    const cq = o.costQuery;
    if (cq && !o.poNo && o.status !== 'Cancelled') cq.factoryIds.filter(id => !cq.replies.some(r => r.vendorId === id)).forEach(id => { const past = daysAgo(cq.deadline); out.push({ kind: 'cost', o, vendorId: id, what: `cost reply · deadline ${fmtDate(cq.deadline)}`, since: cq.sentOn, days: past, tone: past > 0 ? 'risk' : 'warn', step: 'query' }); });
    if (o.status === 'Open' && o.poNo) {
      if (o.tnaPlan && !o.tnaPlan.submittedOn) { const d = daysAgo(o.tnaPlan.sentOn); out.push({ kind: 'form', o, vendorId: o.vendorId, what: `TNA form · planned dates · sent with the PO ${fmtDate(o.tnaPlan.sentOn)}`, since: o.tnaPlan.sentOn, days: d, tone: d > 3 ? 'risk' : 'warn', step: 'plan' }); }
      const next = o.milestones.find(m => !m.actual && !m.skipped); const due = next ? (next.revised ?? next.plan) : null;
      if (next && due && daysAgo(due) > 0) out.push({ kind: 'late', o, vendorId: o.vendorId, what: `${next.key} · planned ${fmtDate(next.plan)}${next.revised ? ` · revised ${fmtDate(next.revised)}` : ''}`, since: due, days: daysAgo(due), tone: daysAgo(due) > 5 ? 'risk' : 'warn', step: 'tna' });
      qcPointsOf(o).forEach(pt => { if (pt.state === 'failed' && pt.last) out.push({ kind: 'qc', o, vendorId: o.vendorId, what: `${pt.label} failed ${fmtDate(pt.last.on)} · factory to correct and resubmit`, since: pt.last.on, days: daysAgo(pt.last.on), tone: 'risk', step: 'tna', remarks: pt.last.remarks });
        else if (pt.state === 'passed' && pt.last && daysAgo(pt.last.on) <= 7) out.push({ kind: 'qc', o, vendorId: o.vendorId, what: `${pt.label} passed ${fmtDate(pt.last.on)}`, since: pt.last.on, days: 0, tone: 'good', step: 'tna', remarks: pt.last.remarks }); });
    }
  });
  return out.sort((a, b) => (a.tone === 'good' ? 1 : 0) - (b.tone === 'good' ? 1 : 0) || b.days - a.days);
}

export function MerchandiserDesk({ orders, onOpen, factoryName }: { orders: ProductionOrder[]; onOpen: (id: string, step: string) => void; factoryName: (id: string | null) => string }) {
  const { db } = useApp();
  const items = merchandiserItemsOf(orders);
  const [kind, setKind] = useState<'all' | Kind>('all'); const [fac, setFac] = useState('all'); const [q, setQ] = useState('');
  const factories = [...new Set(items.map(i => i.vendorId).filter(Boolean))] as string[];
  const shown = items.filter(i => kind === 'all' || i.kind === kind).filter(i => fac === 'all' || i.vendorId === fac).filter(i => !q.trim() || `${i.o.styleName} ${i.o.poNo ?? ''} ${factoryName(i.vendorId)}`.toLowerCase().includes(q.trim().toLowerCase()));
  const n = (k: Kind) => items.filter(i => i.kind === k && i.tone !== 'good').length;
  const faint = { color: 'var(--ink-faint)' } as const;
  return <>
    <Stats items={[
      { label: 'Cost replies owed', value: n('cost'), tone: n('cost') ? 'warn' : undefined },
      { label: 'TNA forms owed', value: n('form'), tone: n('form') ? 'warn' : undefined },
      { label: 'TNA steps late', value: n('late'), tone: n('late') ? 'risk' : undefined },
      { label: 'QC fails to resubmit', value: n('qc'), tone: n('qc') ? 'risk' : undefined },
    ]} />
    <Card className="mb-3"><div className="px-3 py-2.5 flex items-center gap-2 flex-wrap">
      <Seg value={kind} onChange={v => setKind(v as 'all' | Kind)} options={[{ id: 'all', label: 'Everything', count: items.length }, ...(['cost', 'form', 'late', 'qc'] as Kind[]).map(k => ({ id: k, label: KIND_LABEL[k], count: items.filter(i => i.kind === k).length }))]} />
      <Seg value={fac} onChange={setFac} label="Factory" options={[{ id: 'all', label: 'All my factories' }, ...factories.map(id => ({ id, label: factoryName(id), count: items.filter(i => i.vendorId === id && i.tone !== 'good').length }))]} />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="style, PO or factory" style={{ width: 200 }} />
    </div></Card>
    {shown.length === 0 ? <Card><Empty title="Nothing owed by the factories right now." body="" /></Card> : <Card><table className="t">
      <thead><tr><th>Owed</th><th>Factory</th><th>PO · style</th><th>What</th><th>Since</th><th>Remarks</th></tr></thead>
      <tbody>{shown.map((i, k) => <tr key={k} className="row" onClick={() => onOpen(i.o.id, i.step)}>
        <td><Pill tone={i.tone}>{i.tone === 'good' ? 'passed' : KIND_LABEL[i.kind]}</Pill></td>
        <td className="text-[12.5px]"><VendorLink id={i.vendorId} /><div className="text-[11px]" style={faint}>{db.vendors.find(v => v.id === i.vendorId)?.region}</div></td>
        <td><div className="mono text-[12px]">{i.o.poNo ?? 'no PO yet'}</div><div className="font-medium text-[12.5px]">{i.o.styleName}</div></td>
        <td className="text-[12.5px]">{i.what}</td>
        <td className="text-[12px]" style={{ whiteSpace: 'nowrap', color: i.tone === 'risk' ? 'var(--risk)' : undefined }}>{i.since ? fmtDate(i.since) : '—'}{i.days > 0 && i.tone !== 'good' ? ` · ${i.days}d` : ''}</td>
        <td className="text-[12px]" style={{ whiteSpace: 'normal', maxWidth: 260, color: i.tone === 'risk' && i.kind === 'qc' ? 'var(--risk)' : 'var(--ink-soft)' }}>{i.remarks ?? <span style={faint}>—</span>}</td>
      </tr>)}</tbody>
    </table></Card>}
  </>;
}
