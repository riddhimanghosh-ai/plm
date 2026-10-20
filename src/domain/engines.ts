/* ==========================================================================
   Engines — every number the product shows is computed here, once.
   Nothing is typed. If a figure is on a screen and not derived here, it is
   either a stored fact or a bug.
   ========================================================================== */

import type { ReturnCase, ResolutionStep, Concept, BomLine, Costing, CustomerOrder, Db, Fabric, FabricQuote, Launch, LaunchPiece, MaterialLine, OrderTag, TrimItem, GarmentCategory, Milestone, ProductionOrder, RoleId, RtwAction, RtwOption, ThreadKind, Vendor, SourcingMode , TrackerConfig, PlanningReview, PlanningKind } from './types';
import { FIT_SAMPLE_FITS, FIT_SAMPLE_SIZES, MILESTONES, MILESTONE_OWNER, OFFSETS, OTIF_TOLERANCE, PRE_PRODUCTION, RISK, MID_SIZES, VELOCITY, WOF_CLEAR, WOF_EXIT, WOF_URGENT, STORE_LOW_METRES, GROWTH_UPLIFT, METRES_PER_SHIRT, RTW_REORDER_TRIGGER_DAYS, RTW_MOQ, STORES, SHEET_FREE_EDIT, SHEET_STORE_EDIT, SHEET_AMEND, REALLOCATING_FIELDS, BOOK_EDITION, BOOK_CONFIRM_DAYS, SWATCH_KINDS, MARKETING_LEAD_DAYS, DISPLAY_PLAN, isBottoms, PP_FREEZE_HOURS, PIECES_PER_TAILOR_DAY, AGING_DAYS, CORPORATE_FACTORY, URGENT_FACTORY, COSTING_DEFAULTS, DISCOUNT_BAU, DISCOUNT_ADDITIONAL, gstFor, PACKAGING_BOM, TRIM_CARD, CONSUMPTION_DEFAULT, HEMMED, PEOPLE, ROLE_LABEL } from './reference';
import { MTM_ONLY, isRtwHref, OPTIONS_OFF } from './edition';

export const TODAY = new Date('2026-09-12T09:00:00+05:30');
export const iso = (d: Date) => d.toISOString();
export const addDays = (d: Date | string, n: number) => new Date(new Date(d).getTime() + n * 86400000);
export const daysBetween = (a: string | Date, b: string | Date) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
export const daysAgo = (d: string | Date) => daysBetween(d, TODAY);
export const fmtDate = (d: string | Date | null | undefined) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' }) : '—';
export const fmtMoney = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
export const fmtRel = (d: string | null) => { if (!d) return '—'; const n = daysAgo(d); return n === 0 ? 'today' : n > 0 ? `${n}d ago` : `in ${-n}d`; };
/** "14 minutes ago" — the granularity a notification list needs, not a date */
export const fmtAgo = (d: string) => {
  const mins = Math.max(0, Math.round((TODAY.getTime() - new Date(d).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const h = Math.round(mins / 60); if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const dd = Math.round(h / 24); return dd < 7 ? `${dd} day${dd === 1 ? '' : 's'} ago` : `${Math.round(dd / 7)} week${Math.round(dd / 7) === 1 ? '' : 's'} ago`;
};

/* ---------- the tracker's Config + Auto Plan Logic, live ---------------------
   The workbook's constants are the defaults; the store swaps in whatever the
   planner has saved, and every plan date, risk word and OTIF verdict reads it. */
export const DEFAULT_TRACKER_CONFIG: TrackerConfig = { offsets: OFFSETS, risk: { ...RISK }, otifTolerance: OTIF_TOLERANCE, updatedOn: null, updatedBy: null };
let ACTIVE: TrackerConfig = DEFAULT_TRACKER_CONFIG;
export function applyTrackerConfig(cfg?: TrackerConfig | null) { ACTIVE = cfg ?? DEFAULT_TRACKER_CONFIG; }
export const trackerConfig = () => ACTIVE;
/* Auto Plan Logic tab: the stage durations, read off the offsets */
export function autoPlanLogicOf(cfg: TrackerConfig = ACTIVE) {
  return (Object.keys(cfg.offsets) as GarmentCategory[]).map(cat => {
    const off = cfg.offsets[cat]; let prev = 0; const steps = (MILESTONES as readonly string[]).map((k, i) => { const o = off[i]; if (o == null) return { key: k, days: null as number | null }; const d = o - prev; prev = o; return { key: k, days: d }; });
    return { category: cat, total: Math.max(0, ...off.filter((x): x is number => x != null)), steps };
  });
}

/* ---------- RTW production: build the TNA from the real template -------- */
export function buildMilestones(category: GarmentCategory, poDate: string | Date): Milestone[] {
  const off = ACTIVE.offsets[category] ?? OFFSETS[category];
  return (MILESTONES as readonly string[])
    .map((key, i) => ({ key, offset: off[i] }))
    .filter((m): m is { key: string; offset: number } => m.offset !== null)
    .map(({ key, offset }) => ({
      key, label: key,
      owner: (MILESTONE_OWNER[key] ?? 'production') as RoleId,
      stage: PRE_PRODUCTION.has(key) ? 'pre-production' : 'production',
      plan: iso(addDays(poDate, offset)),
      revised: null, actual: null, delayReason: null,
    }));
}

/* ---------- risk — the tracker's own classification --------------------- */
export type Risk = 'pending' | 'on-track' | 'watch' | 'at-risk' | 'critical' | 'delayed' | 'closed';

export interface RiskResult {
  risk: Risk;
  slipDays: number;              // worst slip carried through the chain
  bufferDays: number | null;     // target inhouse − expected inhouse
  expectedInhouse: string | null;
  lastMilestone: string | null;  // last one with an actual
  flagged: Milestone | null;     // the step that is late / unconfirmed
}

export function riskOf(po: ProductionOrder): RiskResult {
  const none = { slipDays:0, bufferDays:null, expectedInhouse:null, lastMilestone:null, flagged:null };
  if (po.status === 'Closed' || po.status === 'Cancelled') return { risk:'closed', ...none };
  if (po.status !== 'Open' || !po.milestones.length) return { risk:'pending', ...none };

  let slip = 0, flagged: Milestone | null = null, unconfirmed: Milestone | null = null;
  po.milestones.forEach(m => {
    let s = 0;
    if (m.actual) s = Math.max(0, daysBetween(m.plan, m.actual));
    else if (new Date(m.plan) < TODAY) {
      if (m.revised) s = Math.max(0, daysBetween(m.plan, m.revised));
      else if (!unconfirmed) unconfirmed = m;
    }
    if (s > slip) { slip = s; flagged = m; }
    slip = Math.max(slip, s);
  });

  const last = po.milestones[po.milestones.length - 1];
  /* a milestone that has actually landed is the truth — planning off its plan
     date reported a comfortable buffer for a PO that arrived three weeks late */
  const expected = iso(addDays(last.actual ?? last.revised ?? last.plan, last.actual ? 0 : slip - (last.revised ? daysBetween(last.plan, last.revised) : 0)));
  const buffer = daysBetween(expected, po.targetInhouse);
  const done = [...po.milestones].reverse().find(m => m.actual);

  /* The date facts come first, then the buffer, then the softer signals. The
     order matters: reading slip first said "on track" to an order whose plan
     never reached the target date — nothing had slipped against a plan that was
     late to begin with, so the pill read green beside a buffer of -18d. A
     buffer is a fact about the delivery date; a slip is only a fact about the
     plan, and the delivery date is what the drop depends on. */
  let risk: Risk;
  if (new Date(po.targetInhouse) < TODAY) risk = 'delayed';
  else if (buffer <= ACTIVE.risk.criticalBufferDays) risk = 'critical';
  else if (buffer <= ACTIVE.risk.atRiskBufferDays) risk = 'at-risk';
  else if (unconfirmed) risk = 'watch';
  else risk = 'on-track';

  return { risk, slipDays: slip, bufferDays: buffer, expectedInhouse: expected, lastMilestone: done?.key ?? null, flagged: flagged ?? unconfirmed };
}

/** Where the order actually is and whose turn it is — derived, never typed. */
export function receiptOf(po: ProductionOrder) {
  const lots = po.receipts ?? [];
  const received = lots.reduce((a, l) => a + l.qty, 0);
  const rejected = lots.reduce((a, l) => a + l.rejected, 0);
  const base = po.cutQty ?? po.orderQty;
  const balance = Math.max(0, base - received - rejected);
  const partial = po.status === 'Open' && lots.length > 0 && balance > 0;
  const lastExpected = [...lots].reverse().find(l => l.balanceExpectedOn)?.balanceExpectedOn ?? null;
  return { lots, received, rejected, base, balance, partial, lastExpected, complete: lots.length > 0 && balance === 0 };
}
export function splitOf(po: ProductionOrder) {
  const sp = po.split; if (!sp) return null;
  const shipped = sp.lots.filter(l => l.dispatched); const pending = sp.lots.filter(l => !l.dispatched);
  const nextLot = [...pending].sort((a, b) => a.dispatchOn.localeCompare(b.dispatchOn))[0] ?? null;
  return { ...sp, shippedQty: shipped.reduce((a, l) => a + l.qty, 0), pendingQty: pending.reduce((a, l) => a + l.qty, 0), nextLot, lastDate: [...sp.lots].sort((a, b) => b.dispatchOn.localeCompare(a.dispatchOn))[0]?.dispatchOn ?? null, done: pending.length === 0 };
}
export function stageOf(po: ProductionOrder) {
  const sp = splitOf(po);
  if (sp && !sp.done && po.status === 'Open' && receiptOf(po).lots.length === 0) return { stage: sp.shippedQty ? `Split · ${sp.shippedQty} dispatched` : `Split agreed · ${sp.lots[0]?.qty ?? 0} first`, next: `${sp.nextLot?.qty ?? sp.pendingQty} pcs ${sp.shippedQty ? 'balance' : 'first lot'} by ${fmtDate(sp.nextLot?.dispatchOn ?? sp.lastDate ?? po.targetInhouse)}`, waitingOn: 'production' as RoleId };
  const rc = receiptOf(po);
  if (rc.partial) return { stage: `Partially received · ${rc.received}/${rc.base}`, next: `balance ${rc.balance} pcs${rc.lastExpected ? ` by ${fmtDate(rc.lastExpected)}` : ''}`, waitingOn: 'warehouse' as RoleId };
  const next = po.milestones.find(m => !m.actual) ?? null;
  const done = [...po.milestones].reverse().find(m => m.actual);
  return { stage: done ? `${done.key} done` : po.status, next: next?.key ?? null, waitingOn: next?.owner ?? null };
}

/** The sheet's two lead-time columns: planned = handover → target inhouse; actual = handover → inhouse actual. */
export function leadTimesOf(o: ProductionOrder) {
  const inhouse = o.milestones.find(m => m.key === 'Inhouse ETA')?.actual ?? null;
  return { planned: daysBetween(o.styleHandover, o.targetInhouse), actual: inhouse ? daysBetween(o.styleHandover, inhouse) : null, inhouse };
}
/** The sheet computes cut qty from the fabric the vendor blocked ÷ consumption. */
export const cutFromFabric = (o: ProductionOrder) => { const cons = o.costing.actualConsumption ?? o.costing.consumption; return o.fabricBlocked != null && cons ? Math.floor(o.fabricBlocked / cons) : null; };

/* ---------- OTIF — the dashboard's own legend --------------------------- */
export type Otif = 'OTIF' | 'Delayed' | 'IF fail' | 'Pending';
export function otifOf(po: ProductionOrder): Otif {
  const dispatch = po.milestones.find(m => m.key === 'Dispatch')?.actual;
  if (!dispatch) return 'Pending';
  const onTime = new Date(dispatch) <= new Date(po.targetInhouse);
  const base = po.cutQty ?? po.orderQty;
  const inFull = po.deliveredQty != null && Math.abs(po.deliveredQty - base) / base <= ACTIVE.otifTolerance;
  return onTime && inFull ? 'OTIF' : !onTime ? 'Delayed' : 'IF fail';
}

/* ---------- RTW option health — BSC's own rules, run not reinvented ------ */
/* BSC's own inputs, from the transcript: the rate is the last 4 weeks ("last 30 days"),
   counted only on weeks the size was in stock; the ceiling is the best 6 weeks
   since launch; the trigger is 90 days of cover. */
export function rosOf(o: RtwOption) {
  const w = o.weeklySales;
  const inStock = w.map((v, i) => ({ v, ok: o.inStockWeeks[i] })).filter(x => x.ok).map(x => x.v);
  const last4 = inStock.slice(-4);
  const trueRos = last4.length ? last4.reduce((a, b) => a + b, 0) / last4.length : 0;
  const naive = w.reduce((a, b) => a + b, 0) / w.length;
  const top6 = [...w].map((u, i) => o.inStockWeeks[i] ? u : 0).sort((a, b) => b - a).slice(0, 6);
  return { trueRos, naive, top6Ros: top6.reduce((a, b) => a + b, 0) / 6, censoredWeeks: w.length - inStock.length };
}

export const velocityOf = (ros: number) => VELOCITY.find(v => ros >= v.min)!.grade;

export function healthOf(o: RtwOption) {
  const stock = Object.values(o.stockBySize).reduce((a, b) => a + b, 0);
  const { trueRos, top6Ros, censoredWeeks } = rosOf(o);
  const wof = trueRos > 0 ? stock / trueRos : stock > 0 ? 999 : 0;   // weeks of forward cover
  const szOOS = o.sizes.filter(s => (o.stockBySize[s] ?? 0) === 0).length;
  const midBroken = o.sizes.filter(s => MID_SIZES.has(s) && (o.stockBySize[s] ?? 0) === 0);
  const velocity = velocityOf(trueRos);
  /* Healthy = on the shelf, sizes present, not drowning in cover. There is no
     lower bound on cover: running thin is healthy-and-urgent, which is exactly
     what the URGENT REPLENISH rule below is for — a `wof >= 4` floor here made
     that rule unreachable and sent fast sellers to MONITOR instead. */
  const healthy = stock > 0 && szOOS <= 1 && wof < WOF_CLEAR;
  const health: 'Healthy' | 'Unhealthy' | 'Unknown' | 'Inactive' = o.inactive ? 'Inactive'
    : o.weeklySales.length < 4 ? 'Unknown' : healthy ? 'Healthy' : 'Unhealthy';

  /* Action & Gap Parameters, in priority order. */
  let action: RtwAction, why: string;
  /* An inactive option is not failing — it is off the shelf. The only question
     it asks is whether to bring it back, and that is what REINTRODUCE means:
     make it active again (and order, if there is nothing left to sell). */
  if (o.inactive && top6Ros >= 2)              { action = 'REINTRODUCE';      why = `Inactive since ${fmtDate(o.inactive.on)} — it sold ${top6Ros.toFixed(1)}/wk at its peak`; }
  else if (o.inactive)                         { action = 'MONITOR';          why = `Inactive since ${fmtDate(o.inactive.on)} — no demand signal to bring it back`; }
  else if (stock === 0 && top6Ros >= 2)        { action = 'URGENT REPLENISH'; why = `Sold out, and it was selling ${top6Ros.toFixed(1)}/wk — reorder`; }
  else if (stock === 0)                        { action = 'REVIEW';           why = 'Sold out, no strong recent demand signal'; }
  else if (velocity === 'E')                   { action = 'LIQUIDATE';        why = 'Dead stock — zero recent velocity'; }
  /* the overstock rules come before SIZE FILL: a style sitting on ten months of
     cover is not short of sizes, it is short of buyers, and telling planning to
     buy more of it was the single loudest wrong answer on this screen */
  else if (wof >= WOF_EXIT)                    { action = 'EXIT';             why = `Severely overstocked at ${Math.round(wof)}wk cover`; }
  else if (wof >= WOF_CLEAR)                   { action = 'CLEAR / DISCOUNT'; why = `Overstocked at ${Math.round(wof)}wk cover`; }
  else if (health === 'Healthy' && wof <= WOF_URGENT) { action = 'URGENT REPLENISH'; why = `Selling fast, only ${wof.toFixed(1)}wk cover left`; }
  else if (szOOS >= 2 && trueRos > 0)          { action = 'SIZE FILL';        why = `${szOOS} size(s) OOS suppressing demand`; }
  else if (health === 'Healthy')               { action = 'MAINTAIN';         why = 'Performing within normal range'; }
  else                                         { action = 'MONITOR';          why = 'Low velocity with residual stock'; }

  return { stock, trueRos, top6Ros, wof, szOOS, midBroken, velocity, health, action, why, censoredWeeks };
}

/* ---------- MTM fabric coverage — the trigger RTW never had --------------- */
/** Core replenishment maths, factor by factor, so a planner can see which
    number to argue with. `mill` may be omitted where only the lead time is
    known; variability then defaults to 1 and MOQ to 200 m. */
/* Enigma's auto-PO rule, as BSC described it: every core fabric has a threshold
   set from the vendor's lead time and the weekly sell rate, never below the
   vendor's MOQ; the minute stock falls under it a PO for the MOQ goes to the
   vendor. "100 shirts a week, 3 days transit, MOQ 200 m → threshold 200 m,
   auto-PO says dispatch 200 m." Domestic core: Enigma fires it. International
   core: the same number, but a person has to raise it. */
export function coverageOf(f: Fabric, leadDays: number, mill?: Pick<Vendor, 'onTimeRate' | 'moq'>) {
  const saleable = Math.max(0, f.stockMetres - f.reservedMetres - f.thresholdMetres);   // the sheet's per-fabric floor (3 or 7 m) is a store floor, not the reorder point
  const ros = f.weeklySalesShirts.slice(-8).reduce((a, b) => a + b, 0) / 8;   // shirts/week, last 8 weeks
  const baseMpw = ros * METRES_PER_SHIRT;                                     // metres a week
  const leadDemand = Math.ceil(baseMpw * leadDays / 7);                        // what sells while the next lot is in transit
  const moq = mill?.moq && mill.moq > 0 ? mill.moq : 200;
  const rop = Math.max(leadDemand, moq);                                      // the threshold Enigma holds per core fabric
  const coverDays = baseMpw > 0 ? Math.round((saleable / baseMpw) * 7) : 999;
  const incoming = f.incomingMetres ?? 0;
  const atp = saleable + incoming;                                            // on hand plus already on order
  const shortfall = Math.max(0, rop - atp);
  const suggestedPo = Math.max(moq, Math.ceil(shortfall / moq) * moq);        // the auto-PO asks for the MOQ, or the multiples it takes to get back over the line
  return { saleable, incoming, atp, ros, baseMpw, leadDemand, moq, coverDays, rop, suggestedPo,
    belowRop: atp <= rop && f.bucket !== 'BESPOKE', lowForStore: saleable < STORE_LOW_METRES };
}

/** Sell-through the way BSC defines it — "how much did you order and how much you
    sold in how much time". Ordered comes from the POs on this style; today that
    number is the hard part, which is why they run on rate of sale instead. */
export function sellThroughOf(db: Db, o: RtwOption) {
  const pos = db.orders.filter(x => x.styleName.toLowerCase() === o.styleName.toLowerCase() && (x.status === 'Open' || x.status === 'Closed'));
  const ordered = pos.reduce((a, x) => a + (x.deliveredQty ?? x.orderQty), 0);
  const sold = o.weeklySales.reduce((a, b) => a + b, 0);
  const stock = Object.values(o.stockBySize).reduce((a, b) => a + b, 0);
  const weeks = Math.max(1, Math.min(12, Math.round(daysAgo(o.launchedAt) / 7)));
  const known = pos.length > 0;
  return { known, pos, ordered, sold, weeks, pct: known && ordered > 0 ? sold / ordered : sold + stock > 0 ? sold / (sold + stock) : 0, fallback: !known };
}
/** style = the design; option = the style in one colour. "Pants in black, pants in blue — those are options." */
export const styleOfOption = (o: RtwOption) => o.styleName.includes(' - ') ? o.styleName.split(' - ')[0].trim() : o.styleName.replace(/^(\S+(?: & \S+)?)\s+/, '').trim();

/** RTW reorder maths — the merchandiser's manual weekly working, as described:
    last-4-week in-stock ROS, lifted by the growth bump, ceilinged by the best 6
    weeks since launch; coverage counts open POs; trigger at 90 days. */
export function reorderOf(o: RtwOption, leadDays: number) {
  const r = rosOf(o);
  const stock = Object.values(o.stockBySize).reduce((a, b) => a + b, 0);
  const uplifted = r.trueRos * (1 + GROWTH_UPLIFT);
  const ceilinged = r.top6Ros > 0 ? Math.min(uplifted, r.top6Ros) : uplifted;
  const planRos = ceilinged;
  const coverDays = planRos > 0 ? Math.round(((stock + o.incomingQty) / planRos) * 7) : stock + o.incomingQty > 0 ? 999 : 0;
  const trigger = coverDays < RTW_REORDER_TRIGGER_DAYS;
  const need = Math.ceil((planRos * (leadDays + RTW_REORDER_TRIGGER_DAYS)) / 7) - stock - o.incomingQty;
  const suggestedQty = need <= 0 ? 0 : Math.max(RTW_MOQ, Math.ceil(need / RTW_MOQ) * RTW_MOQ);
  return { ...r, stock, uplifted, ceilinged: r.top6Ros > 0 && uplifted > r.top6Ros, planRos, coverDays, trigger, suggestedQty, leadDays };
}

export type FabricLive = 'Active' | 'Low Stock' | 'Paused' | 'On Hold' | 'Sold Out';
export function liveStatusOf(f: Fabric, leadDays: number): FabricLive {
  if (f.paused) return 'Paused';        // design's call outranks everything — it is not offered at all
  if (f.onHold) return 'On Hold';
  if (f.bucket === 'BESPOKE') return f.millAvailable === false ? 'Sold Out' : 'Active';
  const c = coverageOf(f, leadDays);
  if (c.saleable <= 0) return 'Sold Out';
  if (c.lowForStore) return 'Low Stock';
  return 'Active';
}


/* ---------- costing — the COGS sheet, computed instead of retyped ------- */
export function defaultCosting(category: GarmentCategory): Costing {
  return { cpm: null, consumption: CONSUMPTION_DEFAULT[category].qty, actualConsumption: null, cmp: null, ...COSTING_DEFAULTS, hemming: HEMMED.has(category) ? COSTING_DEFAULTS.hemming : 0 };
}
export function defaultBom(category: GarmentCategory, styleName: string, fabricNominated: boolean): BomLine[] {
  const c = CONSUMPTION_DEFAULT[category];
  const fabricWords = styleName.split(' ').slice(0, -1).join(' ') || styleName;
  return [
    { kind:'fabric', item: fabricWords, spec: fabricNominated ? 'BSC nominated — mill to confirm' : 'vendor sources', qtyPerPc: c.qty, unit: c.unit },
    ...TRIM_CARD.map(item => ({ kind:'trim' as const, item, spec: null, qtyPerPc: null, unit:'pc' })),
    ...PACKAGING_BOM.filter(x => !(category.includes('Knits') && x.includes('Hanger')) && !(x === 'Denim Bag' && category !== 'Jeans')).map(item => ({ kind:'packaging' as const, item, spec: null, qtyPerPc: 1, unit:'pc' })),
  ];
}
export function costingOf(o: ProductionOrder) {
  const c = o.costing;
  const fabricCost = c.cpm != null && c.consumption != null ? c.cpm * c.consumption : null;
  const fobFromSheet = fabricCost != null && c.cmp != null ? fabricCost + c.cmp : null;
  const fob = o.finalFob ?? fobFromSheet;                       // the agreed FOB wins once production closes costing
  const adders = c.trimsPackaging + c.transportation + c.hemming + c.shipping + c.factoryOverheads;
  const cogs = fob != null ? fob + adders : null;                // the sheet's "Total Cost"
  const derivedMrp = cogs != null ? cogs * c.multiple : null;
  const finalMrp = derivedMrp != null ? Math.ceil(derivedMrp / 100) * 100 - 10 : null;   // 3,965 → 3,990, as the sheet rounds
  const net = finalMrp != null ? netOf(finalMrp) : null;
  const intakeMargin = net != null && cogs != null ? (net - cogs) / net : null;
  return { fabricCost, fob, fobFromSheet, adders, cogs, derivedMrp, finalMrp, netMrp: net, intakeMargin, gst: finalMrp != null ? gstFor(finalMrp) : null,
    fabricMetres: c.consumption != null ? Math.ceil(c.consumption * o.orderQty) : null, vsTarget: fob != null ? fob - o.targetCost : null };
}
/** MRP → what BSC actually keeps per piece: after BAU + additional discount, net of GST. */
export const netOf = (mrp: number) => (mrp * (1 - DISCOUNT_BAU) * (1 - DISCOUNT_ADDITIONAL)) / (1 + gstFor(mrp));
export const marginOf = (mrp: number, cogs: number) => { const n = netOf(mrp); return { netMrp: n, intakeMargin: (n - cogs) / n }; };

/* ---------- conversation ------------------------------------------------- */
export const threadOf = (db: Db, kind: ThreadKind, subjectId: string) => (db.threads ?? []).find(t => t.kind === kind && t.subjectId === subjectId) ?? null;

/** "@neha", "@sourcing", "@planning & design" → person ids and role ids. */
export function parseMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/@([a-z][a-z .&]*)/gi)) {
    const raw = m[1].toLowerCase();
    const person = PEOPLE.find(p => raw.startsWith(p.id) || raw.startsWith(p.name.toLowerCase().split(' ')[0]));
    if (person) { out.add(person.id); continue; }
    const role = (Object.keys(ROLE_LABEL) as RoleId[]).find(r => raw.startsWith(r) || raw.startsWith(ROLE_LABEL[r].toLowerCase()));
    if (role) out.add(role);
  }
  return [...out];
}

