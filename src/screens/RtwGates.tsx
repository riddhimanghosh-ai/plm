/* The RTW gates the tracker sheet never had columns for: the sample the
   production unit approves before bulk, the materials it checks and issues,
   and the audit BSC's own QC does at the factory before goods leave. */
import { useState } from 'react';
import type React from 'react';
import { useApp } from '../store';
import type { ProductionOrder, SampleArea, SampleRound } from '../domain/types';
import { sampleStatusOf, materialsOf, qcStatusOf, trimFor, trimShortfall, fmtDate, fmtMoney, fmtRel, daysAgo, receiptOf, otifOf, splitOf, iso, TODAY, addDays, protoStatusOf, materialsCoverOf, factoryStateOf, fabricStateOf, rtwDocsOf, RTW_DOCS } from '../domain/engines';
import { Files } from './Files';
import { FabricQuoteBoard } from './Sourcing';
import { dateInput, fromDateInput } from '../ui';
import { SAMPLE_AREAS, RTW_SIZES } from '../domain/reference';
import { Section, Pill, Button, Input, Select, Field, KV, Note } from '../ui';
import { VendorLink } from './Vendors';
import { ActsBy, OwnerPill } from './Who';

export function SampleSection({ o, editable }: { o: ProductionOrder; editable: boolean }) {
  const { submitSample, reviewSample } = useApp();
  const s = sampleStatusOf(o);
  const [draft, setDraft] = useState<SampleRound['comments']>([]);
  const [area, setArea] = useState<SampleArea>('Stitching'); const [text, setText] = useState(''); const [major, setMajor] = useState(true);
  const postPo = o.status === 'Open' || o.status === 'Closed';
  const tone = s.state === 'approved' ? 'good' : s.state === 'resubmit' ? 'risk' : s.state === 'with production unit' ? 'warn' : 'neutral';
  return (
    <Section title="Sample approval · PP go-ahead" right={<div className="flex gap-2 items-center"><Pill tone={tone}>{s.state}</Pill><OwnerPill editable={editable} owner="Production unit" /></div>}>
      <KV k="Sample from" v={o.vendorId ? <VendorLink id={o.vendorId} /> : 'the bulk factory, once allocated'} note="as the tracker has it: PPS Submission follows the PO — the bulk factory makes the PP sample from the tech pack and job card; the production unit approves it" />
      {!postPo && <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Starts after the PO is raised.</div>}
      {postPo && s.rounds.length === 0 && <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>No sample has reached the production unit yet.</div>}
      {postPo && !editable && s.state !== 'approved' && <ActsBy role="production" does={s.state === 'with production unit' ? 'reviews the round — PP go-ahead, or send back' : 'logs the sample round when it reaches the unit'} />}
      {s.rounds.map(r => <div key={r.round} className="kv" style={{ alignItems:'flex-start' }}>
        <span className="k"><b style={{ color:'var(--ink)' }}>Round {r.round}</b> · received {fmtDate(r.submittedOn)}{r.reviewedOn ? ` · reviewed ${fmtDate(r.reviewedOn)} by ${r.reviewedBy}` : ` · ${daysAgo(r.submittedOn)}d on the desk`}
          {r.comments.length > 0 && <div className="text-[11.5px] mt-1">{r.comments.map((c, i) => <div key={i}><span style={{ color: c.major ? 'var(--risk)' : 'var(--ink-faint)' }}>{c.major ? 'major' : 'minor'}</span> · {c.area} — {c.text}</div>)}</div>}</span>
        <span className="v"><Pill tone={r.decision === 'approved' ? 'good' : r.decision === 'resubmit' ? 'risk' : 'warn'}>{r.decision === 'approved' ? 'PP go-ahead' : r.decision === 'resubmit' ? 'green slip · resubmit' : 'under review'}</Pill></span>
      </div>)}
      {editable && s.state === 'with production unit' && s.last && <div className="pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div className="label">Review round {s.last.round} — comments for the green slip</div>
        <div className="grid gap-2 py-1 items-end" style={{ gridTemplateColumns:'1.2fr 2.4fr auto auto' }}>
          <Select value={area} onChange={v => setArea(v as SampleArea)} options={SAMPLE_AREAS.map(a => ({ value:a, label:a }))} />
          <Input value={text} onChange={e => setText(e.target.value)} placeholder="what is wrong, precisely" />
          <label className="text-[12px] flex items-center gap-1"><input type="checkbox" checked={major} onChange={e => setMajor(e.target.checked)} /> major</label>
          <Button size="sm" disabled={!text.trim()} onClick={() => { setDraft(d => [...d, { area, text: text.trim(), major }]); setText(''); }}>+ add</Button>
        </div>
        {draft.length > 0 && <div className="text-[12px] py-1">{draft.map((c, i) => <div key={i}><span style={{ color: c.major ? 'var(--risk)' : 'var(--ink-faint)' }}>{c.major ? 'major' : 'minor'}</span> · {c.area} — {c.text}</div>)}</div>}
        <div className="flex gap-2 pt-2 flex-wrap">
          <Button size="sm" variant="primary" disabled={draft.some(c => c.major)} onClick={() => { reviewSample(o.id, s.last!.round, draft, 'approved'); setDraft([]); }}>PP go-ahead{draft.length ? ' with comments' : ''}</Button>
          <Button size="sm" variant="danger" disabled={!draft.some(c => c.major)} onClick={() => { reviewSample(o.id, s.last!.round, draft, 'resubmit'); setDraft([]); }}>Send back — resubmit</Button>
          <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>a major comment means another round; minor ones ride into bulk</span>
        </div>
      </div>}
      {editable && postPo && o.status === 'Open' && s.state !== 'with production unit' && s.state !== 'approved' && <div className="flex gap-2 items-end pt-3 flex-wrap" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <Button size="sm" onClick={() => submitSample(o.id, o.vendorId)}>Sample round {s.rounds.length + 1} received at unit</Button>
      </div>}
      {s.state === 'approved' && <div className="pt-2"><Note tone="good">PP go-ahead {fmtDate(s.ppGoAhead!)}. Bulk may be planned; the approved sample and its comments travel with the materials to the factory.</Note></div>}
      {s.state !== 'approved' && o.status === 'Open' && <div className="pt-2"><Note tone="warn">Bulk is allocated but the sample is not approved — the factory should not be cutting yet.</Note></div>}
    </Section>
  );
}

