/* MTM production — the production manager's day, as Enigma should have had it.
   Allocate: PP queue past the freeze, a rule-drafted plan per factory, one
   submit. Plans: order sheets moving by QR scan. Floor: one factory's day,
   for its merchandiser — WIP aging, mark ready, ask for fabric.
   Fabric: the extra-fabric email as a queue whose approval moves inventory.
   Output: the WhatsApp shipping table and the aging pivot, derived. */
import { useState } from 'react';
import type React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { CustomerOrder, ExtraFabricRequest, OrderTag } from '../domain/types';
import { prepOf, sheetVersion, changePendingOf, ppQueue, proposeAllocation, factoryLoadOf, agingOf, shippingTable, prepQueue, inwardOf, bespokeQueue, agingReport, needsReprint, sheetRev, fmtDate, fmtRel, fmtTime, daysAgo, iso, TODAY, MTM_OPEN, addDays } from '../domain/engines';
import { MTM_STAGES, PP_FREEZE_HOURS, PLAN_HORIZON_DAYS, AGING_DAYS, ORDER_TAGS, EXTRA_FABRIC_REASONS, EXTRA_FABRIC_PANELS, PANEL_METRES, STORES } from '../domain/reference';
import { Page, Card, Pill, Button, Note, Tabs, Seg, Empty, Drawer, KV, Section, Field, Input, Select, useExamples, dateInput, fromDateInput, type Tone } from '../ui';
import { ThreadPanel } from './Thread';
import { Files } from './Files';
import { FILE_LABELS } from '../domain/reference';

import { SheetChangePanel, PullBackButton } from './OrderSheet';
import { VendorLink } from './Vendors';
import { PrepOverview, PrepOnOrder } from './Preprod';
import { ActsBy } from './Who';

const TAG_TONE: Record<OrderTag, Tone> = { normal:'neutral', urgent:'risk', corporate:'info' };
const STAGE_TONE: Record<string, Tone> = { punched:'neutral', pp:'warn', planned:'info', 'in-transit':'info', 'in-factory':'info', 'out-factory':'good', rts:'good', dispatched:'good', delivered:'neutral' };
const stageLabel = (id: string) => MTM_STAGES.find(s => s.id === id)?.label ?? id;

export function Mtm() {
  const { db, role, settings } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'allocate';
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace:true }); };
  const isProd = role === 'production' || role === 'owner';
  const isWh = role === 'warehouse' || role === 'owner';
  const mine = isProd;
  void isWh;
  const q = ppQueue(db, settings.ppFreezeHours);
  const ag = agingOf(db);
  const factories = db.vendors.filter(v => v.mtm && v.kind !== 'Hemming unit');   // MTM is made from scratch — hemming is an RTW step, never an MTM order
  const openOrder = (db.customerOrders ?? []).find(o => o.id === params.get('open')) ?? null;
  const changesPending = { me: (db.customerOrders ?? []).filter(o => changePendingOf(o) === 'me'), others: (db.customerOrders ?? []).filter(o => changePendingOf(o) === 'others') };
  const pendingFabric = (db.extraFabric ?? []).filter(r => r.status === 'requested').length;

  return (
    <Page title="MTM daily production" lede={`Single-piece orders from punch to dispatch, in Enigma's own stages.`}
      replaces="the factory-by-factory planning page, the WhatsApp output image, Vishnu's aging pivot, and the extra-fabric email">
      {!isProd && !isWh && <div className="mb-2"><ActsBy role={['production', 'warehouse']} does="plans, scans and dispatches here — production plans and watches the floor, the warehouse cuts, sends and receives" inline /></div>}
      {!isProd && isWh && <div className="mb-2"><ActsBy role="production" does="allocates orders to factories, submits plans and watches the factory floor — the warehouse tabs are yours" inline /></div>}
      <Tabs tabs={[
        ...(isProd ? [{ id:'allocate', label:'Allocate', hint:'allocate orders to factories', count: q.ready.length }, { id:'plans', label:'Plans', hint:'submitted plans', count: (db.plans ?? []).filter(p => !p.closedOn).length }, { id:'floor', label:'Factory floor', hint:'pieces sitting in each factory' }] : []),
        ...(isProd ? [{ id:'prep', label:'Pre-production', hint:'CAD, cutting, fusing and compiling for every planned order', count: (db.customerOrders ?? []).filter(o => o.kind === 'MTM' && o.stage === 'planned' && !prepOf(o).ready).length }] : []),
        ...(isProd ? [{ id:'changes', label:'Changed sheets', hint:'changed order sheets — who must act', count: changesPending.me.length + changesPending.others.length }] : []),
        { id:'fabric', label:'Extra fabric', hint:'extra fabric requests from the floor', count: pendingFabric },
      ]} active={tab} onChange={t => set('tab', t)} wrap />

      {tab === 'allocate' && isProd && <AllocateTab mine={mine} onOpen={id => set('open', id)} />}
      {tab === 'plans' && isProd && <PlansTab mine={mine} onOpen={id => set('open', id)} />}
      {tab === 'floor' && isProd && <FloorTab mine={mine} factoryId={params.get('factory') ?? factories[0]?.id} onFactory={id => set('factory', id)} onOpen={id => set('open', id)} />}
      {tab === 'prep' && isProd && <PrepOverview onOpen={id => set('open', id)} />}
      {tab === 'changes' && isProd && <ChangesTab onOpen={id => set('open', id)} />}
      {tab === 'fabric' && <FabricTab mine={mine} wh={isWh} onOpen={id => set('open', id)} />}

      <Drawer open={!!openOrder} onClose={() => set('open', null)} title={openOrder?.orderNo ?? ''} subtitle={openOrder && <><Pill tone={STAGE_TONE[openOrder.stage] ?? 'neutral'}>{stageLabel(openOrder.stage)}</Pill><Pill tone={TAG_TONE[openOrder.tag]}>{openOrder.tag}</Pill><span>{openOrder.customer} · {STORES.find(s => s.id === openOrder.storeId)?.name}</span></>}>
        {openOrder && <OrderSheet o={openOrder} mine={mine} />}
      </Drawer>
    </Page>
  );
}

/* ---------- Changed order sheets ------------------------------------------
   A customer changes their mind four or five times a day. Before the order is
   allocated the change is production's own to read; after it, the piece is at a
   factory and the merchandiser may be cutting to the old sheet — so the only
   useful thing is a call, and a record that the call was made. */
function ChangesTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { db, markChangeSeen, markFactoryTold } = useApp();
  const [side, setSide] = useState<'me' | 'others'>('me');
  const all = (db.customerOrders ?? []).map(o => ({ o, pending: changePendingOf(o) })).filter(x => x.pending);
  const rows = all.filter(x => x.pending === side)
    .map(x => ({ ...x, rev: (x.o.revisions ?? [])[(x.o.revisions ?? []).length - 1]! }))
    .sort((a, b) => b.rev.at.localeCompare(a.rev.at));
  /* one sheet per stage it was caught at — and, once allocated, whether the floor has the new copy */
  const ex = useExamples(rows, x => `${x.o.stage}·${needsReprint(x.o)}`, { noun:'changed sheets', done: x => !needsReprint(x.o) });
  const mine = all.filter(x => x.pending === 'me').length; const theirs = all.filter(x => x.pending === 'others').length;
  const factory = (id: string | null) => db.vendors.find(v => v.id === id);
  const store = (id: string) => STORES.find(s => s.id === id)?.name ?? id;
  return <>
    <div className="flex gap-1.5 flex-wrap mb-3 items-center">
      <button type="button" className={`btn sm ${side === 'me' ? 'primary' : ''}`} onClick={() => setSide('me')}>Changed · pending with me · {mine}</button>
      <button type="button" className={`btn sm ${side === 'others' ? 'primary' : ''}`} onClick={() => setSide('others')}>Changed · pending with the factory · {theirs}</button>
      {rows.length > 0 && <Button size="sm" variant="ghost" onClick={() => (side === 'me' ? markChangeSeen(rows.map(r => r.o.id)) : markFactoryTold(rows.map(r => r.o.id)))}>
        {side === 'me' ? `Mark all ${rows.length} read` : `Log all ${rows.length} as told`}</Button>}
      <span className="ml-auto">{ex.strip}</span>
    </div>
    {rows.length === 0 ? <Card><Empty title={side === 'me' ? 'Nothing changed since you last looked.' : 'Every factory has been told.'}
      body={side === 'me' ? 'A sheet corrected before you allocate it lands here, so the plan is made on what the customer actually wants.' : 'A sheet corrected after allocation lands here until you have rung the merchandiser holding the piece.'} /></Card>
      : <Card><div style={{ overflowX:'auto' }}><table className="t compact">
        <thead><tr><th>Order</th><th>Customer · store</th><th>What changed</th><th>Why · who</th><th>When</th><th>{side === 'me' ? 'Where it is' : 'Who to ring'}</th><th></th></tr></thead>
        <tbody>{ex.rows.map(({ o, rev }) => { const f = factory(o.factoryId); return <tr key={o.id} className="row" onClick={() => onOpen(o.id)}>
          <td className="mono text-[12.5px]">{o.orderNo}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{o.styleName}</div></td>
          <td className="text-[12.5px]" style={{ whiteSpace:'normal' }}>{o.customer}<div style={{ color:'var(--ink-faint)' }}>{store(o.storeId)}</div></td>
          <td style={{ whiteSpace:'normal', minWidth: 210 }}>{rev.changes.map((c, i) => <div key={i} className="text-[12.5px]"><b>{c.field}</b> <span style={{ color:'var(--ink-faint)' }}>{c.from}</span> → <span style={{ color:'var(--accent)' }}>{c.to}</span></div>)}
            {o.remarks && <div className="text-[11px]" style={{ color:'var(--ink-soft)' }}>remark: “{o.remarks}”</div>}</td>
          <td className="text-[12px]" style={{ whiteSpace:'normal', minWidth: 160 }}>“{rev.note}”<div style={{ color:'var(--ink-faint)' }}>{rev.by}</div></td>
          <td className="text-[12px]">{fmtRel(rev.at)}<div style={{ color:'var(--ink-faint)' }}>{fmtDate(rev.at)}</div></td>
          <td className="text-[12.5px]" style={{ whiteSpace:'normal' }}>{side === 'me' ? <Pill tone="warn">{stageLabel(o.stage)} · not allocated</Pill>
            : <>{f ? <VendorLink id={f.id} /> : '—'}<div style={{ color:'var(--ink-faint)' }}>{stageLabel(o.stage)}{needsReprint(o) ? ' · sheet not re-issued' : ''}</div></>}</td>
          <td onClick={e => e.stopPropagation()}>{side === 'me'
            ? <Button size="sm" variant="primary" onClick={() => markChangeSeen([o.id])}>Acknowledged — plan on this</Button>
            : <Button size="sm" variant="primary" onClick={() => markFactoryTold([o.id])}>Told {f?.name?.split(' ')[0] ?? 'the factory'}</Button>}</td>
        </tr>; })}</tbody>
      </table></div></Card>}
    <div className="mt-3"><Note>{side === 'me' ? 'Not yet allocated, so the correction costs nothing — acknowledging it tells the store the change landed.' : 'Already at a factory — ring the merchandiser and log the call here so the store can see it was made.'}</Note></div>
  </>;
}