/** Mentions waiting on this person or their side: nobody from that side has spoken since. */
export 
/* ---------- RTW stock by store — deterministic split of the option's total.
   Enigma holds this per warehouse (list-variants-with-inventory); until it is
   read live, the split is stable per option × store so screens agree. */
const hash = (s: string) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0); };
export function storeStockOf(o: RtwOption): Record<string, Record<string, number>> {
  const holders = STORES.filter(x => x.holdsRtwStock).map(x => x.id).concat('warehouse');
  const out: Record<string, Record<string, number>> = Object.fromEntries(holders.map(h => [h, {}]));
  for (const size of o.sizes) {
    const q = o.stockBySize[size] ?? 0;
    const w = holders.map(h => 1 + (hash(o.id + size + h) % 4)); const sum = w.reduce((a, b) => a + b, 0);
    let left = q;
    holders.forEach((h, i) => { const share = i === holders.length - 1 ? left : Math.floor((q * w[i]) / sum); out[h][size] = share; left -= share; });
  }
  return out;
}

/* ---------- the Replenishment sheet, computed --------------------------------
   One row per SKU-size the sheet would show: what the hub ("Factory") holds,
   which stores are at zero and should get one, which hold more than they sell
   and should send it back. The sheet's per-store Stock / Allocation / Pullback
   triples become two short lists, so 24 stores do not need 72 columns. */
export interface ReplenishmentRow {
  o: RtwOption; size: string; sku: string;
  hub: number;                                   // the sheet's "Factory" — pieces at the unit
  allocate: { storeId: string; qty: number }[];  // stores at zero that sell the option
  balance: number;                               // hub after allocation
  pullback: { storeId: string; qty: number }[];  // stores holding more than a month of sales
}
export function replenishmentOf(db: Db): ReplenishmentRow[] {
  const out: ReplenishmentRow[] = [];
  for (const o of db.options) {
    const h = healthOf(o);
    if (!['SIZE FILL', 'URGENT REPLENISH', 'CLEAR / DISCOUNT', 'LIQUIDATE', 'EXIT'].includes(h.action)) continue;
    const split = storeStockOf(o);
    const weekly = rosOf(o).trueRos / Math.max(1, o.sizes.length);   // per size, roughly
    for (const size of o.sizes) {
      const hub = split.warehouse?.[size] ?? 0;
      const stores = Object.entries(split).filter(([k]) => k !== 'warehouse');
      const allocate: { storeId: string; qty: number }[] = [];
      const pullback: { storeId: string; qty: number }[] = [];
      let balance = hub;
      const slow = ['CLEAR / DISCOUNT', 'LIQUIDATE', 'EXIT'].includes(h.action);
      let budget = slow ? 0 : Math.min(hub, Math.max(1, Math.round(weekly * 4)));   // send what a month sells, no more than the unit holds
      for (const [storeId, bySize] of stores) {
        const q = bySize[size] ?? 0;
        if (q === 0 && weekly > 0 && budget > 0) { allocate.push({ storeId, qty: 1 }); balance -= 1; budget -= 1; }
        else if (q > Math.max(2, Math.ceil(weekly * 4)) && (slow || q >= 6)) pullback.push({ storeId, qty: q - (slow ? 0 : 2) });
      }
      if (allocate.length || pullback.length) out.push({ o, size, sku: `${o.sku ?? o.styleName}-${size}`, hub, allocate, balance, pullback });
    }
  }
  return out.sort((a, b) => (b.allocate.length + b.pullback.length) - (a.allocate.length + a.pullback.length));
}

/* ---------- concept readiness — eleven gates from idea to sellable ------------- */
export type ConceptStage = 'Idea' | 'Sampling' | 'Shipment sample' | 'Approved' | 'Fabric' | 'Blocked' | 'PO raised' | 'Configured' | 'Named' | 'Ready' | 'Live';
export function conceptRounds(c: Concept, gate: 'pp' | 'shipment') {
  const rounds = c.rounds.filter(r => r.gate === gate);
  const last = rounds[rounds.length - 1] ?? null;
  const state: 'not started' | 'with production unit' | 'resubmit' | 'approved' = !last ? 'not started' : last.decision === 'pending' ? 'with production unit' : last.decision;
  return { rounds, last, state, approvedOn: rounds.find(r => r.decision === 'approved')?.reviewedOn ?? null };
}
/** how the cloth for a bulk style is bought — see SourcingMode */
export const sourcingModeOf = (o: ProductionOrder): SourcingMode => o.sourcingMode ?? (o.fabricNominated ? 'bsc-buys' : 'vendor-sources');

export function conceptOf(db: Db, c: Concept) {
  const pp = conceptRounds(c, 'pp'); const ship = conceptRounds(c, 'shipment');
  const fabric = c.fabricId ? db.fabrics.find(f => f.id === c.fabricId) ?? null : null;
  const block = c.blockId ? db.blocks.find(b => b.id === c.blockId) ?? null : null;
  const newFabric = c.kind === 'new-fabric';
  const swatchSent = fabric ? db.swatchDispatches.filter(s => s.fabricId === fabric.id) : [];
  const swatchGot = swatchSent.filter(s => s.confirmedOn).length;
  const holders = STORES.length;
  const enigmaOk = !!c.enigma.configuredOn;
  const named = !!c.naming.setOn;
  const gates = [
    { key:'idea',   label:'Idea logged with a brief', ok: !!c.brief, note: `${c.raisedBy} · ${fmtDate(c.raisedOn)}` },
    { key:'pat',    label:'Sample & PAT file to the factory', ok: !!c.patSentOn, note: c.patSentOn ? `${db.vendors.find(v => v.id === c.factoryId)?.name ?? 'factory'} · ${fmtDate(c.patSentOn)}` : newFabric ? 'sampled on the vendor swatch or an inventory fabric — nothing bought yet' : `on ${db.fabrics.find(f => f.id === c.baseFabricId)?.name ?? 'inventory fabric'}` },
    { key:'pp',     label:'PP sample approved · proof it works', ok: pp.state === 'approved', note: pp.state === 'not started' ? '—' : `${pp.rounds.length} round${pp.rounds.length === 1 ? '' : 's'} · ${pp.state}` },
    { key:'ship',   label:'Shipment sample approved · ready to make at scale', ok: ship.state === 'approved', note: ship.state === 'not started' ? (pp.state === 'approved' ? 'waiting for the factory' : '—') : `${ship.rounds.length} round${ship.rounds.length === 1 ? '' : 's'} · ${ship.state}` },
    { key:'appr',   label:'Approval sent to every department', ok: !!c.approvalSentOn, note: c.approvalSentOn ? `${c.approvalBy} · ${fmtDate(c.approvalSentOn)} · on this record, not an email` : '—' },
    { key:'fabric', label: newFabric ? 'Bulk fabric chosen · vendor, swatch and price' : 'Made on inventory fabric', ok: newFabric ? !!fabric && fabric.cpm != null : !!c.baseFabricId, note: newFabric ? (fabric ? `${fabric.name} · ${db.vendors.find(v => v.id === fabric.vendorId)?.name}${fabric.cpm ? ` · ₹${fabric.cpm}/m` : ' · no price yet'}` : c.approvalSentOn ? 'with sourcing' : 'after approval') : (db.fabrics.find(f => f.id === c.baseFabricId)?.name ?? '—') },
    { key:'block',  label:'Bulk blocked at the vendor, with its expiry', ok: !newFabric || !!block, note: !newFabric ? 'not needed' : block ? `${block.metres} m · ${block.status}${block.status === 'held' ? ` · ${-daysAgo(block.expiresOn)}d left` : ''}` : fabric ? 'not blocked — the vendor can sell it' : 'after the fabric is chosen' },
    { key:'po',     label:'Bulk fabric PO raised', ok: !newFabric || !!c.fabricPo, note: !newFabric ? 'not needed' : c.fabricPo ? `${c.fabricPo.metres} m · ${fmtDate(c.fabricPo.on)}` : fabric ? 'who raises it is still contested — design or sourcing' : 'after the fabric is chosen' },
    { key:'enigma', label:'Configured in Enigma · orderable in principle', ok: enigmaOk, note: enigmaOk ? `${c.enigma.template} · ${c.enigma.consumptionBase}+${c.enigma.consumptionBuffer} m · ${c.enigma.options.length} option${c.enigma.options.length === 1 ? '' : 's'}` : 'template, consumption rule, order-sheet options' },
    { key:'design', label:'Designs on the fabric · product codes', ok: (c.designs?.length ?? 0) > 0, note: c.designs?.length ? `${c.designs.length} design${c.designs.length === 1 ? '' : 's'} · ${c.designs.map(d => d.code).join(', ')}` : 'sourcing creates the designs — each gets the product code Shopify sells' },
    { key:'desc',   label:'Fabric description & composition, for the stores and the website', ok: !!fabric?.composition && (c.designs ?? []).some(d => !!d.description), note: fabric?.composition ? ((c.designs ?? []).some(d => !!d.description) ? `${fabric.composition} · PDP text on the design` : `${fabric.composition} · no PDP description on any design yet`) : 'composition not on the fabric — the store cannot sell what it cannot describe' },
    { key:'name',   label:'Final name & price set', ok: named, note: named ? `${c.naming.newName} · ₹${c.naming.mrp?.toLocaleString('en-IN')}` : c.naming.oldName ? `working name "${c.naming.oldName}"` : '—' },
    { key:'swatch', label:'Swatches received at stores', ok: !newFabric || !!c.swatch?.storesToldOn || (swatchSent.length > 0 && swatchGot >= Math.ceil(holders * 0.8)), note: !newFabric ? 'not needed — existing swatch' : swatchSent.length ? `${swatchGot} of ${swatchSent.length} sent confirmed · ${holders} stores` : 'cut from the bulk once it lands' },
    { key:'live',   label:'Live — orderable in stores and on the website', ok: !!c.liveOn, note: c.liveOn ? fmtDate(c.liveOn) : 'a decision, once every gate above is green' },
  ];
  const ready = gates.filter(g => g.key !== 'live').every(g => g.ok);
  const bulkDone = !newFabric || !!c.fabricPo;
  const stage: ConceptStage = c.liveOn ? 'Live' : ready ? 'Ready' : named ? 'Named' : enigmaOk ? 'Configured' : c.approvalSentOn && newFabric && bulkDone ? 'PO raised' : c.approvalSentOn && block ? 'Blocked' : c.approvalSentOn && newFabric && fabric ? 'Fabric' : c.approvalSentOn ? 'Approved' : ship.state !== 'not started' || pp.state === 'approved' ? 'Shipment sample' : c.patSentOn ? 'Sampling' : 'Idea';
  /* the mills' offers, once sourcing has sent them: the count, the cheapest
     first buy (MOQ × rate — the cheque design is really approving) and the
     soonest hold to lapse, so a list can show the decision without opening it */
  const offers = (c.fabricOptions ?? []).filter(o => !o.rejected);
  const offersWithDesign = !!c.optionsSentOn && !fabric && offers.length > 0;
  const firstBuy = offers.length ? Math.min(...offers.map(o => o.cpm * o.moq)) : null;
  const holdDays = (() => { const hs = offers.map(o => o.holdUntil).filter(Boolean) as string[];
    return hs.length ? -daysAgo([...hs].sort()[0]) : null; })();
  const waitingOn: RoleId | null = c.liveOn ? null
    : pp.state === 'with production unit' || ship.state === 'with production unit' ? 'design'
    /* offers on the table are design's call, not sourcing's — this said
       "sourcing" while three mills sat waiting on a decision */
    : offersWithDesign ? 'design'
    : c.approvalSentOn && !bulkDone ? 'sourcing'
    : c.approvalSentOn ? 'design'
    : 'production';
  const stuckDays = pp.last && pp.state === 'with production unit' ? daysAgo(pp.last.submittedOn) : ship.last && ship.state === 'with production unit' ? daysAgo(ship.last.submittedOn) : 0;
  return { designs: c.designs ?? [], swatch: c.swatch ?? null, online: c.online ?? null, gates, stage, ready, blockers: gates.filter(g => !g.ok).length, pp, ship, fabric, block, swatchGot, swatchSent: swatchSent.length, waitingOn, stuckDays, ageDays: daysAgo(c.raisedOn), offers, offersWithDesign, firstBuy, holdDays };
}

