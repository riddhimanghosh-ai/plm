/* The factory merchandiser's screen — the person at Mahendra or Richman who
   today runs the day on WhatsApp: a photo of the day's output, a call when the
   power is out, an email when a panel is short, and no sight at all of a change
   the store made after the bundle left the unit. All four, on the record. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { CustomerOrder, ExtraFabricRequest, ProductionOrder } from '../domain/types';
import { FabricFinalisationSection, DocsChecklist, SizeGrid } from './RtwGates';
import { MilestoneGrid } from './Tracker';
import { fabricStateOf, riskOf, rtwDocsOf, factoryStateOf, fmtMoney } from '../domain/engines';
import { factoryLoadOf, factoryUnread, needsReprint, sheetRev, sheetVersion, fmtDate, fmtRel, daysAgo, iso, TODAY } from '../domain/engines';
import { EXTRA_FABRIC_PANELS, EXTRA_FABRIC_REASONS, PANEL_METRES, AGING_DAYS, MTM_STAGES, STORES } from '../domain/reference';
import { Page, Card, Pill, Button, Note, Tabs, Empty, Drawer, Field, Input, Select, useExamples, Seg, Section, KV, type Tone } from '../ui';
import { RecordTail } from './RecordTail';
import { FILE_LABELS, ORDER_STEPS } from '../domain/reference';
import { ThreadPanel } from './Thread';
import { SheetView } from './OrderSheet';
import { VendorLink } from './Vendors';
import { ActsBy } from './Who';
import { MTM_ONLY } from '../domain/edition';

const STAGE_TONE: Record<string, Tone> = { 'in-transit':'info', 'in-factory':'info', 'out-factory':'good', rts:'good' };
const stageLabel = (id: string) => MTM_STAGES.find(s => s.id === id)?.label ?? id;
const store = (id: string) => STORES.find(s => s.id === id)?.name ?? id;

export function Factory() {
  const { db, role, factoryId, setFactory } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace:true }); };
  const tab = params.get('tab') ?? 'today';
  const sideParam = params.get('side');
  const mine = role === 'merchandiser' || role === 'owner';
  const factories = db.vendors.filter(v => (v.mtm || (!MTM_ONLY && v.kind.endsWith('factory'))) && v.kind !== 'Hemming unit');
  const v = factories.find(x => x.id === factoryId) ?? factories[0];
  if (!v) return <Page title="My factory"><Card><Empty title="No MTM factory." body="" /></Card></Page>;
  const l = factoryLoadOf(db, v.id);
  const orders = [...l.inTransit, ...l.wip, ...l.ready].sort((a, b) => a.promisedOn.localeCompare(b.promisedOn));
  const unread = orders.filter(factoryUnread);
  const xf = (db.extraFabric ?? []).filter(r => r.factoryId === v.id);
  const openOrder = (db.customerOrders ?? []).find(o => o.id === params.get('open')) ?? null;
  const rtw = db.orders.filter(o => o.vendorId === v.id && o.status === 'Open').sort((a, b) => a.targetInhouse.localeCompare(b.targetInhouse));
  const rtwDone = db.orders.filter(o => o.vendorId === v.id && o.status === 'Closed').sort((a, b) => (b.poDate ?? '').localeCompare(a.poDate ?? ''));
  /* two different jobs on one floor: customer shirts by the piece, and bulk POs by the hundred */
  const side: 'mtm' | 'rtw' = MTM_ONLY ? 'mtm' : ((sideParam as 'mtm' | 'rtw' | null) ?? (v.mtm ? 'mtm' : 'rtw'));
  const setSide = (k: string) => { const n = new URLSearchParams(params); n.set('side', k); n.delete('tab'); n.delete('open'); setParams(n, { replace:true }); };
  const openRtw = rtw.find(o => o.id === params.get('open')) ?? null;
  const keyed = (db.factoryOutputs ?? []).filter(f => f.factoryId === v.id).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Page title={`My factory · ${v.name}`} lede="Everything this floor owes the production unit and everything it is owed."
      replaces="the WhatsApp output photo, the call about a power cut, the extra-fabric email, and finding out about a changed collar when the shirt is already cut"
      actions={<div style={{ width: 220 }}><Field label="Factory"><Select value={v.id} onChange={setFactory} options={factories.map(f => ({ value:f.id, label:f.name }))} /></Field></div>}>
      {!mine && <div className="mb-2"><ActsBy role="merchandiser" does="runs this floor — keys in the day's output, reads the changes and asks for cloth" inline /></div>}

      {!MTM_ONLY && <div className="mb-3"><Seg value={side} onChange={setSide} options={[
        { id:'mtm', label:'MTM · customer shirts, by the piece', count: orders.length, hint: v.mtm ? undefined : 'this factory does not stitch made-to-measure' },
        { id:'rtw', label:'RTW · bulk purchase orders', count: rtw.length },
      ]} /></div>}

      {side === 'mtm' && <>
        <Tabs active={tab} onChange={t => set('tab', t)} tabs={[
          { id:'today', label:"Today · output and the day's status" },
          { id:'orders', label:'Pieces allocated to us', count: orders.length },
          { id:'changes', label:'Changed after it reached us', count: unread.length },
          { id:'fabric', label:'Ask for extra cloth', count: xf.filter(r => r.status === 'requested').length },
        ]} />
        {tab === 'today' && <TodayTab v={v} mine={mine} keyed={keyed} scanned={l.outToday} avg={l.avgOut} />}
        {tab === 'orders' && <OrdersTab orders={orders} mine={mine} onOpen={id => set('open', id)} />}
        {tab === 'changes' && <ChangesTab orders={unread} mine={mine} onOpen={id => set('open', id)} />}
        {tab === 'fabric' && <AskTab v={v} mine={mine} orders={orders} rows={xf} onOpen={id => set('open', id)} />}
      </>}

      {side === 'rtw' && <>
        <Tabs active={tab === 'today' ? 'rtw' : tab} onChange={t => set('tab', t)} tabs={[
          { id:'rtw', label:'POs on our floor', count: rtw.length },
          { id:'rtw-done', label:'Delivered', count: rtwDone.length },
        ]} />
        {(tab === 'today' || tab === 'rtw') && <RtwTab rows={rtw} onOpen={id => set('open', id)} />}
        {tab === 'rtw-done' && <RtwTab rows={rtwDone} onOpen={id => set('open', id)} done />}
      </>}

      <Drawer open={!!openOrder} onClose={() => set('open', null)} title={openOrder?.orderNo ?? ''} subtitle={openOrder && <><Pill tone={STAGE_TONE[openOrder.stage] ?? 'neutral'}>{stageLabel(openOrder.stage)}</Pill><span>{openOrder.customer} · {store(openOrder.storeId)}</span></>}>
        {openOrder && <OrderPanel o={openOrder} mine={mine} />}
      </Drawer>
      <Drawer open={!!openRtw} onClose={() => set('open', null)} title={openRtw?.poNo ?? ''} subtitle={openRtw && <>{openRtw.styleName} · {openRtw.orderQty} pcs · in-house by {fmtDate(openRtw.targetInhouse)}</>}>
        {openRtw && <RtwPoPanel o={openRtw} mine={mine} />}
      </Drawer>
    </Page>
  );
}

