/* The RTW journey, one list every screen reads from: ten steps from the request to
   the launch, each ticking itself when its step is done, each naming the move and
   who makes it. The record draws it as a rail; the lists show "where it is" and
   "next" from the same words, so design, sourcing, Nitin, the factory and the
   warehouse all see the same thing. */
import type { Db, ProductionOrder } from './types';
import { fmtDate, daysAgo, receiptOf, riskOf, stageOf, fabricStateOf } from './engines';
import { packReadyOf, openQcOf } from './rtwPack';

export type RtwActor = 'design' | 'sourcing' | 'production' | 'merchandiser' | 'qc' | 'warehouse' | 'planning' | 'finance';
export type RtwPhase = 'design' | 'buy' | 'make' | 'land';
export type RtwStep = { key: string; label: string; who: string; on: string | null | undefined; by?: string | null; now?: string; act?: RtwActor; phase: RtwPhase };
export const RTW_PHASES: { key: RtwPhase; label: string }[] = [{ key: 'design', label: 'Requirement' }, { key: 'buy', label: 'Cost query · PO' }, { key: 'make', label: 'Make · QC' }, { key: 'land', label: 'Deliver · cost · launch' }];
export const RTW_ACTOR_LABEL: Record<RtwActor, string> = { design: 'Category', sourcing: 'Sourcing', production: 'Nitin', merchandiser: 'Merchandiser · Factory', qc: 'QC', warehouse: 'Prince · Enigma', planning: 'Category · Planning', finance: 'Nitin · Category' };
export const SOURCE_LABEL = { design: 'Category ask', planning: 'Planning reorder', 'auto-po': 'Enigma auto-PO' } as const;
/* BSC's chain, 14 Nov 2026: a five-part requirement that goes nowhere until complete; a cost query to factories from the
   factory database; a reply becomes the PO, mailed with the delivery location; the factory returns planned dates; the
   TNA with QC at five points; dispatch with the invoice and packing list to the warehouse; receipt on Enigma; COGS; launch */
export const RTW_INTRO: Record<string, string> = {
  raised: 'Where the ask came from (a category ask, a planning reorder or an Enigma auto-PO) and what it asks for: the style, how many, by when, at what cost.',
  pack: 'The five parts of the requirement: tech pack, fabric info, trim card, size-wise quantity (the cut ratio) and the BOM. Sourcing adds the cloth vendor, its fabric code, the blocked quantity and when the cloth is ready. Nothing goes to Production RTW until every part is in.',
  query: 'Nitin picks factories from the factory database (recommended by category and region, or any other), sets a reply deadline and sends the cost query. PLM mails it to the factories with the requirement and a cost form, copying the merchandiser. Replies land here: cost per piece, lead time, and whether the factory or BSC\'s vendor sources the cloth.',
  po: 'Nitin raises the PO on one reply. PLM mails it to the factory and the merchandiser with the delivery location (3PL warehouse, or Vasai in-house when there is hemming or semi-stitching), the cloth vendor\'s details when BSC\'s vendor supplies it, and the TNA form. There is no PO for the vendor cloth in PLM.',
  plan: 'The TNA form comes back with the planned date for every step, through the merchandiser. Until it does, the merchandiser sees it as owed.',
  tna: 'Every step of the TNA — the factory\'s own fabric PO and receipt, PP sample, size set, cutting, stitching, finishing, dispatch — with planned, revised and actual dates. QC passes or fails the PP sample, the size set and three line inspections; its remarks are on the record for the merchandiser.',
  dispatch: 'After the dispatch actual the merchandiser uploads the factory\'s invoice and packing list. PLM mails both to Prince at the warehouse, who receives against the packing list on Enigma.',
  received: 'What Enigma received, by size, against the packing list: did everything reach?',
  cogs: 'COGS per piece from the costing sheet with the actuals laid over it: fabric at the consumption cutting used, the factory\'s PO price, the sheet\'s trims, transport, freight and overheads. Against MRP net of discounts and GST. Nitin and category see it.',
  launch: 'Planning puts the style in a drop; category mints the design codes; stickers, display and fit pieces, go-live.',
};

