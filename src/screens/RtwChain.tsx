/* The RTW chain as BSC set it on 14 Nov 2026, each step a section on the record: the five-part
   requirement and its gate; the cost query to factories and their replies; the PO, mailed with
   the delivery location and the TNA form; the planned dates back; QC at five points on the TNA;
   the invoice and packing list to the warehouse; receipt on Enigma; COGS. */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { downloadVendorsPdf, poPdfOf, poPdfName } from '../domain/invoicePdf';
import { useApp } from '../store';
import type { ProductionOrder, QcPoint, RequirementPack, TechPackKey, PoInvoice, FabricBy, PoDoc, PoLine, ApproverRole } from '../domain/types';
import { fmtDate, daysAgo, receiptOf, fmtMoney, costingOf, netOf } from '../domain/engines';
import { TECH_PACK_ITEMS, QC_POINTS, FABRIC_BY_LABEL, RTW_SIZES } from '../domain/reference';
import { draftFromBrief, packOf, packReadyOf, recommendFactories, needsHemmingOf, deliveryLocationOf, qcPointsOf, costQueryMail, poMailOf, invoiceMailOf, vendorMail, replyFlagsOf, targetReviseOpenOf, poFabricsOf, poDraftOf, poTotalsOf, QUERY_FILES, supplyInvoicesOf, packedPcsOf, packingFileOf, dispatchesOf, sentPcsOf, orderedBySizeOf, isCmt, taxCodeOf, AQL_LEVELS, clothNeedOf, approvalOf, poLedgerOf, supplyLinesOf, rawMaterialsOf, type Mail, bomOpenOf, poVendorsOf, directCostOf, rtwCogsOf, poGroupOf, countedBy3plOf, landsAtOf } from '../domain/rtwPack';
import { Section, Pill, Button, KV, Field, Input, Select, fromDateInput, dateInput, useFlagEmpty } from '../ui';
import { VendorLink } from './Vendors';
import { ActsBy } from './Who';
import { SizeGrid, ReceiptLots } from './RtwGates';
import { BomSection } from './Costing';
import { QuoteFormModal } from './QuoteForm';
import { BomVendors, BomQuantities } from './BomVendors';
import { InvoicePreview, SupplyInvoiceBar, PdfPreview } from './InvoicePreview';
import { MailPreviewButton } from './MailPreview';
import { TransferStatus } from './Transfers';

const faint = { color: 'var(--ink-faint)' } as const;
const soft = { color: 'var(--ink-soft)' } as const;

/* a mail PLM composed: who it goes to, what it says, what rides with it. Before it is sent the sender can edit every
   line and sends it from here; once sent it is read-only with the time it went. */
export function MailCard({ mail, sentOn, label, onSend, sendLabel }: { mail: Mail; sentOn: string | null; label: string; onSend?: (m: Mail) => void; sendLabel?: string }) {
  const [d, setD] = useState<Mail>(mail);
  const [seed, setSeed] = useState(mail.subject + mail.body + mail.to.join());
  const key = mail.subject + mail.body + mail.to.join(); if (key !== seed) { setSeed(key); setD(mail); }
  const cur = sentOn ? mail : d; const canEdit = !sentOn && !!onSend;
  const edited = canEdit && (cur.subject !== mail.subject || cur.body !== mail.body || cur.to.join() !== mail.to.join() || cur.cc.join() !== mail.cc.join());
  return <div className={`mail-card v2${sentOn ? ' sent' : ''}`}>
    <div className="mail-h"><span className="mail-ic" aria-hidden>✉</span><b>{label}</b><Pill tone={sentOn ? 'good' : 'warn'}>{sentOn ? `sent ${fmtDate(sentOn)}` : 'not sent yet'}</Pill>{edited && <span className="text-[11.5px]" style={faint}>edited · PLM keeps what was sent</span>}
      <span className="ml-auto flex items-center gap-2"><MailPreviewButton button mail={{ ...cur, attachments: mail.attachments }} sentOn={sentOn} label={canEdit ? 'Open and edit the mail' : 'Open the mail'} onSave={canEdit ? m => setD({ to: m.to, cc: m.cc, subject: m.subject, body: m.body, attachments: mail.attachments }) : undefined} />
        {canEdit && <Button size="sm" variant="primary" disabled={!cur.to.length} onClick={() => onSend!({ ...cur, attachments: mail.attachments })}>{sendLabel ?? 'Send ✉'}</Button>}</span></div>
    <table className="mail-t"><tbody>
      <tr><th>To</th><td>{cur.to.length ? cur.to.map(x => <span key={x} className="mail-chip">{x}</span>) : <span style={{ color: 'var(--warn)' }}>no one yet</span>}</td></tr>
      {cur.cc.length > 0 && <tr><th>Cc</th><td>{cur.cc.map(x => <span key={x} className="mail-chip">{x}</span>)}</td></tr>}
      <tr><th>Subject</th><td><b>{cur.subject}</b></td></tr>
      <tr><th>Attached</th><td style={soft}>{mail.attachments.length ? `${mail.attachments.length} file${mail.attachments.length === 1 ? '' : 's'} · ${mail.attachments.map(a => a.replace(/ · .*$/, '')).join(', ')}` : 'nothing'}</td></tr>
    </tbody></table>
  </div>;
}