/* ---------- Today: the count this floor stands behind ---------------------- */
function TodayTab({ v, mine, keyed, scanned, avg }: { v: { id: string; name: string; dailyTarget?: number }; mine: boolean; keyed: { date: string; pieces: number; note: string; by: string }[]; scanned: number; avg: number }) {
  const { logFactoryOutput } = useApp();
  const [day, setDay] = useState(iso(TODAY).slice(0, 10));
  const [pieces, setPieces] = useState('');
  const [note, setNote] = useState('');
  const today = keyed.find(k => k.date === iso(TODAY).slice(0, 10));
  const ex = useExamples(keyed, k => k.pieces === 0 ? 'nothing out' : k.note ? 'with a note' : 'count only', { noun: 'days', done: k => k.pieces > 0 && !!k.note });
  return <>
    <div className="grid gap-3" style={{ gridTemplateColumns:'1fr' }}>
      <Card><div className="px-4 py-2.5" style={{ borderBottom:'1px solid var(--line-soft)' }}><h3 className="m-0">What went out today</h3>
        <div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>your count, in your words — the scans give the unit its own number and the two sit side by side</div></div>
        <div className="pad">
          <div className="grid gap-2.5 items-end" style={{ gridTemplateColumns:'150px 110px 1fr auto' }}>
            <Field label="Day"><Input type="date" value={day} onChange={e => setDay(e.target.value)} /></Field>
            <Field label="Pieces out"><Input type="number" min={0} value={pieces} onChange={e => setPieces(e.target.value)} placeholder={String(scanned)} className="input mono" /></Field>
            <Field label="Anything worth saying"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="two held for a button change, counted tomorrow" /></Field>
            {mine ? <Button variant="primary" size="sm" disabled={pieces === ''} onClick={() => { logFactoryOutput(v.id, day, Number(pieces), note.trim()); setPieces(''); setNote(''); }}>Log the day</Button>
              : <ActsBy role="merchandiser" does="keys the day in" inline />}
          </div>
          <div className="mt-3 grid gap-3" style={{ gridTemplateColumns:'1fr 1fr 1fr' }}>
            <div><div className="label">Scanned out today</div><div className="mono text-[20px]">{scanned}</div></div>
            <div><div className="label">You keyed in</div><div className="mono text-[20px]" style={{ color: today && today.pieces !== scanned ? 'var(--warn)' : undefined }}>{today ? today.pieces : '—'}</div></div>
            <div><div className="label">Your daily average</div><div className="mono text-[20px]">{avg}{v.dailyTarget ? <span className="text-[12px]" style={{ color:'var(--ink-faint)' }}> · target {v.dailyTarget}</span> : null}</div></div>
          </div>
          {today && today.pieces !== scanned && <div className="mt-2"><Note tone="warn">Your count and the scans disagree by {Math.abs(today.pieces - scanned)} piece{Math.abs(today.pieces - scanned) === 1 ? '' : 's'}. The unit sees both — a piece counted here but not scanned out is the one that goes missing.</Note></div>}
        </div>
      </Card>

    </div>

    <Card className="mt-3"><div className="px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap" style={{ borderBottom:'1px solid var(--line-soft)' }}><h3 className="m-0">The last few days</h3>{ex.strip}</div>
      <table className="t compact"><thead><tr><th>Day</th><th className="num">You keyed in</th><th>What you said</th><th>Logged by</th></tr></thead>
        <tbody>{keyed.length === 0 ? <tr><td colSpan={4} className="text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing logged yet.</td></tr>
          : ex.rows.slice(0, 10).map(k => <tr key={k.date}><td>{fmtDate(k.date)}</td><td className="num mono">{k.pieces}</td>
            <td className="text-[12.5px]" style={{ color:'var(--ink-soft)' }}>{k.note || '—'}</td><td className="text-[12px]" style={{ color:'var(--ink-faint)' }}>{k.by}</td></tr>)}</tbody></table>
    </Card>
  </>;
}

