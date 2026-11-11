/* An RTW style on one screen, the way an MTM fabric requirement is: a journey checklist
   across the top, one step open at a time, each section always open and holding only
   what that step needs. Design raises it; sourcing puts a vendor against the cloth and
   design pushes the fabric PO; Nitin proposes a factory, design accepts and raises the PO;
   the cloth lands at the factory; the sample; the TNA; goods received; the launch.
   The same record opens from Requirements and from the RTW production tracker. */
import { useState } from 'react';
import { useApp } from '../store';
import type { ProductionOrder } from '../domain/types';
import { fmtDate, fmtMoney, daysAgo, sendReadinessOf, sourcingStateOf, factoryStateOf, fabricStateOf, sampleStatusOf, protoStatusOf, receiptOf, riskOf, stageOf } from '../domain/engines';
import { FILE_LABELS, ORDER_STEPS } from '../domain/reference';
import { Section, Pill, Button, KV, Field, Input, fromDateInput, dateInput } from '../ui';
import { FabricBriefSection } from './Sourcing';
import { VendorLink } from './Vendors';
import { SampleSection, ProtoSection, FactoryFinalisationSection, FabricFinalisationSection, DocsChecklist, SizeGrid, ReceiptLots } from './RtwGates';
import { BomSection } from './Costing';
import { BriefEditor, PutInDrop } from './Requirements';
import { MilestoneGrid } from './Tracker';
import { RecordTail } from './RecordTail';
import { ActsBy } from './Who';

type Step = { key: string; label: string; who: string; on: string | null | undefined; by?: string | null; now?: string };