/* ── 1. the five-part requirement, and the gate ── */
type PartKey = 'techPack' | 'fabric' | 'trimCard' | 'sizes' | 'bom' | 'vendors';
export function PackSection({ o, design, sourcing, only }: { o: ProductionOrder; design: boolean; sourcing: boolean; only?: PartKey }) {
  const { db, role, updatePack, sendPack, attachFiles, savePlanningSizes } = useApp();
  const planner = role === 'planning' || role === 'owner';
  const p = packOf(o);
  const pick = (label: string, step: string | null, onName: (n: string) => void) => <label className="file-btn"><input type="file" accept=".pdf,.doc,.docx,image/*" onChange={e => { const f = e.target.files?.[0]; if (!f) return; onName(f.name); void attachFiles('order', o.id, label, step, [f]); }} />Attach</label>; const rd = packReadyOf(o); const sent = !!p.sentOn || o.status !== 'Requirement';
  const [tab, setTab] = useState<PartKey>(only ?? rd.parts.find(x => x.missing.length)?.key ?? 'techPack');
  /* 19 Nov 2026: what the gate still needs shows in amber on its field */
  const reqRef = useRef<HTMLDivElement>(null); useFlagEmpty(reqRef, rd.parts.flatMap(x => x.missing));
  const [tp, setTp] = useState<Partial<Record<TechPackKey, string>>>({ ...p.techPack });
  const [fab, setFab] = useState<RequirementPack['fabric']>({ ...p.fabric });
  const [trim, setTrim] = useState(p.trimCard ?? '');
  const [sizes, setSizes] = useState(o.sizeBreakup);
  /* prototype only: fill whatever is still empty with believable sample values, so a walkthrough can move on */
  const slug = o.styleName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 18);
  const SAMPLE_TP: Record<TechPackKey, string> = { sketch: `${slug}-sketch.pdf`, styling: `${slug}-styling-detail.pdf`, stitching: `${slug}-stitch-dimensions.pdf`, fabricColours: `${slug}-colourways.pdf`, specSheet: `${slug}-spec-sheet.xlsx`, howToMeasure: `${slug}-how-to-measure.pdf`, folding: `${slug}-folding-method.pdf`, trimCard: `${slug}-trim-card.pdf`, labelImage: `${slug}-label.png`, tagImage: `${slug}-hang-tag.png`, barcoding: `${slug}-barcodes.xlsx`, packaging: `${slug}-packaging.pdf` };
  const [brief, setBrief] = useState(p.brief ?? '');
  const [drafted, setDrafted] = useState(false);
  const draftWithAi = () => { const d = draftFromBrief(brief, o.styleName);
    const nextTp = { ...tp }; TECH_PACK_ITEMS.forEach(it => { if (!nextTp[it.key]?.trim()) nextTp[it.key] = d.techPack[it.key]; });
    const nextFab = { ...fab, description: fab.description ?? d.fabric.description, content: fab.content ?? d.fabric.content };
    setTp(nextTp); setFab(nextFab); setTrim(trim || 'drafted trim card');
    updatePack(o.id, { brief, techPack: nextTp, fabric: { description: nextFab.description, content: nextFab.content }, trimCard: trim || 'drafted trim card', trimLines: (p.trimLines ?? []).length ? p.trimLines : d.trimLines });
    setDrafted(true); };
  const fillSample = () => {
    const nextTp = { ...tp }; TECH_PACK_ITEMS.forEach(it => { if (!nextTp[it.key]?.trim()) nextTp[it.key] = SAMPLE_TP[it.key]; });
    const mill = db.vendors.find(v => v.kind.endsWith('mill') && (v.supplies ?? []).some(x => `${o.styleName} ${p.fabric.description ?? ''}`.toLowerCase().includes(x))) ?? db.vendors.find(v => v.kind.endsWith('mill'));
    const nextFab = { ...fab, description: fab.description ?? `${o.styleName.split(' ').slice(0, 3).join(' ')}`, content: fab.content ?? '100% cotton', image: fab.image ?? `${slug}-fabric-photo.jpg`, swatchAnalyser: fab.swatchAnalyser ?? 'Option 2 · phase 1', cpm: fab.cpm ?? 260, rate: fab.rate ?? 240, widthIn: fab.widthIn ?? 58,
      ...(canSourcing || p.clothBy !== 'factory' ? { vendorId: fab.vendorId ?? mill?.id ?? null, vendorFabricCode: fab.vendorFabricCode ?? `${(mill?.name ?? 'MILL').slice(0, 4).toUpperCase()}#${24000 + o.orderQty}`, blockedMetres: fab.blockedMetres ?? Math.ceil(o.orderQty * 1.7), readiness: fab.readiness ?? 'available' as const, trimVendorId: fab.trimVendorId ?? 'trimco' } : {}) };
    setTp(nextTp); setFab(nextFab); setTrim(trim || `${slug}-trim-card.pdf`);
    updatePack(o.id, { techPack: nextTp, fabric: nextFab, trimCard: trim || `${slug}-trim-card.pdf`, clothBy: p.clothBy ?? 'bsc-vendor' });
  };
  const canDesign = design && !sent; const canSourcing = sourcing && !sent;
  const want = `${p.fabric.description ?? ''} ${p.fabric.content ?? ''} ${o.styleName}`.toLowerCase();
  const mills = db.vendors.filter(v => v.kind.endsWith('mill')).map(v => ({ v, fit: (v.supplies ?? []).some(x => want.includes(x.toLowerCase())) })).sort((a, b) => Number(b.fit) - Number(a.fit) || a.v.name.localeCompare(b.v.name)).map(x => ({ ...x.v, name: x.fit ? `★ ${x.v.name} · supplies ${(x.v.supplies ?? []).filter(y => want.includes(y.toLowerCase())).join(', ')}` : x.v.name }));
  const num = (v: string) => v === '' ? null : Number(v);
  const part = rd.parts.find(x => x.key === tab)!;
  return <div ref={reqRef}><Section title="Requirement" collapsible={false} right={<Pill tone={sent ? 'good' : rd.ready ? 'good' : 'warn'}>{sent ? `sent to Production RTW ${fmtDate(p.sentOn ?? o.styleHandover)}` : rd.ready ? 'complete · ready to send' : `${rd.missing.length} item${rd.missing.length > 1 ? 's' : ''} to fill`}</Pill>}>
    <div className="form-tabs pb-3" role="tablist">{rd.parts.filter(x => !only || x.key === only).map((x, i) => <button type="button" key={x.key} role="tab" aria-selected={tab === x.key} className={tab === x.key ? 'on' : x.missing.length === 0 ? 'done' : ''} onClick={() => setTab(x.key)} title={x.missing.length ? `missing: ${x.missing.join(', ')}` : 'complete'}><span className="n">{x.missing.length === 0 && tab !== x.key ? '✓' : i + 1}</span>{x.label}<span className="text-[11px]" style={{ opacity: .7 }}>{x.done}/{x.total}</span></button>)}</div>
    {tab === 'techPack' && <div>
      {p.brief && <div className="text-[12px] mb-2 p-2 rounded-[6px]" style={{ background: 'var(--surface-2)' }}><b>Design brief</b> <span className="pill">phase 2 · AI drafts from this</span><div className="pt-1" style={soft}>{p.brief}</div></div>}
      <div className="grid gap-x-4 gap-y-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {TECH_PACK_ITEMS.map(it => <div key={it.key}><Field label={it.label}>{canDesign ? <div className="flex gap-1.5 items-center">{pick('Tech pack', it.label, n => { setTp(x => ({ ...x, [it.key]: n })); updatePack(o.id, { techPack: { [it.key]: n } }); })}<Input value={tp[it.key] ?? ''} onChange={e => setTp(x => ({ ...x, [it.key]: e.target.value }))} placeholder="or a note" style={{ flex: 1 }} /></div> : <div className="text-[12.5px] py-1">{p.techPack[it.key] ? <span>✓ {p.techPack[it.key]}</span> : <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}</Field></div>)}
      </div>
      {canDesign && <div className="pt-2"><Button size="sm" variant="primary" onClick={() => updatePack(o.id, { techPack: tp })}>Save tech pack</Button></div>}
    </div>}
    {tab === 'fabric' && <div>
      <div className="cap">Category</div>
      <div className="grid gap-x-4 gap-y-1.5 pb-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field label="Fabric description">{canDesign ? <Input value={fab.description ?? ''} onChange={e => setFab(x => ({ ...x, description: e.target.value || null }))} /> : <div className="text-[12.5px] py-1">{p.fabric.description ?? <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}</Field>
        <Field label="Fabric content">{canDesign ? <Input value={fab.content ?? ''} onChange={e => setFab(x => ({ ...x, content: e.target.value || null }))} placeholder="100% cotton" /> : <div className="text-[12.5px] py-1">{p.fabric.content ?? <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}</Field>
        <Field label="Photo of the physical fabric">{canDesign ? <div className="flex gap-1.5 items-center">{pick('Fabric photo', null, n => { setFab(x => ({ ...x, image: n })); updatePack(o.id, { fabric: { image: n } }); })}<Input value={fab.image ?? ''} onChange={e => setFab(x => ({ ...x, image: e.target.value || null }))} placeholder="file" style={{ flex: 1 }} /></div> : <div className="text-[12.5px] py-1">{p.fabric.image ?? <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}</Field>
        <Field label="Fabric rate (₹ / m, vendor's)">{canDesign ? <Input type="number" value={fab.rate ?? ''} onChange={e => setFab(x => ({ ...x, rate: num(e.target.value) }))} /> : <div className="text-[12.5px] py-1">{p.fabric.rate != null ? fmtMoney(p.fabric.rate) : <span style={faint}>—</span>}</div>}</Field>
        <Field label="Option / phase · swatch analyser">{canDesign ? <Input value={fab.swatchAnalyser ?? ''} onChange={e => setFab(x => ({ ...x, swatchAnalyser: e.target.value || null }))} placeholder="Option 2 · phase 1" /> : <div className="text-[12.5px] py-1">{p.fabric.swatchAnalyser ?? <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}</Field>
        <Field label="CPM (₹ / m)">{canDesign ? <Input type="number" value={fab.cpm ?? ''} onChange={e => setFab(x => ({ ...x, cpm: num(e.target.value) }))} /> : <div className="text-[12.5px] py-1">{p.fabric.cpm != null ? fmtMoney(p.fabric.cpm) : <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}</Field>
        <Field label="Fabric width (in)">{canDesign ? <Input type="number" value={fab.widthIn ?? ''} onChange={e => setFab(x => ({ ...x, widthIn: num(e.target.value) }))} /> : <div className="text-[12.5px] py-1">{p.fabric.widthIn != null ? `${p.fabric.widthIn}"` : <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}</Field>
      </div>
      {canDesign && <div className="pt-2"><Button size="sm" variant="primary" onClick={() => updatePack(o.id, { fabric: { description: fab.description, content: fab.content, image: fab.image, swatchAnalyser: fab.swatchAnalyser, cpm: fab.cpm, rate: fab.rate ?? null, widthIn: fab.widthIn } })}>Save fabric info</Button></div>}
    </div>}
    {tab === 'trimCard' && <div>
      {canDesign ? <div className="flex gap-2 items-end flex-wrap">{pick('Trim card', null, n => { setTrim(n); updatePack(o.id, { trimCard: n }); })}<div style={{ flex: '1 1 220px' }}><Field label="Trim card file / note"><Input value={trim} onChange={e => setTrim(e.target.value)} placeholder="trim-card.pdf" /></Field></div><Button size="sm" variant="primary" onClick={() => updatePack(o.id, { trimCard: trim.trim() || null })}>Save</Button></div>
        : <div className="text-[12.5px] py-1">{p.trimCard ? `✓ ${p.trimCard}` : <span style={{ color: 'var(--warn)' }}>missing</span>}</div>}
      {(p.trimLines ?? []).length > 0 && <table className="t compact mt-2"><thead><tr><th>Colour</th><th>Trim</th><th>Supplier item code</th><th>Reference image</th></tr></thead><tbody>{p.trimLines!.map((x, i) => <tr key={i}><td>{x.colour}</td><td>{x.item}</td><td className="mono text-[12px]">{x.supplierCode ?? '—'}</td><td className="text-[12px]">{x.image ?? '—'}</td></tr>)}</tbody></table>}
    </div>}
    {tab === 'sizes' && (() => { const canPlan = planner && !o.poNo && !o.poApproval; const total = sizes.reduce((a, x) => a + x.qty, 0);
      /* prototype: spread the indicative qty over the usual sizes, the way planning's sheet would */
      const spread = () => { const base = RTW_SIZES.slice(RTW_SIZES.indexOf(/hirt/i.test(o.category) ? '38' : '30')).slice(0, 6); const w = [1, 2, 3, 3, 2, 1].slice(0, base.length); const ws = w.reduce((a, b) => a + b, 0);
        setSizes(base.map((sz, i) => ({ size: sz, qty: Math.max(1, Math.round(o.orderQty * w[i] / ws)) }))); };
      return <div>
      <div className="flex items-center gap-2 flex-wrap pb-2"><span className="pill role-planning">Planning · Charanjeet</span>
        <span className="text-[12.5px]" style={soft}>{o.sizesBy ? `Added by ${o.sizesBy.by} ${fmtDate(o.sizesBy.on)} · ${o.orderQty} pcs` : `Planning's half of the requirement: the quantity for each size. Category's ask is about ${o.orderQty} pcs.`}</span></div>
      {!o.sizesBy && !canPlan && <div className="text-[12.5px] pb-2" style={{ color: 'var(--warn)' }}>Pending with Charanjeet.{o.queryEarly ? ' Counter sourcing has started on a per-piece quote; the PO waits for these sizes.' : ''}</div>}
      <SizeGrid breakup={sizes} edit={canPlan} onChange={(sz, n) => setSizes(b => { const has = b.some(x => x.size === sz); return has ? b.map(x => x.size === sz ? { ...x, qty: n } : x) : [...b, { size: sz, qty: n }]; })} />
      {canPlan && <div className="pt-2 flex gap-2 items-center flex-wrap"><Button size="sm" variant="primary" disabled={!total} onClick={() => savePlanningSizes(o.id, sizes)}>{o.sizesBy ? 'Save the sizes' : `Add the sizes · ${total} pcs`}</Button>{!total && <Button size="sm" variant="ghost" onClick={spread}>Fill with sample data</Button>}</div>}
    </div>; })()}
    {tab === 'bom' && <>
      {!only && <BomSection o={o} editable={design && !o.bomFrozen} open summary />}
      {!only && <BomQuantities o={o} canDesign={design} />}
      {only ? <BomVendors o={o} canDesign={canDesign} canSourcing={canSourcing} />
        : <details className="bom-vend-fold pt-3 mt-3" open={bomOpenOf(o).open.length > 0 || o.bom.some(l => !l.suppliedBy && (l.options ?? []).length > 0) || undefined}>
          <summary>Vendors on each line · where sourcing adds vendors and category picks one</summary>
          <BomVendors o={o} canDesign={canDesign} canSourcing={canSourcing} />
        </details>}
    </>}

    {canDesign && !only && <div className="ai-brief mt-3">
      <div className="flex items-center gap-2 flex-wrap"><span className="pill ai-pill">✦ AI</span><b className="text-[13px]">Describe it in your words</b><span className="text-[12px]" style={faint}>the tech pack, fabric info and trim card are drafted from this; check each part after</span></div>
      <textarea className="input mt-1.5" rows={3} value={brief} onChange={e => setBrief(e.target.value)} placeholder="Relaxed oxford shirt, button-down collar, single chest pocket, mother-of-pearl buttons, box-pleat back, folded in a kraft box…" style={{ fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.4, width: '100%' }} />
      <div className="flex items-center gap-2 pt-1.5"><Button size="sm" variant="primary" disabled={brief.trim().length < 10} onClick={draftWithAi}>✦ Draft the requirement</Button>{drafted && <span className="text-[12px]" style={{ color: 'var(--good)' }}>Drafted the empty items. Check each part before sending.</span>}</div>
    </div>}

    {/* the gate */}
    <div className="pt-3 mt-3 flex items-center gap-3 flex-wrap" hidden={!!only} style={{ borderTop: '1px solid var(--line-soft)' }}>
      {sent ? <span className="text-[12.5px]" style={{ color: 'var(--good)' }}>Sent to Production RTW {fmtDate(p.sentOn ?? o.styleHandover)}{p.sentBy ? ` by ${p.sentBy}` : ''}. Nitin picks the factories and sends the cost query.{rd.sizesMissing && <span style={{ color: 'var(--warn)' }}> Sent before the sizes: the PO waits for Charanjeet's.</span>}</span>
        : <>
          {(canDesign || canSourcing) && !rd.ready && !rd.categoryReady && <Button variant="ghost" onClick={fillSample}>Fill with sample data</Button>}
          {design && rd.categoryReady && rd.sizesMissing ? <div className="early-q">
            <div className="text-[12.5px]"><b>Category's half is complete.</b> The sizes are with Charanjeet.</div>
            <div className="flex gap-2 flex-wrap pt-1.5"><Button variant="primary" onClick={() => sendPack(o.id, true)}>Start counter sourcing now →</Button><span className="text-[12px]" style={faint}>factories quote per piece; only the PO draft waits for the sizes. Or wait: it goes once Charanjeet adds them.</span></div>
          </div>
          : design ? <Button variant="primary" disabled={!rd.ready} onClick={() => sendPack(o.id)}>Send to Production RTW →</Button> : <ActsBy role="design" does="sends it to Production RTW once the five parts are in" />}
          {!rd.ready && !(rd.categoryReady && rd.sizesMissing) && <span className="text-[12px]" style={{ color: 'var(--warn)' }}>Cannot proceed: {part.missing.length ? `${part.label} needs ${part.missing.join(', ')}` : rd.missing.slice(0, 3).join(', ')}{!part.missing.length && rd.missing.length > 3 ? ` and ${rd.missing.length - 3} more` : ''}{rd.sourcingMissing.length ? ' · sourcing owes vendors on the BOM' : ''}</span>}
        </>}
    </div>
  </Section></div>;
}

/* ── 2. the cost query: factories from the database, a deadline, the mail, the replies ── */
export function CostQuerySection({ o, prod, merchant, design, onDraftPo, onAskApproval, onGo }: { o: ProductionOrder; prod: boolean; merchant: boolean; design: boolean; onDraftPo?: (vendorId: string, fabricBy: FabricBy) => void; onAskApproval?: (vendorId: string, fabricBy: FabricBy) => void; onGo?: (step: string) => void }) {
  const { db, sendCostQuery, replyCostQuery, raisePoOnReply, reviseTarget } = useApp();
  const tr = targetReviseOpenOf(o);
  const [revField, setRevField] = useState<'targetInhouse' | 'targetCost'>('targetInhouse'); const [revTo, setRevTo] = useState(''); const [revWhy, setRevWhy] = useState('');
  const cq = o.costQuery ?? null; const rec = recommendFactories(db, o);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(rec.fit.slice(0, 3).map(v => v.id)));
  const [deadline, setDeadline] = useState(dateInput(new Date(Date.now() + 5 * 864e5).toISOString()));
  const [extra, setExtra] = useState('');
  const [files, setFiles] = useState<Record<string, string[]>>({});
  const filesOf = (id: string) => files[id] ?? [...QUERY_FILES];
  const flip = (id: string, f: string) => setFiles(x => { const cur = x[id] ?? [...QUERY_FILES]; return { ...x, [id]: cur.includes(f) ? cur.filter(y => y !== f) : QUERY_FILES.filter(y => y === f || cur.includes(y)) }; });
  const [poFor, setPoFor] = useState<string | null>(null); const [quoteFor, setQuoteFor] = useState<string | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null); const [cost, setCost] = useState(String(o.targetCost)); const [lead, setLead] = useState('36'); const [fabBy, setFabBy] = useState<FabricBy>('bsc-vendor'); const [note, setNote] = useState('');
  const sent = o.status !== 'Requirement';
  const toggle = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const nameOf = (id: string) => db.vendors.find(v => v.id === id)?.name ?? id;
  if (!sent) return <Section title="Factory counter sourcing" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>After the requirement is complete and sent.</div></Section>;
  if (!cq) return <Section title="Factory counter sourcing" collapsible={false} right={<span className="pill role-production">Nitin</span>}>
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
      {picked.size > 0 && <div className="pb-2">
        <div className="cap">Files to share · per factory</div>
        <div style={{ overflowX: 'auto' }}><table className="t compact po-lines">
          <thead><tr><th>Factory</th>{QUERY_FILES.map(f => <th key={f} style={{ textAlign: 'center', whiteSpace: 'normal', minWidth: 64 }}>{f}</th>)}</tr></thead>
          <tbody>{[...picked].map(id => <tr key={id}><td className="font-medium" style={{ width: 'auto', maxWidth: 'none', minWidth: 120 }}>{nameOf(id)}<button type="button" className="vlink text-[11px] block" onClick={() => setFiles(x => ({ ...x, [id]: filesOf(id).length === QUERY_FILES.length ? [] : [...QUERY_FILES] }))}>{filesOf(id).length === QUERY_FILES.length ? 'none' : 'all'}</button></td>
            {QUERY_FILES.map(f => <td key={f} style={{ textAlign: 'center' }}><input type="checkbox" checked={filesOf(id).includes(f)} onChange={() => flip(id, f)} /></td>)}</tr>)}</tbody>
        </table></div>
      </div>}
      {picked.size > 0 && deadline ? <MailCard label="Counter-sourcing query" mail={costQueryMail(db, o, [...picked], fromDateInput(deadline) ?? new Date().toISOString(), Object.fromEntries([...picked].map(id => [id, filesOf(id)])))} sentOn={null} sendLabel={`Send the query to ${picked.size} factor${picked.size === 1 ? 'y' : 'ies'} ✉`} onSend={m => sendCostQuery(o.id, [...picked], fromDateInput(deadline)!, { to: m.to, cc: m.cc, subject: m.subject, body: m.body }, Object.fromEntries([...picked].map(id => [id, filesOf(id)])))} />
        : <div className="text-[12.5px]" style={faint}>Pick at least one factory and a deadline; the mail composes itself and can be edited before it goes.</div>}
    </> : <ActsBy role="production" does="picks the factories, sets the deadline and sends the counter-sourcing query" />}
  </Section>;
  const late = daysAgo(cq.deadline) > 0;
  const revs = o.targetRevisions ?? [];
  return <Section title="Factory counter sourcing" collapsible={false} right={<Pill tone={tr.open ? 'risk' : cq.replies.length >= cq.factoryIds.length ? 'good' : late ? 'risk' : 'warn'}>{cq.replies.length} of {cq.factoryIds.length} replied · due {fmtDate(cq.deadline)}{late && cq.replies.length < cq.factoryIds.length ? ` · ${daysAgo(cq.deadline)}d past` : ''}</Pill>}>
    <div className="flex gap-4 flex-wrap text-[12.5px] pb-2"><span><span style={faint}>Target in-house </span><b>{fmtDate(o.targetInhouse)}</b><span style={faint}> · ours only, not sent to the factories</span></span><span><span style={faint}>Target cost </span><b>{fmtMoney(o.targetCost)}</b>/pc</span>{revs.length > 0 && <span style={faint}>revised {revs.length}× · log below</span>}</div>
    <MailCard label="Counter-sourcing query" mail={{ ...costQueryMail(db, o, cq.factoryIds, cq.deadline, cq.files), ...(cq.mail ?? {}), to: cq.to, cc: cq.cc }} sentOn={cq.sentOn} />
    <div className="pt-2" style={{ overflowX: 'auto' }}><table className="t compact">
      <thead><tr><th>Factory</th><th>Asked</th><th>Reply</th><th className="num">₹ / pc</th><th>Cloth per pc · wastage</th><th>Lead · in-house</th><th></th></tr></thead>
      <tbody>{cq.factoryIds.map(id => { const r = cq.replies.find(x => x.vendorId === id); const v = db.vendors.find(x => x.id === id); const chosen = o.vendorId === id && !!o.poNo; const fl = r ? replyFlagsOf(o, r) : null;
        return <tr key={id} style={{ background: chosen ? 'color-mix(in srgb, var(--good) 7%, transparent)' : fl?.flagged && !o.poNo ? 'color-mix(in srgb, var(--risk) 5%, transparent)' : undefined }}>
          <td><div className="font-medium"><VendorLink id={id} /></div><div className="text-[11px]" style={faint}>{v?.location} · {v?.region} · {vendorMail(v)}</div><div className="text-[11px]" style={soft}>sent: {(cq.files?.[id] ?? [...QUERY_FILES]).length === QUERY_FILES.length ? 'every file' : (cq.files?.[id] ?? []).join(', ') || 'no files'}</div></td>
          <td className="text-[12px]" style={soft}>{fmtDate(cq.sentOn)}</td>
          <td>{r ? <Pill tone="good">filled the form {fmtDate(r.repliedOn)}</Pill> : <Pill tone={late ? 'risk' : 'warn'}>{late ? `form not filled · ${daysAgo(cq.deadline)}d past` : 'form not filled yet'}</Pill>}{r?.note && <div className="text-[11px]" style={soft}>{r.note}</div>}</td>
          <td className="num" style={{ color: fl && fl.costOver > 0 ? 'var(--risk)' : undefined, fontWeight: fl && fl.costOver > 0 ? 600 : undefined }}>{r ? fmtMoney(r.cost) : '—'}{r?.breakdown && r.breakdown.length > 0 && <div className="text-[10.5px]" style={{ ...faint, fontWeight: 400, whiteSpace: 'normal', minWidth: 190, maxWidth: 240, marginLeft: 'auto' }}>{r.breakdown.map(b => `${b.head.split(' · ')[0].split(' ')[0].replace(/[,/]$/, '').toLowerCase()} ${fmtMoney(b.amount)}`).join(' · ')}</div>}{fl && fl.costOver > 0 && <div className="text-[10.5px]" style={{ color: 'var(--risk)', fontWeight: 400 }}>+{fmtMoney(fl.costOver)} over target</div>}</td>
          <td className="text-[12px]">{r?.consumptionPerPc != null || r?.wastagePct != null ? <><b>{r.consumptionPerPc != null ? `${r.consumptionPerPc} m` : '—'}</b>{r.wastagePct != null ? ` · ${r.wastagePct}% wastage` : ''}{r.consumptionPerPc != null && <div className="text-[10.5px]" style={faint}>{Math.ceil(r.consumptionPerPc * (1 + (r.wastagePct ?? 0) / 100) * o.orderQty).toLocaleString('en-IN')} m for {o.orderQty} pcs</div>}</> : <span style={faint}>{r ? 'not given' : '—'}</span>}</td>
          <td className="text-[12px]" style={{ color: fl && fl.lateDays > 0 ? 'var(--risk)' : undefined, fontWeight: fl && fl.lateDays > 0 ? 600 : undefined }}>{r ? `${r.leadDays} d · ${fmtDate(fl!.inhouseOn)}` : '—'}{fl && fl.lateDays > 0 && <div className="text-[10.5px]" style={{ color: 'var(--risk)', fontWeight: 400 }}>{fl.lateDays}d past the target date</div>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{chosen ? <Pill tone="good">PO {o.poNo}</Pill>
            : o.poNo ? null
            : r ? (() => { const ap = approvalOf(o);
              if (!o.enigmaProduct) return <button type="button" className="vlink text-[11.5px]" title="the PO cannot be drafted before the SKUs are in Enigma" onClick={() => onGo?.('launch')}>add the SKUs to Enigma first →</button>;
              if (ap.state === 'none') return design ? <Button size="sm" variant="primary" onClick={() => onAskApproval?.(id, fabBy)}>Draft the PO on this</Button> : <span className="text-[11.5px]" style={faint}>category drafts the PO</span>;
              if (ap.a!.vendorId !== id) return ap.state === 'rejected' && design ? <button type="button" className="vlink text-[11.5px]" onClick={() => onAskApproval?.(id, fabBy)}>draft the PO on this instead</button> : null;
              return <button type="button" onClick={() => onGo?.('approval')}><Pill tone={ap.state === 'rejected' || ap.late ? 'risk' : ap.state === 'approved' ? 'good' : 'warn'}>{ap.line}</Pill></button>; })()
            : <button type="button" className="vlink text-[11.5px]" onClick={() => setQuoteFor(id)}>open {nameOf(id)}'s quote form ↗</button>}</td>
        </tr>; })}</tbody>
    </table></div>
    {quoteFor && <QuoteFormModal o={o} vendorId={quoteFor} onClose={() => setQuoteFor(null)} />}
    {replyFor && !o.poNo && <div className="pt-2 flex gap-2 items-end flex-wrap" style={{ borderTop: '1px solid var(--line-soft)' }}>
      <span className="text-[12px] w-full pt-2" style={soft}>{nameOf(replyFor)}'s web form, as the factory fills it (in the build it arrives by itself):</span>
      <Field label="₹ / pc"><Input type="number" value={cost} onChange={e => setCost(e.target.value)} style={{ width: 100 }} /></Field>
      <Field label="Lead (days)"><Input type="number" value={lead} onChange={e => setLead(e.target.value)} style={{ width: 90 }} /></Field>
      <div style={{ flex: '1 1 180px' }}><Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} /></Field></div>
      <Button size="sm" variant="primary" onClick={() => { replyCostQuery(o.id, replyFor, { cost: Number(cost), leadDays: Number(lead), note: note.trim() || null }); setReplyFor(null); setNote(''); }}>Log reply</Button>
    </div>}
    {!o.poNo && cq.replies.length > 0 && <div className="pt-3 mt-2 flex gap-3 items-end flex-wrap" style={{ borderTop: '1px solid var(--line-soft)' }}>
      <div style={{ flex: '0 1 320px' }}><Field label="The cloth · decided before the PO" hint={fabBy === 'bsc' ? 'sourcing ships cloth and trims; BSC invoices the factory for them' : fabBy === 'bsc-vendor' ? `vendor details go on the PO: ${db.vendors.find(v => v.id === packOf(o).fabric.vendorId)?.name ?? '—'}; the factory raises its own fabric PO` : 'the factory uses its own cloth and gives its PO and receipt details'}>{design ? <Select value={fabBy} onChange={v => setFabBy(v as FabricBy)} options={(Object.keys(FABRIC_BY_LABEL) as FabricBy[]).map(k => ({ value: k, label: FABRIC_BY_LABEL[k] }))} /> : <div className="text-[12.5px] py-1">{FABRIC_BY_LABEL[fabBy]}</div>}</Field></div>
      <span className="pill role-design">Category</span>
    </div>}
    {!o.poNo && cq.replies.length > 0 && <SupplyInvoiceBar o={o} editable={design} clothBy={fabBy} className="mt-3" />}
    {!o.poNo && cq.replies.length > 0 && <div className="pt-2 text-[12.5px]" style={faint}>The PO delivers to <b>{o.deliverTo ?? deliveryLocationOf(needsHemmingOf(o))}</b> — {o.semiStitched ? 'a semi-stitched product, hemming in-house at Vasai' : 'nothing to hem, so the 3PL warehouse'} (set on the requirement).</div>}
    {!o.poNo && cq.replies.length === 0 && <div className="text-[12.5px] pt-2" style={faint}>No factory has filled the form yet. Replies land here by themselves from the factory's web form.</div>}
    {/* every reply over target: category revises the target in-house date or the target cost; what it was stays on the record */}
    {tr.open && <div className="mt-3 p-3 rounded-[8px]" style={{ background: 'color-mix(in srgb, var(--risk) 6%, #fff)', border: '1px solid var(--risk)' }}>
      <div className="font-medium text-[13px]" style={{ color: 'var(--risk)' }}>Every reply is over target</div>
      <div className="text-[12.5px] pt-0.5" style={soft}>{tr.flagged.map(r => { const fl = replyFlagsOf(o, r); return `${db.vendors.find(v => v.id === r.vendorId)?.name ?? r.vendorId}: ${fl.costOver > 0 ? `₹${fl.costOver} over` : ''}${fl.costOver > 0 && fl.lateDays > 0 ? ', ' : ''}${fl.lateDays > 0 ? `${fl.lateDays}d late` : ''}`; }).join(' · ')}. Category revises the target in-house date or the target cost, or Nitin asks more factories.</div>
      {design ? <div className="flex gap-2 items-end flex-wrap pt-2">
        <Field label="Revise"><Select value={revField} onChange={v => { setRevField(v as 'targetInhouse' | 'targetCost'); setRevTo(''); }} options={[{ value: 'targetInhouse', label: `Target in-house · now ${fmtDate(o.targetInhouse)}` }, { value: 'targetCost', label: `Target cost · now ${fmtMoney(o.targetCost)}` }]} /></Field>
        <Field label={revField === 'targetInhouse' ? 'New date' : 'New ₹ / pc'}>{revField === 'targetInhouse' ? <Input type="date" value={revTo} onChange={e => setRevTo(e.target.value)} /> : <Input type="number" value={revTo} onChange={e => setRevTo(e.target.value)} style={{ width: 110 }} />}</Field>
        <div style={{ flex: '1 1 200px' }}><Field label="Why"><Input value={revWhy} onChange={e => setRevWhy(e.target.value)} placeholder="what changed" /></Field></div>
        <Button size="sm" variant="primary" disabled={!revTo || !revWhy.trim()} onClick={() => { reviseTarget(o.id, revField, revField === 'targetInhouse' ? fromDateInput(revTo)! : Number(revTo), revWhy.trim()); setRevTo(''); setRevWhy(''); }}>Revise</Button>
      </div> : <div className="pt-2"><ActsBy role="design" does="revises the target in-house date or the target cost" /></div>}
    </div>}
    {revs.length > 0 && <div className="pt-3">
      <div className="cap">Target revisions · for the log</div>
      <table className="t compact"><thead><tr><th>What</th><th>Was</th><th>Now</th><th>Why</th><th>Who · when</th></tr></thead>
        <tbody>{revs.map((rv, i) => <tr key={i}><td>{rv.field === 'targetInhouse' ? 'Target in-house' : 'Target cost'}</td><td className="mono text-[12px]" style={{ textDecoration: 'line-through', ...faint }}>{rv.field === 'targetInhouse' ? fmtDate(String(rv.from)) : fmtMoney(Number(rv.from))}</td><td className="mono text-[12px] font-semibold">{rv.field === 'targetInhouse' ? fmtDate(String(rv.to)) : fmtMoney(Number(rv.to))}</td><td className="text-[12px]">{rv.why}</td><td className="text-[11.5px]" style={soft}>{rv.by} · {fmtDate(rv.on)}</td></tr>)}</tbody></table>
    </div>}
  </Section>;
}

/* ── 3b. every invoice on the PO, both ways: the factory's to BSC, and BSC's to the factory for material BSC supplied
   that the factory would otherwise have bought. Nitin logs them so accounts can reconcile. ── */
const INV_KIND: Record<PoInvoice['kind'], string> = { fabric: 'Fabric', trim: 'Trim', service: 'Service', other: 'Other' };
const DOC_LABEL: Record<NonNullable<PoInvoice['doc']>, string> = { invoice: 'Invoice', 'debit-note': 'Debit note', 'credit-note': 'Credit note', other: 'Other' };
export function PoInvoicesSection({ o, prod }: { o: ProductionOrder; prod: boolean }) {
  const { addPoInvoice, removePoInvoice, generateSupplyInvoice, addPoPayment, removePoPayment } = useApp();
  const led = poLedgerOf(o); const supply = supplyLinesOf(o); const supplyTotal = supply.reduce((x, l) => x + l.amount, 0);
  const generated = (o.poInvoices ?? []).some(r => r.lines?.length);
  const [view, setView] = useState<PoInvoice | null>(null);
  const pays = o.poPayments ?? [];
  const [pOn, setPOn] = useState(dateInput(new Date().toISOString())); const [pAmt, setPAmt] = useState(''); const [pRef, setPRef] = useState(''); const [pNote, setPNote] = useState('');
  const rows = o.poInvoices ?? [];
  /* who pays: a factory's invoice or credit note means BSC pays (or pays less); BSC's invoice for material or a debit note means the factory pays */
  const [docT, setDocT] = useState<NonNullable<PoInvoice['doc']>>('invoice'); const [payer, setPayer] = useState<PoInvoice['direction']>('factory-to-bsc');
  const [no, setNo] = useState(''); const [amt, setAmt] = useState(''); const [what, setWhat] = useState(''); const [file, setFile] = useState('');
  const bscPays = rows.filter(r => r.direction === 'factory-to-bsc').reduce((a, r) => a + r.amount, 0);
  const factoryPays = rows.filter(r => r.direction === 'bsc-to-factory').reduce((a, r) => a + r.amount, 0);
  const net = bscPays - factoryPays;
  const PAYER = { 'factory-to-bsc': 'BSC pays', 'bsc-to-factory': 'Factory pays' } as const;
  const add = () => { addPoInvoice(o.id, { doc: docT, direction: payer, kind: 'other', no: no.trim(), amount: Number(amt), what: what.trim() || DOC_LABEL[docT], file: file.trim() || null, note: null }); setNo(''); setAmt(''); setWhat(''); setFile(''); };
  return <Section title="Invoices · notes · payments" collapsible={false} right={<Pill tone={rows.length ? 'info' : 'neutral'}>{rows.length ? `${rows.length} logged` : 'none logged yet'}</Pill>}>
    <div style={{ overflowX: 'auto' }}><table className="t compact inv-lines">
      <thead><tr><th>Document</th><th>No.</th><th>What</th><th className="num">Amount ₹</th><th>Who pays</th><th>File</th><th></th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}>
        <td><Pill tone={r.doc === 'credit-note' ? 'good' : r.doc === 'debit-note' ? 'risk' : 'neutral'}>{DOC_LABEL[r.doc ?? 'invoice']}</Pill></td>
        <td className="mono text-[12px]">{r.no}</td>
        <td className="text-[12.5px]" style={{ whiteSpace: 'normal' }}><span className="rtw-what" title={r.what}>{r.what}</span><div className="text-[11px]" style={faint}>{r.by} · {fmtDate(r.on)}{r.note ? ` · ${r.note}` : ''}</div></td>
        <td className="num">{fmtMoney(r.amount)}</td>
        <td><Pill tone={r.direction === 'factory-to-bsc' ? 'warn' : 'info'}>{PAYER[r.direction]}</Pill></td>
        <td className="text-[12px]">{r.lines?.length ? <button type="button" className="vlink" onClick={() => setView(r)}>view invoice</button> : r.file ? <span className="vlink">{r.file}</span> : <span style={faint}>—</span>}</td>
        <td>{prod && <button type="button" className="vlink text-[11.5px]" onClick={() => removePoInvoice(o.id, r.id)}>×</button>}</td>
      </tr>)}
      {prod && <tr>
        <td><Select style={{ width: 112 }} value={docT} onChange={v => { setDocT(v as NonNullable<PoInvoice['doc']>); setPayer(v === 'debit-note' ? 'bsc-to-factory' : v === 'credit-note' ? 'bsc-to-factory' : 'factory-to-bsc'); }} options={Object.entries(DOC_LABEL).map(([k, l]) => ({ value: k, label: l }))} /></td>
        <td><Input value={no} onChange={e => setNo(e.target.value)} placeholder="INV/0412" style={{ width: 84 }} /></td>
        <td><Input value={what} onChange={e => setWhat(e.target.value)} placeholder="what it is for" style={{ width: '100%', minWidth: 110 }} /></td>
        <td className="num"><Input type="number" min={0} value={amt} onChange={e => setAmt(e.target.value)} placeholder="₹" style={{ width: 78, textAlign: 'right' }} /></td>
        <td><Select style={{ width: 112 }} value={payer} onChange={v => setPayer(v as PoInvoice['direction'])} options={[{ value: 'factory-to-bsc', label: 'BSC pays' }, { value: 'bsc-to-factory', label: 'Factory pays' }]} /></td>
        <td><Input value={file} onChange={e => setFile(e.target.value)} placeholder="file.pdf" style={{ width: 72 }} /></td>
        <td><Button size="sm" variant="primary" disabled={!no.trim() || !Number(amt)} onClick={add}>+ Add</Button></td>
      </tr>}</tbody>
    </table></div>
    {supply.length > 0 && <div className="supply-inv mt-3">
      <div className="flex items-center gap-2 flex-wrap"><b className="text-[13px]">What BSC sends on this style</b><span className="text-[12px]" style={faint}>{supply.map(l => `${l.item} ${l.qty} ${l.unit}`).join(' · ')}</span>
        <span className="ml-auto flex items-center gap-2"><b className="text-[13px]">{fmtMoney(supplyTotal)}</b></span></div>
      <div className="pt-1"><TransferStatus o={o} /></div>
      {!supplyTotal && <div className="text-[11.5px] pt-1" style={{ color: 'var(--warn)' }}>Add a rate to the BOM lines BSC sends to price the invoice.</div>}
    </div>}

    <div className="cap pt-4">Payments made</div>
    <div style={{ overflowX: 'auto' }}><table className="t compact inv-lines">
      <thead><tr><th>Date</th><th>Reference</th><th>Note</th><th className="num">Amount ₹</th><th>Logged</th><th></th></tr></thead>
      <tbody>{pays.map(x => <tr key={x.id}><td className="text-[12.5px]">{fmtDate(x.on)}</td><td className="mono text-[12px]">{x.ref ?? '—'}</td><td className="text-[12.5px]" style={{ whiteSpace: 'normal' }}>{x.note ?? '—'}</td><td className="num">{fmtMoney(x.amount)}</td>
        <td className="text-[11.5px]" style={soft}>{x.by}{x.via === 'upload' ? " · finance's upload" : ''}</td><td>{prod && <button type="button" className="vlink text-[11.5px]" onClick={() => removePoPayment(o.id, x.id)}>×</button>}</td></tr>)}
      {pays.length === 0 && !prod && <tr><td colSpan={6} className="text-[12.5px]" style={faint}>No payment logged yet.</td></tr>}
      {prod && <tr><td><Input type="date" value={pOn} onChange={e => setPOn(e.target.value)} style={{ width: 132 }} /></td><td><Input value={pRef} onChange={e => setPRef(e.target.value)} placeholder="UTR / cheque no." style={{ width: 120 }} /></td><td><Input value={pNote} onChange={e => setPNote(e.target.value)} placeholder="25% advance, balance…" style={{ width: '100%', minWidth: 120 }} /></td>
        <td className="num"><Input type="number" min={0} value={pAmt} onChange={e => setPAmt(e.target.value)} placeholder="₹" style={{ width: 96, textAlign: 'right' }} /></td>
        <td colSpan={2}><Button size="sm" variant="primary" disabled={!Number(pAmt) || !pOn} onClick={() => { addPoPayment(o.id, { on: fromDateInput(pOn)!, amount: Number(pAmt), ref: pRef.trim() || null, note: pNote.trim() || null }); setPAmt(''); setPRef(''); setPNote(''); }}>+ Add</Button></td></tr>}</tbody>
    </table></div>

    <div className="po-totals mt-3" style={{ maxWidth: 420, marginLeft: 'auto' }}>
      <div className="kv"><span className="k">PO total</span><span className="v">{fmtMoney(Math.round(led.poTotal))}</span></div>
      <div className="kv"><span className="k">Less: BSC's invoices and debit notes<span className="block text-[11px]" style={faint}>material BSC sent, deductions</span></span><span className="v">− {fmtMoney(Math.round(led.bscInvoiced))}</span></div>
      {led.counted && <div className="kv"><span className="k">Less: not received<span className="block text-[11px]" style={faint}>{led.receivedPcs} of {led.poPcs} pcs counted in by the warehouse{led.rejectedPcs ? ` · ${led.rejectedPcs} damaged` : ''}</span></span><span className="v" style={{ color: led.shortValue ? 'var(--risk)' : undefined }}>− {fmtMoney(led.shortValue)}</span></div>}
      <div className="kv"><span className="k">Payable to the factory</span><span className="v">{fmtMoney(Math.round(led.payable))}</span></div>
      <div className="kv"><span className="k">Paid so far</span><span className="v">− {fmtMoney(Math.round(led.paid))}</span></div>
      <div className="kv po-grand"><span className="k">Remaining to pay</span><span className="v" style={{ color: led.remaining < 0 ? 'var(--risk)' : undefined }}>{fmtMoney(Math.round(led.remaining))}</span></div>
      {led.advancePct > 0 && <div className="text-[11.5px] pt-1" style={{ color: led.advancePending > 0 ? 'var(--warn)' : 'var(--good)' }}>{led.advancePct}% up front {led.advanceWhen ?? ''}: {fmtMoney(led.advanceDue)} · {led.advancePending > 0 ? `${fmtMoney(led.advancePending)} still to pay` : 'paid'}</div>}
      <div className="text-[11px] pt-1" style={faint}>Factory has invoiced {fmtMoney(Math.round(led.factoryInvoiced))} so far{!o.poNo ? ' · no PO yet' : ''}</div>
    </div>
    {view && <InvoicePreview o={o} inv={view} onClose={() => setView(null)} />}
    {!prod && !rows.length && <ActsBy role="production" does="logs every invoice and note, both ways" />}
  </Section>;
}

/* ── 3. the PO, mailed with the delivery location, the cloth vendor and the TNA form ── */
/* ── 3a. the PO itself: item lines per colour with the size break-up and a rate, other charges, GST and the terms.
   Drafted from the requirement's colours and sizes at the reply's rate; Nitin edits every line before raising it. ── */
const PAYMENT_TERMS = ['45 days from receipt at the warehouse', '30 days from receipt at the warehouse', '50% advance, 50% on dispatch', 'On dispatch, against invoice'];
export type PoAsk = { needs: ApproverRole[]; deadline: string; note: string | null };
const PO_NEEDS: { id: string; label: string; needs: ApproverRole[] }[] = [{ id: 'both', label: 'Both HOD and finance', needs: ['hod', 'finance'] }, { id: 'hod', label: 'Only HOD', needs: ['hod'] }, { id: 'finance', label: 'Only finance', needs: ['finance'] }, { id: 'skip', label: 'Skip approval', needs: [] }];
export function PoForm({ o, vendorId, rate, fabricBy, onCancel, onRaise, initialDoc, title }: { o: ProductionOrder; vendorId: string; rate: number; fabricBy: FabricBy; onCancel: () => void; onRaise: (d: PoDoc, ask: PoAsk) => void; initialDoc?: PoDoc | null; title?: string }) {
  const [need, setNeed] = useState('both'); const [deadline, setDeadline] = useState(dateInput(new Date(Date.now() + 2 * 864e5).toISOString())); const [askNote, setAskNote] = useState('');
  const { db } = useApp();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, []);
  const [d, setD] = useState<PoDoc>(() => { if (initialDoc) return structuredClone(initialDoc); const x = poDraftOf(o, rate, o.costQuery?.replies.find(r => r.vendorId === vendorId)?.lines); return { ...x, priceBasis: fabricBy === 'bsc' ? 'CMT · BSC supplies the cloth' : fabricBy === 'bsc-vendor' ? "FOB · cloth from BSC's vendor, bought by the factory" : 'FOB · cloth and trims by the factory' }; });
  const [newColour, setNewColour] = useState(''); const [chLabel, setChLabel] = useState(''); const [chAmt, setChAmt] = useState('');
  const sizes = [...new Set(d.lines.flatMap(l => l.sizes.map(x => x.size)))];
  const t = poTotalsOf(d); const want = o.orderQty;
  const rm = rawMaterialsOf(db, o, isCmt(d) ? 'bsc' : fabricBy === 'bsc' ? 'bsc-vendor' : fabricBy);
  const setLine = (id: string, f: (l: PoLine) => PoLine) => setD(x => ({ ...x, lines: x.lines.map(l => l.id === id ? f(l) : l) }));
  const qtyOf = (l: PoLine) => l.sizes.reduce((a, x) => a + (x.qty || 0), 0);
  const v = db.vendors.find(x => x.id === vendorId); const deliver = o.deliverTo ?? deliveryLocationOf(needsHemmingOf(o));
  const ok = d.lines.length > 0 && t.pcs > 0 && d.lines.every(l => l.colour.trim() && l.rate > 0);
  return <div ref={box} className="po-doc po-draft mt-3" style={{ scrollMarginTop: 140 }}>
    <div className="flex items-baseline gap-2 flex-wrap pb-2"><span className="cap" style={{ margin: 0 }}>{title ?? 'Purchase order · draft'}</span><span className="text-[12px]" style={faint}>to {v?.name ?? vendorId} · reply {fmtMoney(rate)}/pc</span></div>
    <div className="grid gap-x-4 gap-y-1 pb-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      <Field label="Factory"><div className="text-[12.5px] py-1 font-medium">{v?.name ?? '—'}<span className="block text-[11px] font-normal" style={faint}>{v?.location}{v?.email ? ` · ${v.email}` : ''}</span></div></Field>
      <Field label="Deliver to"><div className="text-[12.5px] py-1 font-medium">{deliver}</div></Field>
      <Field label="Style"><div className="text-[12.5px] py-1 font-medium">{o.styleName}<span className="block text-[11px] font-normal" style={faint}>{o.enigmaProduct?.code ?? o.category}</span></div></Field>
      <Field label="Quantity"><div className="text-[12.5px] py-1 font-medium">{t.pcs} pcs<span className="block text-[11px] font-normal" style={faint}>size ratio {sizes.map(sz => d.lines.reduce((a, l) => a + (l.sizes.find(x => x.size === sz)?.qty ?? 0), 0)).join(' : ')}</span></div></Field>
      <Field label="Delivery date"><Input type="date" value={dateInput(d.shipBy)} onChange={e => setD(x => ({ ...x, shipBy: fromDateInput(e.target.value) }))} /></Field>
      <Field label="Goods expected by"><Input type="date" value={dateInput(d.goodsExpectedBy)} onChange={e => setD(x => ({ ...x, goodsExpectedBy: fromDateInput(e.target.value) }))} /></Field>
      <Field label="Price basis"><Select value={d.priceBasis} onChange={val => setD(x => { const cmt = val.startsWith('CMT'); const code = taxCodeOf(o, cmt); const cons = o.fabricMetres && o.orderQty ? Math.round(o.fabricMetres / o.orderQty * 100) / 100 : 1.6;
        return { ...x, priceBasis: val, gstPct: 5, lines: x.lines.map(l => ({ ...l, hsn: code })), cloth: cmt ? (x.cloth ?? { metresIssued: o.fabricMetres ?? null, consumptionPerPc: cons, wastagePct: 3, leftover: 'Returned to BSC with the goods' }) : null }; })} options={['CMT · BSC supplies the cloth', "FOB · cloth from BSC's vendor, bought by the factory", 'FOB · cloth and trims by the factory'].map(x => ({ value: x, label: x }))} /></Field>
      <Field label="Paid up front %"><Select value={String(d.advancePct ?? 0)} onChange={val => setD(x => ({ ...x, advancePct: Number(val) }))} options={[0, 25, 30, 50].map(n => ({ value: String(n), label: n ? `${n}% up front` : 'nothing up front' }))} /></Field>
      {(d.advancePct ?? 0) > 0 && <Field label="Up-front payment due"><Select value={d.advanceWhen ?? 'with the PO'} onChange={val => setD(x => ({ ...x, advanceWhen: val }))} options={['with the PO', 'when the cloth is in-house', 'on PP sample approval'].map(x => ({ value: x, label: x }))} /></Field>}
      <Field label={(d.advancePct ?? 0) > 0 ? 'Balance payment' : 'Payment terms'}><Select value={d.paymentTerms} onChange={val => setD(x => ({ ...x, paymentTerms: val }))} options={PAYMENT_TERMS.map(x => ({ value: x, label: x }))} /></Field>
      <Field label={isCmt(d) ? 'SAC · job work' : 'HSN · garment'} hint={isCmt(d) ? 'CMT is a stitching service' : 'by what the garment is'}><Input value={d.lines[0]?.hsn ?? ''} onChange={e => setD(x => ({ ...x, lines: x.lines.map(l => ({ ...l, hsn: e.target.value })) }))} /></Field>
      <Field label="GST" hint="to confirm with accounts"><Select value={String(d.gstPct)} onChange={val => setD(x => ({ ...x, gstPct: Number(val) }))} options={[5, 12, 18].map(n => ({ value: String(n), label: `${n}%` }))} /></Field>
      <Field label="Delivery date means"><Select value={d.deliveryBasis ?? 'in-house'} onChange={val => setD(x => ({ ...x, deliveryBasis: val as 'ex-factory' | 'in-house' }))} options={[{ value: 'in-house', label: 'in-house at the warehouse' }, { value: 'ex-factory', label: 'leaves the factory' }]} /></Field>
      <Field label="Quantity tolerance ±%"><Input type="number" min={0} max={10} value={String(d.tolerancePct ?? 0)} onChange={e => setD(x => ({ ...x, tolerancePct: Number(e.target.value) || 0 }))} /></Field>
      <Field label="Final inspection AQL"><Select value={d.aql ?? AQL_LEVELS[1]} onChange={val => setD(x => ({ ...x, aql: val }))} options={AQL_LEVELS.map(a => ({ value: a, label: a }))} /></Field>
      <Field label="Late delivery"><Input value={d.lateDeduction ?? ''} onChange={e => setD(x => ({ ...x, lateDeduction: e.target.value || null }))} placeholder="e.g. 1% per week late" /></Field>
    </div>
    <div style={{ overflowX: 'auto' }}><table className="t compact po-lines">
      <thead><tr><th>#</th><th>Colour / option</th>{sizes.map(sz => <th key={sz} className="num">{sz}</th>)}<th className="num">Pcs</th><th className="num">₹ / pc</th><th className="num">Amount</th><th></th></tr></thead>
      <tbody>{d.lines.map((l, i) => <tr key={l.id}>
        <td className="mono text-[11px]" style={faint}>{String(i + 1).padStart(2, '0')}</td>
        <td><Input value={l.colour} onChange={e => setLine(l.id, x => ({ ...x, colour: e.target.value }))} style={{ width: 112 }} /></td>
        {sizes.map(sz => { const q = l.sizes.find(x => x.size === sz)?.qty ?? 0; return <td key={sz} className="num"><Input type="number" min={0} value={String(q)} onChange={e => setLine(l.id, x => ({ ...x, sizes: sizes.map(s2 => ({ size: s2, qty: s2 === sz ? Math.max(0, Number(e.target.value) || 0) : (x.sizes.find(y => y.size === s2)?.qty ?? 0) })) }))} style={{ width: 46, textAlign: 'right', padding: '4px 5px' }} /></td>; })}
        <td className="num font-semibold">{qtyOf(l)}</td>
        <td className="num"><Input type="number" min={0} value={String(l.rate)} onChange={e => setLine(l.id, x => ({ ...x, rate: Number(e.target.value) || 0 }))} style={{ width: 62, textAlign: 'right', padding: '4px 5px' }} /></td>
        <td className="num">{fmtMoney(Math.round(qtyOf(l) * l.rate))}</td>
        <td>{d.lines.length > 1 && <button type="button" className="vlink text-[12px]" title="remove this line" onClick={() => setD(x => ({ ...x, lines: x.lines.filter(y => y.id !== l.id) }))}>×</button>}</td>
      </tr>)}</tbody>
      <tfoot><tr><td></td><td className="text-[12px]" style={soft}>Total</td>
        {sizes.map(sz => <td key={sz} className="num text-[12px]" style={soft}>{d.lines.reduce((a, l) => a + (l.sizes.find(x => x.size === sz)?.qty ?? 0), 0)}</td>)}
        <td className="num font-semibold">{t.pcs}</td><td></td><td className="num font-semibold">{fmtMoney(Math.round(t.value))}</td><td></td></tr></tfoot>
    </table></div>
    <div className="pt-1.5"><span className="flex gap-1.5 items-center"><Input value={newColour} onChange={e => setNewColour(e.target.value)} placeholder="another colour" style={{ width: 112 }} /><Button size="sm" variant="ghost" disabled={!newColour.trim()} onClick={() => { setD(x => ({ ...x, lines: [...x.lines, { id: `pl-${Date.now()}`, colour: newColour.trim(), hsn: x.lines[0]?.hsn ?? null, rate: x.lines[0]?.rate ?? rate, sizes: sizes.map(sz => ({ size: sz, qty: 0 })) }] })); setNewColour(''); }}>+ Line</Button></span></div>
    {d.cloth && (() => { const cn = clothNeedOf(d, t.pcs); const c = d.cloth!; const setC = (p: Partial<NonNullable<PoDoc['cloth']>>) => setD(x => ({ ...x, cloth: { ...x.cloth!, ...p } }));
      return <div className="po-cloth mt-3"><div className="cap" style={{ margin: 0 }}>Cloth BSC issues · CMT</div>
        <div className="grid gap-x-4 gap-y-1 pt-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Field label="Metres issued"><Input type="number" min={0} value={c.metresIssued != null ? String(c.metresIssued) : ''} onChange={e => setC({ metresIssued: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="Consumption m / pc"><Input type="number" min={0} step="0.01" value={c.consumptionPerPc != null ? String(c.consumptionPerPc) : ''} onChange={e => setC({ consumptionPerPc: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="Allowed wastage %"><Input type="number" min={0} value={c.wastagePct != null ? String(c.wastagePct) : ''} onChange={e => setC({ wastagePct: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="Leftover cloth"><Select value={c.leftover} onChange={v => setC({ leftover: v })} options={['Returned to BSC with the goods', 'Kept at the factory for BSC', 'Adjusted on the invoice'].map(x => ({ value: x, label: x }))} /></Field>
        </div>
        {cn && <div className="text-[12px] pt-1" style={{ color: cn.short != null && cn.short > 0 ? 'var(--risk)' : 'var(--ink-soft)' }}>{t.pcs} pcs × {c.consumptionPerPc} m + {c.wastagePct ?? 0}% = {cn.need} m needed{cn.short != null ? (cn.short > 0 ? ` · ${cn.short} m short of what is issued` : ` · ${Math.abs(cn.short)} m to spare`) : ''}</div>}
      </div>; })()}
    {t.pcs !== want && <div className="text-[12px] pt-1" style={{ color: 'var(--warn)' }}>{t.pcs} pcs on the PO against {want} on the requirement ({t.pcs > want ? '+' : ''}{t.pcs - want}).</div>}
    <div className="text-[11.5px] pt-0.5" style={faint}>Accepted on delivery: {Math.floor(t.pcs * (1 - (d.tolerancePct ?? 0) / 100))} to {Math.ceil(t.pcs * (1 + (d.tolerancePct ?? 0) / 100))} pcs</div>
    <div className="grid gap-4 pt-3" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(240px, 300px)' }}>
      <div>
        <div className="cap">Other charges on the PO</div>
        {d.charges.map((c, i) => <div key={i} className="flex justify-between text-[12.5px] py-0.5"><span>{c.label}</span><span>{fmtMoney(c.amount)} <button type="button" className="vlink" onClick={() => setD(x => ({ ...x, charges: x.charges.filter((_, k) => k !== i) }))}>×</button></span></div>)}
        <div className="flex gap-1.5 items-center pt-1"><Input value={chLabel} onChange={e => setChLabel(e.target.value)} placeholder="logistics, packing, testing…" style={{ flex: 1 }} /><Input type="number" value={chAmt} onChange={e => setChAmt(e.target.value)} placeholder="₹" style={{ width: 90 }} /><Button size="sm" variant="ghost" disabled={!chLabel.trim() || !Number(chAmt)} onClick={() => { setD(x => ({ ...x, charges: [...x.charges, { label: chLabel.trim(), amount: Number(chAmt) }] })); setChLabel(''); setChAmt(''); }}>Add</Button></div>
        <div className="pt-3"><Field label="Raw material terms" hint="who supplies what; the vendors BSC nominates are named for the factory"><textarea className="input" rows={4} value={d.rawMaterialTerms ?? rm.text} onChange={e => setD(x => ({ ...x, rawMaterialTerms: e.target.value }))} style={{ width: '100%', fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.45 }} /></Field>
          {rm.nominated.some(r => !r.vendor) && <div className="text-[11.5px]" style={{ color: 'var(--warn)' }}>No vendor named yet for: {rm.nominated.filter(r => !r.vendor).map(r => r.item).join(', ')}. Add it on the BOM.</div>}</div>
        <div className="pt-3"><Field label="Notes and terms on the PO"><textarea className="input" rows={3} value={d.notes ?? ''} onChange={e => setD(x => ({ ...x, notes: e.target.value || null }))} placeholder="packing per polybag, cartons of 40, labels as per the trim card…" style={{ width: '100%', fontFamily: 'inherit', fontSize: 12.5 }} /></Field></div>
      </div>
      <div className="po-totals">
        <div className="kv"><span className="k">Goods · {t.pcs} pcs</span><span className="v">{fmtMoney(Math.round(t.value))}</span></div>
        <div className="kv"><span className="k">Other charges</span><span className="v">{fmtMoney(Math.round(t.charges))}</span></div>
        <div className="kv"><span className="k">Taxable value</span><span className="v">{fmtMoney(Math.round(t.taxable))}</span></div>
        <div className="kv"><span className="k">GST {d.gstPct}%</span><span className="v">{fmtMoney(Math.round(t.gst))}</span></div>
        <div className="kv po-grand"><span className="k">PO total</span><span className="v">{fmtMoney(Math.round(t.total))}</span></div>
        <div className="text-[11px] pt-1" style={faint}>average {fmtMoney(Math.round(t.avgRate))}/pc · target {fmtMoney(o.targetCost)}/pc</div>
      </div>
    </div>
    <div className="po-ask mt-3">
      <div className="cap" style={{ margin: 0 }}>{need === 'skip' ? 'No approval · the PO is raised and mailed now' : 'Send for approval · it is raised and mailed by itself once approved'}</div>
      <div className="flex gap-2 flex-wrap items-end pt-1.5">
        <span className="flex gap-2 flex-wrap">{PO_NEEDS.map(n => <button key={n.id} type="button" className={`dest-opt${need === n.id ? ' on' : ''}`} onClick={() => setNeed(n.id)}><span className="dest-dot" />{n.label}</button>)}</span>
        {need !== 'skip' && <Field label="Approve by"><Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></Field>}
        <div style={{ flex: '1 1 220px' }}><Field label={need === 'skip' ? 'Why no approval is needed' : 'Note for the approvers'}><Input value={askNote} onChange={e => setAskNote(e.target.value)} placeholder={need === 'skip' ? 'repeat order at the same rate, within budget…' : 'why this factory, what changed'} /></Field></div>
      </div>
    </div>
    <div className="flex gap-2 pt-3"><Button variant="primary" disabled={!ok || (need !== 'skip' && !deadline) || (need === 'skip' && !askNote.trim())} onClick={() => onRaise({ ...d, rawMaterialTerms: d.rawMaterialTerms ?? rm.text }, { needs: PO_NEEDS.find(n => n.id === need)!.needs, deadline: fromDateInput(deadline) ?? new Date().toISOString(), note: askNote.trim() || null })}>{need === 'skip' ? 'Raise and send the PO' : 'Send for approval'} · {fmtMoney(Math.round(t.total))}</Button><Button variant="ghost" onClick={onCancel}>Cancel</Button></div>
  </div>;
}
export function PoDocView({ o, doc }: { o: ProductionOrder; doc?: PoDoc | null }) {
  const { db } = useApp();
  const d0 = doc ?? o.poDoc; if (!d0) return null;
  const d = { ...d0, rawMaterialTerms: d0.rawMaterialTerms ?? rawMaterialsOf(db, o).text };
  const t = poTotalsOf(d); const sizes = [...new Set(d.lines.flatMap(l => l.sizes.map(x => x.size)))];
  const qtyOf = (l: PoLine) => l.sizes.reduce((a, x) => a + (x.qty || 0), 0);
  return <div className="po-doc my-2">
    {(() => { const terms: [string, React.ReactNode][] = [
        ['Price basis', d.priceBasis], ['Payment', `${(d.advancePct ?? 0) > 0 ? `${d.advancePct}% ${d.advanceWhen ?? 'up front'}, balance ` : ''}${d.paymentTerms}`],
        ['Delivery date', `${fmtDate(d.shipBy)} · ${d.deliveryBasis === 'ex-factory' ? 'leaves the factory' : 'in-house at the warehouse'}`], ...(d.goodsExpectedBy ? [['Goods expected by', fmtDate(d.goodsExpectedBy)] as [string, React.ReactNode]] : []),
        [`GST${d.lines[0]?.hsn ? ` · ${isCmt(d) ? 'SAC' : 'HSN'}` : ''}`, `${d.gstPct}%${d.lines[0]?.hsn ? ` · ${d.lines[0].hsn}` : ''}`], ...(d.revision ? [['Revision', String(d.revision)] as [string, React.ReactNode]] : []),
        ...(d.tolerancePct != null ? [['Tolerance', `±${d.tolerancePct}%`] as [string, React.ReactNode]] : []), ...(d.aql ? [['AQL', d.aql] as [string, React.ReactNode]] : []),
        ...(d.lateDeduction ? [['Late delivery', d.lateDeduction] as [string, React.ReactNode]] : []),
        ...(d.cloth ? [['Cloth issued · CMT', `${d.cloth.metresIssued ?? '—'} m · ${d.cloth.consumptionPerPc ?? '—'} m/pc · ${d.cloth.wastagePct ?? 0}% wastage · ${d.cloth.leftover.toLowerCase()}`] as [string, React.ReactNode]] : [])];
      const pairs: [string, React.ReactNode][][] = []; for (let k = 0; k < terms.length; k += 2) pairs.push(terms.slice(k, k + 2));
      return <table className="t compact sum-t kv po-terms mb-3"><tbody>{pairs.map((pr, k) => <tr key={k}>{pr.map(([a, b]) => [<th key={a}>{a}</th>, <td key={a + 'v'} colSpan={pr.length === 1 ? 3 : 1}><b>{b}</b></td>])}</tr>)}</tbody></table>; })()}
    <div style={{ overflowX: 'auto' }}><table className="t compact po-lines">
      <thead><tr><th>#</th><th>Colour / option</th>{sizes.map(sz => <th key={sz} className="num">{sz}</th>)}<th className="num">Pcs</th><th className="num">₹ / pc</th><th className="num">Amount</th></tr></thead>
      <tbody>{d.lines.map((l, i) => <tr key={l.id}><td className="mono text-[11px]" style={faint}>{String(i + 1).padStart(2, '0')}</td><td className="font-medium">{l.colour}</td>
        {sizes.map(sz => <td key={sz} className="num">{l.sizes.find(x => x.size === sz)?.qty ?? 0}</td>)}<td className="num font-semibold">{qtyOf(l)}</td><td className="num">{fmtMoney(l.rate)}</td><td className="num">{fmtMoney(Math.round(qtyOf(l) * l.rate))}</td></tr>)}</tbody>
      <tfoot><tr><td></td><td className="text-[12px]" style={soft}>Total</td>{sizes.map(sz => <td key={sz} className="num text-[12px]" style={soft}>{d.lines.reduce((a, l) => a + (l.sizes.find(x => x.size === sz)?.qty ?? 0), 0)}</td>)}<td className="num font-semibold">{t.pcs}</td><td></td><td className="num font-semibold">{fmtMoney(Math.round(t.value))}</td></tr></tfoot>
    </table></div>
    <div className="grid gap-4 pt-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(240px, 300px)' }}>
      <div className="text-[12.5px]">{d.charges.length > 0 && <><div className="cap">Other charges</div>{d.charges.map((c, i) => <div key={i} className="flex justify-between py-0.5"><span>{c.label}</span><span>{fmtMoney(c.amount)}</span></div>)}</>}{d.rawMaterialTerms && <><div className="cap">Raw material terms</div><div style={{ ...soft, whiteSpace: 'pre-line' }}>{d.rawMaterialTerms}</div></>}{d.notes && <><div className="cap pt-2">Notes and terms</div><div style={soft}>{d.notes}</div></>}</div>
      <div className="po-totals">
        <div className="kv"><span className="k">Goods</span><span className="v">{fmtMoney(Math.round(t.value))}</span></div>
        {t.charges > 0 && <div className="kv"><span className="k">Other charges</span><span className="v">{fmtMoney(Math.round(t.charges))}</span></div>}
        <div className="kv"><span className="k">GST {d.gstPct}%</span><span className="v">{fmtMoney(Math.round(t.gst))}</span></div>
        <div className="kv po-grand"><span className="k">PO total</span><span className="v">{fmtMoney(Math.round(t.total))}</span></div>
      </div>
    </div>
  </div>;
}

