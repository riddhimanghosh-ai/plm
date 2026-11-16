/* The RTW chain BSC set on 14 Nov 2026, as rules every screen reads from:
   is the five-part requirement complete; which factories to recommend for a cost query; where the
   goods are delivered; which QC point is open on a PO; and the mails PLM composes (the cost query,
   the PO, the invoice to the warehouse). */
import type { Db, ProductionOrder, QcCheck, QcPoint, RequirementPack, Vendor, CostReply, PoDoc } from './types';
import { TECH_PACK_ITEMS, QC_POINTS, DELIVERY_LOCATIONS, PEOPLE } from './reference';
import { fmtDate, daysAgo, addDays, iso, daysBetween, costingOf, receiptOf, netOf } from './engines';

export const EMPTY_PACK: RequirementPack = { techPack: {}, fabric: { description: null, content: null, image: null, swatchAnalyser: null, cpm: null, widthIn: null, vendorId: null, vendorFabricCode: null, blockedMetres: null, readiness: null, readyOn: null }, trimCard: null, trimLines: [], colours: [], brief: null, sentOn: null, sentBy: null };
export const packOf = (o: ProductionOrder): RequirementPack => o.pack ?? EMPTY_PACK;

/* the five parts and what each still needs; the requirement goes to Production RTW only when every list is empty */
export type PackPart = { key: 'techPack' | 'fabric' | 'trimCard' | 'sizes' | 'bom' | 'vendors'; label: string; who: 'design' | 'sourcing'; missing: string[]; total: number; done: number; na?: boolean };
export function packReadyOf(o: ProductionOrder): { ready: boolean; parts: PackPart[]; missing: string[]; sourcingMissing: string[] } {
  const p = packOf(o);
  const tp = TECH_PACK_ITEMS.filter(x => !p.techPack[x.key]?.trim()).map(x => x.label);
  const f = p.fabric;
  const designFab: [string, boolean][] = [['fabric description', !!f.description], ['fabric content', !!f.content], ['photo of the physical fabric', !!f.image], ['option / phase · swatch analyser', !!f.swatchAnalyser], ['CPM', f.cpm != null], ['fabric width', f.widthIn != null]];
  const sourcingFab: [string, boolean][] = [['cloth vendor', !!f.vendorId], ['vendor fabric code', !!f.vendorFabricCode], ['blocked quantity with the vendor', f.blockedMetres != null], ['fabric readiness', f.readiness === 'available' || (f.readiness === 'date' && !!f.readyOn)], ['trim vendor', !!f.trimVendorId]];
  const clothBy = p.clothBy ?? null;
  const fabMissing = designFab.filter(x => !x[1]).map(x => x[0]);
  /* sourcing's part is needed only when BSC is involved in the cloth: BSC sends it, or hands the factory its vendor */
  const vendorsNeeded = clothBy !== 'factory';
  const srcMissing = !clothBy ? ['who supplies the cloth (category)'] : vendorsNeeded ? sourcingFab.filter(x => !x[1]).map(x => x[0]) : [];
  const sizesOk = o.sizeBreakup.reduce((a, x) => a + x.qty, 0) > 0;
  const parts: PackPart[] = [
    { key: 'techPack', label: 'Tech pack', who: 'design', missing: tp, total: TECH_PACK_ITEMS.length, done: TECH_PACK_ITEMS.length - tp.length },
    { key: 'fabric', label: 'Fabric info', who: 'design', missing: fabMissing, total: designFab.length, done: designFab.length - fabMissing.length },
    { key: 'trimCard', label: 'Trim card', who: 'design', missing: p.trimCard?.trim() ? [] : ['trim card'], total: 1, done: p.trimCard?.trim() ? 1 : 0 },
    { key: 'sizes', label: 'Size · qty break-up', who: 'design', missing: sizesOk ? [] : ['size-wise quantities (the cut ratio)'], total: 1, done: sizesOk ? 1 : 0 },
    { key: 'bom', label: 'BOM', who: 'design', missing: o.bom.length ? [] : ['at least one BOM line'], total: 1, done: o.bom.length ? 1 : 0 },
    { key: 'vendors', label: 'Cloth · vendors', who: 'sourcing', missing: srcMissing, total: vendorsNeeded ? sourcingFab.length : 1, done: vendorsNeeded ? sourcingFab.length - srcMissing.length : (clothBy ? 1 : 0), na: clothBy === 'factory' },
  ];
  const missing = parts.flatMap(x => x.missing);
  return { ready: missing.length === 0, parts, missing, sourcingMissing: clothBy && vendorsNeeded ? sourcingFab.filter(x => !x[1]).map(x => x[0]) : [] };
}