/* ---------- launch readiness — every gate visible, the status derived ----- */
export type LaunchStage = 'In production' | 'At HO' | 'Allocating' | 'Dispatching' | 'Ready' | 'Launched';
export function launchOf(l: Launch) {
  const pieces = l.pieces;
  const dispatched = pieces.filter(p => p.dispatchedOn).length;
  const received = pieces.filter(p => p.receivedOn).length;
  const allocated = pieces.length > 0;
  const allDispatched = allocated && dispatched === pieces.length;
  const allReceived = allocated && received === pieces.length;
  const briefDue = l.launchOn ? iso(addDays(l.launchOn, -MARKETING_LEAD_DAYS)) : null;
  const briefLate = !!briefDue && !l.marketingBriefOn && daysAgo(briefDue) > 0;
  const gates = [
    { key:'ho', label:'Goods received at HO', ok: !!l.receivedAtHo, note: l.receivedAtHo ? fmtDate(l.receivedAtHo) : `expected ${fmtDate(l.expectedAtHo)}${daysAgo(l.expectedAtHo) > 0 ? ` · ${daysAgo(l.expectedAtHo)}d late` : ''}` },
    { key:'code', label:'Design code minted by design', ok: !!l.designCode, note: l.designCode ? `${l.designCode} · ${fmtDate(l.designCodeOn)}${l.designCodeBy ? ` · ${l.designCodeBy}` : ''}` : l.receivedAtHo ? 'goods are in — design mints the code' : 'after the goods are received' },
    { key:'alloc', label:'Display & fit allocated to stores', ok: allocated, note: allocated ? `${pieces.length} pieces to ${new Set(pieces.map(p => p.storeId)).size} stores` : 'no plan yet' },
    { key:'disp', label:'Pieces dispatched', ok: allDispatched, note: allocated ? `${dispatched} of ${pieces.length}` : '—' },
    { key:'recv', label:'Stores confirmed receipt', ok: allReceived, note: allocated ? `${received} of ${pieces.length}` : '—' },
    { key:'mkt', label:'Name & description to marketing', ok: !!l.marketingBriefOn, note: l.marketingBriefOn ? `${l.marketingName ?? 'sent'} · ${fmtDate(l.marketingBriefOn)}` : briefDue ? `due ${fmtDate(briefDue)} (${MARKETING_LEAD_DAYS}d before launch)${briefLate ? ' · late' : ''}` : 'launch date not set' },
    { key:'date', label:'Launch date set · made live in Enigma on the day', ok: !!l.launchOn, note: l.launchOn ? fmtDate(l.launchOn) : '—' },
  ];
  const stage: LaunchStage = l.launchedOn ? 'Launched' : gates.every(g => g.ok) ? 'Ready' : !l.receivedAtHo ? 'In production' : !l.designCode || !allocated ? 'At HO' : !allDispatched ? 'Allocating' : 'Dispatching';
  const blockers = gates.filter(g => !g.ok).length;
  const launchLate = !!l.launchOn && !l.launchedOn && daysAgo(l.launchOn) > 0;
  return { stage, gates, blockers, dispatched, received, briefDue, briefLate, launchLate, pieceCount: pieces.length };
}
/** The sheet's default: one display piece and a fit set to every store that holds RTW stock. */
export function defaultLaunchPieces(styleName: string, storeIds: string[]): LaunchPiece[] {
  const bottoms = isBottoms(styleName);
  const disp = bottoms ? DISPLAY_PLAN.display.bottoms : DISPLAY_PLAN.display.shirts;
  const fits = bottoms ? DISPLAY_PLAN.fit.bottoms : DISPLAY_PLAN.fit.shirts;
  return storeIds.flatMap(storeId => [
    { storeId, kind:'display' as const, size: disp, qty: 1, dispatchedOn: null, receivedOn: null },
    ...fits.map(size => ({ storeId, kind:'fit' as const, size, qty: 1, dispatchedOn: null, receivedOn: null })),
  ]);
}
/** Display & fit pieces out on the floor for an option — issued at COGS, never sellable (Question Bank Q92). */
export function floorPiecesOf(db: Db, optionId: string) {
  const ls = (db.launches ?? []).filter(l => l.optionId === optionId);
  const pieces = ls.flatMap(l => l.pieces);
  return { display: pieces.filter(p => p.kind === 'display').reduce((a, p) => a + p.qty, 0), fit: pieces.filter(p => p.kind === 'fit').reduce((a, p) => a + p.qty, 0), total: pieces.reduce((a, p) => a + p.qty, 0) };
}

/* ---------- vendor 360 — measured from the record, never typed twice ------ */
export function vendorStatsOf(db: Db, vendorId: string) {
  const v = db.vendors.find(x => x.id === vendorId);
  const mine = db.orders.filter(o => o.vendorId === vendorId);
  const open = mine.filter(o => o.status === 'Open');
  const closed = mine.filter(o => o.status === 'Closed');
  /* measured lead: PO date → actual inhouse, on closed POs */
  const leads = closed.map(o => { const last = o.milestones[o.milestones.length - 1]; return o.poDate && last?.actual ? daysBetween(o.poDate, last.actual) : null; }).filter((x): x is number => x != null);
  const measuredLead = leads.length ? Math.round(leads.reduce((a, b) => a + b, 0) / leads.length) : null;
  const otifCount = closed.filter(o => otifOf(o) === 'OTIF').length;
  const otifPct = closed.length ? Math.round((otifCount / closed.length) * 100) : null;
  /* slip: last landed milestone vs its plan, across everything with an actual */
  const slips = mine.flatMap(o => { const landed = [...o.milestones].reverse().find(m => m.actual); return landed ? [Math.max(0, daysBetween(landed.plan, landed.actual!))] : []; });
  const avgSlip = slips.length ? Math.round(slips.reduce((a, b) => a + b, 0) / slips.length) : null;
  /* quotes */
  const given = db.orders.flatMap(o => (o.fabricQuotes ?? []).filter(q => q.vendorId === vendorId).map(q => ({ o, q })));
  const quotesWon = given.filter(x => x.q.selected).length;
  const lost = given.filter(x => !x.q.selected && x.o.fabricQuotes.some(q => q.selected));
  const avgQuoteVsWinner = lost.length ? Math.round(lost.reduce((a, x) => a + (x.q.cpm - x.o.fabricQuotes.find(q => q.selected)!.cpm), 0) / lost.length) : null;
  const escalations = db.escalations.filter(e => mine.some(o => o.id === e.orderId));
  /* mills */
  const fabrics = db.fabrics.filter(f => f.vendorId === vendorId);
  const fabricsBelowRop = fabrics.filter(f => f.bucket !== 'BESPOKE' && coverageOf(f, v?.leadDays ?? 14, v).belowRop).length;
  const blocksHeld = db.blocks.filter(b => b.vendorId === vendorId && b.status === 'held');
  /* grade */
  const isMill = !!v && v.kind.endsWith('mill');
  const onTime = v?.onTimeRate ?? 0;
  const grade: 'Reliable' | 'Watch' | 'Poor' | 'Too new' =
    !isMill && closed.length === 0 && open.length === 0 ? 'Too new'
    : (isMill ? onTime : (otifPct != null ? otifPct / 100 : onTime)) < 0.4 || (avgSlip ?? 0) >= 10 ? 'Poor'
    : (isMill ? onTime : (otifPct != null ? otifPct / 100 : onTime)) < 0.7 || (avgSlip ?? 0) >= 5 ? 'Watch' : 'Reliable';
  const gradeRank = { Poor: 0, Watch: 1, Reliable: 2, 'Too new': 3 }[grade];
  return { open, closed, measuredLead, otifCount, otifPct, avgSlip, quotesGiven: given.length, quotesWon, avgQuoteVsWinner, escalations, fabrics, fabricsBelowRop, blocksHeld, grade, gradeRank };
}

/* ==========================================================================
   MTM production — Swati's planning, as rules instead of memory.
   Stages are Enigma's. Capacity is what the factory actually put out (the
   shipping team's daily report), not the master's nominal number. Everything
   here is recomputed on read; nothing is a typed status.
   ========================================================================== */
export const MTM_OPEN = new Set(['pp', 'planned', 'in-transit', 'in-factory', 'out-factory', 'rts']);
export const mtmOrders = (db: Db) => (db.customerOrders ?? []).filter(o => o.kind === 'MTM');
const hoursAgo = (d: string) => (TODAY.getTime() - new Date(d).getTime()) / 36e5;

/** The three numbers Swati reads off three sheets, for one factory. */
export function factoryLoadOf(db: Db, factoryId: string) {
  const v = db.vendors.find(x => x.id === factoryId);
  const mine = mtmOrders(db).filter(o => o.factoryId === factoryId);
  const wip = mine.filter(o => o.stage === 'in-factory');
  const inTransit = mine.filter(o => o.stage === 'in-transit' || o.stage === 'planned');
  const ready = mine.filter(o => o.stage === 'out-factory');
  const outToday = mine.filter(o => o.scans.some(sc => sc.stage === 'out-factory' && sc.at.slice(0, 10) === iso(TODAY).slice(0, 10))).length;
  const daily = v?.dailyOut ?? [];
  const avgOut = daily.length ? Math.round(daily.reduce((a, b) => a + b, 0) / daily.length) : 0;
  const nominal = (v?.tailors ?? 0) * PIECES_PER_TAILOR_DAY;
  const aging = wip.filter(o => { const inAt = o.scans.find(sc => sc.stage === 'in-factory')?.at; return inAt ? daysAgo(inAt) > AGING_DAYS : false; });
  const overdue = mine.filter(o => MTM_OPEN.has(o.stage) && daysAgo(o.promisedOn) > 0);
  /* feed today = what it clears in a day, less what is already queued for it. Never more than a day's output. */
  /* Capacity is the cap the plan is held to — what production says this floor can
     take in a day. Unset, we fall back to what it has actually been producing. */
  const perDay = v?.dailyTarget && v.dailyTarget > 0 ? v.dailyTarget : avgOut;
  const headroom = Math.max(0, perDay - inTransit.length - Math.max(0, wip.length - perDay * 2));
  const load = avgOut ? (wip.length + inTransit.length) / avgOut : 0;   // days of work sitting with the factory
  return { v, wip, inTransit, ready, outToday, avgOut, perDay, nominal, aging, overdue, headroom, load, daily };
}

/** Orders waiting for a plan — Enigma's PP, less the freeze window. */
export const fmtTime = (d: string | Date) => new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false });
export function ppQueue(db: Db, freezeHours = PP_FREEZE_HOURS) {
  /* bespoke orders wait for their fabric to be inwarded before they can be planned */
  const all = mtmOrders(db).filter(o => (o.stage === 'pp' || o.stage === 'punched') && !(o.bespoke && !o.bespoke.inwardOn));
  const frozen = all.filter(o => hoursAgo(o.punchedOn) < freezeHours).sort((a, b) => a.punchedOn.localeCompare(b.punchedOn));
  const ready = all.filter(o => hoursAgo(o.punchedOn) >= freezeHours).sort((a, b) => {
    const pr = (t: OrderTag) => (t === 'urgent' ? 0 : 1);
    return pr(a.tag) - pr(b.tag) || a.punchedOn.localeCompare(b.punchedOn);   // urgent first, then FIFO by punch time
  });
  return { frozen, ready, freezeHours };
}

export interface Proposal { factoryId: string; orderIds: string[]; why: string }
/** Rule-based allocation, human in the loop: the machine drafts, Swati edits and submits.
    urgent → the factory kept with breathing space (or the nearest with room);
    corporate → the corporate factory; alteration / hemming → the hemming unit;
    normal → FIFO into whichever open factory has the most headroom today. */
export function proposeAllocation(db: Db, orders: CustomerOrder[]): { proposals: Proposal[]; unplaced: CustomerOrder[] } {
  const factories = db.vendors.filter(v => v.mtm && v.kind !== 'Hemming unit');
  const room: Record<string, number> = Object.fromEntries(factories.map(f => [f.id, factoryLoadOf(db, f.id).headroom]));
  const by: Record<string, string[]> = {};
  const why: Record<string, string> = {};
  const unplaced: CustomerOrder[] = [];
  const place = (o: CustomerOrder, fid: string, w: string) => { (by[fid] ??= []).push(o.id); why[fid] ??= w; room[fid] = (room[fid] ?? 0) - 1; };
  const nearestOpen = () => [...factories].filter(f => room[f.id] > 0).sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99))[0];
  for (const o of orders) {
    if (o.tag === 'corporate') { const f = factories.find(x => x.corporate) ?? factories.find(x => x.id === CORPORATE_FACTORY); if (f) { place(o, f.id, 'corporate orders always go to one factory'); continue; } }
    if (o.tag === 'urgent') { const f = factories.find(x => x.urgentReserve) ?? factories.find(x => x.id === URGENT_FACTORY); const pick = f && room[f.id] > 0 ? f : nearestOpen(); if (pick) { place(o, pick.id, pick.id === f?.id ? 'urgent — the factory kept with breathing space' : 'urgent — nearest factory with room'); continue; } }
    const best = [...factories].sort((a, b) => room[b.id] - room[a.id])[0];
    if (best && room[best.id] > 0) place(o, best.id, 'most headroom today · FIFO by punch time'); else unplaced.push(o);
  }
  return { proposals: Object.entries(by).map(([factoryId, orderIds]) => ({ factoryId, orderIds, why: why[factoryId] })), unplaced };
}

/** Vishnu's aging pivot and Vishal's shipping table, derived. */
export function agingOf(db: Db) {
  const open = mtmOrders(db).filter(o => MTM_OPEN.has(o.stage) || o.stage === 'punched');
  const byStage: Record<string, number> = {};
  open.forEach(o => (byStage[o.stage] = (byStage[o.stage] ?? 0) + 1));
  const overdue = open.filter(o => daysAgo(o.promisedOn) > 0);
  const dueToday = open.filter(o => o.promisedOn.slice(0, 10) === iso(TODAY).slice(0, 10));
  const edges = [0, 1, 3, 5, 7];
  const buckets = edges.map((d, i) => { const hi = edges[i + 1]; const n = overdue.filter(o => { const a = daysAgo(o.promisedOn); return a > d && (hi == null || a <= hi); }).length; return { label: hi == null ? `> ${d}d late` : `${d + 1}–${hi}d late`, n }; });
  return { open, byStage, overdue, dueToday, buckets };
}
export function shippingTable(db: Db) {
  return db.vendors.filter(v => v.mtm).map(v => { const l = factoryLoadOf(db, v.id); return { ...l, v, mtmOut: l.outToday }; });
}
/** Enigma's consumption formula on the order sheet: base for the fabric + buffer. */
export const consumptionFor = (base = 1.6, buffer = 0.10) => Math.round((base + buffer) * 100) / 100;

/* ---------- RTW gates before and after the floor ------------------------- */
export function sampleStatusOf(o: ProductionOrder) {
  const rounds = o.samples ?? [];
  const last = rounds[rounds.length - 1];
  const approved = rounds.find(r => r.decision === 'approved');
  const state: 'not started' | 'with production unit' | 'resubmit' | 'approved' = !last ? 'not started' : last.decision === 'pending' ? 'with production unit' : last.decision === 'resubmit' ? 'resubmit' : 'approved';
  return { rounds, last, approved, state, ppGoAhead: approved?.reviewedOn ?? null, majorOpen: last?.decision === 'resubmit' ? last.comments.filter(c => c.major).length : 0 };
}
export function materialsOf(o: ProductionOrder) {
  const lines = (o.materials ?? []).map(m => ({ ...m, bom: o.bom[m.bomIndex] }));
  const received = lines.filter(l => l.receivedOn).length, checked = lines.filter(l => l.checked === 'ok').length, failed = lines.filter(l => l.checked === 'fail').length, issued = lines.filter(l => l.issuedOn).length;
  const allIssued = lines.length > 0 && issued === lines.length;
  return { lines, received, checked, failed, issued, allIssued, total: lines.length };
}
export function defaultMaterials(o: Pick<ProductionOrder, 'bom' | 'orderQty'>): MaterialLine[] {
  return o.bom.map((l, i) => ({ bomIndex: i, requiredQty: Math.ceil((l.qtyPerPc ?? 1) * o.orderQty), receivedOn: null, checked: 'pending' as const, issuedOn: null }));
}
export function qcStatusOf(o: ProductionOrder) {
  const audits = o.qcAudits ?? [];
  const last = audits[audits.length - 1];
  const checked = audits.reduce((a, q) => a + q.checked, 0), passed = audits.reduce((a, q) => a + q.passed, 0);
  return { audits, last, checked, passed, rejectRate: checked ? (checked - passed) / checked : null, held: !!last && !last.released, released: !!last && last.released };
}

/* ---------- the warehouse's MTM day ---------------------------------------- */
/** Planned, not yet dispatched: cut the fabric, print the sheet, scan out. Grouped by plan. */
export function prepQueue(db: Db) {
  const orders = mtmOrders(db).filter(o => o.stage === 'planned');
  const byPlan = new Map<string, CustomerOrder[]>();
  orders.forEach(o => byPlan.set(o.planId ?? 'none', [...(byPlan.get(o.planId ?? 'none') ?? []), o]));
  const cutList = (os: CustomerOrder[]) => { const m = new Map<string, { fabricId: string; name: string; metres: number; pcs: number }>(); os.forEach(o => { if (!o.fabricId) return; const cur = m.get(o.fabricId) ?? { fabricId: o.fabricId, name: o.styleName, metres: 0, pcs: 0 }; cur.metres = Math.round((cur.metres + (o.consumptionM ?? 0)) * 100) / 100; cur.pcs++; m.set(o.fabricId, cur); }); return [...m.values()].sort((a, b) => b.metres - a.metres); };
  return { orders, byPlan, cutList, totalMetres: Math.round(orders.reduce((a, o) => a + (o.consumptionM ?? 0), 0) * 10) / 10 };
}
/** The daily vehicle round: what factories say is ready vs what reached the unit today. */
export function inwardOf(db: Db) {
  const today = iso(TODAY).slice(0, 10);
  return db.vendors.filter(v => v.mtm).map(v => {
    const mine = mtmOrders(db).filter(o => o.factoryId === v.id);
    const waiting = mine.filter(o => o.stage === 'out-factory');
    const declaredToday = mine.filter(o => o.scans.some(sc => sc.stage === 'out-factory' && sc.at.slice(0, 10) === today)).length;
    const receivedToday = mine.filter(o => o.scans.some(sc => sc.stage === 'rts' && sc.at.slice(0, 10) === today)).length;
    return { v, waiting, declaredToday, receivedToday, gap: declaredToday - receivedToday };
  });
}
/** Bespoke: fabric called from the mill, parcel expected with the sticker code. */
export function bespokeQueue(db: Db) {
  const all = mtmOrders(db).filter(o => o.bespoke);
  const toCall = all.filter(o => o.bespoke && !o.bespoke.requestedOn && o.stage !== 'cancelled');
  const awaiting = all.filter(o => o.bespoke && o.bespoke.requestedOn && !o.bespoke.inwardOn && o.stage !== 'cancelled').sort((a, b) => a.bespoke!.requestedOn!.localeCompare(b.bespoke!.requestedOn!));
  const inwardedToday = all.filter(o => o.bespoke?.inwardOn?.slice(0, 10) === iso(TODAY).slice(0, 10)).length;
  const fabrics = db.fabrics.filter(f => f.bucket === 'BESPOKE');
  const notReportedToday = fabrics.filter(f => !f.millReportedAt || daysAgo(f.millReportedAt) >= 1);
  return { toCall, awaiting, inwardedToday, fabrics, notReportedToday, mills: [...new Set(fabrics.map(f => f.vendorId))] };
}
export const mintBespokeCode = (millId: string, n: number) => `${millId.slice(0, 3).toUpperCase()}-${(n * 7919 % 46656).toString(36).toUpperCase().padStart(3, '0')}${(n % 97).toString(36).toUpperCase()}`;