export function MaterialsSection({ o, editable }: { o: ProductionOrder; editable: boolean }) {
  const { db, receiveMaterial, issueMaterials } = useApp();
  const m = materialsOf(o);
  const short = trimShortfall(db, o);
  return (
    <Section title={`Materials · ${m.issued}/${m.total} issued`} right={<div className="flex gap-2 items-center"><Pill tone={m.allIssued ? 'good' : m.failed ? 'risk' : m.received ? 'warn' : 'neutral'}>{m.allIssued ? 'with the factory' : m.failed ? `${m.failed} failed check` : m.received ? `${m.checked} checked of ${m.received} received` : 'nothing received'}</Pill><OwnerPill editable={editable} owner="Production unit" /></div>}>
      {m.lines.length === 0 ? <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Material lines appear once the order is allocated — one per BOM line, required = per pc × qty.</div>
        : m.lines.map(l => { const isFabric = l.bom?.kind === 'fabric'; const t = isFabric ? null : trimFor(db, l.bom?.item); const shortBy = t ? Math.max(0, l.requiredQty - t.stock) : 0;
          return <div key={l.bomIndex} className="kv"><span className="k">{l.bom?.item}
            <div className="text-[11px]">{l.requiredQty} {l.bom?.unit} required · {isFabric ? 'bought for this style from the fabric vendor' : t ? `${t.stock} ${t.unit} on the unit's shelf` : 'not on the trims master'}</div></span>
          <span className="v flex gap-1 items-center justify-end flex-wrap">
            {l.issuedOn ? <Pill tone="good">issued {fmtDate(l.issuedOn)}</Pill>
              : isFabric ? (l.checked === 'ok' ? <Pill tone="info">checked · ready to issue</Pill> : l.checked === 'fail' ? <Pill tone="risk">failed check</Pill> : l.receivedOn ? <Pill tone="warn">received · unchecked</Pill> : <Pill tone="neutral">awaited from the vendor</Pill>)
              : shortBy > 0 ? <Pill tone="risk">short {shortBy}</Pill> : <Pill tone="info">covered from stock</Pill>}
            {editable && isFabric && !l.issuedOn && l.checked !== 'ok' && <><Button size="sm" onClick={() => receiveMaterial(o.id, l.bomIndex, 'ok')}>Received · OK</Button><Button size="sm" variant="ghost" onClick={() => receiveMaterial(o.id, l.bomIndex, 'fail')}>Fail</Button></>}
          </span></div>; })}
      {short.length > 0 && <div className="pt-2"><Note tone="risk">Short on {short.map(x => `${x.item} (${x.short} more)`).join(', ')}. Trims are bulk stock at the unit — order more on Fabric master · Trims &amp; packaging before this can be issued.</Note></div>}
      {editable && m.issued < m.total && <div className="pt-2"><Button size="sm" variant="primary" disabled={short.length > 0} onClick={() => issueMaterials(o.id)}>Issue materials to factory</Button></div>}
      <div className="pt-2"><Note>Fabric is bought per style; trims come from head-office bulk stock — issuing this PO sets the Execution gates and dates both ETAs.</Note></div>
    </Section>
  );
}

export function QcSection({ o, editable }: { o: ProductionOrder; editable: boolean }) {
  const { recordQcAudit } = useApp();
  const q = qcStatusOf(o);
  const [checked, setChecked] = useState(String(Math.min(o.orderQty, 50))); const [passed, setPassed] = useState(String(Math.min(o.orderQty, 50))); const [issues, setIssues] = useState('');
  return (
    <Section title="QC audit at the factory" right={<div className="flex gap-2 items-center"><Pill tone={q.held ? 'risk' : q.released ? 'good' : 'neutral'}>{q.held ? 'goods held' : q.released ? 'released' : 'no audit yet'}</Pill><OwnerPill editable={editable} owner="BSC merchandiser & QC" /></div>}>
      {q.audits.map((a, i) => <KV key={i} k={`${fmtDate(a.at)} · ${a.by}`} v={<span>{a.passed}/{a.checked} passed <Pill tone={a.released ? 'good' : 'risk'}>{a.released ? 'released' : 'held'}</Pill></span>} note={a.issues || 'no issues noted'} />)}
      {q.checked > 0 && <KV k="Reject rate so far" v={`${Math.round((q.rejectRate ?? 0) * 100)}%`} note={`${q.checked} checked across ${q.audits.length} audit${q.audits.length === 1 ? '' : 's'}`} />}
      {!editable && o.status === 'Open' && <ActsBy role="production" does="records the QC audit and releases or holds the goods" />}
      {editable && o.status === 'Open' && <div className="pt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div className="grid gap-2 py-2" style={{ gridTemplateColumns:'1fr 1fr 2fr' }}>
          <Field label="Checked"><Input type="number" value={checked} onChange={e => setChecked(e.target.value)} /></Field>
          <Field label="Passed"><Input type="number" value={passed} onChange={e => setPassed(e.target.value)} /></Field>
          <Field label="Issues"><Input value={issues} onChange={e => setIssues(e.target.value)} placeholder="what the sample comments did not fix" /></Field>
        </div>
        <div className="flex gap-2"><Button size="sm" variant="primary" onClick={() => recordQcAudit(o.id, { checked: Number(checked), passed: Number(passed), issues: issues.trim(), released: true })}>Release</Button><Button size="sm" variant="danger" onClick={() => recordQcAudit(o.id, { checked: Number(checked), passed: Number(passed), issues: issues.trim(), released: false })}>Hold at factory</Button></div>
      </div>}
      <div className="pt-2"><Note>BSC's own QC in the factory signs off FI; a hold stops dispatch until the factory corrects the output.</Note></div>
    </Section>
  );
}

/* ---------- receipt in lots — 300 of 500 today, the balance later ------------------ */
export function ReceiptLots({ o, editable }: { o: ProductionOrder; editable: boolean }) {
  const { receiveLot } = useApp();
  const rc = receiptOf(o);
  const [cut, setCut] = useState(String(o.cutQty ?? o.orderQty));
  const spNext = splitOf(o)?.lots.find(l => l.dispatched) && splitOf(o)!.lots.filter(l => l.dispatched).reduce((a, l) => a + l.qty, 0) - rc.received;
  const [qty, setQty] = useState(String(spNext && spNext > 0 ? spNext : (rc.balance || o.orderQty)));
  const [rej, setRej] = useState('0');
  const [note, setNote] = useState('');
  const [expected, setExpected] = useState(dateInput(iso(addDays(TODAY, 7))));
  const base = Number(cut) || o.orderQty;
  const afterThis = Math.max(0, base - rc.received - rc.rejected - Number(qty) - Number(rej));
  const dispatched = o.milestones.find(m => m.key === 'Dispatch')?.actual;
  const otif = otifOf(o);
  return (
    <Section title={rc.lots.length ? `Receipt · ${rc.received} of ${rc.base} in${rc.partial ? ` · balance ${rc.balance}` : ''}` : 'Receipt'} right={<div className="flex gap-2 items-center">{rc.partial && <Pill tone="warn">partially received</Pill>}{o.status === 'Closed' && <Pill tone={otif === 'OTIF' ? 'good' : 'risk'}>{otif}</Pill>}<OwnerPill editable={editable} owner="Warehouse" /></div>}>
      {!editable && <ActsBy role="warehouse" does="counts each lot in; the PO closes when the balance lands or is closed short" />}
      {rc.lots.length > 0 && <div className="pb-1">{rc.lots.map((l, i) => <KV key={i} k={`Lot ${i + 1} · ${fmtDate(l.at)} · ${l.by}`} v={<span>{l.qty} received{l.rejected ? ` · ${l.rejected} rejected` : ''}</span>} note={[l.note, l.balanceExpectedOn ? `balance promised by ${fmtDate(l.balanceExpectedOn)}` : ''].filter(Boolean).join(' · ') || undefined} />)}
        <KV k="Cut · received · rejected · balance" v={`${rc.base} · ${rc.received} · ${rc.rejected} · ${rc.balance}`} note="computed from the lots, not typed" />
        {rc.partial && rc.lastExpected && <div className="pt-1"><Note tone={daysAgo(rc.lastExpected) > 0 ? 'risk' : 'warn'}>{rc.balance} pcs still to come — factory promised {fmtDate(rc.lastExpected)}{daysAgo(rc.lastExpected) > 0 ? `, ${daysAgo(rc.lastExpected)} days ago` : ''}. OTIF is judged on the whole order, so the balance decides it.</Note></div>}
      </div>}
      {editable && o.status === 'Open' && <div className="pt-2" style={{ borderTop: rc.lots.length ? '1px solid var(--line-soft)' : undefined }}>
        {!dispatched && <div className="pb-2"><Note tone="warn">Dispatch has not been logged by production yet — recording a lot sets the dispatch date to today.</Note></div>}
        <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'repeat(4,1fr)' }}>
          {rc.lots.length === 0 && <Field label="Cut qty" hint="factory's count"><Input type="number" value={cut} onChange={e => setCut(e.target.value)} /></Field>}
          <Field label="Received in this lot"><Input type="number" value={qty} onChange={e => setQty(e.target.value)} /></Field>
          <Field label="Rejected in this lot"><Input type="number" value={rej} onChange={e => setRej(e.target.value)} /></Field>
          <Field label="Balance after this" hint="computed"><Input value={afterThis} readOnly style={{ opacity:.6 }} /></Field>
          {afterThis > 0 && <Field label="Balance promised by"><Input type="date" value={expected} onChange={e => setExpected(e.target.value)} /></Field>}
          <div style={{ gridColumn:'1 / -1' }}><Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="first lot — factory split the dispatch · size 42 short · …" /></Field></div>
        </div>
        <div className="flex gap-2 flex-wrap pt-1">
          {afterThis > 0
            ? <><Button variant="primary" size="sm" onClick={() => receiveLot(o.id, { qty: Number(qty), rejected: Number(rej), note: note.trim(), balanceExpectedOn: fromDateInput(expected), cutQty: rc.lots.length ? undefined : base })}>Record lot · keep PO open for {afterThis}</Button>
               <Button variant="danger" size="sm" onClick={() => receiveLot(o.id, { qty: Number(qty), rejected: Number(rej), note: note.trim(), balanceExpectedOn: null, cutQty: rc.lots.length ? undefined : base, closeShort: true })}>Record & close short by {afterThis}</Button></>
            : <Button variant="primary" size="sm" onClick={() => receiveLot(o.id, { qty: Number(qty), rejected: Number(rej), note: note.trim(), balanceExpectedOn: null, cutQty: rc.lots.length ? undefined : base })}>Record lot · PO complete, close</Button>}
        </div>
        <div className="pt-2"><Note>A partial lot keeps the PO open for the balance; closing short is a logged decision that shows on OTIF as an in-full fail.</Note></div>
      </div>}
    </Section>
  );
}

