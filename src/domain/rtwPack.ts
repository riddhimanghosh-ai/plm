/* The RTW chain BSC set on 14 Nov 2026, as rules every screen reads from:
   is the five-part requirement complete; which factories to recommend for a cost query; where the
   goods are delivered; which QC point is open on a PO; and the mails PLM composes (the cost query,
   the PO, the invoice to the warehouse). */
import type { Db, ProductionOrder, QcCheck, QcPoint, RequirementPack, Vendor } from './types';
import { TECH_PACK_ITEMS, QC_POINTS, DELIVERY_LOCATIONS, PEOPLE } from './reference';
import { fmtDate, daysAgo } from './engines';

export const EMPTY_PACK: RequirementPack = { techPack: {}, fabric: { description: null, content: null, image: null, swatchAnalyser: null, cpm: null, widthIn: null, vendorId: null, vendorFabricCode: null, blockedMetres: null, readiness: null, readyOn: null }, trimCard: null, sentOn: null, sentBy: null };
export const packOf = (o: ProductionOrder): RequirementPack => o.pack ?? EMPTY_PACK;

/* the five parts and what each still needs; the requirement goes to Production RTW only when every list is empty */
export type PackPart = { key: 'techPack' | 'fabric' | 'trimCard' | 'sizes' | 'bom'; label: string; who: 'design' | 'design · sourcing'; missing: string[]; total: number; done: number };
export function packReadyOf(o: ProductionOrder): { ready: boolean; parts: PackPart[]; missing: string[]; sourcingMissing: string[] } {
  const p = packOf(o);
  const tp = TECH_PACK_ITEMS.filter(x => !p.techPack[x.key]?.trim()).map(x => x.label);
  const f = p.fabric;
  const designFab: [string, boolean][] = [['fabric description', !!f.description], ['fabric content', !!f.content], ['fabric image', !!f.image], ['option / phase · swatch analyser', !!f.swatchAnalyser], ['CPM', f.cpm != null], ['fabric width', f.widthIn != null]];
  const sourcingFab: [string, boolean][] = [['vendor (sourcing)', !!f.vendorId], ['vendor fabric code (sourcing)', !!f.vendorFabricCode], ['blocked quantity with the vendor (sourcing)', f.blockedMetres != null], ['fabric readiness (sourcing)', f.readiness === 'available' || (f.readiness === 'date' && !!f.readyOn)]];
  const fabMissing = [...designFab, ...sourcingFab].filter(x => !x[1]).map(x => x[0]);
  const sizesOk = o.sizeBreakup.reduce((a, x) => a + x.qty, 0) > 0;
  const parts: PackPart[] = [
    { key: 'techPack', label: 'Tech pack', who: 'design', missing: tp, total: TECH_PACK_ITEMS.length, done: TECH_PACK_ITEMS.length - tp.length },
    { key: 'fabric', label: 'Fabric info', who: 'design · sourcing', missing: fabMissing, total: designFab.length + sourcingFab.length, done: designFab.length + sourcingFab.length - fabMissing.length },
    { key: 'trimCard', label: 'Trim card', who: 'design', missing: p.trimCard?.trim() ? [] : ['trim card'], total: 1, done: p.trimCard?.trim() ? 1 : 0 },
    { key: 'sizes', label: 'Size · qty break-up', who: 'design', missing: sizesOk ? [] : ['size-wise quantities (the cut ratio)'], total: 1, done: sizesOk ? 1 : 0 },
    { key: 'bom', label: 'BOM', who: 'design', missing: o.bom.length ? [] : ['at least one BOM line'], total: 1, done: o.bom.length ? 1 : 0 },
  ];
  const missing = parts.flatMap(x => x.missing);
  return { ready: missing.length === 0, parts, missing, sourcingMissing: sourcingFab.filter(x => !x[1]).map(x => x[0]) };
}