/* ---------- Allocate ------------------------------------------------------ */
function AllocateTab({ mine, onOpen }: { mine: boolean; onOpen: (id: string) => void }) {
  const { db, submitPlan, setOrderTag, settings, setFreezeHours } = useApp();
  const q = ppQueue(db, settings.ppFreezeHours);
  const factories = db.vendors.filter(v => v.mtm && v.kind !== 'Hemming unit');   // MTM is made from scratch — hemming is an RTW step, never an MTM order
  const { proposals, unplaced } = proposeAllocation(db, q.ready);
  const [showFrozen, setShowFrozen] = useState(false);
  const proposedFor = (oid: string) => proposals.find(p => p.orderIds.includes(oid))?.factoryId ?? null;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string>(factories[0]?.id ?? '');
  const [filter, setFilter] = useState<string>('all');          // proposed factory · unplaced
  const [tagF, setTagF] = useState<string>('all');
  const [storeF, setStoreF] = useState<string>('all');
  const [bucketF, setBucketF] = useState<string>('all');       // core · non-core · bespoke
  const [search, setSearch] = useState('');
  const [conf, setConf] = useState<'exclude' | 'only'>('exclude');   // pre-confirmed orders: left out of planning, or shown on their own
  const { confirmOrder } = useApp();
  const name = (id: string | null) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const bucketOf = (o: CustomerOrder) => db.fabrics.find(f => f.id === o.fabricId)?.bucket ?? '';
  const visible = q.ready.filter(o =>
    (filter === 'all' ? true : filter === 'unplaced' ? !proposedFor(o.id) : proposedFor(o.id) === filter)
    && (tagF === 'all' || o.tag === tagF)
    && (storeF === 'all' || o.storeId === storeF)
    && (bucketF === 'all' || bucketOf(o) === bucketF)
    && (!search || `${o.orderNo} ${o.customer} ${o.styleName} ${o.bespoke?.code ?? ''}`.toLowerCase().includes(search.toLowerCase())));
  /* one order per proposed factory, plus one nowhere has room for — the states a planner reads */
  const ex = useExamples(visible, o => proposedFor(o.id) ?? 'unplaced', { noun:'orders', done: o => !!proposedFor(o.id) });
  const shown = ex.rows;
  const exFrozen = useExamples(q.frozen, o => o.tag, { noun:'held orders', done: o => !o.bespoke });
  const storesInQueue = [...new Set(q.ready.map(o => o.storeId))].map(id => STORES.find(s => s.id === id)!).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  const anyFilter = filter !== 'all' || tagF !== 'all' || storeF !== 'all' || bucketF !== 'all' || !!search;
  const clear = () => { setFilter('all'); setTagF('all'); setStoreF('all'); setBucketF('all'); setSearch(''); };
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  /* "give me the next 30" — the way the plan is actually made: oldest punch first,
     off whatever is on screen, so a filter narrows it and FIFO picks within it. */
  const [fifoN, setFifoN] = useState(30);
  const selectFifo = (n: number) => setSelected(new Set([...shown].sort((a, b) => a.punchedOn.localeCompare(b.punchedOn)).slice(0, n).map(o => o.id)));
  const selectVisible = (on: boolean) => setSelected(s => { const n = new Set(s); shown.forEach(o => (on ? n.add(o.id) : n.delete(o.id))); return n; });
  const selectProposed = (fid: string) => setSelected(new Set(proposals.find(p => p.factoryId === fid)?.orderIds ?? []));
  const [force, setForce] = useState(false);
  const submitSelected = () => { if (!target || selected.size === 0) return; const id = submitPlan(target, [...selected], force); if (id) { setSelected(new Set()); setForce(false); } };
  const allVisibleSelected = shown.length > 0 && shown.every(o => selected.has(o.id));
  return <>
    <div className="grid gap-3" style={{ gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {factories.map(v => { const l = factoryLoadOf(db, v.id); const prop = proposals.find(p => p.factoryId === v.id)?.orderIds ?? []; return (
        <Card key={v.id}><div className="pad" style={{ padding:'12px 14px' }}>
          <div className="flex items-baseline justify-between gap-2"><VendorLink id={v.id} className="font-medium" /><Pill tone={l.load > 2 ? 'warn' : 'good'}>{l.load.toFixed(1)}d load</Pill></div>
          <div className="mt-2 text-[12px]" style={{ color:'var(--ink-soft)' }}>
            <div className="flex justify-between"><span>feed / day</span><b>{l.perDay}{v.dailyTarget && v.dailyTarget !== l.avgOut ? <span style={{ color:'var(--ink-faint)' }}> · avg {l.avgOut}</span> : null}</b></div>
            <div className="flex justify-between"><span>in factory</span><b style={{ color: l.aging.length ? 'var(--risk)' : undefined }}>{l.wip.length}{l.aging.length ? ` · ${l.aging.length} aging` : ''}</b></div>
            <div className="flex justify-between"><span>in transit</span><b>{l.inTransit.length}</b></div>
            <div className="flex justify-between"><span>headroom today</span><b>{l.headroom}</b></div>
          </div>
          <div className="mt-2 pt-2 flex items-center justify-between gap-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
            <button type="button" className="vlink text-[12.5px]" onClick={() => { clear(); setFilter(v.id); selectProposed(v.id); setTarget(v.id); }}><b style={{ color: prop.length > l.headroom ? 'var(--risk)' : 'var(--accent)' }}>{prop.length}</b> <span style={{ color:'var(--ink-faint)' }}>proposed</span></button>
            {mine && prop.length > 0 && <Button size="sm" variant="primary" onClick={() => submitPlan(v.id, prop)}>Submit plan</Button>}
          </div>
        </div></Card>); })}
    </div>
    <div className="mt-3"><Note>Headroom = feed per day, less what is already on its way, less any backlog beyond two days.</Note></div>

    {q.ready.length === 0 ? <div className="mt-3"><Card><Empty title="Nothing to plan." body={`Everything past the ${settings.ppFreezeHours}-hour freeze has a plan. ${q.frozen.length} order${q.frozen.length === 1 ? '' : 's'} still inside the window.`} /></Card></div> : <>
      <div className="mt-3 flex gap-2 items-end flex-wrap">
        <div style={{ width: 210 }}><Field label="Proposed for"><Select value={filter} onChange={setFilter} options={[{ value:'all', label:`Any · ${q.ready.length}` }, ...factories.map(f => ({ value:f.id, label:`${f.name} · ${proposals.find(p => p.factoryId === f.id)?.orderIds.length ?? 0}` })), { value:'unplaced', label:`No room anywhere · ${unplaced.length}` }]} /></Field></div>
        <div style={{ width: 140 }}><Field label="Tag"><Select value={tagF} onChange={setTagF} options={[{ value:'all', label:'All tags' }, ...ORDER_TAGS.map(t => ({ value:t, label:`${t} · ${q.ready.filter(o => o.tag === t).length}` }))]} /></Field></div>
        <div style={{ width: 170 }}><Field label="Store"><Select value={storeF} onChange={setStoreF} options={[{ value:'all', label:'All stores' }, ...storesInQueue.map(st => ({ value:st.id, label:`${st.name} · ${q.ready.filter(o => o.storeId === st.id).length}` }))]} /></Field></div>
        <div style={{ width: 130 }}><Field label="Fabric"><Select value={bucketF} onChange={setBucketF} options={[{ value:'all', label:'All' }, { value:'CORE', label:'Core' }, { value:'NON_CORE', label:'Non-core' }, { value:'BESPOKE', label:'Bespoke' }]} /></Field></div>
        <div style={{ width: 180 }}><Field label="Search"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="order, customer, fabric, code" /></Field></div>
        <div><span className="label">Confirmation</span><div className="seg"><button type="button" className={conf === 'exclude' ? 'on' : ''} onClick={() => setConf('exclude')}>Exclude pre-confirmed · {q.ready.length}</button><button type="button" className={conf === 'only' ? 'on' : ''} onClick={() => setConf('only')}>Pre-confirmed · {q.preConfirmed.length}</button></div></div>
        {anyFilter && <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>}
      </div>

      {conf === 'only' && <Card className="mt-2">{q.preConfirmed.length === 0 ? <Empty title="No pre-confirmed orders." body="Every order taken at the store is confirmed." /> : <table className="t">
        <thead><tr><th>Order</th><th>Customer · store</th><th>Fabric</th><th>Why it is not confirmed</th><th className="num">Days pre-confirmed</th><th></th></tr></thead>
        <tbody>{[...q.preConfirmed].sort((a, b) => a.preConfirmed!.since.localeCompare(b.preConfirmed!.since)).map(o => <tr key={o.id} className="row" onClick={() => onOpen(o.id)}>
          <td className="mono text-[12.5px]">{o.orderNo}</td><td className="text-[12.5px]">{o.customer}<div style={{ color:'var(--ink-faint)' }}>{STORES.find(st => st.id === o.storeId)?.name}</div></td>
          <td className="text-[12.5px]">{o.styleName}</td>
          <td><Pill tone="warn">{o.preConfirmed!.reason}</Pill><div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{o.preConfirmed!.note}</div></td>
          <td className="num text-[12.5px]" style={{ color: daysAgo(o.preConfirmed!.since) > 7 ? 'var(--risk)' : undefined }}>{daysAgo(o.preConfirmed!.since)}d<div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>since {fmtDate(o.preConfirmed!.since)}</div></td>
          <td onClick={e => e.stopPropagation()}>{mine && <Button size="sm" variant="primary" onClick={() => confirmOrder(o.id, '')}>Confirm</Button>}</td>
        </tr>)}</tbody></table>}</Card>}
      {conf === 'only' && <div className="mt-2 text-[12px]" style={{ color:'var(--ink-faint)' }}>Pre-confirmed orders were taken at the store but are not confirmed yet: measurement not done, on hold, or payment pending. They are not planned to a factory until confirmed.</div>}
      {conf === 'exclude' && <>
      {/* pick — how the plan is actually built: narrow above, then take the oldest N */}
      <div className="mt-2 flex gap-3 items-center flex-wrap px-3 py-2" style={{ background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius: 8 }}>
        <span className="text-[13px]"><b>{shown.length}</b> <span style={{ color:'var(--ink-soft)' }}>showing</span>{anyFilter && <span style={{ color:'var(--ink-faint)' }}> of {q.ready.length}</span>}</span>
        {ex.strip}
        <span style={{ color:'var(--line)' }}>|</span>
        <span className="text-[13px]" style={{ color:'var(--ink-soft)' }}>Pick</span>
        <Button size="sm" variant="ghost" onClick={() => selectVisible(!allVisibleSelected)}>{allVisibleSelected ? 'Unselect all shown' : 'All shown'}</Button>
        <span className="text-[13px]" style={{ color:'var(--ink-faint)' }}>or the oldest</span>
        {[20, 30, 50].map(n => <button key={n} type="button" className={`btn sm ${fifoN === n ? 'primary' : ''}`} onClick={() => { setFifoN(n); selectFifo(n); }} title={`the ${Math.min(n, shown.length)} oldest of the ${shown.length} showing, by punch time`}>{n}</button>)}
        <Input type="number" min={1} step={5} value={fifoN} onChange={e => setFifoN(Math.max(1, Number(e.target.value) || 1))} className="input mono" style={{ width: 58, padding:'3px 6px' }} />
        <Button size="sm" onClick={() => selectFifo(fifoN)}>Take {fifoN}</Button>
        {selected.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>}
        <div className="flex-1" />
        <div style={{ width: 130 }}><Field label="Freeze window · h" hint="orders punched since are held back"><Input type="number" min={0} max={24} step={0.5} value={settings.ppFreezeHours} onChange={e => setFreezeHours(Number(e.target.value))} className="input mono" /></Field></div>
      </div>

      {/* act — only once something is picked, and it is the loudest thing on screen */}
      {mine && selected.size > 0 && (() => { const room = target ? factoryLoadOf(db, target).headroom : 0; const over = Math.max(0, selected.size - room); return (
        <div className="mt-2 flex gap-3 items-center flex-wrap px-3 py-2.5" style={{ background:'var(--accent-soft)', border:'1px solid var(--accent)', borderRadius: 8 }}>
          <span className="text-[14px]"><b>{selected.size}</b> order{selected.size === 1 ? '' : 's'} selected</span>
          <span className="text-[13px]" style={{ color:'var(--ink-soft)' }}>→ send to</span>
          <div style={{ width: 240 }}><Select value={target} onChange={setTarget} options={factories.map(f => ({ value:f.id, label:`${f.name} · room ${factoryLoadOf(db, f.id).headroom}` }))} /></div>
          <Button variant="primary" disabled={!target || (over > 0 && !force)} onClick={submitSelected}>Submit {selected.size} → {name(target)}</Button>
          <span className="text-[12.5px]" style={{ color: over > 0 ? 'var(--risk)' : 'var(--ink-soft)' }}>{over > 0 ? `${over} past today's capacity of ${room}` : `fits — ${room} piece${room === 1 ? '' : 's'} of room today`}</span>
          {over > 0 && <label className="text-[12.5px] flex items-center gap-1" style={{ color:'var(--risk)' }}>
            <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} /> send anyway</label>}
        </div>); })()}
      <Card className="mt-2"><table className="t">
        <thead><tr><th><input type="checkbox" checked={allVisibleSelected} onChange={e => selectVisible(e.target.checked)} /></th><th>Order</th><th>Customer · store</th><th>Fabric</th><th>Tag</th><th>Punched · FIFO</th><th>Ship by</th><th>Proposed factory</th><th>Why</th></tr></thead>
        <tbody>{shown.map(o => { const pf = proposedFor(o.id); const prop = proposals.find(p => p.orderIds.includes(o.id)); return (
          <tr key={o.id} className="row" onClick={() => onOpen(o.id)} style={{ background: selected.has(o.id) ? 'var(--accent-soft)' : undefined }}>
            <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} /></td>
            <td className="mono text-[12.5px]">{o.orderNo}</td>
            <td className="text-[12.5px]">{o.customer}<div style={{ color:'var(--ink-faint)' }}>{STORES.find(s => s.id === o.storeId)?.name}</div></td>
            <td className="text-[12.5px]">{o.styleName}{(o.revisions ?? []).length > 0 && <Pill tone="info">changed</Pill>}<div className="mono text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{o.consumptionM} m{o.bespoke ? ` · bespoke ${o.bespoke.code}` : ''}</div></td>
            <td onClick={e => e.stopPropagation()}>{mine ? <Select value={o.tag} onChange={v => setOrderTag(o.id, v as OrderTag)} options={ORDER_TAGS.map(t => ({ value:t, label:t }))} style={{ width: 110, padding:'2px 6px' }} /> : <Pill tone={TAG_TONE[o.tag]}>{o.tag}</Pill>}</td>
            <td className="text-[12.5px] mono">{fmtTime(o.punchedOn)}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)', fontFamily:'var(--body)' }}>{fmtRel(o.punchedOn)}</div></td>
            <td style={{ color: daysAgo(o.promisedOn) > -2 ? 'var(--risk)' : undefined }}>{fmtDate(o.promisedOn)}</td>
            <td className="text-[12.5px]">{pf ? <VendorLink id={pf} /> : <span style={{ color:'var(--risk)' }}>none</span>}</td>
            <td className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{prop?.why ?? 'no factory has headroom today'}</td>
          </tr>); })}</tbody>
      </table></Card>
      <div className="mt-2 text-[12px]" style={{ color:'var(--ink-faint)' }}>Tick rows (or pick "Select shown"), choose a factory, submit — that is one plan. Clicking a card's "N proposed" selects exactly the draft for that factory.</div>
      </>}
    </>}
    {q.frozen.length > 0 && <div className="mt-3">
      <button type="button" className="vlink text-[12.5px]" onClick={() => setShowFrozen(v => !v)}>{q.frozen.length} order{q.frozen.length === 1 ? '' : 's'} punched in the last {settings.ppFreezeHours} h held back — stores still change them · {showFrozen ? 'hide' : 'show'}</button>
      {showFrozen && exFrozen.strip && <span className="ml-3">{exFrozen.strip}</span>}
      {showFrozen && <Card className="mt-2"><table className="t"><thead><tr><th>Order</th><th>Customer · store</th><th>Fabric</th><th>Tag</th><th>Punched</th><th>Enters the plan at</th></tr></thead>
        <tbody>{exFrozen.rows.map(o => <tr key={o.id} className="row" onClick={() => onOpen(o.id)}><td className="mono text-[12.5px]">{o.orderNo}</td><td className="text-[12.5px]">{o.customer}<div style={{ color:'var(--ink-faint)' }}>{STORES.find(s => s.id === o.storeId)?.name}</div></td><td className="text-[12.5px]">{o.styleName}</td><td><Pill tone={TAG_TONE[o.tag]}>{o.tag}</Pill></td><td className="mono text-[12.5px]">{fmtTime(o.punchedOn)}</td><td className="mono text-[12.5px]" style={{ color:'var(--ink-faint)' }}>{fmtTime(new Date(new Date(o.punchedOn).getTime() + settings.ppFreezeHours * 36e5))}</td></tr>)}</tbody></table></Card>}
    </div>}
  </>;
}

