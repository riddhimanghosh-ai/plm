/* The Production Tracker, as a relay instead of a 128-column sheet.
   Every open garment PO; open one and each team's section is labelled with
   who fills it — yours is editable, the rest is context. The milestone grid
   is the sheet's own three columns, Plan | Revised | Actual, per row, with a
   reason whenever a date moves. A late actual pushes every open step behind
   it by the same days, automatically. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp, useAppStore } from '../store';
import type { Milestone, ProductionOrder } from '../domain/types';
import { cutFromFabric, leadTimesOf, otifOf, riskOf, stageOf, fmtDate, fmtMoney, daysAgo, fmtRel, costingOf, hubOrders, fulfilFromOf, trackerConfig, autoPlanLogicOf, rtwDocsOf, factoryStateOf, fabricStateOf, type Risk } from '../domain/engines';
import { ORDER_STEPS } from '../domain/reference';
import { ThreadPanel } from './Thread';
import { RecordTail } from './RecordTail';
import { Files } from './Files';
import { FILE_LABELS } from '../domain/reference';

import { BomSection, CostingSection } from './Costing';
import { VendorLink } from './Vendors';
import { SampleSection, MaterialsSection, QcSection, ReceiptLots, SplitSection, ProtoSection, MaterialsCoverSection, FactoryFinalisationSection, FabricFinalisationSection, DocsChecklist, SizeGrid } from './RtwGates';
import { MILESTONES, MILESTONE_OWNER, PRE_PRODUCTION, MERCHANDISERS, DELAY_REASONS, ROLE_LABEL, RISK, STORES, GARMENT_CATEGORIES } from '../domain/reference';
import type { GarmentCategory, RoleId } from '../domain/types';
import { Page, Card, Pill, Field, Input, Select, Button, Drawer, KV, Section, Note, dateInput, fromDateInput, Tabs, Empty, usePager, Pager, ExportButton, Seg, useExamples, type Tone } from '../ui';
import { ActsBy, OwnerPill } from './Who';

export const RISK_TONE: Record<Risk, Tone> = { pending:'neutral', 'on-track':'good', watch:'warn', 'at-risk':'warn', critical:'risk', delayed:'risk', closed:'neutral' };

export function Tracker() {
  const { db, role } = useApp();
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  const tab = params.get('tab') ?? 'open';
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace:true }); };
  const [merchant, setMerchant] = useState('all');
  const view = params.get('view') ?? 'summary';
  const vendorName = (id: string | null) => db.vendors.find(v => v.id === id)?.name ?? '—';

  /* the sheet has a row from the day design sends the style, long before a PO number exists — so does this */
  const garment = db.orders.filter(o => o.status === 'Open' || o.status === 'Closed' || o.status === 'Quoting' || o.status === 'Allocated');
  /* the questions this table is actually opened with: whose is it, who is
     making it, where has it got to, and what is on fire */
  const [vendor, setVendor] = useState('all');
  const [stage, setStage] = useState('all');
  const [risk, setRisk] = useState('all');
  const [search, setSearch] = useState('');
  const stageFor = (o: ProductionOrder) => { if (o.poNo) return stageOf(o); const f = factoryStateOf(o); return { stage: `No PO yet · ${f.label}`, next: f.key === 'accepted' ? 'design to raise the PO' : f.key === 'with-design' ? 'design to accept or send back' : f.key === 'rejected' ? 'production to re-propose' : 'production to propose a factory', waitingOn: f.owner as RoleId | null }; };
  /* the sheet reads top-down from the newest request: styles with no PO yet come first, then the POs by how much trouble they are in */
  const ORDER = ['pending', 'delayed', 'critical', 'at-risk', 'watch', 'on-track'];
  const inTab = garment.filter(o => tab === 'open' ? o.status !== 'Closed' : o.status === 'Closed')
    .map(o => ({ o, r: riskOf(o), s: stageFor(o) }))
    .sort((a, b) => ORDER.indexOf(a.r.risk) - ORDER.indexOf(b.r.risk) || a.o.targetInhouse.localeCompare(b.o.targetInhouse));
  const vendors = [...new Set(inTab.map(x => x.o.vendorId).filter(Boolean))]
    .map(id => ({ id: id!, name: db.vendors.find(v => v.id === id)?.name ?? id! })).sort((a, b) => a.name.localeCompare(b.name));
  const stages = [...new Set(inTab.map(x => x.s.stage))].sort();
  const riskCount = (k: string) => inTab.filter(x => x.r.risk === k).length;
  const rows = inTab.filter(x => {
    if (merchant !== 'all' && x.o.merchant !== merchant) return false;
    if (vendor !== 'all' && x.o.vendorId !== vendor) return false;
    if (stage !== 'all' && x.s.stage !== stage) return false;
    if (risk === 'trouble' ? !['delayed', 'critical', 'at-risk'].includes(x.r.risk) : risk === 'pre' ? !!x.o.poNo : risk !== 'all' && x.r.risk !== risk) return false;
    const t = search.trim().toLowerCase();
    if (t && !(x.o.styleName.toLowerCase().includes(t) || (x.o.poNo ?? '').toLowerCase().includes(t))) return false;
    return true;
  });
  const active = db.orders.find(o => o.id === openId) ?? null;
  const open = db.orders.filter(o => o.status === 'Open').map(riskOf);
  /* one PO per risk word — delayed, critical, at risk, watch, on track */
  const ex = useExamples(rows, x => x.o.poNo ? x.r.risk : 'before PO', { n: 5, noun:'styles', done: x => x.o.status === 'Closed' ? (x.o.deliveredQty ?? 0) > 0 : x.o.milestones.length > 0 && x.o.milestones.every(m => !!m.actual) })   // closed and delivered, or every milestone landed and the PO only waits on delivery;
  const pager = usePager(ex.rows, 25);

  return (
    <Page title="RTW production tracker" lede="Every open order with its date calendar, who is chasing it, and where it is on the floor."
      replaces="Production Tracker Final V2.xlsx — 128 columns opened by six teams, plus the Daily Monitor and Alert Dashboard tabs beside it">

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <Tabs tabs={[{ id:'open', label:'In the tracker · open styles', count: garment.filter(o => o.status !== 'Closed').length }, { id:'closed', label:'Closed POs · delivered' }, { id:'settings', label:'Settings · lead times & risk' }, { id:'orders', label:'Customer orders · RTW & hemming', count: hubOrders(db).length }]} active={tab} onChange={t => set('tab', t)} />
        <div className="flex gap-2 items-end">
          <div className="pb-1"><ExportButton filename="rtw-production-tracker" rows={rows} cols={[
            { label:'PO', get: (x: typeof rows[number]) => x.o.poNo ?? '' },
            { label:'Style', get: x => x.o.styleName },
            { label:'Category', get: x => x.o.category },
            { label:'Vendor', get: x => db.vendors.find(v => v.id === x.o.vendorId)?.name ?? '' },
            { label:'Merchant', get: x => x.o.merchant },
            { label:'Qty', get: x => x.o.orderQty },
            { label:'Where it is', get: x => x.s.stage },
            { label:'Next', get: x => x.s.next ?? '' },
            { label:'Target inhouse', get: x => x.o.targetInhouse },
            { label:'Expected', get: x => x.r.expectedInhouse ?? '' },
            { label:'Buffer days', get: x => x.r.bufferDays ?? '' },
            { label:'Risk', get: x => x.r.risk },
          ]} /></div>
          <div style={{ width:200 }}><Field label="Merchandiser"><Select value={merchant} onChange={setMerchant} options={[{ value:'all', label:'Everyone' }, ...MERCHANDISERS.map(m => ({ value:m, label:m }))]} /></Field></div>
          <div style={{ width:190 }}><Field label="View"><Select value={view} onChange={v => set('view', v === 'summary' ? null : v)} options={[{ value:'summary', label:'Summary' }, { value:'sheet', label:'Every column, as the sheet' }]} /></Field></div>
        </div>
      </div>

      {tab !== 'orders' && tab !== 'settings' && <Card className="mb-3"><div className="flex items-center gap-3 flex-wrap px-3 py-2.5">
        <Seg value={risk} onChange={setRisk} options={[
          { id:'all', label:'All', count: inTab.length },
          { id:'pre', label:'Before the PO', count: inTab.filter(x => !x.o.poNo).length, hint:'sent by design; the factory, cost and PO are still being settled' },
          { id:'trouble', label:'Needs attention', count: riskCount('delayed') + riskCount('critical') + riskCount('at-risk'), hint:'delayed, critical, or eating into the buffer' },
          { id:'delayed', label:'Delayed', count: riskCount('delayed') },
          { id:'critical', label:'Critical', count: riskCount('critical') },
          { id:'watch', label:'Watch', count: riskCount('watch'), hint:'a milestone is past its planned date with nothing recorded' },
          { id:'on-track', label:'On track', count: riskCount('on-track') },
        ]} />
        <Select value={vendor} onChange={setVendor} style={{ width:'auto' }}
          options={[{ value:'all', label:`Every factory · ${vendors.length}` }, ...vendors.map(v => ({ value:v.id, label:v.name }))]} />
        <Select value={stage} onChange={setStage} style={{ width:'auto' }}
          options={[{ value:'all', label:'Anywhere on the floor' }, ...stages.map(st => ({ value:st, label:st }))]} />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="style or PO number" style={{ width:190 }} />
        {(vendor !== 'all' || stage !== 'all' || risk !== 'all' || search.trim() || merchant !== 'all') &&
          <Button size="sm" variant="ghost" onClick={() => { setVendor('all'); setStage('all'); setRisk('all'); setSearch(''); setMerchant('all'); }}>Clear</Button>}
        <span className="ml-auto">{ex.strip}</span>
      </div></Card>}

      {tab === 'settings' ? <TrackerSettings /> : tab === 'orders' ? <HubOrdersTab /> : view === 'sheet' ? <SheetColumns rows={ex.rows.map(x => x.o)} onOpen={id => set('open', id)} /> : rows.length === 0 ? <Card><Empty title="Nothing matches those filters." body="Loosen one of them, or clear the search." /></Card> : <Card>
        <table className="t">
          <thead><tr><th>PO</th><th>Style</th><th>Vendor</th><th>Merchant</th><th>Where it is</th><th>Target inhouse</th><th>Expected</th><th className="num">Buffer</th><th>Risk factor</th></tr></thead>
          <tbody>{pager.pageRows.map(({ o, r, s }) => (
            <tr key={o.id} className="row" onClick={() => set('open', o.id)}>
              <td className="mono text-[12.5px]" style={{ whiteSpace:'nowrap' }}>{o.poNo ?? <span className="text-[12px]" style={{ color:'var(--ink-faint)', fontFamily:'var(--body)' }}>no PO yet</span>}</td>
              <td><div className="font-medium">{o.styleName}</div><div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{o.category}</div></td>
              <td className="text-[12.5px]">{o.vendorId ? <VendorLink id={o.vendorId}>{vendorName(o.vendorId)}</VendorLink> : (() => { const f = factoryStateOf(o); return f.last ? <span style={{ color:'var(--ink-faint)' }}>{vendorName(f.last.vendorId)} · proposed</span> : <span style={{ color:'var(--ink-faint)' }}>—</span>; })()}</td>
              <td className="text-[12.5px]">{o.merchant ?? <span style={{ color:'var(--ink-faint)' }}>—</span>}</td>
              <td className="text-[12.5px]"><div>{s.stage}</div>{s.next && <div style={{ color:'var(--ink-faint)' }}>next: {s.next}</div>}</td>
              <td>{fmtDate(o.targetInhouse)}</td>
              <td style={{ color: r.bufferDays != null && r.bufferDays < 0 ? 'var(--risk)' : undefined }}>{fmtDate(r.expectedInhouse)}</td>
              <td className="num" style={{ color: r.bufferDays == null ? undefined : r.bufferDays <= RISK.criticalBufferDays ? 'var(--risk)' : r.bufferDays <= RISK.atRiskBufferDays ? 'var(--warn)' : 'var(--good)' }}>{r.bufferDays != null ? `${r.bufferDays}d` : '—'}</td>
              <td><Pill tone={RISK_TONE[r.risk]}>{r.risk === 'pending' ? 'before PO' : r.risk.replace('-', ' ')}</Pill></td>
            </tr>))}</tbody>
        </table>
        <Pager page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} from={pager.from} to={pager.to} total={pager.total} noun="purchase orders" />
      </Card>}

      <Drawer open={!!active} onClose={() => set('open', null)} title={active?.poNo ?? active?.styleName ?? ''} subtitle={active && <><Pill tone={RISK_TONE[riskOf(active).risk]}>{riskOf(active).risk.replace('-', ' ')}</Pill><span>{active.styleName} · {vendorName(active.vendorId)} · {active.merchant}</span></>}>
        {active && <OrderDetail o={active} role={role} vendorName={vendorName} />}
      </Drawer>
    </Page>
  );
}

