/* The RTW journey, one list every screen reads from: ten steps from the request to
   the launch, each ticking itself when its step is done, each naming the move and
   who makes it. The record draws it as a rail; the lists show "where it is" and
   "next" from the same words, so design, sourcing, Nitin, the factory and the
   warehouse all see the same thing. */
import type { Db, ProductionOrder } from './types';
import { fmtDate, sendReadinessOf, sourcingStateOf, factoryStateOf, sampleStatusOf, protoStatusOf, receiptOf, riskOf, stageOf } from './engines';

export type RtwActor = 'design' | 'sourcing' | 'production' | 'merchandiser' | 'warehouse' | 'planning';
export type RtwPhase = 'design' | 'buy' | 'make';
export type RtwStep = { key: string; label: string; who: string; on: string | null | undefined; by?: string | null; now?: string; act?: RtwActor; phase: RtwPhase };
export const RTW_PHASES: { key: RtwPhase; label: string }[] = [{ key: 'design', label: 'Design' }, { key: 'buy', label: 'Buy · cloth and factory' }, { key: 'make', label: 'Make · land · launch' }];
export const RTW_ACTOR_LABEL: Record<RtwActor, string> = { design: 'Design', sourcing: 'Sourcing', production: 'Nitin', merchandiser: 'Factory', warehouse: 'Warehouse', planning: 'Planning' };
export const RTW_INTRO: Record<string, string> = {
  raised: 'What design asked for: the style, how many, by when, at what cost.',
  proto: 'Three things go on before it can be sent: the prototype (or "none needed"), the cloth brief sourcing shops against, and the BOM with the tech pack.',
  sent: 'One click sends the cloth brief to sourcing and the style to Nitin. Both start at the same time.',
  sourcing: 'Sourcing puts one vendor against the brief; design pushes the fabric PO, sends it back, or asks for more time.',
  factory: 'Nitin proposes a factory with the cost and date agreed on the phone; design accepts and the PO is raised. The PO date generates the TNA.',
  cloth: 'Once both POs are out, sourcing sends the cloth and trims to the factory, which counts them in. Short cloth comes back to design for a cut ratio.',
  sample: 'The factory sends the first sample from bulk cloth; production approves it or asks for another round.',
  tna: 'Every milestone from fabric PO to dispatch. The factory logs its own dates; late steps show in red.',
  received: 'The warehouse counts the goods in by size, lot by lot.',
  launch: 'Planning puts the style in a drop; the launch record carries the date, the stores and the marketing name.',
};

