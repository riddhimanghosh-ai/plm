/* An MTM fabric requirement on one screen. A journey checklist across the top,
   then short sections that are always open, in the order the work happens: the
   ask, the vendor, the cloth coming in, the fabric's details (filled once and
   sent to Enigma from here, which also makes the sticker), the swatch desk and
   going live online. Steps are tick boxes that record who and when; the only
   button is the one that sends the details. */
import { useState } from 'react';
import { useApp } from '../store';
import type { Concept } from '../domain/types';
import { conceptOf, fmtDate } from '../domain/engines';
import { SHIRT_STYLES, FILE_LABELS } from '../domain/reference';
import { Section, Pill, Button, KV, Field, Input, Select } from '../ui';
import { filesOf } from './Files';
import { RecordTail } from './RecordTail';
import { PoReceiving } from './PoReceiving';
import { ConceptOptions, SamplesChecklist } from './Concepts';
import { StickerSheet, SwatchChecks, Tick } from './Swatches';

type Step = { key: string; label: string; on: string | null | undefined; by?: string | null };
type Details = { name: string; mrp: number; category: 'Formal' | 'Casual'; style: string | null; description: string | null; buzzwords: string | null; composition: string | null; template: string; base: number; buffer: number };

export function FabricRequirement({ c, design, prod }: { c: Concept; design: boolean; prod: boolean }) {
  const { db, role, conceptSaveDetails, conceptOnline } = useApp();
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

  /* the whole journey, one line: each item ticks itself when its step is done */
  const journey: Step[] = [
    { key:'raised', label:'Requirement raised', on: c.raisedOn, by: c.raisedBy },
    { key:'vendor', label:'Vendor added', on: c.optionsSentOn ?? (vendor ? c.raisedOn : null), by: vendor ? db.vendors.find(v => v.id === vendor.vendorId)?.name : null },
    { key:'po', label:'PO pushed', on: c.fabricPo?.on, by: po?.poNo },
    { key:'in', label:'Fabric in', on: grn?.receivedOn ?? c.swatch?.inwardOn, by: grn ? `${grn.qty} m` : null },
    { key:'enigma', label:'Details in Enigma', on: c.enigma.configuredOn, by: c.enigma.by },
    { key:'yusuf', label:'Swatches to Yusuf', on: c.swatch?.handoverOn, by: c.swatch?.by?.handover },
    { key:'live', label:'Live online', on: c.online?.liveOn },
  ];
  const current = journey.findIndex(x => !x.on);

  return <>
    <div className="grid gap-1.5 mb-3" style={{ gridTemplateColumns:`repeat(${journey.length}, minmax(0, 1fr))` }}>
      {journey.map((x, i) => { const done = !!x.on; const now = i === current;
        return <div key={x.key} className="px-2 py-2" style={{ border:`1px solid ${done ? 'var(--good)' : now ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, background: now ? 'var(--accent-soft)' : undefined }}>
          <div className="flex items-start gap-1.5"><span className="cl-box" aria-hidden style={{ width: 16, height: 16, fontSize: 10, ...(done ? { background:'var(--good)', borderColor:'var(--good)' } : {}) }}>{done ? '✓' : ''}</span>
            <span className="text-[12px] font-medium" style={{ lineHeight: 1.25 }}>{x.label}</span></div>
          <div className="text-[10.5px] pt-1" style={{ color:'var(--ink-faint)' }}>{done ? `${fmtDate(x.on!)}${x.by ? ` · ${x.by}` : ''}` : now ? 'now' : ''}</div>
        </div>; })}
    </div>

    <Section title="The ask" collapsible={false}>
      <KV k="Why" v={c.brief} note={`${c.raisedBy} · ${fmtDate(c.raisedOn)}`} />
      <KV k="Book · wanted by" v={c.book ?? '—'} note={c.targetMonth ? `on the floor by ${c.targetMonth}` : undefined} />
      <KV k="Washed" v={c.washed ? 'Yes, washed before cutting' : 'No'} note={c.washed ? 'shrinkage % is entered at receiving' : undefined} />
    </Section>

    <Section title="Vendor" collapsible={false} right={c.fabricPo ? <Pill tone="good">PO pushed {fmtDate(c.fabricPo.on)}</Pill> : c.optionsSentOn ? <span className="pill role-design">design to answer</span> : <span className="pill role-sourcing">sourcing to add</span>}>
      <ConceptOptions c={c} sourcing={sourcing} design={design} />
    </Section>

    <Section title="Fabric in" collapsible={false} right={<Pill tone={journey[3].on ? 'good' : c.fabricPo ? 'info' : 'neutral'}>{journey[3].on ? `in ${fmtDate(journey[3].on)}` : c.fabricPo ? 'on its way' : 'after the PO'}</Pill>}>
      {c.fabricPo ? <>
        <KV k="Fabric PO" v={<>{po?.poNo ?? 'PO'} <span style={{ color:'var(--ink-faint)' }}>· {c.fabricPo.metres} m</span></>} note={`pushed ${fmtDate(c.fabricPo.on)}${po ? ` · expected ${fmtDate(po.expectedOn)}` : ''}`} />
        {s.fabric && <KV k="Fabric" v={<>{s.fabric.name} <span className="mono text-[11px]" style={{ color:'var(--ink-faint)' }}>{s.fabric.code}</span></>} note={s.fabric.swatchBook ?? undefined} />}
        {po && <PoReceiving po={po} editable={wh} />}
      </> : <div className="text-[12.5px] py-1" style={{ color:'var(--ink-faint)' }}>Shows once design pushes the PO.</div>}
    </Section>

    <DetailsSection c={c} design={design} onSave={d => conceptSaveDetails(c.id, d)} />

    {d0 && <StickerSheet c={c} canMark={false} title="Sticker · made from these details" />}

    <Section title="Swatch desk" collapsible={false} right={c.swatch?.handoverOn ? <Pill tone="good">with Yusuf</Pill> : <Pill tone="neutral">{c.fabricPo ? 'warehouse' : 'after the PO'}</Pill>}>
      {c.fabricPo || c.swatch ? <SwatchChecks c={c} /> : <div className="text-[12.5px] py-1" style={{ color:'var(--ink-faint)' }}>Opens once the PO is pushed.</div>}
    </Section>

    <Section title="Live online" collapsible={false} right={<Pill tone={c.online?.liveOn ? 'good' : 'neutral'}>{c.online?.liveOn ? `live ${fmtDate(c.online.liveOn)}` : `${[c.online?.photosOn, c.online?.videoOn, c.online?.postOn].filter(Boolean).length} of 3`}</Pill>}>
      {(() => { const on = c.online; const gates: ['photos' | 'video' | 'post', string, string | null | undefined][] = [['photos', 'Swatch photography', on?.photosOn], ['video', 'Video', on?.videoOn], ['post', 'Post-production · product page ready', on?.postOn]];
        const allDone = gates.every(g => g[2]);
        return <div className="checklist">
          {gates.map(([k, label, d]) => <div key={k} className={`cl-row${d ? ' done' : ''}`}><Tick done={!!d} can={design} onTick={() => conceptOnline(c.id, k)} />
            <div className="cl-main"><div className="cl-label">{label}</div><div className="cl-status">{d ? fmtDate(d) : 'design ticks this'}</div></div></div>)}
          <div className={`cl-row${on?.liveOn ? ' done' : ''}`}><Tick done={!!on?.liveOn} can={design && allDone} onTick={() => conceptOnline(c.id, 'live')} title={allDone ? 'take it live online' : 'after the three above'} />
            <div className="cl-main"><div className="cl-label">Live online</div><div className="cl-status">{on?.liveOn ? fmtDate(on.liveOn) : allDone ? 'ready: tick to go live' : 'after the three above'}</div></div></div>
        </div>; })()}
    </Section>

    <Section title="Samples · optional" collapsible={false}>
      <SamplesChecklist c={c} design={design} prod={prod} factory={factory} setFactory={setFactory} factories={factories} hasPat={hasPat} />
    </Section>

    <RecordTail kind="concept" subjectId={c.id} labels={FILE_LABELS.concept} editable={design || prod} steps={['General', 'Fabric', 'PP sample', 'Shipment sample', 'Approval', 'Enigma']} />
  </>;
}

/** The fabric's details, filled once: they go to Enigma on save (the product code, the name and MRP, the consumption rule) and make the sticker. */
function DetailsSection({ c, design, onSave }: { c: Concept; design: boolean; onSave: (d: Details) => void }) {
  const { db } = useApp();
  const s = conceptOf(db, c);
  const d0 = (c.designs ?? [])[0] ?? null;
  const vendor = (c.fabricOptions ?? []).find(o => !o.rejected) ?? null;
  const saved = !!c.enigma.configuredOn && !!d0?.enigmaOn;
  const init = () => ({
    name: c.naming.newName ?? d0?.finalName ?? c.name, mrp: String(c.naming.mrp ?? d0?.mrp ?? 2990),
    category: (d0?.category ?? (/casual/i.test(c.book ?? '') ? 'Casual' : 'Formal')) as 'Formal' | 'Casual',
    style: d0?.style ?? SHIRT_STYLES[0], description: d0?.description ?? '', buzzwords: d0?.buzzwords ?? '',
    composition: s.fabric?.composition ?? vendor?.composition ?? '',
    template: c.enigma.template ?? 'Shirt · standard', base: String(c.enigma.consumptionBase ?? 1.6), buffer: String(c.enigma.consumptionBuffer ?? 0.15) });
  const [v, setV] = useState(init);
  const [editing, setEditing] = useState(false);
  const ok = !!v.name.trim() && Number(v.mrp) > 0 && !!v.template.trim() && Number(v.base) > 0;
  const save = () => { onSave({ name: v.name.trim(), mrp: Number(v.mrp), category: v.category, style: v.style || null, description: v.description.trim() || null, buzzwords: v.buzzwords.trim() || null,
    composition: v.composition.trim() || null, template: v.template.trim(), base: Number(v.base), buffer: Number(v.buffer) || 0 }); setEditing(false); };
  const open = design && (!saved || editing);
  return <Section title="Fabric details · goes to Enigma" collapsible={false}
    right={saved ? <Pill tone="good">In Enigma · synced {fmtDate(d0?.enigmaSyncedOn ?? d0?.enigmaOn ?? c.enigma.configuredOn!)}</Pill> : <span className="pill role-design">design fills once</span>}>
    {open ? <>
      <div className="grid gap-2.5" style={{ gridTemplateColumns:'repeat(6, minmax(0, 1fr))' }}>
        <div style={{ gridColumn:'span 3' }}><Field label="Final name"><Input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} placeholder="Chambray Shirt - Washed Indigo" /></Field></div>
        <div style={{ gridColumn:'span 1' }}><Field label="MRP ₹"><Input type="number" value={v.mrp} onChange={e => setV({ ...v, mrp: e.target.value })} /></Field></div>
        <div style={{ gridColumn:'span 1' }}><Field label="Category"><Select value={v.category} onChange={x => setV({ ...v, category: x as 'Formal' | 'Casual' })} options={[{ value:'Formal', label:'Formal' }, { value:'Casual', label:'Casual' }]} /></Field></div>
        <div style={{ gridColumn:'span 1' }}><Field label="Style"><Select value={v.style} onChange={x => setV({ ...v, style: x })} options={SHIRT_STYLES.map(x => ({ value:x, label:x }))} /></Field></div>
        <div style={{ gridColumn:'span 4' }}><Field label="Description · product page"><Input value={v.description} onChange={e => setV({ ...v, description: e.target.value })} placeholder="A soft-washed chambray in 100% cotton, cut for the weekend" /></Field></div>
        <div style={{ gridColumn:'span 2' }}><Field label="Buzzwords"><Input value={v.buzzwords} onChange={e => setV({ ...v, buzzwords: e.target.value })} placeholder="breathable, easy care" /></Field></div>
        <div style={{ gridColumn:'span 2' }}><Field label="Composition"><Input value={v.composition} onChange={e => setV({ ...v, composition: e.target.value })} placeholder="100% Cotton" /></Field></div>
        <div style={{ gridColumn:'span 2' }}><Field label="Enigma template"><Input value={v.template} onChange={e => setV({ ...v, template: e.target.value })} /></Field></div>
        <div style={{ gridColumn:'span 1' }}><Field label="Base m"><Input type="number" value={v.base} onChange={e => setV({ ...v, base: e.target.value })} /></Field></div>
        <div style={{ gridColumn:'span 1' }}><Field label="Buffer m"><Input type="number" value={v.buffer} onChange={e => setV({ ...v, buffer: e.target.value })} /></Field></div>
      </div>
      <div className="flex gap-2 items-center pt-3">
        <Button variant="primary" disabled={!ok} onClick={save}>Save · send to Enigma</Button>
        {editing && <Button variant="ghost" onClick={() => { setV(init()); setEditing(false); }}>Cancel</Button>}
        <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{d0 ? `product code ${d0.code}` : `mints the product code BOM-SHI-${v.category === 'Formal' ? 'FM' : 'CS'}-nnnn`} · the sticker is made from these details</span>
      </div>
    </> : saved && d0 ? <>
      <KV k="Product code" v={<span className="mono">{d0.code}</span>} note={`${d0.category} · ${d0.style ?? ''}`} />
      <KV k="Name · MRP" v={`${c.naming.newName ?? d0.finalName ?? d0.name} · ₹${(c.naming.mrp ?? d0.mrp ?? 0).toLocaleString('en-IN')}`} />
      {d0.description && <KV k="Description" v={d0.description} note={d0.buzzwords ?? undefined} />}
      <KV k="Consumption" v={`${c.enigma.consumptionBase} m + ${c.enigma.consumptionBuffer} m buffer`} note={`${c.enigma.template ?? ''}${s.fabric?.composition ? ` · ${s.fabric.composition}` : ''}`} />
      {design && <div className="pt-1"><button type="button" className="vlink text-[12px]" onClick={() => { setV(init()); setEditing(true); }}>Edit</button></div>}
    </> : <div className="text-[12.5px] py-1" style={{ color:'var(--ink-faint)' }}>Design fills the name, MRP, product page text and consumption here; one save sends them to Enigma.</div>}
  </Section>;
}

