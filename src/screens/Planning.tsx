/* RTW planning (8 Oct 2026) — the planner's desk, one review per option.
   The sheets they run today (sales from Shopify, physical stock, WIP, size
   availability, display pieces, vendor constraints) become one record per
   option. The review walks the planner's own working: is the rate usable, what
   does stock look like week by week and size by size once WIP lands, what is
   the gap after the new order arrives, what ratio, what constraints moved the
   number — then approve, and send it to design as an RTW requirement. The
   numbers are arithmetic on recorded figures, shown so they can be overridden;
   there is no forecast model here. */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { PlanningReview, RtwOption, GarmentCategory } from '../domain/types';
import { rosOf, fmtDate, daysAgo, wipOf, projectionOf, draftOrderOf, displayReserveOf, stockByPurposeOf, planningKindOf, reviewOutcomeOf, sizeRosOf, coverageOf, healthOf } from '../domain/engines';
import { RTW_SUBCATS, STORES, isBottoms } from '../domain/reference';
import { Page, Card, Pill, Tabs, Button, Drawer, KV, Section, Note, Field, Input, Th, Seg, usePager, Pager, ExportButton, type Tone } from '../ui';
import { VendorLink } from './Vendors';
import { RecordTail } from './RecordTail';

const KIND_LABEL = { core: 'Core · replenishment', 'non-core': 'Non-core · replace or drop', new: 'New · first weeks' } as const;
const KIND_TONE: Record<string, Tone> = { core: 'accent', 'non-core': 'info', new: 'warn' };
const DEFAULT_LEAD_WEEKS = 8;
const DEFAULT_COVER_WEEKS = 12;

function categoryFor(o: RtwOption): { category: GarmentCategory; sub: string } {
  const s = `${o.subCat1} ${o.subCat2} ${o.styleName}`;
  if (/jean/i.test(s)) return { category: 'Jeans', sub: o.subCat1 };
  if (/polo|t-shirt|tee/i.test(s)) return { category: 'Flat Knits (T-shirts)', sub: o.subCat1 };
  if (isBottoms(s)) return { category: 'Bottoms / Knitwear / Jackets', sub: o.subCat1 };
  return { category: 'RTW CMT shirts', sub: o.subCat1 };
}