/* the factory database: factories that specialise in this category first, then the rest, by region */
export function recommendFactories(db: Db, o: ProductionOrder): { fit: Vendor[]; others: Vendor[] } {
  const factories = db.vendors.filter(v => v.kind === 'CMT factory' || v.kind === 'MTM factory');
  const fit = factories.filter(v => (v.specialising ?? []).includes(o.category)).sort((a, b) => b.onTimeRate - a.onTimeRate);
  const others = factories.filter(v => !fit.includes(v)).sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
  return { fit, others };
}

/* hemming or semi-stitching goes to the in-house unit at Vasai; everything else to the 3PL warehouse. Logic to confirm with BSC. */
export const deliveryLocationOf = (needsHemming: boolean) => needsHemming ? DELIVERY_LOCATIONS.hem : DELIVERY_LOCATIONS.plain;
export const needsHemmingOf = (o: ProductionOrder) => /trouser|chino|jean|bottom|pant/i.test(`${o.category} ${o.subCategory}`);

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

/* ---- the mails PLM composes; nobody types them ---- */
export type Mail = { to: string[]; cc: string[]; subject: string; body: string; attachments: string[] };
const merch = (db: Db, o: ProductionOrder) => { const m = o.merchant ?? 'Nitin Singh'; const p = PEOPLE.find(x => x.name === m); return `${(p?.id ?? m.toLowerCase().replace(/\s+/g, '.'))}@merchandiser.in`; };
export const vendorMail = (v: Vendor | undefined) => v?.email ?? `${(v?.id ?? 'factory')}@factory.in`;

export function costQueryMail(db: Db, o: ProductionOrder, factoryIds: string[], deadline: string): Mail {
  const p = packOf(o);
  return {
    to: factoryIds.map(id => vendorMail(db.vendors.find(v => v.id === id))), cc: [merch(db, o)],
    subject: `Cost query · ${o.styleName} · ${o.orderQty} pcs · reply by ${fmtDate(deadline)}`,
    body: `Please quote for ${o.orderQty} pcs of ${o.styleName} (${o.category} · ${o.subCategory}) by ${fmtDate(deadline)}. Target in-house ${fmtDate(o.targetInhouse)}.\nFabric: ${p.fabric.description ?? '—'}${p.fabric.content ? ` · ${p.fabric.content}` : ''}${p.fabric.widthIn ? ` · ${p.fabric.widthIn}"` : ''}. Say whether you source the cloth or BSC's vendor supplies it.\nReply on the form linked: cost per piece, lead time, who sources the fabric.`,
    attachments: ['Tech pack', 'Fabric info', 'Trim card', 'Size break-up', 'BOM', 'Cost reply form'],
  };
}
export function poMailOf(db: Db, o: ProductionOrder): Mail {
  const v = db.vendors.find(x => x.id === o.vendorId); const pm = o.poMail; const p = packOf(o);
  const cloth = pm?.fabricBy === 'bsc' ? `Cloth from BSC's vendor ${db.vendors.find(x => x.id === p.fabric.vendorId)?.name ?? '—'}${p.fabric.vendorFabricCode ? ` · ${p.fabric.vendorFabricCode}` : ''}${p.fabric.blockedMetres != null ? ` · ${p.fabric.blockedMetres} m blocked` : ''}; raise your fabric PO on them.` : 'You source the cloth; your fabric PO and its receipt are on the TNA.';
  return {
    to: [vendorMail(v)], cc: [merch(db, o)],
    subject: `${o.poNo ?? 'PO'} · ${o.styleName} · ${o.orderQty} pcs · deliver to ${pm?.deliveryLocation ?? '—'}`,
    body: `Purchase order ${o.poNo ?? ''} for ${o.orderQty} pcs of ${o.styleName} at ₹${o.finalFob ?? '—'}/pc. Deliver to ${pm?.deliveryLocation ?? '—'}${pm?.needsHemming ? ' (hemming / semi-stitching in-house)' : ''} by ${fmtDate(o.targetInhouse)}.\n${cloth}\nThe TNA form is attached: fill the planned date for every step and return it through your merchandiser.`,
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