/* the factory database: factories that specialise in this category first, then the rest, by region */
export function recommendFactories(db: Db, o: ProductionOrder): { fit: Vendor[]; others: Vendor[] } {
  const factories = db.vendors.filter(v => v.kind === 'CMT factory' || v.kind === 'MTM factory');
  const fit = factories.filter(v => (v.specialising ?? []).includes(o.category)).sort((a, b) => b.onTimeRate - a.onTimeRate);
  const others = factories.filter(v => !fit.includes(v)).sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
  return { fit, others };
}

/* a semi-stitched product (hemming in-house) goes to Vasai; everything else to the 3PL warehouse. Category marks it on the requirement (BSC, 15 Nov 2026). */
export const deliveryLocationOf = (needsHemming: boolean) => needsHemming ? DELIVERY_LOCATIONS.hem : DELIVERY_LOCATIONS.plain;
export const needsHemmingOf = (o: ProductionOrder) => o.semiStitched ?? false;   // set by category on the requirement

/* the QC points on a PO: due once the TNA block before it is logged, closed when QC passes it */
export type QcPointState = { key: QcPoint; label: string; hint: string; closes: string; due: string | null; sinceDays: number | null; last: QcCheck | null; state: 'later' | 'due' | 'failed' | 'passed' | 'na' };
export function qcPointsOf(o: ProductionOrder): QcPointState[] {
  const ms = (k: string) => o.milestones.find(m => m.key === k);
  return QC_POINTS.map(p => {
    const before = ms(p.after); const own = ms(p.closes);
    const checks = (o.qcChecks ?? []).filter(c => c.point === p.key); const last = checks[checks.length - 1] ?? null;
    const na = !own || !!own.skipped;
    const due = before?.actual ?? null;
    const state: QcPointState['state'] = na ? 'na' : (last?.result === 'pass' || !!own?.actual) ? 'passed' : last?.result === 'fail' ? 'failed' : due ? 'due' : 'later';
    return { key: p.key, label: p.label, hint: p.hint, closes: p.closes, due, sinceDays: due && state === 'due' ? daysAgo(due) : null, last, state };
  });
}
export const openQcOf = (o: ProductionOrder) => qcPointsOf(o).filter(x => x.state === 'due' || x.state === 'failed');

/* a factory's reply against the targets: cost over the target cost, or lead time landing past the target in-house date */
export function replyFlagsOf(o: ProductionOrder, r: CostReply): { costOver: number; inhouseOn: string; lateDays: number; flagged: boolean } {
  const costOver = Math.max(0, r.cost - o.targetCost);
  const inhouseOn = iso(addDays(r.repliedOn, r.leadDays));
  const lateDays = Math.max(0, daysBetween(o.targetInhouse, inhouseOn));
  return { costOver, inhouseOn, lateDays, flagged: costOver > 0 || lateDays > 0 };
}
/* every reply over target and no PO yet: category has to revise the target date or cost (or Nitin picks a reply that fits) */
export function targetReviseOpenOf(o: ProductionOrder): { open: boolean; flagged: CostReply[]; fits: CostReply[] } {
  const rs = o.costQuery?.replies ?? [];
  const flagged = rs.filter(r => replyFlagsOf(o, r).flagged); const fits = rs.filter(r => !replyFlagsOf(o, r).flagged);
  return { open: !o.poNo && rs.length > 0 && fits.length === 0, flagged, fits };
}

/* ---- the mails PLM composes; nobody types them ---- */
export type Mail = { to: string[]; cc: string[]; subject: string; body: string; attachments: string[] };
const merch = (db: Db, o: ProductionOrder) => { const m = o.merchant ?? 'Nitin Singh'; const p = PEOPLE.find(x => x.name === m); return `${(p?.id ?? m.toLowerCase().replace(/\s+/g, '.'))}@merchandiser.in`; };
export const vendorMail = (v: Vendor | undefined) => v?.email ?? `${(v?.id ?? 'factory')}@factory.in`;

