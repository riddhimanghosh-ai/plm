/* Warehouse: receive and close what has dispatched, and close the STOs that
   physically arrived but are still open in the system — the mechanism behind
   ghost inventory. */
import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { ProductionOrder } from '../domain/types';
import { fmtDate, daysAgo, swatchMatrix, coverageOf, openFabricPos, fabricPoStatus, fmtRel, fitMatrix } from '../domain/engines';
import { STORES, SWATCH_KINDS, BIG_STORES, BOOK_CONFIRM_DAYS } from '../domain/reference';
import { OutboundTab } from './Outbound';
import { ReceiptLots } from './RtwGates';
import { PrepareTab, InwardTab, BespokeTab, FabricTab, OrderSheet } from './Mtm';
import { prepQueue, inwardOf, bespokeQueue } from '../domain/engines';
import { outboundOf } from '../domain/engines';
import { Page, Card, Pill, Input, Button, Drawer, KV, Section, Note, Tabs, Empty, useExamples } from '../ui';
import { ActsBy, OwnerPill } from './Who';
import { UnitAlterations } from './HemTrip';
import { MTM_ONLY } from '../domain/edition';
import { PoReceiving } from './PoReceiving';

export function Warehouse() {
  const { db, role, closeTransfer, resolveShortfall } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'today';
  const openId = params.get('open');
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace:true }); };
  const mine = role === 'warehouse' || role === 'owner';
  const vendorName = (id: string | null) => db.vendors.find(v => v.id === id)?.name ?? '—';

  const inbound = db.orders.filter(o => o.status === 'Open' && o.milestones.find(m => m.key === 'Dispatch')?.actual).sort((a, b) => (a.milestones.find(m => m.key === 'Dispatch')!.actual!).localeCompare(b.milestones.find(m => m.key === 'Dispatch')!.actual!));
  const ghost = db.transfers.filter(t => t.arrivedOn && !t.closedOn);
  const inTransit = db.transfers.filter(t => !t.arrivedOn);
  const active = db.orders.find(o => o.id === openId) ?? null;
  const activeCo = (db.customerOrders ?? []).find(o => o.id === openId) ?? null;
  const transferRows = [...ghost, ...inTransit, ...db.transfers.filter(t => t.closedOn)];
  const exInbound = useExamples(inbound, o => new Date(o.milestones.find(m => m.key === 'Dispatch')!.actual!) > new Date(o.targetInhouse) ? 'late' : 'on time', { noun: 'inbound POs', done: o => o.receipts.reduce((a, r) => a + r.qty, 0) >= o.orderQty });
  const counts: Record<string, number> = {
    vehicle: inwardOf(db).reduce((a, x) => a + x.waiting.length, 0), bespoke: bespokeQueue(db).awaiting.length + bespokeQueue(db).toCall.length + bespokeQueue(db).notReportedToday.length, fabric: openFabricPos(db).length, inward: inbound.length,
    prepare: prepQueue(db).orders.length, xfabric: (db.extraFabric ?? []).filter(r => r.status === 'approved').length, outbound: outboundOf(db).totals.stores,
    transfers: ghost.length, books: swatchMatrix(db).missing + swatchMatrix(db).overdue,
  };
  const exTransfers = useExamples(transferRows, t => t.closedOn ? 'closed' : t.arrivedOn ? 'open after arrival' : 'in transit', { noun: 'STOs', done: t => !!t.closedOn });

  return (
    <Page title="Warehouse & unit" lede="One unit, three directions: what comes in, what goes out, and what the stores hold."
      replaces="a receiving stage with no system visibility, and STOs left open for weeks — the mechanism behind ghost inventory">
      <WarehouseNav tab={tab} onTab={t => set('tab', t)} counts={counts} />
      {tab === 'today' && <TodayCards counts={counts} onTab={t => set('tab', t)} />}

      {tab === 'prepare' && <PrepareTab mine={mine} onOpen={id => set('open', id)} />}
      {tab === 'vehicle' && <InwardTab mine={mine} onOpen={id => set('open', id)} />}
      {tab === 'bespoke' && <BespokeTab mine={mine} onOpen={id => set('open', id)} />}
      {tab === 'xfabric' && <FabricTab mine={false} wh={mine} onOpen={id => set('open', id)} />}

      {tab === 'books' && <SwatchBooksTab mine={mine} />}
      {tab === 'alterations' && <><UnitAlterations /><div className="mt-1"><Note>The store hands the piece to the vehicle; each hop from here to the hemming unit and back is a scan on the case.</Note></div></>}
      {tab === 'outbound' && <OutboundTab side="stores" onTab={() => undefined} />}
      {tab === 'fabric' && <FabricGrnTab mine={mine} />}
      {tab === 'grn' && <GrnRegister mine={mine} />}

      {tab === 'inward' && (inbound.length === 0 ? <Card><Empty title="Nothing inbound." body="No dispatched PO is awaiting receipt." /></Card> : (<>
        {exInbound.strip && <div className="flex justify-end mb-2">{exInbound.strip}</div>}
        <Card><table className="t">
          <thead><tr><th>PO</th><th>Style</th><th>Vendor</th><th>Dispatched</th><th>Target inhouse</th><th className="num">Cut qty</th><th></th></tr></thead>
          <tbody>{exInbound.rows.map(o => { const d = o.milestones.find(m => m.key === 'Dispatch')!.actual!; return <tr key={o.id} className="row" onClick={() => set('open', o.id)}>
            <td className="mono text-[12.5px]">{o.poNo}</td><td className="font-medium">{o.styleName}</td><td className="text-[12.5px]">{vendorName(o.vendorId)}</td>
            <td>{fmtDate(d)} <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>({daysAgo(d)}d ago)</span></td>
            <td style={{ color: new Date(d) > new Date(o.targetInhouse) ? 'var(--risk)' : undefined }}>{fmtDate(o.targetInhouse)}</td>
            <td className="num">{o.cutQty ?? o.orderQty}</td>
            <td>{mine && <Pill tone="warn">count & close</Pill>}</td>
          </tr>; })}</tbody>
        </table></Card></>
      ))}

      {tab === 'transfers' && <>{exTransfers.strip && <div className="flex justify-end mb-2">{exTransfers.strip}</div>}<Card><table className="t">
        <thead><tr><th>STO</th><th>Type</th><th>To store</th><th>Style</th><th className="num">Qty</th><th>Hemming</th><th>Shipped</th><th>Arrived</th><th>Status</th><th></th></tr></thead>
        <tbody>{exTransfers.rows.map(t => <tr key={t.id}>
          <td className="mono text-[12.5px]">{t.stoNo}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>series {t.series}</div></td>
          <td><Pill tone={t.stoType === 'Display' ? 'accent' : t.stoType === 'Off the rack' ? 'info' : 'neutral'}>{t.stoType}</Pill></td>
          <td>{STORES.find(s => s.id === t.toStoreId)?.name}</td><td className="text-[12.5px]">{t.styleName}</td><td className="num">{t.qty}</td>
          <td className="text-[11.5px]" style={{ color: t.hemmingType?.startsWith('Bottom Open') ? 'var(--warn)' : 'var(--ink-faint)' }}>{t.hemmingType ?? '—'}</td>
          <td>{fmtDate(t.shippedOn)}</td><td>{fmtDate(t.arrivedOn)}</td>
          <td>{t.shortfall && !t.shortfall.resolvedOn ? <Pill tone="risk">short · {t.shortfall.receivedQty} of {t.shortfall.sentQty}</Pill> : t.shortfall ? <Pill tone="neutral">{t.shortfall.resolution === 'balance-sent' ? 'short · balance sent' : 'short · written off'}</Pill> : t.closedOn ? <Pill tone="good">closed</Pill> : t.arrivedOn ? <Pill tone="risk">open after arrival · {daysAgo(t.arrivedOn)}d</Pill> : <Pill tone="info">in transit</Pill>}{t.shortfall?.note && <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>store: “{t.shortfall.note}”</div>}</td>
          <td>{mine && t.arrivedOn && !t.closedOn && <Button size="sm" variant="primary" onClick={() => closeTransfer(t.id)}>Close on receipt</Button>}
            {mine && t.shortfall && !t.shortfall.resolvedOn && <div className="flex gap-1 flex-wrap"><Button size="sm" variant="primary" onClick={() => resolveShortfall(t.id, 'balance-sent', '')}>Send the balance</Button><Button size="sm" onClick={() => { const why = window.prompt('Write off the missing pieces — why?') ?? ''; if (why.trim()) resolveShortfall(t.id, 'written-off', why.trim()); }}>Write off</Button></div>}</td>
        </tr>)}</tbody>
      </table></Card></>}
      {tab === 'transfers' && <div className="mt-3"><Note tone={ghost.length ? 'risk' : undefined}>STOs go out in waves — the tracker's series number is one wave, one STO per store inside it. <b>Display</b> pieces are never sold; <b>Off the rack</b> is sellable stock; <b>Bottom Open / Unhemmed</b> means the store hems to the customer, so it needs the hemming unit or a tailor. An STO open after the goods arrived means system stock and floor stock disagree — and a store can bill an item that is not there. Closing on receipt is the fix.</Note></div>}

      <Drawer open={!!activeCo} onClose={() => set('open', null)} title={activeCo?.orderNo ?? ''} subtitle={activeCo && <span>{activeCo.customer} · {activeCo.styleName} · {STORES.find(x => x.id === activeCo.storeId)?.name}</span>}>
        {activeCo && <OrderSheet o={activeCo} mine={mine} />}
      </Drawer>
      <Drawer open={!!active} onClose={() => set('open', null)} title={active?.poNo ?? ''} subtitle={active && <span>{active.styleName} · {vendorName(active.vendorId)}</span>}>
        {active && <Receive o={active} editable={mine} />}
      </Drawer>
    </Page>
  );
}

