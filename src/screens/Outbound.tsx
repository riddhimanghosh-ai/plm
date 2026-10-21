/* Outbound — what leaves the production unit today, and for whom. Two lists,
   two owners: production feeds the factories (MTM bundles, extra fabric, RTW
   bulk materials); the warehouse ships to the stores. */
import { Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import { outboundOf, fmtDate, fmtRel, daysAgo } from '../domain/engines';
import { Page, Card, Pill, Button, Note, Empty, Tabs, useExamples } from '../ui';
import { FabricOutTab } from './FabricOut';
import { VendorLink } from './Vendors';
import { ActsBy } from './Who';
import { MTM_ONLY } from '../domain/edition';

/* One screen, three things that leave the unit for a factory: the order-sheet
   bundles, the extra cloth a factory has asked for, and the RTW bulk materials
   that go with a PO. Same vehicle, three different lists and three owners. */
export function OutboundPage() {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'bundles';
  const set = (t: string) => { const n = new URLSearchParams(params); n.set('tab', t); setParams(n, { replace:true }); };
  const ob = outboundOf(db);
  const toPick = (db.extraFabric ?? []).filter(r => r.status === 'approved').length;
  return (
    <Page title="Outbound to factories" lede="Everything that leaves the production unit for a factory: order sheets, extra cloth, and RTW materials against a PO."
      replaces="the vehicle's load list on a WhatsApp, the extra-fabric printout, and the RTW fabric that leaves without a record">
      <Tabs active={tab} onChange={set} tabs={[
        { id:'bundles', label:'MTM bundles · cut & dispatch', count: ob.totals.factoryPcs },
        { id:'fabric', label:'Extra fabric · the cut list', count: toPick },
        ...(MTM_ONLY ? [] : [{ id:'rtw', label:'RTW bulk · materials to issue', count: ob.rtwIssue.length }]),
      ]} />
      {tab === 'fabric' ? <FabricOutTab /> : <OutboundTab side="factories" onTab={set} rtw={tab === 'rtw'} />}
    </Page>
  );
}

/* ---------- Outbound today — who gets what from the unit ------------------------ */
export function OutboundTab({ side, onTab, rtw }: { side: 'factories' | 'stores'; onTab: (t: string) => void; rtw?: boolean }) {
  const { db, role, issueMaterials } = useApp();
  const mine = role === 'production' || role === 'warehouse' || role === 'owner';
  const ob = outboundOf(db);
  const exFactories = useExamples(ob.toFactories, f => f.bundles.some(b => b.urgent > 0) ? 'urgent' : f.bundles.some(b => b.forcedOver) ? 'past capacity' : 'normal', { noun: 'factories', done: f => !f.bundles.some(b => b.urgent > 0 || b.forcedOver) });
  const exRtw = useExamples(ob.rtwIssue, x => x.sample.state, { noun: 'POs', done: x => x.sample.state === 'approved' });
  const exStores = useExamples(ob.toStores, x => x.mtmReady.length ? 'MTM shirts' : x.rtw.length ? 'RTW orders' : x.books.length ? 'swatch books' : x.launchPieces.length ? 'launch pieces' : 'stock transfers', { noun: 'stores', done: x => x.mtmReady.length > 0 });
  const LINK: Record<string, string> = { 'Warehouse · Cut & dispatch':'#/warehouse?tab=prepare', 'Extra fabric':'#/mtm?tab=fabric', 'Planning · Plans':'#/mtm?tab=plans' };
  const go = (t: string) => <button type="button" className="cta" onClick={() => { const h = LINK[t]; if (h) window.location.hash = h; else onTab(t); }}>→ {t}</button>;
  return <>
    <div className="grid gap-3" style={{ gridTemplateColumns:'1fr' }}>
      {side === 'factories' && !mine && <div className="mb-2"><ActsBy role={['production', 'warehouse']} does="issues checked materials and scans bundles out" inline /></div>}
      {side === 'factories' && !rtw && <Card>
        <div className="px-4 py-2.5 flex items-end justify-between gap-2 flex-wrap" style={{ borderBottom:'1px solid var(--line-soft)' }}><div><h3 className="m-0">The vehicle's outward load</h3>
          <div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>one line per bundle, oldest first — a bundle is one plan the unit submitted to that factory</div></div>{exFactories.strip}</div>
        {ob.toFactories.length === 0 ? <Empty title="Nothing to send to factories." body="" /> : <div style={{ overflowX:'auto' }}><table className="t compact">
          <thead><tr><th>Bundle</th><th>Submitted</th><th className="num">Order sheets</th><th className="num">Distinct fabrics</th><th className="num">Metres to cut</th><th>First ship-by</th><th>Next step</th></tr></thead>
          <tbody>{exFactories.rows.map(f => <Fragment key={f.v.id}>
            {/* one header per factory: who the load is for, and what it adds up to */}
            <tr style={{ background:'var(--surface-2)' }}>
              <td colSpan={2}><VendorLink id={f.v.id} className="font-medium" /></td>
              <td className="num font-medium">{f.bundles.reduce((a, b) => a + b.pcs, 0)}</td>
              <td className="num" style={{ color:'var(--ink-faint)' }} />
              <td className="num font-medium">{Math.round(f.bundles.reduce((a, b) => a + b.metres, 0) * 10) / 10} m</td>
              <td colSpan={2} className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>
                {f.bundles.length} bundle{f.bundles.length === 1 ? '' : 's'}
                {f.fabric.length > 0 && <> · <span style={{ color:'var(--warn)' }}>{f.fabric.length} extra-fabric line{f.fabric.length === 1 ? '' : 's'} · {Math.round(f.fabric.reduce((a, r) => a + r.metres, 0) * 10) / 10} m</span> <button type="button" className="cta" onClick={() => onTab('fabric')}>Cut list →</button></>}
              </td>
            </tr>
            {f.bundles.map(b => <tr key={b.planId} className="row" title="Open the plan: every order in this bundle" onClick={() => (window.location.hash = `#/mtm?tab=plans&plan=${b.planId}`)}>
              <td className="mono text-[12.5px]" style={{ paddingLeft: 22 }}>{b.planNo}{b.forcedOver ? <div><Pill tone="risk">{b.forcedOver} past capacity</Pill></div> : null}</td>
              <td className="text-[12px]">{fmtDate(b.createdOn)}<div style={{ color:'var(--ink-faint)' }}>{fmtRel(b.createdOn)}</div></td>
              <td className="num"><span className="vlink">{b.pcs} orders</span>{b.urgent > 0 && <div><Pill tone="risk">{b.urgent} urgent</Pill></div>}</td>
              <td className="num" style={{ color:'var(--ink-faint)' }} title={b.fabrics === b.pcs ? 'every piece is a different cloth — no two sheets share a roll' : `${b.pcs - b.fabrics} piece(s) share a roll with another`}>{b.fabrics}</td>
              <td className="num mono">{b.metres} m</td>
              <td className="text-[12px]" style={{ color: daysAgo(b.due) > 0 ? 'var(--risk)' : undefined }}>{fmtDate(b.due)}</td>
              <td><button type="button" className="cta" onClick={e => { e.stopPropagation(); window.location.hash = `#/mtm?tab=plans&plan=${b.planId}`; }}>View the orders →</button></td>
            </tr>)}
          </Fragment>)}</tbody>
        </table></div>}
      </Card>}
      {side === 'factories' && rtw !== false && <Card><div className="pad flex items-center justify-between gap-2 flex-wrap" style={{ padding:'12px 14px 4px' }}><div className="label">RTW bulk — checked materials to issue to the factory</div>{exRtw.strip}</div>
        {ob.rtwIssue.length === 0 ? <Empty title="No RTW materials waiting to go." body="Materials appear here once received and checked at the unit and not yet issued." /> : <table className="t"><thead><tr><th>PO · style</th><th>Factory</th><th>Sample</th><th>Materials checked, not issued</th><th></th></tr></thead>
          <tbody>{exRtw.rows.map(({ o, ready, sample }) => <tr key={o.id}>
            <td><span className="mono text-[12.5px]">{o.poNo}</span> · {o.styleName}<div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{o.orderQty} pcs · inhouse {fmtDate(o.targetInhouse)}</div></td>
            <td><VendorLink id={o.vendorId} /></td>
            <td><Pill tone={sample.state === 'approved' ? 'good' : 'warn'}>{sample.state === 'approved' ? 'PP go-ahead' : sample.state}</Pill></td>
            <td className="text-[12px]">{ready.map(l => <div key={l.bomIndex}>{l.bom?.item} · {l.requiredQty} {l.bom?.unit}</div>)}</td>
            <td>{mine ? <Button size="sm" variant="primary" onClick={() => issueMaterials(o.id)}>Issue to factory</Button> : null}</td>
          </tr>)}</tbody></table>}
      </Card>}
      {side === 'stores' && <Card><div className="pad flex items-center justify-between gap-2 flex-wrap" style={{ padding:'12px 14px 4px' }}><div className="label">To stores — parcels out of the hub</div>{exStores.strip}</div>
        {ob.toStores.length === 0 ? <Empty title="Nothing to send to stores." body="" /> : <table className="t"><thead><tr><th>Store</th><th>What</th><th className="num">Items</th></tr></thead>
          <tbody>{exStores.rows.map(x => <tr key={x.st.id}>
            <td className="font-medium">{x.st.name}<div className="text-[11px] font-normal" style={{ color:'var(--ink-faint)' }}>{x.st.region}</div></td>
            <td className="text-[12px]">
              {x.mtmReady.length > 0 && <div>{x.mtmReady.length} finished MTM shirt{x.mtmReady.length === 1 ? '' : 's'} (RTS) · {x.mtmReady.map(o => o.orderNo).slice(0, 3).join(', ')}{x.mtmReady.length > 3 ? '…' : ''} {go('Planning · Plans')}</div>}
              {x.rtw.length > 0 && <div>{x.rtw.length} RTW customer order{x.rtw.length === 1 ? '' : 's'} · {x.rtw.map(o => `${o.orderNo} ${o.size}`).slice(0, 3).join(', ')} <button type="button" className="cta" onClick={() => (window.location.hash = '#/tracker?tab=orders')}>→ Customer orders</button></div>}
              {x.books.length > 0 && <div style={{ color:'var(--warn)' }}>Swatch book{x.books.length === 1 ? '' : 's'}: {x.books.join(', ')} <button type="button" className="cta" onClick={() => (window.location.hash = '#/warehouse?tab=books')}>→ Swatch books</button></div>}
              {x.launchPieces.length > 0 && <div>{x.launchPieces.length} launch display / fit piece{x.launchPieces.length === 1 ? '' : 's'} · {[...new Set(x.launchPieces.map(y => y.l.styleName))].join(', ')} <button type="button" className="cta" onClick={() => (window.location.hash = '#/launches')}>→ Launches</button></div>}
              {x.transfers.length > 0 && <div>{x.transfers.length} stock transfer{x.transfers.length === 1 ? '' : 's'} · {x.transfers.map(t => t.stoNo).join(', ')} <button type="button" className="cta" onClick={() => (window.location.hash = '#/warehouse?tab=transfers')}>→ Transfers</button></div>}
            </td>
            <td className="num">{x.total}</td>
          </tr>)}</tbody></table>}
      </Card>}
    </div>
    <div className="mt-3"><Note>{side === 'stores' ? 'One list for the shipping team, by store — the arrow takes you to where the scan or button lives.' : rtw ? 'Materials go out against the PO; one whose sample is not approved is flagged, not hidden.' : 'The vehicle\u2019s outward load by factory — extra cloth is on the next tab because a different person picks it.'}</Note></div>
  </>;
}
