/* Concepts — one record from the idea in a design meeting to the day a customer
   can order it. Today that history is spread across a meeting nobody minutes,
   the fabric ordering sheet, three copies of the block sheet, a PO tracker,
   whichever inbox holds the PP-sample comments, one blanket approval email, the
   trainer's own notes, and an Enigma configuration that happens whenever it
   happens. Eleven gates, each derived from what was done, none typed. */
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { Concept, ConceptRound, SampleArea } from '../domain/types';
import { conceptOf, designFlowOf, type DesignStepKey, fmtDate, fmtMoney, daysAgo, TODAY, addDays, iso, type ConceptStage } from '../domain/engines';
import { SAMPLE_AREAS, COLLAR_STYLES, PLACKETS, CUFF_STYLES, ROLE_LABEL, MTM_SWATCH_BOOKS, PEOPLE, COMPOSITION_FAMILIES, MTM_ACTIVE_TARGET } from '../domain/reference';
import type { RoleId } from '../domain/types';
import { filesOf } from './Files';
import { Page, Card, Pill, Button, Drawer, KV, Section, Note, Field, Input, Select, Tabs, Empty, dateInput, fromDateInput, useExamples, type Tone } from '../ui';
import { RecordTail } from './RecordTail';
import { PoReceiving } from './PoReceiving';
import { Files } from './Files';
import { FILE_LABELS } from '../domain/reference';

import { VendorLink } from './Vendors';
import { FlowHeader, isMyTurn } from './Flow';
import { ActsBy, OwnerPill } from './Who';
import { DesignsOnFabric } from './Designs';
import { VendorEditor } from './OptionRequests';
import { MTM_ONLY } from '../domain/edition';

const STAGE_TONE: Record<ConceptStage, Tone> = { Idea:'neutral', Sampling:'warn', 'Shipment sample':'warn', Approved:'info', Fabric:'info', Blocked:'info', 'PO raised':'info', Configured:'info', Named:'info', Ready:'good', Live:'good' };

export function Concepts() {
  const { db, role, myRole } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace:true }); };
  const concepts = db.concepts ?? [];
  const tab = params.get('tab') ?? 'all';   // opens on every concept, so the worked examples include one that is live
  const mineNow = (c: Concept) => isMyTurn(db, { kind:'concept', c }, myRole);
  const rows = concepts.map(c => ({ c, s: conceptOf(db, c) }))
    .filter(x => tab === 'mine' ? mineNow(x.c) : tab === 'all' ? true : tab === 'open' ? !x.c.liveOn : !!x.c.liveOn)
    .sort((a, b) => (a.c.liveOn ? 1 : 0) - (b.c.liveOn ? 1 : 0) || (mineNow(a.c) ? 0 : 1) - (mineNow(b.c) ? 0 : 1) || b.s.stuckDays - a.s.stuckDays);
  const ex = useExamples(rows, x => x.s.stage, { noun: 'concepts', score: x => x.s.stuckDays, done: x => !!x.c.liveOn && !!x.c.online?.liveOn });
  const active = concepts.find(c => c.id === params.get('open')) ?? null;
  const design = role === 'design' || role === 'owner';
  const prod = role === 'production' || role === 'owner';
  const open = concepts.filter(c => !c.liveOn).map(c => conceptOf(db, c));

  return (
    <Page title="MTM concepts" lede="Every new fabric option or construction variant, from the design meeting to the moment a customer can order it."
      replaces="the un-minuted design meeting, three copies of the block sheet, the PO tracker, PP-sample comments in five inboxes, the blanket approval email, and the trainer's separate notes"
      actions={design ? <div className="flex gap-2 items-center"><span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>MTM only · an RTW bulk order is a <a className="vlink" href="#/requirements">Requirement</a></span><Button variant="primary" onClick={() => set('open', 'new')}>+ Log an MTM concept</Button></div> : <ActsBy role="design" does="logs a new concept from the design meeting" inline />}>
      <Tabs tabs={[{ id:'mine', label:'My turn', count: concepts.filter(mineNow).length, hint:'the next step on these is yours' }, { id:'open', label:'In progress', count: open.length }, { id:'live', label:'Live · sellable', count: concepts.filter(c => !!c.liveOn).length }, { id:'all', label:'All concepts' }]} active={tab} onChange={t => set('tab', t)} />
      {/* the number design plans around: about thirty active MTM options. The
          gap against it is what raises an option request — not a blank form. */}
      {(() => { const books = MTM_SWATCH_BOOKS.map(b => { const active = db.fabrics.filter(f => f.swatchBook === b && f.bucket !== 'BESPOKE' && !f.onHold && !f.paused).length; const coming = concepts.filter(c => c.kind === 'new-fabric' && !c.liveOn && c.fabricPo && c.book === b).length; return { b, active, coming, gap: MTM_ACTIVE_TARGET - active - coming }; });
        const short = books.filter(x => x.gap > 0);
        return <div className="flex items-center gap-2 flex-wrap mb-3 px-3 py-2 text-[12.5px]" style={{ background:'var(--surface-2)', borderRadius: 6 }}>
          <span style={{ color:'var(--ink-soft)' }}>Active options per book · plan {MTM_ACTIVE_TARGET}:</span>
          {books.map(x => <span key={x.b} className={`pill ${x.gap > 0 ? 'warn' : 'good'}`} title={`${x.active} active${x.coming ? ` + ${x.coming} with cloth on order` : ''} · ${x.gap > 0 ? `${x.gap} short` : 'met'}`}>{x.b.replace(/ SHIRTS?/i, '').replace(' - ', ' ')} · {x.active + x.coming}/{MTM_ACTIVE_TARGET}</span>)}
          {short.length > 0 && design && <a className="cta ml-auto" href={`#/design?new=options&count=${short.reduce((a, x) => a + x.gap, 0)}&category=${encodeURIComponent('MTM shirts')}&brief=${encodeURIComponent(`Assortment gap — ${short.map(x => `${x.b} ${x.gap} short`).join('; ')}`)}`}>raise a request for {short.reduce((a, x) => a + x.gap, 0)} option{short.reduce((a, x) => a + x.gap, 0) === 1 ? '' : 's'} →</a>}
          {short.length === 0 && <span className="ml-auto text-[11.5px]" style={{ color:'var(--ink-faint)' }}>every book at plan</span>}
        </div>; })()}

      {ex.strip && <div className="flex justify-end mb-2">{ex.strip}</div>}
      {rows.length === 0 ? <Card><Empty title="Nothing here." body="Log the next idea from the design meeting — with the why." /></Card> : <Card><div style={{ overflowX:'auto' }}><table className="t">
        <thead><tr><th>Concept</th><th>Kind</th><th>Stage</th><th>Waiting on</th><th>Fabric</th><th>Samples</th><th>Gates</th></tr></thead>
        <tbody>{ex.rows.map(({ c, s }) => <tr key={c.id} className="row" onClick={() => set('open', c.id)}>
          <td><div className="font-medium">{c.naming.newName ?? c.name}</div><div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{c.raisedBy} · {fmtDate(c.raisedOn)} · {s.ageDays}d{c.spec ? ` · ${c.spec}` : ''}</div></td>
          <td><Pill tone={c.kind === 'new-fabric' ? 'accent' : 'neutral'}>{c.kind === 'new-fabric' ? 'new fabric' : 'construction'}</Pill></td>
          <td><Pill tone={STAGE_TONE[s.stage]}>{s.stage}</Pill>{s.stuckDays > 5 && <div className="text-[10.5px]" style={{ color:'var(--risk)' }}>sample {s.stuckDays}d on the desk</div>}</td>
          <td className="text-[12px]">{s.waitingOn ? ROLE_LABEL[s.waitingOn] : <span style={{ color:'var(--ink-faint)' }}>—</span>}</td>
          <td className="text-[12px]">{s.fabric ? <>{s.fabric.name}<div className="mono text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{s.fabric.code}{s.fabric.onHold && !c.liveOn ? ' · hidden until live' : ''}</div></>
            : c.baseFabricId ? <>{db.fabrics.find(f => f.id === c.baseFabricId)?.name}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>inventory fabric</div></>
            /* offers on the table are the headline, not "with sourcing" */
            : s.offersWithDesign ? <><Pill tone="warn">{s.offers.length} offer{s.offers.length === 1 ? '' : 's'} · design to choose</Pill><div className="text-[10.5px]" style={{ color: s.holdDays != null && s.holdDays <= 5 ? 'var(--risk)' : 'var(--ink-faint)' }}>{s.firstBuy != null ? `from ${fmtMoney(s.firstBuy)}` : ''}{s.holdDays != null ? ` · ${s.holdDays < 0 ? `lapsed ${-s.holdDays}d ago` : `${s.holdDays}d left`}` : ''}</div></>
            : <span style={{ color:'var(--ink-faint)' }}>with sourcing</span>}</td>
          <td className="text-[12px]">{s.pp.rounds.length ? `PP ${s.pp.rounds.length} · ${s.pp.state}` : '—'}{s.ship.rounds.length ? <div>Ship {s.ship.rounds.length} · {s.ship.state}</div> : null}</td>
          <td><div className="flex gap-0.5">{s.gates.map(g => <span key={g.key} title={`${g.label} — ${g.note}`} className="dot" style={{ background: g.ok ? 'var(--good)' : 'var(--line)' }} />)}</div></td>
        </tr>)}</tbody>
      </table></div></Card>}
      <div className="mt-3"><Note>Twelve dots, one per gate, in order — a construction variant skips the block, PO and swatch gates.</Note></div>

      <Drawer open={!!active || params.get('open') === 'new'} onClose={() => set('open', null)} title={active ? (active.naming.newName ?? active.name) : 'Log a concept'}
        subtitle={active && <><Pill tone={STAGE_TONE[conceptOf(db, active).stage]}>{conceptOf(db, active).stage}</Pill><Pill tone={active.kind === 'new-fabric' ? 'accent' : 'neutral'}>{active.kind === 'new-fabric' ? 'new fabric' : 'construction variant'}</Pill><span>{active.raisedBy} · {fmtDate(active.raisedOn)}</span></>}>
        {params.get('open') === 'new' && <NewConcept onDone={id => set('open', id)} />}
        {active && <ConceptDetail c={active} design={design} prod={prod} />}
      </Drawer>
    </Page>
  );
}