function Receive({ o, editable }: { o: ProductionOrder; editable: boolean }) {
  return <>
    <Section title="Order">
      <KV k="Ordered" v={o.orderQty} note={o.sizeBreakup.map(s => `${s.size}:${s.qty}`).join('  ')} />
      <KV k="Target inhouse" v={fmtDate(o.targetInhouse)} />
      <KV k="Dispatched" v={fmtDate(o.milestones.find(m => m.key === 'Dispatch')?.actual ?? null)} />
    </Section>
    <ReceiptLots o={o} editable={editable} />
  </>;
}


/* ---------- swatch books — every store, all three kinds ---------------------- */
function SwatchBooksTab({ mine }: { mine: boolean }) {
  const { db, dispatchSwatchBook, dispatchFitSample, answerBookRequest } = useApp();
  const asks = (db.bookRequests ?? []).filter(r => r.status === 'requested');
  const answered = (db.bookRequests ?? []).filter(r => r.status !== 'requested').slice(0, 6);
  const m = swatchMatrix(db);
  const fm = fitMatrix(db);
  const ex = useExamples(m.rows, r => { const st = SWATCH_KINDS.map(k => r.cells[k].state); return st.includes('missing') ? 'missing' : st.includes('overdue') ? 'overdue' : st.includes('sent') ? 'sent' : 'received'; }, { noun: 'stores', done: r => SWATCH_KINDS.every(k => r.cells[k].state === 'received') });
  const mills = [...new Set(db.fabrics.filter(f => f.bucket === 'BESPOKE').map(f => f.vendorId))];
  const TONE: Record<string, 'neutral' | 'info' | 'warn' | 'good' | 'risk'> = { missing:'risk', sent:'info', overdue:'warn', received:'good' };
  const LABEL: Record<string, string> = { missing:'never sent', sent:'sent', overdue:'unconfirmed', received:'received' };
  return <>
    <Card className="mb-3"><div className="label">Books the stores have asked for · {asks.length}</div>
      {asks.length === 0 ? <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>No open asks. A store asks from its Swatches, books & fit samples tab.</div>
      : <table className="t"><thead><tr><th>Store</th><th>Books</th><th>Why</th><th>Asked</th><th></th></tr></thead><tbody>{asks.map(r => <tr key={r.id}>
        <td className="font-medium">{STORES.find(s => s.id === r.storeId)?.name}</td><td>{r.copies} × {r.kind}</td><td className="text-[12.5px]" style={{ whiteSpace:'normal', maxWidth: 320 }}>{r.reason || '—'}</td><td className="text-[12px]">{fmtDate(r.askedOn)}<div style={{ color:'var(--ink-faint)' }}>{r.by}</div></td>
        <td>{mine && <div className="flex gap-1 flex-wrap"><Button size="sm" variant="primary" onClick={() => answerBookRequest(r.id, 'shipped')}>Dispatch {r.copies}</Button><Button size="sm" onClick={() => { const why = window.prompt('Decline — tell the store why') ?? ''; if (why.trim()) answerBookRequest(r.id, 'declined', why.trim()); }}>Decline</Button></div>}</td>
      </tr>)}</tbody></table>}
      {answered.length > 0 && <div className="text-[11.5px] pt-2" style={{ color:'var(--ink-faint)' }}>{answered.map(r => `${STORES.find(s => s.id === r.storeId)?.name} · ${r.copies} ${r.kind} · ${r.status}${r.note ? ` (${r.note})` : ''} · ${fmtDate(r.decidedOn)}`).join(' · ')}</div>}
    </Card>
    {ex.strip && <div className="flex justify-end mb-2">{ex.strip}</div>}
    <Card><table className="t">
      <thead><tr><th>Store</th><th>Region</th>{SWATCH_KINDS.map(k => <th key={k}>{k === 'BESPOKE' ? 'Bespoke book · from the mill' : `${k} book · from the unit`}</th>)}<th>MTM fit set · slim / standard / heavy × sizes</th></tr></thead>
      <tbody>{ex.rows.map(({ st, cells }) => <tr key={st.id}>
        <td className="font-medium">{st.name}{BIG_STORES.has(st.id) && <span className="text-[10.5px] ml-1" style={{ color:'var(--ink-faint)' }}>· 2 books</span>}</td>
        <td className="text-[12.5px]" style={{ color:'var(--ink-faint)' }}>{st.region}</td>
        {SWATCH_KINDS.map(k => { const c = cells[k]; return <td key={k}>
          <div className="flex items-center gap-2 flex-wrap">
            <Pill tone={TONE[c.state]}>{LABEL[c.state]}</Pill>
            {c.b && <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{c.b.receivedOn ? fmtDate(c.b.receivedOn) : `${daysAgo(c.b.dispatchedOn)}d ago${c.b.trackingNo ? ` · AWB ${c.b.trackingNo}` : ''}`}{k === 'BESPOKE' && c.b.from !== 'unit' ? ` · ${db.vendors.find(v => v.id === c.b!.from)?.name ?? ''}` : ''}</span>}
            {mine && (c.state === 'missing' || c.state === 'overdue') && k !== 'BESPOKE' && <Button size="sm" variant={c.state === 'missing' ? 'primary' : undefined} onClick={() => dispatchSwatchBook(st.id, k, BIG_STORES.has(st.id) ? 2 : 1, 'unit')}>{c.state === 'missing' ? `Send ${BIG_STORES.has(st.id) ? 2 : 1}` : 'Resend'}</Button>}
            {mine && c.state === 'missing' && k === 'BESPOKE' && <Button size="sm" onClick={() => dispatchSwatchBook(st.id, k, 1, mills[0] ?? 'unit')}>Mill has sent</Button>}
          </div>
        </td>; })}
        <td>{(() => { const fs = fm.rows.find(r => r.st.id === st.id)!.set; return <div className="flex items-center gap-2 flex-wrap"><Pill tone={fs.complete ? 'good' : fs.gaps.length > 3 ? 'risk' : 'warn'}>{fs.ok}/{fs.total} on the floor</Pill>
          {fs.gaps.length > 0 && <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{fs.gaps.slice(0, 4).map(g => `${g.fit} ${g.size} ${g.state}`).join(' · ')}{fs.gaps.length > 4 ? ` +${fs.gaps.length - 4}` : ''}</span>}
          {fs.inTransit > 0 && <span className="text-[11px]" style={{ color:'var(--info)' }}>{fs.inTransit} in transit</span>}
          {mine && fs.gaps.length > 0 && <Button size="sm" variant="primary" onClick={() => fs.gaps.forEach(g => dispatchFitSample(st.id, g.fit, g.size))}>Send {fs.gaps.length}</Button>}</div>; })()}</td>
      </tr>)}</tbody>
    </table></Card>
    <div className="mt-3"><Note>{fm.complete} of {STORES.length} stores hold the full book and fit set; anything unconfirmed after {BOOK_CONFIRM_DAYS} days shows as overdue.</Note></div>
  </>;
}


