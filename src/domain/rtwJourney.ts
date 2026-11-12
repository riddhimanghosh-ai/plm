/* The RTW journey, one list every screen reads from: ten steps from the request to
   the launch, each ticking itself when its step is done, each naming the move and
   who makes it. The record draws it as a rail; the lists show "where it is" and
   "next" from the same words, so design, sourcing, Nitin, the factory and the
   warehouse all see the same thing. */
import type { Db, ProductionOrder } from './types';
import { fmtDate, factoryStateOf, sourcingStateOf, sampleStatusOf, protoStatusOf, receiptOf, riskOf, stageOf, fabricStateOf } from './engines';

export type RtwActor = 'design' | 'sourcing' | 'production' | 'merchandiser' | 'warehouse' | 'planning' | 'finance';
export type RtwPhase = 'design' | 'buy' | 'make' | 'land';
export type RtwStep = { key: string; label: string; who: string; on: string | null | undefined; by?: string | null; now?: string; act?: RtwActor; phase: RtwPhase };
export const RTW_PHASES: { key: RtwPhase; label: string }[] = [{ key: 'design', label: 'Design · sample' }, { key: 'buy', label: 'Order · buy' }, { key: 'make', label: 'Make · QC' }, { key: 'land', label: 'Ship · cost · launch' }];
export const RTW_ACTOR_LABEL: Record<RtwActor, string> = { design: 'Design', sourcing: 'Sourcing', production: 'Nitin', merchandiser: 'Factory', warehouse: 'Enigma', planning: 'Design · Planning', finance: 'Nitin · Design' };
export const SOURCE_LABEL = { design: 'Design ask', planning: 'Planning reorder', 'auto-po': 'Enigma auto-PO' } as const;
/* BSC's chain, 12 Nov 2026: design and sampling before the bulk order; the PO with its costs, acknowledged by the factory;
   tech pack and the shopping of cloth and trims; the TNA; QC; the shipping cycle; COGS; launch */
export const RTW_INTRO: Record<string, string> = {
  raised: 'Where the ask came from (a design ask, a planning reorder or an Enigma auto-PO) and what it asks for: the style, how many, by when, at what cost.',
  design: 'Design works the style up: the cloth brief, the BOM, the CAD. One click sends it to the factory for sampling.',
  sample: 'A checklist of three stages: prototype, sampling cycle, trial cycle. Each goes to the factory with a due date and comes back to be approved or given remarks; remarks mean design updates the CAD and the design and sends it again. A stage the style does not need is marked not needed.',
  factory: 'The bulk order: quantity and size-wise quantity. Nitin proposes the factory, design accepts and raises the PO with the piece cost, logistics and other costs. The factory acknowledges it. Sourcing is shopping the cloth at the same time.',
  cloth: 'Sourcing shops the cloth and trims from the day the sample is approved, beside the bulk order; design uploads the tech pack; the factory counts everything in and approves it. Short cloth comes back to design, whose new cut ratio the factory sees at once.',
  tna: 'Every milestone from fabric PO to finishing. The factory logs its own dates; late steps show in red.',
  qc: 'Final inspection at the factory: pass, rework or reject.',
  ship: 'The factory logs dispatch on the TNA. AWB, courier and logistics stay outside PLM; Shravani does the GRN on Enigma and it lands here by size, lot by lot.',
  cogs: 'COGS per piece from the costing sheet with the actuals laid over it: fabric at the consumption cutting used, the factory\'s PO price, the sheet\'s trims, transport, freight and overheads, and the PO\'s own logistics and other costs. Against MRP net of discounts and GST. Nitin and design see it.',
  launch: 'Planning puts the style in a drop; design mints the design codes; stickers, display and fit pieces, go-live.',
};

