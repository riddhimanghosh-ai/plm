/* PO approval (17 Nov 2026): Nitin drafts the PO on a factory's reply and sends it for approval — HOD, finance or
   both — with an approve-by date. The approvers see the PO itself, every reply, and what factories priced for the
   category before. On the last approval the PO is raised and mailed by itself; production has no send step.
   A raised PO is locked: to change it Nitin asks for edit access, edits it, and it goes for approval again. */
import { useState } from 'react';
import { useApp } from '../store';
import type { ProductionOrder, FabricBy, ApproverRole } from '../domain/types';
import { fmtDate, fmtMoney, daysAgo } from '../domain/engines';
import { approvalOf, poEditOf, poTotalsOf, replyFlagsOf, similarPricesOf, APPROVER_LABEL } from '../domain/rtwPack';
import { Section, Pill, Button, Field, Input, Select, KV } from '../ui';
import { ActsBy } from './Who';
import { PoForm, PoDocView } from './RtwChain';

const faint = { color: 'var(--ink-faint)' } as const;
const soft = { color: 'var(--ink-soft)' } as const;
const NEEDS: { id: string; label: string; needs: ApproverRole[] }[] = [
  { id: 'both', label: 'Both HOD and finance', needs: ['hod', 'finance'] },
  { id: 'hod', label: 'Only HOD', needs: ['hod'] },
  { id: 'finance', label: 'Only finance', needs: ['finance'] },
];

