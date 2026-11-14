/* The RTW chain as BSC set it on 14 Nov 2026, each step a section on the record: the five-part
   requirement and its gate; the cost query to factories and their replies; the PO, mailed with
   the delivery location and the TNA form; the planned dates back; QC at five points on the TNA;
   the invoice and packing list to the warehouse; receipt on Enigma; COGS. */
import { useState } from 'react';
import { useApp } from '../store';
import type { ProductionOrder, QcPoint, RequirementPack, TechPackKey } from '../domain/types';
import { fmtDate, daysAgo, receiptOf, fmtMoney, costingOf, netOf } from '../domain/engines';
import { TECH_PACK_ITEMS, QC_POINTS } from '../domain/reference';
import { packOf, packReadyOf, recommendFactories, needsHemmingOf, deliveryLocationOf, qcPointsOf, costQueryMail, poMailOf, invoiceMailOf, vendorMail, type Mail } from '../domain/rtwPack';
import { Section, Pill, Button, KV, Field, Input, Select, fromDateInput, dateInput } from '../ui';
import { VendorLink } from './Vendors';
import { ActsBy } from './Who';
import { SizeGrid, ReceiptLots } from './RtwGates';
import { BomSection } from './Costing';

const faint = { color: 'var(--ink-faint)' } as const;
const soft = { color: 'var(--ink-soft)' } as const;

