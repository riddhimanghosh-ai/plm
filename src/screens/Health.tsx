/* RTW option book — BSC's own Action & Velocity rules, run rather than
   reinvented. Every row says what to DO, not just whether it is healthy, and
   the numbers correct for the weeks a size was broken so a stock-out stops
   reading as weak demand. Click any option for its 360: plan, stock by size,
   sales with their conditions, supply on the way, where it sits in stores,
   and the decision it is asking for. */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { RtwAction, RtwOption } from '../domain/types';
import { healthOf, rosOf, fmtDate, fmtRel, daysAgo, riskOf, stageOf, reorderOf, fmtMoney, floorPiecesOf, launchOf, replenishmentOf, sellThroughOf, requestsForOption, demandFromStores } from '../domain/engines';
import { GROWTH_UPLIFT, RTW_REORDER_TRIGGER_DAYS, RTW_MOQ } from '../domain/reference';
import { RecordTail } from './RecordTail';
import { FILE_LABELS } from '../domain/reference';

import { RTW_SUBCATS, STORES } from '../domain/reference';
import { Page, Card, Pill, Tabs, Button, Drawer, KV, Section, Note, Field, Input, Th, Select, Seg, usePager, Pager, ExportButton, Why, useExamples, type Tone } from '../ui';
import { ActsBy } from './Who';

/* The Replenishment sheet's shape — sku_code · Style · Size · Factory · Allocate · Balance, then per store
   Stock / Allocation / Pullback — as one row per SKU-size with the store lists folded in. */
function ReplenishmentSheet({ onOpen }: { onOpen: (id: string) => void }) {
  const { db } = useApp();
  const rows = replenishmentOf(db).slice(0, 18);
  const name = (id: string) => STORES.find(s => s.id === id)?.name ?? id;
  const ex = useExamples(rows, r => r.pullback.length && r.allocate.length ? 'both' : r.pullback.length ? 'pullback' : 'allocate', { noun: 'sizes', score: r => r.allocate.length + r.pullback.length, done: r => r.allocate.length > 0 && r.pullback.length === 0 && r.balance >= 0 });
  if (!rows.length) return <Card><div className="py-3 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>No size needs moving this week.</div></Card>;
  return <>
    {ex.strip && <div className="flex justify-end mb-2">{ex.strip}</div>}
    <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><th>sku_code</th><th>Style</th><th className="num">Size</th><th className="num">At unit</th><th className="num">Allocate</th><th className="num">Balance</th><th>To stores at zero</th><th>Pull back</th></tr></thead>
      <tbody>{ex.rows.map(r => <tr key={r.sku} className="row" onClick={() => onOpen(r.o.id)}>
        <td className="mono text-[11.5px]">{r.sku}</td>
        <td className="font-medium">{r.o.styleName}<div className="text-[11px] font-normal" style={{ color:'var(--ink-faint)' }}>{r.o.subCat1}</div></td>
        <td className="num">{r.size}</td>
        <td className="num">{r.hub}</td>
        <td className="num" style={{ color: r.allocate.length ? 'var(--info)' : 'var(--ink-faint)' }}>{r.allocate.reduce((a, x) => a + x.qty, 0) || '—'}</td>
        <td className="num">{r.balance}</td>
        <td className="text-[12px]">{r.allocate.length ? r.allocate.map(a => name(a.storeId)).join(', ') : <span style={{ color:'var(--ink-faint)' }}>—</span>}</td>
        <td className="text-[12px]" style={{ color: r.pullback.length ? 'var(--warn)' : 'var(--ink-faint)' }}>{r.pullback.length ? r.pullback.map(p => `${name(p.storeId)} ${p.qty}`).join(', ') : '—'}</td>
      </tr>)}</tbody>
    </table></div></Card>
    <div className="mt-3"><Note>One line per SKU and size: what the unit holds, what to send to stores at zero, what to pull back.</Note></div>
  </>;
}

const ACTION_TONE: Record<RtwAction, Tone> = { 'URGENT REPLENISH':'risk', 'REINTRODUCE':'risk', 'SIZE FILL':'warn', 'REVIEW':'warn', 'LIQUIDATE':'risk', 'EXIT':'risk', 'CLEAR / DISCOUNT':'warn', 'MAINTAIN':'good', 'MONITOR':'neutral' };
const ORDER: RtwAction[] = ['URGENT REPLENISH', 'REINTRODUCE', 'SIZE FILL', 'LIQUIDATE', 'EXIT', 'CLEAR / DISCOUNT', 'REVIEW', 'MONITOR', 'MAINTAIN'];
/* Nine verbs is the workbook's own vocabulary and worth keeping on the row —
   but nine chips to filter by is a wall. A planner arrives with one of four
   questions, so those are the buttons; the verb itself stays on every row. */
const INTENT: { id: string; label: string; hint: string; actions: RtwAction[] }[] = [
  { id:'buy',   label:'Get stock in',   hint:'selling and short — reorder or fill the sizes', actions:['URGENT REPLENISH', 'SIZE FILL'] },
  { id:'back',  label:'Bring back',     hint:'off the shelf, and it was selling when it was pulled', actions:['REINTRODUCE'] },
  { id:'clear', label:'Clear it out',   hint:'overstocked or dead — discount, liquidate, exit', actions:['LIQUIDATE', 'EXIT', 'CLEAR / DISCOUNT'] },
  { id:'fine',  label:'Leave it',       hint:'nothing to do this week', actions:['MAINTAIN', 'MONITOR', 'REVIEW'] },
];

