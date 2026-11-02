/* Analysis (2 Nov 2026) — the planners' sheets as one queryable set of facts.
   The folder BSC sent holds the same data at four grains: stock by style × size × location
   (Enigma stock report), sales by style × size × week (Product Weekly Report), open orders by
   style (the WIP tracker), and a health row per style (ROS & health, Recce). Every pivot the
   planners build by hand in those sheets is a query over these facts: pick the rows, the
   columns, the measure and the filters. The question box turns plain words into the same
   query and shows how it read them, so nothing is hidden behind the answer. */
import type { Db, RtwOption } from './types';
import { salesBySizeOf, storeStockOf, healthRowOf, wipOf, daysAgo } from './engines';
import { STORES, isBottoms } from './reference';

export type Dim = 'category' | 'subCat1' | 'subCat2' | 'style' | 'size' | 'core' | 'location' | 'week' | 'healthy' | 'eoss';
export type Measure = 'stock' | 'mainStock' | 'units' | 'revenue' | 'l4w' | 'aws' | 'wc' | 'options' | 'unhealthy' | 'wip';
export type Cols = Dim | 'period' | null;
export interface Query { rows: Dim[]; cols: Cols; measure: Measure; filters: Partial<Record<Dim, string[]>>; weeks: number; top: number | null; sort: 'desc' | 'asc' }

export const DIM_LABEL: Record<Dim, string> = { category: 'Category', subCat1: 'Sub-Category 1', subCat2: 'Sub-Category 2', style: 'Style', size: 'Size', core: 'Core / Non-core', location: 'Location', week: 'Week', healthy: 'Healthy or not', eoss: 'EOSS' };
export const MEASURE_LABEL: Record<Measure, string> = { stock: 'Stock · pcs', mainStock: 'Main-size stock · pcs', units: 'Sales · units', revenue: 'Sales · ₹', l4w: 'L4W · units a week', aws: 'AWS · units a week', wc: 'WC · weeks of cover', options: 'Options · count', unhealthy: 'Unhealthy options · count', wip: 'On order · pcs' };
const STOCK_MEASURES: Measure[] = ['stock', 'mainStock', 'wc', 'options', 'unhealthy', 'wip', 'aws'];
export const isSalesMeasure = (m: Measure) => !STOCK_MEASURES.includes(m);
export const PERIODS = ['LW', 'LW-1', 'LW-2', 'LW-3', 'L4W avg', 'L12W avg'] as const;

/* the sheets' Category column, read off Sub-Category 1 */
export const categoryOfOption = (o: Pick<RtwOption, 'subCat1' | 'subCat2' | 'styleName'>) =>
  /jean/i.test(o.subCat1) ? 'Jeans' : /chino|corduroy|linen pant|lounge|wide leg|fatigue/i.test(o.subCat1) ? 'Casual Pants' : isBottoms(`${o.subCat1} ${o.subCat2} ${o.styleName}`) ? 'Formal Pants' : 'RTW Shirts';

export interface Fact { o: RtwOption; category: string; subCat1: string; subCat2: string; style: string; core: string; healthy: string; eoss: string; size: string; location: string; week: number | null; stock: number; units: number; revenue: number }
export interface OptionAttrs { aws: number; wip: number; main: Set<string>; healthy: boolean }

/** The long table: one row per style × size × location for stock (week null), one per style × size × week for sales (location '—'). */
export function factsOf(db: Db): { facts: Fact[]; attrs: Map<string, OptionAttrs> } {
  const facts: Fact[] = []; const attrs = new Map<string, OptionAttrs>();
  const storeName = (id: string) => id === 'warehouse' ? 'Factory Warehouse' : STORES.find(s => s.id === id)?.name ?? id;
  for (const o of db.options) {
    if (o.inactive) continue;
    const h = healthRowOf(o);
    const wip = wipOf(db, o).filter(w => w.firm).reduce((a, w) => a + w.qty, 0);
    attrs.set(o.id, { aws: h.aws, wip, main: new Set(h.main), healthy: h.healthy });
    const base = { o, category: categoryOfOption(o), subCat1: o.subCat1, subCat2: o.subCat2, style: o.styleName, core: o.core ? 'Core' : 'Non-core', healthy: h.healthy ? 'Healthy' : 'Unhealthy', eoss: o.eoss ? 'On sale' : 'Full price' };
    const price = o.eoss ? (o.discountedMrp ?? Math.round(o.mrp * 0.8)) : o.mrp;
    const byHolder = storeStockOf(o);
    for (const [holder, sizes] of Object.entries(byHolder)) for (const sz of o.sizes) {
      const q = sizes[sz] ?? 0; if (!q) continue;
      facts.push({ ...base, size: sz, location: storeName(holder), week: null, stock: q, units: 0, revenue: 0 });
    }
    const bySize = salesBySizeOf(o); const n = o.weeklySales.length;
    for (const sz of o.sizes) bySize[sz].forEach((u, i) => { if (!u) return; facts.push({ ...base, size: sz, location: '—', week: n - 1 - i, stock: 0, units: u, revenue: u * price }); });
  }
  return { facts, attrs };
}