/* ---------- Plans --------------------------------------------------------- */
function PlansTab({ mine, onOpen }: { mine: boolean; onOpen: (id: string) => void }) {
  const { db, scanOrders, closePlan } = useApp();
  const [showClosed, setShowClosed] = useState(true);   // closed plans in by default, so the worked examples include a finished one
  const plans = (db.plans ?? []).filter(p => showClosed || !p.closedOn).sort((a, b) => b.createdOn.localeCompare(a.createdOn));
  const name = (id: string) => db.vendors.find(v => v.id === id)?.name ?? id;
  /* a plan can be opened by link (?plan=<id>), e.g. from the outbound load */
  const [params, setParams] = useSearchParams();
  const openPlan = params.get('plan');
  const setOpenPlan = (id: string | null) => { const n = new URLSearchParams(params); id ? n.set('plan', id) : n.delete('plan'); setParams(n, { replace: true }); };
  const pl = (db.plans ?? []).find(p => p.id === openPlan) ?? null;
  const ordersOf = (ids: string[]) => ids.map(id => (db.customerOrders ?? []).find(o => o.id === id)).filter((o): o is CustomerOrder => !!o);
  /* an open plan and a closed one, when both are showing */
  const ex = useExamples(plans, p => (p.closedOn ? 'closed' : 'open'), { noun:'plans', done: p => !!p.closedOn });
  return <>
    <div className="flex justify-end items-center gap-3 mb-2">{ex.strip}<Button size="sm" variant="ghost" onClick={() => setShowClosed(s => !s)}>{showClosed ? 'Hide closed' : 'Show closed'}</Button></div>
    {plans.length === 0 ? <Card><Empty title="No plans." body="Submit one from the Allocate tab." /></Card> : <Card><table className="t">
      <thead><tr><th>Plan</th><th>Factory</th><th>Created</th><th className="num">Orders</th><th>Where the pieces are</th><th>Status</th></tr></thead>
      <tbody>{ex.rows.map(p => { const os = ordersOf(p.orderIds); const by: Record<string, number> = {}; os.forEach(o => (by[o.stage] = (by[o.stage] ?? 0) + 1)); return (
        <tr key={p.id} className="row" onClick={() => setOpenPlan(p.id)}>
          <td className="mono text-[12.5px]">{p.planNo}</td><td>{name(p.factoryId)}</td><td>{fmtDate(p.createdOn)}</td><td className="num">{os.length}</td>
          <td className="text-[11.5px]">{Object.entries(by).map(([st, n]) => <Pill key={st} tone={STAGE_TONE[st] ?? 'neutral'}>{stageLabel(st)} {n}</Pill>)}</td>
          <td><Pill tone={p.closedOn ? 'neutral' : 'good'}>{p.closedOn ? `closed ${fmtDate(p.closedOn)}` : 'open'}</Pill></td>
        </tr>); })}</tbody>
    </table></Card>}
    <Drawer open={!!pl} onClose={() => setOpenPlan(null)} title={pl ? `Plan ${pl.planNo}` : ''} subtitle={pl && <><Pill tone={pl.closedOn ? 'neutral' : 'good'}>{pl.closedOn ? `closed ${fmtDate(pl.closedOn)}` : 'open'}</Pill><span>{name(pl.factoryId)} · created {fmtDate(pl.createdOn)}{pl.forcedOver ? ` · sent ${pl.forcedOver} over capacity by ${pl.forcedBy ?? 'production'}` : ''}</span></>}>
      {pl && (() => {
        const os = ordersOf(pl.orderIds); const at = (st: string) => os.filter(o => o.stage === st); const allBack = os.every(o => ['rts', 'dispatched', 'delivered'].includes(o.stage));
        const STEPS: [string, string][] = [['planned', 'Planned · to cut'], ['in-transit', 'In production · on its way'], ['in-factory', 'In factory'], ['out-factory', 'Out factory · ready'], ['rts', 'RTS · back at unit'], ['dispatched', 'Dispatched']];
        const metres = Math.round(os.reduce((x, o) => x + (o.consumptionM ?? 0), 0) * 10) / 10;
        const due = os.map(o => o.promisedOn).sort()[0];
        const cut = prepQueue(db).cutList(os);
        const fact = (k: string, v: React.ReactNode) => <div><div className="label">{k}</div><div className="text-[15px] font-medium">{v}</div></div>;
        return <>
        <Card className="px-4 py-3"><div className="grid gap-4" style={{ gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))' }}>
          {fact('Factory', name(pl.factoryId))}{fact('Pieces', os.length)}{fact('Cloth', `${metres} m`)}{fact('Fabrics', cut.length)}{fact('First ship-by', due ? fmtDate(due) : '—')}{fact('Urgent', os.filter(o => o.tag === 'urgent').length)}
        </div></Card>
        {/* where the plan's pieces are, as one strip left to right */}
        <Card className="px-4 py-3">
          <div className="label">Where the pieces are</div>
          <div className="flex gap-1.5 flex-wrap items-stretch pt-1">{STEPS.map(([st, label], i) => { const n = at(st).length; return <div key={st} className="flex items-center gap-1.5">
            <div className="px-3 py-2 rounded-[6px] text-center" style={{ minWidth: 92, background: n ? (STAGE_TONE[st] === 'good' ? 'var(--good-soft)' : 'var(--info-soft)') : 'var(--surface-2)', border: `1px solid ${n ? (STAGE_TONE[st] === 'good' ? 'var(--good-line)' : 'var(--info-line)') : 'var(--line-soft)'}`, opacity: n ? 1 : .55 }}>
              <div className="mono text-[18px] font-semibold" style={{ lineHeight: 1.1 }}>{n}</div><div className="text-[10.5px]" style={{ color:'var(--ink-soft)' }}>{label}</div></div>
            {i < STEPS.length - 1 && <span style={{ color:'var(--ink-faint)' }}>→</span>}
          </div>; })}</div>
          {at('delivered').length > 0 && <div className="text-[11.5px] pt-2" style={{ color:'var(--ink-faint)' }}>{at('delivered').length} delivered</div>}
        </Card>
        {mine && !pl.closedOn && <Card className="px-4 py-3">
          <div className="label">Move the whole plan · one scan each</div>
          <div className="flex gap-2 flex-wrap pt-1">
            {at('planned').length > 0 && <Button size="sm" variant="primary" onClick={() => scanOrders(at('planned').map(o => o.id), 'in-transit')}>Cut &amp; scan out · {at('planned').length} to {name(pl.factoryId)}</Button>}
            {at('in-transit').length > 0 && <Button size="sm" onClick={() => scanOrders(at('in-transit').map(o => o.id), 'in-factory')}>Received at factory · {at('in-transit').length}</Button>}
            {at('out-factory').length > 0 && <Button size="sm" onClick={() => scanOrders(at('out-factory').map(o => o.id), 'rts')}>Back at unit (RTS) · {at('out-factory').length}</Button>}
            {at('rts').length > 0 && <Button size="sm" onClick={() => scanOrders(at('rts').map(o => o.id), 'dispatched')}>Dispatch to stores · {at('rts').length}</Button>}
            {allBack && <Button size="sm" variant="ghost" onClick={() => closePlan(pl.id)}>Close plan</Button>}
            {!at('planned').length && !at('in-transit').length && !at('out-factory').length && !at('rts').length && !allBack && <span className="text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing to scan here — the pieces are on the factory floor; the factory marks them ready.</span>}
          </div>
          <div className="text-[11.5px] pt-2" style={{ color:'var(--ink-faint)' }}>"Cut &amp; scan out" takes the order sheets' metres off the shelf. The factory's own scans (in, ready) happen on its portal.</div>
        </Card>}
        <Section title={`Cut list · ${cut.length} fabric${cut.length === 1 ? '' : 's'}`} defaultOpen>
          <table className="t compact"><thead><tr><th>Fabric</th><th className="num">Pieces</th><th className="num">Metres</th></tr></thead>
            <tbody>{cut.map(c => <tr key={c.fabricId}><td>{db.fabrics.find(f => f.id === c.fabricId)?.name ?? c.name}<div className="mono text-[11px]" style={{ color:'var(--ink-faint)' }}>{db.fabrics.find(f => f.id === c.fabricId)?.code}</div></td><td className="num">{c.pcs}</td><td className="num">{c.metres} m</td></tr>)}</tbody></table>
        </Section>
        <Section title={`Pieces · ${os.length}`} defaultOpen>
          <table className="t compact"><thead><tr><th>Order</th><th>Customer</th><th>Fabric</th><th>Ship by</th><th>Stage</th><th>Sent to factory</th><th>At factory</th><th>Ready</th><th>Back at unit</th></tr></thead>
            <tbody>{os.map(o => { const when = (st: string) => { const sc = o.scans.find(x => x.stage === st); return sc ? <span title={`${fmtDate(sc.at)} · ${sc.by}`}>{fmtDate(sc.at)}</span> : <span style={{ color:'var(--ink-faint)' }}>—</span>; }; return <tr key={o.id} className="row" onClick={() => onOpen(o.id)}>
              <td className="mono text-[12px]">{o.orderNo}{o.tag === 'urgent' && <> <Pill tone="risk">urgent</Pill></>}</td><td>{o.customer}<div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{STORES.find(st => st.id === o.storeId)?.name}</div></td>
              <td className="text-[12.5px]">{o.styleName}<div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{o.consumptionM} m</div></td><td>{fmtDate(o.promisedOn)}</td>
              <td><Pill tone={STAGE_TONE[o.stage] ?? 'neutral'}>{stageLabel(o.stage)}</Pill>{needsReprint(o) && <> <Pill tone="risk">sheet {sheetVersion(o)}</Pill></>}</td>
              <td className="text-[12px]">{when('in-transit')}</td><td className="text-[12px]">{when('in-factory')}</td><td className="text-[12px]">{when('out-factory')}</td><td className="text-[12px]">{when('rts')}</td>
            </tr>; })}</tbody></table>
          <div className="text-[11.5px] pt-2" style={{ color:'var(--ink-faint)' }}>Dates are the scans. Click a piece for its order sheet and full timeline.</div>
        </Section>
      </>; })()}
    </Drawer>
  </>;
}

/* ---------- Factory floor — the merchandiser's screen ------------------------ */
function FloorTab({ mine, factoryId, onFactory, onOpen }: { mine: boolean; factoryId: string | undefined; onFactory: (id: string) => void; onOpen: (id: string) => void }) {
  const { reviseShipBy } = useApp();
  const [bulk, setBulk] = useState(false); const [bulkDays, setBulkDays] = useState('2'); const [bulkWhy, setBulkWhy] = useState('');
  const { db, scanOrders } = useApp();
  const factories = db.vendors.filter(v => v.mtm && v.kind !== 'Hemming unit');   // MTM is made from scratch — hemming is an RTW step, never an MTM order
  const v = factories.find(x => x.id === factoryId) ?? factories[0];
  const [xf, setXf] = useState<string | null>(null);
  const [stageF, setStageF] = useState('all');
  const [floorSearch, setFloorSearch] = useState('');
  const l = v ? factoryLoadOf(db, v.id) : null;
  const inAt = (o: CustomerOrder) => o.scans.find(sc => sc.stage === 'in-factory')?.at;
  const all = l ? [...l.inTransit, ...l.wip, ...l.ready].sort((a, b) => a.promisedOn.localeCompare(b.promisedOn)) : [];
  const stageCount = (st: string) => all.filter(o => o.stage === st).length;
  const filtered = all
    .filter(o => stageF === 'all' ? true : stageF === 'urgent' ? o.tag === 'urgent' : stageF === 'late' ? daysAgo(o.promisedOn) > 0 : stageF === 'amended' ? needsReprint(o) : o.stage === stageF)
    .sort((a, b) => (a.tag === 'urgent' ? 0 : 1) - (b.tag === 'urgent' ? 0 : 1))   // urgent pieces are worked first, so they sit on top
    .filter(o => { const t = floorSearch.trim().toLowerCase(); return !t || o.orderNo.toLowerCase().includes(t) || o.customer.toLowerCase().includes(t) || o.styleName.toLowerCase().includes(t); });
  /* one piece per stage on the floor, a late one and an on-time one of each */
  const ex = useExamples(filtered, o => `${o.stage}·${daysAgo(o.promisedOn) > 0}`, { noun:'pieces', done: o => o.stage === 'out-factory' });
  const rows = ex.rows;
  if (!v) return <Card><Empty title="No MTM factories." body="" /></Card>;
  const xfOrder = (db.customerOrders ?? []).find(o => o.id === xf) ?? null;
  return <>
    <div className="flex gap-3 items-end flex-wrap mb-3">
      <div style={{ width: 220 }}><Field label="Factory"><Select value={v.id} onChange={onFactory} options={factories.map(f => ({ value:f.id, label:f.name }))} /></Field></div>
      <div className="pb-[1px]"><Seg value={stageF} onChange={setStageF} options={[
        { id:'all', label:'Everything', count: all.length },
        { id:'urgent', label:'Urgent', count: all.filter(o => o.tag === 'urgent').length, hint:'urgent orders (7–8 days, express): work these first' },
        { id:'in-transit', label:'On its way', count: stageCount('in-transit') },
        { id:'in-factory', label:'On the floor', count: stageCount('in-factory') },
        { id:'out-factory', label:'Ready to come back', count: stageCount('out-factory') },
        { id:'late', label:'Past ship-by', count: all.filter(o => daysAgo(o.promisedOn) > 0).length, hint:'promised date already gone' },
        { id:'amended', label:'Amended', count: all.filter(needsReprint).length, hint:'the store changed the sheet after it left — the floor needs the new one' },
      ]} /></div>
      <div style={{ width: 190 }}><Field label="Search"><Input value={floorSearch} onChange={e => setFloorSearch(e.target.value)} placeholder="order, customer, fabric" /></Field></div>
      <span className="ml-auto pb-2">{ex.strip}</span>
      {mine && <div className="pb-2">{bulk
        ? <div className="flex gap-2 items-end flex-wrap">
            <Field label="Push every open piece here by · days"><Input type="number" min={1} value={bulkDays} onChange={e => setBulkDays(e.target.value)} style={{ width: 80 }} /></Field>
            <div style={{ minWidth: 240 }}><Field label="Why" hint="the stores read this to their customers"><Input value={bulkWhy} onChange={e => setBulkWhy(e.target.value)} placeholder={`${v.name} shut for two days`} /></Field></div>
            <Button size="sm" variant="primary" disabled={!bulkWhy.trim() || !(Number(bulkDays) > 0)} onClick={() => { const open = all.filter(o => MTM_OPEN.has(o.stage)); const d = Number(bulkDays);
              /* each piece keeps its own date, pushed by the same number of days */
              reviseShipBy(open.map(o => ({ id: o.id, to: iso(addDays(new Date(o.promisedOn), d)) })), bulkWhy.trim()); setBulk(false); setBulkWhy(''); }}>Move {all.filter(o => MTM_OPEN.has(o.stage)).length} ship-by dates</Button>
            <Button size="sm" variant="ghost" onClick={() => setBulk(false)}>Cancel</Button>
          </div>
        : <button type="button" className="cta" onClick={() => setBulk(true)}>Factory delayed · move every ship-by →</button>}</div>}
    </div>

    <Card><table className="t">
      <thead><tr><th>Order</th><th>Customer</th><th>Fabric · m</th><th>Tag</th><th>Ship by</th><th>Stage</th><th>Reached factory</th><th>Days in factory</th><th></th></tr></thead>
      <tbody>{rows.length === 0 ? <tr><td colSpan={9}><Empty title={all.length ? 'Nothing matches that filter.' : 'Nothing on this floor.'} body={all.length ? 'Loosen the stage filter or clear the search.' : ''} /></td></tr> : rows.map(o => { const d = inAt(o) ? daysAgo(inAt(o)!) : null; const late = daysAgo(o.promisedOn) > 0; return (
        <tr key={o.id} className="row" onClick={() => onOpen(o.id)}>
          <td className="mono text-[12.5px]">{o.orderNo}</td><td className="text-[12.5px]">{o.customer}</td><td className="text-[12.5px]">{o.styleName} <span style={{ color:'var(--ink-faint)' }}>· {o.consumptionM} m</span></td>
          <td><Pill tone={TAG_TONE[o.tag]}>{o.tag}</Pill></td>
          <td style={{ color: late ? 'var(--risk)' : undefined }}>{fmtDate(o.promisedOn)}{late && <span className="text-[11px]"> · {daysAgo(o.promisedOn)}d late</span>}{(o.promiseRevisions?.length ?? 0) > 0 && <span className="pill warn ml-1">moved</span>}</td>
          <td><Pill tone={STAGE_TONE[o.stage] ?? 'neutral'}>{stageLabel(o.stage)}</Pill>{needsReprint(o) && <Pill tone="risk">amended · {sheetVersion(o)}</Pill>}</td>
          <td className="text-[12px]">{inAt(o) ? fmtDate(inAt(o)!) : <span style={{ color:'var(--ink-faint)' }}>{o.scans.find(x => x.stage === 'in-transit') ? `sent ${fmtDate(o.scans.find(x => x.stage === 'in-transit')!.at)}` : '—'}</span>}</td>
          <td className="num" style={{ color: d != null && d > AGING_DAYS ? 'var(--risk)' : undefined }}>{d != null ? `${d}d` : '—'}</td>
          <td onClick={e => e.stopPropagation()} className="flex gap-1">
            {mine && o.stage === 'in-transit' && <Button size="sm" onClick={() => scanOrders([o.id], 'in-factory')}>Received</Button>}
            {mine && o.stage === 'in-factory' && <><Button size="sm" variant="primary" onClick={() => scanOrders([o.id], 'out-factory')}>Ready</Button><Button size="sm" variant="ghost" onClick={() => setXf(o.id)}>+ fabric</Button></>}
          </td>
        </tr>); })}</tbody>
    </table></Card>
    <div className="mt-3"><Note>"Ready" is the merchandiser's out-factory scan; pieces past {AGING_DAYS} days are the aging report.</Note></div>

    <Drawer open={!!xfOrder} onClose={() => setXf(null)} title={xfOrder ? `Extra fabric · ${xfOrder.orderNo}` : ''} subtitle={xfOrder && <span>{xfOrder.styleName} · order sheet {xfOrder.consumptionM} m</span>}>
      {xfOrder && <ExtraFabricForm o={xfOrder} onDone={() => setXf(null)} />}
    </Drawer>
  </>;
}

function ExtraFabricForm({ o, onDone }: { o: CustomerOrder; onDone: () => void }) {
  const { raiseExtraFabric } = useApp();
  const [panel, setPanel] = useState<ExtraFabricRequest['panel']>('Single front');
  const [reason, setReason] = useState<ExtraFabricRequest['reason']>('Damaged / yarn pull — factory error');
  const [metres, setMetres] = useState(String(PANEL_METRES['Single front']));
  const [note, setNote] = useState('');
  return (
    <Section title="Ask for extra cloth" right={<Pill tone="accent">Factory merchandiser</Pill>}>
      <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <Field label="Panel"><Select value={panel} onChange={v => { setPanel(v as ExtraFabricRequest['panel']); setMetres(String(PANEL_METRES[v])); }} options={EXTRA_FABRIC_PANELS.map(x => ({ value:x, label:x }))} /></Field>
        <Field label="Metres" hint="a single panel is 80 cm, a full-width panel 90 cm"><Input type="number" step="0.1" value={metres} onChange={e => setMetres(e.target.value)} /></Field>
        <div style={{ gridColumn:'1 / -1' }}><Field label="Reason — whose error"><Select value={reason} onChange={v => setReason(v as ExtraFabricRequest['reason'])} options={EXTRA_FABRIC_REASONS.map(x => ({ value:x, label:x }))} /></Field></div>
        <div style={{ gridColumn:'1 / -1' }}><Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="optional" /></Field></div>
      </div>
      <Button variant="primary" size="sm" onClick={() => { raiseExtraFabric({ orderId: o.id, metres: Number(metres), reason, panel, note: note.trim() }); onDone(); }}>Ask the production unit</Button>
      <div className="pt-2"><Note>Factory errors go on the vendor's record; PP errors go back to the consumption formula.</Note></div>
    </Section>
  );
}

/* ---------- Extra fabric queue --------------------------------------------- */
export function FabricTab({ mine, wh, onOpen }: { mine: boolean; wh: boolean; onOpen: (id: string) => void }) {
  const { db, decideExtraFabric, routeExtraFabricPo } = useApp();
  const order = (id: string) => (db.customerOrders ?? []).find(o => o.id === id);
  const fabric = (id: string) => db.fabrics.find(f => f.id === id);
  /* three kinds of ask: a normal order, a bespoke order (no inventory), the alteration and hemming unit */
  const kindOf = (r: ExtraFabricRequest) => r.source === 'alteration' ? 'alteration' : fabric(r.fabricId)?.bucket === 'BESPOKE' || order(r.orderId)?.bespoke ? 'bespoke' : 'normal';
  const [kind, setKind] = useState<'all' | 'normal' | 'bespoke' | 'alteration'>('all');
  const allRows = db.extraFabric ?? [];
  /* alteration asks split again: a normal fabric is approved here from the shelf; a bespoke one goes to Shravani */
  const [altKind, setAltKind] = useState<'all' | 'normal' | 'bespoke'>('all');
  const isBespoke = (r: ExtraFabricRequest) => fabric(r.fabricId)?.bucket === 'BESPOKE' || !!order(r.orderId)?.bespoke;
  const alts = allRows.filter(r => kindOf(r) === 'alteration');
  const rows = allRows.filter(r => kind === 'all' || kindOf(r) === kind).filter(r => kind !== 'alteration' || altKind === 'all' || (altKind === 'bespoke') === isBespoke(r)).sort((a, b) => (a.status === 'requested' ? 0 : 1) - (b.status === 'requested' ? 0 : 1) || b.raisedOn.localeCompare(a.raisedOn));
  const kindN = (k: string) => allRows.filter(r => kindOf(r) === k).length;
  const TONE: Record<string, Tone> = { requested:'warn', 'po-needed':'info', approved:'good', sent:'neutral', declined:'risk' };
  const STATUS: Record<string, string> = { requested:'to approve', 'po-needed':'with Shravani · to approve the PO', approved:'approved', sent:'sent', declined:'declined' };
  const byReason: Record<string, number> = {}; rows.forEach(r => (byReason[r.reason] = (byReason[r.reason] ?? 0) + 1));
  const factoryErr = rows.filter(r => r.reason.includes('factory error')).length;
  /* one ask per status — requested, approved, sent, declined */
  const ex = useExamples(rows, r => r.status, { noun:'requests', done: r => r.status === 'sent' });
  return <>
    <div className="flex items-center gap-2 mb-2 flex-wrap">
      <Seg value={kind} onChange={v => setKind(v as typeof kind)} options={[
        { id:'all', label:'All', count: allRows.length },
        { id:'normal', label:'Normal orders', count: kindN('normal'), hint:'cloth from the shelf; approval deducts it' },
        { id:'bespoke', label:'Bespoke orders', count: kindN('bespoke'), hint:'mill PO via Shravani; no inventory kept' },
        { id:'alteration', label:'Alteration / hemming', count: kindN('alteration'), hint:'asks from the alteration and hemming unit; deducted from physical stock' },
      ]} />
      {kind === 'alteration' && <Seg value={altKind} onChange={v => setAltKind(v as typeof altKind)} options={[
        { id:'all', label:'All alteration', count: alts.length },
        { id:'normal', label:'Normal · approve here', count: alts.filter(r => !isBespoke(r)).length, hint:'cloth from the shelf: Swati approves, physical stock is deducted' },
        { id:'bespoke', label:'Bespoke · to Shravani', count: alts.filter(isBespoke).length, hint:'bespoke cloth is not on the shelf: one click to Shravani, she approves and the PO is generated' },
      ]} />}
      {ex.strip && <span className="ml-auto">{ex.strip}</span>}
    </div>
    {rows.length === 0 ? <Card><Empty title={allRows.length ? 'No asks of this kind.' : 'No extra-fabric asks.'} body={allRows.length ? 'Pick another filter.' : 'Factory merchandisers raise them from the Factory floor tab.'} /></Card> : <Card><table className="t">
      <thead><tr><th>Raised</th><th>Order</th><th>Fabric</th><th>Factory</th><th>Panel</th><th className="num">Metres</th><th>Reason</th><th>Status</th><th></th></tr></thead>
      <tbody>{ex.rows.map(r => { const o = order(r.orderId); const f = fabric(r.fabricId); return (
        <tr key={r.id} className="row" onClick={() => o && onOpen(o.id)}>
          <td className="text-[12.5px]">{fmtRel(r.raisedOn)}<div style={{ color:'var(--ink-faint)' }}>{r.raisedBy}</div></td>
          <td className="mono text-[12.5px]">{o?.orderNo ?? r.orderId}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{(db.plans ?? []).find(p => p.id === (r.planId ?? o?.planId))?.planNo ?? 'no bundle'}</div></td>
          <td className="text-[12.5px]" style={{ whiteSpace:'normal' }}>{f?.name}<div className="mono text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{f?.code}</div>
            {/* approving moves inventory, so the shelf is on the row you approve from */}
            {f && (f.bucket === 'BESPOKE' ? <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>bespoke · no inventory kept, nothing deducted</div>
              : <div className="text-[11px]" style={{ color: (f.stockMetres - f.reservedMetres) < r.metres ? 'var(--risk)' : 'var(--ink-faint)' }}>
              shelf {Math.round((f.stockMetres - f.reservedMetres) * 10) / 10} m{r.status === 'requested' || (r.status === 'po-needed' && !r.po?.raisedOn) ? ` → ${Math.round((f.stockMetres - f.reservedMetres - r.metres) * 10) / 10} m if approved` : ''}</div>)}</td>
          <td className="text-[12.5px]"><VendorLink id={r.factoryId} /></td>
          <td className="text-[12.5px]">{r.panel}</td><td className="num">{r.metres} m</td>
          <td className="text-[12px]"><span style={{ color: r.reason.includes('factory') ? 'var(--risk)' : 'var(--warn)' }}>{r.reason}</span>{r.note && <div style={{ color:'var(--ink-faint)' }}>{r.note}</div>}</td>
          <td><Pill tone={TONE[r.status]}>{r.status === 'po-needed' && r.po?.raisedOn ? 'PO raised · cloth awaited' : STATUS[r.status] ?? r.status}</Pill>{f?.bucket === 'BESPOKE' && <div className="pt-0.5"><Pill tone="accent">bespoke</Pill></div>}{r.source === 'alteration' && <div className="pt-0.5"><Pill tone="info">alteration</Pill></div>}{r.po && <div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{r.po.poNo ? `${r.po.poNo}${r.po.clothInOn ? ' · cloth in' : ' · raised'}` : 'PO not raised yet'}</div>}</td>
          <td onClick={e => e.stopPropagation()} className="flex gap-1">
            {mine && r.status === 'requested' && (() => { const short = !!f && (f.bucket === 'BESPOKE' || (r.source !== 'alteration' && f.stockMetres - f.reservedMetres < r.metres)); /* alteration: normal is approved here, bespoke goes to Shravani */ return <>
              {short && !r.po ? <Button size="sm" variant="primary" onClick={() => routeExtraFabricPo(r.id, 'hand')}>Send to Shravani for a PO</Button>
                : <Button size="sm" variant="primary" onClick={() => decideExtraFabric(r.id, 'approved')}>Approve</Button>}
              <Button size="sm" variant="ghost" onClick={() => decideExtraFabric(r.id, 'declined')}>Decline</Button></>; })()}
            {(mine || wh) && r.status === 'po-needed' && !r.po?.raisedOn && <Button size="sm" onClick={() => routeExtraFabricPo(r.id, 'raised')}>{f && f.bucket !== 'BESPOKE' && f.stockMetres - f.reservedMetres >= r.metres ? 'Shravani: approve · issue from stock' : 'Shravani: approve & raise PO'}</Button>}
            {(mine || wh) && r.status === 'po-needed' && r.po?.raisedOn && <Button size="sm" variant="primary" onClick={() => routeExtraFabricPo(r.id, 'cloth-in')}>Cloth in · back to approval</Button>}
            {wh && r.status === 'approved' && <Button size="sm" variant="primary" onClick={() => decideExtraFabric(r.id, 'sent')}>Picked & sent</Button>}
          </td>
        </tr>); })}</tbody>
    </table></Card>}
    <div className="mt-3"><Note>Approve is the inventory event: the metres leave physical stock the moment it is approved. Alteration and hemming asks are approved here like any other and deducted from physical stock. Only bespoke cloth, or a fabric with too little on the shelf, goes to Shravani in one click: she approves and the PO is generated; when the cloth is in, it comes back here to approve. Bespoke is never BSC's inventory: nothing is booked in or deducted.</Note></div>
  </>;
}

/* ---------- Daily output & aging — the two sheets, derived ------------------- */
export function OutputTab({ mine }: { mine: boolean }) {
  const { db, updateVendor } = useApp();
  const rows = shippingTable(db);
  const ag = agingOf(db);
  const totalOut = rows.reduce((a, r) => a + r.mtmOut, 0);
  const totalWip = rows.reduce((a, r) => a + r.wip.length, 0);
  return <>
    <div>
      <Card><div className="pad" style={{ padding:'12px 14px 4px' }}><div className="label">Shipping detail · {fmtDate(iso(TODAY))} — the WhatsApp table, live</div></div>
        <table className="t compact">
          <thead><tr><th>Factory</th><th className="num">Tailors</th><th className="num">Capacity / day</th><th className="num">Avg / day</th><th className="num">Out today</th><th className="num">Factory keyed in</th><th className="num">In factory</th><th className="num">Aging</th><th className="num">In transit</th><th>Load</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.v.id}>
            <td><VendorLink id={r.v.id} className="font-medium" /></td>
            <td className="num">{r.v.tailors ?? '—'}</td>
            {/* the cap the plan is held to — Swati sets it, allocation obeys it */}
            <td className="num">{mine ? <Input type="number" min={0} step={10} value={r.v.dailyTarget ?? ''} placeholder={String(r.avgOut)}
              onChange={e => updateVendor(r.v.id, { dailyTarget: Math.max(0, Number(e.target.value) || 0) })} className="input mono" style={{ width: 74, padding:'3px 6px', textAlign:'right' }} />
              : (r.v.dailyTarget ?? <span style={{ color:'var(--ink-faint)' }}>not set</span>)}</td>
            <td className="num">{r.avgOut}</td>
            <td className="num" style={{ color: r.mtmOut < r.avgOut * .6 ? 'var(--risk)' : undefined }}>{r.mtmOut}</td>
            {(() => { const k = (db.factoryOutputs ?? []).find(f => f.factoryId === r.v.id && f.date === iso(TODAY).slice(0, 10));
              return <td className="num" style={{ color: k && k.pieces !== r.mtmOut ? 'var(--warn)' : 'var(--ink-faint)' }} title={k?.note || undefined}>{k ? k.pieces : '—'}</td>; })()}
            <td className="num">{r.wip.length}</td><td className="num" style={{ color: r.aging.length ? 'var(--risk)' : undefined }}>{r.aging.length || '—'}</td><td className="num">{r.inTransit.length}</td>
            <td><Pill tone={r.load > 2.5 ? 'risk' : r.load > 1.5 ? 'warn' : 'good'}>{r.load.toFixed(1)} days</Pill></td>
          </tr>)}
          <tr><td className="font-medium">Total</td><td /><td className="num">{rows.reduce((a, r) => a + (r.v.dailyTarget ?? 0), 0)}</td><td className="num">{rows.reduce((a, r) => a + r.avgOut, 0)}</td><td className="num font-medium">{totalOut}</td><td className="num" style={{ color:'var(--ink-faint)' }}>{(db.factoryOutputs ?? []).filter(f => f.date === iso(TODAY).slice(0, 10)).reduce((a, f) => a + f.pieces, 0) || '—'}</td><td className="num font-medium">{totalWip}</td><td className="num">{rows.reduce((a, r) => a + r.aging.length, 0)}</td><td className="num">{rows.reduce((a, r) => a + r.inTransit.length, 0)}</td><td /></tr></tbody>
        </table>
        <div className="px-4 py-2.5 text-[12px]" style={{ color:'var(--ink-soft)', borderTop:'1px solid var(--line-soft)' }}>
          <b>Out today</b> is what the scans say left the factory. <b>Factory keyed in</b> is the number that factory itself reported for today — the count they send on WhatsApp, typed in on their own screen. They should match; when they do not, the cell turns amber and the factory's note is on hover. An em dash means that factory has not reported yet today.
        </div></Card>
    </div>
  </>;
}