export function Planning() {
  const { db, role } = useApp();
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  const open = (id: string | null) => { const n = new URLSearchParams(params); id ? n.set('open', id) : n.delete('open'); setParams(n, { replace: true }); };
  const tab = params.get('tab') ?? 'review';
  const setTab = (t: string) => { const n = new URLSearchParams(params); n.set('tab', t); setParams(n, { replace: true }); };
  const mine = role === 'planning' || role === 'owner';
  const [kind, setKind] = useState<'all' | 'core' | 'non-core' | 'new' | 'size-risk' | 'due'>('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => db.options.filter(o => !o.inactive).map(o => {
    const r = rosOf(o); const k = planningKindOf(o);
    const p = projectionOf(db, o, r.trueRos, DEFAULT_LEAD_WEEKS);
    const wip = wipOf(db, o); const sp = stockByPurposeOf(db, o);
    const sizeRisk = p.sizes.filter(s => s.beforeReceipt && s.ros > 0);
    const last = (db.planningReviews ?? []).find(x => x.optionId === o.id) ?? null;
    return { o, r, k, p, wip, sp, sizeRisk, last, coverNow: r.trueRos > 0 ? sp.usable / r.trueRos : 999 };
  }), [db]);

  const list = rows
    .filter(x => kind === 'all' ? true : kind === 'size-risk' ? x.sizeRisk.length > 0 : kind === 'due' ? x.p.coverAtArrival < 4 : x.k === kind)
    .filter(x => !q.trim() || q.toLowerCase().split(/\s+/).every(w => `${x.o.styleName} ${x.o.subCat1} ${x.o.subCat2} ${x.o.sku ?? ''}`.toLowerCase().includes(w)))
    /* options that still sell come first, thinnest cover at arrival on top; dead ones (no rate) sink */
    .sort((a, b) => (a.r.trueRos > 0 ? 0 : 1) - (b.r.trueRos > 0 ? 0 : 1) || a.p.coverAtArrival - b.p.coverAtArrival);
  const pager = usePager(list, 25);
  const active = db.options.find(o => o.id === openId) ?? null;
  const wk = (n: number) => n >= 999 ? '—' : `${n.toFixed(1)} wk`;

  return (
    <Page title="RTW planning" lede="One review per option: the rate, stock week by week and size by size once WIP lands, the gap after the new order arrives, the ratio — then to design."
      replaces="the planning sheets rebuilt from Shopify exports, the WIP list in the tracker, and the size-wise stock pulled by hand">
      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'review', label: 'Options · plan the next order', count: rows.filter(x => x.p.coverAtArrival < 4 || x.sizeRisk.length > 0).length, hint: 'every live option, worst cover at arrival first' },
        { id: 'count', label: 'Non-core count vs the plan', hint: 'live options per category against the target, and which will not survive the next selling period' },
        { id: 'reviews', label: 'Reviews · plan vs actual', count: (db.planningReviews ?? []).length, hint: 'every review taken, and what sold since' },
      ]} />

      {tab === 'review' && <>
        <div className="flex gap-3 items-end flex-wrap mb-3">
          <Seg value={kind} onChange={setKind} options={[
            { id: 'all', label: 'All', count: rows.length },
            { id: 'core', label: 'Core', count: rows.filter(x => x.k === 'core').length, hint: 'same option, a different quantity' },
            { id: 'non-core', label: 'Non-core', count: rows.filter(x => x.k === 'non-core').length, hint: 'replace it or let it run out' },
            { id: 'new', label: 'New', count: rows.filter(x => x.k === 'new').length, hint: 'launched under 8 weeks ago — early sales mislead' },
            { id: 'size-risk', label: 'A size runs out first', count: rows.filter(x => x.sizeRisk.length > 0).length, hint: 'a selling size is projected out before anything lands' },
            { id: 'due', label: 'Under 4 wk at arrival', count: rows.filter(x => x.p.coverAtArrival < 4).length, hint: `an order placed today lands in ${DEFAULT_LEAD_WEEKS} weeks with this little cover left` },
          ]} />
          <div className="flex-1" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="style, category or SKU" style={{ width: 220 }} />
          <ExportButton filename="rtw-planning" sheetName="Planning" rows={list} cols={[
            { label: 'Option', get: x => x.o.styleName }, { label: 'Type', get: x => x.k }, { label: 'Usable stock', get: x => x.sp.usable }, { label: 'Display + trial', get: x => x.sp.display + x.sp.trial },
            { label: 'Observed rate / wk', get: x => x.r.trueRos.toFixed(1) }, { label: 'Cover now (wk)', get: x => x.coverNow >= 999 ? '' : x.coverNow.toFixed(1) },
            { label: 'WIP pcs', get: x => x.wip.filter(w => w.firm).reduce((a, w) => a + w.qty, 0) }, { label: 'Next WIP arrives', get: x => x.wip[0]?.arrives ?? '' },
            { label: `Cover at arrival +${DEFAULT_LEAD_WEEKS} wk`, get: x => x.p.coverAtArrival >= 999 ? '' : x.p.coverAtArrival.toFixed(1) }, { label: 'Sizes out before receipt', get: x => x.sizeRisk.map(s => s.size).join(' ') }]} />
        </div>
        <Card><div style={{ overflowX: 'auto' }}><table className="t">
          <thead><tr>
            <Th>Option</Th><Th>Type</Th>
            <Th num hint="physical stock less the pieces held for display and trial">Usable</Th>
            <Th num hint="last four in-stock weeks ÷ 4, option total">Rate / wk</Th>
            <Th num hint="usable ÷ rate, today">Cover now</Th>
            <Th hint="open orders on the tracker and when each is expected">WIP</Th>
            <Th num hint={`usable stock when an order placed today lands, ${DEFAULT_LEAD_WEEKS} weeks out, after WIP has arrived and at the observed rate`}>At arrival</Th>
            <Th hint="sizes projected to run out before any receipt">Size risk</Th>
            <Th>Last review</Th>
          </tr></thead>
          <tbody>{pager.pageRows.map(x => <tr key={x.o.id} className="row" onClick={() => open(x.o.id)}>
            <td><span className="font-medium">{x.o.styleName}</span><div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{x.o.subCat1}{x.o.sku ? ` · ${x.o.sku}` : ''}</div></td>
            <td><Pill tone={KIND_TONE[x.k]}>{x.k}</Pill></td>
            <td className="num">{x.sp.usable}</td>
            <td className="num">{x.r.trueRos.toFixed(1)}{x.r.censoredWeeks > 0 && <div className="text-[11px]" style={{ color: 'var(--warn)' }}>{x.r.censoredWeeks} wk a size was out</div>}</td>
            <td className="num">{wk(x.coverNow)}</td>
            <td className="text-[12px]">{x.wip.length ? x.wip.map(w => <div key={w.order.id} style={w.firm ? undefined : { color: 'var(--ink-faint)' }}>{w.qty} pcs · {fmtDate(w.arrives)}{w.firm ? '' : ' · no PO yet'}</div>) : <span style={{ color: 'var(--ink-faint)' }}>nothing on order</span>}</td>
            <td className="num" style={{ color: x.p.coverAtArrival < 4 ? 'var(--risk)' : undefined }}>{x.p.atArrival} pcs<div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{wk(x.p.coverAtArrival)}</div></td>
            <td className="text-[12px]" style={{ color: x.sizeRisk.length ? 'var(--risk)' : 'var(--ink-faint)' }}>{x.sizeRisk.length ? x.sizeRisk.map(s => `${s.size} · wk ${s.firstShortWeek}`).join(', ') : '—'}</td>
            <td className="text-[12px]">{x.last ? <>{fmtDate(x.last.on)}<div style={{ color: 'var(--ink-faint)' }}>{x.last.status}{x.last.approvedQty != null ? ` · ${x.last.approvedQty} pcs` : ''}</div></> : <span style={{ color: 'var(--ink-faint)' }}>never</span>}</td>
          </tr>)}</tbody>
        </table></div>
        <Pager page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} from={pager.from} to={pager.to} total={pager.total} noun="options" />
        </Card>
      </>}

      {tab === 'count' && <NonCoreCount rows={rows} onOpen={open} />}
      {tab === 'reviews' && <ReviewsTab onOpen={open} />}

      <Drawer open={!!active} onClose={() => open(null)} title={active?.styleName ?? ''}
        subtitle={active && <><Pill tone={KIND_TONE[planningKindOf(active)]}>{KIND_LABEL[planningKindOf(active)]}</Pill><span>{active.subCat1} · {active.subCat2}{active.sku ? ` · ${active.sku}` : ''}</span></>}>
        {active && <PlanningReviewPanel o={active} mine={mine} />}
      </Drawer>
    </Page>
  );
}