/* ---------- split dispatch — agreed mid-TNA by production with the factory --------- */
export function SplitSection({ o, editable }: { o: ProductionOrder; editable: boolean }) {
  const { splitDispatch, dispatchSplitLot, clearSplit } = useApp();
  const sp = splitOf(o);
  const dispatched = !!o.milestones.find(m => m.key === 'Dispatch')?.actual;
  const [first, setFirst] = useState(String(Math.round(o.orderQty * 0.6)));
  const [firstOn, setFirstOn] = useState(dateInput(iso(addDays(TODAY, 2))));
  const [restOn, setRestOn] = useState(dateInput(iso(addDays(TODAY, 12))));
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const rest = Math.max(0, o.orderQty - Number(first));
  if (o.status !== 'Open') return null;
  if (!sp && !editable) return null;
  return (
    <Section title={sp ? `Split dispatch · ${sp.lots.map(l => l.qty).join(' + ')}` : 'Split dispatch'} right={<div className="flex gap-2 items-center">{sp && <Pill tone={sp.done ? 'good' : 'warn'}>{sp.done ? 'all lots dispatched' : `${sp.pendingQty} pcs still to ship`}</Pill>}<OwnerPill editable={editable} owner="Production" /></div>}>
      {sp ? <>
        <KV k="Agreed" v={`${fmtDate(sp.at)} · ${sp.by}`} note={sp.reason || undefined} />
        {sp.lots.map((l, i) => <div key={i} className="kv"><span className="k">Lot {i + 1} · <b style={{ color:'var(--ink)' }}>{l.qty} pcs</b><div className="text-[11px]">{l.dispatched ? 'dispatched' : `to ship by ${fmtDate(l.dispatchOn)}${daysAgo(l.dispatchOn) > 0 ? ` · ${daysAgo(l.dispatchOn)}d overdue` : ''}`}</div></span>
          <span className="v">{l.dispatched ? <Pill tone="good">dispatched</Pill> : editable ? <Button size="sm" variant={i === sp.lots.findIndex(x => !x.dispatched) ? 'primary' : undefined} onClick={() => dispatchSplitLot(o.id, i)}>Dispatched · {l.qty}</Button> : <Pill tone={daysAgo(l.dispatchOn) > 0 ? 'risk' : 'warn'}>pending</Pill>}</span></div>)}
        <div className="pt-2"><Note tone={sp.lastDate && new Date(sp.lastDate) > new Date(o.targetInhouse) ? 'warn' : undefined}>The PO stays one row. The balance date has moved the Inhouse ETA's revised date, so risk and escalation follow the balance, not the first lot. The warehouse receives each lot as it lands; OTIF is judged on the whole order{sp.lastDate && new Date(sp.lastDate) > new Date(o.targetInhouse) ? ` — the balance lands after the target inhouse of ${fmtDate(o.targetInhouse)}, so on-time is already at risk` : ''}.</Note></div>
        {editable && !sp.shippedQty && <div className="pt-2"><Button size="sm" variant="ghost" onClick={() => clearSplit(o.id)}>Cancel split — ships together</Button></div>}
      </> : <>
        {!open ? <div className="flex items-center gap-3 flex-wrap py-1"><span className="text-[12.5px]" style={{ color:'var(--ink-soft)' }}>Factory can only ship part of the {o.orderQty} now? Record the agreement here instead of finding out at the gate.</span>{!dispatched && <Button size="sm" onClick={() => setOpen(true)}>Split the dispatch</Button>}</div>
        : <>
          <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'repeat(4,1fr)' }}>
            <Field label="Ships now · pcs"><Input type="number" min={1} max={o.orderQty - 1} value={first} onChange={e => setFirst(e.target.value)} /></Field>
            <Field label="First lot by"><Input type="date" value={firstOn} onChange={e => setFirstOn(e.target.value)} /></Field>
            <Field label="Balance · pcs" hint="computed"><Input value={rest} readOnly style={{ opacity:.6 }} /></Field>
            <Field label="Balance by"><Input type="date" value={restOn} onChange={e => setRestOn(e.target.value)} /></Field>
            <div style={{ gridColumn:'1 / -1' }}><Field label="Why the factory cannot ship it all"><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="fabric roll short for two sizes · line capacity taken · trims for balance arriving late" /></Field></div>
          </div>
          <div className="flex gap-2 pt-1 flex-wrap">
            <Button size="sm" variant="primary" disabled={rest <= 0 || Number(first) <= 0} onClick={() => { splitDispatch(o.id, [{ qty: Number(first), dispatchOn: fromDateInput(firstOn) ?? iso(TODAY) }, { qty: rest, dispatchOn: fromDateInput(restOn) ?? iso(addDays(TODAY, 10)) }], reason.trim()); setOpen(false); }}>Record split · {first} now, {rest} by {restOn ? fmtDate(fromDateInput(restOn)!) : '—'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          <div className="pt-2"><Note>Recording the split moves the Inhouse ETA to the balance date, so escalation and OTIF read the balance, not the first lot.</Note></div>
        </>}
      </>}
    </Section>
  );
}