export interface PivotRow { key: string[]; cells: Record<string, number>; total: number }
export interface Pivot { q: Query; colKeys: string[]; rows: PivotRow[]; grand: Record<string, number>; grandTotal: number; optionCount: number }

const weekLabel = (w: number) => w === 0 ? 'LW' : `LW-${w}`;
const dimValue = (f: Fact, d: Dim) => d === 'week' ? (f.week == null ? '—' : weekLabel(f.week)) : d === 'location' ? f.location : String(f[d]);

/** Run a query over the facts. Stock measures read the stock rows, sales measures the sales rows inside the week window. */
export function pivot(db: Db, data: ReturnType<typeof factsOf>, q: Query): Pivot {
  const sales = isSalesMeasure(q.measure);
  const colDim = q.cols === 'period' ? null : q.cols;
  const pass = (f: Fact) => (Object.entries(q.filters) as [Dim, string[]][]).every(([d, vals]) => !vals?.length || vals.includes(dimValue(f, d)));
  const subset = data.facts.filter(f => (q.cols === 'period' ? f.week != null : sales ? f.week != null && f.week < q.weeks : f.week == null) && pass(f));
  type Bucket = { facts: Fact[]; options: Set<string> };
  const groups = new Map<string, { key: string[]; cols: Map<string, Bucket> }>();
  for (const f of subset) {
    const key = q.rows.map(d => dimValue(f, d)); const k = key.join('\u0001');
    const g = groups.get(k) ?? { key, cols: new Map() }; groups.set(k, g);
    const ck = q.cols === 'period' ? '*' : colDim ? dimValue(f, colDim) : '*';
    const b = g.cols.get(ck) ?? { facts: [], options: new Set() }; g.cols.set(ck, b);
    b.facts.push(f); b.options.add(f.o.id);
  }
  const value = (b: Bucket, m: Measure, weeks?: [number, number]): number => {
    const fs = weeks ? b.facts.filter(f => f.week != null && f.week >= weeks[0] && f.week < weeks[1]) : b.facts;
    const opts = [...b.options].map(id => data.attrs.get(id)!);
    switch (m) {
      case 'stock': return fs.reduce((a, f) => a + f.stock, 0);
      case 'mainStock': return fs.reduce((a, f) => a + (data.attrs.get(f.o.id)!.main.has(f.size) ? f.stock : 0), 0);
      case 'units': return fs.reduce((a, f) => a + f.units, 0);
      case 'revenue': return fs.reduce((a, f) => a + f.revenue, 0);
      case 'l4w': return fs.filter(f => f.week != null && f.week < 4).reduce((a, f) => a + f.units, 0) / 4;
      case 'aws': return opts.reduce((a, x) => a + x.aws, 0);
      case 'wc': { const aws = opts.reduce((a, x) => a + x.aws, 0); const main = fs.reduce((a, f) => a + (data.attrs.get(f.o.id)!.main.has(f.size) ? f.stock : 0), 0); return aws > 0 ? main / aws : 0; }
      case 'options': return b.options.size;
      case 'unhealthy': return opts.filter(x => !x.healthy).length;
      case 'wip': return opts.reduce((a, x) => a + x.wip, 0);
    }
  };
  const periodValue = (b: Bucket, p: string) => p === 'LW' ? value(b, q.measure, [0, 1]) : p === 'LW-1' ? value(b, q.measure, [1, 2]) : p === 'LW-2' ? value(b, q.measure, [2, 3]) : p === 'LW-3' ? value(b, q.measure, [3, 4]) : p === 'L4W avg' ? value(b, q.measure, [0, 4]) / 4 : value(b, q.measure, [0, 12]) / 12;
  const colKeys = q.cols === 'period' ? [...PERIODS] : colDim ? [...new Set(subset.map(f => dimValue(f, colDim)))].sort(colDim === 'size' ? sizeSort : colDim === 'week' ? weekSort : undefined) : ['*'];
  let rows: PivotRow[] = [...groups.values()].map(g => {
    const cells: Record<string, number> = {};
    if (q.cols === 'period') { const b = g.cols.get('*'); for (const p of PERIODS) cells[p] = b ? periodValue(b, p) : 0; }
    else for (const ck of colKeys) { const b = g.cols.get(ck); cells[ck] = b ? value(b, q.measure) : 0; }
    /* a total across columns only makes sense for additive measures; for rates and cover recompute on the merged bucket */
    const merged: Bucket = { facts: [...g.cols.values()].flatMap(b => b.facts), options: new Set([...g.cols.values()].flatMap(b => [...b.options])) };
    const total = q.cols === 'period' ? cells['LW'] : value(merged, q.measure);
    return { key: g.key, cells, total };
  });
  rows.sort((a, b) => q.sort === 'asc' ? a.total - b.total : b.total - a.total);
  if (q.rows.includes('size') && q.rows.length === 1) rows.sort((a, b) => sizeSort(a.key[0], b.key[0]));
  if (q.rows.includes('week') && q.rows.length === 1) rows.sort((a, b) => weekSort(a.key[0], b.key[0]));
  if (q.top) rows = rows.slice(0, q.top);
  const all: Bucket = { facts: subset, options: new Set(subset.map(f => f.o.id)) };
  const grand: Record<string, number> = {};
  if (q.cols === 'period') for (const p of PERIODS) grand[p] = periodValue(all, p);
  else for (const ck of colKeys) { const b: Bucket = { facts: subset.filter(f => (colDim ? dimValue(f, colDim) : '*') === ck), options: new Set() }; b.facts.forEach(f => b.options.add(f.o.id)); grand[ck] = value(b, q.measure); }
  return { q, colKeys, rows, grand, grandTotal: q.cols === 'period' ? grand['LW'] : value(all, q.measure), optionCount: all.options.size };
}

