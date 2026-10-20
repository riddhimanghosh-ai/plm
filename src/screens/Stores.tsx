/* The store manager's screen. Stores hold no sellable MTM stock — the swatch
   book is the shopfront — so what they need is: which fabrics are actually
   live right now, one tap to confirm a swatch landed, and a return with a
   status instead of a Slack chase. */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp, useAppStore, type PunchInput } from '../store';
import { liveStatusOf, coverageOf, fmtDate, daysAgo, healthOf, storeStockOf, TODAY, addDays, iso, launchOf, fulfilFromOf, storeInboundOf, fmtRel, fitSetOf, customersOf, customerOf, returnStatusOf, sheetRev, creditBalanceOf, CREDIT_VALID_DAYS, displayBalanceOf, displaysOwedOf, shelvesOf } from '../domain/engines';
import { STORES, STORE_LOW_METRES, RETURN_REASONS, RETURN_WANTS, MTM_FITS, isBottoms, FIT_SAMPLE_NOTE, FIT_SAMPLE_FITS, FIT_SAMPLE_SIZES, RESOLUTION_LADDER, WRITE_OFF_REASONS, ROLE_LABEL } from '../domain/reference';
import type { ReturnCase, CustomerOrder, RtwOption, Fabric, ResolutionStep, StockWriteOff } from '../domain/types';
import { Page, Card, Pill, Button, Note, Tabs, Seg, Empty, Drawer, KV, Section, Field, Input, Select, dateInput, fromDateInput, useExamples } from '../ui';
import { ThreadPanel } from './Thread';
import { Files } from './Files';
import { FILE_LABELS } from '../domain/reference';

import { SheetChangePanel, SheetEditor, SheetView, SheetHistory, emptyDraft, type SheetDraft } from './OrderSheet';
import { ActsBy } from './Who';
import { HemTripSection } from './HemTrip';
import { MTM_ONLY } from '../domain/edition';

export function Stores() {
  const { db, role, storeId, confirmSwatch, raiseReturn, updateReturn, punchBill, redeemCredit, cancelOrder, requestStock, respondStockRequest, receiveLaunch, fulfilOrder, receiveSwatchBook, } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'fabrics';
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace:true }); };
  const openReturn = db.returns.find(r => r.id === params.get('open')) ?? null;
  const newReturn = params.get('open') === 'new';
  const openOrder = (db.customerOrders ?? []).find(o => o.id === params.get('open')) ?? null;
  const openCustomer = params.get('open')?.startsWith('cust:') ? params.get('open')!.slice(5) : null;
  const punching = params.get('open') === 'punch-mtm' ? 'MTM' : params.get('open') === 'punch-rtw' ? 'RTW' : null;
  const myOrders = (db.customerOrders ?? []).filter(o => o.storeId === storeId);
  const reqs = db.stockRequests ?? [];
  const toMe = reqs.filter(q => q.fromStoreId === storeId && q.status === 'requested');
  const mineOpen = reqs.filter(q => q.toStoreId === storeId && !['received', 'declined'].includes(q.status));
  const launchRows = (db.launches ?? []).map(l => ({ l, mine: l.pieces.filter(p => p.storeId === storeId) })).filter(x => x.mine.length && !x.l.launchedOn || (x.l.launchedOn && daysAgo(x.l.launchedOn) < 21 && x.mine.length));
  const launchToConfirm = launchRows.filter(x => x.mine.some(p => p.dispatchedOn && !p.receivedOn)).length;
  const openMtm = myOrders.filter(o => o.kind === 'MTM' && !['delivered', 'cancelled'].includes(o.stage));
  const openRtw = myOrders.filter(o => o.kind === 'RTW' && !['delivered', 'cancelled'].includes(o.stage));
  const books = (db.swatchBooks ?? []).filter(b => b.storeId === storeId && !b.receivedOn);
  const store = STORES.find(s => s.id === storeId)!;
  const mine = role === 'store' || role === 'owner';
  const lead = (vid: string) => db.vendors.find(v => v.id === vid)?.leadDays ?? 14;

  const fabrics = db.fabrics.filter(f => f.bucket !== 'BESPOKE').map(f => ({ f, live: liveStatusOf(f, lead(f.vendorId)), c: coverageOf(f, lead(f.vendorId)) }));
  const notLive = fabrics.filter(x => x.live !== 'Active');
  const bespokeOff = db.fabrics.filter(f => f.bucket === 'BESPOKE' && (f.millAvailable === false || f.onHold));
  const swatches = db.swatchDispatches.filter(s => s.storeId === storeId && !s.confirmedOn);
  /* open cases first, then closed — a closed case is the worked example of what done looks like */
  const returns = db.returns.filter(r => r.storeId === storeId).sort((a, b) => Number(!!a.closedOn) - Number(!!b.closedOn) || b.openedOn.localeCompare(a.openedOn));
  const openReturns = returns.filter(r => !r.closedOn);
  const pullBack = db.options.filter(o => healthOf(o).action === 'LIQUIDATE' || healthOf(o).action === 'EXIT').slice(0, 8);
  const fabricRows = [...notLive, ...fabrics.filter(x => x.live === 'Active').slice(0, 30)];
  const exLaunches = useExamples(launchRows, ({ l, mine: ps }) => { const sent = ps.filter(p => p.dispatchedOn).length; const recv = ps.filter(p => p.receivedOn).length; return recv === ps.length ? 'received' : sent ? 'to confirm' : l.launchedOn ? 'live' : 'not dispatched'; }, { noun: 'launches', done: ({ l, mine: ps }) => !!l.launchedOn && ps.length > 0 && ps.every(p => !!p.receivedOn) });
  const exFabrics = useExamples(fabricRows, x => x.live, { noun: 'fabrics', done: x => x.live === 'Active' });
  const exBooks = useExamples(books, b => daysAgo(b.dispatchedOn) > 7 ? 'overdue' : 'on its way', { noun: 'books', done: b => daysAgo(b.dispatchedOn) <= 7 });
  const exSwatches = useExamples(swatches, s => daysAgo(s.dispatchedOn) > 7 ? 'overdue' : 'on its way', { noun: 'swatches', done: s => daysAgo(s.dispatchedOn) <= 7 });
  const exPullBack = useExamples(pullBack, o => healthOf(o).action, { noun: 'styles', done: o => healthOf(o).action === 'EXIT' });
  const exReturns = useExamples(returns, r => { const rs = returnStatusOf(r); return rs.overdue ? 'overdue' : rs.waitingOn ?? rs.label; }, { noun: 'cases', done: r => !!r.refund?.movedOn || returnStatusOf(r).last?.outcome === 'accepted' });

  /* what a store manager actually does, in the order of the day */
  const GROUPS = [
    { id:'customers', label:'Customers', kids: [{ id:'customers', label:'Search & 360' }] },
    { id:'orders', label:'Orders', kids: [
      { id:'mtm-orders', label:'MTM · made to measure', count: openMtm.length },
      ...(MTM_ONLY ? [] : [{ id:'rtw-orders', label:'RTW · ready-to-wear, sold from stock', count: openRtw.length }]),
    ] },
    { id:'sell', label:'What I can sell', kids: [
      { id:'fabrics', label:'MTM fabrics · live today' },
      ...(MTM_ONLY ? [] : [{ id:'shelves', label:'RTW · every store\'s shelf', count: displaysOwedOf(db, storeId).length, hint:'who sells what off the rack, size by size, and whose window is empty' }]),
      { id:'swatches', label:'Swatches, books & fit samples', count: swatches.length + books.length + fitSetOf(db, storeId).gaps.length },
    ] },
    { id:'stock', label:'Stock in & out', kids: [
      { id:'inward', label:'Received from the unit', count: storeInboundOf(db, storeId).filter(x => x.kind === 'sto' || x.kind === 'mtm' || x.kind === 'rtw').length },
      { id:'requests', label:'Stock asks · other stores', count: toMe.length + mineOpen.length },
      ...(MTM_ONLY ? [] : [{ id:'launches', label:'Launches · display pieces', count: launchToConfirm }]),
      { id:'pullback', label:'Pull back · slow stock', count: pullBack.length },
      { id:'damaged', label:'Damaged & unsellable', count: (db.writeOffs ?? []).filter(w => w.storeId === storeId && daysAgo(w.at) <= 30).length },
    ] },
    { id:'returns', label:'Returns & alterations', kids: [{ id:'returns', label:'Every open case', count: openReturns.length }] },
  ];
  const group = GROUPS.find(g => g.kids.some(k => k.id === tab)) ?? GROUPS[2];

  return (
    <Page title={`Store · ${store.name}`} lede={`${store.holdsRtwStock ? 'Sells RTW off the rack and' : 'Shows RTW on display only (no shelf stock) and'} takes MTM orders — what is live right now, what has arrived, and what to send back, live from stock.`}
      replaces="a week-old fabric Excel, five WhatsApp groups, and a returns chase on Slack">
      {!mine && <div className="mb-2"><ActsBy role="store" does="punches orders, confirms swatches and raises returns here — you are looking at the store's screen read-only" inline /></div>}
      {/* Two levels, because twelve flat tabs is a list, not a screen: the five
          things a store manager does, and inside each one the cases it splits into. */}
      <Tabs tabs={GROUPS.map(g => ({ id: g.id, label: g.label, count: g.kids.reduce((a, k) => a + (k.count ?? 0), 0) }))}
        active={group.id} onChange={gid => set('tab', (GROUPS.find(g => g.id === gid) ?? GROUPS[0]).kids[0].id)} />
      {group.kids.length > 1 && <div className="-mt-2 mb-4"><Seg value={tab} onChange={t => set('tab', t)} options={group.kids} /></div>}

      {tab === 'shelves' && <ShelvesTab storeId={storeId} mine={mine} />}
      {tab === 'inward' && <StoreInwardTab storeId={storeId} mine={mine} />}
      {tab === 'customers' && <CustomersTab storeId={storeId} onOpen={n => set('open', 'cust:' + n)} />}
      {(tab === 'mtm-orders' || tab === 'rtw-orders') && (() => { const kind = tab === 'mtm-orders' ? 'MTM' : 'RTW'; return <OrdersTab kind={kind} orders={myOrders.filter(o => o.kind === kind)} mine={mine}
        onOpen={id => set('open', id)} onPunch={() => set('open', kind === 'MTM' ? 'punch-mtm' : 'punch-rtw')} onAdvance={fulfilOrder} />; })()}

      {tab === 'launches' && (launchRows.length === 0 ? <Card><Empty title="Nothing launching here." body="When planning allocates display and fit pieces to this store, they appear here with the launch date and what to say." /></Card> : <>
        {exLaunches.strip && <div className="flex justify-end mb-2">{exLaunches.strip}</div>}
        <Card><table className="t">
          <thead><tr><th>Style</th><th>Launch</th><th>Display</th><th>Fit set</th><th>Pieces</th><th>What to say</th><th></th></tr></thead>
          <tbody>{exLaunches.rows.map(({ l, mine: ps }) => { const st = launchOf(l); const sent = ps.filter(p => p.dispatchedOn).length; const recv = ps.filter(p => p.receivedOn).length; return <tr key={l.id}>
            <td><div className="font-medium">{l.marketingName ?? l.styleName}{l.hero && <Pill tone="accent">hero</Pill>}</div><div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{l.dropMonth} · {st.stage}</div></td>
            <td>{l.launchedOn ? <Pill tone="good">live {fmtDate(l.launchedOn)}</Pill> : l.launchOn ? fmtDate(l.launchOn) : 'TBD'}</td>
            <td className="text-[12.5px]">{ps.filter(p => p.kind === 'display').map(p => p.size).join(', ')}</td>
            <td className="text-[12.5px]">{ps.filter(p => p.kind === 'fit').map(p => p.size).join(', ')}</td>
            <td><Pill tone={recv === ps.length ? 'good' : sent ? 'warn' : 'neutral'}>{recv === ps.length ? 'received' : sent ? `${sent - recv} to confirm` : 'not dispatched yet'}</Pill></td>
            <td className="text-[12.5px]" style={{ color:'var(--ink-soft)' }}>{l.keyPointers || '—'}</td>
            <td>{mine && sent > recv && <Button size="sm" variant="primary" onClick={() => receiveLaunch(l.id, storeId)}>Received — displays up</Button>}</td>
          </tr>; })}</tbody>
        </table></Card>
        <div className="mt-3"><Note>Display and fit pieces are to show, not sell — issued at cost and not in the shelf count.</Note></div>
      </>)}

      {tab === 'requests' && <RequestsTab storeId={storeId} mine={mine} options={db.options} reqs={reqs} onRequest={requestStock} onRespond={respondStockRequest} />}

      {tab === 'fabrics' && <>
        {exFabrics.strip && <div className="flex justify-end mb-2">{exFabrics.strip}</div>}
        <Card><table className="t">
          <thead><tr><th>Fabric</th><th>Family</th><th className="num">Saleable</th><th>Status</th><th>What to tell the customer</th></tr></thead>
          <tbody>{exFabrics.rows.map(({ f, live, c }) => <tr key={f.id}>
            <td className="font-medium">{f.name}<div className="text-[11px] font-normal mono" style={{ color:'var(--ink-faint)' }}>{f.code}</div></td>
            <td className="text-[12.5px]">{f.family}</td>
            <td className="num">{c.saleable} m</td>
            <td><Pill tone={live === 'Active' ? 'good' : live === 'Low Stock' ? 'warn' : 'risk'}>{live}</Pill></td>
            <td className="text-[12.5px]" style={{ color:'var(--ink-soft)' }}>{live === 'Paused' ? 'Design has paused it — do not take an order on this fabric; offer the closest alternative in the same family' : live === 'Sold Out' || live === 'On Hold' ? 'Cannot be ordered — offer the closest alternative in the same family' : live === 'Low Stock' ? `Under ${STORE_LOW_METRES}m — roughly ${Math.floor(c.saleable / 2.15)} shirts left across all stores; confirm before promising` : 'Available'}</td>
          </tr>)}</tbody>
        </table></Card>
        <div className="mt-3"><Note>Same number every store sees, recomputed from reservations as orders are punched.</Note></div>
      </>}

      {tab === 'swatches' && <BookAskCard storeId={storeId} mine={mine} />}
      {tab === 'swatches' && <FitSetCard storeId={storeId} mine={mine} />}
      {tab === 'swatches' && books.length > 0 && <>{exBooks.strip && <div className="flex justify-end mb-2">{exBooks.strip}</div>}<Card className="mb-3"><table className="t">
        <thead><tr><th>Swatch book</th><th>From</th><th>Dispatched</th><th></th></tr></thead>
        <tbody>{exBooks.rows.map(b => <tr key={b.id}><td className="font-medium">{b.kind} book · {b.edition}<div className="text-[11px] font-normal" style={{ color:'var(--ink-faint)' }}>{b.copies} cop{b.copies === 1 ? 'y' : 'ies'}</div></td><td className="text-[12.5px]">{b.from === 'unit' ? 'Production unit' : db.vendors.find(v => v.id === b.from)?.name}</td><td>{fmtDate(b.dispatchedOn)} <span className="text-[11px]" style={{ color: daysAgo(b.dispatchedOn) > 7 ? 'var(--risk)' : 'var(--ink-faint)' }}>({daysAgo(b.dispatchedOn)}d ago)</span></td><td>{mine && <Button size="sm" variant="primary" onClick={() => receiveSwatchBook(b.id)}>Received — on the floor</Button>}</td></tr>)}</tbody>
      </table></Card></>}
      {tab === 'swatches' && (swatches.length === 0 ? <Card><Empty title={books.length ? 'No loose swatches pending.' : 'All confirmed.'} body="Every dispatch to this store has been acknowledged." /></Card> : <>{exSwatches.strip && <div className="flex justify-end mb-2">{exSwatches.strip}</div>}<Card><table className="t">
        <thead><tr><th>Fabric</th><th>Dispatched</th><th></th></tr></thead>
        <tbody>{exSwatches.rows.map(s => <tr key={s.id}><td className="font-medium">{db.fabrics.find(f => f.id === s.fabricId)?.name}</td><td>{fmtDate(s.dispatchedOn)} <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>({daysAgo(s.dispatchedOn)}d ago)</span></td><td>{mine && <Button size="sm" variant="primary" onClick={() => confirmSwatch(s.id)}>Confirm it arrived</Button>}</td></tr>)}</tbody>
      </table></Card></>)}

      {tab === 'pullback' && <>
        {exPullBack.strip && <div className="flex justify-end mb-2">{exPullBack.strip}</div>}
        <Card><table className="t">
          <thead><tr><th>Style</th><th>Sub-category</th><th>Why</th><th>Action</th></tr></thead>
          <tbody>{exPullBack.rows.map(o => { const h = healthOf(o); return <tr key={o.id}><td className="font-medium">{o.styleName}</td><td className="text-[12.5px]">{o.subCat1}</td><td className="text-[12.5px]" style={{ color:'var(--ink-soft)' }}>{h.why}</td><td><Pill tone="risk">{h.action}</Pill></td></tr>; })}</tbody>
        </table></Card>
        <div className="mt-3"><Note>Anything marked LIQUIDATE or EXIT comes off the display and goes back to the warehouse.</Note></div>
      </>}

      {tab === 'returns' && <div className="flex justify-end items-center gap-3 mb-2">{exReturns.strip}{mine && <Button variant="primary" size="sm" onClick={() => set('open', 'new')}>+ Raise a return</Button>}</div>}
      {tab === 'damaged' && <WriteOffTab storeId={storeId} mine={mine} />}
      {tab === 'returns' && <Card><div style={{ overflowX:'auto' }}><table className="t">
        <thead><tr><th>Case</th><th>Style</th><th>Why</th><th>Wants</th><th>Tried</th><th>Where it is</th><th>Waiting on</th><th>Opened</th></tr></thead>
        <tbody>{exReturns.rows.map(r => { const rs = returnStatusOf(r); return <tr key={r.id} className="row" onClick={() => set('open', r.id)}>
          <td className="mono text-[12.5px]">{r.caseNo}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{r.kind}</div></td><td className="text-[12.5px]">{r.styleName}</td>
          <td><Pill tone={r.reason === 'Changed mind' ? 'neutral' : 'warn'}>{r.reason}</Pill></td><td className="text-[12.5px]">{r.wants}</td>
          <td className="text-[11.5px]">{r.attempts.length ? r.attempts.map(x => `${x.step}${x.outcome === 'not enough' ? ' ✗' : x.outcome === 'accepted' ? ' ✓' : '…'}`).join(' → ') : <span style={{ color:'var(--ink-faint)' }}>nothing yet</span>}</td>
          <td><Pill tone={r.closedOn ? 'good' : rs.overdue ? 'risk' : 'info'}>{rs.label}</Pill></td>
          <td className="text-[12px]">{rs.waitingOn ? ROLE_LABEL[rs.waitingOn] : '—'}</td>
          <td style={{ color: rs.overdue ? 'var(--risk)' : undefined }}>{fmtDate(r.openedOn)}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{daysAgo(r.openedOn)}d of {r.slaDays}d</div></td>
        </tr>; })}</tbody>
      </table></div></Card>}
      {tab === 'returns' && <div className="mt-3"><Note>Alteration or refit first, then remake, then store credit or refund — only a refund goes to finance.</Note></div>}

      <Drawer open={!!openOrder || !!punching} onClose={() => set('open', null)} title={punching ? 'Punch a bill' : openOrder?.orderNo ?? ''} subtitle={openOrder && <><Pill tone={openOrder.kind === 'MTM' ? 'accent' : 'info'}>{openOrder.kind}</Pill><span>{openOrder.customer} · {openOrder.styleName}</span></>}>
        {punching && <PunchForm kind={punching} fabrics={db.fabrics} options={db.options} storeId={storeId} initialCustomer={params.get('customer') ?? undefined} onSave={(pieces, creditApplied) => { const ids = punchBill(pieces); if (creditApplied > 0) redeemCredit(pieces[0].customer, creditApplied, ids[0], `spent on bill · ${pieces.length} piece${pieces.length === 1 ? '' : 's'}`); set('open', ids[0]); }} />}
        {openOrder && <><OrderDetailCard o={openOrder} mine={mine} onAdvance={() => fulfilOrder(openOrder.id)} onCancel={() => cancelOrder(openOrder.id)} onReturn={() => { const n = new URLSearchParams(params); n.set('tab', 'returns'); n.set('order', openOrder.id); n.set('open', 'new'); setParams(n, { replace:true }); }} />
          {(() => { const same = openOrder.billNo ? (db.customerOrders ?? []).filter(x => x.billNo === openOrder.billNo && x.id !== openOrder.id) : []; return same.length > 0 && <Section title={`On the same bill · ${same.length + 1} pieces`} defaultOpen pending={false} ownerRole={null} right={<span className="mono text-[11px]" style={{ color:'var(--ink-faint)' }}>{openOrder.billNo}</span>}>
            {same.map(x => <div key={x.id} className="kv"><span className="k"><button type="button" className="vlink mono text-[12px]" onClick={() => set('open', x.id)}>{x.orderNo}</button> · <span className={`pill ${x.kind === 'MTM' ? 'role-design' : 'info'}`}>{x.kind}</span> {x.styleName}{x.fit ? ` · ${x.fit}` : ''}{x.size ? ` · ${x.size}` : ''} · ×{x.qty}</span><span className="v"><Pill tone={STAGE_TONE[x.stage]}>{STAGE_LABEL[x.stage]}</Pill></span></div>)}
          </Section>; })()}
          {openOrder.kind === 'MTM' && <SheetHistory o={openOrder} />}{openOrder.kind === 'MTM' && <SheetChangePanel o={openOrder} who="store" />}<Files kind="customerOrder" subjectId={openOrder.id} labels={FILE_LABELS.customerOrder} editable={mine} /><ThreadPanel kind="order" subjectId={openOrder.id} steps={['Change from store', 'General']} /><Note>A change after the order has gone to planning goes here, not on mail.</Note></>}
      </Drawer>

      <Drawer open={!!openCustomer} onClose={() => set('open', null)} title={openCustomer ?? ''} subtitle={openCustomer && <span>customer · {customerOf(db, openCustomer).orders.length} orders · home store {STORES.find(x => x.id === customerOf(db, openCustomer).homeStore)?.name ?? '—'}</span>}>
        {openCustomer && <Customer360 name={openCustomer} storeId={storeId} mine={mine} onPunch={() => { const n = new URLSearchParams(params); n.set('customer', openCustomer); n.set('open', 'punch-mtm'); setParams(n, { replace:true }); }} />}
      </Drawer>
      <Drawer open={!!openReturn || newReturn} onClose={() => set('open', null)} title={newReturn ? 'Raise a return or alteration' : openReturn?.caseNo ?? ''} subtitle={openReturn && <span>{openReturn.styleName} · {openReturn.stage.replace(/-/g, ' ')}</span>}>
        {newReturn && <ReturnForm storeId={storeId} initialOrderId={params.get('order')} onSave={i => { const id = raiseReturn(i); const n = new URLSearchParams(params); n.delete('order'); n.set('open', id); n.set('tab', 'returns'); setParams(n, { replace:true }); }} />}
        {openReturn && <>
          <ReturnDetail r={openReturn} editable={mine} onSave={p => updateReturn(openReturn.id, p)}  />
          <Files kind="return" subjectId={openReturn.id} labels={FILE_LABELS.return} editable={mine} hint="a photo of the defect is worth the whole Slack thread" />
          <ThreadPanel kind="return" subjectId={openReturn.id} />
        </>}
      </Drawer>
    </Page>
  );
}

