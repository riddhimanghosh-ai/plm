/* Sheet (2 Nov 2026) — the folder's tables as one workbook, every tab joined through the
   product ID. It behaves like a spreadsheet: sheet tabs, row numbers, lettered columns,
   frozen key columns, click a header to sort, a formula bar that shows how a cell was
   computed, a summary row. The Option ID is a linked record: click it and every tab
   filters to that product. */
import { useMemo, useState, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { Db, RtwOption } from '../domain/types';
import { healthRowOf, wipOf, storeStockOf, salesBySizeOf, fmtDate, daysAgo } from '../domain/engines';
import { STORES, HEALTH_MIN_SIZE_PCT, HEALTH_MIN_COVER_WEEKS } from '../domain/reference';
import { categoryOfOption } from '../domain/analysis';
import { Page, Input, Button, ExportButton } from '../ui';

/* ── the workbook ─────────────────────────────────────────────────────────────── */
type Val = string | number | null;
interface Col<T = Row> { id: string; name: string; w: number; num?: boolean; get: (r: T) => Val; src?: string; formula?: (r: T) => string; sum?: 'sum' | 'avg'; link?: boolean }
interface Row { key: string; id: string; [k: string]: unknown }
interface Tab { id: string; name: string; grain: string; cols: Col[]; rows: Row[] }

const holderName = (id: string) => id === 'warehouse' ? 'Factory Warehouse' : STORES.find(s => s.id === id)?.name ?? id;
const letter = (i: number) => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));
const f1 = (n: number) => Math.round(n * 10) / 10;
const sizeOrder = (a: string, b: string) => (parseInt(a) || 0) - (parseInt(b) || 0) || a.localeCompare(b);

/* the two frozen columns every tab starts with: the key, and the style looked up through it */
const keyCols = (): Col[] => [
  { id: 'id', name: 'Option ID', w: 118, get: r => r.id, link: true, src: 'the key: every tab joins on it' },
  { id: 'style', name: 'Style', w: 230, get: r => r.style as string, src: 'lookup · Products.Style via Option ID' },
];

