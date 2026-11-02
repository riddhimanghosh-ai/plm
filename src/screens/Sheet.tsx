/* Sheet (2 Nov 2026) — the folder's tables on one screen, every one joined through the
   product ID. Pick an option and each table below shows only its rows: the master, stock
   by size and location, sales by size and week, the health row, open orders, lost sales
   and planning reviews. With no option picked it is the joined index: one row per product,
   one column group per table. */
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { RtwOption } from '../domain/types';
import { healthRowOf, wipOf, storeStockOf, salesBySizeOf, fmtDate, daysAgo } from '../domain/engines';
import { STORES } from '../domain/reference';
import { categoryOfOption } from '../domain/analysis';
import { Page, Card, Pill, Input, Select, Th, Button, usePager, Pager, ExportButton } from '../ui';

const faint = { color: 'var(--ink-faint)' } as const;
const holderName = (id: string) => id === 'warehouse' ? 'Factory Warehouse' : STORES.find(s => s.id === id)?.name ?? id;
const WEEKS = 12;

/* every table, keyed by the product ID; the join is the same column in each */
const TABLES = [
  { id: 'master', name: 'Product master', key: 'Option ID', grain: 'one row per product' },
  { id: 'stock', name: 'Stock', key: 'Option ID × size × location', grain: 'Enigma stock report' },
  { id: 'sales', name: 'Sales', key: 'Option ID × size × week', grain: 'Product Weekly Report' },
  { id: 'health', name: 'Health row', key: 'Option ID', grain: 'ROS & health Report' },
  { id: 'orders', name: 'Open orders', key: 'Option ID × PO', grain: 'WIP tracker' },
  { id: 'lost', name: 'Lost sales', key: 'Option ID × ask', grain: 'RetailOS' },
  { id: 'reviews', name: 'Planning reviews', key: 'Option ID × review', grain: 'this PLM' },
] as const;

function JoinBar({ counts, jump }: { counts: Record<string, number>; jump: (id: string) => void }) {
  return <div className="flex flex-wrap items-center gap-2 text-[12px]">
    <span style={faint}>Joined on</span><Pill tone="accent">Option ID</Pill>
    {TABLES.map((t, i) => <span key={t.id} className="flex items-center gap-2">
      {i > 0 && <span style={faint}>→</span>}
      <button className="pill" title={`${t.key} · ${t.grain}`} onClick={() => jump(t.id)}>{t.name} · {counts[t.id] ?? 0}</button>
    </span>)}
  </div>;
}

