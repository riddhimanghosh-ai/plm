/* The RTW journey, one list every screen reads from: ten steps from the request to
   the launch, each ticking itself when its step is done, each naming the move and
   who makes it. The record draws it as a rail; the lists show "where it is" and
   "next" from the same words, so design, sourcing, Nitin, the factory and the
   warehouse all see the same thing. */
import type { Db, ProductionOrder } from './types';
import { fmtDate, sendReadinessOf, sourcingStateOf, factoryStateOf, sampleStatusOf, protoStatusOf, receiptOf, riskOf, stageOf, fabricStateOf } from './engines';

export type RtwActor = 'design' | 'sourcing' | 'production' | 'merchandiser' | 'warehouse' | 'planning';
export type RtwPhase = 'design' | 'buy' | 'make';
export type RtwStep = { key: string; label: string; who: string; on: string | null | undefined; by?: string | null; now?: string; act?: RtwActor; phase: RtwPhase };
export const RTW_PHASES: { key: RtwPhase; label: string }[] = [{ key: 'design', label: 'Design' }, { key: 'buy', label: 'Buy · cloth and factory' }, { key: 'make', label: 'Make · land · launch' }];
export const RTW_ACTOR_LABEL: Record<RtwActor, string> = { design: 'Design', sourcing: 'Sourcing', production: 'Nitin', merchandiser: 'Factory', warehouse: 'Enigma', planning: 'Planning' };
export const RTW_INTRO: Record<string, string> = {
  raised: 'What design asked for: the style, how many, by when, at what cost.',
  proto: 'Three things go on before it can be sent: the prototype (or "none needed"), the cloth brief sourcing shops against, and the BOM with the tech pack.',
  sent: 'One click sends the cloth brief to sourcing and the style to Nitin. Both start at the same time.',
  sourcing: 'Sourcing puts one vendor against the brief; design pushes the fabric PO, sends it back, or asks for more time.',
  factory: 'Nitin proposes a factory with the cost and date agreed on the phone; design accepts and the PO is raised. The PO date generates the TNA.',
  cloth: 'Once both POs are out, sourcing sends the cloth and trims to the factory, which counts them in. Short cloth comes back to design for a cut ratio.',
  sample: 'The factory sends the first sample from bulk cloth; production approves it or asks for another round.',
  tna: 'Every milestone from fabric PO to dispatch. The factory logs its own dates; late steps show in red.',
  received: 'The warehouse counts the goods in on Enigma; the GRN comes back here by size, lot by lot.',
  launch: 'Planning puts the style in a drop; the launch record carries the date, the stores and the marketing name.',
};