export function rtwJourneyOf(db: Db, o: ProductionOrder): { steps: RtwStep[]; current: number; next: RtwStep | null; where: string } {
  const readiness = sendReadinessOf(db, o); const proto = protoStatusOf(o);
  const ss = sourcingStateOf(o); const fst = factoryStateOf(o); const sample = sampleStatusOf(o);
  const rc = receiptOf(o); const r = riskOf(o); const st = stageOf(o);
  const launch = (db.launches ?? []).find(l => l.orderId === o.id) ?? null;
  const nameOf = (id: string | null | undefined) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const raised = o.activity?.find(a => /created|raised/i.test(a.what)) ?? null;
  const sentLog = o.activity?.find(a => /^Sent to production/i.test(a.what)) ?? null;
  const sent = o.status !== 'Requirement';
  const chosen = o.fabricQuotes.find(q => q.selected) ?? o.fabricQuotes[0] ?? null;
  const dispatched = o.milestones.find(m => m.key === 'Dispatch')?.actual ?? null;
  const nextMs = o.milestones.find(m => !m.actual) ?? null;
  const late = r.bufferDays != null && r.bufferDays < 0 ? ` · ${-r.bufferDays}d late` : '';

  const steps: RtwStep[] = [
    { key: 'raised', phase: 'design', label: 'Raised', who: 'Design', on: raised?.at ?? o.styleHandover, by: raised?.who },
    { key: 'proto', phase: 'design', label: 'Proto · BOM · tech pack', who: 'Design', act: 'design',
      on: sent ? (proto.approved?.reviewedOn ?? o.proto?.skipped?.on ?? sentLog?.at ?? o.styleHandover) : readiness.ready ? (proto.approved?.reviewedOn ?? o.proto?.skipped?.on ?? raised?.at ?? o.styleHandover) : null,
      now: readiness.blockers[0] },
    { key: 'sent', phase: 'design', label: 'Sent to sourcing and production', who: 'Design', act: 'design', on: sent ? (sentLog?.at ?? o.styleHandover) : null, by: sentLog?.who, now: readiness.ready ? 'ready to send' : 'after the proto, BOM and tech pack' },
    { key: 'sourcing', phase: 'buy', label: 'Cloth vendor · fabric PO', who: 'Sourcing · Design', on: !o.fabricNominated ? (sent ? o.styleHandover : null) : o.sourcing?.fabricPo?.on,
      by: !o.fabricNominated ? 'factory buys' : o.sourcing?.fabricPo ? `${o.sourcing.fabricPo.no} · ${nameOf(chosen?.vendorId)}` : null,
      act: ss.key === 'choose' || ss.key === 'raise-po' ? 'design' : 'sourcing',
      now: !sent ? 'starts when sent' : ss.key === 'choose' || ss.key === 'raise-po' ? 'design to push the fabric PO' : ss.key === 'extend' ? 'sourcing to extend the hold' : 'sourcing to add a vendor' },
    { key: 'factory', phase: 'buy', label: 'Factory · PO', who: 'Nitin · Design', on: o.poDate, by: o.poNo ? `${o.poNo} · ${nameOf(o.vendorId)}` : null,
      act: fst.key === 'accepted' || fst.key === 'with-design' ? 'design' : 'production',
      now: !sent ? 'starts when sent' : fst.key === 'accepted' ? 'design to raise the PO' : fst.key === 'with-design' ? 'design to accept or send back' : 'Nitin to propose a factory' },
    { key: 'cloth', phase: 'buy', label: 'Cloth at the factory', who: 'Sourcing · Factory', on: !o.fabricNominated ? o.poDate : o.fabricSupply?.receipt?.on, by: o.fabricSupply?.receipt ? `${o.fabricSupply.receipt.metresOk} m` : null,
      act: o.fabricSupply?.sentToFactoryOn ? 'merchandiser' : 'sourcing',
      now: !o.poNo ? 'after the PO' : o.fabricSupply?.sentToFactoryOn ? 'factory to count it in' : 'sourcing to send it' },
    { key: 'sample', phase: 'make', label: 'Sample approved', who: 'Factory · Production', on: sample.ppGoAhead, by: sample.approved ? `round ${sample.approved.round}` : null,
      act: sample.state === 'with production unit' ? 'production' : 'merchandiser',
      now: !o.poNo ? 'after the PO' : sample.state === 'with production unit' ? 'production to review' : sample.state === 'resubmit' ? 'factory to resubmit' : 'factory to send the first sample' },
    { key: 'tna', phase: 'make', label: 'Made · the TNA', who: 'Nitin · Factory', on: dispatched, by: dispatched ? 'dispatched' : null, act: 'merchandiser',
      now: !o.poNo ? 'after the PO' : nextMs ? `factory to log ${nextMs.key.toLowerCase()}${late}` : st.stage },
    { key: 'received', phase: 'make', label: 'Received at BSC', who: 'Warehouse', act: 'warehouse', on: rc.lots.length && !rc.partial ? rc.lots[rc.lots.length - 1].at : null, by: rc.lots.length ? `${rc.received} pcs` : null,
      now: rc.partial ? `${rc.received} of ${rc.base} in` : dispatched ? 'warehouse to count it in' : 'after dispatch' },
    { key: 'launch', phase: 'make', label: 'Launched', who: 'Planning · Design', act: 'planning', on: launch?.launchedOn, by: launch?.dropMonth,
      now: launch ? `${launch.dropMonth} drop${launch.launchOn ? ` · ${fmtDate(launch.launchOn)}` : ''}` : 'planning puts it in a drop' },
  ];
  const current = steps.findIndex(x => !x.on);
  const next = current >= 0 ? steps[current] : null;
  /* "where it is" for a list: the step name, or the TNA stage while it is being made */
  const where = !next ? `launched ${fmtDate(launch?.launchedOn)}` : next.key === 'tna' && o.poNo ? `${st.stage}${late}` : next.label;
  return { steps, current, next, where };
}

/* the row's one-line status and whose move it is: every RTW list uses this */
export function rtwRowOf(db: Db, o: ProductionOrder) {
  const j = rtwJourneyOf(db, o); const r = riskOf(o);
  const late = r.bufferDays != null && r.bufferDays < 0 && o.status !== 'Closed';
  const tone: 'good' | 'warn' | 'risk' | 'neutral' = !j.next ? 'neutral' : late ? 'risk' : j.next.phase === 'make' ? 'good' : 'warn';
  return { ...j, step: j.current >= 0 ? j.current + 1 : j.steps.length, tone, late };
}