/* A return or an alteration is raised on a PIECE the customer bought — the order
   line on their bill — not on a style name. Pick the customer, pick the piece;
   the style, the kind (MTM or off the shelf) and the order come with it, so the
   case, the order and the customer's 360 all point at the same thing. */
function ReturnForm({ storeId, initialOrderId, onSave }: { storeId: string; initialOrderId?: string | null; onSave: (i: Pick<ReturnCase, 'styleName' | 'reason' | 'wants' | 'remarks'> & { orderId: string | null; kind: 'MTM' | 'RTW' }) => void }) {
  const { db } = useApp();
  const delivered = (db.customerOrders ?? []).filter(o => o.storeId === storeId && o.stage === 'delivered').sort((a, b) => b.punchedOn.localeCompare(a.punchedOn));
  const initial = initialOrderId ? (db.customerOrders ?? []).find(o => o.id === initialOrderId) ?? null : null;
  const [customer, setCustomer] = useState(initial?.customer ?? '');
  const customers = [...new Set(delivered.map(o => o.customer))].sort();
  /* the customer's name, or the order or bill number off the slip — either finds the piece */
  const q = customer.trim().toLowerCase();
  const byNumber = q ? delivered.filter(o => o.orderNo.toLowerCase().includes(q) || (o.billNo ?? '').toLowerCase().replace('bill-', '').includes(q.replace('bill-', ''))) : [];
  const byName = delivered.filter(o => o.customer.toLowerCase() === q);
  const pieces = byName.length ? byName : byNumber;
  const [orderId, setOrderId] = useState<string>(initial?.id ?? '');
  const piece = pieces.find(o => o.id === orderId) ?? (pieces.length === 1 && q.length >= 4 && !byName.length ? pieces[0] : null);
  const [reason, setReason] = useState<ReturnCase['reason']>('Fit');
  const [wants, setWants] = useState<ReturnCase['wants']>('Exchange');
  const [remarks, setRemarks] = useState('');
  const bills = [...new Set(pieces.map(o => o.billNo ?? o.orderNo))];
  const pieceLabel = (o: CustomerOrder) => `${o.orderNo} · ${o.styleName}${o.fit ? ` · ${o.fit}` : ''}${o.size ? ` · ${o.size}` : ''}${o.hemLength != null ? ` · ${o.hemLength}"` : ''} · ${o.kind} · bought ${fmtDate(o.punchedOn)}`;
  return (
    <Section title="Which piece" right={<span className="pill role-store">Store</span>}>
      <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <div style={{ gridColumn:'1 / -1' }}><Field label="Customer · or order / bill number" hint="the name on the bill, or the order number (BSC-74078) or bill number off the slip — pieces collected from this store appear below">
          <Input list="return-customers" value={customer} onChange={e => { setCustomer(e.target.value); setOrderId(''); }} placeholder="A. Kulkarni · or BSC-74078 · or bill 74553" />
          <datalist id="return-customers">{customers.map(c => <option key={c} value={c} />)}{delivered.slice(0, 60).map(o => <option key={o.id} value={o.orderNo}>{o.customer} · {o.styleName}</option>)}</datalist></Field></div>
        {customer.trim() && <div style={{ gridColumn:'1 / -1' }}>
          {pieces.length === 0 ? <Note tone="warn">No delivered piece matches "{customer}" at this store. Check the spelling or the number, or the piece may have been sold from another store — raise it there.</Note>
          : <Field label={byName.length ? `The piece · ${pieces.length} delivered${bills.length > 1 ? ` on ${bills.length} bills` : ''}` : `Matched by number · ${pieces.length} piece${pieces.length === 1 ? '' : 's'}${pieces[0] ? ` · ${pieces[0].customer}` : ''}`}>
              <Select value={piece?.id ?? ''} onChange={setOrderId} options={[{ value:'', label:'— pick the piece the customer brought back —' }, ...pieces.map(o => ({ value:o.id, label: pieceLabel(o) }))]} /></Field>}
        </div>}
        {piece && (() => { const d = piece.scans.find(s => s.stage === 'delivered')?.at ?? null; const days = d ? daysAgo(d) : null; return <div style={{ gridColumn:'1 / -1' }}><Note tone={days == null ? undefined : days <= 30 ? 'good' : 'warn'}>{days == null ? 'Delivery date not on record — the 30-day window cannot be checked.' : days <= 30 ? `Delivered ${days}d ago — inside the 30-day window: alteration is free (here if the master can, else at the factory) and a return gets a credit note.` : `Delivered ${days}d ago — outside the 30-day window: alteration is chargeable and a return needs HO's say.`}</Note></div>; })()}
        {piece && <div style={{ gridColumn:'1 / -1' }} className="flex items-center gap-2 flex-wrap text-[12px]" >
          <span className={`pill ${piece.kind === 'MTM' ? 'role-design' : 'info'}`}>{piece.kind}</span><b>{piece.styleName}</b>
          {piece.billNo && <span style={{ color:'var(--ink-faint)' }}>bill {piece.billNo.replace('BILL-', '')}{(db.customerOrders ?? []).filter(x => x.billNo === piece.billNo).length > 1 ? ` · ${(db.customerOrders ?? []).filter(x => x.billNo === piece.billNo).length} pieces on it` : ''}</span>}
          {piece.kind === 'MTM' && <span style={{ color:'var(--ink-faint)' }}>· made at {db.vendors.find(v => v.id === piece.factoryId)?.name ?? 'the factory'} · sheet rev {sheetRev(piece) - 1 || 1}</span>}
          {creditBalanceOf(db, piece.customer) > 0 && <span className="pill good">holds ₹{creditBalanceOf(db, piece.customer).toLocaleString('en-IN')} store credit</span>}
        </div>}
        <Field label="Reason"><Select value={reason} onChange={v => setReason(v as ReturnCase['reason'])} options={RETURN_REASONS.map(x => ({ value:x, label:x }))} /></Field>
        <Field label="Customer wants" hint="an alteration or refit is the first rung whatever they ask for — the ladder is on the case"><Select value={wants} onChange={v => setWants(v as ReturnCase['wants'])} options={RETURN_WANTS.map(x => ({ value:x, label:x }))} /></Field>
        <div style={{ gridColumn:'1 / -1' }}><Field label="Remarks — in your words" hint="what the customer said, what you saw"><Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="e.g. chest tight, sleeve long by an inch" /></Field></div>
      </div>
      <Button variant="primary" size="sm" disabled={!piece} onClick={() => piece && onSave({ styleName: piece.styleName, reason, wants, remarks: remarks.trim(), orderId: piece.id, kind: piece.kind === 'MTM' ? 'MTM' : 'RTW' })}>Raise the case</Button>
      <div className="pt-2"><Note>The case sits on the piece — two "Fit" cases on one style in a month is a size-set question for design.</Note></div>
    </Section>
  );
}