export function rtwJourneyOf(db: Db, o: ProductionOrder): { steps: RtwStep[]; current: number; next: RtwStep | null; where: string } {
  const rc = receiptOf(o); const r = riskOf(o); const st = stageOf(o); const fab = fabricStateOf(o);
  const launch = (db.launches ?? []).find(l => l.orderId === o.id) ?? null;
  const nameOf = (id: string | null | undefined) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const raised = o.activity?.find(a => /created|raised/i.test(a.what)) ?? null;
  const sent = o.status !== 'Requirement';
  const pack = packReadyOf(o); const packOn = o.pack?.sentOn ?? (sent ? (o.activity?.find(a => /^Sent to production/i.test(a.what))?.at ?? o.styleHandover) : null);
  const ms = (k: string) => o.milestones.find(m => m.key === k);
  const dispatched = ms('Dispatch')?.actual ?? null; const finished = ms('Finishing End')?.actual ?? null;
  const nextMs = o.milestones.find(m => !m.actual && !m.skipped) ?? null;
  const late = r.bufferDays != null && r.bufferDays < 0 ? ` · ${-r.bufferDays}d late` : '';
  const cq = o.costQuery ?? null; const replies = cq?.replies.length ?? 0; const asked = cq?.factoryIds.length ?? 0;
  const qDeadlineLate = cq && !o.poNo && daysAgo(cq.deadline) > 0 && replies < asked;
  const qc = openQcOf(o); const qcFail = qc.find(x => x.state === 'failed'); const qcDue = qc.find(x => x.state === 'due');
  const tnaNow = !o.tnaPlan?.submittedOn ? 'after the planned dates' : qcFail ? `QC failed the ${qcFail.label.toLowerCase()} · factory to correct and resubmit` : qcDue ? `QC to pass the ${qcDue.label.toLowerCase()}${qcDue.sinceDays ? ` · waiting ${qcDue.sinceDays}d` : ''}` : nextMs ? `factory to log ${nextMs.key.length <= 3 ? nextMs.key : nextMs.key.toLowerCase()}${late}` : st.stage;
  const tnaAct: RtwActor = qcDue && !qcFail ? 'qc' : 'merchandiser';
  const inv = o.invoice ?? null;
  const receivedOn = rc.lots.length && !rc.partial ? rc.lots[rc.lots.length - 1].at : (o.status === 'Closed' ? (ms('Inhouse ETA')?.actual ?? dispatched) : null);
  const cogsOn = o.cogsClosedOn ?? (receivedOn && o.status === 'Closed' ? receivedOn : null);
  const sourceWho = SOURCE_LABEL[o.source ?? 'design'];
  const packNow = pack.ready ? 'category to send it to Production RTW' : pack.sourcingMissing.length === pack.missing.length ? `sourcing to add the cloth vendor${pack.sourcingMissing.length > 1 ? ' details' : ''}` : `category to fill ${pack.missing.length} item${pack.missing.length > 1 ? 's' : ''}${pack.sourcingMissing.length ? ` · sourcing ${pack.sourcingMissing.length}` : ''}`;

  const steps: RtwStep[] = [
    { key: 'raised', phase: 'design', label: 'Raised', who: sourceWho, on: raised?.at ?? o.styleHandover, by: raised?.who ?? sourceWho },
    { key: 'pack', phase: 'design', label: 'Requirement · five parts', who: 'Category · Sourcing', act: pack.ready || pack.sourcingMissing.length < pack.missing.length ? 'design' : 'sourcing', on: packOn, by: packOn ? (o.pack?.sentBy ?? 'sent to Production RTW') : null, now: packNow },
    { key: 'query', phase: 'buy', label: 'Cost query · factories', who: 'Nitin · Factories', act: cq && replies < asked ? 'merchandiser' : 'production', on: cq ? (replies >= asked || o.poNo ? (cq.replies[cq.replies.length - 1]?.repliedOn ?? cq.sentOn) : null) : null, by: cq ? `${replies} of ${asked} replied` : null,
      now: !sent ? 'after the requirement' : !cq ? 'Nitin to pick factories and send the cost query' : `${asked - replies} repl${asked - replies === 1 ? 'y' : 'ies'} due by ${fmtDate(cq.deadline)}${qDeadlineLate ? ` · ${daysAgo(cq.deadline)}d past` : ''}` },
    { key: 'po', phase: 'buy', label: 'PO raised · mailed', who: 'Nitin', act: 'production', on: o.poDate, by: o.poNo ? `${o.poNo} · ${nameOf(o.vendorId)}${o.poMail ? ` · to ${o.poMail.deliveryLocation}` : ''}` : null,
      now: !cq ? 'after the cost query' : replies ? 'Nitin to raise the PO on a reply' : 'after a reply' },
    { key: 'plan', phase: 'buy', label: 'TNA · planned dates', who: 'Factory · Merchandiser', act: 'merchandiser', on: o.tnaPlan?.submittedOn ?? (o.poNo && !o.tnaPlan ? o.poDate : null), by: o.tnaPlan?.submittedOn ? (o.tnaPlan.by ?? 'submitted') : null,
      now: !o.poNo ? 'after the PO' : `merchandiser to return the TNA form${o.tnaPlan ? ` · sent ${fmtDate(o.tnaPlan.sentOn)}` : ''}` },
    { key: 'tna', phase: 'make', label: 'Made · TNA with QC', who: 'Factory · QC · Merchandiser', on: finished ?? dispatched, by: finished ? 'finishing done' : dispatched ? 'dispatched' : null, act: tnaAct,
      now: !o.poNo ? 'after the PO' : tnaNow },
    { key: 'dispatch', phase: 'land', label: 'Dispatched · invoice to the warehouse', who: 'Factory · Merchandiser', act: 'merchandiser', on: inv?.mailedOn ?? null, by: inv ? `invoice ${inv.no} · ${inv.packingList.reduce((a, x) => a + x.qty, 0)} pcs` : null,
      now: !o.poNo ? 'after the PO' : !dispatched ? 'after the dispatch actual on the TNA' : 'merchandiser to upload the invoice and packing list' },
    { key: 'received', phase: 'land', label: 'Received · Enigma', who: 'Prince · Enigma', act: 'warehouse', on: receivedOn, by: receivedOn ? (rc.lots.length ? `${rc.received} pcs` : 'closed') : null,
      now: !inv ? 'after the invoice' : rc.partial ? `${rc.received} of ${rc.base} in` : 'Prince to receive against the packing list on Enigma' },
    { key: 'cogs', phase: 'land', label: 'COGS · profitability', who: 'Nitin · Category', act: 'production', on: cogsOn, by: cogsOn ? 'closed' : null,
      now: !receivedOn ? 'after receipt' : 'Nitin to close COGS' },
    { key: 'launch', phase: 'land', label: 'Launched', who: 'Category · Planning', act: 'planning', on: launch?.launchedOn, by: launch?.dropMonth,
      now: launch ? `${launch.dropMonth} drop${launch.launchOn ? ` · ${fmtDate(launch.launchOn)}` : ''}` : 'planning puts it in a drop' },
  ];
  /* an open cut-ratio ask pulls the record back to the TNA until it is answered */
  const ratioOpen = o.status === 'Open' && fab.key === 'ratio-asked';
  const current = ratioOpen ? steps.findIndex(x => x.key === 'tna') : steps.findIndex(x => !x.on);
  const next = current >= 0 ? steps[current] : null;
  /* "where it is" for a list: the step name, or the TNA stage while it is being made */
  const where = ratioOpen ? `cut ratio with category · short ${fab.short} m` : !next ? `launched ${fmtDate(launch?.launchedOn)}` : next.key === 'tna' && o.poNo ? (qcFail ? `QC failed · ${qcFail.label.toLowerCase()}` : qcDue ? `QC · ${qcDue.label.toLowerCase()}` : `${st.stage}${late}`) : next.key === 'pack' ? (pack.ready ? 'requirement complete' : `requirement · ${pack.missing.length} to fill`) : next.key === 'query' && cq ? `cost query · ${replies} of ${asked} replied` : next.label;
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
  { key: 'requested', label: 'Requirement', hint: 'category and sourcing are filling the five parts' },
  { key: 'queried', label: 'Cost query out', hint: 'factories asked; replies due by the deadline' },
  { key: 'po', label: 'PO raised', hint: 'mailed to the factory; the TNA form is owed' },
  { key: 'planned', label: 'TNA planned', hint: 'the factory returned its planned dates' },
  { key: 'making', label: 'In production', hint: 'the TNA is running; QC at five points' },
  { key: 'dispatched', label: 'Dispatched', hint: 'invoice and packing list with the warehouse' },
  { key: 'received', label: 'Received', hint: 'on Enigma; COGS' },
  { key: 'launched', label: 'Launched', hint: 'in a drop' },
] as const;
export type RtwStatusKey = typeof RTW_STATUSES[number]['key'];
export function rtwStatusOf(db: Db, o: ProductionOrder): { key: RtwStatusKey; label: string; i: number } {
  const j = rtwJourneyOf(db, o); const on = (k: string) => !!j.steps.find(s => s.key === k)?.on;
  const key: RtwStatusKey = on('launch') ? 'launched' : on('received') ? 'received' : on('dispatch') ? 'dispatched' : on('plan') ? 'making' : on('po') ? (o.tnaPlan?.submittedOn ? 'planned' : 'po') : on('pack') ? 'queried' : 'requested';
  const i = RTW_STATUSES.findIndex(s => s.key === key);
  return { key, label: RTW_STATUSES[i].label, i };
}
