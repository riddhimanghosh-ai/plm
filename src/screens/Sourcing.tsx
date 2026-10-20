/* Sourcing's desk for BULK STYLES. Design hands over a requirement; sourcing
   puts a vendor against it with its terms — price, lead, how long the mill
   holds; design pushes the PO, rejects, or asks for more time; sourcing then
   gets the cloth in. The factory is never quoted — it is allocated on capacity,
   the way MTM is. Option requests ("ten options for shirts") are the same
   handoff at a different grain, and live on the Option requests screen. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RecordTail } from './RecordTail';
import { ConceptOptions } from './Concepts';
import { RequestDetail } from './OptionRequests';
import { Files } from './Files';
import { FILE_LABELS } from '../domain/reference';

import { VendorLink } from './Vendors';
import { BomSection, CostingSection } from './Costing';
import { ORDER_STEPS } from '../domain/reference';
import { useApp } from '../store';
import type { ProductionOrder } from '../domain/types';
import { fabricNeededBy, factoryOptions, sourcingStateOf, suggestMills, fmtDate, fmtMoney, daysAgo, TODAY, addDays, iso } from '../domain/engines';
import { Page, Card, Pill, Field, Input, Select, Button, Drawer, KV, Section, Note, dateInput, fromDateInput, Empty, Seg, usePager, Pager, ExportButton, Th, useExamples, type Tone } from '../ui';
import { ActsBy } from './Who';
import { MaterialsCoverSection, FabricFinalisationSection, SizeGrid } from './RtwGates';
import { fabricStateOf, designFlowOf, conceptOf, openFabricPos, rtwDocsOf } from '../domain/engines';
import type { Concept, OptionRequest } from '../domain/types';
import { MTM_ONLY, catLabel, OPTIONS_OFF } from '../domain/edition';

export function Sourcing() {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  const open = (id: string | null) => { const n = new URLSearchParams(params); id ? n.set('open', id) : n.delete('open'); setParams(n, { replace:true }); };
  const active = db.orders.find(o => o.id === openId) ?? null;
  const activeConcept = (db.concepts ?? []).find(c => c.id === openId) ?? null;
  const activeRequest = (db.optionRequests ?? []).find(r => r.id === openId) ?? null;

  /* fabric is only sourced when BSC nominates it; an FOB factory buys its own.
     A row leaves this desk once its fabric PO is raised. */
  /* a row stays on this desk until the factory is allocated: after design
     raises the PO, getting the cloth in is still sourcing's job */
  /* Nitin's flow (3 Oct 2026): sourcing starts once design has raised the PO to the factory — buy the cloth, send it straight to the factory. Legacy quoting rows stay visible until they clear. */
  /* one loop for MTM and RTW: the request arrives, sourcing puts a vendor, design pushes the fabric PO, sourcing gets the cloth to the factory */
  const inbox = db.orders.filter(o => o.fabricNominated && (o.status === 'Quoting' || o.status === 'Allocated' || o.status === 'Open') && !['received', 'vendor-sources', 'drafting'].includes(fabricStateOf(o).key));
  const vendorSources = db.orders.filter(o => (o.status === 'Requirement' || o.status === 'Quoting') && !o.fabricNominated);
  const needed = (o: ProductionOrder) => o.costing.consumption != null ? Math.ceil(o.costing.consumption * o.orderQty) : null;
  const briefOf = (o: ProductionOrder) => o.fabricBrief ? [o.fabricBrief.look, o.fabricBrief.composition, o.fabricBrief.colour].filter(Boolean).join(' · ') : '—';

  const sorted = [...inbox].sort((a, b) => fabricNeededBy(a).localeCompare(fabricNeededBy(b)));
  const categories = [...new Set(sorted.map(o => o.category))].sort();
  const [stage, setStage] = useState<string>('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  /* after the PO the fabric state is the truth; before it, the old quote states still apply */
  const rowState = (o: ProductionOrder) => { if (true) { const f = fabricStateOf(o); return { key: f.key as string, label: f.label, tone: f.tone as 'neutral' | 'info' | 'warn' | 'risk' | 'good', owner: f.owner }; } const ss = sourcingStateOf(o); return { key: ss.key as string, label: ss.label, tone: (ss.tone === 'accent' ? 'info' : ss.tone) as 'neutral' | 'info' | 'warn' | 'risk' | 'good', owner: ss.owner }; };
  const n = (k: string) => sorted.filter(o => rowState(o).key === k).length;
  const filtered = sorted.filter(o => {
    const k = rowState(o).key;
    if (stage !== 'all' && !(k === stage || (stage === 'short' && (k === 'ratio-asked' || k === 'ratio-given')))) return false;
    if (category !== 'all' && o.category !== category) return false;
    const t = search.trim().toLowerCase();
    if (t && !`${o.styleName} ${briefOf(o)} ${db.vendors.find(v => v.id === o.fabricVendorId)?.name ?? ''}`.toLowerCase().includes(t)) return false;
    return true;
  });
  /* one requirement per sourcing state — vendors to add, design to choose, an
     extension asked, a PO raised — so the handful shows whose turn it can be */
  const ex = useExamples(filtered, o => rowState(o).key, { noun:'styles', done: o => rowState(o).key === 'received' });
  const pager = usePager(ex.rows, 20);
  const TONE: Record<string, Tone> = { neutral:'neutral', info:'info', warn:'warn', risk:'risk', good:'good', accent:'accent' };
  const side = MTM_ONLY ? 'mtm' : ((params.get('side') as 'mtm' | 'rtw' | null) ?? 'rtw');
  const setSide = (k: string) => { const n = new URLSearchParams(params); n.set('side', k); n.delete('open'); setParams(n, { replace:true }); };
  /* one short phrase per state — the long sentence lives on the record */
  const shortLabel = (key: string, label: string) => ({ 'add-vendor':'put a vendor', 'with-design':'with design · push the PO', extension:'extend the hold', 'wait-factory':'fabric PO raised · no factory yet', bought:'fabric PO raised · send it', sent:'at the factory · being counted', received:'received', short:'short at the factory', 'ratio-asked':'short · design deciding the cut', 'ratio-given':'short · new ratio given' } as Record<string, string>)[key] ?? label;
  const mtmRows = mtmSourcingRows(db);

  return (
    <Page title="Fabric sourcing" lede="Sourcing's desk: new MTM fabrics to find a mill for, and the cloth to buy and send for every RTW purchase order."
      replaces="five vendor emails a morning, a price remembered from last season, a WhatsApp to design asking 'which one?'">
      {!MTM_ONLY && <div className="mb-3"><Seg value={side} onChange={setSide} options={[
        { id:'mtm', label:'MTM · new fabrics for the books', count: mtmRows.filter(r => r.mine).length },
        { id:'rtw', label:'RTW · cloth for bulk styles', count: sorted.filter(o => rowState(o).owner === 'sourcing').length },
      ]} /></div>}

      {side === 'mtm' && <MtmSourcing rows={mtmRows} onOpen={id => open(id)} />}

      {side === 'rtw' && (inbox.length === 0 ? <Card><Empty title="No cloth to source." body="A style lands here the day design sends the request." /></Card> : <>
        <div className="flex items-end gap-3 flex-wrap mb-3">
          <Seg value={stage} onChange={setStage} options={[
            { id:'all', label:'All', count: sorted.length },
            { id:'add-vendor', label:'Put a vendor', count: n('add-vendor') },
            { id:'with-design', label:'With design', count: n('with-design') },
            { id:'extension', label:'Extension asked', count: n('extension') },
            { id:'wait-factory', label:'PO raised · no factory yet', count: n('wait-factory') },
            { id:'bought', label:'Send to factory', count: n('bought') },
            { id:'sent', label:'At the factory', count: n('sent') },
            { id:'short', label:'Short', count: n('short') + n('ratio-asked') + n('ratio-given') },
          ]} />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="style or mill" style={{ width:200 }} />
        </div>
        <Card>
          {pager.pageRows.length === 0 ? <Empty title="Nothing matches." body="Loosen the filter or clear the search." /> : <>
          <table className="t">
            <thead><tr><th>Style</th><th>Factory</th><th className="num">Metres</th><th>Needed by</th><th>Mill · fabric PO</th><th>Status</th></tr></thead>
            <tbody>{pager.pageRows.map(o => { const st = rowState(o); const by = fabricNeededBy(o); const mill = db.vendors.find(v => v.id === o.fabricVendorId)?.name;
              return <tr key={o.id} className="row" onClick={() => open(o.id)}>
                <td style={{ minWidth: 220 }}><div className="font-medium">{o.styleName}</div><div className="text-[12px]" style={{ color:'var(--ink-faint)', maxWidth: 340, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{briefOf(o) !== '—' ? briefOf(o) : o.category}</div></td>
                <td className="text-[12.5px]" style={{ whiteSpace:'nowrap' }}>{o.vendorId ? db.vendors.find(v => v.id === o.vendorId)?.name : <span style={{ color:'var(--ink-faint)' }}>not yet</span>}<div className="mono text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{o.poNo ?? 'no factory PO'}</div></td>
                <td className="num">{o.fabricMetres ?? needed(o) ?? '—'}</td>
                <td style={{ whiteSpace:'nowrap', color: daysAgo(by) > -7 && !['received', 'sent'].includes(st.key) ? 'var(--risk)' : undefined }}>{fmtDate(by)}</td>
                <td className="text-[12.5px]">{mill ?? (o.fabricQuotes.length ? <span>{db.vendors.find(v => v.id === o.fabricQuotes[0].vendorId)?.name} <span style={{ color:'var(--ink-faint)' }}>· offered</span></span> : <span style={{ color:'var(--ink-faint)' }}>—</span>)}{o.sourcing?.fabricPo ? <div className="mono text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{o.sourcing.fabricPo.no} · {o.enigmaCode}</div> : o.costing.cpm != null && mill ? <div style={{ color:'var(--ink-faint)' }}>₹{o.costing.cpm}/m</div> : null}</td>
                <td><Pill tone={TONE[st.tone]}>{shortLabel(st.key, st.label)}</Pill></td>
              </tr>; })}</tbody>
          </table>
          <Pager page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} from={pager.from} to={pager.to} total={pager.total} noun="styles" />
          </>}
        </Card>
      </>)}

      <Drawer open={!!activeConcept} onClose={() => open(null)} title={activeConcept ? (activeConcept.naming.newName ?? activeConcept.name) : ''} subtitle={activeConcept && <span>MTM fabric · {activeConcept.book ?? 'no book named'}{activeConcept.targetMonth ? ` · wanted by ${activeConcept.targetMonth}` : ''}</span>}>
        {activeConcept && <MtmBrief c={activeConcept} />}
      </Drawer>
      <Drawer open={!!activeRequest} onClose={() => open(null)} title={activeRequest ? `${activeRequest.reqNo} · ${catLabel(activeRequest.category)}` : ''}>
        {activeRequest && <RequestDetail r={activeRequest} focusOptionId={params.get('slot')} />}
      </Drawer>
      <Drawer open={!!active} onClose={() => open(null)} title={active?.styleName ?? ''} subtitle={active && <><Pill tone={TONE[rowState(active).tone]}>{shortLabel(rowState(active).key, rowState(active).label)}</Pill><span>{active.orderQty} pcs · {active.poNo ?? 'no PO yet'} · in-house by {fmtDate(active.targetInhouse)}</span></>}>
        {active && <>
          <FabricBriefSection o={active} />
          <FabricFinalisationSection o={active} />
          {active.poNo && <MaterialsCoverSection o={active} editable />}
          <RecordTail kind="order" subjectId={active.id} labels={FILE_LABELS.order} editable steps={ORDER_STEPS} activity={active.activity} />
        </>}
      </Drawer>
    </Page>
  );
}

/* ---------- what design asked for — read-only on sourcing's side ------------ */
export function FabricBriefSection({ o }: { o: ProductionOrder }) {
  const { db, role, pickFromShortlist } = useApp();
  const b = o.fabricBrief;
  const isSourcing = role === 'sourcing' || role === 'owner';
  const sl = o.fabricShortlist ?? [];
  const [why, setWhy] = useState(''); const [picking, setPicking] = useState<string | null>(null);
  const ref = b?.referenceFabricId ? db.fabrics.find(f => f.id === b.referenceFabricId) : null;
  if (!o.fabricNominated) return <Section title="Fabric" right={<Pill tone="neutral">factory sources it</Pill>}><div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Not nominated by BSC — the FOB factory buys its own cloth and quotes it inside the piece price.</div></Section>;
  const docs = rtwDocsOf(db, o);
  const fabricLine = o.bom.find(l => l.kind === 'fabric');
  const need = o.fabricMetres ?? (o.costing.consumption != null ? Math.ceil(o.costing.consumption * o.orderQty) : null);
  return <Section title="What design asked for" defaultOpen right={<Pill tone={docs.missing.length ? 'warn' : 'good'}>{docs.missing.length ? `${docs.missing.length} document${docs.missing.length === 1 ? '' : 's'} missing` : 'brief complete'}</Pill>}>
    <div className="label">The style</div>
    <KV k="Style / colour" v={<b>{o.styleName}</b>} note={`${o.category} · ${o.subCategory}`} />
    {o.program && <KV k="Programme" v={o.program} />}
    {o.launchMonth && <KV k="Launch month" v={o.launchMonth} />}
    {o.fit && <KV k="Fit" v={o.fit} />}
    <KV k="Target price" v={fmtMoney(o.targetCost)} note="per piece, all in — the cloth has to fit inside this" />
    <KV k="Target inhouse date" v={fmtDate(o.targetInhouse)} note={`cloth needed at the factory by ${fmtDate(fabricNeededBy(o))}`} />
    <div className="label pt-2">Order qty break-up</div>
    <SizeGrid breakup={o.sizeBreakup} />

    <div className="label pt-3">The cloth</div>
    {!b ? <div className="py-1 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>No fabric brief written — sourcing is shopping against the style name alone.</div> : <>
      <KV k="Cloth / weave" v={<b>{b.look}</b>} />
      <KV k="Composition" v={b.composition ?? '—'} />
      <KV k="Colour" v={b.colour ?? '—'} />
      {b.weightGsm != null && <KV k="Weight" v={`${b.weightGsm} gsm`} />}
      <KV k="Close to an MTM fabric we carry" v={ref ? ref.name : 'no — new cloth'} note={ref ? `${ref.code} · ${db.vendors.find(v => v.id === ref.vendorId)?.name ?? ''} · ₹${ref.cpm ?? '—'}/m` : undefined} />
      {b.notes && <KV k="Notes for sourcing" v={<span className="text-[12.5px]" style={{ whiteSpace:'normal' }}>{b.notes}</span>} />}
    </>}
    <KV k="Consumption" v={o.costing.consumption != null ? `${o.costing.consumption} m / pc` : 'not set'} note={fabricLine?.spec ?? undefined} />
    <KV k="Metres needed" v={need != null ? <b>{need} m</b> : '—'} note={need != null ? `${o.costing.consumption ?? '—'} × ${o.orderQty} pcs` : undefined} />

    <div className="label pt-3">Trims & packaging on the BOM</div>
    {o.bom.filter(l => l.kind !== 'fabric').length === 0 ? <div className="py-1 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>No trim lines yet.</div>
      : o.bom.filter(l => l.kind !== 'fabric').map((l, i) => <KV key={i} k={l.item} v={l.qtyPerPc != null ? `${l.qtyPerPc} ${l.unit} / pc` : '—'} note={l.spec ?? undefined} />)}

    <div className="label pt-3">Files from design · every file on the record</div>
    <div className="flex items-center gap-1.5 flex-wrap pb-1">{(['Tech pack', 'Job card', 'Trim card', 'BOM'] as const).map(k => { const ok = !docs.missing.includes(k); return <Pill key={k} tone={ok ? 'good' : 'warn'}>{ok ? '✓ ' : ''}{k}{ok ? '' : ' · missing'}</Pill>; })}</div>
    <Files kind="order" subjectId={o.id} labels={FILE_LABELS.order} editable={false} compact title="Files" emptyText="No files on this requirement yet." />
    {sl.length > 0 && <div className="pt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
      <div className="label">Design's shortlist · {sl.length}{o.fabricPick ? ' · one picked' : sl.length > 1 ? ' · sourcing to pick one' : ''}</div>
      {sl.map((c, i) => <div key={c.id} className="kv" style={{ alignItems:'flex-start' }}><span className="k"><b style={{ color:'var(--ink)' }}>{i + 1}. {c.look}</b>{c.composition ? ` · ${c.composition}` : ''}{c.colour ? ` · ${c.colour}` : ''}{c.note ? <div className="text-[11px]">{c.note}</div> : null}{o.fabricPick?.shortlistId === c.id && <div className="text-[11px]" style={{ color:'var(--good)' }}>picked by {o.fabricPick.by} · {fmtDate(o.fabricPick.on)} — {o.fabricPick.why}</div>}</span>
        <span className="v">{o.fabricPick?.shortlistId === c.id ? <Pill tone="good">picked</Pill> : o.fabricPick ? <Pill tone="neutral">not this one</Pill> : isSourcing && o.status !== 'Requirement' ? (picking === c.id
          ? <span className="flex gap-1 items-center"><Input value={why} onChange={e => setWhy(e.target.value)} placeholder="why this one — price, minimum, hold, shade" style={{ width: 240, padding:'4px 8px' }} /><Button size="sm" variant="primary" disabled={!why.trim()} onClick={() => { pickFromShortlist(o.id, c.id, why.trim()); setPicking(null); setWhy(''); }}>Pick</Button><Button size="sm" variant="ghost" onClick={() => setPicking(null)}>×</Button></span>
          : <Button size="sm" onClick={() => setPicking(c.id)}>Pick this one…</Button>) : null}</span></div>)}
      {!o.fabricPick && sl.length > 1 && !isSourcing && o.status !== 'Requirement' && <ActsBy role="sourcing" does="finalises the cloth internally, picks one candidate and records why" />}
      {!o.fabricPick && sl.length > 1 && isSourcing && o.status !== 'Requirement' && <div className="pt-1"><Note tone="warn">Pick the cloth first; the vendor and terms below are for the one you pick.</Note></div>}
    </div>}
  </Section>;
}

/* ---------- the handoff board: vendors, terms, design's choice, the PO -------- */
export function FabricQuoteBoard({ o }: { o: ProductionOrder }) {
  const { db, role, addFabricQuote, updateFabricQuote, removeFabricQuote, submitToDesign, askExtension, extendQuote, sendBackToDesign, rejectFabricQuote, unchooseFabricVendor, raiseOrderFabricPo, acceptQuoteAndRaisePo } = useApp();
  const isSourcing = role === 'sourcing' || role === 'owner';
  const isDesign = role === 'design' || role === 'planning' || role === 'owner';
  const ss = sourcingStateOf(o);
  const stage = o.sourcing?.stage ?? 'vendors';
  const mills = db.vendors.filter(v => v.kind.endsWith('mill'));
  const nameOf = (id: string) => db.vendors.find(v => v.id === id)?.name ?? '—';
  /* ONE vendor against the style — the same rule as a request's option. Sourcing
     puts it there and can edit it in place; design pushes the PO, rejects it, or
     asks for more time; a rejection sends the style back for another vendor. */
  const q = o.fabricQuotes[0] ?? null;
  const chosen = o.fabricQuotes.find(x => x.selected) ?? null;
  const need = o.costing.consumption != null ? Math.ceil(o.costing.consumption * o.orderQty) : null;
  const by = fabricNeededBy(o);
  const faint = { color:'var(--ink-faint)' } as const;
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ vendorId:'', article:'', cpm:'320', moq:'200', width:'57', lead:'', holdUntil:'', composition: o.fabricBrief?.composition ?? '100% cotton', note:'' });
  const [rationale, setRationale] = useState('');
  const [poM, setPoM] = useState('');   // metres typed over the computed need — blank means 'as computed'
  const [extDate, setExtDate] = useState('');
  const [showSuggest, setShowSuggest] = useState(true);
  const pickVendor = (id: string) => { const v = mills.find(m => m.id === id); setF(x => ({ ...x, vendorId: id, lead: v ? String(v.leadDays) : x.lead, moq: v ? String(v.moq || 200) : x.moq, holdUntil: v ? dateInput(iso(addDays(TODAY, v.blockWindowDays))) : x.holdUntil })); };
  const startEdit = () => { if (!q) return; setF({ vendorId: q.vendorId, cpm: String(q.cpm), moq: String(q.moq), width: String(q.widthCm || ''), lead: String(q.leadDays), holdUntil: q.blockValidUntil ? dateInput(q.blockValidUntil) : '', composition: q.composition ?? '', note: q.note ?? '', article: q.vendorCode ?? '' }); setEditing(true); };
  const suggestions = suggestMills(db, o).filter(x => !x.quoted).slice(0, 6);
  const TONE: Record<string, Tone> = { neutral:'neutral', info:'info', warn:'warn', risk:'risk', good:'good', accent:'accent' };
  const left = q?.blockValidUntil ? -daysAgo(q.blockValidUntil) : null;
  const lapsed = left != null && left < 0;
  const late = q ? new Date(q.committedDelivery) > new Date(by) : false;
  const metres = q ? (need != null ? Math.max(need, q.moq) : q.moq) : 0;
  const ok = !!f.vendorId && !!Number(f.cpm);
  const cell = (k: string, v: React.ReactNode) => <div key={k}><div className="text-[10.5px] mono uppercase" style={{ ...faint, letterSpacing:'.05em' }}>{k}</div><div>{v}</div></div>;
  const save = () => { const v = mills.find(m => m.id === f.vendorId)!; const ld = Number(f.lead) || v.leadDays;
    const terms = { vendorId: f.vendorId, cpm: Number(f.cpm), moq: Number(f.moq) || 0, widthCm: Number(f.width) || 0, leadDays: ld, committedDelivery: iso(addDays(TODAY, ld + 3)), blockValidUntil: fromDateInput(f.holdUntil), composition: f.composition.trim(), note: f.note.trim() || null, vendorCode: f.article.trim() || null };
    if (editing && q) { updateFabricQuote(o.id, q.id, terms); setEditing(false); } else addFabricQuote(o.id, terms); };

  /* the form — the same three bands as everywhere a vendor is written down */
  const form = <div className="pt-1">
    <div className="label" style={{ margin:'0 0 2px' }}>{editing ? 'The vendor against this style' : 'Put a vendor against this style'} — {o.fabricBrief?.look ?? o.styleName}</div>
    <div className="vgrid pt-1">
      <div className="vgrid-cap">Who</div>
      <div style={{ gridColumn:'span 6' }}><Field label="Mill"><Select value={f.vendorId} onChange={pickVendor} options={[{ value:'', label:'Pick a mill…' }, ...mills.map(v => ({ value:v.id, label:`${v.name} · holds ${v.blockWindowDays}d` }))]} /></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="Mill's article"><Input value={f.article} onChange={e => setF({ ...f, article: e.target.value })} placeholder="Verdi SOK#24594" /></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="Composition"><Input value={f.composition} onChange={e => setF({ ...f, composition: e.target.value })} /></Field></div>
      <div className="vgrid-cap">The terms</div>
      <div style={{ gridColumn:'span 2' }}><Field label="₹ / m"><Input type="number" value={f.cpm} onChange={e => setF({ ...f, cpm: e.target.value })} /></Field></div>
      <div style={{ gridColumn:'span 2' }}><Field label="MOQ · m"><Input type="number" value={f.moq} onChange={e => setF({ ...f, moq: e.target.value })} /></Field></div>
      <div style={{ gridColumn:'span 2' }}><Field label="Lead · days" hint="from PO to the roll at the unit" hintOn="label"><Input type="number" value={f.lead} onChange={e => setF({ ...f, lead: e.target.value })} /></Field></div>
      <div style={{ gridColumn:'span 2' }}><Field label="Width · cm"><Input type="number" value={f.width} onChange={e => setF({ ...f, width: e.target.value })} /></Field></div>
      <div style={{ gridColumn:'span 4' }}><Field label="Holds until" hint="the mill's block validity — the date the price stops being promised" hintOn="label"><Input type="date" value={f.holdUntil} onChange={e => setF({ ...f, holdUntil: e.target.value })} /></Field></div>
      <div className="vgrid-cap">For design</div>
      <div style={{ gridColumn:'span 8' }}><Field label="Note"><Input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="a shade lighter; softer hand; MOQ is above the need" /></Field></div>
      <div style={{ gridColumn:'span 4' }}><Field label="Fabric cost"><div className="input" style={{ background:'var(--surface-2)', color: ok ? undefined : 'var(--ink-faint)' }}>{ok ? fmtMoney(Number(f.cpm) * Math.max(need ?? 0, Number(f.moq) || 0)) : 'price × metres'}</div></Field></div>
    </div>
    <div className="flex gap-3 items-center flex-wrap pt-2">
      <Button size="sm" variant={editing ? undefined : 'primary'} disabled={!ok} onClick={save}>{editing ? 'Save changes' : 'Save vendor'}</Button>
      {editing && <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
    </div>
  </div>;

  const card = q && <div className="px-3 py-2.5" style={{ background: q.selected ? 'var(--good-soft)' : 'var(--surface-2)', borderRadius: 6 }}>
    <div className="flex items-start gap-3 flex-wrap">
      <div style={{ minWidth: 200, flex:'1 1 220px' }}>
        <div className="font-medium"><VendorLink id={q.vendorId} /></div>
        <div className="text-[12.5px]">{q.composition}{q.widthCm ? ` · ${q.widthCm} cm` : ''}</div>
        {q.note && <div className="text-[11.5px]" style={faint}>{q.note}</div>}
      </div>
      <div className="flex gap-4 flex-wrap text-[12.5px]" style={{ flex:'2 1 320px' }}>
        {cell('₹ / m', <b>₹{q.cpm}</b>)}
        {cell('MOQ', <span style={{ color: need != null && q.moq > need ? 'var(--warn)' : undefined }}>{q.moq} m{need != null && q.moq > need ? ` · ${q.moq - need} over` : ''}</span>)}
        {cell('fabric cost', <b>{fmtMoney(q.cpm * metres)}</b>)}
        {cell('lead · lands', <span style={{ color: late ? 'var(--risk)' : undefined }}>{q.leadDays}d · {fmtDate(q.committedDelivery)}{late ? ' · late' : ''}</span>)}
        {cell('holds until', q.blockValidUntil ? <span style={{ color: lapsed ? 'var(--risk)' : left != null && left <= 3 ? 'var(--warn)' : undefined }}>{fmtDate(q.blockValidUntil)} · {lapsed ? `lapsed ${-left!}d ago` : `${left}d left`}</span> : '—')}
        {q.extensionAskedOn && cell('extension', <Pill tone="warn">asked {fmtDate(q.extensionAskedOn)}</Pill>)}
      </div>
    </div>
    <div className="flex gap-2 items-center flex-wrap pt-2 mt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
      {q.selected ? <Pill tone="good">chosen</Pill>
        : stage === 'design-choice' && isDesign ? <>
          <MetresInput value={poM} onChange={setPoM} placeholder={String(metres)} moq={q.moq} />
          <Button size="sm" variant={lapsed ? undefined : 'primary'} title={lapsed ? 'the hold has lapsed — the price is not promised; ask for more time first' : `push the fabric PO to ${nameOf(q.vendorId)} for ${poM || metres} m`} onClick={() => acceptQuoteAndRaisePo(o.id, q.id, rationale.trim(), Number(poM) || null)}>Push PO</Button>
          {lapsed && <span className="text-[11.5px]" style={{ color:'var(--risk)' }}>hold lapsed — the price is not promised</span>}
          <button type="button" className="btn sm" onClick={() => rejectFabricQuote(o.id, q.id, rationale.trim())}>Reject</button>
          {q.extensionAskedOn ? null : <button type="button" className="btn sm" title={`ask sourcing to hold ${nameOf(q.vendorId)} longer`} onClick={() => askExtension(o.id, `${nameOf(q.vendorId)}: ${rationale.trim() || 'need longer than the hold'}`, q.id)}>More time</button>}
        </> : null}
      {isSourcing && !q.selected && !editing && (stage === 'vendors' || stage === 'design-choice') && <><div className="flex-1" /><Button size="sm" onClick={startEdit}>Edit</Button></>}
    </div>
  </div>;

  return (
    <Section title="Vendor & terms" right={<span className={`pill ${ss.owner ? `role-${ss.owner}` : TONE[ss.tone]}`}>{ss.label}</span>}>
      <KV k="Fabric needed" v={need != null ? `${need} m` : '—'} note={`${o.costing.consumption} m a piece × ${o.orderQty} pcs`} />
      <KV k="At the unit by" v={<span style={{ color: daysAgo(by) > -14 ? 'var(--risk)' : undefined }}>{fmtDate(by)}</span>} note="five weeks before the target inhouse date — checking, then issue to the factory, then the run" />

      {stage === 'design-choice' && isDesign && q && <div className="pt-2 pb-2">
        <Field label="Why — kept with the decision, and sent back with a rejection" hint="Push PO, Reject and More time all carry it"><Input value={rationale} onChange={e => setRationale(e.target.value)} placeholder="the hand is right and the shade matches the brief" /></Field>
      </div>}

      {/* the vendor — or the form to put one there */}
      {q && editing ? <div className="px-3 py-2 mt-1" style={{ background:'var(--accent-soft)', borderRadius: 6 }}>{form}</div>
        : q ? <div className="mt-1">{card}</div>
        : isSourcing && stage === 'vendors' ? <div className="mt-2">{form}</div>
        : <div className="empty mt-1"><b>No vendor yet.</b> Sourcing is at the mills.</div>}

      {/* sourcing: who could make this, and send */}
      {stage === 'vendors' && (isSourcing ? <>
        {!q && <div className="mt-3 pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div className="label" style={{ margin:0 }}>Who could make this</div>
            <div className="flex gap-3 items-center text-[11.5px]">
              <a className="cta" href={`#/mills?tab=fabrics&fq=${encodeURIComponent(o.fabricBrief?.look ?? o.styleName)}`}>search every fabric →</a>
              <button type="button" className="vlink" onClick={() => setShowSuggest(v => !v)}>{showSuggest ? 'hide' : 'show'}</button>
            </div>
          </div>
          {showSuggest && (suggestions.length === 0 ? <div className="py-2 text-[12.5px]" style={faint}>Every mill on the master has been asked.</div>
            : <div style={{ overflowX:'auto' }}><table className="t compact mt-1">
              <thead><tr><th>Mill</th><th>Closest cloth on record</th><th className="num">Lead</th><th className="num">Holds</th><th className="num">On time</th><th></th></tr></thead>
              <tbody>{suggestions.map(x => <tr key={x.v.id}>
                <td className="font-medium" style={{ whiteSpace:'normal', minWidth: 150 }}><VendorLink id={x.v.id} /><div className="text-[11px] font-normal" style={faint}>{x.v.kind} · {x.v.location}</div></td>
                <td className="text-[12px]" style={{ whiteSpace:'normal', maxWidth: 240 }}>{x.match ? <>{x.match.name}<div style={faint}>{x.match.composition ?? ''}{x.match.cpm ? ` · ₹${x.match.cpm}/m` : ''}</div></> : <span style={faint}>nothing close on record</span>}</td>
                <td className="num">{x.v.leadDays}d</td>
                <td className="num">{x.v.blockWindowDays}d</td>
                <td className="num">{Math.round(x.v.onTimeRate * 100)}%<div className="text-[10.5px]" style={faint}>{x.st.grade}</div></td>
                <td><Button size="sm" variant={f.vendorId === x.v.id ? 'primary' : undefined} onClick={() => { pickVendor(x.v.id); if (x.match?.cpm) setF(y => ({ ...y, cpm: String(x.match!.cpm) })); if (x.match?.composition) setF(y => ({ ...y, composition: x.match!.composition! })); }}>Use in the form</Button></td>
              </tr>)}</tbody>
            </table></div>)}
        </div>}
        {q && !editing && <div className="mt-3 pt-3 flex items-center gap-3 flex-wrap" style={{ borderTop:'1px solid var(--line)' }}>
          <div className="flex-1" />
          <Button variant="primary" onClick={() => submitToDesign(o.id)}>Send to design →</Button>
        </div>}
      </> : <ActsBy role="sourcing" does="puts one vendor against the style — mill, price, lead, hold — and sends it to design" />)}

      {stage === 'design-choice' && !isDesign && <div className="mt-3 pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <Note>With design since {o.sourcing.submittedOn ? fmtDate(o.sourcing.submittedOn) : '—'} — they push the PO, reject, or ask for more time.</Note>
      </div>}

      {/* extension asked — sourcing answers */}
      {stage === 'extension' && <div className="mt-3 pt-3" style={{ borderTop:'1px solid var(--line)' }}>
        <Note tone="warn"><b>Design asked for an extension</b>{o.sourcing.extension ? ` on ${fmtDate(o.sourcing.extension.askedOn)} · ${o.sourcing.extension.by}` : ''}{o.sourcing.extension?.note ? <> — "{o.sourcing.extension.note}"</> : null}</Note>
        {isSourcing && q ? (() => { const val = extDate || dateInput(iso(addDays(TODAY, 14))); return <>
          <div className="flex items-center gap-3 flex-wrap px-3 py-2 mt-3" style={{ background: lapsed ? 'var(--risk-soft)' : 'var(--surface-2)', borderRadius: 6 }}>
            <span className="font-medium" style={{ minWidth: 140 }}>{nameOf(q.vendorId)}</span>
            <span className="text-[12px]" style={{ color: lapsed ? 'var(--risk)' : 'var(--ink-soft)' }}>{q.blockValidUntil ? `${fmtDate(q.blockValidUntil)} · ${lapsed ? `lapsed ${-left!}d ago` : `${left}d left`}` : 'no hold given'}</span>
            <div className="flex-1" />
            <span className="text-[11.5px]" style={faint}>new hold until</span>
            <Input type="date" value={val} onChange={e => setExtDate(e.target.value)} style={{ width: 150, padding:'3px 6px' }} />
            <Button size="sm" variant={lapsed ? 'primary' : undefined} onClick={() => extendQuote(o.id, q.id, fromDateInput(val) ?? iso(addDays(TODAY, 14)))}>Extend</Button>
          </div>
          <div className="flex items-center gap-3 flex-wrap pt-3">
            <Button variant="primary" disabled={lapsed} onClick={() => sendBackToDesign(o.id)}>Send back to design</Button>
            <button type="button" className="btn sm" title="the mill will not hold — drop this vendor and put another against the style" onClick={() => removeFabricQuote(o.id, q.id)}>Drop vendor</button>
          </div></>; })() : !isSourcing ? <ActsBy role="sourcing" does="goes back to the mill, extends the hold, and sends it back to design" /> : null}
      </div>}

      {/* chosen without a PO — design may still change its mind, or raise it */}
      {stage === 'chosen' && chosen && <div className="mt-3 pt-3" style={{ borderTop:'1px solid var(--line)' }}>
        <KV k="Design chose" v={<b>{nameOf(chosen.vendorId)} · ₹{chosen.cpm}/m</b>} note={`${o.fabricMetres ?? '—'} m`} />
        {isDesign ? <>
          <div className="flex items-center gap-3 flex-wrap pt-2">
            <MetresInput value={poM} onChange={setPoM} placeholder={String(o.fabricMetres ?? chosen.moq)} moq={chosen.moq} />
            <Button variant="primary" onClick={() => raiseOrderFabricPo(o.id, Number(poM) || null)}>Push PO</Button>
            <Button size="sm" onClick={() => unchooseFabricVendor(o.id)}>Unchoose</Button>
            {chosen.extensionAskedOn
              ? <Pill tone="warn">more time asked {fmtDate(chosen.extensionAskedOn)}</Pill>
              : <Button size="sm" title={`not ready to push the PO before the hold runs out — ask sourcing to hold ${nameOf(chosen.vendorId)} longer`} onClick={() => askExtension(o.id, `${nameOf(chosen.vendorId)}: ${rationale.trim() || 'need longer than the hold'}`, chosen.id)}>Ask more time</Button>}
          </div>
          <div className="pt-2"><Field label="Why — kept with the decision" hint="goes with the PO or with the ask for more time"><Input value={rationale} onChange={e => setRationale(e.target.value)} placeholder="the swatch is still with the stores…" /></Field></div>
        </> : <ActsBy role={['design', 'planning']} does="pushes the fabric PO against the mill it chose" />}
      </div>}

      {/* on order */}
      {stage === 'po-raised' && chosen && <div className="mt-3 pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <KV k="Fabric PO" v={<b>{o.sourcing.fabricPo?.no ?? '—'}</b>} note={o.sourcing.fabricPo ? `raised ${fmtDate(o.sourcing.fabricPo.on)} · ${o.sourcing.fabricPo.metres} m from ${nameOf(chosen.vendorId)} at ₹${chosen.cpm}/m` : undefined} />
        <Note tone="good">Design pushed the PO; the cloth is on order. <b>Sourcing's turn:</b> chase the mill, confirm the dispatch and book the metres in.</Note>
      </div>}
    </Section>
  );
}

/* ---------- factory allocation, on capacity — planning's call ---------------- */
export function FactoryAllocationBoard({ o, canAllocate }: { o: ProductionOrder; canAllocate: boolean }) {
  const { db, allocateFactory } = useApp();
  const [rationale, setRationale] = useState('');
  const options = factoryOptions(db, o);
  const best = options[0];
  if (o.vendorId) return (
    <Section title="Factory" right={<Pill tone="neutral">allocated</Pill>}>
      <KV k="Making it" v={<VendorLink id={o.vendorId} />} note={`${db.vendors.find(v => v.id === o.vendorId)?.location} · allocated on capacity, not quoted`} />
      <KV k="PO" v={o.poNo ?? '—'} note={o.poDate ? `raised ${fmtDate(o.poDate)}` : undefined} />
    </Section>
  );
  return (
    <Section title="Allocate a factory · on capacity" right={<span className="pill role-planning">Planning</span>}>
      {o.status !== 'Allocated' && <div className="pb-2"><Note tone="warn">The fabric is not settled yet. Sourcing chooses the vendor first, so the factory is given a date it can actually hold.</Note></div>}
      <div style={{ overflowX:'auto' }}><table className="t compact">
        <thead><tr><th>Factory</th><th className="num">Open POs</th><th className="num">Pcs</th><th className="num">At risk</th><th className="num">Lead</th><th className="num">On time</th><th></th></tr></thead>
        <tbody>{options.map(f => <tr key={f.v.id} style={{ background: f.v.id === best?.v.id ? 'var(--accent-soft)' : undefined, opacity: f.fits ? 1 : .55 }}>
          <td className="font-medium" style={{ whiteSpace:'normal', minWidth: 210 }}><VendorLink id={f.v.id} /><div className="text-[11px] font-normal" style={{ color:'var(--ink-faint)' }}>{f.v.location} · {f.v.kind}</div><div className="text-[11px] font-normal" style={{ color: f.fits ? 'var(--ink-faint)' : 'var(--risk)' }}>{f.why}</div></td>
          <td className="num">{f.open.length}</td>
          <td className="num">{f.units}</td>
          <td className="num" style={{ color: f.atRisk ? 'var(--risk)' : undefined }}>{f.atRisk || '—'}</td>
          <td className="num" style={{ color: f.fits ? undefined : 'var(--risk)' }}>{f.lead}d{f.measuredLead != null && f.measuredLead !== f.v.leadDays && <div className="text-[10.5px]">master {f.v.leadDays}d</div>}</td>
          <td className="num">{Math.round(f.onTime * 100)}%</td>
          <td>{canAllocate && o.status === 'Allocated' && <Button size="sm" variant={f.v.id === best?.v.id ? 'primary' : undefined} onClick={() => allocateFactory(o.id, f.v.id, rationale)}>Allocate</Button>}</td>
        </tr>)}</tbody>
      </table></div>
      {canAllocate && o.status === 'Allocated' && <div className="pt-3"><Field label="Why this factory" hint="kept on the order"><Input value={rationale} onChange={e => setRationale(e.target.value)} placeholder="least loaded that makes the date" /></Field></div>}
      <div className="pt-2"><Note>Factories are not quoted — the making charge is agreed, so the choice is capacity and measured lead time.</Note></div>
    </Section>
  );
}


/** Metres on the PO, editable at the last moment: the computed need sits as the
    placeholder, the mill's minimum as a floor the label reminds you of. */
function MetresInput({ value, onChange, placeholder, moq }: { value: string; onChange: (v: string) => void; placeholder: string; moq: number }) {
  const n = Number(value);
  const under = value !== '' && n > 0 && n < moq;
  return <label className="inline-flex items-center gap-1.5 text-[12px]" style={{ color:'var(--ink-faint)' }} title={`the PO quantity — computed ${placeholder} m; the mill's minimum is ${moq} m`}>
    <input type="number" min={1} className="input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: 92, padding:'4px 8px', fontSize: 12.5, borderColor: under ? 'var(--warn)' : undefined }} aria-label="metres on the PO" />
    <span>m{under ? <span style={{ color:'var(--warn)' }}> · under MOQ {moq}</span> : ''}</span>
  </label>;
}


/* ---------- MTM: the fabric asks sourcing has to find a mill for ---------- */
type MtmRow = { id: string; kind: 'fabric' | 'options'; name: string; brief: string; book: string | null; wanted: string | null; vendor: string; status: string; tone: Tone; mine: boolean; href: string };
function mtmSourcingRows(db: ReturnType<typeof useApp>['db']): MtmRow[] {
  const out: MtmRow[] = [];
  (db.concepts ?? []).filter((c: Concept) => c.kind === 'new-fabric' && !/^cn-req-/.test(c.id) && !c.liveOn).forEach((c: Concept) => {
    const s = conceptOf(db, c); const f = designFlowOf(db, { kind:'concept', c }); const v = f.steps.find(x => x.key === 'vendors')!; const fin = f.steps.find(x => x.key === 'fabric-in')!;
    const offers = (c.fabricOptions ?? []).filter(o => !o.rejected);
    /* the same four stages design sees — the row names the state, "Your move" says whose turn */
    const STAGE = { 1:'Requirement requested', 2:'Vendor added', 3:'PO punched', 4:'Fabric in', 5:'Live online' } as const;
    const stage = f.mtmStage ?? 1;
    const extAsked = !!c.optionsExtension && !c.optionsExtension.resolvedOn;
    if (stage >= 3) return;   // from the PO on, nothing for sourcing here
    const status = extAsked ? `${STAGE[stage]} · more time asked` : STAGE[stage];
    const mine = stage === 1 || extAsked;   // put a vendor against it, or answer the ask for more time
    out.push({ id: c.id, kind:'fabric', name: c.naming.newName ?? c.name, brief: c.brief, book: c.book ?? null, wanted: c.targetMonth ?? null, vendor: s.fabric ? `${db.vendors.find(x => x.id === s.fabric!.vendorId)?.name ?? ''}${s.fabric.cpm ? ` · ₹${s.fabric.cpm}/m` : ''}` : offers.length ? `${offers.length} offer${offers.length === 1 ? '' : 's'}` : '—',
      status, tone: extAsked ? 'risk' : stage === 1 ? 'warn' : 'neutral', mine, href: `#/design?open=${c.id}` });
    void v;
  });
  (OPTIONS_OFF ? [] : (db.optionRequests ?? [])).forEach((r: OptionRequest) => {
    const live = r.options.filter(o => o.status !== 'closed'); const open = live.filter(o => o.status === 'open').length; const ext = live.filter(o => o.status === 'extension').length; const done = live.filter(o => o.status === 'po-raised').length; const withDesign = live.filter(o => o.status === 'with-design').length;
    if (!live.length || done === live.length) return;
    out.push({ id: r.id, kind:'options', name: `${r.reqNo} · ${catLabel(r.category)}`, brief: `${r.optionCount} options · ${r.brief}`, book: null, wanted: null, vendor: `${done} of ${live.length} with a PO`,
      status: ext ? `${ext} extension${ext === 1 ? '' : 's'} asked` : open ? `find mills for ${open}` : `${withDesign} with design`, tone: ext ? 'risk' : open ? 'warn' : 'neutral', mine: open + ext > 0, href: `#/design?open=${r.id}` });
  });
  return out.sort((a, b) => Number(b.mine) - Number(a.mine));
}
function MtmSourcing({ rows, onOpen }: { rows: MtmRow[]; onOpen: (id: string) => void }) {
  const { db } = useApp();
  const [only, setOnly] = useState<'mine' | 'all'>('mine');
  const shown = rows.filter(r => only === 'all' ? !r.mine : r.mine);   // two desks: sourcing's move, and what is with design
  const unconfirmed = openFabricPos(db).filter(p => !p.vendorConfirmedOn).length;
  return <>
    <div className="flex items-end gap-3 flex-wrap mb-3">
      <Seg value={only} onChange={v => setOnly(v as 'mine' | 'all')} options={[{ id:'mine', label:'Your move', count: rows.filter(r => r.mine).length }, { id:'all', label:'Waiting on design', count: rows.filter(r => !r.mine).length }]} />
      {unconfirmed > 0 && <a className="cta ml-auto" href="#/fabrics?tab=pos">{unconfirmed} core fabric PO{unconfirmed === 1 ? '' : 's'} to confirm with the mills →</a>}
    </div>
    {shown.length === 0 ? <Card><Empty title="Nothing waiting on sourcing." body="New MTM fabric asks from design land here." /></Card> : <Card><table className="t">
      <thead><tr><th>Fabric ask</th><th>Book · wanted</th><th>Mill</th><th>Stage</th></tr></thead>
      <tbody>{shown.map(r => <tr key={r.id} className="row" onClick={() => onOpen(r.id)}>
        <td><div className="font-medium">{r.name}{r.kind === 'options' && <span className="pill role-design" style={{ marginLeft: 6 }}>several options</span>}</div><div className="text-[12px]" style={{ color:'var(--ink-faint)', maxWidth: 360, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.brief}</div></td>
        <td className="text-[12.5px]">{r.book ?? '—'}{r.wanted && <div style={{ color:'var(--ink-faint)' }}>by {r.wanted}</div>}</td>
        <td className="text-[12.5px]">{r.vendor}</td>
        <td><Pill tone={r.tone}>{r.status}</Pill></td>
      </tr>)}</tbody>
    </table></Card>}
  </>;
}


/* ---------- an MTM fabric ask, as sourcing reads it: the full brief, every file, then the one vendor ---------- */
function MtmBrief({ c }: { c: Concept }) {
  const { db, role } = useApp();
  const base = c.baseFabricId ? db.fabrics.find(f => f.id === c.baseFabricId) : null;
  const sourcing = role === 'sourcing' || role === 'owner'; const design = role === 'design' || role === 'planning' || role === 'owner';
  return <>
    <Section title="What design asked for" defaultOpen right={<Pill tone="neutral">{c.raisedBy} · {fmtDate(c.raisedOn)}</Pill>}>
      <KV k="Working name" v={<b>{c.name}</b>} />
      <KV k="Why" v={<span className="text-[12.5px]" style={{ whiteSpace:'normal' }}>{c.brief}</span>} />
      <KV k="Swatch book" v={c.book ?? '—'} />
      <KV k="Wanted on the floor" v={c.targetMonth ?? '—'} />
      {c.spec && <KV k="Construction" v={c.spec} />}
      {base && <KV k="Close to" v={base.name} note={`${base.code} · ${db.vendors.find(v => v.id === base.vendorId)?.name ?? ''}`} />}
      <div className="label pt-3">Files from design</div>
      <Files kind="concept" subjectId={c.id} labels={FILE_LABELS.concept} editable={false} compact title="Files" emptyText="No files on this ask yet." />
    </Section>
    <Section title="The vendor" defaultOpen right={<Pill tone={c.optionsExtension && !c.optionsExtension.resolvedOn ? 'risk' : (c.fabricOptions ?? []).some(o => !o.rejected) ? 'good' : 'warn'}>{c.optionsExtension && !c.optionsExtension.resolvedOn ? 'more time asked' : (c.fabricOptions ?? []).some(o => !o.rejected) ? 'vendor added' : 'put a vendor against it'}</Pill>}>
      <ConceptOptions c={c} sourcing={sourcing} design={design} />
    </Section>
    <RecordTail kind="concept" subjectId={c.id} labels={FILE_LABELS.concept} editable steps={['General']} />
  </>;
}