function workbook(db: Db): Tab[] {
  const options = db.options.filter(o => !o.inactive).sort((a, b) => a.styleName.localeCompare(b.styleName));
  const sizes = [...new Set(options.flatMap(o => o.sizes))].sort(sizeOrder);
  const H = new Map(options.map(o => [o.id, healthRowOf(o)]));
  const W = new Map(options.map(o => [o.id, wipOf(db, o)]));
  const base = (o: RtwOption) => ({ id: o.id, style: o.styleName, o });
  const sizeCols = (src: string): Col[] => sizes.map(s => ({ id: `s${s}`, name: s, w: 52, num: true, get: r => (r.by as Record<string, number>)[s] || null, sum: 'sum', src }));
  const total: Col = { id: 'total', name: 'Total', w: 64, num: true, get: r => r.total as number, sum: 'sum', formula: r => `SUM(${Object.values(r.by as Record<string, number>).filter(Boolean).join(' + ')})` };

  const products: Tab = { id: 'products', name: 'Products', grain: 'one row per option · rollups from every other tab', rows: options.map(o => ({ key: o.id, ...base(o) })), cols: [...keyCols(),
    { id: 'cat', name: 'Category', w: 90, get: r => categoryOfOption(r.o as RtwOption) },
    { id: 'sub1', name: 'Sub-category 1', w: 150, get: r => (r.o as RtwOption).subCat1 },
    { id: 'sub2', name: 'Sub-category 2', w: 130, get: r => (r.o as RtwOption).subCat2 },
    { id: 'core', name: 'Core', w: 80, get: r => (r.o as RtwOption).core ? 'Core' : 'Non-core' },
    { id: 'sku', name: 'SKU', w: 190, get: r => (r.o as RtwOption).sku },
    { id: 'vendor', name: 'Vendor', w: 150, get: r => db.vendors.find(v => v.id === (r.o as RtwOption).vendorId)?.name ?? null },
    { id: 'fabric', name: 'Fabric code', w: 140, get: r => (r.o as RtwOption).fabricCode },
    { id: 'launch', name: 'Launched', w: 100, get: r => fmtDate((r.o as RtwOption).launchedAt) },
    { id: 'mrp', name: 'MRP', w: 76, num: true, get: r => (r.o as RtwOption).mrp, sum: 'avg' },
    { id: 'eoss', name: 'On sale', w: 80, get: r => (r.o as RtwOption).eoss ? 'EOSS' : '' },
    { id: 'stock', name: 'Stock', w: 70, num: true, get: r => H.get(r.id)!.stock, sum: 'sum', src: 'rollup · Stock: SUM(Total) where Option ID = this' },
    { id: 'main', name: 'Main', w: 64, num: true, get: r => H.get(r.id)!.mainStock, sum: 'sum', src: 'rollup · Stock: SUM(Total) over the main sizes' },
    { id: 'sold', name: 'Since launch', w: 96, num: true, get: r => (r.o as RtwOption).totalSale ?? null, sum: 'sum', src: 'rollup · Sales: SUM(Total) since launch' },
    { id: 'l4w', name: 'L4W', w: 64, num: true, get: r => f1(H.get(r.id)!.l4w), sum: 'avg', src: 'rollup · Sales: AVERAGE(Total) over LW…LW-3' },
    { id: 'aws', name: 'AWS', w: 64, num: true, get: r => f1(H.get(r.id)!.aws), sum: 'avg', src: 'lookup · Health.AWS' },
    { id: 'wc', name: 'WC', w: 64, num: true, get: r => H.get(r.id)!.wc >= 999 ? null : f1(H.get(r.id)!.wc), sum: 'avg', src: 'lookup · Health.WC' },
    { id: 'healthy', name: 'Healthy', w: 90, get: r => H.get(r.id)!.healthy ? 'Healthy' : 'Unhealthy', src: 'lookup · Health.Healthy' },
    { id: 'pos', name: 'Open POs', w: 84, num: true, get: r => W.get(r.id)!.length || null, sum: 'sum', src: 'rollup · Open orders: COUNT where Option ID = this' },
    { id: 'wip', name: 'On order', w: 80, num: true, get: r => W.get(r.id)!.filter(w => w.firm).reduce((a, w) => a + w.qty, 0) || null, sum: 'sum', src: 'rollup · Open orders: SUM(Qty) where PO raised' },
    { id: 'lost', name: 'Lost asks', w: 84, num: true, get: r => (db.lostSales ?? []).filter(l => l.optionId === r.id).length || null, sum: 'sum', src: 'rollup · Lost sales: COUNT where Option ID = this' },
    { id: 'reviews', name: 'Reviews', w: 76, num: true, get: r => (db.planningReviews ?? []).filter(x => x.optionId === r.id).length || null, sum: 'sum', src: 'rollup · Reviews: COUNT where Option ID = this' },
    { id: 'last', name: 'Last review', w: 150, get: r => { const x = (db.planningReviews ?? []).filter(x => x.optionId === r.id).sort((a, b) => b.on.localeCompare(a.on))[0]; return x ? `${fmtDate(x.on)} · ${x.status}` : null; }, src: 'lookup · Reviews: latest by date' },
  ] };

  const stock: Tab = { id: 'stock', name: 'Stock', grain: 'Enigma stock report · one row per option × location', cols: [...keyCols(), { id: 'loc', name: 'Location', w: 150, get: r => r.loc as string }, ...sizeCols('physical stock, pcs'), total],
    rows: options.flatMap(o => Object.entries(storeStockOf(o)).map(([h, by]) => ({ key: `${o.id}|${h}`, ...base(o), loc: holderName(h), by, total: Object.values(by).reduce((a, b) => a + b, 0) }))) };

  const sales: Tab = { id: 'sales', name: 'Sales', grain: 'Product Weekly Report · one row per option × week', cols: [...keyCols(), { id: 'week', name: 'Week', w: 72, get: r => r.week as string }, { id: 'ok', name: 'In stock', w: 80, get: r => r.ok ? 'yes' : 'broken', src: 'was every size available that week' }, ...sizeCols('units sold'), total],
    rows: options.flatMap(o => { const by = salesBySizeOf(o); const n = o.weeklySales.length; return Array.from({ length: n }, (_, w) => { const i = n - 1 - w; const row = Object.fromEntries(o.sizes.map(s => [s, by[s][i] ?? 0])); return { key: `${o.id}|${w}`, ...base(o), week: w === 0 ? 'LW' : `LW-${w}`, ok: o.inStockWeeks[i], by: row, total: o.weeklySales[i] ?? 0 }; }); }) };

  const hr = (r: Row) => H.get(r.id)!;
  const health: Tab = { id: 'health', name: 'Health', grain: 'ROS & health Report · one row per option, the sheet\'s own columns', rows: products.rows, cols: [...keyCols(),
    { id: 'sold', name: 'Total Sale', w: 84, num: true, get: r => hr(r).totalSale, sum: 'sum', src: 'units since launch' },
    { id: 'wof', name: 'WOF', w: 60, num: true, get: r => hr(r).wof, src: 'weeks on floor', formula: r => `WEEKS(TODAY − Launched) = ${hr(r).wof}` },
    { id: 'ros', name: 'ROS', w: 60, num: true, get: r => f1(hr(r).ros), sum: 'avg', formula: r => `Total Sale ÷ WOF = ${hr(r).totalSale} ÷ ${hr(r).wof} = ${f1(hr(r).ros)}` },
    ...[0, 1, 2, 3].map(i => ({ id: `lw${i}`, name: i ? `LW-${i}` : 'LW', w: 60, num: true, get: (r: Row) => hr(r).lw[i], sum: 'sum' as const, src: 'lookup · Sales.Total for that week' })),
    { id: 'l4w', name: 'L4W', w: 60, num: true, get: r => f1(hr(r).l4w), sum: 'avg', formula: r => `AVERAGE(LW, LW-1, LW-2, LW-3) = (${hr(r).lw.join(' + ')}) ÷ 4 = ${f1(hr(r).l4w)}` },
    { id: 'top6', name: 'Top 6', w: 64, num: true, get: r => f1(hr(r).top6Ros), sum: 'avg', formula: () => 'AVERAGE of the best six weeks' },
    { id: 'main', name: 'Main', w: 64, num: true, get: r => hr(r).mainStock, sum: 'sum', formula: r => `SUM(Stock over main sizes ${hr(r).main.join(' ')}) = ${hr(r).mainStock}` },
    { id: 'aws', name: 'AWS', w: 64, num: true, get: r => f1(hr(r).aws), sum: 'avg', formula: r => `MAX(LW, LW-1, LW-2, LW-3, Top 6) = MAX(${hr(r).lw.join(', ')}, ${f1(hr(r).top6Ros)}) = ${f1(hr(r).aws)}` },
    { id: 'wc', name: 'WC', w: 60, num: true, get: r => hr(r).wc >= 999 ? null : f1(hr(r).wc), sum: 'avg', formula: r => `Main ÷ AWS = ${hr(r).mainStock} ÷ ${f1(hr(r).aws)} = ${hr(r).wc >= 999 ? '∞' : f1(hr(r).wc)}` },
    { id: 'low', name: 'Low sizes', w: 100, get: r => hr(r).low.join(' ') || null, src: 'main sizes out, or under 4 weeks of their own rate (assumed rule)' },
    { id: 'health', name: 'Health', w: 70, num: true, get: r => Math.round(hr(r).stockHealth * 100), sum: 'avg', formula: r => `(main sizes − low) ÷ main sizes = (${hr(r).main.length} − ${hr(r).low.length}) ÷ ${hr(r).main.length} = ${Math.round(hr(r).stockHealth * 100)}%` },
    { id: 'healthy', name: 'Healthy', w: 90, get: r => hr(r).healthy ? 'Healthy' : 'Unhealthy', formula: r => `IF(Health ≥ ${HEALTH_MIN_SIZE_PCT * 100}% AND WC ≥ ${HEALTH_MIN_COVER_WEEKS}, "Healthy", "Unhealthy") → ${hr(r).healthy ? 'Healthy' : 'Unhealthy'}` },
    { id: 'eoss', name: 'EOSS', w: 64, get: r => hr(r).eoss ? 'yes' : '' },
  ] };

  const orders: Tab = { id: 'orders', name: 'Open orders', grain: 'WIP tracker · one row per open order', cols: [...keyCols(),
    { id: 'po', name: 'PO', w: 110, get: r => r.po as string | null }, { id: 'order', name: 'Order', w: 110, get: r => r.order as string }, { id: 'vendor', name: 'Vendor', w: 150, get: r => r.vendor as string | null }, { id: 'status', name: 'Status', w: 120, get: r => r.status as string },
    { id: 'qty', name: 'Qty', w: 64, num: true, get: r => r.qty as number, sum: 'sum' }, { id: 'arrives', name: 'Arrives', w: 100, get: r => r.arrives as string }, { id: 'weeks', name: 'Weeks away', w: 90, num: true, get: r => r.weeks as number }, ...sizeCols('size breakup given')],
    rows: options.flatMap(o => W.get(o.id)!.map(w => ({ key: w.order.id, ...base(o), po: w.poNo ?? null, order: w.order.id, vendor: db.vendors.find(v => v.id === w.order.vendorId)?.name ?? null, status: w.order.status, qty: w.qty, arrives: fmtDate(w.arrives), weeks: w.weeksAway, by: Object.fromEntries((w.breakup ?? []).map(b => [b.size, b.qty])) }))) };

  const byId = new Map(options.map(o => [o.id, o]));
  const lost: Tab = { id: 'lost', name: 'Lost sales', grain: 'RetailOS · one row per ask for a size that was out', cols: [...keyCols(), { id: 'on', name: 'Logged', w: 100, get: r => r.on as string }, { id: 'ago', name: 'Days ago', w: 80, num: true, get: r => r.ago as number }, { id: 'store', name: 'Store', w: 150, get: r => r.store as string }, { id: 'size', name: 'Size', w: 60, get: r => r.size as string }, { id: 'by', name: 'By', w: 80, get: r => r.by as string }, { id: 'note', name: 'Note', w: 260, get: r => r.note as string }],
    rows: (db.lostSales ?? []).filter(l => byId.has(l.optionId)).sort((a, b) => b.on.localeCompare(a.on)).map(l => ({ key: l.id, ...base(byId.get(l.optionId)!), on: fmtDate(l.on), ago: daysAgo(l.on), store: holderName(l.storeId), size: l.size, by: l.by, note: l.note })) };

  const reviews: Tab = { id: 'reviews', name: 'Reviews', grain: 'this PLM · one row per planning review', cols: [...keyCols(), { id: 'on', name: 'Reviewed', w: 100, get: r => r.on as string }, { id: 'by', name: 'By', w: 100, get: r => r.by as string }, { id: 'kind', name: 'Kind', w: 80, get: r => r.kind as string }, { id: 'status', name: 'Status', w: 90, get: r => r.status as string },
    { id: 'ros', name: 'Plan ROS', w: 80, num: true, get: r => r.ros as number }, { id: 'lead', name: 'Lead wk', w: 70, num: true, get: r => r.lead as number }, { id: 'draft', name: 'Draft qty', w: 80, num: true, get: r => r.draft as number, sum: 'sum' }, { id: 'approved', name: 'Approved', w: 84, num: true, get: r => r.approved as number | null, sum: 'sum' }, { id: 'grade', name: 'Grade', w: 60, get: r => r.grade as string | null }, { id: 'req', name: 'Requirement', w: 120, get: r => r.req as string | null }, { id: 'note', name: 'Note', w: 260, get: r => r.note as string }],
    rows: (db.planningReviews ?? []).filter(x => byId.has(x.optionId)).sort((a, b) => b.on.localeCompare(a.on)).map(x => ({ key: x.id, ...base(byId.get(x.optionId)!), on: fmtDate(x.on), by: x.by, kind: x.kind, status: x.status, ros: f1(x.planRos), lead: x.leadWeeks, draft: x.draftQty, approved: x.approvedQty, grade: x.grade ?? null, req: x.requirementId, note: x.constraintNote || x.note })) };

  return [products, stock, sales, health, orders, lost, reviews];
}

