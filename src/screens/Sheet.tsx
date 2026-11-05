/* Sheet (2 Nov 2026) — the planners' workbook, in the order they work: the Working row per
   style (rate → sellable → WIP → cover at arrival → verdict), the Option count that can
   override it, the Order working per style by size, then the health row and the pivots,
   and the raw exports last. It behaves like a spreadsheet: sheet tabs, row numbers,
   lettered columns, frozen key columns, click a header to sort, a formula bar that shows
   how a cell was computed, a summary row. The key is the Shiphero Style Name, as in the
   sheets; click it and every tab filters to that style. */
import { useMemo, useState, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { Db, RtwOption } from '../domain/types';
import { healthRowOf, wipOf, storeStockOf, salesBySizeOf, sizeRosOf, lifetimeSizeRatioOf, splitInPairs, rosOf, projectionOf, displayReserveOf, fmtDate, daysAgo, TODAY } from '../domain/engines';
import { STORES, RTW_SUBCATS, HEALTH_MIN_SIZE_PCT, HEALTH_MIN_COVER_WEEKS, GRADE_QTY, isBottoms } from '../domain/reference';
import { categoryOfOption } from '../domain/analysis';
import { verdictOf, DEFAULT_LEAD_WEEKS, DEFAULT_COVER_WEEKS } from './Planning';
import { Page, Input, Button, ExportButton } from '../ui';

/* ── the workbook ─────────────────────────────────────────────────────────────── */
type Val = string | number | null;
interface Col<T = Row> { id: string; name: string; w: number; num?: boolean; get: (r: T) => Val; src?: string; formula?: (r: T) => string; sum?: 'sum' | 'avg'; link?: boolean; tone?: (r: T) => string | undefined }
interface Row { key: string; id: string; [k: string]: unknown }
interface Tab { id: string; name: string; grain: string; cols: Col[]; rows: Row[]; frozen?: number; byStyle?: boolean; group: 'work' | 'book' | 'source' }

const holderName = (id: string) => id === 'warehouse' ? 'Factory Warehouse' : STORES.find(s => s.id === id)?.name ?? id;
const letter = (i: number) => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));
const f1 = (n: number) => Math.round(n * 10) / 10;
const sizeOrder = (a: string, b: string) => (parseInt(a) || 0) - (parseInt(b) || 0) || a.localeCompare(b);
const hash = (s: string) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const plusWeeks = (weeks: number) => { const d = new Date(TODAY); d.setDate(d.getDate() + weeks * 7); return d; };
/* the sheets join on the Shiphero Style Name; only the Shopify export carries a Product ID. The seed has no
   Shopify ID, so a stable 13-digit one is derived per option until the real export is wired. */
const productIdOf = (id: string) => { let h = 7; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `92${String(h).padStart(10, '0')}0`; };
const HORIZON = 10; // the Recce summary of 27 Aug asked "as on Nov": ten weeks out

/* the two frozen columns every style-keyed tab starts with */
const keyCols = (): Col[] => [
  { id: 'style', name: 'Shiphero Style Name', w: 240, get: r => r.style as string, link: true, src: 'the key: every sheet joins on it (VLOOKUP today)' },
  { id: 'pid', name: 'Product ID', w: 130, get: r => r.pid as string, src: 'lookup · Shopify Product ID from L4W Data' },
];
const RISK = 'var(--risk)', WARN = 'var(--warn)', GOOD = 'var(--good)';