/* ---------- one order sheet ------------------------------------------------- */
export function OrderSheet({ o, mine }: { o: CustomerOrder; mine: boolean }) {
  const { db, scanOrders, setOrderTag, reviseShipBy } = useApp();
  const [moveTo, setMoveTo] = useState(''); const [moveWhy, setMoveWhy] = useState(''); const [moving, setMoving] = useState(false);
  const revs = o.promiseRevisions ?? [];
  const f = db.fabrics.find(x => x.id === o.fabricId);
  const store = STORES.find(s => s.id === o.storeId);
  const xfs = (db.extraFabric ?? []).filter(r => r.orderId === o.id);
  const next: Record<string, { stage: CustomerOrder['stage']; label: string } | undefined> = { planned:{ stage:'in-transit', label:'Scan out of production unit' }, 'in-transit':{ stage:'in-factory', label:'Scan in at factory' }, 'in-factory':{ stage:'out-factory', label:'Mark ready' }, 'out-factory':{ stage:'rts', label:'RTS received' }, rts:{ stage:'dispatched', label:'Dispatch' }, dispatched:{ stage:'delivered', label:'Delivered' } };
  const n = next[o.stage];
  return <>
    {o.preConfirmed && <Section title="Pre-confirmed" collapsible={false} right={<Pill tone="warn">{o.preConfirmed.reason}</Pill>}><PreConfirmBox o={o} /></Section>}
    {(o.stage === 'planned' || o.prep) && <Section title="Pre-production" defaultOpen={o.stage === 'planned'} right={<Pill tone={prepOf(o).ready || o.stage !== 'planned' ? 'good' : 'info'}>{o.stage !== 'planned' ? 'done' : prepOf(o).ready ? 'ready to send' : `at ${prepOf(o).next?.label}`}</Pill>}><PrepOnOrder o={o} /></Section>}
    <Section title="Job card" right={<Pill tone="neutral">the summary the factory bundle carries</Pill>}>
      <KV k="Order no." v={<span className="mono">{o.orderNo}</span>} />
      <KV k="Customer" v={o.customer} note={store?.name} />
      <KV k="Fabric" v={o.styleName} note={f ? `${f.code} · ${f.bucket.toLowerCase().replace('_', '-')} · ${f.family}` : undefined} />
      <KV k="Fit" v={o.fit ?? '—'} />
      <KV k="Consumption on sheet" v={o.consumptionM != null ? `${o.consumptionM} m` : '—'} note="base + 0.10 buffer, Enigma's formula — deducted at the out-of-unit scan" />
      <KV k="Punched" v={fmtDate(o.punchedOn)} note={fmtRel(o.punchedOn)} />
      <KV k="Ship by" v={<span style={{ color: daysAgo(o.promisedOn) > 0 && MTM_OPEN.has(o.stage) ? 'var(--risk)' : undefined }}>{fmtDate(o.promisedOn)}{revs.length > 0 && <span className="pill warn ml-1">moved</span>}</span>} note={revs.length ? `was ${fmtDate(revs[0].from)} · moved ${fmtDate(revs[revs.length - 1].at)} by ${revs[revs.length - 1].by} — ${revs[revs.length - 1].reason}` : `punch + ${o.tag === 'urgent' ? 2 : PLAN_HORIZON_DAYS} days, set by Enigma`} />
      {mine && MTM_OPEN.has(o.stage) && (moving
        ? <div className="flex gap-2 items-end flex-wrap py-1">
            <Field label="New ship-by"><Input type="date" value={moveTo} onChange={e => setMoveTo(e.target.value)} style={{ width: 150 }} /></Field>
            <div className="flex-1" style={{ minWidth: 220 }}><Field label="Why" hint="the store reads this to the customer"><Input value={moveWhy} onChange={e => setMoveWhy(e.target.value)} placeholder="factory shut two days for Diwali" /></Field></div>
            <Button size="sm" variant="primary" disabled={!moveTo || !moveWhy.trim()} onClick={() => { const d = fromDateInput(moveTo); if (d) reviseShipBy([{ id: o.id, to: d }], moveWhy.trim()); setMoving(false); setMoveTo(''); setMoveWhy(''); }}>Move ship-by</Button>
            <Button size="sm" variant="ghost" onClick={() => setMoving(false)}>Cancel</Button>
          </div>
        : <div className="py-1"><button type="button" className="cta" onClick={() => { setMoving(true); setMoveTo(dateInput(iso(addDays(new Date(o.promisedOn), 2)))); }}>Factory delayed · move ship-by →</button></div>)}
      <KV k="Tag" v={mine && (o.stage === 'punched' || o.stage === 'pp') ? <Select value={o.tag} onChange={v => setOrderTag(o.id, v as OrderTag)} options={ORDER_TAGS.map(t => ({ value:t, label:t }))} style={{ width: 140 }} /> : <Pill tone={TAG_TONE[o.tag]}>{o.tag}</Pill>} />
      {o.factoryId && <KV k="Factory · plan" v={<VendorLink id={o.factoryId} />} note={o.planId ? (db.plans ?? []).find(p => p.id === o.planId)?.planNo ?? o.planId : undefined} />}
      {mine && o.stage === 'planned' && <div className="pt-3"><PullBackButton o={o} /> <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>nothing is cut yet — pulling it back frees the factory's slot and lets the store edit</span></div>}
    </Section>
    <SheetChangePanel o={o} who="unit" />
    <Section title="Stages" right={<Pill tone={STAGE_TONE[o.stage] ?? 'neutral'}>{stageLabel(o.stage)}</Pill>}>
      {MTM_STAGES.map(s => { const sc = o.scans.find(x => x.stage === s.id); const isNow = o.stage === s.id; const done = !!sc || (s.id === 'punched') || (s.id === 'pp' && o.stage !== 'punched'); return (
        <div key={s.id} className="kv"><span className="k flex items-center gap-2"><span className="dot" style={{ background: done ? 'var(--good)' : isNow ? 'var(--warn)' : 'var(--line)' }} />{s.label}<span className="text-[11px]">· {s.who}</span></span>
          <span className="v" style={{ color: sc ? undefined : 'var(--ink-faint)' }}>{sc ? `${fmtDate(sc.at)} · ${sc.by}` : s.id === 'punched' ? fmtDate(o.punchedOn) : s.scan ?? '—'}</span></div>); })}
      {mine && n && <div className="pt-3"><Button size="sm" variant="primary" onClick={() => scanOrders([o.id], n.stage)}>{n.label} →</Button></div>}
    </Section>
    {xfs.length > 0 && <Section title="Extra fabric on this order">{xfs.map(r => <KV key={r.id} k={`${r.panel} · ${r.metres} m`} v={<Pill tone={r.status === 'approved' ? 'good' : r.status === 'requested' ? 'warn' : 'neutral'}>{r.status}</Pill>} note={`${r.reason} · ${fmtRel(r.raisedOn)}`} />)}</Section>}
    <Files kind="customerOrder" subjectId={o.id} labels={FILE_LABELS.customerOrder} editable />
    <ThreadPanel kind="order" subjectId={o.id} steps={['General', 'Change from store', 'Fabric', 'Alteration']} />
  </>;
}

/* ---------- Warehouse · cut & dispatch ---------------------------------------- */
export function PrepareTab({ mine, onOpen }: { mine: boolean; onOpen: (id: string) => void }) {
  const { db, scanOrders } = useApp();
  const pq = prepQueue(db);
  const name = (id: string | null) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const planNo = (id: string) => (db.plans ?? []).find(p => p.id === id)?.planNo ?? id;
  if (pq.orders.length === 0) return <Card><Empty title="Nothing to cut." body="Every planned order sheet has been dispatched. New plans from planning land here." /></Card>;
  return <>
    {[...pq.byPlan.entries()].map(([pid, os]) => { const cut = pq.cutList(os); const f = os[0]?.factoryId ?? null; return (
      <Card key={pid} className="mb-3">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5" style={{ borderBottom:'1px solid var(--line-soft)' }}>
          <div><b>Plan {planNo(pid)}</b> <span style={{ color:'var(--ink-faint)' }}>→ <VendorLink id={f} /> · {os.length} order sheets · {Math.round(os.reduce((a, o) => a + (o.consumptionM ?? 0), 0) * 10) / 10} m</span></div>
          {mine && <Button size="sm" variant="primary" onClick={() => scanOrders(os.map(o => o.id), 'in-transit')}>Print sheets · scan out all {os.length}</Button>}
        </div>
        <div className="grid" style={{ gridTemplateColumns:'2fr 3fr' }}>
          <div className="px-4 py-2" style={{ borderRight:'1px solid var(--line-soft)' }}>
            <div className="label">Cut list — by fabric</div>
            {cut.map(c => <div key={c.fabricId} className="kv"><span className="k">{c.name}<div className="text-[11px] mono">{db.fabrics.find(x => x.id === c.fabricId)?.code}</div></span><span className="v">{c.metres} m <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>· {c.pcs} pc</span></span></div>)}
          </div>
          <div className="px-4 py-2">
            <div className="label">Order sheets</div>
            {os.map(o => <div key={o.id} className="kv" style={{ cursor:'pointer' }} onClick={() => onOpen(o.id)}><span className="k"><b className="mono" style={{ color:'var(--ink)' }}>{o.orderNo}</b> · {o.customer} · {o.styleName}{o.bespoke && <Pill tone="info">bespoke · {o.bespoke.code}</Pill>}{(o.revisions ?? []).length > 0 && <Pill tone="warn">changed · print {sheetVersion(o)}</Pill>}</span><span className="v flex gap-1 items-center justify-end">{o.consumptionM} m{mine && <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); scanOrders([o.id], 'in-transit'); }}>scan out</Button>}</span></div>)}
          </div>
        </div>
      </Card>); })}
    <Note>The scan out is the In-production status and the inventory deduction — no separate entry.</Note>
  </>;
}