/* ---------- non-core count: live options against the ideal, and survival -------- */
function NonCoreCount({ rows, onOpen }: { rows: { o: RtwOption; k: string; p: ReturnType<typeof projectionOf>; wip: ReturnType<typeof wipOf> }[]; onOpen: (id: string) => void }) {
  const cats = RTW_SUBCATS.filter(sc => sc.ideal != null).map(sc => {
    const os = rows.filter(x => x.o.subCat1 === sc.sub1 && (sc.sub2 === sc.sub1 || x.o.subCat2 === sc.sub2));
    const non = os.filter(x => !x.o.core);
    /* "will it still be there next selling period" — out within 8 weeks and nothing landing before that */
    const dying = non.filter(x => x.p.firstShortWeek != null && x.p.firstShortWeek <= 8 && !x.wip.some(w => w.weeksAway <= (x.p.firstShortWeek ?? 99)));
    const nonIdeal = (sc.ideal ?? 0) - (sc.coreIdeal ?? 0);
    return { sc, live: non.length, nonIdeal, dying, afterPeriod: non.length - dying.length };
  });
  const totalIdeal = cats.reduce((a, c) => a + c.nonIdeal, 0); const totalLive = cats.reduce((a, c) => a + c.live, 0); const totalAfter = cats.reduce((a, c) => a + c.afterPeriod, 0);
  return <>
    <div className="mb-3 text-[13px]"><b>{totalLive}</b> non-core options live against a plan of <b>{totalIdeal}</b>. At the current rate <b>{totalAfter}</b> are still on the shelf in eight weeks — the rest run out before anything lands, and need a replacement planned now.</div>
    <Card><table className="t">
      <thead><tr><Th>Category</Th><Th num hint="non-core options to keep available, from the ideal count less the core ideal">Plan</Th><Th num>Live now</Th><Th num hint="live options still in stock in 8 weeks at the observed rate, counting WIP that lands in time">After the period</Th><Th hint="options that run out before anything arrives — replace, or decide to let them go">Will not survive</Th></tr></thead>
      <tbody>{cats.map(c => <tr key={c.sc.sub1 + c.sc.sub2}>
        <td className="font-medium">{c.sc.sub1}{c.sc.sub2 !== c.sc.sub1 ? <div className="text-[11px] font-normal" style={{ color: 'var(--ink-faint)' }}>{c.sc.sub2}</div> : null}</td>
        <td className="num">{c.nonIdeal}</td>
        <td className="num" style={{ color: c.live < c.nonIdeal ? 'var(--warn)' : undefined }}>{c.live}</td>
        <td className="num" style={{ color: c.afterPeriod < c.nonIdeal ? 'var(--risk)' : undefined }}>{c.afterPeriod}</td>
        <td className="text-[12px]">{c.dying.length ? c.dying.map(x => <button key={x.o.id} type="button" className="cta" style={{ margin: '2px 4px 2px 0' }} onClick={() => onOpen(x.o.id)}>{x.o.styleName} · wk {x.p.firstShortWeek} →</button>) : <span style={{ color: 'var(--ink-faint)' }}>—</span>}</td>
      </tr>)}</tbody>
    </table></Card>
    <div className="mt-3 text-[12px]" style={{ color: 'var(--ink-faint)' }}>Whether to replace an option or let the count fall short is planning's call — the table only says which ones the sales will not carry.</div>
  </>;
}

/* ---------- every review, and what happened since ------------------------------ */
function ReviewsTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { db } = useApp();
  const list = (db.planningReviews ?? []);
  if (!list.length) return <Card><div className="py-6 text-center text-[12.5px]" style={{ color: 'var(--ink-faint)' }}>No review taken yet. Open an option and start one.</div></Card>;
  return <Card><table className="t">
    <thead><tr><Th>Option</Th><Th>Taken</Th><Th num hint="the planner's rate at the time">Plan rate</Th><Th num hint="actual sales a week since the review">Actual since</Th><Th num>Approved</Th><Th>Status</Th><Th>Where it is</Th></tr></thead>
    <tbody>{list.map(r => { const out = reviewOutcomeOf(db, r); const off = out ? out.actualRos - r.planRos : 0;
      return <tr key={r.id} className="row" onClick={() => onOpen(r.optionId)}>
        <td className="font-medium">{r.styleName}<div className="text-[11px] font-normal" style={{ color: 'var(--ink-faint)' }}>{r.kind}</div></td>
        <td className="text-[12px]">{fmtDate(r.on)}<div style={{ color: 'var(--ink-faint)' }}>{r.by}</div></td>
        <td className="num">{r.planRos.toFixed(1)}<div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>observed {r.observedRos.toFixed(1)}</div></td>
        <td className="num" style={{ color: out && Math.abs(off) > r.planRos * .25 ? 'var(--warn)' : undefined }}>{out ? out.actualRos.toFixed(1) : '—'}{out && <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{out.weeksSince} wk · {out.inStock} fully in stock</div>}</td>
        <td className="num">{r.approvedQty ?? '—'}{r.approvedQty != null && r.approvedQty !== r.draftQty && <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>draft {r.draftQty}</div>}</td>
        <td><Pill tone={r.status === 'sent' ? 'good' : r.status === 'approved' ? 'info' : 'neutral'}>{r.status}</Pill></td>
        <td className="text-[12px]">{out?.req ? <a className="cta" href={`#/tracker?open=${out.req.id}`} onClick={e => e.stopPropagation()}>{out.req.poNo ?? 'no PO yet'} →</a> : <span style={{ color: 'var(--ink-faint)' }}>—</span>}</td>
      </tr>; })}</tbody>
  </table></Card>;
}