/* a mail PLM composed: who it went to, what it said, what rode with it. Nobody types these. */
export function MailCard({ mail, sentOn, label }: { mail: Mail; sentOn: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  return <div className="mail-card">
    <div className="flex items-center gap-2 flex-wrap"><span className="mail-ic" aria-hidden>✉</span><b>{label}</b><Pill tone={sentOn ? 'good' : 'neutral'}>{sentOn ? `auto-mailed ${fmtDate(sentOn)}` : 'composed on send'}</Pill><button type="button" className="vlink text-[11.5px] ml-auto" onClick={() => setOpen(v => !v)}>{open ? 'hide' : 'show the mail'}</button></div>
    <div className="text-[11.5px] pt-1" style={soft}><b>To</b> {mail.to.join(', ')}{mail.cc.length ? <> · <b>cc</b> {mail.cc.join(', ')}</> : null}</div>
    <div className="text-[12px] pt-0.5"><b>{mail.subject}</b></div>
    {open && <><div className="text-[12px] pt-1" style={{ whiteSpace: 'pre-wrap', ...soft }}>{mail.body}</div>
      <div className="text-[11.5px] pt-1" style={faint}>Attached: {mail.attachments.join(' · ')}</div></>}
  </div>;
}

/* ── 1. the five-part requirement, and the gate ── */
type PartKey = 'techPack' | 'fabric' | 'trimCard' | 'sizes' | 'bom';
export function PackSection({ o, design, sourcing }: { o: ProductionOrder; design: boolean; sourcing: boolean }) {
  const { db, updatePack, sendPack, updateRequirement } = useApp();
  const p = packOf(o); const rd = packReadyOf(o); const sent = !!p.sentOn || o.status !== 'Requirement';
  const [tab, setTab] = useState<PartKey>(rd.parts.find(x => x.missing.length)?.key ?? 'techPack');
  const [tp, setTp] = useState<Partial<Record<TechPackKey, string>>>({ ...p.techPack });
  const [fab, setFab] = useState<RequirementPack['fabric']>({ ...p.fabric });
  const [trim, setTrim] = useState(p.trimCard ?? '');
  const [sizes, setSizes] = useState(o.sizeBreakup);
  const canDesign = design && !sent; const canSourcing = sourcing && !sent;
  const mills = db.vendors.filter(v => v.kind.endsWith('mill'));
  const num = (v: string) => v === '' ? null : Number(v);
  const part = rd.parts.find(x => x.key === tab)!;
  return <Section title="Requirement · five parts" collapsible={false} right={<Pill tone={sent ? 'good' : rd.ready ? 'good' : 'warn'}>{sent ? `sent to Production RTW ${fmtDate(p.sentOn ?? o.styleHandover)}` : rd.ready ? 'complete · ready to send' : `${rd.missing.length} item${rd.missing.length > 1 ? 's' : ''} to fill`}</Pill>}>
    <div className="form-tabs pb-3" role="tablist">{rd.parts.map((x, i) => <button type="button" key={x.key} role="tab" aria-selected={tab === x.key} className={tab === x.key ? 'on' : x.missing.length === 0 ? 'done' : ''} onClick={() => setTab(x.key)} title={x.missing.length ? `missing: ${x.missing.join(', ')}` : 'complete'}><span className="n">{x.missing.length === 0 && tab !== x.key ? '✓' : i + 1}</span>{x.label}<span className="text-[11px]" style={{ opacity: .7 }}>{x.done}/{x.total}</span></button>)}</div>
    {tab === 'techPack' && <div>
      <div className="text-[12.5px] pb-2" style={soft}>Twelve items from category. A file name or a note against each; the files themselves ride on the record's files.</div>
      <div className="grid gap-x-4 gap-y-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {TECH_PACK_ITEMS.map(it => <Field key={it.key} label={it.label}>{canDesign ? <Input value={tp[it.key] ?? ''} onChange={e => setTp(x => ({ ...x, [it.key]: e.target.value }))} placeholder="file or note" /> : <div className="text-[12.5px] py-1">{p.techPack[it.key] ? <span>✓ {p.techPack[it.key]}</span> : <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}</Field>)}
      </div>
      {canDesign && <div className="pt-2"><Button size="sm" variant="primary" onClick={() => updatePack(o.id, { techPack: tp })}>Save tech pack</Button></div>}
    </div>}
    {tab === 'fabric' && <div>
      <div className="text-[12.5px] pb-2" style={soft}>Category describes the cloth; sourcing adds the vendor it chose, the vendor's fabric code, what is blocked with the vendor and when the cloth is ready.</div>
      <div className="cap">Category</div>
      <div className="grid gap-x-4 gap-y-1.5 pb-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field label="Fabric description">{canDesign ? <Input value={fab.description ?? ''} onChange={e => setFab(x => ({ ...x, description: e.target.value || null }))} /> : <div className="text-[12.5px] py-1">{p.fabric.description ?? <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}</Field>
        <Field label="Fabric content">{canDesign ? <Input value={fab.content ?? ''} onChange={e => setFab(x => ({ ...x, content: e.target.value || null }))} placeholder="100% cotton" /> : <div className="text-[12.5px] py-1">{p.fabric.content ?? <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}</Field>
        <Field label="Image">{canDesign ? <Input value={fab.image ?? ''} onChange={e => setFab(x => ({ ...x, image: e.target.value || null }))} placeholder="file" /> : <div className="text-[12.5px] py-1">{p.fabric.image ?? <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}</Field>
        <Field label="Option / phase · swatch analyser">{canDesign ? <Input value={fab.swatchAnalyser ?? ''} onChange={e => setFab(x => ({ ...x, swatchAnalyser: e.target.value || null }))} placeholder="Option 2 · phase 1" /> : <div className="text-[12.5px] py-1">{p.fabric.swatchAnalyser ?? <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}</Field>
        <Field label="CPM (₹ / m)">{canDesign ? <Input type="number" value={fab.cpm ?? ''} onChange={e => setFab(x => ({ ...x, cpm: num(e.target.value) }))} /> : <div className="text-[12.5px] py-1">{p.fabric.cpm != null ? fmtMoney(p.fabric.cpm) : <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}</Field>
        <Field label="Fabric width (in)">{canDesign ? <Input type="number" value={fab.widthIn ?? ''} onChange={e => setFab(x => ({ ...x, widthIn: num(e.target.value) }))} /> : <div className="text-[12.5px] py-1">{p.fabric.widthIn != null ? `${p.fabric.widthIn}"` : <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}</Field>
      </div>
      <div className="cap flex items-center gap-2">Sourcing <span className="pill role-sourcing">Sreekanth</span></div>
      <div className="grid gap-x-4 gap-y-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field label="Cloth vendor">{canSourcing ? <Select value={fab.vendorId ?? ''} onChange={v => setFab(x => ({ ...x, vendorId: v || null }))} options={[{ value: '', label: '— choose —' }, ...mills.map(m => ({ value: m.id, label: m.name }))]} /> : <div className="text-[12.5px] py-1">{p.fabric.vendorId ? <VendorLink id={p.fabric.vendorId} /> : <span style={{ color: 'var(--warn)' }}>sourcing to add</span>}</div>}</Field>
        <Field label="Vendor fabric code">{canSourcing ? <Input value={fab.vendorFabricCode ?? ''} onChange={e => setFab(x => ({ ...x, vendorFabricCode: e.target.value || null }))} placeholder="SOK#24594" /> : <div className="text-[12.5px] py-1 mono">{p.fabric.vendorFabricCode ?? <span style={{ color: 'var(--warn)', fontFamily: 'var(--body)' }}>sourcing to add</span>}</div>}</Field>
        <Field label="Blocked with the vendor (m)">{canSourcing ? <Input type="number" value={fab.blockedMetres ?? ''} onChange={e => setFab(x => ({ ...x, blockedMetres: num(e.target.value) }))} /> : <div className="text-[12.5px] py-1">{p.fabric.blockedMetres != null ? `${p.fabric.blockedMetres} m` : <span style={{ color: 'var(--warn)' }}>sourcing to add</span>}</div>}</Field>
        <Field label="Fabric readiness">{canSourcing ? <div className="flex gap-1.5"><Select value={fab.readiness ?? ''} onChange={v => setFab(x => ({ ...x, readiness: (v || null) as RequirementPack['fabric']['readiness'] }))} options={[{ value: '', label: '—' }, { value: 'available', label: 'Available at the supplier' }, { value: 'date', label: 'Supplied by a date' }]} />{fab.readiness === 'date' && <Input type="date" value={dateInput(fab.readyOn)} onChange={e => setFab(x => ({ ...x, readyOn: fromDateInput(e.target.value) }))} style={{ width: 140 }} />}</div>
          : <div className="text-[12.5px] py-1">{p.fabric.readiness === 'available' ? 'available at the supplier' : p.fabric.readiness === 'date' && p.fabric.readyOn ? `supplied by ${fmtDate(p.fabric.readyOn)}` : <span style={{ color: 'var(--warn)' }}>sourcing to add</span>}</div>}</Field>
      </div>
      {(canDesign || canSourcing) && <div className="pt-2"><Button size="sm" variant="primary" onClick={() => updatePack(o.id, { fabric: canSourcing && !canDesign ? { vendorId: fab.vendorId, vendorFabricCode: fab.vendorFabricCode, blockedMetres: fab.blockedMetres, readiness: fab.readiness, readyOn: fab.readyOn } : fab })}>Save fabric info</Button></div>}
    </div>}
    {tab === 'trimCard' && <div>
      <div className="text-[12.5px] pb-2" style={soft}>The trim card as a file: every trim with its reference, matched to the BOM lines.</div>
      {canDesign ? <div className="flex gap-2 items-end"><div style={{ flex: '1 1 260px' }}><Field label="Trim card"><Input value={trim} onChange={e => setTrim(e.target.value)} placeholder="trim-card.pdf" /></Field></div><Button size="sm" variant="primary" onClick={() => updatePack(o.id, { trimCard: trim.trim() || null })}>Save</Button></div>
        : <div className="text-[12.5px] py-1">{p.trimCard ? `✓ ${p.trimCard}` : <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}
    </div>}
    {tab === 'sizes' && <div>
      <div className="text-[12.5px] pb-2" style={soft}>Size-wise quantity — the cut ratio the factory cuts to. {sizes.reduce((a, x) => a + x.qty, 0)} pcs.</div>
      <SizeGrid breakup={sizes} edit={canDesign} onChange={(sz, n) => setSizes(b => { const has = b.some(x => x.size === sz); return has ? b.map(x => x.size === sz ? { ...x, qty: n } : x) : [...b, { size: sz, qty: n }]; })} />
      {canDesign && <div className="pt-2"><Button size="sm" variant="primary" onClick={() => updateRequirement(o.id, { sizeBreakup: sizes.filter(x => x.qty > 0), orderQty: sizes.reduce((a, x) => a + x.qty, 0) })}>Save break-up</Button></div>}
    </div>}
    {tab === 'bom' && <BomSection o={o} editable={canDesign} open />}
    {/* the gate */}
    <div className="pt-3 mt-3 flex items-center gap-3 flex-wrap" style={{ borderTop: '1px solid var(--line-soft)' }}>
      {sent ? <span className="text-[12.5px]" style={{ color: 'var(--good)' }}>Sent to Production RTW {fmtDate(p.sentOn ?? o.styleHandover)}{p.sentBy ? ` by ${p.sentBy}` : ''}. Nitin picks the factories and sends the cost query.</span>
        : <>
          {design ? <Button variant="primary" disabled={!rd.ready} onClick={() => sendPack(o.id)}>Send to Production RTW →</Button> : <ActsBy role="design" does="sends it to Production RTW once the five parts are in" />}
          {!rd.ready && <span className="text-[12px]" style={{ color: 'var(--warn)' }}>Cannot proceed: {part.missing.length ? `${part.label} needs ${part.missing.join(', ')}` : rd.missing.slice(0, 3).join(', ')}{!part.missing.length && rd.missing.length > 3 ? ` and ${rd.missing.length - 3} more` : ''}{rd.sourcingMissing.length ? ' · sourcing owes its fabric fields' : ''}</span>}
        </>}
    </div>
  </Section>;
}

/* ── 2. the cost query: factories from the database, a deadline, the mail, the replies ── */
export function CostQuerySection({ o, prod, merchant }: { o: ProductionOrder; prod: boolean; merchant: boolean }) {
  const { db, sendCostQuery, replyCostQuery, raisePoOnReply } = useApp();
  const cq = o.costQuery ?? null; const rec = recommendFactories(db, o);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(rec.fit.slice(0, 3).map(v => v.id)));
  const [deadline, setDeadline] = useState(dateInput(new Date(Date.now() + 5 * 864e5).toISOString()));
  const [extra, setExtra] = useState('');
  const [replyFor, setReplyFor] = useState<string | null>(null); const [cost, setCost] = useState(String(o.targetCost)); const [lead, setLead] = useState('36'); const [fabBy, setFabBy] = useState<'bsc' | 'factory'>('bsc'); const [note, setNote] = useState('');
  const [hem, setHem] = useState(needsHemmingOf(o));
  const sent = o.status !== 'Requirement';
  const toggle = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const nameOf = (id: string) => db.vendors.find(v => v.id === id)?.name ?? id;
  if (!sent) return <Section title="Cost query to factories" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>After the requirement is complete and sent.</div></Section>;
  if (!cq) return <Section title="Cost query to factories" collapsible={false} right={<span className="pill role-production">Nitin</span>}>
    <div className="text-[12.5px] pb-2" style={soft}>The factory database recommends by category and region. Pick one or more, or add any other; set the reply deadline. PLM mails the requirement and a cost form to each factory, copying the merchandiser.</div>
    {prod ? <>
      <div className="cap">Recommended for {o.category}</div>
      <div className="grid gap-1.5 pb-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
        {rec.fit.map(v => <label key={v.id} className={`fac-pick${picked.has(v.id) ? ' on' : ''}`}><input type="checkbox" checked={picked.has(v.id)} onChange={() => toggle(v.id)} /><span><b>{v.name}</b><span className="text-[11px] block" style={soft}>{v.location} · {v.region} · on time {Math.round(v.onTimeRate * 100)}% · {v.leadDays}d</span></span></label>)}
        {rec.fit.length === 0 && <span className="text-[12px]" style={faint}>no factory specialises in this category yet</span>}
      </div>
      <div className="flex gap-2 items-end flex-wrap pb-2">
        <div style={{ flex: '1 1 240px' }}><Field label="Add another factory"><Select value={extra} onChange={v => { if (v) { setPicked(s => new Set(s).add(v)); setExtra(''); } }} options={[{ value: '', label: '— any other from the database —' }, ...rec.others.filter(v => !picked.has(v.id)).map(v => ({ value: v.id, label: `${v.name} · ${v.region} · ${(v.specialising ?? []).join(', ') || 'general'}` }))]} /></Field></div>
        <Field label="Reply deadline"><Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></Field>
      </div>
      {[...picked].filter(id => !rec.fit.some(v => v.id === id)).length > 0 && <div className="text-[12px] pb-2">Also asked: {[...picked].filter(id => !rec.fit.some(v => v.id === id)).map(id => <span key={id} className="pill ml-1">{nameOf(id)} <button type="button" className="vlink" onClick={() => toggle(id)}>×</button></span>)}</div>}
      <MailCard label="Cost query" mail={costQueryMail(db, o, [...picked], fromDateInput(deadline) ?? new Date().toISOString())} sentOn={null} />
      <div className="pt-2"><Button variant="primary" disabled={!picked.size || !deadline} onClick={() => sendCostQuery(o.id, [...picked], fromDateInput(deadline)!)}>Send the cost query to {picked.size} factor{picked.size === 1 ? 'y' : 'ies'} →</Button></div>
    </> : <ActsBy role="production" does="picks the factories, sets the deadline and sends the cost query" />}
  </Section>;
  const late = daysAgo(cq.deadline) > 0;
  return <Section title="Cost query to factories" collapsible={false} right={<Pill tone={cq.replies.length >= cq.factoryIds.length ? 'good' : late ? 'risk' : 'warn'}>{cq.replies.length} of {cq.factoryIds.length} replied · due {fmtDate(cq.deadline)}{late && cq.replies.length < cq.factoryIds.length ? ` · ${daysAgo(cq.deadline)}d past` : ''}</Pill>}>
    <MailCard label="Cost query" mail={{ ...costQueryMail(db, o, cq.factoryIds, cq.deadline), to: cq.to, cc: cq.cc }} sentOn={cq.sentOn} />
    <div className="pt-2" style={{ overflowX: 'auto' }}><table className="t compact">
      <thead><tr><th>Factory</th><th>Asked</th><th>Reply</th><th className="num">₹ / pc</th><th>Lead</th><th>Cloth by</th><th></th></tr></thead>
      <tbody>{cq.factoryIds.map(id => { const r = cq.replies.find(x => x.vendorId === id); const v = db.vendors.find(x => x.id === id); const chosen = o.vendorId === id && !!o.poNo;
        return <tr key={id} style={{ background: chosen ? 'color-mix(in srgb, var(--good) 7%, transparent)' : undefined }}>
          <td><div className="font-medium"><VendorLink id={id} /></div><div className="text-[11px]" style={faint}>{v?.location} · {v?.region} · {vendorMail(v)}</div></td>
          <td className="text-[12px]" style={soft}>{fmtDate(cq.sentOn)}</td>
          <td>{r ? <Pill tone="good">replied {fmtDate(r.repliedOn)}</Pill> : <Pill tone={late ? 'risk' : 'warn'}>{late ? `${daysAgo(cq.deadline)}d past the deadline` : 'awaiting'}</Pill>}{r?.note && <div className="text-[11px]" style={soft}>{r.note}</div>}</td>
          <td className="num">{r ? fmtMoney(r.cost) : '—'}</td>
          <td className="text-[12px]">{r ? `${r.leadDays} d` : '—'}</td>
          <td className="text-[12px]">{r ? (r.fabricBy === 'bsc' ? "BSC's vendor → sourcing" : 'the factory') : '—'}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{chosen ? <Pill tone="good">PO {o.poNo}</Pill>
            : o.poNo ? null
            : r ? (prod ? <Button size="sm" variant="primary" onClick={() => raisePoOnReply(o.id, id, hem)}>Raise PO on this</Button> : null)
            : (prod || merchant) ? <button type="button" className="vlink text-[11.5px]" onClick={() => setReplyFor(replyFor === id ? null : id)}>log the reply</button> : null}</td>
        </tr>; })}</tbody>
    </table></div>
    {replyFor && !o.poNo && <div className="pt-2 flex gap-2 items-end flex-wrap" style={{ borderTop: '1px solid var(--line-soft)' }}>
      <span className="text-[12px] w-full pt-2" style={soft}>{nameOf(replyFor)}'s reply from the cost form (logged here in the prototype; the form posts it on the real build):</span>
      <Field label="₹ / pc"><Input type="number" value={cost} onChange={e => setCost(e.target.value)} style={{ width: 100 }} /></Field>
      <Field label="Lead (days)"><Input type="number" value={lead} onChange={e => setLead(e.target.value)} style={{ width: 90 }} /></Field>
      <Field label="Cloth sourced by"><Select value={fabBy} onChange={v => setFabBy(v as 'bsc' | 'factory')} options={[{ value: 'bsc', label: "BSC's vendor" }, { value: 'factory', label: 'the factory itself' }]} /></Field>
      <div style={{ flex: '1 1 180px' }}><Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} /></Field></div>
      <Button size="sm" variant="primary" onClick={() => { replyCostQuery(o.id, replyFor, { cost: Number(cost), leadDays: Number(lead), fabricBy: fabBy, note: note.trim() || null }); setReplyFor(null); setNote(''); }}>Log reply</Button>
    </div>}
    {!o.poNo && cq.replies.length > 0 && prod && <div className="pt-2 flex items-center gap-2 text-[12.5px]"><label className="flex items-center gap-1.5"><input type="checkbox" checked={hem} onChange={e => setHem(e.target.checked)} /> needs hemming or semi-stitching in-house</label><span style={faint}>→ delivers to <b>{deliveryLocationOf(hem)}</b> on the PO</span></div>}
    {!o.poNo && cq.replies.length === 0 && <div className="text-[12.5px] pt-2" style={faint}>No reply yet. The merchandiser is chasing; replies land here from the cost form.</div>}
  </Section>;
}

/* ── 3. the PO, mailed with the delivery location, the cloth vendor and the TNA form ── */
export function PoSection({ o }: { o: ProductionOrder }) {
  const { db } = useApp();
  const pm = o.poMail; const p = packOf(o); const rp = o.costQuery?.replies.find(r => r.vendorId === o.vendorId);
  if (!o.poNo) return <Section title="PO" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>Raised on a cost reply. Mailed to the factory and the merchandiser with the delivery location and the TNA form.</div></Section>;
  return <Section title={`${o.poNo} · ${db.vendors.find(v => v.id === o.vendorId)?.name ?? ''}`} collapsible={false} right={<span className="flex gap-2 items-center"><Pill tone="good">raised {fmtDate(o.poDate)}</Pill>{o.poAckOn && <Pill tone="good">acknowledged {fmtDate(o.poAckOn)}</Pill>}</span>}>
    <KV k="Factory" v={<VendorLink id={o.vendorId} />} note={rp ? `${rp.leadDays} days quoted` : undefined} />
    <KV k="Pieces" v={`${o.orderQty} × ${fmtMoney(o.finalFob ?? o.targetCost)}`} note={fmtMoney((o.finalFob ?? o.targetCost) * o.orderQty)} />
    <KV k="Deliver to" v={<b>{pm?.deliveryLocation ?? '—'}</b>} note={pm?.needsHemming ? 'hemming or semi-stitching in-house, so Vasai' : 'nothing to hem, so the 3PL warehouse · rule to confirm with BSC'} />
    <KV k="Cloth" v={pm?.fabricBy === 'bsc' ? "BSC's vendor" : 'the factory sources it'} note={pm?.fabricBy === 'bsc' ? `${db.vendors.find(v => v.id === p.fabric.vendorId)?.name ?? '—'}${p.fabric.vendorFabricCode ? ` · ${p.fabric.vendorFabricCode}` : ''}${p.fabric.blockedMetres != null ? ` · ${p.fabric.blockedMetres} m blocked` : ''} · vendor details sent to the factory; no PO for the cloth in PLM; the factory's fabric PO and receipt are TNA steps` : "the factory's fabric PO and receipt are TNA steps"} />
    <div className="pt-2"><MailCard label="PO · with the TNA form" mail={{ ...poMailOf(db, o), to: pm?.to ?? [], cc: pm?.cc ?? [] }} sentOn={pm?.on ?? o.poDate} /></div>
  </Section>;
}

/* ── 4. the TNA form: planned dates back from the factory, through the merchandiser ── */
export function TnaPlanSection({ o, merchant }: { o: ProductionOrder; merchant: boolean }) {
  const { submitTnaPlan } = useApp();
  const [plans, setPlans] = useState<Record<string, string>>(() => Object.fromEntries(o.milestones.map(m => [m.key, dateInput(m.plan)])));
  const live = o.milestones.filter(m => !m.skipped); const tp = o.tnaPlan;
  if (!o.poNo) return <Section title="TNA · planned dates" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>The TNA form goes out with the PO; the factory fills a planned date for every step.</div></Section>;
  const done = !!tp?.submittedOn;
  return <Section title="TNA form · planned dates" collapsible={false} right={<Pill tone={done ? 'good' : daysAgo(tp?.sentOn ?? o.poDate!) > 3 ? 'risk' : 'warn'}>{done ? `submitted ${fmtDate(tp!.submittedOn)}${tp!.by ? ` · ${tp!.by}` : ''}` : `owed · sent ${fmtDate(tp?.sentOn ?? o.poDate)}${daysAgo(tp?.sentOn ?? o.poDate!) > 0 ? ` · ${daysAgo(tp?.sentOn ?? o.poDate!)}d ago` : ''}`}</Pill>}>
    <div className="text-[12.5px] pb-2" style={soft}>{done ? 'The planned date for every step, as the factory returned them. Revised and actual dates are logged on the TNA from here.' : 'Only the planned dates, one per step. The template dates are a starting point; the factory returns its own through the merchandiser.'}</div>
    <div style={{ overflowX: 'auto' }}><table className="t compact">
      <thead><tr><th>#</th><th>Step</th><th>Planned</th><th>Owner</th></tr></thead>
      <tbody>{live.map((m, i) => <tr key={m.key}><td className="mono text-[11px]" style={faint}>{String(i + 1).padStart(2, '0')}</td><td className="font-medium">{m.key}</td>
        <td>{!done && merchant ? <Input type="date" value={plans[m.key] ?? ''} onChange={e => setPlans(x => ({ ...x, [m.key]: e.target.value }))} style={{ width: 140 }} /> : <span className="mono text-[12px]">{fmtDate(m.plan)}</span>}</td>
        <td className="text-[11.5px]" style={soft}>{m.owner === 'qc' ? 'QC' : m.owner === 'sourcing' ? 'factory · fabric' : 'factory'}</td></tr>)}</tbody>
    </table></div>
    {!done && (merchant ? <div className="pt-2"><Button variant="primary" onClick={() => submitTnaPlan(o.id, Object.fromEntries(Object.entries(plans).filter(([, v]) => v).map(([k, v]) => [k, fromDateInput(v)!])))}>Submit the TNA form</Button></div> : <ActsBy role="merchandiser" does="returns the factory's planned dates" />)}
  </Section>;
}

/* ── 5. QC at five points on the TNA ── */
export function QcChecksSection({ o, qc, compact }: { o: ProductionOrder; qc: boolean; compact?: boolean }) {
  const { recordQcCheck } = useApp();
  const pts = qcPointsOf(o); const [remarks, setRemarks] = useState('');
  const open = pts.find(x => x.state === 'due' || x.state === 'failed') ?? null;
  const passed = pts.filter(x => x.state === 'passed').length; const live = pts.filter(x => x.state !== 'na').length;
  if (!o.poNo) return <Section title="QC" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>PP sample, size set, then three line inspections.</div></Section>;
  return <Section title="QC · five points" collapsible={false} right={<Pill tone={open?.state === 'failed' ? 'risk' : open ? 'warn' : passed === live ? 'good' : 'neutral'}>{open?.state === 'failed' ? `${open.label} failed` : open ? `${open.label} to check` : `${passed} of ${live} passed`}</Pill>}>
    <div style={{ overflowX: 'auto' }}><table className="t compact">
      <thead><tr><th>Point</th><th>Result</th><th>Remarks</th>{!compact && <th>When</th>}</tr></thead>
      <tbody>{pts.map(x => { const hist = (o.qcChecks ?? []).filter(c => c.point === x.key);
        return <tr key={x.key} style={{ opacity: x.state === 'na' ? .5 : 1, verticalAlign: 'top' }}>
          <td><div className="font-medium">{x.label}</div><div className="text-[11px]" style={faint}>{x.hint}</div></td>
          <td><Pill tone={x.state === 'passed' ? 'good' : x.state === 'failed' ? 'risk' : x.state === 'due' ? 'warn' : 'neutral'}>{x.state === 'passed' ? `passed${x.last?.on ? ` ${fmtDate(x.last.on)}` : ''}` : x.state === 'failed' ? `failed ${fmtDate(x.last!.on)}` : x.state === 'due' ? `to check${x.sinceDays ? ` · ${x.sinceDays}d` : ''}` : x.state === 'na' ? 'not on this plan' : 'later'}</Pill></td>
          <td className="text-[12px]" style={{ whiteSpace: 'normal', minWidth: 200 }}>{hist.length ? hist.map((c, i) => <div key={i} style={{ color: c.result === 'fail' ? 'var(--risk)' : undefined }}>{c.result === 'fail' ? '✗ ' : '✓ '}{c.remarks || '—'}<span style={faint}> · {c.by}</span></div>) : <span style={faint}>—</span>}</td>
          {!compact && <td className="text-[11.5px]" style={{ ...soft, whiteSpace: 'nowrap' }}>{x.due ? `${x.state === 'due' ? 'since' : 'after'} ${fmtDate(x.due)}` : '—'}</td>}
        </tr>; })}</tbody>
    </table></div>
    {open && (qc ? <div className="pt-2 flex gap-2 items-end flex-wrap" style={{ borderTop: '1px solid var(--line-soft)' }}>
      <span className="text-[12px] w-full pt-2" style={soft}>{open.label} · against the tech pack and the sizes</span>
      <div style={{ flex: '1 1 260px' }}><Field label="Remarks"><Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="what was measured, what was found" /></Field></div>
      <Button size="sm" variant="primary" onClick={() => { recordQcCheck(o.id, open.key as QcPoint, 'pass', remarks.trim()); setRemarks(''); }}>Pass</Button>
      <Button size="sm" variant="danger" disabled={!remarks.trim()} onClick={() => { recordQcCheck(o.id, open.key as QcPoint, 'fail', remarks.trim()); setRemarks(''); }}>Fail with remarks</Button>
    </div> : <div className="pt-2"><ActsBy role="qc" does={open.state === 'failed' ? `checks the ${open.label.toLowerCase()} again once the factory resubmits` : `passes or fails the ${open.label.toLowerCase()}; the merchandiser sees the remarks`} /></div>)}
  </Section>;
}
export const QC_POINT_LABEL = Object.fromEntries(QC_POINTS.map(p => [p.key, p.label])) as Record<QcPoint, string>;

/* ── 6. after the dispatch actual: the invoice and packing list to the warehouse ── */
export function InvoiceSection({ o, merchant }: { o: ProductionOrder; merchant: boolean }) {
  const { db, uploadInvoice } = useApp();
  const inv = o.invoice; const disp = o.milestones.find(m => m.key === 'Dispatch')?.actual ?? null;
  const pcs = o.cutQty ?? o.orderQty; const tot = o.sizeBreakup.reduce((a, x) => a + x.qty, 0) || 1;
  const [no, setNo] = useState(''); const [amt, setAmt] = useState(String(pcs * (o.finalFob ?? o.targetCost))); const [file, setFile] = useState('');
  const [pl, setPl] = useState<Record<string, string>>(() => Object.fromEntries(o.sizeBreakup.map(x => [x.size, String(Math.round(x.qty * pcs / tot))])));
  if (!o.poNo) return <Section title="Dispatch · invoice" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>After the dispatch actual on the TNA.</div></Section>;
  const plTotal = Object.values(pl).reduce((a, v) => a + (Number(v) || 0), 0);
  return <Section title="Dispatched · invoice and packing list" collapsible={false} right={<Pill tone={inv ? 'good' : disp ? 'warn' : 'neutral'}>{inv ? `mailed to Prince ${fmtDate(inv.mailedOn)}` : disp ? `dispatched ${fmtDate(disp)} · invoice to upload` : 'not dispatched yet'}</Pill>}>
    {inv ? <>
      <KV k="Invoice" v={<span className="mono">{inv.no}</span>} note={`${fmtMoney(inv.amount)} · ${inv.file ?? 'uploaded'} · ${inv.by} · ${fmtDate(inv.uploadedOn)}`} />
      <div className="cap pt-2">Packing list · {inv.packingList.reduce((a, x) => a + x.qty, 0)} pcs</div>
      <SizeGrid breakup={inv.packingList} />
      <div className="pt-2"><MailCard label="Invoice and packing list · to the warehouse" mail={{ ...invoiceMailOf(db, o), to: inv.mailedTo.length ? inv.mailedTo : invoiceMailOf(db, o).to }} sentOn={inv.mailedOn} /></div>
    </> : !disp ? <div className="text-[12.5px] py-1" style={soft}>The factory logs the dispatch actual on the TNA; the merchandiser then uploads the invoice and packing list here, and PLM mails them to Prince. The printed invoice stops.</div>
      : merchant ? <>
        <div className="grid gap-2 py-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <Field label="Invoice no."><Input value={no} onChange={e => setNo(e.target.value)} placeholder="INV-2611" /></Field>
          <Field label="Amount (₹)"><Input type="number" value={amt} onChange={e => setAmt(e.target.value)} /></Field>
          <Field label="Invoice file"><Input value={file} onChange={e => setFile(e.target.value)} placeholder="invoice.pdf" /></Field>
        </div>
        <div className="cap pt-1">Packing list · by size · {plTotal} pcs</div>
        <div className="flex gap-2 flex-wrap py-1">{o.sizeBreakup.map(x => <Field key={x.size} label={x.size}><Input type="number" value={pl[x.size] ?? ''} onChange={e => setPl(p => ({ ...p, [x.size]: e.target.value }))} style={{ width: 70 }} /></Field>)}</div>
        <div className="pt-1"><Button variant="primary" disabled={!no.trim() || !plTotal} onClick={() => uploadInvoice(o.id, { no: no.trim(), amount: Number(amt) || 0, file: file.trim() || null, packingList: o.sizeBreakup.map(x => ({ size: x.size, qty: Number(pl[x.size]) || 0 })).filter(x => x.qty > 0) })}>Upload · mail to Prince →</Button></div>
      </> : <ActsBy role="merchandiser" does="uploads the factory's invoice and packing list; PLM mails them to Prince" />}
  </Section>;
}

/* ── 7. received on Enigma, against the packing list ── */
export function ReceivedSection({ o }: { o: ProductionOrder }) {
  const rc = receiptOf(o); const inv = o.invoice;
  const got: Record<string, number> = {}; rc.lots.forEach(l => Object.entries(l.bySize ?? {}).forEach(([sz, n]) => { got[sz] = (got[sz] ?? 0) + n; }));
  const tracked = rc.lots.length > 0 && rc.lots.every(l => !!l.bySize);
  const sentPcs = inv?.packingList.reduce((a, x) => a + x.qty, 0) ?? null;
  const all = sentPcs != null && rc.received >= sentPcs;
  return <>
    <Section title="Received · Enigma" collapsible={false} right={<Pill tone={all ? 'good' : rc.received ? 'warn' : 'neutral'}>{all ? `all ${rc.received} pcs reached` : rc.received ? `${rc.received} of ${sentPcs ?? rc.base} in` : inv ? 'with Prince · not received yet' : 'after the invoice'}</Pill>}>
      <div className="text-[12.5px] pb-2" style={soft}>Prince receives against the packing list on Enigma; this reads what Enigma holds. {inv ? '' : 'Nothing to compare until the invoice and packing list are in.'}</div>
      {inv && <div style={{ overflowX: 'auto' }}><table className="t compact">
        <thead><tr><th>Size</th><th className="num">Packing list</th><th className="num">Received</th><th className="num">Short</th></tr></thead>
        <tbody>{inv.packingList.map(x => { const g = tracked ? (got[x.size] ?? 0) : null; const short = g != null ? x.qty - g : null;
          return <tr key={x.size}><td>{x.size}</td><td className="num">{x.qty}</td><td className="num">{g != null ? g : '—'}</td><td className="num" style={{ color: short ? 'var(--risk)' : 'var(--good)' }}>{short == null ? '—' : short > 0 ? short : short < 0 ? `+${-short}` : '✓'}</td></tr>; })}
          <tr><td className="font-semibold">Total</td><td className="num font-semibold">{sentPcs}</td><td className="num font-semibold">{rc.received || '—'}</td><td className="num font-semibold" style={{ color: all ? 'var(--good)' : 'var(--risk)' }}>{rc.received ? (sentPcs! - rc.received > 0 ? sentPcs! - rc.received : '✓') : '—'}</td></tr>
        </tbody></table></div>}
    </Section>
    {rc.lots.length > 0 && <div className="pt-3"><ReceiptLots o={o} editable={false} open /></div>}
  </>;
}

/* ── 2. the PO's costs and the factory's acknowledgement ── */
export function PoCostsSection({ o, design, factory }: { o: ProductionOrder; design: boolean; factory: boolean }) {
  const { setPoCosts, ackPo } = useApp();
  const pc = o.poCosts ?? { logistics: null, other: [] };
  const [logi, setLogi] = useState(pc.logistics != null ? String(pc.logistics) : '');
  const [label, setLabel] = useState(''); const [amt, setAmt] = useState('');
  const [editing, setEditing] = useState(false);
  const piece = o.finalFob ?? o.targetCost ?? 0; const pieces = piece * o.orderQty;
  const otherTotal = pc.other.reduce((a, x) => a + x.amount, 0); const total = pieces + (pc.logistics ?? 0) + otherTotal;
  if (!o.poNo) return null;
  return <Section title="PO value · costs on the PO" collapsible={false} right={<span className="flex gap-2 items-center"><Pill tone={o.poAckOn ? 'good' : 'warn'}>{o.poAckOn ? `acknowledged ${fmtDate(o.poAckOn)}` : 'not yet acknowledged by the factory'}</Pill></span>}>
    <KV k="Pieces" v={`${o.orderQty} × ${fmtMoney(piece)}`} note={`${fmtMoney(pieces)} · piece cost on the PO`} />
    <KV k="Logistics" v={pc.logistics != null ? fmtMoney(pc.logistics) : '—'} />
    {pc.other.map((x, i) => <KV key={i} k={x.label} v={fmtMoney(x.amount)} />)}
    <KV k="PO total" v={<b>{fmtMoney(total)}</b>} note={`${fmtMoney(total / o.orderQty)} per piece landed at the PO`} />
    {design && !editing && <div className="pt-2"><Button size="sm" onClick={() => setEditing(true)}>{pc.logistics != null || pc.other.length ? 'Change the costs' : 'Add logistics and other costs'}</Button></div>}
    {editing && <div className="pt-2">
      <div className="grid gap-2 py-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Field label="Logistics (₹, per PO)"><Input type="number" min={0} value={logi} onChange={e => setLogi(e.target.value)} /></Field>
        <Field label="Other cost · label"><Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. testing, packaging" /></Field>
        <Field label="Other cost · ₹"><Input type="number" min={0} value={amt} onChange={e => setAmt(e.target.value)} /></Field>
      </div>
      {pc.other.length > 0 && <div className="text-[11.5px] py-1" style={soft}>On the PO: {pc.other.map(x => `${x.label} ${fmtMoney(x.amount)}`).join(' · ')}</div>}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="primary" onClick={() => { const other = label.trim() && Number(amt) ? [...pc.other, { label: label.trim(), amount: Number(amt) }] : pc.other; setPoCosts(o.id, { logistics: logi === '' ? null : Number(logi), other }); setLabel(''); setAmt(''); setEditing(false); }}>Save costs</Button>
        {pc.other.length > 0 && <Button size="sm" variant="ghost" onClick={() => setPoCosts(o.id, { logistics: logi === '' ? null : Number(logi), other: [] })}>Clear other costs</Button>}
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>}
    {!o.poAckOn && (factory ? <div className="pt-3"><Button size="sm" variant="primary" onClick={() => ackPo(o.id)}>We have the PO · acknowledge</Button></div> : <ActsBy role="merchandiser" does="acknowledges the PO once it has it" />)}
  </Section>;
}

/* ── 6. COGS and profitability ── */
/* COGS from the costing sheet, per piece, with what actually happened laid over the plan:
   fabric at the actual consumption once cutting logs it, the factory's PO price (CMT when BSC buys the cloth,
   the full FOB when the factory does), the sheet's adders, and the PO's own logistics and other costs spread
   over the pieces received. Against the MRP net of discounts and GST, as the costing sheet reads margin. */
export function CogsSection({ o, finance }: { o: ProductionOrder; finance: boolean }) {
  const { db, closeCogs } = useApp();
  const c = o.costing; const plan = costingOf(o); const rc = receiptOf(o);
  const pcs = rc.received || o.cutQty || o.orderQty;
  const cons = c.actualConsumption ?? c.consumption;
  const fabric = o.fabricNominated && c.cpm != null && cons != null ? c.cpm * cons : 0;
  const make = o.finalFob ?? c.cmp ?? 0;                         // what the factory charges per piece on the PO
  const pc = o.poCosts ?? { logistics: null, other: [] };
  const poExtra = ((pc.logistics ?? 0) + pc.other.reduce((a, x) => a + x.amount, 0)) / (pcs || 1);
  const lines: [string, number, string][] = [
    ['Fabric', fabric, o.fabricNominated ? `${c.cpm != null ? fmtMoney(c.cpm) : '—'}/m × ${cons ?? '—'} m${c.actualConsumption != null ? ' (actual, from cutting)' : ' (planned)'}` : 'the factory buys the cloth'],
    [o.fabricNominated ? 'Making · CMT' : 'Making · FOB', make, o.finalFob != null ? `the factory's PO price${o.poNo ? ` · ${o.poNo}` : ''}` : 'from the costing sheet'],
    ['Trims and packaging', c.trimsPackaging, 'costing sheet'],
    ['Transport', c.transportation, 'costing sheet'],
    ...(c.hemming ? [['Hemming', c.hemming, 'costing sheet'] as [string, number, string]] : []),
    ['Freight to BSC', c.shipping, 'costing sheet'],
    ['Factory overheads', c.factoryOverheads, 'costing sheet'],
    ...(poExtra ? [['Logistics and other costs on the PO', poExtra, `${fmtMoney((pc.logistics ?? 0) + pc.other.reduce((a, x) => a + x.amount, 0))} over ${pcs} pcs`] as [string, number, string]] : []),
  ];
  const cogs = lines.reduce((a, l) => a + l[1], 0);
  const opt = db.options.find(x => x.styleName === o.styleName) ?? null;
  const launch = (db.launches ?? []).find(l => l.orderId === o.id);
  const mrp = launch?.designCodes?.[0]?.mrp ?? opt?.mrp ?? plan.finalMrp ?? null;
  const net = mrp != null ? netOf(mrp) : null; const margin = net != null && cogs ? (net - cogs) / net : null;
  const planned = plan.cogs; const diff = planned != null ? cogs - planned : null;
  const delivered = rc.lots.length > 0 && !rc.partial;
  const closedOn = o.cogsClosedOn ?? (o.status === 'Closed' ? (rc.lots[rc.lots.length - 1]?.at ?? null) : null);
  return <Section title="COGS · profitability" collapsible={false} right={<Pill tone={closedOn ? 'good' : delivered ? 'warn' : 'neutral'}>{closedOn ? `closed ${fmtDate(closedOn)}` : delivered ? 'to close' : 'running · closes after delivery'}</Pill>}>
    <div style={{ overflowX: 'auto' }}><table className="t compact">
      <thead><tr><th>Per piece</th><th className="num">₹</th><th>From</th></tr></thead>
      <tbody>{lines.map(([k, v, src]) => <tr key={k}><td>{k}</td><td className="num">{fmtMoney(Math.round(v))}</td><td className="text-[11.5px]" style={soft}>{src}</td></tr>)}
        <tr><td className="font-semibold">COGS per piece</td><td className="num font-semibold">{fmtMoney(Math.round(cogs))}</td><td className="text-[11.5px]" style={{ color: diff != null && diff > 0 ? 'var(--risk)' : soft.color }}>{planned != null ? `planned ${fmtMoney(Math.round(planned))}${diff ? ` · ${diff > 0 ? '+' : ''}${fmtMoney(Math.round(diff))}` : ''}` : ''}</td></tr>
      </tbody></table></div>
    <KV k="COGS for the PO" v={fmtMoney(Math.round(cogs * pcs))} note={`${pcs} pcs ${rc.received ? 'received' : 'ordered'}`} />
    <KV k="MRP" v={mrp != null ? fmtMoney(mrp) : '—'} note={launch?.designCodes?.[0]?.mrp != null ? 'from the design code' : opt?.mrp != null ? 'from the option in Enigma' : 'from the costing sheet'} />
    <KV k="Net of discounts and GST" v={net != null ? fmtMoney(Math.round(net)) : '—'} note="what BSC keeps per piece" />
    <KV k="Intake margin" v={margin != null ? <b style={{ color: margin < 0.55 ? 'var(--risk)' : 'var(--good)' }}>{Math.round(margin * 100)}%</b> : '—'} note={net != null ? `${fmtMoney(Math.round(net - cogs))} per piece` : undefined} />
    {!closedOn && delivered && (finance ? <div className="pt-2"><Button size="sm" variant="primary" onClick={() => closeCogs(o.id)}>Close COGS</Button></div> : <ActsBy role={['production', 'design']} does="close COGS once the goods are in" />)}
  </Section>;
}