/* what rides with the PO mail, as files; the invoice generated from the BOM opens */
const ATT_WHAT: Record<string, string> = { 'PO': 'the order: lines, rates, GST, terms', 'Tech pack': 'specs and construction', 'Trim card': 'every trim with its placement', 'Size break-up': 'pieces by colour and size', 'BOM': 'material per piece and who supplies it', 'TNA form · planned dates': 'the factory fills a planned date per step' };
function PoAttachments({ o }: { o: ProductionOrder }) {
  const { db } = useApp(); const [view, setView] = useState<PoInvoice | null>(null); const [poPdf, setPoPdf] = useState(false);
  const invs = supplyInvoicesOf(o); const files = poMailOf(db, o).attachments.filter(a => !a.startsWith('Invoice ') && !a.startsWith('Vendor details')); const vs = poVendorsOf(db, o);
  const n = files.length + invs.length + (vs.length ? 1 : 0);
  return <div className="mt-3">
    <div className="cap" style={{ margin: '0 0 6px' }}>Attachments on the PO mail · {n}</div>
    <table className="t compact sum-t att-t"><colgroup><col style={{ width: 44 }} /><col style={{ width: 190 }} /><col /><col style={{ width: 116 }} /></colgroup><thead><tr><th>#</th><th>File</th><th>What it is</th><th className="num"></th></tr></thead>
      <tbody>
        {files.map((f, k) => <tr key={f}><td className="mono" style={faint}>{String(k + 1).padStart(2, '0')}</td><td className="font-medium">{f.replace(/ · .*$/, '')}</td><td style={soft}>{ATT_WHAT[f] ?? ''}</td><td className="num">{f === 'PO' && o.poDoc ? <Button size="sm" onClick={() => setPoPdf(true)}>View PDF</Button> : <span style={faint}>{/size break|bom/i.test(f) ? 'XLSX' : 'PDF'}</span>}</td></tr>)}
        {vs.length > 0 && <tr><td className="mono" style={faint}>{String(files.length + 1).padStart(2, '0')}</td><td className="font-medium">Vendor details</td><td style={soft}>{vs.length} vendor{vs.length === 1 ? '' : 's'} · {vs.map(v => `${v.name}: ${v.supplies}`).join(' · ')}</td><td className="num"><Button size="sm" onClick={() => downloadVendorsPdf(db, o)}>↓ PDF</Button></td></tr>}
        {invs.map((iv, k) => <tr key={iv.id}><td className="mono" style={faint}>{String(files.length + (vs.length ? 1 : 0) + k + 1).padStart(2, '0')}</td><td className="font-medium">Invoice {iv.no}</td><td style={soft}>material BSC sends, as Desai confirmed it · <b style={{ color: 'var(--ink)' }}>{fmtMoney(iv.amount)}</b> · comes off what we pay</td><td className="num"><Button size="sm" onClick={() => setView(iv)}>View</Button></td></tr>)}
        {!invs.length && <tr><td></td><td colSpan={3} style={faint}>{supplyLinesOf(o).length ? 'Invoice for what BSC sends · made when the PO is raised, from the BOM Desai confirmed' : 'No invoice · nothing on this PO is sent by BSC'}</td></tr>}
      </tbody></table>
    {view && <InvoicePreview o={o} inv={view} onClose={() => setView(null)} />}
    {poPdf && <PdfPreview name={poPdfName(o)} make={() => poPdfOf(db, o)} onClose={() => setPoPdf(false)} />}
  </div>;
}
/* what is paid on the PO and what is left, for everyone who opens it: the total is fixed at the start (the PO value,
   less BSC's own invoice for what it sent), each payment comes off it, in parts */