/* the requirement's files Nitin can share with each factory on the counter-sourcing mail */
export const QUERY_FILES = ['Style and production ask', 'Fabric info', 'Tech pack', 'Trim card', 'Size break-up', 'BOM', 'Delivery instruction'] as const;
export function costQueryMail(db: Db, o: ProductionOrder, factoryIds: string[], deadline: string, files?: Record<string, string[]> | null): Mail {
  const p = packOf(o);
  const sent = (id: string) => files?.[id] ?? [...QUERY_FILES];
  const union = QUERY_FILES.filter(f => factoryIds.some(id => sent(id).includes(f)));
  const differ = factoryIds.some(id => sent(id).length !== union.length);
  const perFactory = differ ? `\nFiles for each factory:\n${factoryIds.map(id => `${db.vendors.find(v => v.id === id)?.name ?? id}: ${sent(id).join(', ') || 'none'}`).join('\n')}` : '';
  return {
    to: factoryIds.map(id => vendorMail(db.vendors.find(v => v.id === id))), cc: [merch(db, o)],
    subject: `Factory counter sourcing · ${o.styleName} · ${o.orderQty} pcs · reply by ${fmtDate(deadline)}`,
    body: `Please quote for ${o.orderQty} pcs of ${o.styleName} (${o.category} · ${o.subCategory}) by ${fmtDate(deadline)}. Target in-house ${fmtDate(o.targetInhouse)}.\nFabric: ${p.fabric.description ?? '—'}${p.fabric.content ? ` · ${p.fabric.content}` : ''}${p.fabric.widthIn ? ` · ${p.fabric.widthIn}"` : ''}. Fill your quote on the form at the link below (no login): cost per piece, lead time and any note. It reaches BSC directly.
https://plm.bombayshirts.com/quote/${o.id}${perFactory}`,
    attachments: union,
  };
}
export function poMailOf(db: Db, o: ProductionOrder): Mail {
  const v = db.vendors.find(x => x.id === o.vendorId); const pm = o.poMail; const p = packOf(o);
  const vd = `${db.vendors.find(x => x.id === p.fabric.vendorId)?.name ?? '—'}${p.fabric.vendorFabricCode ? ` · ${p.fabric.vendorFabricCode}` : ''}${p.fabric.blockedMetres != null ? ` · ${p.fabric.blockedMetres} m blocked` : ''}`;
  const cloth = pm?.fabricBy === 'bsc' ? `BSC sends the cloth: ${vd}; sourcing ships it to you, count it in on arrival.` : pm?.fabricBy === 'bsc-vendor' ? `Buy the cloth from BSC's vendor ${vd}; raise your fabric PO on them and give us the PO and receipt details. Your fabric PO and its receipt are on the TNA.` : 'You source the cloth; give us your fabric PO and receipt details. They are on the TNA.';
  return {
    to: [vendorMail(v)], cc: [merch(db, o)],
    subject: `${o.poNo ?? 'PO'} · ${o.styleName} · ${o.orderQty} pcs · deliver to ${pm?.deliveryLocation ?? '—'}`,
    body: `Purchase order ${o.poNo ?? ''} for ${o.poDoc ? poTotalsOf(o.poDoc).pcs : o.orderQty} pcs of ${o.styleName}${o.poDoc ? `, ${o.poDoc.lines.length} line${o.poDoc.lines.length === 1 ? '' : 's'}: ${o.poDoc.lines.map(l => `${l.colour} ${l.sizes.reduce((a, x) => a + x.qty, 0)} pcs at ₹${l.rate}`).join('; ')}. Total ₹${Math.round(poTotalsOf(o.poDoc).total).toLocaleString('en-IN')} incl. ${o.poDoc.gstPct}% GST; ${o.poDoc.priceBasis}; payment ${o.poDoc.paymentTerms}` : ` at ₹${o.finalFob ?? '—'}/pc`}. Deliver to ${pm?.deliveryLocation ?? '—'}${pm?.needsHemming ? ' (hemming / semi-stitching in-house)' : ''} by ${fmtDate(o.targetInhouse)}.\n${cloth}\nThe TNA form is attached: fill the planned date for every step and return it through your merchandiser.`,
    attachments: ['PO', 'Tech pack', 'Trim card', 'Size break-up', 'BOM', 'TNA form · planned dates'],
  };
}
export function invoiceMailOf(db: Db, o: ProductionOrder): Mail {
  const v = db.vendors.find(x => x.id === o.vendorId); const inv = o.invoice;
  const pcs = (inv?.packingList ?? []).reduce((a, x) => a + x.qty, 0);
  return {
    to: ['prince@bombayshirts.com'], cc: [merch(db, o), 'nitin@bombayshirts.com'],
    subject: `Invoice ${inv?.no ?? ''} · ${o.poNo ?? ''} · ${o.styleName} · ${pcs} pcs dispatched`,
    body: `${v?.name ?? 'The factory'} has dispatched ${pcs} pcs of ${o.styleName} against ${o.poNo ?? 'the PO'} to ${o.poMail?.deliveryLocation ?? 'the warehouse'}. Invoice ${inv?.no ?? ''} for ₹${inv?.amount?.toLocaleString('en-IN') ?? '—'} and the packing list are attached. Receive against the packing list on Enigma.`,
    attachments: [inv?.file ?? 'Invoice', 'Packing list'],
  };
}

