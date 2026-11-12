/* The steps BSC added to the RTW chain on 12 Nov 2026, each one a section on the record:
   the sample cycle before the bulk order, the PO's costs and the factory's acknowledgement,
   the factory's sign-off on everything received, QC, the shipping cycle, and COGS. */
import { useState } from 'react';
import { useApp } from '../store';
import type { ProductionOrder, SampleStage } from '../domain/types';
import { fmtDate, daysAgo, receiptOf, fmtMoney } from '../domain/engines';
import { Section, Pill, Button, KV, Field, Input, fromDateInput, dateInput } from '../ui';
import { VendorLink } from './Vendors';
import { ActsBy } from './Who';

const faint = { color: 'var(--ink-faint)' } as const;
const soft = { color: 'var(--ink-soft)' } as const;

/* ── 1. the sample checklist: prototype, sampling cycle, trial cycle — each approved or not, with its dates and remarks ── */
const STAGES: { key: SampleStage; label: string; hint: string }[] = [
  { key: 'prototype', label: 'Prototype', hint: 'the first make of the design' },
  { key: 'sample', label: 'Sampling cycle', hint: 'samples until the make is right' },
  { key: 'trial', label: 'Trial cycle', hint: 'the fit trial on the body' },
];
export function SampleCycleSection({ o, design, factory }: { o: ProductionOrder; design: boolean; factory: boolean }) {
  const { sendForSampling, logSampleCycle, skipSampleStage } = useApp();
  const sc = o.sampleCycle ?? { rounds: [], approvedOn: null, skipped: [] };
  const skipped = new Set(sc.skipped ?? []);
  const [due, setDue] = useState(''); const [remarks, setRemarks] = useState('');
  const sent = o.status !== 'Requirement';
  const roundsOf = (k: SampleStage) => sc.rounds.filter(r => r.kind === k);
  const approvedOf = (k: SampleStage) => roundsOf(k).find(r => r.outcome === 'approved') ?? null;
  /* the stage being worked: the first one not approved and not marked not needed */
  const current = STAGES.find(st => !skipped.has(st.key) && !approvedOf(st.key))?.key ?? null;
  const open = sc.rounds.find(r => !r.outcome) ?? null;
  const fmt = (d: string | null | undefined) => d ? fmtDate(d) : '—';
  const done = STAGES.filter(st => skipped.has(st.key) || approvedOf(st.key)).length;
  return <Section title="Sample checklist" collapsible={false} right={<Pill tone={sc.approvedOn ? 'good' : done ? 'warn' : 'neutral'}>{sc.approvedOn ? `all approved · ${fmtDate(sc.approvedOn)}` : `${done} of ${STAGES.length} done`}</Pill>}>
    {!sent && <div className="text-[12.5px] pb-2" style={faint}>Starts once design sends the style to the factory for sampling. A stage this style does not need can be marked now.</div>}
    <div style={{ overflowX: 'auto' }}><table className="t compact">
      <thead><tr><th>Stage</th><th>Approved?</th><th>Dates</th><th>Remarks</th><th></th></tr></thead>
      <tbody>{STAGES.map(st => {
        const rs = roundsOf(st.key); const ok = approvedOf(st.key); const isSkip = skipped.has(st.key);
        const isCur = current === st.key; const cur = open && open.kind === st.key ? open : null; const last = rs[rs.length - 1] ?? null;
        const needCad = last?.outcome === 'remarks' && !last.cadUpdatedOn;
        const overdue = cur && !cur.sampledOn && cur.dueOn && daysAgo(cur.dueOn) > 0;
        const tone = isSkip ? 'neutral' : ok ? 'good' : overdue ? 'risk' : cur || needCad ? 'warn' : 'neutral';
        const status = isSkip ? 'not needed' : ok ? `approved · round ${ok.n}` : cur ? (cur.sampledOn ? `round ${cur.n} with design` : `round ${cur.n} at the factory${overdue ? ` · ${daysAgo(cur.dueOn!)}d late` : ''}`) : needCad ? 'remarks · CAD to update' : rs.length ? 'send the next round' : 'not started';
        return <tr key={st.key} style={{ opacity: isSkip ? .55 : 1, verticalAlign: 'top' }}>
          <td><div className="font-medium">{st.label}</div><div className="text-[11px]" style={faint}>{st.hint}</div></td>
          <td><Pill tone={tone}>{status}</Pill></td>
          <td className="text-[11.5px]" style={{ ...soft, whiteSpace: 'nowrap' }}>{rs.length ? rs.map(r => <div key={r.n}>R{r.n} · sent {fmt(r.sentOn)} · due {fmt(r.dueOn)} · back {fmt(r.sampledOn)}{r.outcome === 'approved' ? ' · ✓' : ''}</div>) : '—'}</td>
          <td className="text-[12px]" style={{ whiteSpace: 'normal', minWidth: 180 }}>{rs.filter(r => r.remarks).length ? rs.filter(r => r.remarks).map(r => <div key={r.n} style={{ color: 'var(--warn)' }}>R{r.n}: {r.remarks}{r.cadUpdatedOn ? <span style={faint}> · CAD updated {fmtDate(r.cadUpdatedOn)}</span> : ''}</div>) : <span style={faint}>—</span>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>
            {!isSkip && !ok && !rs.length && design && <button type="button" className="vlink text-[11.5px]" onClick={() => skipSampleStage(o.id, st.key, true)}>not needed</button>}
            {isSkip && design && <button type="button" className="vlink text-[11.5px]" onClick={() => skipSampleStage(o.id, st.key, false)}>needed after all</button>}
          </td>
        </tr>; })}</tbody>
    </table></div>
    {/* the one action open now, for the stage being worked */}
    {sent && current && (() => {
      const st = STAGES.find(x => x.key === current)!; const rs = roundsOf(current); const last = rs[rs.length - 1] ?? null;
      const cur = open && open.kind === current ? open : null;
      return <div className="pt-3 mt-2" style={{ borderTop: '1px solid var(--line-soft)' }}>
        <div className="label">{st.label} · now</div>
        {cur && !cur.sampledOn && <div className="flex gap-2 items-end flex-wrap pt-1">
          {factory ? <Button size="sm" variant="primary" onClick={() => logSampleCycle(o.id, { sampledOn: new Date().toISOString() })}>Round {cur.n} sent back to BSC</Button> : <ActsBy role="merchandiser" does={`sends round ${cur.n} back${cur.dueOn ? ` by ${fmtDate(cur.dueOn)}` : ''}`} />}
          {design && <Field label="Due from the factory"><Input type="date" value={dateInput(cur.dueOn) || ''} onChange={e => logSampleCycle(o.id, { dueOn: fromDateInput(e.target.value) })} /></Field>}
        </div>}
        {cur && cur.sampledOn && (design ? <div className="flex gap-2 items-end flex-wrap pt-1">
          <Button size="sm" variant="primary" onClick={() => logSampleCycle(o.id, { outcome: 'approved', trialOn: cur.trialOn ?? new Date().toISOString() })}>Approve {st.label.toLowerCase()}</Button>
          <div style={{ flex: '1 1 240px' }}><Field label="Or remarks"><Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="what to change" /></Field></div>
          <Button size="sm" variant="ghost" disabled={!remarks.trim()} onClick={() => { logSampleCycle(o.id, { outcome: 'remarks', remarks: remarks.trim(), trialOn: cur.trialOn ?? new Date().toISOString() }); setRemarks(''); }}>Give remarks</Button>
        </div> : <ActsBy role="design" does="approves it or gives remarks" />)}
        {!cur && last?.outcome === 'remarks' && !last.cadUpdatedOn && (design ? <div className="pt-1"><Button size="sm" variant="primary" onClick={() => logSampleCycle(o.id, { cadUpdatedOn: new Date().toISOString() })}>CAD and design updated</Button></div> : <ActsBy role="design" does="updates the CAD and the design" />)}
        {!cur && !open && (!last || last.outcome !== 'remarks' || !!last.cadUpdatedOn) && (design ? <div className="flex gap-2 items-end flex-wrap pt-1">
          <Field label="Factory to give it by"><Input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
          <Button size="sm" variant="primary" onClick={() => { sendForSampling(o.id, current, fromDateInput(due)); setDue(''); }}>Send {st.label.toLowerCase()} round {rs.length + 1} to the factory</Button>
        </div> : <ActsBy role="design" does={`sends the ${st.label.toLowerCase()} to the factory`} />)}
        {open && open.kind !== current && <div className="text-[12.5px] pt-1" style={faint}>A {STAGES.find(x => x.key === open.kind)?.label.toLowerCase()} round is still open.</div>}
      </div>; })()}
    {sc.approvedOn && <div className="pt-2 text-[12.5px]" style={{ color: 'var(--good)' }}>Sampling done {fmtDate(sc.approvedOn)}{sc.approvedBy ? ` · ${sc.approvedBy}` : ''}. The bulk order and PO come next; sourcing starts shopping the cloth at the same time.</div>}
  </Section>;
}

/* ── 2. the PO's costs and the factory's acknowledgement ── */
export function PoCostsSection({ o, design, factory }: { o: ProductionOrder; design: boolean; factory: boolean }) {
  const { setPoCosts, ackPo } = useApp();
  const pc = o.poCosts ?? { logistics: null, other: [] };
  const [logi, setLogi] = useState(pc.logistics != null ? String(pc.logistics) : '');
  const [label, setLabel] = useState(''); const [amt, setAmt] = useState('');
  const [editing, setEditing] = useState(false);
  const piece = o.finalFob ?? o.targetCost ?? 0; const pieces = piece * o.orderQty;
  const otherTotal = pc.other.reduce((a, x) => a + x.amount, 0); const total = pieces + (pc.logistics ?? 0) + otherTotal;
  if (!o.poNo) return null;
  return <Section title="PO value · costs on the PO" collapsible={false} right={<span className="flex gap-2 items-center"><Pill tone={o.poAckOn ? 'good' : 'warn'}>{o.poAckOn ? `acknowledged ${fmtDate(o.poAckOn)}` : 'not yet acknowledged by the factory'}</Pill></span>}>
    <KV k="Pieces" v={`${o.orderQty} × ${fmtMoney(piece)}`} note={`${fmtMoney(pieces)} · piece cost on the PO`} />
    <KV k="Logistics" v={pc.logistics != null ? fmtMoney(pc.logistics) : '—'} />
    {pc.other.map((x, i) => <KV key={i} k={x.label} v={fmtMoney(x.amount)} />)}
    <KV k="PO total" v={<b>{fmtMoney(total)}</b>} note={`${fmtMoney(total / o.orderQty)} per piece landed at the PO`} />
    {design && !editing && <div className="pt-2"><Button size="sm" onClick={() => setEditing(true)}>{pc.logistics != null || pc.other.length ? 'Change the costs' : 'Add logistics and other costs'}</Button></div>}
    {editing && <div className="pt-2">
      <div className="grid gap-2 py-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Field label="Logistics (₹, per PO)"><Input type="number" min={0} value={logi} onChange={e => setLogi(e.target.value)} /></Field>
        <Field label="Other cost · label"><Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. testing, packaging" /></Field>
        <Field label="Other cost · ₹"><Input type="number" min={0} value={amt} onChange={e => setAmt(e.target.value)} /></Field>
      </div>
      {pc.other.length > 0 && <div className="text-[11.5px] py-1" style={soft}>On the PO: {pc.other.map(x => `${x.label} ${fmtMoney(x.amount)}`).join(' · ')}</div>}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="primary" onClick={() => { const other = label.trim() && Number(amt) ? [...pc.other, { label: label.trim(), amount: Number(amt) }] : pc.other; setPoCosts(o.id, { logistics: logi === '' ? null : Number(logi), other }); setLabel(''); setAmt(''); setEditing(false); }}>Save costs</Button>
        {pc.other.length > 0 && <Button size="sm" variant="ghost" onClick={() => setPoCosts(o.id, { logistics: logi === '' ? null : Number(logi), other: [] })}>Clear other costs</Button>}
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>}
    {!o.poAckOn && (factory ? <div className="pt-3"><Button size="sm" variant="primary" onClick={() => ackPo(o.id)}>We have the PO · acknowledge</Button></div> : <ActsBy role="merchandiser" does="acknowledges the PO once it has it" />)}
  </Section>;
}

/* ── 3. the factory's sign-off on everything received ── */
export function ApproveReceivedSection({ o, factory }: { o: ProductionOrder; factory: boolean }) {
  const { approveAllReceived } = useApp();
  const fs = o.fabricSupply; const trims = (o.materials ?? []).filter(m => o.bom[m.bomIndex]?.kind !== 'fabric');
  const trimsIn = trims.filter(m => m.receivedOn).length;
  const ready = !!fs?.receipt && trimsIn === trims.length;
  return <Section title="Everything received?" collapsible={false} right={<Pill tone={o.receivedApprovedOn ? 'good' : ready ? 'warn' : 'neutral'}>{o.receivedApprovedOn ? `approved ${fmtDate(o.receivedApprovedOn)}` : ready ? 'to approve' : `cloth ${fs?.receipt ? 'in' : 'to come'} · trims ${trimsIn} of ${trims.length}`}</Pill>}>
    <div className="text-[12.5px] py-1" style={soft}>The factory signs off once the cloth and every trim are in and checked. Manufacturing starts on this sign-off.</div>
    {o.receivedApprovedOn ? <div className="text-[12.5px]" style={{ color: 'var(--good)' }}>Approved {fmtDate(o.receivedApprovedOn)}{o.receivedApprovedBy ? ` by ${o.receivedApprovedBy}` : ''}.</div>
      : factory ? <div className="pt-1"><Button size="sm" variant="primary" disabled={!ready} onClick={() => approveAllReceived(o.id)}>All received · approve</Button>{!ready && <span className="text-[11.5px] ml-2" style={faint}>count the cloth and every trim in first</span>}</div>
      : <ActsBy role="merchandiser" does="approves everything received" />}
  </Section>;
}

/* ── 4. QC at the factory ── */
export function QcSection({ o, factory }: { o: ProductionOrder; factory: boolean }) {
  const { recordQc } = useApp();
  const [note, setNote] = useState('');
  const rows = o.qc ?? []; const last = rows[rows.length - 1];
  const passed = rows.some(q => q.result === 'pass') || !!o.milestones.find(m => m.key === 'FI')?.actual;
  const made = !!o.milestones.find(m => m.key === 'Finishing End')?.actual;
  return <Section title="QC · final inspection" collapsible={false} right={<Pill tone={passed ? 'good' : last?.result === 'reject' ? 'risk' : last?.result === 'rework' ? 'warn' : 'neutral'}>{passed ? 'passed' : last ? last.result : made ? 'to inspect' : 'after finishing'}</Pill>}>
    {rows.map((q, i) => <div key={i} className="kv"><span className="k">{fmtDate(q.inspectedOn)} · {q.by}</span><span className="v"><Pill tone={q.result === 'pass' ? 'good' : q.result === 'rework' ? 'warn' : 'risk'}>{q.result}</Pill>{q.note ? <span className="text-[11.5px] ml-2" style={soft}>{q.note}</span> : null}</span></div>)}
    {!rows.length && passed && <div className="text-[12.5px] py-1" style={{ color: 'var(--good)' }}>Final inspection logged on the TNA.</div>}
    {!passed && (factory ? <div className="flex gap-2 pt-2 flex-wrap items-end">
      <div style={{ flex: '1 1 220px' }}><Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="what was found" /></Field></div>
      <Button size="sm" variant="primary" onClick={() => { recordQc(o.id, 'pass', note); setNote(''); }}>Pass</Button>
      <Button size="sm" onClick={() => { recordQc(o.id, 'rework', note); setNote(''); }}>Rework</Button>
      <Button size="sm" variant="danger" onClick={() => { recordQc(o.id, 'reject', note); setNote(''); }}>Reject</Button>
    </div> : <ActsBy role="merchandiser" does="inspects and records pass, rework or reject" />)}
  </Section>;
}

/* ── 5. the shipping cycle ── */
const SHIP: { key: 'awb' | 'picked' | 'shipped' | 'delivered' | 'closed'; label: string; who: string }[] = [
  { key: 'awb', label: 'AWB generated', who: 'Factory' }, { key: 'picked', label: 'Courier picked up', who: 'Factory' }, { key: 'shipped', label: 'Shipped', who: 'Factory' },
  { key: 'delivered', label: 'Delivered · GRN on Enigma', who: 'Enigma' }, { key: 'closed', label: 'Done · everything closed', who: 'Nitin' },
];
export function ShippingSection({ o, factory, prod }: { o: ProductionOrder; factory: boolean; prod: boolean }) {
  const { shipStep } = useApp();
  const sh = o.shipping ?? { awbNo: null, awbOn: null, courier: null, pickedOn: null, shippedOn: null, deliveredOn: null, closedOn: null, shippingCost: null };
  const rc = receiptOf(o);
  const on = { awb: sh.awbOn, picked: sh.pickedOn, shipped: sh.shippedOn ?? o.milestones.find(m => m.key === 'Dispatch')?.actual ?? null, delivered: sh.deliveredOn ?? (rc.lots.length && !rc.partial ? rc.lots[rc.lots.length - 1].at : null), closed: sh.closedOn ?? (o.status === 'Closed' ? (o.milestones.find(m => m.key === 'Inhouse ETA')?.actual ?? null) : null) };
  const next = SHIP.find(s => !on[s.key]) ?? null;
  const [awb, setAwb] = useState(sh.awbNo ?? ''); const [courier, setCourier] = useState(sh.courier ?? ''); const [cost, setCost] = useState(sh.shippingCost != null ? String(sh.shippingCost) : '');
  const qcPassed = (o.qc ?? []).some(q => q.result === 'pass') || !!o.milestones.find(m => m.key === 'FI')?.actual;
  const done = SHIP.filter(s => on[s.key]).length;
  return <Section title="Shipping cycle" collapsible={false} right={<Pill tone={done === SHIP.length ? 'good' : done ? 'info' : 'neutral'}>{done === SHIP.length ? 'closed' : `${done} of ${SHIP.length}`}</Pill>}>
    {SHIP.map(s => { const d = on[s.key]; const isNext = next?.key === s.key;
      const can = isNext && qcPassed && ((s.key === 'closed' || s.key === 'delivered') ? prod : factory);
      return <div key={s.key} className="kv"><span className="k flex items-center gap-2"><span className="dot" style={{ background: d ? 'var(--good)' : 'var(--line)' }} />{s.label}<span className="text-[11px]" style={faint}>{s.who}</span>{s.key === 'awb' && sh.awbNo && <span className="mono text-[11px]">{sh.awbNo}{sh.courier ? ` · ${sh.courier}` : ''}</span>}</span>
        <span className="v flex items-center gap-2 justify-end">{d ? <span className="text-[12px]" style={soft}>{fmtDate(d)}</span>
          : can ? (s.key === 'awb' ? <span className="flex gap-1.5 items-end flex-wrap"><Input value={awb} onChange={e => setAwb(e.target.value)} placeholder="AWB no." style={{ width: 130 }} /><Input value={courier} onChange={e => setCourier(e.target.value)} placeholder="courier" style={{ width: 110 }} /><Button size="sm" variant="primary" disabled={!awb.trim()} onClick={() => shipStep(o.id, 'awb', { awbNo: awb.trim(), courier: courier.trim() || undefined })}>Generated</Button></span>
            : s.key === 'closed' ? <span className="flex gap-1.5 items-end flex-wrap"><Input type="number" min={0} value={cost} onChange={e => setCost(e.target.value)} placeholder="shipping ₹" style={{ width: 110 }} /><Button size="sm" variant="primary" onClick={() => shipStep(o.id, 'closed', { shippingCost: cost === '' ? null : Number(cost) })}>Close</Button></span>
            : <Button size="sm" variant="primary" onClick={() => shipStep(o.id, s.key)}>{s.key === 'delivered' ? 'GRN in · delivered' : 'Done'}</Button>)
          : <span className="text-[12px]" style={faint}>{isNext ? (!qcPassed ? 'after QC' : 'not yet') : ''}</span>}</span></div>; })}
    {sh.shippingCost != null && <div className="text-[11.5px] pt-2" style={soft}>Shipping cost {fmtMoney(sh.shippingCost)} · goes into COGS.</div>}
  </Section>;
}

/* ── 6. COGS and profitability ── */
export function CogsSection({ o, finance }: { o: ProductionOrder; finance: boolean }) {
  const { db, closeCogs } = useApp();
  const rc = receiptOf(o); const pcs = rc.received || o.orderQty;
  const piece = o.finalFob ?? o.targetCost ?? 0; const pc = o.poCosts ?? { logistics: null, other: [] };
  const manufacturing = piece * o.orderQty; const logistics = pc.logistics ?? 0; const other = pc.other.reduce((a, x) => a + x.amount, 0);
  const shipping = o.shipping?.shippingCost ?? o.costing.shipping * o.orderQty;
  const total = manufacturing + logistics + other + shipping; const perPiece = pcs ? total / pcs : 0;
  const opt = db.options.find(x => x.styleName === o.styleName) ?? null; const mrp = opt?.mrp ?? null;
  const margin = mrp != null && perPiece ? (mrp - perPiece) / mrp : null;
  const delivered = !!(o.shipping?.deliveredOn ?? (rc.lots.length && !rc.partial));
  return <Section title="COGS · profitability" collapsible={false} right={<Pill tone={o.cogsClosedOn ? 'good' : delivered ? 'warn' : 'neutral'}>{o.cogsClosedOn ? `closed ${fmtDate(o.cogsClosedOn)}` : delivered ? 'to close' : 'after delivery'}</Pill>}>
    <KV k="Manufacturing" v={fmtMoney(manufacturing)} note={`${o.orderQty} × ${fmtMoney(piece)} on the PO`} />
    <KV k="Logistics on the PO" v={fmtMoney(logistics)} />
    {pc.other.map((x, i) => <KV key={i} k={x.label} v={fmtMoney(x.amount)} />)}
    <KV k="Shipping" v={fmtMoney(shipping)} note={o.shipping?.shippingCost != null ? 'from the shipping cycle' : 'from the costing sheet until the shipment is closed'} />
    <KV k="COGS" v={<b>{fmtMoney(total)}</b>} note={`${fmtMoney(perPiece)} per piece over ${pcs} received`} />
    <KV k="MRP" v={mrp != null ? fmtMoney(mrp) : '—'} note={mrp != null ? 'from the option in Enigma' : 'no option yet'} />
    <KV k="Margin" v={margin != null ? <b style={{ color: margin < 0.5 ? 'var(--risk)' : 'var(--good)' }}>{Math.round(margin * 100)}%</b> : '—'} note={margin != null ? `${fmtMoney((mrp ?? 0) - perPiece)} per piece` : undefined} />
    {!o.cogsClosedOn && delivered && (finance ? <div className="pt-2"><Button size="sm" variant="primary" onClick={() => closeCogs(o.id)}>Close COGS</Button></div> : <ActsBy role={['production', 'design']} does="close COGS once the shipment is closed; Nitin and design see it" />)}
  </Section>;
}
