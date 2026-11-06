/* An MTM fabric requirement on one screen. A journey checklist across the top,
   then short sections that are always open, in the order the work happens: the
   ask, the vendor, the cloth coming in, the fabric's details (filled once and
   sent to Enigma from here, which also makes the sticker), the swatch desk and
   going live online. Steps are tick boxes that record who and when; the only
   button is the one that sends the details. */
import { useState } from 'react';
import { useApp } from '../store';
import type { Concept, SwatchDispatch } from '../domain/types';
import { conceptOf, fmtDate, samplingGateOf, daysAgo } from '../domain/engines';
import { SHIRT_STYLES, FILE_LABELS, STORES } from '../domain/reference';
import { Section, Pill, Button, KV, Field, Input, Select, Seg } from '../ui';
import { filesOf } from './Files';
import { RecordTail } from './RecordTail';
import { PoReceiving } from './PoReceiving';
import { ConceptOptions, SamplesChecklist } from './Concepts';
import { StickerSheet, SwatchChecks, Tick } from './Swatches';

type Step = { key: string; label: string; on: string | null | undefined; by?: string | null };
type Details = { name: string; mrp: number; category: 'Formal' | 'Casual'; style: string | null; description: string | null; buzzwords: string | null; composition: string | null; template: string; base: number; buffer: number;
  /* Enigma's Product Info for the design, filled in the same form */
  cost: number | null; productType: string | null; weightGrams: number | null; region: string; stockMode: 'track-quantity' | 'variants'; status: 'ACTIVE' | 'INACTIVE'; salesChannel: string | null; media: string[];
  sizeOptionName: string; sizes: string[]; variants: { size: string; price: number | null; discountedPrice: number | null }[] };

