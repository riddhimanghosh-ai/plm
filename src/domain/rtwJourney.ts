/* The RTW journey, one list every screen reads from: ten steps from the request to
   the launch, each ticking itself when its step is done, each naming the move and
   who makes it. The record draws it as a rail; the lists show "where it is" and
   "next" from the same words, so design, sourcing, Nitin, the factory and the
   warehouse all see the same thing. */
import type { Db, ProductionOrder } from './types';
import { fmtDate, daysAgo, receiptOf, riskOf, stageOf, fabricStateOf } from './engines';
import { PEOPLE } from './reference';
import { packReadyOf, openQcOf, targetReviseOpenOf, poFabricsOf, approvalOf, countedBy3plOf } from './rtwPack';

export type RtwActor = 'hod' | 'design' | 'sourcing' | 'production' | 'merchandiser' | 'qc' | 'warehouse' | 'planning' | 'finance';
export type RtwPhase = 'design' | 'buy' | 'make' | 'land';
export type RtwStep = { key: string; label: string; who: string; on: string | null | undefined; by?: string | null; now?: string; act?: RtwActor; phase: RtwPhase; tone?: 'risk' | 'warn' };   // tone: the step went wrong — short cloth, a failed colour — even if it is done
export const RTW_PHASES: { key: RtwPhase; label: string }[] = [{ key: 'design', label: 'Requirement' }, { key: 'buy', label: 'Factory counter sourcing · PO' }, { key: 'make', label: 'Make · QC' }, { key: 'land', label: 'Deliver · cost · launch' }];
export const RTW_ACTOR_LABEL: Record<RtwActor, string> = { hod: 'HOD', design: 'Category', sourcing: 'Sourcing', production: 'Nitin', merchandiser: 'Merchandiser · Factory', qc: 'QC', warehouse: 'Prince · Enigma', planning: 'Category · Planning', finance: 'Finance' };
export const SOURCE_LABEL = { design: 'Category ask', planning: 'Planning reorder', 'auto-po': 'Enigma auto-PO' } as const;
/* BSC's chain, 14 Nov 2026: a five-part requirement that goes nowhere until complete; a cost query to factories from the
   factory database; a reply becomes the PO, mailed with the delivery location; the factory returns planned dates; the
   TNA with QC at five points; dispatch with the invoice and packing list to the warehouse; receipt on Enigma; COGS; launch */
