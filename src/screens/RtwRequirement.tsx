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
import { ActsBy } from './Who';

/* the steps each desk works in; every other step shows as a status line, not a panel */
const MINE: Record<string, string[]> = {
  design: ['raised', 'proto', 'sent', 'sourcing', 'factory', 'cloth', 'launch'],
  planning: ['raised', 'launch'],
  sourcing: ['sourcing', 'cloth'],
  production: ['factory', 'cloth', 'sample', 'tna'],
  merchandiser: ['factory', 'cloth', 'sample', 'tna'],
  warehouse: ['received'],
};

export function RtwRequirement({ o, initial }: { o: ProductionOrder; initial?: string }) {
  const { db, role, updateRequirement, handToSourcing } = useApp();
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
  const at = (k: string) => open === k && isMine(k);

  /* the order's numbers, editable by design until it is sent */
  const [qty, setQty] = useState(String(o.orderQty)); const [target, setTarget] = useState(dateInput(o.targetInhouse)); const [cost, setCost] = useState(String(o.targetCost));
  const total = o.sizeBreakup.reduce((s, x) => s + x.qty, 0);

  const mine = !!next?.act && next.act === role;
  const onTracker = typeof location !== 'undefined' && location.hash.startsWith('#/tracker');
  const panel = (k: string) => { setOpen(k); requestAnimationFrame(() => document.getElementById(`rtw-step-${o.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); };

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
          return <div className="rtw-panel-head"><div className="cap">Step {i + 1} of {journey.length} · {x.who}</div><h2>{x.label}</h2><p>{RTW_INTRO[x.key]}</p></div>; })()}
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
      <KV k="Raised" v={fmtDate(raised?.at ?? o.styleHandover)} note={raised?.who ?? undefined} />
      <KV k="Cloth" v="BSC buys it" note="sourcing puts a vendor against the brief, design pushes the fabric PO, sourcing sends the cloth to the factory" />
      {editable && <div className="pt-2"><Button size="sm" variant="primary" onClick={() => updateRequirement(o.id, { orderQty: Number(qty), targetInhouse: fromDateInput(target) ?? o.targetInhouse, targetCost: Number(cost) })}>Save</Button></div>}
      <div className="cap pt-3">Order qty break-up · {total} pcs</div>
      <SizeGrid breakup={o.sizeBreakup} />
    </Section>}

    {at('proto') && <>
      <ProtoSection o={o} canReview={editable} canLog={canLogProto && o.status === 'Requirement'} open />
      {o.fabricNominated && <div className="pt-3">{editable ? <BriefEditor o={o} /> : <FabricBriefSection o={o} />}</div>}
      <div className="pt-3"><BomSection o={o} editable={editable} open /></div>
      <Section title="Tech pack · job card" collapsible={false} right={<Pill tone={readiness.techPack ? 'good' : 'warn'}>{readiness.techPack ? 'tech pack on' : 'tech pack missing'}</Pill>}><DocsChecklist o={o} editable={design} /></Section>
    </>}

    {at('sent') && <Section title="Send it on" collapsible={false} right={sent ? <Pill tone="good">sent {fmtDate(sentLog?.at ?? o.styleHandover)}</Pill> : <Pill tone={readiness.ready ? 'good' : 'warn'}>{readiness.ready ? 'ready' : `${readiness.blockers.length} to do`}</Pill>}>
      {sent ? <div className="text-[12.5px] py-1">Sent {fmtDate(sentLog?.at ?? o.styleHandover)}{sentLog?.who ? ` by ${sentLog.who}` : ''}. Sourcing is finding the cloth vendor and Nitin a factory; both run at the same time.</div>
        : <>
          <div className="checklist">
            {([['Prototype', readiness.proto.ok, readiness.proto.state === 'skipped' ? 'not needed' : readiness.proto.state], ['Tech pack attached', readiness.techPack, readiness.techPack ? 'on the record' : 'attach it under Proto · BOM · tech pack'], ['Cloth brief', readiness.fabricLine, readiness.fabricLine ? 'written' : 'write the brief sourcing shops against']] as [string, boolean, string][]).map(([l, ok, s]) =>
              <div key={l} className={`cl-row${ok ? ' done' : ''}`}><span className="cl-box">{ok ? '✓' : ''}</span><div className="cl-main"><div className="cl-label">{l}</div><div className="cl-status">{s}</div></div></div>)}
          </div>
          <div className="flex gap-2 items-center pt-3 flex-wrap">
            {design ? <Button variant="primary" disabled={!readiness.ready} onClick={() => handToSourcing(o.id)}>Send to sourcing and production →</Button> : <ActsBy role={['design', 'planning']} does="sends it once the proto, BOM and tech pack are on" />}
            <span className="text-[11.5px]" style={faint}>one click: sourcing gets the cloth brief, Nitin gets the style to place</span>
          </div>
        </>}
    </Section>}

    {at('sourcing') && <Section title="Cloth vendor · fabric PO" collapsible={false} right={<span className="flex gap-2 items-center"><Pill tone={o.sourcing?.fabricPo ? 'good' : sent ? 'info' : 'neutral'}>{o.sourcing?.fabricPo ? `fabric PO ${o.sourcing.fabricPo.no}` : sent ? ss.label : 'after it is sent'}</Pill><span className="pill role-sourcing">Sourcing</span></span>}>
      {!o.fabricNominated ? <div className="text-[12.5px] py-1" style={faint}>The factory buys its own cloth for this style.</div>
        : !sent ? <div className="text-[12.5px] py-1" style={faint}>Starts the day the request is sent: sourcing puts one vendor against the cloth brief; design pushes the fabric PO, or sends it back.</div>
        : <FabricFinalisationSection o={o} bare part="sourcing" />}
    </Section>}

    {at('factory') && <Section title="Factory · PO" collapsible={false} right={<span className="flex gap-2 items-center"><Pill tone={fst.tone}>{fst.label}</Pill><span className="pill role-production">Nitin</span></span>}>
      {!sent ? <div className="text-[12.5px] py-1" style={faint}>Starts the day the request is sent: Nitin proposes a factory with the cost and date agreed on the phone; design accepts and raises the PO. The PO generates the TNA.</div>
        : <>
          {o.poNo && <KV k="Factory" v={<VendorLink id={o.vendorId} />} note={o.factoryPo?.docsMissing?.length ? `still owed to the factory: ${o.factoryPo.docsMissing.join(', ')}` : undefined} />}
          {!o.poNo && <FactoryFinalisationSection o={o} bare />}
          {o.poNo && <OrderSummary o={o} onDates={() => panel('tna')} />}
        </>}
    </Section>}
    {at('factory') && o.poNo && <Section title="Documents the factory works from" collapsible={false}><FactoryDocs o={o} /></Section>}

    {at('cloth') && <Section title="Cloth at the factory" collapsible={false} right={<Pill tone={fab.tone}>{o.poNo ? fab.label : 'after the PO'}</Pill>}>
      {!o.fabricNominated ? <div className="text-[12.5px] py-1" style={faint}>The factory buys its own cloth.</div>
        : !o.sourcing?.fabricPo || !o.poNo ? <div className="text-[12.5px] py-1" style={faint}>Once both POs are out, sourcing sends the cloth straight to the factory; the factory counts it in. Short cloth comes back to design for a cut ratio.</div>
        : (merchant && !design && !prod) || (role === 'owner' && location.hash.startsWith('#/factory')) ? <MaterialsPanel o={o} mine /> : <FabricFinalisationSection o={o} bare part="factory" />}
    </Section>}

    {at('sample') && (o.poNo ? <SampleSection o={o} editable={prod || merchant} open /> : <Section title="Sample" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>The factory samples the bulk cloth once the PO is raised and the cloth has landed.</div></Section>)}

    {at('tna') && <Section title="Made · the TNA" collapsible={false} right={<Pill tone={o.status === 'Closed' ? 'neutral' : r.risk === 'on-track' ? 'good' : r.risk === 'delayed' || r.risk === 'critical' ? 'risk' : 'warn'}>{o.poNo ? (o.status === 'Closed' ? 'delivered' : `${st.stage}${r.bufferDays != null && r.bufferDays < 0 ? ` · ${-r.bufferDays}d late` : ''}`) : 'after the PO'}</Pill>}>
      {!o.poNo ? <div className="text-[12.5px] py-1" style={faint}>The milestones are generated from the PO date. Nitin and the factory merchant log each step as it happens.</div>
        : <>
          <div className="text-[12.5px] pb-2" style={{ color: 'var(--ink-soft)' }}>Due in-house {fmtDate(o.targetInhouse)}{r.bufferDays != null && o.status !== 'Closed' ? ` · ${r.bufferDays < 0 ? `${-r.bufferDays} days late` : `${r.bufferDays} days to spare`}` : ''}. Click a step to log its date.</div>
          <MilestoneGrid o={o} editable={(prod || merchant) && o.status !== 'Closed'} bare />
          {!onTracker && <div className="pt-2"><a className="cta" href={`#/tracker?open=${o.id}`}>Open on the RTW production tracker →</a></div>}
        </>}
    </Section>}

    {at('received') && (o.poNo ? <ReceiptLots o={o} editable={wh} open /> : <Section title="Received at BSC" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>The warehouse counts the goods in by size when the factory dispatches.</div></Section>)}

    {at('launch') && <Section title="Launch" collapsible={false} right={<Pill tone={launch?.launchedOn ? 'good' : launch ? 'info' : 'neutral'}>{launch?.launchedOn ? `launched ${fmtDate(launch.launchedOn)}` : launch ? `${launch.dropMonth} drop` : 'not in a drop yet'}</Pill>}>
      {launch ? <>
        <KV k="Drop" v={launch.dropMonth} note={launch.launchedOn ? `launched ${fmtDate(launch.launchedOn)}` : launch.launchOn ? `launch ${fmtDate(launch.launchOn)}` : 'no date yet'} />
        <KV k="At head office" v={launch.receivedAtHo ? fmtDate(launch.receivedAtHo) : `expected ${fmtDate(launch.expectedAtHo)}`} />
        {launch.marketingName && <KV k="Marketing name" v={launch.marketingName} />}
        <div className="pt-1"><a className="cta" href={`#/launches?open=${launch.id}`}>the launch · gates, stores, marketing →</a></div>
      </> : <>{planning ? null : <div className="text-[12.5px] py-1" style={faint}>Planning puts it in a drop once it is in production; design mints the design code when the goods land.</div>}<PutInDrop o={o} /></>}
    </Section>}

      </div>
    </div></div>

    <RecordTail kind="order" subjectId={o.id} labels={FILE_LABELS.order} editable={design || prod || merchant} steps={ORDER_STEPS} />
  </>;
}
