/* Option requests — the ask as design actually makes it: a category and a
   number. "Ten options for winter shirts." Sourcing fills each numbered slot
   with samples from different mills; design settles each slot on its own —
   choose one and the PO is raised in the same click, throw a mill out, ask for
   the hold to be extended, or close the slot because nothing was right. Seven
   of ten going ahead is the normal ending. The same request carries design's
   bill of materials and the trims and buttons sourcing has to find as well. */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { OptionRequest, RequestOption, ConceptFabricOption, BomLine } from '../domain/types';
import { fmtDate, fmtMoney, daysAgo, TODAY, addDays, iso, trimCoverageOf } from '../domain/engines';

/* the trims master says "Button"; a designer writes "Buttons" — same shelf */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '').replace(/s$/, '');
const trimOnMaster = (trims: { name: string }[], item: string) => trims.find(t => norm(t.name) === norm(item) || norm(item).includes(norm(t.name)) || norm(t.name).includes(norm(item)));
import { GARMENT_CATEGORIES, MTM_SWATCH_BOOKS } from '../domain/reference';
import { Page, Card, Pill, Button, Drawer, KV, Section, Note, Field, Input, Select, Empty, Seg, Th, dateInput, fromDateInput, type Tone } from '../ui';
import { VendorLink } from './Vendors';
import { RecordTail } from './RecordTail';
import { ActsBy, OwnerPill } from './Who';
import { catLabel } from '../domain/edition';

/* Three things a slot can be waiting on, said the same way everywhere:
   sourcing to add vendors · design to push PO · extension asked.
   PO raised and closed are endings, not waits. */
const STATUS: Record<RequestOption['status'], { label: string; tone: Tone; owner: 'design' | 'sourcing' | null }> = {
  open:          { label:'sourcing to add vendors', tone:'neutral', owner:'sourcing' },
  'with-design': { label:'design to push PO',       tone:'warn',    owner:'design' },
  extension:     { label:'extension asked',         tone:'risk',    owner:'sourcing' },
  'po-raised':   { label:'PO raised',               tone:'good',    owner: null },
  closed:        { label:'closed',                  tone:'neutral', owner: null },
};
const summarise = (r: OptionRequest) => {
  const n = (k: RequestOption['status']) => r.options.filter(o => o.status === k).length;
  return { done: n('po-raised'), closed: n('closed'), design: n('with-design'), sourcing: n('open') + n('extension'), total: r.options.length };
};

export { STATUS as SLOT_STATUS };

export function OptionRequests() {
  const { db, role, myRole } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace:true }); };
  const design = role === 'design' || role === 'planning' || role === 'owner';
  const reqs = db.optionRequests ?? [];
  const active = reqs.find(r => r.id === params.get('open')) ?? null;
  const [show, setShow] = useState<'all' | 'mine'>('all');
  const asRole = myRole === 'planning' ? 'design' : myRole;   // planning sits with design on these
  const mineNow = (r: OptionRequest) => r.options.some(o => STATUS[o.status].owner === asRole || (myRole === 'owner' && STATUS[o.status].owner));
  const rows = reqs.filter(r => show === 'all' || mineNow(r));

  return (
    <Page title="Option requests" lede="Design asks for a category and a number; sourcing puts one vendor against each option; design settles each on its own."
      replaces="an option-count in a planning sheet, a WhatsApp of swatch photos per slot, and a verbal 'we're going with eight'"
      actions={design ? <Button variant="primary" onClick={() => set('new', '1')}>+ New request</Button> : <ActsBy role={['design', 'planning']} does="raises a request — a category, how many options, by when, at what cost" inline />}>

      <div className="flex items-end gap-3 flex-wrap mb-3">
        <Seg value={show} onChange={setShow} label="Show" options={[{ id:'all', label:'All requests', count: reqs.length }, { id:'mine', label:'Waiting on me', count: reqs.filter(mineNow).length, hint:'an option on the request is your move' }]} />
      </div>

      {rows.length === 0 ? <Card><Empty title="No requests." body="Design raises one: a category, how many options, by when." /></Card> : <Card><table className="t">
        <thead><tr>
          <Th>Request</Th>
          <Th hint="One dot per option, in the colour of the team it is with — green once the PO is raised, grey when closed.">The options</Th>
          <Th hint="When design wants these on the floor.">Live by</Th>
          <Th num hint="Design's target per piece, all in — a sample over this is a hard sell.">Target</Th>
        </tr></thead>
        <tbody>{rows.map(r => { const s = summarise(r);
          return <tr key={r.id} className="row" onClick={() => set('open', r.id)}>
            <td><div className="font-medium">{r.reqNo} · {catLabel(r.category)} · {r.optionCount} options</div><div className="text-[11.5px]" style={{ color:'var(--ink-faint)', maxWidth: 420, whiteSpace:'normal' }}>{r.brief}</div><div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{r.raisedBy} · {fmtDate(r.raisedOn)} · {daysAgo(r.raisedOn)}d ago</div></td>
            <td>
              {/* a dot per option in the colour of the team holding it — green done, grey closed */}
              <div className="flex gap-1 flex-wrap mb-1">{r.options.map(o => <span key={o.id} title={`Option ${o.index}${o.note ? ` · ${o.note}` : ''} — ${STATUS[o.status].label}`} className="dot" style={{ width: 10, height: 10, background: o.status === 'po-raised' ? 'var(--good)' : o.status === 'closed' ? 'var(--line)' : `var(--role-${STATUS[o.status].owner})` }} />)}</div>
              <div className="text-[11.5px] flex gap-2 flex-wrap" style={{ color:'var(--ink-soft)' }}>
                <span><b style={{ color:'var(--good)' }}>{s.done}</b> PO raised</span>
                {s.design > 0 && <span>· <b style={{ color:'var(--role-design)' }}>{s.design}</b> design to push PO</span>}
                {s.sourcing > 0 && <span>· <b style={{ color:'var(--role-sourcing)' }}>{s.sourcing}</b> sourcing to add vendors{r.options.some(o => o.status === 'extension') ? ` · ${r.options.filter(o => o.status === 'extension').length} extension asked` : ''}</span>}
                {s.closed > 0 && <span>· {s.closed} closed</span>}
              </div>
            </td>
            <td className="text-[12.5px]">{r.liveBy ?? '—'}</td>
            <td className="num">{r.targetCost != null ? fmtMoney(r.targetCost) : '—'}</td>
          </tr>; })}</tbody>
      </table></Card>}

      <Drawer open={!!active} onClose={() => set('open', null)} title={active ? `${active.reqNo} · ${active.category}` : ''}
        subtitle={active && <><Pill tone="accent">{active.optionCount} options</Pill><span>{active.raisedBy} · {fmtDate(active.raisedOn)}{active.liveBy ? ` · live by ${active.liveBy}` : ''}{active.targetCost != null ? ` · target ${fmtMoney(active.targetCost)}` : ''}</span></>}>
        {active && <RequestDetail r={active} focusOptionId={params.get('slot')} />}
      </Drawer>
      <Drawer open={params.get('new') === '1'} onClose={() => set('new', null)} title="New request" subtitle="A category and a number. Sourcing takes it from here, slot by slot.">
        <NewRequest defaults={{ count: params.get('count'), category: params.get('category'), brief: params.get('brief') }} onDone={id => { const n = new URLSearchParams(params); ['new', 'count', 'category', 'brief'].forEach(k => n.delete(k)); n.set('open', id); setParams(n, { replace:true }); }} />
      </Drawer>
    </Page>
  );
}

