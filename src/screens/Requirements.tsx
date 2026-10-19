/* Design opens the order: what, how many, in which sizes, by when,
   at what cost. This is the requirement Sourcing quotes against. Today it is
   the first ~12 columns of the tracker plus a phone call. */
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import { GARMENT_CATEGORIES, SUB_CATEGORIES, SIZE_SETS } from '../domain/reference';
import type { GarmentCategory, ProductionOrder } from '../domain/types';
import { fmtDate, fmtMoney, daysAgo, TODAY, addDays, iso } from '../domain/engines';
import { Page, Card, Pill, Field, Input, Select, Button, Drawer, KV, Section, Note, Seg, dateInput, fromDateInput, useExamples } from '../ui';
import { FabricBriefSection } from './Sourcing';
import { VendorLink } from './Vendors';
import { SampleSection, ProtoSection, MaterialsCoverSection, FactoryFinalisationSection, FabricFinalisationSection, DocsChecklist, SizeGrid } from './RtwGates';
import { Files } from './Files';
import { sourcingStateOf, designFlowOf, sourcingModeOf, sendReadinessOf, type DesignStepKey } from '../domain/engines';
import type { SourcingMode } from '../domain/types';
import { Stepper } from './Flow';
import { ROLE_LABEL } from '../domain/reference';
import { RecordTail } from './RecordTail';
import { FILE_LABELS } from '../domain/reference';

import { BomSection } from './Costing';
import { ORDER_STEPS } from '../domain/reference';
import { ActsBy, OwnerPill } from './Who';
import { FlowHeader, isMyTurn } from './Flow';

const TONE: Record<ProductionOrder['status'], 'neutral' | 'info' | 'warn' | 'good' | 'accent'> = { Requirement:'warn', Quoting:'info', Allocated:'info', Open:'accent', Closed:'good', Cancelled:'neutral' };

