/* An RTW style on one screen, the way an MTM fabric requirement is: a journey checklist
   across the top, one step open at a time, each section always open and holding only
   what that step needs. Design raises it; sourcing puts a vendor against the cloth and
   design pushes the fabric PO; Nitin proposes a factory, design accepts and raises the PO;
   the cloth lands at the factory; the sample; the TNA; goods received; the launch.
   The same record opens from Requirements and from the RTW production tracker. */
import { useState } from 'react';
import { useApp } from '../store';
import type { ProductionOrder } from '../domain/types';
import { fmtDate, fmtMoney, daysAgo, sendReadinessOf, sourcingStateOf, factoryStateOf, fabricStateOf, sampleStatusOf, riskOf, stageOf, receiptOf } from '../domain/engines';
import { rtwJourneyOf, RTW_PHASES, RTW_INTRO, RTW_ACTOR_LABEL } from '../domain/rtwJourney';
import { FILE_LABELS, ORDER_STEPS } from '../domain/reference';
import { Section, Pill, Button, KV, Field, Input, fromDateInput, dateInput } from '../ui';
import { FabricBriefSection } from './Sourcing';
import { VendorLink } from './Vendors';
import { SampleSection, ProtoSection, FactoryFinalisationSection, FabricFinalisationSection, DocsChecklist, SizeGrid, ReceiptLots } from './RtwGates';
import { BomSection } from './Costing';
import { BriefEditor, PutInDrop } from './Requirements';
import { MilestoneGrid } from './Tracker';
import { OrderSummary, FactoryDocs, MaterialsPanel } from './FactoryRtw';
import { RecordTail } from './RecordTail';
import { SampleCycleSection, PoCostsSection, ApproveReceivedSection, QcSection, ShippingSection, CogsSection } from './RtwChain';
import { SOURCE_LABEL } from '../domain/rtwJourney';
import { LaunchCodes, LaunchStickers } from './Launches';
import { ActsBy } from './Who';

/* the steps each desk works in; every other step shows as a status line, not a panel */
const MINE: Record<string, string[]> = {
  design: ['raised', 'design', 'sample', 'factory', 'cloth', 'cogs', 'launch'],
  planning: ['raised', 'cogs', 'launch'],
  sourcing: ['cloth'],
  production: ['sample', 'factory', 'cloth', 'tna', 'qc', 'ship', 'cogs'],
  merchandiser: ['sample', 'factory', 'cloth', 'tna', 'qc', 'ship'],
  warehouse: ['ship'],
};