export function NewConcept({ onDone }: { onDone: (id: string) => void }) {
  const { db, addConcept } = useApp();
  const [id] = useState(() => `cn-${Date.now().toString(36)}`);   // minted now so files can be attached before the record is saved
  const [kind, setKind] = useState<Concept['kind']>('construction');
  const [book, setBook] = useState(MTM_SWATCH_BOOKS[0]); const [target, setTarget] = useState('Nov 26');
  const [name, setName] = useState(''); const [brief, setBrief] = useState('');
  const [collar, setCollar] = useState(COLLAR_STYLES[3]); const [placket, setPlacket] = useState(PLACKETS[0]); const [cuff, setCuff] = useState(CUFF_STYLES[0]);
  const inventory = db.fabrics.filter(f => f.bucket !== 'BESPOKE' && !f.paused && !f.onHold && f.stockMetres > 20);
  const [base, setBase] = useState(inventory[0]?.id ?? '');
  const [more, setMore] = useState(false);   // book, wanted-by and the construction details wait until asked
  return <Section title="From the design meeting" collapsible={false}>
    <div className="grid gap-3" style={{ gridTemplateColumns:'1fr 1fr' }}>
      <Field label="Kind"><Select value={kind} onChange={v => setKind(v as Concept['kind'])} options={[{ value:'construction', label:'Construction variant on an existing fabric' }, { value:'new-fabric', label:'New fabric or shade' }]} /></Field>
      <Field label="Working name"><Input value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'new-fabric' ? 'Linen Lyocell Stripes - Sage' : 'Cutaway collar on Cotton Poplin'} /></Field>
      <div style={{ gridColumn:'1 / -1' }}><Field label="Why — the sentence the meeting never writes down" hint="stores, trainers and whoever picks this up in six months read this first"><Input value={brief} onChange={e => setBrief(e.target.value)} placeholder="Three stores asked for a softer collar on the Giza poplin; the Cutaway sells 2:1 on bespoke" /></Field></div>
      {!more && <div style={{ gridColumn:'1 / -1' }}><button type="button" className="vlink text-[12px]" onClick={() => setMore(true)}>more · book, wanted-by{kind === 'construction' ? ', construction' : ''}</button></div>}
      {more && <>
      <Field label="Swatch book / range" hint="which book it fills a gap in"><Select value={book} onChange={setBook} options={[...MTM_SWATCH_BOOKS, 'Leggiuno Bespoke'].map(x => ({ value:x, label:x }))} /></Field>
      <Field label="Wanted on the floor by"><Select value={target} onChange={setTarget} options={['Oct 26', 'Nov 26', 'Dec 26', 'Jan 27', 'Feb 27'].map(x => ({ value:x, label:x }))} /></Field>
      </>}
      {more && kind === 'construction' && <>
        <Field label="Sampled on (inventory fabric)"><Select value={base} onChange={setBase} options={inventory.map(f => ({ value:f.id, label:`${f.name} · ${f.stockMetres} m` }))} /></Field>
        <div className="grid gap-2" style={{ gridTemplateColumns:'1fr 1fr 1fr', gridColumn:'1 / -1' }}>
          <Field label="Collar"><Select value={collar} onChange={setCollar} options={COLLAR_STYLES.map(x => ({ value:x, label:x }))} /></Field>
          <Field label="Placket"><Select value={placket} onChange={setPlacket} options={PLACKETS.map(x => ({ value:x, label:x }))} /></Field>
          <Field label="Cuff"><Select value={cuff} onChange={setCuff} options={CUFF_STYLES.map(x => ({ value:x, label:x }))} /></Field>
        </div>
      </>}
    </div>
    <div className="pt-3"><div className="label">Files — sketch, reference image, PAT or CAD if it already exists</div><Files kind="concept" subjectId={id} labels={['Sketch / reference image', 'PAT file', 'CAD / pattern', 'Fabric swatch image', 'Tech pack']} editable compact emptyText="Nothing attached yet. A sketch or a reference photo is what the meeting actually looked at." /></div>
    <div className="pt-3"><Button variant="primary" disabled={!name.trim() || !brief.trim()} onClick={() => onDone(addConcept({ id, name: name.trim(), kind, brief: brief.trim(), spec: kind === 'construction' ? `${collar} · ${placket} · ${cuff}` : null, baseFabricId: kind === 'construction' ? base : null, book, targetMonth: target }))}>Log it</Button></div>
    {kind === 'new-fabric' && <div className="pt-2"><Note>Production samples on the vendor swatch first; bulk fabric is bought only after the shipment sample is approved.</Note></div>}
  </Section>;
}

