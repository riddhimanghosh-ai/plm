/* PO approvals (17 Nov 2026): the HOD's and finance's screen. Every PO request sent for approval, what is waiting
   on me first; each row says whether it needs both approvals or one, and by when. A row opens the same style
   record at the approval step: the request, every reply, and what factories priced for the category before. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { ApproverRole, ProductionOrder } from '../domain/types';
import { fmtDate, fmtMoney, daysAgo } from '../domain/engines';
import { approvalOf, poEditOf, poTotalsOf, APPROVER_LABEL } from '../domain/rtwPack';
import { Page, Card, Pill, Drawer, Empty, Seg, Stats, Input, MultiFilter, passes } from '../ui';
import { RtwRequirement } from './RtwRequirement';

export function Approvals({ as }: { as: ApproverRole }) {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };
  const view = (params.get('view') ?? 'mine') as 'mine' | 'all';
  const [q, setQ] = useState(''); const [cats, setCats] = useState<string[]>([]);
  const nameOf = (id: string) => db.vendors.find(v => v.id === id)?.name ?? id;
  /* two kinds of ask reach an approver: a PO (new or revised) to approve, and edit access on a raised PO */
  type Row = { o: ProductionOrder; kind: 'po' | 'revision' | 'edit'; mine: boolean; late: boolean; deadline: string | null; needs: ApproverRole[]; status: string; tone: 'good' | 'warn' | 'risk' | 'neutral'; value: number };
  const all: Row[] = db.orders.flatMap(o => { const out: Row[] = [];
    if (o.poApproval?.needs.includes(as)) { const ap = approvalOf(o); const a = o.poApproval; const d = [...a.decisions].reverse().find(x => x.role === as) ?? null; const mine = ap.state === 'pending' && ap.pending.includes(as);
      out.push({ o, kind: a.kind === 'revision' ? 'revision' : 'po', mine, late: mine && ap.late, deadline: a.deadline, needs: a.needs, value: a.doc ? poTotalsOf(a.doc).total : (o.costQuery?.replies.find(r => r.vendorId === a.vendorId)?.cost ?? 0) * o.orderQty,
        status: mine ? 'waiting on you' : d ? (d.approved ? 'you approved' : 'you rejected') : ap.line, tone: mine ? (ap.late ? 'risk' : 'warn') : d && !d.approved ? 'risk' : 'good' }); }
    if (o.poEdit?.needs.includes(as)) { const ed = poEditOf(o); const g = [...o.poEdit.grants].reverse().find(x => x.role === as) ?? null; const mine = ed.state === 'pending' && ed.pending.includes(as);
      out.push({ o, kind: 'edit', mine, late: false, deadline: null, needs: o.poEdit.needs, value: o.poDoc ? poTotalsOf(o.poDoc).total : 0, status: mine ? 'waiting on you' : g ? (g.granted ? 'you gave access' : 'you declined') : 'pending', tone: mine ? 'warn' : g && !g.granted ? 'risk' : 'good' }); }
    return out; });
  const mine = all.filter(x => x.mine); const late = mine.filter(x => x.late);
  const rows = (view === 'mine' ? mine : all).filter(x => passes(cats, x.o.category)).filter(x => !q.trim() || `${x.o.styleName} ${x.o.poNo ?? ''} ${nameOf(x.o.poApproval?.vendorId ?? x.o.vendorId ?? '')}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || (a.deadline ?? '').localeCompare(b.deadline ?? ''));
  const KIND = { po: 'new PO', revision: 'revised PO', edit: 'edit access' } as const;
  const active = db.orders.find(o => o.id === (params.get('open') ?? '').split(':')[0]) ?? null;
  const faint = { color: 'var(--ink-faint)' } as const;

  return <Page title={`PO approvals · ${APPROVER_LABEL[as]}`} lede="POs waiting on your approval, and requests for edit access on raised POs.">
    <Stats items={[
      { label: 'Waiting on you', value: mine.length, tone: mine.length ? 'warn' : 'good' },
      { label: 'Past the approve-by date', value: late.length, tone: late.length ? 'risk' : 'good' },
      { label: 'Value waiting', value: fmtMoney(Math.round(mine.reduce((a, x) => a + x.value, 0))) },
      { label: 'Decided by you', value: all.filter(x => !x.mine && /^you /.test(x.status)).length },
    ]} />
    <Card className="mb-3"><div className="px-3 py-2.5 flex items-end gap-3 flex-wrap">
      <Seg value={view} onChange={v => set('view', v === 'mine' ? null : v)} options={[{ id: 'mine', label: 'Pending for approval', count: mine.length }, { id: 'all', label: 'Every request', count: all.length }]} />
      <MultiFilter label="Category" value={cats} onChange={setCats} width={220} options={[{ id: 'all', label: 'Every category' }, ...[...new Set(all.map(x => x.o.category))].map(c => ({ id: c, label: c }))]} />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="style or factory" style={{ width: 200 }} />
    </div></Card>
    {rows.length === 0 ? <Card><Empty title={view === 'mine' ? 'Nothing waiting on you.' : 'Nothing matches.'} body="" /></Card> : <Card><table className="t">
      <thead><tr><th>Style</th><th>Ask</th><th>Factory</th><th className="num">PO value</th><th>Needed from</th><th>By</th><th>Status</th></tr></thead>
      <tbody>{rows.map(r => { const o = r.o; const a = o.poApproval;
        return <tr key={o.id + r.kind} className="row" onClick={() => set('open', `${o.id}:${r.kind === 'edit' ? 'po' : 'approval'}`)}>
          <td><div className="font-medium">{o.styleName}</div><div className="text-[11.5px]" style={faint}>{o.category} · {o.orderQty} pcs{o.poNo ? ` · ${o.poNo}` : ''}</div></td>
          <td><Pill tone={r.kind === 'po' ? 'info' : r.kind === 'revision' ? 'warn' : 'neutral'}>{KIND[r.kind]}</Pill>{r.kind === 'edit' && <div className="text-[11px] pt-0.5" style={{ ...faint, whiteSpace: 'normal', maxWidth: 200 }}>{o.poEdit!.reason}</div>}{r.kind !== 'edit' && a?.note && <div className="text-[11px] pt-0.5" style={{ ...faint, whiteSpace: 'normal', maxWidth: 200 }}>{a.note}</div>}</td>
          <td className="text-[12.5px]">{nameOf(r.kind === 'edit' ? (o.vendorId ?? '') : a!.vendorId)}</td>
          <td className="num">{fmtMoney(Math.round(r.value))}</td>
          <td><Pill tone={r.needs.length === 2 ? 'info' : 'neutral'}>{r.needs.length === 2 ? 'both HOD and finance' : `only ${APPROVER_LABEL[r.needs[0]]}`}</Pill></td>
          <td className="text-[12.5px]" style={{ whiteSpace: 'nowrap', color: r.late ? 'var(--risk)' : undefined }}>{r.deadline ? fmtDate(r.deadline) : '—'}{r.late && <div className="text-[11px]">{daysAgo(r.deadline!)}d past</div>}</td>
          <td><Pill tone={r.tone}>{r.status}</Pill></td>
        </tr>; })}</tbody>
    </table></Card>}
    <Drawer open={!!active} onClose={() => set('open', null)} title={active?.styleName ?? ''} subtitle={active && <span>{active.category} · {active.orderQty} pcs</span>}>
      {active && <RtwRequirement key={params.get('open')!} o={active} initial={params.get('open')!.split(':')[1] ?? 'approval'} scope={as} />}
    </Drawer>
  </Page>;
}
