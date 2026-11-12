/* The steps BSC added to the RTW chain on 12 Nov 2026, each one a section on the record:
   the sample cycle before the bulk order, the PO's costs and the factory's acknowledgement,
   the factory's sign-off on everything received, QC, the shipping cycle, and COGS. */
import { useState } from 'react';
import { useApp } from '../store';
import type { ProductionOrder } from '../domain/types';
import { fmtDate, daysAgo, receiptOf, fmtMoney } from '../domain/engines';
import { Section, Pill, Button, KV, Field, Input, fromDateInput, dateInput } from '../ui';
import { VendorLink } from './Vendors';
import { ActsBy } from './Who';

const faint = { color: 'var(--ink-faint)' } as const;
const soft = { color: 'var(--ink-soft)' } as const;

/* ── 1. the sample cycle: rounds with the factory until the sample is right ── */
export function SampleCycleSection({ o, design, factory }: { o: ProductionOrder; design: boolean; factory: boolean }) {
  const { sendForSampling, logSampleCycle } = useApp();
  const sc = o.sampleCycle ?? { rounds: [], approvedOn: null };
  const open = sc.rounds.find(r => !r.outcome) ?? null; const last = sc.rounds[sc.rounds.length - 1] ?? null;
  const [due, setDue] = useState(''); const [kind, setKind] = useState<'prototype' | 'sample'>(sc.rounds.length ? 'sample' : 'prototype');
  const [remarks, setRemarks] = useState('');
  const sent = o.status !== 'Requirement';
  const canSend = design && sent && !open && !sc.approvedOn && (!last || last.outcome !== 'remarks' || !!last.cadUpdatedOn);
  const overdue = open && !open.sampledOn && open.dueOn && daysAgo(open.dueOn) > 0;
  const tone = sc.approvedOn ? 'good' : overdue ? 'risk' : open ? 'warn' : last?.outcome === 'remarks' ? 'warn' : 'neutral';
  const label = sc.approvedOn ? `approved · round ${last?.n}` : open ? (open.sampledOn ? `round ${open.n} with design` : `round ${open.n} at the factory${open.dueOn ? ` · due ${fmtDate(open.dueOn)}` : ''}${overdue ? ` · ${daysAgo(open.dueOn!)}d late` : ''}`) : last?.outcome === 'remarks' ? (last.cadUpdatedOn ? 'CAD updated · send the next round' : 'remarks · CAD and design to update') : sent ? 'not started' : 'after it is sent';
  return <Section title="Sample cycle" collapsible={false} right={<Pill tone={tone}>{label}</Pill>}>
    {!sent && <div className="text-[12.5px] py-1" style={faint}>Starts once design sends the style to the factory for sampling.</div>}
    {sc.rounds.map(r => <div key={r.n} className="py-2" style={{ borderBottom: '1px solid var(--line-soft)' }}>
      <div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{r.kind === 'prototype' ? 'Prototype' : 'Sample'} round {r.n}</span>
        <Pill tone={r.outcome === 'approved' ? 'good' : r.outcome === 'remarks' ? 'warn' : r.sampledOn ? 'info' : 'neutral'}>{r.outcome === 'approved' ? 'approved' : r.outcome === 'remarks' ? 'remarks' : r.trialOn ? 'trialled' : r.sampledOn ? 'back from the factory' : 'at the factory'}</Pill></div>
      <div className="text-[11.5px] pt-0.5" style={soft}>sent {fmtDate(r.sentOn)}{r.dueOn ? ` · due ${fmtDate(r.dueOn)}` : ''}{r.sampledOn ? ` · back ${fmtDate(r.sampledOn)}` : ''}{r.trialOn ? ` · trial ${fmtDate(r.trialOn)}` : ''}{r.cadUpdatedOn ? ` · CAD and design updated ${fmtDate(r.cadUpdatedOn)}` : ''}</div>
      {r.remarks && <div className="text-[12px] pt-1" style={{ color: 'var(--warn)' }}>Remarks: {r.remarks}</div>}
      {!r.outcome && <div className="flex gap-2 pt-2 flex-wrap items-end">
        {!r.sampledOn && factory && <Button size="sm" variant="primary" onClick={() => logSampleCycle(o.id, { sampledOn: new Date().toISOString() })}>Sample sent back to BSC</Button>}
        {!r.sampledOn && !factory && <ActsBy role="merchandiser" does={`sends the sample${r.dueOn ? ` by ${fmtDate(r.dueOn)}` : ''}`} />}
        {!r.sampledOn && design && <Field label="Due on"><Input type="date" value={dateInput(r.dueOn) || ''} onChange={e => logSampleCycle(o.id, { dueOn: fromDateInput(e.target.value) })} /></Field>}
        {r.sampledOn && !r.trialOn && design && <Button size="sm" onClick={() => logSampleCycle(o.id, { trialOn: new Date().toISOString() })}>Trialled</Button>}
        {r.sampledOn && design && <>
          <Button size="sm" variant="primary" onClick={() => logSampleCycle(o.id, { outcome: 'approved', trialOn: r.trialOn ?? new Date().toISOString() })}>Approve · sample is right</Button>
          <div style={{ flex: '1 1 220px' }}><Field label="Remarks"><Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="what to change" /></Field></div>
          <Button size="sm" variant="ghost" disabled={!remarks.trim()} onClick={() => { logSampleCycle(o.id, { outcome: 'remarks', remarks: remarks.trim(), trialOn: r.trialOn ?? new Date().toISOString() }); setRemarks(''); }}>Give remarks</Button>
        </>}
        {r.sampledOn && !design && <ActsBy role="design" does="trials it, then approves or gives remarks" />}
      </div>}
      {r.outcome === 'remarks' && !r.cadUpdatedOn && (design ? <div className="pt-2"><Button size="sm" variant="primary" onClick={() => logSampleCycle(o.id, { cadUpdatedOn: new Date().toISOString() })}>CAD and design updated</Button></div> : <ActsBy role="design" does="updates the CAD and the design, then sends the next round" />)}
    </div>)}
    {canSend && <div className="flex gap-2 pt-3 flex-wrap items-end">
      <Field label="Round"><select className="input" value={kind} onChange={e => setKind(e.target.value as 'prototype' | 'sample')}><option value="prototype">Prototype</option><option value="sample">Sample</option></select></Field>
      <Field label="Factory to give it by"><Input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
      <Button size="sm" variant="primary" onClick={() => { sendForSampling(o.id, kind, fromDateInput(due)); setDue(''); }}>{sc.rounds.length ? `Send round ${sc.rounds.length + 1} to the factory` : 'Send to the factory for sampling'}</Button>
    </div>}
    {sc.approvedOn && <div className="pt-2 text-[12.5px]" style={{ color: 'var(--good)' }}>Approved {fmtDate(sc.approvedOn)}{sc.approvedBy ? ` by ${sc.approvedBy}` : ''}. The bulk order and PO come next.</div>}
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
    {!o.cogsClosedOn && delivered && (finance ? <div className="pt-2"><Button size="sm" variant="primary" onClick={() => closeCogs(o.id)}>Close COGS</Button></div> : <ActsBy role="finance" does="closes COGS once the shipment is closed" />)}
  </Section>;
}
