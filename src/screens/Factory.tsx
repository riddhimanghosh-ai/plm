/* The factory merchandiser's screen — the person at Mahendra or Richman who
   today runs the day on WhatsApp: a photo of the day's output, a call when the
   power is out, an email when a panel is short, and no sight at all of a change
   the store made after the bundle left the unit. All four, on the record. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { Attachment, CustomerOrder, Db, ExtraFabricRequest, ProductionOrder } from '../domain/types';
import { useFileUrl } from '../domain/files';
import { FabricFinalisationSection, DocsChecklist, SizeGrid } from './RtwGates';
import { MilestoneGrid } from './Tracker';
import { fabricStateOf, otifOf, riskOf, rtwDocsOf, factoryStateOf, fmtMoney } from '../domain/engines';
import { factoryLoadOf, needsReprint, sheetRev, sheetVersion, fmtDate, fmtRel, daysAgo, iso, TODAY } from '../domain/engines';
import { EXTRA_FABRIC_PANELS, EXTRA_FABRIC_REASONS, TRIM_ASK_REASONS, PANEL_METRES, AGING_DAYS, MTM_STAGES, STORES } from '../domain/reference';
import { Page, Card, Pill, Button, Note, Tabs, Empty, Drawer, Field, Input, Select, useExamples, Seg, Section, KV, type Tone } from '../ui';
import { RecordTail } from './RecordTail';
import { FILE_LABELS, ORDER_STEPS } from '../domain/reference';
import { ThreadPanel } from './Thread';
import { SheetView } from './OrderSheet';
import { VendorLink } from './Vendors';
import { ActsBy } from './Who';
import { MTM_ONLY, RTW_ONLY } from '../domain/edition';

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
  const factories = db.vendors.filter(v => (RTW_ONLY ? v.kind.endsWith('factory') : (v.mtm || (!MTM_ONLY && v.kind.endsWith('factory')))) && v.kind !== 'Hemming unit');
  const v = factories.find(x => x.id === factoryId) ?? factories[0];
  if (!v) return <Page title="My factory"><Card><Empty title="No MTM factory." body="" /></Card></Page>;
  const l = factoryLoadOf(db, v.id);
  const orders = [...l.inTransit, ...l.wip, ...l.ready].sort((a, b) => a.promisedOn.localeCompare(b.promisedOn));
  const xf = (db.extraFabric ?? []).filter(r => r.factoryId === v.id);
  const openOrder = (db.customerOrders ?? []).find(o => o.id === params.get('open')) ?? null;
  const rtw = db.orders.filter(o => o.vendorId === v.id && o.status === 'Open').sort((a, b) => a.targetInhouse.localeCompare(b.targetInhouse));
  const rtwDone = db.orders.filter(o => o.vendorId === v.id && o.status === 'Closed').sort((a, b) => (b.poDate ?? '').localeCompare(a.poDate ?? ''));
  /* two different jobs on one floor: customer shirts by the piece, and bulk POs by the hundred */
  const side: 'mtm' | 'rtw' = MTM_ONLY ? 'mtm' : RTW_ONLY ? 'rtw' : ((sideParam as 'mtm' | 'rtw' | null) ?? (v.mtm ? 'mtm' : 'rtw'));
  const setSide = (k: string) => { const n = new URLSearchParams(params); n.set('side', k); n.delete('tab'); n.delete('open'); setParams(n, { replace:true }); };
  const openRtw = [...rtw, ...rtwDone].find(o => o.id === params.get('open')) ?? null;
  const keyed = (db.factoryOutputs ?? []).filter(f => f.factoryId === v.id).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Page title={`My factory · ${v.name}`} lede="Everything this floor owes the production unit and everything it is owed."
      replaces="the WhatsApp output photo, the call about a power cut, the extra-material email"
      actions={<div style={{ width: 220 }}><Field label="Factory"><Select value={v.id} onChange={setFactory} options={factories.map(f => ({ value:f.id, label:f.name }))} /></Field></div>}>
      {!mine && <div className="mb-2"><ActsBy role="merchandiser" does="runs this floor — keys in the day's output and asks for cloth" inline /></div>}

      {!MTM_ONLY && !RTW_ONLY && <div className="mb-3"><Seg value={side} onChange={setSide} options={[
        { id:'mtm', label:'MTM · customer shirts, by the piece', count: orders.length, hint: v.mtm ? undefined : 'this factory does not stitch made-to-measure' },
        { id:'rtw', label:'RTW · bulk purchase orders', count: rtw.length },
      ]} /></div>}

      {side === 'mtm' && <>
        <Tabs active={tab} onChange={t => set('tab', t)} tabs={[
          { id:'today', label:"Today · output and the day's status" },
          { id:'orders', label:'Pieces allocated to us', count: orders.length },
          { id:'fabric', label:'Ask for extra material', count: xf.filter(r => r.status === 'requested').length },
        ]} />
        {tab === 'today' && <TodayTab v={v} mine={mine} keyed={keyed} scanned={l.outToday} avg={l.avgOut} />}
        {tab === 'orders' && <OrdersTab orders={orders} mine={mine} onOpen={id => set('open', id)} />}
        {tab === 'fabric' && <AskTab v={v} mine={mine} orders={orders} rows={xf} onOpen={id => set('open', id)} />}
      </>}

      {side === 'rtw' && <>
        <Tabs active={tab === 'today' ? 'rtw' : tab === 'rtw-done' ? 'rtw' : tab} onChange={t => set('tab', t)} tabs={[
          { id:'rtw', label:'POs on our floor', count: rtw.length, hint:'every PO with where its cloth, materials and documents stand' },
          { id:'fabric', label:'Fabric in · cut short', count: rtw.filter(o => (o.fabricSupply?.sentToFactoryOn && !o.fabricSupply.receipt) || fabricStateOf(o).key === 'short').length || undefined, hint:'count the cloth and materials in; ask design when short' },
          { id:'tna', label:'TNA update', count: rtw.reduce((a, o) => a + o.milestones.filter(m => !m.actual && new Date(m.revised ?? m.plan) < new Date()).length, 0) || undefined, hint:'log each step as it happens' },
        ]} />
        {(tab === 'today' || tab === 'rtw' || tab === 'rtw-done') && <>
          <div className="mb-2"><Seg value={tab === 'rtw-done' ? 'done' : 'floor'} onChange={k => set('tab', k === 'done' ? 'rtw-done' : 'rtw')} options={[{ id:'floor', label:'On the floor', count: rtw.length }, { id:'done', label:'Delivered', count: rtwDone.length }]} /></div>
          {tab === 'rtw-done' ? <RtwTab rows={rtwDone} onOpen={id => set('open', id)} done /> : <RtwTab rows={rtw} onOpen={id => set('open', id)} />}
        </>}
        {tab === 'fabric' && (rtw.length === 0 ? <Card><Empty title="No PO on this floor." body="" /></Card> : rtw.map(o => <Card key={o.id} className="mb-3"><PoStrip o={o} onOpen={() => set('open', o.id)} /><MaterialsPanel o={o} mine={mine} /></Card>))}
        {tab === 'tna' && (rtw.length === 0 ? <Card><Empty title="No PO on this floor." body="" /></Card> : rtw.map(o => <Card key={o.id} className="mb-3"><PoStrip o={o} onOpen={() => set('open', o.id)} /><div className="px-4 pb-3"><MilestoneGrid o={o} editable={mine} bare /></div></Card>))}
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
  const [only, setOnly] = useState<'all' | 'transit' | 'floor' | 'ready' | 'late'>('all');
  const inAt = (o: CustomerOrder) => o.scans.find(sc => sc.stage === 'in-factory')?.at;
  const rows = orders.filter(o => only === 'all' ? true : only === 'transit' ? o.stage === 'in-transit' : only === 'floor' ? o.stage === 'in-factory'
    : only === 'ready' ? o.stage === 'out-factory' || o.stage === 'rts' : daysAgo(o.promisedOn) > 0);
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ex = useExamples(rows, o => daysAgo(o.promisedOn) > 0 ? 'late' : o.stage, { noun: 'pieces', done: o => o.stage === 'out-factory' || o.stage === 'rts' });
  const count = (k: typeof only) => orders.filter(o => k === 'all' ? true : k === 'transit' ? o.stage === 'in-transit' : k === 'floor' ? o.stage === 'in-factory'
    : k === 'ready' ? o.stage === 'out-factory' || o.stage === 'rts' : daysAgo(o.promisedOn) > 0).length;
  const fabric = (o: CustomerOrder) => db.fabrics.find(f => f.id === o.fabricId);
  return <>
    <div className="flex gap-1.5 flex-wrap mb-2 items-center">
      {([['all', 'Everything'], ['transit', 'On its way here'], ['floor', 'On the floor'], ['ready', 'Ready to go back'], ['late', 'Past ship-by']] as const)
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
          <td className="mono text-[12.5px]">{o.orderNo}{o.logisticComment && <div><span className="pill info" title={o.logisticComment} style={{ fontSize: 10.5 }}>logistics remark</span></div>}</td>
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


/* ---------- Ask for extra material: fabric or trims ------------------------- */
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
  /* fabric or a trim: a trim ask names the trim and the pieces */
  const [mat, setMat] = useState<'fabric' | 'trim'>('fabric');
  const trims = db.trims ?? [];
  const [trimId, setTrimId] = useState(trims[0]?.id ?? '');
  const [qty, setQty] = useState('10');
  const [treason, setTreason] = useState<ExtraFabricRequest['reason']>(TRIM_ASK_REASONS[0]);
  const trim = trims.find(t => t.id === trimId);
  const TONE: Record<string, Tone> = { requested:'warn', approved:'good', sent:'neutral', declined:'risk' };
  const sorted = [...rows].sort((a, b) => b.raisedOn.localeCompare(a.raisedOn));
  const ex = useExamples(sorted, r => r.status, { noun: 'requests', done: r => r.status === 'sent' });
  return <>
    {mine && <Card className="mb-3"><div className="px-4 py-2.5" style={{ borderBottom:'1px solid var(--line-soft)' }}><h3 className="m-0">Ask the production unit for extra material</h3>
      <div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>the order number first, then fabric or a trim</div></div>
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
          <div style={{ gridColumn:'1 / -1' }}><Seg value={mat} onChange={v => setMat(v as 'fabric' | 'trim')} options={[{ id:'fabric', label:'Fabric' }, { id:'trim', label:'Trim' }]} /></div>
          {mat === 'trim' ? <>
            <Field label="Trim"><Select value={trimId} onChange={setTrimId} options={trims.map(t => ({ value:t.id, label:`${t.name} · ${t.kind}` }))} /></Field>
            <Field label="Pieces"><Input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} className="input mono" /></Field>
            <div style={{ gridColumn:'1 / -1' }}><Field label="Reason"><Select value={treason} onChange={x => setTreason(x as ExtraFabricRequest['reason'])} options={TRIM_ASK_REASONS.map(x => ({ value:x, label:x }))} /></Field></div>
          </> : <>
          <Field label="Panel"><Select value={panel} onChange={x => { setPanel(x as ExtraFabricRequest['panel']); setMetres(String(PANEL_METRES[x])); }} options={EXTRA_FABRIC_PANELS.map(x => ({ value:x, label:x }))} /></Field>
          <Field label="Metres" hint="80 cm single · 90 cm full width"><Input type="number" step="0.1" value={metres} onChange={e => setMetres(e.target.value)} className="input mono" /></Field>
          <div style={{ gridColumn:'1 / -1' }}><Field label="Reason — whose error" hint="factory errors go on your record; PP errors go back to the consumption formula">
            <Select value={reason} onChange={x => setReason(x as ExtraFabricRequest['reason'])} options={EXTRA_FABRIC_REASONS.map(x => ({ value:x, label:x }))} /></Field></div>
          </>}
          <div style={{ gridColumn:'1 / -1' }}><Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="optional" /></Field></div>
        </div>
        <div className="pt-2">{mat === 'trim'
          ? <Button variant="primary" size="sm" disabled={!o || !trim || !(Number(qty) > 0)} onClick={() => { raiseExtraFabric({ orderId: o!.id, metres: 0, reason: treason, panel: 'Trim', note: note.trim(), material: 'trim', trimId, qty: Number(qty) }); setNote(''); }}>Ask for {qty} {trim?.name ?? 'pieces'}</Button>
          : <Button variant="primary" size="sm" disabled={!o} onClick={() => { raiseExtraFabric({ orderId: o!.id, metres: Number(metres), reason, panel, note: note.trim() }); setNote(''); }}>Ask for {metres} m{f ? ` of ${f.name}` : ''}</Button>}</div>
      </div>
    </Card>}

    <Card><div className="px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap" style={{ borderBottom:'1px solid var(--line-soft)' }}><h3 className="m-0">What we have asked for</h3>{ex.strip}</div>
      {rows.length === 0 ? <Empty title="Nothing asked for." body="" /> : <div style={{ overflowX:'auto' }}><table className="t compact">
        <thead><tr><th>Asked</th><th>Piece · material</th><th>Panel / trim</th><th className="num">Qty</th><th>Reason</th><th>Status</th></tr></thead>
        <tbody>{ex.rows.map(r => { const ord = (db.customerOrders ?? []).find(x => x.id === r.orderId); const fb = db.fabrics.find(x => x.id === r.fabricId); const tr = r.material === 'trim' ? (db.trims ?? []).find(t => t.id === r.trimId) : null; return (
          <tr key={r.id} className="row" onClick={() => ord && onOpen(ord.id)}>
            <td className="text-[12.5px]">{fmtRel(r.raisedOn)}<div style={{ color:'var(--ink-faint)' }}>{r.raisedBy}</div></td>
            <td className="text-[12.5px]" style={{ whiteSpace:'normal' }}>{ord?.orderNo}<div style={{ color:'var(--ink-faint)' }}>{tr ? tr.kind : fb?.name}</div></td>
            <td className="text-[12.5px]">{tr ? tr.name : r.panel}</td><td className="num">{tr ? `${r.qty ?? 0} pcs` : `${r.metres} m`}</td>
            <td className="text-[12px]" style={{ whiteSpace:'normal', maxWidth: 220 }}><span style={{ color: r.reason.includes('factory') ? 'var(--risk)' : 'var(--warn)' }}>{r.reason}</span>{r.note && <div style={{ color:'var(--ink-faint)' }}>{r.note}</div>}</td>
            <td><Pill tone={TONE[r.status]}>{r.status}</Pill>{r.decidedOn && <div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{fmtRel(r.decidedOn)}</div>}{r.status === 'declined' && r.declineReason && <div className="text-[11px]" style={{ color:'var(--ink-soft)', whiteSpace:'normal', maxWidth: 220 }}>why: {r.declineReason}</div>}</td>
          </tr>); })}</tbody>
      </table></div>}
    </Card>
    <div className="mt-3"><Note>Production's approval is the inventory event: the fabric or trims leave the unit's shelf the moment it says yes.</Note></div>
  </>;
}