/* the factory PO's item lines: one per colour, the requirement's size break-up split across the colours, at the reply's rate */
export function poDraftOf(o: ProductionOrder, rate: number): PoDoc {
  const cols = (o.pack?.colours?.length ? o.pack.colours : (o.poFabrics ?? []).map(f => f.colour));
  const colours = cols.length ? cols : [o.fabricBrief?.colour ?? 'Main colour'];
  const base = o.sizeBreakup?.length ? o.sizeBreakup : [{ size: 'Free size', qty: o.orderQty }];
  const lines = colours.map((c, k) => ({ id: `pl-${k}`, colour: c, hsn: '6205', rate,
    sizes: base.map(b => { const each = Math.floor(b.qty / colours.length); return { size: b.size, qty: each + (k === 0 ? b.qty - each * colours.length : 0) }; }) }));
  const bsc = o.fabricNominated || o.pack?.clothBy === 'bsc';
  return { lines, charges: [], gstPct: 5, priceBasis: bsc ? 'CMT · BSC supplies the cloth' : 'FOB · cloth and trims by the factory', paymentTerms: '45 days from receipt at the warehouse', shipBy: o.targetInhouse, notes: null };
}
export function poTotalsOf(d: PoDoc | null | undefined) {
  if (!d) return { pcs: 0, value: 0, charges: 0, taxable: 0, gst: 0, total: 0, avgRate: 0 };
  const pcs = d.lines.reduce((a, l) => a + l.sizes.reduce((b, s) => b + (s.qty || 0), 0), 0);
  const value = d.lines.reduce((a, l) => a + l.rate * l.sizes.reduce((b, s) => b + (s.qty || 0), 0), 0);
  const charges = d.charges.reduce((a, c) => a + (c.amount || 0), 0); const taxable = value + charges; const gst = Math.round(taxable * d.gstPct) / 100;
  return { pcs, value, charges, taxable, gst, total: taxable + gst, avgRate: pcs ? value / pcs : 0 };
}

/* the fabrics on a PO as one line: how many in, checked, on hold, dropped */
export function poFabricsOf(o: ProductionOrder) {
  const fs = o.poFabrics ?? [];
  const held = fs.filter(f => f.qc === 'failed' && f.decision?.kind === 'hold' && !f.resumedOn); const dropped = fs.filter(f => f.decision?.kind === 'drop');
  const failedOpen = fs.filter(f => f.qc === 'failed' && !f.decision); const toCheck = fs.filter(f => f.receivedOn && f.qc === 'pending');
  const toCome = fs.filter(f => !f.receivedOn && f.decision?.kind !== 'drop');
  const live = fs.filter(f => f.decision?.kind !== 'drop');
  const running = live.filter(f => f.qc === 'passed' || !!f.resumedOn);
  return { all: fs, held, dropped, failedOpen, toCheck, toCome, live, running, livePcs: live.reduce((a, f) => a + f.qty, 0), heldPcs: held.reduce((a, f) => a + f.qty, 0),
    line: !fs.length ? null : failedOpen.length ? `${failedOpen.map(f => f.colour).join(', ')} failed QC · hold or drop?` : held.length ? `${held.map(f => f.colour).join(', ')} on hold · replacement${held[0].decision?.kind === 'hold' && held[0].decision.replacementBy ? ` by ${fmtDate(held[0].decision.replacementBy)}` : ''}` : toCheck.length ? `${toCheck.map(f => f.colour).join(', ')} to check` : toCome.length ? `${toCome.length} of ${live.length} colours to come` : `${running.length} colour${running.length === 1 ? '' : 's'} in and passed`,
    tone: (failedOpen.length ? 'risk' : held.length ? 'warn' : toCheck.length ? 'warn' : toCome.length ? 'info' : 'good') as 'risk' | 'warn' | 'info' | 'good' };
}

/* ✦ AI (prototype): draft the requirement from what category writes in its own words. The build sends the text and
   any attached files to the model; here it is drafted from keywords so the walkthrough shows the shape of it. */