/* ---------- The pieces on this floor --------------------------------------- */
function OrdersTab({ orders, mine, onOpen }: { orders: CustomerOrder[]; mine: boolean; onOpen: (id: string) => void }) {
  const { db, scanOrders } = useApp();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [only, setOnly] = useState<'all' | 'transit' | 'floor' | 'ready' | 'changed' | 'late'>('all');
  const inAt = (o: CustomerOrder) => o.scans.find(sc => sc.stage === 'in-factory')?.at;
  const rows = orders.filter(o => only === 'all' ? true : only === 'transit' ? o.stage === 'in-transit' : only === 'floor' ? o.stage === 'in-factory'
    : only === 'ready' ? o.stage === 'out-factory' || o.stage === 'rts' : only === 'changed' ? factoryUnread(o) : daysAgo(o.promisedOn) > 0);
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ex = useExamples(rows, o => factoryUnread(o) ? 'changed' : daysAgo(o.promisedOn) > 0 ? 'late' : o.stage, { noun: 'pieces', done: o => o.stage === 'out-factory' || o.stage === 'rts' });
  const count = (k: typeof only) => orders.filter(o => k === 'all' ? true : k === 'transit' ? o.stage === 'in-transit' : k === 'floor' ? o.stage === 'in-factory'
    : k === 'ready' ? o.stage === 'out-factory' || o.stage === 'rts' : k === 'changed' ? factoryUnread(o) : daysAgo(o.promisedOn) > 0).length;
  const fabric = (o: CustomerOrder) => db.fabrics.find(f => f.id === o.fabricId);
  return <>
    <div className="flex gap-1.5 flex-wrap mb-2 items-center">
      {([['all', 'Everything'], ['transit', 'On its way here'], ['floor', 'On the floor'], ['ready', 'Ready to go back'], ['changed', 'Changed since it arrived'], ['late', 'Past ship-by']] as const)
        .map(([k, label]) => <button key={k} type="button" className={`btn sm ${only === k ? 'primary' : ''}`} onClick={() => setOnly(k)}>{label} · {count(k)}</button>)}
      <div className="flex-1" />
      {ex.strip}
      {mine && sel.size > 0 && <div className="flex gap-1">
        <Button size="sm" onClick={() => { scanOrders([...sel], 'in-factory'); setSel(new Set()); }}>Received · {sel.size}</Button>
        <Button size="sm" variant="primary" onClick={() => { scanOrders([...sel], 'out-factory'); setSel(new Set()); }}>Out of the factory · {sel.size}</Button>
      </div>}
    </div>
    {rows.length === 0 ? <Card><Empty title="Nothing here." body="" /></Card> : <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><th></th><th>Order</th><th>Customer · store</th><th>Fabric · cloth</th><th>Ship by</th><th>Stage</th><th>Days here</th><th></th></tr></thead>
      <tbody>{ex.rows.map(o => { const d = inAt(o) ? daysAgo(inAt(o)!) : null; const late = daysAgo(o.promisedOn) > 0; const f = fabric(o); return (
        <tr key={o.id} className="row" onClick={() => onOpen(o.id)} style={{ background: sel.has(o.id) ? 'var(--accent-soft)' : undefined }}>
          <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.has(o.id)} onChange={() => toggle(o.id)} /></td>
          <td className="mono text-[12.5px]">{o.orderNo}{factoryUnread(o) && <div><Pill tone="risk">changed</Pill></div>}</td>
          <td className="text-[12.5px]" style={{ whiteSpace:'normal' }}>{o.customer}<div style={{ color:'var(--ink-faint)' }}>{store(o.storeId)}</div></td>
          <td className="text-[12.5px]" style={{ whiteSpace:'normal' }}>{o.styleName}<div className="mono text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{f?.code} · {o.consumptionM} m</div></td>
          <td style={{ color: late ? 'var(--risk)' : undefined }}>{fmtDate(o.promisedOn)}{(o.promiseRevisions?.length ?? 0) > 0 && <span className="pill warn ml-1">moved</span>}{late && <div className="text-[11px]">{daysAgo(o.promisedOn)}d late</div>}</td>
          <td><Pill tone={STAGE_TONE[o.stage] ?? 'neutral'}>{stageLabel(o.stage)}</Pill>{needsReprint(o) && <div><Pill tone="risk">{sheetVersion(o)} — new sheet</Pill></div>}</td>
          <td className="num" style={{ color: d != null && d > AGING_DAYS ? 'var(--risk)' : undefined }}>{d != null ? `${d}d` : '—'}</td>
          <td onClick={e => e.stopPropagation()}>{mine && (o.stage === 'in-transit' ? <Button size="sm" onClick={() => scanOrders([o.id], 'in-factory')}>Received</Button>
            : o.stage === 'in-factory' ? <Button size="sm" variant="primary" onClick={() => scanOrders([o.id], 'out-factory')}>Out</Button> : null)}</td>
        </tr>); })}</tbody>
    </table></div></Card>}
    <div className="mt-3"><Note>Select a few and scan them together — that is the bundle coming in or going out.</Note></div>
  </>;
}

