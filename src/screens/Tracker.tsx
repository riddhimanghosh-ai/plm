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
import { iso, TODAY, cutFromFabric, leadTimesOf, otifOf, riskOf, stageOf, fmtDate, fmtMoney, daysAgo, fmtRel, costingOf, hubOrders, fulfilFromOf, trackerConfig, autoPlanLogicOf, rtwDocsOf, factoryStateOf, fabricStateOf, type Risk } from '../domain/engines';
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
import { StepFlow } from './Flow';
import { RtwRequirement } from './RtwRequirement';
import { rtwRowOf, rtwStatusOf, RTW_STATUSES } from '../domain/rtwJourney';
import type { DesignStep } from '../domain/engines';

export const RISK_TONE: Record<Risk, Tone> = { pending:'neutral', 'on-track':'good', watch:'warn', 'at-risk':'warn', critical:'risk', delayed:'risk', closed:'neutral' };

/* the last step logged, said the way the floor says it */
const PLAIN: Record<string, string> = { 'Yarn PO':'Yarn ordered', 'Fabric PO':'Fabric ordered', 'Yarn ETA':'Yarn in', 'Fabric ETA':'Fabric at factory', 'Trims ETA':'Trims in', 'PPS Submission':'Sample sent', 'PPS Approval':'Sample approved', 'Size Set Sub':'Size set sent', 'Size Set Appvl':'Size set approved', FI:'Final inspection done', Dispatch:'Dispatched', 'Inhouse ETA':'Arrived' };
const plainStep = (k: string) => PLAIN[k] ?? (k.endsWith(' Start') ? `${k.slice(0, -6)} underway` : k.endsWith(' End') ? `${k.slice(0, -4)} done` : k);
/* one status per row: where it is now, and only if it is late, by how much */
const LATE = ['delayed', 'critical', 'at-risk', 'watch'];
function statusOf(o: ProductionOrder, r: ReturnType<typeof riskOf>, s: { stage: string }): { text: string; tone: Tone } {
  if (o.status === 'Closed') { const landed = o.milestones.find(m => m.key === 'Inhouse ETA')?.actual ?? o.milestones.find(m => m.key === 'Dispatch')?.actual ?? null; const late = landed ? Math.round((new Date(landed).getTime() - new Date(o.targetInhouse).getTime()) / 86400000) : 0;
    return { text: `Delivered${landed ? ` ${fmtDate(landed)}` : ''}${late > 0 ? ` · ${late}d late` : ''}`, tone: late > 0 ? 'warn' : 'good' }; }
  if (!o.poNo) return { text: s.stage.replace('No PO yet · ', 'Before the PO · '), tone: 'neutral' };
  const where = s.stage.endsWith(' done') ? plainStep(s.stage.slice(0, -5)) : s.stage;
  const late = r.bufferDays != null && r.bufferDays < 0 ? -r.bufferDays : 0;
  return { text: late ? `${where} · ${late}d late` : where, tone: late || r.risk === 'delayed' || r.risk === 'critical' ? 'risk' : LATE.includes(r.risk) ? 'warn' : 'good' };
}

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
  const garment = db.orders.filter(o => ['Requirement', 'Quoting', 'Allocated', 'Open', 'Closed'].includes(o.status));
  /* the questions this table is actually opened with: whose is it, who is
     making it, where has it got to, and what is on fire */
  const [vendor, setVendor] = useState('all');
  const [status, setStatus] = useState<string>('all');
  const [only, setOnly] = useState('all');
  const [search, setSearch] = useState('');
  const inTab = garment.map(o => ({ o, r: riskOf(o), j: rtwRowOf(db, o), st: rtwStatusOf(db, o) }))
    .sort((a, b) => a.st.i - b.st.i || a.o.targetInhouse.localeCompare(b.o.targetInhouse));
  const vendors = [...new Set(inTab.map(x => x.o.vendorId).filter(Boolean))]
    .map(id => ({ id: id!, name: db.vendors.find(v => v.id === id)?.name ?? id! })).sort((a, b) => a.name.localeCompare(b.name));
  const nStatus = (k: string) => inTab.filter(x => x.st.key === k).length;
  const rows = inTab.filter(x => {
    if (status !== 'all' && x.st.key !== status) return false;
    if (merchant !== 'all' && x.o.merchant !== merchant) return false;
    if (vendor !== 'all' && x.o.vendorId !== vendor) return false;
    if (only === 'mine' && x.j.next?.act !== 'production') return false;
    if (only === 'late' && !x.j.late) return false;
    const t = search.trim().toLowerCase();
    if (t && !(x.o.styleName.toLowerCase().includes(t) || (x.o.poNo ?? '').toLowerCase().includes(t))) return false;
    return true;
  });
  const active = db.orders.find(o => o.id === openId) ?? null;
  const ex = useExamples(rows, x => x.st.key, { perGroup: 2, noun:'styles' });
  const pager = usePager(ex.rows, 25);
  const faint = { color:'var(--ink-faint)' } as const;

  return (
    <Page title="RTW production tracker" lede="Every RTW style from the day design requests it to the day it launches: one table, filtered by where it has got to."
      replaces="Production Tracker Final V2.xlsx — 128 columns opened by six teams, plus the Daily Monitor and Alert Dashboard tabs beside it"
      actions={<div className="flex gap-3 items-center text-[12.5px]">
        <button className="vlink" onClick={() => set('tab', tab === 'settings' ? null : 'settings')}>{tab === 'settings' ? '← the tracker' : 'Lead times & risk'}</button>
        {tab !== 'settings' && <button className="vlink" onClick={() => set('view', view === 'sheet' ? null : 'sheet')}>{view === 'sheet' ? 'Summary' : 'As the sheet'}</button>}
        <ExportButton filename="rtw-production-tracker" rows={rows} cols={[
          { label:'PO', get: (x: typeof rows[number]) => x.o.poNo ?? '' },
          { label:'Style', get: x => x.o.styleName },
          { label:'Category', get: x => x.o.category },
          { label:'Factory', get: x => db.vendors.find(v => v.id === x.o.vendorId)?.name ?? '' },
          { label:'Merchant', get: x => x.o.merchant },
          { label:'Qty', get: x => x.o.orderQty },
          { label:'Status', get: x => x.st.label },
          { label:'Where it is', get: x => x.j.where },
          { label:'Next', get: x => x.j.next?.now ?? 'done' },
          { label:'Due in-house', get: x => x.o.targetInhouse },
        ]} />
      </div>}>

      {tab === 'settings' ? <TrackerSettings /> : <>
        <Card className="mb-3"><div className="px-3 py-2.5 flex flex-col gap-2">
          <Seg value={status} onChange={setStatus} options={[{ id:'all', label:'All', count: inTab.length }, ...RTW_STATUSES.map(s => ({ id: s.key, label: s.label, count: nStatus(s.key), hint: s.hint }))]} />
          <div className="flex items-center gap-2 flex-wrap">
            <Seg value={only} onChange={setOnly} options={[{ id:'all', label:'Everything' }, { id:'mine', label:'Waiting on me', count: inTab.filter(x => x.j.next?.act === 'production').length }, { id:'late', label:'Running late', count: inTab.filter(x => x.j.late).length }]} />
            <Select value={vendor} onChange={setVendor} style={{ width:'auto' }} options={[{ value:'all', label:`Every factory · ${vendors.length}` }, ...vendors.map(v => ({ value:v.id, label:v.name }))]} />
            <Select value={merchant} onChange={setMerchant} style={{ width:'auto' }} options={[{ value:'all', label:'Every merchandiser' }, ...MERCHANDISERS.map(m => ({ value:m, label:m }))]} />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="style or PO number" style={{ width:190 }} />
            {(vendor !== 'all' || status !== 'all' || only !== 'all' || search.trim() || merchant !== 'all') &&
              <Button size="sm" variant="ghost" onClick={() => { setVendor('all'); setStatus('all'); setOnly('all'); setSearch(''); setMerchant('all'); }}>Clear</Button>}
            <span className="ml-auto">{ex.strip}</span>
          </div>
        </div></Card>

        {view === 'sheet' ? <SheetColumns rows={ex.rows.map(x => x.o)} onOpen={id => set('open', id)} /> : rows.length === 0 ? <Card><Empty title="Nothing matches those filters." body="Loosen one of them, or clear the search." /></Card> : <Card>
          <table className="t">
            <thead><tr><th>PO</th><th>Style</th><th className="num">Pcs</th><th>Factory</th><th>Status</th><th>Where it is</th><th>Next</th><th>Due in-house</th></tr></thead>
            <tbody>{pager.pageRows.map(({ o, r, j, st }) => (
              <tr key={o.id} className="row" onClick={() => set('open', o.id)}>
                <td className="mono text-[12.5px]" style={{ whiteSpace:'nowrap' }}>{o.poNo ?? <span className="text-[12px]" style={{ ...faint, fontFamily:'var(--body)' }}>no PO yet</span>}</td>
                <td><div className="font-medium">{o.styleName}</div><div className="text-[11.5px]" style={faint}>{o.category}{o.merchant ? ` · ${o.merchant}` : ''}</div></td>
                <td className="num">{o.orderQty}</td>
                <td className="text-[12.5px]">{o.vendorId ? <VendorLink id={o.vendorId}>{vendorName(o.vendorId)}</VendorLink> : (() => { const f = factoryStateOf(o); return f.accepted ? <span style={faint}>{vendorName(f.accepted.vendorId)} · PO to raise</span> : <span style={faint}>—</span>; })()}</td>
                <td><Pill tone={j.tone}>{st.label}</Pill></td>
                <td className="text-[12.5px]">{j.where}</td>
                <td className="text-[12.5px]">{j.next ? <>{j.next.now}{j.next.act === 'production' && <span className="pill role-production ml-1">you</span>}</> : <span style={faint}>done</span>}</td>
                <td style={{ whiteSpace:'nowrap' }}>{fmtDate(o.targetInhouse)}{r.bufferDays != null && o.status !== 'Closed' && <div className="text-[11px]" style={{ color: r.bufferDays < 0 ? 'var(--risk)' : 'var(--ink-faint)' }}>{r.bufferDays < 0 ? `${-r.bufferDays}d late` : `${r.bufferDays}d to spare`}</div>}</td>
              </tr>))}</tbody>
          </table>
          <Pager page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} from={pager.from} to={pager.to} total={pager.total} noun="styles" />
        </Card>}
      </>}

      <Drawer open={!!active} onClose={() => set('open', null)} title={active?.poNo ?? active?.styleName ?? ''} subtitle={active && <><Pill tone={RISK_TONE[riskOf(active).risk]}>{riskOf(active).risk.replace('-', ' ')}</Pill><span>{active.styleName} · {vendorName(active.vendorId)} · {active.merchant}</span></>}>
        {active && <RtwRequirement key={active.id} o={active} />}
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
  /* the four steps of the tracker sheet as connected blocks; only the one clicked is open below */
  const flowSteps: DesignStep[] = [
    { key:'request', label:'Request from design', state: o.status !== 'Requirement' ? 'done' : 'later', owner:'design', note: docs.missing.length ? `${docs.missing.length} document${docs.missing.length === 1 ? '' : 's'} missing` : `${o.orderQty} pcs · in-house by ${fmtDate(o.targetInhouse)}` },
    { key:'fabric-po', label:'Fabric sourcing', state: !o.fabricNominated || o.sourcing?.fabricPo ? 'done' : 'later', owner: 'sourcing', note: !o.fabricNominated ? 'the factory buys its own cloth' : o.sourcing?.fabricPo ? `${o.sourcing.fabricPo.no} · ${o.sourcing.fabricPo.metres} m` : o.status === 'Requirement' ? 'starts when the request is sent' : 'vendor → design pushes the fabric PO' },
    { key:'vendors', label:'Factory finalisation', state: o.poNo ? 'done' : 'later', owner: (fst.owner === 'merchandiser' ? 'production' : fst.owner) as RoleId, note: fst.label },
    { key:'fabric-in', label:'Fabric to the factory', state: fab.key === 'received' || fab.key === 'vendor-sources' ? 'done' : 'later', owner: (fab.owner === 'merchandiser' ? 'production' : fab.owner) as RoleId, note: fab.label },
    { key:'live', label:'TNA & final steps', state: o.status === 'Closed' ? 'done' : 'later', owner:'production', note: o.poNo ? `${s.stage}${r.bufferDays != null && r.bufferDays < 0 ? ` · ${-r.bufferDays}d late` : ''}` : 'after the PO' },
  ];
  { const ni = flowSteps.findIndex(x => x.state !== 'done'); if (ni >= 0) flowSteps[ni] = { ...flowSteps[ni], state:'now' }; }
  const KEYS: Record<string, 'request' | 'sourcing' | 'factory' | 'fabric' | 'tna'> = { request:'request', 'fabric-po':'sourcing', vendors:'factory', 'fabric-in':'fabric', live:'tna' };
  const nowStep = flowSteps.find(x => x.state === 'now') ?? flowSteps[flowSteps.length - 1];
  const [picked, setPicked] = useState<'request' | 'sourcing' | 'factory' | 'fabric' | 'tna' | null>(null);
  const shown = picked ?? KEYS[nowStep.key];
  return <>
    <Card className="mb-3"><div className="px-4 py-3"><StepFlow steps={flowSteps} onJump={k => setPicked(KEYS[k])} active={(Object.keys(KEYS) as DesignStep['key'][]).find(k => KEYS[k] === shown)} /></div></Card>
    {/* ── 1 · Style details + order qty break-up — the sheet's first two sections, design and planning ── */}
    {shown === 'request' && <Section collapsible={false} title="Request from design" pending={false} ownerRole="design"
      right={<div className="flex gap-2 items-center"><Pill tone={docs.missing.length ? (o.poNo ? 'risk' : 'warn') : 'good'}>{docs.missing.length ? `${docs.missing.length} document${docs.missing.length === 1 ? '' : 's'} missing` : 'complete'}</Pill></div>}>
      <KV k="Category" v={o.category} />
      <KV k="Sub category" v={o.subCategory} />
      <KV k="Style / colour" v={o.styleName} />
      <KV k="Shiphero style name" v={o.shipheroName ?? '—'} />
      <KV k="Programme name" v={o.program ?? '—'} />
      <KV k="Launch month" v={o.launchMonth ?? '—'} />
      <KV k="Target inhouse date" v={fmtDate(o.targetInhouse)} />
      <KV k="Fit" v={o.fit ?? '—'} />
      <KV k="Target FOB price" v={fmtMoney(o.targetCost)} note="per piece" />
      <KV k="Fabric readiness" v={yesNo(fabricReady)} note={fabricReady ? (o.fabricSupply?.receipt ? `counted in at the factory ${fmtDate(o.fabricSupply.receipt.on)}` : undefined) : fab.label} />
      <KV k="Trims readiness" v={yesNo(trimsReady)} note={trimsReady && o.materialsCovered ? `covered by sourcing ${fmtDate(o.materialsCovered.on)}` : undefined} />
      <KV k="Style handover date" v={fmtDate(o.styleHandover)} note={`${daysAgo(o.styleHandover)}d ago`} />
      <div className="label pt-2">Order qty break-up{(o.cutRatios ?? []).some(c => c.given) ? ' · current cut ratio' : ''}</div>
      <SizeGrid breakup={o.sizeBreakup} />
      {(o.cutRatios ?? []).filter(c => c.given).map((c, i) => <div key={i} className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>originally {c.originalBreakup.filter(x => x.qty).map(x => `${x.size}:${x.qty}`).join(' ')} · changed {fmtDate(c.given!.on)} because {c.reason}</div>)}
    </Section>}

    {/* ── 2 · Factory finalisation — the sheet's columns, then the proposal loop ── */}
    {shown === 'factory' && <Section collapsible={false} title="Factory finalisation" ownerRole={fst.owner === 'merchandiser' ? 'production' : fst.owner}
      right={<Pill tone={fst.tone}>{fst.label}</Pill>}>
      <FactoryFinalisationSection o={o} bare columns={<>
        <KV k="Factory" v={o.vendorId ? <VendorLink id={o.vendorId}>{vendorName(o.vendorId)}</VendorLink> : '—'} />
        <KV k="Region" v={db_vendor_loc(o.vendorId) || '—'} />
        {mine('production') ? <ExecutionEditor o={o} /> : <KV k="Merchant" v={o.merchant ?? '—'} />}
        <KV k="PO No." v={o.poNo ?? '—'} note={o.poNo ? undefined : 'after design raises the factory PO'} />
        <KV k="PO date" v={fmtDate(o.poDate)} />
        <KV k="PO status" v={o.poNo ? o.status : '—'} />
        <KV k="BOM / Jobcard" v={o.jobCardNo ?? (o.bom.length ? `${o.bom.length} BOM lines` : '—')} note={docs.owedAfterPo.length ? `owed to the factory: ${docs.owedAfterPo.join(', ')}` : undefined} />
        {!mine('production') && <>
        <KV k="Costing closure target" v={fmtDate(o.costingClosure.plan)} />
        <KV k="Costing closure revised plan" v={o.costingClosure.revised ? fmtDate(o.costingClosure.revised) : '—'} />
        <KV k="Costing closure actual" v={o.costingClosure.actual ? fmtDate(o.costingClosure.actual) : '—'} />
        <KV k="Final FOB cost (₹ / $)" v={o.finalFob != null ? fmtMoney(o.finalFob) : '—'} note={o.finalFob != null ? `target ${fmtMoney(o.targetCost)}` : undefined} /></>}
        <div className="pt-2" style={{ borderTop:'1px solid var(--line-soft)' }} />
      </>} />
    </Section>}

    {/* ── 3 · Fabric details — the sheet's columns, then bought · sent · counted in · cut ratio ── */}
    {shown === 'fabric' && <Section collapsible={false} title="Fabric to the factory" ownerRole={fab.owner === 'merchandiser' ? 'production' : fab.owner}
      right={<Pill tone={fab.tone}>{fab.label}</Pill>}>
      {o.sourcing?.fabricPo || !o.fabricNominated ? <FabricFinalisationSection o={o} bare part="factory" /> : <div className="py-1 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>After the fabric PO and the factory PO: sourcing sends the cloth, the factory counts it in, short cloth comes back to design for a cut ratio.</div>}
    </Section>}

    {shown === 'sourcing' && <Section collapsible={false} title="Fabric sourcing · fabric details" ownerRole="sourcing"
      right={<Pill tone={o.sourcing?.fabricPo ? 'good' : 'warn'}>{o.sourcing?.fabricPo ? 'fabric PO raised' : 'vendor → fabric PO'}</Pill>}>
      <FabricFinalisationSection o={o} bare part="sourcing" columns={(() => { const fromPo = o.sourcing?.fabricPo ? undefined : 'fills in from the fabric PO'; return <>
        <KV k="Fabric vendor" v={o.fabricVendorId ? <VendorLink id={o.fabricVendorId}>{vendorName(o.fabricVendorId)}</VendorLink> : '—'} note={o.fabricVendorId ? undefined : fromPo} />
        <KV k="Vendor fabric code" v={o.vendorFabricCode ?? '—'} note={o.vendorFabricCode ? undefined : fromPo} />
        <KV k="Enigma code" v={o.enigmaCode ?? '—'} note={o.enigmaCode ? undefined : fromPo} />
        <KV k="Fabric CPM" v={o.costing.cpm != null ? `₹${o.costing.cpm}/m` : '—'} note={o.costing.cpm != null ? undefined : fromPo} />
        <KV k="Fabric blocked" v={o.fabricBlocked != null ? `${o.fabricBlocked} m` : '—'} note={o.fabricBlocked != null ? (o.fabricMetres != null ? `${o.fabricMetres} m needed` : undefined) : fromPo} />
        <KV k="Planned consumption (mtrs)" v={o.costing.consumption != null ? `${o.costing.consumption} m/pc` : '—'} />
        <KV k="Actual consumption (mtrs)" v={o.costing.actualConsumption != null ? `${o.costing.actualConsumption} m/pc` : '—'} note={o.costing.actualConsumption != null ? undefined : 'after cutting'} />
        <div className="pt-2" style={{ borderTop:'1px solid var(--line-soft)' }} />
      </>; })()} />
    </Section>}

    {/* ── 4 · Production milestones / TNA + Final steps ── */}
    {shown === 'tna' && <Section collapsible={false} title="TNA milestones & final steps" ownerRole="production"
      right={<Pill tone={o.poNo ? RISK_TONE[r.risk] : 'neutral'}>{o.poNo ? r.risk.replace('-', ' ') : 'after the PO'}</Pill>}>
      {!o.poNo ? <div className="py-1 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>The milestones are generated from the PO date once design raises the PO.</div> : <>
        <MilestoneGrid o={o} editable={mine('production') || mine('merchandiser')} bare />
        <div className="label pt-3">Final steps</div>
        <KV k="Remarks" v={o.remarks || '—'} />
        <KV k="Status" v={o.status} />
        <KV k="Risk factor" v={<Pill tone={RISK_TONE[r.risk]}>{r.risk.replace('-', ' ')}</Pill>} note={r.bufferDays != null ? `${r.bufferDays}d buffer · expected ${fmtDate(r.expectedInhouse)}` : undefined} />
        <KV k="Cut qty" v={o.cutQty ?? '—'} note={cutFromFabric(o) != null ? `fabric blocked would cut about ${cutFromFabric(o)}` : undefined} />
        <KV k="OTIF flag" v={<Pill tone={ot === 'OTIF' ? 'good' : ot === 'Pending' ? 'neutral' : 'risk'}>{ot}</Pill>} />
        <KV k="Delivered qty" v={o.deliveredQty ?? '—'} note={o.rejectedQty ? `${o.rejectedQty} rejected` : undefined} />
        <KV k="Planned lead time" v={`${lt.planned}d`} />
        <KV k="Actual lead time" v={lt.actual != null ? `${lt.actual}d` : '—'} note={lt.actual != null ? (lt.actual > lt.planned ? `${lt.actual - lt.planned}d longer than planned` : 'at or under plan') : undefined} />
      </>}
    </Section>}

    {/* ── files · conversation · activity ── */}
    <RecordTail kind="order" subjectId={o.id} labels={FILE_LABELS.order} editable steps={ORDER_STEPS} activity={o.activity} />
    {defaultStep && null}
  </>;
}