export function Requirements() {
  const { db, role, myRole } = useApp();
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  const creating = params.get('new') === '1';
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace:true }); };
  const active = db.orders.find(o => o.id === openId) ?? null;
  const mine = role === 'design' || role === 'planning' || role === 'owner';   // design writes the style, planning says how many
  const orders = [...db.orders].sort((a, b) => b.styleHandover.localeCompare(a.styleHandover));
  // one example per status so the demo shows a requirement, a quote, an allocation and a live PO side by side
  const ex = useExamples(orders, o => o.status, { noun: 'requirements', score: o => (o.poNo ? 2 : 0) + (o.fabricBrief ? 1 : 0) + (o.bom?.length ? 1 : 0), done: o => o.status === 'Closed' && (o.deliveredQty ?? 0) > 0 });

  return (
    <Page title="RTW requirements" lede="One requirement per style, written once — sourcing, production and the warehouse all work from it."
      replaces="the first twelve columns of the tracker, typed by planning and re-typed by everyone after"
      actions={!mine ? <ActsBy role={['design', 'planning']} does="raises a new RTW requirement" inline /> : <div className="flex gap-2 items-center"><span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>RTW bulk · for an MTM fabric or construction use <a className="vlink" href="#/concepts">Concepts</a></span><Button variant="primary" onClick={() => set('new', '1')}>+ New requirement</Button></div>}>

      {ex.strip && <div className="flex justify-end mb-2">{ex.strip}</div>}
      <Card>
        <table className="t">
          <thead><tr><th>Style</th><th>Category</th><th className="num">Qty</th><th>Target inhouse</th><th className="num">Target cost</th><th>Where it is</th><th>Next</th></tr></thead>
          <tbody>
            {ex.rows.map(o => (
              <tr key={o.id} className="row" onClick={() => set('open', o.id)}>
                <td><div className="font-medium">{o.styleName}</div><div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{o.subCategory}{o.poNo ? ` · ${o.poNo}` : ''}</div></td>
                <td className="text-[12.5px]">{o.category}</td>
                <td className="num">{o.orderQty}</td>
                <td>{fmtDate(o.targetInhouse)}</td>
                <td className="num">{fmtMoney(o.targetCost)}</td>
                <td><Stepper steps={designFlowOf(db, { kind:'order', o }).steps} compact /></td>
                <td className="text-[12.5px]" style={{ maxWidth: 260, whiteSpace:'normal' }}>{(() => { const f = designFlowOf(db, { kind:'order', o }); const mine = f.now.state === 'now' && (f.now.owner === myRole || myRole === 'owner');
                  return f.now.state === 'done' ? <Pill tone="good">live</Pill> : <>
                    <div style={{ fontWeight: mine ? 600 : 400 }}>{f.now.action ?? f.now.label}</div>
                    <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{mine ? 'your turn' : `with ${ROLE_LABEL[f.now.owner] ?? f.now.owner}`} · {f.now.note}</div></>; })()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Drawer open={!!active} onClose={() => set('open', null)} title={active?.styleName ?? ''} subtitle={active && <><Pill tone={TONE[active.status]}>{active.status}</Pill><span>{active.category} · {active.subCategory}</span></>}>
        {active && <RequirementDetail o={active} editable={mine && active.status === 'Requirement'} editableAlloc={role === 'planning' || role === 'owner'} />}
      </Drawer>

      <Drawer open={creating} onClose={() => set('new', null)} title="New requirement" subtitle="Design writes it, planning says how many. Sourcing takes it from here.">
        <NewRequirement initialMode={(params.get('mode') as SourcingMode | null) ?? null} onDone={id => { const n = new URLSearchParams(params); n.delete('new'); n.delete('mode'); n.set('open', id); setParams(n, { replace:true }); }} />
      </Drawer>
    </Page>
  );
}

export function RequirementDetail({ o, editable, editableAlloc }: { o: ProductionOrder; editable: boolean; editableAlloc: boolean }) {
  const { db, role, updateRequirement, handToSourcing, setSourcingMode, markFobEmailed } = useApp();
  const readiness = sendReadinessOf(db, o);
  const isSourcing = role === 'sourcing' || role === 'owner';
  const canLogProto = role === 'production' || role === 'warehouse' || role === 'owner';
  const [qty, setQty] = useState(String(o.orderQty));
  const mode = sourcingModeOf(o);
  const [fobSupplier, setFobSupplier] = useState(o.fobNomination?.supplierVendorId ?? '');
  const mills = db.vendors.filter(v => v.kind.endsWith('mill'));
  const [target, setTarget] = useState(dateInput(o.targetInhouse));
  const [cost, setCost] = useState(String(o.targetCost));
  const total = o.sizeBreakup.reduce((s, x) => s + x.qty, 0);
  /* The drawer is the stepper, unfolded: the same six steps the row shows, in
     the same order, each holding only what belongs to it. The call sits open
     at the top and names the step that is live; the steps stay folded. */
  const f = designFlowOf(db, { kind:'order', o });
  const at = (k: DesignStepKey) => f.steps.find(x => x.key === k)!;
  const no = (k: DesignStepKey) => f.steps.findIndex(x => x.key === k) + 1;
  const title = (k: DesignStepKey) => `${no(k)} · ${at(k).label}`;
  const state = (k: DesignStepKey) => { const x = at(k); return x.state === 'done' ? <Pill tone="good">done</Pill> : x.state === 'now' ? <span className={`pill role-${x.owner}`}>now</span> : <Pill tone="neutral">later</Pill>; };
  const owner = (k: DesignStepKey) => <OwnerPill owner={ROLE_LABEL[at(k).owner]} />;
  /* open the live step from the call — the drawer's own index does the same on click */
  const jump = (k: DesignStepKey) => { const el = document.querySelector(`[data-section="${title(k)}"]`) as HTMLElement | null; if (!el) return; if (el.dataset.collapsed === 'true') el.querySelector('button')?.click(); el.scrollIntoView({ behavior:'smooth', block:'start' }); };
  const chosen = o.fabricQuotes.find(q => q.selected);
  const nameOf = (id: string | null | undefined) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const fabricLine = (o.materials ?? []).find(m => o.bom[m.bomIndex]?.kind === 'fabric');
  const launch = (db.launches ?? []).find(l => l.orderId === o.id) ?? null;
  const faint = { color:'var(--ink-faint)' } as const;

  return <>
    {/* ── the call: where it is, whose move, and the way to that step ── */}
    <Section title="The call" look="lead" collapsible={false} pending={false} ownerRole={f.now.state === 'done' ? null : f.now.owner}
      right={f.now.state === 'done' ? <Pill tone="good">live</Pill> : <span className={`pill role-${f.now.owner}`}>{ROLE_LABEL[f.now.owner]}</span>}>
      <div className="py-1"><Stepper steps={f.steps} /></div>
      {f.now.state !== 'done' && <div className="flex items-baseline gap-2 flex-wrap pt-2 text-[12.5px]">
        <span style={faint}>Next:</span>
        <b>{f.now.action ?? f.now.label}</b>
        <span style={faint}>{f.now.note}</span>
        <button type="button" className="cta" onClick={() => jump(f.now.key)}>open step {no(f.now.key)} →</button>
      </div>}
      <div className="pt-2 text-[11.5px]" style={faint}>{o.orderQty} pcs · in-house by {fmtDate(o.targetInhouse)} · target {fmtMoney(o.targetCost)} · handed over {fmtDate(o.styleHandover)}{o.fabricNominated ? ' · fabric nominated by BSC' : ' · factory sources the cloth'}</div>
    </Section>

    {/* ── 1 · what design asked for: the numbers, the sizes, the cloth, the BOM ── */}
    {/* the live step is open; every other step is one folded line — the drawer
       shows one thing to do, not six accordions with two pills each */}
    {(() => { const bodies: Record<DesignStepKey, ReactNode> = {
      'request': <>
      {!editable && <ActsBy role={['design', 'planning']} does="edits the quantity, target date and cost, and hands it to sourcing" />}
      <div className="cap">Order</div>
      {editable ? (
        <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'repeat(3,1fr)' }}>
          <Field label="Order qty"><Input type="number" value={qty} onChange={e => setQty(e.target.value)} /></Field>
          <Field label="Target inhouse"><Input type="date" value={target} onChange={e => setTarget(e.target.value)} /></Field>
          <Field label="Target cost / pc"><Input type="number" value={cost} onChange={e => setCost(e.target.value)} /></Field>
        </div>
      ) : <>
        <KV k="Order qty" v={o.orderQty} />
        <KV k="Target inhouse" v={fmtDate(o.targetInhouse)} note={`${-daysAgo(o.targetInhouse)}d from now`} />
        <KV k="Target cost" v={fmtMoney(o.targetCost)} />
      </>}
      <KV k="Style handover" v={fmtDate(o.styleHandover)} note={`lead time clock started ${daysAgo(o.styleHandover)}d ago`} />
      <KV k="Cloth" v={mode === 'bsc-buys' ? 'BSC buys it — after the PO, sourcing buys the cloth and sends it to the factory' : mode === 'fob-nominated' ? 'FOB — BSC names the supplier, the vendor buys and makes' : 'Vendor sources its own cloth'} note={mode === 'fob-nominated' ? 'BSC buys finished garments; labels and trims BSC sends are charged through the BOM' : undefined} />
      {o.fit && <KV k="Fit" v={o.fit} />}
      {o.program && <KV k="Program" v={o.program} />}
      {editable && <div className="flex gap-2 pt-3">
        <Button variant="primary" onClick={() => updateRequirement(o.id, { orderQty: Number(qty), targetInhouse: fromDateInput(target) ?? o.targetInhouse, targetCost: Number(cost) })}>Save</Button>
      </div>}

      <div className="cap">Order qty break-up · {total} pcs</div>
      <SizeGrid breakup={o.sizeBreakup} />

      <div className="pt-3"><ProtoSection o={o} canReview={editable && o.status === 'Requirement'} canLog={canLogProto && o.status === 'Requirement'} /></div>
      {o.fabricNominated && <div className="pt-3">{editable && o.status === 'Requirement' ? <BriefEditor o={o} /> : <FabricBriefSection o={o} />}</div>}
      <div className="pt-3"><BomSection o={o} editable={editable} /></div>
      <div className="pt-3"><div className="label">Job card · trim card · BOM · tech pack</div><DocsChecklist o={o} editable={editable} /></div>
      {o.status === 'Requirement' && <div className="pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div className="flex gap-2 items-center flex-wrap pt-2">
          {editable ? <Button variant="primary" disabled={!readiness.ready} onClick={() => handToSourcing(o.id)}>Send to production →</Button> : <ActsBy role={['design', 'planning']} does="sends it to production once the prototype, BOM and tech pack are on it" inline />}
          {readiness.ready ? <span className="text-[11.5px]" style={faint}>prototype {readiness.proto.state === 'skipped' ? 'not needed' : 'approved'} · tech pack on · cloth briefed{(o.fabricShortlist?.length ?? 0) > 1 ? ` · ${o.fabricShortlist!.length} candidates for sourcing to choose from` : ''}</span>
            : <span className="text-[11.5px]" style={{ color:'var(--warn)' }}>before it can go: {readiness.blockers.join(' · ')}</span>}
        </div>
      </div>}
</>,
      'vendors': <>
      {mode === 'fob-nominated' ? <>
          <div className="text-[12.5px] pb-2" style={{ color:'var(--ink-soft)' }}><b>FOB.</b> BSC finalises the cloth and names the supplier; the vendor buys it from there, funds the run and makes the garment. The nomination goes to the vendor by email — this is the record of it.</div>
          {o.fobNomination?.emailedOn ? <>
            <KV k="Nominated supplier" v={<VendorLink id={o.fobNomination.supplierVendorId} />} note={`emailed to the vendor ${fmtDate(o.fobNomination.emailedOn)} by ${o.fobNomination.by}`} />
            {o.fobNomination.note && <KV k="Terms" v={o.fobNomination.note} />}
            {o.vendorId && <KV k="Vendor" v={<VendorLink id={o.vendorId} />} note="buys the nominated cloth and makes the garment" />}
          </> : (editable || editableAlloc) ? <div className="flex items-end gap-2 flex-wrap">
            <div style={{ minWidth: 260, flex:'1 1 260px' }}><Field label="Supplier the vendor must buy from"><Select value={fobSupplier} onChange={setFobSupplier} options={[{ value:'', label:'Pick the mill…' }, ...mills.map(m => ({ value:m.id, label:m.name }))]} /></Field></div>
            <Button size="sm" disabled={!fobSupplier} onClick={() => setSourcingMode(o.id, 'fob-nominated', fobSupplier, o.fobNomination?.note ?? 'buy the nominated cloth; BSC sends labels and trims, charged through the BOM')}>Save supplier</Button>
            <Button size="sm" variant="primary" disabled={!(o.fobNomination?.supplierVendorId)} onClick={() => markFobEmailed(o.id)}>Nomination emailed to the vendor</Button>
          </div> : <ActsBy role={['design', 'planning']} does="names the supplier and emails the vendor the nomination" />}
        </>
        : <FactoryFinalisationSection o={o} />}
</>,
      'po': <>
      {mode === 'fob-nominated' ? <div className="py-2 text-[12.5px]" style={faint}>Not needed — the vendor buys the nominated cloth and BSC buys finished garments.</div>
        : o.poNo ? <><KV k="PO" v={<b>{o.poNo}</b>} note={`raised ${fmtDate(o.poDate)}${o.factoryPo ? ` by ${o.factoryPo.by}` : ''}`} /><KV k="Factory" v={<VendorLink id={o.vendorId} />} note={o.finalFob != null ? `₹${o.finalFob}/pc agreed` : undefined} />{o.factoryPo && <KV k="Documents with the PO" v={o.factoryPo.docsSent.join(', ') || 'none'} note={o.factoryPo.docsMissing.length ? `owed: ${o.factoryPo.docsMissing.join(', ')}` : undefined} />}</>
        : <div className="py-2 text-[12.5px]" style={faint}>{at('po').note} — <button type="button" className="vlink" onClick={() => jump('vendors')}>step {no('vendors')}</button></div>}
</>,
      'fabric-in': <>
      <FabricFinalisationSection o={o} />
      {o.fabricNominated && o.poNo && <div className="pt-3"><MaterialsCoverSection o={o} editable={isSourcing} /></div>}
</>,
      'sampling': <>
      {!o.poNo ? <div className="py-2 text-[12.5px]" style={faint}>The factory samples the bulk cloth once the PO is raised and the fabric has landed with it.</div> : <SampleSection o={o} editable={editable} />}
</>,
      'live': <>
      {launch ? <>
        <KV k="Drop" v={launch.dropMonth} note={launch.launchedOn ? `launched ${fmtDate(launch.launchedOn)}` : launch.launchOn ? `launch ${fmtDate(launch.launchOn)}` : 'no date yet'} />
        <KV k="At head office" v={launch.receivedAtHo ? fmtDate(launch.receivedAtHo) : `expected ${fmtDate(launch.expectedAtHo)}`} />
        {launch.marketingName && <KV k="Marketing name" v={launch.marketingName} />}
        <div className="pt-1"><a className="cta" href={`#/launches?open=${launch.id}`}>the launch · gates, stores, marketing →</a></div>
      </> : <><div className="py-2 text-[12.5px]" style={faint}>{at('live').note}</div><PutInDrop o={o} /></>}
</>
    };
      const nowKey = f.now.state === 'done' ? null : f.now.key; const others = f.steps.filter(x => x.key !== nowKey);
      return <>
        {nowKey && <Section title={title(nowKey)} defaultOpen right={state(nowKey)} ownerRole={at(nowKey).owner}>{bodies[nowKey]}</Section>}
        <Section title={`${nowKey ? 'Other steps' : 'All steps'} · ${others.length}`} look="fold" pending={false} ownerRole={null}
          right={<span className="flex gap-1 flex-wrap justify-end">{others.map(x => <span key={x.key} className={`pill ${x.state === 'done' ? 'good' : ''}`} title={x.note}>{x.state === 'done' ? '✓ ' : ''}{x.label}</span>)}</span>}>
          {others.map(x => <Section key={x.key} title={title(x.key)} right={state(x.key)} ownerRole={at(x.key).owner}>{bodies[x.key]}</Section>)}
        </Section>
      </>; })()}

    {/* ── the style sheet: today typed by hand per style; here it prints off the record ── */}
    <Section title="Style sheet · job card" pending={false} ownerRole="design" right={<Pill tone="neutral">prints off the record</Pill>}>
      <div className="text-[12.5px] pb-2" style={{ color:'var(--ink-soft)' }}>Style, category, fit, quantity and sizes, the cloth and how it is bought, the BOM lines and the dates — one page for the factory, generated from what is on this record. Change the record and the sheet follows.</div>
      <div className="flex items-center gap-3 flex-wrap">
        <Button size="sm" variant="primary" onClick={() => {
          const bom = o.bom.map(l => `<tr><td>${l.kind}</td><td>${l.item}${l.spec ? ` <span class="k">· ${l.spec}</span>` : ''}</td><td class="n">${l.qtyPerPc ?? '—'} ${l.unit}</td></tr>`).join('');
          const sizes = o.sizeBreakup.map(x => `<td class="n"><div class="k">${x.size}</div>${x.qty}</td>`).join('');
          const w = window.open('', '_blank', 'width=820,height=1000'); if (!w) return;
          w.document.write(`<!doctype html><title>Style sheet · ${o.styleName}</title><style>@page{size:A4;margin:16mm}body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1f1f16;margin:0}h1{font-size:22px;margin:0 0 2px}.sub{color:#666;font-size:12px;margin-bottom:14px}table{border-collapse:collapse;width:100%;font-size:12.5px;margin-top:8px}td,th{border:1px solid #ccc;padding:5px 8px;text-align:left;vertical-align:top}th{background:#f3f2ec;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase}.n{text-align:right;font-family:ui-monospace,Menlo,monospace}.k{font-size:10px;color:#666}h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#666;margin:18px 0 4px}</style>
            <h1>${o.styleName}</h1><div class="sub">${o.category} · ${o.subCategory}${o.fit ? ` · ${o.fit}` : ''} · ${o.poNo ?? 'no PO yet'}</div>
            <table><tr><th>Order qty</th><th>Target in-house</th><th>Target cost</th><th>Cloth</th><th>Factory</th></tr>
            <tr><td class="n">${o.orderQty} pcs</td><td>${fmtDate(o.targetInhouse)}</td><td class="n">${fmtMoney(o.targetCost)}</td><td>${mode === 'bsc-buys' ? 'BSC buys' : mode === 'fob-nominated' ? `FOB · from ${db.vendors.find(v => v.id === o.fobNomination?.supplierVendorId)?.name ?? 'nominated supplier'}` : 'vendor sources'}</td><td>${db.vendors.find(v => v.id === o.vendorId)?.name ?? '—'}</td></tr></table>
            <h2>Size breakup</h2><table><tr>${sizes}</tr></table>
            <h2>Fabric</h2><table><tr><th>Cloth</th><th>Composition</th><th>Colour</th><th>Vendor · article</th></tr><tr><td>${o.fabricBrief?.look ?? '—'}</td><td>${o.fabricBrief?.composition ?? '—'}</td><td>${o.fabricBrief?.colour ?? '—'}</td><td>${db.vendors.find(v => v.id === o.fabricVendorId)?.name ?? '—'}${o.vendorFabricCode ? ` · ${o.vendorFabricCode}` : ''}${o.enigmaCode ? ` · ${o.enigmaCode}` : ''}</td></tr></table>
            <h2>Bill of materials</h2><table><tr><th>Kind</th><th>Item</th><th>Per piece</th></tr>${bom}</table>
            <h2>Notes</h2><div style="font-size:12.5px;min-height:60px;border:1px solid #ccc;padding:8px">${o.remarks || ''}</div>
            <script>window.onload=()=>window.print()</script>`); w.document.close(); }}>Print style sheet</Button>
        <span className="text-[11.5px]" style={faint}>{o.bom.length} BOM lines · {o.sizeBreakup.length} sizes · {mode === 'fob-nominated' ? 'FOB terms on the sheet' : mode === 'bsc-buys' ? 'BSC-bought cloth' : 'vendor-sourced cloth'}</span>
      </div>
    </Section>

    {/* ── the record's tail: money, files, talk, history ── */}
    <RecordTail kind="order" subjectId={o.id} labels={FILE_LABELS.order} editable steps={ORDER_STEPS} activity={o.activity} />
  </>;
}

export function NewRequirement({ onDone, initialMode }: { onDone: (id: string) => void; initialMode?: SourcingMode | null }) {
  const { db, createRequirement, setSourcingMode } = useApp();
  const [category, setCategory] = useState<GarmentCategory>('RTW CMT shirts');
  const [mode, setMode] = useState<SourcingMode>(initialMode ?? 'bsc-buys');
  const [fobSupplier, setFobSupplier] = useState('');
  const mills = db.vendors.filter(v => v.kind.endsWith('mill'));
  const [sub, setSub] = useState(SUB_CATEGORIES['RTW CMT shirts'][0]);
  const [style, setStyle] = useState('');
  const [qty, setQty] = useState('300');
  const [target, setTarget] = useState(dateInput(iso(addDays(TODAY, 60))));
  const [cost, setCost] = useState('450');
  const nominated = mode === 'bsc-buys';
  const [look, setLook] = useState(''); const [comp, setComp] = useState('100% cotton'); const [colour, setColour] = useState(''); const [refId, setRefId] = useState(''); const [notes, setNotes] = useState('');
  const sizes = SIZE_SETS[category];
  const mid = (sizes.length - 1) / 2; const w = sizes.map((_, i) => 1 / (1 + Math.abs(i - mid))); const sum = w.reduce((a, b) => a + b, 0);
  const spread = sizes.map((size, i) => ({ size, qty: Math.max(1, Math.round((w[i] / sum) * Number(qty || 0))) }));
  /* the curve starts as a spread over the category's usual sizes; any of the sheet's twenty sizes can be typed over it */
  const [typed, setTyped] = useState<Record<string, number> | null>(null);
  const curve = typed ? Object.entries(typed).filter(([, n]) => n > 0).map(([size, q]) => ({ size, qty: q })) : spread;

  return <>
    <Section title="What" collapsible={false}>
      <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <Field label="Category (decides the milestone template)"><Select value={category} onChange={v => { setCategory(v as GarmentCategory); setSub(SUB_CATEGORIES[v as GarmentCategory][0]); }} options={GARMENT_CATEGORIES.map(c => ({ value:c, label:c }))} /></Field>
        <Field label="Sub-category"><Select value={sub} onChange={setSub} options={SUB_CATEGORIES[category].map(s => ({ value:s, label:s }))} /></Field>
        <div style={{ gridColumn:'1 / -1' }}><Field label="Style / colour"><Input value={style} onChange={e => setStyle(e.target.value)} placeholder="2-Ply Egyptian Cotton White Twill Shirt" /></Field></div>
      </div>
    </Section>
    <Section title="How many, by when, at what cost" collapsible={false}>
      <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'repeat(3,1fr)' }}>
        <Field label="Order qty"><Input type="number" value={qty} onChange={e => setQty(e.target.value)} /></Field>
        <Field label="Target inhouse date"><Input type="date" value={target} onChange={e => setTarget(e.target.value)} /></Field>
        <Field label="Target cost / pc (₹)"><Input type="number" value={cost} onChange={e => setCost(e.target.value)} /></Field>
      </div>
      <div className="pt-3">
        <Seg value={mode} onChange={setMode} label="The cloth" options={[
          { id:'bsc-buys', label:'BSC buys it', hint:'after the PO, sourcing buys the cloth against the brief and sends it straight to the factory' },
          { id:'vendor-sources', label:'Vendor sources', hint:'the vendor finds and buys its own cloth' },
        ]} />
      </div>
    </Section>
    {mode !== 'vendor-sources' && <Section title={mode === 'bsc-buys' ? 'What fabric — the brief sourcing shops against' : 'What fabric — what the vendor must buy'} collapsible={false}>
      <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'1fr 1fr 1fr' }}>
        <Field label="Cloth / weave" hint="the word you would say to the mill"><Input value={look} onChange={e => setLook(e.target.value)} placeholder="Oxford, 2-ply poplin, brushed twill" /></Field>
        <Field label="Composition"><Input value={comp} onChange={e => setComp(e.target.value)} placeholder="100% cotton" /></Field>
        <Field label="Colour"><Input value={colour} onChange={e => setColour(e.target.value)} placeholder="Ecru" /></Field>
        <div style={{ gridColumn:'1 / -1' }}><Field label="Close to an MTM fabric we already carry?" hint="gives sourcing a mill and an article to start from"><Select value={refId} onChange={setRefId} options={[{ value:'', label:'No — new cloth' }, ...db.fabrics.filter(f => !look.trim() || `${f.name} ${f.composition ?? ''} ${f.family}`.toLowerCase().includes(look.trim().toLowerCase())).slice(0, 40).map(f => ({ value:f.id, label:`${f.name} · ${db.vendors.find(v => v.id === f.vendorId)?.name ?? ''}` }))]} /></Field></div>
        <div style={{ gridColumn:'1 / -1' }}><Field label="Notes for sourcing"><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="handfeel over price; must hold a crease; match last season's shade" /></Field></div>
      </div>
    </Section>}
    <Section title="Order qty break-up" collapsible={false} right={typed ? <Button size="sm" variant="ghost" onClick={() => setTyped(null)}>Spread {qty || 0} over the usual sizes again</Button> : <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>spread over the usual sizes — type over any of them</span>}>
      <SizeGrid breakup={curve} edit onChange={(sz, n) => setTyped(t => { const base = t ?? Object.fromEntries(spread.map(x => [x.size, x.qty])); return { ...base, [sz]: n }; })} />
    </Section>
    <Note>Handing over starts the lead-time clock; the category picks the TNA milestone template.</Note>
    <div className="flex gap-2"><Button variant="primary" disabled={!style.trim() || !Number(qty)} onClick={() => { const id = createRequirement({
      category, subCategory: sub, styleName: style.trim(), program: null, launchMonth: null, fit: category.includes('hirt') ? 'Tailored Fit' : null,
      orderQty: typed ? curve.reduce((a, x) => a + x.qty, 0) : Number(qty), sizeBreakup: curve, targetInhouse: fromDateInput(target)!, targetCost: Number(cost), styleHandover: iso(TODAY), fabricNominated: nominated, remarks: '',
      fabricBrief: mode !== 'vendor-sources' ? { look: look.trim() || style.trim(), composition: comp.trim() || null, colour: colour.trim() || null, weightGsm: null, referenceFabricId: refId || null, notes: notes.trim() } : null,
    }); if (mode !== 'bsc-buys') setSourcingMode(id, mode, null, undefined); onDone(id); }}>Create requirement</Button></div>
  </>;
}