export function Health() {
  const { db, role, decideOption } = useApp();
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  const open = (id: string | null) => { const n = new URLSearchParams(params); id ? n.set('open', id) : n.delete('open'); setParams(n, { replace:true }); };
  const demand = useMemo(() => new Map(demandFromStores(db).map(d => [d.optionId, d])), [db]);
  const [intent, setIntent] = useState<string>('all');
  const [q, setQ] = useState('');
  const [book, setBook] = useState<'all' | 'core' | 'noncore' | 'sizeout' | 'inactive'>('all');
  const tab = params.get('tab') ?? 'options';
  const setTab = (t: string) => { const n = new URLSearchParams(params); n.set('tab', t); setParams(n, { replace:true }); };
  const mine = role === 'planning' || role === 'owner';   // the option book is planning's call
  /* a cell on the plan is a set of options — carry it to the list in the URL so
     the view is shareable and Back still works */
  const sc = params.get('sc');            // 'Formal Solid|Formal Solid'
  const slice = params.get('slice');      // core · core-healthy · core-sizeout · noncore · healthy · all
  const drill = (scKey: string, sliceKey: string) => { const n = new URLSearchParams(params); n.set('tab', 'options'); n.set('sc', scKey); sliceKey === 'all' ? n.delete('slice') : n.set('slice', sliceKey); setParams(n, { replace:false }); };
  const clearDrill = () => { const n = new URLSearchParams(params); n.delete('sc'); n.delete('slice'); setParams(n, { replace:true }); };
  const SLICE_LABEL: Record<string, string> = { core:'core options', 'core-healthy':'core, healthy', 'core-sizeout':'core with a size out', noncore:'non-core options', healthy:'healthy options' };

  const rows = db.options.map(o => ({ o, h: healthOf(o) }))
    .filter(x => intent === 'all' || (intent === 'asked' ? demand.has(x.o.id) : (INTENT.find(i => i.id === intent)?.actions ?? []).includes(x.h.action)))
    .filter(x => !q.trim() || q.toLowerCase().split(/\s+/).every(w => `${x.o.styleName} ${x.o.subCat1} ${x.o.subCat2} ${x.o.sku ?? ''}`.toLowerCase().includes(w)))
    .filter(x => { if (!sc) return true; const [s1, s2] = sc.split('|'); return x.o.subCat1 === s1 && (s2 === s1 || x.o.subCat2 === s2); })
    .filter(x => !slice ? true
      : slice === 'core' ? x.o.core
      : slice === 'core-healthy' ? x.o.core && x.h.health === 'Healthy'
      : slice === 'core-sizeout' ? x.o.core && x.h.szOOS > 0
      : slice === 'noncore' ? !x.o.core
      : slice === 'healthy' ? x.h.health === 'Healthy' : true)
    .filter(x => book === 'all' ? true : book === 'core' ? x.o.core : book === 'noncore' ? !x.o.core : book === 'inactive' ? !!x.o.inactive : x.h.szOOS > 0)
    .sort((a, b) => ORDER.indexOf(a.h.action) - ORDER.indexOf(b.h.action));
  const all = db.options.map(healthOf);
  const active = db.options.find(o => o.id === openId) ?? null;
  // one example per action verb so the demo shows a replenish, a size fill, a liquidate and a maintain side by side
  const ex = useExamples(rows, x => x.h.action, { noun: 'options', score: x => (x.o.core ? 1 : 0) + (x.h.szOOS > 0 ? 1 : 0) + (demand.has(x.o.id) ? 1 : 0), done: x => x.h.health === 'Healthy' && x.h.action === 'MAINTAIN' });
  const pager = usePager(ex.rows, 25);

  /* the sheets plan by sub-category 1; sub-category 2 is a finer label (Satin, 4-Way Stretch Nylon) that does not carry its own ideal */
  const inSub = (o: RtwOption, sc: { sub1: string; sub2: string }) => o.subCat1 === sc.sub1 && (sc.sub2 === sc.sub1 || o.subCat2 === sc.sub2);
  const gaps = RTW_SUBCATS.map(sc => { const os = db.options.filter(o => inSub(o, sc)); const live = os.filter(o => healthOf(o).health === 'Healthy').length; const coreOs = os.filter(o => o.core); const coreLive = coreOs.filter(o => healthOf(o).health === 'Healthy').length; const coreSizeOut = coreOs.filter(o => healthOf(o).szOOS > 0).length;
    return { ...sc, live, total: os.length, gap: sc.ideal == null ? null : sc.ideal - live, coreListed: coreOs.length, coreLive, coreSizeOut, coreGap: sc.coreIdeal == null ? null : sc.coreIdeal - coreLive, nonIdeal: sc.ideal == null || sc.coreIdeal == null ? null : sc.ideal - sc.coreIdeal, nonListed: os.length - coreOs.length }; });

  return (
    <Page title="RTW stock health" lede={`${all.filter(h => h.health === 'Healthy').length} of ${all.length} options healthy, each row carrying the action BSC's own rules say to take.`}
      replaces="the ROS & Health workbook rebuilt every fortnight by scanning every SKU and size by hand">

      {/* three questions, three screens — the list used to run 448 rows deep with
          two more tables stacked under it, so nobody ever reached the plan. */}
      <Tabs active={tab} onChange={setTab} tabs={[
        { id:'options', label:'Every option · what to do', count: all.filter(h => h.health === 'Unhealthy').length },
        { id:'plan', label:'Option count vs the plan' },
        { id:'replen', label:'Replenish & pull back · this week' },
      ]} />

      {tab === 'options' && <>
      <div className="flex gap-3 flex-wrap mb-3 items-center">
        <Seg value={intent} onChange={setIntent} options={[
          { id:'all', label:'All', count: all.length },
          ...INTENT.map(i => ({ id: i.id, label: i.label, hint: i.hint, count: all.filter(h => i.actions.includes(h.action)).length })),
          { id:'asked', label:'Stores asked for it', count: demand.size, hint:'a store went to another store for this — demand the shelf missed' },
        ]} />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search style, sub-category, SKU…" style={{ width: 230 }} aria-label="search options" />
        <Select value={book} onChange={v => setBook(v as typeof book)} style={{ width:'auto' }} options={[
          { value:'all', label:`Every option · ${db.options.length}` },
          { value:'core', label:`Core only · ${db.options.filter(o => o.core).length}` },
          { value:'noncore', label:`Non-core only · ${db.options.filter(o => !o.core).length}` },
          { value:'sizeout', label:`Missing a size · ${all.filter(h => h.szOOS > 0).length}` },
          { value:'inactive', label:`Off the shelf · ${db.options.filter(o => o.inactive).length}` },
        ]} />
        {(intent !== 'all' || book !== 'all' || q) && <button type="button" className="vlink text-[12px]" onClick={() => { setIntent('all'); setBook('all'); setQ(''); }}>clear</button>}
      </div>

      {sc && <div className="flex items-center gap-2 flex-wrap mb-3 text-[12.5px]">
        <span style={{ color:'var(--ink-soft)' }}>From the plan:</span>
        <span className="pill">{sc.split('|')[0]}{sc.split('|')[1] !== sc.split('|')[0] ? ` · ${sc.split('|')[1]}` : ''}{slice ? ` · ${SLICE_LABEL[slice] ?? slice}` : ''}</span>
        <span style={{ color:'var(--ink-faint)' }}>{rows.length} option{rows.length === 1 ? '' : 's'}</span>
        <button type="button" className="vlink" onClick={clearDrill}>show every option</button>
        <button type="button" className="vlink" onClick={() => setTab('plan')}>← back to the plan</button>
      </div>}

      <div className="flex mb-3 items-center gap-3">
        {ex.strip && <span className="ml-auto">{ex.strip}</span>}
        <span className={ex.strip ? '' : 'ml-auto'}><ExportButton filename="rtw-stock-health" rows={rows} cols={[
          { label:'Option', get: (x: typeof rows[number]) => x.o.styleName },
          { label:'Sub-category', get: x => x.o.subCat1 },
          { label:'Core', get: x => x.o.core ? 'yes' : 'no' },
          { label:'Stock', get: x => x.h.stock },
          { label:'Weeks of cover', get: x => x.h.wof >= 999 ? '' : x.h.wof.toFixed(0) },
          { label:'Rate of sale a week', get: x => x.h.trueRos.toFixed(1) },
          { label:'Sizes out', get: x => x.o.sizes.filter(sz => (x.o.stockBySize[sz] ?? 0) === 0).join(' ') },
          { label:'Listed', get: x => x.o.inactive ? 'off the shelf' : 'active' },
          { label:'Off the shelf since', get: x => x.o.inactive ? x.o.inactive.on.slice(0, 10) : '' },
          { label:'Why it was taken off', get: x => x.o.inactive?.reason ?? '' },
          { label:'Action', get: x => x.h.action },
          { label:'Why', get: x => x.h.why },
        ]} /></span>
      </div>

      {/* One signal per row. The old row said the same thing six ways — an
          UNHEALTHY pill, a red zero, "nothing left", "6 of 6 out", the size
          list in red and the action pill — so nothing stood out. The action
          pill carries the colour now; every other cell is a plain fact. */}
      <Card><table className="t compact">
        <thead><tr><Th>Option</Th><Th num hint="pieces on hand across every size, and how many weeks that lasts at the corrected rate of sale">Stock</Th><Th num hint="pieces a week, counting only the weeks the option was actually on the shelf in every size">Sells</Th><Th hint="what BSC's own health rules say to do, and why — open the row to act on it">What to do</Th></tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={4} className="text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing matches those filters.</td></tr> : pager.pageRows.map(({ o, h }) => { const out = o.sizes.filter(sz => (o.stockBySize[sz] ?? 0) === 0); return <tr key={o.id} className="row" onClick={() => open(o.id)}>
          <td style={{ whiteSpace:'normal', minWidth: 220 }}><span className="font-medium">{o.styleName}</span>{o.core && <span className="pill ml-1">core</span>}{o.inactive && <span className="pill ml-1" title={`off the shelf since ${fmtDate(o.inactive.on)} — ${o.inactive.reason}`}>off the shelf</span>}
            <div className="text-[11.5px] font-normal" style={{ color:'var(--ink-faint)' }}>{o.subCat1}
              {demand.has(o.id) && <span style={{ color:'var(--warn)' }}> · {demand.get(o.id)!.asks} store ask{demand.get(o.id)!.asks === 1 ? '' : 's'}</span>}</div></td>
          <td className="num" style={{ minWidth: 110 }} onClick={e => e.stopPropagation()}>
            <div className="mono text-[13px]">{h.stock}</div>
            <div className="text-[11px]" style={{ color: out.length && out.length < o.sizes.length ? 'var(--warn)' : 'var(--ink-faint)' }}>{out.length === 0 ? `all ${o.sizes.length} sizes in` : out.length === o.sizes.length ? 'every size out' : `${out.join(' ')} out`}</div>
            <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{h.stock === 0 ? '' : h.wof >= 999 ? '—' :
              <Why rule="Weeks of cover is the stock you hold divided by the corrected rate of sale — how long it lasts if it keeps selling at this pace."
                inputs={[['Stock now', `${h.stock} pcs`], ['Rate of sale', `${h.trueRos.toFixed(1)} a week`], ['Cover', `${h.wof.toFixed(0)} weeks`]]}>{h.wof.toFixed(0)} wks cover</Why>}</div></td>
          <td className="num" style={{ minWidth: 86 }} onClick={e => e.stopPropagation()}>
            <Why rule="Rate of sale corrected for the weeks a size was out of stock — a zero with nothing to sell is not a zero of demand, and counting it uncorrected is what makes a good option look dead."
              inputs={[['Weeks not counted', `${h.censoredWeeks} out of stock`], ['Corrected rate', `${h.trueRos.toFixed(1)} a week`], ['Top-6 sizes only', `${h.top6Ros.toFixed(1)} a week`], ['Velocity band', h.velocity]]}>
              <span className="mono text-[13px]">{h.trueRos.toFixed(1)}</span></Why>
            <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>a week</div></td>
          <td style={{ whiteSpace:'normal', minWidth: 210 }}><Pill tone={ACTION_TONE[h.action]}>{h.action}</Pill>
            <div className="text-[11.5px] mt-0.5" style={{ color:'var(--ink-faint)' }}>{h.why}</div></td>
        </tr>; })}</tbody>
      </table>
      {rows.length > 0 && <Pager page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} from={pager.from} to={pager.to} total={pager.total} noun="options" />}
      </Card>
      <div className="mt-3"><Note>Rate of sale is corrected for the weeks a size was out, so an empty shelf does not read as no demand.</Note></div>
      </>}

      {tab === 'plan' && <>
      <h3 className="mb-2">Option count vs plan · core always available, non-core sells out once</h3>
      <Card><div style={{ overflowX:'auto' }}><table className="t compact">
        <thead><tr><th>Sub-category</th><th className="num">Ideal · total</th><th className="num">Core ideal</th><th className="num">Core listed</th><th className="num">Core healthy</th><th className="num">Core with a size out</th><th className="num">Core gap</th><th className="num">Non-core ideal</th><th className="num">Non-core listed</th><th className="num">Healthy · all</th><th className="num">Gap to plan</th></tr></thead>
        <tbody>{gaps.map(g => { const sc = `${g.sub1}|${g.sub2}`;
          /* every count here is a set of options — clicking one takes you to
             exactly those rows on the first tab, rather than leaving you to
             rebuild the filter by hand. Targets and gaps are not sets, so
             they stay plain text. */
          const go = (slice: string, n: number, style?: React.CSSProperties) => n > 0
            ? <button type="button" className="vlink mono" style={{ font:'inherit', ...style }} onClick={() => drill(sc, slice)} title={`show the ${n} option${n === 1 ? '' : 's'}`}>{n}</button>
            : <span style={{ color:'var(--ink-faint)' }}>{n === 0 ? '0' : '—'}</span>;
          return <tr key={sc}>
            <td className="font-medium">{g.total > 0 ? <button type="button" className="vlink" style={{ font:'inherit', fontWeight:500 }} onClick={() => drill(sc, 'all')} title={`show all ${g.total} options in ${g.sub1}`}>{g.sub1}</button> : g.sub1}{g.sub2 !== g.sub1 && <span style={{ color:'var(--ink-faint)' }}> · {g.sub2}</span>}</td>
            <td className="num">{g.ideal ?? <span style={{ color:'var(--ink-faint)' }}>not set</span>}</td>
            <td className="num">{g.coreIdeal ?? '—'}</td>
            <td className="num">{go('core', g.coreListed)}</td>
            <td className="num">{go('core-healthy', g.coreLive, { color:'var(--good)' })}</td>
            <td className="num">{go('core-sizeout', g.coreSizeOut, { color:'var(--risk)' })}</td>
            <td className="num" style={{ color: g.coreGap == null ? 'var(--ink-faint)' : g.coreGap > 0 ? 'var(--risk)' : 'var(--good)' }}>{g.coreGap == null ? '—' : g.coreGap > 0 ? `${g.coreGap} short` : 'met'}</td>
            <td className="num">{g.nonIdeal ?? '—'}</td>
            <td className="num">{go('noncore', g.nonListed)}</td>
            <td className="num">{go('healthy', g.live, { color:'var(--good)' })}</td>
            <td className="num" style={{ color: g.gap == null ? 'var(--ink-faint)' : g.gap > 0 ? 'var(--risk)' : 'var(--good)' }}>{g.gap == null ? '—' : g.gap > 0 ? `${g.gap} short` : 'met'}</td>
          </tr>; })}</tbody>
      </table></div></Card>
      <div className="mt-3"><Note>Core is replenished at the <em>size</em> — a core option with a size out is the row to act on first.</Note></div>
      </>}

      {tab === 'replen' && <><h3 className="mb-2">What to send out and what to pull back · this week</h3><ReplenishmentSheet onOpen={open} /></>}

      <Drawer open={!!active} onClose={() => open(null)} title={active?.styleName ?? ''} subtitle={active && <><Pill tone={ACTION_TONE[healthOf(active).action]}>{healthOf(active).action}</Pill><Pill tone={active.core ? 'accent' : 'neutral'}>{active.core ? 'core' : 'non-core'}</Pill><span>{active.subCat1} · {active.subCat2}</span></>}>
        {active && <Option360 o={active} editable={mine} onDecide={(d, note, qty) => { decideOption(active.id, d, note, qty); open(null); }} />}
      </Drawer>
    </Page>
  );
}