export function ConceptDetail({ c, design, prod }: { c: Concept; design: boolean; prod: boolean }) {
  const { db, role, personId, setPerson, conceptSendPat, conceptAcceptAndRaisePo, conceptSendApproval, conceptConfigureEnigma, conceptSetName, conceptSetMarketing, conceptGoLive, conceptBlockFabric, conceptRaiseFabricPo, priceFabric , conceptSetEnigmaFlags, conceptOnline, conceptSwatch } = useApp();
  const s = conceptOf(db, c);
  const sourcing = role === 'sourcing' || role === 'owner';
  const me = PEOPLE.find(p => p.id === personId);
  /* who moves this section, said plainly — for whoever is looking and is not that person */
  const Who = ({ r, does }: { r: string; does: string }) =>
    <div className="pt-2 text-[11.5px]" style={{ color:'var(--ink-faint)' }}>→ <b style={{ color:'var(--ink-soft)' }}>{r}</b> {does}.</div>;
  const [price, setPrice] = useState(''); const [article, setArticle] = useState('');
  const factories = db.vendors.filter(v => v.mtm && v.kind !== 'Hemming unit');
  const [factory, setFactory] = useState(factories[0]?.id ?? '');
  const [tpl, setTpl] = useState(c.enigma.template ?? 'Shirt · standard'); const [base, setBase] = useState(String(c.enigma.consumptionBase ?? 1.6)); const [buf, setBuf] = useState(String(c.enigma.consumptionBuffer ?? 0.15)); const [opts, setOpts] = useState((c.enigma.options.length ? c.enigma.options : (c.spec ? c.spec.split(' · ') : [])).join(', '));
  const [largeCheck, setLargeCheck] = useState(!!c.enigma.largeCheck);
  const [family, setFamily] = useState(c.enigma.compositionFamily ?? '');
  const [newName, setNewName] = useState(c.naming.newName ?? ''); const [mrp, setMrp] = useState(String(c.naming.mrp ?? (s.fabric?.mrp ?? '')));
  const [apprText, setApprText] = useState(`${c.name} cleared the shipment sample.`);
  const [blurb, setBlurb] = useState(c.marketing?.blurb ?? ''); const [channels, setChannels] = useState<string[]>(c.marketing?.channels ?? ['Stores', 'Website']);
  const hasPat = filesOf(db.attachments, 'concept', c.id, undefined, ['PAT file', 'CAD / pattern']).length > 0;

  const flow = designFlowOf(db, { kind:'concept', c });
  return <>
    {/* the whole journey in six dots, over the record itself */}
    <FlowHeader item={{ kind:'concept', c }} />
    <div className="px-1 pb-1">
      <div className="text-[13px]" style={{ color:'var(--ink)' }}>{c.brief}</div>
      <div className="text-[11.5px] mt-1 flex gap-2 flex-wrap items-center" style={{ color:'var(--ink-faint)' }}>
        <span>{c.raisedBy} · {fmtDate(c.raisedOn)} · {s.ageDays} days ago</span>
        {c.spec && <span>· {c.spec}</span>}
        {(c.book || c.targetMonth) && <span>· {c.book ?? ''}{c.targetMonth ? ` · wanted by ${c.targetMonth}` : ''}</span>}
        {s.waitingOn && !c.liveOn && <span>· waiting on <b style={{ color:'var(--ink-soft)' }}>{ROLE_LABEL[s.waitingOn]}</b></span>}
      </div>
    </div>
    {/* ── 1 · Request — what you asked for, and why ─────────────────────── */}
    {/* one thing to do: the live step open, every other step one folded line */}
    {(() => { const nowKey: DesignStepKey | null = flow.now.state === 'done' ? null : flow.now.key;
      const bodies: Record<DesignStepKey, ReactNode> = {
        'request': <>
    <Section title="1 · Requirement requested" defaultOpen={nowKey === 'request'} right={<Pill tone="good">sent {fmtDate(c.raisedOn)}</Pill>}>
      <KV k="Why" v={c.brief} note={`${c.raisedBy} · ${fmtDate(c.raisedOn)}`} />
      {c.spec && <KV k="What changes" v={c.spec} note="the construction a customer will be able to pick" />}
      <KV k="Kind" v={c.kind === 'new-fabric' ? 'New fabric or shade' : 'Construction variant'} note={c.baseFabricId ? `sampled on ${db.fabrics.find(f => f.id === c.baseFabricId)?.name ?? 'an inventory fabric'}` : 'sampled on the vendor swatch'} />
      <KV k="Where it goes" v={c.book ?? '—'} note={c.targetMonth ? `wanted on the floor by ${c.targetMonth}` : undefined} />
    </Section>
    <Section title="Samples · optional" look="fold" pending={false} ownerRole={null} right={<Pill tone={s.ship.state === 'approved' ? 'good' : s.pp.state === 'with production unit' || s.ship.state === 'with production unit' ? 'warn' : 'neutral'}>{s.ship.state === 'approved' ? 'approved' : !c.patSentOn ? 'not started' : s.pp.state !== 'approved' ? `PP · ${s.pp.state}` : `shipment · ${s.ship.state}`}</Pill>}>
    <Section title="Sample & PAT file" owner={<OwnerPill owner="Production" />} right={<Pill tone={c.patSentOn ? 'good' : 'neutral'}>{c.patSentOn ? `sent ${fmtDate(c.patSentOn)}` : 'not sent'}</Pill>}>
      {c.patSentOn && <KV k="With" v={<VendorLink id={c.factoryId!} />} note={`${daysAgo(c.patSentOn)} days ago — a real-world handoff, now on the record`} />}
      <div className="label pt-1">The files that went with it</div>
      <Files kind="concept" subjectId={c.id} labels={['PAT file', 'CAD / pattern', 'Tech pack']} onlyLabels editable={design || prod} compact emptyText="No PAT or CAD file on this concept yet — add it here; the factory works from this, not from a WhatsApp forward." />
      {!c.patSentOn && (prod ? <div className="flex gap-2 items-end pt-3 flex-wrap" style={{ borderTop:'1px solid var(--line-soft)' }}><div style={{ width:220 }}><Field label="Factory"><Select value={factory} onChange={setFactory} options={factories.map(f => ({ value:f.id, label:f.name }))} /></Field></div><Button size="sm" variant="primary" disabled={!hasPat} onClick={() => conceptSendPat(c.id, factory)}>Sample &amp; PAT handed over</Button>{!hasPat && <span className="text-[11.5px]" style={{ color:'var(--warn)' }}>attach the PAT or CAD file first — the handoff is the file</span>}</div>
        : <><div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Production hands the physical sample and the PAT file to a factory.</div><Who r="Production" does={hasPat ? 'picks the factory and records the handoff — sampling starts right after the idea' : 'attaches the PAT file, picks the factory and records the handoff — sampling starts right after the idea'} /></>)}
    </Section>
    <RoundsSection c={c} gate="pp" title="PP sample · proof it works" design={design} prod={prod} enabled={!!c.patSentOn} />
    <RoundsSection c={c} gate="shipment" title="Shipment sample · the harder gate" design={design} prod={prod} enabled={s.pp.state === 'approved'} />
    <Section title="Approval to every department" owner={<OwnerPill owner="Production" />} right={<Pill tone={c.approvalSentOn ? 'good' : 'neutral'}>{c.approvalSentOn ? `posted ${fmtDate(c.approvalSentOn)}` : 'not yet'}</Pill>}>
      {c.approvalSentOn ? <KV k="Posted by" v={c.approvalBy ?? ''} note="one post on this record; design, production, warehouse and every store saw it on Today. The trainer's repository is this thread." />
        : s.ship.state === 'approved' && prod ? <div className="flex gap-2 items-end"><div className="flex-1"><Field label="What to tell everyone"><Input value={apprText} onChange={e => setApprText(e.target.value)} /></Field></div><Button size="sm" variant="primary" onClick={() => conceptSendApproval(c.id, apprText)}>Post approval</Button></div>
        : <><div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Once the shipment sample clears, one post here replaces the blanket email.</div>{s.ship.state === 'approved' && !prod && <Who r="Production" does="posts the approval" />}</>}
    </Section>
    </Section>
        </>,
        'sampling': null,
        'vendors': <>
    {c.kind === 'new-fabric'
      ? <Section title="2 · Vendor added" defaultOpen={nowKey === 'vendors'}
          right={(c.fabricOptions ?? []).some(o => o.selected) || c.fabricPo ? <Pill tone="good">chosen · PO pushed</Pill>
            : c.optionsExtension && !c.optionsExtension.resolvedOn ? <span className="pill role-sourcing">extension asked</span>
            : c.optionsSentOn ? <span className="pill role-design">design to push PO</span>
            : <span className="pill role-sourcing">sourcing to add vendors</span>}>
          {!s.fabric && !(c.fabricOptions ?? []).length && <Note><b>Pending with sourcing.</b> Sourcing puts one vendor against this cloth — the mill, its article, the price a metre, the minimum, the lead and how long the mill holds it. Then it comes to design to push the PO, ask for more time, or drop it.</Note>}
    {(() => { const offers = c.fabricOptions ?? []; const withDesign = !!c.optionsSentOn && !s.fabric; void offers; void withDesign;
      return <>
      {s.fabric ? <>
        <KV k="Fabric" v={<>{s.fabric.name} <span className="mono text-[11px]" style={{ color:'var(--ink-faint)' }}>{s.fabric.code}</span></>} note={`${s.fabric.composition ?? ''}${s.fabric.widthIn ? ` · ${s.fabric.widthIn}" panna` : ''}${s.fabric.swatchBook ? ` · ${s.fabric.swatchBook}` : ''}`} />
        <KV k="Vendor" v={<VendorLink id={s.fabric.vendorId} />} note={s.fabric.vendorCode ? `article ${s.fabric.vendorCode}${s.fabric.cpm ? ` · ₹${s.fabric.cpm}/m` : ''}` : undefined} />
        {/* what this concept has actually committed BSC to, in rupees */}
        {s.fabric.cpm != null && (() => { const chosen = (c.fabricOptions ?? []).find(o => o.selected);
          const metres = c.fabricPo?.metres ?? s.block?.metres ?? null;
          return <KV k="Committed so far" v={metres != null ? fmtMoney(metres * s.fabric!.cpm!) : `₹${s.fabric!.cpm}/m · nothing bought yet`}
            note={metres != null ? `${metres} m ${c.fabricPo ? 'on the fabric PO' : 'held at the mill'} at ₹${s.fabric!.cpm}/m${chosen ? ` · ${db.vendors.find(v => v.id === chosen.vendorId)?.name}, chosen by ${chosen.chosenBy ?? 'design'}` : ''}` : 'the price is agreed; the metres are committed when the block or the PO goes in'} />; })()}
      </> : null}
      {/* the mills' offers: sourcing brings them, design picks the shade and the
          price it is willing to carry — the same handoff as an RTW requirement */}
      <ConceptOptions c={c} sourcing={sourcing} design={design} />
      {sourcing && s.fabric && s.fabric.cpm == null && !(c.fabricOptions ?? []).some(o => !o.rejected) && <div className="flex gap-2 items-end pt-3 flex-wrap" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div style={{ width: 110 }}><Field label="₹ / m quoted"><Input value={price} onChange={e => setPrice(e.target.value)} /></Field></div>
        <div style={{ width: 160 }}><Field label="Vendor article"><Input value={article} onChange={e => setArticle(e.target.value)} placeholder={s.fabric.vendorCode ?? 'FY306849'} /></Field></div>
        <Button size="sm" variant="primary" disabled={!Number(price)} onClick={() => priceFabric(s.fabric!.id, Number(price), article.trim() || null)}>Price it</Button>
        <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>the swatch is in; the gate closes when the price is written down</span>
      </div>}
      {!sourcing && !c.optionsSentOn && (!s.fabric || s.fabric.cpm == null) && <Who r="Sourcing" does={!s.fabric ? 'goes round the mills for the same cloth and brings the offers back' : 'writes the quoted price against it'} />}
      {c.fabricPo && <div className="pt-3 mt-2" style={{ borderTop:'1px solid var(--line)' }}><div className="label">The purchase order</div>
      {s.block && <KV k="Block" v={`${s.block.metres} m · ${s.block.status}`} note={s.block.status === 'held' ? `expires ${fmtDate(s.block.expiresOn)} · ${-daysAgo(s.block.expiresOn)}d — the one copy, with a countdown` : `agreed ${fmtDate(s.block.agreedOn)}`} />}
      {c.fabricPo && (() => { const po = (db.fabricPos ?? []).find(p => p.fabricId === c.fabricId);
        return <>
          <KV k="Fabric PO" v={<>{po?.poNo ?? `${c.fabricPo!.metres} m`} <span style={{ color:'var(--ink-faint)' }}>· {c.fabricPo!.metres} m</span></>}
            note={`raised ${fmtDate(c.fabricPo!.on)}${s.fabric?.cpm ? ` · ${fmtMoney(c.fabricPo!.metres * s.fabric.cpm)} at ₹${s.fabric.cpm}/m` : ''}${po ? ` · expected ${fmtDate(po.expectedOn)}` : ''}`} />
          {po && <PoReceiving po={po} editable={role === 'warehouse' || role === 'owner'} />}
          {po && <KV k="On the fabric master" v={<a className="cta" href="#/fabrics?tab=pos">{po.poNo} · {po.vendorConfirmedOn ? 'mill confirmed' : 'waiting on the mill'} →</a>} note="sourcing chases it there; the warehouse receives it against this number" />}
        </>; })()}
      {false && <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>A concept that fails costs a sample, not a bulk.</div>}
      {!s.fabric && !c.fabricPo && <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Waits for step 2 — a vendor against the cloth, then design pushes the PO from there.</div>}
      {c.fabricPo && <div className="pt-2"><Note tone="good">Design raised the PO. <b>Sourcing's turn:</b> chase the mill and book the metres in — they land as incoming on the fabric record.</Note></div>}
      </div>}
    </>; })()}
        </Section>
      : <Section title="2 · Vendor added" defaultOpen={nowKey === 'vendors'} right={<Pill tone="neutral">nothing to buy</Pill>}>
          <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>A construction variant is made on cloth we already hold — no mill to choose, no fabric to buy.</div>
        </Section>}

    {/* ── 4 · Purchase order — design raises it, sourcing works against it ─ */}
        </>,
        'po': null,
        'fabric-in': <>
    {c.kind === 'new-fabric' && (() => { const f2 = designFlowOf(db, { kind:'concept', c }); const st = f2.steps.find(x => x.key === 'fabric-in')!;
      return <Section title="3 · Fabric in" defaultOpen={nowKey === 'fabric-in'} right={<Pill tone={st.state === 'done' ? 'good' : 'neutral'}>{st.state === 'done' ? 'received' : c.fabricPo ? 'on its way' : 'after the PO'}</Pill>}>
        <div className="py-1 text-[12.5px]" style={{ color: st.state === 'done' ? 'var(--good)' : 'var(--ink-soft)' }}>{st.note}</div>
        {c.fabricPo && st.state !== 'done' && <Note>This line turns green the day the warehouse books the metres in.</Note>}
        <div className="pt-2" />
      {/* ── design setup runs in parallel with the swatches: preset + category +
          fabric code = the DESIGN CODE Shopify sells. The name starts temporary. ── */}
      <Section title={`Designs on this fabric · ${(c.designs ?? []).length}`} owner={<OwnerPill owner="Design" />} right={<Pill tone={(c.designs ?? []).length ? 'good' : 'neutral'}>{(c.designs ?? []).length ? `${(c.designs ?? []).length} product code${(c.designs ?? []).length === 1 ? '' : 's'}` : 'none yet'}</Pill>}>
        <DesignsOnFabric c={c} canEdit={sourcing || design} />
      </Section>
      <Section title="Configured in Enigma" owner={<OwnerPill owner="Design" />} right={<Pill tone={c.enigma.configuredOn ? 'good' : 'neutral'}>{c.enigma.configuredOn ? `done ${fmtDate(c.enigma.configuredOn)}` : 'pending'}</Pill>}>
        {c.enigma.configuredOn ? <>
          <KV k="Template" v={c.enigma.template ?? ''} />
          <KV k="Consumption rule" v={`${c.enigma.consumptionBase} m + ${c.enigma.consumptionBuffer} m buffer`} note="what the order sheet computes per piece" />
          <KV k="Order-sheet options" v={c.enigma.options.join(', ') || '—'} note={`by ${c.enigma.by}`} />
        </> : design && c.approvalSentOn ? <>
          <div className="grid gap-2" style={{ gridTemplateColumns:'1.4fr .7fr .7fr' }}>
            <Field label="Template"><Input value={tpl} onChange={e => setTpl(e.target.value)} /></Field>
            <Field label="Base m"><Input value={base} onChange={e => setBase(e.target.value)} /></Field>
            <Field label="Buffer m"><Input value={buf} onChange={e => setBuf(e.target.value)} /></Field>
          </div>
          <Field label="Options the customer can pick" hint="comma-separated — the pick-and-choose logic on the order sheet"><Input value={opts} onChange={e => setOpts(e.target.value)} /></Field>
          <div className="pt-2"><Button size="sm" variant="primary" disabled={!tpl.trim() || !Number(base)} onClick={() => conceptConfigureEnigma(c.id, { template: tpl.trim(), consumptionBase: Number(base), consumptionBuffer: Number(buf) || 0, options: opts.split(',').map(x => x.trim()).filter(Boolean) })}>Configured in Enigma</Button></div>
          <div className="pt-2"><Note>Nothing is orderable until someone records that the tech pack was done.</Note></div>
        </> : <><div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Follows the approval. Template, consumption rule, order-sheet options.</div>{c.approvalSentOn && !design && <Who r="Design" does="configures it in Enigma — template, consumption rule, order-sheet options" />}</>}
      </Section>

      <Section title="Enigma flags that drive the flow" owner={<OwnerPill owner="Design" />} right={<span className="flex gap-1">{c.enigma.largeCheck && <Pill tone="warn">large check</Pill>}{c.enigma.compositionFamily && <Pill tone="neutral">{c.enigma.compositionFamily}</Pill>}</span>}>
        <div className="text-[12.5px] pb-2" style={{ color:'var(--ink-soft)' }}>Enigma stays the master for every attribute. Two of them change what happens here: a <b>large check</b> (over about two inches) has to be matched in cutting, so consumption goes up; the <b>composition family</b> is the website filter beside the exact composition.</div>
        {design ? <div className="flex items-end gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-[13px] pb-2"><input type="checkbox" checked={largeCheck} onChange={e => setLargeCheck(e.target.checked)} /> Large check / pattern — match in cutting</label>
          <div style={{ width: 200 }}><Field label="Composition family · website filter"><Select value={family} onChange={setFamily} options={[{ value:'', label:'—' }, ...COMPOSITION_FAMILIES.map(x => ({ value:x, label:x }))]} /></Field></div>
          <Button size="sm" disabled={largeCheck === !!c.enigma.largeCheck && family === (c.enigma.compositionFamily ?? '')} onClick={() => conceptSetEnigmaFlags(c.id, { largeCheck, compositionFamily: family || null })}>Save</Button>
          {largeCheck && c.enigma.consumptionBase != null && <span className="text-[11.5px]" style={{ color:'var(--warn)' }}>consumption on the order sheet reads {c.enigma.consumptionBase} m + {c.enigma.consumptionBuffer} m + matching</span>}
        </div> : <><KV k="Large check" v={c.enigma.largeCheck ? 'yes — matched in cutting, consumption up' : 'no'} /><KV k="Composition family" v={c.enigma.compositionFamily ?? '—'} /></>}
      </Section>

      <Section title="Name & price" owner={<OwnerPill owner="Design" />} right={<Pill tone={c.naming.setOn ? 'good' : 'neutral'}>{c.naming.setOn ? 'set' : 'pending'}</Pill>}>
        <KV k="Working name" v={c.naming.oldName ?? c.name} note="design's name on the request — kept, never overwritten" />
        {(() => { const f = c.fabricId ? db.fabrics.find(x => x.id === c.fabricId) : null; const h = f?.nameHistory ?? []; return h.length ? <KV k="Earlier names" v={h.map(x => x.name).join(' · ')} note="every rename stays on the fabric master, with who and when" /> : null; })()}
        {c.naming.setOn ? <KV k="Final" v={`${c.naming.newName} · ₹${c.naming.mrp?.toLocaleString('en-IN')}`} note={`${fmtDate(c.naming.setOn)} · the website, the swatch sticker and Enigma read this one line`} />
          : design ? <div className="flex gap-2 items-end"><div className="flex-1"><Field label="Final product name"><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Houndstooth Shirt - Light Grey" /></Field></div><div style={{ width:120 }}><Field label="MRP ₹"><Input value={mrp} onChange={e => setMrp(e.target.value)} /></Field></div><Button size="sm" variant="primary" disabled={!newName.trim() || !Number(mrp)} onClick={() => conceptSetName(c.id, newName.trim(), Number(mrp))}>Set</Button></div>
          : <><div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>The bible's REVISED NAME step — old name, new name, price. Follows the Enigma configuration.</div>{c.enigma.configuredOn && !design && <Who r="Design" does="sets the final name and MRP" />}</>}
      </Section>
      </Section>; })()}
        </>,
        'live': <>
    <Section title="4 · Live online" defaultOpen={nowKey === 'live'}
      right={<span className="flex gap-1 flex-wrap justify-end">
        {c.kind === 'new-fabric' && <Pill tone={c.online?.liveOn ? 'good' : 'accent'}>{c.online?.liveOn ? `online ${fmtDate(c.online.liveOn)}` : 'design to switch on'}</Pill>}
        <Pill tone={c.liveOn ? 'good' : 'neutral'}>{c.liveOn ? `stores ${fmtDate(c.liveOn)}` : 'stores · after the swatch desk'}</Pill>
      </span>}>
      {(() => { const on = c.online; const gates: ['photos' | 'video' | 'post', string, string | null | undefined][] = [['photos', 'Swatch photography', on?.photosOn], ['video', 'Video', on?.videoOn], ['post', 'Post-production · PDP ready', on?.postOn]];
        const allDone = gates.every(g => g[2]);
        return <Section title="Live online" owner={<OwnerPill owner="Design" />} right={<Pill tone={on?.liveOn ? 'good' : 'accent'}>{on?.liveOn ? `live ${fmtDate(on.liveOn)}` : `${gates.filter(g => g[2]).length} of 3 · design's call, any time`}</Pill>}>
          <div className="text-[12.5px] pb-1" style={{ color:'var(--ink-soft)' }}>Its own track, not tied to the swatch desk: design can take a fabric live online whenever the photography, video and post are done. Stores need the physical swatch, so going live in stores waits for Yusuf.</div>
          {gates.map(([k, label, d]) => <div key={k} className="kv"><span className="k">{label}</span><span className="v flex items-center gap-2 justify-end">{d ? <>{fmtDate(d)}<Pill tone="good">done</Pill></> : design ? <Button size="sm" onClick={() => conceptOnline(c.id, k)}>Mark done</Button> : <span style={{ color:'var(--ink-faint)' }}>{c.liveOn ? 'pending' : 'after stores go live'}</span>}</span></div>)}
          {on?.liveOn ? <KV k="Online" v={`live ${fmtDate(on.liveOn)}`} note={c.liveOn ? `${Math.round((new Date(on.liveOn).getTime() - new Date(c.liveOn).getTime()) / 864e5)} days after stores` : undefined} />
            : allDone && design ? <div className="pt-2"><Button variant="primary" onClick={() => conceptOnline(c.id, 'live')}>Go live online</Button></div> : null}
        </Section>; })()}
      <div className="pt-2" />
      {!c.liveOn && !MTM_ONLY && <Section title="Story & live in stores" owner={<OwnerPill owner="Design" />} right={<Pill tone={s.ready ? 'good' : 'neutral'}>{s.ready ? 'ready' : `${s.blockers} open`}</Pill>}>
        {/* what the store and the website say on launch day — the last thing
            design decides, and the one the swatch sticker copies */}
        {c.marketing ? <KV k="The story" v={<span className="text-[12.5px]">{c.marketing.blurb}</span>} note={c.marketing.channels.join(' · ')} /> : null}
        {design && <div className="grid gap-2.5 py-1">
          <Field label="What the store and the website say" hint="one sentence the customer reads"><Input value={blurb} onChange={e => setBlurb(e.target.value)} placeholder={c.marketing?.blurb || 'A soft-washed ink check in 100% cotton — the darker casual we have been missing.'} /></Field>
          <div className="flex gap-3 flex-wrap items-center text-[12.5px]">{['Stores', 'Website', 'Swatch books', 'Social'].map(ch => <label key={ch} className="flex items-center gap-1"><input type="checkbox" checked={channels.includes(ch)} onChange={e => setChannels(v => e.target.checked ? [...v, ch] : v.filter(x => x !== ch))} /> {ch}</label>)}</div>
          <div><Button size="sm" disabled={!blurb.trim()} onClick={() => conceptSetMarketing(c.id, blurb.trim(), channels)}>Save the story</Button></div>
        </div>}
        {design ? <div className="pt-2 flex items-center gap-3 flex-wrap" style={{ borderTop:'1px solid var(--line-soft)' }}><Button variant="primary" disabled={!c.swatch?.storesToldOn} title={c.swatch?.storesToldOn ? 'switch it on in stores' : 'needs the swatch desk first — Yusuf cuts, the swatches go out, stores are told'} onClick={() => conceptGoLive(c.id)}>Go live in stores</Button>{!c.swatch?.storesToldOn && <span className="text-[11.5px]" style={{ color:'var(--warn)' }}>waits for the swatch desk — stores sell from the physical swatch</span>}<span className="text-[11.5px]" style={{ color: s.ready ? 'var(--ink-faint)' : 'var(--warn)' }}>{s.ready ? 'every gate is green' : `${s.blockers} gate${s.blockers === 1 ? '' : 's'} still open — your call, the record keeps what was skipped`}</span></div>
          : <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>{s.ready ? 'Design makes it live.' : 'Live is a decision, taken when every gate above is green — not whenever the Enigma step happens to finish.'}</div>}
        {s.ready && !design && <Who r="Design" does="makes it live" />}
      </Section>}
      {c.kind === 'new-fabric' && (() => { const sw = c.swatch; const steps: [string, string | null | undefined][] = [['bulk received', sw?.inwardOn], ['to swatches', sw?.handoverOn], ['cut', sw?.cutOn], ['sticker', sw?.stickerOn], ['dispatched', sw?.dispatchedOn], ['photos', sw?.photosOn], ['stores told', sw?.storesToldOn], ['live', c.liveOn]];
        const stepsShown = MTM_ONLY ? steps.slice(0, 2) : steps;
        const done = stepsShown.filter(x => x[1]).length; const next = stepsShown.find(x => !x[1]);
        return <Section title="Swatch desk" owner={<OwnerPill owner={next && ['stores told', 'live'].includes(next[0]) ? 'Design' : 'Warehouse'} />} right={<Pill tone={done === stepsShown.length ? 'good' : 'neutral'}>{done} of {stepsShown.length}</Pill>}>
          <div className="flex gap-1.5 flex-wrap py-1">{stepsShown.map(([k, d]) => <span key={k} className={`pill ${d ? 'good' : ''}`} title={d ? fmtDate(d) : 'not yet'}>{d ? '✓ ' : ''}{k}</span>)}</div>
          <div className="text-[12.5px] pt-1" style={{ color:'var(--ink-soft)' }}>{sw?.priority && next ? <b style={{ color:'var(--info)' }}>Priority — cut first. </b> : null}{next ? `Next: ${next[0]}. ` : 'Every step done. '}{c.fabricPo || sw ? <a className="cta" href={`#/swatches?open=${c.id}`}>open on the swatch desk →</a> : 'appears on the desk once the PO is pushed.'}</div>
          {sw?.dispatchedOn && !sw.storesToldOn && design && <div className="pt-2"><Button size="sm" onClick={() => conceptSwatch(c.id, 'storesTold')}>Stores told to display it</Button></div>}
        </Section>; })()}
    </Section>
        </>
      };
      /* the five stages in sequence — the current one opens, the rest sit folded in order */
      return <>{flow.steps.map(x => <div key={x.key}>{bodies[x.key]}</div>)}</>; })()}

    <RecordTail kind="concept" subjectId={c.id} labels={FILE_LABELS.concept} editable={design || prod} steps={['General', 'Fabric', 'PP sample', 'Shipment sample', 'Approval', 'Enigma']} />
  </>;
}

export function RoundsSection({ c, gate, title, design, prod, enabled }: { c: Concept; gate: ConceptRound['gate']; title: string; design: boolean; prod: boolean; enabled: boolean }) {
  const { db, conceptSubmitSample, conceptReviewSample } = useApp();
  const s = conceptOf(db, c); const g = gate === 'pp' ? s.pp : s.ship;
  const [draft, setDraft] = useState<ConceptRound['comments']>([]);
  const [area, setArea] = useState<SampleArea>('Stitching'); const [text, setText] = useState(''); const [major, setMajor] = useState(true);
  const tone = g.state === 'approved' ? 'good' : g.state === 'resubmit' ? 'risk' : g.state === 'with production unit' ? 'warn' : 'neutral';
  return <Section title={title} owner={<OwnerPill owner={g.state === 'with production unit' ? 'Design' : 'Production'} />} right={<Pill tone={tone}>{g.state}</Pill>}>
    {!enabled && <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>{gate === 'pp' ? 'Starts once the PAT file is with the factory.' : 'Starts once the PP sample is approved.'}</div>}
    {enabled && g.rounds.length === 0 && <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>No round has reached the unit yet.</div>}
    {g.rounds.map(r => <div key={r.round} className="kv" style={{ alignItems:'flex-start' }}>
      <span className="k"><b style={{ color:'var(--ink)' }}>Round {r.round}</b> · received {fmtDate(r.submittedOn)}{r.reviewedOn ? ` · reviewed ${fmtDate(r.reviewedOn)} by ${r.reviewedBy}` : ` · ${daysAgo(r.submittedOn)}d on the desk`}
        {r.comments.length > 0 && <div className="text-[11.5px] mt-1">{r.comments.map((x, i) => <div key={i}><span style={{ color: x.major ? 'var(--risk)' : 'var(--ink-faint)' }}>{x.major ? 'major' : 'minor'}</span> · {x.area} — {x.text}</div>)}</div>}</span>
      <span className="v"><Pill tone={r.decision === 'approved' ? 'good' : r.decision === 'resubmit' ? 'risk' : 'warn'}>{r.decision === 'approved' ? 'approved' : r.decision === 'resubmit' ? 'resubmit' : 'under review'}</Pill></span>
    </div>)}
    {g.rounds.length > 0 && <Files kind="concept" subjectId={c.id} labels={['Sample photo', 'Green slip']} step={`${gate === 'pp' ? 'PP' : 'Shipment'} round ${g.last!.round}`} editable={design || prod} compact />}
    {design && g.state === 'with production unit' && g.last && <div className="pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
      <div className="label">Review round {g.last.round} — construction, fit, wash, hand-feel</div>
      <div className="grid gap-2 py-1 items-end" style={{ gridTemplateColumns:'1.2fr 2.4fr auto auto' }}>
        <Select value={area} onChange={v => setArea(v as SampleArea)} options={SAMPLE_AREAS.map(a => ({ value:a, label:a }))} />
        <Input value={text} onChange={e => setText(e.target.value)} placeholder="what is wrong, precisely" />
        <label className="text-[12px] flex items-center gap-1"><input type="checkbox" checked={major} onChange={e => setMajor(e.target.checked)} /> major</label>
        <Button size="sm" disabled={!text.trim()} onClick={() => { setDraft(d => [...d, { area, text: text.trim(), major }]); setText(''); }}>+ add</Button>
      </div>
      {draft.length > 0 && <div className="text-[12px] py-1">{draft.map((x, i) => <div key={i}><span style={{ color: x.major ? 'var(--risk)' : 'var(--ink-faint)' }}>{x.major ? 'major' : 'minor'}</span> · {x.area} — {x.text}</div>)}</div>}
      <div className="flex gap-2 pt-2 flex-wrap">
        <Button size="sm" variant="primary" disabled={draft.some(x => x.major)} onClick={() => { conceptReviewSample(c.id, g.last!.round, draft, 'approved'); setDraft([]); }}>Approve{draft.length ? ' with comments' : ''}</Button>
        <Button size="sm" variant="danger" disabled={!draft.some(x => x.major)} onClick={() => { conceptReviewSample(c.id, g.last!.round, draft, 'resubmit'); setDraft([]); }}>Send back — new round</Button>
        <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>a fail is a new round on this same concept, never a restart — assumed, not confirmed</span>
      </div>
    </div>}
    {prod && enabled && g.state !== 'with production unit' && g.state !== 'approved' && <div className="pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}><Button size="sm" variant="primary" onClick={() => conceptSubmitSample(c.id, gate)}>Log {gate === 'pp' ? 'PP' : 'shipment'} sample · round {g.rounds.length + 1} received from {db.vendors.find(v => v.id === c.factoryId)?.name ?? 'the factory'}</Button><span className="text-[11.5px] ml-2" style={{ color:'var(--ink-faint)' }}>Production logs it the day the sample lands at the unit; Planning &amp; Design then reviews it here.</span></div>}
    {enabled && g.state !== 'approved' && (g.state === 'with production unit'
      ? <ActsBy role="design" does="reviews this round — approve it, or send it back with the green slip" />
      : <ActsBy role="production" does="logs the next round the day the factory's sample reaches the unit" />)}
  </Section>;
}

/* ---------- the mills' offers against one concept -------------------------
   For a new fabric the cloth IS the concept, so this is the decision that
   settles both the shade and what it costs to carry: sourcing goes round the
   houses and records each offer with its price, its minimum and how long the
   mill will hold it; design picks one, seeing the spend each one implies. */
export function ConceptOptions({ c, sourcing, design }: { c: Concept; sourcing: boolean; design: boolean }) {
  const { db, conceptAddFabricOption, conceptUpdateFabricOption, conceptRemoveFabricOption, conceptRejectFabricOption, conceptSendOptionsToDesign, conceptUnchooseFabric, conceptAskOptionExtension, conceptExtendOption, conceptSendOptionsBack, conceptAcceptAndRaisePo } = useApp();
  /* One vendor against the concept — the same rule as a request's option.
     Sourcing puts it there (and can edit it in place); design pushes the PO,
     rejects it, or asks for more time; a rejected or withdrawn vendor stays
     on the record underneath, so the history is never lost. */
  const opts = c.fabricOptions ?? [];
  const sent = !!c.optionsSentOn;
  const q = opts.find(x => !x.rejected) ?? null;
  const chosen = opts.find(x => x.selected) ?? null;
  const rejected = opts.filter(x => x.rejected);
  const asked = !!c.optionsExtension && !c.optionsExtension.resolvedOn;
  const nameOf = (id: string) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const [why, setWhy] = useState('');
  const [metres, setMetres] = useState('');
  const [editing, setEditing] = useState(false);
  const [extDate, setExtDate] = useState('');
  const left = q?.holdUntil ? -daysAgo(q.holdUntil) : null;
  const lapsed = left != null && left < 0;
  const m = metres || String(q?.moq ?? '');
  const faint = { color:'var(--ink-faint)' } as const;
  const cell = (k: string, v: React.ReactNode) => <div key={k}><div className="text-[10.5px] mono uppercase" style={{ ...faint, letterSpacing:'.05em' }}>{k}</div><div>{v}</div></div>;

  const card = q && <div className="px-3 py-2.5" style={{ background: q.selected ? 'var(--good-soft)' : 'var(--surface-2)', borderRadius: 6 }}>
    <div className="flex items-start gap-3 flex-wrap">
      <div style={{ minWidth: 200, flex:'1 1 220px' }}>
        <div className="font-medium"><VendorLink id={q.vendorId} />{q.vendorCode ? <span className="mono text-[11px]" style={faint}> · {q.vendorCode}</span> : null}</div>
        <div className="text-[12.5px]">{q.name}</div>
        <div className="text-[11.5px]" style={faint}>{q.composition}{q.widthIn ? ` · ${q.widthIn}" panna` : ''}{q.note ? ` · ${q.note}` : ''}</div>
      </div>
      <div className="flex gap-4 flex-wrap text-[12.5px]" style={{ flex:'2 1 320px' }}>
        {cell('₹ / m', <b>₹{q.cpm}</b>)}{cell('MOQ', `${q.moq} m`)}{cell(Number(m) && Number(m) !== q.moq ? `buy · ${m} m` : 'first buy', <b>{fmtMoney(q.cpm * (Number(m) || q.moq))}</b>)}{cell('lead', `${q.leadDays}d`)}
        {cell('holds until', q.holdUntil ? <span style={{ color: left != null && left <= 5 ? 'var(--risk)' : undefined }}>{fmtDate(q.holdUntil)} · {lapsed ? `lapsed ${-left!}d ago` : `${left}d left`}</span> : '—')}
        {q.extensionAsked && cell('extension', <Pill tone="warn">asked {fmtDate(q.extensionAsked.on)}</Pill>)}
      </div>
    </div>
    <div className="flex gap-2 items-center flex-wrap pt-2 mt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
      {q.selected ? <Pill tone="good">chosen{q.chosenOn ? ` · ${fmtDate(q.chosenOn)}` : ''}</Pill>
        : sent && design ? <>
          <span className="text-[11.5px]" style={faint}>metres</span>
          <Input type="number" value={m} onChange={e => setMetres(e.target.value)} style={{ width: 72, padding:'3px 6px' }} />
          <Button size="sm" variant={lapsed ? undefined : 'primary'} title={lapsed ? 'the hold has lapsed — the price is not promised; ask for more time first' : `push the fabric PO to ${nameOf(q.vendorId)} for ${m} m`} onClick={() => conceptAcceptAndRaisePo(c.id, q.id, Number(m) || q.moq, why.trim())}>Push PO · {fmtMoney(q.cpm * (Number(m) || q.moq))}</Button>
          {lapsed && <span className="text-[11.5px]" style={{ color:'var(--risk)' }}>hold lapsed — the price is not promised</span>}
          <button type="button" className="btn sm" onClick={() => conceptRejectFabricOption(c.id, q.id, why.trim())}>Reject</button>
          {q.extensionAsked ? null : <button type="button" className="btn sm" onClick={() => conceptAskOptionExtension(c.id, `${nameOf(q.vendorId)}: ${why.trim() || 'need longer than the hold'}`, q.id)}>More time</button>}
        </> : null}
      {sourcing && !q.selected && !editing && <><div className="flex-1" /><Button size="sm" onClick={() => setEditing(true)}>Edit</Button></>}
    </div>
  </div>;

  return <div className="pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
    <div className="flex items-baseline justify-between gap-2 flex-wrap pb-1">
      <div className="label" style={{ margin:0 }}>The vendor</div>
      {sent && !chosen && <Pill tone="info">with design since {fmtDate(c.optionsSentOn!)}</Pill>}
    </div>
    {sent && design && !chosen && q && <div className="pb-2"><Field label="Why — kept on the concept, and sent back with a rejection" hint="Push PO, Reject and More time all carry it"><Input value={why} onChange={e => setWhy(e.target.value)} placeholder="the hand is right and the shade matches the approved sample" /></Field></div>}

    {q && editing ? <div className="px-3 py-2" style={{ background:'var(--accent-soft)', borderRadius: 6 }}><VendorEditor title="The vendor against this concept" brief={c.name} targetCost={null} fabricQtyPerPc={null} current={q} onSave={patch => { conceptUpdateFabricOption(c.id, q.id, patch); setEditing(false); }} onCancel={() => setEditing(false)} /></div>
      : q ? card
      : sourcing && !chosen && !c.fabricPo ? <VendorEditor title="Put a vendor against this concept" brief={c.name} targetCost={null} fabricQtyPerPc={null} current={null} onSave={v => conceptAddFabricOption(c.id, { fabricId: null, ...v })} />
      : <div className="empty mt-1"><b>No vendor yet.</b> Sourcing is at the mills.</div>}

    {rejected.length > 0 && <div className="text-[11.5px] pt-2" style={faint}>
      {rejected.map(x => <div key={x.id}>✕ {nameOf(x.vendorId)} · {x.name} · ₹{x.cpm}/m — {x.rejected!.reason || 'no reason given'} <span>({fmtDate(x.rejected!.on)})</span></div>)}
    </div>}

    {sourcing && q && !sent && !editing && !chosen && <div className="flex gap-2 items-center flex-wrap pt-3"><div className="flex-1" /><Button variant="primary" onClick={() => conceptSendOptionsToDesign(c.id)}>Send to design →</Button></div>}
    {!sourcing && !sent && !chosen && <div className="pt-2"><Note>Sourcing puts one vendor against this concept and sends it to design.</Note></div>}
    {sent && !design && !chosen && <div className="pt-2"><Note>With design since {fmtDate(c.optionsSentOn!)} — they push the PO, reject, or ask for more time.</Note></div>}

    {/* extension asked — sourcing answers */}
    {asked && <div className="mt-3 pt-3" style={{ borderTop:'1px solid var(--line)' }}>
      <Note tone="warn"><b>Design asked for an extension</b>{c.optionsExtension!.note ? ` — "${c.optionsExtension!.note}"` : ''}</Note>
      {sourcing && q && (() => { const val = extDate || dateInput(iso(addDays(TODAY, 14))); return <>
        <div className="flex items-center gap-3 flex-wrap px-3 py-2 mt-3" style={{ background: lapsed ? 'var(--risk-soft)' : 'var(--surface-2)', borderRadius: 6 }}>
          <span className="font-medium" style={{ minWidth: 140 }}>{nameOf(q.vendorId)}</span>
          <span className="text-[12px]" style={{ color: lapsed ? 'var(--risk)' : 'var(--ink-soft)' }}>{q.holdUntil ? `${fmtDate(q.holdUntil)} · ${lapsed ? `lapsed ${-left!}d ago` : `${left}d left`}` : 'no hold given'}</span>
          <div className="flex-1" />
          <span className="text-[11.5px]" style={faint}>new hold until</span>
          <Input type="date" value={val} onChange={e => setExtDate(e.target.value)} style={{ width: 150, padding:'3px 6px' }} />
          <Button size="sm" variant={lapsed ? 'primary' : undefined} onClick={() => conceptExtendOption(c.id, q.id, fromDateInput(val) ?? iso(addDays(TODAY, 14)))}>Extend</Button>
        </div>
        <div className="flex items-center gap-3 flex-wrap pt-3">
          <Button variant="primary" disabled={lapsed} onClick={() => conceptSendOptionsBack(c.id)}>Send back to design</Button>
          <button type="button" className="btn sm" title="the mill will not hold — withdraw this vendor and put another against the concept" onClick={() => conceptRemoveFabricOption(c.id, q.id)}>Drop vendor</button>
        </div></>; })()}
    </div>}

    {/* chosen, but nothing bought — design may still change its mind */}
    {chosen && design && !c.fabricPo && !c.blockId && <div className="mt-3 pt-3 flex items-center gap-3 flex-wrap" style={{ borderTop:'1px solid var(--line-soft)' }}>
      <span className="text-[12.5px]"><b>{nameOf(chosen.vendorId)}</b> chosen{chosen.chosenOn ? ` on ${fmtDate(chosen.chosenOn)}` : ''}{chosen.rationale ? ` — "${chosen.rationale}"` : ''}</span>
      <div className="flex-1" />
      <Button size="sm" onClick={() => conceptUnchooseFabric(c.id)}>Unchoose</Button>
    </div>}
  </div>;
}