/* ---------- Changed after it reached us ------------------------------------ */
function ChangesTab({ orders, mine, onOpen }: { orders: CustomerOrder[]; mine: boolean; onOpen: (id: string) => void }) {
  const { markFactoryRead } = useApp();
  const ex = useExamples(orders, o => needsReprint(o) ? 'new sheet' : o.stage, { noun: 'changed pieces', done: o => !needsReprint(o) });
  if (orders.length === 0) return <Card><Empty title="Nothing has changed on this floor's pieces." body="A customer who changes their mind after the bundle reaches you lands here — the collar, the cuff, a measurement or a remark — so nobody cuts to yesterday's sheet." /></Card>;
  return <>
    <div className="flex justify-end items-center gap-3 mb-2">{ex.strip}{mine && <Button size="sm" variant="ghost" onClick={() => markFactoryRead(orders.map(o => o.id))}>Mark all {orders.length} read</Button>}</div>
    <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><th>Order</th><th>Customer · store</th><th>What changed</th><th>Why · who</th><th>When</th><th>Stage</th><th></th></tr></thead>
      <tbody>{ex.rows.map(o => { const rev = o.revisions[o.revisions.length - 1]; return (
        <tr key={o.id} className="row" onClick={() => onOpen(o.id)}>
          <td className="mono text-[12.5px]">{o.orderNo}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{o.styleName}</div></td>
          <td className="text-[12.5px]" style={{ whiteSpace:'normal' }}>{o.customer}<div style={{ color:'var(--ink-faint)' }}>{store(o.storeId)}</div></td>
          <td style={{ whiteSpace:'normal', minWidth: 210 }}>{rev.changes.map((c, i) => <div key={i} className="text-[12.5px]"><b>{c.field}</b> <span style={{ color:'var(--ink-faint)' }}>{c.from}</span> → <span style={{ color:'var(--accent)' }}>{c.to}</span></div>)}
            {o.remarks && <div className="text-[11px]" style={{ color:'var(--ink-soft)' }}>remark: “{o.remarks}”</div>}</td>
          <td className="text-[12px]" style={{ whiteSpace:'normal', minWidth: 150 }}>“{rev.note}”<div style={{ color:'var(--ink-faint)' }}>{rev.by}</div></td>
          <td className="text-[12px]">{fmtRel(rev.at)}</td>
          <td><Pill tone={STAGE_TONE[o.stage] ?? 'neutral'}>{stageLabel(o.stage)}</Pill>{needsReprint(o) && <div><Pill tone="risk">sheet not re-issued</Pill></div>}</td>
          <td onClick={e => e.stopPropagation()}>{mine && <Button size="sm" variant="primary" onClick={() => markFactoryRead([o.id])}>Acknowledged</Button>}</td>
        </tr>); })}</tbody>
    </table></div></Card>
    <div className="mt-3"><Note>Work to the revision on the order, not the paper in the bundle; marking it read stops the unit chasing.</Note></div>
  </>;
}