/* ---------- the 360: every fact the tool holds about one option ---------- */
function Option360({ o, editable, onDecide }: { o: RtwOption; editable: boolean; onDecide: (d: 'promote-to-core' | 'liquidate' | 'reorder' | 'reintroduce' | 'make-inactive', note: string, qty?: number) => void }) {
  const { db } = useApp();
  const h = healthOf(o); const r = rosOf(o);
  const [note, setNote] = useState('');
  const plan = RTW_SUBCATS.find(s => s.sub1 === o.subCat1 && (s.sub2 === s.sub1 || s.sub2 === o.subCat2));
  const siblings = db.options.filter(x => x.subCat1 === o.subCat1 && (!plan || plan.sub2 === plan.sub1 || x.subCat2 === plan.sub2));
  const siblingsHealthy = siblings.filter(x => healthOf(x).health === 'Healthy').length;
  /* Production orders for this look — matched on the fabric word in the name,
     since the same body is cut in several colourways. */
  const key = o.subCat2.split(' ')[0].toLowerCase();
  const orders = db.orders.filter(x => x.styleName.toLowerCase().includes(key));
  const openOrders = orders.filter(x => x.status === 'Open');
  const transfers = db.transfers.filter(t => t.styleName === o.styleName);
  const returns = db.returns.filter(t => t.styleName === o.styleName);
  const storeName = (id: string) => STORES.find(s => s.id === id)?.name ?? id;
  const lifetimeUnits = o.weeklySales.reduce((a, b) => a + b, 0);
  /* supply-side facts come from the last PO for this look; lead time from its factory */
  const lastPo = [...orders].sort((a, b) => (b.poDate ?? '').localeCompare(a.poDate ?? ''))[0];
  const factory = db.vendors.find(v => v.id === lastPo?.vendorId);
  const re = reorderOf(o, factory?.leadDays ?? 40);
  const st = sellThroughOf(db, o);
  /* a store asking another store for this option is demand the allocation
     missed — it happens between two stores today and planning never hears it */
  const asks = requestsForOption(db, o.id);

  return <>
    {/* One option, one question: what do we do with it. The answer sits open at
       the top with the numbers that decided it and the buttons that act on it;
       the evidence behind it is three folders underneath, not eleven. */}
    <Section title="The call" look="lead" collapsible={false} ownerRole="planning" pending={false}
      right={<Pill tone={h.health === 'Healthy' ? 'good' : h.health === 'Unknown' || h.health === 'Inactive' ? 'neutral' : 'risk'}>{h.health}</Pill>}>
      <div className="flex items-start gap-3 flex-wrap py-1">
        <Pill tone={ACTION_TONE[h.action]}>{h.action}</Pill>
        <span className="text-[12.5px] flex-1" style={{ minWidth: 220, color:'var(--ink-soft)' }}>{h.why}</span>
      </div>
      {o.inactive && <Note tone={h.action === 'REINTRODUCE' ? 'warn' : undefined}>
        <b>Off the shelf since {fmtDate(o.inactive.on)}</b> — {o.inactive.reason}. Taken off by {o.inactive.by}. It keeps its history and its sales, and it is not counted against the option plan while it is off.
        {h.action === 'REINTRODUCE' ? ' It was selling when it was pulled, so the call is whether to make it active again — and order, since there is nothing on the shelf.' : ' Nothing in the numbers argues for bringing it back.'}
      </Note>}
      <div className="grid gap-2 py-2" style={{ gridTemplateColumns:'repeat(auto-fit, minmax(96px, 1fr))' }}>
        {[{ l:'Status', v: o.inactive ? 'off the shelf' : 'active', t: o.inactive ? 'warn' : undefined },
          { l:'On hand', v:`${h.stock} pcs`, t: h.stock === 0 ? 'risk' : h.szOOS >= 2 ? 'warn' : undefined },
          { l:'Sizes out', v:`${h.szOOS} of ${o.sizes.length}`, t: h.szOOS >= 2 ? 'risk' : undefined },
          { l:'Rate of sale', v:`${r.trueRos.toFixed(1)} / wk`, t: undefined },
          { l:'Cover', v: h.wof >= 999 ? 'no velocity' : `${h.wof.toFixed(1)} wk`, t: h.wof >= 30 && h.stock > 0 ? 'warn' : h.wof < 4 && h.stock > 0 ? 'risk' : undefined },
          { l:'Sell-through', v: st.fallback ? '—' : `${Math.round(st.pct * 100)}%`, t: !st.fallback && st.pct < 0.35 ? 'risk' : undefined },
          { l:'Incoming', v: o.incomingQty ? `${o.incomingQty} pcs` : 'none', t: undefined },
        ].map(x => <div key={x.l} className="px-2.5 py-2 rounded-[4px]" style={{ background:'var(--surface-2)' }}>
          <div className="text-[10.5px] mono uppercase" style={{ color:'var(--ink-faint)', letterSpacing:'.05em' }}>{x.l}</div>
          <div className="font-semibold" style={{ color: x.t === 'risk' ? 'var(--risk)' : x.t === 'warn' ? 'var(--warn)' : undefined }}>{x.v}</div>
        </div>)}
      </div>
      {!o.inactive && h.midBroken.length > 0 && <Note tone="risk">Mid sizes {h.midBroken.join(', ')} are out. Sales fall because the sizes are missing — the style reads weak, is not reordered, and quietly dies. A size-fill problem, not a demand problem.</Note>}
      {!o.inactive && h.wof >= 30 && h.stock > 0 && <Note tone="warn">{Math.round(h.wof)} weeks of cover at the current rate — cash on a shelf, still listed online.</Note>}
      {asks.filter(q => q.status === 'requested').length > 0 && <Note tone="warn">{asks.filter(q => q.status === 'requested').length} store{asks.filter(q => q.status === 'requested').length === 1 ? '' : 's'} asked another store for this and have not been answered — demand the allocation missed. In stores, below.</Note>}
      {(h.action === 'LIQUIDATE' || h.action === 'EXIT') && <Note tone="warn">Marked {h.action.toLowerCase()} — every store carrying it should pull the display and send stock back. It is on the Store screen's pull-back list.</Note>}

      <div className="mt-2 pt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
        {editable ? <>
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1" style={{ minWidth: 220 }}><Field label={o.inactive ? 'Note — why it is coming back' : 'Note — kept with the decision'}><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder={o.inactive ? 'the mill has the cloth again' : 'optional'} /></Field></div>
            {/* an option that is OFF: the only two moves are back on, with or without cloth behind it */}
            {o.inactive ? <>
              <Button variant="primary" size="sm" title={`make it active again and order ${Math.max(RTW_MOQ, re.suggestedQty)} pcs`} onClick={() => onDecide('reintroduce', note, Math.max(RTW_MOQ, re.suggestedQty))}>Make active &amp; order {Math.max(RTW_MOQ, re.suggestedQty)} pcs</Button>
              <Button size="sm" title="put it back in the option count without ordering — for stock already on its way, or a decision to sell what is left" onClick={() => onDecide('reintroduce', note)}>Make active only</Button>
            </> : <>
              {(h.action === 'URGENT REPLENISH' || h.action === 'SIZE FILL') && <Button variant="primary" size="sm" onClick={() => onDecide('reorder', note, Math.max(RTW_MOQ, re.suggestedQty))}>Raise reorder · {Math.max(RTW_MOQ, re.suggestedQty)} pcs</Button>}
              {!o.core && h.health === 'Healthy' && <Button size="sm" onClick={() => onDecide('promote-to-core', note)}>Promote to core</Button>}
              {(h.action === 'LIQUIDATE' || h.action === 'EXIT' || h.action === 'CLEAR / DISCOUNT') && <Button variant="danger" size="sm" onClick={() => onDecide('liquidate', note)}>Liquidate, pull displays &amp; take off the shelf</Button>}
              {h.action === 'MAINTAIN' && <span className="text-[12.5px] pb-1.5" style={{ color:'var(--ink-faint)' }}>Performing within range — nothing to decide.</span>}
              {h.action !== 'LIQUIDATE' && h.action !== 'EXIT' && h.action !== 'CLEAR / DISCOUNT' && <Button size="sm" variant="ghost" title="take it off the shelf without liquidating — it stops being counted as a live option and can be made active again later" onClick={() => onDecide('make-inactive', note)}>Take off the shelf</Button>}
            </>}
          </div>
        </> : <ActsBy role="planning" does="takes the call on this option — promote to core, reorder, or liquidate" />}
      </div>
      <div className="pt-2 text-[11.5px]" style={{ color:'var(--ink-faint)' }}>
        Launched {fmtDate(o.launchedAt)} · {daysAgo(o.launchedAt)} days on the floor · {lifetimeUnits} sold in 12 weeks · MRP ₹{o.mrp.toLocaleString('en-IN')}
        {plan ? ` · ${o.subCat1} plan ${plan.ideal ?? '?'} options, ${siblingsHealthy} healthy of ${siblings.length}` : ''}
      </div>
    </Section>

    {/* 1 — why the call says what it says */}
    <Section title="Sizes, sales and the reorder maths" right={re.trigger ? <Pill tone="risk">under {RTW_REORDER_TRIGGER_DAYS}d — order</Pill> : <Pill tone="good">covered</Pill>}>
      <div className="cap">Stock by size · {h.stock} pcs</div>
      <div className="grid gap-1.5 py-1" style={{ gridTemplateColumns:`repeat(${o.sizes.length}, 1fr)` }}>
        {o.sizes.map(sz => { const q = o.stockBySize[sz] ?? 0; const mid = h.midBroken.includes(sz); return <div key={sz} className="text-center rounded-[3px] py-2" style={{ background: q === 0 ? 'var(--risk-soft)' : 'var(--surface-2)', outline: mid ? '2px solid var(--risk)' : undefined }}><div className="text-[10.5px] mono" style={{ color:'var(--ink-faint)' }}>{sz}</div><div className="font-semibold" style={{ color: q === 0 ? 'var(--risk)' : undefined }}>{q}</div></div>; })}
      </div>

      <div className="cap">Sales · last 12 weeks, with conditions</div>
      <div className="text-[11.5px] pb-1" style={{ color:'var(--ink-faint)' }}>Weeks a size was out of stock are excluded from the rate of sale — a zero with nothing to sell is not zero demand.</div>
      <KV k="ROS, in-stock weeks only" v={`${r.trueRos.toFixed(1)} / wk`} note={`${r.censoredWeeks} of 12 weeks excluded`} />
      <KV k="ROS as the sheet computes it" v={`${r.naive.toFixed(1)} / wk`} note={r.trueRos > r.naive ? `understated by ${Math.round(((r.trueRos - r.naive) / r.trueRos) * 100)}% — the number that made this look weak` : 'no material difference'} />
      <KV k="Top-6-week peak" v={`${r.top6Ros.toFixed(1)} / wk`} note="the demand ceiling — in-stock weeks only" />
      <KV k="Velocity grade" v={h.velocity} note={h.velocity === 'A' ? 'fastest movers' : h.velocity === 'E' ? 'not selling' : undefined} />

      <div className="cap">Reorder maths · 90-day trigger</div>
      <KV k="Growth bump" v={`× ${(1 + GROWTH_UPLIFT).toFixed(2)}`} note={`${re.uplifted.toFixed(1)} / wk — BSC said it of bottoms; confirm whether shirts take it too`} />
      <KV k="Planned demand" v={<b>{re.planRos.toFixed(1)} / wk</b>} note={re.ceilinged ? 'capped at the top-6-week peak' : 'peak not binding'} />
      <KV k="Coverage" v={re.coverDays >= 999 ? 'no velocity' : `${re.coverDays} days`} note={`(${re.stock} on hand + ${o.incomingQty} incoming) ÷ planned demand · trigger at ${RTW_REORDER_TRIGGER_DAYS}d`} />
      <KV k="Lead time" v={`${re.leadDays} days`} note={factory ? `${factory.name}, measured` : 'no PO yet — category default'} />
      <KV k="Suggested reorder" v={<b>{re.suggestedQty ? `${re.suggestedQty} pcs` : 'none'}</b>} note={`planned demand × (lead + ${RTW_REORDER_TRIGGER_DAYS}d) − on hand − incoming · rounded to MOQ ${RTW_MOQ}`} />
      <div className="pt-2"><Note>Seasonality is not indexed yet — festival weeks (Oct/Nov) would lift this.</Note></div>
    </Section>

    {/* 2 — what it cost, what came in, what sold of it */}
    <Section title="Supply and sell-through" right={<Pill tone={st.fallback ? 'warn' : st.pct >= 0.7 ? 'good' : st.pct < 0.35 ? 'risk' : 'neutral'}>{st.fallback ? 'ordered qty not on record' : `${Math.round(st.pct * 100)}% sold through`}</Pill>}>
      <div className="cap">On order</div>
      <KV k="Incoming on open POs" v={o.incomingQty || 'nothing on order'} />
      {openOrders.length > 0 ? openOrders.map(po => { const rk = riskOf(po); const stg = stageOf(po); return <div key={po.id} className="kv"><span className="k">{po.poNo} · {db.vendors.find(v => v.id === po.vendorId)?.name}<div className="text-[11px]">{stg.stage} → {stg.next ?? 'complete'} · inhouse {fmtDate(po.targetInhouse)}</div></span><span className="v"><Pill tone={rk.risk === 'on-track' ? 'good' : rk.risk === 'watch' || rk.risk === 'at-risk' ? 'warn' : 'risk'}>{rk.risk.replace('-', ' ')}</Pill></span></div>; })
        : <div className="py-1 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>No production order in flight for this look.</div>}
      {orders.filter(x => x.status === 'Closed').length > 0 && <KV k="Previous runs" v={`${orders.filter(x => x.status === 'Closed').length} closed PO${orders.filter(x => x.status === 'Closed').length === 1 ? '' : 's'}`} note={orders.filter(x => x.status === 'Closed').map(x => `${x.poNo} · ${x.orderQty} pcs`).join(' · ')} />}

      <div className="cap">Sell-through · sold against ordered</div>
      {st.known ? <>
        <KV k="Ordered" v={`${st.ordered} pcs`} note={st.pos.map(x => `${x.poNo ?? 'PO'} · ${x.deliveredQty ?? x.orderQty}`).join(' · ')} />
        <KV k="Sold" v={`${st.sold} pcs in ${st.weeks} week${st.weeks === 1 ? '' : 's'}`} note={`since launch ${fmtDate(o.launchedAt)} · ${h.stock} still in stock`} />
        <KV k="Sell-through" v={<b>{Math.round(st.pct * 100)}%</b>} note="how much of what we ordered has sold, in how long" />
      </> : <>
        <KV k="Ordered" v="not on record" note="no PO on this style in the tracker — without the ordered quantity there is no sell-through, only rate of sale" />
        <KV k="Sold ÷ (sold + stock)" v={`${Math.round(st.pct * 100)}%`} note="the stand-in until the PO is linked" />
      </>}

    </Section>

    {/* 3 — where the pieces physically are, and what came back */}
    <Section title="In stores" right={asks.some(q => q.status === 'requested') ? <Pill tone="warn">{asks.filter(q => q.status === 'requested').length} unanswered ask{asks.filter(q => q.status === 'requested').length === 1 ? '' : 's'}</Pill> : undefined}>
      {(() => { const fp = floorPiecesOf(db, o.id); const ln = (db.launches ?? []).find(l => l.optionId === o.id); return (fp.total > 0 || ln) ? <>
        <div className="cap">Launch & floor pieces</div>
        {ln && <KV k="Drop" v={ln.dropMonth} note={ln.launchOn ? `launch ${fmtDate(ln.launchOn)} · ${launchOf(ln).blockers} gate(s) open` : 'no date'} />}
        <KV k="Display & fit pieces on floors" v={`${fp.display} display · ${fp.fit} fit`} note="issued at COGS — not in the stock by size, never sellable" />
      </> : null; })()}

      {asks.length > 0 && <>
        <div className="cap">Stores asking another store for it · {asks.length}</div>
        <div className="text-[12.5px] pb-1" style={{ color:'var(--ink-soft)' }}>Demand this option did not have on the shelf where it was wanted. Repeated asks are a replenishment or allocation problem, not an errand.</div>
        <table className="t compact"><thead><tr><th>Asked by</th><th>From</th><th className="num">Size</th><th>When</th><th>Answer</th></tr></thead>
          <tbody>{asks.map(q => <tr key={q.id}>
            <td className="text-[12.5px]">{storeName(q.toStoreId)}</td>
            <td className="text-[12.5px]" style={{ color:'var(--ink-faint)' }}>{storeName(q.fromStoreId)}</td>
            <td className="num mono">{q.size}</td>
            <td className="text-[12px]">{fmtRel(q.requestedOn)}</td>
            <td><Pill tone={q.status === 'received' ? 'good' : q.status === 'declined' ? 'risk' : q.status === 'requested' ? 'warn' : 'info'}>{q.status}</Pill></td>
          </tr>)}</tbody></table>
      </>}

      <div className="cap">Transfers & returns</div>
      {transfers.length === 0 && returns.length === 0 ? <div className="py-1 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>No transfer or return on record for this style.</div> : <>
        {transfers.map(t => <KV key={t.id} k={`${t.stoNo} → ${storeName(t.toStoreId)}`} v={`${t.qty} pcs`} note={t.closedOn ? `closed ${fmtDate(t.closedOn)}` : t.arrivedOn ? `arrived ${fmtDate(t.arrivedOn)} — STO still open` : `shipped ${fmtDate(t.shippedOn)}, in transit`} />)}
        {returns.map(t => <KV key={t.id} k={`${t.caseNo} · ${storeName(t.storeId)} · ${t.reason} → ${t.wants}`} v={<Pill tone={t.stage === 'closed' || t.stage === 'refunded' ? 'good' : daysAgo(t.openedOn) > t.slaDays ? 'risk' : 'info'}>{t.stage.replace(/-/g, ' ')}</Pill>} note={t.remarks || `return opened ${fmtDate(t.openedOn)}`} />)}
        {returns.filter(t => t.reason === 'Fit').length >= 2 && <div className="pt-2"><Note tone="warn">{returns.filter(t => t.reason === 'Fit').length} fit returns on this style — a size-set question for design, not a customer question.</Note></div>}
      </>}
    </Section>

    <RecordTail kind="option" subjectId={o.id} labels={FILE_LABELS.option} editable={editable} />
  </>;
}