export const RTW_INTRO: Record<string, string> = {
  raised: 'Where the ask came from (a category ask or a planning reorder) and what it asks for: the style, how many, by when, at what cost.',
  pack: 'The parts of the requirement: tech pack, fabric info, trim card, size-wise quantity (the cut ratio) and the BOM. Sourcing adds the cloth vendor, its fabric code, the blocked quantity and when the cloth is ready. Nothing goes to Production RTW until every part is in.',
  query: 'Nitin picks factories from the factory database (recommended by category and region, or any other), sets a reply deadline and sends the counter-sourcing query. PLM mails it to the factories with the requirement and a cost form, copying the merchandiser. Replies land here: cost per piece and lead time. Before raising the PO, Nitin decides the cloth: BSC sends it, the factory buys it from BSC\'s vendor, or the factory\'s own. A reply over the target cost or past the target in-house date is flagged red; when none fits, category revises the target and the record keeps what it was.',
  po: 'Category drafts the PO on one reply; one PO can carry several requirements. PLM mails it to the factory and the merchandiser with the delivery location (3PL warehouse, or Vasai in-house when there is hemming or semi-stitching), the cloth vendor\'s details when BSC\'s vendor supplies it, and the TNA form. There is no PO for the vendor cloth in PLM.',
  plan: 'The TNA form comes back with the planned date for every step, through the merchandiser. Until it does, the merchandiser sees it as owed.',
  cloth: 'Three ways the cloth reaches the factory, decided by RTW Production before the PO: BSC sends it — cloth and trims both shipped by sourcing, the factory counts them in; the factory buys it from BSC\'s vendor on the details in the PO; or the factory\'s own cloth. In the last two the factory gives back its fabric PO and receipt, which land on the TNA. Less or more cloth or trim than the PO needs goes back to category for a new cut ratio.',
  tna: 'Every step of the TNA — the factory\'s own fabric PO and receipt, PP sample, size set, cutting, stitching, finishing, dispatch — with planned, revised and actual dates. QC passes or fails the PP sample, the size set and three line inspections; its remarks are on the record for the merchandiser.',
  dispatch: 'After the dispatch actual the merchandiser uploads the factory\'s invoice and packing list. PLM mails both to Prince at the warehouse, who receives against the packing list on Enigma.',
  received: 'What was received, by size, against the PO. Delivered to Vasai, Prince counts it in. Delivered to the 3PL, the merchandiser uploads the 3PL consignment report and the count fills from it.',
  cogs: 'Direct COGS per piece: the PO cost (FOB) plus the fixed packaging, shipping and process costs. That cost times the multiplier is the MRP category puts in Enigma. Indirect COGS is not in this phase.',
  invoices: 'Every invoice, debit note and credit note on this PO, both ways, with its document — logged here for reconciliation.',
  launch: 'The style into Enigma with every size: code, name, MRP and one SKU per size.',
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
  const tr = targetReviseOpenOf(o); const pf = poFabricsOf(o); const ap = approvalOf(o);
  const qDeadlineLate = cq && !o.poNo && daysAgo(cq.deadline) > 0 && replies < asked;
  const qc = openQcOf(o); const qcFail = qc.find(x => x.state === 'failed'); const qcDue = qc.find(x => x.state === 'due');
  const tnaNow = !o.tnaPlan?.submittedOn ? 'after the planned dates' : qcFail ? `QC failed the ${qcFail.label.toLowerCase()} · factory to correct and resubmit` : qcDue ? `QC to pass the ${qcDue.label.toLowerCase()}${qcDue.sinceDays ? ` · waiting ${qcDue.sinceDays}d` : ''}` : nextMs ? `factory to log ${nextMs.key.length <= 3 ? nextMs.key : nextMs.key.toLowerCase()}${late}` : st.stage;
  const tnaAct: RtwActor = qcDue && !qcFail ? 'qc' : 'merchandiser';
  const inv = o.invoice ?? null;
  const receivedOn = rc.lots.length && !rc.partial ? rc.lots[rc.lots.length - 1].at : (o.status === 'Closed' ? (ms('Inhouse ETA')?.actual ?? dispatched) : null);
  const cogsOn = o.cogsClosedOn ?? (receivedOn && o.status === 'Closed' ? receivedOn : null);
  const sourceWho = SOURCE_LABEL[o.source ?? 'design'];
  const packNow = pack.ready ? 'category to send it to Production RTW' : pack.sourcingMissing.length === pack.missing.length ? `sourcing to add vendors on ${pack.sourcingMissing.length} BOM line${pack.sourcingMissing.length > 1 ? 's' : ''}` : `category to fill ${pack.missing.length} item${pack.missing.length > 1 ? 's' : ''}${pack.sourcingMissing.length ? ` · sourcing ${pack.sourcingMissing.length}` : ''}`;

  const steps: RtwStep[] = [
    { key: 'raised', phase: 'design', label: 'Raised', who: sourceWho, on: raised?.at ?? o.styleHandover, by: raised?.who ?? sourceWho },
    { key: 'pack', phase: 'design', label: 'Requirement', who: 'Category · Sourcing', act: pack.ready || pack.sourcingMissing.length < pack.missing.length ? 'design' : 'sourcing', on: packOn, by: packOn ? (o.pack?.sentBy ?? 'sent to Production RTW') : null, now: packNow },
    { key: 'query', phase: 'buy', label: 'Factory counter sourcing', who: 'Nitin · Factories · Category', act: tr.open && replies >= asked ? 'design' : cq && replies < asked ? 'merchandiser' : 'production', on: cq ? ((replies >= asked && !tr.open) || o.poNo || (o.poApproval && replies > 0) ? (cq.replies[cq.replies.length - 1]?.repliedOn ?? cq.sentOn) : null) : null, by: cq ? `${replies} of ${asked} replied` : null,
      now: !sent ? 'after the requirement' : !cq ? 'Nitin to pick factories and send the counter-sourcing query' : tr.open && replies >= asked ? `every reply over target · category to revise the target ${tr.flagged.some(r => r.cost > o.targetCost) ? 'cost' : ''}${tr.flagged.some(r => r.cost > o.targetCost) && tr.flagged.some(r => r.leadDays > 0) ? ' or ' : ''}${tr.flagged.some(r => r.leadDays > 0) ? 'in-house date' : ''}`.replace(/target $/, 'target') : `${asked - replies} repl${asked - replies === 1 ? 'y' : 'ies'} due by ${fmtDate(cq.deadline)}${qDeadlineLate ? ` · ${daysAgo(cq.deadline)}d past` : ''}${tr.open ? ' · replies so far over target' : ''}` },
    /* 17 Nov 2026: the SKUs go into Enigma once the factories have quoted, and the PO needs approval before it is drafted */
    { key: 'launch', phase: 'buy', label: 'Added to Enigma · SKUs', who: 'Category', act: 'design', on: o.enigmaProduct?.addedOn ?? launch?.launchedOn ?? null, by: o.enigmaProduct ? `${o.enigmaProduct.code} · ${o.enigmaProduct.skus.length} SKUs` : launch?.dropMonth,
      now: !replies ? 'after a factory reply' : 'category to add the SKUs in Enigma; no PO before that' },
    { key: 'approval', phase: 'buy', label: 'PO draft · approval', who: 'Category · HOD · Finance', act: ap.state === 'pending' ? ap.pending[0] : 'design', on: ap.approved ? (ap.a!.decisions[ap.a!.decisions.length - 1]?.on ?? ap.a!.askedOn) : (o.poNo ? o.poDate : null), by: ap.approved ? ap.line : o.poNo ? 'approved' : null,
      tone: ap.state === 'rejected' || ap.late ? 'risk' : undefined,
      now: !replies ? 'after a factory reply' : !(o.enigmaProduct || launch) ? 'after the SKUs are in Enigma' : ap.state === 'none' ? 'category to draft the PO on a reply and send it for approval' : ap.state === 'rejected' ? `${ap.line} · category to change the PO and send again` : `${ap.line}${ap.late ? ' · past the date' : ''}` },
    { key: 'po', phase: 'buy', label: 'PO raised · mailed', who: 'on approval', act: 'design', on: o.poDate, by: o.poNo ? `${o.poNo} · ${nameOf(o.vendorId)}${o.poMail ? ` · to ${o.poMail.deliveryLocation}${o.poMail.sentOn ? '' : ' · mail to send'}` : ''}` : null,
      now: !cq ? 'after counter sourcing' : !replies ? 'after a reply' : 'raised and mailed by itself once approved' },
    { key: 'plan', phase: 'buy', label: 'TNA · planned dates', who: 'Factory · Merchandiser', act: o.poMail && !o.poMail.sentOn ? 'production' : 'merchandiser', on: o.tnaPlan?.submittedOn ?? (o.poNo && !o.tnaPlan ? o.poDate : null), by: o.tnaPlan?.submittedOn ? tnaByOf(o) : null,
      now: !o.poNo ? 'after the PO' : `merchandiser to return the TNA form${o.tnaPlan ? ` · sent ${fmtDate(o.tnaPlan.sentOn)}` : ''}` },
    { key: 'cloth', phase: 'make', tone: pf.failedOpen.length || fab.short > 0 || (fab.cr && !fab.cr.given) ? 'risk' : pf.held.length || pf.dropped.length || fab.cr?.given ? 'warn' : undefined, label: 'Cloth at the factory · cut ratio', who: o.fabricNominated ? 'Sourcing · Factory · Category' : 'Factory · Category', act: fab.key === 'ratio-asked' ? 'design' : !o.fabricNominated || o.fabricSupply?.sentToFactoryOn ? 'merchandiser' : 'sourcing',
      on: !o.poNo ? null : o.fabricNominated ? (o.fabricSupply?.receipt?.on ?? null) : (o.factoryCloth?.receivedOn ?? ms('Fabric ETA')?.actual ?? (ms('Fabric ETA') && !ms('Fabric ETA')!.skipped ? null : o.poDate)),
      by: !o.poNo ? null : o.fabricNominated ? (o.fabricSupply?.receipt ? `${o.fabricSupply.receipt.metresOk} m counted in${fab.short > 0 ? ` · short ${fab.short} m` : ''}${fab.cr?.given ? ' · new cut ratio' : ''}${pf.held.length ? ` · ${pf.held.map(f => f.colour).join(', ')} on hold` : ''}${pf.dropped.length ? ` · ${pf.dropped.map(f => f.colour).join(', ')} dropped` : ''}` : null) : (o.factoryCloth?.receivedOn ? `${o.factoryCloth.metresReceived ?? '—'} m received by the factory` : 'the factory sources it'),
      now: !o.poNo ? 'after the PO' : fab.key === 'ratio-asked' ? (fab.cr?.kind === 'cut-short' ? 'category to approve the cut-short' : 'category to give new sizes') : pf.failedOpen.length ? `${pf.failedOpen.map(f => f.colour).join(', ')} failed the factory's check · Nitin to hold or drop` : pf.held.length ? `${pf.held.map(f => f.colour).join(', ')} on hold for replacement cloth · the rest carry on` : o.fabricNominated ? (o.fabricSupply?.sentToFactoryOn ? 'factory to count the cloth and trims in' : 'sourcing to send the cloth and trims to the factory') : (o.factoryCloth?.poOn ? 'factory to log the cloth received' : `factory to raise its fabric PO${o.poMail?.fabricBy === 'bsc-vendor' ? " on BSC's vendor" : ''} and give the details`) },
    { key: 'tna', phase: 'make', label: 'Made · TNA with QC', who: 'Factory · QC · Merchandiser', on: finished ?? dispatched, by: finished ? 'finishing done' : dispatched ? 'dispatched' : null, act: tnaAct,
      now: !o.poNo ? 'after the PO' : tnaNow },
    { key: 'dispatch', phase: 'land', label: 'Dispatched · invoice to the warehouse', who: 'Factory · Merchandiser', act: 'merchandiser', on: inv?.mailedOn ?? null, by: inv ? `invoice ${inv.no} · ${inv.packedPcs ?? inv.packingList.reduce((a, x) => a + x.qty, 0)} pcs` : null,
      now: !o.poNo ? 'after the PO' : !dispatched ? 'after the dispatch actual on the TNA' : inv && !inv.mailedOn ? 'merchandiser to send the invoice and packing list to Prince' : 'merchandiser to upload the invoice and packing list' },
    { key: 'received', phase: 'land', label: 'Received · counted in', who: countedBy3plOf(o) ? 'Merchandiser · 3PL report' : 'Prince', act: countedBy3plOf(o) ? 'merchandiser' : 'warehouse', on: receivedOn, by: receivedOn ? (rc.lots.length ? `${rc.received} pcs` : 'closed') : null,
      now: !inv ? 'after the invoice' : rc.partial ? `${rc.received} of ${rc.base} in` : countedBy3plOf(o) ? 'merchandiser to upload the 3PL consignment report' : 'Prince to count the goods in against the packing list' },
    { key: 'cogs', phase: 'land', label: 'Direct COGS · MRP', who: 'Category', act: 'design', on: cogsOn, by: cogsOn ? 'closed' : null,
      now: !receivedOn ? 'after receipt' : 'category to close COGS' },
    /* a log, not a gate: every invoice, debit note and credit note on the PO, for reconciliation; it never holds the record up */
    { key: 'invoices', phase: 'land', label: 'Invoices · notes · payments', who: 'Nitin · Finance', act: 'production', on: o.poNo ? (o.poInvoices?.length ? o.poInvoices[o.poInvoices.length - 1].on : o.poDate) : null, by: o.poNo ? `${o.poInvoices?.length ?? 0} logged` : null, now: 'after the PO' },
  ];
  /* an open cut-ratio ask pulls the record back to the TNA until it is answered */
  const ratioOpen = o.status === 'Open' && (fab.key === 'ratio-asked' || pf.failedOpen.length > 0);
  const current = ratioOpen ? steps.findIndex(x => x.key === 'cloth') : steps.findIndex(x => !x.on && x.key !== 'invoices');
  const next = current >= 0 ? steps[current] : null;
  /* "where it is" for a list: the step name, or the TNA stage while it is being made */
  const where = ratioOpen ? (pf.failedOpen.length ? `${pf.failedOpen.map(f => f.colour).join(', ')} cloth failed · hold or drop` : `cut ratio with category · short ${fab.short} m`) : !next ? `COGS closed${o.enigmaProduct ? ` · ${o.enigmaProduct.code}` : ''}` : next.key === 'tna' && o.poNo ? (qcFail ? `QC failed · ${qcFail.label.toLowerCase()}` : qcDue ? `QC · ${qcDue.label.toLowerCase()}` : `${st.stage}${late}`) : next.key === 'pack' ? (pack.ready ? 'requirement complete' : `requirement · ${pack.missing.length} to fill`) : next.key === 'query' && cq ? (tr.open && replies >= asked ? 'replies over target · category to revise' : `counter sourcing · ${replies} of ${asked} replied`) : next.label;
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
  { key: 'requested', label: 'Requirement', hint: 'category and sourcing are filling the requirement' },
  { key: 'queried', label: 'Counter sourcing out', hint: 'factories asked; replies due by the deadline; replies over target flagged' },
  { key: 'po', label: 'PO raised', hint: 'mailed to the factory; the TNA form is owed' },
  { key: 'planned', label: 'TNA planned', hint: 'the factory returned its planned dates' },
  { key: 'making', label: 'In production', hint: 'the TNA is running; QC at each point' },
  { key: 'dispatched', label: 'Dispatched', hint: 'invoice and packing list with the warehouse' },
  { key: 'received', label: 'Received', hint: 'on Enigma; COGS' },
  { key: 'launched', label: 'COGS closed', hint: 'received and costed' },
] as const;
export type RtwStatusKey = typeof RTW_STATUSES[number]['key'];
export function rtwStatusOf(db: Db, o: ProductionOrder): { key: RtwStatusKey; label: string; i: number } {
  const j = rtwJourneyOf(db, o); const on = (k: string) => !!j.steps.find(s => s.key === k)?.on;
  const key: RtwStatusKey = on('cogs') ? 'launched' : on('received') ? 'received' : on('dispatch') ? 'dispatched' : on('plan') ? 'making' : on('po') ? (o.tnaPlan?.submittedOn ? 'planned' : 'po') : on('pack') ? 'queried' : 'requested';
  const i = RTW_STATUSES.findIndex(s => s.key === key);
  return { key, label: RTW_STATUSES[i].label, i };
}

/* the TNA is returned by the merchandiser for the factory; an older record may carry the walkthrough user's name */
export function tnaByOf(o: ProductionOrder): string {
  const by = o.tnaPlan?.by; const p = by ? PEOPLE.find(x => x.name === by) : null;
  return !by ? 'submitted' : p && p.role !== 'merchandiser' ? (o.merchant ?? 'Nitin Singh') : by;
}