export function FabricRequirement({ c, design, prod, initial }: { c: Concept; design: boolean; prod: boolean; initial?: string }) {
  const { db, role, conceptSaveDetails, conceptOnline, conceptSetSampling } = useApp();
  const s = conceptOf(db, c);
  const sourcing = role === 'sourcing' || role === 'owner';
  const wh = role === 'warehouse' || role === 'owner';
  const po = c.fabricPo ? (db.fabricPos ?? []).find(p => p.fabricId === c.fabricId) ?? null : null;
  const grn = c.fabricPo && s.fabric ? (db.grns ?? []).find(g => g.kind === 'fabric' && g.receivedOn >= c.fabricPo!.on && (g.ref === s.fabric!.code || g.refLabel === s.fabric!.name)) : null;
  const vendor = (c.fabricOptions ?? []).find(o => !o.rejected) ?? null;
  const d0 = (c.designs ?? [])[0] ?? null;
  const factories = db.vendors.filter(v => v.mtm && v.kind !== 'Hemming unit');
  const [factory, setFactory] = useState(factories[0]?.id ?? '');
  const hasPat = filesOf(db.attachments, 'concept', c.id, undefined, ['PAT file', 'CAD / pattern']).length > 0;

  const storeRows = STORES.map(st => ({ st, d: s.fabric ? db.swatchDispatches.find(x => x.fabricId === s.fabric!.id && x.storeId === st.id) ?? null : null }));
  /* the whole journey, one line: each item ticks itself when its step is done */
  const journey: Step[] = [
    { key:'raised', label:'Requirement raised', on: c.raisedOn, by: c.raisedBy },
    /* sampling first, or not: decided by design before the ask reaches sourcing */
    { key:'sampling', label:'Sampling', on: c.sampling === 'pending' ? null : c.sampling === 'needed' ? c.approvalSentOn : c.samplingDecided?.on ?? c.raisedOn,
      by: c.sampling === 'needed' ? (c.approvalSentOn ? 'approved' : null) : c.sampling === 'pending' ? null : 'not needed' },
    { key:'vendor', label:'Vendor added', on: c.optionsSentOn ?? (vendor ? c.raisedOn : null), by: vendor ? db.vendors.find(v => v.id === vendor.vendorId)?.name : null },
    { key:'po', label:'PO pushed', on: c.fabricPo?.on, by: po?.poNo },
    { key:'in', label:'Fabric in', on: grn?.receivedOn ?? c.swatch?.inwardOn, by: grn ? `${grn.qty} m` : null },
    { key:'enigma', label:'Details in Enigma', on: c.enigma.configuredOn, by: c.enigma.by },
    { key:'yusuf', label:'Swatches to Yusuf', on: c.swatch?.handoverOn, by: c.swatch?.by?.handover },
    /* the STO Swatches Tracker's per-store columns: dispatched with a tracking no., received when the store marks it in RetailOS */
    { key:'stores', label:'Sent to stores', on: storeRows.length && storeRows.every(x => x.d?.confirmedOn) ? storeRows.map(x => x.d!.confirmedOn!).sort().pop() : null,
      by: storeRows.some(x => x.d) ? `${storeRows.filter(x => x.d?.confirmedOn).length} of ${storeRows.length} received` : null },
    { key:'live', label:'Live online', on: c.online?.liveOn },
  ];
  const current = journey.findIndex(x => !x.on);
  /* the boxes are the tabs: one step's section shows at a time, the current step first, so the record does not scroll */
  const [open, setOpen] = useState<string>(initial ?? journey[current]?.key ?? 'live');
  const at = (k: string) => open === k;

  return <>
    <div className="grid gap-1.5 mb-3" style={{ gridTemplateColumns:`repeat(${journey.length}, minmax(0, 1fr))` }}>
      {journey.map((x, i) => { const done = !!x.on; const now = i === current;
        return <button type="button" key={x.key} onClick={() => setOpen(x.key)} aria-pressed={at(x.key)} className="px-2 py-2 text-left" style={{ border:`${at(x.key) ? 2 : 1}px solid ${at(x.key) ? 'var(--ink)' : done ? 'var(--good)' : now ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, background: now ? 'var(--accent-soft)' : 'var(--surface)', cursor:'pointer', font:'inherit', color:'inherit' }}>
          <div className="flex items-start gap-1.5"><span className="cl-box" aria-hidden style={{ width: 16, height: 16, fontSize: 10, ...(done ? { background:'var(--good)', borderColor:'var(--good)' } : {}) }}>{done ? '✓' : ''}</span>
            <span className="text-[12px] font-medium" style={{ lineHeight: 1.25 }}>{x.label}</span></div>
          <div className="text-[10.5px] pt-1" style={{ color:'var(--ink-faint)' }}>{done ? `${fmtDate(x.on!)}${x.by ? ` · ${x.by}` : ''}` : now ? 'now' : ''}</div>
        </button>; })}
    </div>

    {at('raised') && <><Section title="The ask" collapsible={false}>
      <KV k="Why" v={c.brief} note={`${c.raisedBy} · ${fmtDate(c.raisedOn)}`} />
      <KV k="Book · wanted by" v={c.book ?? '—'} note={c.targetMonth ? `on the floor by ${c.targetMonth}` : undefined} />
      <KV k="Washed" v={c.washed ? 'Yes, washed before cutting' : 'No'} note={c.washed ? 'shrinkage % is entered at receiving' : undefined} />
    </Section>
    </>}

    {at('sampling') && <Section title="Sampling" collapsible={false} right={<Pill tone={c.sampling === 'pending' ? 'warn' : samplingGateOf(c) === 'sampling' ? 'info' : 'good'}>{c.sampling === 'pending' ? 'design to decide' : samplingGateOf(c) === 'sampling' ? 'sampling first · then sourcing' : c.sampling === 'needed' ? 'approved · with sourcing' : 'not needed · with sourcing'}</Pill>}>
      {c.sampling === 'pending' ? (design
        ? <div className="flex gap-2 items-center flex-wrap py-1"><Button variant="primary" onClick={() => conceptSetSampling(c.id, 'needed')}>Need sampling</Button><Button onClick={() => conceptSetSampling(c.id, 'not-needed')}>Sampling not needed · send to sourcing</Button>
            <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>sourcing sees this request only after this choice</span></div>
        : <div className="text-[12.5px] py-1" style={{ color:'var(--ink-faint)' }}>Design decides whether this needs a round of sampling first.</div>)
      : c.sampling === 'not-needed' ? <div className="text-[12.5px] py-1" style={{ color:'var(--ink-faint)' }}>Not needed{c.samplingDecided ? ` · ${c.samplingDecided.by} · ${fmtDate(c.samplingDecided.on)}` : ''}; the request went straight to sourcing.</div>
      : <>
        <SamplesChecklist c={c} design={design} prod={prod} factory={factory} setFactory={setFactory} factories={factories} hasPat={hasPat} />
        <div className="flex gap-3 items-center pt-2 text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{samplingGateOf(c) === 'sampling' ? 'Sourcing sees the request once the approval is posted.' : 'The request is with sourcing.'}
          {design && samplingGateOf(c) === 'sampling' && c.sampling === 'needed' && <button type="button" className="vlink" onClick={() => conceptSetSampling(c.id, 'not-needed')}>skip sampling, send to sourcing</button>}</div>
      </>}
    </Section>}

    {(at('vendor') || at('po')) && <Section title="Vendor" collapsible={false} right={c.fabricPo ? <Pill tone="good">PO pushed {fmtDate(c.fabricPo.on)}</Pill> : c.optionsSentOn ? <span className="pill role-design">design to answer</span> : <span className="pill role-sourcing">sourcing to add</span>}>
      <ConceptOptions c={c} sourcing={sourcing} design={design} />
    </Section>}

    {at('in') && <Section title="Fabric in" collapsible={false} right={<Pill tone={journey[3].on ? 'good' : c.fabricPo ? 'info' : 'neutral'}>{journey[3].on ? `in ${fmtDate(journey[3].on)}` : c.fabricPo ? 'on its way' : 'after the PO'}</Pill>}>
      {c.fabricPo ? <>
        <KV k="Fabric PO" v={<>{po?.poNo ?? 'PO'} <span style={{ color:'var(--ink-faint)' }}>· {c.fabricPo.metres} m</span></>} note={`pushed ${fmtDate(c.fabricPo.on)}${po ? ` · expected ${fmtDate(po.expectedOn)}` : ''}`} />
        {s.fabric && <KV k="Fabric" v={<>{s.fabric.name} <span className="mono text-[11px]" style={{ color:'var(--ink-faint)' }}>{s.fabric.code}</span></>} note={s.fabric.swatchBook ?? undefined} />}
        {po && <PoReceiving po={po} editable={wh} />}
      </> : <div className="text-[12.5px] py-1" style={{ color:'var(--ink-faint)' }}>Shows once design pushes the PO.</div>}
    </Section>}

    {at('enigma') && <><DetailsSection c={c} design={design} onSave={d => conceptSaveDetails(c.id, d)} />
    {d0 && <StickerSheet c={c} canMark={false} title="Sticker · made from these details" />}</>}

    {at('yusuf') && <Section title="Swatch desk" collapsible={false} right={c.swatch?.handoverOn ? <Pill tone="good">with Yusuf</Pill> : <Pill tone="neutral">{c.fabricPo ? 'warehouse' : 'after the PO'}</Pill>}>
      {c.fabricPo || c.swatch ? <SwatchChecks c={c} /> : <div className="text-[12.5px] py-1" style={{ color:'var(--ink-faint)' }}>Opens once the PO is pushed.</div>}
    </Section>}

    {at('stores') && <StoresSection c={c} rows={storeRows} wh={wh} />}

    {at('live') && <Section title="Live online" collapsible={false} right={<Pill tone={c.online?.liveOn ? 'good' : 'neutral'}>{c.online?.liveOn ? `live ${fmtDate(c.online.liveOn)}` : `${[c.online?.photosOn, c.online?.videoOn, c.online?.postOn].filter(Boolean).length} of 3`}</Pill>}>
      {(() => { const on = c.online; const gates: ['photos' | 'video' | 'post', string, string | null | undefined][] = [['photos', 'Swatch photography', on?.photosOn], ['video', 'Video', on?.videoOn], ['post', 'Post-production · product page ready', on?.postOn]];
        const allDone = gates.every(g => g[2]);
        return <div className="checklist hz">
          {gates.map(([k, label, d]) => <div key={k} className={`cl-row${d ? ' done' : ''}`}><Tick done={!!d} can={design} onTick={() => conceptOnline(c.id, k)} />
            <div className="cl-main"><div className="cl-label">{label}</div><div className="cl-status">{d ? fmtDate(d) : 'design ticks this'}</div></div></div>)}
          <div className={`cl-row${on?.liveOn ? ' done' : ''}`}><Tick done={!!on?.liveOn} can={design && allDone} onTick={() => conceptOnline(c.id, 'live')} title={allDone ? 'take it live online' : 'after the three above'} />
            <div className="cl-main"><div className="cl-label">Live online</div><div className="cl-status">{on?.liveOn ? fmtDate(on.liveOn) : allDone ? 'ready: tick to go live' : 'after the three above'}</div></div></div>
        </div>; })()}
    </Section>}

    <RecordTail kind="concept" subjectId={c.id} labels={FILE_LABELS.concept} editable={design || prod} steps={['General', 'Fabric', 'PP sample', 'Shipment sample', 'Approval', 'Enigma']} />
  </>;
}

/** The fabric's details, filled once: the design's Enigma product info with its price per size, the name, the
    product page text and the consumption rule. One save sends them to Enigma and makes the sticker. */
function DetailsSection({ c, design, onSave }: { c: Concept; design: boolean; onSave: (d: Details) => void }) {
  const { db } = useApp();
  const s = conceptOf(db, c);
  const d0 = (c.designs ?? [])[0] ?? null;
  const vendor = (c.fabricOptions ?? []).find(o => !o.rejected) ?? null;
  const saved = !!c.enigma.configuredOn && !!d0?.enigmaOn;
  const SIZES = ['36', '38', '40', '42', '44', '46'];
  const init = () => ({
    name: c.naming.newName ?? d0?.finalName ?? c.name,
    category: (d0?.category ?? (/casual/i.test(c.book ?? '') ? 'Casual' : 'Formal')) as 'Formal' | 'Casual',
    style: d0?.style ?? SHIRT_STYLES[0], description: d0?.description ?? '', buzzwords: d0?.buzzwords ?? '', cost: d0?.cost != null ? String(d0.cost) : '',
    productType: d0?.productType ?? 'CUSTOM_DESIGN', weightGrams: d0?.weightGrams != null ? String(d0.weightGrams) : '', region: d0?.region ?? 'IND',
    stockMode: (d0?.stockMode ?? 'track-quantity') as 'track-quantity' | 'variants', status: (d0?.status ?? 'ACTIVE') as 'ACTIVE' | 'INACTIVE', salesChannel: d0?.salesChannel ?? 'Stores + Online', media: (d0?.media ?? []).join(', '),
    sizeOptionName: d0?.sizeOptionName ?? 'Size', sizes: d0?.sizes ?? SIZES, newSize: '',
    vprice: Object.fromEntries((d0?.variants ?? []).map(x => [x.size, x.price != null ? String(x.price) : ''])) as Record<string, string>,
    vdisc: Object.fromEntries((d0?.variants ?? []).map(x => [x.size, x.discountedPrice != null ? String(x.discountedPrice) : ''])) as Record<string, string>,
    basePrice: String(c.naming.mrp ?? d0?.mrp ?? 2990),
    composition: s.fabric?.composition ?? vendor?.composition ?? '',
    template: c.enigma.template ?? 'Shirt · standard', base: String(c.enigma.consumptionBase ?? 1.6), buffer: String(c.enigma.consumptionBuffer ?? 0.15) });
  const [v, setV] = useState(init);
  const [editing, setEditing] = useState(false);
  const code = d0?.code ?? `BOM-SHI-${v.category === 'Formal' ? 'FM' : 'CS'}-nnnn`;
  /* a blank size price copies the base price, so a single price is one field */
  const priceOf = (sz: string) => Number(v.vprice[sz]) || Number(v.basePrice) || 0;
  const prices = (v.sizes.length ? v.sizes.map(priceOf) : [Number(v.basePrice) || 0]).filter(Boolean);
  const ok = !!v.name.trim() && prices.length > 0 && !!v.template.trim() && Number(v.base) > 0;
  const save = () => { onSave({ name: v.name.trim(), mrp: Math.min(...prices), category: v.category, style: v.style || null, description: v.description.trim() || null, buzzwords: v.buzzwords.trim() || null,
    composition: v.composition.trim() || null, template: v.template.trim(), base: Number(v.base), buffer: Number(v.buffer) || 0,
    cost: Number(v.cost) || null, productType: v.productType || null, weightGrams: Number(v.weightGrams) || null, region: v.region, stockMode: v.stockMode, status: v.status, salesChannel: v.salesChannel || null,
    media: v.media.split(',').map(x => x.trim()).filter(Boolean), sizeOptionName: v.sizeOptionName.trim() || 'Size', sizes: v.sizes,
    variants: v.sizes.map(sz => ({ size: sz, price: priceOf(sz) || null, discountedPrice: Number(v.vdisc[sz]) || null })) }); setEditing(false); };
  const addSize = () => { const val = v.newSize.trim().replace(/,$/, ''); setV({ ...v, sizes: val && !v.sizes.includes(val) ? [...v.sizes, val] : v.sizes, newSize: '' }); };
  const open = design && (!saved || editing);
  const cap = (t: string) => <div className="label pt-2" style={{ gridColumn:'1 / -1', margin: 0, borderBottom:'1px solid var(--line-soft)', paddingBottom: 2 }}>{t}</div>;
  return <Section title="Fabric details · goes to Enigma" collapsible={false}
    right={saved ? <Pill tone="good">In Enigma · synced {fmtDate(d0?.enigmaSyncedOn ?? d0?.enigmaOn ?? c.enigma.configuredOn!)}</Pill> : <span className="pill role-design">design fills once</span>}>
    {open ? <>
      <div className="grid gap-2.5" style={{ gridTemplateColumns:'repeat(12, minmax(0, 1fr))' }}>
        {cap('The shirt')}
        <div style={{ gridColumn:'span 6' }}><Field label="Final name"><Input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} placeholder="Chambray Shirt - Washed Indigo" /></Field></div>
        <div style={{ gridColumn:'span 3' }}><Field label="Style / preset"><Select value={v.style} onChange={x => setV({ ...v, style: x })} options={SHIRT_STYLES.map(x => ({ value:x, label:x }))} /></Field></div>
        <div style={{ gridColumn:'span 3' }}><Field label="Category"><Select value={v.category} onChange={x => setV({ ...v, category: x as 'Formal' | 'Casual' })} options={[{ value:'Formal', label:'Formal' }, { value:'Casual', label:'Casual' }]} /></Field></div>
        {cap('Enigma product info')}
        <div style={{ gridColumn:'span 3' }}><Field label="SKU code"><div className="input mono" style={{ background:'var(--surface-2)', color:'var(--ink-faint)' }}>{code}</div></Field></div>
        <div style={{ gridColumn:'span 3' }}><Field label="Product type"><Select value={v.productType} onChange={x => setV({ ...v, productType: x })} options={['CUSTOM_DESIGN', 'READY_DESIGN', 'READY_TO_WEAR', 'HEMMING'].map(x => ({ value:x, label:x }))} /></Field></div>
        <div style={{ gridColumn:'span 2' }}><Field label="Weight (g)"><Input type="number" value={v.weightGrams} onChange={e => setV({ ...v, weightGrams: e.target.value })} placeholder="260" /></Field></div>
        <div style={{ gridColumn:'span 2' }}><Field label="Region"><Select value={v.region} onChange={x => setV({ ...v, region: x })} options={[{ value:'IND', label:'IND' }, { value:'INTL', label:'INTL' }]} /></Field></div>
        <div style={{ gridColumn:'span 2' }}><Field label="Stock"><Select value={v.stockMode} onChange={x => setV({ ...v, stockMode: x as 'track-quantity' | 'variants' })} options={[{ value:'track-quantity', label:'Track quantity' }, { value:'variants', label:'Variants' }]} /></Field></div>
        <div style={{ gridColumn:'span 4' }}><Field label="Primary fabric"><div className="input" style={{ background:'var(--surface-2)', color:'var(--ink-faint)' }}>{s.fabric ? `${s.fabric.name} · ${s.fabric.code}` : c.name}</div></Field></div>
        <div style={{ gridColumn:'span 2' }}><Field label="Status"><Select value={v.status} onChange={x => setV({ ...v, status: x as 'ACTIVE' | 'INACTIVE' })} options={[{ value:'ACTIVE', label:'ACTIVE' }, { value:'INACTIVE', label:'INACTIVE' }]} /></Field></div>
        <div style={{ gridColumn:'span 3' }}><Field label="Sales channel"><Select value={v.salesChannel} onChange={x => setV({ ...v, salesChannel: x })} options={['Stores + Online', 'Stores', 'Online'].map(x => ({ value:x, label:x }))} /></Field></div>
        <div style={{ gridColumn:'span 3' }}><Field label="Product media"><Input value={v.media} onChange={e => setV({ ...v, media: e.target.value })} placeholder="front.jpg, detail.jpg" /></Field></div>
        {cap('Price · per size')}
        <div style={{ gridColumn:'span 3' }}><Field label="Base price ₹"><Input type="number" value={v.basePrice} onChange={e => setV({ ...v, basePrice: e.target.value })} /></Field></div>
        <div style={{ gridColumn:'span 2' }}><Field label="Cost ₹"><Input type="number" value={v.cost} onChange={e => setV({ ...v, cost: e.target.value })} placeholder="1080" /></Field></div>
        <div style={{ gridColumn:'span 2' }}><Field label="Option name"><Input value={v.sizeOptionName} onChange={e => setV({ ...v, sizeOptionName: e.target.value })} placeholder="Size" /></Field></div>
        <div style={{ gridColumn:'span 5' }}><Field label="Option values">
          <div className="flex gap-1.5 flex-wrap items-center pt-1">
            {v.sizes.map(sz => <span key={sz} className="pill good" style={{ display:'inline-flex', gap: 6, alignItems:'center' }}>{sz}<button type="button" aria-label={`remove ${sz}`} style={{ border:0, background:'none', cursor:'pointer', color:'inherit', padding:0, lineHeight:1 }} onClick={() => setV({ ...v, sizes: v.sizes.filter(x => x !== sz) })}>×</button></span>)}
            <Input value={v.newSize} onChange={e => setV({ ...v, newSize: e.target.value })} placeholder="add…" style={{ width: 80 }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSize(); } }} onBlur={addSize} />
          </div></Field></div>
        {v.sizes.length > 0 && <div style={{ gridColumn:'1 / -1', overflowX:'auto' }}><table className="t compact"><thead><tr><th>{v.sizeOptionName || 'Size'}</th>{v.sizes.map(sz => <th key={sz} className="num mono">{sz}</th>)}</tr></thead>
          <tbody>
            <tr><td className="text-[12px]">Price ₹</td>{v.sizes.map(sz => <td key={sz} className="num"><Input type="number" value={v.vprice[sz] ?? ''} placeholder={v.basePrice || '—'} onChange={e => setV({ ...v, vprice: { ...v.vprice, [sz]: e.target.value } })} style={{ width: 84, textAlign:'right' }} /></td>)}</tr>
            <tr><td className="text-[12px]">Discounted ₹</td>{v.sizes.map(sz => <td key={sz} className="num"><Input type="number" value={v.vdisc[sz] ?? ''} placeholder="—" onChange={e => setV({ ...v, vdisc: { ...v.vdisc, [sz]: e.target.value } })} style={{ width: 84, textAlign:'right' }} /></td>)}</tr>
            <tr><td className="text-[12px]">SKU</td>{v.sizes.map(sz => <td key={sz} className="num mono text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{code}-{sz}</td>)}</tr>
          </tbody></table>
          <div className="text-[11px] pt-1" style={{ color:'var(--ink-faint)' }}>a blank price uses the base price; the MRP on the sticker is the lowest size price</div></div>}
        {cap('What the customer reads')}
        <div style={{ gridColumn:'span 8' }}><Field label="Description · product page"><Input value={v.description} onChange={e => setV({ ...v, description: e.target.value })} placeholder="A soft-washed chambray in 100% cotton, cut for the weekend" /></Field></div>
        <div style={{ gridColumn:'span 4' }}><Field label="Buzzwords"><Input value={v.buzzwords} onChange={e => setV({ ...v, buzzwords: e.target.value })} placeholder="breathable, easy care" /></Field></div>
        {cap('Cloth and consumption')}
        <div style={{ gridColumn:'span 4' }}><Field label="Composition"><Input value={v.composition} onChange={e => setV({ ...v, composition: e.target.value })} placeholder="100% Cotton" /></Field></div>
        <div style={{ gridColumn:'span 4' }}><Field label="Enigma template"><Input value={v.template} onChange={e => setV({ ...v, template: e.target.value })} /></Field></div>
        <div style={{ gridColumn:'span 2' }}><Field label="Base m"><Input type="number" value={v.base} onChange={e => setV({ ...v, base: e.target.value })} /></Field></div>
        <div style={{ gridColumn:'span 2' }}><Field label="Buffer m"><Input type="number" value={v.buffer} onChange={e => setV({ ...v, buffer: e.target.value })} /></Field></div>
      </div>
      <div className="flex gap-2 items-center pt-3">
        <Button variant="primary" disabled={!ok} onClick={save}>Save · send to Enigma</Button>
        {editing && <Button variant="ghost" onClick={() => { setV(init()); setEditing(false); }}>Cancel</Button>}
        <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{d0 ? `product code ${d0.code}` : `mints the product code ${code}`} · one save sends everything to Enigma and makes the sticker</span>
      </div>
    </> : saved && d0 ? <>
      <KV k="Product code" v={<span className="mono">{d0.code}</span>} note={`${d0.category} · ${d0.style ?? ''} · ${d0.productType ?? 'CUSTOM_DESIGN'} · ${d0.status ?? 'ACTIVE'}${d0.salesChannel ? ` · ${d0.salesChannel}` : ''}`} />
      <KV k="Name · MRP" v={`${c.naming.newName ?? d0.finalName ?? d0.name} · ₹${(c.naming.mrp ?? d0.mrp ?? 0).toLocaleString('en-IN')}`} note={(d0.variants ?? []).length ? (d0.variants ?? []).map(x => `${x.size} ₹${(x.price ?? 0).toLocaleString('en-IN')}${x.discountedPrice ? ` (₹${x.discountedPrice})` : ''}`).join(' · ') : undefined} />
      {d0.description && <KV k="Description" v={d0.description} note={d0.buzzwords ?? undefined} />}
      <KV k="Consumption" v={`${c.enigma.consumptionBase} m + ${c.enigma.consumptionBuffer} m buffer`} note={`${c.enigma.template ?? ''}${s.fabric?.composition ? ` · ${s.fabric.composition}` : ''}`} />
      {design && <div className="pt-1"><button type="button" className="vlink text-[12px]" onClick={() => { setV(init()); setEditing(true); }}>Edit</button></div>}
    </> : <div className="text-[12.5px] py-1" style={{ color:'var(--ink-faint)' }}>Design fills the product info, the price per size, the product page text and the consumption here; one save sends them to Enigma.</div>}
  </Section>;
}

/** Sent to stores: one line per store, as the STO Swatches Tracker has it: tracking no., dispatch date, receiving date.
    The warehouse dispatches (one store or all at once, with the courier's number); the store manager marks it received
    in RetailOS, and design reads here which stores have it. */
function StoresSection({ c, rows, wh }: { c: Concept; rows: { st: { id: string; name: string; region: string }; d: SwatchDispatch | null }[]; wh: boolean }) {
  const { db, dispatchSwatch } = useApp();
  const s = conceptOf(db, c);
  const [show, setShow] = useState<'all' | 'todo' | 'transit' | 'in'>('all');
  const [track, setTrack] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState('');
  const n = { todo: rows.filter(x => !x.d).length, transit: rows.filter(x => x.d && !x.d.confirmedOn).length, in: rows.filter(x => x.d?.confirmedOn).length };
  const shown = rows.filter(x => show === 'all' ? true : show === 'todo' ? !x.d : show === 'transit' ? x.d && !x.d.confirmedOn : !!x.d?.confirmedOn);
  const ready = !!s.fabric && !!c.swatch?.handoverOn;
  return <Section title="Sent to stores" collapsible={false} right={<Pill tone={n.in === rows.length ? 'good' : n.transit ? 'info' : 'neutral'}>{n.in} of {rows.length} received</Pill>}>
    {!ready ? <div className="text-[12.5px] py-1" style={{ color:'var(--ink-faint)' }}>Opens once the swatches are with Yusuf.</div> : <>
      <div className="flex gap-2 items-center flex-wrap mb-2">
        <Seg value={show} onChange={v => setShow(v as typeof show)} options={[{ id:'all', label:'All stores', count: rows.length }, { id:'todo', label:'Not dispatched', count: n.todo }, { id:'transit', label:'Dispatched · not received', count: n.transit }, { id:'in', label:'Received', count: n.in }]} />
        {wh && n.todo > 0 && <span className="ml-auto flex gap-1.5 items-center"><Input value={bulk} onChange={e => setBulk(e.target.value)} placeholder="tracking no. (optional)" style={{ width: 170 }} />
          <Button size="sm" variant="primary" onClick={() => { dispatchSwatch(s.fabric!.id, rows.filter(x => !x.d).map(x => x.st.id), bulk.trim() || null); setBulk(''); }}>Dispatch to the {n.todo} left</Button></span>}
      </div>
      <div className="tbox" style={{ maxHeight: 380 }}><table className="t compact">
        <thead><tr><th>Store</th><th>Tracking no.</th><th>Dispatch date</th><th>Receiving date</th></tr></thead>
        <tbody>{shown.map(({ st, d }) => <tr key={st.id}>
          <td className="text-[12.5px]">{st.name}<span className="text-[11px]" style={{ color:'var(--ink-faint)' }}> · {st.region}</span></td>
          <td className="mono text-[12px]">{d?.trackingNo ? d.trackingNo : wh ? <Input value={track[st.id] ?? ''} onChange={e => setTrack(t => ({ ...t, [st.id]: e.target.value }))} placeholder="courier no." style={{ width: 140 }} /> : '—'}</td>
          <td className="text-[12px]">{d ? fmtDate(d.dispatchedOn) : wh ? <Button size="sm" onClick={() => { dispatchSwatch(s.fabric!.id, [st.id], (track[st.id] ?? '').trim() || null); }}>Dispatch</Button> : <span style={{ color:'var(--ink-faint)' }}>not yet</span>}
            {d && !d.trackingNo && wh && (track[st.id] ?? '').trim() && <button type="button" className="vlink text-[11px] ml-2" onClick={() => dispatchSwatch(s.fabric!.id, [st.id], track[st.id].trim())}>save no.</button>}</td>
          <td className="text-[12px]">{d?.confirmedOn ? <span style={{ color:'var(--good)' }}>{fmtDate(d.confirmedOn)}{d.confirmedBy ? ` · ${d.confirmedBy}` : ''}</span> : d ? <span style={{ color: daysAgo(d.dispatchedOn) > 5 ? 'var(--risk)' : 'var(--ink-faint)' }}>awaiting the store{daysAgo(d.dispatchedOn) > 5 ? ` · ${daysAgo(d.dispatchedOn)}d` : ''}</span> : '—'}</td>
        </tr>)}</tbody></table></div>
      <div className="text-[11.5px] pt-2" style={{ color:'var(--ink-faint)' }}>The store manager marks it received in RetailOS; the receiving date lands here.</div>
    </>}
  </Section>;
}
