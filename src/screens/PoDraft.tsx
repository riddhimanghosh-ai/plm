/* Draft a PO (19 Nov 2026, Parag): the PO is category's. The screen lists every counter-sourcing query that has no PO yet,
   with each factory's reply and the one PLM recommends (on price and the in-house date). Category ticks requirements, sees
   the drafted PO first, then sends it to the HOD and finance. One PO goes to one factory and can carry several requirements;
   every style on it gets the same PO number. A requirement can be ticked only once its SKUs are in Enigma. */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { ApproverRole, CostReply, ProductionOrder } from '../domain/types';
import { fmtDate, fmtMoney, TODAY, addDays } from '../domain/engines';
import { poDraftOf, poTotalsOf, replyFlagsOf, approvalOf, poGroupOf, landsAtOf } from '../domain/rtwPack';
import { Page, Card, Pill, Drawer, Empty, Stats, Input, Select, Button, Field, Seg, MultiFilter, passes } from '../ui';
import { RtwRequirement } from './RtwRequirement';

const faint = { color: 'var(--ink-faint)' } as const; const soft = { color: 'var(--ink-soft)' } as const;
const NEEDS: { id: string; label: string; needs: ApproverRole[] }[] = [{ id: 'both', label: 'Both HOD and finance', needs: ['hod', 'finance'] }, { id: 'hod', label: 'Only HOD', needs: ['hod'] }, { id: 'finance', label: 'Only finance', needs: ['finance'] }];
const dIn = (d: Date) => d.toISOString().slice(0, 10);
type By = 'both' | 'price' | 'date';
/* the factory PLM recommends on a requirement: the lowest price among the replies that reach in-house on time; when none does,
   the lowest price overall. "price" and "date" rank on one of the two alone. */
function recommendOf(o: ProductionOrder, by: By): { r: CostReply; why: string } | null {
  const rs = o.costQuery?.replies ?? []; if (!rs.length) return null;
  const f = (r: CostReply) => replyFlagsOf(o, r);
  if (by === 'price') return { r: [...rs].sort((a, b) => a.cost - b.cost)[0], why: 'lowest price' };
  if (by === 'date') return { r: [...rs].sort((a, b) => f(a).inhouseOn.localeCompare(f(b).inhouseOn) || a.cost - b.cost)[0], why: 'earliest in-house' };
  const onTime = rs.filter(r => f(r).lateDays === 0);
  if (onTime.length) return { r: [...onTime].sort((a, b) => a.cost - b.cost)[0], why: onTime.length === rs.length ? 'lowest price · in-house on time' : 'lowest price that is in-house on time' };
  return { r: [...rs].sort((a, b) => a.cost - b.cost || f(a).lateDays - f(b).lateDays)[0], why: 'none is on time · lowest price' };
}

