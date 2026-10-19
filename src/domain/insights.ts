/* Planning insights — the analyses BSC cannot run today without opening orders
   one by one: which colours, fabrics and books are selling more and more, how
   RTW sells through by category, colour and size, what customers actually pick
   on the order sheet, and where returns come from. Everything here is computed
   from the same records the rest of the tool writes; nothing is a second copy. */
import type { Db, RtwOption } from './types';
import { STORES, SHEET_OPTIONS } from './reference';
import { healthOf, daysAgo, sellThroughOf, styleOfOption } from './engines';

const COLOURS = ['White', 'Ecru', 'Off White', 'Black', 'Charcoal', 'Grey', 'Light Grey', 'Dark Grey', 'Navy', 'Blue', 'Light Blue', 'Mid Blue', 'Dark Blue', 'Sky', 'Teal', 'Green', 'Olive', 'Sage', 'Khaki', 'Beige', 'Fawn', 'Brown', 'Coffee', 'Rust', 'Brick', 'Maroon', 'Pink', 'Lavender', 'Purple', 'Mauve', 'Yellow', 'Ochre', 'Mustard', 'Orange', 'Red', 'Indigo', 'Multi'];
/** the colour a name carries — "Cotton Poplin - White", "Olive Washed Dobby Shirt", "Elevate Everyday Stretch Chinos - Navy" */
export function colourOf(name: string): string {
  const tail = name.includes(' - ') ? name.split(' - ').pop()! : name;
  const words = tail.replace(/&/g, ' ').split(/\s+/);
  for (let n = 2; n >= 1; n--) for (let i = 0; i + n <= words.length; i++) { const w = words.slice(i, i + n).join(' '); const hit = COLOURS.find(c => c.toLowerCase() === w.toLowerCase()); if (hit) return hit; }
  const head = name.split(/\s+/)[0]; const h2 = COLOURS.find(c => c.toLowerCase() === head.toLowerCase());
  return h2 ?? 'Other';
}

export interface TrendRow { key: string; n: number; recent: number; prior: number; total: number; change: number; weeks: number[] }
/** last 4 weeks against the 4 before — "more and more" is a number, not a feeling */
function trendRows(groups: Map<string, number[][]>): TrendRow[] {
  return [...groups.entries()].map(([key, series]) => {
    const weeks = Array.from({ length: 12 }, (_, i) => series.reduce((a, s) => a + (s[i] ?? 0), 0));
    const recent = weeks.slice(-4).reduce((a, b) => a + b, 0); const prior = weeks.slice(-8, -4).reduce((a, b) => a + b, 0);
    return { key, n: series.length, recent, prior, total: weeks.reduce((a, b) => a + b, 0), change: prior > 0 ? (recent - prior) / prior : recent > 0 ? 1 : 0, weeks };
  }).sort((a, b) => b.recent - a.recent);
}
const group = <T,>(xs: T[], key: (x: T) => string, series: (x: T) => number[]) => { const m = new Map<string, number[][]>(); xs.forEach(x => { const k = key(x); m.set(k, [...(m.get(k) ?? []), series(x)]); }); return trendRows(m); };