/* Design edits the brief while the requirement is still theirs. Once it is
   handed over, sourcing shops against the frozen text. */
export function BriefEditor({ o }: { o: ProductionOrder }) {
  const { db, updateRequirement, updateShortlist } = useApp();
  const b = o.fabricBrief;
  const [list, setList] = useState<NonNullable<ProductionOrder['fabricShortlist']>>(o.fabricShortlist ?? []);
  const [cLook, setCLook] = useState(''); const [cComp, setCComp] = useState(''); const [cColour, setCColour] = useState(''); const [cNote, setCNote] = useState('');
  const addCand = () => { if (!cLook.trim()) return; setList(l => [...l, { id:`sl-${Date.now().toString(36)}`, look: cLook.trim(), composition: cComp.trim() || null, colour: cColour.trim() || null, referenceFabricId: null, note: cNote.trim() }]); setCLook(''); setCComp(''); setCColour(''); setCNote(''); };
  const [look, setLook] = useState(b?.look ?? ''); const [comp, setComp] = useState(b?.composition ?? ''); const [colour, setColour] = useState(b?.colour ?? '');
  const [refId, setRefId] = useState(b?.referenceFabricId ?? ''); const [notes, setNotes] = useState(b?.notes ?? '');
  return <Section title="What fabric — the brief sourcing shops against" collapsible={false} right={<OwnerPill editable owner="Design" />}>
    <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'1fr 1fr 1fr' }}>
      <Field label="Cloth / weave"><Input value={look} onChange={e => setLook(e.target.value)} placeholder="Oxford, 2-ply poplin" /></Field>
      <Field label="Composition"><Input value={comp} onChange={e => setComp(e.target.value)} placeholder="100% cotton" /></Field>
      <Field label="Colour"><Input value={colour} onChange={e => setColour(e.target.value)} placeholder="Ecru" /></Field>
      <div style={{ gridColumn:'1 / -1' }}><Field label="Close to an MTM fabric we already carry?"><Select value={refId} onChange={setRefId} options={[{ value:'', label:'No — new cloth' }, ...db.fabrics.filter(f => !look.trim() || `${f.name} ${f.composition ?? ''} ${f.family}`.toLowerCase().includes(look.trim().toLowerCase())).slice(0, 40).map(f => ({ value:f.id, label:`${f.name} · ${db.vendors.find(v => v.id === f.vendorId)?.name ?? ''}` }))]} /></Field></div>
      <div style={{ gridColumn:'1 / -1' }}><Field label="Notes for sourcing"><Input value={notes} onChange={e => setNotes(e.target.value)} /></Field></div>
    </div>
    <div className="pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
      <div className="label">Or a shortlist — sourcing picks one</div>
      <div className="text-[11.5px] pb-1" style={{ color:'var(--ink-faint)' }}>Send two or three candidates and let sourcing finalise the cloth internally: they pick one, record why, and add the vendor for that one.</div>
      {list.map((c, i) => <div key={c.id} className="kv"><span className="k"><b style={{ color:'var(--ink)' }}>{i + 1}. {c.look}</b>{c.composition ? ` · ${c.composition}` : ''}{c.colour ? ` · ${c.colour}` : ''}{c.note ? <div className="text-[11px]">{c.note}</div> : null}</span><span className="v">{o.fabricPick?.shortlistId === c.id ? <Pill tone="good">sourcing's pick</Pill> : <Button size="sm" variant="ghost" onClick={() => setList(l => l.filter(x => x.id !== c.id))}>remove</Button>}</span></div>)}
      <div className="grid gap-2 py-1 items-end" style={{ gridTemplateColumns:'1.4fr 1fr 1fr 1.4fr auto' }}>
        <Input value={cLook} onChange={e => setCLook(e.target.value)} placeholder="cloth / weave" />
        <Input value={cComp} onChange={e => setCComp(e.target.value)} placeholder="composition" />
        <Input value={cColour} onChange={e => setCColour(e.target.value)} placeholder="colour" />
        <Input value={cNote} onChange={e => setCNote(e.target.value)} placeholder="note" onKeyDown={e => e.key === 'Enter' && addCand()} />
        <Button size="sm" disabled={!cLook.trim()} onClick={addCand}>+ candidate</Button>
      </div>
      {(list.length !== (o.fabricShortlist?.length ?? 0) || list.some((c, i) => c.id !== o.fabricShortlist?.[i]?.id)) && <div className="pt-1"><Button size="sm" variant="primary" onClick={() => updateShortlist(o.id, list)}>Save shortlist · {list.length}</Button></div>}
    </div>
    <div className="pt-2"><Button size="sm" onClick={() => updateRequirement(o.id, { fabricBrief: { look: look.trim() || o.styleName, composition: comp.trim() || null, colour: colour.trim() || null, weightGsm: b?.weightGsm ?? null, referenceFabricId: refId || null, notes: notes.trim() } })}>Save brief</Button></div>
  </Section>;
}


/* "Add to a drop", from the requirement's own Go live step — so the launch is
   linked to THIS requirement, not guessed from a style name. Planning's move:
   the drop month, when the goods reach head office, the launch date, and the
   pointers marketing will need. The same launch then runs on RTW launches. */
function PutInDrop({ o }: { o: ProductionOrder }) {
  const { db, role, createLaunch } = useApp();
  const canPlan = role === 'planning' || role === 'owner';
  const months = Array.from({ length: 5 }, (_, i) => { const d = new Date(TODAY); d.setMonth(d.getMonth() + i + 1); return d.toLocaleDateString('en-GB', { month:'short', year:'2-digit' }).replace(' ', ' '); });
  const [drop, setDrop] = useState(months[0]);
  const [expected, setExpected] = useState(dateInput(o.targetInhouse));
  const [launchOn, setLaunchOn] = useState(dateInput(iso(addDays(new Date(o.targetInhouse), 14))));
  const [pointers, setPointers] = useState(o.fabricBrief ? `${o.fabricBrief.look}${o.fabricBrief.composition ? ` · ${o.fabricBrief.composition}` : ''}` : '');
  const opt = db.options.find(x => x.styleName === o.styleName) ?? null;
  const save = () => { const id = createLaunch({ optionId: opt?.id ?? `pending-${o.id}`, styleName: o.styleName, dropMonth: drop, orderId: o.id, expectedAtHo: fromDateInput(expected) ?? o.targetInhouse, launchOn: fromDateInput(launchOn), hero: false, keyPointers: pointers.trim() }); void id; };
  if (!canPlan) return <ActsBy role="planning" does="puts the style into a drop — the month, the head-office date, the launch date" />;
  return <div className="mt-2 px-3 py-2" style={{ background:'var(--surface-2)', borderRadius: 6 }}>
    <div className="cap" style={{ margin:'0 0 6px' }}>Put it in a drop · planning</div>
    <div className="vgrid">
      <div style={{ gridColumn:'span 3' }}><Field label="Drop"><Select value={drop} onChange={setDrop} options={months.map(m => ({ value:m, label:m }))} /></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="At head office by" hint="the Monthly Drops sheet's Expected Date — defaults to the target in-house date" hintOn="label"><Input type="date" value={expected} onChange={e => setExpected(e.target.value)} /></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="Launch on" hint="displays out, POS and online switched on" hintOn="label"><Input type="date" value={launchOn} onChange={e => setLaunchOn(e.target.value)} /></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="Option in the book" hint="the RTW option this style becomes; matched by name, or created when the goods land" hintOn="label"><div className="input" style={{ background:'var(--surface)', color: opt ? undefined : 'var(--ink-faint)' }}>{opt ? opt.styleName : 'new option · on arrival'}</div></Field></div>
      <div style={{ gridColumn:'1 / -1' }}><Field label="Pointers for marketing"><Input value={pointers} onChange={e => setPointers(e.target.value)} placeholder="100% cotton, soft & breathable — say it in the first sentence" /></Field></div>
    </div>
    <div className="flex items-center gap-2 pt-2 flex-wrap"><Button size="sm" variant="primary" onClick={save}>Add to drop</Button><span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>creates the launch, linked to this requirement · the gates start ticking on RTW launches</span></div>
  </div>;
}