export function PoDraft() {
  const { db, role, askCombinedPo } = useApp();
  const can = role === 'design' || role === 'owner';
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };
  const view = (params.get('view') ?? 'open') as 'open' | 'sent';
  const nameOf = (id: string) => db.vendors.find(v => v.id === id)?.name ?? id;
  const [by, setBy] = useState<By>('both'); const [state, setState] = useState('all'); const [recFac, setRecFac] = useState<string[]>([]); const [q, setQ] = useState('');
  const [choice, setChoice] = useState<Record<string, string>>({});   // the factory picked per requirement, when it is not the recommended one
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState(false);
  const [needs, setNeeds] = useState('both'); const [due, setDue] = useState(dIn(addDays(TODAY, 3))); const [note, setNote] = useState('');

  /* every counter-sourcing query without a PO or a draft with the approvers */
  const all = db.orders.filter(o => !o.poNo && o.status !== 'Cancelled' && !!o.costQuery && (approvalOf(o).state === 'none' || approvalOf(o).state === 'rejected')).map(o => {
    const cq = o.costQuery!; const rec = recommendOf(o, by); const vendorId = choice[o.id] && cq.replies.some(r => r.vendorId === choice[o.id]) ? choice[o.id] : (rec?.r.vendorId ?? null);
    const st = !cq.replies.length ? 'waiting' : !o.enigmaProduct ? 'enigma' : 'ready';
    return { o, cq, rec, vendorId, st: st as 'waiting' | 'enigma' | 'ready' }; });
  const n = (k: string) => all.filter(x => x.st === k).length;
  const recFacs = [...new Set(all.map(x => x.rec?.r.vendorId).filter(Boolean))] as string[];
  const rows = all.filter(x => state === 'all' || x.st === state).filter(x => passes(recFac, x.rec?.r.vendorId ?? '')).filter(x => !q.trim() || `${x.o.styleName} ${x.cq.factoryIds.map(nameOf).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => ['ready', 'enigma', 'waiting'].indexOf(a.st) - ['ready', 'enigma', 'waiting'].indexOf(b.st));
  const sel = all.filter(x => picked.has(x.o.id) && x.st === 'ready' && x.vendorId);
  /* one PO per factory: the ticked requirements grouped by the factory picked on each */
  const drafts = [...new Set(sel.map(x => x.vendorId!))].map(vid => { const items = sel.filter(x => x.vendorId === vid).map(x => { const r = x.cq.replies.find(y => y.vendorId === vid)!; const doc = poDraftOf(x.o, r.cost, r.lines); return { o: x.o, r, doc, t: poTotalsOf(doc) }; });
    return { vendorId: vid, items, pcs: items.reduce((a, i) => a + i.t.pcs, 0), value: items.reduce((a, i) => a + i.t.value, 0), gst: items.reduce((a, i) => a + i.t.gst, 0), total: items.reduce((a, i) => a + i.t.total, 0) }; });
  const toggle = (id: string) => setPicked(s => { const m = new Set(s); if (m.has(id)) m.delete(id); else m.add(id); return m; });
  const send = () => { drafts.forEach(d => askCombinedPo(d.items.map(i => i.o.id), d.vendorId, NEEDS.find(x => x.id === needs)!.needs, new Date(due).toISOString(), note.trim() || null)); setPicked(new Set()); setNote(''); setPreview(false); set('view', 'sent'); };
  /* what is already with the approvers, one row per PO */
  const sentGroups = (() => { const seen = new Set<string>(); const out: ReturnType<typeof poGroupOf>[] = [];
    db.orders.filter(o => o.poApproval && o.poApproval.kind !== 'revision' && !o.poNo && approvalOf(o).state !== 'rejected').forEach(o => { const g = poGroupOf(db, o); const key = g.id ?? o.id; if (seen.has(key)) return; seen.add(key); out.push(g); }); return out; })();
  const active = db.orders.find(o => o.id === (params.get('open') ?? '').split(':')[0]) ?? null;

  return <Page title="Draft a PO" lede="Every counter-sourcing query without a PO, with each factory's reply and the one recommended on price and in-house date. Tick requirements, see the drafted PO, then send it to the HOD and finance.">
    <Stats items={[
      { label: 'Ready for a PO', value: n('ready'), tone: n('ready') ? 'warn' : 'good' },
      { label: 'SKUs to add to Enigma first', value: n('enigma'), tone: n('enigma') ? 'warn' : 'good' },
      { label: 'Waiting on factory replies', value: n('waiting') },
      { label: 'With HOD and finance', value: sentGroups.length },
    ]} />
    <div className="pb-3"><Seg value={view} onChange={v => set('view', v === 'open' ? null : v)} options={[{ id: 'open', label: 'Counter sourcing · no PO yet', count: all.length }, { id: 'sent', label: 'Sent for approval', count: sentGroups.length }]} /></div>

    {view === 'open' && <>
      <div className="po-bar">
        <div className="po-bar-sum"><b>{sel.length ? `${drafts.length === 1 ? 'One PO' : `${drafts.length} POs · one per factory`} · ${sel.length} requirement${sel.length === 1 ? '' : 's'}` : 'Tick the requirements to put on a PO'}</b>
          {sel.length > 0 && <span>{drafts.map(d => `${nameOf(d.vendorId)} · ${d.items.length} style${d.items.length === 1 ? '' : 's'} · ${fmtMoney(Math.round(d.total))}`).join('  |  ')}</span>}
          <span className="ml-auto">{can ? <Button variant="primary" disabled={!sel.length} onClick={() => setPreview(true)}>Draft PO →</Button> : <span className="text-[12.5px]" style={soft}>Category drafts the PO.</span>}</span></div>
        <div className="text-[11.5px]" style={faint}>A PO is drafted only after the style is in Enigma. Requirements ticked for the same factory go on one PO.</div>
      </div>
      <Card className="mb-3"><div className="px-3 py-2.5 flex items-end gap-3 flex-wrap">
        <Field label="Show"><Select value={state} onChange={setState} options={[{ value: 'all', label: `Every query · ${all.length}` }, { value: 'ready', label: `Ready for a PO · ${n('ready')}` }, { value: 'enigma', label: `SKUs not in Enigma yet · ${n('enigma')}` }, { value: 'waiting', label: `No reply yet · ${n('waiting')}` }]} /></Field>
        <Field label="Recommend on"><Select value={by} onChange={v => setBy(v as By)} options={[{ value: 'both', label: 'Price and in-house date' }, { value: 'price', label: 'Lowest price' }, { value: 'date', label: 'Earliest in-house' }]} /></Field>
        <MultiFilter label="Recommended factory" value={recFac} onChange={setRecFac} width={230} options={[{ id: 'all', label: 'Any factory' }, ...recFacs.map(id => ({ id, label: nameOf(id), count: all.filter(x => x.rec?.r.vendorId === id).length }))]} />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="style or factory" style={{ width: 190 }} />
      </div></Card>
      {rows.length === 0 ? <Card><Empty title={all.length ? 'Nothing matches.' : 'No counter-sourcing query is open.'} body="" /></Card> : <Card><table className="t po-cs">
        <thead><tr><th style={{ width: 34 }}></th><th>Requirement</th><th>Target</th><th>Replies · pick the factory for the PO</th><th className="num">PO value</th><th>Status</th></tr></thead>
        <tbody>{rows.map(({ o, cq, rec, vendorId, st }) => { const on = picked.has(o.id); const pr = cq.replies.find(r => r.vendorId === vendorId) ?? null; const t = pr ? poTotalsOf(poDraftOf(o, pr.cost, pr.lines)) : null; const waiting = cq.factoryIds.filter(id => !cq.replies.some(r => r.vendorId === id));
          return <tr key={o.id} className={on ? 'po-pick-on' : ''}>
            <td><input type="checkbox" checked={on} disabled={!can || st !== 'ready'} onChange={() => toggle(o.id)} aria-label={o.styleName} title={st === 'enigma' ? 'add the SKUs to Enigma first' : st === 'waiting' ? 'no factory has replied yet' : undefined} /></td>
            <td style={{ whiteSpace: 'normal', minWidth: 190 }}><button type="button" className="vlink font-medium" style={{ textAlign: 'left' }} onClick={() => set('open', `${o.id}:query`)}>{o.styleName}</button><div className="text-[11.5px]" style={faint}>{o.category} · {o.orderQty} pcs · to {landsAtOf(o)}{approvalOf(o).state === 'rejected' ? <span style={{ color: 'var(--risk)' }}> · earlier draft rejected</span> : null}</div></td>
            <td className="text-[12px]" style={{ whiteSpace: 'nowrap' }}><b>{fmtMoney(o.targetCost)}</b>/pc<div style={faint}>in-house {fmtDate(o.targetInhouse)}</div></td>
            <td style={{ whiteSpace: 'normal' }}><div className="po-reps">
              {[...cq.replies].sort((a, b) => a.cost - b.cost).map(r => { const fl = replyFlagsOf(o, r); const isRec = rec?.r.vendorId === r.vendorId; const isOn = vendorId === r.vendorId;
                return <button key={r.vendorId} type="button" className={`po-rep${isOn ? ' on' : ''}${isRec ? ' rec' : ''}`} disabled={!can} onClick={() => setChoice(c => ({ ...c, [o.id]: r.vendorId }))} title={isRec ? `Recommended: ${rec!.why}` : undefined}>
                  <span className="po-rep-n">{isRec && <em>★ recommended</em>}{nameOf(r.vendorId)}</span>
                  <span className="po-rep-v"><b style={{ color: fl.costOver > 0 ? 'var(--risk)' : undefined }}>{fmtMoney(r.cost)}</b>{fl.costOver > 0 ? ` +${fmtMoney(fl.costOver)}` : ''} · <span style={{ color: fl.lateDays > 0 ? 'var(--risk)' : 'var(--good)' }}>{fmtDate(fl.inhouseOn)}{fl.lateDays > 0 ? ` · ${fl.lateDays}d late` : ' · on time'}</span></span>
                </button>; })}
              {waiting.length > 0 && <span className="po-rep-wait">no reply: {waiting.map(nameOf).join(', ')}</span>}
            </div>{rec && <div className="text-[11px] pt-1" style={faint}>{rec.why}{vendorId !== rec.r.vendorId ? <> · <span style={{ color: 'var(--warn)' }}>you picked {nameOf(vendorId!)}</span> · <button type="button" className="vlink" onClick={() => setChoice(c => { const m = { ...c }; delete m[o.id]; return m; })}>back to the recommended</button></> : null}</div>}</td>
            <td className="num font-semibold">{t ? fmtMoney(Math.round(t.total)) : '—'}{t && <div className="text-[10.5px] font-normal" style={faint}>incl. GST</div>}</td>
            <td>{st === 'ready' ? <Pill tone="good">ready · SKUs in Enigma</Pill> : st === 'enigma' ? <button type="button" onClick={() => set('open', `${o.id}:launch`)}><Pill tone="warn">add the SKUs to Enigma first →</Pill></button> : <Pill tone="neutral">waiting on replies · due {fmtDate(cq.deadline)}</Pill>}</td>
          </tr>; })}</tbody>
      </table></Card>}
    </>}

    {view === 'sent' && (sentGroups.length === 0 ? <Card><Empty title="Nothing is with the approvers." body="" /></Card> : <Card><table className="t m-cards">
      <thead><tr><th>PO draft</th><th>Factory</th><th className="num">Styles</th><th className="num">Pcs</th><th className="num">Value incl. GST</th><th>Approve by</th><th>Status</th></tr></thead>
      <tbody>{sentGroups.map(g => { const o = g.rows[0].o; const ap = approvalOf(o); const a = o.poApproval!;
        return <tr key={g.id ?? o.id} className="row" onClick={() => set('open', `${o.id}:approval`)}>
          <td><div className="font-medium">{g.many ? `${g.rows.length} styles on one PO` : o.styleName}</div><div className="text-[11.5px]" style={{ ...faint, whiteSpace: 'normal' }}>{g.many ? g.rows.map(r => r.o.styleName).join(' · ') : o.category}</div></td>
          <td className="text-[12.5px]">{nameOf(a.vendorId)}</td><td className="num">{g.rows.length}</td><td className="num">{g.pcs.toLocaleString('en-IN')}</td><td className="num font-semibold">{fmtMoney(Math.round(g.total))}</td>
          <td className="text-[12.5px]">{fmtDate(a.deadline)}</td>
          <td><Pill tone={ap.state === 'approved' ? 'good' : ap.late ? 'risk' : 'warn'}>{ap.line}</Pill></td>
        </tr>; })}</tbody>
    </table></Card>)}

    {/* the drafted PO, before anything is sent */}
    {preview && drafts.length > 0 && createPortal(<div className="po-prev-back" onClick={() => setPreview(false)}><div className="po-prev" onClick={e => e.stopPropagation()} role="dialog" aria-label="The drafted PO">
      <div className="po-prev-top"><b>The drafted PO{drafts.length > 1 ? `s · ${drafts.length}` : ''}</b><span style={faint}>nothing is sent until you press send</span><button type="button" onClick={() => setPreview(false)} aria-label="close">✕</button></div>
      <div className="po-prev-body">
        {drafts.map((d, k) => { const v = db.vendors.find(x => x.id === d.vendorId); const dests = [...new Set(d.items.map(i => landsAtOf(i.o)))]; const d0 = d.items[0].doc;
          return <div key={d.vendorId} className="po-sheet">
            <div className="po-sheet-h"><img src={`${import.meta.env.BASE_URL}bsc-logo-dark.png`} alt="" /><div><b>Purchase order · draft{drafts.length > 1 ? ` ${k + 1} of ${drafts.length}` : ''}</b><span>Bombay Shirt Company</span></div><div className="po-sheet-no"><span>PO number</span><b>given on approval</b></div></div>
            <div className="po-sheet-meta">
              <div><span>Factory</span><b>{v?.name ?? d.vendorId}</b><i>{v?.location}{v?.region ? ` · ${v.region}` : ''}</i></div>
              <div><span>Deliver to</span><b>{dests.join(' · ')}</b><i>{dests.length > 1 ? 'by style, as below' : ''}</i></div>
              <div><span>Payment</span><b>{d0.paymentTerms}</b><i>{d0.advancePct ? `${d0.advancePct}% ${d0.advanceWhen}` : 'no advance'}</i></div>
              <div><span>Terms</span><b>{d0.priceBasis.split(' · ')[0]} · GST {d0.gstPct}%</b><i>tolerance ±{d0.tolerancePct}% · {d0.aql}</i></div>
            </div>
            <div style={{ overflowX: 'auto' }}><table className="t compact po-sheet-t">
              <thead><tr><th>#</th><th>Style · colour</th><th>Sizes</th><th>In-house by</th><th className="num">Pcs</th><th className="num">Rate ₹</th><th className="num">Amount ₹</th></tr></thead>
              <tbody>{d.items.flatMap((it, i) => it.doc.lines.map((l, j) => { const pcs = l.sizes.reduce((a, x) => a + x.qty, 0); return <tr key={it.o.id + l.id}>
                <td>{j === 0 ? i + 1 : ''}</td>
                <td style={{ whiteSpace: 'normal' }}>{j === 0 && <div className="font-medium">{it.o.styleName}</div>}<div className="text-[11.5px]" style={faint}>{l.colour}{j === 0 ? ` · ${it.o.enigmaProduct?.code ?? ''} · to ${landsAtOf(it.o)}` : ''}</div></td>
                <td className="text-[11.5px]" style={{ whiteSpace: 'normal', minWidth: 170 }}>{l.sizes.filter(x => x.qty > 0).map(x => `${x.size} ${x.qty}`).join(' · ')}</td>
                <td className="text-[12px]" style={{ whiteSpace: 'nowrap' }}>{fmtDate(it.doc.goodsExpectedBy ?? it.o.targetInhouse)}</td>
                <td className="num">{pcs}</td><td className="num">{l.rate}</td><td className="num">{fmtMoney(Math.round(pcs * l.rate))}</td></tr>; }))}</tbody>
              <tfoot><tr><td colSpan={4} style={{ textAlign: 'right' }}>Value</td><td className="num font-semibold">{d.pcs}</td><td></td><td className="num">{fmtMoney(Math.round(d.value))}</td></tr>
                <tr><td colSpan={6} style={{ textAlign: 'right' }}>GST</td><td className="num">{fmtMoney(Math.round(d.gst))}</td></tr>
                <tr className="po-sheet-tot"><td colSpan={6} style={{ textAlign: 'right' }}>PO total</td><td className="num">{fmtMoney(Math.round(d.total))}</td></tr></tfoot>
            </table></div>
            <div className="text-[11.5px] pt-2" style={faint}>Each style is at the rate {v?.name ?? 'the factory'} quoted. To change a rate, a charge or a term on one style, open that style and draft its PO from there.</div>
          </div>; })}
      </div>
      <div className="po-prev-foot">
        <Field label="Approval from"><Select value={needs} onChange={setNeeds} options={NEEDS.map(x => ({ value: x.id, label: x.label }))} /></Field>
        <Field label="Approve by"><Input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
        <div style={{ flex: '1 1 180px' }}><Field label="Note for the approvers"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="optional" /></Field></div>
        <Button variant="ghost" onClick={() => setPreview(false)}>Back</Button>
        <Button variant="primary" disabled={!due} onClick={send}>Send {drafts.length > 1 ? `${drafts.length} POs` : 'the PO'} for approval →</Button>
      </div>
    </div></div>, document.body)}

    <Drawer open={!!active} onClose={() => set('open', null)} title={active?.styleName ?? ''} subtitle={active && <span>{active.category} · {active.orderQty} pcs</span>}>
      {active && <RtwRequirement key={params.get('open')!} o={active} initial={params.get('open')!.split(':')[1] ?? 'approval'} />}
    </Drawer>
  </Page>;
}
