/* An RTW style on one screen: a journey rail across the top, one step open at a time, each section
   holding only what that step needs. The chain as BSC set it on 14 Nov 2026: category fills the five-part
   requirement (sourcing adds the cloth vendor); Nitin sends the cost query and raises the PO on a reply;
   the factory returns planned dates through the merchandiser; the TNA runs with QC at five points;
   the merchandiser uploads the invoice and packing list; Prince receives on Enigma; COGS; launch.
   The same record opens from Requirements, the RTW production tracker, the merchandiser's and QC's screens. */
import { useState } from 'react';
import { useApp } from '../store';
import type { ProductionOrder } from '../domain/types';
import { fmtDate, fmtMoney, daysAgo, riskOf, stageOf, fabricStateOf } from '../domain/engines';
import { rtwJourneyOf, RTW_PHASES, RTW_INTRO, RTW_ACTOR_LABEL } from '../domain/rtwJourney';
import { FILE_LABELS, ORDER_STEPS } from '../domain/reference';
import { Section, Pill, Button, KV, Field, Input, fromDateInput, dateInput } from '../ui';
import { SizeGrid, FabricFinalisationSection } from './RtwGates';
import { PutInDrop } from './Requirements';
import { MilestoneGrid } from './Tracker';
import { MaterialsPanel } from './FactoryRtw';
import { RecordTail } from './RecordTail';
import { PackSection, CostQuerySection, PoSection, PoCostsSection, TnaPlanSection, QcChecksSection, InvoiceSection, ReceivedSection, CogsSection } from './RtwChain';
import { SOURCE_LABEL } from '../domain/rtwJourney';
import { LaunchCodes, LaunchStickers } from './Launches';

/* the steps each desk works in; every other step shows as a status line, not a panel */
const MINE: Record<string, string[]> = {
  design: ['raised', 'pack', 'cloth', 'tna', 'cogs', 'launch'],
  planning: ['raised', 'cogs', 'launch'],
  sourcing: ['pack', 'cloth'],
  production: ['raised', 'pack', 'query', 'po', 'plan', 'cloth', 'tna', 'dispatch', 'received', 'cogs'],
  merchandiser: ['query', 'po', 'plan', 'cloth', 'tna', 'dispatch', 'received'],
  qc: ['po', 'tna'],
  warehouse: ['dispatch', 'received'],
};