/* ---------- RTW · the prototype before any cloth is sourced ----------------------
   Design asks the unit for the style on whatever shirt fabric is to hand. The unit
   logs it when it comes back; design approves it or sends it back. Only an
   approved proto (or "none needed", with a reason) lets the ask go to sourcing. */
export function ProtoSection({ o, canReview, canLog }: { o: ProductionOrder; canReview: boolean; canLog: boolean }) {
  const { logProto, reviewProto, skipProto } = useApp();
  const p = protoStatusOf(o);
  const [draft, setDraft] = useState<SampleRound['comments']>([]);
  const [area, setArea] = useState<SampleArea>('Fit'); const [text, setText] = useState(''); const [major, setMajor] = useState(true);
  const [standIn, setStandIn] = useState(o.proto?.standIn ?? '');
  const [skipWhy, setSkipWhy] = useState(''); const [skipping, setSkipping] = useState(false);
  const tone = p.state === 'approved' || p.state === 'skipped' ? 'good' : p.state === 'redo' ? 'risk' : p.state === 'with design' ? 'warn' : 'neutral';
  const faint = { color:'var(--ink-faint)' } as const;
  const sent = o.status !== 'Requirement';
  return (
    <Section title="Prototype · on a stand-in fabric" right={<div className="flex gap-2 items-center"><Pill tone={tone}>{p.state === 'skipped' ? 'none needed' : p.state}</Pill><OwnerPill editable={canReview} owner="Design" /></div>}>
      <div className="intro text-[12.5px] pb-1" style={{ color:'var(--ink-soft)' }}>Before any cloth is sourced, the unit makes the style on whatever shirt fabric is to hand. Design checks the style itself — fit, construction, proportions — not the cloth.</div>
      {o.proto?.skipped && <KV k="No prototype" v={o.proto.skipped.reason} note={`${o.proto.skipped.by} · ${fmtDate(o.proto.skipped.on)}`} />}
      {o.proto?.standIn && <KV k="Made on" v={o.proto.standIn} note="a stand-in — the real cloth comes from sourcing later" />}
      {p.rounds.map(r => <div key={r.round} className="kv" style={{ alignItems:'flex-start' }}>
        <span className="k"><b style={{ color:'var(--ink)' }}>Round {r.round}</b> · back {fmtDate(r.submittedOn)}{r.reviewedOn ? ` · reviewed ${fmtDate(r.reviewedOn)} by ${r.reviewedBy}` : ` · ${daysAgo(r.submittedOn)}d on design's desk`}
          {r.comments.length > 0 && <div className="text-[11.5px] mt-1">{r.comments.map((c, i) => <div key={i}><span style={{ color: c.major ? 'var(--risk)' : 'var(--ink-faint)' }}>{c.major ? 'major' : 'minor'}</span> · {c.area} — {c.text}</div>)}</div>}</span>
        <span className="v"><Pill tone={r.decision === 'approved' ? 'good' : r.decision === 'resubmit' ? 'risk' : 'warn'}>{r.decision === 'approved' ? 'approved' : r.decision === 'resubmit' ? 'redo' : 'with design'}</Pill></span>
      </div>)}
      {p.state === 'not started' && !sent && <div className="py-1 text-[12.5px]" style={faint}>No prototype back yet.</div>}
      {!canReview && !canLog && !p.ok && !sent && <ActsBy role={p.state === 'with design' ? 'design' : 'production'} does={p.state === 'with design' ? 'approves the prototype or sends it back' : 'makes the prototype on a stand-in fabric and logs it when it is back'} />}
      {canReview && p.state === 'with design' && p.last && <div className="pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div className="label">Review round {p.last.round}</div>
        <div className="grid gap-2 py-1 items-end" style={{ gridTemplateColumns:'1.2fr 2.4fr auto auto' }}>
          <Select value={area} onChange={v => setArea(v as SampleArea)} options={SAMPLE_AREAS.map(a => ({ value:a, label:a }))} />
          <Input value={text} onChange={e => setText(e.target.value)} placeholder="what to change, precisely" />
          <label className="text-[12px] flex items-center gap-1"><input type="checkbox" checked={major} onChange={e => setMajor(e.target.checked)} /> major</label>
          <Button size="sm" disabled={!text.trim()} onClick={() => { setDraft(d => [...d, { area, text: text.trim(), major }]); setText(''); }}>+ add</Button>
        </div>
        {draft.length > 0 && <div className="text-[12px] py-1">{draft.map((c, i) => <div key={i}><span style={{ color: c.major ? 'var(--risk)' : 'var(--ink-faint)' }}>{c.major ? 'major' : 'minor'}</span> · {c.area} — {c.text}</div>)}</div>}
        <div className="flex gap-2 pt-2 flex-wrap">
          <Button size="sm" variant="primary" disabled={draft.some(c => c.major)} onClick={() => { reviewProto(o.id, p.last!.round, draft, 'approved'); setDraft([]); }}>Approve{draft.length ? ' with comments' : ''}</Button>
          <Button size="sm" variant="danger" disabled={!draft.some(c => c.major)} onClick={() => { reviewProto(o.id, p.last!.round, draft, 'resubmit'); setDraft([]); }}>Redo</Button>
          <span className="text-[11.5px]" style={faint}>a major comment means another prototype; minor ones go into the tech pack</span>
        </div>
      </div>}
      {canLog && !sent && p.state !== 'with design' && !p.ok && <div className="flex gap-2 items-end pt-3 flex-wrap" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div style={{ minWidth: 220 }}><Field label="Made on (stand-in fabric)"><Input value={standIn} onChange={e => setStandIn(e.target.value)} placeholder="e.g. white poplin from the shelf" /></Field></div>
        <Button size="sm" variant="primary" onClick={() => logProto(o.id, standIn)}>Prototype round {p.rounds.length + 1} is back</Button>
      </div>}
      {canReview && !sent && !p.ok && p.state !== 'with design' && <div className="pt-2">{skipping
        ? <div className="flex gap-2 items-end flex-wrap"><div style={{ flex:'1 1 260px' }}><Field label="Why no prototype" hint="a repeat, or a minor variant of a live style"><Input value={skipWhy} onChange={e => setSkipWhy(e.target.value)} placeholder="e.g. repeat of the AW25 oxford, sizes unchanged" /></Field></div><Button size="sm" variant="primary" disabled={!skipWhy.trim()} onClick={() => { skipProto(o.id, skipWhy.trim()); setSkipping(false); }}>Record it</Button><Button size="sm" variant="ghost" onClick={() => setSkipping(false)}>Cancel</Button></div>
        : <button type="button" className="vlink text-[12px]" onClick={() => setSkipping(true)}>No prototype needed for this style…</button>}</div>}
      {p.state === 'approved' && <div className="pt-2"><Note tone="good">Prototype approved on round {p.approved!.round}. The BOM and tech pack come next; then the ask goes to sourcing.</Note></div>}
    </Section>
  );
}

/* ---------- RTW · after the fabric PO: the other BOM items into inventory --------
   Sourcing walks every trim and packaging line against stock at the unit,
   raises a bulk order where this order's need exceeds the shelf, and signs
   the lot off as covered. The materials step at the factory stays red until then. */