/* the sheet's execution columns, edited in place by production once the PO is out */
function ExecutionEditor({ o }: { o: ProductionOrder }) {
  const { updateExecution } = useApp();
  const [merchant, setMerchant] = useState(o.merchant ?? ''); const [jc, setJc] = useState(o.jobCardNo ?? '');
  const [plan, setPlan] = useState(dateInput(o.costingClosure.plan)); const [rev, setRev] = useState(dateInput(o.costingClosure.revised)); const [act, setAct] = useState(dateInput(o.costingClosure.actual));
  const [fob, setFob] = useState(o.finalFob != null ? String(o.finalFob) : '');
  const dirty = merchant !== (o.merchant ?? '') || jc !== (o.jobCardNo ?? '') || plan !== dateInput(o.costingClosure.plan) || rev !== dateInput(o.costingClosure.revised) || act !== dateInput(o.costingClosure.actual) || fob !== (o.finalFob != null ? String(o.finalFob) : '');
  return <div className="py-2">
    <div className="grid gap-2.5" style={{ gridTemplateColumns:'repeat(3, 1fr)' }}>
      <Field label="Merchant"><Select value={merchant} onChange={setMerchant} options={[{ value:'', label:'— unassigned —' }, ...MERCHANDISERS.map(m => ({ value:m, label:m }))]} /></Field>
      <Field label="BOM / Jobcard no."><Input value={jc} onChange={e => setJc(e.target.value)} placeholder={o.bom.length ? `${o.bom.length} BOM lines` : 'BOM 337'} /></Field>
      <Field label="Final FOB cost · ₹/pc" hint={`target ${fmtMoney(o.targetCost)}`}><Input type="number" value={fob} onChange={e => setFob(e.target.value)} /></Field>
      <Field label="Costing closure target"><Input type="date" value={plan} onChange={e => setPlan(e.target.value)} /></Field>
      <Field label="Costing closure revised plan"><Input type="date" value={rev} onChange={e => setRev(e.target.value)} /></Field>
      <Field label="Costing closure actual"><Input type="date" value={act} onChange={e => setAct(e.target.value)} /></Field>
    </div>
    <div className="pt-2"><Button size="sm" variant="primary" disabled={!dirty} onClick={() => updateExecution(o.id, { merchant: merchant || null, jobCardNo: jc.trim() || null, finalFob: fob === '' ? null : Number(fob), costingClosure: { plan: fromDateInput(plan), revised: fromDateInput(rev), actual: fromDateInput(act) } })}>Save</Button>
      <span className="text-[11.5px] pl-2" style={{ color:'var(--ink-faint)' }}>Factory, PO number, date and status come from the PO design raised.</span></div>
  </div>;
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

/* The TNA as a flow: blocks connected left to right, then down and back right to left,
   the way a process chart reads. Each block is one milestone with its plan, revised and
   actual dates and its state; click a block to log a date. The sheet's three columns
   (Plan | Revised | Actual) stay in a "Table" view for anyone who wants them side by side. */
type FlowState = 'done' | 'late' | 'overdue' | 'now' | 'pending';
function flowStateOf(m: Milestone, isNext: boolean): { state: FlowState; late: number } {
  const late = m.actual && new Date(m.actual) > new Date(m.plan) ? Math.round((new Date(m.actual).getTime() - new Date(m.plan).getTime()) / 86400000) : 0;
  if (m.actual) return { state: late ? 'late' : 'done', late };
  if (new Date(m.revised ?? m.plan) < new Date()) return { state: 'overdue', late };
  return { state: isNext ? 'now' : 'pending', late };
}
const FLOW_COLOR: Record<FlowState, string> = { done: 'var(--good)', late: 'var(--risk)', overdue: 'var(--warn)', now: 'var(--accent)', pending: 'var(--line)' };
const FLOW_LABEL: Record<FlowState, string> = { done: 'done', late: 'done late', overdue: 'past plan, nothing logged', now: 'next up', pending: 'planned' };

export function MilestoneGrid({ o, editable, bare }: { o: ProductionOrder; editable: boolean; bare?: boolean }) {
  const { setMilestone, skipMilestone } = useApp();
  const [view, setView] = useState<'flow' | 'table'>('flow');
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<Milestone>>>({});
  const d = (m: Milestone) => ({ ...m, ...draft[m.key] });
  const changed = (m: Milestone) => !!draft[m.key] || !!(m as Milestone & { na?: boolean }).na;
  const save = (m: Milestone) => { const p = draft[m.key] ?? ((m as Milestone & { na?: boolean }).na ? { plan: iso(TODAY) } : undefined); if (!p) return; setMilestone(o.id, m.key, p); setDraft(x => { const n = { ...x }; delete n[m.key]; return n; }); };
  /* every block the sheet has, in its order: the ones the category's plan leaves out are greyed, and so are the ones marked not needed */
  const steps = allSteps(o); const live = steps; const na = steps.filter(m => m.na);
  const nextKey = live.find(m => !m.actual && !m.na)?.key ?? null;
  const COLS = 4; const rows: typeof live[] = []; for (let i = 0; i < live.length; i += COLS) rows.push(live.slice(i, i + COLS));
  const faint = { color: 'var(--ink-faint)' } as const;
  const editing = open ? live.find(m => m.key === open) ?? null : null;

  const editor = (m: Milestone) => { const v = d(m); return <div className="mt-3 p-3" style={{ border: '1px solid var(--accent)', borderRadius: 8, background: 'color-mix(in srgb, var(--accent) 5%, #fff)' }}>
    <div className="flex items-center gap-2 mb-2"><span className="font-medium">{m.key}</span><span className="text-[11.5px]" style={faint}>{ROLE_LABEL[m.owner]} · {m.stage.replace('-', ' ')}</span><button className="ml-auto text-[12px]" style={faint} onClick={() => setOpen(null)}>close ×</button></div>
    {editable ? <div className="flex flex-wrap gap-2 items-end">
      <Field label="Plan"><Input type="date" value={dateInput(v.plan)} onChange={e => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], plan: fromDateInput(e.target.value) ?? m.plan } }))} style={{ width: 140 }} /></Field>
      <Field label="Revised"><Input type="date" value={dateInput(v.revised)} onChange={e => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], revised: fromDateInput(e.target.value) } }))} style={{ width: 140 }} /></Field>
      <Field label="Actual"><Input type="date" value={dateInput(v.actual)} onChange={e => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], actual: fromDateInput(e.target.value) } }))} style={{ width: 140 }} /></Field>
      <Field label="Why it moved"><Select value={v.delayReason ?? ''} onChange={val => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], delayReason: val || null } }))} options={[{ value: '', label: '— reason —' }, ...DELAY_REASONS.map(rz => ({ value: rz, label: rz }))]} /></Field>
      <Button size="sm" variant="primary" disabled={!changed(m)} onClick={() => { save(m); setOpen(null); }}>{(m as Milestone & { na?: boolean }).na ? 'Add to this PO\'s plan' : 'Save'}</Button>
      {!(m as Milestone & { na?: boolean }).na && <Button size="sm" variant={m.skipped ? undefined : 'ghost'} onClick={() => { skipMilestone(o.id, m.key, !m.skipped); setOpen(null); }}>{m.skipped ? 'Needed after all' : 'Not needed for this PO'}</Button>}
    </div> : <div className="flex gap-4 text-[12.5px]"><span><span style={faint}>Plan </span>{fmtDate(m.plan)}</span><span><span style={faint}>Revised </span>{fmtDate(m.revised)}</span><span><span style={faint}>Actual </span>{fmtDate(m.actual)}</span><span><span style={faint}>Why </span>{m.delayReason ?? '—'}</span></div>}
    <div className="text-[11.5px] pt-2" style={faint}>An actual that lands late pushes every open step behind it by the same number of days. A revised date wants a reason.</div>
  </div>; };

  const flow = <>
    <div className="flex items-center gap-3 mb-2 text-[11.5px]" style={faint}>
      {(['done', 'late', 'overdue', 'now', 'pending'] as FlowState[]).map(st => <span key={st} className="flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 3, background: FLOW_COLOR[st], display: 'inline-block' }} />{FLOW_LABEL[st]}</span>)}
      {na.length > 0 && <span className="ml-auto">{na.length} greyed: not in this category's plan · click one to add it</span>}
      <span className={na.length ? '' : 'ml-auto'}><Seg options={[{ id: 'flow', label: 'Flow' }, { id: 'table', label: 'Table' }]} value={view} onChange={setView} /></span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, columnGap: 28, rowGap: 26 }}>
      {rows.flatMap((row, ri) => { const rev = ri % 2 === 1; const cells = rev ? [...row].reverse() : row; const pad = COLS - row.length;
        const items = cells.map((m, ci) => { const idx = ri * COLS + (rev ? row.length - 1 - ci : ci); const { state, late } = flowStateOf(m, m.key === nextKey); const isLastInRow = rev ? ci === 0 : ci === row.length - 1; const hasNext = idx < live.length - 1; const col = FLOW_COLOR[state];
          const hArrow = hasNext && !isLastInRow; const vArrow = hasNext && isLastInRow; const selected = open === m.key;
          return <div key={m.key} style={{ position: 'relative', gridColumn: rev ? ci + 1 + pad : undefined }}>
            <button onClick={() => setOpen(selected ? null : m.key)} className="text-left w-full" style={{ opacity: m.na || m.skipped ? .5 : 1, border: `1.5px solid ${state === 'pending' || m.skipped ? 'var(--line)' : col}`, boxShadow: selected ? `0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent)` : undefined, borderRadius: 8, padding: '8px 10px', background: state === 'now' ? 'color-mix(in srgb, var(--accent) 7%, #fff)' : state === 'done' ? 'color-mix(in srgb, var(--good) 6%, #fff)' : '#fff', minHeight: 78, cursor: 'pointer' }}>
              <div className="flex items-center gap-2"><span className="mono text-[10px]" style={{ color: state === 'pending' ? 'var(--ink-faint)' : col, fontWeight: 700 }}>{String(idx + 1).padStart(2, '0')}</span><span className="font-medium text-[12.5px] truncate">{m.key}</span>{late > 0 && <span className="pill risk ml-auto" style={{ fontSize: 10 }}>+{late}d</span>}{state === 'now' && <span className="pill accent ml-auto" style={{ fontSize: 10 }}>next</span>}{state === 'overdue' && <span className="pill warn ml-auto" style={{ fontSize: 10 }}>overdue</span>}</div>
              <div className="text-[10.5px] mt-0.5" style={faint}>{ROLE_LABEL[m.owner]}</div>
              <div className="mono text-[11px] mt-1 flex gap-2 flex-wrap">
                {!m.na && !m.skipped && <span style={{ textDecoration: m.revised ? 'line-through' : undefined, color: m.revised || m.actual ? 'var(--ink-faint)' : undefined }}>{fmtDate(m.plan)}</span>}
                {m.revised && !m.actual && <span style={{ color: 'var(--warn)' }}>→ {fmtDate(m.revised)}</span>}
                {m.skipped ? <span style={{ color: 'var(--ink-faint)', fontWeight: 600 }}>not needed</span> : m.na ? <span style={{ color: 'var(--ink-faint)' }}>not in this plan</span> : m.actual && <span style={{ color: late ? 'var(--risk)' : 'var(--good)', fontWeight: 600 }}>✓ {fmtDate(m.actual)}</span>}
              </div>
              {m.delayReason && <div className="text-[10.5px] mt-0.5 truncate" style={{ color: 'var(--warn)' }}>{m.delayReason}</div>}
            </button>
            {hArrow && <span style={{ position: 'absolute', top: '50%', [rev ? 'left' : 'right']: -28, width: 28, height: 0, borderTop: `2px solid ${col}`, transform: 'translateY(-1px)' }}><span style={{ position: 'absolute', top: -5, [rev ? 'left' : 'right']: -1, borderTop: '4.5px solid transparent', borderBottom: '4.5px solid transparent', [rev ? 'borderRight' : 'borderLeft']: `7px solid ${col}` }} /></span>}
            {vArrow && <span style={{ position: 'absolute', left: '50%', bottom: -26, height: 26, width: 0, borderLeft: `2px solid ${col}`, transform: 'translateX(-1px)' }}><span style={{ position: 'absolute', bottom: -1, left: -5, borderLeft: '4.5px solid transparent', borderRight: '4.5px solid transparent', borderTop: `7px solid ${col}` }} /></span>}
          </div>; });
        return items; })}
    </div>
    {editing && editor(editing)}
    {!editing && <div className="text-[11.5px] pt-3" style={faint}>Reads left to right, then down and back. Click a block to {editable ? 'log its actual or revised date' : 'see its dates'}.</div>}
  </>;

  const table = <>
    <div className="flex items-center mb-2"><span className="ml-auto"><Seg options={[{ id: 'flow', label: 'Flow' }, { id: 'table', label: 'Table' }]} value={view} onChange={setView} /></span></div>
    <table className="t">
      <thead><tr><th style={{ width: '26%' }}>Milestone</th><th>Plan</th><th>Revised</th><th>Actual</th><th>Why it moved</th><th></th></tr></thead>
      <tbody>
        {(['pre-production', 'production'] as const).map(st => {
          const list = steps.filter(m => m.stage === st);
          return [
            <tr key={`${st}-h`}><td colSpan={6} className="mono text-[10px] uppercase tracking-[.08em] pt-3" style={faint}>{st.replace('-', ' ')}</td></tr>,
            ...list.map(m => {
              if (m.na) return <tr key={m.key} style={{ opacity: .5 }}><td><div className="flex items-center gap-2"><span className="dot" style={{ background: 'var(--line)' }} /><span>{m.key}</span></div></td><td className="mono text-[12px]" colSpan={3}>NA · not in this category's plan</td><td colSpan={2} /></tr>;
              const v = d(m); const { state, late } = flowStateOf(m, m.key === nextKey);
              return <tr key={m.key}>
                <td><div className="flex items-center gap-2"><span className="dot" style={{ background: state === 'pending' ? 'var(--ink-faint)' : FLOW_COLOR[state] }} /><span className="font-medium">{m.key}</span></div><div className="text-[10.5px] pl-4" style={faint}>{ROLE_LABEL[m.owner]}</div></td>
                {editable ? <>
                  <td><Input type="date" value={dateInput(v.plan)} onChange={e => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], plan: fromDateInput(e.target.value) ?? m.plan } }))} style={{ width: 132 }} /></td>
                  <td><Input type="date" value={dateInput(v.revised)} onChange={e => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], revised: fromDateInput(e.target.value) } }))} style={{ width: 132 }} /></td>
                  <td><Input type="date" value={dateInput(v.actual)} onChange={e => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], actual: fromDateInput(e.target.value) } }))} style={{ width: 132 }} /></td>
                  <td>{(v.revised && !v.actual) ? <Select value={v.delayReason ?? ''} onChange={val => setDraft(x => ({ ...x, [m.key]: { ...x[m.key], delayReason: val || null } }))} options={[{ value: '', label: '— reason —' }, ...DELAY_REASONS.map(rz => ({ value: rz, label: rz }))]} /> : <span className="text-[11.5px]" style={faint}>{m.delayReason ?? '—'}</span>}</td>
                  <td>{changed(m) && <Button size="sm" variant="primary" onClick={() => save(m)}>Save</Button>}</td>
                </> : <>
                  <td className="mono text-[12px]" style={{ textDecoration: m.revised ? 'line-through' : undefined, color: m.revised ? 'var(--ink-faint)' : undefined }}>{fmtDate(m.plan)}</td>
                  <td className="mono text-[12px]" style={{ color: 'var(--warn)' }}>{fmtDate(m.revised)}</td>
                  <td className="mono text-[12px]">{fmtDate(m.actual)}{late > 0 && <span className="pill risk ml-1">+{late}d</span>}</td>
                  <td className="text-[11.5px]" style={faint}>{m.delayReason ?? '—'}</td><td />
                </>}
              </tr>;
            }),
          ];
        })}
      </tbody>
    </table>
    <div className="text-[11.5px] py-2" style={faint}>An actual that lands late pushes every open step behind it by the same number of days. A revised date wants a reason — a moved cell without one is what makes a tracker untrustworthy.</div>
  </>;

  const body = <>{!editable && <ActsBy role="production" does="logs each milestone's actual or revised date and the reason it moved" />}{view === 'flow' ? flow : table}</>;
  return bare ? body : <Section title={`Time & action · ${o.milestones.length} of ${MILESTONES.length} steps planned`} right={<OwnerPill editable={editable} owner="Production" />}>{body}</Section>;
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
          <th>Factory</th><th>Region</th><th>Merchant</th><th>PO no.</th><th>PO date</th><th>PO status</th><th>BOM / job card</th><th>Costing target</th><th>Costing revised</th><th>Costing actual</th><th className="num">Final FOB</th>
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