function ReturnDetail({ r, editable, onSave }: { r: ReturnCase; editable: boolean; onSave: (p: Partial<Pick<ReturnCase, 'reason' | 'wants' | 'remarks'>>) => void; onAdvance?: () => void }) {
  const { db, role, startResolution, decideResolution, sendReturnToFactory, factoryReceivedReturn, returnDoneAtFactory, approveRefund } = useApp();
  const rs = returnStatusOf(r);
  const prod = role === 'production' || role === 'owner';
  const canApprove = role === 'owner' || role === 'planning';   // HO signs off a full refund
  const [reason, setReason] = useState<ReturnCase['reason']>(r.reason);
  const [wants, setWants] = useState<ReturnCase['wants']>(r.wants);
  const [remarks, setRemarks] = useState(r.remarks);
  const [note, setNote] = useState('');
  const factories = db.vendors.filter(v => v.mtm && v.kind !== 'Hemming unit');
  const [factory, setFactory] = useState(r.factoryLeg?.factoryId ?? (r.orderId ? (db.customerOrders ?? []).find(o => o.id === r.orderId)?.factoryId : null) ?? factories[0]?.id ?? '');
  const leg = r.factoryLeg; const last = rs.last;
  const needsFactory = r.kind === 'MTM' && last && last.outcome === 'pending' && ((last.step === 'alteration' && last.where === 'factory') || last.step === 'remake') && (!leg || !leg.sentOn);
  const [where, setWhere] = useState<'store' | 'factory' | 'hemming-unit'>('store');
  const hem = r.hemLeg ?? null;
  const needsHem = !!last && last.outcome === 'pending' && last.step === 'alteration' && last.where === 'hemming-unit' && (!hem || !hem.handedOn);
  const hemOut = !!hem && !!hem.handedOn && !hem.deliveredOn;
  const pieceOut = (leg && leg.sentOn && !leg.backAtStoreOn) || hemOut;
  const canDecide = editable && last && last.outcome === 'pending' && !r.refund && !pieceOut && !needsFactory && !needsHem;
  const canStart = editable && !r.closedOn && (!last || last.outcome === 'not enough');
  return <>
    <Section title="The case" right={<Pill tone={r.closedOn ? 'good' : rs.overdue ? 'risk' : 'info'}>{rs.label}</Pill>}>
      <KV k="Style" v={r.styleName} note={`${r.kind}${r.orderId ? ` · ${(db.customerOrders ?? []).find(o => o.id === r.orderId)?.orderNo ?? ''}` : ''}`} />
      <KV k="Opened" v={fmtDate(r.openedOn)} note={`${daysAgo(r.openedOn)}d against ${r.slaDays}d SLA${rs.waitingOn ? ` · waiting on ${ROLE_LABEL[rs.waitingOn]}` : ''}`} />
      {editable && !r.closedOn ? <>
        <div className="grid gap-2.5 py-2" style={{ gridTemplateColumns:'1fr 1fr' }}>
          <Field label="Reason"><Select value={reason} onChange={v => setReason(v as ReturnCase['reason'])} options={RETURN_REASONS.map(x => ({ value:x, label:x }))} /></Field>
          <Field label="Customer wants"><Select value={wants} onChange={v => setWants(v as ReturnCase['wants'])} options={RETURN_WANTS.map(x => ({ value:x, label:x }))} /></Field>
          <div style={{ gridColumn:'1 / -1' }}><Field label="What happened, in the store's words"><Input value={remarks} onChange={e => setRemarks(e.target.value)} /></Field></div>
        </div>
        <Button size="sm" onClick={() => onSave({ reason, wants, remarks: remarks.trim() })}>Save</Button>
      </> : <><KV k="Reason" v={r.reason} /><KV k="Customer wants" v={r.wants} /><KV k="Remarks" v={r.remarks || '—'} /></>}
    </Section>

    <Section title="What to do · the ladder" defaultOpen={!r.closedOn} ownerRole={r.closedOn ? null : 'store'} pending={false} right={<Pill tone={r.closedOn ? 'good' : 'neutral'}>{r.closedOn ? `closed ${fmtDate(r.closedOn)}` : `${r.attempts.length} rung${r.attempts.length === 1 ? '' : 's'} tried`}</Pill>}>
      {RESOLUTION_LADDER.map(l => { const a = r.attempts.find(x => x.step === l.step); const tone = !a ? 'neutral' : a.outcome === 'accepted' ? 'good' : a.outcome === 'not enough' ? 'risk' : 'warn';
        return <div key={l.step} className="kv"><span className="k flex items-center gap-2"><span className="dot" style={{ background: !a ? 'var(--line)' : a.outcome === 'accepted' ? 'var(--good)' : a.outcome === 'not enough' ? 'var(--risk)' : 'var(--warn)' }} />{l.label}<span className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>· {l.who}</span></span>
          <span className="v text-[12px]">{a ? <><Pill tone={tone}>{a.outcome === 'pending' ? 'in progress' : a.outcome}</Pill><div style={{ color:'var(--ink-faint)' }}>{fmtDate(a.startedOn)} · {a.by}{a.where ? ` · ${a.where === 'store' ? 'by the store' : a.where === 'hemming-unit' ? 'at the hemming unit' : 'at the factory'}` : ''}{a.note ? ` — ${a.note}` : ''}</div></> : <span style={{ color:'var(--ink-faint)' }}>—</span>}</span></div>; })}
      {canStart && (() => {
        /* The store manager's question, in the store manager's order: can I fix it
           here, right now? If not, where do I send it? If it comes back and it is
           still not right, what do I give them? */
        const order = r.orderId ? (db.customerOrders ?? []).find(o => o.id === r.orderId) ?? null : null;
        const opt = order?.optionId ? db.options.find(x => x.id === order.optionId) ?? null : null;
        const here = opt ? storeStockOf(opt)[r.storeId] ?? {} : {};
        const sizes = opt ? opt.sizes.filter(sz => sz !== order?.size && (here[sz] ?? 0) > 0) : [];
        const tried = (s: ResolutionStep) => r.attempts.some(x => x.step === s);
        const go = (s: ResolutionStep, w?: 'store' | 'factory' | 'hemming-unit', extra?: { size?: string }) => { startResolution(r.id, s, note.trim(), w, extra); setNote(''); };
        const credit = order ? creditBalanceOf(db, order.customer) : 0;
        const card = (title: string, body: React.ReactNode, tone: 'good' | 'warn' | 'neutral' = 'neutral') => <div className="card" style={{ padding:'10px 12px', borderLeft:`3px solid var(${tone === 'good' ? '--good' : tone === 'warn' ? '--warn' : '--line'})` }}><div className="text-[12.5px] font-semibold mb-1">{title}</div>{body}</div>;
        return <div className="pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
          <div className="cap" style={{ marginTop: 0 }}>{r.attempts.length ? 'That was not enough · what next?' : 'What can you do for them, right now?'}</div>
          <div className="pb-2"><Field label="What was agreed with the customer" hint="goes on the rung you pick"><Input value={note} onChange={e => setNote(e.target.value)} placeholder={r.kind === 'MTM' ? 'take in chest 2 cm · sleeve −1 cm' : 'take up 1 inch · swap to the 40'} /></Field></div>
          <div className="grid gap-2" style={{ gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {!tried('alteration') && card('Fix it here', <>
              <div className="text-[11.5px] pb-1.5" style={{ color:'var(--ink-faint)' }}>Our own tailor or in-store hemming. The customer waits or comes back the same week.</div>
              <Button size="sm" variant="primary" onClick={() => go('alteration', 'store')}>Alter it in the store</Button></>, 'good')}
            {r.kind === 'RTW' && !tried('exchange') && opt && card('Swap from the shelf', sizes.length
              ? <><div className="text-[11.5px] pb-1.5" style={{ color:'var(--ink-faint)' }}>Another size of the same style is on this shelf — hand it over and the case is closed.</div>
                  <div className="flex gap-1 flex-wrap">{sizes.map(sz => <Button key={sz} size="sm" onClick={() => go('exchange', undefined, { size: sz })}>Size {sz} · {here[sz]} here</Button>)}</div></>
              : <div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>No other size of this style on the shelf. Ask another store on the Stock asks tab, or send it out.</div>, sizes.length ? 'good' : 'neutral')}
            {!tried('alteration') && card('Send it out for the work', <>
              <div className="text-[11.5px] pb-1.5" style={{ color:'var(--ink-faint)' }}>Hemming unit through the warehouse — inward, hem, back to the warehouse, then to you or the customer{r.kind === 'MTM' ? '; or back to the factory that made it' : ''}.</div>
              <div className="flex gap-1 flex-wrap"><Button size="sm" onClick={() => go('alteration', 'hemming-unit')}>To the hemming unit</Button>{r.kind === 'MTM' && <Button size="sm" onClick={() => go('alteration', 'factory')}>Back to the factory</Button>}</div></>)}
            {r.kind === 'MTM' && !tried('refit') && card('Refit', <><div className="text-[11.5px] pb-1.5" style={{ color:'var(--ink-faint)' }}>Measure again; the corrected sheet goes on the record.</div><Button size="sm" onClick={() => go('refit')}>Re-measure</Button></>)}
            {r.kind === 'MTM' && !tried('remake') && card('Remake', <><div className="text-[11.5px] pb-1.5" style={{ color:'var(--ink-faint)' }}>A new piece on the corrected sheet, at the factory. ~14 days.</div><Button size="sm" variant={tried('alteration') ? 'primary' : undefined} onClick={() => go('remake')}>Remake at the factory</Button></>, tried('alteration') ? 'warn' : 'neutral')}
            {(!tried('store-credit') || !tried('refund')) && card('Give the money back', <>
              <div className="text-[11.5px] pb-1.5" style={{ color:'var(--ink-faint)' }}>Taking the piece back generates a credit note on the customer's account, good for a year, and closes the case{credit > 0 ? ` (they already hold ₹${credit.toLocaleString('en-IN')})` : ''}. A refund goes to finance.</div>
              <div className="flex gap-1 flex-wrap">{!tried('store-credit') && <Button size="sm" variant="primary" onClick={() => go('store-credit')}>Take it back · credit note</Button>}{!tried('refund') && <Button size="sm" variant="danger" onClick={() => go('refund')}>Refund</Button>}</div></>, r.attempts.length >= 2 ? 'warn' : 'neutral')}
          </div>
          <div className="text-[11px] pt-2" style={{ color:'var(--ink-faint)' }}>Whatever you pick goes on the ladder above, in order. Skipping a rung is your call and stays on the record.</div>
        </div>; })()}
      {canDecide && <div className="pt-3 flex gap-2 items-end flex-wrap" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div className="flex-1" style={{ minWidth: 200 }}><Field label={`Did the ${last!.step} work?`}><Input value={note} onChange={e => setNote(e.target.value)} placeholder="what the customer said" /></Field></div>
        <Button size="sm" variant="primary" onClick={() => { decideResolution(r.id, 'accepted', note.trim()); setNote(''); }}>Close · happy</Button>
        <Button size="sm" variant="danger" onClick={() => { decideResolution(r.id, 'not enough', note.trim()); setNote(''); }}>Not enough</Button>
      </div>}
      {!editable && !r.closedOn && rs.waitingOn === 'store' && <ActsBy role="store" does="decides the next rung with the customer, or closes the case" />}
    </Section>

    {r.kind === 'MTM' && (leg || needsFactory) && <Section title="The piece's round trip · store → factory → store" right={<Pill tone={leg?.backAtStoreOn ? 'good' : leg?.receivedAtFactoryOn ? 'info' : leg?.sentOn ? 'warn' : 'neutral'}>{leg?.backAtStoreOn ? 'back at store' : leg?.receivedAtFactoryOn ? 'at the factory' : leg?.sentOn ? 'in the vehicle' : 'not sent yet'}</Pill>}>
      <div className="kv"><span className="k flex items-center gap-2"><span className="dot" style={{ background: leg?.sentOn ? 'var(--good)' : 'var(--line)' }} />Handed to the vehicle by the store</span><span className="v text-[12px]">{leg?.sentOn ? fmtDate(leg.sentOn) : '—'}</span></div>
      <div className="kv"><span className="k flex items-center gap-2"><span className="dot" style={{ background: leg?.receivedAtFactoryOn ? 'var(--good)' : 'var(--line)' }} />Scanned in at {db.vendors.find(v => v.id === leg?.factoryId)?.name ?? 'the factory'}</span><span className="v text-[12px]">{leg?.receivedAtFactoryOn ? fmtDate(leg.receivedAtFactoryOn) : leg?.sentOn ? <span style={{ color:'var(--warn)' }}>not yet · {daysAgo(leg.sentOn)}d in transit</span> : '—'}</span></div>
      <div className="kv"><span className="k flex items-center gap-2"><span className="dot" style={{ background: leg?.backAtStoreOn ? 'var(--good)' : 'var(--line)' }} />Back at the store, counted in</span><span className="v text-[12px]">{leg?.backAtStoreOn ? fmtDate(leg.backAtStoreOn) : r.stage === 'back-at-store' && leg?.receivedAtFactoryOn ? <span style={{ color:'var(--info)' }}>on its way — count it in on "Received from the unit"</span> : '—'}</span></div>
      {needsFactory && editable && <div className="pt-3 flex gap-2 items-end flex-wrap" style={{ borderTop:'1px solid var(--line-soft)' }}><div style={{ width: 220 }}><Field label="To which factory"><Select value={factory} onChange={setFactory} options={factories.map(f => ({ value:f.id, label:f.name }))} /></Field></div><Button size="sm" variant="primary" onClick={() => sendReturnToFactory(r.id, factory)}>Handed to the vehicle</Button></div>}
      {needsFactory && !editable && <ActsBy role="store" does="hands the piece to the vehicle for the factory" />}
      {leg?.sentOn && !leg.receivedAtFactoryOn && (prod ? <div className="pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}><Button size="sm" variant="primary" onClick={() => factoryReceivedReturn(r.id)}>Scanned in at the factory</Button></div> : <ActsBy role="production" does="scans the returned piece in at the factory — so the store stops asking on Slack" />)}
      {leg?.receivedAtFactoryOn && !leg.backAtStoreOn && r.stage !== 'back-at-store' && (prod ? <div className="pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}><Button size="sm" variant="primary" onClick={() => returnDoneAtFactory(r.id)}>{last?.step === 'remake' ? 'Remade' : 'Altered'} — on its way back</Button></div> : <ActsBy role="production" does={`records the ${last?.step ?? 'work'} done and sends it back`} />)}
    </Section>}

    <HemTripSection r={r} />

    {r.refund && <Section title={r.refund.kind === 'refund' ? 'Refund' : `Credit note${(db.creditLedger ?? []).find(e => e.caseId === r.id)?.creditNoteNo ? ` · ${(db.creditLedger ?? []).find(e => e.caseId === r.id)!.creditNoteNo}` : ''}`} right={<Pill tone={r.refund.movedOn ? 'good' : 'warn'}>{r.refund.movedOn ? `${r.refund.kind === 'refund' ? 'moved' : 'given'} ${fmtDate(r.refund.movedOn)}` : 'with finance'}</Pill>}>
      <KV k="Amount" v={`₹${r.refund.amount.toLocaleString('en-IN')}`} note={r.refund.kind === 'store-credit' ? 'given by the store on the spot' : `requested ${fmtDate(r.refund.requestedOn)} · ${daysAgo(r.refund.requestedOn)}d ago`} />
      {r.refund.kind === 'store-credit' && <KV k="Valid until" v={fmtDate(iso(addDays(r.refund.requestedOn, CREDIT_VALID_DAYS)))} note="a credit note is good for a year, like a gift card" />}
      {r.refund.kind === 'refund' && !r.refund.movedOn && <KV k="HO approval" v={r.refund.approvedOn ? `approved ${fmtDate(r.refund.approvedOn)} by ${r.refund.approvedBy}` : <span style={{ color:'var(--warn)' }}>waiting</span>} note="a full refund to the bank needs HO approval before finance moves it; it goes back to the same account" />}
      {r.refund.kind === 'refund' && !r.refund.movedOn && !r.refund.approvedOn && canApprove && <div className="pt-2"><Button size="sm" variant="primary" onClick={() => approveRefund(r.id)}>Approve the refund</Button></div>}
      {r.refund.movedOn ? <KV k={r.refund.kind === 'refund' ? 'Moved by' : 'Given by'} v={r.refund.by ?? 'Finance'} note={r.refund.kind === 'refund' ? 'the store can tell the customer — no need to check' : 'on the customer\'s account'} />
        : <div className="pt-2 text-[12px]" style={{ color:'var(--ink-faint)' }}>the money moves in accounts, outside this tool — the record here says what was agreed</div>}
    </Section>}
  </>;
}

/* ---------- damaged and unsellable: written off the moment the store decides, so the system never shows a piece that is not there ---------- */
function WriteOffTab({ storeId, mine }: { storeId: string; mine: boolean }) {
  const { db, writeOffStock } = useApp();
  const mineOptions = db.options.filter(o => Object.values(o.stockBySize).some(q => q > 0));
  const [optionId, setOptionId] = useState(mineOptions[0]?.id ?? '');
  const opt = db.options.find(o => o.id === optionId);
  const [size, setSize] = useState(opt?.sizes.find(sz => (opt.stockBySize[sz] ?? 0) > 0) ?? '');
  const [qty, setQty] = useState('1'); const [reason, setReason] = useState<StockWriteOff['reason']>('Damaged'); const [disp, setDisp] = useState<StockWriteOff['disposition']>('sent back to unit');
  const log = (db.writeOffs ?? []).filter(w => w.storeId === storeId);
  const ex = useExamples(log, w => w.disposition === 'destroyed' ? 'destroyed' : w.backAtUnitOn ? 'back at the unit' : 'on its way back', { noun: 'write-offs', done: w => w.disposition === 'destroyed' || !!w.backAtUnitOn });
  return <>
    {mine ? <Card className="mb-3"><Section title="Write off a piece">
      <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'2fr 1fr 1fr' }}>
        <Field label="Style"><Select value={optionId} onChange={v => { setOptionId(v); const o = db.options.find(x => x.id === v); setSize(o?.sizes.find(sz => (o.stockBySize[sz] ?? 0) > 0) ?? ''); }} options={mineOptions.map(o => ({ value:o.id, label:o.styleName }))} /></Field>
        <Field label="Size"><Select value={size} onChange={setSize} options={(opt?.sizes ?? []).map(sz => ({ value:sz, label:`${sz} · ${opt?.stockBySize[sz] ?? 0} in system` }))} /></Field>
        <Field label="Qty"><Input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} /></Field>
        <Field label="Why"><Select value={reason} onChange={v => setReason(v as StockWriteOff['reason'])} options={WRITE_OFF_REASONS.map(x => ({ value:x, label:x }))} /></Field>
        <Field label="What happens to it"><Select value={disp} onChange={v => setDisp(v as StockWriteOff['disposition'])} options={[{ value:'sent back to unit', label:'Sent back to the unit' }, { value:'destroyed', label:'Destroyed / disposed' }]} /></Field>
        <div className="flex items-end"><Button variant="primary" size="sm" disabled={!optionId || !size || !Number(qty)} onClick={() => writeOffStock({ optionId, size, qty: Number(qty), reason, disposition: disp })}>Write off · stock drops now</Button></div>
      </div>
    </Section></Card> : <div className="mb-2"><ActsBy role="store" does="writes off damaged or unsellable pieces the day they are found" inline /></div>}
    {log.length === 0 ? <Card><Empty title="Nothing written off." body="A damaged piece written off here leaves the system the same minute — no ghost stock." /></Card> : <>{ex.strip && <div className="flex justify-end mb-2">{ex.strip}</div>}<Card><table className="t compact">
      <thead><tr><th>When</th><th>Style</th><th className="num">Size</th><th className="num">Qty</th><th>Why</th><th>Disposition</th><th>By</th></tr></thead>
      <tbody>{ex.rows.map(w => <tr key={w.id}><td className="text-[12px]">{fmtDate(w.at)}</td><td className="text-[12.5px]">{w.styleName}</td><td className="num mono">{w.size}</td><td className="num">{w.qty}</td><td><Pill tone="warn">{w.reason}</Pill></td><td className="text-[12px]">{w.disposition}{w.disposition === 'sent back to unit' ? <div style={{ color: w.backAtUnitOn ? 'var(--good)' : 'var(--ink-faint)' }}>{w.backAtUnitOn ? `unit counted it in ${fmtDate(w.backAtUnitOn)}` : 'unit yet to count it in'}</div> : null}</td><td className="text-[12px]">{w.by}</td></tr>)}</tbody>
    </table></Card></>}
    <div className="mt-3"><Note>Writing off a damaged piece drops system stock the same minute, so a store cannot bill something that is not there.</Note></div>
  </>;
}

/* ---------- the store's own orders: MTM and RTW are different promises ---- */
const STAGE_TONE: Record<CustomerOrder['stage'], 'neutral' | 'info' | 'warn' | 'good' | 'risk'> = { punched:'info', pp:'warn', planned:'info', 'in-transit':'info', 'in-factory':'info', 'out-factory':'good', rts:'good', dispatched:'good', ready:'good', hemming:'warn', delivered:'neutral', cancelled:'neutral' };
const STAGE_LABEL: Record<CustomerOrder['stage'], string> = { punched:'punched', pp:'awaiting plan', planned:'planned', 'in-transit':'in production', 'in-factory':'in factory', 'out-factory':'out factory', rts:'RTS', dispatched:'dispatched', ready:'ready', hemming:'hemming', delivered:'delivered', cancelled:'cancelled' };
const NEXT_LABEL: Record<CustomerOrder['stage'], string | null> = { punched:'Hand over from shelf', ready:'Delivered', hemming:'Delivered', dispatched:'Handed to customer', pp:null, planned:null, 'in-transit':null, 'in-factory':null, 'out-factory':null, rts:null, delivered:null, cancelled:null };

function OrdersTab({ kind, orders, mine, onOpen, onPunch, onAdvance }: { kind: 'MTM' | 'RTW'; orders: CustomerOrder[]; mine: boolean; onOpen: (id: string) => void; onPunch: () => void; onAdvance: (id: string) => void }) {
  const { db } = useApp();
  const [stage, setStage] = useState('open');
  const [from, setFrom] = useState(dateInput(iso(addDays(TODAY, -30))));
  const [to, setTo] = useState(dateInput(iso(TODAY)));
  const [q, setQ] = useState('');
  const rows = orders
    .filter(o => stage === 'all' ? true : stage === 'open' ? !['delivered', 'cancelled'].includes(o.stage) : o.stage === stage)
    .filter(o => (!from || o.punchedOn >= from) && (!to || o.punchedOn.slice(0, 10) <= to))
    .filter(o => !q || `${o.orderNo} ${o.customer} ${o.styleName} ${o.size ?? ''} ${o.fit ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.punchedOn.localeCompare(a.punchedOn));
  const stages = kind === 'MTM' ? ['punched', 'pp', 'planned', 'in-transit', 'in-factory', 'out-factory', 'rts', 'dispatched', 'delivered', 'cancelled'] : ['punched', 'hemming', 'dispatched', 'delivered', 'cancelled'];
  const ex = useExamples(rows, o => o.stage, { noun: 'orders', done: o => o.stage === 'delivered' });
  return <>
    <div className="flex gap-2 items-end flex-wrap mb-2">
      <div style={{ width: 160 }}><Field label="Stage"><Select value={stage} onChange={setStage} options={[{ value:'open', label:'Open' }, { value:'all', label:'All' }, ...stages.map(s => ({ value:s, label:STAGE_LABEL[s as CustomerOrder['stage']] }))]} /></Field></div>
      <div style={{ width: 150 }}><Field label="Punched from"><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field></div>
      <div style={{ width: 150 }}><Field label="to"><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field></div>
      <div className="flex-1" style={{ minWidth: 180 }}><Field label="Search"><Input value={q} onChange={e => setQ(e.target.value)} placeholder={kind === 'MTM' ? 'order no, customer, fabric, fit' : 'order no, customer, style, size'} /></Field></div>
      <div className="pb-2">{ex.strip}</div>
      {mine ? <Button variant="primary" onClick={onPunch}>+ Punch {kind} order</Button> : <ActsBy role="store" does="punches a customer order" inline />}
    </div>
    {rows.length === 0 ? <Card><Empty title="No orders match." body="Widen the dates or the stage." /></Card> : <Card><table className="t">
      <thead><tr><th>Order</th><th>Bill</th><th>Customer</th><th>{kind === 'MTM' ? 'Fabric' : 'Style'}</th><th>{kind === 'MTM' ? 'Fit' : 'Size'}</th>{kind === 'RTW' && <th>Inseam</th>}<th className="num">Qty</th><th>Punched</th><th>Promised</th><th>Stage</th><th></th></tr></thead>
      <tbody>{ex.rows.map(o => { const late = !['delivered', 'cancelled'].includes(o.stage) && daysAgo(o.promisedOn) > 0; return <tr key={o.id} className="row" onClick={() => onOpen(o.id)}>
        <td className="mono text-[12.5px]">{o.orderNo}</td>
        <td className="text-[11.5px]" style={{ color:'var(--ink-faint)', whiteSpace:'nowrap' }}>{(() => { const n = o.billNo ? (db.customerOrders ?? []).filter(x => x.billNo === o.billNo).length : 1; return <><span className="mono">{o.billNo?.replace('BILL-', '') ?? '—'}</span>{n > 1 && <span> · {n} pcs</span>}</>; })()}</td>
        <td className="font-medium">{o.customer}</td><td className="text-[12.5px]">{o.styleName}</td>
        <td className="text-[12.5px]">{kind === 'MTM' ? o.fit : o.size}</td>
        {kind === 'RTW' && <td className="text-[12.5px]">{o.hemLength != null ? `${o.hemLength}"` : <span style={{ color:'var(--ink-faint)' }}>—</span>}</td>}
        <td className="num">{o.qty}</td><td>{fmtDate(o.punchedOn)}</td>
        <td style={{ color: late ? 'var(--risk)' : undefined }}>{fmtDate(o.promisedOn)}{late && <span className="text-[11px]"> · {daysAgo(o.promisedOn)}d late</span>}{(o.promiseRevisions?.length ?? 0) > 0 && <div className="text-[11px]" style={{ color:'var(--warn)' }}>moved from {fmtDate(o.promiseRevisions![0].from)} · tell the customer</div>}</td>
        <td><Pill tone={STAGE_TONE[o.stage]}>{STAGE_LABEL[o.stage]}</Pill>{o.tag && o.tag !== 'normal' && <span className="text-[10.5px] ml-1" style={{ color:'var(--warn)' }}>{o.tag}</span>}</td>
        <td onClick={e => e.stopPropagation()}>{mine && kind === 'RTW' && o.stage === 'punched' && fulfilFromOf(db, o) === 'store' && <Button size="sm" variant="primary" onClick={() => onAdvance(o.id)}>Hand over from shelf</Button>}{mine && kind !== 'MTM' && o.stage === 'dispatched' && <Button size="sm" onClick={() => onAdvance(o.id)}>Handed to customer</Button>}{kind !== 'MTM' && o.stage === 'punched' && fulfilFromOf(db, o) === 'hub' && <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>from the hub</span>}{kind === 'RTW' && o.stage === 'hemming' && <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>being hemmed at the unit</span>}</td>
      </tr>; })}</tbody>
    </table></Card>}
    <div className="mt-3"><Note>{kind === 'MTM' ? 'MTM is shirts — punching reserves the metres in the same second, for every store.' : 'Everything else is one kind of order: hand it over from the shelf if you have the size, otherwise the hub dispatches it.'}</Note></div>
  </>;
}