export function MaterialsCoverSection({ o, editable }: { o: ProductionOrder; editable: boolean }) {
  const { orderTrims, markMaterialsCovered } = useApp();
  const { db } = useApp();
  const mc = materialsCoverOf(db, o);
  const [qty, setQty] = useState<Record<number, string>>({});
  const faint = { color:'var(--ink-faint)' } as const;
  const afterPo = !!o.sourcing?.fabricPo || !o.fabricNominated;
  return (
    <Section title="Trims & packaging" right={<div className="flex gap-2 items-center"><Pill tone={mc.signedOff ? 'good' : mc.short.length ? 'risk' : mc.allCovered ? 'info' : 'neutral'}>{mc.signedOff ? 'covered' : mc.short.length ? `${mc.short.length} short` : mc.allCovered ? 'on the shelf · sign off' : 'no trim lines'}</Pill><OwnerPill editable={editable} owner="Sourcing" /></div>}>
      {!afterPo && <div className="py-1 text-[12.5px]" style={faint}>Starts once the fabric PO is raised — trims and packaging are checked against the unit's shelf for this order's quantity.</div>}
      {afterPo && mc.lines.map(l => <div key={l.bomIndex} className="kv"><span className="k">{l.item}<div className="text-[11px]">{l.needed} {l.unit} needed · {l.trim ? `${l.onHand} on the shelf${l.incoming ? ` · ${l.incoming} on order` : ''}` : 'not on the trims master'}</div></span>
        <span className="v flex gap-1 items-center justify-end flex-wrap">
          {l.short > 0 ? <Pill tone="risk">short {l.short}</Pill> : l.shortOfShelf > 0 ? <Pill tone="warn">on order · {l.incoming}</Pill> : <Pill tone="info">covered</Pill>}
          {editable && l.trim && l.short > 0 && <><Input type="number" min={1} value={qty[l.bomIndex] ?? String(l.short)} onChange={e => setQty(q => ({ ...q, [l.bomIndex]: e.target.value }))} style={{ width: 84, padding:'4px 8px' }} /><Button size="sm" onClick={() => orderTrims(l.trim!.id, Number(qty[l.bomIndex] ?? l.short) || l.short)}>Bulk order</Button></>}
        </span></div>)}
      {afterPo && !editable && !mc.signedOff && <ActsBy role="sourcing" does="checks each trim line against the unit's shelf, raises bulk orders where short, and signs the lot off" />}
      {afterPo && editable && !mc.signedOff && <div className="pt-2 flex gap-2 items-center flex-wrap"><Button size="sm" variant="primary" disabled={mc.short.length > 0} onClick={() => markMaterialsCovered(o.id)}>Materials covered</Button><span className="text-[11.5px]" style={faint}>{mc.short.length ? 'every line must be on the shelf or on a dated order first' : 'signs the trims and packaging off for this order'}</span></div>}
      {mc.signedOff && <div className="pt-2"><Note tone="good">Covered {fmtDate(o.materialsCovered!.on)} by {o.materialsCovered!.by}. The factory's materials step can go green once the lines are issued.</Note></div>}
    </Section>
  );
}


/* ---------- RTW · the documents the factory needs with the PO -------------------
   Job card, trim card, BOM, tech pack. Design is often late with them; the
   checklist says what is still owed, before and after the PO. */
export function DocsChecklist({ o, editable }: { o: ProductionOrder; editable: boolean }) {
  const { db } = useApp();
  const d = rtwDocsOf(db, o);
  return <div>
    <div className="flex items-center gap-2 flex-wrap pb-1">
      {([...RTW_DOCS, 'BOM'] as string[]).map(k => { const ok = !d.missing.includes(k); const fromLines = k === 'BOM' || k === 'Trim card'; return <span key={k} title={fromLines ? 'built from the BOM lines on this record' : 'attached as a file'}><Pill tone={ok ? 'good' : o.poNo ? 'risk' : 'warn'}>{ok ? '✓ ' : ''}{k}{ok ? (fromLines ? ' · from the BOM' : '') : ' · missing'}</Pill></span>; })}
      {o.factoryPo && <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>went with the PO: {o.factoryPo.docsSent.join(', ') || 'nothing'}{d.owedAfterPo.length ? ` · still owed: ${d.owedAfterPo.join(', ')}` : ''}</span>}
    </div>
    <Files kind="order" subjectId={o.id} labels={['Tech pack', 'Job card', 'PAT / CAD']} onlyLabels editable={editable} compact title="Documents for the factory" emptyText="Nothing attached yet." hint="attach before the PO and they travel with it; attach after and the factory is told" />
  </div>;
}

/* ---------- RTW · factory finalisation, as Nitin runs it --------------------------
   Production proposes a factory with the cost and date it agreed on the phone;
   design accepts, or sends it back with a comment; design raises the PO. */
export function FactoryFinalisationSection({ o, columns, bare }: { o: ProductionOrder; columns?: React.ReactNode; bare?: boolean }) {
  const { db, role, proposeFactory, decideFactory, raiseFactoryPo } = useApp();
  const st = factoryStateOf(o);
  const isProd = role === 'production' || role === 'owner';
  const isDesign = role === 'design' || role === 'planning' || role === 'owner';
  const factories = db.vendors.filter(v => v.kind.endsWith('factory') && v.kind !== 'Hemming unit');
  const name = (id: string) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const [vendorId, setVendorId] = useState(st.last?.vendorId ?? ''); const [cost, setCost] = useState(st.last ? String(st.last.quotedCost) : ''); const [eta, setEta] = useState(st.last ? dateInput(st.last.estimatedInhouse) : dateInput(o.targetInhouse)); const [note, setNote] = useState('');
  const [comment, setComment] = useState(''); const [proposing, setProposing] = useState(false);
  const faint = { color:'var(--ink-faint)' } as const;
  const docs = rtwDocsOf(db, o);
  const canPropose = isProd && o.status !== 'Requirement' && !o.poNo && (st.key === 'to-propose' || st.key === 'rejected' || st.key === 'with-design');
  const body = <>
      {columns}
      <div className="intro text-[12.5px] pb-2" style={{ color:'var(--ink-soft)' }}>Production picks a factory and agrees a price and a date with it on the phone, then puts that to design. Design accepts, or sends it back with a comment; production changes the factory or renegotiates. On acceptance design raises the PO, and the documents on the record go with it.</div>
      {st.key === 'not-sent' && <div className="py-1 text-[12.5px]" style={faint}>Design has not sent the requirement to production yet.</div>}
      {(o.factoryProposals ?? []).map((p, i) => <div key={p.id} className="kv" style={{ alignItems:'flex-start' }}>
        <span className="k"><b style={{ color:'var(--ink)' }}>{i + 1}. {name(p.vendorId)}</b> · ₹{p.quotedCost}/pc <span style={{ color: p.quotedCost > o.targetCost ? 'var(--risk)' : 'var(--good)' }}>({p.quotedCost > o.targetCost ? `₹${p.quotedCost - o.targetCost} over` : 'within'} target ₹{o.targetCost})</span> · in-house {fmtDate(p.estimatedInhouse)} <span style={{ color: p.estimatedInhouse > o.targetInhouse ? 'var(--risk)' : 'var(--good)' }}>({p.estimatedInhouse > o.targetInhouse ? `${daysAgo(o.targetInhouse) * -1 - daysAgo(p.estimatedInhouse) * -1}d past target` : 'before target'})</span>
          <div className="text-[11px]">proposed {fmtRel(p.proposedOn)} by {p.by}{p.note ? ` · ${p.note}` : ''}</div>
          {p.decision && <div className="text-[11.5px]" style={{ color: p.decision.accepted ? 'var(--good)' : 'var(--risk)' }}>{p.decision.accepted ? 'accepted' : 'sent back'} by {p.decision.by} {fmtRel(p.decision.on)}{p.decision.comment ? ` — "${p.decision.comment}"` : ''}</div>}</span>
        <span className="v"><Pill tone={p.decision ? (p.decision.accepted ? 'good' : 'risk') : 'info'}>{p.decision ? (p.decision.accepted ? 'accepted' : 'sent back') : 'with design'}</Pill></span>
      </div>)}
      {/* design decides */}
      {st.key === 'with-design' && st.last && (isDesign ? <div className="pt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <Field label="Comment to production" hint="why it is sent back, or what to hold them to"><Input value={comment} onChange={e => setComment(e.target.value)} placeholder="e.g. too costly — ask them for ₹1,800 or try Golden Seams" /></Field>
        <div className="flex gap-2 pt-2"><Button size="sm" variant="primary" onClick={() => { decideFactory(o.id, st.last!.id, true, comment.trim()); setComment(''); }}>Accept factory</Button><Button size="sm" variant="danger" onClick={() => { decideFactory(o.id, st.last!.id, false, comment.trim()); setComment(''); }}>Send back</Button></div>
      </div> : <ActsBy role="design" does="accepts the factory, or sends it back with a comment" />)}
      {/* design raises the PO */}
      {st.key === 'accepted' && (isDesign ? <div className="pt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
        {docs.missing.length > 0 && <div className="pb-2"><Note tone="warn">The PO will go without {docs.missing.join(', ')} — the factory is told what is still owed, and it stays on your Today until attached.</Note></div>}
        <Button size="sm" variant="primary" onClick={() => raiseFactoryPo(o.id)}>Raise PO to {name(st.accepted!.vendorId)}</Button>
        <span className="text-[11.5px] pl-2" style={faint}>₹{st.accepted!.quotedCost}/pc · {o.orderQty} pcs · the TNA is generated from the PO date</span>
      </div> : <ActsBy role="design" does="raises the PO to the accepted factory" />)}
      {o.poNo && <div className="pt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <KV k="PO" v={<b>{o.poNo}</b>} note={`${fmtDate(o.poDate)}${o.factoryPo ? ` · raised by ${o.factoryPo.by}` : ''}`} />
        <KV k="Factory · merchant" v={<><VendorLink id={o.vendorId} /> · {o.merchant ?? '—'}</>} />
        <KV k="Agreed cost" v={o.finalFob != null ? fmtMoney(o.finalFob) : '—'} note={`target ${fmtMoney(o.targetCost)}`} />
        {o.factoryPo && <KV k="Documents with the PO" v={o.factoryPo.docsSent.join(', ') || 'none'} note={docs.owedAfterPo.length ? `still owed: ${docs.owedAfterPo.join(', ')}` : o.factoryPo.docsMissing.length ? 'owed documents have since been attached' : 'complete'} />}
      </div>}
      {/* production proposes / re-proposes */}
      {canPropose && (proposing || st.key !== 'with-design' ? <div className="pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div className="label">{st.key === 'rejected' ? 'Propose again — another factory, or the same one renegotiated' : st.key === 'with-design' ? 'Replace the proposal with design' : 'Propose a factory'}</div>
        <div className="grid gap-2.5 items-end" style={{ gridTemplateColumns:'1.4fr .8fr 1fr 1.4fr auto' }}>
          <Field label="Factory"><Select value={vendorId} onChange={setVendorId} options={[{ value:'', label:'Pick…' }, ...factories.map(f => ({ value:f.id, label:`${f.name} · ${f.location ?? f.kind}` }))]} /></Field>
          <Field label="Cost / pc" hint={`target ₹${o.targetCost}`}><Input type="number" value={cost} onChange={e => setCost(e.target.value)} /></Field>
          <Field label="In-house by" hint={`target ${fmtDate(o.targetInhouse)}`}><Input type="date" value={eta} onChange={e => setEta(e.target.value)} /></Field>
          <Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="what was agreed on the call" /></Field>
          <Button size="sm" variant="primary" disabled={!vendorId || !Number(cost) || !eta} onClick={() => { proposeFactory(o.id, vendorId, Number(cost), fromDateInput(eta) ?? o.targetInhouse, note.trim()); setNote(''); setProposing(false); }}>Send to design</Button>
        </div>
      </div> : <div className="pt-2"><button type="button" className="vlink text-[12px]" onClick={() => setProposing(true)}>Replace this proposal…</button></div>)}
      {!isProd && (st.key === 'to-propose' || st.key === 'rejected') && <ActsBy role="production" does="agrees a price and a date with a factory and proposes it to design" />}
  </>;
  if (bare) return body;
  return (
    <Section title="Factory finalisation" right={<div className="flex gap-2 items-center"><Pill tone={st.tone}>{st.label}</Pill><span className={`pill role-${st.owner}`}>{st.owner === 'production' ? 'Production · Nitin' : st.owner === 'design' ? 'Design' : st.owner}</span></div>} ownerRole={st.owner === 'merchandiser' ? 'production' : st.owner}>{body}</Section>
  );
}

/* ---------- RTW · fabric finalisation, after the PO -------------------------------
   Sourcing records the mill and the cloth, buys it and sends it straight to the
   factory; the factory confirms what landed; short or damaged cloth asks design
   for a new cut ratio, which production sends on. */
export function FabricFinalisationSection({ o, bare, columns }: { o: ProductionOrder; bare?: boolean; columns?: React.ReactNode }) {
  const { db, role, saveFabricDetails, markFabricSent, confirmFabricReceipt, askCutRatio, giveCutRatio, sendCutRatio } = useApp();
  const st = fabricStateOf(o);
  const isSourcing = role === 'sourcing' || role === 'owner';
  const isProd = role === 'production' || role === 'owner';
  const isFactory = role === 'merchandiser' || role === 'production' || role === 'owner';
  const isDesign = role === 'design' || role === 'planning' || role === 'owner';
  const mills = db.vendors.filter(v => v.kind.endsWith('mill'));
  const [f, setF] = useState({ vendorId: o.fabricVendorId ?? '', code: o.vendorFabricCode ?? '', enigma: o.enigmaCode ?? '', cpm: o.costing.cpm != null ? String(o.costing.cpm) : '', blocked: o.fabricBlocked != null ? String(o.fabricBlocked) : '', cons: o.costing.consumption != null ? String(o.costing.consumption) : '' });
  const [editing, setEditing] = useState(false);
  const [sent, setSent] = useState(o.fabricMetres != null ? String(o.fabricMetres) : '');
  const [ok, setOk] = useState(''); const [dmg, setDmg] = useState('0'); const [rnote, setRnote] = useState('');
  const [reason, setReason] = useState(''); const [ratio, setRatio] = useState<Record<string, string>>({});
  const [cutShort, setCutShort] = useState(false); const [short, setShort] = useState<Record<string, string>>({});
  const faint = { color:'var(--ink-faint)' } as const;
  const nameOf = (id: string | null) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const fs = o.fabricSupply;
  const body = <>
      {columns}
      {st.key === 'vendor-sources' && <div className="py-1 text-[12.5px]" style={faint}>The factory buys its own cloth for this style — nothing for sourcing to send.</div>}
      {st.key === 'drafting' && <div className="py-1 text-[12.5px]" style={faint}>Sourcing starts the day design sends the request.</div>}
      {/* before the fabric PO: one vendor against the cloth, design pushes the PO — exactly as for an MTM fabric */}
      {(st.key === 'add-vendor' || st.key === 'with-design' || st.key === 'extension') && <>
        <div className="intro text-[12.5px] pb-2" style={{ color:'var(--ink-soft)' }}>Sourcing puts one vendor against the cloth with its price, minimum, lead time and how long the mill will hold it. Design pushes the fabric PO, rejects the vendor, or asks for more time. The PO mints the Enigma fabric code and fills in the fabric details here and on the tracker.</div>
        <FabricQuoteBoard o={o} />
      </>}
      {o.sourcing?.fabricPo && <>
        {editing && isSourcing ? <>
          <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'repeat(3, 1fr)' }}>
            <Field label="Fabric vendor (mill)"><Select value={f.vendorId} onChange={v => setF(x => ({ ...x, vendorId: v }))} options={[{ value:'', label:'Pick the mill…' }, ...mills.map(m => ({ value:m.id, label:m.name }))]} /></Field>
            <Field label="Vendor fabric code"><Input value={f.code} onChange={e => setF(x => ({ ...x, code: e.target.value }))} placeholder="Verdi SOK#24594" /></Field>
            <Field label="Enigma code"><Input value={f.enigma} onChange={e => setF(x => ({ ...x, enigma: e.target.value }))} placeholder="FORPDOSOPI-81" /></Field>
            <Field label="Fabric CPM · ₹/m" hint="leave blank if not agreed yet"><Input type="number" value={f.cpm} onChange={e => setF(x => ({ ...x, cpm: e.target.value }))} /></Field>
            <Field label="Fabric blocked · m"><Input type="number" value={f.blocked} onChange={e => setF(x => ({ ...x, blocked: e.target.value }))} /></Field>
            <Field label="Planned consumption · m/pc"><Input type="number" step="0.01" value={f.cons} onChange={e => setF(x => ({ ...x, cons: e.target.value }))} /></Field>
          </div>
          <div className="flex gap-2 pt-1"><Button size="sm" variant="primary" onClick={() => { saveFabricDetails(o.id, { fabricVendorId: f.vendorId || null, vendorFabricCode: f.code.trim() || null, enigmaCode: f.enigma.trim() || null, cpm: f.cpm === '' ? null : Number(f.cpm), fabricBlocked: f.blocked === '' ? null : Number(f.blocked), consumption: f.cons === '' ? null : Number(f.cons) }); setEditing(false); }}>Save fabric details</Button>{o.fabricVendorId && <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}</div>
        </> : <>
          <KV k="Fabric PO" v={<b>{o.sourcing.fabricPo.no}</b>} note={`raised ${fmtDate(o.sourcing.fabricPo.on)} · ${o.sourcing.fabricPo.metres} m · the details below came from it`} />
          {isSourcing && !fs?.sentToFactoryOn && <div className="pt-1"><Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit fabric details</Button></div>}
        </>}
        <div className="pt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
          <div className="flex gap-2 flex-wrap items-center text-[12.5px]">
            <Pill tone="good">{`fabric PO ${fmtDate(o.sourcing.fabricPo.on)}`}</Pill>
            <Pill tone={fs?.sentToFactoryOn ? 'good' : 'neutral'}>{fs?.sentToFactoryOn ? `sent to ${nameOf(o.vendorId)} ${fmtDate(fs.sentToFactoryOn)} · ${fs.metresSent ?? '—'} m` : 'not sent to the factory'}</Pill>
            <Pill tone={fs?.receipt ? (st.short > 0 ? 'risk' : 'good') : 'neutral'}>{fs?.receipt ? `factory counted ${fs.receipt.metresOk} m usable${fs.receipt.metresDamaged ? `, ${fs.receipt.metresDamaged} m damaged` : ''}` : 'not yet counted at the factory'}</Pill>
          </div>
          {isSourcing && !fs?.sentToFactoryOn && !o.poNo && <div className="pt-2 text-[12.5px]" style={faint}>The cloth goes straight to the factory, so it waits until design has raised the PO to one.</div>}
          {isSourcing && o.poNo && !fs?.sentToFactoryOn && <div className="flex gap-2 items-end pt-2"><div style={{ width: 140 }}><Field label="Metres sent"><Input type="number" value={sent} onChange={e => setSent(e.target.value)} /></Field></div><Button size="sm" variant="primary" onClick={() => markFabricSent(o.id, sent === '' ? null : Number(sent))}>Sent to {nameOf(o.vendorId)}</Button></div>}
          {!isSourcing && !fs?.sentToFactoryOn && <ActsBy role="sourcing" does="records the mill and the cloth, buys it, and sends it straight to the factory" />}
          {fs?.sentToFactoryOn && !fs.receipt && (isFactory ? <div className="pt-2">
            <div className="label">What landed at the factory</div>
            <div className="grid gap-2 items-end" style={{ gridTemplateColumns:'120px 120px 1fr auto' }}>
              <Field label="Usable · m"><Input type="number" value={ok} onChange={e => setOk(e.target.value)} placeholder={String(fs.metresSent ?? '')} /></Field>
              <Field label="Damaged · m"><Input type="number" value={dmg} onChange={e => setDmg(e.target.value)} /></Field>
              <Field label="Note"><Input value={rnote} onChange={e => setRnote(e.target.value)} placeholder="shade lot, short roll, water damage…" /></Field>
              <Button size="sm" variant="primary" disabled={ok === ''} onClick={() => confirmFabricReceipt(o.id, Number(ok), Number(dmg) || 0, rnote.trim())}>Received</Button>
            </div>
          </div> : <ActsBy role="merchandiser" does="counts the cloth in at the factory — usable and damaged" />)}
          {fs?.receipt?.note && <div className="text-[11.5px] pt-1" style={faint}>factory note: {fs.receipt.note} · {fs.receipt.by}</div>}
        </div>
        {/* short → cut ratio */}
        {(st.key === 'short' || st.cr) && <div className="pt-2 mt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
          <div className="label">Cut ratio</div>
          {st.key === 'short' && <div className="pb-2"><Note tone="risk">{st.short} m short of the {st.need} m the order needs. Two ways out, either one needs design's say: ask design for a modified ratio, or propose to cut short with what is there. (Or sourcing tops up the cloth.)</Note>
            {(isProd || isFactory) ? <>
              {!cutShort && <div className="flex gap-2 items-end pt-2 flex-wrap"><div style={{ flex:'1 1 240px' }}><Field label="Why"><Input value={reason} onChange={e => setReason(e.target.value)} placeholder={`fabric short by ${st.short} m — ${fs?.receipt?.metresDamaged ? `${fs.receipt.metresDamaged} m damaged` : 'mill sent less'}`} /></Field></div>
                <Button size="sm" variant="primary" onClick={() => { askCutRatio(o.id, reason.trim() || `fabric short by ${st.short} m`, 'ratio'); setReason(''); }}>Ask design for a modified ratio</Button>
                <Button size="sm" onClick={() => { const okm = fs?.receipt?.metresOk ?? 0; const factor = st.need ? Math.min(1, okm / st.need) : 1; setShort(Object.fromEntries(o.sizeBreakup.map(x => [x.size, String(Math.floor(x.qty * factor))]))); setCutShort(true); }}>Propose to cut short…</Button></div>}
              {cutShort && <div className="pt-2">
                <div className="text-[11.5px] pb-1" style={faint}>What the cloth that landed allows ({fs?.receipt?.metresOk} m usable{o.costing.consumption ? ` ≈ ${Math.floor((fs?.receipt?.metresOk ?? 0) / o.costing.consumption)} pcs` : ''}) — pro-rata to start with, change any size</div>
                <div className="grid gap-1.5 py-1" style={{ gridTemplateColumns:`repeat(${o.sizeBreakup.length}, minmax(52px, 1fr))` }}>{o.sizeBreakup.map(x => <Field key={x.size} label={`${x.size} · was ${x.qty}`}><Input type="number" min={0} value={short[x.size] ?? '0'} onChange={e => setShort(r => ({ ...r, [x.size]: e.target.value }))} style={{ padding:'4px 6px' }} /></Field>)}</div>
                <div className="flex gap-2 items-end flex-wrap"><div style={{ flex:'1 1 240px' }}><Field label="Why"><Input value={reason} onChange={e => setReason(e.target.value)} placeholder={`cut ${o.sizeBreakup.map(x => Number(short[x.size] ?? 0)).reduce((a, b) => a + b, 0)} of ${o.orderQty} from the cloth that landed`} /></Field></div>
                  <Button size="sm" variant="primary" onClick={() => { const bk = o.sizeBreakup.map(x => ({ size: x.size, qty: Number(short[x.size] ?? 0) || 0 })); askCutRatio(o.id, reason.trim() || `cut short to ${bk.reduce((a, x) => a + x.qty, 0)} pcs — fabric short by ${st.short} m`, 'cut-short', bk); setReason(''); setCutShort(false); }}>Propose this cut-short to design</Button>
                  <Button size="sm" variant="ghost" onClick={() => setCutShort(false)}>Cancel</Button></div>
              </div>}
            </> : <ActsBy role={['production', 'merchandiser']} does="asks design for a modified ratio or proposes a cut-short; sourcing can top the cloth up instead" />}</div>}
          {(o.cutRatios ?? []).map((cr, i) => <div key={i} className="kv" style={{ alignItems:'flex-start' }}><span className="k"><b style={{ color:'var(--ink)' }}>{cr.kind === 'cut-short' ? 'Cut-short' : 'Modified ratio'} {i + 1}</b> · {cr.reason}<div className="text-[11px]">asked {fmtRel(cr.askedOn)} by {cr.by}{cr.askedByRole === 'merchandiser' ? ' (factory)' : ''} · was {cr.originalBreakup.filter(x => x.qty).map(x => `${x.size}:${x.qty}`).join(' ')}{cr.proposedBreakup ? ` · proposed ${cr.proposedBreakup.filter(x => x.qty).map(x => `${x.size}:${x.qty}`).join(' ')} · ${cr.proposedBreakup.reduce((a, x) => a + x.qty, 0)} pcs` : ''}</div>{cr.given && <div className="text-[11px]" style={{ color:'var(--good)' }}>given {fmtRel(cr.given.on)} by {cr.given.by} · now {cr.given.breakup.filter(x => x.qty).map(x => `${x.size}:${x.qty}`).join(' ')} · {cr.given.breakup.reduce((a, x) => a + x.qty, 0)} pcs</div>}</span><span className="v"><Pill tone={cr.sentToFactoryOn ? 'good' : cr.given ? 'warn' : 'risk'}>{cr.sentToFactoryOn ? 'at the factory' : cr.given ? 'to send' : 'with design'}</Pill></span></div>)}
          {st.key === 'ratio-asked' && (isDesign ? <div className="pt-1">
            <div className="text-[11.5px] pb-1" style={faint}>New quantities per size for the cloth that is there ({fs?.receipt?.metresOk} m usable{o.costing.consumption ? ` ≈ ${Math.floor((fs?.receipt?.metresOk ?? 0) / o.costing.consumption)} pcs` : ''})</div>
            <div className="grid gap-1.5 py-1" style={{ gridTemplateColumns:`repeat(${o.sizeBreakup.length}, minmax(52px, 1fr))` }}>{o.sizeBreakup.map(x => { const prop = st.cr?.proposedBreakup?.find(p => p.size === x.size)?.qty; return <Field key={x.size} label={`${x.size}${prop != null ? ` · proposed ${prop}` : ''}`}><Input type="number" min={0} value={ratio[x.size] ?? String(prop ?? x.qty)} onChange={e => setRatio(r => ({ ...r, [x.size]: e.target.value }))} style={{ padding:'4px 6px' }} /></Field>; })}</div>
            <div className="flex gap-2 items-center flex-wrap"><Button size="sm" variant="primary" onClick={() => giveCutRatio(o.id, o.sizeBreakup.map(x => ({ size: x.size, qty: Number(ratio[x.size] ?? st.cr?.proposedBreakup?.find(p => p.size === x.size)?.qty ?? x.qty) || 0 })))}>{st.cr?.kind === 'cut-short' ? 'Approve the cut-short' : 'Give this cut ratio'}</Button>{st.cr?.kind === 'cut-short' && <span className="text-[11.5px]" style={faint}>change any size before approving if the mix should differ</span>}</div>
          </div> : <ActsBy role="design" does="gives the new size-wise quantities for the cloth that is there" />)}
          {st.key === 'ratio-given' && (isProd ? <div className="pt-1"><Button size="sm" variant="primary" onClick={() => sendCutRatio(o.id)}>Send the new ratio to {nameOf(o.vendorId)}</Button></div> : <ActsBy role="production" does="sends the new cut ratio to the factory" />)}
        </div>}
      </>}
  </>;
  if (bare) return body;
  return (
    <Section title="Fabric finalisation" right={<div className="flex gap-2 items-center"><Pill tone={st.tone}>{st.label}</Pill><span className={`pill role-${st.owner === 'merchandiser' ? 'production' : st.owner}`}>{st.owner === 'sourcing' ? 'Sourcing · Srikanth' : st.owner === 'merchandiser' ? 'Factory' : st.owner === 'design' ? 'Design' : 'Production'}</span></div>} ownerRole={st.owner === 'merchandiser' ? 'production' : st.owner}>{body}</Section>
  );
}