export function rtwJourneyOf(db: Db, o: ProductionOrder): { steps: RtwStep[]; current: number; next: RtwStep | null; where: string } {
  const readiness = sendReadinessOf(db, o); const proto = protoStatusOf(o);
  const ss = sourcingStateOf(o); const fst = factoryStateOf(o); const sample = sampleStatusOf(o);
  const rc = receiptOf(o); const r = riskOf(o); const st = stageOf(o); const fab = fabricStateOf(o);
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
    /* a cut-ratio ask moves the step to design (or to Nitin, to send the answer on): the lists all say so */
    { key: 'cloth', phase: 'buy', label: 'Cloth at the factory', who: 'Sourcing · Factory', on: !o.fabricNominated ? o.poDate : o.fabricSupply?.receipt?.on, by: o.fabricSupply?.receipt ? `${o.fabricSupply.receipt.metresOk} m` : null,
      act: fab.key === 'ratio-asked' ? 'design' : fab.key === 'ratio-given' ? 'production' : o.fabricSupply?.sentToFactoryOn ? 'merchandiser' : 'sourcing',
      now: !o.poNo ? 'after the PO' : fab.key === 'ratio-asked' ? (fab.cr?.kind === 'cut-short' ? 'design to approve the cut-short' : 'design to give new sizes') : fab.key === 'ratio-given' ? `Nitin to send the new ${fab.cr?.kind === 'cut-short' ? 'cut-short' : 'ratio'} to the factory`
        : o.fabricSupply?.sentToFactoryOn ? 'factory to count it in' : 'sourcing to send it' },
    { key: 'sample', phase: 'make', label: 'Sample approved', who: 'Factory · Production', on: sample.ppGoAhead, by: sample.approved ? `round ${sample.approved.round}` : null,
      act: sample.state === 'with production unit' ? 'production' : 'merchandiser',
      now: !o.poNo ? 'after the PO' : sample.state === 'with production unit' ? 'production to review' : sample.state === 'resubmit' ? 'factory to resubmit' : 'factory to send the first sample' },
    { key: 'tna', phase: 'make', label: 'Made · the TNA', who: 'Nitin · Factory', on: dispatched, by: dispatched ? 'dispatched' : null, act: 'merchandiser',
      now: !o.poNo ? 'after the PO' : nextMs ? `factory to log ${nextMs.key.length <= 3 ? nextMs.key : nextMs.key.toLowerCase()}${late}` : st.stage },
    { key: 'received', phase: 'make', label: 'Received at BSC', who: 'Enigma · GRN', act: 'warehouse', on: rc.lots.length && !rc.partial ? rc.lots[rc.lots.length - 1].at : null, by: rc.lots.length ? `${rc.received} pcs` : null,
      now: rc.partial ? `${rc.received} of ${rc.base} in` : dispatched ? 'GRN on Enigma to come' : 'after dispatch' },
    { key: 'launch', phase: 'make', label: 'Launched', who: 'Planning · Design', act: 'planning', on: launch?.launchedOn, by: launch?.dropMonth,
      now: launch ? `${launch.dropMonth} drop${launch.launchOn ? ` · ${fmtDate(launch.launchOn)}` : ''}` : 'planning puts it in a drop' },
  ];
  /* an open cut-ratio ask pulls the record back to the cloth step until it is answered and sent, even though the cloth is counted */
  const ratioOpen = o.status === 'Open' && (fab.key === 'ratio-asked' || fab.key === 'ratio-given');
  const current = ratioOpen ? steps.findIndex(x => x.key === 'cloth') : steps.findIndex(x => !x.on);
  const next = current >= 0 ? steps[current] : null;
  /* "where it is" for a list: the step name, or the TNA stage while it is being made */
  const where = ratioOpen ? (fab.key === 'ratio-asked' ? `cut ratio with design · short ${fab.short} m` : `new ${fab.cr?.kind === 'cut-short' ? 'cut-short' : 'cut ratio'} to send`) : !next ? `launched ${fmtDate(launch?.launchedOn)}` : next.key === 'tna' && o.poNo ? `${st.stage}${late}` : next.label;
  return { steps, current, next, where };
}

/* the row's one-line status and whose move it is: every RTW list uses this */
export function rtwRowOf(db: Db, o: ProductionOrder) {
  const j = rtwJourneyOf(db, o); const r = riskOf(o);
  const late = r.bufferDays != null && r.bufferDays < 0 && o.status !== 'Closed';
  const tone: 'good' | 'warn' | 'risk' | 'neutral' = !j.next ? 'neutral' : late ? 'risk' : j.next.phase === 'make' ? 'good' : 'warn';
  return { ...j, step: j.current >= 0 ? j.current + 1 : j.steps.length, tone, late };
}

/* one status per style, by what has actually happened: the tracker's filter row */
export const RTW_STATUSES = [
  { key: 'requested', label: 'With design', hint: 'design is still putting the proto, BOM and tech pack on' },
  { key: 'sent', label: 'Finding cloth & factory', hint: 'sourcing is finding the cloth, Nitin the factory' },
  { key: 'fabric-po', label: 'Cloth ordered', hint: 'cloth bought from the mill; the factory PO is still to come' },
  { key: 'factory-po', label: 'PO raised', hint: 'PO with the factory; cloth on its way' },
  { key: 'cloth', label: 'Cloth at factory', hint: 'cloth counted in; the sample is next' },
  { key: 'sample', label: 'In production', hint: 'sample approved, bulk being made' },
  { key: 'dispatched', label: 'Shipped to BSC', hint: 'on the road from the factory' },
  { key: 'received', label: 'Received', hint: 'GRN on Enigma, by size' },
  { key: 'launched', label: 'Launched', hint: 'in a drop' },
] as const;
export type RtwStatusKey = typeof RTW_STATUSES[number]['key'];
export function rtwStatusOf(db: Db, o: ProductionOrder): { key: RtwStatusKey; label: string; i: number } {
  const j = rtwJourneyOf(db, o); const on = (k: string) => !!j.steps.find(s => s.key === k)?.on;
  const key: RtwStatusKey = on('launch') ? 'launched' : on('received') ? 'received' : on('tna') ? 'dispatched' : on('sample') ? 'sample' : on('cloth') ? 'cloth'
    : on('factory') ? 'factory-po' : on('sourcing') && o.fabricNominated ? 'fabric-po' : on('sent') ? 'sent' : 'requested';
  const i = RTW_STATUSES.findIndex(s => s.key === key);
  return { key, label: RTW_STATUSES[i].label, i };
}