export function mtmInsights(db: Db) {
  const fabrics = db.fabrics.filter(f => f.bucket !== 'BESPOKE');
  const byColour = group(fabrics, f => colourOf(f.name), f => f.weeklySalesShirts);
  const byFamily = group(fabrics, f => f.family, f => f.weeklySalesShirts);
  const byBook = group(fabrics.filter(f => f.swatchBook), f => f.swatchBook!, f => f.weeklySalesShirts);
  const byBucket = group(db.fabrics, f => f.bucket === 'CORE' ? 'Core' : f.bucket === 'NON_CORE' ? 'Non-core' : 'Bespoke', f => f.weeklySalesShirts);
  const byVendor = group(fabrics, f => db.vendors.find(v => v.id === f.vendorId)?.name ?? '—', f => f.weeklySalesShirts);
  /* every fabric on its own — the screen filters this rather than keeping three cuts of it */
  const byFabric = group(fabrics, f => f.name, f => f.weeklySalesShirts);
  const top = byFabric.slice(0, 12);
  const rising = byFabric.filter(r => r.prior >= 4).sort((a, b) => b.change - a.change).slice(0, 8);
  const falling = byFabric.filter(r => r.prior >= 8).sort((a, b) => a.change - b.change).slice(0, 8);
  /* what customers pick on the order sheet — every MTM order's spec, last 30 days */
  const mtm = (db.customerOrders ?? []).filter(o => o.kind === 'MTM' && o.spec && daysAgo(o.punchedOn) <= 30);
  const picks = SHEET_OPTIONS.filter(o => ['collar', 'cuff', 'placket', 'pocket', 'sleeves', 'buttons', 'back', 'bottomCut', 'monogram'].includes(o.key)).map(o => {
    const counts = new Map<string, number>(); mtm.forEach(x => { const v = x.spec![o.key]; counts.set(v, (counts.get(v) ?? 0) + 1); });
    return { key: o.key, label: o.label, total: mtm.length, values: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ v, n, share: mtm.length ? n / mtm.length : 0 })) };
  });
  const fits = new Map<string, number>(); mtm.forEach(x => fits.set(x.fit ?? '—', (fits.get(x.fit ?? '—') ?? 0) + 1));
  const tags = new Map<string, number>(); mtm.forEach(x => tags.set(x.tag, (tags.get(x.tag) ?? 0) + 1));
  return { byColour, byFamily, byBook, byBucket, byVendor, byFabric, top, rising, falling, picks, fits: [...fits.entries()].sort((a, b) => b[1] - a[1]), tags: [...tags.entries()].sort((a, b) => b[1] - a[1]), orders30: mtm.length };
}

export function rtwInsights(db: Db) {
  const opts = db.options;
  const sold12 = (o: RtwOption) => o.weeklySales.reduce((a, b) => a + b, 0);
  const stockOf = (o: RtwOption) => Object.values(o.stockBySize).reduce((a, b) => a + b, 0);
  const rows = (key: (o: RtwOption) => string) => {
    const m = new Map<string, RtwOption[]>(); opts.forEach(o => { const k = key(o); m.set(k, [...(m.get(k) ?? []), o]); });
    return [...m.entries()].map(([k, os]) => {
      const sold = os.reduce((a, o) => a + sold12(o), 0); const stock = os.reduce((a, o) => a + stockOf(o), 0);
      const recent = os.reduce((a, o) => a + o.weeklySales.slice(-4).reduce((x, y) => x + y, 0), 0); const prior = os.reduce((a, o) => a + o.weeklySales.slice(-8, -4).reduce((x, y) => x + y, 0), 0);
      const hs = os.map(healthOf); const healthy = hs.filter(h => h.health === 'Healthy').length;
      return { key: k, n: os.length, sold, stock, sellThru: sold + stock > 0 ? sold / (sold + stock) : 0, recent, prior, change: prior > 0 ? (recent - prior) / prior : recent > 0 ? 1 : 0, healthy, sizeFill: hs.filter(h => h.action === 'SIZE FILL').length, liquidate: hs.filter(h => h.action === 'LIQUIDATE' || h.action === 'EXIT' || h.action === 'CLEAR / DISCOUNT').length, weeks: Array.from({ length: 12 }, (_, i) => os.reduce((a, o) => a + (o.weeklySales[i] ?? 0), 0)) };
    }).sort((a, b) => b.sold - a.sold);
  };
  const bySub = rows(o => o.subCat1);
  const byColour = rows(o => colourOf(o.styleName));
  const byVendor = rows(o => db.vendors.find(v => v.id === o.vendorId)?.name ?? 'unknown factory');
  const byStyle = rows(o => styleOfOption(o)).filter(x => x.n >= 2);
  /* sell-through the way BSC defines it, where the PO is on record */
  const stByOption = opts.map(o => ({ o, st: sellThroughOf(db, o) }));
  const stKnown = stByOption.filter(x => x.st.known);
  const stBySub = new Map<string, { known: number; total: number; sold: number; ordered: number }>();
  stByOption.forEach(({ o, st }) => { const v = stBySub.get(o.subCat1) ?? { known: 0, total: 0, sold: 0, ordered: 0 }; v.total++; if (st.known) { v.known++; v.sold += st.sold; v.ordered += st.ordered; } stBySub.set(o.subCat1, v); });
  const shirts = opts.filter(o => !/pant|chino|jean/i.test(o.subCat1)); const bottoms = opts.filter(o => /pant|chino|jean/i.test(o.subCat1));
  const sizeRows = (os: RtwOption[]) => { const sizes = [...new Set(os.flatMap(o => o.sizes))].sort((a, b) => Number(a) - Number(b));
    return sizes.map(sz => { const carrying = os.filter(o => o.sizes.includes(sz)); const out = carrying.filter(o => (o.stockBySize[sz] ?? 0) === 0); const stock = carrying.reduce((a, o) => a + (o.stockBySize[sz] ?? 0), 0);
      return { size: sz, carrying: carrying.length, out: out.length, outShare: carrying.length ? out.length / carrying.length : 0, stock }; }); };
  const top = [...opts].sort((a, b) => sold12(b) - sold12(a)).slice(0, 10).map(o => ({ o, sold: sold12(o), stock: stockOf(o), h: healthOf(o) }));
  const rising = opts.map(o => { const r = o.weeklySales.slice(-4).reduce((a, b) => a + b, 0), p = o.weeklySales.slice(-8, -4).reduce((a, b) => a + b, 0); return { o, r, p, change: p > 0 ? (r - p) / p : r > 0 ? 1 : 0 }; }).filter(x => x.p >= 6).sort((a, b) => b.change - a.change).slice(0, 8);
  const all = opts.map(healthOf);
  return { bySub, byColour, byVendor, byStyle, stBySub, stKnown: stKnown.length, shirtSizes: sizeRows(shirts), bottomSizes: sizeRows(bottoms), top, rising, totals: { options: opts.length, healthy: all.filter(h => h.health === 'Healthy').length, sold: opts.reduce((a, o) => a + sold12(o), 0), stock: opts.reduce((a, o) => a + stockOf(o), 0) } };
}