export function ApprovalSection({ o, prod, preset, onGo }: { o: ProductionOrder; prod: boolean; preset?: { vendorId: string; fabricBy: FabricBy } | null; onGo?: (step: string) => void }) {
  const { db, role, myRole, demoAll, askPoApproval, decidePoApproval } = useApp();
  const ap = approvalOf(o); const a = ap.a; const replies = o.costQuery?.replies ?? [];
  const nameOf = (id: string) => db.vendors.find(v => v.id === id)?.name ?? id;
  const [pick, setPick] = useState<{ vendorId: string; fabricBy: FabricBy } | null>(preset ?? null);
  const [vendorId, setVendorId] = useState([...replies].sort((x, y) => x.cost - y.cost)[0]?.vendorId ?? '');
  const [comment, setComment] = useState(''); const [again, setAgain] = useState(false);
  const similar = similarPricesOf(db, o);
  const canDecide = (r: ApproverRole) => (demoAll || role === 'owner' || myRole === r) && ap.pending.includes(r) && ap.state === 'pending';

  if (o.poNo && !a) return <Section title="PO approval" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>Raised before approvals were on PLM.</div></Section>;
  if (!replies.length) return <Section title="PO approval" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>After a factory reply.</div></Section>;
  if (!o.enigmaProduct) return <Section title="PO draft" collapsible={false}><div className="text-[12.5px] py-1" style={{ color: 'var(--warn)' }}>The PO cannot be drafted until the SKUs are in Enigma. <button type="button" className="vlink" onClick={() => onGo?.('launch')}>Add them →</button></div></Section>;

  /* drafting: the PO form, ending in "send for approval" */
  const redo = again && ap.state === 'rejected';
  if (!a || redo) {
    if (!prod) return <Section title="PO draft" collapsible={false}><ActsBy role="production" does="drafts the PO on a factory reply and sends it for approval" /></Section>;
    const cur = pick ?? (redo ? { vendorId: a!.vendorId, fabricBy: a!.fabricBy } : null);
    if (!cur) return <Section title="PO draft" collapsible={false} right={<span className="pill role-production">Nitin</span>}>
      <div className="flex gap-2 items-end flex-wrap">
        <div style={{ flex: '0 1 340px' }}><Field label="Draft the PO on"><Select value={vendorId} onChange={setVendorId} options={replies.map(r => ({ value: r.vendorId, label: `${nameOf(r.vendorId)} · ${fmtMoney(r.cost)}/pc · ${r.leadDays} d` }))} /></Field></div>
        <Button variant="primary" disabled={!vendorId} onClick={() => setPick({ vendorId, fabricBy: o.pack?.clothBy ?? 'bsc-vendor' })}>Draft the PO →</Button>
      </div>
    </Section>;
    const rp = replies.find(r => r.vendorId === cur.vendorId)!;
    return <Section title="PO draft" collapsible={false} right={<button type="button" className="vlink text-[12px]" onClick={() => onGo?.('query')}>← back to the replies</button>}>
      <PoForm key={cur.vendorId + cur.fabricBy} o={o} vendorId={cur.vendorId} rate={rp.cost} fabricBy={cur.fabricBy} initialDoc={redo && a!.vendorId === cur.vendorId ? a!.doc : null}
        onCancel={() => { setPick(null); setAgain(false); onGo?.('query'); }}
        onRaise={(d, ask) => { askPoApproval(o.id, cur.vendorId, cur.fabricBy, ask.needs, ask.deadline, ask.note, d); setAgain(false); setPick(null); }} />
    </Section>;
  }

  const rp = replies.find(r => r.vendorId === a.vendorId); const fl = rp ? replyFlagsOf(o, rp) : null; const t = a.doc ? poTotalsOf(a.doc) : null;
  const revision = a.kind === 'revision';
  return <>
    <Section title={revision ? `Revised ${o.poNo} · approval` : 'PO approval'} collapsible={false} right={<Pill tone={ap.state === 'approved' ? 'good' : ap.state === 'rejected' || ap.late ? 'risk' : 'warn'}>{ap.line}{ap.late ? ' · past the date' : ''}</Pill>}>
      <div className="grid gap-x-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <KV k="Style" v={o.styleName} note={`${o.category} · ${o.enigmaProduct?.code ?? ''}`} />
        <KV k="Factory" v={<b>{nameOf(a.vendorId)}</b>} note={rp ? `quoted ${fmtMoney(rp.cost)}/pc · ${rp.leadDays} days` : undefined} />
        <KV k="PO value" v={<b>{t ? fmtMoney(Math.round(t.total)) : rp ? fmtMoney(rp.cost * o.orderQty) : '—'}</b>} note={t ? `${t.pcs} pcs · average ${fmtMoney(Math.round(t.avgRate))}/pc · incl. GST` : undefined} />
        <KV k="Against target" v={<b style={{ color: fl?.flagged ? 'var(--risk)' : 'var(--good)' }}>{fl?.flagged ? [fl.costOver > 0 ? `${fmtMoney(fl.costOver)} over` : null, fl.lateDays > 0 ? `${fl.lateDays}d late` : null].filter(Boolean).join(' · ') : 'fits'}</b>} note={`target ${fmtMoney(o.targetCost)}/pc · in-house ${fmtDate(o.targetInhouse)}`} />
        <KV k="Sent by" v={a.by} note={`${fmtDate(a.askedOn)} · approve by ${fmtDate(a.deadline)}`} />
        {revision && o.poDoc && <KV k="PO now" v={fmtMoney(Math.round(poTotalsOf(o.poDoc).total))} note={`revision ${o.poDoc.revision ?? 1} · ${poTotalsOf(o.poDoc).pcs} pcs`} />}
      </div>
      {rp?.breakdown && rp.breakdown.length > 0 && <div className="text-[12px] pt-1" style={soft}>Quote made up of: {rp.breakdown.map(b => `${b.head} ${fmtMoney(b.amount)}`).join(' · ')}</div>}
      {a.note && <div className="text-[12.5px] pt-2"><span style={faint}>Note </span>{a.note}</div>}

      <div className="cap pt-3">Approvals</div>
      {a.needs.map(r => { const d = [...a.decisions].reverse().find(x => x.role === r);
        return <div key={r} className="appr-row">
          <span className={`pill role-${r === 'hod' ? 'owner' : 'finance'}`}>{APPROVER_LABEL[r]}</span>
          {d ? <span className="text-[12.5px]"><Pill tone={d.approved ? 'good' : 'risk'}>{d.approved ? 'approved' : 'rejected'}</Pill> <span style={soft}>{d.by} · {fmtDate(d.on)}{d.comment ? ` · ${d.comment}` : ''}</span></span>
            : canDecide(r) ? <span className="flex gap-2 items-center flex-wrap" style={{ flex: 1 }}><Input value={comment} onChange={e => setComment(e.target.value)} placeholder="comment (needed to reject)" style={{ flex: '1 1 200px' }} /><Button size="sm" variant="primary" onClick={() => { decidePoApproval(o.id, r, true, comment.trim() || null); setComment(''); }}>Approve</Button><Button size="sm" disabled={!comment.trim()} onClick={() => { decidePoApproval(o.id, r, false, comment.trim()); setComment(''); }}>Reject</Button></span>
            : <span className="text-[12.5px]" style={{ color: ap.late ? 'var(--risk)' : 'var(--warn)' }}>pending{ap.late ? ` · ${daysAgo(a.deadline)}d past the date` : ` · by ${fmtDate(a.deadline)}`}</span>}
        </div>; })}
      {ap.state === 'approved' && o.poNo && <div className="text-[12.5px] pt-2" style={{ color: 'var(--good)' }}>{revision ? 'Revised PO' : o.poNo} mailed to the factory and the merchandiser{o.poMail?.sentOn ? ` on ${fmtDate(o.poMail.sentOn)}` : ''}. <button type="button" className="vlink" onClick={() => onGo?.('po')}>See the PO →</button></div>}
      {ap.state === 'rejected' && (prod ? <div className="pt-3"><Button onClick={() => setAgain(true)}>Change the PO and send again</Button></div> : null)}
    </Section>

    {a.doc && <Section title={revision ? 'The revised PO' : 'The PO as drafted'} collapsible={false}><PoDocView o={o} doc={a.doc} /></Section>}

    <Section title="Every reply on this style" collapsible={false}>
      <table className="t compact"><thead><tr><th>Factory</th><th className="num">₹ / pc</th><th>Lead · in-house</th><th>Against target</th></tr></thead>
        <tbody>{replies.map(r => { const f = replyFlagsOf(o, r); return <tr key={r.vendorId} style={{ background: r.vendorId === a.vendorId ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : undefined }}>
          <td className="font-medium">{nameOf(r.vendorId)}{r.vendorId === a.vendorId && <span className="pill ml-2">this PO</span>}</td><td className="num">{fmtMoney(r.cost)}</td><td className="text-[12px]">{r.leadDays} d · {fmtDate(f.inhouseOn)}</td>
          <td className="text-[12px]" style={{ color: f.flagged ? 'var(--risk)' : 'var(--good)' }}>{f.flagged ? [f.costOver > 0 ? `${fmtMoney(f.costOver)} over` : null, f.lateDays > 0 ? `${f.lateDays}d late` : null].filter(Boolean).join(' · ') : 'fits'}</td></tr>; })}</tbody></table>
    </Section>

    <Section title={`What factories priced before · ${o.category}`} collapsible={false} right={<span className="text-[11.5px]" style={faint}>from POs raised on PLM</span>}>
      {similar.length === 0 ? <div className="text-[12.5px] py-1" style={faint}>No earlier PO in this category yet. It builds up as POs are raised.</div>
        : <table className="t compact"><thead><tr><th>Style</th><th>Factory</th><th>Basis</th><th className="num">Pcs</th><th className="num">₹ / pc</th><th>PO date</th></tr></thead>
          <tbody>{similar.map(x => <tr key={x.id}><td className="font-medium" style={{ whiteSpace: 'normal' }}>{x.style}</td><td>{x.factory}</td><td className="text-[12px]" style={soft}>{x.basis}</td><td className="num">{x.qty}</td><td className="num">{fmtMoney(x.rate)}</td><td className="text-[12px]">{fmtDate(x.on)}</td></tr>)}</tbody></table>}
      {similar.length > 0 && rp && <div className="text-[12px] pt-2" style={soft}>Average before: {fmtMoney(Math.round(similar.reduce((s, x) => s + x.rate, 0) / similar.length))}/pc · this PO: {fmtMoney(t ? Math.round(t.avgRate) : rp.cost)}/pc</div>}
    </Section>
  </>;
}