const SIZE_ORDER = ['28', '30', '31', '32', '33', '34', '35', '36', '38', '40', '42', '44', '46', '48', '50', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
const sizeSort = (a: string, b: string) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b);
const weekSort = (a: string, b: string) => (a === 'LW' ? 0 : Number(a.slice(3))) - (b === 'LW' ? 0 : Number(b.slice(3)));

/* ---------- the question box: plain words → the same query, with the reading shown ----------
   A rule reader for the prototype. In the build this is the place an AI model turns the
   question into the query; the reading and the SQL stay on screen either way, so the
   planner can see what was asked of the data before trusting the answer. */
export function parseQuestion(text: string, db: Db): { q: Query; reading: string[]; sql: string } {
  const t = ` ${text.toLowerCase().replace(/[?,.]/g, ' ')} `;
  const has = (re: RegExp) => re.test(t);
  const q: Query = { rows: [], cols: null, measure: 'stock', filters: {}, weeks: 4, top: null, sort: 'desc' };
  const reading: string[] = [];

  /* measure */
  if (has(/\b(revenue|value|rupees|₹|sales value)\b/)) q.measure = 'revenue';
  else if (has(/\b(sold|sales|units|selling|sell|sale)\b/) && !has(/\bon sale\b/)) q.measure = 'units';
  else if (has(/\b(cover|weeks of cover|wc)\b/)) q.measure = 'wc';
  else if (has(/\b(ros|rate of sale|per week|a week|weekly rate|l4w)\b/)) q.measure = 'l4w';
  else if (has(/\baws\b/)) q.measure = 'aws';
  else if (has(/\b(wip|on order|in production|open orders?|incoming)\b/)) q.measure = 'wip';
  else if (has(/\b(how many|count of|number of)\b.*\bunhealthy\b/)) q.measure = 'unhealthy';
  else if (has(/\b(how many|count of|number of|options|styles)\b/) && !has(/\b(stock|inventory|pieces)\b/)) q.measure = 'options';
  else if (has(/\bmain size/)) q.measure = 'mainStock';
  else q.measure = 'stock';
  /* "which options …" wants the list, not a count */
  if (has(/\bwhich\b|\blist\b|\bshow me\b/) && q.measure === 'options') q.measure = 'stock';
  reading.push(`Measure: ${MEASURE_LABEL[q.measure]}`);

  /* rows and columns */
  const dimWords: [RegExp, Dim][] = [[/\b(by|per|each|every) (size|sizes)\b|size[- ]wise/, 'size'], [/\b(by|per|each|every) (store|stores|location|locations|warehouse)\b|store[- ]wise/, 'location'], [/\b(by|per|each|every) (week|weeks)\b|week[- ]wise|week by week/, 'week'], [/\b(by|per|each|every) sub[- ]?cat(egory)?( 1)?\b/, 'subCat1'], [/\b(by|per|each|every) sub[- ]?cat(egory)? 2\b/, 'subCat2'], [/\b(by|per|each|every) category\b/, 'category'], [/\b(by|per|each|every) (style|styles|option|options)\b/, 'style'], [/\b(by|per) core\b|core vs non/, 'core'], [/\b(by|per) health/, 'healthy']];
  const dims = dimWords.filter(([re]) => has(re)).map(([, d]) => d);
  if (has(/\b(vs|versus|compared?|against) (last week|lw|the week before)\b|\blw-1\b|week on week/)) q.cols = 'period';
  for (const d of dims) { if (!q.cols && (d === 'size' || d === 'week' || d === 'location') && q.rows.length) q.cols = d; else if (!q.rows.includes(d)) q.rows.push(d); }
  if (q.cols && q.rows.includes(q.cols as Dim)) q.rows = q.rows.filter(r => r !== q.cols);

  /* filters, from the names the sheets use */
  const subs = [...new Set(db.options.flatMap(o => [o.subCat1, o.subCat2]))];
  const cats = ['RTW Shirts', 'Casual Pants', 'Formal Pants', 'Jeans'];
  const f = (d: Dim, v: string) => { (q.filters[d] = q.filters[d] ?? []).push(v); };
  for (const s of subs) if (t.includes(` ${s.toLowerCase()} `) || t.includes(` ${s.toLowerCase().replace(/ \+ /, ' and ')} `)) { if (db.options.some(o => o.subCat1 === s)) f('subCat1', s); else f('subCat2', s); }
  for (const c of cats) if (t.includes(` ${c.toLowerCase()} `) || (c === 'RTW Shirts' && has(/\bshirts?\b/) && !q.filters.subCat1) || (c === 'Casual Pants' && has(/\bchinos?\b/) && !q.filters.subCat1)) f('category', c);
  if (has(/\bnon[- ]?core\b/)) f('core', 'Non-core'); else if (has(/\bcore\b/)) f('core', 'Core');
  if (has(/\bunhealthy\b/) && q.measure !== 'unhealthy') f('healthy', 'Unhealthy'); else if (has(/\bhealthy\b/) && q.measure !== 'unhealthy') f('healthy', 'Healthy');
  if (has(/\b(on sale|eoss|marked down|discounted)\b/)) f('eoss', 'On sale');
  const sizeM = t.match(/\bsize (\d{2}|xs|s|m|l|xl|2xl)\b/g) ?? []; for (const m of sizeM) f('size', m.split(' ')[1].toUpperCase());
  for (const st of STORES.filter(s => s.holdsRtwStock)) if (t.includes(` ${st.name.toLowerCase()} `)) f('location', st.name);
  if (has(/\bwarehouse\b/) && !dims.includes('location')) f('location', 'Factory Warehouse');
  const styleHit = db.options.find(o => t.includes(` ${o.styleName.toLowerCase()} `)); if (styleHit) f('style', styleHit.styleName);

  /* window, top, sort */
  const wk = t.match(/\blast (\d{1,2}) weeks?\b/); if (wk) q.weeks = Math.min(12, Number(wk[1]));
  else if (has(/\b(last 4 weeks|last four weeks|l4w|four weeks)\b/)) q.weeks = 4;
  else if (has(/\b(last week|lw|this week)\b/) && q.cols !== 'period') q.weeks = 1;
  else if (has(/\b(12 weeks|twelve weeks|l12w|quarter)\b/)) q.weeks = 12;
  const top = t.match(/\b(top|best|highest|first) (\d{1,3})\b/) ?? t.match(/\b(\d{1,3}) (best|top|fastest)\b/); if (top) { q.top = Number(top[2] ?? top[1]); q.sort = 'desc'; }
  const bottom = t.match(/\b(bottom|worst|lowest|slowest|thinnest) (\d{1,3})\b/); if (bottom) { q.top = Number(bottom[2]); q.sort = 'asc'; }
  if (has(/\b(lowest|thinnest|worst|slowest|least)\b/)) q.sort = 'asc';

  /* a sensible default grain: a named style stands alone; otherwise sub-category; "which options" lists styles */
  if (!q.rows.length) q.rows = q.filters.style ? ['style'] : has(/\bwhich\b.{0,24}\b(options|styles)\b|\blist\b|\bshow me\b/) || q.top ? ['style'] : ['subCat1'];
  if (q.rows.includes('style') && !q.top && q.measure !== 'options' && !q.filters.style && !q.filters.subCat1 && !q.filters.subCat2 && !q.filters.category) { q.top = 25; reading.push('Showing the first 25 styles; say "top 50" for more'); }

  reading.splice(1, 0, `Rows: ${q.rows.map(d => DIM_LABEL[d]).join(' › ')}${q.cols ? ` · Columns: ${q.cols === 'period' ? 'LW, LW-1, LW-2, LW-3, L4W, L12W' : DIM_LABEL[q.cols]}` : ''}`);
  const fl = (Object.entries(q.filters) as [Dim, string[]][]).filter(([, v]) => v?.length).map(([d, v]) => `${DIM_LABEL[d]} = ${v.join(' or ')}`);
  if (fl.length) reading.push(`Where: ${fl.join('; ')}`);
  if (isSalesMeasure(q.measure) && q.cols !== 'period') reading.push(`Window: last ${q.weeks} week${q.weeks === 1 ? '' : 's'}`);
  if (q.top) reading.push(`${q.sort === 'asc' ? 'Lowest' : 'Top'} ${q.top}`);
  return { q, reading, sql: sqlOf(q) };
}