/* ---------- one order, as the floor needs it -------------------------------
   The floor does not work from a summary — it works from the order sheet: the
   customer's measurements, the pattern flags and every option they picked. It
   travels with the bundle on paper today; here it is the same sheet, with the
   changes the store made since marked on it. */
function OrderPanel({ o, mine }: { o: CustomerOrder; mine: boolean }) {
  const { db, scanOrders } = useApp();
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
        {/* after planning only the logistics remark can change, and it reaches the factory; measurements and styling stay locked */}
        {o.logisticComment && <div style={{ gridColumn:'1 / -1' }}><div className="label">Logistics remark</div><div className="text-[13px]">{o.logisticComment}</div></div>}
      </div>
      {mine && <div className="flex gap-2 pt-3">
        {o.stage === 'in-transit' && <Button size="sm" onClick={() => scanOrders([o.id], 'in-factory')}>Received on the floor</Button>}
        {o.stage === 'in-factory' && <Button size="sm" variant="primary" onClick={() => scanOrders([o.id], 'out-factory')}>Out of the factory</Button>}
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
    <RecordTail kind="order" fileKind="customerOrder" subjectId={o.id} labels={FILE_LABELS.customerOrder} editable={false} steps={['General']} />
  </>;
}


/* ---------- RTW purchase orders on this floor ----------------------------------------
   The merchant's whole job on a PO is three things: count in what landed (and say when it
   is short), log the dates as the work happens, and read the documents the cut needs.
   So the list answers "what do I need to do?" per PO, and the drawer leads with that. */
type Todo = { tab: 'dates' | 'materials' | 'docs'; text: string; tone: Tone };
function todosOf(db: Db, o: ProductionOrder): { todos: Todo[]; next: { key: string; due: string; overdue: boolean } | null; info: string[] } {
  const fab = fabricStateOf(o); const fs = o.fabricSupply; const todos: Todo[] = []; const info: string[] = [];
  const trims = (o.materials ?? []).filter(m => o.bom[m.bomIndex]?.kind !== 'fabric');
  const notIn = trims.filter(m => !m.receivedOn).length;
  const short = trims.filter(m => m.receivedOn && m.receivedQty != null && m.receivedQty < m.requiredQty);
  const openAsk = fab.cr && !fab.cr.given;
  if (fs?.sentToFactoryOn && !fs.receipt) todos.push({ tab:'materials', text:`Count the cloth in · ${fs.metresSent ?? '—'} m sent ${fmtDate(fs.sentToFactoryOn)}`, tone:'warn' });
  if (notIn) todos.push({ tab:'materials', text:`Count in ${notIn} material${notIn > 1 ? 's' : ''} as they land`, tone:'neutral' });
  if (fab.key === 'short' && !openAsk) todos.push({ tab:'materials', text:`Cloth short by ${fab.short} m · ask design for a cut ratio`, tone:'risk' });
  if (short.length && fab.key !== 'short' && !openAsk) todos.push({ tab:'materials', text:`${short.map(m => o.bom[m.bomIndex]?.item).join(', ')} short · propose a cut-short`, tone:'risk' });
  if (openAsk) info.push(`Your ${fab.cr!.kind === 'cut-short' ? 'cut-short' : 'cut ratio ask'} is with design`);
  const given = (o.cutRatios ?? []).filter(c => c.given && c.sentToFactoryOn).slice(-1)[0];
  if (given) info.push(`Design gave a new cut ratio on ${fmtDate(given.sentToFactoryOn!)} · cut ${given.given!.breakup.reduce((a, x) => a + x.qty, 0)} pcs`);
  const live = o.milestones.filter(m => !m.actual); const nxt = live[0] ?? null;
  const next = nxt ? { key: nxt.key, due: nxt.revised ?? nxt.plan, overdue: new Date(nxt.revised ?? nxt.plan) < new Date() } : null;
  if (next?.overdue && o.status !== 'Closed') todos.push({ tab:'dates', text:`Log ${next.key} · was due ${fmtDate(next.due)}${live.length > 1 ? `, then ${live.length - 1} more step${live.length > 2 ? 's' : ''}` : ''}`, tone:'warn' });
  const d = rtwDocsOf(db, o); if (d.owedAfterPo.length) info.push(`Still owed to you: ${d.owedAfterPo.join(', ').toLowerCase()}`);
  return { todos, next, info };
}

function RtwTab({ rows, onOpen, done }: { rows: ProductionOrder[]; onOpen: (id: string) => void; done?: boolean }) {
  const { db } = useApp();
  const { setFactory } = useApp();
  const elsewhere = db.vendors.filter(v => v.kind.endsWith('factory') && db.orders.some(o => o.vendorId === v.id && o.status === (done ? 'Closed' : 'Open'))).map(v => ({ v, n: db.orders.filter(o => o.vendorId === v.id && o.status === (done ? 'Closed' : 'Open')).length }));
  const faint = { color:'var(--ink-faint)' } as const;
  if (rows.length === 0) return <Card><Empty title={done ? 'Nothing delivered from this floor yet.' : 'No ready-to-wear PO on this floor right now.'} body={done ? '' : 'A bulk PO appears here the moment design raises it to this factory — with the documents, and the cloth to come.'} />
    {elsewhere.length > 0 && <div className="px-4 pb-4 text-[12.5px]" style={{ color:'var(--ink-soft)' }}>Floors with {done ? 'delivered' : 'open'} POs: {elsewhere.map(x => <button key={x.v.id} type="button" className="vlink" style={{ marginRight: 10 }} onClick={() => setFactory(x.v.id)}>{x.v.name} · {x.n}</button>)}</div>}
  </Card>;
  return <>
    <Card><table className="t">
      <thead>{done
        ? <tr><th>PO</th><th>Style</th><th className="num">Ordered</th><th className="num">Delivered</th><th>Due</th><th>Delivered on</th><th>On time · in full</th></tr>
        : <tr><th>PO</th><th>Style</th><th className="num">Pcs</th><th>Due</th><th>Fabric</th><th>Materials</th><th>Documents</th><th>Next step</th></tr>}</thead>
      <tbody>{rows.map(o => { const r = riskOf(o); const t = todosOf(db, o);
        if (done) { const landed = o.milestones.find(m => m.key === 'Inhouse ETA')?.actual ?? o.milestones.find(m => m.key === 'Dispatch')?.actual ?? null; const ot = otifOf(o); const late = landed && new Date(landed) > new Date(o.targetInhouse) ? Math.round((new Date(landed).getTime() - new Date(o.targetInhouse).getTime()) / 86400000) : 0;
          return <tr key={o.id} className="row" onClick={() => onOpen(o.id)}>
            <td className="mono text-[12.5px]" style={{ whiteSpace:'nowrap' }}>{o.poNo}</td>
            <td><div className="font-medium">{o.styleName}</div><div className="text-[11.5px]" style={faint}>{o.category}</div></td>
            <td className="num">{o.orderQty}</td>
            <td className="num">{o.deliveredQty ?? o.cutQty ?? o.orderQty}{o.rejectedQty ? <div className="text-[11px]" style={{ color:'var(--risk)' }}>{o.rejectedQty} rejected</div> : null}</td>
            <td style={{ whiteSpace:'nowrap' }}>{fmtDate(o.targetInhouse)}</td>
            <td style={{ whiteSpace:'nowrap' }}>{fmtDate(landed)}{late > 0 && <span className="pill risk ml-1">+{late}d</span>}</td>
            <td><Pill tone={ot === 'OTIF' ? 'good' : ot === 'Pending' ? 'neutral' : 'risk'}>{ot}</Pill></td>
          </tr>; }
        return <tr key={o.id} className="row" onClick={() => onOpen(o.id)}>
          <td className="mono text-[12.5px]" style={{ whiteSpace:'nowrap' }}>{o.poNo}</td>
          <td><div className="font-medium">{o.styleName}</div><div className="text-[11.5px]" style={faint}>{o.category}</div></td>
          <td className="num">{o.orderQty}</td>
          <td style={{ whiteSpace:'nowrap' }}>{fmtDate(o.targetInhouse)}{r.bufferDays != null && r.bufferDays < 0 && <div className="text-[11px]" style={{ color:'var(--risk)' }}>{-r.bufferDays}d late</div>}{r.bufferDays != null && r.bufferDays >= 0 && <div className="text-[11px]" style={faint}>{r.bufferDays}d to spare</div>}</td>
          <td>{(() => { const fab = fabricStateOf(o); const fs = o.fabricSupply; return <Pill tone={fs?.receipt ? (fab.short > 0 ? 'risk' : 'good') : fs?.sentToFactoryOn ? 'warn' : 'neutral'}>{fs?.receipt ? (fab.short > 0 ? `short ${fab.short} m` : `received · ${fs.receipt.metresOk} m`) : fs?.sentToFactoryOn ? `on its way · ${fs.metresSent ?? '—'} m` : 'pending'}</Pill>; })()}</td>
          <td>{(() => { const tr = (o.materials ?? []).filter(m => o.bom[m.bomIndex]?.kind !== 'fabric'); const inn = tr.filter(m => m.receivedOn).length; const sh = tr.filter(m => m.receivedOn && m.receivedQty != null && m.receivedQty < m.requiredQty).length; return <Pill tone={sh ? 'risk' : tr.length && inn === tr.length ? 'good' : inn ? 'warn' : 'neutral'}>{sh ? `${sh} short` : tr.length && inn === tr.length ? 'all received' : inn ? `${inn}/${tr.length} received` : `pending · ${tr.length}`}</Pill>; })()}</td>
          <td>{(() => { const d = rtwDocsOf(db, o); return d.owedAfterPo.length ? <span className="text-[12.5px]" style={{ color:'var(--risk)' }}>{d.owedAfterPo.join(', ').toLowerCase()} pending</span> : <span className="text-[12.5px]" style={{ color:'var(--good)' }}>all in</span>; })()}</td>
          <td>{t.next ? <><div className="font-medium text-[12.5px]" style={{ color: t.next.overdue ? 'var(--warn)' : undefined }}>{t.next.key}</div><div className="text-[11px]" style={faint}>{t.next.overdue ? 'was due' : 'due'} {fmtDate(t.next.due)}</div></> : <span style={faint}>all steps logged</span>}</td>
        </tr>; })}</tbody>
    </table></Card>
  </>;
}

/* the merchant's view of one PO: what to do first, then three plain tabs — dates, materials, documents */
function RtwPoPanel({ o, mine }: { o: ProductionOrder; mine: boolean }) {
  const { db } = useApp();
  const [tab, setTab] = useState<'dates' | 'materials' | 'docs'>('dates');
  const d = rtwDocsOf(db, o); const fs = o.fabricSupply; const r = riskOf(o); const t = todosOf(db, o);
  const trims = (o.materials ?? []).map(m => ({ m, line: o.bom[m.bomIndex] })).filter(x => x.line && x.line.kind !== 'fabric');
  const faint = { color:'var(--ink-faint)' } as const;
  const given = (o.cutRatios ?? []).filter(c => c.given && c.sentToFactoryOn).slice(-1)[0];
  const breakup = given?.given?.breakup ?? o.sizeBreakup;
  const docFiles = (db.attachments ?? []).filter(a => a.kind === 'order' && a.subjectId === o.id && FACTORY_DOCS.includes(a.label));
  const closed = o.status === 'Closed';

  return <>
    {/* the order in one line */}
    <div className="flex gap-5 flex-wrap items-baseline pb-3 text-[13px]">
      <span><b>{o.orderQty} pcs</b> {o.styleName}{o.fit ? <span style={faint}> · {o.fit}</span> : ''}</span>
      <span>due <b>{fmtDate(o.targetInhouse)}</b>{r.bufferDays != null && !closed && <span style={{ color: r.bufferDays < 0 ? 'var(--risk)' : 'var(--ink-faint)' }}> · {r.bufferDays < 0 ? `${-r.bufferDays} days late` : `${r.bufferDays} days to spare`}</span>}</span>
      {given && <span style={{ color:'var(--warn)' }}>cut ratio revised · {breakup.reduce((a, x) => a + x.qty, 0)} pcs</span>}
    </div>

    {/* what to do first */}
    {!closed && <Card className="mb-3" style={{ borderColor: t.todos.length ? 'var(--warn)' : 'var(--good)' }}><div className="px-4 py-3">
      <div className="label">What you need to do</div>
      {t.todos.length === 0 && <div className="text-[13px]" style={{ color:'var(--good)' }}>Nothing waiting on you{t.next ? <span style={faint}> · next step {t.next.key}, due {fmtDate(t.next.due)}</span> : ''}.</div>}
      {t.todos.map((x, i) => <div key={i} className="flex items-center gap-2 py-0.5 text-[13px]"><span style={{ color: x.tone === 'risk' ? 'var(--risk)' : x.tone === 'warn' ? 'var(--warn)' : 'var(--ink)' }}>• {x.text}</span><button className="vlink text-[12px]" onClick={() => setTab(x.tab)}>{x.tab === 'dates' ? 'log it →' : x.tab === 'materials' ? 'count it →' : 'open →'}</button></div>)}
      {t.info.map((x, i) => <div key={i} className="text-[12px] pt-0.5" style={faint}>{x}</div>)}
    </div></Card>}

    <Tabs active={tab} onChange={v => setTab(v as typeof tab)} tabs={[
      { id:'dates', label:'Dates', count: o.milestones.filter(m => !m.actual).length, hint:'log each step as it happens' },
      { id:'materials', label:'Cloth & materials', count: trims.filter(x => !x.m.receivedOn).length + (fs?.sentToFactoryOn && !fs.receipt ? 1 : 0), hint:'what is coming, what landed' },
      { id:'docs', label:'Documents', count: d.owedAfterPo.length || undefined, hint:'CAD, tech pack, style sheet, job card' },
    ]} />

    {tab === 'dates' && <Card><div className="px-4 py-3">
      <div className="text-[12.5px] pb-2" style={{ color:'var(--ink-soft)' }}>{closed ? 'The dates as they ran.' : 'Click the step you have just finished and put the date in. If a step has moved, give the new date and why. The production unit sees it straight away.'}</div>
      <MilestoneGrid o={o} editable={mine && !closed} bare />
    </div></Card>}

    {tab === 'materials' && <Card><MaterialsPanel o={o} mine={mine} /></Card>}

    {tab === 'docs' && <Card><div className="px-4 py-3">
      <div className="grid gap-2" style={{ gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {FACTORY_DOCS.map(label => { const f = docFiles.filter(a => a.label === label); const fromLines = label === 'Trim card' && o.bom.some(l => l.kind === 'trim'); const have = f.length > 0 || fromLines;
          return <div key={label} className="rounded-[6px] p-2.5" style={{ border:`1px solid ${have ? 'var(--line)' : 'var(--risk)'}`, background: have ? 'var(--surface)' : 'color-mix(in srgb, var(--risk) 5%, #fff)' }}>
            <div className="flex items-center gap-2"><span className="font-medium text-[12.5px]">{label}</span><Pill tone={have ? 'good' : 'risk'}>{have ? (f.length ? `${f.length} file${f.length > 1 ? 's' : ''}` : 'on the BOM') : 'not sent yet'}</Pill></div>
            {f.map(a => <DocLink key={a.id} a={a} />)}
            {fromLines && !f.length && <div className="text-[11.5px] pt-1" style={faint}>{o.bom.filter(l => l.kind === 'trim').map(l => l.item).join(', ')}</div>}
            {!have && <div className="text-[11.5px] pt-1" style={faint}>{label === 'PAT / CAD' ? 'design uploads the pattern' : 'the production unit sends it'}</div>}
          </div>; })}
      </div>
      <div className="text-[11.5px] pt-3" style={faint}>Open any file. Nothing here is edited at the factory; if something is missing, it shows above as still owed to you.</div>
    </div></Card>}

    <RecordTail kind="order" subjectId={o.id} labels={FILE_LABELS.order} editable={false} steps={ORDER_STEPS} activity={o.activity} />
  </>;
}

/* one PO's cloth and materials: what is coming, what landed, the ask when short. Used on the Fabric in tab and in the drawer. */
function MaterialsPanel({ o, mine }: { o: ProductionOrder; mine: boolean }) {
  const { db, receiveMaterial, askCutRatio, confirmFabricReceipt } = useApp();
  const [counting, setCounting] = useState<number | null>(null); const [cnt, setCnt] = useState(''); const [cnote, setCnote] = useState('');
  const [ok, setOk] = useState(''); const [dmg, setDmg] = useState('0'); const [rnote, setRnote] = useState('');
  const [shortOpen, setShortOpen] = useState(false); const [shortQty, setShortQty] = useState<Record<string, string>>({}); const [shortWhy, setShortWhy] = useState('');
  const fab = fabricStateOf(o); const fs = o.fabricSupply;
  const trims = (o.materials ?? []).map(m => ({ m, line: o.bom[m.bomIndex] })).filter(x => x.line && x.line.kind !== 'fabric');
  const trimsShort = trims.filter(x => x.m.receivedOn && x.m.receivedQty != null && x.m.receivedQty < x.m.requiredQty);
  const shortFactor = trimsShort.length ? Math.min(1, ...trimsShort.map(x => (x.m.receivedQty ?? 0) / x.m.requiredQty)) : 1;
  const clothFactor = fab.key === 'short' && fab.need ? Math.min(1, (fs?.receipt?.metresOk ?? 0) / fab.need) : 1;
  const faint = { color:'var(--ink-faint)' } as const;
  const given = (o.cutRatios ?? []).filter(c => c.given && c.sentToFactoryOn).slice(-1)[0];
  const breakup = given?.given?.breakup ?? o.sizeBreakup;
  const cloth = o.bom.find(l => l.kind === 'fabric');
  const openAsk = fab.cr && !fab.cr.given;
  const closed = o.status === 'Closed';
  const askShort = (why: string, bk: { size: string; qty: number }[]) => { askCutRatio(o.id, why, 'cut-short', bk); setShortOpen(false); setShortWhy(''); };
  return <div className="px-4 py-3">
      <table className="t compact">
        <thead><tr><th>What</th><th className="num">Coming</th><th className="num">Landed</th><th>Status</th><th></th></tr></thead>
        <tbody>
          <tr>
            <td><div className="font-medium">Cloth · {cloth?.item ?? '—'}</div><div className="text-[11px]" style={faint}>{o.fabricNominated ? `from ${db.vendors.find(v => v.id === o.fabricVendorId)?.name ?? 'the mill'}` : 'we buy it'}{fs?.sentToFactoryOn ? ` · sent ${fmtDate(fs.sentToFactoryOn)}` : ''}</div></td>
            <td className="num">{fs?.sentToFactoryOn ? `${fs.metresSent ?? '—'} m` : fab.need != null ? `${fab.need} m` : '—'}{fab.need != null && <div className="text-[11px]" style={faint}>need {fab.need} m</div>}</td>
            <td className="num">{fs?.receipt ? <>{fs.receipt.metresOk} m{fs.receipt.metresDamaged ? <div className="text-[11px]" style={{ color:'var(--risk)' }}>{fs.receipt.metresDamaged} m damaged</div> : null}</> : <span style={faint}>—</span>}</td>
            <td><Pill tone={fs?.receipt ? (fab.short > 0 ? 'risk' : 'good') : fs?.sentToFactoryOn ? 'warn' : 'neutral'}>{fs?.receipt ? (fab.short > 0 ? `short ${fab.short} m` : 'in') : fs?.sentToFactoryOn ? 'count it in' : 'not sent yet'}</Pill></td>
            <td style={{ whiteSpace:'nowrap' }}>{mine && fs?.sentToFactoryOn && !fs.receipt && <span className="flex gap-1 items-center"><Input type="number" value={ok} onChange={e => setOk(e.target.value)} placeholder={`${fs.metresSent ?? ''} usable`} style={{ width: 96, padding:'4px 6px' }} /><Input type="number" value={dmg} onChange={e => setDmg(e.target.value)} placeholder="damaged" style={{ width: 80, padding:'4px 6px' }} /><Input value={rnote} onChange={e => setRnote(e.target.value)} placeholder="note" style={{ width: 110, padding:'4px 6px' }} /><Button size="sm" variant="primary" disabled={ok === ''} onClick={() => confirmFabricReceipt(o.id, Number(ok), Number(dmg) || 0, rnote.trim())}>Save</Button></span>}</td>
          </tr>
          {trims.map(({ m, line }) => { const short = m.receivedOn && m.receivedQty != null ? Math.max(0, m.requiredQty - m.receivedQty) : 0; const isEditing = counting === m.bomIndex;
            return <tr key={m.bomIndex}>
              <td><div className="font-medium">{line.item}</div>{line.spec && <div className="text-[11px]" style={faint}>{line.spec}</div>}</td>
              <td className="num">{m.requiredQty} {line.unit}</td>
              <td className="num">{m.receivedOn ? `${m.receivedQty ?? m.requiredQty} ${line.unit}` : <span style={faint}>—</span>}{m.note && <div className="text-[11px]" style={faint}>{m.note}</div>}</td>
              <td><Pill tone={m.receivedOn ? (short || m.checked !== 'ok' ? 'risk' : 'good') : 'neutral'}>{m.receivedOn ? (short ? `short ${short} ${line.unit}` : m.checked === 'ok' ? 'in' : 'not OK') : 'not yet'}</Pill></td>
              <td style={{ whiteSpace:'nowrap' }}>{mine && !m.receivedOn && (isEditing
                ? <span className="flex gap-1 items-center"><Input type="number" min={0} value={cnt} onChange={e => setCnt(e.target.value)} placeholder={String(m.requiredQty)} style={{ width: 80, padding:'4px 6px' }} /><Input value={cnote} onChange={e => setCnote(e.target.value)} placeholder="note" style={{ width: 110, padding:'4px 6px' }} />
                  <Button size="sm" variant="primary" onClick={() => { const q = cnt === '' ? m.requiredQty : Number(cnt); receiveMaterial(o.id, m.bomIndex, q >= m.requiredQty ? 'ok' : 'fail', q, cnote.trim()); setCounting(null); setCnt(''); setCnote(''); }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setCounting(null)}>×</Button></span>
                : <span className="flex gap-1"><Button size="sm" onClick={() => receiveMaterial(o.id, m.bomIndex, 'ok', m.requiredQty)}>All in</Button><Button size="sm" variant="ghost" onClick={() => { setCounting(m.bomIndex); setCnt(''); setCnote(''); }}>Less…</Button></span>)}</td>
            </tr>; })}
        </tbody>
      </table>

      {/* short → one plain ask */}
      {(fab.key === 'short' || trimsShort.length > 0) && !openAsk && !closed && <div className="mt-3 p-3 rounded-[6px]" style={{ background:'color-mix(in srgb, var(--risk) 6%, #fff)', border:'1px solid var(--risk)' }}>
        <div className="font-medium text-[13px]">Not enough to make {o.orderQty} pcs</div>
        <div className="text-[12.5px] pt-0.5" style={{ color:'var(--ink-soft)' }}>{fab.key === 'short' ? `Cloth is ${fab.short} m short of the ${fab.need} m needed. ` : ''}{trimsShort.length ? `${trimsShort.map(x => `${x.line.item} ${x.m.receivedQty}/${x.m.requiredQty} ${x.line.unit}`).join(', ')} short. ` : ''}Tell design: either they change the sizes, or you cut fewer pieces with what is here.</div>
        {mine && !shortOpen && <div className="flex gap-2 pt-2 flex-wrap">
          {fab.key === 'short' && <Button size="sm" variant="primary" onClick={() => askCutRatio(o.id, `cloth short by ${fab.short} m`, 'ratio')}>Ask design to change the sizes</Button>}
          <Button size="sm" variant={fab.key === 'short' ? undefined : 'primary'} onClick={() => { const f = Math.min(clothFactor, shortFactor); setShortQty(Object.fromEntries(breakup.map(x => [x.size, String(Math.floor(x.qty * f))]))); setShortOpen(true); }}>Propose to cut fewer…</Button>
        </div>}
        {mine && shortOpen && <div className="pt-2">
          <div className="text-[11.5px] pb-1" style={faint}>What is here allows about {Math.round(Math.min(clothFactor, shortFactor) * 100)}% of the order; change any size</div>
          <div className="grid gap-1.5 py-1" style={{ gridTemplateColumns:`repeat(${breakup.length}, minmax(52px, 1fr))` }}>{breakup.map(x => <Field key={x.size} label={`${x.size} · was ${x.qty}`}><Input type="number" min={0} value={shortQty[x.size] ?? '0'} onChange={e => setShortQty(q => ({ ...q, [x.size]: e.target.value }))} style={{ padding:'4px 6px' }} /></Field>)}</div>
          <div className="flex gap-2 items-end flex-wrap"><div style={{ flex:'1 1 240px' }}><Field label="Why"><Input value={shortWhy} onChange={e => setShortWhy(e.target.value)} placeholder="what was short" /></Field></div>
            <Button size="sm" variant="primary" onClick={() => { const bk = breakup.map(x => ({ size: x.size, qty: Number(shortQty[x.size] ?? 0) || 0 })); askShort(shortWhy.trim() || `cut ${bk.reduce((a, x) => a + x.qty, 0)} of ${o.orderQty}: ${fab.key === 'short' ? `cloth short ${fab.short} m` : ''}${trimsShort.map(x => ` ${x.line.item} ${x.m.receivedQty}/${x.m.requiredQty}`).join(',')}`, bk); }}>Send to design</Button>
            <Button size="sm" variant="ghost" onClick={() => setShortOpen(false)}>Cancel</Button></div>
        </div>}
      </div>}
      {openAsk && <div className="mt-3"><Note tone="warn">Your {fab.cr!.kind === 'cut-short' ? 'proposal to cut fewer' : 'ask to change the sizes'} is with design since {fmtDate(fab.cr!.askedOn)}. You will see the new sizes here when they answer.</Note></div>}

      <div className="pt-3 mt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div className="label">Sizes to cut{given ? ` · design changed these on ${fmtDate(given.sentToFactoryOn!)}` : ''}</div>
        <SizeGrid breakup={breakup} />
      </div>
    </div>;
}

/* the PO in one strip, above a panel on the Fabric in and TNA tabs */
function PoStrip({ o, onOpen }: { o: ProductionOrder; onOpen: () => void }) {
  const r = riskOf(o); const fab = fabricStateOf(o); const asks = (o.cutRatios ?? []);
  return <div className="px-4 py-3 flex gap-4 flex-wrap items-baseline" style={{ borderBottom:'1px solid var(--line-soft)' }}>
    <button className="mono font-medium text-[13px] vlink" onClick={onOpen}>{o.poNo}</button>
    <span className="font-medium">{o.styleName}</span>
    <span className="text-[12.5px]" style={{ color:'var(--ink-soft)' }}>{o.orderQty} pcs · due {fmtDate(o.targetInhouse)}{r.bufferDays != null && <span style={{ color: r.bufferDays < 0 ? 'var(--risk)' : undefined }}> · {r.bufferDays < 0 ? `${-r.bufferDays} days late` : `${r.bufferDays} days to spare`}</span>}</span>
    <span className="ml-auto flex gap-2 items-center"><Pill tone={fab.tone}>{fab.label}</Pill>{asks.length > 0 && <Pill tone={asks.some(c => !c.given) ? 'warn' : 'info'}>{asks.length} cut-short ask{asks.length > 1 ? 's' : ''}{asks.some(c => !c.given) ? ' · with design' : ''}</Pill>}</span>
  </div>;
}

function DocLink({ a }: { a: Attachment }) { const url = useFileUrl(a.id, a.stored); return <div className="text-[11.5px] pt-1 truncate" title={a.name}>{url ? <a className="vlink" href={url} download={a.name} target="_blank" rel="noreferrer">{a.name}</a> : <span>{a.name}</span>} <span style={{ color:'var(--ink-faint)' }}>· {fmtDate(a.at)}{a.stored ? '' : ' · on the record, not in this browser'}</span></div>; }
const FACTORY_DOCS = ['PAT / CAD', 'Tech pack', 'Style sheet', 'Job card', 'Trim card'] as const as readonly string[];