/* ---------- the sheet's Order Qty Break-Up: all twenty columns, 28–50 and XS–4XL ---------- */
export function SizeGrid({ breakup, edit, onChange }: { breakup: { size: string; qty: number }[]; edit?: boolean; onChange?: (size: string, qty: number) => void }) {
  const q = (sz: string) => breakup.find(x => x.size === sz)?.qty ?? 0;
  const total = breakup.reduce((a, x) => a + x.qty, 0);
  return <div className="grid gap-1 py-1" style={{ gridTemplateColumns:'repeat(auto-fill, minmax(50px, 1fr))' }}>
    {RTW_SIZES.filter(sz => edit || q(sz) > 0).map(sz => { const v = q(sz); return <div key={sz} className="rounded-[3px] px-1 py-1 text-center" style={{ background: v ? 'var(--surface-2)' : 'transparent', border: v ? '0' : '1px dashed var(--line-soft)' }}>
      <div className="text-[9.5px] mono" style={{ color:'var(--ink-faint)' }}>{sz}</div>
      {edit ? <input type="number" min={0} value={v || ''} placeholder="–" onChange={e => onChange?.(sz, Math.max(0, Number(e.target.value) || 0))} className="mono text-[12.5px] text-center" style={{ width:'100%', border:0, background:'transparent', outline:'none' }} />
        : <div className="mono text-[12.5px]" style={{ color: v ? undefined : 'var(--line)' }}>{v || '–'}</div>}
    </div>; })}
    <div className="rounded-[3px] px-1 py-1 text-center" style={{ background:'var(--accent-soft)' }}><div className="text-[9.5px] mono" style={{ color:'var(--ink-faint)' }}>Order qty</div><div className="mono text-[12.5px] font-semibold">{total}</div></div>
  </div>;
}