/* ---------- Ask for extra cloth -------------------------------------------- */
function AskTab({ v, mine, orders, rows, onOpen }: { v: { id: string; name: string }; mine: boolean; orders: CustomerOrder[]; rows: ExtraFabricRequest[]; onOpen: (id: string) => void }) {
  const { db, raiseExtraFabric } = useApp();
  /* An order number is what the floor works from, and one order can carry several
     shirts in several fabrics — a customer's whole visit, punched together. So:
     pick the order; if it has more than one cloth in it, then pick the cloth. */
  const groups = (() => {
    const m = new Map<string, { key: string; orderNo: string; customer: string; storeId: string; pieces: CustomerOrder[] }>();
    orders.forEach(o => { const key = `${o.customer}|${o.storeId}|${o.punchedOn.slice(0, 10)}`;
      const g = m.get(key) ?? { key, orderNo: o.orderNo, customer: o.customer, storeId: o.storeId, pieces: [] };
      g.pieces.push(o); if (o.orderNo < g.orderNo) g.orderNo = o.orderNo; m.set(key, g); });
    return [...m.values()].sort((a, b) => a.orderNo.localeCompare(b.orderNo));
  })();
  const [search, setSearch] = useState('');
  const shown = groups.filter(g => !search.trim() || `${g.orderNo} ${g.customer}`.toLowerCase().includes(search.trim().toLowerCase()));
  const [groupKey, setGroupKey] = useState(groups[0]?.key ?? '');
  const g = groups.find(x => x.key === groupKey) ?? shown[0];
  const [orderId, setOrderId] = useState(g?.pieces[0]?.id ?? '');
  const pickGroup = (k: string) => { setGroupKey(k); const gg = groups.find(x => x.key === k); if (gg) setOrderId(gg.pieces[0].id); };
  const many = (g?.pieces.length ?? 0) > 1;
  const o = orders.find(x => x.id === orderId) ?? g?.pieces[0];
  const f = db.fabrics.find(x => x.id === o?.fabricId);
  const [panel, setPanel] = useState<ExtraFabricRequest['panel']>('Single front');
  const [metres, setMetres] = useState(String(PANEL_METRES['Single front']));
  const [reason, setReason] = useState<ExtraFabricRequest['reason']>('Damaged / yarn pull — factory error');
  const [note, setNote] = useState('');
  const TONE: Record<string, Tone> = { requested:'warn', approved:'good', sent:'neutral', declined:'risk' };
  const sorted = [...rows].sort((a, b) => b.raisedOn.localeCompare(a.raisedOn));
  const ex = useExamples(sorted, r => r.status, { noun: 'requests', done: r => r.status === 'sent' });
  return <>
    {mine && <Card className="mb-3"><div className="px-4 py-2.5" style={{ borderBottom:'1px solid var(--line-soft)' }}><h3 className="m-0">Ask the production unit for cloth</h3>
      <div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>the order number first — if that order has more than one cloth in it, say which one is short</div></div>
      <div className="pad">
        <div className="grid gap-2.5 items-end" style={{ gridTemplateColumns:'1fr 1fr' }}>
          <Field label="Order number" hint={`${groups.length} orders on this floor`}>
            <div className="flex gap-1">
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="find BSC-… or a name" style={{ width: 150 }} />
              <Select value={g?.key ?? ''} onChange={pickGroup} options={shown.map(x => ({ value:x.key, label:`${x.orderNo} · ${x.customer}${x.pieces.length > 1 ? ` · ${x.pieces.length} pieces` : ''}` }))} />
            </div></Field>
          {many
            ? <Field label="Which cloth" hint={`${g!.pieces.length} pieces on this order — pick the one that is short`}>
                <Select value={orderId} onChange={setOrderId} options={g!.pieces.map(x => ({ value:x.id, label:`${db.fabrics.find(y => y.id === x.fabricId)?.name ?? x.styleName} · ${x.consumptionM} m` }))} /></Field>
            : <Field label="Cloth on this order" hint={f ? `${f.code} · ${o?.consumptionM} m on the sheet` : undefined}>
                <div className="text-[13px] py-1.5">{f?.name ?? o?.styleName ?? '—'}</div></Field>}
          <Field label="Panel"><Select value={panel} onChange={x => { setPanel(x as ExtraFabricRequest['panel']); setMetres(String(PANEL_METRES[x])); }} options={EXTRA_FABRIC_PANELS.map(x => ({ value:x, label:x }))} /></Field>
          <Field label="Metres" hint="80 cm single · 90 cm full width"><Input type="number" step="0.1" value={metres} onChange={e => setMetres(e.target.value)} className="input mono" /></Field>
          <div style={{ gridColumn:'1 / -1' }}><Field label="Reason — whose error" hint="factory errors go on your record; PP errors go back to the consumption formula">
            <Select value={reason} onChange={x => setReason(x as ExtraFabricRequest['reason'])} options={EXTRA_FABRIC_REASONS.map(x => ({ value:x, label:x }))} /></Field></div>
          <div style={{ gridColumn:'1 / -1' }}><Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="optional" /></Field></div>
        </div>
        <div className="pt-2"><Button variant="primary" size="sm" disabled={!o} onClick={() => { raiseExtraFabric({ orderId: o!.id, metres: Number(metres), reason, panel, note: note.trim() }); setNote(''); }}>Ask for {metres} m{f ? ` of ${f.name}` : ''}</Button></div>
      </div>
    </Card>}

    <Card><div className="px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap" style={{ borderBottom:'1px solid var(--line-soft)' }}><h3 className="m-0">What we have asked for</h3>{ex.strip}</div>
      {rows.length === 0 ? <Empty title="Nothing asked for." body="" /> : <div style={{ overflowX:'auto' }}><table className="t compact">
        <thead><tr><th>Asked</th><th>Piece · fabric</th><th>Panel</th><th className="num">Metres</th><th>Reason</th><th>Status</th></tr></thead>
        <tbody>{ex.rows.map(r => { const ord = (db.customerOrders ?? []).find(x => x.id === r.orderId); const fb = db.fabrics.find(x => x.id === r.fabricId); return (
          <tr key={r.id} className="row" onClick={() => ord && onOpen(ord.id)}>
            <td className="text-[12.5px]">{fmtRel(r.raisedOn)}<div style={{ color:'var(--ink-faint)' }}>{r.raisedBy}</div></td>
            <td className="text-[12.5px]" style={{ whiteSpace:'normal' }}>{ord?.orderNo}<div style={{ color:'var(--ink-faint)' }}>{fb?.name}</div></td>
            <td className="text-[12.5px]">{r.panel}</td><td className="num">{r.metres} m</td>
            <td className="text-[12px]" style={{ whiteSpace:'normal', maxWidth: 220 }}><span style={{ color: r.reason.includes('factory') ? 'var(--risk)' : 'var(--warn)' }}>{r.reason}</span>{r.note && <div style={{ color:'var(--ink-faint)' }}>{r.note}</div>}</td>
            <td><Pill tone={TONE[r.status]}>{r.status}</Pill>{r.decidedOn && <div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{fmtRel(r.decidedOn)}</div>}</td>
          </tr>); })}</tbody>
      </table></div>}
    </Card>
    <div className="mt-3"><Note>Planning's approval is the inventory event — the metres leave the unit's shelf the moment they say yes.</Note></div>
  </>;
}