/** The query in SQL, so what the screen computed can be checked against the warehouse later. */
export function sqlOf(q: Query) {
  const sales = isSalesMeasure(q.measure) || q.cols === 'period';
  const agg: Record<Measure, string> = { stock: 'SUM(stock)', mainStock: 'SUM(stock) FILTER (WHERE is_main_size)', units: 'SUM(units)', revenue: 'SUM(units * price)', l4w: 'SUM(units) / 4', aws: 'SUM(option.aws)', wc: 'SUM(main_stock) / SUM(option.aws)', options: 'COUNT(DISTINCT style)', unhealthy: 'COUNT(DISTINCT style) FILTER (WHERE NOT healthy)', wip: 'SUM(open_po_qty)' };
  const col = (d: Dim) => ({ category: 'category', subCat1: 'sub_category_1', subCat2: 'sub_category_2', style: 'style', size: 'size', core: 'core', location: 'warehouse_name', week: 'week', healthy: 'healthy', eoss: 'eoss' }[d]);
  const dims = [...q.rows, ...(q.cols && q.cols !== 'period' ? [q.cols] : [])].map(col);
  const where = (Object.entries(q.filters) as [Dim, string[]][]).filter(([, v]) => v?.length).map(([d, v]) => `${col(d)} IN (${v.map(x => `'${x}'`).join(', ')})`);
  if (sales && q.cols !== 'period') where.push(`week_back < ${q.weeks}`);
  return `SELECT ${[...dims, `${agg[q.measure]} AS value`].join(', ')}\nFROM ${sales ? 'sales_by_style_size_week' : 'stock_by_style_size_location'}${where.length ? `\nWHERE ${where.join(' AND ')}` : ''}${dims.length ? `\nGROUP BY ${dims.join(', ')}` : ''}\nORDER BY value ${q.sort.toUpperCase()}${q.top ? `\nLIMIT ${q.top}` : ''}`;
}

export const weeksOnFloor = (o: RtwOption) => Math.max(1, Math.round(daysAgo(o.launchedAt) / 7));