/* ---------- Warehouse · inward — the daily vehicle round ------------------------ */
export function InwardTab({ mine, onOpen }: { mine: boolean; onOpen: (id: string) => void }) {
  const { db, scanOrders } = useApp();
  const rows = inwardOf(db);
  const total = rows.reduce((a, r) => a + r.waiting.length, 0);
  const waiting = rows.flatMap(r => r.waiting.map(o => ({ r, o })));
  const [round, setRound] = useState<string | null>(null);   // the factory whose vehicle is at the gate
  /* a piece past its ship-by and one still inside it */
  const ex = useExamples(waiting, x => daysAgo(x.o.promisedOn) > 0, { noun:'pieces', done: x => daysAgo(x.o.promisedOn) <= 0 });
  return <>
    <Card><table className="t">
      <thead><tr><th>Factory</th><th className="num">Ready · to collect</th><th className="num">Declared today</th><th className="num">Received today</th><th className="num">Gap</th><th></th></tr></thead>
      <tbody>{rows.map(r => { const short = r.waiting.filter(o => o.receiving?.shortOn).length; return <tr key={r.v.id}>
        <td><VendorLink id={r.v.id} className="font-medium" /></td>
        <td className="num">{r.waiting.length}{short > 0 && <div className="text-[10.5px]" style={{ color:'var(--warn)' }}>{short} missed the last vehicle</div>}</td><td className="num">{r.declaredToday}</td><td className="num">{r.receivedToday}</td>
        <td className="num" style={{ color: r.gap > 0 ? 'var(--risk)' : undefined }}>{r.gap > 0 ? `+${r.gap} not yet in` : r.gap < 0 ? `${r.gap}` : '—'}</td>
        <td>{mine && r.waiting.length > 0 && <Button size="sm" variant="primary" onClick={() => setRound(r.v.id)}>Receive the round</Button>}</td>
      </tr>; })}</tbody>
    </table></Card>
    {total > 0 && ex.strip && <div className="flex justify-end mt-3">{ex.strip}</div>}
    {total > 0 && <Card className="mt-2"><table className="t">
      <thead><tr><th>Order</th><th>Factory</th><th>Customer</th><th>Ready since</th><th>Ship by</th><th></th></tr></thead>
      <tbody>{ex.rows.map(({ r, o }) => <tr key={o.id} className="row" onClick={() => onOpen(o.id)}>
        <td className="mono text-[12.5px]">{o.orderNo}{o.receiving?.shortOn && <span className="pill warn" style={{ marginLeft: 6 }}>missed the vehicle</span>}{(o.receiving?.rejected.length ?? 0) > 0 && <span className="pill risk" style={{ marginLeft: 6 }}>turned back ×{o.receiving!.rejected.length}</span>}</td><td className="text-[12.5px]">{r.v.name}</td><td className="text-[12.5px]">{o.customer}</td>
        <td className="text-[12.5px]">{fmtRel(o.scans.find(sc => sc.stage === 'out-factory')?.at ?? o.punchedOn)}</td>
        <td style={{ color: daysAgo(o.promisedOn) > 0 ? 'var(--risk)' : undefined }}>{fmtDate(o.promisedOn)}</td>
        <td onClick={e => e.stopPropagation()}>{mine && <Button size="sm" onClick={() => scanOrders([o.id], 'rts')} title="receive this one piece — the RTS scan">RTS</Button>}</td>
      </tr>)}</tbody>
    </table></Card>}
    <div className="mt-3"><Note>The RTS scan is the receipt; the gap between declared and received is the reconciliation done by hand today.</Note></div>
    {round && <RoundDrawer factoryId={round} onClose={() => setRound(null)} onOpen={onOpen} />}
  </>;
}