export function OrderDetail({ o, role, vendorName, defaultStep }: { o: ProductionOrder; role: string; vendorName: (id: string | null) => string; defaultStep?: string }) {
  const r = riskOf(o); const s = stageOf(o);
  const mine = (owner: string) => role === owner || role === 'owner';
  const db = useAppStore.getState().db;
  const docs = rtwDocsOf(db, o); const fst = factoryStateOf(o); const fab = fabricStateOf(o);
  const lt = leadTimesOf(o); const ot = otifOf(o);
  const yesNo = (v: boolean) => <Pill tone={v ? 'good' : 'warn'}>{v ? 'Yes' : 'No'}</Pill>;
  const fabricReady = o.fabricReady || !!o.fabricSupply?.receipt;
  const trimsReady = o.trimsReady || !!o.materialsCovered;
  return <>
    {/* ── 1 · Style details + order qty break-up — the sheet's first two sections, design and planning ── */}
    <Section title="1 · Request from design" pending={false} defaultOpen={o.status === 'Requirement'} ownerRole="design"
      right={<div className="flex gap-2 items-center"><Pill tone={docs.missing.length ? (o.poNo ? 'risk' : 'warn') : 'good'}>{docs.missing.length ? `${docs.missing.length} document${docs.missing.length === 1 ? '' : 's'} missing` : 'complete'}</Pill></div>}>
      <KV k="Category" v={o.category} />
      <KV k="Sub category" v={o.subCategory} />
      <KV k="Style / colour" v={o.styleName} />
      <KV k="Shiphero style name" v={o.shipheroName ?? '—'} />
      <KV k="Programme name" v={o.program ?? '—'} />
      <KV k="Launch month" v={o.launchMonth ?? '—'} />
      <KV k="Target inhouse date" v={fmtDate(o.targetInhouse)} />
      <KV k="Fit" v={o.fit ?? '—'} />
      <KV k="Target price" v={fmtMoney(o.targetCost)} note="per piece" />
      <KV k="Fabric readiness" v={yesNo(fabricReady)} note={fabricReady ? (o.fabricSupply?.receipt ? `counted in at the factory ${fmtDate(o.fabricSupply.receipt.on)}` : undefined) : fab.label} />
      <KV k="Trims readiness" v={yesNo(trimsReady)} note={trimsReady && o.materialsCovered ? `covered by sourcing ${fmtDate(o.materialsCovered.on)}` : undefined} />
      <KV k="Style handover date" v={fmtDate(o.styleHandover)} note={`${daysAgo(o.styleHandover)}d ago`} />
      <div className="label pt-2">Order qty break-up{(o.cutRatios ?? []).some(c => c.given) ? ' · current cut ratio' : ''}</div>
      <SizeGrid breakup={o.sizeBreakup} />
      {(o.cutRatios ?? []).filter(c => c.given).map((c, i) => <div key={i} className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>originally {c.originalBreakup.filter(x => x.qty).map(x => `${x.size}:${x.qty}`).join(' ')} · changed {fmtDate(c.given!.on)} because {c.reason}</div>)}
      <div className="label pt-3">Job card · trim card · BOM · tech pack</div>
      <DocsChecklist o={o} editable={mine('design')} />
    </Section>

    {/* ── 2 · Factory finalisation — the sheet's columns, then the proposal loop ── */}
    <Section title="2 · Factory finalisation" ownerRole={fst.owner === 'merchandiser' ? 'production' : fst.owner}
      right={<Pill tone={fst.tone}>{fst.label}</Pill>}>
      <FactoryFinalisationSection o={o} bare columns={<>
        <KV k="Vendor / factory" v={o.vendorId ? <VendorLink id={o.vendorId}>{vendorName(o.vendorId)}</VendorLink> : '—'} />
        <KV k="Region" v={db_vendor_loc(o.vendorId) || '—'} />
        <KV k="Merchant" v={o.merchant ?? '—'} />
        <KV k="PO No." v={o.poNo ?? '—'} note={o.poNo ? undefined : 'after design raises the factory PO'} />
        <KV k="PO date" v={fmtDate(o.poDate)} />
        <KV k="PO status" v={o.poNo ? o.status : '—'} />
        <KV k="BOM / Jobcard" v={o.jobCardNo ?? (o.bom.length ? `${o.bom.length} BOM lines` : '—')} note={docs.owedAfterPo.length ? `owed to the factory: ${docs.owedAfterPo.join(', ')}` : undefined} />
        <KV k="Costing closure target" v={fmtDate(o.costingClosure.plan)} />
        <KV k="Costing closure revised plan" v={o.costingClosure.revised ? fmtDate(o.costingClosure.revised) : '—'} />
        <KV k="Costing closure actual" v={o.costingClosure.actual ? fmtDate(o.costingClosure.actual) : '—'} />
        <KV k="Final FOB cost (₹ / $)" v={o.finalFob != null ? fmtMoney(o.finalFob) : '—'} note={o.finalFob != null ? `target ${fmtMoney(o.targetCost)}` : undefined} />
        <div className="pt-2" style={{ borderTop:'1px solid var(--line-soft)' }} />
      </>} />
    </Section>

    {/* ── 3 · Fabric details — the sheet's columns, then bought · sent · counted in · cut ratio ── */}
    <Section title="3 · Fabric finalisation" ownerRole={fab.owner === 'merchandiser' ? 'production' : fab.owner}
      right={<Pill tone={fab.tone}>{fab.label}</Pill>}>
      <FabricFinalisationSection o={o} bare columns={(() => { const fromPo = o.sourcing?.fabricPo ? undefined : 'fills in from the fabric PO'; return <>
        <KV k="Fabric vendor" v={o.fabricVendorId ? <VendorLink id={o.fabricVendorId}>{vendorName(o.fabricVendorId)}</VendorLink> : '—'} note={o.fabricVendorId ? undefined : fromPo} />
        <KV k="Vendor fabric code" v={o.vendorFabricCode ?? '—'} note={o.vendorFabricCode ? undefined : fromPo} />
        <KV k="Enigma code" v={o.enigmaCode ?? '—'} note={o.enigmaCode ? undefined : fromPo} />
        <KV k="Fabric CPM" v={o.costing.cpm != null ? `₹${o.costing.cpm}/m` : '—'} note={o.costing.cpm != null ? undefined : fromPo} />
        <KV k="Fabric blocked" v={o.fabricBlocked != null ? `${o.fabricBlocked} m` : '—'} note={o.fabricBlocked != null ? (o.fabricMetres != null ? `${o.fabricMetres} m needed` : undefined) : fromPo} />
        <KV k="Planned consumption (mtrs)" v={o.costing.consumption != null ? `${o.costing.consumption} m/pc` : '—'} />
        <KV k="Actual consumption (mtrs)" v={o.costing.actualConsumption != null ? `${o.costing.actualConsumption} m/pc` : '—'} note={o.costing.actualConsumption != null ? undefined : 'after cutting'} />
        <div className="pt-2" style={{ borderTop:'1px solid var(--line-soft)' }} />
      </>; })()} />
    </Section>

    {/* ── 4 · Production milestones / TNA + Final steps ── */}
    <Section title="4 · TNA milestones & final steps" ownerRole="production" defaultOpen={!!o.poNo}
      right={<Pill tone={o.poNo ? RISK_TONE[r.risk] : 'neutral'}>{o.poNo ? r.risk.replace('-', ' ') : 'after the PO'}</Pill>}>
      {!o.poNo ? <div className="py-1 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>The milestones are generated from the PO date once design raises the PO.</div> : <>
        {r.risk !== 'on-track' && r.risk !== 'closed' && r.risk !== 'pending' && <div className="pb-2"><Note tone={r.risk === 'watch' || r.risk === 'at-risk' ? 'warn' : 'risk'}>
          {r.risk === 'watch' && `"${r.flagged?.key}" is past its planned date with nothing recorded — done and unlogged, or actually late?`}
          {r.risk === 'at-risk' && `${r.slipDays}d of slip so far, ${r.bufferDays}d of buffer left before the target inhouse date.`}
          {r.risk === 'critical' && `Buffer down to ${r.bufferDays}d (critical at ≤${RISK.criticalBufferDays}d) — final delivery is at genuine risk.`}
          {r.risk === 'delayed' && `Target inhouse date has passed with ${r.slipDays}d of slip.`}
        </Note></div>}
        <MilestoneGrid o={o} editable={mine('production') || mine('merchandiser')} bare />
        <div className="label pt-3">Final steps</div>
        {(() => { const ln = (db.launches ?? []).find(l => l.orderId === o.id); return <KV k="Design code" v={ln?.designCode ?? '—'} note={ln?.designCode ? `minted ${fmtDate(ln.designCodeOn)} by ${ln.designCodeBy}` : ln?.receivedAtHo ? 'goods received — design mints it' : 'after the goods are received'} />; })()}
        <KV k="Remarks" v={o.remarks || '—'} />
        <KV k="Status" v={o.status} />
        <KV k="Risk factor" v={<Pill tone={RISK_TONE[r.risk]}>{r.risk.replace('-', ' ')}</Pill>} note={r.bufferDays != null ? `${r.bufferDays}d buffer · expected ${fmtDate(r.expectedInhouse)}` : undefined} />
        <KV k="Cut qty" v={o.cutQty ?? '—'} note={cutFromFabric(o) != null ? `fabric blocked would cut about ${cutFromFabric(o)}` : undefined} />
        <KV k="OTIF flag" v={<Pill tone={ot === 'OTIF' ? 'good' : ot === 'Pending' ? 'neutral' : 'risk'}>{ot}</Pill>} />
        <KV k="Delivered qty" v={o.deliveredQty ?? '—'} note={o.rejectedQty ? `${o.rejectedQty} rejected` : undefined} />
        <KV k="Planned lead time" v={`${lt.planned}d`} />
        <KV k="Actual lead time" v={lt.actual != null ? `${lt.actual}d` : '—'} note={lt.actual != null ? (lt.actual > lt.planned ? `${lt.actual - lt.planned}d longer than planned` : 'at or under plan') : undefined} />
      </>}
    </Section>

    {/* ── files · conversation · activity ── */}
    <RecordTail kind="order" subjectId={o.id} labels={FILE_LABELS.order} editable steps={ORDER_STEPS} activity={o.activity} />
    {defaultStep && null}
  </>;
}

