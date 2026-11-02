/* Analysis (2 Nov 2026) — what the planners do in the sheets, done here: a question box,
   a pivot builder, and the folder's own sheets as one-click presets. Every answer shows how
   the question was read and the query it ran, so the number can be argued with. */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import { factsOf, pivot, parseQuestion, sqlOf, DIM_LABEL, MEASURE_LABEL, isSalesMeasure, type Query, type Dim, type Measure, type Cols } from '../domain/analysis';
import { STORES } from '../domain/reference';
import { Page, Card, Pill, Button, Input, Select, Field, Note, ExportButton, Th } from '../ui';

const DIMS: Dim[] = ['category', 'subCat1', 'subCat2', 'style', 'size', 'core', 'location', 'week', 'healthy', 'eoss'];
const MEASURES: Measure[] = ['stock', 'mainStock', 'units', 'revenue', 'l4w', 'aws', 'wc', 'options', 'unhealthy', 'wip', 'lostSales'];
const EMPTY: Query = { rows: ['subCat1'], cols: null, measure: 'stock', filters: {}, weeks: 4, top: null, sort: 'desc' };

/* the folder's sheets, each as the query that rebuilds it, or a link where the screen already exists */
const PRESETS: { sheet: string; tab: string; what: string; q?: Query; href?: string }[] = [
  { sheet: 'ENIGMA STOCK REPORT', tab: 'Stock sheet', what: 'style × size, physical stock', q: { ...EMPTY, rows: ['subCat1', 'style'], cols: 'size', measure: 'stock' } },
  { sheet: 'ENIGMA STOCK REPORT', tab: 'PIVOT · by location', what: 'sub-category × warehouse and store', q: { ...EMPTY, rows: ['category', 'subCat1'], cols: 'location', measure: 'stock' } },
  { sheet: 'Product Weekly Report', tab: 'Sheet1 · sales by week', what: 'category › sub-category × the last four weeks', q: { ...EMPTY, rows: ['category', 'subCat1'], cols: 'week', measure: 'units', weeks: 4 } },
  { sheet: 'Product Weekly Report', tab: 'L4W · by sub-category', what: 'LW, LW-1, LW-2, LW-3, L4W, L12W', q: { ...EMPTY, rows: ['category', 'subCat1'], cols: 'period', measure: 'units' } },
  { sheet: 'Product Weekly Report', tab: 'Summery · revenue', what: 'the same periods, in rupees', q: { ...EMPTY, rows: ['category'], cols: 'period', measure: 'revenue' } },
  { sheet: 'Recce Non-Core', tab: 'Sheet4 · open orders', what: 'open PO quantity by category and sub-category', q: { ...EMPTY, rows: ['category', 'subCat1'], measure: 'wip' } },
  { sheet: 'Recce Non-Core', tab: 'Main · AWS · WC', what: 'main-size cover by sub-category, core and non-core', q: { ...EMPTY, rows: ['subCat1', 'core'], measure: 'wc', sort: 'asc' } },
  { sheet: 'RetailOS · lost sales', tab: 'asks for a size that was out', what: 'style × size, last four weeks; the planning call\'s Phase 1 capture', q: { ...EMPTY, rows: ['subCat1', 'style'], cols: 'size', measure: 'lostSales', weeks: 4 } },
  { sheet: 'ROS & health Report', tab: 'Working', what: 'the health row for every style', href: '#/planning' },
  { sheet: 'Recce Non-Core', tab: 'Summary · option count', what: 'ideal, healthy, in production, gap, need to order', href: '#/planning?tab=count' },
  { sheet: 'United Chinos order working', tab: 'the order maths', what: 'closing, open orders, opening at arrival, ratio in pairs', href: '#/planning?kind=core' },
  { sheet: 'Product Weekly Report', tab: 'Summery · RTW Sub-Cat 1 · On sale', what: 'the weekly review as planning reads it', href: '#/insights' },
];

const EXAMPLES = ['stock of casual solid by size', 'sales last 4 weeks by sub category', 'which non-core options are unhealthy', 'top 10 styles by revenue last week', 'formal chinos size 34 stock by store', 'weeks of cover by sub category, lowest 5', 'how many options on sale by category', 'casual solid sales vs last week', 'lost sales by size last 4 weeks', 'lost sales by store'];

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const fmt = (m: Measure, n: number) => m === 'revenue' ? inr(n) : m === 'wc' || m === 'l4w' || m === 'aws' ? n.toFixed(1) : String(Math.round(n));