export function rtwJourneyOf(db: Db, o: ProductionOrder): { steps: RtwStep[]; current: number; next: RtwStep | null; where: string } {
  const proto = protoStatusOf(o); const fst = factoryStateOf(o); const sample = sampleStatusOf(o);
  const rc = receiptOf(o); const r = riskOf(o); const st = stageOf(o); const fab = fabricStateOf(o); const ss = sourcingStateOf(o);
  const launch = (db.launches ?? []).find(l => l.orderId === o.id) ?? null;
  const nameOf = (id: string | null | undefined) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const raised = o.activity?.find(a => /created|raised/i.test(a.what)) ?? null;
  const sentLog = o.activity?.find(a => /^Sent to production/i.test(a.what)) ?? null;
  const sent = o.status !== 'Requirement';
  const ms = (k: string) => o.milestones.find(m => m.key === k);
  const dispatched = ms('Dispatch')?.actual ?? null; const finished = ms('Finishing End')?.actual ?? null; const fiDone = ms('FI')?.actual ?? null;
  const nextMs = o.milestones.find(m => !m.actual) ?? null;
  const late = r.bufferDays != null && r.bufferDays < 0 ? ` · ${-r.bufferDays}d late` : '';
  const sc = o.sampleCycle; const openRound = sc?.rounds.find(x => !x.outcome) ?? null; const lastRound = sc?.rounds[sc.rounds.length - 1] ?? null;
  const sampleOn = sc ? sc.approvedOn : (sent ? (proto.approved?.reviewedOn ?? o.proto?.skipped?.on ?? sample.ppGoAhead ?? (o.poDate ?? null)) : null);
  const STAGE_LBL = { prototype: 'prototype', sample: 'sampling cycle', trial: 'trial cycle' } as const;
  const skippedSt = new Set(sc?.skipped ?? []);
  const curStage = (['prototype', 'sample', 'trial'] as const).find(k => !skippedSt.has(k) && !sc?.rounds.some(x => x.kind === k && x.outcome === 'approved')) ?? null;
  const sampleNow = !sent ? 'after it is sent for sampling'
    : openRound ? (!openRound.sampledOn ? `${STAGE_LBL[openRound.kind]} round ${openRound.n} due ${openRound.dueOn ? fmtDate(openRound.dueOn) : 'date not set'}` : `design to approve the ${STAGE_LBL[openRound.kind]} or give remarks`)
    : lastRound?.outcome === 'remarks' && !lastRound.cadUpdatedOn ? 'design to update the CAD and the design'
    : sc?.approvedOn ? 'approved' : curStage ? `design to send the ${STAGE_LBL[curStage]}` : 'approved';
  const sampleAct: RtwActor = openRound && !openRound.sampledOn ? 'merchandiser' : 'design';
  const shipOn = (rc.lots.length && !rc.partial ? rc.lots[rc.lots.length - 1].at : null) ?? (o.status === 'Closed' ? (ms('Inhouse ETA')?.actual ?? dispatched) : null);
  const shipNow = rc.partial ? `${rc.received} of ${rc.base} in` : dispatched ? 'GRN on Enigma to come' : 'after QC and dispatch';
  const shipAct: RtwActor = 'warehouse';
  const qcLast = (o.qc ?? [])[o.qc?.length ? o.qc.length - 1 : 0]; const qcOn = (o.qc ?? []).find(q => q.result === 'pass')?.inspectedOn ?? fiDone ?? null;
  const cogsOn = o.cogsClosedOn ?? (shipOn && o.status === 'Closed' ? shipOn : null);
  const sourceWho = SOURCE_LABEL[o.source ?? 'design'];

  const steps: RtwStep[] = [
    { key: 'raised', phase: 'design', label: 'Raised', who: sourceWho, on: raised?.at ?? o.styleHandover, by: raised?.who ?? sourceWho },
    { key: 'design', phase: 'design', label: 'Designed · sent for sampling', who: 'Design', act: 'design', on: sent ? (sentLog?.at ?? sc?.rounds[0]?.sentOn ?? o.styleHandover) : null, by: sentLog?.who,
      now: 'design to send it to the factory for sampling' },
    { key: 'sample', phase: 'design', label: 'Sample cycle', who: 'Factory · Design', act: sampleAct, on: sampleOn, by: sc?.approvedOn ? `round ${lastRound?.n ?? 1}` : proto.approved ? `proto round ${proto.approved.round}` : o.proto?.skipped ? 'none needed' : sample.approved ? `round ${sample.approved.round}` : null,
      now: sampleNow },
    { key: 'factory', phase: 'buy', label: 'Bulk order · PO', who: 'Design · Nitin · Factory', on: o.poDate, by: o.poNo ? `${o.poNo} · ${nameOf(o.vendorId)}${o.poAckOn ? ' · acknowledged' : ''}` : null,
      act: fst.key === 'accepted' || fst.key === 'with-design' ? 'design' : 'production',
      now: !sent ? 'after the sample' : fst.key === 'accepted' ? 'design to raise the PO' : fst.key === 'with-design' ? 'design to accept or send back' : 'Nitin to propose a factory' },
    { key: 'cloth', phase: 'buy', label: 'Tech pack · cloth and trims', who: 'Design · Sourcing · Factory', on: o.receivedApprovedOn ?? (!o.fabricNominated ? o.poDate : o.fabricSupply?.receipt?.on), by: o.receivedApprovedOn ? 'all received, approved' : o.fabricSupply?.receipt ? `${o.fabricSupply.receipt.metresOk} m` : null,
      act: fab.key === 'ratio-asked' ? 'design' : o.fabricSupply?.receipt ? 'merchandiser' : o.fabricSupply?.sentToFactoryOn ? 'merchandiser' : o.sourcing?.fabricPo ? 'sourcing' : (ss.key === 'choose' || ss.key === 'raise-po') ? 'design' : 'sourcing',
      now: !o.poNo ? (o.sourcing?.fabricPo ? 'cloth bought · waiting for the PO' : 'sourcing shops the cloth beside the PO') : !o.poAckOn && o.poCosts !== undefined ? 'factory to acknowledge the PO' : fab.key === 'ratio-asked' ? (fab.cr?.kind === 'cut-short' ? 'design to approve the cut-short' : 'design to give new sizes')
        : o.fabricSupply?.receipt ? 'factory to approve all received' : o.fabricSupply?.sentToFactoryOn ? 'factory to count it in' : o.sourcing?.fabricPo ? 'sourcing to send it' : ss.key === 'choose' || ss.key === 'raise-po' ? 'design to push the fabric PO' : 'sourcing to shop the cloth' },
    { key: 'tna', phase: 'make', label: 'Made · the TNA', who: 'Factory · Nitin', on: finished ?? dispatched, by: finished ? 'finishing done' : dispatched ? 'dispatched' : null, act: 'merchandiser',
      now: !o.poNo ? 'after the PO' : nextMs ? `factory to log ${nextMs.key.length <= 3 ? nextMs.key : nextMs.key.toLowerCase()}${late}` : st.stage },
    { key: 'qc', phase: 'make', label: 'QC', who: 'Factory', act: 'merchandiser', on: qcOn, by: qcOn ? 'passed' : null,
      now: !o.poNo ? 'after the PO' : qcLast?.result === 'rework' ? 'factory to rework and inspect again' : qcLast?.result === 'reject' ? 'rejected · Nitin to decide' : 'factory to inspect' },
    { key: 'ship', phase: 'land', label: 'Delivered · GRN', who: 'Shravani · Enigma', act: shipAct, on: shipOn, by: shipOn ? (rc.lots.length ? `${rc.received} pcs` : 'closed') : null,
      now: !o.poNo ? 'after the PO' : shipNow },
    { key: 'cogs', phase: 'land', label: 'COGS · profitability', who: 'Nitin · Design', act: 'production', on: cogsOn, by: cogsOn ? 'closed' : null,
      now: !shipOn ? 'after delivery' : 'Nitin to close COGS' },
    { key: 'launch', phase: 'land', label: 'Launched', who: 'Design · Planning', act: 'planning', on: launch?.launchedOn, by: launch?.dropMonth,
      now: launch ? `${launch.dropMonth} drop${launch.launchOn ? ` · ${fmtDate(launch.launchOn)}` : ''}` : 'planning puts it in a drop' },
  ];
  /* an open cut-ratio ask pulls the record back to the cloth step until it is answered and sent, even though the cloth is counted */
  const ratioOpen = o.status === 'Open' && fab.key === 'ratio-asked';
  const current = ratioOpen ? steps.findIndex(x => x.key === 'cloth') : steps.findIndex(x => !x.on);
  const next = current >= 0 ? steps[current] : null;
  /* "where it is" for a list: the step name, or the TNA stage while it is being made */
  const where = ratioOpen ? `cut ratio with design · short ${fab.short} m` : !next ? `launched ${fmtDate(launch?.launchedOn)}` : next.key === 'tna' && o.poNo ? `${st.stage}${late}` : next.key === 'sample' && openRound ? `${({ prototype: 'prototype', sample: 'sampling', trial: 'trial' } as const)[openRound.kind]} round ${openRound.n}` : next.label;
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
  { key: 'requested', label: 'With design', hint: 'design is working the style up' },
  { key: 'sampling', label: 'Sampling', hint: 'rounds with the factory until the sample is right' },
  { key: 'sample-ok', label: 'Sample approved', hint: 'the bulk order and PO come next' },
  { key: 'factory-po', label: 'PO raised', hint: 'tech pack, cloth and trims on their way to the factory' },
  { key: 'cloth', label: 'In production', hint: 'everything received; the TNA is running' },
  { key: 'qc', label: 'QC', hint: 'final inspection' },
  { key: 'shipping', label: 'Dispatched', hint: 'on its way; the GRN on Enigma is to come' },
  { key: 'received', label: 'Delivered', hint: 'GRN on Enigma; COGS' },
  { key: 'launched', label: 'Launched', hint: 'in a drop' },
] as const;
export type RtwStatusKey = typeof RTW_STATUSES[number]['key'];
export function rtwStatusOf(db: Db, o: ProductionOrder): { key: RtwStatusKey; label: string; i: number } {
  const j = rtwJourneyOf(db, o); const on = (k: string) => !!j.steps.find(s => s.key === k)?.on;
  const key: RtwStatusKey = on('launch') ? 'launched' : on('ship') ? 'received' : on('qc') ? 'shipping' : on('tna') ? 'qc' : on('cloth') ? 'cloth'
    : on('factory') ? 'factory-po' : on('sample') ? 'sample-ok' : on('design') ? 'sampling' : 'requested';
  const i = RTW_STATUSES.findIndex(s => s.key === key);
  return { key, label: RTW_STATUSES[i].label, i };
}