function db_vendor_loc(id: string | null) { const v = useAppStore.getState().db.vendors.find(x => x.id === id); return v ? `${v.region} · ${v.location}` : undefined; }

export function ExecutionSection({ o, editable }: { o: ProductionOrder; editable: boolean }) {
  const { updateExecution } = useApp();
  const c = costingOf(o);
  const ratio = o.sizeBreakup.map(x => `${x.size} ${Math.round((x.qty / o.orderQty) * 100)}%`).join(' · ');
  const [merchant, setMerchant] = useState(o.merchant ?? '');
  const [jc, setJc] = useState(o.jobCardNo ?? '');
  const [fob, setFob] = useState(o.finalFob != null ? String(o.finalFob) : '');
  return (
    <Section title="Execution" right={<OwnerPill editable={editable} owner="Production" />}>
      {!editable && <ActsBy role="production" does="assigns the merchandiser, marks fabric and trims ready, and logs the PO details" />}
      {editable ? <>
        <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'repeat(3,1fr)' }}>
          <Field label="Merchandiser"><Select value={merchant} onChange={setMerchant} options={[{ value:'', label:'— unassigned —' }, ...MERCHANDISERS.map(m => ({ value:m, label:m }))]} /></Field>
          <Field label="Job card no."><Input value={jc} onChange={e => setJc(e.target.value)} placeholder="BOM 337" /></Field>
          <Field label="Final FOB (₹/pc)" hint={o.costingClosure.actual ? `closed ${fmtDate(o.costingClosure.actual)}` : `costing closure due ${fmtDate(o.costingClosure.plan)}`}><Input type="number" value={fob} onChange={e => setFob(e.target.value)} /></Field>
        </div>
        <div className="flex gap-2 items-center flex-wrap py-2">
          <span className="label" style={{ margin:0 }}>Material gates</span>
          <Button size="sm" variant={o.fabricReady ? 'primary' : undefined} onClick={() => updateExecution(o.id, { fabricReady: !o.fabricReady })}>Fabric {o.fabricReady ? 'ready' : 'not ready'}</Button>
          <Button size="sm" variant={o.trimsReady ? 'primary' : undefined} onClick={() => updateExecution(o.id, { trimsReady: !o.trimsReady })}>Trims {o.trimsReady ? 'ready' : 'not ready'}</Button>
          <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>nothing on the floor starts until both are ready</span>
        </div>
        <Button size="sm" variant="primary" onClick={() => updateExecution(o.id, { merchant: merchant || null, jobCardNo: jc.trim() || null, finalFob: fob ? Number(fob) : null })}>Save</Button>
        <div className="pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
          <KV k="Job card · size ratio" v={ratio} note="from the requirement's breakup — not retyped" />
          <KV k="Job card · fabric to issue" v={c.fabricMetres != null ? `${c.fabricMetres} ${o.bom[0]?.unit ?? 'm'}` : 'consumption not set'} note="consumption × order qty, from the BOM" />
        </div>
      </> : <>
        <KV k="Merchandiser" v={o.merchant ?? '—'} />
        <KV k="Job card no." v={o.jobCardNo ?? '—'} />
        <KV k="Job card · size ratio" v={ratio} />
        <KV k="Job card · fabric to issue" v={c.fabricMetres != null ? `${c.fabricMetres} ${o.bom[0]?.unit ?? 'm'}` : '—'} />
        <KV k="Fabric · trims" v={`${o.fabricReady ? 'ready' : 'not ready'} · ${o.trimsReady ? 'ready' : 'not ready'}`} />
        <KV k="Final FOB" v={o.finalFob != null ? fmtMoney(o.finalFob) : 'costing open'} />
      </>}
    </Section>
  );
}