/* The receiving bench for one vehicle. Every piece the factory declared ready is
   a line; the receiver says what happened to each — it came in, it was not on
   the vehicle, or it came in and went straight back — and closes the round.
   Only what came in gets the RTS scan and the GRN. */
type Fate = 'received' | 'short' | 'rejected';
const REJECT_REASONS = ['Stitching fault', 'Wrong fabric', 'Measurement off the sheet', 'Stain or damage', 'Wrong customer tag', 'Missing trims'];
function RoundDrawer({ factoryId, onClose, onOpen }: { factoryId: string; onClose: () => void; onOpen: (id: string) => void }) {
  const { db, receiveRound } = useApp();
  const v = db.vendors.find(x => x.id === factoryId);
  const pieces = inwardOf(db).find(r => r.v.id === factoryId)?.waiting ?? [];
  const [fate, setFate] = useState<Record<string, Fate>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [vehicle, setVehicle] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const of = (id: string): Fate => fate[id] ?? 'received';   // untouched = came in, the common case
  const counts = { received: pieces.filter(o => of(o.id) === 'received').length, short: pieces.filter(o => of(o.id) === 'short').length, rejected: pieces.filter(o => of(o.id) === 'rejected').length };
  const setAll = (f: Fate) => setFate(Object.fromEntries(pieces.map(o => [o.id, f])));
  const shown = pieces.filter(o => !q.trim() || `${o.orderNo} ${o.customer} ${o.styleName}`.toLowerCase().includes(q.trim().toLowerCase()));
  const finish = () => {
    receiveRound(factoryId, { received: pieces.filter(o => of(o.id) === 'received').map(o => o.id), short: pieces.filter(o => of(o.id) === 'short').map(o => o.id),
      rejected: pieces.filter(o => of(o.id) === 'rejected').map(o => ({ id: o.id, reason: reason[o.id] || REJECT_REASONS[0] })), vehicle: vehicle.trim(), note: note.trim() });
    onClose();
  };
  return <Drawer open onClose={onClose} title={`Vehicle in · ${v?.name ?? 'factory'}`} subtitle={<span>{pieces.length} piece{pieces.length === 1 ? '' : 's'} declared ready · say what happened to each, then close the round</span>}>
    <Section title="The vehicle" look="lead" collapsible={false} pending={false} ownerRole="warehouse" right={<span className="pill role-warehouse">Warehouse</span>}>
      <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'1fr 2fr' }}>
        <Field label="Vehicle · driver" hint="goes on the GRN"><Input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="MH 02 AB 1234 · Ramesh" /></Field>
        <Field label="Note for the round"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="two bags, one open · factory says the rest come tomorrow" /></Field>
      </div>
      <div className="flex items-center gap-3 flex-wrap pt-2 text-[12.5px]">
        <span><b>{counts.received}</b> received</span><span style={{ color: counts.short ? 'var(--warn)' : 'var(--ink-faint)' }}><b>{counts.short}</b> not on the vehicle</span><span style={{ color: counts.rejected ? 'var(--risk)' : 'var(--ink-faint)' }}><b>{counts.rejected}</b> turned back</span>
        <span className="ml-auto flex gap-1"><Button size="sm" variant="ghost" onClick={() => setAll('received')}>All received</Button><Button size="sm" variant="ghost" onClick={() => setAll('short')}>None came</Button></span>
      </div>
    </Section>
    <Section title={`Pieces · ${pieces.length}`} collapsible={false} pending={false} ownerRole={null} right={<Input value={q} onChange={e => setQ(e.target.value)} placeholder="order no, customer" style={{ width: 180, padding:'4px 8px', fontSize: 12 }} />}>
      <div style={{ overflowX:'auto' }}><table className="t">
        <thead><tr><th>Order</th><th>Customer</th><th>Ready since</th><th>Ship by</th><th>What happened</th><th>Reason</th></tr></thead>
        <tbody>{shown.map(o => { const f = of(o.id); return <tr key={o.id} style={{ background: f === 'rejected' ? 'var(--risk-soft)' : f === 'short' ? 'var(--warn-soft)' : undefined }}>
          <td className="mono text-[12.5px]"><button type="button" className="vlink" onClick={() => onOpen(o.id)}>{o.orderNo}</button>{o.receiving?.shortOn && <div className="text-[10.5px]" style={{ color:'var(--warn)' }}>missed the last vehicle</div>}{o.tag !== 'normal' && <div className="text-[10.5px]" style={{ color:'var(--warn)' }}>{o.tag}</div>}</td>
          <td className="text-[12.5px]">{o.customer}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{o.styleName}</div></td>
          <td className="text-[12.5px]">{fmtRel(o.scans.find(sc => sc.stage === 'out-factory')?.at ?? o.punchedOn)}</td>
          <td className="text-[12.5px]" style={{ color: daysAgo(o.promisedOn) > 0 ? 'var(--risk)' : undefined }}>{fmtDate(o.promisedOn)}</td>
          <td><Seg value={f} onChange={x => setFate(s => ({ ...s, [o.id]: x }))} options={[{ id:'received' as Fate, label:'Received' }, { id:'short' as Fate, label:'Not on vehicle' }, { id:'rejected' as Fate, label:'Turned back' }]} /></td>
          <td>{f === 'rejected' && <Select value={reason[o.id] ?? REJECT_REASONS[0]} onChange={x => setReason(s => ({ ...s, [o.id]: x }))} options={REJECT_REASONS.map(r => ({ value: r, label: r }))} />}</td>
        </tr>; })}</tbody>
      </table></div>
      <div className="flex items-center gap-2 flex-wrap pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <Button variant="primary" onClick={finish} disabled={pieces.length === 0}>Close the round</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>received pieces get the RTS scan and one GRN · short pieces stay with the factory, marked · turned-back pieces go back to in-factory with the reason on the record</span>
      </div>
    </Section>
  </Drawer>;
}