/* ── the screen ────────────────────────────────────────────────────────────────── */
const ROW_H = 30; const HEAD_H = 30; const NUM_W = 44;

export function Sheet() {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const tabs = useMemo(() => workbook(db), [db]);
  const tabId = params.get('tab') ?? 'products'; const tab = tabs.find(t => t.id === tabId) ?? tabs[0];
  const pid = params.get('id');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [sel, setSel] = useState<{ key: string; col: string } | null>(null);
  const [top, setTop] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const setP = (k: string, v: string | null) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };
  const goTab = (id: string) => { setP('tab', id); setSort(null); setSel(null); setTop(0); box.current?.scrollTo({ top: 0 }); };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = tab.rows.filter(x => (!pid || x.id === pid) && (!q || tab.cols.some(c => String(c.get(x) ?? '').toLowerCase().includes(q))));
    if (sort) { const c = tab.cols.find(c => c.id === sort.col)!; r = [...r].sort((a, b) => { const va = c.get(a), vb = c.get(b); if (va == null) return 1; if (vb == null) return -1; return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * sort.dir; }); }
    return r;
  }, [tab, pid, search, sort]);

  const pidStyle = pid ? tabs[0].rows.find(r => r.id === pid)?.style as string | undefined : undefined;
  const selRow = sel ? rows.find(r => r.key === sel.key) : null; const selCol = sel ? tab.cols.find(c => c.id === sel.col) : null;
  const selIdx = selRow ? rows.indexOf(selRow) : -1; const selColIdx = selCol ? tab.cols.indexOf(selCol) : -1;
  const lefts: number[] = []; tab.cols.slice(0, 2).reduce((x, c) => { lefts.push(x); return x + c.w; }, NUM_W);
  const vh = 560; const first = Math.max(0, Math.floor(top / ROW_H) - 6); const last = Math.min(rows.length, first + Math.ceil(vh / ROW_H) + 12);
  const summary = (c: Col) => { if (!c.sum) return ''; const v = rows.map(c.get).filter((x): x is number => typeof x === 'number'); if (!v.length) return ''; const s = v.reduce((a, b) => a + b, 0); return c.sum === 'sum' ? s.toLocaleString('en-IN') : `avg ${f1(s / v.length)}`; };
  const faint = { color: 'var(--ink-faint)' } as const;
  const line = '1px solid var(--line-soft)';
  const headCell = (c: Col, i: number, sticky: boolean): React.CSSProperties => ({ position: 'sticky', top: 0, left: sticky ? lefts[i] : undefined, zIndex: sticky ? 4 : 3, width: c.w, minWidth: c.w, maxWidth: c.w, height: HEAD_H, background: selColIdx === i ? 'color-mix(in srgb, var(--accent) 14%, var(--surface-2))' : 'var(--surface-2)', borderRight: line, borderBottom: '1px solid var(--line)', padding: '0 8px', fontSize: 11, textTransform: 'none', letterSpacing: 0, cursor: 'pointer', textAlign: c.num ? 'right' : 'left', userSelect: 'none' });

  return <Page title="Sheet · all tables, one key" lede="One workbook, seven tabs, one key. Every tab starts with the Option ID and the style looked up through it. Click an Option ID to filter every tab to that product; click a header to sort; click a cell to see how it was computed." replaces="VLOOKUPs between the Enigma stock report, the Product Weekly Report, the ROS & health Report, the WIP tracker and the Recce working">
    {/* toolbar */}
    <div className="flex flex-wrap items-center gap-2 mb-2">
      <Input placeholder={`Search in ${tab.name}`} value={search} onChange={e => { setSearch(e.target.value); setTop(0); }} style={{ width: 240 }} />
      {pid && <span className="pill accent flex items-center gap-1">🔗 {pid} · {pidStyle ?? ''}<button className="ml-1" title="Show all products" onClick={() => setP('id', null)}>×</button></span>}
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
      <span className="truncate">{sel && selRow && selCol ? (selCol.formula ? `= ${selCol.formula(selRow)}` : `${selCol.get(selRow) ?? ''}${selCol.src ? `   · ${selCol.src}` : ''}`) : <span style={faint}>Click a cell: computed columns show their formula here, looked-up ones say which tab they came from</span>}</span>
    </div>

    {/* grid */}
    <div className="card" style={{ overflow: 'hidden' }}>
      <div ref={box} onScroll={e => setTop((e.target as HTMLDivElement).scrollTop)} style={{ overflow: 'auto', height: vh, position: 'relative', background: '#fff' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, tableLayout: 'fixed', width: NUM_W + tab.cols.reduce((a, c) => a + c.w, 0) }}>
          <thead>
            <tr>
              <th style={{ ...headCell({ id: '#', name: '', w: NUM_W, get: () => null }, -1, false), left: 0, zIndex: 5, textAlign: 'center' }} />
              {tab.cols.map((c, i) => <th key={c.id} title={c.src ?? c.name} style={headCell(c, i, i < 2)} onClick={() => setSort(s => s?.col === c.id ? (s.dir > 0 ? { col: c.id, dir: -1 } : null) : { col: c.id, dir: 1 })}>
                <span style={{ ...faint, marginRight: 6, fontWeight: 400 }}>{letter(i)}</span>{c.name}{sort?.col === c.id && <span className="ml-1">{sort.dir > 0 ? '↑' : '↓'}</span>}
              </th>)}
            </tr>
          </thead>
          <tbody>
            {first > 0 && <tr style={{ height: first * ROW_H }}><td /></tr>}
            {rows.slice(first, last).map((r, k) => { const i = first + k; const isSelRow = sel?.key === r.key;
              return <tr key={r.key} style={{ height: ROW_H }}>
                <td style={{ position: 'sticky', left: 0, zIndex: 2, width: NUM_W, background: isSelRow ? 'color-mix(in srgb, var(--accent) 14%, var(--surface-2))' : 'var(--surface-2)', borderRight: line, borderBottom: line, textAlign: 'center', fontSize: 11, color: 'var(--ink-soft)' }}>{i + 1}</td>
                {tab.cols.map((c, ci) => { const v = c.get(r); const isSel = isSelRow && sel?.col === c.id; const sticky = ci < 2;
                  return <td key={c.id} onClick={() => setSel({ key: r.key, col: c.id })} style={{ position: sticky ? 'sticky' : undefined, left: sticky ? lefts[ci] : undefined, zIndex: sticky ? 1 : undefined, width: c.w, minWidth: c.w, maxWidth: c.w, padding: '0 8px', borderRight: sticky && ci === 1 ? '1px solid var(--line)' : line, borderBottom: line, textAlign: c.num ? 'right' : 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums', background: isSel ? 'color-mix(in srgb, var(--accent) 10%, #fff)' : isSelRow ? 'color-mix(in srgb, var(--accent) 4%, #fff)' : sticky ? '#fff' : undefined, boxShadow: isSel ? 'inset 0 0 0 2px var(--accent)' : undefined, color: v == null || v === '' ? 'var(--ink-faint)' : c.id === 'healthy' ? (v === 'Healthy' ? 'var(--good)' : 'var(--risk)') : c.id === 'ok' && v === 'broken' ? 'var(--warn)' : undefined, cursor: 'cell' }}>
                    {c.link ? <button className="pill accent" style={{ fontFamily: 'var(--mono, monospace)', fontSize: 11, padding: '1px 7px' }} title="Filter every tab to this product" onClick={e => { e.stopPropagation(); setP('id', pid === r.id ? null : r.id); setTop(0); }}>{String(v)}</button>
                      : v == null || v === '' ? '' : typeof v === 'number' ? v.toLocaleString('en-IN') : String(v)}
                  </td>; })}
              </tr>; })}
            {last < rows.length && <tr style={{ height: (rows.length - last) * ROW_H }}><td /></tr>}
            {rows.length === 0 && <tr style={{ height: 80 }}><td colSpan={tab.cols.length + 1} style={{ ...faint, padding: 16 }}>No rows{pid ? ` for ${pid}` : ''} in {tab.name}.</td></tr>}
          </tbody>
          <tfoot>
            <tr style={{ height: ROW_H }}>
              <td style={{ position: 'sticky', bottom: 0, left: 0, zIndex: 5, background: 'var(--surface-2)', borderTop: '1px solid var(--line)', borderRight: line, fontSize: 10, textAlign: 'center', color: 'var(--ink-soft)' }}>Σ</td>
              {tab.cols.map((c, i) => <td key={c.id} style={{ position: 'sticky', bottom: 0, left: i < 2 ? lefts[i] : undefined, zIndex: i < 2 ? 4 : 3, background: 'var(--surface-2)', borderTop: '1px solid var(--line)', borderRight: line, padding: '0 8px', fontSize: 11, textAlign: c.num ? 'right' : 'left', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{i === 0 ? `${rows.length.toLocaleString('en-IN')} rows` : summary(c)}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
      {/* sheet tabs, like the bottom of a workbook */}
      <div className="flex items-end gap-0 px-2" style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--line)', height: 36 }}>
        {tabs.map(t => { const n = pid ? t.rows.filter(r => r.id === pid).length : t.rows.length; const on = t.id === tab.id;
          return <button key={t.id} onClick={() => goTab(t.id)} className="text-[12px]" style={{ padding: '0 14px', height: 30, marginBottom: -1, background: on ? '#fff' : 'transparent', color: on ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: on ? 600 : 500, border: on ? '1px solid var(--line)' : '1px solid transparent', borderBottom: on ? '1px solid #fff' : undefined, borderRadius: '6px 6px 0 0' }}>
            {t.name} <span style={{ ...faint, fontWeight: 400 }}>{n.toLocaleString('en-IN')}</span></button>; })}
        <span className="ml-auto text-[11px] pb-2" style={faint}>joined on Option ID · column A on every tab</span>
      </div>
    </div>
    {pid && <div className="mt-2"><Button variant="ghost" size="sm" onClick={() => setP('id', null)}>Show all products</Button></div>}
  </Page>;
}