export function RtwRequirement({ o, initial }: { o: ProductionOrder; initial?: string }) {
  const { db, role, updateRequirement, handToSourcing } = useApp();
  const design = role === 'design' || role === 'owner';
  const planning = role === 'planning' || role === 'owner';
  const prod = role === 'production' || role === 'owner';
  const merchant = role === 'merchandiser' || role === 'owner';
  const wh = role === 'warehouse' || role === 'owner';
  const editable = design && o.status === 'Requirement';
  const canLogProto = role === 'production' || role === 'warehouse' || role === 'owner';

  const readiness = sendReadinessOf(db, o); const proto = protoStatusOf(o);
  const ss = sourcingStateOf(o); const fst = factoryStateOf(o); const fab = fabricStateOf(o); const sample = sampleStatusOf(o);
  const rc = receiptOf(o); const r = riskOf(o); const st = stageOf(o);
  const launch = (db.launches ?? []).find(l => l.orderId === o.id) ?? null;
  const nameOf = (id: string | null | undefined) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const raised = o.activity?.find(a => /created|raised/i.test(a.what)) ?? null;
  const sentLog = o.activity?.find(a => /^Sent to production/i.test(a.what)) ?? null;
  const sent = o.status !== 'Requirement';
  const chosen = o.fabricQuotes.find(q => q.selected) ?? o.fabricQuotes[0] ?? null;
  const dispatched = o.milestones.find(m => m.key === 'Dispatch')?.actual ?? null;
  const faint = { color: 'var(--ink-faint)' } as const;

  /* the whole journey, one line: each box ticks itself when its step is done; "now" names the move */
  const journey: Step[] = [
    { key: 'raised', label: 'Raised', who: 'Design', on: raised?.at ?? o.styleHandover, by: raised?.who },
    { key: 'proto', label: 'Proto · BOM · tech pack', who: 'Design', on: readiness.ready ? (proto.approved?.reviewedOn ?? o.proto?.skipped?.on ?? raised?.at ?? o.styleHandover) : null,
      now: readiness.blockers[0] },
    { key: 'sent', label: 'Sent on', who: 'Design', on: sent ? (sentLog?.at ?? o.styleHandover) : null, by: sentLog?.who, now: readiness.ready ? 'ready to send' : 'after the proto, BOM and tech pack' },
    { key: 'sourcing', label: 'Cloth vendor · fabric PO', who: 'Sourcing · Design', on: !o.fabricNominated ? (sent ? o.styleHandover : null) : o.sourcing?.fabricPo?.on,
      by: !o.fabricNominated ? 'factory buys' : o.sourcing?.fabricPo ? `${o.sourcing.fabricPo.no} · ${nameOf(chosen?.vendorId)}` : null,
      now: !sent ? 'starts when sent' : ss.key === 'choose' || ss.key === 'raise-po' ? 'design to push the fabric PO' : ss.key === 'extend' ? 'sourcing to extend the hold' : 'sourcing to add a vendor' },
    { key: 'factory', label: 'Factory · PO', who: 'Nitin · Design', on: o.poDate, by: o.poNo ? `${o.poNo} · ${nameOf(o.vendorId)}` : null,
      now: !sent ? 'starts when sent' : fst.key === 'accepted' ? 'design to raise the PO' : fst.key === 'with-design' ? 'design to accept or send back' : 'Nitin to propose a factory' },
    { key: 'cloth', label: 'Cloth at factory', who: 'Sourcing · Factory', on: !o.fabricNominated ? o.poDate : o.fabricSupply?.receipt?.on, by: o.fabricSupply?.receipt ? `${o.fabricSupply.receipt.metresOk} m` : null,
      now: !o.poNo ? 'after the PO' : o.fabricSupply?.sentToFactoryOn ? 'factory to count it in' : 'sourcing to send it' },
    { key: 'sample', label: 'Sample approved', who: 'Factory · Production', on: sample.ppGoAhead, by: sample.approved ? `round ${sample.approved.round}` : null,
      now: !o.poNo ? 'after the PO' : sample.state === 'with production unit' ? 'production to review' : sample.state === 'resubmit' ? 'factory to resubmit' : 'factory to send the first sample' },
    { key: 'tna', label: 'Made · TNA', who: 'Nitin · Factory', on: dispatched, by: dispatched ? 'dispatched' : null,
      now: !o.poNo ? 'after the PO' : `${st.stage}${r.bufferDays != null && r.bufferDays < 0 ? ` · ${-r.bufferDays}d late` : ''}` },
    { key: 'received', label: 'Received at BSC', who: 'Warehouse', on: rc.lots.length && !rc.partial ? rc.lots[rc.lots.length - 1].at : null, by: rc.lots.length ? `${rc.received} pcs` : null,
      now: rc.partial ? `${rc.received} of ${rc.base} in` : dispatched ? 'warehouse to count it in' : 'after dispatch' },
    { key: 'launch', label: 'Launched', who: 'Planning · Design', on: launch?.launchedOn, by: launch?.dropMonth,
      now: launch ? `${launch.dropMonth} drop${launch.launchOn ? ` · ${fmtDate(launch.launchOn)}` : ''}` : 'planning puts it in a drop' },
  ];
  const current = journey.findIndex(x => !x.on);
  const [open, setOpen] = useState<string>(initial ?? journey[current]?.key ?? 'launch');
  const at = (k: string) => open === k;

  /* the order's numbers, editable by design until it is sent */
  const [qty, setQty] = useState(String(o.orderQty)); const [target, setTarget] = useState(dateInput(o.targetInhouse)); const [cost, setCost] = useState(String(o.targetCost));
  const total = o.sizeBreakup.reduce((s, x) => s + x.qty, 0);

  return <>
    <div className="grid gap-1.5 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))" }}>
      {journey.map((x, i) => { const done = !!x.on; const now = i === current;
        return <button type="button" key={x.key} onClick={() => setOpen(x.key)} aria-pressed={at(x.key)} className="px-2 py-2 text-left" title={`${x.label} · ${x.who}`}
          style={{ border: `${at(x.key) ? 2 : 1}px solid ${at(x.key) ? 'var(--ink)' : done ? 'var(--good)' : now ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, background: done ? 'color-mix(in srgb, var(--good) 7%, #fff)' : now ? 'color-mix(in srgb, var(--accent) 7%, #fff)' : '#fff', cursor: 'pointer', font: 'inherit', minWidth: 0 }}>
          <div className="flex items-start gap-1.5"><span className="cl-box" aria-hidden style={{ width: 16, height: 16, fontSize: 10, ...(done ? { background: 'var(--good)', borderColor: 'var(--good)' } : now ? { borderColor: 'var(--accent)' } : {}) }}>{done ? '✓' : ''}</span>
            <span className="text-[12px] font-medium" style={{ lineHeight: 1.25 }}>{x.label}</span></div>
          <div className="text-[10.5px] pt-1 truncate" style={{ color: done ? 'var(--ink-faint)' : now ? 'var(--accent)' : 'var(--ink-faint)' }}>{done ? `${fmtDate(x.on!)}${x.by ? ` · ${x.by}` : ''}` : now ? (x.now ?? 'now') : x.who}</div>
        </button>; })}
    </div>

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
      <ProtoSection o={o} canReview={editable} canLog={canLogProto && o.status === 'Requirement'} />
      {o.fabricNominated && <div className="pt-3">{editable ? <BriefEditor o={o} /> : <FabricBriefSection o={o} />}</div>}
      <div className="pt-3"><BomSection o={o} editable={editable} /></div>
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
          {o.poNo && <><KV k="PO" v={<b>{o.poNo}</b>} note={`raised ${fmtDate(o.poDate)}${o.factoryPo ? ` by ${o.factoryPo.by}` : ''}${o.factoryPo?.docsMissing?.length ? ` · still owed to the factory: ${o.factoryPo.docsMissing.join(', ')}` : ''}`} />
            <KV k="Factory" v={<VendorLink id={o.vendorId} />} note={o.finalFob != null ? `₹${o.finalFob}/pc · ${o.merchant ?? 'merchant to assign'}` : undefined} /></>}
          <FactoryFinalisationSection o={o} bare />
        </>}
    </Section>}

    {at('cloth') && <Section title="Cloth at the factory" collapsible={false} right={<Pill tone={fab.tone}>{o.poNo ? fab.label : 'after the PO'}</Pill>}>
      {!o.fabricNominated ? <div className="text-[12.5px] py-1" style={faint}>The factory buys its own cloth.</div>
        : !o.sourcing?.fabricPo || !o.poNo ? <div className="text-[12.5px] py-1" style={faint}>Once both POs are out, sourcing sends the cloth straight to the factory; the factory counts it in. Short cloth comes back to design for a cut ratio.</div>
        : <FabricFinalisationSection o={o} bare part="factory" />}
    </Section>}

    {at('sample') && (o.poNo ? <SampleSection o={o} editable={prod || merchant} /> : <Section title="Sample" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>The factory samples the bulk cloth once the PO is raised and the cloth has landed.</div></Section>)}

    {at('tna') && <Section title="Made · the TNA" collapsible={false} right={<Pill tone={o.status === 'Closed' ? 'neutral' : r.risk === 'on-track' ? 'good' : r.risk === 'delayed' || r.risk === 'critical' ? 'risk' : 'warn'}>{o.poNo ? (o.status === 'Closed' ? 'delivered' : `${st.stage}${r.bufferDays != null && r.bufferDays < 0 ? ` · ${-r.bufferDays}d late` : ''}`) : 'after the PO'}</Pill>}>
      {!o.poNo ? <div className="text-[12.5px] py-1" style={faint}>The milestones are generated from the PO date. Nitin and the factory merchant log each step as it happens.</div>
        : <>
          <div className="text-[12.5px] pb-2" style={{ color: 'var(--ink-soft)' }}>Due in-house {fmtDate(o.targetInhouse)}{r.bufferDays != null && o.status !== 'Closed' ? ` · ${r.bufferDays < 0 ? `${-r.bufferDays} days late` : `${r.bufferDays} days to spare`}` : ''}. Click a step to log its date.</div>
          <MilestoneGrid o={o} editable={(prod || merchant) && o.status !== 'Closed'} bare />
          <div className="pt-2"><a className="cta" href={`#/tracker?open=${o.id}`}>Open on the RTW production tracker →</a></div>
        </>}
    </Section>}

    {at('received') && (o.poNo ? <ReceiptLots o={o} editable={wh} /> : <Section title="Received at BSC" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>The warehouse counts the goods in by size when the factory dispatches.</div></Section>)}

    {at('launch') && <Section title="Launch" collapsible={false} right={<Pill tone={launch?.launchedOn ? 'good' : launch ? 'info' : 'neutral'}>{launch?.launchedOn ? `launched ${fmtDate(launch.launchedOn)}` : launch ? `${launch.dropMonth} drop` : 'not in a drop yet'}</Pill>}>
      {launch ? <>
        <KV k="Drop" v={launch.dropMonth} note={launch.launchedOn ? `launched ${fmtDate(launch.launchedOn)}` : launch.launchOn ? `launch ${fmtDate(launch.launchOn)}` : 'no date yet'} />
        <KV k="At head office" v={launch.receivedAtHo ? fmtDate(launch.receivedAtHo) : `expected ${fmtDate(launch.expectedAtHo)}`} />
        {launch.marketingName && <KV k="Marketing name" v={launch.marketingName} />}
        <div className="pt-1"><a className="cta" href={`#/launches?open=${launch.id}`}>the launch · gates, stores, marketing →</a></div>
      </> : <>{planning ? null : <div className="text-[12.5px] py-1" style={faint}>Planning puts it in a drop once it is in production; design mints the design code when the goods land.</div>}<PutInDrop o={o} /></>}
    </Section>}

    <RecordTail kind="order" subjectId={o.id} labels={FILE_LABELS.order} editable={design || prod || merchant} steps={ORDER_STEPS} />
  </>;
}