/* ---------- one request: the ask, the slots, the trims ---------------------- */
export function RequestDetail({ r, focusOptionId }: { r: OptionRequest; focusOptionId?: string | null }) {
  const { db, role, updateRequestBom } = useApp();
  const design = role === 'design' || role === 'planning' || role === 'owner';
  const sourcing = role === 'sourcing' || role === 'owner';
  const s = summarise(r);
  const [bom, setBom] = useState<BomLine[]>(r.bom);
  const [bomEdit, setBomEdit] = useState(false);
  /* one option open at a time: the list stays a list */
  const [openId, setOpenId] = useState<string | null>(focusOptionId ?? null);
  useEffect(() => { if (focusOptionId) setOpenId(focusOptionId); }, [focusOptionId]);
  const counts = [s.sourcing ? `${s.sourcing} need a vendor` : '', s.design ? `${s.design} waiting on design` : '', s.done ? `${s.done} PO raised` : '', s.closed ? `${s.closed} closed` : ''].filter(Boolean).join(' · ');
  return <>
    <div className="px-1 pb-1 text-[13px]">{r.brief}</div>
    <div className="px-1 pb-3 text-[12px]" style={{ color:'var(--ink-faint)' }}>{r.optionCount} options{counts ? ` · ${counts}` : ''}{r.liveBy ? ` · live by ${r.liveBy}` : ''}{r.targetCost != null ? ` · target ${fmtMoney(r.targetCost)} a piece` : ''}</div>

    <div className="card" style={{ padding: 0 }}>
      {r.options.map(opt => <OptionSlot key={opt.id} r={r} opt={opt} design={design} sourcing={sourcing} open={openId === opt.id} onToggle={() => setOpenId(v => v === opt.id ? null : opt.id)} />)}
    </div>

    <Section title="Brief & bill of materials" ownerRole={null} pending={false}>
      <KV k="How many" v={`${r.optionCount} options`} note={[s.done ? `${s.done} PO raised` : '', s.design ? `${s.design} design to push PO` : '', s.sourcing ? `${s.sourcing} sourcing to add vendors` : '', s.closed ? `${s.closed} closed` : ''].filter(Boolean).join(' · ')} />
      <KV k="Live by" v={r.liveBy ?? '—'} />
      <KV k="Target cost" v={r.targetCost != null ? fmtMoney(r.targetCost) : '—'} note="per piece, all in — cloth, trims, making" />
      <div className="pt-3 mt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div className="flex items-baseline justify-between gap-2"><div className="label" style={{ margin:0 }}>Bill of materials — what design wants in the garment</div>
          {design && <button type="button" className="vlink text-[11.5px]" onClick={() => setBomEdit(v => !v)}>{bomEdit ? 'done' : 'edit'}</button>}</div>
        <div style={{ overflowX:'auto' }}><table className="t compact mt-1"><thead><tr><th>Item</th><th>Spec</th><th className="num">Per piece</th><th>Unit</th><th>On the trims master</th></tr></thead>
          <tbody>{(bomEdit ? bom : r.bom).map((l, i) => { const t = l.kind === 'fabric' ? null : trimOnMaster(db.trims ?? [], l.item) as typeof db.trims[number] | undefined; const c = t ? trimCoverageOf(db, t) : null;
            return <tr key={i}>
            <td>{bomEdit ? <Input value={l.item} onChange={e => setBom(b => b.map((x, k) => k === i ? { ...x, item: e.target.value } : x))} /> : <><Pill tone={l.kind === 'fabric' ? 'accent' : 'neutral'}>{l.kind}</Pill> {l.item}</>}</td>
            <td className="text-[12px]" style={{ whiteSpace:'normal', maxWidth: 260 }}>{bomEdit ? <Input value={l.spec ?? ''} onChange={e => setBom(b => b.map((x, k) => k === i ? { ...x, spec: e.target.value } : x))} /> : (l.spec ?? '—')}</td>
            <td className="num">{bomEdit ? <Input type="number" value={l.qtyPerPc ?? ''} onChange={e => setBom(b => b.map((x, k) => k === i ? { ...x, qtyPerPc: Number(e.target.value) } : x))} style={{ width: 70 }} /> : (l.qtyPerPc ?? '—')}</td>
            <td className="text-[12px]">{l.unit}</td>
            <td className="text-[12px]">{l.kind === 'fabric' ? <span style={{ color:'var(--ink-faint)' }}>per option — see the slots</span>
              : t && c ? <><span style={{ color: c.belowThreshold ? 'var(--risk)' : undefined }}>{c.available.toLocaleString('en-IN')} {t.unit} available</span>{l.qtyPerPc ? <span style={{ color:'var(--ink-faint)' }}> · covers ~{Math.floor(c.available / l.qtyPerPc).toLocaleString('en-IN')} pcs</span> : null}{c.belowThreshold && <div className="text-[11px]" style={{ color:'var(--risk)' }}>below threshold{t.incoming ? ` · ${t.incoming.toLocaleString('en-IN')} on order` : ' · nothing on order'}</div>}<div><a className="cta" href="#/fabrics?tab=trims">trims stock →</a></div></>
              : <span style={{ color:'var(--warn)' }}>not on the trims master — <a className="cta" href="#/fabrics?tab=trims">add it there →</a></span>}</td>
          </tr>; })}</tbody></table></div>
        {bomEdit && <div className="flex gap-2 pt-2"><Button size="sm" onClick={() => setBom(b => [...b, { kind:'trim', item:'', spec:'', qtyPerPc: 1, unit:'pc' }])}>+ line</Button><Button size="sm" variant="primary" onClick={() => { updateRequestBom(r.id, bom.filter(l => l.item.trim())); setBomEdit(false); }}>Save</Button></div>}
        {!design && <ActsBy role={['design', 'planning']} does="writes the bill of materials — sourcing buys against it" />}
      </div>
    </Section>

    <RecordTail kind="request" subjectId={r.id} labels={['Brief', 'Swatch photo', 'Reference']} editable />
  </>;
}

