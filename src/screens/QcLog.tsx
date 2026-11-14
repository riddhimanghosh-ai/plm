/* Every QC result in one list — PP sample and size set pass / not passed, the three line inspections, with the
   technical and aesthetic remarks. The merchandiser reads it for their factories; QC reads it as its history. */
import { useState } from 'react';
import { useApp } from '../store';
import type { ProductionOrder, QcCheck, QcPoint } from '../domain/types';
import { fmtDate } from '../domain/engines';
import { QC_POINTS } from '../domain/reference';
import { Card, Pill, Empty, Input, MultiFilter, passes } from '../ui';
import { VendorLink } from './Vendors';

const LABEL = Object.fromEntries(QC_POINTS.map(p => [p.key, p.label])) as Record<QcPoint, string>;
type Row = { o: ProductionOrder; c: QcCheck };
export function qcLogOf(orders: ProductionOrder[]): Row[] {
  return orders.flatMap(o => (o.qcChecks ?? []).map(c => ({ o, c }))).sort((a, b) => b.c.on.localeCompare(a.c.on));
}
export function QcLog({ orders, onOpen, factoryName, kind = 'all' }: { orders: ProductionOrder[]; onOpen: (id: string) => void; factoryName: (id: string | null) => string; kind?: 'all' | 'samples' | 'inspections' }) {
  const { db } = useApp();
  const all = qcLogOf(orders).filter(r => kind === 'all' || (kind === 'samples' ? (r.c.point === 'pps' || r.c.point === 'size-set') : (r.c.point !== 'pps' && r.c.point !== 'size-set')));
  const [point, setPoint] = useState<string[]>([]); const [result, setResult] = useState<string[]>([]); const [fac, setFac] = useState<string[]>([]); const [q, setQ] = useState('');
  const factories = [...new Set(all.map(r => r.o.vendorId).filter(Boolean))] as string[];
  const shown = all.filter(r => passes(point, r.c.point)).filter(r => passes(result, r.c.result)).filter(r => passes(fac, r.o.vendorId))
    .filter(r => !q.trim() || `${r.o.styleName} ${r.o.poNo ?? ''} ${factoryName(r.o.vendorId)}`.toLowerCase().includes(q.trim().toLowerCase()));
  const [showAll, setShowAll] = useState(false);
  const shownAll = shown; const shownRows = showAll ? shownAll : (() => { const seen = new Set<string>(); return shownAll.filter(r => { const k = `${r.c.point}·${r.c.result}`; if (seen.has(k)) return false; seen.add(k); return true; }); })();
  const faint = { color: 'var(--ink-faint)' } as const;
  const points = QC_POINTS.filter(p => all.some(r => r.c.point === p.key));
  return <>
    <Card className="mb-3"><div className="px-3 py-2.5 flex items-end gap-3 flex-wrap">
      <MultiFilter value={result} onChange={setResult} label="Result" options={[{ id: 'all', label: 'All', count: all.length }, { id: 'pass', label: 'Passed', count: all.filter(r => r.c.result === 'pass').length }, { id: 'fail', label: 'Not passed', count: all.filter(r => r.c.result === 'fail').length }]} />
      <MultiFilter value={point} onChange={setPoint} label="Point" options={[{ id: 'all', label: 'Every point' }, ...points.map(p => ({ id: p.key, label: p.label, count: all.filter(r => r.c.point === p.key).length }))]} />
      {factories.length > 1 && <MultiFilter value={fac} onChange={setFac} label="Factory" options={[{ id: 'all', label: 'All' }, ...factories.map(id => ({ id, label: factoryName(id), count: all.filter(r => r.o.vendorId === id).length }))]} />}
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="style, PO or factory" style={{ width: 190 }} />
    </div></Card>
    {shown.length === 0 ? <Card><Empty title="No QC results here yet." body="" /></Card> : <Card><table className="t">
      <thead><tr><th>When</th><th>PO · style</th><th>Factory</th><th>Point</th><th>Result</th><th>Technical remarks</th><th>Aesthetic remarks</th><th>By</th></tr></thead>
      <tbody>{shownRows.map(({ o, c }, i) => <tr key={i} className="row" onClick={() => onOpen(o.id)} style={{ background: c.result === 'fail' ? 'color-mix(in srgb, var(--risk) 4%, transparent)' : undefined }}>
        <td className="text-[12px]" style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.on)}</td>
        <td><div className="mono text-[12px]">{o.poNo}</div><div className="font-medium text-[12.5px]">{o.styleName}</div></td>
        <td className="text-[12.5px]"><VendorLink id={o.vendorId} /><div className="text-[11px]" style={faint}>{db.vendors.find(v => v.id === o.vendorId)?.region}</div></td>
        <td className="text-[12.5px]">{LABEL[c.point]}</td>
        <td><Pill tone={c.result === 'pass' ? 'good' : 'risk'}>{c.result === 'pass' ? 'passed' : 'not passed'}</Pill></td>
        <td className="text-[12px]" style={{ whiteSpace: 'normal', maxWidth: 280, color: c.result === 'fail' ? 'var(--risk)' : undefined }}>{c.remarks || <span style={faint}>—</span>}</td>
        <td className="text-[12px]" style={{ whiteSpace: 'normal', maxWidth: 240, fontStyle: 'italic', color: 'var(--ink-soft)' }}>{c.aesthetic || <span style={{ ...faint, fontStyle: 'normal' }}>—</span>}</td>
        <td className="text-[11.5px]" style={faint}>{c.by}</td>
      </tr>)}</tbody>
    </table></Card>}
    {shownAll.length > shownRows.length || showAll ? <div className="text-[12px] pt-2" style={faint}>{showAll ? `${shownAll.length} shown · ` : `${shownRows.length} of ${shownAll.length} shown, one of each kind · `}<button type="button" className="vlink" onClick={() => setShowAll(v => !v)}>{showAll ? 'show one of each' : `show all ${shownAll.length}`}</button></div> : null}
  </>;
}
