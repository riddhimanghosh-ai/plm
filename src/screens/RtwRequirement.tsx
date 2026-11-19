/* An RTW style on one screen: a journey rail across the top, one step open at a time, each section
   holding only what that step needs. The chain as BSC set it on 14 Nov 2026: category fills the five-part
   requirement (sourcing adds the cloth vendor); Nitin sends the cost query and raises the PO on a reply;
   the factory returns planned dates through the merchandiser; the TNA runs with QC at five points;
   the merchandiser uploads the invoice and packing list; Prince receives on Enigma; COGS; launch.
   The same record opens from Requirements, the RTW production tracker, the merchandiser's and QC's screens. */
import { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store';
import type { ProductionOrder, FabricBy } from '../domain/types';
import { fmtDate, fmtMoney, daysAgo, riskOf, stageOf, fabricStateOf } from '../domain/engines';
import { rtwJourneyOf, RTW_PHASES, RTW_ACTOR_LABEL } from '../domain/rtwJourney';
import { FILE_LABELS, ORDER_STEPS } from '../domain/reference';
import { Section, Pill, Button, KV, Field, Input, fromDateInput, dateInput, DrawerSlot } from '../ui';
import { FabricFinalisationSection } from './RtwGates';
import { MilestoneGrid } from './Tracker';
import { MaterialsPanel } from './FactoryRtw';
import { RecordTail } from './RecordTail';
import { PackSection, CostQuerySection, PoSection, PoCostsSection, PoInvoicesSection, FactoryClothSection, TnaPlanSection, QcChecksSection, InvoiceSection, ReceivedSection, WarehouseCount, CogsSection, RemarksLog, remarksCountOf, PoFabricsSection, EnigmaSection } from './RtwChain';
import { SOURCE_LABEL } from '../domain/rtwJourney';
import { countedBy3plOf, poFabricsOf, packReadyOf } from '../domain/rtwPack';
import { MarketingSection } from './Marketing';
import { TransferSection } from './Transfers';
import { ApprovalSection, PoEditSection } from './RtwApproval';

/* the steps each desk works in; every other step shows as a status line, not a panel */
const MINE: Record<string, string[]> = {
  design: ['pack', 'query', 'launch', 'approval', 'po', 'cloth', 'tna', 'cogs'],
  marketing: ['marketing', 'launch'],   // 19 Nov 2026: marketing's details beside the Enigma entry
  materials: ['cloth', 'po'],           // 19 Nov 2026: Desai sends against the transfer note   // 19 Nov 2026 (Parag): category drafts the PO and does everything on it
  hod: ['query', 'launch', 'approval', 'po', 'invoices'],
  finance: ['query', 'launch', 'approval', 'po', 'cogs', 'invoices'],
  planning: ['pack'],   // 19 Nov 2026: Charanjeet adds the sizes
  sourcing: ['pack', 'cloth', 'invoices'],
  production: ['pack', 'query', 'plan', 'cloth', 'tna', 'dispatch', 'received', 'invoices'],
  merchandiser: ['query', 'po', 'plan', 'cloth', 'tna', 'dispatch', 'received', 'invoices'],
  qc: ['po', 'tna'],
  warehouse: ['po', 'dispatch', 'received'],
};

/* HOD and finance follow a style up to the PO; finance also keeps the invoices and payments log. Nothing of the making (TNA, cloth, QC, dispatch). */
/* 19 Nov 2026: marketing sees only its part: the style going into Enigma and its own details */
const SCOPE: Record<'hod' | 'finance' | 'warehouse' | 'sourcing' | 'marketing', string[]> = { marketing: ['launch', 'marketing'], sourcing: ['pack'], warehouse: ['po', 'dispatch', 'received'], hod: ['pack', 'query', 'launch', 'approval', 'po'], finance: ['pack', 'query', 'launch', 'approval', 'po', 'cogs', 'invoices'] };
export function RtwRequirement({ o, initial, scope }: { o: ProductionOrder; initial?: string; scope?: 'hod' | 'finance' | 'warehouse' | 'sourcing' | 'marketing' }) {
  const { db, role, myRole, demoAll, updateRequirement } = useApp();
  /* 18 Nov 2026: the whole record shows for every role; only a screen that asks for one part (scope) narrows it */
  const scoped = scope ?? (role === 'marketing' ? 'marketing' : null); void myRole; void demoAll;
  const design = role === 'design' || role === 'owner';

  const prod = role === 'production' || role === 'owner';
  const merchant = role === 'merchandiser' || role === 'owner';
  const sourcing = role === 'sourcing' || role === 'owner';
  const qc = role === 'qc' || role === 'owner';
  const editable = design && o.status === 'Requirement';

  const fab = fabricStateOf(o); const r = riskOf(o); const st = stageOf(o);
  const launch = (db.launches ?? []).find(l => l.orderId === o.id) ?? null;
  const raised = o.activity?.find(a => /created|raised/i.test(a.what)) ?? null;
  const faint = { color: 'var(--ink-faint)' } as const;
  const full = rtwJourneyOf(db, o);
  /* a scoped view (marketing) only talks about its own steps */
  const next = scope === 'marketing' || (!scope && role === 'marketing') ? (full.steps.find(x => x.key === 'marketing' && !x.on) ?? null) : full.next;
  const journey = scoped ? full.steps.filter(x => SCOPE[scoped].includes(x.key)) : full.steps;
  const current = scoped ? journey.findIndex(x => x.key === full.steps[full.current]?.key) : full.current;
  const mineKeys = role === 'owner' ? null : (MINE[role] ?? []);
  const isMine = (k: string) => !mineKeys || mineKeys.includes(k);
  const firstMine = journey.slice(Math.max(current, 0)).find(x => isMine(x.key))?.key ?? journey.filter(x => isMine(x.key)).slice(-1)[0]?.key ?? journey[current]?.key ?? 'launch';
  const [open, setOpen] = useState<string>(initial && isMine(initial) ? initial : firstMine);
  /* how the open step lays its parts out: stacked (one under the other) or blocks (side by side, each part its own card) */
  const viewKey = (k: string) => `rtw-step-view:${k}`;
  const defaultView = (k: string): 'stacked' | 'blocks' => k === 'tna' || k === 'pack' || k === 'cloth' ? 'stacked' : 'blocks';
  /* 18 Nov 2026: no layout switch any more; each step uses the layout that suits it */
  const readView = (k: string): 'stacked' | 'blocks' => defaultView(k);
  const [view, setView] = useState<'stacked' | 'blocks'>(() => readView(initial && isMine(initial) ? initial : firstMine));
  const pickView = (v: 'stacked' | 'blocks') => { setView(v); try { localStorage.setItem(viewKey(open), v); } catch { /* storage off */ } };
  /* phone: the steps are a strip; keep the open one in view */
  useEffect(() => { document.querySelector(`#rtw-rail-${o.id} [aria-current="step"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [open, o.id]);
  /* 18 Nov 2026: every step opens for everyone; a step that is not yours is view only (the edit buttons follow the role) */
  const at = (k: string) => open === k;
  const [phaseOpen, setPhaseOpen] = useState<Record<string, boolean>>({});
  /* Draft the PO on a reply: the record moves to step 4 and the PO form opens there */
  const [apPreset, setApPreset] = useState<{ vendorId: string; fabricBy: FabricBy } | null>(null);

  /* the order's numbers, editable by category until it is sent */
  const [qty, setQty] = useState(String(o.orderQty)); const [target, setTarget] = useState(dateInput(o.targetInhouse)); const [cost, setCost] = useState(String(o.targetCost)); const [semi, setSemi] = useState(!!o.semiStitched);

  const mine = !!next?.act && next.act === role;
  const onTracker = typeof location !== 'undefined' && location.hash.startsWith('#/tracker');
  const panel = (k: string) => { setOpen(k); setView(readView(k)); requestAnimationFrame(() => document.getElementById(`rtw-step-${o.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); };
  const headSlot = useContext(DrawerSlot);
  const roleClass = (a: string) => a === 'merchandiser' ? 'production' : a === 'finance' ? 'production' : a;

  return <>
    {/* one line that says what happens next, and whose move it is — in the drawer's header when there is one, so it takes no row of its own */}
    {(() => { const bar = <div className={`rtw-next${headSlot ? ' in-head' : ''}`} data-mine={mine || undefined}>
      {next ? <>
        <span className="rtw-next-k">{mine ? 'Your move' : 'Next'}</span>
        <span className="rtw-next-v">{next.now ?? next.label}</span>
        {next.act && <span className={`pill role-${roleClass(next.act)}`}>{RTW_ACTOR_LABEL[next.act]}</span>}
        {!at(next.key) && <button type="button" className="cta" onClick={() => panel(next.key)}>go there →</button>}
      </> : <><span className="rtw-next-k">Done</span><span className="rtw-next-v">{scoped === 'marketing' ? `marketing details done ${fmtDate(o.marketing?.doneOn)}` : `launched ${fmtDate(launch?.launchedOn)}`}</span></>}
    </div>; return headSlot ? createPortal(bar, headSlot) : bar; })()}

    <div className="rtw-wrap"><div className="rtw-journey">
      {/* the rail: every step in order, ticked as it lands; the open one is outlined */}
      <nav className="rtw-rail" id={`rtw-rail-${o.id}`} aria-label="Steps">
        {RTW_PHASES.filter(ph => journey.some(x => x.phase === ph.key)).map(ph => { const steps = journey.filter(x => x.phase === ph.key);
          const allDone = steps.every(x => !!x.on); const hasNow = steps.some(x => journey.indexOf(x) === current); const hasOpen = steps.some(x => x.key === open);
          const lastOn = steps.map(x => x.on).filter(Boolean).sort().slice(-1)[0] ?? null;
          /* 18 Nov 2026: each phase folds to one line on a click; all start open */
          const shut = phaseOpen[ph.key] != null ? !phaseOpen[ph.key] : false; void hasNow; void hasOpen;   // every phase starts open (user, 18 Nov 2026); a click folds it
          return <div key={ph.key} className={`rtw-phase${shut ? ' shut' : ''}`}>
          <button type="button" className="rtw-ph-head" onClick={() => setPhaseOpen(m => ({ ...m, [ph.key]: shut }))} aria-expanded={!shut}>
            <span className="rtw-ph-car" aria-hidden>{shut ? '▸' : '▾'}</span><span className="rtw-ph-name">{ph.label}</span>
            {shut && <span className={`rtw-ph-sum${allDone ? ' done' : ''}`}>{allDone ? `✓ ${steps.length} done${lastOn ? ` · ${fmtDate(lastOn)}` : ''}` : `${steps.filter(x => x.on).length ? `${steps.filter(x => x.on).length} of ${steps.length} done` : `${steps.length} step${steps.length === 1 ? '' : 's'} ahead`}`}</span>}
          </button>
          {!shut && journey.map((x, i) => x.phase === ph.key && (() => { const done = !!x.on; const now = i === current;
            return <button type="button" key={x.key} onClick={() => panel(x.key)} aria-current={at(x.key) ? 'step' : undefined} title={isMine(x.key) ? x.who : `${x.who} · view only for you`} className={`rtw-step${isMine(x.key) ? '' : ' other'}${done ? ' done' : now ? ' now' : ''}${x.tone ? ` ${x.tone}` : ''}`}>
              <span className="cl-box" aria-hidden>{done ? '✓' : i + 1}</span>
              <span className="rtw-step-main"><span className="rtw-step-label">{x.label}</span>
                <span className="rtw-step-sub">{done ? `${fmtDate(x.on!)}${x.by ? ` · ${x.by}` : ''}` : now ? (x.now ?? 'now') : x.who}</span></span>
            </button>; })())}
        </div>; })}
      </nav>

      <div className="rtw-panel" id={`rtw-step-${o.id}`}>
        {(() => { const i = journey.findIndex(x => x.key === open); const x = journey[i]; if (!x) return null;
          return <div className="rtw-panel-head"><div className="flex items-center justify-between gap-3 flex-wrap"><div className="flex items-baseline gap-2 flex-wrap"><h2 style={{ margin: 0, fontSize: 15 }}>{x.label}</h2><span className="cap" style={{ margin: 0 }}>Step {i + 1} of {journey.length} · {x.who}</span>{!isMine(x.key) && <span className="view-only-pill">View only · not your step</span>}</div></div></div>; })()}
        <div className={view === 'blocks' ? 'rtw-blocks' : undefined}>
    {at('pack') && scoped !== 'sourcing' && <div className="rtw-full pb-3"><Section title="The ask" collapsible={false} right={<span className="pill role-design">Category</span>}>
      {editable ? <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <Field label="Order qty"><Input type="number" value={qty} onChange={e => setQty(e.target.value)} /></Field>
        <Field label="Target in-house"><Input type="date" value={target} onChange={e => setTarget(e.target.value)} /></Field>
        <Field label="Target cost / pc"><Input type="number" value={cost} onChange={e => setCost(e.target.value)} /></Field>
      </div> : <>
        <KV k="Order qty" v={`${o.orderQty} pcs`} />
        <KV k="Target in-house" v={fmtDate(o.targetInhouse)} note={daysAgo(o.targetInhouse) > 0 ? `${daysAgo(o.targetInhouse)} days ago` : daysAgo(o.targetInhouse) === 0 ? 'today' : `in ${-daysAgo(o.targetInhouse)} days`} />
        <KV k="Target cost" v={fmtMoney(o.targetCost)} note="per piece" />
      </>}
      <KV k="Style" v={o.styleName} note={`${o.category} · ${o.subCategory}${o.fit ? ` · ${o.fit}` : ''}${o.program ? ` · ${o.program}` : ''}`} />
      <KV k="Came from" v={<Pill tone={o.source === 'auto-po' ? 'info' : o.source === 'planning' ? 'warn' : 'neutral'}>{SOURCE_LABEL[o.source ?? 'design']}</Pill>} note={o.source === 'planning' ? 'a reorder from the planning review' : undefined} />
      <KV k="Raised" v={fmtDate(raised?.at ?? o.styleHandover)} note={raised?.who ?? undefined} />
      {editable ? <div className="kv"><span className="k">Semi-stitched?</span><span className="v"><label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={semi} onChange={e => setSemi(e.target.checked)} /> hemming in-house → delivers to Vasai; else the 3PL warehouse</label></span></div>
        : <KV k="Delivers to" v={o.deliverTo ?? (o.semiStitched ? 'Vasai · in-house' : '3PL warehouse')} note={o.semiStitched ? 'semi-stitched product · hemming in-house' : 'not semi-stitched'} />}
      {editable && <div className="pt-2"><Button size="sm" variant="primary" onClick={() => updateRequirement(o.id, { orderQty: Number(qty), targetInhouse: fromDateInput(target) ?? o.targetInhouse, targetCost: Number(cost), semiStitched: semi })}>Save</Button></div>}
    </Section></div>}

    {at('pack') && <div className="rtw-full"><PackSection o={o} design={design && scoped !== 'sourcing'} sourcing={sourcing} only={scoped === 'sourcing' ? 'bom' : undefined} /></div>}

    {at('query') && <div className="rtw-full"><CostQuerySection o={o} prod={prod} merchant={merchant} design={design} onAskApproval={(vendorId, fabricBy) => { setApPreset({ vendorId, fabricBy }); setOpen('approval'); }} onGo={setOpen} /></div>}

    {at('launch') && <div className="rtw-full"><EnigmaSection o={o} design={design} /></div>}
    {at('marketing') && <div className="rtw-full"><MarketingSection o={o} /></div>}
    {at('approval') && packReadyOf(o).sizesMissing && !o.poApproval && <div className="rtw-full pb-3"><div className="early-q text-[12.5px]"><b>The PO waits for the sizes.</b> Counter sourcing ran on a per-piece quote; Charanjeet adds the size-wise quantities on the Requirement step, then the PO can be drafted. <button type="button" className="vlink" onClick={() => panel('pack')}>go to the sizes →</button></div></div>}
    {at('approval') && !(packReadyOf(o).sizesMissing && !o.poApproval) && <div className="rtw-full"><ApprovalSection key={(apPreset?.vendorId ?? '') + (o.poApproval?.askedOn ?? '')} o={o} prod={design} preset={apPreset} onGo={k => { setApPreset(null); setOpen(k); }} /></div>}
    {at('po') && <div className="rtw-full"><PoSection o={o} /></div>}
    {at('po') && o.poNo && <div className="rtw-full pt-3"><PoEditSection key={(o.poEdit?.askedOn ?? '') + (o.poDoc?.revision ?? 1) + (o.cutRatios ?? []).filter(c => c.given).length} o={o} prod={design} design={design} onGo={setOpen} /></div>}
    {at('po') && o.poNo && <div className="rtw-full pt-3"><PoCostsSection o={o} design={design} factory={merchant} /></div>}

    {at('plan') && <div className="rtw-full"><TnaPlanSection o={o} merchant={merchant} /></div>}

    {at('tna') && o.poNo && <div className="rtw-full"><QcChecksSection o={o} qc={qc} /></div>}
    {at('tna') && <Section title="The TNA" collapsible={false} right={<Pill tone={o.status === 'Closed' ? 'neutral' : r.risk === 'on-track' ? 'good' : r.risk === 'delayed' || r.risk === 'critical' ? 'risk' : 'warn'}>{o.poNo ? (o.status === 'Closed' ? 'delivered' : `${st.stage}${r.bufferDays != null && r.bufferDays < 0 ? ` · ${-r.bufferDays}d late` : ''}`) : 'after the PO'}</Pill>}>
      {!o.poNo ? <div className="text-[12.5px] py-1" style={faint}>Generated from the PO; the factory returns its planned dates on the TNA form, then logs each step as it happens. The merchandiser follows up.</div>
        : <>
          <div className="text-[12.5px] pb-2" style={{ color: 'var(--ink-soft)' }}>Due in-house {fmtDate(o.targetInhouse)}{r.bufferDays != null && o.status !== 'Closed' ? ` · ${r.bufferDays < 0 ? `${-r.bufferDays} days late` : `${r.bufferDays} days to spare`}` : ''}. Planned · revised · actual on every step; the QC blocks close when QC passes them.</div>
          <MilestoneGrid o={o} editable={(prod || merchant) && o.status !== 'Closed'} bare dense />
          {!onTracker && <div className="pt-2"><a className="cta" href={`#/tracker?open=${o.id}`}>Open on the RTW production tracker →</a></div>}
        </>}
    </Section>}
    {/* 19 Nov 2026: one cloth section: the colours on the PO first, then the cloth sent and counted, then the cut ratio */}
    {at('cloth') && (() => { const pfx = poFabricsOf(o); const colourAlert = !!o.poNo && pfx.all.length > 0 && (pfx.failedOpen.length > 0 || pfx.held.length > 0); return <div className="rtw-full"><Section title={`${!o.poNo || o.fabricNominated ? 'Cloth at the factory' : 'Cloth and trims at the factory'}${o.poNo && pfx.all.length ? ` · ${pfx.all.length} colour${pfx.all.length === 1 ? '' : 's'}` : ''}`} collapsible={false} right={<span className="flex gap-2 items-center flex-wrap">{colourAlert && <Pill tone={pfx.tone}>{pfx.line}</Pill>}<Pill tone={o.poNo ? (o.fabricNominated ? (!o.sourcing?.fabricPo ? 'warn' : fab.tone) : (o.factoryCloth?.receivedOn ? 'good' : 'info')) : 'neutral'}>{o.poNo ? (o.fabricNominated ? (!o.sourcing?.fabricPo ? 'sourcing to buy the cloth' : fab.label) : (o.factoryCloth?.receivedOn ? 'cloth in at the factory' : 'factory buying the cloth')) : 'after the PO'}</Pill></span>}>
      {o.poNo && pfx.all.length > 0 && <div className="cloth-colours"><PoFabricsSection o={o} factory={merchant} prod={prod} bare /></div>}
      {!o.poNo ? <div className="text-[12.5px] py-1" style={faint}>Decided by Nitin before the PO: BSC sends the cloth and trims (sourcing ships them, the factory counts them in), or the factory buys it — from BSC's vendor on the details in the PO, or its own — and gives back its fabric PO and receipt. Less or more than the PO needs comes back to category for a new cut ratio.</div>
        : !o.fabricNominated ? <FactoryClothSection o={o} merchant={merchant} />
        : !o.sourcing?.fabricPo ? <div className="text-[12.5px] py-1"><b>Cloth not bought yet.</b> <span style={{ color: 'var(--ink-soft)' }}>Sourcing raises the fabric PO on {db.vendors.find(v => v.id === o.pack?.fabric.vendorId)?.name ?? 'the cloth vendor'}{fab.need ? ` for ${fab.need} m` : ''}, then ships the cloth to {db.vendors.find(v => v.id === o.vendorId)?.name ?? 'the factory'}. The factory counts it in on the table above once it arrives.</span></div>
        : (merchant && !design && !prod) || (role === 'owner' && location.hash.startsWith('#/factory')) ? <MaterialsPanel o={o} mine /> : <FabricFinalisationSection o={o} bare part="factory" onGiven={o.poNo && o.poDoc ? () => panel('po') : undefined} />}
    </Section>
    {o.poNo && (o.transfers ?? []).length > 0 && <div className="pt-3"><TransferSection o={o} /></div>}
    {o.poNo && !o.fabricNominated && <div className="pt-3"><Section title="Trims and the cut ratio" collapsible={false} right={<Pill tone={fab.cr && !fab.cr.given ? 'risk' : fab.cr?.given ? 'info' : 'neutral'}>{fab.cr && !fab.cr.given ? 'new cut ratio with category' : fab.cr?.given ? 'new cut ratio given' : 'on the PO sizes'}</Pill>}>
      {(merchant && !design && !prod) || (role === 'owner' && location.hash.startsWith('#/factory')) ? <MaterialsPanel o={o} mine /> : <FabricFinalisationSection o={o} bare part="factory" onGiven={o.poNo && o.poDoc ? () => panel('po') : undefined} />}
    </Section></div>}</div>; })()}

    {at('dispatch') && <div className="rtw-full"><InvoiceSection o={o} merchant={merchant} /></div>}

    {at('received') && (countedBy3plOf(o) ? merchant : (role === 'warehouse' || role === 'owner')) && <div className="rtw-full pb-3"><WarehouseCount o={o} /></div>}
    {at('received') && <div className="rtw-full"><ReceivedSection o={o} /></div>}

    {at('cogs') && <CogsSection o={o} finance={design} />}

    {at('invoices') && <div className="rtw-full"><PoInvoicesSection o={o} prod={prod || role === 'finance'} /></div>}
        </div>
      </div>
    </div></div>

    <RecordTail kind="order" subjectId={o.id} labels={FILE_LABELS.order} editable={design || prod || merchant} steps={ORDER_STEPS} activity={o.activity} extraTabs={[{ id: 'remarks', label: 'Remarks', count: remarksCountOf(o), body: <RemarksLog o={o} /> }]} />
  </>;
}