/* ---------- the review itself ---------------------------------------------- */
export function PlanningReviewPanel({ o, mine }: { o: RtwOption; mine: boolean }) {
  const { db, startPlanningReview, updatePlanningReview, approvePlanningReview, sendPlanningReviewToDesign } = useApp();
  const r = rosOf(o); const kind = planningKindOf(o); const h = healthOf(o);
  const sp = stockByPurposeOf(db, o); const reserve = displayReserveOf(db, o);
  const wip = wipOf(db, o);
  const vendor = o.vendorId ? db.vendors.find(v => v.id === o.vendorId) : null;
  const fabric = o.fabricCode ? db.fabrics.find(f => f.code === o.fabricCode) ?? null : null;
  const mill = fabric ? db.vendors.find(v => v.id === fabric.vendorId) : null;
  const fab = fabric ? coverageOf(fabric, mill?.leadDays ?? 30, mill ?? undefined) : null;
  const reviews = (db.planningReviews ?? []).filter(x => x.optionId === o.id);
  const current = reviews.find(x => x.status !== 'sent') ?? null;      // the one being worked
  const previous = reviews.filter(x => x.status === 'sent');

  /* the planner's inputs — seeded from the record, kept on the review once started */
  const [planRosStr, setPlanRosStr] = useState(current ? String(current.planRos) : r.trueRos.toFixed(1));
  const [planReason, setPlanReason] = useState(current?.planReason ?? '');
  const [leadWeeks, setLeadWeeks] = useState(current?.leadWeeks ?? (vendor?.leadDays ? Math.max(1, Math.round(vendor.leadDays / 7)) : DEFAULT_LEAD_WEEKS));
  const [coverWeeks, setCoverWeeks] = useState(current?.coverWeeksTarget ?? DEFAULT_COVER_WEEKS);
  const planRos = Math.max(0, Number(planRosStr) || 0);
  const p = projectionOf(db, o, planRos, leadWeeks);
  const draft = draftOrderOf(o, p, planRos, coverWeeks);
  const [displayExtra, setDisplayExtra] = useState<string>(current?.displayExtra != null ? String(current.displayExtra) : '');
  const [moq, setMoq] = useState<string>(current?.moq != null ? String(current.moq) : vendor?.moq ? String(vendor.moq) : '');
  const [approvedQty, setApprovedQty] = useState<string>(current?.approvedQty != null ? String(current.approvedQty) : '');
  const [constraintNote, setConstraintNote] = useState(current?.constraintNote ?? '');
  const [ratio, setRatio] = useState<Record<string, number> | null>(current?.approvedRatio ? Object.fromEntries(current.approvedRatio.map(x => [x.size, x.qty])) : null);
  const ratioRows = o.sizes.map(sz => ({ size: sz, draft: draft.ratio.find(x => x.size === sz)?.qty ?? 0, approved: ratio ? (ratio[sz] ?? 0) : (draft.ratio.find(x => x.size === sz)?.qty ?? 0) }));
  const ratioSum = ratioRows.reduce((a, x) => a + x.approved, 0);
  const approvedN = Number(approvedQty) || 0;
  const unresolved = [displayExtra === '' ? 'display / trial pieces' : null, moq === '' ? 'vendor MOQ' : null].filter(Boolean) as string[];
  const canApprove = mine && !!current && current.status === 'draft' && approvedN > 0 && unresolved.length === 0 && ratioSum === approvedN;
  const faint = { color: 'var(--ink-faint)' } as const;
  const wk = (n: number) => n >= 999 ? '—' : `${n.toFixed(1)} wk`;
  const sizeRisk = p.sizes.filter(s => s.beforeReceipt && s.ros > 0);
  const cat = categoryFor(o);

  const start = () => startPlanningReview({ optionId: o.id, styleName: o.styleName, kind, observedRos: Math.round(r.trueRos * 10) / 10, planRos, planReason, leadWeeks, coverWeeksTarget: coverWeeks,
    usableNow: sp.usable, reserve: reserve.total, projectedAtArrival: p.atArrival, draftQty: draft.gap, draftRatio: draft.ratio, note: '' });
  const save = (patch: Partial<PlanningReview>) => current && updatePlanningReview(current.id, patch);

  return <>
    {/* ── 1 · the option as it stands ── */}
    <Section title="1 · The option today" ownerRole={null} pending={false} defaultOpen
      right={<Pill tone={sizeRisk.length ? 'risk' : p.coverAtArrival < 4 ? 'warn' : 'good'}>{sizeRisk.length ? `${sizeRisk.length} size${sizeRisk.length > 1 ? 's' : ''} out before receipt` : `${wk(p.coverAtArrival)} at arrival`}</Pill>}>
      <div className="grid gap-x-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <KV k="Usable stock, all sizes" v={<b>{sp.usable} pcs</b>} note="sellable pieces only — display and trial pieces are kept outside this figure" />
          <KV k="On the floors for display and trial" v={reserve.total ? `${reserve.total} pcs` : '—'} note={reserve.source === 'launch allocation' ? `${reserve.display} display · ${reserve.trial} fit, issued at cost on launch` : 'no display allocation recorded — a new display need goes on the order below'} />
          <KV k="Of which off the rack in stores" v={`${sp.offRack} pcs`} note={`${STORES.filter(s => s.holdsRtwStock).length} stores carry stock to sell · ${sp.warehouse} at the warehouse`} />
        </div>
        <div>
          <KV k="Launched" v={fmtDate(o.launchedAt)} note={`${Math.round(daysAgo(o.launchedAt) / 7)} weeks ago · ${kind}`} />
          <KV k="Made by" v={vendor ? <VendorLink id={vendor.id} /> : '—'} note={vendor ? `lead ${vendor.leadDays}d · MOQ ${vendor.moq}` : 'no PO on record'} />
          <KV k="Cloth" v={o.fabricCode ?? '—'} note={fab ? `${fab.saleable} m saleable at the warehouse${mill ? ` · ${mill.name}` : ''}` : fabric ? 'on the fabric master' : 'not linked to the fabric master'} />
          <KV k="Health rule says" v={h.action} note="BSC's own rule, as a suggestion — the decision is below" />
        </div>
      </div>
      <div className="label pt-3">On the tracker · WIP</div>
      {wip.length === 0 ? <div className="py-1 text-[12.5px]" style={faint}>Nothing in production for this option.</div>
        : <table className="t compact"><thead><tr><th>PO</th><th className="num">Pieces</th><th>Expected</th><th className="num">Weeks away</th><th>Sizes</th></tr></thead>
          <tbody>{wip.map(w => <tr key={w.order.id} style={w.firm ? undefined : { opacity: .6 }}><td><a className="cta" href={`#/tracker?open=${w.order.id}`}>{w.poNo ?? 'no PO yet'} →</a>{!w.firm && <div className="text-[11px]" style={faint}>not counted until the PO is raised</div>}</td><td className="num">{w.qty}</td><td>{fmtDate(w.arrives)}{w.arrives !== w.order.targetInhouse && <div className="text-[11px]" style={{ color: 'var(--warn)' }}>target was {fmtDate(w.order.targetInhouse)}</div>}</td><td className="num">{w.weeksAway}</td><td className="text-[11.5px]" style={faint}>{w.breakup.filter(b => b.qty).map(b => `${b.size}:${b.qty}`).join(' ')}</td></tr>)}</tbody></table>}
    </Section>

    {/* ── 2 · the rate ── */}
    <Section title="2 · Is the sales rate usable?" ownerRole="planning" pending={false} defaultOpen
      right={<Pill tone={planRos !== Math.round(r.trueRos * 10) / 10 ? 'info' : 'neutral'}>{planRos.toFixed(1)} / wk</Pill>}>
      <div className="grid gap-x-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <KV k="Observed rate" v={`${r.trueRos.toFixed(1)} / wk`} note={`${o.weeklySales.slice(-4).reduce((a, b) => a + b, 0)} pcs in the last 4 weeks ÷ 4, in-stock weeks only`} />
          <KV k="As the sheet reads it" v={`${r.naive.toFixed(1)} / wk`} note="12-week average with the broken weeks left in" />
          <KV k="Best 6 weeks since launch" v={`${r.top6Ros.toFixed(1)} / wk`} note="the ceiling the option has shown" />
        </div>
        <div>
          <Field label="Planning rate · pcs / wk" hint="your assumption — kept beside the observed rate, never over it"><Input type="number" step="0.5" value={planRosStr} disabled={!mine || current?.status === 'approved'} onChange={e => setPlanRosStr(e.target.value)} onBlur={() => save({ planRos })} /></Field>
          <Field label="Why it differs" hint="who changed it, when and why is recorded"><Input value={planReason} disabled={!mine || current?.status === 'approved'} placeholder="expected seasonal uplift · last four weeks were lean" onChange={e => setPlanReason(e.target.value)} onBlur={() => save({ planReason })} /></Field>
        </div>
      </div>
      {r.censoredWeeks > 0 && <div className="pt-2"><Note tone="warn">A size was out of stock in {r.censoredWeeks} of the last 12 weeks. Sales in those weeks understate demand — check the size table before trusting the rate.</Note></div>}
      {kind === 'new' && <div className="pt-2"><Note tone="warn">Launched {Math.round(daysAgo(o.launchedAt) / 7)} weeks ago. The first one or two weeks mislead, especially where sizes were missing. The best-weeks figure is one way to read it; no baseline has been agreed.</Note></div>}
    </Section>

    {/* ── 3 · projection ── */}
    <Section title="3 · Stock week by week" ownerRole={null} pending={false}
      right={<Pill tone={p.firstShortWeek != null && p.firstShortWeek <= leadWeeks ? 'risk' : 'neutral'}>{p.firstShortWeek != null && p.firstShortWeek <= leadWeeks ? `out in week ${p.firstShortWeek}` : `${p.atArrival} pcs at week ${leadWeeks}`}</Pill>}>
      <div className="flex gap-3 items-end flex-wrap pb-2">
        <Field label="New order lead · weeks"><Input type="number" min={1} value={leadWeeks} disabled={!mine || current?.status === 'approved'} onChange={e => setLeadWeeks(Math.max(1, Number(e.target.value) || 1))} onBlur={() => save({ leadWeeks })} style={{ width: 90 }} /></Field>
        <div className="text-[12.5px] pb-2" style={faint}>An order placed today lands around <b>{fmtDate(p.weeks[Math.min(leadWeeks, p.weeks.length) - 1].from)}</b>. WIP is added in the week it is expected, not today.</div>
      </div>
      <table className="t compact"><thead><tr><th>Week</th><th>From</th><th className="num">Opening</th><th className="num">Demand</th><th className="num">Receipts</th><th className="num">Closing</th></tr></thead>
        <tbody>{p.weeks.slice(0, Math.max(leadWeeks + 1, 8)).map(w => <tr key={w.week} style={w.week === leadWeeks ? { background: 'var(--accent-soft)' } : undefined}>
          <td className="mono">{w.week}{w.week === leadWeeks ? <span className="text-[11px]" style={faint}> · new order lands</span> : ''}</td><td>{fmtDate(w.from)}</td><td className="num">{w.opening}</td><td className="num">−{w.demand}</td><td className="num" style={{ color: w.receipts ? 'var(--good)' : undefined }}>{w.receipts ? `+${w.receipts}` : ''}</td><td className="num" style={{ color: w.closing <= 0 ? 'var(--risk)' : undefined }}>{w.closing}</td>
        </tr>)}</tbody></table>
      <div className="pt-2 text-[12.5px]" style={faint}>{p.atArrival > 0 ? `Overall stock stays positive until arrival (${p.atArrival} pcs · ${wk(p.coverAtArrival)}), but check whether a main size runs out earlier.` : `The option runs out in week ${p.firstShortWeek} — before a new order can land.`}</div>
    </Section>

    {/* ── 4 · by size ── */}
    <Section title="4 · Size by size" ownerRole={null} pending={false} defaultOpen={sizeRisk.length > 0}
      right={<Pill tone={sizeRisk.length ? 'risk' : 'good'}>{sizeRisk.length ? `${sizeRisk.map(s => s.size).join(', ')} out before receipt` : 'no size out before receipt'}</Pill>}>
      <table className="t compact"><thead><tr><th>Size</th><th className="num">Usable now</th><th className="num">In WIP</th><th className="num">Rate / wk</th><th className="num">At arrival</th><th>First short</th></tr></thead>
        <tbody>{p.sizes.map(s => <tr key={s.size} style={s.beforeReceipt && s.ros > 0 ? { background: 'var(--risk-soft)' } : undefined}>
          <td className="mono">{s.size}</td><td className="num">{s.usable}</td><td className="num">{s.incoming || ''}</td><td className="num">{s.ros.toFixed(1)}</td>
          <td className="num" style={{ color: s.atArrival < 0 ? 'var(--risk)' : undefined }}>{s.atArrival}</td>
          <td className="text-[12px]">{s.firstShortWeek == null ? <span style={faint}>—</span> : s.firstShortWeek === 0 ? <span style={{ color: 'var(--risk)' }}>out now</span> : <span style={{ color: s.beforeReceipt ? 'var(--risk)' : 'var(--warn)' }}>week {s.firstShortWeek}{s.beforeReceipt ? ' · before any receipt' : ' · after WIP lands'}</span>}</td>
        </tr>)}</tbody></table>
      <div className="pt-2 text-[12.5px]" style={faint}>Size rows reconcile to the option total. A size's rate is its share of the planning rate, on its own last four in-stock weeks.</div>
    </Section>

    {/* ── 5 · the order working ── */}
    <Section title="5 · Draft quantity" ownerRole="planning" pending={false} defaultOpen
      right={<Pill tone={current?.status === 'approved' || current?.status === 'sent' ? 'good' : 'neutral'}>{current?.approvedQty != null ? `${current.approvedQty} pcs approved` : `${draft.gap} pcs draft`}</Pill>}>
      <div className="flex gap-3 items-end flex-wrap pb-2">
        <Field label="Cover wanted after arrival · weeks" hint="12–16 for an established option"><Input type="number" min={1} value={coverWeeks} disabled={!mine || current?.status === 'approved'} onChange={e => setCoverWeeks(Math.max(1, Number(e.target.value) || 1))} onBlur={() => save({ coverWeeksTarget: coverWeeks })} style={{ width: 90 }} /></Field>
      </div>
      <div className="mono text-[12.5px]" style={{ background: 'var(--surface-2)', borderRadius: 6, padding: '10px 14px' }}>
        {[
          [`Target demand after receipt · ${coverWeeks} × ${planRos.toFixed(1)}`, String(draft.target)],
          ['Less projected usable stock at arrival', `−${p.atArrival}`],
          ['Initial sellable requirement', String(draft.gap)],
          ['Additional display / trial pieces', displayExtra === '' ? '?' : displayExtra],
          ['Vendor MOQ / production constraint', moq === '' ? '?' : moq],
          ['Planner-approved order quantity', approvedQty === '' ? '?' : approvedQty],
        ].map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-0.5"><span style={{ color: v === '?' ? 'var(--warn)' : undefined }}>{k}</span><b style={{ color: v === '?' ? 'var(--warn)' : undefined }}>{v}</b></div>)}
      </div>
      <div className="text-[12px] pt-2" style={faint}>{draft.gap} is a starting point, not an approved quantity. The question marks have to be confirmed, not assumed.</div>
      {mine && !current && <div className="pt-3"><Button variant="primary" onClick={start}>Start the review · save today's figures</Button></div>}
      {current && current.status !== 'sent' && <div className="grid gap-3 pt-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Field label="Display / trial pieces to add" hint="0 if the floors are covered"><Input type="number" min={0} value={displayExtra} disabled={!mine || current.status === 'approved'} onChange={e => setDisplayExtra(e.target.value)} onBlur={() => save({ displayExtra: displayExtra === '' ? null : Number(displayExtra) })} /></Field>
        <Field label="Vendor MOQ · pcs" hint={vendor ? `${vendor.name} says ${vendor.moq}` : 'confirm with the vendor'}><Input type="number" min={0} value={moq} disabled={!mine || current.status === 'approved'} onChange={e => setMoq(e.target.value)} onBlur={() => save({ moq: moq === '' ? null : Number(moq) })} /></Field>
        <Field label="Approved quantity" hint={approvedN && approvedN !== draft.gap + (Number(displayExtra) || 0) ? `${approvedN - draft.gap - (Number(displayExtra) || 0) > 0 ? '+' : ''}${approvedN - draft.gap - (Number(displayExtra) || 0)} vs the working — say why below` : 'the number you will buy'}><Input type="number" min={0} value={approvedQty} disabled={!mine || current.status === 'approved'} onChange={e => setApprovedQty(e.target.value)} /></Field>
      </div>}
      {current && current.status !== 'sent' && <Field label="Why the approved number differs from the working" hint="MOQ, a production multiple, display pieces — never described as demand"><Input value={constraintNote} disabled={!mine || current.status === 'approved'} placeholder="factory cuts in multiples of 20" onChange={e => setConstraintNote(e.target.value)} /></Field>}
    </Section>

    {/* ── 6 · ratio ── */}
    <Section title="6 · Size ratio" ownerRole="planning" pending={false} defaultOpen={!!current}
      right={<Pill tone={ratioSum === approvedN && approvedN > 0 ? 'good' : 'neutral'}>{ratioSum} pcs{approvedN ? ` of ${approvedN}` : ''}</Pill>}>
      <table className="t compact"><thead><tr><th>Size</th><th className="num">Rate / wk</th><th className="num">At arrival</th><th className="num">Draft</th><th className="num">Approved</th><th className="num">Cover after · wk</th></tr></thead>
        <tbody>{ratioRows.map(row => { const s = p.sizes.find(x => x.size === row.size)!; const after = s.ros > 0 ? (Math.max(0, s.atArrival) + row.approved) / s.ros : 999;
          return <tr key={row.size}>
            <td className="mono">{row.size}</td><td className="num">{s.ros.toFixed(1)}</td><td className="num" style={{ color: s.atArrival < 0 ? 'var(--risk)' : undefined }}>{s.atArrival}</td><td className="num" style={faint}>{row.draft}</td>
            <td className="num">{current && current.status === 'draft' && mine ? <input className="input mono" type="number" min={0} value={row.approved} style={{ width: 70, padding: '3px 6px', textAlign: 'right' }} onChange={e => setRatio(x => ({ ...(x ?? Object.fromEntries(ratioRows.map(y => [y.size, y.approved]))), [row.size]: Math.max(0, Number(e.target.value) || 0) }))} /> : <span className="mono">{row.approved}</span>}</td>
            <td className="num" style={{ color: after < 4 ? 'var(--risk)' : after > coverWeeks * 2 ? 'var(--warn)' : undefined }}>{after >= 999 ? '—' : after.toFixed(0)}</td>
          </tr>; })}
          <tr style={{ fontWeight: 600 }}><td>Total</td><td /><td className="num">{p.atArrival}</td><td className="num" style={faint}>{draft.gap}</td><td className="num" style={{ color: approvedN && ratioSum !== approvedN ? 'var(--risk)' : undefined }}>{ratioSum}</td><td /></tr>
        </tbody></table>
      <div className="pt-2 text-[12.5px]" style={faint}>The draft spreads the gap on each size's rate and adds back any size short at arrival. Sizes out before receipt may need a bigger share; a slow size committed months ahead builds excess. Both the draft and your ratio are kept.{approvedN > 0 && ratioSum !== approvedN ? ` The ratio must add up to ${approvedN}.` : ''}</div>
      {current && current.status === 'draft' && mine && <div className="flex gap-2 pt-2"><Button size="sm" onClick={() => setRatio(null)}>Back to the draft ratio</Button>{approvedN > 0 && ratioSum !== approvedN && <Button size="sm" onClick={() => { const base = ratioRows.map(x => x.approved); const sum = base.reduce((a, b) => a + b, 0); const scaled = ratioRows.map((x, i) => ({ size: x.size, qty: sum ? Math.round(base[i] * approvedN / sum) : Math.round(approvedN / ratioRows.length) })); const d = approvedN - scaled.reduce((a, b) => a + b.qty, 0); scaled.sort((a, b) => b.qty - a.qty)[0].qty += d; setRatio(Object.fromEntries(scaled.map(x => [x.size, x.qty]))); }}>Scale to {approvedN}</Button>}</div>}
    </Section>

    {/* ── 7 · constraints and approval ── */}
    <Section title="7 · Checks, approval, to design" ownerRole="planning" pending={false} defaultOpen={!!current}
      right={<Pill tone={current?.status === 'approved' ? 'info' : !current && previous.length ? 'good' : 'neutral'}>{current?.status === 'approved' ? 'plan approved' : current ? 'draft' : previous.length ? `last sent ${fmtDate(previous[0].on)}` : 'not started'}</Pill>}>
      <KV k="Fabric available?" v={fab ? `${fab.saleable} m saleable` : 'not linked'} note={fab && o.sizes.length ? `about ${Math.floor(fab.saleable / 1.6)} pcs at 1.6 m a piece · sourcing confirms on the requirement` : 'sourcing puts a vendor against the cloth once the request lands'} />
      <KV k="Which factory?" v={vendor ? vendor.name : 'to be proposed'} note={vendor ? `last run · ${vendor.leadDays}d lead · MOQ ${vendor.moq} · on-time ${Math.round(vendor.onTimeRate * 100)}%` : 'Nitin proposes a factory on the request'} />
      <KV k="Delivery achievable?" v={`${leadWeeks} weeks · ${fmtDate(p.weeks[Math.min(leadWeeks, p.weeks.length) - 1].from)}`} note="the target in-house date on the requirement" />
      <KV k="Cost review" v="on the factory proposal" note="design accepts the cost when Nitin proposes the factory" />
      <KV k="Unresolved" v={unresolved.length ? <span style={{ color: 'var(--warn)' }}>{unresolved.join(' · ')}</span> : 'nothing'} />
      {current && current.status === 'draft' && <div className="flex gap-2 items-center pt-3 flex-wrap">
        <Button variant="primary" disabled={!canApprove} title={!canApprove ? (unresolved.length ? `confirm ${unresolved.join(' and ')} first` : ratioSum !== approvedN ? `the ratio must add up to ${approvedN || 'the approved quantity'}` : 'enter the approved quantity') : undefined}
          onClick={() => approvePlanningReview(current.id, approvedN, ratioRows.map(x => ({ size: x.size, qty: x.approved })), constraintNote.trim())}>Approve plan · {approvedN || '?'} pcs</Button>
        {approvedN > 0 && approvedN !== draft.gap && !constraintNote.trim() && <span className="text-[12px]" style={{ color: 'var(--warn)' }}>say why {approvedN} and not {draft.gap}</span>}
      </div>}
      {current && current.status === 'approved' && <div className="pt-3">
        <div className="text-[12.5px] pb-2">Approved {fmtDate(current.approvedOn)} by {current.approvedBy} · {current.approvedQty} pcs{current.constraintNote ? ` · ${current.constraintNote}` : ''}. Sending creates the RTW requirement on design's list, with the quantity and ratio filled in and the proto skipped as a repeat. Design sends it on, and it runs as any RTW style.</div>
        <Button variant="primary" onClick={() => sendPlanningReviewToDesign(current.id, cat.category, cat.sub, Math.round(o.mrp / 3.5))}>Send to design as a requirement →</Button>
      </div>}
      {!current && previous.length > 0 && <div className="pt-2 text-[12.5px]" style={faint}>The last review went to design {fmtDate(previous[0].on)}{previous[0].requirementId ? <> · <a className="cta" href={`#/tracker?open=${previous[0].requirementId}`}>on the tracker →</a></> : null}. Start a new review from section 5 when the next order is due.</div>}
      {!current && !mine && <div className="text-[12.5px]" style={faint}>Planning starts the review.</div>}
    </Section>

    {/* ── previous reviews: plan vs actual ── */}
    {previous.length > 0 && <Section title={`Previous reviews · ${previous.length}`} ownerRole={null} pending={false}>
      {previous.map(pr => { const out = reviewOutcomeOf(db, pr); return <div key={pr.id} className="py-2" style={{ borderTop: '1px solid var(--line-soft)' }}>
        <div className="text-[12.5px]"><b>{fmtDate(pr.on)}</b> · {pr.by} · {pr.kind} · approved {pr.approvedQty} pcs{pr.approvedQty !== pr.draftQty ? ` (working said ${pr.draftQty}${pr.constraintNote ? ` — ${pr.constraintNote}` : ''})` : ''}</div>
        <table className="t compact mt-1"><thead><tr><th>Planned assumption</th><th>Actual since</th></tr></thead><tbody>
          <tr><td>{pr.planRos.toFixed(1)} pcs / wk expected{pr.planReason ? ` — ${pr.planReason}` : ''}</td><td>{out ? `${out.actualRos.toFixed(1)} / wk over ${out.weeksSince} weeks · ${out.inStock} fully in stock` : '—'}</td></tr>
          <tr><td>Size mix {pr.approvedRatio?.filter(x => x.qty).map(x => `${x.size}:${x.qty}`).join(' ')}</td><td>{out?.sizesOut.length ? `${out.sizesOut.join(', ')} out now — their sales understate demand` : 'every size in stock'}</td></tr>
          <tr><td>Expected in {pr.leadWeeks} weeks · {fmtDate(iso7(pr.on, pr.leadWeeks))}</td><td>{out?.req ? <a className="cta" href={`#/tracker?open=${out.req.id}`}>{out.req.poNo ?? 'no PO yet'} · {out.req.status} →</a> : 'not sent'}</td></tr>
        </tbody></table>
      </div>; })}
      <div className="pt-2 text-[12px]" style={faint}>A size that stocked out sells less than it could have. Lost sales are not estimated here; the weeks it was unavailable are flagged instead.</div>
    </Section>}

    <RecordTail kind="option" subjectId={o.id} labels={['Planning note', 'Sheet']} editable={mine} />
  </>;
}

function iso7(from: string, weeks: number) { const d = new Date(from); d.setDate(d.getDate() + weeks * 7); return d.toISOString(); }