export function draftFromBrief(text: string, styleName: string) {
  const t = text.toLowerCase();
  const pick = (opts: [RegExp, string][], d: string) => opts.find(([r]) => r.test(t))?.[1] ?? d;
  const cloth = pick([[/oxford/, 'Oxford'], [/poplin/, 'Poplin'], [/linen/, 'Linen'], [/twill/, 'Twill'], [/denim/, 'Denim'], [/corduroy/, 'Corduroy'], [/flannel/, 'Flannel'], [/knit|jersey/, 'Jersey knit'], [/seersucker/, 'Seersucker'], [/dobby/, 'Dobby']], 'Plain weave');
  const content = pick([[/linen/, '100% linen'], [/wool/, '100% wool'], [/stretch|elastane/, '98% cotton 2% elastane'], [/blend/, 'cotton blend']], '100% cotton');
  const collar = pick([[/button.?down/, 'button-down collar'], [/mandarin|band|bandhgala/, 'mandarin collar'], [/cuban|camp/, 'camp collar'], [/spread/, 'spread collar']], 'classic collar');
  const button = pick([[/mother.?of.?pearl|mop/, 'mother-of-pearl buttons 18L'], [/horn/, 'horn buttons 18L'], [/wood/, 'wooden buttons 18L']], 'tonal buttons 18L');
  const pack = pick([[/kraft/, 'kraft box'], [/poly|bag/, 'recycled poly bag'], [/box/, 'branded box']], 'folded in the standard BSC pack');
  const pocket = /pocket/.test(t) ? (/no pocket|without pocket/.test(t) ? 'no pocket' : 'single chest pocket') : 'no pocket';
  const back = pick([[/box.?pleat/, 'box-pleat back'], [/side.?pleat/, 'side pleats'], [/darts?/, 'back darts']], 'plain back');
  const fit = pick([[/relaxed/, 'Relaxed Fit'], [/slim/, 'Slim Fit'], [/tailored/, 'Tailored Fit'], [/regular/, 'Regular Fit']], 'Tailored Fit');
  return {
    techPack: { sketch: `drafted: front and back of ${styleName}`, styling: `${fit}; ${collar}; ${pocket}; ${back}`, stitching: '12 SPI; 1 cm seam allowance; topstitch 0.6 cm at collar and placket',
      fabricColours: 'as in the colour options', specSheet: `drafted: measurements per size for ${fit}`, howToMeasure: 'standard BSC measuring guide', folding: `${pack}; folded on the 30 × 22 cm board`,
      trimCard: `${button}; main label at the neck; size label; wash-care at the left side seam`, labelImage: 'BSC main woven label', tagImage: 'BSC hang tag with MRP', barcoding: 'one EAN per size from the design code', packaging: pack },
    fabric: { description: cloth, content },
    trimLines: [{ colour: 'all', item: button, supplierCode: null, image: null }, { colour: 'all', item: 'BSC main label', supplierCode: null, image: null }],
    fit,
  };
}

/* COGS per piece for an RTW style, from the costing sheet with the actuals laid over it (the record's COGS step and the
   category's COGS dashboard read the same numbers) */
export function rtwCogsOf(db: Db, o: ProductionOrder) {
  const c = o.costing; const plan = costingOf(o); const rc = receiptOf(o);
  const pcs = rc.received || o.cutQty || o.orderQty;
  const cons = c.actualConsumption ?? c.consumption;
  const fabric = o.fabricNominated && c.cpm != null && cons != null ? c.cpm * cons : 0;
  /* when BSC sends the cloth the factory charges making only (CMT); otherwise its price is the full FOB, cloth included */
  const make = o.fabricNominated ? (c.cmp ?? Math.max(0, (o.finalFob ?? 0) - fabric)) : (o.finalFob ?? c.cmp ?? 0);
  const pc = o.poCosts ?? { logistics: null, other: [] };
  const poExtra = ((pc.logistics ?? 0) + pc.other.reduce((a, x) => a + x.amount, 0)) / (pcs || 1);
  const parts = { fabric, make, trims: c.trimsPackaging, transport: c.transportation, hemming: c.hemming ?? 0, freight: c.shipping, overheads: c.factoryOverheads, poExtra };
  const cogs = Object.values(parts).reduce((a, x) => a + (x || 0), 0);
  const opt = db.options.find(x => x.styleName === o.styleName) ?? null;
  const launch = (db.launches ?? []).find(l => l.orderId === o.id);
  const mrp = o.enigmaProduct?.mrp ?? launch?.designCodes?.[0]?.mrp ?? opt?.mrp ?? plan.finalMrp ?? null;
  const net = mrp != null ? netOf(mrp) : null; const margin = net != null && cogs ? (net - cogs) / net : null;
  const planned = plan.cogs ?? null;
  const delivered = rc.lots.length > 0 && !rc.partial;
  const closedOn = o.cogsClosedOn ?? (o.status === 'Closed' ? (rc.lots[rc.lots.length - 1]?.at ?? null) : null);
  return { parts, cogs, pcs, total: cogs * pcs, mrp, net, margin, planned, diff: planned != null ? cogs - planned : null, delivered, closedOn, target: o.targetCost };
}