/* ---------- fabric GRN — the rolls land, incoming becomes shelf --------------- */
function FabricGrnTab({ mine }: { mine: boolean }) {
  const { db, receiveFabricPo } = useApp();
  const [openPo, setOpenPo] = useState<string | null>(null);
  const rows = openFabricPos(db).map(p => { const f = db.fabrics.find(x => x.id === p.fabricId)!; const v = db.vendors.find(x => x.id === p.vendorId); return { p, f, v, c: coverageOf(f, v?.leadDays ?? 14, v), st: fabricPoStatus(p) }; }).sort((a, b) => a.p.expectedOn.localeCompare(b.p.expectedOn));
  const ex = useExamples(rows, r => r.st, { noun: 'fabric POs', done: r => r.st === 'confirmed' });
  return <>
    {rows.length === 0 ? <Card><Empty title="Nothing on the way." body="Enigma's auto-POs and the manual international POs appear here until the rolls are received." /></Card> : <>{ex.strip && <div className="flex justify-end mb-2">{ex.strip}</div>}<Card><table className="t compact">
      <thead><tr><th>PO</th><th>Fabric</th><th>Mill</th><th className="num">Metres</th><th>Mill's date</th><th>Confirmed</th><th className="num">On shelf</th><th></th></tr></thead>
      <tbody>{ex.rows.map(({ p, f, v, c, st }) => <Fragment key={p.id}><tr>
        <td className="mono text-[12.5px]">{p.poNo}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{p.source === 'auto' ? 'auto' : 'manual'}</div></td>
        <td className="font-medium">{f.name}<div className="text-[11px] font-normal mono" style={{ color:'var(--ink-faint)' }}>{f.code} · {f.bucket.toLowerCase().replace('_', '-')}</div></td>
        <td className="text-[12.5px]">{v?.name}<div style={{ color:'var(--ink-faint)' }}>{f.international ? 'international' : 'domestic'} · {v?.leadDays}d lead</div></td>
        <td className="num" style={{ color:'var(--info)' }}>+{p.metres} m</td>
        <td style={{ color: daysAgo(p.expectedOn) > 0 ? 'var(--risk)' : undefined }}>{fmtDate(p.expectedOn)}{p.remark && <div className="text-[11px]" style={{ color:'var(--warn)', whiteSpace:'normal' }}>“{p.remark}”</div>}</td>
        <td><Pill tone={st === 'confirmed' ? 'good' : st === 'confirmed · overdue' ? 'risk' : st === 'unconfirmed · chase' ? 'warn' : 'neutral'}>{p.vendorConfirmedOn ? `mill · ${fmtRel(p.vendorConfirmedOn)}` : 'not confirmed'}</Pill></td>
        <td className="num">{c.saleable} m</td>
        <td><Button size="sm" variant={openPo === p.id ? undefined : 'primary'} onClick={() => setOpenPo(openPo === p.id ? null : p.id)}>{openPo === p.id ? 'Close' : `Receive · ${Math.max(0, p.metres - (p.receivedMetres ?? 0))} m pending`}</Button></td>
      </tr>{openPo === p.id && <tr><td colSpan={8} style={{ background:'var(--surface-2)' }}><PoReceiving po={p} editable={mine} /></td></tr>}</Fragment>)}</tbody>
    </table></Card></>}
    <div className="mt-3"><Note>Incoming counts toward cover only once the mill confirms; the GRN is what makes it saleable.</Note></div>
  </>;
}