/* ---------- one order, as the floor needs it -------------------------------
   The floor does not work from a summary — it works from the order sheet: the
   customer's measurements, the pattern flags and every option they picked. It
   travels with the bundle on paper today; here it is the same sheet, with the
   changes the store made since marked on it. */
function OrderPanel({ o, mine }: { o: CustomerOrder; mine: boolean }) {
  const { db, markFactoryRead, scanOrders } = useApp();
  const f = db.fabrics.find(x => x.id === o.fabricId);
  const revs = o.revisions ?? [];
  const changedFields = new Set(revs.flatMap(r => r.changes.map(c => c.field)));
  return <>
    <Card><div className="pad">
      <div className="grid gap-2" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <div><div className="label">Fabric</div><div className="text-[13px]">{o.styleName}<div className="mono text-[11px]" style={{ color:'var(--ink-faint)' }}>{f?.code} · {o.consumptionM} m</div></div></div>
        <div><div className="label">Fit · qty</div><div className="text-[13px]">{o.fit ?? '—'} · {o.qty}</div></div>
        <div><div className="label">Ship by</div><div className="text-[13px]" style={{ color: daysAgo(o.promisedOn) > 0 ? 'var(--risk)' : undefined }}>{fmtDate(o.promisedOn)}</div></div>
        <div><div className="label">Stage</div><div><Pill tone={STAGE_TONE[o.stage] ?? 'neutral'}>{stageLabel(o.stage)}</Pill></div></div>
        <div style={{ gridColumn:'1 / -1' }}><div className="label">Remarks from the store</div><div className="text-[13px]">{o.remarks || '—'}</div></div>
      </div>
      {mine && <div className="flex gap-2 pt-3">
        {o.stage === 'in-transit' && <Button size="sm" onClick={() => scanOrders([o.id], 'in-factory')}>Received on the floor</Button>}
        {o.stage === 'in-factory' && <Button size="sm" variant="primary" onClick={() => scanOrders([o.id], 'out-factory')}>Out of the factory</Button>}
        {factoryUnread(o) && <Button size="sm" onClick={() => markFactoryRead([o.id])}>Mark the change read</Button>}
      </div>}
    </div></Card>
    {o.spec && <Card className="mt-3" data-section="Order sheet · the job card">
      <div className="px-4 py-2.5 flex items-center justify-between gap-2 no-print" style={{ borderBottom:'1px solid var(--line-soft)' }}>
        <div><h3 className="m-0">Order sheet · the job card</h3>
          <div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>what the piece is cut and stitched to{changedFields.size > 0 ? ' — the fields the store changed are marked' : ''}</div></div>
        <Button size="sm" variant="ghost" onClick={() => window.print()}>🖨 Print</Button>
      </div>
      <div className="px-4 py-3"><SheetView o={o} changed={changedFields} /></div>
    </Card>}
    {revs.length > 0 && <Card className="mt-3"><div className="px-4 py-2.5" style={{ borderBottom:'1px solid var(--line-soft)' }}><h3 className="m-0">Every change the store made</h3></div>
      <table className="t compact"><tbody>{[...revs].reverse().map(r => <tr key={r.rev}>
        <td className="text-[12px]" style={{ whiteSpace:'normal' }}>V{r.rev + 1} · {fmtRel(r.at)}<div style={{ color:'var(--ink-faint)' }}>{r.by}</div></td>
        <td style={{ whiteSpace:'normal' }}>{r.changes.map((c, i) => <div key={i} className="text-[12.5px]"><b>{c.field}</b> <span style={{ color:'var(--ink-faint)' }}>{c.from}</span> → <span style={{ color:'var(--accent)' }}>{c.to}</span></div>)}
          <div className="text-[11px]" style={{ color:'var(--ink-soft)' }}>“{r.note}”</div></td>
        <td>{r.reprint && <Pill tone="risk">new sheet</Pill>}</td>
      </tr>)}</tbody></table></Card>}
    <div className="mt-3"><ThreadPanel kind="order" subjectId={o.id} steps={['General']} /></div>
  </>;
}