export function RtwRequirement({ o, initial }: { o: ProductionOrder; initial?: string }) {
  const { db, role, updateRequirement, handToSourcing, sendForSampling } = useApp();
  const finance = role === 'finance' || role === 'owner';
  const [sampleDue, setSampleDue] = useState('');
  const design = role === 'design' || role === 'owner';
  const planning = role === 'planning' || role === 'owner';
  const prod = role === 'production' || role === 'owner';
  const merchant = role === 'merchandiser' || role === 'owner';
  const wh = role === 'warehouse' || role === 'owner';
  const editable = design && o.status === 'Requirement';
  const canLogProto = role === 'production' || role === 'warehouse' || role === 'owner';

  const readiness = sendReadinessOf(db, o);
  const ss = sourcingStateOf(o); const fst = factoryStateOf(o); const fab = fabricStateOf(o); const sample = sampleStatusOf(o);
  const rc = receiptOf(o); const r = riskOf(o); const st = stageOf(o);
  const launch = (db.launches ?? []).find(l => l.orderId === o.id) ?? null;
  const raised = o.activity?.find(a => /created|raised/i.test(a.what)) ?? null;
  const sentLog = o.activity?.find(a => /^Sent to production/i.test(a.what)) ?? null;
  const sent = o.status !== 'Requirement';
  const faint = { color: 'var(--ink-faint)' } as const;
  const { steps: journey, current, next } = rtwJourneyOf(db, o);
  const mineKeys = role === 'owner' ? null : (MINE[role] ?? []);
  const isMine = (k: string) => !mineKeys || mineKeys.includes(k);
  const firstMine = journey.slice(Math.max(current, 0)).find(x => isMine(x.key))?.key ?? journey.filter(x => isMine(x.key)).slice(-1)[0]?.key ?? journey[current]?.key ?? 'launch';
  const [open, setOpen] = useState<string>(initial && isMine(initial) ? initial : firstMine);
  /* how the open step lays its parts out: stacked (one under the other) or blocks (side by side, each part its own card) */
  const viewKey = (k: string) => `rtw-step-view:${k}`;
  /* Blocks by default; the cloth step (counts, cut ratio, sizes) reads better stacked. A choice made on a step is remembered for it. */
  const defaultView = (k: string): 'stacked' | 'blocks' => k === 'cloth' ? 'stacked' : 'blocks';
  const readView = (k: string): 'stacked' | 'blocks' => { try { const v = localStorage.getItem(viewKey(k)); return v === 'blocks' || v === 'stacked' ? v : defaultView(k); } catch { return defaultView(k); } };
  const [view, setView] = useState<'stacked' | 'blocks'>(() => readView(initial && isMine(initial) ? initial : firstMine));
  const pickView = (v: 'stacked' | 'blocks') => { setView(v); try { localStorage.setItem(viewKey(open), v); } catch { /* storage off */ } };
  const at = (k: string) => open === k && isMine(k);

  /* the order's numbers, editable by design until it is sent */
  const [qty, setQty] = useState(String(o.orderQty)); const [target, setTarget] = useState(dateInput(o.targetInhouse)); const [cost, setCost] = useState(String(o.targetCost));
  const total = o.sizeBreakup.reduce((s, x) => s + x.qty, 0);

  const mine = !!next?.act && next.act === role;
  const onTracker = typeof location !== 'undefined' && location.hash.startsWith('#/tracker');
  const panel = (k: string) => { setOpen(k); setView(readView(k)); requestAnimationFrame(() => document.getElementById(`rtw-step-${o.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); };

  return <>
    {/* one line that says what happens next, and whose move it is */}
    <div className="rtw-next" data-mine={mine || undefined}>
      {next ? <>
        <span className="rtw-next-k">{mine ? 'Your move' : 'Next'}</span>
        <span className="rtw-next-v">{next.now ?? next.label}</span>
        {next.act && <span className={`pill role-${next.act === 'merchandiser' ? 'production' : next.act}`}>{RTW_ACTOR_LABEL[next.act]}</span>}
        {!at(next.key) && isMine(next.key) && <button type="button" className="cta" onClick={() => panel(next.key)}>go there →</button>}
      </> : <><span className="rtw-next-k">Done</span><span className="rtw-next-v">launched {fmtDate(launch?.launchedOn)}</span></>}
    </div>

    <div className="rtw-wrap"><div className="rtw-journey">
      {/* the rail: every step in order, ticked as it lands; the open one is outlined */}
      <nav className="rtw-rail" aria-label="Steps">
        {RTW_PHASES.map(ph => <div key={ph.key} className="rtw-phase">
          <div className="cap">{ph.label}</div>
          {journey.map((x, i) => x.phase === ph.key && (() => { const done = !!x.on; const now = i === current;
            if (!isMine(x.key)) return <div key={x.key} className={`rtw-step flat${done ? ' done' : now ? ' now' : ''}`} title={x.who}>
              <span className="cl-box" aria-hidden>{done ? '✓' : i + 1}</span>
              <span className="rtw-step-main"><span className="rtw-step-label">{x.label}</span>
                <span className="rtw-step-sub">{done ? `${fmtDate(x.on!)}${x.by ? ` · ${x.by}` : ''}` : now ? (x.now ?? 'now') : x.who}</span></span>
            </div>;
            return <button type="button" key={x.key} onClick={() => panel(x.key)} aria-current={at(x.key) ? 'step' : undefined} className={`rtw-step${done ? ' done' : now ? ' now' : ''}`} title={x.who}>
              <span className="cl-box" aria-hidden>{done ? '✓' : i + 1}</span>
              <span className="rtw-step-main"><span className="rtw-step-label">{x.label}</span>
                <span className="rtw-step-sub">{done ? `${fmtDate(x.on!)}${x.by ? ` · ${x.by}` : ''}` : now ? (x.now ?? 'now') : x.who}</span></span>
            </button>; })())}
        </div>)}
      </nav>

      <div className="rtw-panel" id={`rtw-step-${o.id}`}>
        {(() => { const i = journey.findIndex(x => x.key === open); const x = journey[i]; if (!x) return null;
          return <div className="rtw-panel-head"><div className="flex items-start justify-between gap-3 flex-wrap"><div><div className="cap">Step {i + 1} of {journey.length} · {x.who}</div><h2>{x.label}</h2></div>
            <div className="seg rtw-view" role="group" aria-label="Layout"><button type="button" className={view === 'stacked' ? 'on' : ''} onClick={() => pickView('stacked')}>Stacked</button><button type="button" className={view === 'blocks' ? 'on' : ''} onClick={() => pickView('blocks')}>Blocks</button></div></div><p>{RTW_INTRO[x.key]}</p></div>; })()}
        <div className={view === 'blocks' ? 'rtw-blocks' : undefined}>
    {at('raised') && <Section title="The ask" collapsible={false} right={<span className="pill role-design">Design</span>}>
      {editable ? <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <Field label="Order qty"><Input type="number" value={qty} onChange={e => setQty(e.target.value)} /></Field>
        <Field label="Target in-house"><Input type="date" value={target} onChange={e => setTarget(e.target.value)} /></Field>
        <Field label="Target cost / pc"><Input type="number" value={cost} onChange={e => setCost(e.target.value)} /></Field>
      </div> : <>
        <KV k="Order qty" v={`${o.orderQty} pcs`} />
        <KV k="Target in-house" v={fmtDate(o.targetInhouse)} note={`${-daysAgo(o.targetInhouse)}d from now`} />
        <KV k="Target cost" v={fmtMoney(o.targetCost)} note="per piece" />
      </>}
      <KV k="Style" v={o.styleName} note={`${o.category} · ${o.subCategory}${o.fit ? ` · ${o.fit}` : ''}${o.program ? ` · ${o.program}` : ''}`} />
      <KV k="Came from" v={<Pill tone={o.source === 'auto-po' ? 'info' : o.source === 'planning' ? 'warn' : 'neutral'}>{SOURCE_LABEL[o.source ?? 'design']}</Pill>} note={o.source === 'auto-po' ? 'a core style fell below its threshold in Enigma; nobody raised it by hand' : o.source === 'planning' ? 'a reorder from the planning review' : undefined} />
      <KV k="Raised" v={fmtDate(raised?.at ?? o.styleHandover)} note={raised?.who ?? undefined} />
      <KV k="Cloth" v="BSC buys it" note="after the sample is right and the PO is out: sourcing shops the cloth and trims and sends them to the factory" />
      {editable && <div className="pt-2"><Button size="sm" variant="primary" onClick={() => updateRequirement(o.id, { orderQty: Number(qty), targetInhouse: fromDateInput(target) ?? o.targetInhouse, targetCost: Number(cost) })}>Save</Button></div>}
      <div className="cap pt-3">Order qty break-up · {total} pcs</div>
      <SizeGrid breakup={o.sizeBreakup} />
    </Section>}

    {at('design') && <>
      {o.fabricNominated && <div>{editable ? <BriefEditor o={o} /> : <FabricBriefSection o={o} />}</div>}
      <div className="pt-3"><BomSection o={o} editable={editable} open /></div>
      <Section title="Send to the factory for sampling" collapsible={false} right={sent ? <Pill tone="good">sent {fmtDate(sentLog?.at ?? o.styleHandover)}</Pill> : <Pill tone="warn">not sent</Pill>}>
        {sent ? <div className="text-[12.5px] py-1">Sent {fmtDate(sentLog?.at ?? o.styleHandover)}{sentLog?.who ? ` by ${sentLog.who}` : ''}. The sample cycle runs from here; the bulk order and PO follow once the sample is right.</div>
          : design ? <div className="flex gap-2 items-end flex-wrap pt-1">
              <Field label="Factory to give the sample by"><Input type="date" value={sampleDue} onChange={e => setSampleDue(e.target.value)} /></Field>
              <Button variant="primary" onClick={() => { handToSourcing(o.id); sendForSampling(o.id, 'prototype', fromDateInput(sampleDue)); }}>Send to the factory for sampling →</Button>
              <span className="text-[11.5px]" style={faint}>the CAD and the design go with it; Nitin places it at a factory</span>
            </div> : <ActsBy role="design" does="sends the style to the factory for sampling" />}
      </Section>
    </>}

    {at('sample') && <>
      <SampleCycleSection o={o} design={design} factory={merchant || prod} />
      {(o.proto?.rounds?.length ?? 0) > 0 && <div className="pt-3"><ProtoSection o={o} canReview={false} canLog={false} /></div>}
      {(o.samples?.length ?? 0) > 0 && <div className="pt-3"><SampleSection o={o} editable={false} /></div>}
    </>}

    {at('factory') && <Section title="Factory · PO" collapsible={false} right={<span className="flex gap-2 items-center"><Pill tone={fst.tone}>{fst.label}</Pill><span className="pill role-production">Nitin</span></span>}>
      {!sent ? <div className="text-[12.5px] py-1" style={faint}>Starts the day the request is sent: Nitin proposes a factory with the cost and date agreed on the phone; design accepts and raises the PO. The PO generates the TNA.</div>
        : <>
          {o.poNo && <KV k="Factory" v={<VendorLink id={o.vendorId} />} note={o.factoryPo?.docsMissing?.length ? `still owed to the factory: ${o.factoryPo.docsMissing.join(', ')}` : undefined} />}
          {!o.poNo && <FactoryFinalisationSection o={o} bare />}
          {o.poNo && <OrderSummary o={o} onDates={() => panel('tna')} />}
        </>}
    </Section>}
    {at('factory') && o.poNo && <div className="pt-3"><PoCostsSection o={o} design={design} factory={merchant} /></div>}
    {at('factory') && o.poNo && <Section title="Documents the factory works from" collapsible={false}><FactoryDocs o={o} /></Section>}

    {at('cloth') && <Section title="Tech pack · job card" collapsible={false} right={<Pill tone={readiness.techPack ? 'good' : 'warn'}>{readiness.techPack ? 'tech pack on' : 'tech pack to upload'}</Pill>}><DocsChecklist o={o} editable={design} /></Section>}
    {at('cloth') && o.fabricNominated && !o.sourcing?.fabricPo && <Section title="Shopping · cloth vendor and fabric PO" collapsible={false}>{!sent ? <div className="text-[12.5px] py-1" style={faint}>After the PO.</div> : <FabricFinalisationSection o={o} bare part="sourcing" />}</Section>}
    {at('cloth') && <Section title="Cloth at the factory" collapsible={false} right={<Pill tone={fab.tone}>{o.poNo ? fab.label : 'after the PO'}</Pill>}>
      {!o.fabricNominated ? <div className="text-[12.5px] py-1" style={faint}>The factory buys its own cloth.</div>
        : !o.sourcing?.fabricPo || !o.poNo ? <div className="text-[12.5px] py-1" style={faint}>Once both POs are out, sourcing sends the cloth straight to the factory; the factory counts it in. Short cloth comes back to design for a cut ratio.</div>
        : (merchant && !design && !prod) || (role === 'owner' && location.hash.startsWith('#/factory')) ? <MaterialsPanel o={o} mine /> : <FabricFinalisationSection o={o} bare part="factory" />}
    </Section>}
    {at('cloth') && o.poNo && <div className="pt-3"><ApproveReceivedSection o={o} factory={merchant} /></div>}



    {at('tna') && <Section title="Made · the TNA" collapsible={false} right={<Pill tone={o.status === 'Closed' ? 'neutral' : r.risk === 'on-track' ? 'good' : r.risk === 'delayed' || r.risk === 'critical' ? 'risk' : 'warn'}>{o.poNo ? (o.status === 'Closed' ? 'delivered' : `${st.stage}${r.bufferDays != null && r.bufferDays < 0 ? ` · ${-r.bufferDays}d late` : ''}`) : 'after the PO'}</Pill>}>
      {!o.poNo ? <div className="text-[12.5px] py-1" style={faint}>The milestones are generated from the PO date. Nitin and the factory merchant log each step as it happens.</div>
        : <>
          <div className="text-[12.5px] pb-2" style={{ color: 'var(--ink-soft)' }}>Due in-house {fmtDate(o.targetInhouse)}{r.bufferDays != null && o.status !== 'Closed' ? ` · ${r.bufferDays < 0 ? `${-r.bufferDays} days late` : `${r.bufferDays} days to spare`}` : ''}. Click a step to log its date.</div>
          <MilestoneGrid o={o} editable={(prod || merchant) && o.status !== 'Closed'} bare />
          {!onTracker && <div className="pt-2"><a className="cta" href={`#/tracker?open=${o.id}`}>Open on the RTW production tracker →</a></div>}
        </>}
    </Section>}

    {at('qc') && (o.poNo ? <QcSection o={o} factory={merchant || prod} /> : <Section title="QC" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>After the PO and finishing.</div></Section>)}

    {at('ship') && (o.poNo ? <>
      <ShippingSection o={o} factory={merchant} prod={prod} />
      <div className="pt-3"><ReceiptLots o={o} editable={false} open /></div>
    </> : <Section title="Shipping cycle" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>After QC: AWB, courier, shipped, delivered, closed.</div></Section>)}

    {at('cogs') && <CogsSection o={o} finance={prod || design} />}

    {at('launch') && <Section title="Launch" collapsible={false} right={<Pill tone={launch?.launchedOn ? 'good' : launch ? 'info' : 'neutral'}>{launch?.launchedOn ? `launched ${fmtDate(launch.launchedOn)}` : launch ? `${launch.dropMonth} drop` : 'not in a drop yet'}</Pill>}>
      {launch ? <>
        <KV k="Drop" v={launch.dropMonth} note={launch.launchedOn ? `launched ${fmtDate(launch.launchedOn)}` : launch.launchOn ? `launch ${fmtDate(launch.launchOn)}` : 'no date yet'} />
        <KV k="At head office" v={launch.receivedAtHo ? fmtDate(launch.receivedAtHo) : `expected ${fmtDate(launch.expectedAtHo)}`} />
        {launch.marketingName && <KV k="Marketing name" v={launch.marketingName} />}
        <div className="pt-1"><a className="cta" href={`#/launches?open=${launch.id}`}>the launch · gates, stores, marketing →</a></div>
      </> : <>{planning ? null : <div className="text-[12.5px] py-1" style={faint}>Planning puts it in a drop once it is in production; design mints the design code when the goods land.</div>}<PutInDrop o={o} /></>}
    </Section>}
    {/* design codes and the desk after them, on the record itself: the RTW twin of the MTM fabric's Design & sticker */}
    {at('launch') && launch && <div className="pt-3"><LaunchCodes l={launch} isDesign={design} /></div>}
    {at('launch') && launch?.designCode && <div className="pt-3"><LaunchStickers l={launch} canMark={design} /></div>}
        </div>
      </div>
    </div></div>

    <RecordTail kind="order" subjectId={o.id} labels={FILE_LABELS.order} editable={design || prod || merchant} steps={ORDER_STEPS} />
  </>;
}