function workbook(db: Db): Tab[] {
  const options = db.options.filter(o => !o.inactive).sort((a, b) => a.styleName.localeCompare(b.styleName));
  const sizes = [...new Set(options.flatMap(o => o.sizes))].sort(sizeOrder);
  const reviewsOf = (id: string) => (db.planningReviews ?? []).filter(x => x.optionId === id).sort((a, b) => b.on.localeCompare(a.on));
  /* one computed record per style, shared by every tab */
  const R = new Map(options.map(o => { const h = healthRowOf(o); const r = rosOf(o); const p = projectionOf(db, o, r.trueRos, DEFAULT_LEAD_WEEKS); const wip = wipOf(db, o);
    const sizeRisk = p.sizes.filter(s => s.beforeReceipt && s.ros > 0); const v = verdictOf(h, p, wip, sizeRisk, DEFAULT_LEAD_WEEKS); const last = reviewsOf(o.id)[0] ?? null; const disp = displayReserveOf(db, o);
    const firm = wip.filter(w => w.firm); const wipQty = firm.reduce((a, w) => a + w.qty, 0); const lands = firm[0]?.arrives ?? null;
    const windowEnds = last?.windowEndsOn ?? null; const weeksToWindow = windowEnds ? Math.round(-daysAgo(windowEnds) / 7) : null;
    return [o.id, { h, r, p, wip, firm, wipQty, lands, sizeRisk, v, last, disp, windowEnds, weeksToWindow }]; }));
  const base = (o: RtwOption) => ({ id: o.id, pid: productIdOf(o.id), style: o.styleName, o });
  const rec = (r: Row) => R.get(r.id)!;
  const sizeCols = (src: string, main?: (r: Row) => string[]): Col[] => sizes.map(s => ({ id: `s${s}`, name: s, w: 52, num: true, get: r => (r.by as Record<string, number>)[s] ?? null, sum: 'sum', src, tone: r => main && main(r).includes(s) && !((r.by as Record<string, number>)[s]) ? RISK : undefined }));
  const total: Col = { id: 'total', name: 'Grand Total', w: 90, num: true, get: r => r.total as number, sum: 'sum', formula: r => `SUM(${Object.values(r.by as Record<string, number>).filter(Boolean).join(' + ')})` };
  const healthyTone = (r: Row) => rec(r).h.healthy ? GOOD : RISK;

  /* 1 · Working — the decision, one row per style, in the order the planner reads it */
  const working: Tab = { id: 'working', name: 'Working', group: 'work', byStyle: true, grain: 'one row per style · rate → sellable → WIP → cover when the order lands → verdict', rows: options.map(o => ({ key: o.id, ...base(o), by: o.stockBySize, total: R.get(o.id)!.h.stock })), cols: [...keyCols(),
    { id: 'sub1', name: 'Sub-Category 1', w: 140, get: r => (r.o as RtwOption).subCat1 },
    { id: 'core', name: 'Core/Non-Core', w: 110, get: r => (r.o as RtwOption).core ? 'Core' : 'Non Core' },
    { id: 'launch', name: 'Product Launch Date', w: 140, get: r => fmtDate((r.o as RtwOption).launchedAt) },
    { id: 'wof', name: 'WOF', w: 56, num: true, get: r => rec(r).h.wof, formula: r => `WEEKS(TODAY − Product Launch Date) = ${rec(r).h.wof}` },
    ...sizeCols('physical stock by size · red = a main size at zero', r => rec(r).h.main),
    { ...total, src: 'Enigma stock report · all sizes, all locations' },
    { id: 'disp', name: 'Display · trial', w: 100, num: true, get: r => rec(r).disp.total || null, src: 'pieces on the floor for display and trial · held outside the sellable stock (launch allocation)' },
    { id: 'sell', name: 'Sellable', w: 80, num: true, get: r => rec(r).h.stock, sum: 'sum', formula: r => `Grand Total (display and trial already sit outside it) = ${rec(r).h.stock}` },
    { id: 'main', name: 'Main', w: 60, num: true, get: r => rec(r).h.mainStock, sum: 'sum', formula: r => `SUM(stock in main sizes ${rec(r).h.main.join(' ')}) = ${rec(r).h.mainStock}` },
    ...[0, 1, 2, 3].map(i => ({ id: `lw${i}`, name: i ? `LW-${i}` : 'LW', w: 56, num: true, get: (r: Row) => rec(r).h.lw[i], sum: 'sum' as const, src: 'units sold that week · Product Weekly Report' })),
    { id: 'l4w', name: 'L4W', w: 56, num: true, get: r => f1(rec(r).h.l4w), sum: 'avg', formula: r => `AVERAGE(LW, LW-1, LW-2, LW-3) = (${rec(r).h.lw.join(' + ')}) ÷ 4 = ${f1(rec(r).h.l4w)}` },
    { id: 'top6', name: 'Top 6 Weeks ROS', w: 120, num: true, get: r => f1(rec(r).h.top6Ros), sum: 'avg', formula: () => 'AVERAGE of the best six weeks · the ceiling, used for new styles' },
    { id: 'aws', name: 'AWS', w: 60, num: true, get: r => f1(rec(r).h.aws), sum: 'avg', formula: r => { const h = rec(r).h; const c = [...h.lw, f1(h.top6Ros)]; const names = ['LW', 'LW-1', 'LW-2', 'LW-3', 'Top 6']; const i = c.indexOf(Math.max(...c)); return `MAX(LW, LW-1, LW-2, LW-3, Top 6) = MAX(${c.join(', ')}) = ${f1(h.aws)} ← ${names[i]}`; } },
    { id: 'wc', name: 'WC', w: 56, num: true, get: r => rec(r).h.wc >= 999 ? null : f1(rec(r).h.wc), sum: 'avg', formula: r => `Main ÷ AWS = ${rec(r).h.mainStock} ÷ ${f1(rec(r).h.aws)} = ${rec(r).h.wc >= 999 ? '∞' : f1(rec(r).h.wc)} weeks`, tone: r => rec(r).h.wc < HEALTH_MIN_COVER_WEEKS ? RISK : undefined },
    { id: 'low', name: 'Low stock Size Count', w: 150, num: true, get: r => rec(r).h.low.length, sum: 'sum', formula: r => `COUNT(main sizes out, or under 4 weeks of their own rate · assumed rule) = ${rec(r).h.low.length}${rec(r).h.low.length ? ` (${rec(r).h.low.join(' ')})` : ''}` },
    { id: 'health', name: 'Stock Health', w: 100, num: true, get: r => Math.round(rec(r).h.stockHealth * 100), sum: 'avg', formula: r => `(Count − Low stock Size Count) ÷ Count = (${rec(r).h.main.length} − ${rec(r).h.low.length}) ÷ ${rec(r).h.main.length} = ${Math.round(rec(r).h.stockHealth * 100)}%`, tone: r => rec(r).h.stockHealth < HEALTH_MIN_SIZE_PCT ? RISK : undefined },
    { id: 'healthy', name: 'Healthy Or Not', w: 110, get: r => rec(r).h.healthy ? 'Healthy' : 'Unhealthy', formula: r => `IF(Stock Health ≥ ${HEALTH_MIN_SIZE_PCT * 100}% AND WC ≥ ${HEALTH_MIN_COVER_WEEKS}, "Healthy", "Unhealthy") → ${rec(r).h.healthy ? 'Healthy' : 'Unhealthy'}`, tone: healthyTone },
    { id: 'wip', name: 'WIP', w: 60, num: true, get: r => rec(r).wipQty || null, sum: 'sum', src: 'rollup · Open orders: SUM(Balance qty) where PO No. is set' },
    { id: 'lands', name: 'WIP lands', w: 100, get: r => rec(r).lands ? fmtDate(rec(r).lands) : null, src: 'lookup · Open orders: earliest Shipment Inward Date' },
    { id: 'lead', name: 'Lead wk', w: 64, num: true, get: () => DEFAULT_LEAD_WEEKS, src: 'weeks from PO to shelf for a new order placed today' },
    { id: 'arr', name: 'At arrival', w: 80, num: true, get: r => rec(r).p.atArrival, sum: 'sum', formula: r => `Sellable − AWS × Lead wk + WIP landing before then = ${rec(r).h.stock} − ${f1(rec(r).h.aws)} × ${DEFAULT_LEAD_WEEKS} + ${rec(r).firm.filter(w => w.weeksAway <= DEFAULT_LEAD_WEEKS).reduce((a, w) => a + w.qty, 0)} = ${rec(r).p.atArrival}` },
    { id: 'cov', name: 'Cover at arrival', w: 110, num: true, get: r => rec(r).p.coverAtArrival >= 999 ? null : f1(rec(r).p.coverAtArrival), sum: 'avg', formula: r => `At arrival ÷ AWS = ${rec(r).p.atArrival} ÷ ${f1(rec(r).h.aws)} = ${rec(r).p.coverAtArrival >= 999 ? '∞' : f1(rec(r).p.coverAtArrival)} weeks · target ${DEFAULT_COVER_WEEKS}`, tone: r => rec(r).p.coverAtArrival < DEFAULT_COVER_WEEKS ? WARN : undefined },
    { id: 'out', name: 'Runs out · week', w: 110, num: true, get: r => rec(r).p.firstShortWeek, src: 'first week the style total goes to zero at AWS, WIP counted when it lands', tone: r => (rec(r).p.firstShortWeek ?? 99) <= DEFAULT_LEAD_WEEKS ? RISK : undefined },
    { id: 'short', name: 'Sizes short first', w: 120, get: r => rec(r).sizeRisk.map(s => s.size).join(' ') || null, src: 'main sizes that run out before anything on order lands', tone: r => rec(r).sizeRisk.length ? RISK : undefined },
    { id: 'win', name: 'Window ends', w: 100, get: r => rec(r).windowEnds ? fmtDate(rec(r).windowEnds) : null, src: 'from the last planning review · when the selling window closes (non-core)' },
    { id: 'wkwin', name: 'Weeks to window', w: 110, num: true, get: r => rec(r).weeksToWindow, formula: r => rec(r).windowEnds ? `WEEKS(Window ends − TODAY) = ${rec(r).weeksToWindow} · a new run needs ${DEFAULT_LEAD_WEEKS}` : 'no window set' },
    { id: 'verdict', name: 'Verdict', w: 130, get: r => rec(r).v.label, formula: r => `${rec(r).v.label}: ${rec(r).v.why}`, tone: r => ({ risk: RISK, warn: WARN, good: GOOD } as Record<string, string>)[rec(r).v.tone] },
    { id: 'why', name: 'Why', w: 320, get: r => rec(r).v.why },
    { id: 'grade', name: 'Grade', w: 60, get: r => rec(r).last?.grade ?? null, src: `sourcing's A/B · A ≈ ${GRADE_QTY.A}, B ≈ ${GRADE_QTY.B}` },
    { id: 'last', name: 'Last review', w: 150, get: r => rec(r).last ? `${fmtDate(rec(r).last!.on)} · ${rec(r).last!.status}` : null },
  ] };

  /* 2 · Option count — the Recce summary; the guideline that can force an order the row would not */
  const atDate = fmtDate(plusWeeks(HORIZON));
  const count: Tab = { id: 'count', name: 'Option count', group: 'work', frozen: 1, grain: `Recce Summary · one row per sub-category · "as on" = ${atDate}`, rows: RTW_SUBCATS.filter(sc => sc.ideal != null).map(sc => {
    const key = `${sc.sub1}|${sc.sub2}`; const os = options.filter(o => o.subCat1 === sc.sub1 || (sc.also ?? []).includes(o.subCat1)); const non = os.filter(o => !o.core);
    const healthyNow = non.filter(o => R.get(o.id)!.h.healthy); const healthyAt = non.filter(o => { const x = R.get(o.id)!; return x.h.healthy && (x.p.firstShortWeek == null || x.p.firstShortWeek > HORIZON); });
    const inProd = non.filter(o => !healthyAt.includes(o) && R.get(o.id)!.firm.length); const nonIdeal = (sc.ideal ?? 0) - (sc.coreIdeal ?? 0); const saved = db.planningCounts?.[key] ?? null;
    return { key, id: key, sub1: sc.sub1 + ((sc.also ?? []).length ? ` + ${(sc.also ?? []).join(' + ')}` : ''), sub2: sc.sub2, coreIdeal: sc.coreIdeal ?? 0, nonIdeal, ideal: sc.ideal ?? 0, coreLive: os.length - non.length, live: non.length, healthyNow: healthyNow.length, healthyAt: healthyAt.length, inProd: inProd.length, gap: nonIdeal - healthyAt.length - inProd.length, need: saved?.needToOrder ?? null, note: saved?.note ?? null, by: saved ? `${saved.by} · ${fmtDate(saved.on)}` : null }; }), cols: [
    { id: 'sub1', name: 'Sub-Category 1', w: 220, get: r => r.sub1 as string }, { id: 'sub2', name: 'Sub-Category 2', w: 150, get: r => r.sub2 as string },
    { id: 'ci', name: 'Ideal · Core', w: 90, num: true, get: r => r.coreIdeal as number, sum: 'sum', src: 'Revised Ideal Option Count, 13 Aug 2026' }, { id: 'ni', name: 'Ideal · Non-core', w: 110, num: true, get: r => r.nonIdeal as number, sum: 'sum' }, { id: 'ti', name: 'Ideal · Total', w: 90, num: true, get: r => r.ideal as number, sum: 'sum', formula: r => `Core + Non-core = ${r.coreIdeal} + ${r.nonIdeal} = ${r.ideal}` },
    { id: 'cl', name: 'Live · Core', w: 90, num: true, get: r => r.coreLive as number, sum: 'sum' }, { id: 'nl', name: 'Live · Non-core', w: 110, num: true, get: r => r.live as number, sum: 'sum' },
    { id: 'hn', name: 'Current Healthy Options', w: 150, num: true, get: r => r.healthyNow as number, sum: 'sum', src: 'non-core rows Healthy today' }, { id: 'ha', name: `Healthy as on ${atDate}`, w: 150, num: true, get: r => r.healthyAt as number, sum: 'sum', src: `healthy today and not running out inside ${HORIZON} weeks` },
    { id: 'ip', name: 'In production', w: 100, num: true, get: r => r.inProd as number, sum: 'sum', src: 'not healthy at the date, but a PO is raised' },
    { id: 'gap', name: 'Gap', w: 60, num: true, get: r => r.gap as number, sum: 'sum', formula: r => `Ideal Non-core − Healthy as on date − In production = ${r.nonIdeal} − ${r.healthyAt} − ${r.inProd} = ${r.gap}`, tone: r => (r.gap as number) > 0 ? RISK : undefined },
    { id: 'need', name: 'Need to order · Adjusted', w: 160, num: true, get: r => r.need as number | null, sum: 'sum', src: 'the planner\'s number, saved on the RTW planning screen' }, { id: 'note', name: 'Note', w: 200, get: r => r.note as string | null }, { id: 'by', name: 'Saved by', w: 150, get: r => r.by as string | null }] };

  /* 3 · Order working — the chinos sheet: one block per style, one row per measure, sizes across */
  const MEASURES = ['Stock', 'Lifetime share %', 'ROS / wk', 'Closing in 3 wk', 'Open orders', `Opening at arrival (${DEFAULT_LEAD_WEEKS} wk)`, 'Order · split in pairs'] as const;
  const orderWork: Tab = { id: 'order', name: 'Order working', group: 'work', frozen: 3, byStyle: true, grain: 'United Chinos order working · one block per style, one row per measure, sizes across · styles to order now or soon, or already reviewed', rows: options.filter(o => { const x = R.get(o.id)!; return x.v.group === 'now' || x.v.group === 'soon' || x.last; }).flatMap(o => {
    const x = R.get(o.id)!; const ratio = lifetimeSizeRatioOf(o); const sros = sizeRosOf(o); const incoming = Object.fromEntries(o.sizes.map(s => [s, x.p.sizes.find(z => z.size === s)?.incoming ?? 0])); const qty = x.last?.approvedQty ?? x.last?.draftQty ?? Math.max(0, Math.ceil((x.h.aws * DEFAULT_COVER_WEEKS - x.p.atArrival) / 2) * 2);
    const split = Object.fromEntries(splitInPairs(qty, ratio, o.sizes).map(s => [s.size, s.qty]));
    const rows: Record<string, number>[] = [o.stockBySize, Object.fromEntries(o.sizes.map(s => [s, Math.round(ratio[s] * 100)])), Object.fromEntries(o.sizes.map(s => [s, f1(sros[s])])), Object.fromEntries(o.sizes.map(s => [s, Math.round((o.stockBySize[s] ?? 0) - sros[s] * 3)])), incoming, Object.fromEntries(o.sizes.map(s => [s, x.p.sizes.find(z => z.size === s)?.atArrival ?? 0])), split];
    return MEASURES.map((m, i) => ({ key: `${o.id}|${i}`, ...base(o), measure: m, mi: i, by: rows[i], total: m === 'Lifetime share %' ? 100 : Math.round(Object.values(rows[i]).reduce((a, b) => a + b, 0) * 10) / 10, qty, src: x.last ? `${x.last.approvedQty != null ? 'approved' : 'draft'} on the planning review of ${fmtDate(x.last.on)}` : `AWS × ${DEFAULT_COVER_WEEKS} wk − At arrival, rounded to pairs` })); }), cols: [...keyCols(),
    { id: 'measure', name: 'Measure', w: 190, get: r => r.measure as string, src: 'the chinos sheet\'s rows: stock → ratio → rate → closing → open orders → opening → the order' },
    ...sizes.map(s => ({ id: `s${s}`, name: s, w: 56, num: true, get: (r: Row) => (r.by as Record<string, number>)[s] ?? null, formula: (r: Row) => { const o = r.o as RtwOption; const v = (r.by as Record<string, number>)[s]; if (v == null) return ''; switch (r.mi) { case 1: return `sold in ${s} ÷ sold in all sizes since launch = ${v}%`; case 2: return `the size's own rate, last four in-stock weeks = ${v}`; case 3: return `Stock − ROS × 3 = ${o.stockBySize[s] ?? 0} − ${f1(sizeRosOf(o)[s])} × 3 = ${v}`; case 5: return `Stock + Open orders landing in ${DEFAULT_LEAD_WEEKS} wk − ROS × ${DEFAULT_LEAD_WEEKS} = ${v}`; case 6: return `ROUND(Order qty × Lifetime share ÷ 2) × 2 = ROUND(${r.qty} × ${Math.round(lifetimeSizeRatioOf(o)[s] * 100)}% ÷ 2) × 2 = ${v}`; default: return String(v); } }, tone: (r: Row) => (r.mi === 3 || r.mi === 5) && ((r.by as Record<string, number>)[s] ?? 0) < 0 ? RISK : undefined })),
    { id: 'total', name: 'Grand Total', w: 90, num: true, get: r => r.total as number, formula: r => r.mi === 6 ? `Order qty = ${r.qty} · ${r.src}` : `SUM across sizes = ${r.total}` }] };

  /* 4 · the health row, as the ROS & health Report has it */
  const hr = (r: Row) => rec(r).h;
  const health: Tab = { id: 'health', name: 'Health', group: 'book', byStyle: true, grain: 'ROS & health Report · one row per style, the sheet\'s own columns', rows: working.rows, cols: [...keyCols(),
    { id: 'sold', name: 'Total Sale', w: 84, num: true, get: r => hr(r).totalSale, sum: 'sum', src: 'units since launch' },
    { id: 'wof', name: 'WOF', w: 60, num: true, get: r => hr(r).wof, formula: r => `WEEKS(TODAY − Product Launch Date) = ${hr(r).wof}` },
    { id: 'ros', name: 'ROS', w: 60, num: true, get: r => f1(hr(r).ros), sum: 'avg', formula: r => `Total Sale ÷ WOF = ${hr(r).totalSale} ÷ ${hr(r).wof} = ${f1(hr(r).ros)}` },
    ...[0, 1, 2, 3].map(i => ({ id: `lw${i}`, name: i ? `LW-${i}` : 'LW', w: 60, num: true, get: (r: Row) => hr(r).lw[i], sum: 'sum' as const })),
    { id: 'l4w', name: 'L4W', w: 60, num: true, get: r => f1(hr(r).l4w), sum: 'avg', formula: r => `AVERAGE(LW, LW-1, LW-2, LW-3) = ${f1(hr(r).l4w)}` },
    { id: 'top6', name: 'Top 6 Weeks ROS', w: 120, num: true, get: r => f1(hr(r).top6Ros), sum: 'avg' },
    { id: 'main', name: 'Main', w: 64, num: true, get: r => hr(r).mainStock, sum: 'sum' }, { id: 'aws', name: 'AWS', w: 64, num: true, get: r => f1(hr(r).aws), sum: 'avg' }, { id: 'wc', name: 'WC', w: 60, num: true, get: r => hr(r).wc >= 999 ? null : f1(hr(r).wc), sum: 'avg', formula: r => `Main ÷ AWS = ${hr(r).mainStock} ÷ ${f1(hr(r).aws)}` },
    { id: 'count', name: 'Count', w: 64, num: true, get: r => hr(r).main.length }, { id: 'low', name: 'Low stock Size Count', w: 150, num: true, get: r => hr(r).low.length, sum: 'sum' }, { id: 'health', name: 'Stock Health', w: 100, num: true, get: r => Math.round(hr(r).stockHealth * 100), sum: 'avg' },
    { id: 'healthy', name: 'Healthy Or Not', w: 110, get: r => hr(r).healthy ? 'Healthy' : 'Unhealthy', tone: healthyTone }, { id: 'eoss', name: 'EOSS Sale', w: 90, get: r => hr(r).eoss ? 'Sale' : 'Non-Sale' }, { id: 'launch', name: 'Product Launch Date', w: 150, get: r => fmtDate((r.o as RtwOption).launchedAt) }, { id: 'gt', name: 'Grand Total', w: 90, num: true, get: r => hr(r).stock, sum: 'sum' }] };

  /* 5 · the pivots */
  const stock: Tab = { id: 'stock', name: 'Stock', group: 'book', byStyle: true, grain: 'Enigma Stock sheet · one row per style × STORE', cols: [...keyCols(), { id: 'store', name: 'STORE', w: 150, get: r => r.loc as string }, { id: 'sub1', name: 'Sub-Category 1', w: 140, get: r => (r.o as RtwOption).subCat1 }, { id: 'core', name: 'Core/Non-Core', w: 110, get: r => (r.o as RtwOption).core ? 'Core' : 'Non Core' }, ...sizeCols('physical_stock_on_hand, pcs'), total],
    rows: options.flatMap(o => Object.entries(storeStockOf(o)).map(([h, by]) => ({ key: `${o.id}|${h}`, ...base(o), loc: holderName(h), by, total: Object.values(by).reduce((a, b) => a + b, 0) }))) };
  const sales: Tab = { id: 'sales', name: 'Sales', group: 'book', byStyle: true, grain: 'Product Weekly Report · one row per style × week', cols: [...keyCols(), { id: 'week', name: 'Week No', w: 80, get: r => r.week as string }, { id: 'ok', name: 'In stock', w: 80, get: r => r.ok ? 'yes' : 'broken', src: 'was every size available that week', tone: r => r.ok ? undefined : WARN }, ...sizeCols('Quantity ordered'), total],
    rows: options.flatMap(o => { const by = salesBySizeOf(o); const n = o.weeklySales.length; return Array.from({ length: n }, (_, w) => { const i = n - 1 - w; const row = Object.fromEntries(o.sizes.map(s => [s, by[s][i] ?? 0])); return { key: `${o.id}|${w}`, ...base(o), week: w === 0 ? 'LW' : `LW-${w}`, ok: o.inStockWeeks[i], by: row, total: o.weeklySales[i] ?? 0 }; }); }) };

  /* 6 · open orders, as the WIP tracker */
  const orders: Tab = { id: 'orders', name: 'Open orders', group: 'book', byStyle: true, grain: 'WIP tracker · one row per open order', cols: [...keyCols(),
    { id: 'po', name: 'PO No.', w: 110, get: r => r.po as string | null }, { id: 'order', name: 'Bom/ Jobcard', w: 110, get: r => r.order as string }, { id: 'vendor', name: 'Factory', w: 150, get: r => r.vendor as string | null }, { id: 'status', name: 'PO status', w: 120, get: r => r.status as string },
    { id: 'qty', name: 'Order Qty', w: 84, num: true, get: r => r.qty as number, sum: 'sum' }, { id: 'recd', name: 'Recd qty', w: 80, num: true, get: () => 0, sum: 'sum' }, { id: 'bal', name: 'Balance qty', w: 96, num: true, get: r => r.qty as number, sum: 'sum', formula: r => `Order Qty − Recd qty = ${r.qty} − 0 = ${r.qty}` }, { id: 'arrives', name: 'Shipment Inward Date', w: 150, get: r => r.arrives as string, src: 'Expected' }, { id: 'weeks', name: 'Weeks away', w: 90, num: true, get: r => r.weeks as number }, ...sizeCols('size breakup given'),
    { id: 'podate', name: 'PO Date', w: 100, get: r => r.poDate as string | null }, { id: 'cat', name: 'Category', w: 100, get: r => r.cat as string }, { id: 'sub2', name: 'Sub-Category 2', w: 130, get: r => r.sub2 as string }, { id: 'launch', name: 'Launch status', w: 110, get: r => r.launch as string | null }, { id: 'fit', name: 'FIT', w: 80, get: r => r.fit as string | null },
    { id: 'enigma', name: 'Enigma Code', w: 150, get: r => r.enigma as string | null }, { id: 'fvendor', name: 'Fabric Vendor', w: 150, get: r => r.fvendor as string | null }, { id: 'fcode', name: 'Vendor Fabric Code', w: 150, get: r => r.fcode as string | null }, { id: 'fabric', name: 'Fabric Ordered', w: 110, num: true, get: r => r.fabric as number | null, sum: 'sum', src: 'metres' }, { id: 'cost', name: 'Cost/pc', w: 80, num: true, get: r => r.cost as number, sum: 'avg' }, { id: 'issued', name: 'Style Issued date', w: 130, get: r => r.issued as string }],
    rows: options.flatMap(o => R.get(o.id)!.wip.map(w => { const x = w.order; return { key: x.id, ...base(o), po: w.poNo ?? null, order: x.id, vendor: db.vendors.find(v => v.id === x.vendorId)?.name ?? null, status: x.status, qty: w.qty, arrives: fmtDate(w.arrives), weeks: w.weeksAway, by: Object.fromEntries((w.breakup ?? []).map(b => [b.size, b.qty])),
      poDate: x.poDate ? fmtDate(x.poDate) : null, cat: x.category, sub2: x.subCategory, launch: x.launchMonth ?? x.program ?? null, fit: x.fit ?? null, enigma: x.enigmaCode, fvendor: db.vendors.find(v => v.id === x.fabricVendorId)?.name ?? null, fcode: x.vendorFabricCode, fabric: x.fabricMetres, cost: x.targetCost, issued: fmtDate(x.styleHandover) }; })) };

  const byId = new Map(options.map(o => [o.id, o]));
  const lost: Tab = { id: 'lost', name: 'Lost sales', group: 'book', byStyle: true, grain: 'RetailOS · one row per ask for a size that was out', cols: [...keyCols(), { id: 'on', name: 'Logged', w: 100, get: r => r.on as string }, { id: 'ago', name: 'Days ago', w: 80, num: true, get: r => r.ago as number }, { id: 'store', name: 'STORE', w: 150, get: r => r.store as string }, { id: 'size', name: 'Size', w: 60, get: r => r.size as string }, { id: 'by', name: 'By', w: 80, get: r => r.by as string }, { id: 'note', name: 'Note', w: 260, get: r => r.note as string }],
    rows: (db.lostSales ?? []).filter(l => byId.has(l.optionId)).sort((a, b) => b.on.localeCompare(a.on)).map(l => ({ key: l.id, ...base(byId.get(l.optionId)!), on: fmtDate(l.on), ago: daysAgo(l.on), store: holderName(l.storeId), size: l.size, by: l.by, note: l.note })) };
  const reviews: Tab = { id: 'reviews', name: 'Reviews', group: 'book', byStyle: true, grain: 'this PLM · one row per planning review', cols: [...keyCols(), { id: 'on', name: 'Reviewed', w: 100, get: r => r.on as string }, { id: 'by', name: 'By', w: 100, get: r => r.by as string }, { id: 'kind', name: 'Kind', w: 80, get: r => r.kind as string }, { id: 'status', name: 'Status', w: 90, get: r => r.status as string },
    { id: 'ros', name: 'Plan ROS', w: 80, num: true, get: r => r.ros as number }, { id: 'lead', name: 'Lead wk', w: 70, num: true, get: r => r.lead as number }, { id: 'draft', name: 'Draft qty', w: 80, num: true, get: r => r.draft as number, sum: 'sum' }, { id: 'approved', name: 'Approved', w: 84, num: true, get: r => r.approved as number | null, sum: 'sum' }, { id: 'grade', name: 'Grade', w: 60, get: r => r.grade as string | null }, { id: 'win', name: 'Window ends', w: 100, get: r => r.win as string | null }, { id: 'req', name: 'Requirement', w: 120, get: r => r.req as string | null }, { id: 'note', name: 'Note', w: 260, get: r => r.note as string }],
    rows: (db.planningReviews ?? []).filter(x => byId.has(x.optionId)).sort((a, b) => b.on.localeCompare(a.on)).map(x => ({ key: x.id, ...base(byId.get(x.optionId)!), on: fmtDate(x.on), by: x.by, kind: x.kind, status: x.status, ros: f1(x.planRos), lead: x.leadWeeks, draft: x.draftQty, approved: x.approvedQty, grade: x.grade ?? null, win: x.windowEndsOn ? fmtDate(x.windowEndsOn) : null, req: x.requirementId, note: x.constraintNote || x.note })) };

  /* 7 · the raw exports, last: nobody plans from them, everything above is built from them */
  const holders = STORES.filter(x => x.holdsRtwStock);
  const lineCols: Col[] = [...keyCols(), { id: 'day', name: 'Day', w: 100, get: r => r.day as string }, { id: 'order', name: 'Order name', w: 110, get: r => r.order as string }, { id: 'kind', name: 'Order or return', w: 110, get: () => 'order' }, { id: 'pos', name: 'POS location name', w: 150, get: r => r.pos as string }, { id: 'chan', name: 'Sales channel', w: 110, get: r => r.chan as string },
    { id: 'sku', name: 'Product variant SKU', w: 200, get: r => r.sku as string }, { id: 'vtitle', name: 'Product variant title', w: 120, get: r => r.vtitle as string }, { id: 'size', name: 'Size', w: 60, get: r => r.size as string }, { id: 'qty', name: 'Quantity ordered', w: 120, num: true, get: () => 1, sum: 'sum' }, { id: 'price', name: 'Product variant price', w: 140, num: true, get: r => r.price as number },
    { id: 'disc', name: 'Discounts', w: 90, num: true, get: r => r.disc as number, sum: 'sum' }, { id: 'total', name: 'Total sales', w: 100, num: true, get: r => r.net as number, sum: 'sum', formula: r => `Product variant price − Discounts = ${r.price} − ${r.disc} = ${r.net}` }, { id: 'rev', name: 'Revenue', w: 90, num: true, get: r => r.net as number, sum: 'sum' },
    { id: 'wk', name: 'Week No', w: 80, num: true, get: r => r.wk as number }, { id: 'onoff', name: 'Online/Offline', w: 110, get: r => r.chan === 'Online Store' ? 'Online' : 'Offline' }, { id: 'tb', name: 'Top/Bottom', w: 90, get: r => isBottoms((r.o as RtwOption).subCat1) ? 'Bottom' : 'Top' }, { id: 'cat', name: 'Category', w: 100, get: r => categoryOfOption(r.o as RtwOption) }, { id: 'sub1', name: 'Sub-Category 1', w: 140, get: r => (r.o as RtwOption).subCat1 }, { id: 'core', name: 'Core/NonCore', w: 100, get: r => (r.o as RtwOption).core ? 'Core' : 'Non Core' }];
  const weekNo = (d: Date) => Math.ceil(((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7);
  const lines: Tab = { id: 'lines', name: 'L4W Data', group: 'source', byStyle: true, grain: 'Product Weekly Report · one row per order line, as Shopify exports it (no customer columns)', cols: lineCols, rows: options.flatMap(o => { const by = salesBySizeOf(o); const n = o.weeklySales.length; const price = o.eoss ? (o.discountedMrp ?? Math.round(o.mrp * 0.8)) : o.mrp; const colour = (o.sku ?? '').split('-').slice(-1)[0] ?? ''; const out: Row[] = [];
    for (const sz of o.sizes) for (let w = 0; w < n; w++) { const i = n - 1 - w; for (let u = 0; u < (by[sz][i] ?? 0); u++) { const h = hash(`${o.id}|${sz}|${w}|${u}`); const online = h % 5 === 0; const st = holders[h % holders.length]; const d = new Date(TODAY); d.setDate(d.getDate() - 7 * w - (h >> 3) % 7); const disc = h % 7 === 0 ? Math.round(price * 0.1) : 0;
      out.push({ key: `${o.id}|${sz}|${w}|${u}`, ...base(o), day: fmtDate(d), order: `IND-${430000 + (h % 60000)}`, pos: online ? '' : st.name, chan: online ? 'Online Store' : 'Point of Sale', sku: o.sku ? `${o.sku}-${sz}` : '', vtitle: `${colour ? colour[0] + colour.slice(1).toLowerCase() : ''} / ${sz}`, size: sz, price, disc, net: price - disc, wk: weekNo(d) }); } }
    return out; }) };
  const binCols: Col[] = [...keyCols(), { id: 'pname', name: 'product_name', w: 220, get: r => r.style as string }, { id: 'pstyle', name: 'product_style', w: 190, get: r => r.sku as string }, { id: 'ptype', name: 'product_type', w: 110, get: r => categoryOfOption(r.o as RtwOption) }, { id: 'skuc', name: 'sku_code', w: 210, get: r => r.skuc as string }, { id: 'color', name: 'color', w: 90, get: r => r.color as string }, { id: 'size', name: 'size', w: 60, get: r => r.size as string },
    { id: 'sell', name: 'is_sellable', w: 90, get: r => r.sell as string }, { id: 'wh', name: 'warehouse_name', w: 150, get: r => r.wh as string }, { id: 'bin', name: 'bin_name', w: 100, get: r => r.bin as string }, { id: 'onhand', name: 'physical_stock_on_hand', w: 160, num: true, get: r => r.onhand as number, sum: 'sum' }, { id: 'res', name: 'physical_reserved_qty', w: 150, num: true, get: r => r.res as number, sum: 'sum', src: 'display and trial pieces held back' }, { id: 'act', name: 'Act Qty', w: 80, num: true, get: r => r.act as number, sum: 'sum', formula: r => `physical_stock_on_hand − physical_reserved_qty = ${r.onhand} − ${r.res} = ${r.act}` },
    { id: 'loc', name: 'Location', w: 110, get: r => r.wh === 'Factory Warehouse' ? 'WH' : 'Store' }, { id: 'sub1', name: 'Sub-Category 1', w: 140, get: r => (r.o as RtwOption).subCat1 }, { id: 'core', name: 'Core/Non-Core', w: 110, get: r => (r.o as RtwOption).core ? 'Core' : 'Non Core' }, { id: 'mrp', name: 'Original MRP', w: 100, num: true, get: r => (r.o as RtwOption).mrp }, { id: 'disp', name: 'Display status', w: 110, get: r => r.disp as string }, { id: 'drop', name: 'DROP', w: 70, get: r => r.drop as string }];
  const bins: Tab = { id: 'bins', name: 'Enigma Base', group: 'source', byStyle: true, grain: 'Enigma stock report · one row per SKU × warehouse × bin', cols: binCols, rows: options.flatMap(o => { const colour = (o.sku ?? '').split('-').slice(-1)[0] ?? ''; const drop = new Date(o.launchedAt).toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(); const out: Row[] = [];
    for (const [h, by] of Object.entries(storeStockOf(o))) for (const sz of o.sizes) { const q = by[sz] ?? 0; if (!q) continue; const k = hash(`${o.id}|${h}|${sz}`); const wh = holderName(h); const dam = k % 23 === 0 && q > 2 ? 1 : 0; const res = h !== 'warehouse' && q > 1 && k % 3 === 0 ? 1 : 0;
      const push = (bin: string, onhand: number, resv: number, sell: boolean) => out.push({ key: `${o.id}|${h}|${sz}|${bin}`, ...base(o), sku: o.sku ?? '', skuc: o.sku ? `${o.sku}-${sz}` : '', color: colour, size: sz, sell: sell ? 'TRUE' : 'FALSE', wh, bin, onhand, res: resv, act: onhand - resv, disp: daysAgo(o.launchedAt) < 56 ? 'Pending' : 'Live', drop });
      push(h === 'warehouse' ? `${String.fromCharCode(65 + k % 6)}-${String(1 + (k >> 4) % 12).padStart(2, '0')}-${String(1 + (k >> 8) % 8).padStart(2, '0')}` : 'FLOOR', q - dam, res, true); if (dam) push('DAM-01', dam, 0, false); }
    return out; }) };

  return [working, count, orderWork, health, stock, sales, orders, lost, reviews, lines, bins];
}

/* ── the screen ────────────────────────────────────────────────────────────────── */
const ROW_H = 30; const HEAD_H = 30; const NUM_W = 44;
const GROUP_LABEL = { work: 'The work', book: 'The book', source: 'Source data' } as const;

export function Sheet() {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const tabs = useMemo(() => workbook(db), [db]);
  const tabId = params.get('tab') ?? 'working'; const tab = tabs.find(t => t.id === tabId) ?? tabs[0];
  const pid = params.get('id');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [sel, setSel] = useState<{ key: string; col: string } | null>(null);
  const [top, setTop] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const setP = (k: string, v: string | null) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };
  const goTab = (id: string) => { setP('tab', id); setSort(null); setSel(null); setTop(0); box.current?.scrollTo({ top: 0, left: 0 }); };
  const frozen = tab.frozen ?? 2;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = tab.rows.filter(x => (!pid || !tab.byStyle || x.id === pid) && (!q || tab.cols.some(c => String(c.get(x) ?? '').toLowerCase().includes(q))));
    if (sort) { const c = tab.cols.find(c => c.id === sort.col)!; r = [...r].sort((a, b) => { const va = c.get(a), vb = c.get(b); if (va == null) return 1; if (vb == null) return -1; return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * sort.dir; }); }
    return r;
  }, [tab, pid, search, sort]);

  const pidRow = pid ? tabs[0].rows.find(r => r.id === pid) : undefined;
  const selRow = sel ? rows.find(r => r.key === sel.key) : null; const selCol = sel ? tab.cols.find(c => c.id === sel.col) : null;
  const selIdx = selRow ? rows.indexOf(selRow) : -1; const selColIdx = selCol ? tab.cols.indexOf(selCol) : -1;
  const lefts: number[] = []; tab.cols.slice(0, frozen).reduce((x, c) => { lefts.push(x); return x + c.w; }, NUM_W);
  const vh = 560; const first = Math.max(0, Math.floor(top / ROW_H) - 6); const last = Math.min(rows.length, first + Math.ceil(vh / ROW_H) + 12);
  const summary = (c: Col) => { if (!c.sum) return ''; const v = rows.map(c.get).filter((x): x is number => typeof x === 'number'); if (!v.length) return ''; const s = v.reduce((a, b) => a + b, 0); return c.sum === 'sum' ? s.toLocaleString('en-IN') : `avg ${f1(s / v.length)}`; };
  const faint = { color: 'var(--ink-faint)' } as const;
  const line = '1px solid var(--line-soft)';
  const headCell = (c: Col, i: number, sticky: boolean): React.CSSProperties => ({ position: 'sticky', top: 0, left: sticky ? lefts[i] : undefined, zIndex: sticky ? 4 : 3, width: c.w, minWidth: c.w, maxWidth: c.w, height: HEAD_H, background: selColIdx === i ? 'color-mix(in srgb, var(--accent) 14%, var(--surface-2))' : 'var(--surface-2)', borderRight: line, borderBottom: '1px solid var(--line)', padding: '0 8px', fontSize: 11, textTransform: 'none', letterSpacing: 0, cursor: 'pointer', textAlign: c.num ? 'right' : 'left', userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
  const tabBtn = (t: Tab): ReactNode => { const n = pid && t.byStyle ? t.rows.filter(r => r.id === pid).length : t.rows.length; const on = t.id === tab.id;
    return <button key={t.id} onClick={() => goTab(t.id)} className="text-[12px]" style={{ padding: '0 12px', height: 30, marginBottom: -1, whiteSpace: 'nowrap', flexShrink: 0, background: on ? '#fff' : 'transparent', color: on ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: on ? 600 : 500, border: on ? '1px solid var(--line)' : '1px solid transparent', borderBottom: on ? '1px solid #fff' : undefined, borderRadius: '6px 6px 0 0' }}>
      {t.name} <span style={{ ...faint, fontWeight: 400 }}>{n.toLocaleString('en-IN')}</span></button>; };

  return <Page title="Sheet · the planners' workbook" lede="The sheets in the order the planner works them: the Working row per style, the Option count that can override it, the Order working by size; then the health row, the pivots and the trackers; the raw exports last. One key, the Shiphero Style Name: click it and every tab filters to that style. Click a header to sort; click a cell to see how it was computed." replaces="VLOOKUPs between the Enigma stock report, the Product Weekly Report, the ROS & health Report, the Recce working and the WIP tracker">
    {/* toolbar */}
    <div className="flex flex-wrap items-center gap-2 mb-2">
      <Input placeholder={`Search in ${tab.name}`} value={search} onChange={e => { setSearch(e.target.value); setTop(0); }} style={{ width: 240 }} />
      {pid && <span className="pill accent flex items-center gap-1">🔗 {pidRow ? `${pidRow.style as string}` : pid}<button className="ml-1" title="Show all styles" onClick={() => setP('id', null)}>×</button></span>}
      {sort && <span className="pill">Sorted by {tab.cols.find(c => c.id === sort.col)?.name} {sort.dir > 0 ? '↑' : '↓'}<button className="ml-1" onClick={() => setSort(null)}>×</button></span>}
      <span className="text-[12px]" style={faint}>{rows.length.toLocaleString('en-IN')} rows · {tab.cols.length} columns · {tab.grain}</span>
      <div className="ml-auto flex gap-2 items-center">
        {pid && <a className="cta" href={`#/planning?open=${pid}`}>Open in planning →</a>}
        <ExportButton filename={`sheet-${tab.id}`} sheetName={tab.name} rows={rows} cols={tab.cols.map(c => ({ label: c.name, get: (r: Row) => c.get(r) }))} />
      </div>
    </div>

    {/* formula bar */}
    <div className="flex items-center gap-2 text-[12px] font-mono px-2 mb-2" style={{ border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface)', height: 32 }}>
      <span style={{ minWidth: 90, color: 'var(--ink-soft)' }}>{sel && selRow ? `${tab.name}!${letter(selColIdx)}${selIdx + 1}` : '—'}</span>
      <span style={{ borderLeft: '1px solid var(--line)', height: 20 }} />
      <span className="truncate">{sel && selRow && selCol ? (selCol.formula ? `= ${selCol.formula(selRow)}` : `${selCol.get(selRow) ?? ''}${selCol.src ? `   · ${selCol.src}` : ''}`) : <span style={faint}>Click a cell: computed columns show their formula here, looked-up ones say which sheet they came from</span>}</span>
    </div>

    {/* grid */}
    <div className="card" style={{ overflow: 'hidden' }}>
      <div ref={box} onScroll={e => setTop((e.target as HTMLDivElement).scrollTop)} style={{ overflow: 'auto', height: vh, position: 'relative', background: '#fff' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, tableLayout: 'fixed', width: NUM_W + tab.cols.reduce((a, c) => a + c.w, 0) }}>
          <thead>
            <tr>
              <th style={{ ...headCell({ id: '#', name: '', w: NUM_W, get: () => null }, -1, false), left: 0, zIndex: 5, textAlign: 'center' }} />
              {tab.cols.map((c, i) => <th key={c.id} title={c.src ?? c.name} style={headCell(c, i, i < frozen)} onClick={() => setSort(s => s?.col === c.id ? (s.dir > 0 ? { col: c.id, dir: -1 } : null) : { col: c.id, dir: 1 })}>
                <span style={{ ...faint, marginRight: 6, fontWeight: 400 }}>{letter(i)}</span>{c.name}{sort?.col === c.id && <span className="ml-1">{sort.dir > 0 ? '↑' : '↓'}</span>}
              </th>)}
            </tr>
          </thead>
          <tbody>
            {first > 0 && <tr style={{ height: first * ROW_H }}><td /></tr>}
            {rows.slice(first, last).map((r, k) => { const i = first + k; const isSelRow = sel?.key === r.key; const blockStart = tab.id === 'order' && r.mi === 0;
              return <tr key={r.key} style={{ height: ROW_H }}>
                <td style={{ position: 'sticky', left: 0, zIndex: 2, width: NUM_W, background: isSelRow ? 'color-mix(in srgb, var(--accent) 14%, var(--surface-2))' : 'var(--surface-2)', borderRight: line, borderBottom: line, borderTop: blockStart ? '2px solid var(--line)' : undefined, textAlign: 'center', fontSize: 11, color: 'var(--ink-soft)' }}>{i + 1}</td>
                {tab.cols.map((c, ci) => { const v = c.get(r); const isSel = isSelRow && sel?.col === c.id; const sticky = ci < frozen; const tone = c.tone?.(r); const blockDup = tab.id === 'order' && ci < 2 && r.mi !== 0;
                  return <td key={c.id} onClick={() => setSel({ key: r.key, col: c.id })} style={{ position: sticky ? 'sticky' : undefined, left: sticky ? lefts[ci] : undefined, zIndex: sticky ? 1 : undefined, width: c.w, minWidth: c.w, maxWidth: c.w, padding: '0 8px', borderRight: sticky && ci === frozen - 1 ? '1px solid var(--line)' : line, borderBottom: line, borderTop: blockStart ? '2px solid var(--line)' : undefined, textAlign: c.num ? 'right' : 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums', background: isSel ? 'color-mix(in srgb, var(--accent) 10%, #fff)' : isSelRow ? 'color-mix(in srgb, var(--accent) 4%, #fff)' : sticky ? '#fff' : undefined, boxShadow: isSel ? 'inset 0 0 0 2px var(--accent)' : undefined, color: tone ?? (v == null || v === '' ? 'var(--ink-faint)' : undefined), fontWeight: tone ? 600 : undefined, cursor: 'cell' }}>
                    {blockDup ? '' : c.link ? <button title="Filter every tab to this style" style={{ color: 'var(--accent)', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3, fontWeight: 500 }} onClick={e => { e.stopPropagation(); setP('id', pid === r.id ? null : r.id); setTop(0); }}>{String(v)}</button>
                      : v == null || v === '' ? '' : typeof v === 'number' ? v.toLocaleString('en-IN') : String(v)}
                  </td>; })}
              </tr>; })}
            {last < rows.length && <tr style={{ height: (rows.length - last) * ROW_H }}><td /></tr>}
            {rows.length === 0 && <tr style={{ height: 80 }}><td colSpan={tab.cols.length + 1} style={{ ...faint, padding: 16 }}>No rows{pidRow ? ` for ${pidRow.style as string}` : ''} in {tab.name}.</td></tr>}
          </tbody>
          <tfoot>
            <tr style={{ height: ROW_H }}>
              <td style={{ position: 'sticky', bottom: 0, left: 0, zIndex: 5, background: 'var(--surface-2)', borderTop: '1px solid var(--line)', borderRight: line, fontSize: 10, textAlign: 'center', color: 'var(--ink-soft)' }}>Σ</td>
              {tab.cols.map((c, i) => <td key={c.id} style={{ position: 'sticky', bottom: 0, left: i < frozen ? lefts[i] : undefined, zIndex: i < frozen ? 4 : 3, background: 'var(--surface-2)', borderTop: '1px solid var(--line)', borderRight: line, padding: '0 8px', fontSize: 11, textAlign: c.num ? 'right' : 'left', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{i === 0 ? `${rows.length.toLocaleString('en-IN')} rows` : summary(c)}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
      {/* sheet tabs, like the bottom of a workbook, in three groups */}
      <div className="flex items-end px-2" style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--line)', height: 36, overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {(['work', 'book', 'source'] as const).map((g, gi) => <span key={g} className="flex items-end" style={{ borderLeft: gi ? '1px solid var(--line)' : undefined, marginLeft: gi ? 8 : 0, paddingLeft: gi ? 8 : 0 }}>
          <span className="text-[10px] uppercase pb-2 pr-2" style={{ ...faint, letterSpacing: '.05em', flexShrink: 0 }}>{GROUP_LABEL[g]}</span>{tabs.filter(t => t.group === g).map(tabBtn)}</span>)}
        <span className="ml-auto text-[11px] pb-2 pl-3" style={{ ...faint, flexShrink: 0 }}>joined on Shiphero Style Name · column A</span>
      </div>
    </div>
    {pid && <div className="mt-2"><Button variant="ghost" size="sm" onClick={() => setP('id', null)}>Show all styles</Button></div>}
  </Page>;
}