/* ---------- RTW purchase orders on this floor: the fabric, the documents, the TNA ---- */
function RtwTab({ rows, onOpen, done }: { rows: ProductionOrder[]; onOpen: (id: string) => void; done?: boolean }) {
  const { db } = useApp();
  const { setFactory } = useApp();
  const elsewhere = db.vendors.filter(v => v.kind.endsWith('factory') && db.orders.some(o => o.vendorId === v.id && o.status === (done ? 'Closed' : 'Open'))).map(v => ({ v, n: db.orders.filter(o => o.vendorId === v.id && o.status === (done ? 'Closed' : 'Open')).length }));
  if (rows.length === 0) return <Card><Empty title={done ? 'Nothing delivered from this floor yet.' : 'No ready-to-wear PO on this floor right now.'} body={done ? '' : 'A bulk PO appears here the moment design raises it to this factory — with the documents, and the cloth to come.'} />
    {elsewhere.length > 0 && <div className="px-4 pb-4 text-[12.5px]" style={{ color:'var(--ink-soft)' }}>Floors with {done ? 'delivered' : 'open'} POs: {elsewhere.map(x => <button key={x.v.id} type="button" className="vlink" style={{ marginRight: 10 }} onClick={() => setFactory(x.v.id)}>{x.v.name} · {x.n}</button>)}</div>}
  </Card>;
  /* the factory's own words for where the cloth is — not sourcing's */
  const cloth = (o: ProductionOrder): { text: string; tone: Tone } => { const f = fabricStateOf(o);
    switch (f.key) {
      case 'received': return { text:`cloth in · ${o.fabricSupply?.receipt?.metresOk ?? ''} m`, tone:'good' };
      case 'sent': return { text:`cloth on its way · ${o.fabricSupply?.metresSent ?? ''} m — count it in`, tone:'warn' };
      case 'short': return { text:`cloth short · ${f.short} m`, tone:'risk' };
      case 'ratio-asked': return { text:'waiting on design for the cut', tone:'warn' };
      case 'ratio-given': return { text:'new cut ratio coming', tone:'info' };
      case 'vendor-sources': return { text:'you buy the cloth', tone:'neutral' };
      default: return { text:'cloth not sent yet', tone:'neutral' };
    } };
  return <>
    <Card><table className="t">
      <thead><tr><th>PO</th><th>Style</th><th className="num">Pcs</th><th>In-house by</th><th>Cloth</th><th>Trims</th><th>Documents</th><th>Risk</th></tr></thead>
      <tbody>{rows.map(o => { const r = riskOf(o); const d = rtwDocsOf(db, o); const trims = (o.materials ?? []).filter(m => o.bom[m.bomIndex]?.kind !== 'fabric'); const got = trims.filter(m => m.receivedOn).length; const c = cloth(o); return <tr key={o.id} className="row" onClick={() => onOpen(o.id)}>
        <td className="mono text-[12.5px]" style={{ whiteSpace:'nowrap' }}>{o.poNo}</td>
        <td><div className="font-medium">{o.styleName}</div><div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{o.category}</div></td>
        <td className="num">{o.orderQty}</td>
        <td style={{ whiteSpace:'nowrap' }}>{fmtDate(o.targetInhouse)}</td>
        <td style={{ minWidth: 150 }}><Pill tone={c.tone}>{c.text}</Pill></td>
        <td style={{ whiteSpace:'nowrap' }}>{trims.length ? <span style={{ color: got === trims.length ? 'var(--good)' : got ? 'var(--warn)' : 'var(--ink-faint)' }}>{got}/{trims.length} in</span> : '—'}</td>
        <td>{d.owedAfterPo.length ? <span className="text-[12.5px]" style={{ color:'var(--risk)' }}>waiting for {d.owedAfterPo.join(', ').toLowerCase()}</span> : <span className="text-[12.5px]" style={{ color:'var(--good)' }}>all in</span>}</td>
        <td><Pill tone={r.risk === 'on-track' ? 'good' : r.risk === 'delayed' || r.risk === 'critical' ? 'risk' : r.risk === 'closed' ? 'neutral' : 'warn'}>{r.risk === 'closed' ? 'delivered' : r.risk.replace('-', ' ')}</Pill></td>
      </tr>; })}</tbody>
    </table></Card>
    {!done && <div className="mt-3"><Note>Open a PO to see what design asked for, count in the cloth and trims, and keep the dates current.</Note></div>}
  </>;
}