export function RtwRequirement({ o, initial }: { o: ProductionOrder; initial?: string }) {
  const { db, role, updateRequirement } = useApp();
  const design = role === 'design' || role === 'owner';
  const planning = role === 'planning' || role === 'owner';
  const prod = role === 'production' || role === 'owner';
  const merchant = role === 'merchandiser' || role === 'owner';
  const sourcing = role === 'sourcing' || role === 'owner';
  const qc = role === 'qc' || role === 'owner';
  const editable = design && o.status === 'Requirement';

  const fab = fabricStateOf(o); const r = riskOf(o); const st = stageOf(o);
  const launch = (db.launches ?? []).find(l => l.orderId === o.id) ?? null;
  const raised = o.activity?.find(a => /created|raised/i.test(a.what)) ?? null;
  const faint = { color: 'var(--ink-faint)' } as const;
  const { steps: journey, current, next } = rtwJourneyOf(db, o);
  const mineKeys = role === 'owner' ? null : (MINE[role] ?? []);
  const isMine = (k: string) => !mineKeys || mineKeys.includes(k);
  const firstMine = journey.slice(Math.max(current, 0)).find(x => isMine(x.key))?.key ?? journey.filter(x => isMine(x.key)).slice(-1)[0]?.key ?? journey[current]?.key ?? 'launch';
  const [open, setOpen] = useState<string>(initial && isMine(initial) ? initial : firstMine);
  /* how the open step lays its parts out: stacked (one under the other) or blocks (side by side, each part its own card) */
  const viewKey = (k: string) => `rtw-step-view:${k}`;
  const defaultView = (k: string): 'stacked' | 'blocks' => k === 'tna' || k === 'pack' || k === 'cloth' ? 'stacked' : 'blocks';
  const readView = (k: string): 'stacked' | 'blocks' => { try { const v = localStorage.getItem(viewKey(k)); return v === 'blocks' || v === 'stacked' ? v : defaultView(k); } catch { return defaultView(k); } };
  const [view, setView] = useState<'stacked' | 'blocks'>(() => readView(initial && isMine(initial) ? initial : firstMine));
  const pickView = (v: 'stacked' | 'blocks') => { setView(v); try { localStorage.setItem(viewKey(open), v); } catch { /* storage off */ } };
  const at = (k: string) => open === k && isMine(k);

  /* the order's numbers, editable by category until it is sent */
  const [qty, setQty] = useState(String(o.orderQty)); const [target, setTarget] = useState(dateInput(o.targetInhouse)); const [cost, setCost] = useState(String(o.targetCost));
  const total = o.sizeBreakup.reduce((s, x) => s + x.qty, 0);

  const mine = !!next?.act && next.act === role;
  const onTracker = typeof location !== 'undefined' && location.hash.startsWith('#/tracker');
  const panel = (k: string) => { setOpen(k); setView(readView(k)); requestAnimationFrame(() => document.getElementById(`rtw-step-${o.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); };
  const roleClass = (a: string) => a === 'merchandiser' ? 'production' : a === 'finance' ? 'production' : a;

  return <>
    {/* one line that says what happens next, and whose move it is */}
    <div className="rtw-next" data-mine={mine || undefined}>
      {next ? <>
        <span className="rtw-next-k">{mine ? 'Your move' : 'Next'}</span>
        <span className="rtw-next-v">{next.now ?? next.label}</span>
        {next.act && <span className={`pill role-${roleClass(next.act)}`}>{RTW_ACTOR_LABEL[next.act]}</span>}
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
    {at('raised') && <Section title="The ask" collapsible={false} right={<span className="pill role-design">Category</span>}>
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
      {editable && <div className="pt-2"><Button size="sm" variant="primary" onClick={() => updateRequirement(o.id, { orderQty: Number(qty), targetInhouse: fromDateInput(target) ?? o.targetInhouse, targetCost: Number(cost) })}>Save</Button></div>}
      <div className="cap pt-3">Size · qty break-up · {total} pcs</div>
      <SizeGrid breakup={o.sizeBreakup} />
    </Section>}

    {at('pack') && <div className="rtw-full"><PackSection o={o} design={design} sourcing={sourcing} /></div>}

    {at('query') && <div className="rtw-full"><CostQuerySection o={o} prod={prod} merchant={merchant} /></div>}

    {at('po') && <PoSection o={o} />}
    {at('po') && o.poNo && <div className="pt-3"><PoCostsSection o={o} design={prod} factory={merchant} /></div>}

    {at('plan') && <div className="rtw-full"><TnaPlanSection o={o} merchant={merchant} /></div>}

    {at('tna') && <Section title="The TNA" collapsible={false} right={<Pill tone={o.status === 'Closed' ? 'neutral' : r.risk === 'on-track' ? 'good' : r.risk === 'delayed' || r.risk === 'critical' ? 'risk' : 'warn'}>{o.poNo ? (o.status === 'Closed' ? 'delivered' : `${st.stage}${r.bufferDays != null && r.bufferDays < 0 ? ` · ${-r.bufferDays}d late` : ''}`) : 'after the PO'}</Pill>}>
      {!o.poNo ? <div className="text-[12.5px] py-1" style={faint}>Generated from the PO; the factory returns its planned dates on the TNA form, then logs each step as it happens. The merchandiser follows up.</div>
        : <>
          <div className="text-[12.5px] pb-2" style={{ color: 'var(--ink-soft)' }}>Due in-house {fmtDate(o.targetInhouse)}{r.bufferDays != null && o.status !== 'Closed' ? ` · ${r.bufferDays < 0 ? `${-r.bufferDays} days late` : `${r.bufferDays} days to spare`}` : ''}. Planned · revised · actual on every step; the five QC blocks close when QC passes them.</div>
          <MilestoneGrid o={o} editable={(prod || merchant) && o.status !== 'Closed'} bare />
          {!onTracker && <div className="pt-2"><a className="cta" href={`#/tracker?open=${o.id}`}>Open on the RTW production tracker →</a></div>}
        </>}
    </Section>}
    {at('tna') && o.poNo && <div className="pt-3"><QcChecksSection o={o} qc={qc} /></div>}
    {at('cloth') && <div className="rtw-full"><Section title="Cloth at the factory" collapsible={false} right={<Pill tone={o.poNo ? fab.tone : 'neutral'}>{o.poNo ? fab.label : 'after the PO'}</Pill>}>
      {!o.poNo ? <div className="text-[12.5px] py-1" style={faint}>Once the PO is out: sourcing sends the cloth to the factory, the factory counts it in; short cloth comes back to category for a cut ratio.</div>
        : !o.fabricNominated ? <div className="text-[12.5px] py-1" style={faint}>The factory sources its own cloth; its fabric PO and receipt are steps on the TNA.</div>
        : (merchant && !design && !prod) || (role === 'owner' && location.hash.startsWith('#/factory')) ? <MaterialsPanel o={o} mine /> : <FabricFinalisationSection o={o} bare part="factory" />}
    </Section></div>}

    {at('dispatch') && <div className="rtw-full"><InvoiceSection o={o} merchant={merchant} /></div>}

    {at('received') && <div className="rtw-full"><ReceivedSection o={o} /></div>}

    {at('cogs') && <CogsSection o={o} finance={prod || design} />}

    {at('launch') && <Section title="Launch" collapsible={false} right={<Pill tone={launch?.launchedOn ? 'good' : launch ? 'info' : 'neutral'}>{launch?.launchedOn ? `launched ${fmtDate(launch.launchedOn)}` : launch ? `${launch.dropMonth} drop` : 'not in a drop yet'}</Pill>}>
      {launch ? <>
        <KV k="Drop" v={launch.dropMonth} note={launch.launchedOn ? `launched ${fmtDate(launch.launchedOn)}` : launch.launchOn ? `launch ${fmtDate(launch.launchOn)}` : 'no date yet'} />
        <KV k="At head office" v={launch.receivedAtHo ? fmtDate(launch.receivedAtHo) : `expected ${fmtDate(launch.expectedAtHo)}`} />
        {launch.marketingName && <KV k="Marketing name" v={launch.marketingName} />}
        <div className="pt-1"><a className="cta" href={`#/launches?open=${launch.id}`}>the launch · gates, stores, marketing →</a></div>
      </> : <>{planning ? null : <div className="text-[12.5px] py-1" style={faint}>Planning puts it in a drop once it is in production; category mints the design code when the goods land.</div>}<PutInDrop o={o} /></>}
    </Section>}
    {/* design codes and the desk after them, on the record itself */}
    {at('launch') && launch && <div className="pt-3"><LaunchCodes l={launch} isDesign={design} /></div>}
    {at('launch') && launch?.designCode && <div className="pt-3"><LaunchStickers l={launch} canMark={design} /></div>}
        </div>
      </div>
    </div></div>

    <RecordTail kind="order" subjectId={o.id} labels={FILE_LABELS.order} editable={design || prod || merchant} steps={ORDER_STEPS} />
  </>;
}