export function Analyse() {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const [ask, setAsk] = useState(params.get('ask') ?? '');
  const [q, setQ] = useState<Query>(() => params.get('ask') ? parseQuestion(params.get('ask')!, db).q : PRESETS[0].q!);
  const [reading, setReading] = useState<string[]>(() => params.get('ask') ? parseQuestion(params.get('ask')!, db).reading : ['Preset: the Enigma stock sheet, style × size']);
  const data = useMemo(() => factsOf(db), [db]);
  const result = useMemo(() => pivot(db, data, q), [db, data, q]);
  const subs1 = [...new Set(db.options.map(o => o.subCat1))].sort();
  const locations = ['Factory Warehouse', ...STORES.filter(s => s.holdsRtwStock).map(s => s.name)];
  const sizes = [...new Set(db.options.flatMap(o => o.sizes))];
  const sales = isSalesMeasure(q.measure);
  const faint = { color: 'var(--ink-faint)' } as const;
  const run = (text: string) => { const r = parseQuestion(text, db); setAsk(text); setQ(r.q); setReading(r.reading); const n = new URLSearchParams(params); n.set('ask', text); setParams(n, { replace: true }); };
  const set = (patch: Partial<Query>) => { setQ(x => ({ ...x, ...patch })); setReading(['Built by hand below']); };
  const setFilter = (d: Dim, v: string) => set({ filters: { ...q.filters, [d]: v ? [v] : [] } });
  const rowDim = (i: number, v: string) => { const rows = [...q.rows]; if (v) rows[i] = v as Dim; else rows.splice(i, 1); set({ rows: rows.length ? rows : ['subCat1'] }); };
  const colLabel = (ck: string) => ck === '*' ? MEASURE_LABEL[q.measure] : ck;

  return <Page title="Analysis · ask the data" lede="The planners' sheets as one set of facts: stock by style, size and location; sales by style, size and week; open orders; the health row. Ask in plain words, or build the pivot by hand. Every answer shows how it was read and the query it ran."
    replaces="the pivots rebuilt by hand each week in the ROS & health Report, the Recce working, the Enigma stock report and the Product Weekly Report">

    {/* ── the question ── */}
    <Card className="mb-3"><div className="px-4 py-3">
      <form className="flex gap-2 items-center" onSubmit={e => { e.preventDefault(); if (ask.trim()) run(ask.trim()); }}>
        <Input value={ask} onChange={e => setAsk(e.target.value)} placeholder="ask the data · e.g. stock of formal solid by size, or top 10 styles by revenue last week" style={{ flex: 1 }} />
        <Button variant="primary" size="sm" disabled={!ask.trim()}>Ask</Button>
      </form>
      <div className="flex gap-1.5 flex-wrap pt-2">{EXAMPLES.map(x => <button key={x} type="button" className="pill" style={{ cursor: 'pointer' }} onClick={() => run(x)}>{x}</button>)}</div>
      <div className="pt-2 text-[12px]" style={faint}>A rule reader stands in for the AI here: it turns the words into the pivot below and says how it read them. In the build an AI model does the reading, against the same facts, and the reading stays on screen.</div>
    </div></Card>

    {/* ── the builder ── */}
    <div className="flex gap-2 items-end flex-wrap mb-3">
      <Field label="Rows"><Select value={q.rows[0]} onChange={v => rowDim(0, v)} options={DIMS.map(d => ({ value: d, label: DIM_LABEL[d] }))} style={{ width: 150 }} /></Field>
      <Field label="then"><Select value={q.rows[1] ?? ''} onChange={v => rowDim(1, v)} options={[{ value: '', label: '—' }, ...DIMS.filter(d => d !== q.rows[0]).map(d => ({ value: d, label: DIM_LABEL[d] }))]} style={{ width: 150 }} /></Field>
      <Field label="Columns"><Select value={q.cols ?? ''} onChange={v => set({ cols: (v || null) as Cols })} options={[{ value: '', label: '—' }, { value: 'size', label: 'Size' }, { value: 'location', label: 'Location' }, { value: 'week', label: 'Week' }, { value: 'period', label: 'LW · LW-1 · L4W · L12W' }, { value: 'core', label: 'Core / Non-core' }, { value: 'healthy', label: 'Healthy or not' }]} style={{ width: 170 }} /></Field>
      <Field label="Measure"><Select value={q.measure} onChange={v => set({ measure: v as Measure })} options={MEASURES.map(m => ({ value: m, label: MEASURE_LABEL[m] }))} style={{ width: 190 }} /></Field>
      {sales && q.cols !== 'period' && <Field label="Weeks"><Input type="number" min={1} max={12} value={q.weeks} onChange={e => set({ weeks: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })} style={{ width: 70 }} /></Field>}
      <Field label="Top"><Input type="number" min={0} value={q.top ?? ''} placeholder="all" onChange={e => set({ top: Number(e.target.value) || null })} style={{ width: 70 }} /></Field>
      <Field label="Sort"><Select value={q.sort} onChange={v => set({ sort: v as 'asc' | 'desc' })} options={[{ value: 'desc', label: 'highest first' }, { value: 'asc', label: 'lowest first' }]} style={{ width: 120 }} /></Field>
    </div>
    <div className="flex gap-2 items-end flex-wrap mb-3">
      <Field label="Category"><Select value={q.filters.category?.[0] ?? ''} onChange={v => setFilter('category', v)} options={[{ value: '', label: 'all' }, ...['RTW Shirts', 'Casual Pants', 'Formal Pants', 'Jeans'].map(x => ({ value: x, label: x }))]} style={{ width: 140 }} /></Field>
      <Field label="Sub-Category 1"><Select value={q.filters.subCat1?.[0] ?? ''} onChange={v => setFilter('subCat1', v)} options={[{ value: '', label: 'all' }, ...subs1.map(x => ({ value: x, label: x }))]} style={{ width: 190 }} /></Field>
      <Field label="Core"><Select value={q.filters.core?.[0] ?? ''} onChange={v => setFilter('core', v)} options={[{ value: '', label: 'both' }, { value: 'Core', label: 'Core' }, { value: 'Non-core', label: 'Non-core' }]} style={{ width: 110 }} /></Field>
      <Field label="Healthy"><Select value={q.filters.healthy?.[0] ?? ''} onChange={v => setFilter('healthy', v)} options={[{ value: '', label: 'both' }, { value: 'Healthy', label: 'Healthy' }, { value: 'Unhealthy', label: 'Unhealthy' }]} style={{ width: 110 }} /></Field>
      <Field label="EOSS"><Select value={q.filters.eoss?.[0] ?? ''} onChange={v => setFilter('eoss', v)} options={[{ value: '', label: 'both' }, { value: 'On sale', label: 'On sale' }, { value: 'Full price', label: 'Full price' }]} style={{ width: 110 }} /></Field>
      <Field label="Size"><Select value={q.filters.size?.[0] ?? ''} onChange={v => setFilter('size', v)} options={[{ value: '', label: 'all' }, ...sizes.map(x => ({ value: x, label: x }))]} style={{ width: 80 }} /></Field>
      {!sales && <Field label="Location"><Select value={q.filters.location?.[0] ?? ''} onChange={v => setFilter('location', v)} options={[{ value: '', label: 'all' }, ...locations.map(x => ({ value: x, label: x }))]} style={{ width: 170 }} /></Field>}
      <div className="flex-1" />
      <ExportButton filename="analysis" sheetName="Pivot" rows={result.rows} cols={[...q.rows.map((d, i) => ({ label: DIM_LABEL[d], get: (r: typeof result.rows[number]) => r.key[i] })), ...result.colKeys.map(ck => ({ label: colLabel(ck), get: (r: typeof result.rows[number]) => fmt(q.measure, r.cells[ck]) })), ...(result.colKeys.length > 1 ? [{ label: 'Total', get: (r: typeof result.rows[number]) => fmt(q.measure, r.total) }] : [])]} />
    </div>

    {/* ── how it was read ── */}
    <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <Card><div className="px-4 py-3 text-[12.5px]"><div className="label">How it was read</div>{reading.map((r, i) => <div key={i}>{r}</div>)}<div className="pt-1" style={faint}>{result.optionCount} options in the answer · {result.rows.length} rows</div></div></Card>
      <Card><div className="px-4 py-3"><div className="label">The query it ran</div><pre className="mono text-[11px]" style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--ink-soft)' }}>{sqlOf(q)}</pre></div></Card>
    </div>

    {/* ── the answer ── */}
    <Card><div style={{ overflowX: 'auto' }}><table className="t compact">
      <thead><tr>{q.rows.map(d => <Th key={d}>{DIM_LABEL[d]}</Th>)}{result.colKeys.map(ck => <Th key={ck} num>{colLabel(ck)}</Th>)}{result.colKeys.length > 1 && <Th num hint={q.cols === 'period' ? 'LW' : 'across the columns'}>{q.cols === 'period' ? '' : 'Total'}</Th>}</tr></thead>
      <tbody>
        {result.rows.length === 0 && <tr><td colSpan={q.rows.length + result.colKeys.length + 1} className="text-[12.5px] py-4 text-center" style={faint}>Nothing matches. Loosen a filter, or widen the weeks.</td></tr>}
        {result.rows.map(r => <tr key={r.key.join('|')} className="row" onClick={() => { if (q.rows[q.rows.length - 1] === 'style') { const o = db.options.find(x => x.styleName === r.key[r.key.length - 1]); if (o) location.hash = `#/planning?open=${o.id}`; } }} style={q.rows[q.rows.length - 1] === 'style' ? { cursor: 'pointer' } : undefined}>
          {r.key.map((k, i) => <td key={i} className={i === r.key.length - 1 ? 'font-medium' : ''} style={i < r.key.length - 1 ? faint : undefined}>{k}</td>)}
          {result.colKeys.map(ck => <td key={ck} className="num" style={{ color: q.measure === 'wc' && r.cells[ck] > 0 && r.cells[ck] < 4 ? 'var(--risk)' : r.cells[ck] === 0 ? 'var(--ink-faint)' : undefined }}>{r.cells[ck] === 0 ? '·' : fmt(q.measure, r.cells[ck])}</td>)}
          {result.colKeys.length > 1 && <td className="num font-medium">{q.cols === 'period' ? '' : fmt(q.measure, r.total)}</td>}
        </tr>)}
        <tr style={{ fontWeight: 600, borderTop: '2px solid var(--line)' }}><td colSpan={q.rows.length}>Grand Total</td>{result.colKeys.map(ck => <td key={ck} className="num">{fmt(q.measure, result.grand[ck])}</td>)}{result.colKeys.length > 1 && <td className="num">{q.cols === 'period' ? '' : fmt(q.measure, result.grandTotal)}</td>}</tr>
      </tbody>
    </table></div></Card>
    {q.rows[q.rows.length - 1] === 'style' && <div className="pt-2 text-[12px]" style={faint}>Click a style to open its planning review.</div>}
    {(q.measure === 'wc' || q.measure === 'aws') && <div className="pt-2"><Note>AWS is the sheet's planning rate: the highest of the last four weeks and the top six. For a group it is the sum of each style's AWS; WC is the group's main-size stock over that.</Note></div>}

    {/* ── the folder's sheets ── */}
    <div className="label pt-5 pb-1">The folder's sheets, one click each</div>
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
      {PRESETS.map(p => p.q
        ? <button key={p.sheet + p.tab} type="button" className="card text-left px-3 py-2" style={{ cursor: 'pointer' }} onClick={() => { setQ(p.q!); setAsk(''); setReading([`Preset: ${p.sheet} › ${p.tab}`]); }}>
            <div className="text-[11px]" style={faint}>{p.sheet}</div><div className="font-medium text-[13px]">{p.tab}</div><div className="text-[11.5px]" style={faint}>{p.what}</div></button>
        : <a key={p.sheet + p.tab} className="card px-3 py-2" href={p.href} style={{ textDecoration: 'none' }}>
            <div className="text-[11px]" style={faint}>{p.sheet}</div><div className="font-medium text-[13px]">{p.tab} <span style={faint}>→</span></div><div className="text-[11.5px]" style={faint}>{p.what}</div></a>)}
    </div>
    <div className="pt-3 text-[12px]" style={faint}>Stock is Enigma's physical stock by SKU and location (sellable bins; damaged and in-transit bins are not counted). Sales are Shopify line items by size and week. Open orders are the raised POs on the tracker. The health columns follow the ROS & health Report. <Pill tone="neutral">facts rebuilt on every change</Pill></div>
  </Page>;
}
