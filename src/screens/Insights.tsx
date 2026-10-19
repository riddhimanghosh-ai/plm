/* What is selling — the analytics planning actually runs, presented as they
   read them. Four reports circulate every week; this screen is those four,
   not a fifth invented one. The weekly business review (last week against the
   week before and the four-week average, by segment, category, range and
   price band, plus what went on sale and whether the discount did anything),
   the DSR (every store's month against its target, split new vs returning),
   and the stylist KPI (every person on the floor against their number). The
   ROS & health report is its own screen. Figures are the reports' own, as of
   the week they were run — the date is on every tab. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page, Card, Pill, Tabs, Seg, Select, Input, Th, usePager, Pager, ExportButton, Note, Empty, Section, type Tone } from '../ui';
import { ANALYTICS_AS_OF, WEEKLY_SUMMARY, WEEKLY_L4W, RTW_RANGE, MTM_RANGE, MTM_BANDS, ON_SALE, ON_SALE_WEEKS, DSR, STYLIST_KPI, type DsrRow, type StylistRow } from '../domain/realanalytics';

const inr = (n: number | null | undefined, opts: { compact?: boolean } = {}) => n == null ? '—' : opts.compact && Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toFixed(n >= 1e7 ? 0 : 1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`;
const pct = (frac: number | null | undefined, alreadyPct = false) => frac == null ? '—' : `${Math.round(alreadyPct ? frac : frac * 100)}%`;
const signed = (frac: number | null | undefined, alreadyPct = false) => { if (frac == null) return { text:'—', tone: undefined as string | undefined }; const v = alreadyPct ? frac : frac * 100; return { text: `${v > 0 ? '+' : ''}${Math.round(v)}%`, tone: v > 2 ? 'var(--good)' : v < -2 ? 'var(--risk)' : 'var(--ink-faint)' }; };
/** the best of the weeks a report row carries, and which one it was */
const best = (xs: (number | null | undefined)[]) => xs.reduce<{ i: number; value: number } | null>((a, v, i) => (v != null && v > 0 && (!a || v > a.value) ? { i, value: v } : a), null);
const num = (n: number | null | undefined, d = 0) => n == null ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: d });
const asOf = <Pill tone="neutral">week ending {new Date(ANALYTICS_AS_OF).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' })}</Pill>;

export function Insights() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'weekly';
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace:true }); };
  return (
    <Page title="What is selling" lede="The weekly business review, the DSR and the stylist KPI, read straight off planning's own workbooks."
      replaces="the Product Weekly Report, the DSR and the Stylist KPI workbooks, mailed out as attachments every Monday"
      actions={asOf}>
      <Tabs active={tab} onChange={t => set('tab', t)} tabs={[
        { id:'weekly', label:'Weekly review', hint:'LW · LW-1 · L4W by segment, category, range, price band, and what is on sale' },
        { id:'dsr', label:'Stores · DSR', hint:'month-to-date against target, store by store, new vs returning' },
        { id:'stylists', label:'Stylists · KPI', hint:'every person on the floor against their target' },
      ]} />
      {tab === 'weekly' && <Weekly />}
      {tab === 'dsr' && <Dsr />}
      {tab === 'stylists' && <Stylists />}
    </Page>
  );
}