/* ---------- one flat row of short tabs, and a Today landing that says what is waiting ---------- */
const WH_TABS: { id: string; label: string; title: string; line: string; cta: string; rtw?: boolean }[] = [
  { id:'vehicle', label:'Shirts back', title:'Finished MTM shirts back from the factories', line:'The vehicle round — count each piece in against what the factory said was ready.', cta:'Count in' },
  { id:'bespoke', label:'Bespoke cloth', title:'Bespoke fabric from the mills', line:'Call the mill for cut lengths, book the parcels in, enter the evening stock sheet.', cta:'Open' },
  { id:'fabric', label:'Fabric rolls', title:'Fabric rolls against open POs', line:'Rolls arrive in parts — update the receiving line on each PO; every update raises a GRN.', cta:'Receive' },
  { id:'inward', label:'RTW inward', title:'RTW bulk from the factories', line:'Dispatched POs to count and close.', cta:'Count & close', rtw: true },
  { id:'prepare', label:'Cut & send', title:'Cut fabric and send bundles to the factories', line:'Planned MTM orders waiting for their cloth to be cut and bundled.', cta:'Cut list' },
  { id:'xfabric', label:'Extra fabric', title:'Extra fabric approved for a factory', line:'Pick and send the approved metres.', cta:'Pick & send' },
  { id:'outbound', label:'Parcels', title:'Parcels to the stores', line:'Finished shirts, launch pieces and books going out today.', cta:'Pack' },
  { id:'transfers', label:'STOs', title:'Stock transfers still open', line:'STOs that arrived at the store but are open in the system — ghost inventory until closed.', cta:'Close' },
  { id:'books', label:'Books & samples', title:'Swatch books and fit samples at every store', line:'Missing or unconfirmed books and worn fit samples.', cta:'Open' },
  { id:'alterations', label:'Alterations', title:'Alterations via the hemming unit', line:'Pieces from the stores on their way to the hemming unit and back.', cta:'Open' },
  { id:'grn', label:'GRN register', title:'Goods received notes', line:'Every receipt, with the PO it was received against, for finance.', cta:'Open' },
];
const whTabs = () => WH_TABS.filter(t => !(MTM_ONLY && t.rtw));
function WarehouseNav({ tab, onTab, counts }: { tab: string; onTab: (t: string) => void; counts: Record<string, number> }) {
  return <div className="mb-3"><Tabs tabs={[{ id:'today', label:'Today' }, ...whTabs().map(t => ({ id:t.id, label:t.label, hint:t.title, count: counts[t.id] || undefined }))]} active={tab} onChange={onTab} wrap /></div>;
}
function TodayCards({ counts, onTab }: { counts: Record<string, number>; onTab: (t: string) => void }) {
  const tabs = whTabs().filter(t => t.id !== 'grn');
  const waiting = tabs.filter(t => counts[t.id] > 0); const clear = tabs.filter(t => !(counts[t.id] > 0));
  return <>
    {waiting.length === 0 && <Card><Empty title="Nothing waiting." body="Every queue is clear — new receipts and dispatches land here as they happen." /></Card>}
    <div className="grid gap-3" style={{ gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))' }}>
      {waiting.map(t => <Card key={t.id} className="p-4 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2"><div className="font-medium" style={{ fontSize: 14 }}>{t.title}</div><Pill tone="warn">{counts[t.id]}</Pill></div>
        <div className="text-[12.5px] flex-1" style={{ color:'var(--ink-soft)' }}>{t.line}</div>
        <div><Button size="sm" variant="primary" onClick={() => onTab(t.id)}>{t.cta} →</Button></div>
      </Card>)}
    </div>
    {clear.length > 0 && <div className="mt-4 text-[12px] flex gap-x-3 gap-y-1 flex-wrap items-center" style={{ color:'var(--ink-faint)' }}><span>Nothing waiting:</span>{clear.map(t => <button key={t.id} type="button" className="vlink" onClick={() => onTab(t.id)}>{t.label}</button>)}</div>}
  </>;
}