export function storeInsights(db: Db) {
  const os = (db.customerOrders ?? []).filter(o => daysAgo(o.punchedOn) <= 30);
  const byStore = STORES.map(s => { const mine = os.filter(o => o.storeId === s.id); return { store: s, mtm: mine.filter(o => o.kind === 'MTM').length, rtw: mine.filter(o => o.kind !== 'MTM').length, urgent: mine.filter(o => o.tag === 'urgent').length, alteration: mine.filter(o => (o.revisions?.length ?? 0) > 0).length, changes: mine.reduce((a, o) => a + (o.revisions?.length ?? 0), 0) }; })
    .filter(r => r.mtm + r.rtw > 0).sort((a, b) => (b.mtm + b.rtw) - (a.mtm + a.rtw));
  const byRegion = new Map<string, { mtm: number; rtw: number }>(); byStore.forEach(r => { const k = r.store.region; const v = byRegion.get(k) ?? { mtm: 0, rtw: 0 }; v.mtm += r.mtm; v.rtw += r.rtw; byRegion.set(k, v); });
  const returns = db.returns; const byReason = new Map<string, number>(); returns.forEach(r => byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1));
  const byStyle = new Map<string, number>(); returns.forEach(r => byStyle.set(r.styleName, (byStyle.get(r.styleName) ?? 0) + 1));
  const changeFields = new Map<string, number>(); (db.customerOrders ?? []).forEach(o => (o.revisions ?? []).forEach(r => r.changes.forEach(c => changeFields.set(c.field, (changeFields.get(c.field) ?? 0) + 1))));
  return { byStore, byRegion: [...byRegion.entries()], byReason: [...byReason.entries()].sort((a, b) => b[1] - a[1]), repeatStyles: [...byStyle.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]), changeFields: [...changeFields.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8), orders30: os.length };
}
