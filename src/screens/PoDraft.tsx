/* Draft a PO (19 Nov 2026, Parag): the PO is category's. One PO can carry several requirements: category picks the
   factory, ticks the requirements that factory has quoted on, and drafts one PO. It goes to the HOD and finance as one
   request; approved, every style on it gets the same PO number and the PO is mailed. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { ApproverRole } from '../domain/types';
import { fmtDate, fmtMoney, TODAY, addDays } from '../domain/engines';
import { poReadyOf, poDraftOf, poTotalsOf, replyFlagsOf, approvalOf, poGroupOf, landsAtOf } from '../domain/rtwPack';
import { Page, Card, Pill, Drawer, Empty, Stats, Input, Select, Button, Field, Seg } from '../ui';
import { RtwRequirement } from './RtwRequirement';

const faint = { color: 'var(--ink-faint)' } as const; const soft = { color: 'var(--ink-soft)' } as const;
const NEEDS: { id: string; label: string; needs: ApproverRole[] }[] = [{ id: 'both', label: 'Both HOD and finance', needs: ['hod', 'finance'] }, { id: 'hod', label: 'Only HOD', needs: ['hod'] }, { id: 'finance', label: 'Only finance', needs: ['finance'] }];
const dIn = (d: Date) => d.toISOString().slice(0, 10);

export function PoDraft() {
  const { db, role, askCombinedPo } = useApp();
  const can = role === 'design' || role === 'owner';
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };
  const view = (params.get('view') ?? 'ready') as 'ready' | 'sent';
  const ready = poReadyOf(db);
  const nameOf = (id: string) => db.vendors.find(v => v.id === id)?.name ?? id;
  /* the factories that have quoted on something ready, the one with the most first */
  const facs = [...new Set(ready.flatMap(o => o.costQuery!.replies.map(r => r.vendorId)))].map(id => ({ id, n: ready.filter(o => o.costQuery!.replies.some(r => r.vendorId === id)).length })).sort((a, b) => b.n - a.n);
  const [fac, setFac] = useState(''); const vendorId = fac && facs.some(f => f.id === fac) ? fac : (facs[0]?.id ?? '');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [needs, setNeeds] = useState('both'); const [by, setBy] = useState(dIn(addDays(TODAY, 3))); const [note, setNote] = useState('');
  const rows = ready.filter(o => o.costQuery!.replies.some(r => r.vendorId === vendorId)).map(o => { const r = o.costQuery!.replies.find(x => x.vendorId === vendorId)!; const t = poTotalsOf(poDraftOf(o, r.cost, r.lines)); const low = Math.min(...o.costQuery!.replies.map(x => x.cost));
    return { o, r, t, fl: replyFlagsOf(o, r), lowest: r.cost <= low, low }; });
  const sel = rows.filter(x => picked.has(x.o.id)); const pcs = sel.reduce((a, x) => a + x.t.pcs, 0); const total = sel.reduce((a, x) => a + x.t.total, 0);
  const dests = [...new Set(sel.map(x => landsAtOf(x.o)))];
  const toggle = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every(x => picked.has(x.o.id));
  /* what is already with the approvers, one row per PO */
  const sentGroups = (() => { const seen = new Set<string>(); const out: ReturnType<typeof poGroupOf>[] = [];
    db.orders.filter(o => o.poApproval && o.poApproval.kind !== 'revision' && !o.poNo).forEach(o => { const g = poGroupOf(db, o); const key = g.id ?? o.id; if (seen.has(key)) return; seen.add(key); out.push(g); }); return out; })();
  const active = db.orders.find(o => o.id === (params.get('open') ?? '').split(':')[0]) ?? null;

  return <Page title="Draft a PO" lede="Pick a factory, tick the requirements it has quoted on, and draft one PO. It goes to the HOD and finance for approval; approved, it is raised and mailed by itself.">
    <Stats items={[
      { label: 'Requirements ready for a PO', value: ready.length, tone: ready.length ? 'warn' : 'good' },
      { label: 'Factories that quoted', value: facs.length },
      { label: 'With HOD and finance', value: sentGroups.filter(g => approvalOf(g.rows[0].o).state === 'pending').length },
      { label: 'Rejected · to change', value: sentGroups.filter(g => approvalOf(g.rows[0].o).state === 'rejected').length, tone: sentGroups.some(g => approvalOf(g.rows[0].o).state === 'rejected') ? 'risk' : 'good' },
    ]} />
    <div className="pb-3"><Seg value={view} onChange={v => set('view', v === 'ready' ? null : v)} options={[{ id: 'ready', label: 'Ready for a PO', count: ready.length }, { id: 'sent', label: 'Sent for approval', count: sentGroups.length }]} /></div>

    {view === 'ready' && (ready.length === 0 ? <Card><Empty title="No requirement is ready for a PO." body="A requirement is ready once a factory has quoted and its SKUs are in Enigma." /></Card> : <>
      <Card className="mb-3"><div className="px-3 py-2.5 flex items-end gap-3 flex-wrap">
        <div style={{ flex: '0 1 340px' }}><Field label="The factory this PO goes to"><Select value={vendorId} onChange={v => { setFac(v); setPicked(new Set()); }} options={facs.map(f => ({ value: f.id, label: `${nameOf(f.id)} · quoted on ${f.n} requirement${f.n === 1 ? '' : 's'}` }))} /></Field></div>
        <span className="text-[12px] pb-1.5" style={faint}>One PO goes to one factory. Only the requirements this factory quoted on are listed.</span>
      </div></Card>
      <Card><table className="t m-cards">
        <thead><tr><th style={{ width: 34 }}><input type="checkbox" aria-label="all" checked={allOn} disabled={!can} onChange={() => setPicked(allOn ? new Set() : new Set(rows.map(x => x.o.id)))} /></th><th>Requirement</th><th className="num">Pcs</th><th className="num">Quoted ₹ / pc</th><th>Lead · in-house</th><th>Against target</th><th>Delivers to</th><th className="num">Value incl. GST</th></tr></thead>
        <tbody>{rows.map(({ o, r, t, fl, lowest, low }) => <tr key={o.id} className={`row${picked.has(o.id) ? ' po-pick-on' : ''}`} onClick={() => can && toggle(o.id)}>
          <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={picked.has(o.id)} disabled={!can} onChange={() => toggle(o.id)} aria-label={o.styleName} /></td>
          <td><div className="font-medium">{o.styleName}</div><div className="text-[11.5px]" style={faint}>{o.category} · {o.enigmaProduct?.code} · <button type="button" className="vlink" onClick={e => { e.stopPropagation(); set('open', `${o.id}:query`); }}>open</button>{approvalOf(o).state === 'rejected' ? <span style={{ color: 'var(--risk)' }}> · earlier draft rejected</span> : null}</div></td>
          <td className="num">{t.pcs}</td>
          <td className="num">{fmtMoney(r.cost)}{!lowest && <div className="text-[10.5px]" style={{ color: 'var(--warn)' }}>lowest quote {fmtMoney(low)}</div>}</td>
          <td className="text-[12px]">{r.leadDays} d · {fmtDate(fl.inhouseOn)}</td>
          <td className="text-[12px]" style={{ color: fl.flagged ? 'var(--risk)' : 'var(--good)' }}>{fl.flagged ? [fl.costOver > 0 ? `${fmtMoney(fl.costOver)} over` : null, fl.lateDays > 0 ? `${fl.lateDays}d late` : null].filter(Boolean).join(' · ') : 'fits'}</td>
          <td className="text-[12px]">{landsAtOf(o)}</td>
          <td className="num font-semibold">{fmtMoney(Math.round(t.total))}</td>
        </tr>)}</tbody>
      </table></Card>
      <div className="po-bar">
        <div className="po-bar-sum"><b>{sel.length ? `One PO · ${sel.length} requirement${sel.length === 1 ? '' : 's'}` : 'Tick the requirements for this PO'}</b>
          {sel.length > 0 && <span>{nameOf(vendorId)} · {pcs.toLocaleString('en-IN')} pcs · <b>{fmtMoney(Math.round(total))}</b> incl. GST{dests.length > 1 ? <em> · delivers to {dests.length} places, each on its own line</em> : dests[0] ? ` · to ${dests[0]}` : ''}</span>}</div>
        {can ? <div className="po-bar-acts">
          <Field label="Approval from"><Select value={needs} onChange={setNeeds} options={NEEDS.map(n => ({ value: n.id, label: n.label }))} /></Field>
          <Field label="Approve by"><Input type="date" value={by} onChange={e => setBy(e.target.value)} /></Field>
          <div style={{ flex: '1 1 160px' }}><Field label="Note for the approvers"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="optional" /></Field></div>
          <Button variant="primary" disabled={!sel.length || !by} onClick={() => { askCombinedPo(sel.map(x => x.o.id), vendorId, NEEDS.find(n => n.id === needs)!.needs, new Date(by).toISOString(), note.trim() || null); setPicked(new Set()); setNote(''); set('view', 'sent'); }}>Draft the PO · send for approval →</Button>
        </div> : <span className="text-[12.5px]" style={soft}>Category drafts the PO.</span>}
      </div>
      <div className="text-[11.5px] pt-2" style={faint}>Each requirement goes on the PO at the rate this factory quoted, on its own sizes. To change a rate, the terms or the charges on one style, open it and draft from there.</div>
    </>)}

    {view === 'sent' && (sentGroups.length === 0 ? <Card><Empty title="Nothing is with the approvers." body="" /></Card> : <Card><table className="t m-cards">
      <thead><tr><th>PO draft</th><th>Factory</th><th className="num">Styles</th><th className="num">Pcs</th><th className="num">Value incl. GST</th><th>Approve by</th><th>Status</th></tr></thead>
      <tbody>{sentGroups.map(g => { const o = g.rows[0].o; const ap = approvalOf(o); const a = o.poApproval!;
        return <tr key={g.id ?? o.id} className="row" onClick={() => set('open', `${o.id}:approval`)}>
          <td><div className="font-medium">{g.many ? `${g.rows.length} styles on one PO` : o.styleName}</div><div className="text-[11.5px]" style={{ ...faint, whiteSpace: 'normal' }}>{g.many ? g.rows.map(r => r.o.styleName).join(' · ') : o.category}</div></td>
          <td className="text-[12.5px]">{nameOf(a.vendorId)}</td><td className="num">{g.rows.length}</td><td className="num">{g.pcs.toLocaleString('en-IN')}</td><td className="num font-semibold">{fmtMoney(Math.round(g.total))}</td>
          <td className="text-[12.5px]">{fmtDate(a.deadline)}</td>
          <td><Pill tone={ap.state === 'approved' ? 'good' : ap.state === 'rejected' || ap.late ? 'risk' : 'warn'}>{ap.line}</Pill></td>
        </tr>; })}</tbody>
    </table></Card>)}

    <Drawer open={!!active} onClose={() => set('open', null)} title={active?.styleName ?? ''} subtitle={active && <span>{active.category} · {active.orderQty} pcs</span>}>
      {active && <RtwRequirement key={params.get('open')!} o={active} initial={params.get('open')!.split(':')[1] ?? 'approval'} />}
    </Drawer>
  </Page>;
}