/* ---------- mentions — "someone needs me" across every record ---------------
   Today a tag lives inside whichever thread it was written on, so the only way
   to know you were asked is to open the record. Here they are collected for one
   person, newest first, with the record they belong to and a way back to it. */
export interface MentionItem { threadId: string; commentId: string; kind: ThreadKind; subjectId: string; at: string; who: string; role: RoleId; text: string; step: string | null; label: string; href: string; resolved: { by: string; at: string } | null }

export function mentionsFor(db: Db, personId: string, role: RoleId, viewerRole: RoleId): MentionItem[] {
  const where = (kind: ThreadKind, id: string): { label: string; href: string } => {
    switch (kind) {
      case 'order': { const o = (db.customerOrders ?? []).find(x => x.id === id);
        if (o) return { label: `${o.orderNo} · ${o.customer} · ${o.styleName}`,
          href: viewerRole === 'store' ? `#/stores?tab=${o.kind === 'MTM' ? 'mtm-orders' : 'rtw-orders'}&open=${id}` : `#/mtm?open=${id}` };
        const po = db.orders.find(x => x.id === id);   // the same thread kind carries bulk POs
        return { label: po ? `${po.poNo ?? 'PO'} · ${po.styleName}` : id, href: `#/tracker?open=${id}` }; }
      case 'request': { const r = (db.optionRequests ?? []).find(x => x.id === id); return { label: r ? `${r.reqNo} · ${r.category} · ${r.optionCount} options` : id, href: `#/design?open=${id}` }; }
      case 'fabric': { const f = db.fabrics.find(x => x.id === id); return { label: f ? `${f.name} · ${f.code}` : id, href: `#/fabrics?open=${id}` }; }
      case 'option': { const o = db.options.find(x => x.id === id); return { label: o ? `${o.styleName} · ${o.subCat1}` : id, href: `#/health?open=${id}` }; }
      case 'return': { const r = db.returns.find(x => x.id === id); return { label: r ? `${r.caseNo} · ${r.styleName}` : id, href: `#/stores?tab=returns&open=${id}` }; }
      case 'launch': { const l = (db.launches ?? []).find(x => x.id === id); return { label: l ? `${l.styleName} · ${l.dropMonth}` : id, href: `#/launches?open=${id}` }; }
      case 'vendor': { const v = db.vendors.find(x => x.id === id); return { label: v ? v.name : id, href: `#/vendors?vendor=${id}` }; }
      case 'concept': { const c = (db.concepts ?? []).find(x => x.id === id); return { label: c ? (c.naming.newName ?? c.name) : id, href: `#/design?open=${id}` }; }
      case 'customer': return { label: id, href: `#/stores?tab=customers&open=cust:${encodeURIComponent(id)}` };
    }
  };
  const out: MentionItem[] = [];
  (db.threads ?? []).forEach(t => t.comments.forEach(c => {
    if (!c.mentions.includes(personId) && !c.mentions.includes(role)) return;
    const { label, href } = where(t.kind, t.subjectId);
    out.push({ threadId: t.id, commentId: c.id, kind: t.kind, subjectId: t.subjectId, at: c.at, who: c.who, role: c.role, text: c.text, step: c.step,
      label, href, resolved: (c.resolved ?? []).find(r => r.by === personId) ?? null });
  }));
  return out.filter(m => !MTM_ONLY || !isRtwHref(m.href)).sort((a, b) => b.at.localeCompare(a.at));
}

/* ---------- RTW customer orders — fulfilled by the unit or the store shelf ---- */
export const hubOrders = (db: Db) => (db.customerOrders ?? []).filter(o => o.kind === 'RTW' && !['delivered', 'cancelled'].includes(o.stage));
/** Where the piece comes from: the store's own shelf if it holds the size, else the central hub. */
export function fulfilFromOf(db: Db, o: CustomerOrder): 'store' | 'hub' {
  const opt = db.options.find(x => x.id === o.optionId); if (!opt || !o.size) return 'hub';
  const st = STORES.find(x => x.id === o.storeId); if (!st?.holdsRtwStock) return 'hub';
  return (storeStockOf(opt)[o.storeId]?.[o.size] ?? 0) > 0 ? 'store' : 'hub';
}

/* ---------- what is on its way to a store — every parcel the store must count in ----------
   The store side of the GRN. Today the warehouse closes the STO and the store finds
   out what came by opening the box. */
export type StoreInboundKind = 'sto' | 'mtm' | 'rtw' | 'launch' | 'book' | 'swatch' | 'request' | 'fit' | 'return';
export interface StoreInbound { kind: StoreInboundKind; id: string; what: string; detail: string; sentOn: string; from: string; qty: number }
export function storeInboundOf(db: Db, storeId: string): StoreInbound[] {
  const out: StoreInbound[] = [];
  db.transfers.filter(t => t.toStoreId === storeId && t.shippedOn && !t.closedOn).forEach(t => out.push({ kind:'sto', id:t.id, what:`${t.stoNo} · ${t.styleName}`, detail:`${t.stoType}${t.hemmingType && t.hemmingType !== 'NA' ? ` · ${t.hemmingType}` : ''}${t.arrivedOn ? ' · arrived, not counted in' : ' · in transit'}`, sentOn:t.shippedOn, from:'production unit', qty:t.qty }));
  (db.customerOrders ?? []).filter(o => o.storeId === storeId && o.stage === 'dispatched').forEach(o => out.push({ kind: o.kind === 'MTM' ? 'mtm' : 'rtw', id:o.id, what:`${o.orderNo} · ${o.customer}`, detail:`${o.kind === 'MTM' ? 'made-to-measure shirt' : o.hemLength != null ? 'RTW bottoms, hemmed at the unit' : 'RTW from the hub'} · ${o.styleName}${o.size ? ` · ${o.size}` : ''}`, sentOn: o.scans.find(s => s.stage === 'dispatched')?.at ?? o.punchedOn, from:'production unit · shipping', qty:o.qty }));
  (db.launches ?? []).forEach(l => { const mine = l.pieces.filter(p => p.storeId === storeId && p.dispatchedOn && !p.receivedOn); if (mine.length) out.push({ kind:'launch', id:l.id, what:`${l.styleName} · display & fit`, detail:`${mine.map(p => `${p.kind} ${p.size}`).join(', ')} · never sellable`, sentOn: mine[0].dispatchedOn!, from:'production unit', qty: mine.reduce((a, p) => a + p.qty, 0) }); });
  (db.swatchBooks ?? []).filter(b => b.storeId === storeId && !b.receivedOn).forEach(b => out.push({ kind:'book', id:b.id, what:`${b.kind} swatch book · ${b.edition}`, detail:`${b.copies} cop${b.copies === 1 ? 'y' : 'ies'}${b.trackingNo ? ` · AWB ${b.trackingNo}` : ''}`, sentOn:b.dispatchedOn, from: b.from === 'unit' ? 'production unit' : db.vendors.find(v => v.id === b.from)?.name ?? 'mill', qty:b.copies }));
  db.returns.filter(r => r.storeId === storeId && r.factoryLeg?.receivedAtFactoryOn && r.factoryLeg.sentOn && !r.factoryLeg.backAtStoreOn && r.stage === 'back-at-store').forEach(r => out.push({ kind:'return', id:r.id, what:`${r.caseNo} · ${r.styleName}`, detail:`returned piece back from the factory after ${r.attempts[r.attempts.length - 1]?.step ?? 'work'} — the customer tries it`, sentOn: r.factoryLeg!.receivedAtFactoryOn!, from:'factory via the unit', qty:1 }));
  (db.fitSamples ?? []).filter(f => f.storeId === storeId && !f.receivedOn).forEach(f => out.push({ kind:'fit', id:f.id, what:`fit sample · ${f.fit} ${f.size}`, detail:'for the MTM fit set — the customer tries this before the shirt is made', sentOn:f.dispatchedOn, from:'production unit', qty:1 }));
  db.swatchDispatches.filter(s => s.storeId === storeId && !s.confirmedOn).forEach(s => out.push({ kind:'swatch', id:s.id, what:`swatch · ${db.fabrics.find(f => f.id === s.fabricId)?.name ?? ''}`, detail:'loose swatch for the book', sentOn:s.dispatchedOn, from:'production unit', qty:1 }));
  (db.stockRequests ?? []).filter(r => r.toStoreId === storeId && r.status === 'shipped').forEach(r => out.push({ kind:'request', id:r.id, what:`${r.styleName} · ${r.size}`, detail:`asked from ${STORES.find(s => s.id === r.fromStoreId)?.name ?? 'another store'}`, sentOn:r.requestedOn, from: STORES.find(s => s.id === r.fromStoreId)?.name ?? 'store', qty:r.qty }));
  return out.sort((a, b) => a.sentOn.localeCompare(b.sentOn));
}

/* ---------- a return's real status, from what has happened ---------- */
export function returnStatusOf(r: ReturnCase) {
  const last = r.attempts?.[r.attempts.length - 1] ?? null;
  const tried = (r.attempts ?? []).filter(a => a.outcome === 'not enough').map(a => a.step);
  const leg = r.factoryLeg;
  const h = r.hemLeg ?? null;
  const onUnitRoute = !!h && last?.outcome === 'pending' && last.step === 'alteration' && last.where === 'hemming-unit';
  const hemLabel = !onUnitRoute ? null
    : !h!.handedOn ? 'to hand to the vehicle · for the hemming unit'
    : !h!.inwardAtWarehouseOn ? 'on its way to the warehouse'
    : !h!.atUnitOn ? 'at the warehouse · to the hemming unit'
    : !h!.hemmedOn ? 'at the hemming unit'
    : !h!.backAtWarehouseOn ? 'hemmed · on its way back to the warehouse'
    : !h!.dispatchedOn ? 'at the warehouse · to dispatch'
    : !h!.deliveredOn ? (h!.destination === 'customer' ? 'on its way to the customer' : 'on its way to the store')
    : h!.destination === 'customer' ? 'with the customer · store to confirm' : 'back at store · customer to try';
  const hemWaiting: RoleId | null = !onUnitRoute ? null
    : !h!.handedOn ? 'store' : !h!.inwardAtWarehouseOn ? 'warehouse' : !h!.atUnitOn ? 'warehouse' : !h!.hemmedOn ? 'production' : !h!.backAtWarehouseOn ? 'warehouse' : !h!.dispatchedOn ? 'warehouse' : 'store';
  const label = r.closedOn ? 'closed'
    : hemLabel ? hemLabel
    : r.refund && !r.refund.movedOn ? 'refund with finance'
    : leg && leg.sentOn && !leg.receivedAtFactoryOn ? 'on its way to the factory'
    : leg && leg.receivedAtFactoryOn && !leg.backAtStoreOn ? `at the factory · ${last?.step ?? 'work'} in progress`
    : last?.outcome === 'pending' && last.step === 'alteration' && last.where !== 'factory' ? 'store altering it'
    : leg && leg.backAtStoreOn && last?.outcome === 'pending' ? 'back at store · customer to try'
    : last?.outcome === 'pending' ? `${last.step} in progress`
    : 'waiting on the store';
  const waitingOn: RoleId | null = r.closedOn ? null : hemWaiting ? hemWaiting : r.refund && !r.refund.movedOn ? 'finance' : leg && leg.sentOn && !leg.receivedAtFactoryOn ? 'production' : leg && leg.receivedAtFactoryOn && !leg.backAtStoreOn ? 'production' : 'store';
  const nextStep = (['alteration', 'refit', 'remake', 'store-credit', 'refund'] as ResolutionStep[]).find(s => !(r.attempts ?? []).some(a => a.step === s)) ?? null;   // exchange is a side door, not a rung in the order
  return { label, waitingOn, last, tried, nextStep, open: !r.closedOn, overdue: !r.closedOn && daysAgo(r.openedOn) > r.slaDays };
}

/* ---------- customer 360 — everything one customer has done with BSC, across stores ----------
   Today a store manager opens orders one by one in Enigma. The customer is the
   name on the bill; measurements on file are the last MTM sheet they ordered on. */