/* Plan | Revised | Actual — the sheet's own three columns, per milestone. */
/* Every milestone column of the tracker sheet, in the sheet's order. A step the
   category's plan does not have shows as NA, the way the sheet shows it. */
function allSteps(o: ProductionOrder): (Milestone & { na?: boolean })[] {
  return (MILESTONES as readonly string[]).map(key => o.milestones.find(m => m.key === key)
    ?? { key, label: key, owner: (MILESTONE_OWNER[key] ?? 'production') as RoleId, stage: PRE_PRODUCTION.has(key) ? 'pre-production' : 'production', plan: '', revised: null, actual: null, delayReason: null, na: true } as Milestone & { na?: boolean });
}

export function MilestoneGrid({ o, editable, bare }: { o: ProductionOrder; editable: boolean; bare?: boolean }) {
  const { setMilestone } = useApp();
  const [draft, setDraft] = useState<Record<string, Partial<Milestone>>>({});
  const d = (m: Milestone) => ({ ...m, ...draft[m.key] });
  const changed = (m: Milestone) => !!draft[m.key];
  const save = (m: Milestone) => { const p = draft[m.key]; if (!p) return; setMilestone(o.id, m.key, p); setDraft(x => { const n = { ...x }; delete n[m.key]; return n; }); };
  const stages = ['pre-production', 'production'] as const;

  return (
    bare ? <>
      {!editable && <ActsBy role="production" does="logs each milestone's actual or revised date and the reason it moved" />}
      <table className="t">
        <thead><tr><th style={{ width:'26%' }}>Milestone</th><th>Plan</th><th>Revised</th><th>Actual</th><th>Why it moved</th><th></th></tr></thead>
        <tbody>
          {stages.map(st => {
            const list = allSteps(o).filter(m => m.stage === st);
            return [
              <tr key={`${st}-h`}><td colSpan={6} className="mono text-[10px] uppercase tracking-[.08em] pt-3" style={{ color:'var(--ink-faint)' }}>{st.replace('-', ' ')}</td></tr>,
              ...list.map(m => {
                if (m.na) return <tr key={m.key} style={{ opacity:.5 }}><td><div className="flex items-center gap-2"><span className="dot" style={{ background:'var(--line)' }} /><span>{m.key}</span></div></td><td className="mono text-[12px]" colSpan={3}>NA · not in this category's plan</td><td colSpan={2} /></tr>;
                const v = d(m); const late = m.actual && new Date(m.actual) > new Date(m.plan) ? Math.round((new Date(m.actual).getTime() - new Date(m.plan).getTime()) / 86400000) : 0;
                const overdue = !m.actual && new Date(m.revised ?? m.plan) < new Date();
                return <tr key={m.key}>
                  <td><div className="flex items-center gap-2"><span className="dot" style={{ background: m.actual ? (late ? 'var(--risk)' : 'var(--good)') : overdue ? 'var(--warn)' : 'var(--ink-faint)' }} /><span className="font-medium">{m.key}</span></div><div className="text-[10.5px] pl-4" style={{ color:'var(--ink-faint)' }}>{ROLE_LABEL[m.owner]}</div></td>
                  {editable ? <>
                    <td><Input type="date" value={dateInput(v.plan)} onChange={e => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], plan: fromDateInput(e.target.value) ?? m.plan } }))} style={{ width:132 }} /></td>
                    <td><Input type="date" value={dateInput(v.revised)} onChange={e => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], revised: fromDateInput(e.target.value) } }))} style={{ width:132 }} /></td>
                    <td><Input type="date" value={dateInput(v.actual)} onChange={e => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], actual: fromDateInput(e.target.value) } }))} style={{ width:132 }} /></td>
                    <td>{(v.revised && !v.actual) ? <Select value={v.delayReason ?? ''} onChange={val => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], delayReason: val || null } }))} options={[{ value:'', label:'— reason —' }, ...DELAY_REASONS.map(rz => ({ value:rz, label:rz }))]} /> : <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{m.delayReason ?? '—'}</span>}</td>
                    <td>{changed(m) && <Button size="sm" variant="primary" onClick={() => save(m)}>Save</Button>}</td>
                  </> : <>
                    <td className="mono text-[12px]" style={{ textDecoration: m.revised ? 'line-through' : undefined, color: m.revised ? 'var(--ink-faint)' : undefined }}>{fmtDate(m.plan)}</td>
                    <td className="mono text-[12px]" style={{ color:'var(--warn)' }}>{fmtDate(m.revised)}</td>
                    <td className="mono text-[12px]">{fmtDate(m.actual)}{late > 0 && <span className="pill risk ml-1">+{late}d</span>}</td>
                    <td className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{m.delayReason ?? '—'}</td><td />
                  </>}
                </tr>;
              }),
            ];
          })}
        </tbody>
      </table>
      <div className="text-[11.5px] py-2" style={{ color:'var(--ink-faint)' }}>An actual that lands late pushes every open step behind it by the same number of days. A revised date wants a reason — a moved cell without one is what makes a tracker untrustworthy.</div>