export function PayStrip({ o }: { o: ProductionOrder }) {
  const l = poLedgerOf(o); const pays = o.poPayments ?? []; if (!o.poNo) return null;
  const pct = l.payable > 0 ? Math.max(0, Math.min(100, Math.round(l.paid * 100 / l.payable))) : 0;
  return <div className="pay-strip">
    <div className="pay-strip-nums">
      <div><span>PO total</span><b>{fmtMoney(Math.round(l.poTotal))}</b><i>FOB value incl. GST</i></div>
      {l.bscInvoiced > 0 && <div><span>Less BSC's invoice</span><b>− {fmtMoney(Math.round(l.bscInvoiced))}</b><i>cloth and trims BSC sent</i></div>}
      {l.shortValue > 0 && <div><span>Less short received</span><b>− {fmtMoney(l.shortValue)}</b><i>{l.shortPcs} pcs not received</i></div>}
      <div><span>To pay in all</span><b>{fmtMoney(Math.max(0, Math.round(l.payable)))}</b>{l.payable < 0 && <i style={{ color: 'var(--warn)' }}>BSC's invoice is {fmtMoney(Math.round(-l.payable))} more than the PO</i>}</div>
      <div className="paid"><span>Paid</span><b>{fmtMoney(Math.round(l.paid))}</b><i>{pays.length ? `${pays.length} payment${pays.length === 1 ? '' : 's'}` : 'nothing yet'}</i></div>
      <div className={`left${l.remaining <= 0 ? ' done' : ''}`}><span>Remaining</span><b>{fmtMoney(Math.max(0, Math.round(l.remaining)))}</b><i>{l.remaining <= 0 ? 'paid in full' : `${100 - pct}% left`}</i></div>
    </div>
    <div className="pay-bar" title={`${pct}% paid`}><span style={{ width: `${pct}%` }} /></div>
    {pays.length > 0 && <div className="pay-list">{pays.map(p => <span key={p.id}>{fmtDate(p.on)} · <b>{fmtMoney(p.amount)}</b>{p.note ? ` · ${p.note}` : ''}{p.ref ? ` · ${p.ref}` : ''}</span>)}</div>}
  </div>;
}
export function PoSection({ o }: { o: ProductionOrder }) {
  const { db, sendPoMail } = useApp();
  const pm = o.poMail; const p = packOf(o); const rp = o.costQuery?.replies.find(r => r.vendorId === o.vendorId);
  if (!o.poNo) return <Section title="PO" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>No PO yet.</div></Section>;
  return <Section title={`${o.poNo} · ${db.vendors.find(v => v.id === o.vendorId)?.name ?? ''}`} collapsible={false} right={<span className="flex gap-2 items-center"><Pill tone="good">raised {fmtDate(o.poDate)}</Pill><Pill tone={pm?.sentOn ? 'good' : 'warn'}>{pm?.sentOn ? `mailed ${fmtDate(pm.sentOn)}` : 'mail to send'}</Pill>{o.poAckOn && <Pill tone="good">acknowledged {fmtDate(o.poAckOn)}</Pill>}</span>}>
    {(() => { const fv = db.vendors.find(v => v.id === p.fabric.vendorId)?.name ?? '—'; const t = o.poDoc ? poTotalsOf(o.poDoc) : null;
      return <table className="t compact sum-t kv"><tbody>
        <tr><th>Factory</th><td><VendorLink id={o.vendorId} /></td><td style={soft}>{rp ? `${rp.leadDays} days quoted` : ''}</td></tr>
        <tr><th>Order</th><td><b>{t ? `${t.pcs} pcs · ${fmtMoney(Math.round(t.total))}` : `${o.orderQty} × ${fmtMoney(o.finalFob ?? o.targetCost)}`}</b></td><td style={soft}>{o.poDoc ? `${o.poDoc.lines.length} colour${o.poDoc.lines.length === 1 ? '' : 's'} · incl. ${o.poDoc.gstPct}% GST · ${o.poDoc.paymentTerms}` : fmtMoney((o.finalFob ?? o.targetCost) * o.orderQty)}</td></tr>
        {(() => { const g = poGroupOf(db, o); return g.many ? <tr><th>On this PO</th><td><b>{g.rows.length} styles</b> · {g.pcs.toLocaleString('en-IN')} pcs</td><td style={soft}>{g.rows.filter(x => x.o.id !== o.id).map(x => x.o.styleName).join(' · ')}</td></tr> : null; })()}
        <tr><th>Deliver to</th><td><b>{pm?.deliveryLocation ?? '—'}</b> by {fmtDate(o.targetInhouse)}</td><td style={soft}>{pm?.needsHemming ? 'semi-stitched · hemming in-house, so Vasai' : 'nothing to hem, so the 3PL warehouse'}</td></tr>
        <tr><th>Cloth</th><td>{FABRIC_BY_LABEL[pm?.fabricBy ?? 'factory']}</td><td style={soft}>{pm?.fabricBy === 'factory' ? 'the factory gives its fabric PO and receipt details on the TNA' : `${fv}${p.fabric.vendorFabricCode ? ` · ${p.fabric.vendorFabricCode}` : ''}${p.fabric.blockedMetres != null ? ` · ${p.fabric.blockedMetres} m blocked` : ''}${pm?.fabricBy === 'bsc' ? ' · sourcing ships it' : ' · the factory raises its own PO'}`}</td></tr>
        <tr><th>Mailed</th><td>{pm?.sentOn ? <span style={{ color: 'var(--good)' }}>✓ {fmtDate(pm.sentOn)}</span> : <span style={{ color: 'var(--warn)' }}>not sent yet</span>}</td><td style={soft}>{(pm?.to ?? []).join(', ')}{pm?.cc?.length ? ` · cc ${pm.cc.join(', ')}` : ''}</td></tr>
        <tr><th>Acknowledged</th><td>{o.poAckOn ? <span style={{ color: 'var(--good)' }}>✓ {fmtDate(o.poAckOn)}</span> : <span style={faint}>waiting on the factory</span>}</td><td style={soft}>{o.poAckBy ?? ''}</td></tr>
      </tbody></table>; })()}
    <PayStrip o={o} />
    <PoDocView o={o} />
    <PoAttachments o={o} />
    <div className="pt-2"><MailCard label="PO · with the TNA form" mail={{ ...poMailOf(db, o), ...(pm?.mail ?? {}), to: pm?.to?.length ? pm.to : poMailOf(db, o).to, cc: pm?.cc?.length ? pm.cc : poMailOf(db, o).cc }} sentOn={pm?.sentOn ?? null} onSend={pm && !pm.sentOn ? m => sendPoMail(o.id, { to: m.to, cc: m.cc, subject: m.subject, body: m.body }) : undefined} sendLabel="Send the PO to the factory ✉" /></div>
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

/* ── 4b. the factory buys the cloth itself: the vendor details BSC gave, and what the factory gives back ── */
export function FactoryClothSection({ o, merchant }: { o: ProductionOrder; merchant: boolean }) {
  const { db, logFactoryCloth } = useApp();
  const p = packOf(o); const fc = o.factoryCloth; const by = o.poMail?.fabricBy ?? 'factory';
  const [vendor, setVendor] = useState(fc?.vendor ?? (by === 'bsc-vendor' ? (db.vendors.find(v => v.id === p.fabric.vendorId)?.name ?? '') : ''));
  const [poNo, setPoNo] = useState(fc?.poNo ?? ''); const [poOn, setPoOn] = useState(dateInput(fc?.poOn)); const [metres, setMetres] = useState(fc?.metres != null ? String(fc.metres) : String(o.fabricMetres ?? ''));
  const [recOn, setRecOn] = useState(dateInput(fc?.receivedOn)); const [recM, setRecM] = useState(fc?.metresReceived != null ? String(fc.metresReceived) : '');
  const [note, setNote] = useState(fc?.note ?? '');
  const poDone = !!fc?.poOn; const recDone = !!fc?.receivedOn;
  return <Section title={by === 'bsc-vendor' ? "Cloth · the factory buys it from BSC's vendor" : "Cloth · the factory's own"} collapsible={false} right={<Pill tone={recDone ? 'good' : poDone ? 'info' : 'warn'}>{recDone ? `received ${fmtDate(fc!.receivedOn)} · ${fc!.metresReceived ?? '—'} m` : poDone ? `fabric PO ${fc!.poNo ?? ''} · ${fmtDate(fc!.poOn)} · cloth to come` : 'factory to raise its fabric PO'}</Pill>}>
    {by === 'bsc-vendor' && <div className="mb-2 p-2.5 rounded-[8px]" style={{ background: 'var(--surface-2)' }}>
      <div className="cap">Vendor details sent with the PO</div>
      <div className="text-[12.5px]"><b>{db.vendors.find(v => v.id === p.fabric.vendorId)?.name ?? '—'}</b>{p.fabric.vendorFabricCode ? <> · <span className="mono">{p.fabric.vendorFabricCode}</span></> : null}{p.fabric.blockedMetres != null ? ` · ${p.fabric.blockedMetres} m blocked for this style` : ''}{p.fabric.readiness === 'available' ? ' · available at the vendor' : p.fabric.readyOn ? ` · ready ${fmtDate(p.fabric.readyOn)}` : ''}</div>
      <div className="text-[11.5px] pt-0.5" style={faint}>No cloth PO in PLM: the factory raises its own on the vendor and gives the details back.</div>
    </div>}
    <div className="grid gap-x-4 gap-y-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      <Field label="Bought from">{merchant && !recDone ? <Input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="mill / vendor" /> : <div className="text-[12.5px] py-1">{fc?.vendor ?? '—'}</div>}</Field>
      <Field label="Factory's fabric PO">{merchant && !recDone ? <Input value={poNo} onChange={e => setPoNo(e.target.value)} placeholder="FPO-712" /> : <div className="text-[12.5px] py-1 mono">{fc?.poNo ?? '—'}</div>}</Field>
      <Field label="PO date">{merchant && !recDone ? <Input type="date" value={poOn} onChange={e => setPoOn(e.target.value)} /> : <div className="text-[12.5px] py-1">{fmtDate(fc?.poOn)}</div>}</Field>
      <Field label="Metres ordered">{merchant && !recDone ? <Input type="number" value={metres} onChange={e => setMetres(e.target.value)} /> : <div className="text-[12.5px] py-1">{fc?.metres ?? '—'}</div>}</Field>
    </div>
    {merchant && !poDone && <div className="pt-1 pb-2"><Button size="sm" variant="primary" disabled={!poOn} onClick={() => logFactoryCloth(o.id, { vendor: vendor.trim() || null, poNo: poNo.trim() || null, poOn: fromDateInput(poOn), metres: metres === '' ? null : Number(metres) })}>Fabric PO raised</Button></div>}
    <div className="grid gap-x-4 gap-y-1 pt-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      <Field label="Cloth received on">{merchant && !recDone ? <Input type="date" value={recOn} onChange={e => setRecOn(e.target.value)} /> : <div className="text-[12.5px] py-1">{fmtDate(fc?.receivedOn)}</div>}</Field>
      <Field label="Metres received">{merchant && !recDone ? <Input type="number" value={recM} onChange={e => setRecM(e.target.value)} /> : <div className="text-[12.5px] py-1">{fc?.metresReceived ?? '—'}</div>}</Field>
      <div style={{ gridColumn: 'span 2' }}><Field label="Note">{merchant && !recDone ? <Input value={note} onChange={e => setNote(e.target.value)} placeholder="lot, shade, anything short" /> : <div className="text-[12.5px] py-1">{fc?.note ?? '—'}</div>}</Field></div>
    </div>
    {merchant && poDone && !recDone && <div className="pt-1"><Button size="sm" variant="primary" disabled={!recOn} onClick={() => logFactoryCloth(o.id, { vendor: vendor.trim() || null, poNo: poNo.trim() || null, poOn: fromDateInput(poOn) ?? fc?.poOn ?? null, metres: metres === '' ? null : Number(metres), receivedOn: fromDateInput(recOn), metresReceived: recM === '' ? null : Number(recM), note: note.trim() || null })}>Cloth received</Button></div>}
    {!merchant && !recDone && <div className="pt-1"><ActsBy role="merchandiser" does={poDone ? 'logs the cloth received at the factory' : "gives the factory's fabric PO details"} /></div>}
    {recDone && fc?.metres != null && fc.metresReceived != null && fc.metresReceived < fc.metres && <div className="text-[12px] pt-2" style={{ color: 'var(--risk)' }}>{fc.metres - fc.metresReceived} m less than ordered. If it is less than the PO needs, ask category for a new cut ratio from the cloth and trims panel.</div>}
  </Section>;
}

/* ── 5. QC at five points on the TNA: a stepper of the five, and one "check now" card for the point that is open ── */
const QC_CHECKLIST: Record<QcPoint, string[]> = {
  pps: ['Measurements against the spec sheet', 'Construction and stitching against the tech pack', 'Fabric, colour and hand against the swatch', 'Trims, labels and tags against the trim card'],
  'size-set': ['One of every size measured against the spec sheet', 'Grading between sizes', 'Fit on the form'],
  initial: ['First bundles off the line against the PP sample', 'Seam allowance, stitch density, thread', 'Fusing and pressing'],
  midline: ['Finishing against the PP sample', 'Buttonholes, buttons, labels in place', 'Pressing and folding method'],
  final: ['AQL sample of the finished lot', 'Packing, tags, barcodes and cartons', 'Quantity against the PO by size'],
};
export function QcChecksSection({ o, qc, compact }: { o: ProductionOrder; qc: boolean; compact?: boolean }) {
  const { recordQcCheck } = useApp();
  const pts = qcPointsOf(o); const [remarks, setRemarks] = useState('');
  const [ticks, setTicks] = useState<Record<string, boolean>>({}); const [aes, setAes] = useState('');
  const open = pts.find(x => x.state === 'due' || x.state === 'failed') ?? null;
  const passed = pts.filter(x => x.state === 'passed').length; const live = pts.filter(x => x.state !== 'na').length;
  if (!o.poNo) return <Section title="QC" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>PP sample, size set, then three line inspections.</div></Section>;
  const list = open ? QC_CHECKLIST[open.key as QcPoint] : []; const allTicked = list.every(x => ticks[x]);
  return <Section title="QC" collapsible={false} ownerRole="qc" right={<Pill tone={open?.state === 'failed' ? 'risk' : open ? 'warn' : passed === live ? 'good' : 'neutral'}>{open?.state === 'failed' ? `${open.label} failed · resubmission awaited` : open ? `${open.label} to check now` : `${passed} of ${live} passed`}</Pill>}>
    {/* the five points as a stepper: done, open, later */}
    <ol className="qc-steps">{pts.map((x, i) => { const hist = (o.qcChecks ?? []).filter(c => c.point === x.key); const last = hist[hist.length - 1] ?? null;
      return <li key={x.key} className={`qc-step ${x.state}`}>
        <span className="qc-n">{x.state === 'passed' ? '✓' : x.state === 'failed' ? '✗' : i + 1}</span>
        <div className="qc-body">
          <div className="qc-label">{x.label}{x.state === 'due' && <span className="pill warn ml-1" style={{ fontSize: 10 }}>now{x.sinceDays ? ` · ${x.sinceDays}d` : ''}</span>}{x.state === 'failed' && <span className="pill risk ml-1" style={{ fontSize: 10 }}>failed</span>}</div>
          <div className="qc-sub">{x.state === 'passed' ? `passed ${fmtDate(last?.on ?? x.due)}${last?.by ? ` · ${last.by}` : ''}` : x.state === 'failed' ? `failed ${fmtDate(last!.on)} · ${last!.by}` : x.state === 'due' ? `since ${fmtDate(x.due)}` : x.state === 'na' ? 'not on this plan' : x.hint}</div>
          {!compact && hist.filter(c => c.remarks || c.aesthetic).map((c, k) => <div key={k} className="qc-remark" style={{ color: c.result === 'fail' ? 'var(--risk)' : 'var(--ink-soft)' }}>{c.result === 'fail' ? '✗' : '✓'} {c.remarks}{c.aesthetic ? <span style={{ fontStyle: 'italic' }}> · {c.aesthetic}</span> : null}</div>)}
        </div>
      </li>; })}</ol>
    {/* the one card QC works in */}
    {open && (qc ? <div className="qc-now">
      <div className="flex items-center gap-2 flex-wrap"><span className="pill role-qc">QC</span><b>{open.label}</b><span className="text-[12px]" style={soft}>· {open.hint}</span>{open.state === 'failed' && <span className="text-[12px] ml-auto" style={{ color: 'var(--risk)' }}>second check after the factory's correction</span>}</div>
      <div className="qc-list">{list.map(item => <label key={item} className={`qc-item${ticks[item] ? ' on' : ''}`}><input type="checkbox" checked={!!ticks[item]} onChange={e => setTicks(t => ({ ...t, [item]: e.target.checked }))} /><span>{item}</span></label>)}</div>
      <Field label="Technical remarks · what was measured, what was found"><Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder={open.state === 'failed' ? 'what the factory corrected, what is still off' : 'e.g. chest within tolerance; placket 2.5 cm against 3 cm on the tech pack'} /></Field>
      {(open.key === 'pps' || open.key === 'size-set') && <Field label="Aesthetic remarks · look, hand, finish"><Input value={aes} onChange={e => setAes(e.target.value)} placeholder="e.g. collar roll clean; colour a touch brighter than the swatch" /></Field>}
      <div className="flex gap-2 items-center flex-wrap pt-2">
        <Button variant="primary" disabled={!allTicked} onClick={() => { recordQcCheck(o.id, open.key as QcPoint, 'pass', remarks.trim(), aes.trim() || null); setRemarks(''); setAes(''); setTicks({}); }}>Pass {open.label.toLowerCase()}</Button>
        <Button variant="danger" disabled={!remarks.trim()} onClick={() => { recordQcCheck(o.id, open.key as QcPoint, 'fail', remarks.trim(), aes.trim() || null); setRemarks(''); setAes(''); setTicks({}); }}>Fail · send remarks</Button>
        <span className="text-[11.5px]" style={faint}>{!allTicked ? 'tick every line to pass · a fail needs remarks' : 'a pass logs the TNA block; a fail goes to the factory and the merchandiser'}</span>
      </div>
    </div> : <div className="pt-2"><ActsBy role="qc" does={open.state === 'failed' ? `checks the ${open.label.toLowerCase()} again once the factory resubmits` : `passes or fails the ${open.label.toLowerCase()}; the merchandiser sees the remarks`} /></div>)}
    {!open && passed < live && <div className="text-[12.5px] pt-2" style={faint}>Nothing for QC right now; the next point opens when the factory logs the step before it.</div>}
  </Section>;
}
export const QC_POINT_LABEL = Object.fromEntries(QC_POINTS.map(p => [p.key, p.label])) as Record<QcPoint, string>;

/* ── 6. after the dispatch actual: the documents against the PO, to the warehouse ──
   25 Nov 2026: the merchandiser adds the invoice, the packing list and the e-way bill against the PO number.
   A PO can go in part shipments; each dispatch has its own set and its own mail to Prince. */
const FileField = ({ label, value, set, ph }: { label: string; value: string; set: (v: string) => void; ph: string }) =>
  <Field label={label}><div className="flex gap-1.5 items-center"><label className="file-btn"><input type="file" accept=".pdf,.jpg,.png" onChange={e => { const f = e.target.files?.[0]; if (f) set(f.name); }} />Attach</label><Input value={value} onChange={e => set(e.target.value)} placeholder={ph} style={{ flex: 1 }} /></div></Field>;
function DispatchDocsView({ d, n, of }: { d: NonNullable<ProductionOrder['invoice']>; n: number; of: number }) {
  return <div className="disp-docs">
    <div className="flex items-center gap-2 flex-wrap pb-1"><b className="text-[13px]">{of > 1 ? `Part shipment ${n}` : 'Dispatch'}</b><span className="mono text-[12px]" style={faint}>against {d.poNo ?? '—'}</span><span className="text-[12px]" style={faint}>· {packedPcsOf(d)} pcs · {d.by} · {fmtDate(d.uploadedOn)}</span>
      <span className="ml-auto"><Pill tone={d.mailedOn ? 'good' : 'warn'}>{d.mailedOn ? `mailed to Prince ${fmtDate(d.mailedOn)}` : 'to send to Prince'}</Pill></span></div>
    <KV k="Invoice" v={<span className="mono">{d.no}</span>} note={`${fmtMoney(d.amount)}${d.invoiceOn ? ` · dated ${fmtDate(d.invoiceOn)}` : ''} · ${d.file ?? 'uploaded'}`} />
    <KV k="Packing list" v={<span className="att-chip"><span aria-hidden>📎</span>{packingFileOf(d)}</span>} note={`${packedPcsOf(d)} pcs on it`} />
    <KV k="E-way bill" v={d.eway ? <span className="mono">{d.eway.no}</span> : <span style={faint}>—</span>} note={d.eway ? [d.eway.on ? `dated ${fmtDate(d.eway.on)}` : null, d.eway.validTill ? `valid till ${fmtDate(d.eway.validTill)}` : null, d.eway.file].filter(Boolean).join(' · ') : 'not on older records'} />
  </div>;
}
export function InvoiceSection({ o, merchant }: { o: ProductionOrder; merchant: boolean }) {
  const { db, uploadInvoice, mailInvoice } = useApp();
  const inv = o.invoice; const disp = o.milestones.find(m => m.key === 'Dispatch')?.actual ?? null;
  const all = dispatchesOf(o); const ordered = o.cutQty ?? o.orderQty; const sent = sentPcsOf(o); const left = Math.max(0, ordered - sent);
  const rate = o.finalFob ?? o.targetCost;
  const [adding, setAdding] = useState(false);
  const [no, setNo] = useState(''); const [invOn, setInvOn] = useState(''); const [file, setFile] = useState(''); const [plFile, setPlFile] = useState('');
  const [plPcs, setPlPcs] = useState(String(left || ordered)); const [amt, setAmt] = useState(String((left || ordered) * rate));
  const [ew, setEw] = useState(''); const [ewOn, setEwOn] = useState(''); const [ewTill, setEwTill] = useState(''); const [ewFile, setEwFile] = useState('');
  if (!o.poNo) return <Section title="Dispatch · documents" collapsible={false}><div className="text-[12.5px] py-1" style={faint}>After the dispatch actual on the TNA.</div></Section>;
  const plTotal = Number(plPcs) || 0; const part = all.length + (inv && !inv.mailedOn ? 0 : 1);
  const ready = !!no.trim() && !!plTotal && !!plFile.trim() && !!ew.trim() && !!ewFile.trim();
  const canAddPart = merchant && !!inv?.mailedOn && left > 0 && o.status !== 'Closed';
  const showForm = merchant && disp && (!inv || adding);
  const reset = () => { setNo(''); setInvOn(''); setFile(''); setPlFile(''); setEw(''); setEwOn(''); setEwTill(''); setEwFile(''); setAdding(false); };
  return <Section title="Dispatched · documents against the PO" collapsible={false} right={<Pill tone={inv?.mailedOn && left === 0 ? 'good' : inv || disp ? 'warn' : 'neutral'}>{!inv ? (disp ? `dispatched ${fmtDate(disp)} · documents to add` : 'not dispatched yet') : !inv.mailedOn ? 'documents added · to send to Prince' : left > 0 ? `${sent} of ${ordered} pcs sent · ${all.length} shipment${all.length === 1 ? '' : 's'}` : `all ${sent} pcs sent${all.length > 1 ? ` in ${all.length} shipments` : ''}`}</Pill>}>
    {all.map((d, i) => <DispatchDocsView key={i} d={d} n={i + 1} of={all.length} />)}
    {inv && !inv.mailedOn && <div className="pt-2"><MailCard label="Invoice, packing list and e-way bill · to the warehouse" mail={{ ...invoiceMailOf(db, o), ...(inv.mail ?? {}), to: inv.mailedTo.length ? inv.mailedTo : (inv.mail?.to ?? invoiceMailOf(db, o).to) }} sentOn={inv.mailedOn} sendLabel="Send to Prince ✉" onSend={merchant ? m => mailInvoice(o.id, { to: m.to, cc: m.cc, subject: m.subject, body: m.body }) : undefined} /></div>}
    {inv && !inv.mailedOn && !merchant && <div className="pt-2"><ActsBy role="merchandiser" does="sends the documents to Prince" /></div>}
    {inv?.mailedOn && left > 0 && !adding && <div className="text-[12.5px] pt-2" style={soft}>{left} pcs not dispatched yet. When the factory sends the balance, the merchandiser adds it as the next part shipment.{canAddPart && <> <Button size="sm" onClick={() => { setPlPcs(String(left)); setAmt(String(left * rate)); setAdding(true); }}>Add part shipment {part}</Button></>}</div>}
    {!inv && !disp && <div className="text-[12.5px] py-1" style={soft}>When the factory dispatches, the merchandiser adds the invoice, the packing list and the e-way bill against the PO here, and PLM mails them to Prince. A PO can go in part shipments.</div>}
    {!inv && disp && !merchant && <ActsBy role="merchandiser" does="adds the invoice, packing list and e-way bill against the PO; PLM mails them to Prince" />}
    {showForm && <div className={all.length ? 'pt-3' : ''}>
      <div className="flex items-center gap-2 flex-wrap pb-1 text-[12.5px]"><b>{part > 1 ? `Part shipment ${part}` : 'Dispatch'}</b><span style={faint}>against</span><span className="pill mono">{o.poNo}</span>{o.poGroup && <span style={faint}>· the same PO number covers the other requirements on it</span>}</div>
      <div className="cap pt-1">Invoice</div>
      <div className="grid gap-2 py-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Field label="Invoice no."><Input value={no} onChange={e => setNo(e.target.value)} placeholder="INV-2611" /></Field>
        <Field label="Invoice date"><Input type="date" value={invOn} onChange={e => setInvOn(e.target.value)} /></Field>
        <Field label="Amount (₹)"><Input type="number" value={amt} onChange={e => setAmt(e.target.value)} /></Field>
        <FileField label="Invoice file" value={file} set={setFile} ph="invoice.pdf" />
      </div>
      <div className="cap pt-1">Packing list</div>
      <div className="grid gap-2 py-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <FileField label="Packing list · PDF" value={plFile} set={setPlFile} ph="packing-list.pdf" />
        <Field label="Pieces in this dispatch" hint={part > 1 ? `${left} pcs still to come on the PO` : `${ordered} pcs on the PO`}><Input type="number" min={0} value={plPcs} onChange={e => setPlPcs(e.target.value)} /></Field>
      </div>
      <div className="cap pt-1">E-way bill</div>
      <div className="grid gap-2 py-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Field label="E-way bill no."><Input value={ew} onChange={e => setEw(e.target.value)} placeholder="12-digit number" /></Field>
        <Field label="Generated on"><Input type="date" value={ewOn} onChange={e => setEwOn(e.target.value)} /></Field>
        <Field label="Valid till"><Input type="date" value={ewTill} onChange={e => setEwTill(e.target.value)} /></Field>
        <FileField label="E-way bill file" value={ewFile} set={setEwFile} ph="eway-bill.pdf" />
      </div>
      <div className="pt-1 flex gap-2 items-center"><Button variant="primary" disabled={!ready} onClick={() => { uploadInvoice(o.id, { no: no.trim(), amount: Number(amt) || 0, file: file.trim() || null, invoiceOn: fromDateInput(invOn), eway: { no: ew.trim(), on: fromDateInput(ewOn), validTill: fromDateInput(ewTill), file: ewFile.trim() }, packingList: [], packingFile: plFile.trim(), packedPcs: plTotal }); reset(); }}>Add against {o.poNo}</Button>
        {adding && <Button variant="ghost" onClick={reset}>Cancel</Button>}
        {!ready && <span className="text-[12px]" style={faint}>invoice no., packing list and e-way bill are needed</span>}</div>
    </div>}
  </Section>;
}

/* ── 7. received on Enigma, against the packing list ── */
/* Prince counts the goods in (17 Nov 2026): what was ordered and what he counted, size by size, with the packing list PDF beside it.
   A short or damaged count is flagged, and what is not received comes off the payable. */
export function WarehouseCount({ o }: { o: ProductionOrder }) {
  const { receiveLot, setConsignment } = useApp();
  const inv = o.invoice; const rc = receiptOf(o); const tpl = countedBy3plOf(o); const [rep, setRep] = useState('');
  const ordered = orderedBySizeOf(o);
  const got: Record<string, number> = {}; rc.lots.forEach(l => Object.entries(l.bySize ?? {}).forEach(([sz, n]) => { got[sz] = (got[sz] ?? 0) + n; }));
  const [cnt, setCnt] = useState<Record<string, string>>({}); const [rej, setRej] = useState(''); const [note, setNote] = useState(''); const [more, setMore] = useState(''); const [final, setFinal] = useState(false);
  if (!inv) return null;
  /* counted against what was ordered, size by size; the packing list is the factory's PDF, with its total */
  const pl = Object.entries(ordered).map(([size, qty]) => ({ size, qty })); const sent = sentPcsOf(o); const orderedPcs = pl.reduce((a, x) => a + x.qty, 0);
  const left = (sz: string, q: number) => Math.max(0, q - (got[sz] ?? 0));
  const total = pl.reduce((a, x) => a + (Number(cnt[x.size]) || 0), 0);
  const stillShort = pl.reduce((a, x) => a + Math.max(0, left(x.size, x.qty) - (Number(cnt[x.size]) || 0)), 0);
  const done = rc.lots.length > 0 && (o.status === 'Closed' || rc.received >= sent);
  if (done) return null;
  /* the 3PL's consignment report, read into the count: what it says it received, size by size (prototype: the packing list's pieces, spread on the PO's sizes) */
  const readReport = (file: string) => { setRep(file); let leftPcs = Math.max(0, sent - rc.received); const out: Record<string, string> = {};
    pl.forEach(x => { const n = Math.min(left(x.size, x.qty), leftPcs); out[x.size] = String(n); leftPcs -= n; }); setCnt(out); setConsignment(o.id, file); };
  return <Section title={tpl ? (rc.lots.length ? 'Balance · 3PL consignment report' : 'Received at the 3PL · consignment report') : rc.lots.length ? 'Count the balance in' : 'Count the goods in'} collapsible={false} right={tpl ? <span className="pill role-production">Merchandiser</span> : <span className="pill role-warehouse">Prince</span>}>
    {tpl && <div className="cons-up">
      <div><b>Goods went to the 3PL warehouse.</b> <span style={soft}>Upload the 3PL's consignment report; the count below fills from it. Nobody counts by hand.</span></div>
      <div className="flex gap-2 items-center flex-wrap pt-2"><label className="file-btn"><input type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={e => { const f = e.target.files?.[0]; if (f) readReport(f.name); }} />{rep ? 'Upload another report' : 'Upload the consignment report'}</label>
        {rep ? <span className="att-chip"><span aria-hidden>📎</span>{rep}</span> : <button type="button" className="vlink text-[12px]" onClick={() => readReport(`3pl-consignment-${(o.poNo ?? o.id).replace(/[^A-Za-z0-9]+/g, '-')}.xlsx`)}>use a sample report</button>}
        {rep && <span className="text-[12px]" style={{ color: 'var(--good)' }}>✓ read · {total} pcs across {pl.filter(x => Number(cnt[x.size]) > 0).length} sizes</span>}</div>
    </div>}
    <div className="flex items-center gap-2 flex-wrap pb-2 text-[12.5px]"><span style={faint}>Packing list</span><span className="att-chip"><span aria-hidden>📎</span>{packingFileOf(inv)}</span><span><b>{sent}</b> pcs sent{dispatchesOf(o).length > 1 ? ` in ${dispatchesOf(o).length} shipments` : ''} · <b>{orderedPcs}</b> ordered{sent < orderedPcs ? <span style={{ color: 'var(--warn)' }}> · {orderedPcs - sent} not dispatched yet (part shipment)</span> : null}</span><span style={faint}>· invoice <span className="mono">{inv.no}</span></span></div>
    <div style={{ overflowX: 'auto' }}><table className="t compact inv-lines">
      <thead><tr><th>Size</th><th className="num">Ordered on the PO</th>{rc.lots.length > 0 && <th className="num">Counted before</th>}<th className="num">{tpl ? 'On the 3PL report' : 'Counted in now'}</th><th className="num">Short</th></tr></thead>
      <tbody>{pl.map(x => { const n = Number(cnt[x.size]) || 0; const sh = left(x.size, x.qty) - n; return <tr key={x.size}><td className="font-medium">{x.size}</td><td className="num">{x.qty}</td>{rc.lots.length > 0 && <td className="num">{got[x.size] ?? 0}</td>}
        <td className="num"><Input type="number" min={0} value={cnt[x.size] ?? ''} onChange={e => setCnt(c => ({ ...c, [x.size]: e.target.value }))} placeholder={String(left(x.size, x.qty))} style={{ width: 84, textAlign: 'right' }} /></td>
        <td className="num" style={{ color: cnt[x.size] == null || cnt[x.size] === '' ? 'var(--ink-faint)' : sh > 0 ? 'var(--risk)' : 'var(--good)' }}>{cnt[x.size] == null || cnt[x.size] === '' ? '—' : sh > 0 ? sh : sh < 0 ? `+${-sh}` : '✓'}</td></tr>; })}
        <tr><td className="font-semibold">Total</td><td className="num font-semibold">{orderedPcs}</td>{rc.lots.length > 0 && <td className="num font-semibold">{rc.received}</td>}<td className="num font-semibold">{total}</td><td className="num font-semibold" style={{ color: stillShort ? 'var(--risk)' : 'var(--good)' }}>{total ? (stillShort || '✓') : '—'}</td></tr></tbody>
    </table></div>
    {!tpl && <div className="flex gap-2 pt-2"><Button size="sm" variant="ghost" onClick={() => setCnt(Object.fromEntries(pl.map(x => [x.size, String(left(x.size, x.qty))])))}>All as ordered</Button></div>}
    <div className="grid gap-x-4 gap-y-1 pt-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
      <Field label="Damaged or rejected (pcs)" hint="of what was counted in"><Input type="number" min={0} value={rej} onChange={e => setRej(e.target.value)} /></Field>
      {stillShort > 0 && !final && <Field label="Balance expected on"><Input type="date" value={more} onChange={e => setMore(e.target.value)} /></Field>}
      <div style={{ gridColumn: 'span 2' }}><Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="2 cartons short, one carton wet, sizes mixed…" /></Field></div>
    </div>
    {stillShort > 0 && total > 0 && <label className="flex items-center gap-2 text-[12.5px] pt-2" style={{ color: 'var(--risk)' }}><input type="checkbox" checked={final} onChange={e => setFinal(e.target.checked)} />Not all received: {stillShort} pcs short. No more is coming; close it short.</label>}
    {stillShort > 0 && total > 0 && <div className="text-[12px] pt-1" style={soft}>What is not received comes off what BSC pays the factory.</div>}
    <div className="pt-3"><Button variant="primary" disabled={!total || (tpl && !rep)} onClick={() => { const rj = Number(rej) || 0; receiveLot(o.id, { qty: total - rj, rejected: rj, note: [tpl && rep ? `from the 3PL consignment report · ${rep}` : null, note.trim() || (stillShort ? `${stillShort} pcs short against the PO` : 'all as ordered')].filter(Boolean).join(' · '), balanceExpectedOn: stillShort > 0 && !final ? fromDateInput(more) : null, cutQty: sent, closeShort: final, bySize: Object.fromEntries(pl.map(x => [x.size, Number(cnt[x.size]) || 0])) }); setCnt({}); setRej(''); setNote(''); setFinal(false); setRep(''); }}>{stillShort > 0 ? `Record ${total} pcs · flag ${stillShort} short` : `Received · all ${total} pcs`}</Button>{tpl && !rep && <span className="text-[12px] pl-2" style={faint}>upload the report first</span>}</div>
  </Section>;
}
export function ReceivedSection({ o }: { o: ProductionOrder }) {
  const rc = receiptOf(o); const inv = o.invoice;
  const got: Record<string, number> = {}; rc.lots.forEach(l => Object.entries(l.bySize ?? {}).forEach(([sz, n]) => { got[sz] = (got[sz] ?? 0) + n; }));
  const tracked = rc.lots.length > 0 && rc.lots.every(l => !!l.bySize);
  const sentPcs = inv ? sentPcsOf(o) : null; const ord = Object.entries(orderedBySizeOf(o)).map(([size, qty]) => ({ size, qty })); const ordPcs = ord.reduce((a, x) => a + x.qty, 0);
  const all = sentPcs != null && rc.received >= sentPcs;
  return <>
    <Section title="Received · counted in" collapsible={false} right={<Pill tone={all ? 'good' : rc.received ? 'warn' : 'neutral'}>{all ? `all ${rc.received} pcs reached` : rc.received ? `${rc.received} of ${sentPcs ?? rc.base} in` : inv ? (countedBy3plOf(o) ? 'at the 3PL · consignment report to upload' : 'with Prince · not counted yet') : 'after the invoice'}</Pill>}>
      <div className="text-[12px] pb-2" style={faint}>Lands at <b style={{ color: 'var(--ink)' }}>{landsAtOf(o)}</b> · {countedBy3plOf(o) ? 'the merchandiser uploads the 3PL consignment report and the count fills from it' : 'Prince counts it in, size by size'}{o.consignment ? <> · <span className="att-chip"><span aria-hidden>📎</span>{o.consignment.file}</span></> : null}</div>
      {!inv && <div className="text-[12.5px] pb-2" style={soft}>Nothing to count until the invoice and packing list are in.</div>}
      {inv && <div className="flex items-center gap-2 flex-wrap pb-2 text-[12.5px]"><span style={faint}>Packing list</span><span className="att-chip"><span aria-hidden>📎</span>{packingFileOf(inv)}</span><span><b>{sentPcs}</b> pcs on it</span></div>}
      {inv && <div style={{ overflowX: 'auto' }}><table className="t compact">
        <thead><tr><th>Size</th><th className="num">Ordered on the PO</th><th className="num">Received</th><th className="num">Short</th></tr></thead>
        <tbody>{ord.map(x => { const g = tracked ? (got[x.size] ?? 0) : null; const short = g != null ? x.qty - g : null;
          return <tr key={x.size}><td>{x.size}</td><td className="num">{x.qty}</td><td className="num">{g != null ? g : '—'}</td><td className="num" style={{ color: short ? 'var(--risk)' : 'var(--good)' }}>{short == null ? '—' : short > 0 ? short : short < 0 ? `+${-short}` : '✓'}</td></tr>; })}
          <tr><td className="font-semibold">Total</td><td className="num font-semibold">{ordPcs}</td><td className="num font-semibold">{rc.received || '—'}</td><td className="num font-semibold" style={{ color: rc.received >= ordPcs ? 'var(--good)' : 'var(--risk)' }}>{rc.received ? (ordPcs - rc.received > 0 ? ordPcs - rc.received : '✓') : '—'}</td></tr>
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
  if (o.poDoc) return <Section title="Factory acknowledgement" collapsible={false} right={<Pill tone={o.poAckOn ? 'good' : 'warn'}>{o.poAckOn ? `acknowledged ${fmtDate(o.poAckOn)}` : 'not yet acknowledged by the factory'}</Pill>}>
    {!o.poAckOn && factory && <div className="pt-2"><Button size="sm" variant="primary" onClick={() => ackPo(o.id)}>We have the PO · acknowledge</Button></div>}
  </Section>;
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
  const { db, closeCogs, updateCosting } = useApp();
  const dc = directCostOf(o); const cg = rtwCogsOf(db, o); const rc = receiptOf(o);
  const [mult, setMult] = useState(String(o.costing.multiple));
  const { mrp, net, margin, delivered, closedOn } = cg; const cogs = dc.total; const pcs = dc.pcs;
  return <Section title="Direct COGS · MRP" collapsible={false} right={<Pill tone={closedOn ? 'good' : delivered ? 'warn' : 'neutral'}>{closedOn ? `closed ${fmtDate(closedOn)}` : delivered ? 'to close' : dc.final ? 'on the PO price · closes after delivery' : 'estimate · firms up on the PO'}</Pill>}>
    <div style={{ overflowX: 'auto' }}><table className="t compact">
      <thead><tr><th>Per piece</th><th className="num">₹</th><th>From</th></tr></thead>
      <tbody>{dc.lines.map(l => <tr key={l.key}><td>{l.label}{l.fixed && <span className="pill ml-2" style={{ fontSize: 10 }}>fixed</span>}</td><td className="num">{fmtMoney(Math.round(l.amount))}</td><td className="text-[11.5px]" style={soft}>{l.from}</td></tr>)}
        <tr><td className="font-semibold">Direct COGS per piece</td><td className="num font-semibold">{fmtMoney(Math.round(cogs))}</td><td className="text-[11.5px]" style={soft}>PO cost {fmtMoney(Math.round(cogs - dc.fixed))} + fixed {fmtMoney(Math.round(dc.fixed))}</td></tr>
      </tbody></table></div>
    <div className="mrp-box">
      <div><span>Direct COGS</span><b>{fmtMoney(Math.round(cogs))}</b></div><i>×</i>
      <div><span>Multiplier</span>{finance && !closedOn ? <span className="flex gap-1 items-center"><Input type="number" step="0.1" min={0} value={mult} onChange={e => setMult(e.target.value)} style={{ width: 70 }} />{Number(mult) !== o.costing.multiple && Number(mult) > 0 && <Button size="sm" onClick={() => updateCosting(o.id, { multiple: Number(mult) })}>Set</Button>}</span> : <b>{dc.multiple}</b>}</div><i>=</i>
      <div><span>MRP by the multiplier</span><b>{dc.mrpBy != null ? fmtMoney(dc.mrpBy) : '—'}</b><em>{dc.mrpRaw ? `${fmtMoney(Math.round(dc.mrpRaw))} rounded` : ''}</em></div>
      <div className={mrp != null && dc.mrpBy != null && mrp < dc.mrpBy ? 'warn' : ''}><span>MRP in Enigma</span><b>{mrp != null ? fmtMoney(mrp) : '—'}</b><em>{mrp != null && cogs ? `${(mrp / cogs).toFixed(1)}× the cost` : 'not added yet'}</em></div>
    </div>
    <KV k="Direct COGS for the PO" v={fmtMoney(Math.round(cogs * pcs))} note={`${pcs} pcs ${rc.received ? 'received' : 'ordered'}`} />
    <KV k="Net of discounts and GST" v={net != null ? fmtMoney(Math.round(net)) : '—'} note="what BSC keeps per piece" />
    <KV k="Margin on direct COGS" v={margin != null ? <b style={{ color: margin < 0.55 ? 'var(--risk)' : 'var(--good)' }}>{Math.round(margin * 100)}%</b> : '—'} note={net != null ? `${fmtMoney(Math.round(net - cogs))} per piece` : undefined} />
    <div className="text-[11.5px] pt-2" style={faint}>Direct COGS only: the PO's cost plus the fixed packaging, shipping and process costs. Indirect COGS is not in this phase.</div>
    {!closedOn && delivered && (finance ? <div className="pt-2"><Button size="sm" variant="primary" onClick={() => closeCogs(o.id)}>Close COGS</Button></div> : <ActsBy role={['design']} does="closes COGS once the goods are in" />)}
  </Section>;
}

/* ── every remark on the record in one place: QC's, the cut-ratio asks, sample rounds, target revisions ── */
export function RemarksLog({ o }: { o: ProductionOrder }) {
  const rows: { on: string; who: string; kind: string; text: string; tone: 'risk' | 'good' | 'warn' | 'neutral' }[] = [];
  (o.qcChecks ?? []).forEach(c => rows.push({ on: c.on, who: c.by, kind: `QC · ${QC_POINT_LABEL[c.point]}`, text: `${c.result === 'fail' ? 'Failed' : 'Passed'}${c.remarks ? ` · ${c.remarks}` : ''}${c.aesthetic ? ` · aesthetic: ${c.aesthetic}` : ''}`, tone: c.result === 'fail' ? 'risk' : 'good' }));
  (o.cutRatios ?? []).forEach(cr => { rows.push({ on: cr.askedOn, who: cr.by, kind: `Cut ratio ask${cr.trigger ? ` · ${cr.trigger.replace('-', ' ')}` : ''}`, text: cr.reason, tone: 'warn' }); if (cr.given) rows.push({ on: cr.given.on, who: cr.given.by, kind: 'Cut ratio given', text: `${cr.given.breakup.reduce((a, x) => a + x.qty, 0)} pcs on the new sizes`, tone: 'neutral' }); });
  (o.targetRevisions ?? []).forEach(rv => rows.push({ on: rv.on, who: rv.by, kind: rv.field === 'targetInhouse' ? 'Target in-house revised' : 'Target cost revised', text: `${rv.field === 'targetInhouse' ? `${fmtDate(String(rv.from))} → ${fmtDate(String(rv.to))}` : `${fmtMoney(Number(rv.from))} → ${fmtMoney(Number(rv.to))}`} · ${rv.why}`, tone: 'neutral' }));
  (o.costQuery?.replies ?? []).forEach(r => { if (r.note) rows.push({ on: r.repliedOn, who: 'Factory', kind: 'Counter-sourcing reply', text: r.note, tone: 'neutral' }); });
  if (o.factoryCloth?.note) rows.push({ on: o.factoryCloth.receivedOn ?? o.factoryCloth.poOn ?? '', who: 'Factory', kind: 'Cloth received', text: o.factoryCloth.note, tone: 'neutral' });
  rows.sort((a, b) => b.on.localeCompare(a.on));
  if (!rows.length) return <div className="py-2 text-[12.5px]" style={faint}>No remarks on this record yet.</div>;
  return <div>{rows.map((r, i) => <div key={i} className="kv"><span className="k" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.on)}<span className="text-[11px] block" style={faint}>{r.who}</span></span><span className="v" style={{ textAlign: 'left' }}><Pill tone={r.tone}>{r.kind}</Pill><span className="text-[12.5px] ml-2">{r.text}</span></span></div>)}</div>;
}
export const remarksCountOf = (o: ProductionOrder) => (o.qcChecks ?? []).length + (o.cutRatios ?? []).length + (o.targetRevisions ?? []).length;

/* ── the fabrics on the PO, one per colour: received and checked by the factory each on its own; a fail holds the colour
   for a replacement under the same PO, or drops it (an alternative comes as a separate PO). The rest carry on. ── */
export function PoFabricsSection({ o, factory, prod, bare }: { o: ProductionOrder; factory: boolean; prod: boolean; bare?: boolean }) {
  const { db, receivePoFabric, qcPoFabric, decidePoFabric, resumePoFabric, raiseAlternativeFor } = useApp();
  const pf = poFabricsOf(o);
  const [metres, setMetres] = useState<Record<string, string>>({}); const [note, setNote] = useState<Record<string, string>>({}); const [by, setBy] = useState<Record<string, string>>({});
  if (!o.poNo || !pf.all.length) return null;
  const got = pf.all.filter(f => f.receivedOn); const need = pf.all.reduce((a, f) => a + f.metresNeeded, 0); const rec = got.reduce((a, f) => a + (f.metresReceived ?? 0), 0);
  const inner = <>
    <div style={{ overflowX: 'auto' }}><table className="t compact fab-t">
      <thead><tr><th>Colour</th><th className="num">Pcs</th><th>Vendor</th><th>Cloth</th><th>Factory check</th><th>Then</th></tr></thead>
      <tbody>{pf.all.map(f => { const dropped = f.decision?.kind === 'drop'; const held = f.qc === 'failed' && f.decision?.kind === 'hold' && !f.resumedOn;
        return <tr key={f.id} style={{ opacity: dropped ? .55 : 1, verticalAlign: 'top', background: f.qc === 'failed' && !f.decision ? 'color-mix(in srgb, var(--risk) 5%, transparent)' : held ? 'color-mix(in srgb, var(--warn) 7%, transparent)' : undefined }}>
          <td><div className="font-medium" style={{ textDecoration: dropped ? 'line-through' : undefined }}>{f.colour}</div>{f.vendorFabricCode && <div className="mono text-[11px]" style={faint}>{f.vendorFabricCode}</div>}</td>
          <td className="num">{f.qty}</td>
          <td className="text-[12px]">{f.vendorId ? <VendorLink id={f.vendorId} /> : <span style={faint}>factory's own</span>}</td>
          <td className="text-[12px]" style={{ whiteSpace: 'nowrap' }}>{f.receivedOn ? <span style={{ color: (f.metresReceived ?? 0) < f.metresNeeded ? 'var(--risk)' : undefined }}>{f.metresReceived} of {f.metresNeeded} m · {fmtDate(f.receivedOn)}</span> : dropped ? '—' : o.fabricNominated && !o.sourcing?.fabricPo ? <span style={faint}>{f.metresNeeded} m · fabric PO not raised yet</span> : factory ? <span className="flex gap-1 items-center"><Input type="number" value={metres[f.id] ?? String(f.metresNeeded)} onChange={e => setMetres(x => ({ ...x, [f.id]: e.target.value }))} style={{ width: 80 }} /><Button size="sm" onClick={() => receivePoFabric(o.id, f.id, Number(metres[f.id] ?? f.metresNeeded))}>In</Button></span> : <span style={faint}>{f.metresNeeded} m to come</span>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{f.qc === 'passed' ? <Pill tone="good">passed{f.resumedOn ? ' · replacement' : ''}</Pill> : f.qc === 'failed' ? <><Pill tone="risk">failed {fmtDate(f.qcOn)}</Pill>{f.qcNote && <div className="text-[11px]" style={{ color: 'var(--risk)', whiteSpace: 'normal', maxWidth: 200 }}>{f.qcNote}</div>}</> : f.receivedOn ? (factory ? <span className="flex gap-1 items-end flex-wrap"><Input value={note[f.id] ?? ''} onChange={e => setNote(x => ({ ...x, [f.id]: e.target.value }))} placeholder="note" style={{ width: 120 }} /><Button size="sm" variant="primary" onClick={() => qcPoFabric(o.id, f.id, 'passed', note[f.id] ?? '')}>Pass</Button><Button size="sm" variant="danger" onClick={() => qcPoFabric(o.id, f.id, 'failed', note[f.id] ?? '')}>Fail</Button></span> : <Pill tone="warn">to check</Pill>) : <span style={faint}>—</span>}</td>
          <td className="text-[12px]" style={{ whiteSpace: 'normal', minWidth: 220 }}>
            {f.qc === 'passed' && !dropped && <span style={{ color: 'var(--good)' }}>in production</span>}
            {f.qc === 'failed' && !f.decision && (prod ? <div className="fab-decide">
              <div className="fab-decide-row"><span className="fab-decide-k">Hold for a replacement by</span><Input type="date" value={by[f.id] ?? ''} onChange={e => setBy(x => ({ ...x, [f.id]: e.target.value }))} style={{ width: 140 }} /><Button size="sm" variant="primary" disabled={!by[f.id]} onClick={() => decidePoFabric(o.id, f.id, 'hold', fromDateInput(by[f.id] ?? ''))}>Hold</Button></div>
              <div className="fab-decide-row"><span className="fab-decide-k">or</span><button type="button" className="vlink fab-drop" onClick={() => decidePoFabric(o.id, f.id, 'drop')}>drop {f.colour} from this run ({f.qty} pcs)</button></div>
            </div> : <ActsBy role="production" does="holds the colour for a replacement, or drops it" />)}
            {held && <div><Pill tone="warn">on hold</Pill> <span style={soft}>replacement{f.decision?.kind === 'hold' && f.decision.replacementBy ? ` by ${fmtDate(f.decision.replacementBy)}` : ''} · same PO</span>{factory && <div className="flex gap-1 items-center pt-1"><Input type="number" value={metres[f.id] ?? String(f.metresNeeded)} onChange={e => setMetres(x => ({ ...x, [f.id]: e.target.value }))} style={{ width: 80 }} /><Button size="sm" variant="primary" onClick={() => resumePoFabric(o.id, f.id, Number(metres[f.id] ?? f.metresNeeded))}>Replacement in · passed</Button></div>}</div>}
            {dropped && <div><Pill tone="neutral">dropped {fmtDate(f.decision!.on)}</Pill> <span style={soft}>{f.qty} pcs off this run</span>{f.decision?.kind === 'drop' && (f.decision.newRequirementId ? <div className="pt-1"><a className="vlink text-[12px]" href={`#/design?open=${f.decision.newRequirementId}`}>alternative raised as a separate requirement →</a></div> : prod ? <div className="pt-1"><Button size="sm" onClick={() => raiseAlternativeFor(o.id, f.id)}>Raise the alternative as a separate requirement</Button></div> : null)}</div>}
          </td>
        </tr>; })}</tbody>
      {pf.all.length > 1 && <tfoot><tr><td className="font-semibold">Total</td><td className="num font-semibold">{pf.all.reduce((a, f) => a + f.qty, 0)}</td><td></td>
        <td className="text-[12px] font-semibold" style={{ whiteSpace: 'nowrap', color: got.length && rec < need ? 'var(--risk)' : undefined }}>{got.length ? `${rec} of ${need} m` : `${need} m needed`}{got.length && rec < need ? <div className="text-[11px] font-normal">{need - rec} m short</div> : null}</td>
        <td className="text-[12px]">{pf.all.filter(f => f.qc === 'passed').length} of {pf.all.length} passed</td><td></td></tr></tfoot>}
    </table></div>
    {(pf.held.length > 0 || pf.dropped.length > 0) && <div className="text-[12.5px] pt-2" style={soft}>{pf.running.length} colour{pf.running.length === 1 ? '' : 's'} · {pf.running.reduce((a, f) => a + f.qty, 0)} pcs in production{pf.held.length ? ` · ${pf.heldPcs} pcs on hold` : ''}{pf.dropped.length ? ` · ${pf.dropped.reduce((a, f) => a + f.qty, 0)} pcs dropped (category gives the cut ratio for the rest)` : ''}.</div>}
  </>;
  if (bare) return inner;
  return <Section title={`Fabrics on this PO · ${pf.all.length} colour${pf.all.length === 1 ? '' : 's'}`} collapsible={false} right={<Pill tone={pf.tone}>{pf.line}</Pill>}>{inner}</Section>;
}

/* ── the last step: the style into Enigma with every size, ready to sell; editable before and after; then AI drafts the product and marketing details ── */
type Sku = { size: string; sku: string; qty: number; price?: number | null; salePrice?: number | null };
export function EnigmaSection({ o, design }: { o: ProductionOrder; design: boolean }) {
  const { addToEnigma, setEnigmaCopy } = useApp();
  const ep = o.enigmaProduct; const p = packOf(o);
  const base = `BSC-${o.category.includes('hirt') ? 'SH' : o.category.includes('Bottom') ? 'BT' : o.category.includes('Knit') ? 'KN' : 'RT'}-${o.id.replace(/\D/g, '').slice(-4).padStart(4, '0')}`;
  const sizes = (o.cutRatios ?? []).filter(c => c.given).slice(-1)[0]?.given?.breakup ?? o.sizeBreakup;
  const init = () => ep ? { code: ep.code, name: ep.name, mrp: String(ep.mrp), fit: ep.fit ?? '', colour: ep.colour ?? '', description: ep.description ?? '', skus: ep.skus.map(x => ({ ...x })) }
    : { code: base, name: o.styleName, mrp: String(Math.round((o.finalFob ?? o.targetCost) * 3.2 / 10) * 10 - 1), fit: o.fit ?? '', colour: (p.colours ?? [])[0] ?? o.fabricBrief?.colour ?? '', description: p.fabric.description ? `${p.fabric.description}${p.fabric.content ? `, ${p.fabric.content}` : ''}` : '', skus: sizes.filter(x => x.qty > 0).map(x => ({ size: x.size, sku: `${base}-${x.size}`, qty: x.qty, price: null, salePrice: null })) as Sku[] };
  const [f, setF] = useState(init);
  const [editing, setEditing] = useState(!ep);
  const setSku = (i: number, patch: Partial<Sku>) => setF(x => ({ ...x, skus: x.skus.map((s, k) => k === i ? { ...s, ...patch } : s) }));
  const recode = (code: string) => setF(x => ({ ...x, code, skus: x.skus.map(s => ({ ...s, sku: s.sku.startsWith(x.code) ? code + s.sku.slice(x.code.length) : s.sku })) }));
  const fillSample = () => { const mrp = Math.round((o.costQuery?.replies.length ? Math.min(...o.costQuery.replies.map(r => r.cost)) : o.targetCost) * 3.2 / 10) * 10 - 1; const col = (p.colours ?? [])[0] ?? o.fabricBrief?.colour ?? 'White';
    const szs = (sizes.filter(x => x.qty > 0).length ? sizes.filter(x => x.qty > 0) : [{ size: 'S', qty: 30 }, { size: 'M', qty: 50 }, { size: 'L', qty: 50 }, { size: 'XL', qty: 20 }]);
    setF({ code: base, name: o.styleName, mrp: String(mrp), fit: o.fit ?? 'Regular Fit', colour: col, description: `${p.fabric.description ?? 'House cloth'}${p.fabric.content ? `, ${p.fabric.content}` : ''}. ${o.fit ?? 'Regular fit'}, ${col.toLowerCase()}.`, skus: szs.map(x => ({ size: x.size, sku: `${base}-${x.size}`, qty: x.qty, price: mrp, salePrice: null })) }); };
  const save = () => { addToEnigma(o.id, { code: f.code.trim(), name: f.name.trim(), mrp: Number(f.mrp), category: o.category, fit: f.fit.trim() || null, colour: f.colour.trim() || null, description: f.description.trim() || null, skus: f.skus.filter(s => s.size.trim() && s.sku.trim()).map(s => ({ ...s, price: s.price ?? Number(f.mrp) })) }); setEditing(false); };

  /* AI: product and marketing details from what the record already knows (prototype: drafted locally; the build calls the model) */
  const draftCopy = () => {
    const e = ep!; const fab = p.fabric; const cloth = [fab.description, fab.content].filter(Boolean).join(', ');
    const fit = e.fit ?? 'Regular Fit'; const col = e.colour ?? '';
    return { title: `${e.name}${col && !e.name.toLowerCase().includes(col.toLowerCase()) ? ` · ${col}` : ''}`,
      description: `${e.name} in ${cloth || 'our house cloth'}. Cut in a ${fit.toLowerCase()} with clean, considered details, it is made for everyday wear that still looks put together. ${p.brief ? p.brief.split('.')[0] + '.' : ''}`.trim(),
      bullets: [cloth ? `Fabric: ${cloth}` : 'Fabric: house cloth', `Fit: ${fit}`, ...(col ? [`Colour: ${col}`] : []), `Sizes: ${e.skus.map(s => s.size).join(', ')}`, 'Made in India'],
      care: /linen/i.test(cloth) ? 'Machine wash cold, gentle; line dry in shade; warm iron while damp.' : /wool/i.test(cloth) ? 'Dry clean only.' : 'Machine wash cold with like colours; do not bleach; warm iron.',
      seo: `${e.name} | ${fit} ${o.category.replace(/^RTW (CMT |FOB )?/i, '').replace(/s$/, '')} | Bombay Shirt Company`,
      marketing: [`Say the cloth first: ${cloth || 'the fabric'}.`, `${fit} — show it on the body, front and side.`, col ? `Lead with the ${col.toLowerCase()} in the hero image.` : 'Lead with the colour in the hero image.', `₹${e.mrp.toLocaleString('en-IN')} · ${e.skus.length} sizes from ${e.skus[0]?.size} to ${e.skus[e.skus.length - 1]?.size}.`],
      generatedOn: new Date().toISOString() };
  };
  const [copy, setCopy] = useState(ep?.copy ?? null);

  if (ep && !editing) return <>
    <Section title="In Enigma" collapsible={false} right={<span className="flex gap-2 items-center"><Pill tone="good">added {fmtDate(ep.addedOn)} · {ep.by}{ep.editedOn ? ` · edited ${fmtDate(ep.editedOn)}` : ''}</Pill>{design && <Button size="sm" onClick={() => { setF(init()); setEditing(true); }}>Edit</Button>}</span>}>
      <div className="grid gap-x-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <KV k="Code" v={<span className="mono">{ep.code}</span>} /><KV k="Name" v={ep.name} /><KV k="MRP" v={fmtMoney(ep.mrp)} /><KV k="Category" v={ep.category} note={[ep.fit, ep.colour].filter(Boolean).join(' · ') || undefined} />
      </div>
      {ep.description && <div className="text-[12.5px] pt-1" style={soft}>{ep.description}</div>}
      <table className="t compact mt-2"><thead><tr><th>Size</th><th>SKU</th><th className="num">Price</th><th className="num">Sale price</th><th className="num">Pcs</th></tr></thead><tbody>{ep.skus.map(x => <tr key={x.size}><td>{x.size}</td><td className="mono text-[12px]">{x.sku}</td><td className="num">{fmtMoney(x.price ?? ep.mrp)}</td><td className="num">{x.salePrice != null ? fmtMoney(x.salePrice) : '—'}</td><td className="num">{x.qty}</td></tr>)}</tbody></table>
    </Section>
    <div className="pt-3 text-[12.5px] flex gap-2 items-center flex-wrap"><span className="pill role-marketing">Marketing</span>{o.marketing?.doneOn ? <span>Product and marketing details done {fmtDate(o.marketing.doneOn)} · ready for go-live</span> : <span style={{ color: 'var(--warn)' }}>Product and marketing details with marketing{o.marketing?.savedOn ? ' · draft saved' : ''} · go-live waits for them</span>}<a className="vlink" href={`#/marketing?open=${o.id}`}>see them →</a></div>
  </>;

  return <Section title={ep ? 'Edit in Enigma' : 'Add the SKUs to Enigma'} collapsible={false} right={<span className="pill role-design">Category</span>}>
    {!ep && !o.poNo && <div className="text-[12.5px] pb-2" style={{ color: 'var(--warn)' }}>The PO cannot be drafted until the SKUs are in Enigma.</div>}
    {!ep && <div className="text-[12px] pb-2 flex gap-2 items-center" style={{ color: 'var(--ink-soft)' }}><span className="pill role-marketing">Marketing</span>is filling the product and marketing details alongside{o.marketing?.doneOn ? ' · done' : o.marketing?.savedOn ? ' · draft saved' : ''}.</div>}
    {(() => { const dc = directCostOf(o); return <div className="mrp-box mb-3">
      <div><span>Direct cost per piece</span><b>{fmtMoney(Math.round(dc.total))}</b><em>{fmtMoney(Math.round(dc.total - dc.fixed))} from {dc.fobFrom} + {fmtMoney(Math.round(dc.fixed))} fixed</em></div><i>×</i>
      <div><span>Multiplier</span><b>{dc.multiple}</b></div><i>=</i>
      <div><span>MRP by the multiplier</span><b>{dc.mrpBy != null ? fmtMoney(dc.mrpBy) : '—'}</b>{design && dc.mrpBy != null && Number(f.mrp) !== dc.mrpBy && <button type="button" className="vlink text-[11.5px]" onClick={() => setF(x => ({ ...x, mrp: String(dc.mrpBy), skus: x.skus.map(s => ({ ...s, price: s.price == null || s.price === Number(x.mrp) ? dc.mrpBy : s.price })) }))}>use this MRP</button>}</div>
    </div>; })()}
    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
      <Field label="Design code"><Input value={f.code} onChange={e => recode(e.target.value)} disabled={!design} /></Field>
      <Field label="Name it sells as"><Input value={f.name} onChange={e => setF(x => ({ ...x, name: e.target.value }))} disabled={!design} /></Field>
      <Field label="MRP (₹)"><Input type="number" value={f.mrp} onChange={e => setF(x => ({ ...x, mrp: e.target.value }))} disabled={!design} /></Field>
      <Field label="Fit"><Input value={f.fit} onChange={e => setF(x => ({ ...x, fit: e.target.value }))} disabled={!design} /></Field>
      <Field label="Colour"><Input value={f.colour} onChange={e => setF(x => ({ ...x, colour: e.target.value }))} disabled={!design} /></Field>
      <div style={{ gridColumn: '1 / -1' }}><Field label="Description"><Input value={f.description} onChange={e => setF(x => ({ ...x, description: e.target.value }))} disabled={!design} /></Field></div>
    </div>
    <div className="cap pt-3">Every size · {f.skus.reduce((a, x) => a + (x.qty || 0), 0)} pcs</div>
    <div className="flex items-center gap-2 pb-1 text-[12px]" style={faint}>Price per size defaults to the MRP; type over any size that sells at a different price.{design && <button type="button" className="vlink" onClick={() => setF(y => ({ ...y, skus: y.skus.map(s => ({ ...s, price: Number(y.mrp) || null })) }))}>set every size to ₹{f.mrp}</button>}</div>
    <table className="t compact"><thead><tr><th>Size</th><th>SKU</th><th className="num">Price (₹)</th><th className="num">Sale price (₹)</th><th className="num">Pcs</th><th></th></tr></thead>
      <tbody>{f.skus.map((x, i) => <tr key={i}>
        <td>{design ? <Input value={x.size} onChange={e => setSku(i, { size: e.target.value, sku: `${f.code}-${e.target.value}` })} style={{ width: 80 }} /> : x.size}</td>
        <td>{design ? <Input value={x.sku} onChange={e => setSku(i, { sku: e.target.value })} className="input mono" style={{ width: 220 }} /> : <span className="mono text-[12px]">{x.sku}</span>}</td>
        <td className="num">{design ? <Input type="number" value={x.price ?? ''} placeholder={f.mrp} onChange={e => setSku(i, { price: e.target.value === '' ? null : Number(e.target.value) })} style={{ width: 110, textAlign: 'right' }} /> : fmtMoney(x.price ?? Number(f.mrp))}</td>
        <td className="num">{design ? <Input type="number" value={x.salePrice ?? ''} placeholder="—" onChange={e => setSku(i, { salePrice: e.target.value === '' ? null : Number(e.target.value) })} style={{ width: 110, textAlign: 'right' }} /> : x.salePrice != null ? fmtMoney(x.salePrice) : '—'}</td>
        <td className="num">{design ? <Input type="number" value={x.qty} onChange={e => setSku(i, { qty: Number(e.target.value) || 0 })} style={{ width: 90, textAlign: 'right' }} /> : x.qty}</td>
        <td>{design && <button type="button" className="vlink text-[11.5px]" onClick={() => setF(y => ({ ...y, skus: y.skus.filter((_, k) => k !== i) }))}>remove</button>}</td>
      </tr>)}</tbody></table>
    {design && <div className="pt-1"><button type="button" className="vlink text-[12px]" onClick={() => setF(y => ({ ...y, skus: [...y.skus, { size: '', sku: `${y.code}-`, qty: 0, price: null, salePrice: null }] }))}>+ Add a size</button></div>}
    <div className="pt-3 flex gap-2">{design ? <><Button variant="primary" disabled={!f.code.trim() || !f.name.trim() || !Number(f.mrp) || !f.skus.length} onClick={save}>{ep ? 'Save to Enigma' : `Add to Enigma · ${f.skus.length} sizes →`}</Button>{!ep && <Button variant="ghost" onClick={fillSample}>Fill with sample data</Button>}{ep && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}</> : <ActsBy role="design" does="adds the style to Enigma with every size" />}</div>
  </Section>;
}