/* ---------- one slot: its samples and the one decision on each ---------------- */
function OptionSlot({ r, opt, design, sourcing, open, onToggle }: { r: OptionRequest; opt: RequestOption; design: boolean; sourcing: boolean; open: boolean; onToggle: () => void }) {
  const { db, addRequestOffer, updateRequestOffer, removeRequestOffer, sendOptionToDesign, closeOption, reopenOption, rejectRequestOffer, askOptionExtension, extendRequestOffer, sendOptionBack, acceptOfferAndRaisePo } = useApp();
  const st = STATUS[opt.status];
  const live = opt.offers.filter(o => !o.rejected);
  const chosen = opt.offers.find(o => o.selected);
  const spendOf = (o: ConceptFabricOption) => o.cpm * o.moq;
  const nameOf = (id: string) => db.vendors.find(v => v.id === id)?.name ?? '—';
  /* whose move is this slot? open it for that person: design's slots were
     opening for everyone while sourcing's sat folded with nothing to click */
  const [why, setWhy] = useState('');
  const [metres, setMetres] = useState<Record<string, string>>({});
  const [closeWhy, setCloseWhy] = useState('');
  const [showClose, setShowClose] = useState(false);
  const [extDates, setExtDates] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);   // the vendor row being edited in place
  const fabric = opt.fabricId ? db.fabrics.find(f => f.id === opt.fabricId) : null;
  const po = opt.fabricPoId ? (db.fabricPos ?? []).find(p => p.id === opt.fabricPoId) : null;

  /* the one thing to do on this option, for the person looking at it */
  const action: { label: string; primary: boolean; run: () => void } | null =
    sourcing && opt.status === 'open' && !live[0] ? { label: 'Add vendor', primary: true, run: onToggle }
    : sourcing && opt.status === 'open' && live[0] ? { label: 'Send to design', primary: true, run: () => sendOptionToDesign(r.id, opt.id) }
    : sourcing && opt.status === 'extension' ? { label: 'Extend hold', primary: true, run: onToggle }
    : design && opt.status === 'with-design' ? { label: 'Review', primary: true, run: onToggle }
    : null;
  const vendorLine = opt.status === 'po-raised' && fabric ? `${fabric.name} · ${nameOf(fabric.vendorId)}${po ? ` · ${po.poNo}` : ''}` : opt.status === 'closed' ? (opt.closed?.reason || 'closed') : live[0] ? `${nameOf(live[0].vendorId)} · ₹${live[0].cpm}/m` : 'no vendor yet';
  const dot = st.owner ? `var(--role-${st.owner}, var(--accent))` : st.tone === 'good' ? 'var(--good)' : 'var(--ink-faint)';
  return <div style={{ borderTop:'1px solid var(--line-soft)', background: open ? 'var(--surface-2)' : undefined, opacity: opt.status === 'closed' && !open ? .6 : 1 }}>
    <div className="flex items-center gap-3 px-3 py-2.5" style={{ cursor:'pointer' }} onClick={onToggle}>
      <div className="mono text-[12px]" style={{ width: 22, color:'var(--ink-faint)' }}>{opt.index}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px]" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textDecoration: opt.status === 'closed' ? 'line-through' : undefined }}>{opt.note || (opt.ask?.look ?? `Option ${opt.index}`)}</div>
        <div className="text-[11.5px]" style={{ color:'var(--ink-faint)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{vendorLine}</div>
      </div>
      <div className="text-[12px] flex items-center gap-1.5" style={{ whiteSpace:'nowrap', color:'var(--ink-soft)' }}><span aria-hidden style={{ width: 7, height: 7, borderRadius: 9, background: dot, display:'inline-block' }} />{st.label}</div>
      <div style={{ width: 120, textAlign:'right' }}>{action
        ? <Button size="sm" variant={action.primary ? 'primary' : undefined} onClick={e => { e.stopPropagation(); action.run(); }}>{action.label}</Button>
        : <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{open ? 'close ▴' : 'view ▾'}</span>}</div>
    </div>

    {open && <div className="px-3 pb-3">
      <OptionAsk r={r} opt={opt} design={design} />
      {/* settled */}
      {opt.status === 'po-raised' && fabric && <>
        <KV k="Chosen" v={<>{fabric.name} · <VendorLink id={fabric.vendorId} /></>} note={`₹${fabric.cpm}/m${chosen?.rationale ? ` · "${chosen.rationale}"` : ''}${chosen?.chosenBy ? ` · ${chosen.chosenBy}` : ''}`} />
        {po && <KV k="Fabric PO" v={<a className="cta" href="#/fabrics?tab=pos">{po.poNo} · {po.metres} m →</a>} note={`raised ${fmtDate(po.raisedOn)} · ${fmtMoney(po.metres * (fabric.cpm ?? 0))} · ${po.vendorConfirmedOn ? 'mill confirmed' : 'waiting on the mill'} · on the fabric master as ${fabric.code}`} />}
      </>}
      {opt.status === 'closed' && <div className="flex items-center gap-3 flex-wrap text-[12.5px]"><span>Closed {fmtDate(opt.closed!.on)} by {opt.closed!.by}{opt.closed!.reason ? ` — "${opt.closed!.reason}"` : ''}.</span>{design && <button type="button" className="vlink" onClick={() => reopenOption(r.id, opt.id)}>reopen</button>}</div>}

      {/* the samples */}
      {opt.status !== 'closed' && opt.status !== 'po-raised' && <>
        {design && opt.status === 'with-design' && live.length > 0 && <div className="pb-2"><Field label="Why — kept on the decision, and sent back with a rejection" hint="Push PO, Reject and More time all carry it"><Input value={why} onChange={e => setWhy(e.target.value)} placeholder="the hand is right and the shade matches the brief" /></Field></div>}
        {opt.offers.length === 0 ? (sourcing ? null : <div className="py-1 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>No vendor yet — sourcing is at the mills.</div>)
          : <div className="grid gap-2">
            {/* the one live vendor, as a card that fits the drawer — a table of one
                row was scrolling its own action buttons off the right edge */}
            {live.map(q => { const left = q.holdUntil ? -daysAgo(q.holdUntil) : null; const m = metres[q.id] ?? String(q.moq);
              const overTarget = r.targetCost != null && q.cpm * (r.bom.find(l => l.kind === 'fabric')?.qtyPerPc ?? 1.6) > r.targetCost * .6;
              if (editId === q.id) return <div key={q.id} className="px-3 py-2" style={{ background:'var(--accent-soft)', borderRadius: 6 }}>
                <VendorEditor title={`The vendor against option ${opt.index}`} brief={opt.note} targetCost={r.targetCost} fabricQtyPerPc={r.bom.find(l => l.kind === 'fabric')?.qtyPerPc ?? null} current={q} onSave={patch => { updateRequestOffer(r.id, opt.id, q.id, patch); setEditId(null); }} onCancel={() => setEditId(null)} />
              </div>;
              return <div key={q.id} className="px-3 py-2.5" style={{ background: q.selected ? 'var(--good-soft)' : 'var(--surface-2)', borderRadius: 6 }}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div style={{ minWidth: 200, flex:'1 1 220px' }}>
                    <div className="font-medium"><VendorLink id={q.vendorId} />{q.vendorCode ? <span className="mono text-[11px]" style={{ color:'var(--ink-faint)' }}> · {q.vendorCode}</span> : null}</div>
                    <div className="text-[12.5px]">{q.name}</div>
                    <div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{q.composition}{q.widthIn ? ` · ${q.widthIn}" panna` : ''}{q.note ? ` · ${q.note}` : ''}</div>
                  </div>
                  <div className="flex gap-4 flex-wrap text-[12.5px]" style={{ flex:'2 1 320px' }}>
                    {[['₹ / m', <b style={{ color: overTarget ? 'var(--warn)' : undefined }}>₹{q.cpm}</b>], ['MOQ', `${q.moq} m`], ['first buy', <b>{fmtMoney(spendOf(q))}</b>], ['lead', `${q.leadDays}d`],
                      ['holds until', q.holdUntil ? <span style={{ color: left != null && left <= 5 ? 'var(--risk)' : undefined }}>{fmtDate(q.holdUntil)} · {left! < 0 ? `lapsed ${-left!}d ago` : `${left}d left`}</span> : '—']].map(([k, v]) =>
                      <div key={String(k)}><div className="text-[10.5px] mono uppercase" style={{ color:'var(--ink-faint)', letterSpacing:'.05em' }}>{k}</div><div>{v}</div></div>)}
                    {q.extensionAsked && <div><div className="text-[10.5px] mono uppercase" style={{ color:'var(--ink-faint)', letterSpacing:'.05em' }}>extension</div><Pill tone="warn">asked {fmtDate(q.extensionAsked.on)}</Pill></div>}
                  </div>
                </div>
                <div className="flex gap-2 items-center flex-wrap pt-2 mt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
                  {q.selected ? <Pill tone="good">chosen</Pill>
                    : design && opt.status === 'with-design' ? <>
                        <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>metres</span>
                        <Input type="number" value={m} onChange={e => setMetres(x => ({ ...x, [q.id]: e.target.value }))} style={{ width: 72, padding:'3px 6px' }} />
                        <Button size="sm" variant={left != null && left < 0 ? undefined : 'primary'} title={left != null && left < 0 ? 'the hold has lapsed — the price is not promised; ask for more time first' : `push the fabric PO to ${nameOf(q.vendorId)} for ${m} m`} onClick={() => acceptOfferAndRaisePo(r.id, opt.id, q.id, Number(m) || q.moq, why.trim())}>Push PO · {fmtMoney(Number(m || 0) * q.cpm)}</Button>
                        {left != null && left < 0 && <span className="text-[11.5px]" style={{ color:'var(--risk)' }}>hold lapsed — the price is not promised</span>}
                        <button type="button" className="btn sm" onClick={() => rejectRequestOffer(r.id, opt.id, q.id, why.trim())}>Reject</button>
                        {q.extensionAsked ? null : <button type="button" className="btn sm" onClick={() => askOptionExtension(r.id, opt.id, q.id, `${nameOf(q.vendorId)}: ${why.trim() || 'need longer than the hold'}`)}>More time</button>}
                      </>
                    : null}
                  {sourcing && !q.selected && (opt.status === 'open' || opt.status === 'with-design') && <><div className="flex-1" /><Button size="sm" onClick={() => setEditId(q.id)}>Edit</Button></>}
                </div>
              </div>; })}
            {opt.offers.filter(q => q.rejected).length > 0 && <div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>
              {opt.offers.filter(q => q.rejected).map(q => <div key={q.id}>✕ {nameOf(q.vendorId)} · {q.name} · ₹{q.cpm}/m — {q.rejected!.reason || 'no reason given'} <span>({fmtDate(q.rejected!.on)})</span></div>)}
            </div>}
          </div>}

        {/* extension asked — sourcing answers */}
        {opt.status === 'extension' && <div className="mt-3 pt-3" style={{ borderTop:'1px solid var(--line)' }}>
          <Note tone="warn"><b>Design asked for an extension</b>{opt.extension?.note ? ` — "${opt.extension.note}"` : ''}</Note>
          {sourcing ? <>
            <div className="grid gap-2 pt-3">{live.map(q => { const lapsed = !!q.holdUntil && daysAgo(q.holdUntil) > 0; const val = extDates[q.id] ?? dateInput(iso(addDays(TODAY, 14)));
              return <div key={q.id} className="flex items-center gap-3 flex-wrap px-3 py-2" style={{ background: lapsed ? 'var(--risk-soft)' : 'var(--surface-2)', borderRadius: 6 }}>
                <span className="font-medium" style={{ minWidth: 140 }}>{nameOf(q.vendorId)}{q.extensionAsked && <Pill tone="warn">asked</Pill>}</span>
                <span className="text-[12px]" style={{ color: lapsed ? 'var(--risk)' : 'var(--ink-soft)' }}>{q.holdUntil ? `${fmtDate(q.holdUntil)} · ${lapsed ? `lapsed ${daysAgo(q.holdUntil)}d ago` : `${-daysAgo(q.holdUntil)}d left`}` : 'no hold given'}</span>
                <div className="flex-1" />
                <Input type="date" value={val} onChange={e => setExtDates(d => ({ ...d, [q.id]: e.target.value }))} style={{ width: 150, padding:'3px 6px' }} />
                <Button size="sm" variant={lapsed ? 'primary' : undefined} onClick={() => extendRequestOffer(r.id, opt.id, q.id, fromDateInput(val) ?? iso(addDays(TODAY, 14)))}>Extend</Button>
              </div>; })}</div>
            <div className="flex items-center gap-3 flex-wrap pt-3">
              <Button variant="primary" disabled={live.some(q => q.holdUntil && daysAgo(q.holdUntil) > 0)} onClick={() => sendOptionBack(r.id, opt.id)}>Hold extended — back to design →</Button>
              {live[0] && <button type="button" className="btn sm" title="the mill will not hold — withdraw this vendor and put another against the option" onClick={() => removeRequestOffer(r.id, opt.id, live[0].id)}>Mill won't hold — withdraw vendor</button>}
            </div>
          </> : <ActsBy role="sourcing" does="goes back to the mill, extends the hold, and sends the slot back to design" />}
        </div>}

        {/* sourcing: ONE vendor against the slot — added once, edited in place.
            Still editable after it has gone to design: a corrected article or a
            price the mill revised should not need the slot pulled back. */}
        {/* sourcing: the slot is empty — put the vendor against it. Once one is
            there, the row itself edits (the Edit button on the line). */}
        {sourcing && opt.status === 'open' && !live[0] && <div className="mt-3 pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
          <VendorEditor title={`Put a vendor against option ${opt.index}`} brief={opt.note} targetCost={r.targetCost} fabricQtyPerPc={r.bom.find(l => l.kind === 'fabric')?.qtyPerPc ?? null} current={null} onSave={v => addRequestOffer(r.id, opt.id, { fabricId: null, ...v })} />
        </div>}
        {sourcing && opt.status === 'open' && live[0] && <div className="mt-3 pt-3 flex gap-2 items-center flex-wrap" style={{ borderTop:'1px solid var(--line-soft)' }}>
          <div className="flex-1" />
          <Button variant="primary" onClick={() => sendOptionToDesign(r.id, opt.id)}>Send option {opt.index} to design →</Button>
        </div>}
        {!sourcing && opt.status === 'open' && <ActsBy role="sourcing" does={`puts one vendor against option ${opt.index} — mill, article, price, hold — and sends it to design`} />}
        {!design && opt.status === 'with-design' && <ActsBy role={['design', 'planning']} does="accepts one and raises the PO, rejects a mill, asks for more time, or closes the slot" />}

        {/* the way out, kept quiet at the foot: ten asked and seven made is a
            normal ending, but it is never the thing you came to this option for */}
        {(design || sourcing) && <div className="mt-3 pt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
          {!showClose ? <button type="button" className="vlink text-[12px]" onClick={() => setShowClose(true)}>Not going ahead with option {opt.index}?</button>
            : <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-1" style={{ minWidth: 240 }}><Field label={`Close option ${opt.index} — why`} hint={sourcing && !design ? 'nothing found at the mills; design sees the reason' : 'the reason stays on the record'}><Input autoFocus value={closeWhy} onChange={e => setCloseWhy(e.target.value)} placeholder={sourcing && !design ? 'no mill has this weight under the target' : 'nothing came in under the target cost'} /></Field></div>
              <Button size="sm" onClick={() => closeOption(r.id, opt.id, closeWhy.trim())}>Close option {opt.index}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowClose(false); setCloseWhy(''); }}>Cancel</Button>
            </div>}
        </div>}
      </>}
    </div>}
  </div>;
}

/* ---------- a new request: a category, a number, a brief ----------------------- */
export function NewRequest({ onDone, defaults }: { onDone: (id: string) => void; defaults?: { count: string | null; category: string | null; brief: string | null } }) {
  const { createOptionRequest } = useApp();
  const [category, setCategory] = useState<OptionRequest['category']>((defaults?.category as OptionRequest['category']) || 'RTW CMT shirts');
  const [count, setCount] = useState(defaults?.count || '8');
  const [brief, setBrief] = useState(defaults?.brief || '');
  const [liveBy, setLiveBy] = useState('Nov 26');
  const [cost, setCost] = useState('600');
  const [notes, setNotes] = useState<string[]>([]);
  const [bomText, setBomText] = useState('Buttons · Corozo 4-hole 16L · 11 pc\nMain label · Woven · 1 pc');
  const n = Math.max(1, Math.min(20, Number(count) || 1));
  return <>
    <Section title="What, how many, by when" collapsible={false}>
      <div className="grid gap-3" style={{ gridTemplateColumns:'2fr 1fr 1fr 1fr' }}>
        <Field label="Category"><Select value={category} onChange={v => setCategory(v as OptionRequest['category'])} options={[...GARMENT_CATEGORIES, 'MTM shirts' as const].map(c => ({ value:c, label:c }))} /></Field>
        <Field label="How many options"><Input type="number" min={1} max={20} value={count} onChange={e => setCount(e.target.value)} /></Field>
        <Field label="Live by"><Select value={liveBy} onChange={setLiveBy} options={['Oct 26', 'Nov 26', 'Dec 26', 'Jan 27', 'Feb 27'].map(x => ({ value:x, label:x }))} /></Field>
        <Field label="Target ₹ / pc"><Input type="number" value={cost} onChange={e => setCost(e.target.value)} /></Field>
        <div style={{ gridColumn:'1 / -1' }}><Field label="Why — the sentence from the meeting" hint="sourcing reads this before it reads anything else"><Input value={brief} onChange={e => setBrief(e.target.value)} placeholder="Winter casual shirts for the November drop — the book is thin above the poplins" /></Field></div>
      </div>
    </Section>
    <Section title={`The ${n} options — a word for each, if you have one`} collapsible={false}>
      <div className="grid gap-2" style={{ gridTemplateColumns:'1fr 1fr' }}>{Array.from({ length: n }, (_, i) => <Field key={i} label={`Option ${i + 1}`}><Input value={notes[i] ?? ''} onChange={e => setNotes(v => { const c = [...v]; c[i] = e.target.value; return c; })} placeholder={['a brushed check', 'plain twill, dark', 'a lighter check', 'herringbone', 'a dobby', 'corduroy', 'a dark solid', 'wildcard'][i] ?? ''} /></Field>)}</div>
    </Section>
    <Section title="Bill of materials — the trims and packaging, one per line" collapsible={false}>
      <Field label="item · spec · qty per piece" hint="stock for these is on the trims master, like cloth — the request reads it, it does not buy it"><textarea className="input" rows={4} value={bomText} onChange={e => setBomText(e.target.value)} style={{ width:'100%', font:'inherit', fontSize: 13 }} /></Field>
    </Section>
    <div className="flex gap-2"><Button variant="primary" disabled={!brief.trim()} onClick={() => onDone(createOptionRequest({ category, brief: brief.trim(), liveBy, targetCost: Number(cost) || null, optionCount: n, notes,
      bom: [{ kind:'fabric', item:'Shell fabric', spec:'per option', qtyPerPc: 1.6, unit:'m' }, ...bomText.split('\n').filter(l => l.trim()).map(l => { const [item, spec, qty] = l.split('·').map(x => x.trim()); return { kind:'trim' as const, item: item || 'Trim', spec: spec || null, qtyPerPc: Number((qty || '1').replace(/[^\d.]/g, '')) || 1, unit: (qty || '').replace(/[\d.\s]/g, '') || 'pc' }; })],
    }))}>Raise the request → sourcing</Button></div>
  </>;
}

/* ---------- one vendor against one option — the fields, editable in place ---- */
/* The one form for putting a vendor against anything — a request's option or a
   concept. Same fields, same bands, same warning against the target cost. */
export function VendorEditor({ title, brief, targetCost, fabricQtyPerPc, current, onSave, onCancel }: { title: string; brief?: string | null; targetCost: number | null; fabricQtyPerPc: number | null; current: ConceptFabricOption | null; onSave: (v: Omit<ConceptFabricOption, 'id' | 'selected' | 'fabricId'>, id: string | null) => void; onCancel?: () => void }) {
  const { db } = useApp();
  const mills = db.vendors.filter(v => v.kind.endsWith('mill'));
  const init = (c: ConceptFabricOption | null) => ({ name: c?.name ?? (brief || ''), vendorId: c?.vendorId ?? '', vendorCode: c?.vendorCode ?? '', cpm: c ? String(c.cpm) : '', moq: c ? String(c.moq) : '', leadDays: c ? String(c.leadDays) : '', composition: c?.composition ?? '100% Cotton', widthIn: c ? String(c.widthIn) : '58', book: c?.book ?? MTM_SWATCH_BOOKS[0], note: c?.note ?? '', holdUntil: c?.holdUntil ? dateInput(c.holdUntil) : '' });
  const [v, setV] = useState(init(current));
  const [editingId, setEditingId] = useState<string | null>(current?.id ?? null);
  /* the slot's vendor changed under us (saved, replaced) — pick up the new one */
  if ((current?.id ?? null) !== editingId) { setEditingId(current?.id ?? null); setV(init(current)); }
  const pickMill = (id: string) => { const m = mills.find(x => x.id === id); setV(x => ({ ...x, vendorId: id, moq: x.moq || String(m?.moq || 100), leadDays: x.leadDays || String(m?.leadDays ?? 14), holdUntil: x.holdUntil || dateInput(iso(addDays(TODAY, m?.blockWindowDays ?? 45))) })); };
  const dirty = JSON.stringify(v) !== JSON.stringify(init(current));
  const ok = !!v.vendorId && !!Number(v.cpm) && !!v.name.trim();
  const spend = Number(v.cpm || 0) * Number(v.moq || 0);
  return <>
    <div className="label" style={{ margin:'0 0 2px' }}>{title}{brief ? ` — ${brief}` : ''}</div>
    {/* Three bands in the order the mill gives them: who it is, what it costs,
        what the cloth is. Every field is label-over-input and nothing else, so
        the rows line up — the explanations sit on the labels, not under the
        boxes, because a hint under one input made its whole row ragged. */}
    <div className="vgrid pt-1">
      <div className="vgrid-cap">Who, and their article</div>
      <div style={{ gridColumn:'span 4' }}><Field label="Mill"><Select value={v.vendorId} onChange={pickMill} options={[{ value:'', label:'Pick a mill…' }, ...mills.map(m => ({ value:m.id, label:`${m.name} · holds ${m.blockWindowDays}d` }))]} /></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="Article no." hint="the mill's own article number — this goes on the PO" hintOn="label"><Input value={v.vendorCode} onChange={e => setV({ ...v, vendorCode: e.target.value })} placeholder="0944/1" /></Field></div>
      <div style={{ gridColumn:'span 5' }}><Field label="Cloth name" hint="as the mill names it" hintOn="label"><Input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></Field></div>

      <div className="vgrid-cap">The terms</div>
      <div style={{ gridColumn:'span 2' }}><Field label="₹ / m"><Input type="number" value={v.cpm} onChange={e => setV({ ...v, cpm: e.target.value })} /></Field></div>
      <div style={{ gridColumn:'span 2' }}><Field label="MOQ · m"><Input type="number" value={v.moq} onChange={e => setV({ ...v, moq: e.target.value })} /></Field></div>
      <div style={{ gridColumn:'span 2' }}><Field label="Lead · days"><Input type="number" value={v.leadDays} onChange={e => setV({ ...v, leadDays: e.target.value })} /></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="Holds until" hint="the mill's block validity — the date the price stops being promised" hintOn="label"><Input type="date" value={v.holdUntil} onChange={e => setV({ ...v, holdUntil: e.target.value })} /></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="First buy"><div className="input" style={{ background:'var(--surface-2)', color: Number(v.cpm) && Number(v.moq) ? undefined : 'var(--ink-faint)' }}>{Number(v.cpm) && Number(v.moq) ? fmtMoney(spend) : 'price × MOQ'}</div></Field></div>

      <div className="vgrid-cap">The cloth</div>
      <div style={{ gridColumn:'span 3' }}><Field label="Composition"><Input value={v.composition} onChange={e => setV({ ...v, composition: e.target.value })} /></Field></div>
      <div style={{ gridColumn:'span 2' }}><Field label="Panna (in)"><Input type="number" value={v.widthIn} onChange={e => setV({ ...v, widthIn: e.target.value })} /></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="Swatch book"><Select value={v.book} onChange={b => setV({ ...v, book: b })} options={[...MTM_SWATCH_BOOKS, 'Leggiuno Bespoke'].map(x => ({ value:x, label:x }))} /></Field></div>
      <div style={{ gridColumn:'span 4' }}><Field label="Note for design"><Input value={v.note} onChange={e => setV({ ...v, note: e.target.value })} placeholder="a shade lighter; softer hand" /></Field></div>
    </div>
    <div className="flex gap-3 items-center flex-wrap pt-2">
      <Button size="sm" variant={current ? undefined : 'primary'} disabled={!ok || (!!current && !dirty)} onClick={() => onSave({ name: v.name.trim(), vendorId: v.vendorId, vendorCode: v.vendorCode.trim(), composition: v.composition.trim(), widthIn: Number(v.widthIn) || 58, book: v.book, cpm: Number(v.cpm), moq: Number(v.moq) || 100, leadDays: Number(v.leadDays) || 14, holdUntil: fromDateInput(v.holdUntil), note: v.note.trim(), chosenBy: null, chosenOn: null, rationale:'', rejected: null, extensionAsked: null }, editingId)}>{current ? 'Save changes' : 'Save vendor'}</Button>
      {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
      {ok && targetCost != null && Number(v.cpm) * (fabricQtyPerPc ?? 1.6) > targetCost * .6 && <span className="text-[12px]" style={{ color:'var(--warn)' }}>cloth alone eats over 60% of the ₹{targetCost} target</span>}
    </div>
  </>;
}


/* ---------- the detailed ask for one option — what sourcing shops against ---------- */
function OptionAsk({ r, opt, design }: { r: OptionRequest; opt: RequestOption; design: boolean }) {
  const { db, updateOptionAsk } = useApp();
  const a = opt.ask ?? null;
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ note: opt.note, look: a?.look ?? '', composition: a?.composition ?? '', colour: a?.colour ?? '', gsm: a?.weightGsm != null ? String(a.weightGsm) : '', ref: a?.referenceFabricId ?? '', max: a?.maxCpm != null ? String(a.maxCpm) : '', notes: a?.notes ?? '' });
  const ref = a?.referenceFabricId ? db.fabrics.find(x => x.id === a.referenceFabricId) : null;
  const metresPc = r.bom.find(l => l.kind === 'fabric')?.qtyPerPc ?? null;
  const faint = { color:'var(--ink-faint)' } as const;
  if (edit && design) return <div className="mb-2 p-3" style={{ background:'var(--accent-soft)', borderRadius: 6 }}>
    <div className="label">What design asks for in option {opt.index}</div>
    <div className="grid gap-2.5" style={{ gridTemplateColumns:'repeat(3, minmax(0, 1fr))' }}>
      <div style={{ gridColumn:'1 / -1' }}><Field label="In a word"><Input value={f.note} onChange={e => setF(x => ({ ...x, note: e.target.value }))} placeholder="a dark check" /></Field></div>
      <Field label="Cloth / weave"><Input value={f.look} onChange={e => setF(x => ({ ...x, look: e.target.value }))} placeholder="brushed twill check" /></Field>
      <Field label="Composition"><Input value={f.composition} onChange={e => setF(x => ({ ...x, composition: e.target.value }))} placeholder="100% cotton" /></Field>
      <Field label="Colour"><Input value={f.colour} onChange={e => setF(x => ({ ...x, colour: e.target.value }))} placeholder="ink navy and rust" /></Field>
      <Field label="Weight · gsm"><Input type="number" value={f.gsm} onChange={e => setF(x => ({ ...x, gsm: e.target.value }))} /></Field>
      <Field label="Up to ₹ / m" hint={r.targetCost != null && metresPc ? `the cloth's share of ₹${r.targetCost}/pc` : undefined}><Input type="number" value={f.max} onChange={e => setF(x => ({ ...x, max: e.target.value }))} /></Field>
      <Field label="Close to a fabric we carry"><Select value={f.ref} onChange={v => setF(x => ({ ...x, ref: v }))} options={[{ value:'', label:'No — new cloth' }, ...db.fabrics.filter(x => x.bucket !== 'BESPOKE').slice(0, 300).map(x => ({ value:x.id, label:`${x.name} · ${x.code}` }))]} /></Field>
      <div style={{ gridColumn:'1 / -1' }}><Field label="Notes for sourcing"><Input value={f.notes} onChange={e => setF(x => ({ ...x, notes: e.target.value }))} placeholder="hand, drape, what it must not be" /></Field></div>
    </div>
    <div className="flex gap-2 pt-2"><Button size="sm" variant="primary" disabled={!f.look.trim()} onClick={() => { updateOptionAsk(r.id, opt.id, { look: f.look.trim(), composition: f.composition.trim() || null, colour: f.colour.trim() || null, weightGsm: f.gsm === '' ? null : Number(f.gsm), referenceFabricId: f.ref || null, maxCpm: f.max === '' ? null : Number(f.max), notes: f.notes.trim() }, f.note); setEdit(false); }}>Save the ask</Button><Button size="sm" variant="ghost" onClick={() => setEdit(false)}>Cancel</Button></div>
  </div>;
  return <div className="mb-2 pb-2" style={{ borderBottom:'1px solid var(--line-soft)' }}>
    <div className="flex items-baseline justify-between gap-2"><div className="label" style={{ margin:0 }}>What design asked for</div>{design && <button type="button" className="vlink text-[11.5px]" onClick={() => setEdit(true)}>{a ? 'edit the ask' : 'write the ask'}</button>}</div>
    {!a ? <div className="py-1 text-[12.5px]" style={faint}>Only "{opt.note || 'no word yet'}" — no detailed ask written for this option.</div> : <>
      <KV k="Cloth / weave" v={<b>{a.look}</b>} />
      <KV k="Composition" v={a.composition ?? 'open'} />
      <KV k="Colour" v={a.colour ?? 'open'} />
      <KV k="Weight" v={a.weightGsm != null ? `${a.weightGsm} gsm` : 'open'} />
      <KV k="Up to" v={a.maxCpm != null ? `₹${a.maxCpm} / m` : '—'} note={a.maxCpm != null && metresPc ? `≈ ₹${Math.round(a.maxCpm * metresPc)} of cloth in a ₹${r.targetCost ?? '—'} piece at ${metresPc} m/pc` : undefined} />
      {ref && <KV k="Close to" v={ref.name} note={`${ref.code} · ${db.vendors.find(v => v.id === ref.vendorId)?.name ?? ''}`} />}
      {a.notes && <KV k="Notes for sourcing" v={<span className="text-[12.5px]" style={{ whiteSpace:'normal' }}>{a.notes}</span>} />}
    </>}
  </div>;
}