/* ---------- the weekly business review ------------------------------------------ */
function Weekly() {
  const [view, setView] = useState<'summary' | 'category' | 'range' | 'bands' | 'sale'>('summary');
  const [unit, setUnit] = useState<'qty' | 'rev'>('qty');
  const [rng, setRng] = useState<'rtw' | 'mtm'>('rtw');
  const [saleShow, setSaleShow] = useState<'all' | 'worked' | 'flat'>('all');
  const WEEKS = ['LW', 'LW-1', 'LW-2', 'LW-3'];
  return <>
    <div className="flex items-end gap-3 flex-wrap mb-3">
      <Seg value={view} onChange={setView} label="Look at" options={[
        { id:'summary', label:'The week in one table', hint:'every segment: last week, the week before, the four-week average' },
        { id:'category', label:'Category × sub-category', hint:'contribution, average weekly sale, warehouse stock, four weeks' },
        { id:'range', label:'By range', hint:'RTW sub-categories and MTM fabric ranges — growth against last week and the 12-week average' },
        { id:'bands', label:'MTM price bands', hint:'bespoke and non-bespoke by ticket size' },
        { id:'sale', label:'On sale', hint:'every style marked down — did the rate of sale move?' },
      ]} />
      {(view === 'category' || view === 'range') && <Seg value={unit} onChange={setUnit} options={[{ id:'qty', label:'Units' }, { id:'rev', label:'Revenue' }]} />}
      {view === 'range' && <Seg value={rng} onChange={setRng} options={[{ id:'rtw', label:'RTW shirts · by sub-category' }, { id:'mtm', label:'MTM shirts · by fabric range' }]} />}
    </div>

    {view === 'summary' && <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><th>Segment</th><th className="num">LW qty</th><th className="num">LW revenue</th><th className="num">LW-1 qty</th><th className="num">LW-1 revenue</th><th className="num">Qty vs LW-1</th><th className="num">Revenue vs LW-1</th><th className="num">L4W avg qty</th><th className="num">L4W avg revenue</th></tr></thead>
      <tbody>{WEEKLY_SUMMARY.map(s => { const contrib = /Contrib/i.test(s.segment); const q = signed(s.chgQty); const r = signed(s.chgRev);
        return <tr key={s.segment} style={{ background: /^Overall/.test(s.segment) ? 'var(--surface-2)' : undefined }}>
          <td className={contrib ? 'text-[12px]' : 'font-medium'} style={{ paddingLeft: contrib ? 22 : undefined, color: contrib ? 'var(--ink-faint)' : undefined }}>{s.segment.replace(/ Contribution?$/i, ' · share')}</td>
          {contrib ? <>
            <td className="num">{pct(s.lwQty)}</td><td className="num">{pct(s.lwRev)}</td><td className="num">{pct(s.lw1Qty)}</td><td className="num">{pct(s.lw1Rev)}</td><td /><td /><td className="num">{pct(s.l4wQty)}</td><td className="num">{pct(s.l4wRev)}</td>
          </> : <>
            <td className="num">{num(s.lwQty)}</td><td className="num">{inr(s.lwRev, { compact:true })}</td><td className="num">{num(s.lw1Qty)}</td><td className="num">{inr(s.lw1Rev, { compact:true })}</td>
            <td className="num" style={{ color: q.tone }}>{q.text}</td><td className="num" style={{ color: r.tone }}>{r.text}</td>
            <td className="num">{num(s.l4wQty)}</td><td className="num">{inr(s.l4wRev, { compact:true })}</td>
          </>}
        </tr>; })}</tbody>
    </table></div>
    <div className="px-4 py-2.5 text-[12px]" style={{ color:'var(--ink-soft)', borderTop:'1px solid var(--line-soft)' }}>Shirts are two businesses: MTM is the bulk of the revenue, RTW shirts the bulk of the units. <b>Share</b> rows are the report's contribution lines — RTW's share of shirts, non-shirts' share of the whole. A segment moving more than 2% either way is coloured.</div></Card>}

    {view === 'category' && <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><th>Category</th><th>Sub-category</th><Th num hint="the sub-category's share of its category, from the report's own contribution column">Share</Th><Th num hint="average weekly sale over twelve weeks — the report's own 12-week rate">AWS · 12W</Th><Th num hint="average weekly sale over the last four weeks">AWS · L4W</Th><Th num hint="warehouse stock; amber past thirty weeks of the L4W rate">WH stock</Th>{WEEKS.map(w => <th key={w} className="num">{w}</th>)}<Th num hint="the best of the four weeks the report carries, and which one">Best wk</Th><Th num hint="last week against the four-week average">LW vs L4W</Th></tr></thead>
      <tbody>{WEEKLY_L4W.map((r, i) => { const v = (k: number) => r.weeks[k]?.[unit === 'qty' ? 0 : 1]; const lw = v(0); const l4 = r.weeks.map((_, k) => v(k)).filter((x): x is number => x != null); const avg = l4.length ? l4.reduce((a, b) => a + b, 0) / l4.length : null; const d = signed(lw != null && avg ? (lw - avg) / avg : null);
        const total = /total/i.test(r.sub);
        return <tr key={i} style={{ background: total ? 'var(--surface-2)' : undefined }}>
          <td className="text-[12px]" style={{ color:'var(--ink-faint)' }}>{r.category}</td>
          <td className={total ? 'font-medium' : ''}>{r.sub}</td>
          <td className="num">{r.contribPct != null ? pct(r.contribPct, true) : '—'}</td>
          <td className="num">{num(r.aws12)}</td><td className="num">{num(r.aws4)}</td>
          <td className="num" style={{ color: r.whStock != null && r.aws4 && r.whStock / r.aws4 > 30 ? 'var(--warn)' : undefined }} title={r.whStock != null && r.aws4 ? `${Math.round(r.whStock / r.aws4)} weeks at the L4W rate` : undefined}>{num(r.whStock)}</td>
          {WEEKS.map((w, k) => <td key={w} className="num">{unit === 'qty' ? num(v(k)) : inr(v(k), { compact:true })}</td>)}
          <td className="num">{(() => { const b = best(r.weeks.map((_, k) => v(k))); return b ? <>{unit === 'qty' ? num(b.value) : inr(b.value, { compact:true })}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{WEEKS[b.i]}</div></> : '—'; })()}</td>
          <td className="num" style={{ color: d.tone }}>{d.text}</td>
        </tr>; })}</tbody>
    </table></div>
    <div className="px-4 py-2.5 text-[12px]" style={{ color:'var(--ink-soft)', borderTop:'1px solid var(--line-soft)' }}><b>AWS</b> is average weekly sale, over twelve weeks and over the last four. <b>WH stock</b> turns amber when it is more than thirty weeks of the L4W rate — that is the report's own over-stock signal, made visible.</div></Card>}

    {view === 'range' && <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><th>{rng === 'rtw' ? 'RTW sub-category' : 'MTM fabric range'}</th><Th num hint="the report's twelve-week average weekly quantity for the range">L12W avg qty</Th>{WEEKS.map(w => <th key={w} className="num">{w}</th>)}<Th num hint="the best of the four weeks, and which one">Best wk</Th><th className="num">Qty vs LW-1</th><th className="num">Qty vs L12W</th></tr></thead>
      <tbody>{(rng === 'rtw' ? RTW_RANGE : MTM_RANGE).filter(r => r.weeks.some(w => (w[0] ?? 0) > 0) || (r.l12wQty ?? 0) > 0).sort((a, b) => (b.weeks[0]?.[0] ?? 0) - (a.weeks[0]?.[0] ?? 0)).map(r => { const g1 = signed(r.growthVsLw1, true); const g12 = signed(r.growthVsL12w, true);   // the sheet stores whole percentages
        return <tr key={r.range}>
          <td className="font-medium">{r.range}</td>
          <td className="num">{num(r.l12wQty)}</td>
          {WEEKS.map((w, k) => <td key={w} className="num">{unit === 'qty' ? num(r.weeks[k]?.[0]) : inr(r.weeks[k]?.[1], { compact:true })}</td>)}
          <td className="num">{(() => { const b = best(r.weeks.map(w => unit === 'qty' ? w?.[0] : w?.[1])); return b ? <>{unit === 'qty' ? num(b.value) : inr(b.value, { compact:true })}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{WEEKS[b.i]}</div></> : '—'; })()}</td>
          <td className="num" style={{ color: g1.tone }}>{g1.text}</td><td className="num" style={{ color: g12.tone }}>{g12.text}</td>
        </tr>; })}</tbody>
    </table></div>
    <div className="px-4 py-2.5 text-[12px]" style={{ color:'var(--ink-soft)', borderTop:'1px solid var(--line-soft)' }}>{rng === 'rtw' ? 'The five RTW shirt ranges the report tracks. Formal solid is the engine; casual checks and stripes are the swing.' : 'MTM by the fabric range the customer chose — a range rising against its twelve-week average is the one to block deeper; one falling is a swatch-book slot to refill.'}</div></Card>}

    {view === 'bands' && <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><th>Bespoke / non-bespoke</th><th>Ticket</th>{WEEKS.map(w => <th key={w} className="num">{w}</th>)}<th className="num">vs LW-1</th></tr></thead>
      <tbody>{MTM_BANDS.map((b, i) => { const total = /total/i.test(b.kind); const g = signed(b.growthVsLw1, true);
        return <tr key={i} style={{ background: total ? 'var(--surface-2)' : undefined }}>
          <td className={total ? 'font-medium' : 'text-[12px]'} style={{ color: total ? undefined : 'var(--ink-faint)' }}>{b.kind}</td>
          <td>{b.band || ''}</td>
          {WEEKS.map((w, k) => <td key={w} className="num">{num(b.weeks[k])}</td>)}
          <td className="num" style={{ color: g.tone }}>{g.text}</td>
        </tr>; })}</tbody>
    </table></div>
    <div className="px-4 py-2.5 text-[12px]" style={{ color:'var(--ink-soft)', borderTop:'1px solid var(--line-soft)' }}>Where the MTM ticket sits. Bespoke lives above ₹5,000; the non-bespoke ₹3–5K band is the volume. A week where the top band falls and the middle rises is customers trading down, and it shows here first.</div></Card>}

    {view === 'sale' && <OnSale show={saleShow} setShow={setSaleShow} />}

    {/* Step 2 of the reporting brief, kept on the screen: every metric's inputs,
       formula, period and scope, and the columns it is read from. Written down
       here so the sheet, the screen and the export cannot drift apart. */}
    <div className="mt-3"><Section title="How these numbers are made" right={<Pill tone="neutral">calculation logic · source columns</Pill>} ownerRole={null} pending={false}>
      <div style={{ overflowX:'auto' }}><table className="t compact">
        <thead><tr><th>Metric</th><th>Source workbook · column</th><th>Formula</th><th>Period</th><th>Scope</th><th>Missing / incomplete data</th></tr></thead>
        <tbody>{METRIC_LOGIC.map(m => <tr key={m.metric}>
          <td className="font-medium" style={{ whiteSpace:'normal', minWidth: 150 }}>{m.metric}</td>
          <td style={{ whiteSpace:'normal', minWidth: 170 }}>{m.source}</td>
          <td style={{ whiteSpace:'normal', minWidth: 190 }}>{m.formula}</td>
          <td style={{ whiteSpace:'normal' }}>{m.period}</td>
          <td style={{ whiteSpace:'normal' }}>{m.scope}</td>
          <td style={{ whiteSpace:'normal', minWidth: 170 }}>{m.missing}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="px-4 py-3"><Note tone="warn"><b>What these workbooks cannot answer yet.</b> The weekly report carries <b>four</b> weeks of detail per row plus a twelve-week average, so <b>best week over twelve</b> and <b>last six weeks against the prior six</b> — two of the three metrics the review asked for — cannot be computed from it. Best week here is the best of the four weeks on the sheet, and it says so. Getting the other two means the weekly extract keeping twelve weekly columns, or the review reading the order line directly, keyed on style code and store code.</Note></div>
    </Section></div>
  </>;
}

/* The reporting brief's calculation sheet, as data: one row per metric, naming
   the workbook and column it is read from, so a number on this screen can
   always be traced back to the sheet it came out of. */
const METRIC_LOGIC: { metric: string; source: string; formula: string; period: string; scope: string; missing: string }[] = [
  { metric:'LW / LW-1 and the change', source:'Product Weekly Report · summary block', formula:'last week, the week before, and (LW − LW-1) ÷ LW-1', period:`the week ending ${new Date(ANALYTICS_AS_OF).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' })}, and the one before`, scope:'every segment the report lists — MTM, RTW, non-shirts, and the contribution lines', missing:'a blank segment is left blank, never read as zero' },
  { metric:'12-week average (AWS · 12W)', source:'Product Weekly Report · AWS 12W column', formula:"the report's own twelve-week average weekly sale — taken as given, not recomputed", period:'twelve weeks to the report date', scope:'category × sub-category', missing:'blank where the sub-category has not been live twelve weeks' },
  { metric:'4-week average (AWS · L4W)', source:'Product Weekly Report · AWS L4W column', formula:'average weekly sale over the last four weeks', period:'four weeks to the report date', scope:'category × sub-category', missing:'blank rows excluded from the LW-vs-L4W comparison' },
  { metric:'Best week', source:'Product Weekly Report · the four weekly columns', formula:'the largest of the four weeks on the row, and which week it was', period:'four weeks — the detail the workbook carries', scope:'category × sub-category and range', missing:'blank when all four weeks are zero or empty' },
  { metric:'Growth vs LW-1 / vs L12W', source:"Product Weekly Report · the range and band sheets' own growth columns", formula:'whole percentages as the sheet states them — not recalculated here', period:'last week against the week before, and against the twelve-week rate', scope:'RTW sub-categories, MTM fabric ranges, MTM price bands', missing:'blank where the sheet leaves it blank' },
  { metric:'Over-stock signal', source:'Product Weekly Report · WH stock ÷ AWS L4W', formula:'weeks of cover = warehouse stock ÷ the four-week rate; amber past thirty weeks', period:'stock as at the report date', scope:'category × sub-category', missing:'no signal where either input is blank' },
  { metric:'Store month vs target', source:'DSR · MTD, MTD target, projected, new vs returning', formula:'MTD ÷ pro-rated MTD target; projection is the sheet’s own', period:'month to date', scope:"every store; the sheet's Offline / Online / region / Grand Total rows are excluded from the store list", missing:'stores with no target are listed without an achievement' },
  { metric:'Stylist KPI', source:'Stylist_KPI_Output · target, revenue, bills, UPO, conversion, NPS', formula:'as the workbook states them; Store Total rows are held out of the people list', period:'month to date', scope:'every person on the floor, by store', missing:'a zero target shows no achievement rather than a divide' },
  { metric:'On sale', source:'Product Weekly Report · on-sale block', formula:'rate of sale in the weeks after the markdown against the weeks before', period:'the ten weeks the block carries', scope:'every style marked down', missing:'styles with no pre-markdown weeks are shown, not scored' },
];

function OnSale({ show, setShow }: { show: 'all' | 'worked' | 'flat'; setShow: (v: 'all' | 'worked' | 'flat') => void }) {
  const rows = ON_SALE.filter(o => show === 'all' ? true : show === 'worked' ? (o.postRos ?? 0) > (o.preRos ?? 0) : (o.postRos ?? 0) <= (o.preRos ?? 0))
    .sort((a, b) => ((b.postRos ?? 0) - (b.preRos ?? 0)) - ((a.postRos ?? 0) - (a.preRos ?? 0)));
  const pager = usePager(rows, 20);
  const worked = ON_SALE.filter(o => (o.postRos ?? 0) > (o.preRos ?? 0)).length;
  return <>
    <div className="flex items-end gap-3 flex-wrap mb-3">
      <Seg value={show} onChange={setShow} label="Show" options={[{ id:'all', label:'Every style on sale', count: ON_SALE.length }, { id:'worked', label:'Discount moved it', count: worked, hint:'rate of sale after the markdown is above what it was before' }, { id:'flat', label:'Discount did nothing', count: ON_SALE.length - worked }]} />
      <div className="flex-1" />
      <ExportButton filename="products-on-sale" sheetName="On sale" rows={rows} cols={[{ label:'Style', get: o => o.style }, { label:'Category', get: o => o.category ?? '' }, { label:'MRP', get: o => o.mrp ?? '' }, { label:'Sale price', get: o => o.salePrice ?? '' }, { label:'Moved to sale', get: o => o.movedOn ?? '' }, { label:'Stock before', get: o => o.stockBefore ?? '' }, { label:'Pre-sale ROS', get: o => o.preRos ?? '' }, { label:'Post-sale L4W ROS', get: o => o.postRos ?? '' }]} />
    </div>
    <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><Th>Style</Th><Th hint="MRP before, and the marked-down price.">Price</Th><Th hint="When it went on sale.">Moved</Th><Th num hint="Units on the shelf the day it was marked down.">Stock before</Th><Th num hint="Units a week before the markdown.">Pre ROS</Th><Th num hint="Units a week over the four weeks after the markdown.">Post ROS</Th><Th hint="Units sold in each of the last ten weeks, newest first.">Weeks →</Th></tr></thead>
      <tbody>{pager.pageRows.map((o, i) => { const off = o.mrp && o.salePrice ? Math.round((1 - o.salePrice / o.mrp) * 100) : null; const moved = (o.postRos ?? 0) > (o.preRos ?? 0);
        return <tr key={i}>
          <td className="font-medium" style={{ whiteSpace:'normal', minWidth: 220 }}>{o.style}<div className="text-[11px] font-normal" style={{ color:'var(--ink-faint)' }}>{[o.category, o.sub1, o.sub2].filter(x => x && x !== 'NA').join(' · ')}</div></td>
          <td className="text-[12.5px]"><span style={{ textDecoration:'line-through', color:'var(--ink-faint)' }}>{inr(o.mrp)}</span> {inr(o.salePrice)}{off != null && <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}> · {off}% off</span>}</td>
          <td className="text-[12px]">{o.movedOn ? new Date(o.movedOn).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) : '—'}</td>
          <td className="num">{num(o.stockBefore)}</td>
          <td className="num">{num(o.preRos, 2)}</td>
          <td className="num" style={{ color: moved ? 'var(--good)' : (o.postRos ?? 0) < (o.preRos ?? 0) ? 'var(--risk)' : undefined }}>{num(o.postRos, 2)}</td>
          <td className="mono text-[11.5px]" style={{ color:'var(--ink-soft)' }} title={ON_SALE_WEEKS.join(' · ')}>{o.weeks.map(w => w == null ? '·' : w).join(' ')}</td>
        </tr>; })}</tbody>
    </table></div>
    <Pager page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} from={pager.from} to={pager.to} total={pager.total} noun="styles" /></Card>
    <div className="mt-3"><Note>{worked} of {ON_SALE.length} markdowns lifted the rate of sale; the rest have a stock problem, not a price problem.</Note></div>
  </>;
}

/* ---------- the DSR — every store's month against its number ------------------ */
function Dsr() {
  const [region, setRegion] = useState('all');
  const [sssg, setSssg] = useState<'all' | 'SSSG' | 'Non SSSG'>('all');
  const [q, setQ] = useState('');
  const regions = [...new Set(DSR.map(d => d.region).filter(Boolean))] as string[];
  const STORES = DSR.filter(d => d.region != null && !/total$/i.test(d.store));   // the sheet's Offline / Online / region / Grand Total rows are not stores
  const rows = STORES.filter(d => (region === 'all' || d.region === region) && (sssg === 'all' || d.sssg === sssg) && (!q || `${d.store} ${d.city}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.mtdAchPct ?? -1) - (a.mtdAchPct ?? -1));
  const sum = (k: keyof DsrRow) => rows.reduce((a, d) => a + ((d[k] as number | null) ?? 0), 0);
  const totalAch = sum('mtdTarget') ? Math.round(sum('salesMtd') / sum('mtdTarget') * 100) : null;
  return <>
    <div className="flex items-end gap-3 flex-wrap mb-3">
      <Seg value={region} onChange={setRegion} label="Region" options={[{ id:'all', label:'All', count: STORES.length }, ...regions.map(r => ({ id:r, label:r, count: STORES.filter(d => d.region === r).length }))]} />
      <Seg value={sssg} onChange={setSssg} options={[{ id:'all', label:'Every store' }, { id:'SSSG', label:'Same-store (SSSG)', hint:'open long enough to compare with last year' }, { id:'Non SSSG', label:'New stores' }]} />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="store or city" style={{ width: 200 }} />
      <div className="flex-1" />
      <ExportButton filename="dsr" sheetName="DSR" rows={rows} cols={[{ label:'Region', get: d => d.region ?? '' }, { label:'City', get: d => d.city ?? '' }, { label:'Store', get: d => d.store }, { label:'Month target', get: d => d.monthTarget ?? '' }, { label:'MTD target', get: d => d.mtdTarget ?? '' }, { label:'Sales MTD', get: d => d.salesMtd ?? '' }, { label:'MTD ach %', get: d => d.mtdAchPct ?? '' }, { label:'Projected LE', get: d => d.projectedLE ?? '' }, { label:'GOLM %', get: d => d.golm ?? '' }, { label:'GOLY %', get: d => d.goly ?? '' }, { label:'AOV MTD', get: d => d.aovMtd ?? '' }, { label:'Bills', get: d => d.bills ?? '' }, { label:'New customers', get: d => d.newCustomers ?? '' }, { label:'Returning customers', get: d => d.returningCustomers ?? '' }]} />
    </div>
    <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><Th>Store</Th><Th num hint="The store's target for the month.">Month target</Th><Th num hint="Sales so far this month against the target pro-rated to today.">MTD · vs pro-rated</Th><Th num hint="Where the month lands if the current run-rate holds.">Projected</Th><Th num hint="Growth over last month, and over the same month last year.">GOLM · GOLY</Th><Th num hint="Average bill this month.">AOV</Th><Th hint="Month-to-date revenue from customers buying for the first time, against those coming back.">New · returning</Th><Th num hint="New customers this month against the target for them.">New cust.</Th></tr></thead>
      <tbody>{rows.map(d => { const ach = d.mtdAchPct; const newShare = d.newSales != null && d.returningSales != null && (d.newSales + d.returningSales) > 0 ? d.newSales / (d.newSales + d.returningSales) : null;
        return <tr key={d.store}>
          <td className="font-medium">{d.store}<div className="text-[11px] font-normal" style={{ color:'var(--ink-faint)' }}>{d.city} · {d.region}{d.sssg === 'Non SSSG' ? ' · new store' : ''}</div></td>
          <td className="num">{inr(d.monthTarget, { compact:true })}</td>
          <td className="num"><b>{inr(d.salesMtd, { compact:true })}</b><div className="text-[11px]" style={{ color: ach == null ? 'var(--ink-faint)' : ach >= 100 ? 'var(--good)' : ach >= 85 ? 'var(--warn)' : 'var(--risk)' }}>{ach != null ? `${Math.round(ach)}% of ${inr(d.mtdTarget, { compact:true })}` : '—'}</div></td>
          <td className="num">{inr(d.projectedLE, { compact:true })}<div className="text-[11px]" style={{ color: d.projectedLE != null && d.monthTarget ? (d.projectedLE >= d.monthTarget ? 'var(--good)' : 'var(--risk)') : 'var(--ink-faint)' }}>{d.projectedLE != null && d.monthTarget ? `${Math.round(d.projectedLE / d.monthTarget * 100)}% of month` : ''}</div></td>
          <td className="num text-[12.5px]"><span style={{ color: signed(d.golm, true).tone }}>{signed(d.golm, true).text}</span> · <span style={{ color: signed(d.goly, true).tone }}>{signed(d.goly, true).text}</span></td>
          <td className="num">{inr(d.aovMtd)}</td>
          <td className="text-[12px]" style={{ minWidth: 150 }}>{newShare != null ? <><div className="flex" style={{ height: 6, borderRadius: 3, overflow:'hidden', background:'var(--surface-3)' }}><div style={{ width:`${Math.round(newShare * 100)}%`, background:'var(--accent)' }} /></div><div style={{ color:'var(--ink-faint)' }}>{Math.round(newShare * 100)}% new · {d.newBills ?? 0} + {d.returningBills ?? 0} bills</div></> : '—'}</td>
          <td className="num">{num(d.newCustomers)}<div className="text-[11px]" style={{ color: d.newCustomerAchPct == null ? 'var(--ink-faint)' : d.newCustomerAchPct >= 100 ? 'var(--good)' : 'var(--warn)' }}>{d.newCustomerAchPct != null ? `${Math.round(d.newCustomerAchPct)}% of target` : ''}</div></td>
        </tr>; })}
        <tr style={{ background:'var(--surface-2)' }}><td className="font-medium">{rows.length} store{rows.length === 1 ? '' : 's'}</td><td className="num">{inr(sum('monthTarget'), { compact:true })}</td><td className="num"><b>{inr(sum('salesMtd'), { compact:true })}</b><div className="text-[11px]" style={{ color: totalAch == null ? undefined : totalAch >= 100 ? 'var(--good)' : totalAch >= 85 ? 'var(--warn)' : 'var(--risk)' }}>{totalAch != null ? `${totalAch}% of pro-rated` : ''}</div></td><td className="num">{inr(sum('projectedLE'), { compact:true })}</td><td /><td /><td className="text-[12px]" style={{ color:'var(--ink-faint)' }}>{num(sum('newBills'))} + {num(sum('returningBills'))} bills</td><td className="num">{num(sum('newCustomers'))}</td></tr>
      </tbody>
    </table></div></Card>
    <div className="mt-3"><Note><b>MTD against the pro-rated target</b> decides the morning call; <b>projected</b> is where the month lands at this pace.</Note></div>
  </>;
}

/* ---------- the stylist KPI — every person on the floor ----------------------- */
function Stylists() {
  const stores = [...new Set(STYLIST_KPI.map(s => s.store).filter(Boolean))] as string[];
  const [store, setStore] = useState('all');
  const [show, setShow] = useState<'people' | 'stores'>('people');
  const people = STYLIST_KPI.filter(s => s.staff !== 'Store Total' && (store === 'all' || s.store === store)).sort((a, b) => (b.achPct ?? -1) - (a.achPct ?? -1));
  const totals = STYLIST_KPI.filter(s => s.staff === 'Store Total').sort((a, b) => (b.achPct ?? -1) - (a.achPct ?? -1));
  const pager = usePager(show === 'people' ? people : totals, 25);
  const rows = pager.pageRows as StylistRow[];
  return <>
    <div className="flex items-end gap-3 flex-wrap mb-3">
      <Seg value={show} onChange={setShow} options={[{ id:'people', label:'Every stylist', count: people.length }, { id:'stores', label:'Store totals', count: totals.length }]} />
      {show === 'people' && <Select value={store} onChange={setStore} style={{ width:'auto' }} options={[{ value:'all', label:`Every store · ${STYLIST_KPI.filter(s => s.staff !== 'Store Total').length} people` }, ...stores.map(s => ({ value:s, label:s }))]} />}
      <div className="flex-1" />
      <ExportButton filename="stylist-kpi" sheetName="Stylist KPI" rows={show === 'people' ? people : totals} cols={[{ label:'Store', get: s => s.store ?? '' }, { label:'Staff', get: s => s.staff }, { label:'Target', get: s => s.target ?? '' }, { label:'Revenue', get: s => s.revenue ?? '' }, { label:'Ach %', get: s => s.achPct != null ? Math.round(s.achPct * 100) : '' }, { label:'Bills', get: s => s.bills ?? '' }, { label:'Qty', get: s => s.qty ?? '' }, { label:'ASP', get: s => s.asp ?? '' }, { label:'AOV', get: s => s.aov ?? '' }, { label:'UPO', get: s => s.upo ?? '' }, { label:'New customers', get: s => s.newCustomers ?? '' }, { label:'Returning', get: s => s.returningCustomers ?? '' }, { label:'NPS', get: s => s.nps ?? '' }]} />
    </div>
    {rows.length === 0 ? <Card><Empty title="Nobody here." body="" /></Card> : <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><Th>{show === 'people' ? 'Stylist' : 'Store'}</Th><Th num hint="Personal target for the period.">Target</Th><Th num hint="Revenue billed against it.">Revenue · ach</Th><Th num hint="Bills raised, and pieces in them.">Bills · pcs</Th><Th num hint="Average selling price per piece.">ASP</Th><Th num hint="Average bill.">AOV</Th><Th num hint="Units per order — pieces per bill.">UPO</Th><Th hint="Customers buying for the first time against those coming back.">New · returning</Th><Th num hint="Net promoter score where captured.">NPS</Th></tr></thead>
      <tbody>{rows.map((s, i) => { const ach = s.achPct != null ? s.achPct * 100 : null; const tone: Tone = ach == null ? 'neutral' : ach >= 100 ? 'good' : ach >= 80 ? 'warn' : 'risk';
        return <tr key={i}>
          <td className="font-medium">{show === 'people' ? s.staff : s.store}{show === 'people' && <div className="text-[11px] font-normal" style={{ color:'var(--ink-faint)' }}>{s.store}</div>}</td>
          <td className="num">{s.target ? inr(s.target, { compact:true }) : <span style={{ color:'var(--ink-faint)' }}>no target</span>}</td>
          <td className="num"><b>{inr(s.revenue, { compact:true })}</b> {ach != null && s.target ? <Pill tone={tone}>{Math.round(ach)}%</Pill> : null}</td>
          <td className="num">{num(s.bills)} · {num(s.qty)}</td>
          <td className="num">{inr(s.asp)}</td>
          <td className="num">{inr(s.aov)}</td>
          <td className="num">{num(s.upo, 1)}</td>
          <td className="text-[12.5px]">{num(s.newCustomers)} new · {num(s.returningCustomers)} back{s.newAov != null && s.returningAov != null && <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>AOV {inr(s.newAov)} · {inr(s.returningAov)}</div>}</td>
          <td className="num">{s.nps != null ? num(s.nps) : <span style={{ color:'var(--ink-faint)' }}>—</span>}</td>
        </tr>; })}</tbody>
    </table></div>
    <Pager page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} from={pager.from} to={pager.to} total={pager.total} noun={show === 'people' ? 'stylists' : 'stores'} /></Card>}
    <div className="mt-3"><Note>A high achiever on a low <b>ASP</b> is discounting; a high AOV on a low <b>UPO</b> is selling the expensive thing once.</Note></div>
  </>;
}