export function Sheet() {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const id = params.get('id');
  const options = useMemo(() => db.options.filter(o => !o.inactive).sort((a, b) => a.styleName.localeCompare(b.styleName)), [db]);
  const o = options.find(x => x.id === id) ?? null;
  const pick = (v: string) => { const n = new URLSearchParams(params); if (v) n.set('id', v); else n.delete('id'); setParams(n, { replace: true }); };
  const jump = (t: string) => document.getElementById(`sheet-${t}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /* the joined index: one row per product, one number from each table */
  const index = useMemo(() => options.map(x => {
    const h = healthRowOf(x); const wip = wipOf(db, x);
    const lost = (db.lostSales ?? []).filter(l => l.optionId === x.id);
    const reviews = (db.planningReviews ?? []).filter(r => r.optionId === x.id).sort((a, b) => b.on.localeCompare(a.on));
    return { o: x, h, wipQty: wip.filter(w => w.firm).reduce((a, w) => a + w.qty, 0), wipN: wip.length, lost: lost.length, lost4: lost.filter(l => daysAgo(l.on) <= 28).length, reviews: reviews.length, last: reviews[0] ?? null };
  }), [db, options]);
  const q = search.trim().toLowerCase();
  const shown = index.filter(r => !q || r.o.styleName.toLowerCase().includes(q) || r.o.id.toLowerCase().includes(q) || (r.o.sku ?? '').toLowerCase().includes(q) || r.o.subCat1.toLowerCase().includes(q));
  const pager = usePager(shown, 25);

  return <Page title="Sheet · all tables, one key" lede="Every table the planners keep, on one screen, joined through the product ID. Pick an option and each table shows only its rows. Leave it blank and the index shows one row per product with a column from each table."
    replaces="the lookups between the Enigma stock report, the Product Weekly Report, the ROS & health Report, the WIP tracker and the Recce working, done by VLOOKUP on the style name"
    actions={<div className="flex gap-2 items-center">
      <Select value={o?.id ?? ''} onChange={pick} options={[{ value: '', label: 'All products · the joined index' }, ...options.map(x => ({ value: x.id, label: `${x.styleName} · ${x.id}` }))]} />
      {o && <Button variant="ghost" onClick={() => pick('')}>Back to the index</Button>}
    </div>}>

    {!o && <>
      <Card className="mb-3"><div className="px-4 py-3 flex flex-wrap items-center gap-3">
        <JoinBar counts={{ master: options.length, stock: index.reduce((a, r) => a + r.h.stock, 0), sales: index.reduce((a, r) => a + (r.o.totalSale ?? 0), 0), health: options.length, orders: index.reduce((a, r) => a + r.wipN, 0), lost: index.reduce((a, r) => a + r.lost, 0), reviews: index.reduce((a, r) => a + r.reviews, 0) }} jump={() => undefined} />
        <div className="ml-auto flex gap-2 items-center">
          <Input placeholder="Search style, ID, SKU, sub-category" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 260 }} />
          <ExportButton filename="joined-index" rows={shown} cols={[
            { label: 'Option ID', get: r => r.o.id }, { label: 'Style', get: r => r.o.styleName }, { label: 'Sub-Category 1', get: r => r.o.subCat1 }, { label: 'Core', get: r => r.o.core ? 'Core' : 'Non-core' },
            { label: 'Stock', get: r => r.h.stock }, { label: 'Main', get: r => r.h.mainStock }, { label: 'Total Sale', get: r => r.o.totalSale ?? '' }, { label: 'L4W', get: r => r.h.l4w.toFixed(1) }, { label: 'AWS', get: r => r.h.aws.toFixed(1) }, { label: 'WC', get: r => r.h.wc >= 999 ? '' : r.h.wc.toFixed(1) }, { label: 'Healthy', get: r => r.h.healthy ? 'Healthy' : 'Unhealthy' },
            { label: 'Open orders', get: r => r.wipN }, { label: 'On order pcs', get: r => r.wipQty }, { label: 'Lost sales', get: r => r.lost }, { label: 'Reviews', get: r => r.reviews }, { label: 'Last review', get: r => r.last ? `${fmtDate(r.last.on)} · ${r.last.status}` : '' }]} />
        </div>
      </div></Card>
      <Card><div style={{ overflowX: 'auto' }}><table className="t compact">
        <thead>
          <tr>
            <th colSpan={4} style={{ borderRight: '1px solid var(--line)' }}>Product master</th>
            <th colSpan={2} style={{ borderRight: '1px solid var(--line)' }}>Stock</th>
            <th colSpan={2} style={{ borderRight: '1px solid var(--line)' }}>Sales</th>
            <th colSpan={3} style={{ borderRight: '1px solid var(--line)' }}>Health row</th>
            <th colSpan={2} style={{ borderRight: '1px solid var(--line)' }}>Open orders</th>
            <th style={{ borderRight: '1px solid var(--line)' }}>Lost sales</th>
            <th colSpan={2}>Planning reviews</th>
          </tr>
          <tr>
            <Th>Option ID</Th><Th>Style</Th><Th>Sub-category</Th><Th>Core</Th>
            <Th num>All sizes</Th><Th num hint="stock in the main sizes">Main</Th>
            <Th num hint="units since launch">Since launch</Th><Th num>L4W</Th>
            <Th num>AWS</Th><Th num>WC</Th><Th>Healthy</Th>
            <Th num>POs</Th><Th num>Pcs</Th>
            <Th num hint="asks for a size that was out, logged by stores">Asks</Th>
            <Th num>Count</Th><Th>Last</Th>
          </tr>
        </thead>
        <tbody>{pager.pageRows.map(r => <tr key={r.o.id} className="row" onClick={() => pick(r.o.id)}>
          <td className="font-mono text-[12px]">{r.o.id}</td>
          <td><span className="font-medium">{r.o.styleName}</span>{r.o.sku && <div className="text-[11px]" style={faint}>{r.o.sku}</div>}</td>
          <td className="text-[12px]">{r.o.subCat1}</td>
          <td><Pill tone={r.o.core ? 'info' : 'neutral'}>{r.o.core ? 'Core' : 'Non-core'}</Pill></td>
          <td className="num">{r.h.stock}</td><td className="num">{r.h.mainStock}</td>
          <td className="num">{r.o.totalSale ?? '—'}</td><td className="num">{r.h.l4w.toFixed(1)}</td>
          <td className="num font-medium">{r.h.aws.toFixed(1)}</td><td className="num">{r.h.wc >= 999 ? '—' : r.h.wc.toFixed(1)}</td>
          <td><Pill tone={r.h.healthy ? 'good' : 'risk'}>{r.h.healthy ? 'Healthy' : 'Unhealthy'}</Pill></td>
          <td className="num">{r.wipN || '—'}</td><td className="num">{r.wipQty || '—'}</td>
          <td className="num" style={{ color: r.lost4 ? 'var(--risk)' : undefined }}>{r.lost || '—'}</td>
          <td className="num">{r.reviews || '—'}</td>
          <td className="text-[12px]">{r.last ? <>{fmtDate(r.last.on)} <span style={faint}>· {r.last.status}</span></> : '—'}</td>
        </tr>)}</tbody>
      </table></div>
      <Pager page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} from={pager.from} to={pager.to} total={pager.total} noun="products" /></Card>
    </>}

    {o && <OneProduct o={o} jump={jump} />}
  </Page>;
}

function OneProduct({ o, jump }: { o: RtwOption; jump: (id: string) => void }) {
  const { db } = useApp();
  const h = healthRowOf(o);
  const byHolder = storeStockOf(o);
  const holders = Object.keys(byHolder);
  const bySize = salesBySizeOf(o); const n = o.weeklySales.length;
  const weeks = Array.from({ length: Math.min(WEEKS, n) }, (_, i) => i); // 0 = last week
  const wip = wipOf(db, o);
  const lost = (db.lostSales ?? []).filter(l => l.optionId === o.id).sort((a, b) => b.on.localeCompare(a.on));
  const reviews = (db.planningReviews ?? []).filter(r => r.optionId === o.id).sort((a, b) => b.on.localeCompare(a.on));
  const vendor = o.vendorId ? db.vendors.find(v => v.id === o.vendorId) : null;
  const head = (t: typeof TABLES[number], right?: ReactNode) => <div className="px-4 py-2 flex items-center gap-3 border-b" style={{ borderColor: 'var(--line)' }} id={`sheet-${t.id}`}>
    <span className="font-medium">{t.name}</span>
    <span className="text-[11px]" style={faint}>{t.key} · {t.grain}</span>
    <span className="ml-auto text-[11px] font-mono" style={faint}>WHERE option_id = '{o.id}'</span>{right}
  </div>;
  const sizeHead = <tr><Th>{''}</Th>{o.sizes.map(s => <Th key={s} num>{s}</Th>)}<Th num>Total</Th></tr>;
  const sum = (r: Record<string, number>) => o.sizes.reduce((a, s) => a + (r[s] ?? 0), 0);

  return <div className="grid gap-3">
    <Card><div className="px-4 py-3"><JoinBar counts={{ master: 1, stock: h.stock, sales: o.totalSale ?? o.weeklySales.reduce((a, b) => a + b, 0), health: 1, orders: wip.length, lost: lost.length, reviews: reviews.length }} jump={jump} /></div></Card>

    {/* 1 · master */}
    <Card>{head(TABLES[0], <a className="cta ml-3" href={`#/planning?open=${o.id}`}>Open in planning →</a>)}
      <div style={{ overflowX: 'auto' }}><table className="t compact">
        <thead><tr><Th>Option ID</Th><Th>Style</Th><Th>Category</Th><Th>Sub-category 1</Th><Th>Sub-category 2</Th><Th>Core</Th><Th>SKU</Th><Th>Vendor</Th><Th>Fabric code</Th><Th>Launched</Th><Th num>MRP</Th><Th>On sale</Th><Th>Sizes</Th></tr></thead>
        <tbody><tr>
          <td className="font-mono text-[12px]">{o.id}</td><td className="font-medium">{o.styleName}</td><td>{categoryOfOption(o)}</td><td>{o.subCat1}</td><td>{o.subCat2}</td>
          <td><Pill tone={o.core ? 'info' : 'neutral'}>{o.core ? 'Core' : 'Non-core'}</Pill></td>
          <td className="font-mono text-[12px]">{o.sku ?? '—'}</td><td>{vendor?.name ?? '—'}</td><td className="font-mono text-[12px]">{o.fabricCode ?? '—'}</td>
          <td>{fmtDate(o.launchedAt)} <span style={faint}>· {h.wof} wk</span></td><td className="num">₹{o.mrp.toLocaleString('en-IN')}</td>
          <td>{o.eoss ? <Pill tone="warn">EOSS{o.discountedMrp ? ` · ₹${o.discountedMrp.toLocaleString('en-IN')}` : ''}</Pill> : 'Full price'}</td><td className="text-[12px]">{o.sizes.join(' ')}</td>
        </tr></tbody></table></div></Card>

    {/* 2 · stock */}
    <Card>{head(TABLES[1])}
      <div style={{ overflowX: 'auto' }}><table className="t compact">
        <thead><tr><Th>Location</Th>{o.sizes.map(s => <Th key={s} num>{s}</Th>)}<Th num>Total</Th></tr></thead>
        <tbody>{holders.map(hd => <tr key={hd}><td>{holderName(hd)}</td>{o.sizes.map(s => <td key={s} className="num" style={{ color: byHolder[hd][s] ? undefined : 'var(--ink-faint)' }}>{byHolder[hd][s] || '·'}</td>)}<td className="num font-medium">{sum(byHolder[hd])}</td></tr>)}
          <tr style={{ background: 'var(--surface-2)' }}><td className="font-medium">All locations</td>{o.sizes.map(s => <td key={s} className="num font-medium" style={{ color: (o.stockBySize[s] ?? 0) ? undefined : 'var(--risk)' }}>{o.stockBySize[s] ?? 0}</td>)}<td className="num font-medium">{h.stock}</td></tr>
        </tbody></table></div></Card>

    {/* 3 · sales */}
    <Card>{head(TABLES[2])}
      <div style={{ overflowX: 'auto' }}><table className="t compact">
        <thead>{sizeHead}</thead>
        <tbody>{weeks.map(w => { const row = Object.fromEntries(o.sizes.map(s => [s, bySize[s][n - 1 - w] ?? 0])); const ok = o.inStockWeeks[n - 1 - w];
          return <tr key={w}><td>{w === 0 ? 'LW' : `LW-${w}`}{!ok && <span className="text-[11px] ml-1" style={faint}>· broken</span>}</td>{o.sizes.map(s => <td key={s} className="num" style={{ color: row[s] ? undefined : 'var(--ink-faint)' }}>{row[s] || '·'}</td>)}<td className="num font-medium">{sum(row)}</td></tr>; })}
          <tr style={{ background: 'var(--surface-2)' }}><td className="font-medium">Last {weeks.length} weeks</td>{o.sizes.map(s => <td key={s} className="num font-medium">{weeks.reduce((a, w) => a + (bySize[s][n - 1 - w] ?? 0), 0)}</td>)}<td className="num font-medium">{weeks.reduce((a, w) => a + (o.weeklySales[n - 1 - w] ?? 0), 0)}</td></tr>
        </tbody></table></div></Card>

    {/* 4 · health */}
    <Card>{head(TABLES[3])}
      <div style={{ overflowX: 'auto' }}><table className="t compact">
        <thead><tr><Th num>Total Sale</Th><Th num>WOF</Th><Th num>ROS</Th><Th num>LW</Th><Th num>LW-1</Th><Th num>LW-2</Th><Th num>LW-3</Th><Th num>L4W</Th><Th num>Top 6</Th><Th num>Main</Th><Th num>AWS</Th><Th num>WC</Th><Th num>Low sizes</Th><Th num>Health</Th><Th>Healthy</Th></tr></thead>
        <tbody><tr>
          <td className="num">{h.totalSale}</td><td className="num">{h.wof}</td><td className="num">{h.ros.toFixed(1)}</td>
          <td className="num">{h.lw[0]}</td><td className="num">{h.lw[1]}</td><td className="num">{h.lw[2]}</td><td className="num">{h.lw[3]}</td>
          <td className="num">{h.l4w.toFixed(1)}</td><td className="num">{h.top6Ros.toFixed(1)}</td><td className="num">{h.mainStock}</td><td className="num font-medium">{h.aws.toFixed(1)}</td>
          <td className="num">{h.wc >= 999 ? '—' : h.wc.toFixed(1)}</td><td className="num">{h.low.length ? h.low.join(' ') : '—'}</td><td className="num">{Math.round(h.stockHealth * 100)}%</td>
          <td><Pill tone={h.healthy ? 'good' : 'risk'}>{h.healthy ? 'Healthy' : 'Unhealthy'}</Pill></td>
        </tr></tbody></table></div></Card>

    {/* 5 · orders */}
    <Card>{head(TABLES[4], <a className="cta ml-3" href="#/tracker">Tracker →</a>)}
      <div style={{ overflowX: 'auto' }}><table className="t compact">
        <thead><tr><Th>PO</Th><Th>Order</Th><Th>Vendor</Th><Th>Status</Th><Th num>Qty</Th><Th>Arrives</Th><Th num>Weeks away</Th>{o.sizes.map(s => <Th key={s} num>{s}</Th>)}</tr></thead>
        <tbody>{wip.length === 0 && <tr><td colSpan={7 + o.sizes.length} style={faint}>No open orders for this option.</td></tr>}
          {wip.map(w => { const v = db.vendors.find(x => x.id === w.order.vendorId); const br = Object.fromEntries((w.breakup ?? []).map(b => [b.size, b.qty]));
            return <tr key={w.order.id}><td className="font-mono text-[12px]">{w.poNo ?? <span style={faint}>no PO yet</span>}</td><td className="font-mono text-[12px]">{w.order.id}</td><td>{v?.name ?? '—'}</td><td><Pill tone={w.firm ? 'info' : 'neutral'}>{w.order.status}</Pill></td><td className="num font-medium">{w.qty}</td><td>{fmtDate(w.arrives)}</td><td className="num">{w.weeksAway}</td>{o.sizes.map(s => <td key={s} className="num" style={{ color: br[s] ? undefined : 'var(--ink-faint)' }}>{br[s] || '·'}</td>)}</tr>; })}
        </tbody></table></div></Card>

    {/* 6 · lost sales */}
    <Card>{head(TABLES[5])}
      <div style={{ overflowX: 'auto' }}><table className="t compact">
        <thead><tr><Th>Logged</Th><Th>Store</Th><Th>Size</Th><Th>By</Th><Th>Note</Th></tr></thead>
        <tbody>{lost.length === 0 && <tr><td colSpan={5} style={faint}>No asks logged for this option.</td></tr>}
          {lost.map(l => <tr key={l.id}><td>{fmtDate(l.on)}</td><td>{holderName(l.storeId)}</td><td className="font-medium">{l.size}</td><td>{l.by}</td><td className="text-[12px]">{l.note || '—'}</td></tr>)}
        </tbody></table></div></Card>

    {/* 7 · reviews */}
    <Card>{head(TABLES[6])}
      <div style={{ overflowX: 'auto' }}><table className="t compact">
        <thead><tr><Th>Reviewed</Th><Th>By</Th><Th>Kind</Th><Th>Status</Th><Th num>Plan ROS</Th><Th num>Lead wk</Th><Th num>Draft qty</Th><Th num>Approved</Th><Th>Grade</Th><Th>Requirement</Th><Th>Note</Th></tr></thead>
        <tbody>{reviews.length === 0 && <tr><td colSpan={11} style={faint}>No planning review yet. <a className="cta" href={`#/planning?open=${o.id}`}>Start one →</a></td></tr>}
          {reviews.map(r => <tr key={r.id}><td>{fmtDate(r.on)}</td><td>{r.by}</td><td>{r.kind}</td><td><Pill tone={r.status === 'sent' ? 'good' : r.status === 'approved' ? 'info' : 'neutral'}>{r.status}</Pill></td><td className="num">{r.planRos.toFixed(1)}</td><td className="num">{r.leadWeeks}</td><td className="num">{r.draftQty}</td><td className="num font-medium">{r.approvedQty ?? '—'}</td><td>{r.grade ?? '—'}</td><td className="font-mono text-[12px]">{r.requirementId ?? '—'}</td><td className="text-[12px]">{r.constraintNote || r.note || '—'}</td></tr>)}
        </tbody></table></div></Card>
  </div>;
}