export function customersOf(db: Db, q = '') {
  const os = db.customerOrders ?? [];
  const names = [...new Set(os.map(o => o.customer))].filter(n => !q || n.toLowerCase().includes(q.toLowerCase()));
  return names.map(n => customerOf(db, n)).sort((a, b) => b.last.localeCompare(a.last));
}
/* a credit note is good for a year, like a gift card (store manager, 13 Oct 2026) */
export const CREDIT_VALID_DAYS = 365;
export const creditBalanceOf = (db: Db, name: string) => (db.creditLedger ?? []).filter(e => e.customer === name && (e.amount < 0 || daysAgo(e.at) <= CREDIT_VALID_DAYS)).reduce((a, e) => a + e.amount, 0);
export function customerOf(db: Db, name: string) {
  const os = (db.customerOrders ?? []).filter(o => o.customer === name).sort((a, b) => b.punchedOn.localeCompare(a.punchedOn));
  const mtm = os.filter(o => o.kind === 'MTM'); const rtw = os.filter(o => o.kind !== 'MTM');
  const byStore = new Map<string, number>(); os.forEach(o => byStore.set(o.storeId, (byStore.get(o.storeId) ?? 0) + 1));
  const homeStore = [...byStore.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const lastSheet = mtm.find(o => o.measurements);
  const mode = (xs: (string | null | undefined)[]) => { const m = new Map<string, number>(); xs.forEach(x => { if (x) m.set(x, (m.get(x) ?? 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };
  const picks = lastSheet ? { collar: mode(mtm.map(o => o.spec?.collar)), cuff: mode(mtm.map(o => o.spec?.cuff)), placket: mode(mtm.map(o => o.spec?.placket)), pocket: mode(mtm.map(o => o.spec?.pocket)), fit: mode(mtm.map(o => o.fit)) } : null;
  const fabrics = mtm.map(o => db.fabrics.find(f => f.id === o.fabricId)).filter((f): f is Fabric => !!f);
  const colours = new Map<string, number>(); fabrics.forEach(f => { const c = f.name.includes(' - ') ? f.name.split(' - ').pop()! : f.family; colours.set(c, (colours.get(c) ?? 0) + 1); });
  const families = new Map<string, number>(); fabrics.forEach(f => families.set(f.family, (families.get(f.family) ?? 0) + 1));
  const returns = db.returns.filter(r => os.some(o => o.styleName === r.styleName && o.storeId === r.storeId));
  const spend = os.reduce((a, o) => { if (o.kind === 'MTM') { const f = db.fabrics.find(x => x.id === o.fabricId); return a + (f?.mrp ?? 2990) * o.qty; } const opt = db.options.find(x => x.id === o.optionId); return a + (opt?.mrp ?? 0) * o.qty; }, 0);
  return { name, orders: os, mtm, rtw, homeStore, stores: [...byStore.keys()], first: os[os.length - 1]?.punchedOn ?? '', last: os[0]?.punchedOn ?? '',
    open: os.filter(o => !['delivered', 'cancelled'].includes(o.stage)), alterations: os.filter(o => o.kind === 'MTM' && (o.revisions?.length ?? 0) > 0), corrections: os.reduce((a, o) => a + (o.revisions?.length ?? 0), 0),
    lastSheet, picks, colours: [...colours.entries()].sort((a, b) => b[1] - a[1]), families: [...families.entries()].sort((a, b) => b[1] - a[1]), returns, spend,
    credit: creditBalanceOf(db, name), creditLedger: (db.creditLedger ?? []).filter(e => e.customer === name).sort((a, b) => b.at.localeCompare(a.at)) };
}

/* ---------- fit samples — the set a store must hold so a customer can try the fit ---------- */
export function fitSetOf(db: Db, storeId: string) {
  const mine = (db.fitSamples ?? []).filter(f => f.storeId === storeId);
  const cells = FIT_SAMPLE_FITS.flatMap(fit => FIT_SAMPLE_SIZES.map(size => {
    const f = mine.filter(x => x.fit === fit && x.size === size).sort((a, b) => b.dispatchedOn.localeCompare(a.dispatchedOn))[0] ?? null;
    const state: 'missing' | 'in transit' | 'ok' | 'worn' | 'gone' = !f ? 'missing' : !f.receivedOn ? 'in transit' : f.state === 'ok' ? 'ok' : f.state === 'worn' ? 'worn' : 'gone';
    return { fit, size, f, state };
  }));
  const ok = cells.filter(c => c.state === 'ok').length;
  return { cells, ok, total: cells.length, gaps: cells.filter(c => c.state === 'missing' || c.state === 'gone' || c.state === 'worn'), inTransit: cells.filter(c => c.state === 'in transit').length, complete: ok === cells.length };
}
export function fitMatrix(db: Db) {
  const rows = STORES.map(st => ({ st, set: fitSetOf(db, st.id) }));
  return { rows, complete: rows.filter(r => r.set.complete).length, gaps: rows.reduce((a, r) => a + r.set.gaps.length, 0) };
}

/* ---------- swatch books — every store × 3 kinds --------------------------------- */
export function swatchMatrix(db: Db) {
  const books = db.swatchBooks ?? [];
  const cell = (storeId: string, kind: string) => {
    const b = books.filter(x => x.storeId === storeId && x.kind === kind && x.edition === BOOK_EDITION).sort((a, c) => c.dispatchedOn.localeCompare(a.dispatchedOn))[0];
    const state: 'missing' | 'sent' | 'overdue' | 'received' = !b ? 'missing' : b.receivedOn ? 'received' : daysAgo(b.dispatchedOn) > BOOK_CONFIRM_DAYS ? 'overdue' : 'sent';
    return { b, state };
  };
  const rows = STORES.map(st => ({ st, cells: Object.fromEntries(SWATCH_KINDS.map(k => [k, cell(st.id, k)])) as Record<string, ReturnType<typeof cell>> }));
  const count = (state: string) => rows.reduce((a, r) => a + SWATCH_KINDS.filter(k => r.cells[k].state === state).length, 0);
  return { rows, missing: count('missing'), sent: count('sent'), overdue: count('overdue'), received: count('received'), complete: rows.filter(r => SWATCH_KINDS.every(k => r.cells[k].state === 'received')).length };
}

/* ---------- outbound — everything leaving the production unit, by destination -- */
export function outboundOf(db: Db) {
  const pq = prepQueue(db);
  const extra = (db.extraFabric ?? []).filter(r => r.status === 'approved');
  const toFactories = db.vendors.filter(v => v.mtm).map(v => {
    const bundles = [...pq.byPlan.entries()].filter(([, os]) => os[0]?.factoryId === v.id).map(([pid, os]) => { const pl = (db.plans ?? []).find(p => p.id === pid);
      return { planId: pid, planNo: pl?.planNo ?? pid, createdOn: pl?.createdOn ?? os[0]?.punchedOn ?? '', forcedOver: pl?.forcedOver ?? null,
        pcs: os.length, fabrics: new Set(os.map(o => o.fabricId)).size, urgent: os.filter(o => o.tag === 'urgent').length,
        due: os.map(o => o.promisedOn).sort()[0] ?? '', metres: Math.round(os.reduce((a, o) => a + (o.consumptionM ?? 0), 0) * 10) / 10 }; })
      .sort((a, b) => a.createdOn.localeCompare(b.createdOn));
    const fabric = extra.filter(r => r.factoryId === v.id);
    return { v, bundles, fabric, pcs: bundles.reduce((a, b) => a + b.pcs, 0), metres: Math.round((bundles.reduce((a, b) => a + b.metres, 0) + fabric.reduce((a, r) => a + r.metres, 0)) * 10) / 10 };
  }).filter(x => x.bundles.length || x.fabric.length);
  const co = db.customerOrders ?? [];
  const sm = swatchMatrix(db);
  const toStores = STORES.map(st => {
    const mtmReady = co.filter(o => o.storeId === st.id && o.kind === 'MTM' && o.stage === 'rts');                         // finished shirts back at the unit, going to the store
    const rtw = co.filter(o => o.storeId === st.id && o.kind === 'RTW' && o.stage === 'punched' && fulfilFromOf(db, o) === 'hub');
    const books = SWATCH_KINDS.filter(k => k !== 'BESPOKE' && sm.rows.find(r => r.st.id === st.id)?.cells[k].state === 'missing');
    const launchPieces = (db.launches ?? []).flatMap(l => l.pieces.filter(p => p.storeId === st.id && !p.dispatchedOn).map(p => ({ l, p })));
    const transfers = db.transfers.filter(t => t.toStoreId === st.id && !t.shippedOn);
    const total = mtmReady.length + rtw.length + books.length + launchPieces.length + transfers.length;
    return { st, mtmReady, rtw, books, launchPieces, transfers, total };
  }).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  /* RTW bulk materials checked at the unit and not yet issued to the bulk factory */
  const rtwIssue = db.orders.filter(o => o.status === 'Open' && o.vendorId).map(o => { const m = materialsOf(o); const ready = m.lines.filter(l => l.checked === 'ok' && !l.issuedOn); return { o, ready, sample: sampleStatusOf(o) }; }).filter(x => x.ready.length > 0);
  return { toFactories, toStores, rtwIssue, totals: { factoryPcs: toFactories.reduce((a, f) => a + f.pcs, 0), factoryMetres: Math.round(toFactories.reduce((a, f) => a + f.metres, 0) * 10) / 10, storeItems: toStores.reduce((a, s) => a + s.total, 0), stores: toStores.length } };
}

/* ---------- aging — Vishnu's daily pivot, as a report that builds itself ------ */
export function agingReport(db: Db) {
  const open = mtmOrders(db).filter(o => MTM_OPEN.has(o.stage) || o.stage === 'punched');
  const stages = ['punched', 'pp', 'planned', 'in-transit', 'in-factory', 'out-factory', 'rts'] as const;
  const factories = db.vendors.filter(v => v.mtm);
  const today = iso(TODAY).slice(0, 10);
  /* factory × stage */
  const byFactory = factories.map(v => { const mine = open.filter(o => o.factoryId === v.id); const row: Record<string, number> = {}; stages.forEach(st => (row[st] = mine.filter(o => o.stage === st).length)); return { v, row, total: mine.length, overdue: mine.filter(o => daysAgo(o.promisedOn) > 0).length }; });
  const unallocated = open.filter(o => !o.factoryId);
  /* in-factory age buckets per factory */
  const AGE = [[0, 2], [3, 5], [6, 8], [9, 999]] as const;
  const ageByFactory = factories.map(v => { const wip = open.filter(o => o.factoryId === v.id && o.stage === 'in-factory'); const b = AGE.map(([lo, hi]) => wip.filter(o => { const inAt = o.scans.find(sc => sc.stage === 'in-factory')?.at; const d = inAt ? daysAgo(inAt) : 0; return d >= lo && d <= hi; }).length); return { v, buckets: b, wip: wip.length, oldest: wip.reduce((m, o) => { const inAt = o.scans.find(sc => sc.stage === 'in-factory')?.at; return Math.max(m, inAt ? daysAgo(inAt) : 0); }, 0) }; });
  /* pending by ship-by date × factory: what should have gone / goes on which day */
  const dates = [...new Set(open.map(o => o.promisedOn.slice(0, 10)))].sort();
  const byDate = dates.map(d => ({ date: d, late: d < today, isToday: d === today, cells: factories.map(v => open.filter(o => o.factoryId === v.id && o.promisedOn.slice(0, 10) === d).length), unalloc: open.filter(o => !o.factoryId && o.promisedOn.slice(0, 10) === d).length, total: open.filter(o => o.promisedOn.slice(0, 10) === d).length }));
  const overdue = open.filter(o => daysAgo(o.promisedOn) > 0);
  return { open, stages, factories, byFactory, unallocated, ageByFactory, AGE, byDate, overdue, dueToday: open.filter(o => o.promisedOn.slice(0, 10) === today) };
}


/* ---------- order-sheet changes — who may change what, and when --------------- */
export type SheetEdit = 'free' | 'remarks' | 'amend' | 'closed';
/** free  = nothing physical has happened; the sheet is simply corrected.
    amend = the bundle has gone; an accepted change reissues the sheet to the factory.
    closed= the piece is made; it is an alteration / remake now. */
/** Who may change what, and when. The store edits the sheet only until a factory
    is allocated; after that it can add a remark, and production carries the
    single-field amend that re-issues the sheet. */
export const sheetEditMode = (o: CustomerOrder, who: 'store' | 'unit' = 'unit'): SheetEdit => {
  if (who === 'store') return SHEET_STORE_EDIT.has(o.stage) && !o.factoryId ? 'free'
    : SHEET_FREE_EDIT.has(o.stage) || SHEET_AMEND.has(o.stage) ? 'remarks' : 'closed';
  return SHEET_FREE_EDIT.has(o.stage) ? 'free' : SHEET_AMEND.has(o.stage) ? 'amend' : 'closed';
};
/** A sheet change nobody has acted on — before allocation it is production's own
    to read; after it, production has to ring the factory that is holding it. */
/** The factory's own view of the same thing: a piece on my floor whose sheet
    changed after it left the unit, that nobody here has read yet. */
export const factoryUnread = (o: CustomerOrder): boolean => {
  const last = (o.revisions ?? [])[(o.revisions ?? []).length - 1];
  if (!last || o.kind !== 'MTM' || !o.factoryId || ['delivered', 'cancelled'].includes(o.stage)) return false;
  return !o.changeFactorySeenOn || o.changeFactorySeenOn < last.at;
};
export const changePendingOf = (o: CustomerOrder): 'me' | 'others' | null => {
  const last = (o.revisions ?? [])[(o.revisions ?? []).length - 1];
  if (!last || o.kind !== 'MTM' || ['delivered', 'cancelled'].includes(o.stage)) return null;
  const allocated = !!o.factoryId;
  if (!allocated) return o.changeSeenOn && o.changeSeenOn >= last.at ? null : 'me';
  return o.changeToldFactoryOn && o.changeToldFactoryOn >= last.at ? null : 'others';
};
export const lastRevision = (o: CustomerOrder) => (o.revisions ?? [])[(o.revisions ?? []).length - 1];
export const sheetRev = (o: CustomerOrder) => (o.revisions ?? []).length + 1;
/** an amended sheet the factory has not been re-issued with yet */
export const needsReprint = (o: CustomerOrder) => (o.revisions ?? []).some(r => r.reprint);
export const reallocationRisk = (o: CustomerOrder) => { const r = lastRevision(o); return !!r && !!o.planId && r.changes.some(c => REALLOCATING_FIELDS.has(c.field)); };

/* worklist: amended sheets the floor has to be told about, and re-allocation calls */
export function sheetAlerts(db: Db) {
  const all = mtmOrders(db);
  return { reprint: all.filter(o => needsReprint(o)), realloc: all.filter(o => o.stage === 'planned' && reallocationRisk(o)) };
}

/* ---------- sourcing: the fabric is quoted, the factory is allocated ---------- */
/** Rank fabric quotes: anything that lands after the fabric is needed drops to the
    bottom, then a minimum order well over what we need, then price per metre. */
export function recommendFabric(o: ProductionOrder, quotes: FabricQuote[]): string | null {
  if (!quotes.length) return null;
  const need = o.costing.consumption != null ? Math.ceil(o.costing.consumption * o.orderQty) : null;
  const fabricBy = addDays(o.targetInhouse, -35);   // fabric has to be at the unit well before inhouse
  const score = (q: FabricQuote) => {
    let s = 0;
    if (new Date(q.committedDelivery) > fabricBy) s += 1000;
    if (need != null && q.moq > need * 1.5) s += 400;           // forces a big over-buy
    return s + q.cpm;
  };
  return [...quotes].sort((a, b) => score(a) - score(b))[0].id;
}
export const fabricNeededBy = (o: ProductionOrder) => iso(addDays(o.targetInhouse, -35));

/* "formerly Cotton Poplin - White (until 21 Aug 26)" — one line that keeps an
   analytics row honest after a rename. Empty when the name never changed. */
export const formerNames = (f: Pick<Fabric, 'nameHistory'>) => (f.nameHistory ?? []).map(h => `${h.name} (until ${fmtDate(h.until)})`).join(' · ');
/* the name a fabric carried on a given day — for reading old rows against the current label */
export const fabricNameOn = (f: Pick<Fabric, 'name' | 'nameHistory'>, isoDate: string) => (f.nameHistory ?? []).find(h => h.until > isoDate)?.name ?? f.name;

/* ---------- the design desk: one straight line from idea to live -----------------
   Design does not think in eleven gates across two record types. It thinks:
   I asked → it was sampled → sourcing brought vendors → I chose and raised the
   PO → the cloth came in → I put it live. Six steps, the same six for a new
   MTM concept and a new RTW style, each step owned by exactly one team. */
export type DesignStepKey = 'request' | 'sampling' | 'vendors' | 'po' | 'fabric-in' | 'live';
export interface DesignStep { key: DesignStepKey; label: string; state: 'done' | 'now' | 'later'; owner: RoleId; note: string; action?: string }
export type DesignItem = { kind: 'concept'; c: Concept } | { kind: 'order'; o: ProductionOrder };

export function designFlowOf(db: Db, item: DesignItem): { steps: DesignStep[]; now: DesignStep; name: string; raisedOn: string; liveBy: string | null; targetCost: number | null; id: string; mtmStage?: 1 | 2 | 3 | 4 | 5 } {
  const mk = (key: DesignStepKey, label: string, done: boolean, owner: RoleId, note: string, action?: string): DesignStep => ({ key, label, state: done ? 'done' : 'later', owner, note, action });
  let steps: DesignStep[]; let name: string; let raisedOn: string; let liveBy: string | null; let targetCost: number | null; let id: string;
  /* where an MTM fabric stands — the state it is IN, not the step that comes next */
  let mtmStage: 1 | 2 | 3 | 4 | 5 | undefined;

  if (item.kind === 'concept') {
    const c = item.c; const s = conceptOf(db, c); const nf = c.kind === 'new-fabric';
    const sampled = s.ship.state === 'approved';
    const chosen = !!s.fabric && (!nf || s.fabric.cpm != null);
    const poDone = !nf || !!c.fabricPo;
    /* the cloth has landed when a GRN names this fabric after the PO went out */
    const grn = nf && c.fabricPo && s.fabric ? (db.grns ?? []).find(g => g.kind === 'fabric' && g.receivedOn >= c.fabricPo!.on && (g.ref === s.fabric!.code || g.refLabel === s.fabric!.name)) : null;
    const fabricIn = !nf || !!grn || (!!s.fabric && s.fabric.stockMetres > 0 && !!c.fabricPo);
    const offers = s.offers;
    /* the MTM fabric's five stages, as design reads them: requirement → a vendor
       against it (PO pending) → PO punched → fabric in, design codes and Enigma →
       go live online. Samples are optional and sit inside the requirement. */
    const offersIn = offers.length > 0 || !!c.optionsSentOn;
    const designsDone = (c.designs?.length ?? 0) > 0 && (c.designs ?? []).every(d => !!d.enigmaOn) && !!c.enigma.configuredOn;
    const onlineGates = [c.online?.photosOn, c.online?.videoOn, c.online?.postOn].filter(Boolean).length;
    steps = [
      mk('request', 'Requirement', true, 'design', `${c.raisedBy} · ${fmtDate(c.raisedOn)}${c.targetMonth ? ` · wanted by ${c.targetMonth}` : ''}${sampled ? ' · samples approved' : c.patSentOn ? ' · sample with the factory' : ''}`),
      mk('vendors', 'Vendor added · PO pending', !nf || offersIn || chosen, s.offersWithDesign ? 'design' : 'sourcing',
        !nf ? 'construction variant — made on an inventory fabric, nothing to buy' : chosen ? `${s.fabric!.name} · ${db.vendors.find(v => v.id === s.fabric!.vendorId)?.name} · ₹${s.fabric!.cpm}/m` : offersIn ? `${offers.length} vendor${offers.length === 1 ? '' : 's'} on the table · design to push the PO` : 'sourcing to put a vendor against it',
        !nf ? undefined : s.offersWithDesign ? 'Push the PO, ask for time, or drop the vendor' : offersIn ? undefined : 'Put a vendor against it'),
      mk('po', 'PO punched', poDone, 'design', !nf ? 'not needed' : c.fabricPo ? `${c.fabricPo.metres} m · ${fmtDate(c.fabricPo.on)}${s.fabric?.cpm ? ` · ${fmtMoney(c.fabricPo.metres * s.fabric.cpm)}` : ''}${s.fabric ? ` · ${s.fabric.code}` : ''}` : 'not punched yet', !nf || c.fabricPo ? undefined : 'Push the PO'),
      mk('fabric-in', 'Fabric in · design codes', fabricIn && designsDone, fabricIn ? 'design' : 'sourcing',
        !nf ? (designsDone ? 'designs in Enigma' : 'add the designs and configure Enigma') : !fabricIn ? (c.fabricPo ? 'sourcing is chasing the mill; the warehouse books the metres in' : 'after the PO') : grn ? `received ${fmtDate(grn.receivedOn)} · ${grn.qty} m${designsDone ? ' · designs in Enigma' : ` · ${(c.designs?.length ?? 0)} design${(c.designs?.length ?? 0) === 1 ? '' : 's'}, ${c.enigma.configuredOn ? 'Enigma configured' : 'Enigma not configured'}`}` : `on the shelf${designsDone ? ' · designs in Enigma' : ' · design codes pending'}`,
        fabricIn && !designsDone ? 'Add the designs, push them to Enigma, set consumption' : undefined),
      mk('live', 'Go live online', !!c.online?.liveOn, 'design', c.online?.liveOn ? `online ${fmtDate(c.online.liveOn)}${c.liveOn ? ` · stores ${fmtDate(c.liveOn)}` : ''}` : `${onlineGates} of 3 · photos, video, post${c.liveOn ? ` · stores ${fmtDate(c.liveOn)}` : ''}`, onlineGates === 3 ? 'Go live online' : 'Mark photos, video and post as they land'),
    ];
    mtmStage = c.online?.liveOn ? 5 : (fabricIn && nf && !!c.fabricPo) || (!nf && designsDone) ? (designsDone ? 5 : 4) : poDone && nf ? 3 : offersIn || chosen ? 2 : 1;
    name = c.naming.newName ?? c.name; raisedOn = c.raisedOn; liveBy = c.targetMonth ?? null; targetCost = c.naming.mrp ?? null; id = c.id;
  } else {
    const o = item.o; const ss = sourcingStateOf(o); void ss;
    const fst = factoryStateOf(o); const fab = fabricStateOf(o);
    const sample = sampleStatusOf(o);
    const sampled = sample.state === 'approved';
    const chosen = !!o.fabricQuotes.find(q => q.selected);
    const poDone = !o.fabricNominated || !!o.sourcing?.fabricPo;
    const fabricLine = (o.materials ?? []).find(m => o.bom[m.bomIndex]?.kind === 'fabric');
    const fabricIn = !o.fabricNominated || o.fabricReady || !!fabricLine?.receivedOn;
    const launch = (db.launches ?? []).find(l => l.orderId === o.id) ?? null;
    /* on an MTM concept the sample is made off the vendor swatch, so it comes
       before the cloth is chosen; on an RTW style the factory samples the bulk
       cloth, so sampling follows the fabric. Same six steps, honest order. */
    const samplingStep = mk('sampling', 'Sampling', sampled, sample.state === 'with production unit' ? 'design' : 'production',
        sampled ? `PP go-ahead on round ${sample.last?.round}` : sample.state === 'not started' ? (o.vendorId ? 'waiting for the factory’s first sample' : 'once a factory is making it') : `round ${sample.last?.round} · ${sample.state}`,
        sample.state === 'with production unit' ? 'Review the sample on your desk' : undefined);
    steps = [
      mk('request', 'Request', o.status !== 'Requirement', o.status === 'Requirement' && protoStatusOf(o).state === 'not started' && !o.proto ? 'design' : 'design', o.status === 'Requirement' ? (() => { const r = sendReadinessOf(db, o); return r.ready ? 'proto approved, tech pack on, cloth briefed — send it to production' : r.blockers.join(' · '); })() : `sent ${fmtDate(o.styleHandover)} · ${o.orderQty} pcs · in-house by ${fmtDate(o.targetInhouse)}${o.proto?.skipped ? ' · no prototype' : o.proto?.rounds.length ? ` · prototype round ${protoStatusOf(o).approved?.round}` : ''}`, o.status === 'Requirement' ? (sendReadinessOf(db, o).ready ? 'Send it to production' : sendReadinessOf(db, o).proto.state === 'with design' ? 'Review the prototype' : 'Prototype, BOM and tech pack first') : undefined),
      mk('vendors', 'Factory', fst.key === 'po-raised' || fst.key === 'accepted' || (sourcingModeOf(o) === 'fob-nominated' && !!o.fobNomination?.emailedOn), sourcingModeOf(o) === 'fob-nominated' ? 'design' : fst.owner,
        sourcingModeOf(o) === 'fob-nominated' ? (o.fobNomination?.emailedOn ? `FOB · vendor buys from ${db.vendors.find(v => v.id === o.fobNomination?.supplierVendorId)?.name ?? 'the nominated supplier'} · emailed ${fmtDate(o.fobNomination.emailedOn)}` : 'FOB · name the supplier and email the vendor')
          : fst.accepted ? `${db.vendors.find(v => v.id === fst.accepted!.vendorId)?.name} · ₹${fst.accepted.quotedCost}/pc · in-house ${fmtDate(fst.accepted.estimatedInhouse)}` : fst.last ? `${db.vendors.find(v => v.id === fst.last!.vendorId)?.name} proposed at ₹${fst.last.quotedCost}/pc · ${fst.label}` : fst.label,
        fst.key === 'with-design' ? 'Accept the factory, or send it back with a comment' : fst.key === 'to-propose' || fst.key === 'rejected' ? 'Propose a factory, cost and date' : undefined),
      mk('po', 'PO to factory', !!o.poNo || sourcingModeOf(o) === 'fob-nominated' && !!o.fobNomination?.emailedOn, 'design', o.poNo ? `${o.poNo} · ${fmtDate(o.poDate)} · ${o.factoryPo?.docsMissing?.length ? `owed: ${o.factoryPo.docsMissing.join(', ')}` : 'documents went with it'}` : fst.key === 'accepted' ? 'factory accepted — raise the PO' : 'after the factory is accepted', fst.key === 'accepted' ? 'Raise the PO to the factory' : undefined),
      mk('fabric-in', 'Fabric at factory', fab.key === 'received' || fab.key === 'vendor-sources', fab.owner, fab.label, fab.key === 'ratio-asked' ? 'Give the new cut ratio' : undefined),
      samplingStep,
      /* no launch record yet means planning has not put it in a drop — that is
         their step, not design's; design's turn comes once it is at HO */
      mk('live', 'Go live', !!launch?.launchedOn, launch ? 'design' : 'planning', launch?.launchedOn ? `launched ${fmtDate(launch.launchedOn)}` : launch ? `${launch.dropMonth} drop${launch.designCode ? ` · ${launch.designCode}` : launch.receivedAtHo ? ' · design code to mint' : ''}${launch.marketingName ? ` · "${launch.marketingName}"` : ' · no marketing name yet'}${launch.launchOn ? ` · planned ${fmtDate(launch.launchOn)}` : ''}` : 'planning adds it to a drop once it is in production', launch && !launch.launchedOn && launch.receivedAtHo ? 'Name it, brief the stores, launch' : undefined),
    ];
    name = o.styleName; raisedOn = o.styleHandover; liveBy = launch?.launchOn ?? o.targetInhouse; targetCost = o.targetCost; id = o.id;
  }
  /* the first step not done is "now"; everything after stays "later" */
  const i = steps.findIndex(s => s.state !== 'done');
  if (i >= 0) steps[i].state = 'now';
  const now = steps[i >= 0 ? i : steps.length - 1];
  return { steps, now, name, raisedOn, liveBy, targetCost, id, mtmStage };
}

/* ---------- RTW before sourcing: proto · BOM & tech pack · shortlist ----------------
   What has to be true before design's "Send it to sourcing" goes through. */
export function protoStatusOf(o: ProductionOrder) {
  const rounds = o.proto?.rounds ?? []; const last = rounds[rounds.length - 1];
  const approved = rounds.find(r => r.decision === 'approved') ?? null;
  const state: 'not started' | 'with design' | 'redo' | 'approved' | 'skipped' = o.proto?.skipped ? 'skipped' : approved ? 'approved' : !last ? 'not started' : last.decision === 'pending' ? 'with design' : 'redo';
  return { rounds, last, approved, state, ok: state === 'approved' || state === 'skipped' };
}
export function sendReadinessOf(db: Db, o: ProductionOrder) {
  const mode = sourcingModeOf(o);
  const proto = protoStatusOf(o);
  const techPack = (db.attachments ?? []).some(a => a.kind === 'order' && a.subjectId === o.id && a.label === 'Tech pack');
  const fabricLine = o.fabricNominated ? !!(o.fabricShortlist?.length || o.fabricBrief) : true;
  const blockers: string[] = [];
  if (!proto.ok) blockers.push(proto.state === 'with design' ? 'prototype on your desk — approve it' : proto.state === 'redo' ? 'prototype sent back — the unit owes another' : 'no prototype yet — log one, or mark none needed');
  if (!techPack) blockers.push('tech pack not attached');
  if (!fabricLine) blockers.push(mode === 'bsc-buys' ? 'no fabric line — one cloth, or a shortlist' : 'no fabric line');
  return { proto, techPack, fabricLine, blockers, ready: blockers.length === 0 };
}
/* after the fabric PO: every trim and packaging line on the shelf or on a dated order */
export function materialsCoverOf(db: Db, o: ProductionOrder) {
  const lines = o.bom.map((l, i) => ({ l, i })).filter(x => x.l.kind !== 'fabric').map(({ l, i }) => {
    const t = trimFor(db, l.item); const needed = Math.ceil((l.qtyPerPc ?? 1) * o.orderQty);
    const onHand = t?.stock ?? 0; const incoming = t?.incoming ?? 0;
    return { bomIndex: i, item: l.item, unit: l.unit, needed, onHand, incoming, trim: t, short: Math.max(0, needed - onHand - incoming), shortOfShelf: Math.max(0, needed - onHand) };
  });
  const short = lines.filter(x => x.short > 0);
  return { lines, short, allCovered: lines.length > 0 && short.length === 0, signedOff: !!o.materialsCovered };
}

/* ---------- the RTW loop, read off the record (Nitin, 3 Oct 2026) -------------------
   Four accordions on the tracker: the request from design, the factory finalisation,
   the fabric finalisation, the TNA. Each says its status, who is next, and what is missing. */
export const RTW_DOCS = ['Tech pack', 'Job card', 'Trim card'] as const;
export function rtwDocsOf(db: Db, o: ProductionOrder) {
  const have = (label: string) => (db.attachments ?? []).some(a => a.kind === 'order' && a.subjectId === o.id && a.label === label);
  /* the BOM is built on the record from the trims master; the trim card is its trim lines. Only the tech pack and job card are still files. */
  const trimCard = o.bom.some(l => l.kind === 'trim' && l.item.trim());
  const missing = RTW_DOCS.filter(d => !have(d) && !(d === 'Trim card' && trimCard)) as string[]; if (!o.bom.length) missing.push('BOM');
  const satisfied = (d: string) => have(d) || (d === 'BOM' && o.bom.length > 0) || (d === 'Trim card' && trimCard);
  return { missing, complete: missing.length === 0, sent: o.factoryPo?.docsSent ?? [], owedAfterPo: (o.factoryPo?.docsMissing ?? []).filter(d => !satisfied(d)) };
}
export function factoryStateOf(o: ProductionOrder) {
  const ps = o.factoryProposals ?? []; const last = ps[ps.length - 1] ?? null; const accepted = [...ps].reverse().find(p => p.decision?.accepted) ?? null;
  if (o.poNo) return { key:'po-raised' as const, label:`PO raised · ${o.poNo}`, owner:'production' as RoleId, last, accepted, tone:'good' as const };
  if (accepted) return { key:'accepted' as const, label:'accepted by design · PO to raise', owner:'design' as RoleId, last, accepted, tone:'accent' as const };
  if (last && !last.decision) return { key:'with-design' as const, label:'proposal with design', owner:'design' as RoleId, last, accepted, tone:'info' as const };
  if (last && last.decision && !last.decision.accepted) return { key:'rejected' as const, label:'sent back by design', owner:'production' as RoleId, last, accepted, tone:'risk' as const };
  if (o.status === 'Requirement') return { key:'not-sent' as const, label:'design still drafting', owner:'design' as RoleId, last, accepted, tone:'neutral' as const };
  return { key:'to-propose' as const, label:'production to propose a factory', owner:'production' as RoleId, last, accepted, tone:'warn' as const };
}
export function fabricStateOf(o: ProductionOrder) {
  const fs = o.fabricSupply ?? null; const need = o.fabricMetres ?? null;
  const short = fs?.receipt && need != null ? Math.max(0, need - fs.receipt.metresOk) : 0;
  const cr = [...(o.cutRatios ?? [])].reverse()[0] ?? null;
  const mk = <K extends string>(key: K, label: string, owner: RoleId, tone: 'neutral' | 'info' | 'warn' | 'risk' | 'good') => ({ key, label, owner, tone, short, cr, need });
  if (!o.fabricNominated) return mk('vendor-sources', 'factory sources its own cloth', 'production', 'neutral');
  /* before the fabric PO — the same loop as an MTM fabric: one vendor, design pushes the PO */
  if (!o.sourcing?.fabricPo) {
    if (o.status === 'Requirement') return mk('drafting', 'design still drafting the request', 'design', 'neutral');
    const ss = sourcingStateOf(o);
    if (ss.key === 'extend') return mk('extension', 'design asked for more time · extend the hold', 'sourcing', 'risk');
    if (ss.key === 'choose' || ss.key === 'raise-po') return mk('with-design', `vendor with design · push the fabric PO${ss.holdDays != null ? (ss.holdDays < 0 ? ' · hold lapsed' : ` · hold ${ss.holdDays}d`) : ''}`, 'design', ss.holdDays != null && ss.holdDays <= 3 ? 'risk' : 'info');
    return mk('add-vendor', 'put a vendor against the cloth', 'sourcing', 'warn');
  }
  /* after the fabric PO — get the cloth to the factory and counted in */
  if (fs?.receipt) {
    if (cr && !cr.given) return mk('ratio-asked', cr.kind === 'cut-short' ? `short ${short} m · cut-short proposed — design to approve` : `short ${short} m · modified ratio asked of design`, 'design', 'risk');
    if (cr && cr.given && !cr.sentToFactoryOn) return mk('ratio-given', 'new cut ratio given · send it to the factory', 'production', 'warn');
    if (short > 0 && !cr) return mk('short', `received short by ${short} m`, 'production', 'risk');
    return mk('received', `received at the factory · ${fs.receipt.metresOk} m`, 'production', 'good');
  }
  if (fs?.sentToFactoryOn) return mk('sent', `sent to the factory · ${fs.metresSent ?? '—'} m · awaiting the factory's count`, 'merchandiser', 'info');
  if (!o.poNo) return mk('wait-factory', `fabric PO ${o.sourcing.fabricPo.no} raised · waiting for the factory PO`, 'production', 'neutral');
  return mk('bought', `fabric PO ${o.sourcing.fabricPo.no} raised · send it to the factory`, 'sourcing', 'warn');
}

/* ---------- the design ↔ sourcing handoff, read off the record ------------------
   One question per row: whose turn is it, and what are they meant to do. */
export function sourcingStateOf(o: ProductionOrder): { key: string; label: string; owner: RoleId; tone: 'neutral' | 'info' | 'warn' | 'risk' | 'good' | 'accent'; holdsUntil: string | null; holdDays: number | null } {
  /* once design has chosen, the only hold that matters is the chosen mill's;
     before that it is whichever option lapses first */
  const chosen = o.fabricQuotes.find(q => q.selected);
  const live = chosen ? [chosen] : o.fabricQuotes;
  const holds = live.map(q => q.blockValidUntil).filter(Boolean) as string[];
  const holdsUntil = holds.length ? [...holds].sort()[0] : null;
  const holdDays = holdsUntil ? -daysAgo(holdsUntil) : null;
  const st = o.sourcing?.stage ?? 'vendors';
  if (!o.fabricNominated) return { key:'vendor-sources', label:'factory sources it', owner:'sourcing', tone:'neutral', holdsUntil, holdDays };
  if (o.status === 'Requirement') return { key:'handover', label:'design to hand over', owner:'design', tone:'neutral', holdsUntil, holdDays };
  /* "PO raised" must mean a PO exists — reading it off the status alone reported
     cloth on order for a requirement whose fabric PO had never been raised */
  if (st === 'po-raised') return { key:'po-raised', label:'fabric PO raised', owner:'sourcing', tone:'good', holdsUntil, holdDays };
  if (o.status === 'Open' || o.status === 'Closed') return { key: o.sourcing?.fabricPo ? 'po-raised' : 'raise-po', label: o.sourcing?.fabricPo ? 'fabric PO raised' : 'no fabric PO on record', owner:'sourcing', tone: o.sourcing?.fabricPo ? 'good' : 'risk', holdsUntil, holdDays };
  /* design raises the fabric PO — it is their budget and their shade; sourcing
     then goes and gets the cloth in against it */
  if (st === 'chosen') return { key:'raise-po', label:'design to push PO', owner:'design', tone:'accent', holdsUntil, holdDays };
  if (st === 'extension') return { key:'extend', label:'extension asked', owner:'sourcing', tone:'risk', holdsUntil, holdDays };
  if (st === 'design-choice') return { key:'choose', label:'design to push PO', owner:'design', tone: holdDays != null && holdDays <= 3 ? 'risk' : 'info', holdsUntil, holdDays };
  return { key:'vendors', label:'sourcing to add vendors', owner:'sourcing', tone:'warn', holdsUntil, holdDays };
}

/* Which mills could make what design asked for — read off the fabrics each mill
   already supplies. A mill that makes an oxford in 100% cotton is a candidate for
   an oxford brief; the match is words, not magic, and it says which fabric matched. */
export function suggestMills(db: Db, o: ProductionOrder) {
  const b = o.fabricBrief;
  /* the cloth words, not the colour words — a white poplin is no lead on an oxford */
  const NOISE = new Set(['shirt', 'the', 'and', 'with', 'half', 'sleeve', 'fit', 'classic', 'soft', 'smooth', 'rtw', 'cmt', 'white', 'black', 'navy', 'blue', 'ecru', 'grey', 'green', 'brown', 'pink', 'teal', 'olive', 'ochre', 'red', 'indigo', 'beige', 'cream', 'ivory', 'rust', 'sage', 'mustard', 'charcoal', 'lavender', '100%', 'cotton']);
  const words = [...new Set(`${b?.look ?? ''} ${b?.composition ?? ''} ${o.styleName}`.toLowerCase().split(/[^a-z0-9%]+/).filter(w => w.length > 2 && !NOISE.has(w)))];
  if (words.length === 0) words.push(...`${b?.composition ?? ''}`.toLowerCase().split(/[^a-z0-9%]+/).filter(w => w.length > 2));
  const mills = db.vendors.filter(v => v.kind.endsWith('mill'));
  const already = new Set(o.fabricQuotes.map(q => q.vendorId));
  return mills.map(v => {
    const st = vendorStatsOf(db, v.id);
    const scored = st.fabrics.map(f => { const hay = `${f.name} ${f.composition ?? ''} ${f.family}`.toLowerCase(); const hits = words.filter(w => hay.includes(w)); return { f, hits: hits.length }; })
      .filter(x => x.hits > 0).sort((a, b2) => b2.hits - a.hits);
    return { v, st, match: scored[0]?.f ?? null, hits: scored[0]?.hits ?? 0, breadth: scored.length, quoted: already.has(v.id) };
    /* gradeRank counts up from Poor:0, so the better mill is the HIGHER rank */
  }).sort((a, b2) => b2.hits - a.hits || b2.breadth - a.breadth || b2.st.gradeRank - a.st.gradeRank || a.v.leadDays - b2.v.leadDays);
}

/** What a factory is carrying right now — the RTW equivalent of the MTM load card. */
export function rtwFactoryLoad(db: Db, factoryId: string) {
  const v = db.vendors.find(x => x.id === factoryId);
  const open = db.orders.filter(o => o.vendorId === factoryId && o.status === 'Open');
  const closed = db.orders.filter(o => o.vendorId === factoryId && o.status === 'Closed');
  const units = open.reduce((a, o) => a + o.orderQty, 0);
  const atRisk = open.filter(o => ['at-risk', 'critical', 'delayed'].includes(riskOf(o).risk)).length;
  const leads = closed.map(o => { const last = o.milestones[o.milestones.length - 1]; return o.poDate && last?.actual ? daysBetween(o.poDate, last.actual) : null; }).filter((x): x is number => x != null);
  const measuredLead = leads.length ? Math.round(leads.reduce((a, b) => a + b, 0) / leads.length) : null;
  return { v, open, closed, units, atRisk, measuredLead, lead: measuredLead ?? v?.leadDays ?? 40, onTime: v?.onTimeRate ?? 0 };
}
/** Which factories could take this order and still make the date — least loaded first. */
export function factoryOptions(db: Db, o: ProductionOrder) {
  return db.vendors.filter(v => v.kind === 'CMT factory').map(v => {
    const l = rtwFactoryLoad(db, v.id);
    const daysToTarget = -daysAgo(o.targetInhouse);
    const fits = l.lead <= daysToTarget;
    const overMoq = o.orderQty < v.moq;
    return { ...l, v, fits, overMoq, daysToTarget, why: !fits ? `${l.lead}d lead against ${daysToTarget}d to target — cannot make it` : overMoq ? `MOQ ${v.moq} pcs, ${v.moq - o.orderQty} over plan` : l.atRisk >= 3 ? `${l.atRisk} of its open POs already at risk` : `${l.units} pcs in flight · ${Math.round(l.onTime * 100)}% on time` };
  }).sort((a, b) => Number(b.fits) - Number(a.fits) || a.atRisk - b.atRisk || a.units - b.units || b.onTime - a.onTime);
}

/* ---------- trims & packaging — bulk stock, drawn down per order ------------- */
export const trimFor = (db: Db, item: string | undefined) => (db.trims ?? []).find(t => t.name === item);
/** What open POs have claimed but not yet drawn: the shelf is not as full as it looks. */
export function trimCoverageOf(db: Db, t: TrimItem) {
  const committed = db.orders.filter(o => o.status === 'Open' || o.status === 'Allocated')
    .reduce((a, o) => a + (o.materials ?? []).filter(m => !m.issuedOn && o.bom[m.bomIndex]?.item === t.name).reduce((b, m) => b + m.requiredQty, 0), 0);
  const available = t.stock - committed;
  return { committed, available, incoming: t.incoming, belowThreshold: available + t.incoming <= t.threshold, weeksOfCover: null as number | null };
}
/** Can this order's trims actually be issued? */
export function trimShortfall(db: Db, o: ProductionOrder) {
  return (o.materials ?? []).filter(m => !m.issuedOn && o.bom[m.bomIndex]?.kind !== 'fabric').map(m => {
    const t = trimFor(db, o.bom[m.bomIndex]?.item);
    const short = t ? Math.max(0, m.requiredQty - t.stock) : m.requiredQty;
    return { m, t, short, item: o.bom[m.bomIndex]?.item ?? '' };
  }).filter(x => x.short > 0);
}

/* ---------- fabric POs — raised, confirmed by the mill, received -------------- */
export function openFabricPos(db: Db) { return (db.fabricPos ?? []).filter(p => !p.receivedOn); }
export function fabricPoStatus(p: { vendorConfirmedOn: string | null; expectedOn: string; raisedOn: string; receivedOn: string | null }) {
  if (p.receivedOn) return 'received' as const;
  if (!p.vendorConfirmedOn) return daysAgo(p.raisedOn) >= 2 ? 'unconfirmed · chase' as const : 'awaiting confirmation' as const;
  return daysAgo(p.expectedOn) > 0 ? 'confirmed · overdue' as const : 'confirmed' as const;
}

/* ---------- waiting on you — the conditions the tool already knows about -----
   Every rule below is one the tool computes anyway and then paints as a pill
   somewhere, waiting to be scrolled past. Collected here they become a list of
   what a person has to decide today, sorted by what it costs to ignore. Nothing
   is stored: turn a record around and its line disappears by itself. */
export type AlertLevel = 'critical' | 'warn' | 'info';
export interface Alert { id: string; role: RoleId; level: AlertLevel; title: string; detail: string; href: string; weight: number }

export function alertsFor(db: Db, role: RoleId, opts?: { storeId?: string; all?: boolean }): Alert[] {
  const out: Alert[] = [];
  const add = (a: Alert) => out.push(a);
  const want = (r: RoleId) => opts?.all || role === 'owner' || role === r;

  /* production — a purchase order eating its buffer */
  if (want('production')) db.orders.filter(o => o.status === 'Open').forEach(o => {
    const r = riskOf(o);
    if (r.risk === 'critical' || r.risk === 'delayed') add({ id:`po-${o.id}`, role:'production', level: r.risk === 'delayed' ? 'critical' : 'warn',
      title: `${o.poNo ?? 'PO'} · ${o.styleName}`,
      detail: r.bufferDays != null && r.bufferDays < 0 ? `${-r.bufferDays}d past the target inhouse date · ${o.orderQty} pcs` : `buffer down to ${r.bufferDays}d · ${o.orderQty} pcs`,
      href:`#/tracker?open=${o.id}`, weight: 1000 - (r.bufferDays ?? 0) });
  });

  /* sourcing — a block running out, and a mill nobody has asked this week */
  if (want('sourcing')) {
    db.blocks.filter(b => b.status === 'held').forEach(b => { const left = -daysAgo(b.expiresOn);
      if (left <= 21) add({ id:`blk-${b.id}`, role:'sourcing', level: left <= 7 ? 'critical' : 'warn',
        title: `${b.fabricName} · block ${left < 0 ? 'expired' : 'expiring'}`,
        detail: left < 0 ? `lapsed ${-left}d ago · ${b.metres} m released back to the mill` : `${left}d left · ${b.metres} m held`,
        href:'#/fabrics?tab=blocks', weight: 900 - left }); });
    db.fabrics.filter(f => f.bucket === 'CORE' && (!f.supply || daysAgo(f.supply.reviewedOn) >= 7)).sort((a, b) => (b.supply ? daysAgo(b.supply.reviewedOn) : 999) - (a.supply ? daysAgo(a.supply.reviewedOn) : 999)).slice(0, 8).forEach(f =>
      add({ id:`chk-${f.id}`, role:'sourcing', level:'info', title:`${f.name} · mill check due`,
        detail: f.supply ? `last asked ${daysAgo(f.supply.reviewedOn)}d ago` : 'never asked',
        href:'#/fabrics?tab=core', weight: 300 }));
  }

  /* the RTW loop: whose move it is on the factory, the PO, the fabric, the cut ratio */
  db.orders.filter(o => o.status !== 'Closed' && o.status !== 'Cancelled' && sourcingModeOf(o) !== 'fob-nominated').forEach(o => {
    const fst = factoryStateOf(o); const fab = fabricStateOf(o); const href = `#/tracker?open=${o.id}`;
    if (fst.key === 'with-design' && want('design')) add({ id:`fac-dec-${o.id}`, role:'design', level: daysAgo(fst.last!.proposedOn) >= 2 ? 'critical' : 'warn', title:`${o.styleName} · factory proposed`, detail:`${db.vendors.find(v => v.id === fst.last!.vendorId)?.name} at ₹${fst.last!.quotedCost}/pc (target ₹${o.targetCost}), in-house ${fmtDate(fst.last!.estimatedInhouse)} (target ${fmtDate(o.targetInhouse)}) — accept, or send back with a comment`, href:`#/requirements?open=${o.id}`, weight: 820 + daysAgo(fst.last!.proposedOn) });
    if (fst.key === 'accepted' && want('design')) add({ id:`fac-po-${o.id}`, role:'design', level:'warn', title:`${o.styleName} · raise the PO`, detail:`${db.vendors.find(v => v.id === fst.accepted!.vendorId)?.name} accepted at ₹${fst.accepted!.quotedCost}/pc — the factory waits on the PO`, href:`#/requirements?open=${o.id}`, weight: 800 });
    if ((fst.key === 'to-propose' || fst.key === 'rejected') && want('production')) add({ id:`fac-prop-${o.id}`, role:'production', level: fst.key === 'rejected' ? 'critical' : 'warn', title:`${o.styleName} · ${fst.key === 'rejected' ? 'design sent the factory back' : 'propose a factory'}`, detail: fst.key === 'rejected' ? (fst.last!.decision!.comment || 'no comment') + ' — change the factory or renegotiate' : `${o.orderQty} pcs · target ₹${o.targetCost}/pc · in-house by ${fmtDate(o.targetInhouse)}`, href, weight: fst.key === 'rejected' ? 880 : 700 });
    if (o.poNo && want('design')) { const d = rtwDocsOf(db, o); if (d.owedAfterPo.length) add({ id:`docs-${o.id}`, role:'design', level: daysAgo(o.factoryPo?.raisedOn ?? o.poDate!) >= 3 ? 'critical' : 'warn', title:`${o.styleName} · factory still owed ${d.owedAfterPo.join(', ')}`, detail:`PO raised ${fmtAgo(o.factoryPo?.raisedOn ?? o.poDate!)} — the factory cannot cut without them`, href:`#/requirements?open=${o.id}`, weight: 780 + daysAgo(o.poDate!) }); }
    if (fab.key === 'bought' && want('sourcing')) add({ id:`fab-sup-${o.id}`, role:'sourcing', level: daysAgo(o.poDate!) >= 5 ? 'critical' : 'warn', title:`${o.styleName} · send the cloth to ${db.vendors.find(v => v.id === o.vendorId)?.name ?? 'the factory'}`, detail:`factory PO ${o.poNo} raised ${fmtAgo(o.poDate!)} · ${o.fabricMetres ?? '—'} m on ${o.sourcing?.fabricPo?.no}`, href:`#/sourcing?side=rtw&open=${o.id}`, weight: 760 + daysAgo(o.poDate!) });
    if (fab.key === 'sent' && want('merchandiser')) add({ id:`fab-rcv-${o.id}`, role:'merchandiser', level:'warn', title:`${o.styleName} · confirm the fabric that landed`, detail:`${fab.need ?? '—'} m sent ${fmtAgo(o.fabricSupply!.sentToFactoryOn!)} — count it in, usable and damaged`, href:`#/factory?tab=rtw&open=${o.id}`, weight: 740 });
    if (fab.key === 'short' && want('production')) add({ id:`fab-short-${o.id}`, role:'production', level:'critical', title:`${o.styleName} · fabric short by ${fab.short} m`, detail:'ask design for a modified ratio, propose a cut-short, or get sourcing to top it up', href, weight: 860 });
    if (fab.key === 'short' && want('merchandiser')) add({ id:`fab-short-m-${o.id}`, role:'merchandiser', level:'warn', title:`${o.styleName} · cloth short by ${fab.short} m`, detail:'ask for a modified ratio, or propose what you can cut from the cloth that landed', href:`#/factory?side=rtw&open=${o.id}`, weight: 820 });
    if (fab.key === 'ratio-asked' && want('design')) add({ id:`ratio-${o.id}`, role:'design', level:'critical', title:`${o.styleName} · ${fab.cr!.kind === 'cut-short' ? `cut-short proposed · ${fab.cr!.proposedBreakup?.reduce((a, x) => a + x.qty, 0) ?? '—'} of ${fab.cr!.originalBreakup.reduce((a, x) => a + x.qty, 0)} pcs` : 'modified ratio needed'}`, detail:`${fab.cr!.reason} — the factory is waiting to cut`, href:`#/requirements?open=${o.id}`, weight: 900 });
    if (fab.key === 'ratio-given' && want('production')) add({ id:`ratio-send-${o.id}`, role:'production', level:'warn', title:`${o.styleName} · send the new cut ratio to the factory`, detail:`given by ${fab.cr!.given!.by} ${fmtAgo(fab.cr!.given!.on)}`, href, weight: 850 });
  });

  /* RTW before and after the cloth: the prototype gate, a shortlist to pick from, the trims to cover */
  db.orders.filter(o => o.status !== 'Closed' && o.status !== 'Cancelled').forEach(o => {
    if (o.status === 'Requirement') { const pr = protoStatusOf(o);
      if (pr.state === 'with design' && want('design')) add({ id:`proto-rev-${o.id}`, role:'design', level: daysAgo(pr.last!.submittedOn) >= 5 ? 'critical' : 'warn', title:`${o.styleName} · prototype on your desk`, detail:`round ${pr.last!.round} back ${fmtAgo(pr.last!.submittedOn)}${o.proto?.standIn ? ` · on ${o.proto.standIn}` : ''} — approve it or send it back`, href:`#/requirements?open=${o.id}`, weight: 700 + daysAgo(pr.last!.submittedOn) });
      if ((pr.state === 'not started' || pr.state === 'redo') && want('production')) add({ id:`proto-owe-${o.id}`, role:'production', level:'info', title:`${o.styleName} · prototype ${pr.state === 'redo' ? 'to redo' : 'to make'}`, detail: pr.state === 'redo' ? `round ${pr.last!.round} sent back — ${pr.last!.comments.filter(c => c.major).length} major comment(s)` : 'on whatever shirt fabric is to hand — design approves before any cloth is sourced', href:`#/tracker?open=${o.id}`, weight: 300 }); }
    if (o.status === 'Quoting' && (o.fabricShortlist?.length ?? 0) > 1 && !o.fabricPick && want('sourcing')) add({ id:`pick-${o.id}`, role:'sourcing', level:'warn', title:`${o.styleName} · pick one cloth from ${o.fabricShortlist!.length}`, detail:'design sent a shortlist — finalise internally, pick one, then add its vendor', href:`#/sourcing?side=rtw&open=${o.id}`, weight: 650 });
    if (o.sourcing?.fabricPo && !o.materialsCovered && o.status !== 'Closed' && o.status !== 'Cancelled' && want('sourcing')) { const mc = materialsCoverOf(db, o); add({ id:`mat-${o.id}`, role:'sourcing', level: mc.short.length ? 'warn' : 'info', title:`${o.styleName} · other BOM items`, detail: mc.short.length ? `${mc.short.length} line(s) short at the unit: ${mc.short.slice(0, 3).map(x => x.item).join(', ')} — raise the bulk orders` : 'every trim line is on the shelf — sign it off', href:`#/sourcing?side=rtw&open=${o.id}`, weight: 500 + mc.short.length * 20 }); }
  });

  /* the fabric handoff — whose turn it is, and a hold about to lapse */
  db.orders.filter(o => o.fabricNominated && (o.status === 'Quoting' || o.status === 'Allocated')).forEach(o => { const ss = sourcingStateOf(o);
    if (ss.key === 'choose' && want('design')) add({ id:`fab-choose-${o.id}`, role:'design', level: ss.holdDays != null && ss.holdDays <= 3 ? 'critical' : 'warn',
      title: `${o.styleName} · ${o.fabricQuotes.length} fabric option${o.fabricQuotes.length === 1 ? '' : 's'} to choose from`,
      detail: ss.holdDays == null ? `sourcing submitted ${o.sourcing.submittedOn ? daysAgo(o.sourcing.submittedOn) : 0}d ago` : ss.holdDays < 0 ? `the mill's hold lapsed ${-ss.holdDays}d ago — ask sourcing to extend` : `the first hold lapses in ${ss.holdDays}d`,
      href:`#/design?open=${o.id}`, weight: 800 - (ss.holdDays ?? 30) });
    if (ss.key === 'extend' && want('sourcing')) add({ id:`fab-extend-${o.id}`, role:'sourcing', level:'critical',
      title: `${o.styleName} · design asked for an extension`, detail: o.sourcing.extension?.note || 'go back to the mills and extend the hold',
      href:`#/sourcing?side=rtw&open=${o.id}`, weight: 850 });
    if (ss.key === 'vendors' && want('sourcing') && daysAgo(o.styleHandover) >= 3) add({ id:`fab-vendors-${o.id}`, role:'sourcing', level:'warn',
      title: `${o.styleName} · ${o.fabricQuotes.length ? 'options not yet sent to design' : 'no vendor asked yet'}`, detail: `handed over ${daysAgo(o.styleHandover)}d ago · fabric needed by ${fmtDate(fabricNeededBy(o))}`,
      href:`#/sourcing?side=rtw&open=${o.id}`, weight: 500 + daysAgo(o.styleHandover) });
    if (ss.key === 'raise-po' && want('design')) add({ id:`fab-po-${o.id}`, role:'design', level:'warn',
      title: `${o.styleName} · design to push PO`, detail: `${o.fabricMetres ?? '—'} m from ${db.vendors.find(v => v.id === o.fabricVendorId)?.name ?? 'the mill'}`,
      href:`#/design?open=${o.id}`, weight: 700 });
  });

  /* the swatch desk — cloth landed, stores not yet showing it */
  (db.concepts ?? []).filter(c => c.kind === 'new-fabric' && !c.liveOn && (c.swatch || c.fabricPo)).forEach(c => {
    const sw = c.swatch; const href = `#/swatches?open=${c.id}`;
    if (sw?.stickerOn && c.naming.setOn && c.naming.setOn > sw.stickerOn && want('warehouse')) add({ id:`sw-reprint-${c.id}`, role:'warehouse', level:'warn', title:`${c.naming.newName ?? c.name} · sticker out of date`, detail:`name or MRP changed ${fmtDate(c.naming.setOn)}, after the sticker was printed ${fmtDate(sw.stickerOn)} — reprint and tell the stores`, href, weight: 540 });
    if (sw?.priority && !sw.cutOn && want('warehouse')) add({ id:`sw-cut-${c.id}`, role:'warehouse', level:'warn', title:`${c.name} · priority swatch not cut`, detail: sw.handoverOn ? `with the swatch team since ${fmtDate(sw.handoverOn)}` : sw.inwardOn ? `inwarded ${fmtDate(sw.inwardOn)} · not yet handed over` : 'marked priority', href, weight: 560 });
    else if (sw?.inwardOn && !sw.handoverOn && daysAgo(sw.inwardOn) >= 2 && want('warehouse')) add({ id:`sw-ho-${c.id}`, role:'warehouse', level:'warn', title:`${c.name} · cloth in ${daysAgo(sw.inwardOn)}d, not with the swatch team`, detail:'hand it over so the 25 × 25s can be cut', href, weight: 520 });
    if (sw?.dispatchedOn && !sw.storesToldOn && want('design')) add({ id:`sw-tell-${c.id}`, role:'design', level:'warn', title:`${c.name} · swatches out, stores not told`, detail:`dispatched ${fmtDate(sw.dispatchedOn)}${sw.photosOn ? ' · photos shared' : ''} — tell the stores and set it live`, href, weight: 600 });
  });

  /* option requests — each slot is its own small decision */
  (OPTIONS_OFF ? [] : (db.optionRequests ?? [])).forEach(r => {
    r.options.forEach(opt => {
      const live = opt.offers.filter(o => !o.rejected);
      const hold = live.map(o => o.holdUntil).filter(Boolean).sort()[0] as string | undefined; const hd = hold ? -daysAgo(hold) : null;
      const href = `#/design?open=${r.id}&slot=${opt.id}`;   // land on the option itself, opened
      if (opt.status === 'with-design' && want('design')) add({ id:`orq-${opt.id}`, role:'design', level: hd != null && hd <= 5 ? 'critical' : 'warn',
        title:`${r.reqNo} · option ${opt.index}${opt.note ? ` · ${opt.note}` : ''} — design to push PO`,
        detail: hd == null ? `${live[0] ? db.vendors.find(v => v.id === live[0].vendorId)?.name : 'vendor'} is on the option` : hd < 0 ? `the hold lapsed ${-hd}d ago` : `the hold lapses in ${hd}d`, href, weight: 810 - (hd ?? 30) });
      if (opt.status === 'extension' && want('sourcing')) add({ id:`orqx-${opt.id}`, role:'sourcing', level:'critical', title:`${r.reqNo} · option ${opt.index} — extension asked`, detail: opt.extension?.note ?? '', href:`#/sourcing?side=mtm&open=${r.id}&slot=${opt.id}`, weight: 850 });
    });
    /* the empty options come as one line per request, not one per option */
    const empty = r.options.filter(o => o.status === 'open');
    if (empty.length && want('sourcing') && daysAgo(r.raisedOn) >= 3) add({ id:`orqo-${r.id}`, role:'sourcing', level:'warn',
      title:`${r.reqNo} · ${r.category} — sourcing to add vendors on ${empty.length} option${empty.length === 1 ? '' : 's'}`,
      detail:`option${empty.length === 1 ? '' : 's'} ${empty.map(o => o.index).join(', ')} · asked ${daysAgo(r.raisedOn)}d ago${r.liveBy ? ` · live by ${r.liveBy}` : ''}`,
      href:`#/sourcing?side=mtm&open=${r.id}&slot=${empty[0].id}`, weight: 480 + daysAgo(r.raisedOn) });
  });

  /* design — mills' offers on a concept, waiting for the shade to be chosen */
  if (want('design')) (db.concepts ?? []).filter(c => !c.liveOn).forEach(c => { const s = conceptOf(db, c);
    if (!s.offersWithDesign) return;
    add({ id:`cfo-${c.id}`, role:'design', level: s.holdDays != null && s.holdDays <= 5 ? 'critical' : 'warn',
      title: `${c.name} · ${s.offers.length} mill${s.offers.length === 1 ? '' : 's'} quoted — choose the cloth`,
      detail: `${s.firstBuy != null ? `from ${fmtMoney(s.firstBuy)} for the first buy` : 'priced'}${s.holdDays != null ? ` · ${s.holdDays < 0 ? `a hold lapsed ${-s.holdDays}d ago` : `first hold lapses in ${s.holdDays}d`}` : ''}`,
      href:`#/design?open=${c.id}`, weight: 820 - (s.holdDays ?? 30) });
  });

  /* design — a sample sitting on the desk */
  if (want('design')) (db.concepts ?? []).filter(c => !c.liveOn).forEach(c => { const s = conceptOf(db, c);
    if (s.stuckDays > 5 && (s.pp.state === 'with production unit' || s.ship.state === 'with production unit'))
      add({ id:`cn-${c.id}`, role:'design', level: s.stuckDays > 10 ? 'warn' : 'info',
        title:`${c.name} · sample waiting on you`, detail:`${s.stuckDays} days on the desk`, href:`#/design?open=${c.id}`, weight: 500 + s.stuckDays }); });

  /* planning — a launch losing its date, and a core option with a size gone */
  if (want('planning')) {
    (db.launches ?? []).filter(l => !l.launchedOn).forEach(l => { const s = launchOf(l);
      if (s.briefLate) add({ id:`lnb-${l.id}`, role:'planning', level:'warn', title:`${l.styleName} · marketing brief late`,
        detail:`the Shopify listing is blocked until the name is sent`, href:`#/launches?open=${l.id}`, weight: 700 });
      if (s.launchLate) add({ id:`lnl-${l.id}`, role:'planning', level:'critical', title:`${l.styleName} · launch date passed`,
        detail:`${daysAgo(l.launchOn!)}d past the date, not made live`, href:`#/launches?open=${l.id}`, weight: 950 }); });
    db.options.filter(o => o.core).map(o => ({ o, h: healthOf(o) })).filter(x => x.h.szOOS > 0).sort((a, b) => b.h.szOOS - a.h.szOOS || b.h.trueRos - a.h.trueRos).slice(0, 10).forEach(({ o, h }) =>
      add({ id:`opt-${o.id}`, role:'planning', level: h.szOOS >= 2 ? 'warn' : 'info', title:`${o.styleName} · core, ${h.szOOS} size${h.szOOS === 1 ? '' : 's'} out`,
        detail:`${h.trueRos.toFixed(1)} a week and nothing in those sizes to sell`, href:`#/health?open=${o.id}`, weight: 600 + h.szOOS * 10 }));
    /* stores asking each other for the same option is demand the allocation missed */
    demandFromStores(db).filter(d => d.asks >= 2).slice(0, 8).forEach(d =>
      add({ id:`dmd-${d.optionId}`, role:'planning', level: d.unanswered > 0 ? 'warn' : 'info',
        title:`${d.styleName} · ${d.asks} stores have asked for it`,
        detail:`sizes ${d.sizes.join(', ')} · ${d.unanswered > 0 ? `${d.unanswered} still unanswered — ` : ''}the shelf that should hold it does not`,
        href:`#/health?open=${d.optionId}`, weight: 680 + d.asks * 5 }));
  }

  /* store — a case past its promise, a parcel not counted in, a size asked for */
  if (want('store')) {
    const sid = opts?.storeId;
    db.returns.filter(r => !r.closedOn && (!sid || r.storeId === sid)).forEach(r => { const st = returnStatusOf(r);
      if (st.overdue) add({ id:`ret-${r.id}`, role:'store', level:'warn', title:`${r.caseNo} · ${r.styleName}`,
        detail:`${daysAgo(r.openedOn)}d open against a ${r.slaDays}d promise · ${st.label}`, href:`#/stores?tab=returns&open=${r.id}`, weight: 650 }); });
    if (sid) { const inb = storeInboundOf(db, sid).filter(x => x.kind === 'sto' || x.kind === 'mtm' || x.kind === 'rtw');
      if (inb.length) add({ id:'inb', role:'store', level:'info', title:`${inb.length} parcel${inb.length === 1 ? '' : 's'} to count in`,
        detail:'arrived from the unit and not yet counted — until they are, the shelf and the system disagree', href:'#/stores?tab=inward', weight: 400 }); }
    /* store manager, 13 Oct 2026: a ship-by moved by production is something the store must tell the customer */
    const moved = (db.customerOrders ?? []).filter(o => (!sid || o.storeId === sid) && MTM_OPEN.has(o.stage) && (o.promiseRevisions ?? []).some(r => daysAgo(r.at) <= 3));
    if (moved.length) add({ id:`shipby-${sid ?? 'all'}`, role:'store', level:'warn', title:`${moved.length} ship-by date${moved.length === 1 ? '' : 's'} moved by production`,
      detail: moved.slice(0, 3).map(o => `${o.orderNo} · ${o.customer} · now ${fmtDate(o.promisedOn)} — ${o.promiseRevisions![o.promiseRevisions!.length - 1].reason}`).join(' · '), href:`#/stores?tab=mtm-orders`, weight: 620 });
    /* store manager, 13 Oct 2026: "if a fabric is closed for today the store should get a separate notification" */
    const closed = db.fabrics.filter(f => (f.supply?.status === 'out' && daysAgo(f.supply.reviewedOn) <= 14) || (f.paused && daysAgo(f.paused.at) <= 14));
    if (closed.length) add({ id:'fab-closed', role:'store', level:'warn', title:`${closed.length} fabric${closed.length === 1 ? '' : 's'} closed for selling`,
      detail: closed.slice(0, 4).map(f => `${f.name}${f.supply?.backOn ? ` · back ${fmtDate(f.supply.backOn)}` : ''}`).join(' · ') + (closed.length > 4 ? ` · +${closed.length - 4}` : '') + ' — take the swatch off the book', href:'#/fabrics?tab=fabrics&state=stopped', weight: 620 });
    (db.stockRequests ?? []).filter(q => q.status === 'requested' && (!sid || q.fromStoreId === sid)).forEach(q =>
      add({ id:`req-${q.id}`, role:'store', level:'info', title:`${q.styleName} · ${q.size} asked for`, detail:`another store needs it — accept, ship or decline`, href:'#/stores?tab=requests', weight: 350 }));
  }

  /* finance — money out, and notes waiting to be picked up */
  if (want('finance')) {
    db.returns.filter(r => r.refund && r.refund.kind === 'refund' && !r.refund.movedOn).forEach(r =>
      add({ id:`ref-${r.id}`, role:'finance', level: daysAgo(r.refund!.requestedOn) > 2 ? 'warn' : 'info',
        title:`${r.caseNo} · refund to move`, detail:`₹${r.refund!.amount.toLocaleString('en-IN')} · asked ${daysAgo(r.refund!.requestedOn)}d ago`, href:'#/refunds', weight: 620 }));
    const unseen = (db.grns ?? []).filter(g => !g.financeSeenOn);
    if (unseen.length) add({ id:'grn', role:'finance', level:'info', title:`${unseen.length} goods-received note${unseen.length === 1 ? '' : 's'} to pick up`,
      detail:'each one with its PO attached, for GST filing and reconciliation', href:'#/grn', weight: 380 });
  }

  /* warehouse — transfers left open are where ghost stock comes from */
  if (want('warehouse')) (db.bookRequests ?? []).filter(r => r.status === 'requested').forEach(r =>
    add({ id:`bkr-${r.id}`, role:'warehouse', level:'warn', title:`${STORES.find(s => s.id === r.storeId)?.name ?? 'A store'} asks for ${r.copies} ${r.kind} book${r.copies > 1 ? 's' : ''}`,
      detail:`${r.reason || 'no reason given'} · ${daysAgo(r.askedOn)}d ago`, href:'#/warehouse?tab=books', weight: 520 }));
  if (want('warehouse')) db.transfers.filter(t => t.shortfall && !t.shortfall.resolvedOn).forEach(t =>
    add({ id:`sto-short-${t.id}`, role:'warehouse', level:'critical', title:`${t.stoNo} · short at ${STORES.find(s => s.id === t.toStoreId)?.name ?? 'the store'}`,
      detail:`${t.shortfall!.receivedQty} of ${t.shortfall!.sentQty} counted in${t.shortfall!.note ? ` — "${t.shortfall!.note}"` : ''} · send the balance or write it off`, href:'#/warehouse?tab=transfers', weight: 700 }));
  if (want('warehouse')) db.transfers.filter(t => t.shippedOn && !t.closedOn && daysAgo(t.shippedOn) > 7).slice(0, 8).forEach(t =>
    add({ id:`sto-${t.id}`, role:'warehouse', level:'warn', title:`${t.stoNo} · open ${daysAgo(t.shippedOn!)}d`,
      detail:`${t.qty} pcs shipped and never counted in — this is the gap ghost stock lives in`, href:'#/warehouse', weight: 560 }));

  /* design and planning work from the one Requirements screen — their alerts
     land there, with the record opened in place; other teams keep their lists */
  out.forEach(a => { if (a.role === 'design' || a.role === 'planning') a.href = a.href.replace(/^#\/(concepts|requirements|requests)\?open=/, '#/design?open='); });
  return out.filter(a => !MTM_ONLY || !isRtwHref(a.href)).sort((a, b) => b.weight - a.weight);
}

/* ---------- what the stores are asking each other for ----------------------
   A store asking another store for a size is a demand signal, not just an
   errand: it means the allocation is wrong or the option is short. Today that
   conversation happens between two stores and planning never hears it. */
export interface OptionDemand { optionId: string; styleName: string; asks: number; stores: string[]; sizes: string[]; unanswered: number; lastAskedOn: string }
export function requestsForOption(db: Db, optionId: string) {
  return (db.stockRequests ?? []).filter(q => q.optionId === optionId).sort((a, b) => b.requestedOn.localeCompare(a.requestedOn));
}
export function demandFromStores(db: Db): OptionDemand[] {
  const by = new Map<string, OptionDemand>();
  (db.stockRequests ?? []).forEach(q => {
    const d = by.get(q.optionId) ?? { optionId: q.optionId, styleName: q.styleName, asks: 0, stores: [], sizes: [], unanswered: 0, lastAskedOn: q.requestedOn };
    d.asks++;
    if (!d.stores.includes(q.toStoreId)) d.stores.push(q.toStoreId);
    if (!d.sizes.includes(q.size)) d.sizes.push(q.size);
    if (q.status === 'requested' || q.status === 'declined') d.unanswered++;
    if (q.requestedOn > d.lastAskedOn) d.lastAskedOn = q.requestedOn;
    by.set(q.optionId, d);
  });
  return [...by.values()].sort((a, b) => b.asks - a.asks);
}

/* ---------- RTW planning review (8 Oct 2026) --------------------------------
   The planner's own working, laid out so it can be inspected and overridden:
   sales by size, usable stock after the display reserve, dated WIP from the
   tracker, a week-by-week projection by size, then a draft quantity and ratio.
   Nothing here is a forecast model — it is arithmetic on recorded numbers. */

/** Weekly sales per size. Uses the recorded series when the sheet has one; else
    splits the option total across the sizes that were in stock, weighted the
    same way the stock is, so the rows reconcile to the option total exactly. */
export function salesBySizeOf(o: RtwOption): Record<string, number[]> {
  if (o.weeklySalesBySize) return o.weeklySalesBySize;
  const n = o.weeklySales.length;
  const w = o.sizes.map(sz => Math.max(1, o.stockBySize[sz] ?? 0) + (hash(o.id + sz + 'sales') % 3));
  const wsum = w.reduce((a, b) => a + b, 0);
  const out: Record<string, number[]> = Object.fromEntries(o.sizes.map(sz => [sz, Array(n).fill(0)]));
  for (let i = 0; i < n; i++) {
    let left = o.weeklySales[i];
    o.sizes.forEach((sz, k) => { const q = k === o.sizes.length - 1 ? left : Math.round(o.weeklySales[i] * w[k] / wsum); out[sz][i] = q; left -= q; });
  }
  return out;
}

/** Observed rate per size: last 4 in-stock weeks ÷ 4, the same rule as the option. */
export function sizeRosOf(o: RtwOption): Record<string, number> {
  const by = salesBySizeOf(o);
  return Object.fromEntries(o.sizes.map(sz => { const s = by[sz]; const last = s.map((v, i) => ({ v, ok: o.inStockWeeks[i] })).filter(x => x.ok).slice(-4).map(x => x.v);
    return [sz, last.length ? last.reduce((a, b) => a + b, 0) / last.length : 0]; }));
}

/** Pieces on the floors for display and trial. In this model they are issued at
    cost when the option launches and sit OUTSIDE the stock by size, so they are
    shown beside usable stock rather than taken off it. A new order that needs
    more display pieces adds them on the review. */
export function displayReserveOf(db: Db, o: RtwOption) {
  const fp = floorPiecesOf(db, o.id);
  if (fp.total > 0) return { display: fp.display, trial: fp.fit, total: fp.total, source: 'launch allocation' as const };
  return { display: 0, trial: 0, total: 0, source: 'none recorded' as const };
}

/** Where the option's pieces sit, by purpose — display, off the rack, trial, warehouse. */
export function stockByPurposeOf(db: Db, o: RtwOption) {
  const total = Object.values(o.stockBySize).reduce((a, b) => a + b, 0);
  const r = displayReserveOf(db, o);
  const byHolder = storeStockOf(o);
  const offRack = Object.entries(byHolder).filter(([h]) => h !== 'warehouse').reduce((a, [, m]) => a + Object.values(m).reduce((x, y) => x + y, 0), 0);
  const warehouse = Object.values(byHolder.warehouse ?? {}).reduce((a, b) => a + b, 0);
  return { total, display: r.display, trial: r.trial, offRack, warehouse, usable: total };
}

/** Open orders for this style on the tracker, with the date each is expected and its size breakup. */
export function wipOf(db: Db, o: RtwOption) {
  return db.orders
    .filter(x => x.styleName.toLowerCase() === o.styleName.toLowerCase() && x.status !== 'Closed')
    .map(x => { const r = riskOf(x); const arrives = r.expectedInhouse ?? x.targetInhouse;
      const given = (x.cutRatios ?? []).filter(c => c.given).slice(-1)[0]?.given?.breakup;
      /* only a raised PO is WIP; a request still with design or sourcing is shown but not counted */
      return { order: x, qty: x.cutQty ?? x.orderQty, arrives, weeksAway: Math.max(0, Math.ceil(-daysAgo(arrives) / 7)), breakup: given ?? x.sizeBreakup, poNo: x.poNo, firm: !!x.poNo }; })
    .sort((a, b) => a.arrives.localeCompare(b.arrives));
}

export const planningKindOf = (o: RtwOption): PlanningKind => daysAgo(o.launchedAt) < 8 * 7 ? 'new' : o.core ? 'core' : 'non-core';

export interface ProjectionWeek { week: number; from: string; opening: number; demand: number; receipts: number; closing: number; bySize: Record<string, number> }
export interface Projection {
  weeks: ProjectionWeek[];
  atArrival: number;                                   // usable stock when an order placed today lands
  coverAtArrival: number;                              // weeks
  firstShortWeek: number | null;                       // option total
  sizes: { size: string; usable: number; incoming: number; ros: number; atArrival: number; firstShortWeek: number | null; beforeReceipt: boolean }[];
}

/** Week-by-week usable stock, by size, with WIP landing in its own week. `planRos`
    scales each size's observed rate so the sizes reconcile to the option rate. */
export function projectionOf(db: Db, o: RtwOption, planRos: number, leadWeeks: number, horizonWeeks = 16): Projection {
  const sizeRos = sizeRosOf(o);
  const obsTotal = Object.values(sizeRos).reduce((a, b) => a + b, 0);
  const scale = obsTotal > 0 ? planRos / obsTotal : 0;
  /* display and trial pieces are already outside the stock by size */
  const usable: Record<string, number> = { ...o.sizes.reduce((m, sz) => ({ ...m, [sz]: o.stockBySize[sz] ?? 0 }), {} as Record<string, number>) };
  const wip = wipOf(db, o);
  const perWeek: Record<string, number> = Object.fromEntries(o.sizes.map(sz => [sz, obsTotal > 0 ? sizeRos[sz] * scale : planRos / o.sizes.length]));
  const cur: Record<string, number> = { ...usable };
  const firstShort: Record<string, number | null> = Object.fromEntries(o.sizes.map(sz => [sz, (cur[sz] ?? 0) <= 0 && perWeek[sz] > 0 ? 0 : null]));
  let totalShort: number | null = null;
  const weeks: ProjectionWeek[] = [];
  for (let w = 1; w <= horizonWeeks; w++) {
    const opening = Object.values(cur).reduce((a, b) => a + b, 0);
    const landing = wip.filter(x => x.firm && x.weeksAway === w);
    let receipts = 0; let demand = 0;
    o.sizes.forEach(sz => {
      const inc = landing.reduce((a, x) => a + (x.breakup.find(b => b.size === sz)?.qty ?? 0), 0);
      receipts += inc; demand += perWeek[sz];
      cur[sz] = (cur[sz] ?? 0) - perWeek[sz] + inc;
      if (firstShort[sz] == null && cur[sz] <= 0 && perWeek[sz] > 0) firstShort[sz] = w;
    });
    const closing = Object.values(cur).reduce((a, b) => a + b, 0);
    if (totalShort == null && closing <= 0 && planRos > 0) totalShort = w;
    weeks.push({ week: w, from: iso(addDays(TODAY, (w - 1) * 7)), opening: Math.round(opening), demand: Math.round(demand), receipts, closing: Math.round(closing), bySize: Object.fromEntries(o.sizes.map(sz => [sz, Math.round(cur[sz])])) });
  }
  const arrivalWeek = weeks[Math.min(leadWeeks, horizonWeeks) - 1] ?? weeks[weeks.length - 1];
  const atArrival = Math.max(0, arrivalWeek.closing);
  const firstReceipt = wip.find(x => x.firm)?.weeksAway ?? null;
  return {
    weeks, atArrival, coverAtArrival: planRos > 0 ? atArrival / planRos : 999, firstShortWeek: totalShort,
    sizes: o.sizes.map(sz => ({ size: sz, usable: usable[sz] ?? 0, incoming: wip.filter(x => x.firm).reduce((a, x) => a + (x.breakup.find(b => b.size === sz)?.qty ?? 0), 0), ros: perWeek[sz],
      atArrival: arrivalWeek.bySize[sz], firstShortWeek: firstShort[sz], beforeReceipt: firstShort[sz] != null && (firstReceipt == null || firstShort[sz]! < firstReceipt) })),
  };
}

/** The draft: demand for the cover window after arrival, less what is projected to be
    there, spread by size on each size's rate, with a shortfall at arrival added back. */
export function draftOrderOf(o: RtwOption, p: Projection, planRos: number, coverWeeks: number) {
  const target = Math.round(planRos * coverWeeks);
  const gap = Math.max(0, target - p.atArrival);
  const perSize = p.sizes.map(s => { const demand = s.ros * coverWeeks; const need = Math.max(0, Math.round(demand - Math.max(0, s.atArrival))); return { size: s.size, qty: need }; });
  const sum = perSize.reduce((a, b) => a + b.qty, 0);
  /* reconcile the size rows to the total gap so they add up */
  const ratio = sum > 0 ? perSize.map(x => ({ size: x.size, qty: Math.round(x.qty * gap / sum) })) : perSize;
  const diff = gap - ratio.reduce((a, b) => a + b.qty, 0);
  if (ratio.length && diff !== 0) { const top = ratio.reduce((m, x) => x.qty > m.qty ? x : m, ratio[0]); top.qty += diff; }
  return { target, gap, ratio };
}

/** Last review's plan against what happened since — the loop closed at the next sitting. */
export function reviewOutcomeOf(db: Db, r: PlanningReview) {
  const o = db.options.find(x => x.id === r.optionId); if (!o) return null;
  const weeksSince = Math.max(1, Math.min(12, Math.round(daysAgo(r.on) / 7)));
  const sales = o.weeklySales.slice(-weeksSince);
  const inStock = o.inStockWeeks.slice(-weeksSince).filter(Boolean).length;
  const actualRos = sales.length ? sales.reduce((a, b) => a + b, 0) / sales.length : 0;
  const req = r.requirementId ? db.orders.find(x => x.id === r.requirementId) ?? null : null;
  return { o, weeksSince, actualRos, inStock, req, sizesOut: o.sizes.filter(sz => (o.stockBySize[sz] ?? 0) === 0) };
}


/* ---------- the store's window and every store's shelf (store manager, 14 Oct 2026) ------
   Every store gets one display piece per launched option; it is not shelf stock. The
   store may still sell it, which puts the window at −1 until the next order brings one.
   Only some stores hold sellable RTW stock; the rest show the display piece only. */
export function displayBalanceOf(db: Db, storeId: string, optionId: string) {
  const ls = (db.launches ?? []).filter(l => l.optionId === optionId);
  const recorded = ls.flatMap(l => l.pieces).filter(p => p.storeId === storeId && p.kind === 'display' && p.receivedOn).reduce((a, p) => a + p.qty, 0);
  /* a launched option with no piece recorded for this store still has its standard one display piece */
  const received = recorded > 0 ? recorded : ls.some(l => l.launchedOn) ? 1 : 0;
  const sold = (db.customerOrders ?? []).filter(o => o.storeId === storeId && o.optionId === optionId && o.soldDisplay && o.stage !== 'cancelled').length;
  /* every store must hold one display piece of a launched option: on the floor − required.
     One received, none sold → 0 (window dressed). Sold → −1, the store manager's own figure. */
  const required = received > 0 ? 1 : 0;
  const onFloor = received - sold;
  return { received, sold, onFloor, required, balance: onFloor - required };
}
/** Options whose display piece this store has sold and not yet replaced. */
export function displaysOwedOf(db: Db, storeId: string) {
  return db.options.filter(o => !o.inactive).map(o => ({ o, d: displayBalanceOf(db, storeId, o.id) })).filter(x => x.d.balance < 0);
}
/** One option across every store: who sells it off the rack and how many per size, who only shows it. */
export function shelvesOf(db: Db, o: RtwOption) {
  const split = storeStockOf(o);
  const rows = STORES.map(s => { const d = displayBalanceOf(db, s.id, o.id);
    return { storeId: s.id, name: s.name, region: s.region, holds: s.holdsRtwStock, bySize: s.holdsRtwStock ? (split[s.id] ?? {}) : {}, total: s.holdsRtwStock ? Object.values(split[s.id] ?? {}).reduce((a, b) => a + b, 0) : 0, display: d }; });
  const warehouse = Object.values(split.warehouse ?? {}).reduce((a, b) => a + b, 0);
  return { rows, warehouse, warehouseBySize: split.warehouse ?? {} };
}