type PieceDraft = { kind: 'MTM' | 'RTW'; fabricId: string; designId: string; fit: string; optionId: string; size: string; hem: string; qty: string; remarks: string; sheet: SheetDraft; fitProfile: string; measuredBy: string; factoryComment: string; logisticComment: string; soldDisplay?: boolean };

/* One customer, one visit, several pieces — two shirts and a trouser on one
   bill. Each piece is still punched as its own order (it moves through the
   factory on its own), but they share a bill number and open from each other. */
function PunchForm({ kind, fabrics, options, storeId, onSave, initialCustomer }: { kind: 'MTM' | 'RTW'; fabrics: Fabric[]; options: RtwOption[]; storeId: string; initialCustomer?: string; onSave: (pieces: PunchInput[], creditApplied: number) => void }) {
  const live = fabrics.filter(f => !f.paused && !f.onHold && f.millAvailable !== false && (f.bucket === 'BESPOKE' || f.stockMetres - f.reservedMetres - f.thresholdMetres > 0));
  const sellable = options.filter(o => Object.values(o.stockBySize).some(q => q > 0));
  const { db } = useApp();
  const saved = initialCustomer ? customerOf(db, initialCustomer).lastSheet : null;
  const [customer, setCustomer] = useState(initialCustomer ?? '');
  /* a customer can hold more than one fit — a structured formal and a relaxed
     casual — and a different size per product. The profiles on file are the
     ones their earlier orders named. */
  const profiles = [...new Set((db.customerOrders ?? []).filter(o => o.customer === (initialCustomer ?? '') && o.fitProfile).map(o => o.fitProfile as string))];
  const isNew = !!customer.trim() && !(db.customerOrders ?? []).some(o => o.customer.toLowerCase() === customer.trim().toLowerCase());
  const [trial, setTrial] = useState(false);
  const [express, setExpress] = useState(false);
  /* the store's promise: 10–12 days; a trial shirt first adds another 10–12 (~25 in all); urgent is 7–8 days for ₹600 */
  const promiseDays = express ? 8 : trial ? 25 : 12;
  const [promisedOn, setPromised] = useState(dateInput(iso(addDays(TODAY, 12))));
  useEffect(() => { setPromised(dateInput(iso(addDays(TODAY, promiseDays)))); }, [promiseDays]);
  const blank = (k: 'MTM' | 'RTW'): PieceDraft => ({ kind: k, fabricId: live[0]?.id ?? '', designId: '', fit: MTM_FITS[0], optionId: sellable[0]?.id ?? '', size: sellable[0]?.sizes[0] ?? '', hem: '', qty: '1', remarks: '', fitProfile: profiles[0] ?? '', measuredBy: '', factoryComment: '', logisticComment: '',
    sheet: saved?.measurements && saved.spec && saved.pattern ? { spec: { ...saved.spec }, measurements: { ...saved.measurements }, pattern: { ...saved.pattern } } : emptyDraft() });
  const [pieces, setPieces] = useState<PieceDraft[]>([]);
  const [cur, setCur] = useState<PieceDraft>(() => blank(kind));
  const credit = customer.trim() ? creditBalanceOf(db, customer.trim()) : 0;
  const [useCredit, setUseCredit] = useState('');
  const [more, setMore] = useState(false);   // promised date and remarks — asked for only when they matter
  const up = (patch: Partial<PieceDraft>) => setCur(c => ({ ...c, ...patch }));
  const f = fabrics.find(x => x.id === cur.fabricId);
  const opt = options.find(o => o.id === cur.optionId);
  const here = opt ? storeStockOf(opt)[storeId] ?? {} : {};
  const bottomsOf = (p: PieceDraft) => { const o = options.find(x => x.id === p.optionId); return o ? isBottoms(`${o.subCat1} ${o.styleName}`) : false; };
  const bottoms = bottomsOf(cur);
  const fabricDesigns = (db.concepts ?? []).find(c => c.fabricId === cur.fabricId)?.designs ?? [];
  const chosenDesign = fabricDesigns.find(d => d.id === cur.designId) ?? null;
  const sizeHere = opt && cur.size ? here[cur.size] ?? 0 : 0;
  const elsewhere = opt && cur.size ? Object.entries(storeStockOf(opt)).filter(([k, v]) => k !== storeId && (v[cur.size] ?? 0) > 0) : [];
  const valid = cur.kind === 'MTM' ? !!cur.fabricId : !!cur.optionId && !!cur.size;
  const display = opt ? displayBalanceOf(db, storeId, opt.id) : null;
  const describe = (p: PieceDraft) => { if (p.kind === 'MTM') { const pf = fabrics.find(x => x.id === p.fabricId); const d = ((db.concepts ?? []).find(c => c.fabricId === p.fabricId)?.designs ?? []).find(x => x.id === p.designId); return `${d ? (d.finalName ?? d.name) : pf?.name ?? '—'} · ${p.fit} · ×${p.qty || 1}`; }
    const o = options.find(x => x.id === p.optionId); return `${o?.styleName ?? '—'} · ${p.size}${p.hem ? ` · ${p.hem}"` : ''} · ×${p.qty || 1}${p.soldDisplay ? ' · the display piece' : ''}`; };
  const toInput = (p: PieceDraft): PunchInput => { const pf = fabrics.find(x => x.id === p.fabricId); const po = options.find(x => x.id === p.optionId); const d = ((db.concepts ?? []).find(c => c.fabricId === p.fabricId)?.designs ?? []).find(x => x.id === p.designId) ?? null; const bt = bottomsOf(p);
    return { kind: p.kind, customer: customer.trim(), styleName: p.kind === 'MTM' ? (d ? (d.finalName ?? d.name) : pf!.name) : po!.styleName, fabricId: p.kind === 'MTM' ? p.fabricId : null, designId: p.kind === 'MTM' ? (p.designId || null) : null, optionId: p.kind === 'RTW' ? p.optionId : null,
      fit: p.kind === 'MTM' ? p.fit : null, size: p.kind === 'RTW' ? p.size : null, hemLength: bt && p.hem ? Number(p.hem) : null, qty: Number(p.qty) || 1, remarks: p.remarks.trim(),
      soldDisplay: p.kind === 'RTW' ? !!p.soldDisplay : false, fitProfile: p.kind === 'MTM' ? (p.fitProfile.trim() || null) : null, measuredBy: p.kind === 'MTM' ? (p.measuredBy.trim() || null) : null, trial: p.kind === 'MTM' ? trial : false, express, factoryComment: p.factoryComment.trim() || null, logisticComment: p.logisticComment.trim() || null,
      promisedOn: p.kind === 'MTM' ? (fromDateInput(promisedOn) ?? iso(addDays(TODAY, promiseDays))) : iso(addDays(TODAY, bt ? 3 : 0)),
      ...(p.kind === 'MTM' ? { spec: p.sheet.spec, measurements: p.sheet.measurements, pattern: p.sheet.pattern } : {}) }; };
  const addPiece = () => { if (!valid) return; setPieces(ps => [...ps, cur]); setCur(blank(cur.kind)); };
  const total = pieces.length + (valid ? 1 : 0);
  const punch = () => { const all = [...pieces, ...(valid ? [cur] : [])]; if (!all.length || !customer.trim()) return; onSave(all.map(toInput), Math.min(credit, Number(useCredit) || 0)); };
  return (
    <Section title={`The bill · ${total} piece${total === 1 ? '' : 's'}`} right={<span className="pill role-store">Store</span>}>
      <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <div><Field label="Customer" hint={isNew ? 'new customer — no profile on file yet' : undefined}><Input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="name as on the bill" /></Field></div>
        {kind === 'MTM' && <div style={{ gridColumn:'1 / -1' }} className="flex items-center gap-4 flex-wrap text-[12.5px]">
          <label className="flex items-center gap-2"><input type="checkbox" checked={trial} onChange={e => setTrial(e.target.checked)} /> Trial shirt first <span style={{ color:'var(--ink-faint)' }}>new customer · 10–12 days for the trial, then 10–12 for the order</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={express} onChange={e => setExpress(e.target.checked)} /> Urgent <span style={{ color:'var(--ink-faint)' }}>7–8 days · ₹600 express charge</span></label>
          <span style={{ color:'var(--ink-soft)' }}>Promise: {promiseDays} days</span>
        </div>}
        <div className="flex items-end">{more ? <Field label="Promised · made-to-measure pieces" hint="off-the-shelf pieces go today; hemmed bottoms in three days"><Input type="date" value={promisedOn} onChange={e => setPromised(e.target.value)} /></Field> : <button type="button" className="vlink text-[12px] pb-2" onClick={() => setMore(true)}>more · promised date, remarks</button>}</div>
        {credit > 0 && <div style={{ gridColumn:'1 / -1' }} className="flex items-end gap-3 flex-wrap px-3 py-2" >
          <span className="pill good">holds ₹{credit.toLocaleString('en-IN')} store credit</span>
          <div style={{ width: 160 }}><Field label="Apply to this bill ₹"><Input type="number" min={0} max={credit} value={useCredit} onChange={e => setUseCredit(e.target.value)} placeholder="0" /></Field></div>
          <button type="button" className="vlink text-[12px]" onClick={() => setUseCredit(String(credit))}>use all of it</button>
        </div>}
      </div>

      {pieces.length > 0 && <div className="py-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div className="cap">On the bill so far</div>
        {pieces.map((p, i) => <div key={i} className="kv"><span className="k"><span className={`pill ${p.kind === 'MTM' ? 'role-design' : 'info'}`} style={{ marginRight: 8 }}>{p.kind}</span>{describe(p)}</span>
          <span className="v text-[11.5px]"><button type="button" className="vlink" onClick={() => { setPieces(ps => ps.filter((_, k) => k !== i)); setCur(p); }}>edit</button> · <button type="button" className="vlink" onClick={() => setPieces(ps => ps.filter((_, k) => k !== i))}>remove</button></span></div>)}
      </div>}

      <div className="py-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div className="flex items-center gap-3 flex-wrap"><div className="cap" style={{ margin: 0 }}>Piece {pieces.length + 1}</div><span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>each piece carries its own size, inseam and fit — one bill can mix them</span>
          <Seg value={cur.kind} onChange={k => setCur(blank(k))} options={[{ id:'MTM' as const, label:'Made to measure' }, { id:'RTW' as const, label:'Off the shelf' }]} /></div>
        <div className="grid gap-2.5 py-2" style={{ gridTemplateColumns:'1fr 1fr' }}>
          {cur.kind === 'MTM' ? <>
            <div style={{ gridColumn:'1 / -1' }}><Field label="Fabric" hint={f ? `${f.bucket.toLowerCase().replace('_', '-')} · ${f.bucket === 'BESPOKE' ? 'held at the mill' : `${Math.max(0, f.stockMetres - f.reservedMetres - f.thresholdMetres)} m saleable across all stores`}` : undefined}>
              <Select value={cur.fabricId} onChange={v => up({ fabricId: v, designId: '' })} options={live.map(x => ({ value:x.id, label:`${x.name} · ${x.code}` }))} /></Field></div>
            {fabricDesigns.length > 0 && <div style={{ gridColumn:'1 / -1' }}><Field label="Design on this fabric" hint={chosenDesign ? `${chosenDesign.code}${chosenDesign.style ? ` · ${chosenDesign.style}` : ''}` : 'the shirt the customer chose — its product code goes on the order'}><Select value={cur.designId} onChange={v => up({ designId: v })} options={[{ value:'', label:'— the fabric only, no design chosen —' }, ...fabricDesigns.map(d => ({ value:d.id, label:`${d.finalName ?? d.name} · ${d.code}${d.mrp ? ` · ₹${d.mrp.toLocaleString('en-IN')}` : ''}` }))]} /></Field></div>}
            <Field label="Fit"><Select value={cur.fit} onChange={v => up({ fit: v })} options={MTM_FITS.map(x => ({ value:x, label:x }))} /></Field>
            <Field label="Fit profile" hint={profiles.length ? `${profiles.length} on file for this customer — a second fit is a second profile, not an overwrite` : 'the customer\u2019s first profile; add "Casual · relaxed" later as a second'}><Input list="fit-profiles" value={cur.fitProfile} onChange={e => up({ fitProfile: e.target.value })} placeholder="Formal · structured" /><datalist id="fit-profiles">{[...profiles, 'Formal · structured', 'Casual · relaxed'].filter((x, i, a) => a.indexOf(x) === i).map(x => <option key={x} value={x} />)}</datalist></Field>
            <Field label="Measured by" hint="the master or the stylist — so a wrong measurement can be traced"><Input value={cur.measuredBy} onChange={e => up({ measuredBy: e.target.value })} placeholder="master · Ramesh" /></Field>
            <Field label="Qty"><Input type="number" min={1} value={cur.qty} onChange={e => up({ qty: e.target.value })} /></Field>
          </> : <>
            <div style={{ gridColumn:'1 / -1' }}><Field label="Style"><Select value={cur.optionId} onChange={v => { const o = options.find(x => x.id === v); up({ optionId: v, size: o?.sizes[0] ?? '' }); }} options={sellable.map(x => ({ value:x.id, label:x.styleName }))} /></Field></div>
            <Field label="Size" hint={opt ? `${sizeHere} here${elsewhere.length ? ` · also at ${elsewhere.map(([k, v]) => `${STORES.find(s => s.id === k)?.name ?? 'warehouse'} (${v[cur.size]})`).join(', ')}` : ''}` : undefined}>
              <Select value={cur.size} onChange={v => up({ size: v })} options={(opt?.sizes ?? []).map(sz => ({ value:sz, label:`${sz} · ${here[sz] ?? 0} here` }))} /></Field>
            {bottoms ? <Field label="Inseam (inches)" hint="bottoms are hemmed to this before they go out"><Input type="number" step="0.5" value={cur.hem} onChange={e => up({ hem: e.target.value })} placeholder="32" /></Field> : <Field label="Qty"><Input type="number" min={1} value={cur.qty} onChange={e => up({ qty: e.target.value })} /></Field>}
          </>}
          {more && <div style={{ gridColumn:'1 / -1' }}><Field label="Comment for the factory" hint="styling notes that must reach the cutting table — today typed by the factory by hand"><Input value={cur.factoryComment} onChange={e => up({ factoryComment: e.target.value })} placeholder="contrast collar as per the sample shown" /></Field></div>}
          {more && <div style={{ gridColumn:'1 / -1' }}><Field label="Comment for shipping" hint="for the shipping team — a suit sold together, match the trouser, deliver to the office"><Input value={cur.logisticComment} onChange={e => up({ logisticComment: e.target.value })} placeholder="suit · sold together · match the trouser" /></Field></div>}
          {more && <div style={{ gridColumn:'1 / -1' }}><Field label="Remarks"><Input value={cur.remarks} onChange={e => up({ remarks: e.target.value })} placeholder={cur.kind === 'MTM' ? 'monogram, contrast collar, sleeve −1 cm' : 'anything the customer asked for'} /></Field></div>}
        </div>
        {cur.kind === 'MTM' && <div className="py-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
          <div className="flex items-center gap-2 flex-wrap"><span className="label">Order sheet · comes in with the piece</span><span className="text-[11px]" style={{ color: saved ? 'var(--good)' : 'var(--ink-faint)' }}>{saved ? `pre-filled from ${initialCustomer}'s last order (${saved.orderNo}) — measurements on file; change only what moved` : 'measurements and options, as Enigma takes them'}</span></div>
          <div className="pt-2"><SheetEditor d={cur.sheet} onChange={sheet => up({ sheet })} compact /></div>
        </div>}
        {cur.kind === 'RTW' && opt && cur.size && sizeHere === 0 && !cur.soldDisplay && <div className="py-2"><Note tone="warn">Not on this shelf. {elsewhere.length ? `${STORES.find(s => s.id === elsewhere[0][0])?.name ?? 'The warehouse'} has ${elsewhere[0][1][cur.size]} — ask for it on the stock-asks tab, or sell from the hub.` : 'Nobody has it — it goes as a hub order.'}{display && display.onFloor > 0 && <> The window has the display piece{display.received > 1 ? 's' : ''} — <button type="button" className="vlink" onClick={() => up({ soldDisplay: true })}>sell the display piece</button> (the window goes to −1 and the next order must bring one).</>}</Note></div>}
        {cur.kind === 'RTW' && cur.soldDisplay && <div className="py-2"><Note tone="warn">Selling the display piece. It is not shelf stock, so nothing comes off the count; this store's window for {opt?.styleName} will read −1 until a display piece is ordered. <button type="button" className="vlink" onClick={() => up({ soldDisplay: false })}>undo</button></Note></div>}
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <Button size="sm" disabled={!valid} onClick={addPiece}>+ Piece</Button>
        <Button variant="primary" size="sm" disabled={!customer.trim() || total === 0} onClick={punch}>Punch bill</Button>
        <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>one bill, {total === 1 ? 'one order' : `${total} orders that open from each other`}</span>
      </div>
    </Section>
  );
}

function OrderDetailCard({ o, mine, onAdvance, onCancel, onReturn }: { o: CustomerOrder; mine: boolean; onAdvance: () => void; onCancel: () => void; onReturn?: () => void }) {
  const open = !['delivered', 'cancelled'].includes(o.stage);
  const { db } = useApp();
  const cases = db.returns.filter(r => r.orderId === o.id);
  return (
    <Section title="Order" right={<Pill tone={STAGE_TONE[o.stage]}>{STAGE_LABEL[o.stage]}</Pill>}>
      <KV k="Customer" v={o.customer} />
      <KV k={o.kind === 'MTM' ? 'Fabric' : 'Style'} v={o.styleName} />
      {o.fit && <KV k="Fit" v={o.fit} />}
      {o.size && <KV k="Size" v={o.size} />}
      {o.hemLength != null && <KV k="Inseam" v={`${o.hemLength}"`} note={o.stage === 'hemming' ? 'being hemmed at the unit' : o.stage === 'delivered' ? 'hemmed and handed over' : 'hemmed before dispatch'} />}
      <KV k="Qty" v={o.qty} />
      <KV k="Punched" v={fmtDate(o.punchedOn)} note={`${daysAgo(o.punchedOn)}d ago`} />
      <KV k="Promised" v={<span style={{ color: open && daysAgo(o.promisedOn) > 0 ? 'var(--risk)' : undefined }}>{fmtDate(o.promisedOn)}{(o.promiseRevisions?.length ?? 0) > 0 && <span className="pill warn ml-1">moved</span>}</span>} note={o.promiseRevisions?.length ? o.promiseRevisions.map(r => `${fmtDate(r.from)} → ${fmtDate(r.to)} · ${r.reason} (${r.by}, ${fmtDate(r.at)})`).join(' · ') : undefined} />
      {o.remarks && <KV k="Remarks" v={o.remarks} />}
      {o.kind === 'MTM' && <>
        <KV k="Tag" v={o.tag} />
        {o.factoryId && <KV k="Factory" v={o.factoryId} note={o.planId ? `plan ${o.planId}` : undefined} />}
        {o.consumptionM != null && <KV k="Fabric on the order sheet" v={`${o.consumptionM} m`} note="Enigma's formula: base + 0.10 buffer" />}
        {o.scans.length > 0 && <KV k="Scans" v={o.scans.map(sc => `${sc.stage} · ${fmtDate(sc.at)}`).join('  →  ')} />}
      </>}
      {mine && open && o.kind !== 'MTM' && <div className="flex gap-2 pt-3">
        {NEXT_LABEL[o.stage] && <Button variant="primary" size="sm" onClick={onAdvance}>{NEXT_LABEL[o.stage]} →</Button>}
        <Button variant="danger" size="sm" onClick={onCancel}>Cancel order</Button>
      </div>}
      {cases.length > 0 && <KV k="Cases on this piece" v={<span className="flex gap-1 flex-wrap justify-end">{cases.map(r => <span key={r.id} className="mono text-[12px]">{r.caseNo}</span>)}</span>} note={cases.map(r => `${r.reason} · ${returnStatusOf(r).label}`).join(' · ')} />}
      {mine && o.stage === 'delivered' && onReturn && <div className="pt-3"><Button size="sm" onClick={onReturn}>Return or alter</Button></div>}
    </Section>
  );
}

/* ---------- ask another store for a size — the WhatsApp with a status ----- */

/* ---------- every store's shelf for one style (store manager, 14 Oct 2026) ----------
   "Store managers should be able to see other stores' inventory." Today a pan-India
   WhatsApp group. Here: pick the style, see who sells it off the rack size by size, who
   only shows it, and whose window is empty; ask the store that has it from the cell. */
function ShelvesTab({ storeId, mine }: { storeId: string; mine: boolean }) {
  const { db, requestStock } = useApp();
  const [q, setQ] = useState('');
  const live = db.options.filter(o => !o.inactive);
  const [optionId, setOptionId] = useState(live[0]?.id ?? '');
  const matches = q.trim() ? live.filter(o => `${o.styleName} ${o.subCat1} ${o.sku ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())) : live;
  const opt = live.find(o => o.id === optionId) ?? matches[0];
  const sh = opt ? shelvesOf(db, opt) : null;
  const owed = displaysOwedOf(db, storeId);
  const me = STORES.find(s => s.id === storeId);
  const name = (id: string) => STORES.find(s => s.id === id)?.name ?? 'Warehouse';
  return <>
    {owed.length > 0 && <Card className="mb-3"><div className="pad">
      <div className="label">This store owes its window {owed.length} display piece{owed.length === 1 ? '' : 's'}</div>
      <div className="text-[11.5px] pb-1" style={{ color:'var(--ink-faint)' }}>Sold from the display. Nothing is on the shelf for these, and the window is empty until an order brings one.</div>
      {owed.map(({ o, d }) => <div key={o.id} className="kv"><span className="k"><b style={{ color:'var(--ink)' }}>{o.styleName}</b> · display {d.balance}</span>
        <span className="v">{mine && ((db.stockRequests ?? []).some(r => r.toStoreId === storeId && r.optionId === o.id && r.purpose === 'display' && r.status !== 'declined' && r.status !== 'received')
          ? <Pill tone="info">display piece asked for</Pill>
          : <Button size="sm" variant="primary" onClick={() => requestStock({ optionId: o.id, styleName: o.styleName, size: isBottoms(`${o.subCat1} ${o.styleName}`) ? '32' : '40', qty: 1, fromStoreId: 'warehouse', note: 'display piece sold — window empty', purpose: 'display' })}>Order one for display</Button>)}</span></div>)}
    </div></Card>}
    <div className="flex gap-3 items-end flex-wrap mb-3">
      <div style={{ width: 260 }}><Field label="Style"><Input value={q} onChange={e => { setQ(e.target.value); setOptionId(''); }} placeholder="search a style" /></Field></div>
      <div style={{ width: 340 }}><Field label={`${matches.length} match${matches.length === 1 ? '' : 'es'}`}><Select value={opt?.id ?? ''} onChange={setOptionId} options={matches.slice(0, 60).map(o => ({ value: o.id, label: `${o.styleName} · ${o.subCat1}` }))} /></Field></div>
      {me && <div className="pb-2 text-[12px]" style={{ color:'var(--ink-faint)' }}>{me.name}: {me.holdsRtwStock ? 'sells off the rack' : 'display only — orders go from the hub'}</div>}
    </div>
    {opt && sh && <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><th>Store</th><th>Sells off the rack</th><th>Window</th>{opt.sizes.map(sz => <th key={sz} className="num">{sz}</th>)}<th className="num">Total</th><th></th></tr></thead>
      <tbody>
        <tr style={{ background:'var(--surface-2)' }}><td className="font-medium">Warehouse</td><td className="text-[12px]">hub stock</td><td>—</td>{opt.sizes.map(sz => <td key={sz} className="num">{sh.warehouseBySize[sz] || ''}</td>)}<td className="num font-medium">{sh.warehouse}</td><td /></tr>
        {[...sh.rows].sort((a, b) => (a.storeId === storeId ? -1 : b.storeId === storeId ? 1 : b.total - a.total)).map(r => <tr key={r.storeId} style={r.storeId === storeId ? { background:'var(--accent-soft)' } : undefined}>
          <td className="font-medium">{r.name}{r.storeId === storeId && <span className="text-[11px] font-normal" style={{ color:'var(--ink-faint)' }}> · you</span>}<div className="text-[11px] font-normal" style={{ color:'var(--ink-faint)' }}>{r.region}</div></td>
          <td className="text-[12px]">{r.holds ? 'yes' : <span style={{ color:'var(--ink-faint)' }}>display only</span>}</td>
          <td>{r.display.received === 0 ? <span style={{ color:'var(--ink-faint)' }}>—</span> : r.display.balance < 0 ? <Pill tone="risk">{r.display.balance} · sold</Pill> : <Pill tone="good">display</Pill>}</td>
          {opt.sizes.map(sz => { const n = r.bySize[sz] ?? 0; return <td key={sz} className="num" style={{ color: n ? undefined : 'var(--line)' }}>{r.holds ? (n || '0') : ''}</td>; })}
          <td className="num font-medium">{r.holds ? r.total : ''}</td>
          <td>{mine && r.storeId !== storeId && r.total > 0 && <button type="button" className="cta" onClick={() => { const sz = opt.sizes.find(x => (r.bySize[x] ?? 0) > 0 && (sh.rows.find(y => y.storeId === storeId)?.bySize[x] ?? 0) === 0) ?? opt.sizes.find(x => (r.bySize[x] ?? 0) > 0)!; requestStock({ optionId: opt.id, styleName: opt.styleName, size: sz, qty: 1, fromStoreId: r.storeId, note: 'seen on the shelf view', purpose: 'size' }); }}>Ask {name(r.storeId).split(' ')[0]} →</button>}</td>
        </tr>)}
      </tbody>
    </table></div></Card>}
    <div className="mt-3 text-[12px]" style={{ color:'var(--ink-faint)' }}>Shelf counts are the system's split per store; the window column is the display piece every store gets on launch. A sold display reads −1 until the next order brings one.</div>
  </>;
}

function RequestsTab({ storeId, mine, options, reqs, onRequest, onRespond }: { storeId: string; mine: boolean; options: RtwOption[]; reqs: import('../domain/types').StockRequest[]; onRequest: ReturnType<typeof useAppStore.getState>['requestStock']; onRespond: ReturnType<typeof useAppStore.getState>['respondStockRequest'] }) {
  /* the real case is narrow: a size this store has none of, that another store
     is sitting on. Work it out up front so the form opens on something you can
     actually send, instead of on a style nobody can help with. */
  const askable = useMemo(() => {
    const m = new Map<string, string[]>();
    options.forEach(o => { const sp = storeStockOf(o);
      const sizes = o.sizes.filter(sz => (sp[storeId]?.[sz] ?? 0) === 0 && Object.entries(sp).some(([k, v]) => k !== storeId && k !== 'warehouse' && (v[sz] ?? 0) > 0));
      if (sizes.length) m.set(o.id, sizes); });
    return m;
  }, [options, storeId]);
  const [scope, setScope] = useState<'askable' | 'all'>('askable');
  const list = scope === 'askable' ? options.filter(o => askable.has(o.id)) : options;
  const [optionId, setOptionId] = useState(list[0]?.id ?? options[0]?.id ?? '');
  const opt = options.find(o => o.id === optionId);
  const [size, setSize] = useState(askable.get(optionId)?.[0] ?? opt?.sizes[0] ?? '');
  const [note, setNote] = useState('');
  const split = opt ? storeStockOf(opt) : {};
  const holders = Object.entries(split).filter(([k, v]) => k !== storeId && (v[size] ?? 0) > 0).sort((a, b) => (b[1][size] ?? 0) - (a[1][size] ?? 0));
  const elsewhereIn = (sz: string) => Object.entries(split).filter(([k]) => k !== storeId).reduce((a, [, v]) => a + (v[sz] ?? 0), 0);
  const choose = (id: string) => { setOptionId(id); setSize(askable.get(id)?.[0] ?? options.find(x => x.id === id)?.sizes[0] ?? ''); };
  const name = (id: string) => STORES.find(s => s.id === id)?.name ?? 'Warehouse';
  const toMe = reqs.filter(q => q.fromStoreId === storeId);
  const byMe = reqs.filter(q => q.toStoreId === storeId);
  const TONE: Record<string, 'neutral' | 'info' | 'warn' | 'good' | 'risk'> = { requested:'warn', accepted:'info', shipped:'info', received:'good', declined:'risk' };
  const exToMe = useExamples(toMe, q => q.status, { noun: 'asks', done: q => q.status === 'received' });
  const exByMe = useExamples(byMe, q => q.status, { noun: 'asks', done: q => q.status === 'received' });
  return <>
    {mine && <Card><div className="pad">
      <div className="label">Need a size you do not have?</div>
      <div className="flex items-center justify-between gap-3 flex-wrap pb-1">
        <div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>Pick the style and size; every store that has one is listed below with a button to ask that store for it. The ask goes out the moment you press it — they see it on their own stock-asks tab.</div>
        <Seg value={scope} onChange={v => { setScope(v); const l = v === 'askable' ? options.filter(o => askable.has(o.id)) : options; if (!l.some(o => o.id === optionId)) choose(l[0]?.id ?? ''); }}
          options={[{ id:'askable', label:'Someone has it', count: askable.size, hint:'sizes you are out of that another store is holding — these can be asked for right now' }, { id:'all', label:'Every style' }]} />
      </div>
      <div className="grid gap-2.5 py-1 items-end" style={{ gridTemplateColumns:'2fr 1fr 2fr' }}>
        <Field label="Style"><Select value={optionId} onChange={choose} options={list.map(x => ({ value:x.id, label: askable.has(x.id) ? `${x.styleName} · ${askable.get(x.id)!.join(', ')} at other stores` : x.styleName }))} /></Field>
        <Field label="Size"><Select value={size} onChange={setSize} options={(opt?.sizes ?? []).map(sz => ({ value:sz, label:`${sz} · ${split[storeId]?.[sz] ?? 0} here · ${elsewhereIn(sz)} elsewhere` }))} /></Field>
        <Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="customer waiting in store" /></Field>
      </div>
      {opt && <div className="pt-2">
        {/* the ask is sent to one named store — the button sits on the store that has it,
            so you are never asking "someone" for stock the way a WhatsApp group does */}
        {holders.length === 0 ? <Note tone="warn">Nobody to ask — no other store and not the warehouse has {opt.styleName} in {size}, so there is no ask to send. It is a size-fill for planning, already on their option book.</Note>
          : <div className="flex flex-col gap-1.5">{holders.map(([k, v]) => <div key={k} className="kv"><span className="k">{name(k)} <span className="text-[11px]">has {v[size]}</span></span><span className="v">{k !== 'warehouse' && <Button size="sm" variant="primary" onClick={() => onRequest({ optionId, styleName: opt.styleName, size, qty: 1, fromStoreId: k, note: note.trim() })}>Ask {name(k)} for 1</Button>}{k === 'warehouse' && <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>warehouse replenishes on the STO cycle</span>}</span></div>)}</div>}
      </div>}
    </div></Card>}

    <div className="grid gap-3 mt-3" style={{ gridTemplateColumns:'1fr 1fr' }}>
      <Card><div className="pad"><div className="flex items-baseline justify-between gap-2 flex-wrap"><div className="label">Asked of this store · {toMe.filter(q => q.status === 'requested').length} to answer</div>{exToMe.strip}</div>
        {toMe.length === 0 ? <div className="text-[12.5px] py-2" style={{ color:'var(--ink-faint)' }}>Nobody has asked you for stock.</div> : exToMe.rows.map(q => <div key={q.id} className="kv"><span className="k"><b style={{ color:'var(--ink)' }}>{q.styleName}</b> · {q.purpose === 'display' ? 'display piece' : `${q.size} × ${q.qty}`}<div className="text-[11px]">for {name(q.toStoreId)} · {daysAgo(q.requestedOn)}d ago{q.note ? ` · "${q.note}"` : ''}</div></span>
          <span className="v"><Pill tone={TONE[q.status]}>{q.status}</Pill>{mine && q.status === 'requested' && <div className="flex gap-1 mt-1 justify-end"><Button size="sm" variant="primary" onClick={() => onRespond(q.id, 'shipped')}>Accept & ship</Button><Button size="sm" variant="ghost" onClick={() => onRespond(q.id, 'declined')}>Decline</Button></div>}{mine && q.status === 'accepted' && <div className="mt-1"><Button size="sm" onClick={() => onRespond(q.id, 'shipped')}>Shipped</Button></div>}</span></div>)}
      </div></Card>
      <Card><div className="pad"><div className="flex items-baseline justify-between gap-2 flex-wrap"><div className="label">Asked by this store</div>{exByMe.strip}</div>
        {byMe.length === 0 ? <div className="text-[12.5px] py-2" style={{ color:'var(--ink-faint)' }}>You have not asked anyone.</div> : exByMe.rows.map(q => <div key={q.id} className="kv"><span className="k"><b style={{ color:'var(--ink)' }}>{q.styleName}</b> · {q.purpose === 'display' ? 'display piece' : `${q.size} × ${q.qty}`}<div className="text-[11px]">from {name(q.fromStoreId)} · {daysAgo(q.requestedOn)}d ago</div></span>
          <span className="v"><Pill tone={TONE[q.status]}>{q.status}</Pill>{mine && q.status === 'shipped' && <div className="mt-1"><Button size="sm" variant="primary" onClick={() => onRespond(q.id, 'received')}>Received</Button></div>}</span></div>)}
      </div></Card>
    </div>
    <div className="mt-3"><Note>Each ask lands on the other store's list until answered; a decline sends you to the next store that has it.</Note></div>
  </>;
}


/* ---------- the store's side of the GRN: every parcel from the unit, counted in with one tap ---------- */
const INB_LABEL: Record<string, string> = { sto:'Stock transfer · STO', mtm:'Customer\'s MTM shirt', rtw:'Customer\'s RTW order', launch:'Launch display & fit', book:'Swatch book', swatch:'Loose swatch', request:'Stock from another store', fit:'MTM fit sample' };
function StoreInwardTab({ storeId, mine }: { storeId: string; mine: boolean }) {
  const { db, storeInward } = useApp();
  const rows = storeInboundOf(db, storeId);
  const [short, setShort] = useState<Record<string, { qty: string; note: string }>>({});   // rows where the store is counting in fewer than sent
  const log = (db.grns ?? []).filter(g => g.kind === 'store-inward' && g.storeId === storeId).slice(0, 12);
  const ex = useExamples(rows, x => x.kind, { noun: 'parcels', done: x => x.kind === 'sto' && !!db.transfers.find(t => t.id === x.id)?.arrivedOn });
  const exLog = useExamples(log, g => g.unit, { noun: 'store GRNs', done: g => g.rejected === 0 });
  return <>
    {rows.length === 0 ? <Card><Empty title="Nothing on its way." body="Every parcel the unit sent has been counted in." /></Card> : <>{ex.strip && <div className="flex justify-end mb-2">{ex.strip}</div>}<Card><div style={{ overflowX:'auto' }}><table className="t">
      <thead><tr><th>Sent</th><th>What</th><th>From</th><th className="num">Qty</th><th></th></tr></thead>
      <tbody>{ex.rows.map(x => <tr key={`${x.kind}-${x.id}`}>
        <td className="text-[12px]" style={{ color: daysAgo(x.sentOn) > 5 ? 'var(--risk)' : undefined }}>{fmtDate(x.sentOn)}<div style={{ color:'var(--ink-faint)' }}>{fmtRel(x.sentOn)}</div></td>
        <td><Pill tone={x.kind === 'sto' ? 'accent' : x.kind === 'mtm' || x.kind === 'rtw' ? 'info' : 'neutral'}>{INB_LABEL[x.kind]}</Pill><div className="font-medium text-[12.5px]">{x.what}</div><div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{x.detail}</div></td>
        <td className="text-[12px]">{x.from}</td>
        <td className="num">{x.qty}</td>
        <td>{mine ? (short[`${x.kind}-${x.id}`] ? <div className="flex items-end gap-2 flex-wrap">
            <Field label={`Received · of ${x.qty}`}><Input type="number" min={0} max={x.qty} value={short[`${x.kind}-${x.id}`].qty} onChange={e => setShort(s => ({ ...s, [`${x.kind}-${x.id}`]: { ...s[`${x.kind}-${x.id}`], qty: e.target.value } }))} style={{ width: 70 }} /></Field>
            <Field label="What was missing"><Input value={short[`${x.kind}-${x.id}`].note} onChange={e => setShort(s => ({ ...s, [`${x.kind}-${x.id}`]: { ...s[`${x.kind}-${x.id}`], note: e.target.value } }))} placeholder="size 40 not in the box" style={{ width: 180 }} /></Field>
            <Button size="sm" variant="primary" onClick={() => { const v = short[`${x.kind}-${x.id}`]; storeInward(x.kind, x.id, Number(v.qty) || 0, v.note.trim()); setShort(s => { const n = { ...s }; delete n[`${x.kind}-${x.id}`]; return n; }); }}>Count in {Number(short[`${x.kind}-${x.id}`].qty) || 0} of {x.qty}</Button>
            <Button size="sm" variant="ghost" onClick={() => setShort(s => { const n = { ...s }; delete n[`${x.kind}-${x.id}`]; return n; })}>Cancel</Button>
          </div> : <div className="flex items-center gap-2 flex-wrap"><Button size="sm" variant="primary" onClick={() => storeInward(x.kind, x.id)}>{x.kind === 'sto' ? 'Counted in · close STO' : x.kind === 'mtm' || x.kind === 'rtw' ? 'Received · ready for customer' : 'Received'}</Button>{x.kind === 'sto' && x.qty > 1 && <button type="button" className="vlink text-[11.5px]" onClick={() => setShort(s => ({ ...s, [`${x.kind}-${x.id}`]: { qty: String(x.qty - 1), note: '' } }))}>fewer than {x.qty}?</button>}</div>) : null}</td>
      </tr>)}</tbody>
    </table></div></Card></>}
    {!mine && <div className="mt-2"><ActsBy role="store" does="counts each parcel in when the box is opened" inline /></div>}
    <div className="mt-3"><Note>Counting each parcel in closes the STO from the receiving end and writes a numbered GRN the unit sees.</Note></div>
    {log.length > 0 && <Card className="mt-3">{exLog.strip && <div className="flex justify-end px-4 pt-2">{exLog.strip}</div>}<table className="t compact">
      <thead><tr><th>Store GRN</th><th>Counted in</th><th>What</th><th className="num">Qty</th><th>By</th></tr></thead>
      <tbody>{exLog.rows.map(g => <tr key={g.id}><td className="mono text-[12px]">{g.grnNo}</td><td className="text-[12px]">{fmtDate(g.receivedOn)}</td><td className="text-[12.5px]">{g.refLabel}</td><td className="num">{g.qty} {g.unit}</td><td className="text-[12px]">{g.by}</td></tr>)}</tbody>
    </table></Card>}
  </>;
}


/* ---------- the MTM fit set: one shirt per fit per size, so the customer can try the fit before the shirt is made ---------- */
function FitSetCard({ storeId, mine }: { storeId: string; mine: boolean }) {
  const { db, markFitSample } = useApp();
  const set = fitSetOf(db, storeId);
  const bad = set.cells.filter(c => c.state !== 'ok' && c.state !== 'in transit');
  const transit = set.cells.filter(c => c.state === 'in transit');
  const WORD: Record<string, string> = { ok:'on the floor', worn:'worn out', gone:'gone', missing:'never arrived', 'in transit':'on its way' };
  const EDGE: Record<string, string> = { ok:'var(--good)', worn:'var(--warn)', gone:'var(--risk)', missing:'var(--risk)', 'in transit':'var(--ink-faint)' };
  const TINT: Record<string, string> = { ok:'transparent', worn:'var(--warn-soft)', gone:'var(--risk-soft)', missing:'var(--risk-soft)', 'in transit':'var(--surface-2)' };
  return <Card className="mb-3">
    <div className="px-4 pt-3 flex items-baseline gap-2 flex-wrap">
      <h3 className="m-0">MTM fit set</h3>
      <Pill tone={bad.length ? 'warn' : 'good'}>{set.ok} of {set.total} on the floor</Pill>
      {transit.length > 0 && <Pill tone="info">{transit.length} on its way</Pill>}
      <span className="text-[12px]" style={{ color:'var(--ink-faint)' }}>the try-on shirts — a customer wears the fit before a single metre is cut</span>
    </div>

    {bad.length > 0 && <div className="px-4 pt-2"><div className="note warn">
      <b>{bad.length} size{bad.length === 1 ? '' : 's'} a customer cannot try on today.</b> The production unit sees this on its own screen and sends a replacement — mark one fine if it turns up.
    </div></div>}

    {/* one line per fit: what the fit is, then its sizes — a problem size is the
        only thing that carries colour, so the eye lands on it first */}
    <div className="px-4 py-3 grid gap-2">
      {FIT_SAMPLE_FITS.map(fit => {
        const cells = FIT_SAMPLE_SIZES.map(sz => set.cells.find(x => x.fit === fit && x.size === sz)!);
        const gaps = cells.filter(c => c.state !== 'ok');
        return <div key={fit} className="flex items-start gap-3 flex-wrap py-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
          <div style={{ width: 210 }}>
            <div className="text-[14px] font-medium">{fit} fit</div>
            <div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{FIT_SAMPLE_NOTE[fit]}</div>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {cells.map(c => { const ok = c.state === 'ok';
              return <span key={c.size} className="fitcell inline-flex items-center gap-2 px-2.5 py-1.5" title={`${fit} · size ${c.size} — ${WORD[c.state]}`}
                style={{ background: TINT[c.state], border:`1px solid ${ok ? 'var(--line)' : EDGE[c.state]}`, borderRadius: 999 }}>
                <b className="mono text-[13px]" style={{ color: ok ? 'var(--ink)' : EDGE[c.state] }}>{c.size}</b>
                {!ok && <span className="text-[11.5px]" style={{ color: EDGE[c.state] }}>{WORD[c.state]}</span>}
                {mine && c.f && c.f.receivedOn && <span className="fitacts flex gap-1.5">
                  {ok ? <>
                    <button type="button" className="vlink text-[11px]" onClick={() => markFitSample(c.f!.id, 'worn')}>worn</button>
                    <button type="button" className="vlink text-[11px]" onClick={() => markFitSample(c.f!.id, 'missing')}>gone</button>
                  </> : <button type="button" className="vlink text-[11px]" onClick={() => markFitSample(c.f!.id, 'ok')}>it&apos;s fine</button>}
                </span>}
              </span>; })}
            {gaps.length === 0 && <span className="text-[12px]" style={{ color:'var(--good)' }}>complete</span>}
          </div>
        </div>; })}
      <div className="text-[12px]" style={{ color:'var(--ink-faint)' }}>
        One shirt per fit per size. Hover a size to mark it worn or gone. Sizes shown ({FIT_SAMPLE_SIZES.join(', ')}) are a placeholder until BSC confirms which the stores actually carry.
      </div>
    </div>
  </Card>;
}


/* ---------- customers: search, and the 360 of one customer across every store ---------- */
function CustomersTab({ storeId, onOpen }: { storeId: string; onOpen: (name: string) => void }) {
  const { db } = useApp();
  const [q, setQ] = useState('');
  const rows = customersOf(db, q);
  const ex = useExamples(rows, c => c.open.length ? 'open order' : c.lastSheet ? 'measurements on file' : 'no MTM yet', { noun: 'customers', done: c => c.orders.some(o => o.stage === 'delivered') });
  const store = (id: string | null) => STORES.find(x => x.id === id)?.name ?? '—';
  return <>
    <div className="flex gap-2 items-end mb-3 flex-wrap"><div style={{ minWidth: 280 }}><Field label="Search a customer" hint="name as on the bill — every store's orders, not just this one's"><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Mehta, Iyer…" autoFocus /></Field></div><span className="text-[11.5px] pb-2" style={{ color:'var(--ink-faint)' }}>{rows.length} customer{rows.length === 1 ? '' : 's'}{rows.filter(r => r.homeStore === storeId).length ? ` · ${rows.filter(r => r.homeStore === storeId).length} call this store home` : ''}</span><div className="ml-auto pb-2">{ex.strip}</div></div>
    <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><th>Customer</th><th>Home store</th><th className="num">MTM</th><th className="num">RTW</th><th className="num">Open now</th><th>Last visit</th><th>Measurements on file</th><th className="num">Store credit</th><th className="num">Returns</th></tr></thead>
      <tbody>{ex.rows.slice(0, 60).map(c => <tr key={c.name} className="row" onClick={() => onOpen(c.name)}>
        <td className="font-medium">{c.name}</td><td className="text-[12px]" style={{ color: c.homeStore === storeId ? undefined : 'var(--ink-faint)' }}>{store(c.homeStore)}{c.stores.length > 1 ? <span style={{ color:'var(--ink-faint)' }}> +{c.stores.length - 1}</span> : ''}</td>
        <td className="num">{c.mtm.length}</td><td className="num">{c.rtw.length}</td><td className="num" style={{ color: c.open.length ? 'var(--info)' : 'var(--ink-faint)' }}>{c.open.length || '—'}</td>
        <td className="text-[12px]">{fmtDate(c.last)}<div style={{ color:'var(--ink-faint)' }}>{fmtRel(c.last)}</div></td>
        <td>{c.lastSheet ? <Pill tone="good">yes · {c.picks?.fit ?? ''}</Pill> : <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>no MTM yet</span>}</td>
        <td className="num" style={{ color: c.credit > 0 ? 'var(--good)' : 'var(--ink-faint)' }}>{c.credit > 0 ? `₹${c.credit.toLocaleString('en-IN')}` : '—'}</td>
        <td className="num" style={{ color: c.returns.length ? 'var(--warn)' : 'var(--ink-faint)' }}>{c.returns.length || '—'}</td>
      </tr>)}</tbody>
    </table></div></Card>
    <div className="mt-3"><Note>A customer belongs to BSC, not a store — measurements taken in Pali Hill are on file in Khan Market.</Note></div>
  </>;
}

function Customer360({ name, storeId, mine, onPunch }: { name: string; storeId: string; mine: boolean; onPunch: () => void }) {
  const { db } = useApp();
  const c = customerOf(db, name);
  const store = (id: string | null) => STORES.find(x => x.id === id)?.name ?? '—';
  const STAGE: Record<string, 'good' | 'info' | 'warn' | 'neutral' | 'risk'> = { delivered:'good', dispatched:'info', cancelled:'risk' };
  return <>
    <Section title="Who" right={mine && <Button size="sm" variant="primary" onClick={onPunch}>+ Punch MTM order · measurements pre-filled</Button>}>
      <KV k="Home store" v={store(c.homeStore)} note={c.stores.length > 1 ? `also shops at ${c.stores.filter(s => s !== c.homeStore).map(store).join(', ')}` : 'only here so far'} />
      <KV k="With BSC since" v={fmtDate(c.first)} note={`last visit ${fmtRel(c.last)} · ${c.orders.length} orders · ${c.mtm.length} MTM, ${c.rtw.length} RTW`} />
      <KV k="Spend on record" v={`₹${c.spend.toLocaleString('en-IN')}`} note="at MRP — the bill is in Enigma" />
      <KV k="Store credit" v={<b style={{ color: c.credit > 0 ? 'var(--good)' : undefined }}>₹{c.credit.toLocaleString('en-IN')}</b>} note={c.creditLedger.length ? c.creditLedger.slice(0, 3).map(e => `${e.amount > 0 ? '+' : '−'}₹${Math.abs(e.amount).toLocaleString('en-IN')} · ${e.note} · ${fmtDate(e.at)}`).join('  ·  ') : 'none given yet — a store-credit case puts it here, a bill spends it'} />
      {c.open.length > 0 && <KV k="Open right now" v={c.open.map(o => `${o.orderNo} · ${o.stage.replace(/-/g, ' ')}`).join(' · ')} />}
      {c.corrections > 0 && <KV k="Sheet corrections" v={`${c.corrections}`} note="changes after punching — a customer who changes their mind wants a second measure, not a faster cut" />}
    </Section>
    {c.lastSheet && <Section title={`Measurements on file · from ${c.lastSheet.orderNo}`} right={<Pill tone="neutral">{fmtDate(c.lastSheet.punchedOn)} · {store(c.lastSheet.storeId)}</Pill>}>
      <SheetView o={c.lastSheet} />
      <div className="text-[11.5px] pt-2" style={{ color:'var(--ink-faint)' }}>The last sheet this customer ordered on. The next punch starts from it; the tape today decides what changes.</div>
    </Section>}
    {c.picks && <Section title="What they usually choose">
      <KV k="Fit block" v={c.picks.fit ?? '—'} />
      <KV k="Collar · cuff" v={`${c.picks.collar ?? '—'} · ${c.picks.cuff ?? '—'}`} />
      <KV k="Placket · pocket" v={`${c.picks.placket ?? '—'} · ${c.picks.pocket ?? '—'}`} />
      <KV k="Colours" v={c.colours.slice(0, 4).map(([k, n]) => `${k} ×${n}`).join(' · ') || '—'} note={`fabric families: ${c.families.slice(0, 3).map(([k, n]) => `${k} ×${n}`).join(' · ')}`} />
    </Section>}
    <Section title={`Orders · ${c.orders.length}`}>
      {c.orders.slice(0, 20).map(o => <div key={o.id} className="kv" style={{ cursor:'pointer' }} onClick={() => { window.location.hash = `#/stores?tab=${o.kind === 'MTM' ? 'mtm-orders' : 'rtw-orders'}&open=${o.id}`; }}>
        <span className="k"><b className="mono" style={{ color:'var(--ink)' }}>{o.orderNo}</b> · {o.kind}{o.tag !== 'normal' ? ` · ${o.tag}` : ''}<div className="text-[11px]">{o.styleName}{o.size ? ` · ${o.size}` : ''}{o.fit ? ` · ${o.fit}` : ''} · {store(o.storeId)}</div></span>
        <span className="v"><Pill tone={STAGE[o.stage] ?? 'neutral'}>{o.stage.replace(/-/g, ' ')}</Pill><div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{fmtDate(o.punchedOn)}</div></span>
      </div>)}
    </Section>
    {(c.returns.length > 0 || c.alterations.length > 0) && <Section title="Returns & alterations">
      {c.returns.map(r => <KV key={r.id} k={`${r.caseNo} · ${r.styleName}`} v={<Pill tone={r.stage === 'closed' || r.stage === 'refunded' ? 'good' : 'warn'}>{r.reason} → {r.wants}</Pill>} note={r.remarks} />)}
      {c.alterations.map(o => <KV key={o.id} k={`${o.orderNo} · alteration`} v={o.remarks || '—'} note={fmtDate(o.punchedOn)} />)}
    </Section>}
    <Files kind="customer" subjectId={name} labels={FILE_LABELS.customer} editable={mine} hint="a photo in the fit sample says more than the sheet — the customer cannot visualise the final shirt, and neither can the next store" />
    <ThreadPanel kind="customer" subjectId={name} steps={['General', 'Fit', 'Preferences', 'Complaint']} />
    <div className="text-[11px] pt-2" style={{ color:'var(--ink-faint)' }}>Seen from {store(storeId)}. Notes here travel with the customer to every store.</div>
  </>;
}


/* ---------- the store asks the unit for swatch books ---------------------
   A new stylist, a worn book, a corporate visit that needs a spare: today a
   WhatsApp to Shravani. Here it is an ask with a reason, answered by the unit. */
function BookAskCard({ storeId, mine }: { storeId: string; mine: boolean }) {
  const { db, askSwatchBooks } = useApp();
  const my = (db.bookRequests ?? []).filter(r => r.storeId === storeId);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'MTM' | 'RTW' | 'BESPOKE'>('MTM');
  const [copies, setCopies] = useState('1');
  const [reason, setReason] = useState('');
  const onFloor = (db.swatchBooks ?? []).filter(b => b.storeId === storeId && b.receivedOn);
  return <Card className="mb-3">
    <div className="flex items-center gap-3 flex-wrap">
      <div className="label" style={{ margin: 0 }}>Swatch books on this floor</div>
      <span className="text-[12.5px]">{(['MTM', 'RTW', 'BESPOKE'] as const).map(k => `${k} ${onFloor.filter(b => b.kind === k).reduce((a, b) => a + b.copies, 0)}`).join(' · ')}</span>
      <div className="flex-1" />
      {mine && !open && <Button size="sm" variant="primary" onClick={() => setOpen(true)}>Ask for books</Button>}
    </div>
    {open && <div className="flex items-end gap-2 flex-wrap pt-3">
      <Field label="Which book"><Select value={kind} onChange={v => setKind(v as typeof kind)} options={[{ value:'MTM', label:'MTM book' }, { value:'RTW', label:'RTW book' }, { value:'BESPOKE', label:'Bespoke book · from the mill' }]} /></Field>
      <Field label="Copies"><Input type="number" min={1} max={5} value={copies} onChange={e => setCopies(e.target.value)} style={{ width: 70 }} /></Field>
      <div className="flex-1" style={{ minWidth: 220 }}><Field label="Why" hint="the unit reads this before it sends"><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="a second stylist joined · the book is worn · a corporate visit" /></Field></div>
      <Button size="sm" variant="primary" disabled={!reason.trim()} onClick={() => { askSwatchBooks(kind, Math.max(1, Number(copies) || 1), reason.trim()); setOpen(false); setReason(''); setCopies('1'); }}>Send the ask</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </div>}
    {my.length > 0 && <div className="pt-3">{my.slice(0, 5).map(r => <div key={r.id} className="kv"><span className="k">{r.copies} × {r.kind} book<div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{r.reason}</div></span>
      <span className="v flex items-center gap-2 justify-end"><span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{fmtDate(r.askedOn)}</span><Pill tone={r.status === 'requested' ? 'warn' : r.status === 'shipped' ? 'good' : 'neutral'}>{r.status === 'requested' ? 'with the unit' : r.status === 'shipped' ? 'dispatched · confirm when it lands' : `declined${r.note ? ` · ${r.note}` : ''}`}</Pill></span></div>)}</div>}
  </Card>;
}