/* a raised PO is locked. Nitin asks for edit access (a new cut ratio, a date, a rate); HOD and / or finance give it;
   he edits the PO and it goes for approval again; approved, the revised PO is mailed by itself. */
export function PoEditSection({ o, prod, onGo }: { o: ProductionOrder; prod: boolean; onGo?: (step: string) => void }) {
  const { role, myRole, demoAll, requestPoEdit, grantPoEdit, askPoApproval } = useApp();
  const ed = poEditOf(o); const ap = approvalOf(o); const revPending = ap.a?.kind === 'revision' && ap.state !== 'approved';
  const ratio = (o.cutRatios ?? []).filter(c => c.given && (c.given.on ?? '') > (o.poDate ?? '')).slice(-1)[0] ?? null;
  const [asking, setAsking] = useState(false); const [need, setNeed] = useState('both'); const [reason, setReason] = useState(ratio ? 'New cut ratio from category' : '');
  const [comment, setComment] = useState('');
  if (!o.poNo || !o.poDoc) return null;
  const canGrant = (r: ApproverRole) => (demoAll || role === 'owner' || myRole === r) && ed.pending.includes(r);

  if (revPending) return <Section title="PO change" collapsible={false} right={<Pill tone={ap.state === 'rejected' ? 'risk' : 'warn'}>revised PO · {ap.line}</Pill>}>
    <div className="text-[12.5px]" style={soft}>The revised PO is with the approvers. This PO stays as it is until they approve. <button type="button" className="vlink" onClick={() => onGo?.('approval')}>See the approval →</button></div>
  </Section>;

  if (ed.state === 'none' || ed.state === 'declined') return <Section title="PO change" collapsible={false} right={ed.state === 'declined' ? <Pill tone="risk">edit access declined by {APPROVER_LABEL[ed.declined!.role]}</Pill> : <span className="text-[11.5px]" style={faint}>locked · revision {o.poDoc.revision ?? 1}</span>}>
    {ratio && !asking && <div className="text-[12.5px] pb-2" style={{ color: 'var(--warn)' }}>Category gave a new cut ratio on {fmtDate(ratio.given!.on)}. The PO still carries the earlier sizes.</div>}
    {ed.state === 'declined' && ed.declined!.comment && <div className="text-[12.5px] pb-2" style={soft}>{ed.declined!.comment}</div>}
    {!prod ? <ActsBy role="production" does="asks for edit access to change the PO" /> : !asking ? <Button onClick={() => setAsking(true)}>Ask for edit access</Button> : <>
      <Field label="What needs to change"><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="new cut ratio, delivery date, rate, a line dropped…" /></Field>
      <div className="cap pt-2">Edit access from</div>
      <div className="flex gap-2 flex-wrap py-1">{NEEDS.map(n => <button key={n.id} type="button" className={`dest-opt${need === n.id ? ' on' : ''}`} onClick={() => setNeed(n.id)}><span className="dest-dot" />{n.label}</button>)}</div>
      <div className="flex gap-2 pt-2"><Button variant="primary" disabled={!reason.trim()} onClick={() => { requestPoEdit(o.id, NEEDS.find(n => n.id === need)!.needs, reason.trim()); setAsking(false); }}>Ask for edit access</Button><Button variant="ghost" onClick={() => setAsking(false)}>Cancel</Button></div>
    </>}
  </Section>;

  const e = ed.e!;
  if (ed.state === 'pending') return <Section title="PO change · edit access asked" collapsible={false} right={<Pill tone="warn">with {ed.pending.map(r => APPROVER_LABEL[r]).join(' and ')}</Pill>}>
    <div className="text-[12.5px] pb-1"><span style={faint}>Asked by </span>{e.by} · {fmtDate(e.askedOn)} · <b>{e.reason}</b></div>
    {e.needs.map(r => { const g = [...e.grants].reverse().find(x => x.role === r);
      return <div key={r} className="appr-row"><span className={`pill role-${r === 'hod' ? 'owner' : 'finance'}`}>{APPROVER_LABEL[r]}</span>
        {g ? <span className="text-[12.5px]"><Pill tone={g.granted ? 'good' : 'risk'}>{g.granted ? 'access given' : 'declined'}</Pill> <span style={soft}>{g.by} · {fmtDate(g.on)}</span></span>
          : canGrant(r) ? <span className="flex gap-2 items-center flex-wrap" style={{ flex: 1 }}><Input value={comment} onChange={ev => setComment(ev.target.value)} placeholder="comment (needed to decline)" style={{ flex: '1 1 200px' }} /><Button size="sm" variant="primary" onClick={() => { grantPoEdit(o.id, r, true, comment.trim() || null); setComment(''); }}>Give edit access</Button><Button size="sm" disabled={!comment.trim()} onClick={() => { grantPoEdit(o.id, r, false, comment.trim()); setComment(''); }}>Decline</Button></span>
          : <span className="text-[12.5px]" style={{ color: 'var(--warn)' }}>pending</span>}</div>; })}
  </Section>;

  /* access given: the PO opens for editing and goes for approval again */
  const start = ratio?.given ? { ...o.poDoc, lines: o.poDoc.lines.map((l, i) => i === 0 || o.poDoc!.lines.length === 1 ? { ...l, sizes: ratio.given!.breakup.map(b => ({ size: b.size, qty: o.poDoc!.lines.length === 1 ? b.qty : (l.sizes.find(x => x.size === b.size)?.qty ?? 0) })) } : l) } : o.poDoc;
  return <Section title="PO change · edit access given" collapsible={false} right={<Pill tone="good">{e.needs.map(r => APPROVER_LABEL[r]).join(' and ')} gave access</Pill>}>
    {prod ? <PoForm o={o} vendorId={o.vendorId!} rate={o.finalFob ?? 0} fabricBy={o.poMail?.fabricBy ?? 'factory'} initialDoc={start} title={`${o.poNo} · revision ${(o.poDoc.revision ?? 1) + 1} · ${e.reason}`}
      onCancel={() => onGo?.('po')} onRaise={(d, ask) => askPoApproval(o.id, o.vendorId!, o.poMail?.fabricBy ?? 'factory', ask.needs, ask.deadline, ask.note ?? e.reason, d)} />
      : <ActsBy role="production" does="edits the PO and sends it for approval again" />}
  </Section>;
}