/* ---------- Warehouse · bespoke — mill stock every evening, parcels by code -------- */
export function BespokeTab({ mine, onOpen }: { mine: boolean; onOpen: (id: string) => void }) {
  const { db, reportMillStock, inwardBespoke, importMillSheet, callBespokeFabric, saveMillStock } = useApp();
  const bq = bespokeQueue(db);
  const name = (id: string) => db.vendors.find(v => v.id === id)?.name ?? id;
  const stale = (f: { millReportedAt: string | null }) => !f.millReportedAt || daysAgo(f.millReportedAt) >= 1;
  const millsSorted = [...bq.mills].sort((a, b) => bq.fabrics.filter(f => f.vendorId === b && stale(f)).length - bq.fabrics.filter(f => f.vendorId === a && stale(f)).length);
  const [mill, setMill] = useState<string>(millsSorted[0] ?? '');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState(''); const [showSheet, setShowSheet] = useState(false);
  const [code, setCode] = useState(''); const [result, setResult] = useState<string | null>(null);
  const millFabrics = bq.fabrics.filter(f => f.vendorId === mill).sort((a, b) => Number(stale(b)) - Number(stale(a)) || a.name.localeCompare(b.name));
  const dueHere = millFabrics.filter(stale).length;
  /* a fabric still due today and one already reported; a parcel that is urgent and one that is not */
  const exMill = useExamples(millFabrics, f => stale(f), { noun:'fabrics', done: f => !stale(f) });
  const exAwait = useExamples(bq.awaiting, o => daysAgo(o.promisedOn) > -3 || daysAgo(o.bespoke!.requestedOn!) > 10, { noun:'parcels', done: o => !(daysAgo(o.promisedOn) > -3 || daysAgo(o.bespoke!.requestedOn!) > 10) });
  const changes = Object.entries(edits).filter(([id, v]) => { const f = db.fabrics.find(x => x.id === id); return f && v !== '' && Number(v) !== (f.millStockMetres ?? -1); });
  const save = () => { saveMillStock(changes.map(([fabricId, v]) => ({ fabricId, metres: Number(v) })), mill); setEdits({}); };
  const submitCode = () => { const r = inwardBespoke(code); setResult(r.ok ? `${code.toUpperCase()} → ${r.orderNo} inwarded` : `No open order for ${code.toUpperCase()}`); setCode(''); };
  return <>

    {/* ---- 1. the evening job: mill stock, one mill at a time ---- */}
    <Card>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 flex-wrap" style={{ borderBottom:'1px solid var(--line-soft)' }}>
        <div><h3>Mill stock — today's report</h3><div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>Bespoke fabric sits at the mill; the metres each mill reports today are the inventory — the sheet is fresh every day, there is no running balance. Type today's figures, save the mill, move to the next.</div></div>
        <div className="flex gap-1 flex-wrap">{millsSorted.map(m => { const due = bq.fabrics.filter(f => f.vendorId === m && stale(f)).length; return <button key={m} type="button" className={`btn sm ${mill === m ? 'primary' : ''}`} onClick={() => { setMill(m); setEdits({}); }}>{name(m)}{due ? <span style={{ opacity:.8 }}> · {due} due</span> : ' · ✓'}</button>; })}</div>
      </div>
      {exMill.strip && <div className="flex justify-end px-4 py-1.5">{exMill.strip}</div>}
      <table className="t compact">
        <thead><tr><th>Fabric</th><th>Last report</th><th className="num">Stock at mill · metres</th><th>Status</th><th></th></tr></thead>
        <tbody>{exMill.rows.map(f => { const v = edits[f.id] ?? ''; const shown = v !== '' ? v : String(f.millStockMetres ?? ''); const isStale = stale(f); return (
          <tr key={f.id} style={{ background: isStale ? 'var(--warn-soft)' : undefined }}>
            <td><b>{f.name}</b><div className="text-[11px] mono" style={{ color:'var(--ink-faint)' }}>{f.code}</div></td>
            <td className="text-[12px]" style={{ color: isStale ? 'var(--warn)' : 'var(--ink-faint)' }}>{isStale ? (f.millReportedAt ? `not yet today · last ${fmtRel(f.millReportedAt)}` : 'never reported') : 'reported today'}</td>
            <td className="num">{mine ? <Input type="number" min={0} className="input mono" style={{ width: 96, padding:'4px 8px', textAlign:'right', borderColor: v !== '' ? 'var(--accent)' : undefined }} value={shown} onChange={e => setEdits(s => ({ ...s, [f.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && changes.length && save()} /> : <span className="mono">{f.millStockMetres ?? '—'}</span>}</td>
            <td><Pill tone={(v !== '' ? Number(v) > 0 : f.millAvailable !== false) ? 'good' : 'risk'}>{(v !== '' ? Number(v) > 0 : f.millAvailable !== false) ? 'orderable' : 'sold out · off in stores'}</Pill></td>
            <td>{mine && <Button size="sm" variant="ghost" onClick={() => reportMillStock(f.id, false, 0)}>Out</Button>}</td>
          </tr>); })}</tbody>
      </table>
      {mine && <div className="flex items-center gap-2 px-4 py-3 flex-wrap" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <Button variant="primary" disabled={changes.length === 0 && dueHere === 0} onClick={save}>{changes.length ? `Save ${changes.length} change${changes.length === 1 ? '' : 's'} · mark ${name(mill)} reported` : `No changes · mark ${name(mill)} reported today`}</Button>
        <Button size="sm" variant="ghost" onClick={() => setShowSheet(v => !v)}>{showSheet ? 'Hide' : 'Paste the mill\'s sheet instead'}</Button>
        <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>Enter saves · 0 or "Out" switches the fabric off on Shopify and in stores at once · unchanged rows are marked reported</span>
      </div>}
      {showSheet && mine && <div className="px-4 pb-4"><textarea className="input mono" rows={4} value={sheet} onChange={e => setSheet(e.target.value)} placeholder={`${millFabrics[0]?.code ?? 'CODE'}  120 m\n${millFabrics[1]?.code ?? 'CODE'}  out of stock\n${millFabrics[2]?.name ?? 'Fabric name'}  0`} />
        <div className="flex gap-2 items-center mt-1"><Button size="sm" variant="primary" disabled={!sheet.trim()} onClick={() => { importMillSheet(mill, sheet); setSheet(''); }}>Apply to {name(mill)}</Button><span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>matches on fabric code or name · a number is the metres the mill holds · "0", "out", "OOS", "nil" mark it sold out</span></div></div>}
    </Card>

    {/* ---- 2. parcels & calls ---- */}
    <div className="grid gap-3 mt-3" style={{ gridTemplateColumns:'minmax(0, 3fr) minmax(0, 2fr)' }}>
      <Card>
        <div className="px-4 py-2.5" style={{ borderBottom:'1px solid var(--line-soft)' }}><h3>Parcel arrived</h3><div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>Scan or type the sticker code — the code was ours, minted when the fabric was called, so the parcel matches its order by itself.</div></div>
        <div className="px-4 py-3 flex gap-2 items-center">
          <Input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && code.trim() && submitCode()} placeholder="e.g. ALB-1K7Q" className="input mono" style={{ maxWidth: 260 }} />
          {mine && <Button variant="primary" onClick={submitCode} disabled={!code.trim()}>Inward</Button>}
          {result && <span className="text-[12.5px]" style={{ color: result.includes('inwarded') ? 'var(--good)' : 'var(--risk)' }}>{result}</span>}
        </div>
        <div className="px-4 pb-1 flex items-center"><span className="label" style={{ margin:0 }}>Awaited · {bq.awaiting.length}</span><span className="ml-auto">{exAwait.strip}</span></div>
        <div style={{ maxHeight: 360, overflowY:'auto' }}><table className="t compact"><thead><tr><th>Code</th><th>Order</th><th>Fabric · mill</th><th>Called</th><th>Ship by</th><th></th></tr></thead>
          <tbody>{exAwait.rows.map(o => { const f = db.fabrics.find(x => x.id === o.fabricId); const age = daysAgo(o.bespoke!.requestedOn!); return <tr key={o.id} className="row" onClick={() => onOpen(o.id)}>
            <td className="mono font-medium">{o.bespoke!.code}</td><td className="mono text-[12.5px]">{o.orderNo}</td>
            <td className="text-[12.5px]">{o.styleName}<div style={{ color:'var(--ink-faint)' }}>{f ? name(f.vendorId) : ''}</div></td>
            <td className="text-[12.5px]" style={{ color: age > 10 ? 'var(--risk)' : undefined }}>{age}d ago</td>
            <td style={{ color: daysAgo(o.promisedOn) > -3 ? 'var(--risk)' : undefined }}>{fmtDate(o.promisedOn)}</td>
            <td onClick={e => e.stopPropagation()}>{mine && <Button size="sm" variant="ghost" onClick={() => { const r = inwardBespoke(o.bespoke!.code); setResult(r.ok ? `${o.bespoke!.code} → ${r.orderNo} inwarded` : 'failed'); }}>Inward</Button>}</td>
          </tr>; })}</tbody></table></div>
      </Card>
      <Card>
        <div className="px-4 py-2.5" style={{ borderBottom:'1px solid var(--line-soft)' }}><h3>Call from the mills · {bq.toCall.length}</h3><div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>New bespoke orders, one request per mill per day — codes and metres go on it; the mill sticks our code on the parcel.</div></div>
        {bq.toCall.length === 0 ? <div className="px-4 py-4 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing to call today.</div>
          : <div className="px-4 py-1">{[...new Set(bq.toCall.map(o => db.fabrics.find(f => f.id === o.fabricId)?.vendorId ?? ''))].map(mid => { const os = bq.toCall.filter(o => db.fabrics.find(f => f.id === o.fabricId)?.vendorId === mid); return <div key={mid} className="kv" style={{ alignItems:'flex-start' }}><span className="k"><b style={{ color:'var(--ink)' }}>{name(mid)}</b> · {os.length} order{os.length === 1 ? '' : 's'} · {Math.round(os.reduce((a, o) => a + (o.consumptionM ?? 0), 0) * 10) / 10} m<div className="text-[11px] mono" style={{ whiteSpace:'normal' }}>{os.map(o => o.bespoke!.code).join(' · ')}</div></span><span className="v">{mine && <Button size="sm" variant="primary" onClick={() => callBespokeFabric(os.map(o => o.id))}>Send request</Button>}</span></div>; })}</div>}
      </Card>
    </div>
    <div className="mt-3"><Note>Bespoke fabric is never on our shelf — planning sees the order only once the mill's parcel is inwarded against it.</Note></div>
  </>;
}

/* ---------- Aging — the pivot Vishnu builds every day, built for him ----------- */
export function AgingTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { db } = useApp();
  const r = agingReport(db);
  const [show, setShow] = useState<'all' | 'overdue' | 'today'>('overdue');
  const [view, setView] = useState<'list' | 'stage' | 'age' | 'date'>('list');
  const list = show === 'overdue' ? r.overdue : show === 'today' ? r.dueToday : r.open;
  const sorted = [...list].sort((a, b) => a.promisedOn.localeCompare(b.promisedOn));
  /* one piece per (past ship-by · due today · still inside) × stage, so the handful shows where the late ones sit */
  const ex = useExamples(sorted, o => `${daysAgo(o.promisedOn) > 0 ? 'overdue' : daysAgo(o.promisedOn) === 0 ? 'today' : 'open'}·${o.stage}`, { noun:'pieces', done: o => o.stage === 'rts' });
  const rows = ex.rows.slice(0, 60);
  const wh = (n: number) => (n ? n : <span style={{ color:'var(--line)' }}>·</span>);
  return <>
    <div className="mb-3"><Seg value={view} onChange={setView} label="Look at it" options={[
      { id:'list', label:'The pieces', count: show === 'overdue' ? r.overdue.length : show === 'today' ? r.dueToday.length : r.open.length, hint:'one line per order — the list you chase from' },
      { id:'stage', label:'Factory × stage', hint:'where every open piece is right now' },
      { id:'age', label:'Days in factory', hint:'which factory is sitting on work' },
      { id:'date', label:'By ship-by date', hint:'what should have gone, and what goes when' },
    ]} /></div>

    {view === 'stage' && <div className="grid gap-3" style={{ gridTemplateColumns:'minmax(0, 1fr)' }}>
      <Card><div className="pad" style={{ padding:'12px 14px 4px' }}><div className="label">Where every open piece is — factory × stage</div></div>
        <div style={{ overflowX:'auto' }}><table className="t compact"><thead><tr><th>Factory</th>{r.stages.map(st => <th key={st} className="num">{stageLabel(st)}</th>)}<th className="num">Total</th><th className="num">Past ship-by</th></tr></thead>
          <tbody>
            <tr><td className="text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Not yet allocated</td>{r.stages.map(st => <td key={st} className="num">{wh(r.unallocated.filter(o => o.stage === st).length)}</td>)}<td className="num">{r.unallocated.length}</td><td className="num" style={{ color: r.unallocated.some(o => daysAgo(o.promisedOn) > 0) ? 'var(--risk)' : undefined }}>{wh(r.unallocated.filter(o => daysAgo(o.promisedOn) > 0).length)}</td></tr>
            {r.byFactory.map(f => <tr key={f.v.id}><td><VendorLink id={f.v.id} className="font-medium" /></td>{r.stages.map(st => <td key={st} className="num">{wh(f.row[st])}</td>)}<td className="num font-medium">{f.total}</td><td className="num" style={{ color: f.overdue ? 'var(--risk)' : undefined }}>{wh(f.overdue)}</td></tr>)}
            <tr><td className="font-medium">Total</td>{r.stages.map(st => <td key={st} className="num font-medium">{r.open.filter(o => o.stage === st).length}</td>)}<td className="num font-medium">{r.open.length}</td><td className="num font-medium" style={{ color:'var(--risk)' }}>{r.overdue.length}</td></tr>
          </tbody></table></div>
      </Card>
    </div>}

    {view === 'age' && <div>
      <Card><div className="pad" style={{ padding:'12px 14px 4px' }}><div className="label">Days in factory — who is lagging</div></div>
        <table className="t compact"><thead><tr><th>Factory</th>{r.AGE.map(([lo, hi]) => <th key={lo} className="num">{hi === 999 ? `${lo}d+` : `${lo}–${hi}d`}</th>)}<th className="num">Oldest</th></tr></thead>
          <tbody>{r.ageByFactory.map(f => <tr key={f.v.id}><td><VendorLink id={f.v.id} className="font-medium" /></td>{f.buckets.map((n, i) => <td key={i} className="num" style={{ color: i >= 2 && n ? 'var(--risk)' : i === 1 && n ? 'var(--warn)' : undefined }}>{wh(n)}</td>)}<td className="num" style={{ color: f.oldest > AGING_DAYS ? 'var(--risk)' : undefined }}>{f.wip ? `${f.oldest}d` : '—'}</td></tr>)}</tbody></table>
        <div className="pad text-[11.5px]" style={{ color:'var(--ink-faint)', padding:'8px 14px 12px' }}>Past {AGING_DAYS} days in a factory the piece is stuck, not slow. Feed less there until it clears.</div>
      </Card>
    </div>}

    {view === 'date' && <div>
      <Card><div className="pad" style={{ padding:'12px 14px 4px' }}><div className="label">Pending by ship-by date — what should have gone, what goes when</div></div>
      <div style={{ overflowX:'auto', maxHeight: 420, overflowY:'auto' }}><table className="t compact"><thead><tr><th>Ship by</th>{r.factories.map(v => <th key={v.id} className="num" title={v.name}>{v.name.split(' ')[0]}</th>)}<th className="num">Unalloc.</th><th className="num">Total</th></tr></thead>
        <tbody>{r.byDate.map(d => <tr key={d.date} style={{ background: d.isToday ? 'var(--accent-soft)' : undefined }}>
          <td className="mono text-[12.5px]" style={{ color: d.late ? 'var(--risk)' : undefined }}>{fmtDate(d.date)}{d.late && <span className="text-[10.5px]"> · late</span>}{d.isToday && <span className="text-[10.5px]"> · today</span>}</td>
          {d.cells.map((n, i) => <td key={i} className="num" style={{ color: d.late && n ? 'var(--risk)' : undefined }}>{wh(n)}</td>)}
          <td className="num">{wh(d.unalloc)}</td><td className="num font-medium">{d.total}</td>
        </tr>)}</tbody></table></div>
      </Card>
    </div>}

    {view === 'list' && <Card>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom:'1px solid var(--line-soft)' }}>
        <span className="label" style={{ margin:0 }}>Pieces</span>
        {(['overdue', 'today', 'all'] as const).map(k => <button key={k} type="button" className={`btn sm ${show === k ? 'primary' : ''}`} onClick={() => setShow(k)}>{k === 'overdue' ? `Past ship-by · ${r.overdue.length}` : k === 'today' ? `Due today · ${r.dueToday.length}` : `All open · ${r.open.length}`}</button>)}
        <span className="ml-auto">{ex.strip}</span>
      </div>
      <table className="t"><thead><tr><th>Order</th><th>Customer · store</th><th>Fabric</th><th>Tag</th><th>Factory</th><th>Stage</th><th>Punched</th><th>Ship by</th><th className="num">Days late</th></tr></thead>
        <tbody>{rows.map(o => <tr key={o.id} className="row" onClick={() => onOpen(o.id)}>
          <td className="mono text-[12.5px]">{o.orderNo}</td><td className="text-[12.5px]">{o.customer}<div style={{ color:'var(--ink-faint)' }}>{STORES.find(s => s.id === o.storeId)?.name}</div></td>
          <td className="text-[12.5px]">{o.styleName}{o.bespoke && <span style={{ color:'var(--ink-faint)' }}> · bespoke</span>}</td>
          <td><Pill tone={TAG_TONE[o.tag]}>{o.tag}</Pill></td><td className="text-[12.5px]">{o.factoryId ? <VendorLink id={o.factoryId} /> : '—'}</td>
          <td><Pill tone={STAGE_TONE[o.stage] ?? 'neutral'}>{stageLabel(o.stage)}</Pill></td>
          <td className="mono text-[12px]">{fmtTime(o.punchedOn)}</td><td style={{ color: daysAgo(o.promisedOn) > 0 ? 'var(--risk)' : undefined }}>{fmtDate(o.promisedOn)}</td>
          <td className="num" style={{ color: daysAgo(o.promisedOn) > 0 ? 'var(--risk)' : undefined }}>{daysAgo(o.promisedOn) > 0 ? daysAgo(o.promisedOn) : '—'}</td>
        </tr>)}</tbody></table>
      {ex.all && list.length > 60 && <div className="pad text-[11.5px]" style={{ color:'var(--ink-faint)' }}>showing the 60 most urgent of {list.length}</div>}
    </Card>}
    <div className="mt-3"><Note>"Pending" means past its ship-by and not yet dispatched, recomputed every time a scan lands.</Note></div>
  </>;
}

/** A pre-confirmed order: taken at the store, not yet confirmed. Planning waits until someone confirms it. */
function PreConfirmBox({ o }: { o: CustomerOrder }) {
  const { confirmOrder } = useApp();
  const [note, setNote] = useState('');
  return <div className="flex gap-2 items-center flex-wrap py-1">
    <span className="text-[12.5px] flex-1" style={{ minWidth: 220 }}>{o.preConfirmed!.note || o.preConfirmed!.reason} · since {fmtDate(o.preConfirmed!.since)}. It is not planned to a factory until it is confirmed.</span>
    <Input value={note} onChange={e => setNote(e.target.value)} placeholder="remark (optional)" style={{ width: 200 }} />
    <Button size="sm" variant="primary" onClick={() => confirmOrder(o.id, note.trim())}>Confirm order</Button>
  </div>;
}