</> : <Section title={`Time & action · ${o.milestones.length} of ${MILESTONES.length} steps planned`} right={<OwnerPill editable={editable} owner="Production" />}>
      {!editable && <ActsBy role="production" does="logs each milestone's actual or revised date and the reason it moved" />}
      <table className="t">
        <thead><tr><th style={{ width:'26%' }}>Milestone</th><th>Plan</th><th>Revised</th><th>Actual</th><th>Why it moved</th><th></th></tr></thead>
        <tbody>
          {stages.map(st => {
            const list = allSteps(o).filter(m => m.stage === st);
            return [
              <tr key={`${st}-h`}><td colSpan={6} className="mono text-[10px] uppercase tracking-[.08em] pt-3" style={{ color:'var(--ink-faint)' }}>{st.replace('-', ' ')}</td></tr>,
              ...list.map(m => {
                if (m.na) return <tr key={m.key} style={{ opacity:.5 }}><td><div className="flex items-center gap-2"><span className="dot" style={{ background:'var(--line)' }} /><span>{m.key}</span></div></td><td className="mono text-[12px]" colSpan={3}>NA · not in this category's plan</td><td colSpan={2} /></tr>;
                const v = d(m); const late = m.actual && new Date(m.actual) > new Date(m.plan) ? Math.round((new Date(m.actual).getTime() - new Date(m.plan).getTime()) / 86400000) : 0;
                const overdue = !m.actual && new Date(m.revised ?? m.plan) < new Date();
                return <tr key={m.key}>
                  <td><div className="flex items-center gap-2"><span className="dot" style={{ background: m.actual ? (late ? 'var(--risk)' : 'var(--good)') : overdue ? 'var(--warn)' : 'var(--ink-faint)' }} /><span className="font-medium">{m.key}</span></div><div className="text-[10.5px] pl-4" style={{ color:'var(--ink-faint)' }}>{ROLE_LABEL[m.owner]}</div></td>
                  {editable ? <>
                    <td><Input type="date" value={dateInput(v.plan)} onChange={e => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], plan: fromDateInput(e.target.value) ?? m.plan } }))} style={{ width:132 }} /></td>
                    <td><Input type="date" value={dateInput(v.revised)} onChange={e => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], revised: fromDateInput(e.target.value) } }))} style={{ width:132 }} /></td>
                    <td><Input type="date" value={dateInput(v.actual)} onChange={e => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], actual: fromDateInput(e.target.value) } }))} style={{ width:132 }} /></td>
                    <td>{(v.revised && !v.actual) ? <Select value={v.delayReason ?? ''} onChange={val => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], delayReason: val || null } }))} options={[{ value:'', label:'— reason —' }, ...DELAY_REASONS.map(rz => ({ value:rz, label:rz }))]} /> : <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{m.delayReason ?? '—'}</span>}</td>
                    <td>{changed(m) && <Button size="sm" variant="primary" onClick={() => save(m)}>Save</Button>}</td>
                  </> : <>
                    <td className="mono text-[12px]" style={{ textDecoration: m.revised ? 'line-through' : undefined, color: m.revised ? 'var(--ink-faint)' : undefined }}>{fmtDate(m.plan)}</td>
                    <td className="mono text-[12px]" style={{ color:'var(--warn)' }}>{fmtDate(m.revised)}</td>
                    <td className="mono text-[12px]">{fmtDate(m.actual)}{late > 0 && <span className="pill risk ml-1">+{late}d</span>}</td>
                    <td className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{m.delayReason ?? '—'}</td><td />
                  </>}
                </tr>;
              }),
            ];
          })}
        </tbody>
      </table>
      <div className="text-[11.5px] py-2" style={{ color:'var(--ink-faint)' }}>An actual that lands late pushes every open step behind it by the same number of days. A revised date wants a reason — a moved cell without one is what makes a tracker untrustworthy.</div>
    </Section>
  );
}