/* ---------- the GRN register: one line per goods received note, whatever came in ---------- */
const GRN_KIND: Record<string, string> = { fabric:'Fabric rolls', 'rtw-po':'RTW bulk', 'bespoke-parcel':'Bespoke parcel', 'mtm-round':'MTM pieces back', trims:'Trims & packaging', 'store-inward':'Counted in at a store' };
export function GrnRegister({ mine }: { mine: boolean }) {
  const { db, role, setGrnInvoice, financeSeenGrn } = useApp();
  const fin = role === 'finance' || role === 'owner';
  const rows = db.grns ?? [];
  const [kind, setKind] = useState('all');
  const shown = rows.filter(g => kind === 'all' || g.kind === kind);
  const ex = useExamples(shown, g => `${g.kind} · ${!g.poNo ? 'n/a' : g.financeSeenOn ? 'picked up' : 'with finance'}`, { noun: 'GRNs', done: g => !!g.financeSeenOn });
  const vendor = (id: string | null, storeId?: string | null) => storeId ? `→ ${STORES.find(s => s.id === storeId)?.name ?? storeId}` : db.vendors.find(v => v.id === id)?.name ?? '—';
  const week = rows.filter(g => daysAgo(g.receivedOn) <= 7);
  return <>
    <div className="flex gap-1.5 flex-wrap mb-3">
      <button className={`btn sm ${kind === 'all' ? 'primary' : ''}`} onClick={() => setKind('all')}>All · {rows.length}</button>
      {Object.entries(GRN_KIND).map(([k, l]) => rows.some(g => g.kind === k) && <button key={k} className={`btn sm ${kind === k ? 'primary' : ''}`} onClick={() => setKind(k)}>{l} · {rows.filter(g => g.kind === k).length}</button>)}
      <div className="ml-auto self-center">{ex.strip}</div>
    </div>
    {shown.length === 0 ? <Card><Empty title="No goods received notes yet." body="Every receipt on the tabs to the left raises one here." /></Card> : <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><th>GRN</th><th>Received</th><th>What</th><th>PO / against</th><th>From / to</th><th className="num">Qty</th><th className="num">Rejected</th><th>Counted by</th><th>Finance</th><th>Invoice</th></tr></thead>
      <tbody>{ex.rows.slice(0, 120).map(g => <tr key={g.id}>
        <td className="mono text-[12px]">{g.grnNo}</td>
        <td className="text-[12px]">{fmtDate(g.receivedOn)}<div style={{ color:'var(--ink-faint)' }}>{fmtRel(g.receivedOn)}</div></td>
        <td className="text-[12.5px]"><Pill tone="neutral">{GRN_KIND[g.kind]}</Pill><div>{g.refLabel}</div></td>
        <td className="mono text-[11.5px]">{g.poNo ?? g.ref}{g.poNo && g.poNo !== g.ref && <div style={{ color:'var(--ink-faint)' }}>{g.ref}</div>}</td>
        <td className="text-[12px]">{vendor(g.vendorId, g.storeId)}</td>
        <td className="num">{g.qty} {g.unit}</td>
        <td className="num" style={{ color: g.rejected ? 'var(--risk)' : 'var(--ink-faint)' }}>{g.rejected || '—'}</td>
        <td className="text-[12px]">{g.by}</td>
        <td>{!g.poNo ? <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>n/a</span> : g.financeSeenOn ? <Pill tone="good">picked up {fmtRel(g.financeSeenOn)}</Pill> : fin ? <Button size="sm" variant="primary" onClick={() => financeSeenGrn(g.id)}>Pick up · GST & recon</Button> : <Pill tone="warn">with finance</Pill>}</td>
        <td>{g.kind === 'mtm-round' || g.kind === 'bespoke-parcel' || g.kind === 'store-inward' ? <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>n/a</span>
          : (mine || fin) ? <input className="input mono" style={{ width: 120, padding:'3px 6px' }} defaultValue={g.invoiceNo ?? ''} placeholder="invoice no." onBlur={e => { if ((e.target.value.trim() || null) !== g.invoiceNo) setGrnInvoice(g.id, e.target.value); }} />
          : <span className="mono text-[11.5px]" style={{ color: g.invoiceNo ? undefined : 'var(--warn)' }}>{g.invoiceNo ?? 'not matched'}</span>}</td>
      </tr>)}</tbody>
    </table></div></Card>}
    <div className="mt-3"><Note>Each receipt writes a numbered GRN that reaches finance the same moment, PO attached, for GST filing.</Note></div>
  </>;
}


/* ---------- finance's view of the same register ---------- */
export function GrnPage() {
  const { role } = useApp();
  return <Page title="Goods received · GRN" lede="Every receipt counted in, with the PO it was received against — a GRN reaches finance the moment it is written."
    replaces="the invoice that was supposed to reach finance and the merchandiser on delivery and often did not, and a receiving stage nobody could see">
    <GrnRegister mine={role === 'warehouse' || role === 'owner'} />
  </Page>;
}