/* the merchandiser's view of one PO: what was asked, what is coming, what has landed, the dates */
function RtwPoPanel({ o, mine }: { o: ProductionOrder; mine: boolean }) {
  const { db, receiveMaterial } = useApp();
  const d = rtwDocsOf(db, o); const fab = fabricStateOf(o); const fst = factoryStateOf(o); void fst;
  const trims = (o.materials ?? []).map(m => ({ m, line: o.bom[m.bomIndex] })).filter(x => x.line && x.line.kind !== 'fabric');
  const got = trims.filter(x => x.m.receivedOn).length;
  const faint = { color:'var(--ink-faint)' } as const;
  return <>
    <Section title="1 · What design asked for" ownerRole="design" defaultOpen right={<Pill tone={d.owedAfterPo.length ? 'risk' : 'good'}>{d.owedAfterPo.length ? `${d.owedAfterPo.length} document${d.owedAfterPo.length === 1 ? '' : 's'} owed` : 'documents complete'}</Pill>}>
      <KV k="Style / colour" v={o.styleName} note={`${o.category} · ${o.subCategory}`} />
      <KV k="Order qty" v={`${o.orderQty} pcs`} />
      <KV k="Target inhouse date" v={fmtDate(o.targetInhouse)} />
      <KV k="Agreed cost" v={o.finalFob != null ? fmtMoney(o.finalFob) : '—'} note="per piece, as agreed with production" />
      {o.fit && <KV k="Fit" v={o.fit} />}
      <div className="label pt-2">Size ratio{(o.cutRatios ?? []).some(c => c.given) ? ' · revised' : ''}</div>
      <SizeGrid breakup={o.sizeBreakup} />
      {(o.cutRatios ?? []).filter(c => c.given && c.sentToFactoryOn).map((c, i) => <div key={i} className="text-[11.5px]" style={{ color:'var(--warn)' }}>cut ratio revised {fmtDate(c.sentToFactoryOn!)} — {c.reason}</div>)}
      <div className="label pt-3">Documents · job card, trim card, BOM, tech pack</div>
      <DocsChecklist o={o} editable={false} />
      <div className="label pt-3">Bill of materials</div>
      {o.bom.map((l, i) => <KV key={i} k={l.item} v={l.qtyPerPc != null ? `${l.qtyPerPc} ${l.unit} / pc` : '—'} note={l.spec ?? undefined} />)}
    </Section>

    <Section title="2 · Fabric & trims" ownerRole={fab.owner === 'merchandiser' ? 'production' : fab.owner} defaultOpen right={<div className="flex gap-2 items-center"><Pill tone={fab.tone}>{fab.label}</Pill><Pill tone={trims.length && got === trims.length ? 'good' : got ? 'warn' : 'neutral'}>trims {got}/{trims.length}</Pill></div>}>
      <div className="intro text-[12.5px] pb-2" style={{ color:'var(--ink-soft)' }}>The cloth comes straight from the mill sourcing bought it from; trims and packaging come from the unit. Count both in here — short or damaged cloth goes back to production for a new cut ratio.</div>
      <FabricFinalisationSection o={o} bare />
      <div className="pt-3 mt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div className="label">Trims & accessories · {got}/{trims.length} received</div>
        {trims.length === 0 ? <div className="py-1 text-[12.5px]" style={faint}>No trim lines on the BOM yet.</div> : trims.map(({ m, line }) => <div key={m.bomIndex} className="kv"><span className="k">{line.item}<div className="text-[11px]">{m.requiredQty} {line.unit} needed{line.spec ? ` · ${line.spec}` : ''}</div></span>
          <span className="v flex gap-1 items-center justify-end">{m.receivedOn ? <Pill tone={m.checked === 'ok' ? 'good' : 'risk'}>{m.checked === 'ok' ? `received ${fmtDate(m.receivedOn)}` : 'received · not OK'}</Pill> : <Pill tone="neutral">not yet</Pill>}
            {mine && !m.receivedOn && <><Button size="sm" onClick={() => receiveMaterial(o.id, m.bomIndex, 'ok')}>Received</Button><Button size="sm" variant="ghost" onClick={() => receiveMaterial(o.id, m.bomIndex, 'fail')}>Short / wrong</Button></>}</span></div>)}
        {!mine && trims.some(x => !x.m.receivedOn) && <ActsBy role="merchandiser" does="ticks each trim line as it lands at the factory" />}
        {trims.length > 0 && got === trims.length && <div className="pt-2"><Note tone="good">All trims in — the sheet's Trims Readiness reads Yes.</Note></div>}
      </div>
    </Section>

    <Section title="3 · TNA milestones" ownerRole="production" defaultOpen right={null}>
      <MilestoneGrid o={o} editable={mine} bare />
    </Section>

    <RecordTail kind="order" subjectId={o.id} labels={FILE_LABELS.order} editable={mine} steps={ORDER_STEPS} activity={o.activity} />
  </>;
}