/* ---------- RTW customer orders — the hub fulfils what the shelf cannot ------- */
function HubOrdersTab() {
  const { db, role, fulfilOrder } = useApp();
  const mine = role === 'production' || role === 'warehouse' || role === 'owner';
  const rows = hubOrders(db).map(o => ({ o, from: fulfilFromOf(db, o) })).sort((a, b) => a.o.promisedOn.localeCompare(b.o.promisedOn));
  const store = (id: string) => STORES.find(s => s.id === id)?.name ?? id;
  const toHem = rows.filter(r => r.o.hemLength != null && r.o.stage !== 'delivered').length;
  const toPick = rows.filter(r => r.o.stage === 'punched' && r.from === 'hub').length;
  const next = (o: typeof rows[number]['o']) => o.stage === 'punched' ? (o.hemLength != null ? 'Hem & dispatch' : 'Pick & dispatch') : 'Delivered';
  /* the hemming bench, which until now existed as a stage and a stat but never
     as a list of work: every bottom waiting on an inseam, oldest promise first */
  const hem = rows.filter(r => r.o.hemLength != null && ['punched', 'hemming'].includes(r.o.stage));
  const [only, setOnly] = useState<'all' | 'pick' | 'hem'>('all');
  const filtered = only === 'all' ? rows : only === 'hem' ? hem : rows.filter(r => r.o.stage === 'punched' && r.o.hemLength == null);
  /* one order per stage and source — to pick from the hub, on the bench, handed over by a store, delivered */
  const ex = useExamples(filtered, r => `${r.o.stage}·${r.from}`, { noun:'customer orders', done: r => r.o.stage === 'dispatched' || r.o.stage === 'ready' });
  const shown = ex.rows;
  return <>
    <div className="flex gap-3 items-center flex-wrap mb-3">
      <Seg value={only} onChange={setOnly} options={[
        { id:'all', label:'Everything', count: rows.length },
        { id:'pick', label:'To pick', count: rows.filter(r => r.o.stage === 'punched' && r.o.hemLength == null).length },
        { id:'hem', label:'The hemming bench', count: hem.length, hint:'bottoms waiting on an inseam before they can go out' },
      ]} />
      {only === 'hem' && hem.length > 0 && mine && <Button size="sm" variant="primary"
        onClick={() => hem.filter(r => r.o.stage === 'punched').forEach(r => fulfilOrder(r.o.id))}>
        Send all {hem.filter(r => r.o.stage === 'punched').length} to the bench</Button>}
      <span className="ml-auto flex items-center gap-3">{ex.strip}{only === 'hem' && <ExportButton filename="hemming-bench" rows={hem} cols={[
        { label:'Order', get: (r: typeof hem[number]) => r.o.orderNo },
        { label:'Customer', get: r => r.o.customer },
        { label:'Store', get: r => store(r.o.storeId) },
        { label:'Style', get: r => r.o.styleName },
        { label:'Size', get: r => r.o.size ?? '' },
        { label:'Inseam (in)', get: r => r.o.hemLength ?? '' },
        { label:'Promised', get: r => r.o.promisedOn },
        { label:'Stage', get: r => r.o.stage },
      ]} label="Export the bench list" />}</span>
    </div>
    {only === 'hem' && <div className="mb-3"><Note>The number beside each bottom is the inseam the bench cuts to, taken from the punch form at the store.</Note></div>}
    <Card><table className="t">
      <thead><tr><th>Order</th><th>Customer · store</th><th>Style · size</th><th>From</th><th>Punched</th><th>Promised</th><th>Stage</th><th></th></tr></thead>
      <tbody>{shown.length === 0 ? <tr><td colSpan={8}><Empty title={only === 'hem' ? 'Nothing on the hemming bench.' : 'Nothing to fulfil.'} body={only === 'hem' ? 'No bottoms are waiting on an inseam.' : 'RTW orders land here the moment a store or the website punches them.'} /></td></tr> : shown.map(({ o, from }) => { const late = daysAgo(o.promisedOn) > 0; return (
        <tr key={o.id}>
          <td className="mono text-[12.5px]">{o.orderNo}</td>
          <td className="text-[12.5px]">{o.customer}<div style={{ color:'var(--ink-faint)' }}>{store(o.storeId)}</div></td>
          <td className="text-[12.5px]">{o.styleName} · <b>{o.size}</b>{o.hemLength != null && <div className="mono text-[11.5px]" style={{ color:'var(--warn)' }}>hem to {o.hemLength}"</div>}</td>
          <td className="text-[12.5px]">{from === 'store' ? <Pill tone="good">store shelf</Pill> : <Pill tone="neutral">hub</Pill>}</td>
          <td className="text-[12.5px]">{fmtRel(o.punchedOn)}</td>
          <td style={{ color: late ? 'var(--risk)' : undefined }}>{fmtDate(o.promisedOn)}{late && <span className="text-[11px]"> · {daysAgo(o.promisedOn)}d late</span>}</td>
          <td><Pill tone={o.stage === 'punched' ? 'warn' : o.stage === 'hemming' ? 'info' : 'good'}>{o.stage === 'hemming' ? 'being hemmed' : o.stage}</Pill></td>
          <td>{mine && (from === 'hub' || o.stage !== 'punched') && <Button size="sm" variant={o.stage === 'punched' ? 'primary' : undefined} onClick={() => fulfilOrder(o.id)}>{next(o)} →</Button>}{from === 'store' && o.stage === 'punched' && <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>store hands over</span>}</td>
        </tr>); })}</tbody>
    </table></Card>
    <div className="mt-3"><Note>The unit holds the RTW stock and ships from here unless the store's own shelf has the size.</Note></div>
  </>;
}


/* ---------- the workbook's own columns, in its own six groups ----------------
   Production Tracker Final V2.xlsx → "Production Tracker" tab: Style Details,
   Order Qty Break-Up, Vendor Finalization, Fabric Details, Production
   Milestones (planned · revised · actual for all 22), Final Steps. Nothing is
   typed here — every cell is already on the record, so the sheet reads back. */
const SHEET_SIZES = ['28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
function SheetColumns({ rows, onOpen }: { rows: ProductionOrder[]; onOpen: (id: string) => void }) {
  const { db } = useApp();
  const v = (id: string | null) => db.vendors.find(x => x.id === id);
  const d = (s: string | null | undefined) => s ? fmtDate(s) : '';
  const groups: { label: string; span: number }[] = [
    { label:'Style details', span: 12 }, { label:'Order qty break-up', span: SHEET_SIZES.length + 1 }, { label:'Factory finalisation', span: 11 },
    { label:'Fabric details', span: 7 }, { label:'Production milestones · planned / revised / actual', span: MILESTONES.length }, { label:'Final steps', span: 7 },
  ];
  return <>
    <Card><div style={{ overflowX:'auto' }}><table className="t compact frozen" style={{ whiteSpace:'nowrap' }}>
      <thead>
        <tr>{groups.map(g => <th key={g.label} colSpan={g.span} style={{ background:'var(--surface-2)', borderLeft:'2px solid var(--line)' }}>{g.label}</th>)}</tr>
        <tr>
          <th>Category</th><th>Sub category</th><th>Style / colour</th><th>Shiphero style name</th><th>Programme</th><th>Launch month</th><th>Target inhouse</th><th>Fit</th><th className="num">Target FOB</th><th>Fabric ready</th><th>Trims ready</th><th>Style handover</th>
          {SHEET_SIZES.map(sz => <th key={sz} className="num">{sz}</th>)}<th className="num">Order qty</th>
          <th>Vendor</th><th>Region</th><th>Merchant</th><th>PO no.</th><th>PO date</th><th>PO status</th><th>BOM / job card</th><th>Costing target</th><th>Costing revised</th><th>Costing actual</th><th className="num">Final FOB</th>
          <th>Fabric vendor</th><th>Vendor fabric code</th><th>Enigma code</th><th className="num">Fabric CPM</th><th className="num">Fabric blocked</th><th className="num">Planned cons.</th><th className="num">Actual cons.</th>
          {MILESTONES.map(m => <th key={m}>{m}</th>)}
          <th>Status</th><th>Risk factor</th><th className="num">Cut qty</th><th>OTIF flag</th><th className="num">Delivered qty</th><th className="num">Planned lead</th><th className="num">Actual lead</th>
        </tr>
      </thead>
      <tbody>{rows.map(o => { const lt = leadTimesOf(o); const ot = otifOf(o); const r = riskOf(o); const byKey = (k: string) => o.milestones.find(m => m.key === k);
        return <tr key={o.id} className="row" onClick={() => onOpen(o.id)}>
          <td>{o.category}</td><td>{o.subCategory}</td><td className="font-medium">{o.styleName}</td><td style={{ color:'var(--ink-faint)' }}>{o.shipheroName}</td><td>{o.program ?? ''}</td><td>{o.launchMonth ?? ''}</td><td>{d(o.targetInhouse)}</td><td>{o.fit ?? ''}</td><td className="num">{o.targetCost}</td>
          <td style={{ color: o.fabricReady ? 'var(--good)' : 'var(--warn)' }}>{o.fabricReady ? 'Yes' : 'No'}</td><td style={{ color: o.trimsReady ? 'var(--good)' : 'var(--warn)' }}>{o.trimsReady ? 'Yes' : 'No'}</td><td>{d(o.styleHandover)}</td>
          {SHEET_SIZES.map(sz => { const q = o.sizeBreakup.find(x => x.size === sz)?.qty; return <td key={sz} className="num" style={{ color: q ? undefined : 'var(--line)' }}>{q ?? ''}</td>; })}
          <td className="num font-semibold">{o.orderQty}</td>
          <td>{v(o.vendorId)?.name ?? ''}</td><td>{v(o.vendorId)?.location ?? ''}</td><td>{o.merchant ?? ''}</td><td className="mono">{o.poNo ?? ''}</td><td>{d(o.poDate)}</td><td>{o.status}</td><td>{o.jobCardNo ?? ''}</td>
          <td>{d(o.costingClosure.plan)}</td><td>{d(o.costingClosure.revised)}</td><td>{d(o.costingClosure.actual)}</td><td className="num">{o.finalFob ?? ''}</td>
          <td>{v(o.fabricVendorId)?.name ?? ''}</td><td className="mono">{o.vendorFabricCode ?? ''}</td><td className="mono">{o.enigmaCode ?? ''}</td><td className="num">{o.costing.cpm ?? ''}</td><td className="num">{o.fabricBlocked ?? ''}</td><td className="num">{o.costing.consumption ?? ''}</td><td className="num">{o.costing.actualConsumption ?? ''}</td>
          {MILESTONES.map(k => { const m = byKey(k); if (!m) return <td key={k} style={{ color:'var(--line)' }}>NA</td>;
            return <td key={k} className="text-[11px]"><div style={{ color:'var(--ink-faint)' }}>{d(m.plan)}</div>{m.revised && <div style={{ color:'var(--warn)' }}>{d(m.revised)}</div>}<div style={{ color: m.actual ? 'var(--good)' : 'var(--line)' }}>{m.actual ? d(m.actual) : '—'}</div></td>; })}
          <td>{o.status}</td><td><Pill tone={RISK_TONE[r.risk]}>{r.risk.replace('-', ' ')}</Pill></td><td className="num">{o.cutQty ?? ''}</td><td><Pill tone={ot === 'OTIF' ? 'good' : ot === 'Pending' ? 'neutral' : 'risk'}>{ot}</Pill></td><td className="num">{o.deliveredQty ?? ''}</td><td className="num">{lt.planned}</td><td className="num">{lt.actual ?? ''}</td>
        </tr>; })}</tbody>
    </table></div></Card>
    <div className="mt-3"><Note>Every column of the workbook's first tab, read back from records each team already writes — click a row for the order.</Note></div>
  </>;
}


/* ---------- Config + Auto Plan Logic + Instructions & Legend ---------------------
   The three tabs of the workbook that are not rows: days from PO per milestone
   per category (what auto-populates every planned date), the risk thresholds,
   the in-full tolerance, and the legend. Saving re-plans open POs' planned
   dates that have no actual yet; revised and actual dates are never touched. */
function TrackerSettings() {
  const { db, role, setTrackerConfig } = useApp();
  const cfg = trackerConfig();
  const canEdit = role === 'production' || role === 'planning' || role === 'owner';
  const [off, setOff] = useState<Record<string, string[]>>(() => Object.fromEntries(GARMENT_CATEGORIES.map(c => [c, (cfg.offsets[c] ?? []).map(x => x == null ? '' : String(x))])));
  const [crit, setCrit] = useState(String(cfg.risk.criticalBufferDays)); const [atRisk, setAtRisk] = useState(String(cfg.risk.atRiskBufferDays)); const [tol, setTol] = useState(String(Math.round(cfg.otifTolerance * 100)));
  const [replan, setReplan] = useState(true);
  const build = () => ({ offsets: Object.fromEntries(GARMENT_CATEGORIES.map(c => [c, (MILESTONES as readonly string[]).map((_, i) => { const v = (off[c] ?? [])[i]; return v == null || v.trim() === '' ? null : Number(v); })])) as Record<GarmentCategory, (number | null)[]>, risk: { criticalBufferDays: Number(crit) || 7, atRiskBufferDays: Number(atRisk) || 10 }, otifTolerance: (Number(tol) || 3) / 100 });
  const dirty = JSON.stringify({ o: build().offsets, r: build().risk, t: build().otifTolerance }) !== JSON.stringify({ o: cfg.offsets, r: cfg.risk, t: cfg.otifTolerance });
  const logic = autoPlanLogicOf({ ...cfg, ...build(), updatedOn: null, updatedBy: null });
  const openN = db.orders.filter(o => o.status === 'Open').length;
  const faint = { color:'var(--ink-faint)' } as const;
  const [view, setView] = useState<'config' | 'logic' | 'legend'>('config');
  return <>
    <Card className="mb-3"><div className="flex items-center gap-3 flex-wrap px-3 py-2.5">
      <Seg value={view} onChange={v => setView(v as typeof view)} options={[{ id:'config', label:'Config · days from PO' }, { id:'logic', label:'Auto plan logic · stage durations' }, { id:'legend', label:'Instructions & legend' }]} />
      <span className="ml-auto text-[11.5px]" style={faint}>{cfg.updatedOn ? `last saved ${fmtRel(cfg.updatedOn)} by ${cfg.updatedBy}` : 'workbook defaults'}</span>
    </div></Card>

    {view === 'config' && <>
      <Card><div style={{ overflowX:'auto' }}><table className="t compact" style={{ whiteSpace:'nowrap' }}>
        <thead><tr><th>Milestone</th>{GARMENT_CATEGORIES.map(c => <th key={c} className="num">{c}</th>)}<th>Offset</th></tr></thead>
        <tbody>{(MILESTONES as readonly string[]).map((k, i) => <tr key={k}>
          <td className="font-medium">{k}</td>
          {GARMENT_CATEGORIES.map(c => { const v = (off[c] ?? [])[i] ?? ''; return <td key={c} className="num">{canEdit
            ? <Input type="number" min={0} value={v} placeholder="NA" onChange={e => setOff(o => ({ ...o, [c]: (o[c] ?? []).map((x, j) => j === i ? e.target.value : x) }))} style={{ width: 64, padding:'3px 6px', textAlign:'right', color: v === '' ? 'var(--ink-faint)' : undefined }} />
            : <span style={{ color: v === '' ? 'var(--line)' : undefined }}>{v === '' ? 'NA' : v}</span>}</td>; })}
          <td className="text-[11.5px]" style={faint}>days from PO date</td>
        </tr>)}</tbody>
      </table></div>
      <div className="grid gap-3 px-4 py-3" style={{ gridTemplateColumns:'repeat(3, minmax(0, 220px))', borderTop:'1px solid var(--line-soft)' }}>
        <Field label="Critical · buffer days ≤" hint="expected inhouse vs target"><Input type="number" min={0} value={crit} onChange={e => setCrit(e.target.value)} disabled={!canEdit} /></Field>
        <Field label="At risk · buffer days ≤"><Input type="number" min={0} value={atRisk} onChange={e => setAtRisk(e.target.value)} disabled={!canEdit} /></Field>
        <Field label="In-full tolerance · %" hint="delivered within ± this of cut qty"><Input type="number" min={0} max={50} value={tol} onChange={e => setTol(e.target.value)} disabled={!canEdit} /></Field>
      </div>
      {canEdit ? <div className="flex items-center gap-3 flex-wrap px-4 pb-3">
        <Button variant="primary" disabled={!dirty} onClick={() => setTrackerConfig(build(), replan)}>Save config</Button>
        <label className="text-[12.5px] flex items-center gap-1.5"><input type="checkbox" checked={replan} onChange={e => setReplan(e.target.checked)} /> re-plan the {openN} open POs’ planned dates that have no actual yet</label>
        <span className="text-[11.5px]" style={faint}>revised and actual dates are never touched; a blank cell means NA for that category</span>
      </div> : <div className="px-4 pb-3"><ActsBy role={['production', 'planning']} does="edits the lead times and thresholds; saving re-plans every open PO" inline /></div>}
      </Card>
      <div className="mt-3"><Note>This is the workbook’s Config tab. Every planned date on the tracker is PO date + these days; the risk word is the buffer against the target inhouse date; the OTIF verdict uses the tolerance. Change a number here and the tracker re-plots itself, instead of a formula being dragged down 300 rows.</Note></div>
    </>}

    {view === 'logic' && <>
      <Card><div style={{ overflowX:'auto' }}><table className="t compact" style={{ whiteSpace:'nowrap' }}>
        <thead><tr><th>Category</th><th className="num">Total lead time</th>{(MILESTONES as readonly string[]).map(k => <th key={k} className="num">{k}</th>)}</tr></thead>
        <tbody>{logic.map(r => <tr key={r.category}><td className="font-medium">{r.category}</td><td className="num font-semibold">{r.total} d</td>{r.steps.map(st => <td key={st.key} className="num" style={{ color: st.days == null ? 'var(--line)' : undefined }}>{st.days == null ? 'NA' : st.days}</td>)}</tr>)}</tbody>
      </table></div></Card>
      <div className="mt-3"><Note>The Auto Plan Logic tab, read off the config: days each stage takes after the one before it, and the whole lead time from PO to inhouse. Edit the config; this follows.</Note></div>
    </>}

    {view === 'legend' && <Card><div className="px-4 py-3 text-[12.5px]" style={{ display:'grid', gap: 6 }}>
      <div className="label">Sections of the tracker</div>
      {[['Style details', 'category, vendor, PO, style, pricing, readiness flags — from the design requirement'], ['Order qty break-up', 'size-wise quantities; order qty is the sum'], ['Factory finalisation', 'vendor, region, merchant, PO, BOM / job card, costing closure, final FOB'], ['Fabric details', 'fabric vendor, codes, CPM, blocked metres, planned and actual consumption'], ['Production milestones', 'yarn / fabric / trims, PPS and size set, knitting → interlock → cutting → stitching → finishing — planned, revised, actual'], ['Final steps', 'FI, dispatch, inhouse ETA, remarks, status, risk factor, cut and delivered qty, OTIF flag, lead times']].map(([k, v]) => <KV key={k} k={k} v={v} />)}
      <div className="label pt-2">Colour code</div>
      <div className="flex gap-4 flex-wrap"><span><span style={{ color:'var(--ink-faint)' }}>grey</span> planned · auto from PO date + config</span><span><span style={{ color:'var(--warn)' }}>amber</span> revised plan · a person moved it, with a reason</span><span><span style={{ color:'var(--good)' }}>green</span> actual · it happened</span><span><span style={{ color:'var(--risk)' }}>red</span> actual later than plan</span><span><span style={{ color:'var(--line)' }}>NA</span> not applicable for the category</span></div>
      <div className="label pt-2">Input rules</div>
      <KV k="Drop-downs" v="category, sub-category (depends on category), vendor, region, merchant, fit, PO status" />
      <KV k="Yes / No" v="fabric readiness and trims readiness" />
      <KV k="Flat knits" v="yarn PO and yarn ETA apply only to flat knits; NA otherwise" />
      <KV k="Status words" v="On Track · Delayed · At Risk · Completed — worked out, never typed" />
    </div></Card>}
  </>;
}
