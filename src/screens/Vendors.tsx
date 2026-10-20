/* Vendor master and the vendor 360 — everything the tool knows about one
   factory or mill, derived from the orders, quotes, fabrics and blocks that
   already name it. Nothing here is typed twice. The drawer is global: any
   vendor name anywhere opens it via ?vendor= on the current route. */
import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { factoryLoadOf as _fl } from '../domain/engines';
void _fl;
import { useApp } from '../store';
import type { Vendor, VendorKind } from '../domain/types';
import { vendorStatsOf, fmtDate, fmtMoney, daysAgo, riskOf, stageOf, otifOf, coverageOf, factoryLoadOf, agingOf } from '../domain/engines';
import { OutputTab, AgingTab } from './Mtm';
import { Card, Pill, Drawer, KV, Section, Note, Empty, Page, Tabs, Seg, Field, Input, Select, Button, ExportButton, usePager, Pager, Th, useExamples, type Tone } from '../ui';
import { ThreadPanel } from './Thread';
import { Files } from './Files';
import { FILE_LABELS } from '../domain/reference';

import { RISK_TONE } from './Tracker';
import { ActsBy } from './Who';
import { MTM_ONLY } from '../domain/edition';

/** A vendor name that opens the 360. Keeps whatever click is already on the row from firing. */
export function VendorLink({ id, children, className }: { id: string | null; children?: React.ReactNode; className?: string }) {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const v = db.vendors.find(x => x.id === id);
  if (!v) return <span className={className}>{children ?? '—'}</span>;
  return <button type="button" className={`vlink ${className ?? ''}`} onClick={e => { e.stopPropagation(); const n = new URLSearchParams(params); n.set('vendor', v.id); setParams(n, { replace:true }); }}>{children ?? v.name}</button>;
}

/** Mounted once in the Shell so the 360 opens from any screen. */
export function VendorDrawer() {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const v = db.vendors.find(x => x.id === params.get('vendor')) ?? null;
  const close = () => { const n = new URLSearchParams(params); n.delete('vendor'); setParams(n, { replace:true }); };
  const s = v ? vendorStatsOf(db, v.id) : null;
  /* the 360 is usually opened from inside another record — name what closing it
     returns you to, so the vendor name is not a one-way door */
  const under = params.get('open');
  const backTo = !under ? null
    : db.orders.find(o => o.id === under)?.styleName
    ?? (db.customerOrders ?? []).find(o => o.id === under)?.orderNo
    ?? (db.concepts ?? []).find(c => c.id === under)?.name
    ?? (db.launches ?? []).find(l => l.id === under)?.styleName
    ?? db.fabrics.find(f => f.id === under)?.name
    ?? 'the record';
  return (
    <Drawer open={!!v} onClose={close} title={v?.name ?? ''} back={backTo ? { label: backTo, onClick: close } : undefined}
      subtitle={v && s && <><Pill tone={GRADE_TONE[s.grade]}>{s.grade}</Pill><span>{v.kind} · {v.location} · {v.region}</span></>}>
      {v && s && <Vendor360 v={v} s={s} />}
    </Drawer>
  );
}

const GRADE_TONE: Record<string, Tone> = { Reliable:'good', Watch:'warn', Poor:'risk', 'Too new':'neutral' };

function Vendor360({ v, s }: { v: Vendor; s: ReturnType<typeof vendorStatsOf> }) {
  const { db, role, updateVendor } = useApp();
  const isMill = v.kind.endsWith('mill');
  const canEdit = role === 'sourcing' || role === 'owner';
  const [ve, setVe] = useState(false);
  return <>
    {isMill && <Section title="Vendor · as in Enigma" right={<span className="flex gap-1 items-center">{v.enigma?.active === false && <Pill tone="risk">inactive</Pill>}{canEdit && !ve && <Button size="sm" onClick={() => setVe(true)}>Edit Vendor</Button>}</span>}>
      {ve ? <VendorForm initial={vendorFormOf(v)} saveLabel="Save" onCancel={() => setVe(false)} onSave={f => { updateVendor(v.id, { name: f.name.trim() || v.name, kind: f.kind, moq: Number(f.moq) || 0, enigma: enigmaOfForm(f) }); setVe(false); }} />
      : <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', columnGap: 24 }}>
        <div><KV k="Code" v={<span className="mono">{v.enigma?.vendorCode ?? '—'}</span>} /><KV k="Name" v={v.name} /><KV k="Vendor Type" v={v.enigma?.vendorType ?? 'FABRIC'} /><KV k="Address" v={v.enigma?.address ?? v.location} /><KV k="Office Phone" v={v.enigma?.officePhone ?? '—'} /><KV k="Office Email" v={v.enigma?.officeEmail ?? '—'} /><KV k="Categories" v={(v.enigma?.categories ?? []).join(', ') || '—'} /><KV k="Active" v={v.enigma?.active === false ? 'No' : 'Yes'} /></div>
        <div><KV k="Mill Country" v={v.enigma?.country ?? '—'} /><KV k="Mill Description" v={v.enigma?.description ?? '—'} /><KV k="Currency" v={v.enigma?.currency ?? 'INR'} /><KV k="TAT (hours)" v={v.enigma?.tatHours != null ? `${v.enigma.tatHours} h` : '—'} note={`${v.leadDays} days lead`} /><KV k="MOQ" v={`${v.moq} m`} /><KV k="Cost per Unit" v="per fabric — on each fabric's record" /></div>
      </div>}
    </Section>}
    {v.mtm && (() => { const l = factoryLoadOf(db, v.id); return <Section title="MTM floor · today" right={<Pill tone={l.load > 2 ? 'warn' : 'good'}>{l.load.toFixed(1)}d load</Pill>}>
      <KV k="Average out / day" v={`${l.avgOut} pcs`} note={`last ${l.daily.length} days: ${l.daily.join(' · ')} · nominal ${l.nominal} (${v.tailors} tailors × 12)`} />
      <KV k="In factory now" v={`${l.wip.length} pcs`} note={l.aging.length ? `${l.aging.length} aging past 5 days` : 'nothing aging'} />
      <KV k="In transit to it" v={`${l.inTransit.length} pcs`} />
      <KV k="Ready, not yet back" v={`${l.ready.length} pcs`} />
      <KV k="Headroom today" v={`${l.headroom} pcs`} note="a day's output, less what is already queued" />
    </Section>; })()}
    <Section title="Master" right={<Pill tone="neutral">from the Merchandise Master</Pill>}>
      <KV k="Type" v={v.kind} note={v.kind === 'CMT factory' ? 'factory — BSC supplies the fabric and trims; it cuts, makes, packs' : v.kind === 'MTM factory' ? 'factory — single-piece MTM' : v.kind === 'Hemming unit' ? 'factory — alterations and hemming only' : `fabric vendor — third party; blocks held ${v.blockWindowDays} days`} />
      <KV k="Location" v={`${v.location} · ${v.region}`} />
      <KV k="Lead time" v={`${v.leadDays} days`} note={s.measuredLead != null ? `measured ${s.measuredLead}d on ${s.closed.length} closed PO${s.closed.length === 1 ? '' : 's'} — ${s.measuredLead > v.leadDays ? `${s.measuredLead - v.leadDays}d longer than the master says` : 'holds'}` : 'no closed PO to measure against yet'} />
      <KV k="MOQ" v={v.moq ? `${v.moq} ${isMill ? 'm' : 'pcs'}` : 'none'} />
    </Section>

    <Section title="Performance" right={<Pill tone={GRADE_TONE[s.grade]}>{s.grade}</Pill>}>
      <KV k="On time" v={`${Math.round(v.onTimeRate * 100)}%`} note="share of milestones hit on plan, historic" />
      {!isMill && <>
        <KV k="OTIF on closed POs" v={s.closed.length ? `${s.otifPct}%` : '—'} note={s.closed.length ? `${s.otifCount} of ${s.closed.length} on time and within ±3% of cut` : undefined} />
        <KV k="Average slip" v={s.avgSlip != null ? `${s.avgSlip} days` : '—'} note="days late on the last milestone that landed, across open and closed POs" />
        <KV k="Quotes" v={`${s.quotesWon} won of ${s.quotesGiven}`} note={s.avgQuoteVsWinner != null ? `on average ${s.avgQuoteVsWinner > 0 ? `${fmtMoney(s.avgQuoteVsWinner)} above` : `${fmtMoney(-s.avgQuoteVsWinner)} below`} the winning quote when they lost` : undefined} />
        <KV k="Escalations" v={s.escalations.length} note={s.escalations.filter(e => e.status === 'Open' || e.status === 'Acknowledged').length ? `${s.escalations.filter(e => e.status === 'Open' || e.status === 'Acknowledged').length} still open` : undefined} />
      </>}
      {isMill && <>
        <KV k="Fabrics supplied" v={s.fabrics.length} note={`${s.fabrics.filter(f => f.bucket === 'CORE').length} core · ${s.fabrics.filter(f => f.bucket === 'NON_CORE').length} non-core · ${s.fabrics.filter(f => f.bucket === 'BESPOKE').length} bespoke`} />
        <KV k="Below reorder point" v={s.fabricsBelowRop} note={s.fabricsBelowRop ? (v.kind === 'International mill' ? 'international — a person raises these' : 'domestic — Enigma auto-PO') : undefined} />
        <KV k="Blocks held" v={s.blocksHeld.length} note={s.blocksHeld.length ? `${s.blocksHeld.reduce((a, b) => a + b.metres, 0)} m · nearest expiry ${fmtDate([...s.blocksHeld].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn))[0].expiresOn)}` : undefined} />
      </>}
      <div className="pt-2"><Note>{s.grade === 'Poor' ? 'Late more often than not — the third thing to weigh after capacity and fabric.' : s.grade === 'Watch' ? 'Slipping — worth a conversation before the next allocation.' : s.grade === 'Too new' ? 'Not enough closed history to grade; the master lead time is a promise, not a measurement.' : 'Holding its dates — plan with the measured lead.'}</Note></div>
    </Section>

    {!isMill && <Section title={`Open POs · ${s.open.length}`}>
      {s.open.length === 0 ? <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing in production here right now.</div>
        : s.open.map(o => { const r = riskOf(o); const st = stageOf(o); return <div key={o.id} className="kv"><span className="k"><b style={{ color:'var(--ink)' }}>{o.poNo}</b> · {o.styleName}<div className="text-[11px]">{o.orderQty} pcs · {st.stage} → {st.next ?? 'complete'} · inhouse {fmtDate(o.targetInhouse)} · {o.merchant}</div></span><span className="v"><Pill tone={RISK_TONE[r.risk]}>{r.risk.replace('-', ' ')}</Pill></span></div>; })}
    </Section>}

    {!isMill && s.closed.length > 0 && <Section title={`Closed POs · ${s.closed.length}`}>
      {s.closed.slice(0, 8).map(o => <div key={o.id} className="kv"><span className="k">{o.poNo} · {o.styleName}<div className="text-[11px]">{o.deliveredQty ?? '—'} of {o.cutQty ?? o.orderQty} · FOB {o.finalFob != null ? fmtMoney(o.finalFob) : '—'}</div></span><span className="v"><Pill tone={otifOf(o) === 'OTIF' ? 'good' : 'risk'}>{otifOf(o)}</Pill></span></div>)}
      {s.closed.length > 8 && <div className="text-[11.5px] pt-1" style={{ color:'var(--ink-faint)' }}>and {s.closed.length - 8} more</div>}
    </Section>}

    {isMill && <Section title={`Fabrics · ${s.fabrics.length}`}>
      {s.fabrics.slice(0, 10).map(f => { const c = coverageOf(f, v.leadDays, v); return <div key={f.id} className="kv"><span className="k">{f.name}<div className="text-[11px] mono">{f.code} · {f.bucket.toLowerCase().replace('_', '-')}</div></span><span className="v">{f.bucket === 'BESPOKE' ? <Pill tone={f.millAvailable === false ? 'risk' : 'good'}>{f.millAvailable === false ? 'sold out at mill' : 'available'}</Pill> : <Pill tone={c.belowRop ? 'risk' : 'good'}>{c.belowRop ? 'below ROP' : `${c.coverDays > 365 ? '1y+' : c.coverDays + 'd'} cover`}</Pill>}</span></div>; })}
      {s.fabrics.length > 10 && <div className="text-[11.5px] pt-1" style={{ color:'var(--ink-faint)' }}>and {s.fabrics.length - 10} more — all on the MTM fabrics screen</div>}
    </Section>}

    {isMill && s.blocksHeld.length > 0 && <Section title="Blocks">
      {s.blocksHeld.map(b => { const left = -daysAgo(b.expiresOn); return <div key={b.id} className="kv"><span className="k">{b.fabricName}<div className="text-[11px]">{b.metres} m · agreed {fmtDate(b.agreedOn)} by {b.via}</div></span><span className="v"><Pill tone={left < 7 ? 'risk' : left <= 21 ? 'warn' : 'good'}>{left < 0 ? `expired ${-left}d` : `${left}d left`}</Pill></span></div>; })}
    </Section>}

    {s.escalations.length > 0 && <Section title="Escalations">
      {s.escalations.slice(0, 6).map(e => { const o = db.orders.find(x => x.id === e.orderId); return <div key={e.id} className="kv"><span className="k">{o?.poNo} · {o?.styleName}<div className="text-[11px]">raised {fmtDate(e.raisedAt)}{e.recoveryAction ? ` · ${e.recoveryAction}` : ''}</div></span><span className="v"><Pill tone={e.status === 'Open' ? 'risk' : e.status === 'Acknowledged' ? 'warn' : 'neutral'}>{e.status}</Pill></span></div>; })}
    </Section>}

    <Files kind="vendor" subjectId={v.id} labels={FILE_LABELS.vendor} editable />
    <ThreadPanel kind="vendor" subjectId={v.id} />
  </>;
}

/* ---------- the master list, on the Sourcing screen ---------- */
export function VendorTable({ kind }: { kind: 'factories' | 'mills' }) {
  const { db, role, updateVendor } = useApp();
  const canEdit = role === 'sourcing' || role === 'owner';
  const [params, setParams] = useSearchParams();
  const open = (id: string) => { const n = new URLSearchParams(params); n.set('vendor', id); setParams(n, { replace:true }); };
  /* You look a vendor up by three things: its name, where it is, or — for a mill
     — the cloth it makes. The last one is why the search reaches into fabrics. */
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState('all');
  const [regionF, setRegionF] = useState('all');
  const [gradeF, setGradeF] = useState('all');
  const all = db.vendors.filter(v => kind === 'factories' ? v.kind.endsWith('factory') || v.kind === 'Hemming unit' : v.kind.endsWith('mill')).map(v => ({ v, s: vendorStatsOf(db, v.id) }));
  const kinds = [...new Set(all.map(r => r.v.kind))];
  const regions = [...new Set(all.map(r => r.v.region))].sort();
  const t = q.trim().toLowerCase();
  const rows = all
    .filter(({ v, s }) => !t || [v.name, v.location, v.region, v.kind].some(x => (x ?? '').toLowerCase().includes(t))
      || (kind === 'mills' && s.fabrics.some(f => [f.name, f.code, f.vendorCode, f.composition, f.family].some(x => (x ?? '').toLowerCase().includes(t)))))
    .filter(({ v }) => typeF === 'all' || v.kind === typeF)
    .filter(({ v }) => regionF === 'all' || v.region === regionF)
    .filter(({ s }) => gradeF === 'all' || s.grade === gradeF)
    .sort((a, b) => a.s.gradeRank - b.s.gradeRank || b.s.open.length - a.s.open.length);
  const any = !!t || typeF !== 'all' || regionF !== 'all' || gradeF !== 'all';
  const clear = () => { setQ(''); setTypeF('all'); setRegionF('all'); setGradeF('all'); };
  const ex = useExamples(rows, r => r.s.grade, { noun: kind, done: r => r.s.grade === 'Reliable' && r.s.blocksHeld.length === 0 && !r.s.escalations.some(e => e.status === 'Open' || e.status === 'Acknowledged') });
  const pager = usePager(ex.rows, 20);
  const [adding, setAdding] = useState(false);
  return <>
    {kind === 'mills' && adding && <AddVendorForm onDone={id => { setAdding(false); if (id) open(id); }} />}
    <div className="flex gap-3 items-end flex-wrap mb-3">
      <div style={{ width: 280 }}><Field label={kind === 'mills' ? 'Search a mill' : 'Search a factory'} hint={kind === 'mills' ? 'name, city, or a fabric this mill makes' : 'name, city, or kind'}>
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder={kind === 'mills' ? 'Sutra, Mumbai, 2-ply poplin…' : 'Mahendra, Tiruppur, CMT…'} /></Field></div>
      <div style={{ width: 180 }}><Field label="Type"><Select value={typeF} onChange={setTypeF} options={[{ value:'all', label:`All · ${all.length}` }, ...kinds.map(k => ({ value:k, label:`${k} · ${all.filter(r => r.v.kind === k).length}` }))]} /></Field></div>
      <div style={{ width: 160 }}><Field label="Region"><Select value={regionF} onChange={setRegionF} options={[{ value:'all', label:'Anywhere' }, ...regions.map(rg => ({ value:rg, label:`${rg} · ${all.filter(r => r.v.region === rg).length}` }))]} /></Field></div>
      {kind === 'factories' && <div style={{ width: 150 }}><Field label="Grade"><Select value={gradeF} onChange={setGradeF} options={[{ value:'all', label:'Any grade' }, ...['Reliable', 'Watch', 'Poor', 'Too new'].map(g => ({ value:g, label:`${g} · ${all.filter(r => r.s.grade === g).length}` }))]} /></Field></div>}
      {any && <Button size="sm" variant="ghost" onClick={clear}>Clear · showing {rows.length}</Button>}
      {kind === 'mills' && canEdit && <Button size="sm" variant="primary" onClick={() => setAdding(a => !a)}>{adding ? 'Close' : '+ Add Vendor'}</Button>}
      <div className="flex-1" />
      <div className="pb-2">{ex.strip}</div>
      <ExportButton filename={kind === 'mills' ? 'fabric-vendors' : 'factories'} sheetName={kind === 'mills' ? 'Mills' : 'Factories'} rows={rows} cols={[
        { label: kind === 'mills' ? 'Fabric vendor' : 'Factory', get: r => r.v.name }, { label:'Type', get: r => r.v.kind },
        { label:'Location', get: r => r.v.location }, { label:'Region', get: r => r.v.region },
        { label:'Lead days', get: r => r.v.leadDays }, { label:'On time %', get: r => Math.round(r.v.onTimeRate * 100) },
        ...(kind === 'mills'
          ? [{ label:'Code', get: (r: typeof rows[number]) => r.v.enigma?.vendorCode ?? '' }, { label:'Vendor Type', get: (r: typeof rows[number]) => r.v.enigma?.vendorType ?? 'FABRIC' }, { label:'Address', get: (r: typeof rows[number]) => r.v.enigma?.address ?? '' }, { label:'Office Phone', get: (r: typeof rows[number]) => r.v.enigma?.officePhone ?? '' }, { label:'Office Email', get: (r: typeof rows[number]) => r.v.enigma?.officeEmail ?? '' }, { label:'Categories', get: (r: typeof rows[number]) => (r.v.enigma?.categories ?? []).join(', ') }, { label:'Active', get: (r: typeof rows[number]) => r.v.enigma?.active === false ? 'No' : 'Yes' }, { label:'Mill Country', get: (r: typeof rows[number]) => r.v.enigma?.country ?? '' }, { label:'Currency', get: (r: typeof rows[number]) => r.v.enigma?.currency ?? 'INR' }, { label:'TAT hours', get: (r: typeof rows[number]) => r.v.enigma?.tatHours ?? '' }, { label:'MOQ', get: (r: typeof rows[number]) => r.v.moq }, { label:'Fabrics', get: (r: typeof rows[number]) => r.s.fabrics.length }]
          : [{ label:'OTIF %', get: (r: typeof rows[number]) => r.s.closed.length ? r.s.otifPct : '' }, { label:'Open POs', get: (r: typeof rows[number]) => r.s.open.length }]),
        { label:'Grade', get: r => r.s.grade }]} />
    </div>
    {rows.length === 0 ? <Card><Empty title={all.length ? 'No vendor matches that.' : 'Nothing of this kind on the master.'} body={all.length ? (kind === 'mills' ? 'Try the city, or the name of a cloth they make.' : 'Try the city or the factory kind.') : ''} /></Card> : <>
    <Card><table className="t">
      <thead>{kind === 'factories'
        ? <tr>
            <Th>Factory</Th>
            <Th hint="CMT, FOB, MTM single-piece, or a hemming unit only.">Type</Th>
            <Th hint="City and the region it ships from.">Location</Th>
            <Th num hint="The master's own lead time, next to what has actually been measured off closed POs. Longer than the master says shows in red.">Lead · measured</Th>
            <Th num hint="Share of purchase orders that landed on or before the date promised, from the vendor's own on-time-rate field.">On time</Th>
            <Th num hint="On time AND in full — delivered by the date, at the quantity ordered, across every closed PO with this factory.">OTIF</Th>
            <Th num hint="Fabric quotes this factory has won versus how many it was asked for — how often it comes out cheapest or best-fit.">Quotes won</Th>
            <Th num hint="Purchase orders in production right now; a critical or delayed one is called out beside the count.">Open POs</Th>
            <Th>Grade</Th>
          </tr>
        : <tr>
            <Th>Code</Th>
            <Th>Name</Th>
            <Th>Vendor Type</Th>
            <Th>Address</Th>
            <Th>Office Phone</Th>
            <Th>Office Email</Th>
            <Th>Categories</Th>
            <Th>Active</Th>
            <Th num hint="Turn-around time in hours · MOQ in metres — Enigma's Vendor Information block.">TAT · MOQ</Th>
            <Th num hint="How many fabrics in the master are sourced from this mill.">Fabrics</Th>
          </tr>}</thead>
      <tbody>{pager.pageRows.map(({ v, s }) => <tr key={v.id} className="row" onClick={() => open(v.id)}>
        {kind === 'mills' && <td className="mono text-[12px]">{v.enigma?.vendorCode ?? '—'}</td>}
        <td className="font-medium">{v.name}</td>
        {kind === 'factories' ? <>
          <td className="text-[12.5px]">{v.kind}</td>
          <td className="text-[12.5px]">{v.location} <span style={{ color:'var(--ink-faint)' }}>· {v.region}</span></td>
          <td className="num">{v.leadDays}d <span style={{ color: s.measuredLead != null && s.measuredLead > v.leadDays ? 'var(--risk)' : 'var(--ink-faint)' }}>· {s.measuredLead != null ? `${s.measuredLead}d` : '—'}</span></td>
          <td className="num">{Math.round(v.onTimeRate * 100)}%</td>
          <td className="num">{s.closed.length ? `${s.otifPct}%` : '—'}</td>
          <td className="num">{s.quotesWon} / {s.quotesGiven}</td>
          <td className="num">{s.open.length}{s.open.some(o => ['critical', 'delayed'].includes(riskOf(o).risk)) && <span style={{ color:'var(--risk)' }}> · {s.open.filter(o => ['critical', 'delayed'].includes(riskOf(o).risk)).length} critical</span>}</td>
        </> : <>
          <td className="text-[12px]">{v.enigma?.vendorType ?? 'FABRIC'}<div style={{ color:'var(--ink-faint)' }}>{v.kind}</div></td>
          <td className="text-[12px]" style={{ whiteSpace:'normal', maxWidth: 220 }}>{v.enigma?.address ?? v.location}</td>
          <td className="mono text-[12px]">{v.enigma?.officePhone ?? '—'}</td>
          <td className="text-[12px]">{v.enigma?.officeEmail ?? '—'}</td>
          <td className="text-[12px]">{(v.enigma?.categories ?? []).map(c => <Pill key={c} tone="neutral">{c}</Pill>)}</td>
          <td>{v.enigma?.active === false ? <Pill tone="risk">No</Pill> : <Pill tone="good">Yes</Pill>}</td>
          <td className="num text-[12px]">{v.enigma?.tatHours != null ? `${v.enigma.tatHours} h` : `${v.leadDays * 24} h`} · {v.moq} m</td>
          <td className="num">{s.fabrics.length}{s.fabricsBelowRop ? <div className="text-[11px]" style={{ color:'var(--risk)' }}>{s.fabricsBelowRop} under ROP</div> : null}</td>
        </>}
        {kind === 'factories' && <td><Pill tone={GRADE_TONE[s.grade]}>{s.grade}</Pill></td>}
      </tr>)}</tbody>
    </table>
    <Pager page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} from={pager.from} to={pager.to} total={pager.total} noun={kind} />
    </Card></>}
    {kind === 'mills' ? <div className="mt-3"><Note>The same columns as Enigma's vendor list. Mill country, currency, TAT and MOQ sit on the vendor's record; cost per unit is per fabric.</Note></div>
    : <div className="mt-3"><Note><b>Reliable</b> holds its dates, <b>Watch</b> is slipping, <b>Poor</b> is late more often than not, all measured from the orders.</Note></div>}
  </>;
}

/* ---------- Enigma's Add Vendor form, field for field ---------- */
const VENDOR_FORM_BLANK = { code: '', name: '', vendorType: 'FABRIC', kind: 'Domestic mill' as VendorKind, address: '', officePhone: '', officeEmail: '', active: true, categories: 'Fabric', country: 'India', description: '', currency: 'INR' as 'INR' | 'USD' | 'EUR', tatHours: '', moq: '' };
export function VendorForm({ initial, onSave, onCancel, saveLabel }: { initial: typeof VENDOR_FORM_BLANK; onSave: (f: typeof VENDOR_FORM_BLANK) => void; onCancel: () => void; saveLabel: string }) {
  const [f, setF] = useState(initial);
  const up = (patch: Partial<typeof VENDOR_FORM_BLANK>) => setF(x => ({ ...x, ...patch }));
  return <div>
    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
      <Field label="Code"><Input value={f.code} onChange={e => up({ code: e.target.value })} placeholder="SU-100" /></Field>
      <Field label="Name"><Input value={f.name} onChange={e => up({ name: e.target.value })} /></Field>
      <Field label="Vendor Type"><Select value={f.vendorType} onChange={v => up({ vendorType: v })} options={['FABRIC', 'TRIMS', 'DESIGN', 'SERVICE'].map(x => ({ value: x, label: x }))} /></Field>
      <Field label="Mill kind"><Select value={f.kind} onChange={v => up({ kind: v as VendorKind })} options={[{ value: 'Domestic mill', label: 'Domestic mill' }, { value: 'International mill', label: 'International mill' }]} /></Field>
      <Field label="Address"><Input value={f.address} onChange={e => up({ address: e.target.value })} /></Field>
      <Field label="Office Phone"><Input value={f.officePhone} onChange={e => up({ officePhone: e.target.value })} /></Field>
      <Field label="Office Email"><Input value={f.officeEmail} onChange={e => up({ officeEmail: e.target.value })} /></Field>
      <Field label="Categories" hint="comma-separated" hintOn="label"><Input value={f.categories} onChange={e => up({ categories: e.target.value })} /></Field>
      <Field label="Active"><Select value={f.active ? 'yes' : 'no'} onChange={v => up({ active: v === 'yes' })} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} /></Field>
      <Field label="Mill Country"><Input value={f.country} onChange={e => up({ country: e.target.value })} /></Field>
      <Field label="Mill Description"><Input value={f.description} onChange={e => up({ description: e.target.value })} /></Field>
      <Field label="Currency"><Select value={f.currency} onChange={v => up({ currency: v as 'INR' | 'USD' | 'EUR' })} options={['INR', 'USD', 'EUR'].map(x => ({ value: x, label: x }))} /></Field>
      <Field label="TAT (hours)"><Input type="number" value={f.tatHours} onChange={e => up({ tatHours: e.target.value })} /></Field>
      <Field label="MOQ (m)"><Input type="number" value={f.moq} onChange={e => up({ moq: e.target.value })} /></Field>
    </div>
    <div className="flex gap-2 pt-3"><Button size="sm" variant="primary" disabled={!f.name.trim()} onClick={() => onSave(f)}>{saveLabel}</Button><Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
  </div>;
}
export const vendorFormOf = (v: Vendor): typeof VENDOR_FORM_BLANK => ({ code: v.enigma?.vendorCode ?? '', name: v.name, vendorType: v.enigma?.vendorType ?? 'FABRIC', kind: v.kind, address: v.enigma?.address ?? v.location, officePhone: v.enigma?.officePhone ?? '', officeEmail: v.enigma?.officeEmail ?? '', active: v.enigma?.active !== false, categories: (v.enigma?.categories ?? ['Fabric']).join(', '), country: v.enigma?.country ?? '', description: v.enigma?.description ?? '', currency: v.enigma?.currency ?? 'INR', tatHours: v.enigma?.tatHours != null ? String(v.enigma.tatHours) : '', moq: String(v.moq) });
export const enigmaOfForm = (f: typeof VENDOR_FORM_BLANK): NonNullable<Vendor['enigma']> => ({ vendorCode: f.code.trim() || null, country: f.country.trim() || null, description: f.description.trim() || null, currency: f.currency, tatHours: f.tatHours === '' ? null : Number(f.tatHours), vendorType: f.vendorType, address: f.address.trim() || null, officePhone: f.officePhone.trim() || null, officeEmail: f.officeEmail.trim() || null, active: f.active, categories: f.categories.split(',').map(x => x.trim()).filter(Boolean) });
function AddVendorForm({ onDone }: { onDone: (id: string | null) => void }) {
  const { addVendor } = useApp();
  return <Card className="p-4 mb-3">
    <div className="label">Add Vendor</div>
    <VendorForm initial={VENDOR_FORM_BLANK} saveLabel="Save vendor" onCancel={() => onDone(null)}
      onSave={f => { const tat = Number(f.tatHours) || 0; onDone(addVendor({ name: f.name.trim(), kind: f.kind, location: f.address.split(',').slice(-2, -1)[0]?.trim() || (f.kind === 'International mill' ? f.country : 'Mumbai'), region: f.kind === 'International mill' ? 'Intl' : 'West', leadDays: tat ? Math.max(1, Math.round(tat / 24)) : 14, moq: Number(f.moq) || 0, enigma: enigmaOfForm(f) })); }} />
  </Card>;
}

/* ---------- Factory master — the numbers the rules run on, editable --------- */
export function FactoryMasterTab({ mine }: { mine: boolean }) {
  const { db, updateVendor } = useApp();
  const rows = db.vendors.filter(v => (v.kind.endsWith('factory') || v.kind === 'Hemming unit') && (!MTM_ONLY || v.mtm || v.kind === 'Hemming unit')).map(v => ({ v, l: factoryLoadOf(db, v.id) }));
  const ex = useExamples(rows, r => r.l.load > 2.5 ? 'heavy load' : r.l.load > 1.5 ? 'busy' : 'light', { noun: 'factories', done: r => r.l.load <= 1.5 && r.l.overdue.length === 0 && r.l.aging.length === 0 });
  const pager = usePager(ex.rows, 20);
  const Num = ({ v, k, step = 1 }: { v: typeof rows[number]['v']; k: 'tailors' | 'distanceKm' | 'leadDays' | 'dailyTarget'; step?: number }) => mine
    ? <input className="input mono" type="number" step={step} style={{ width: 74, padding:'3px 6px', textAlign:'right' }} defaultValue={v[k] ?? ''} onBlur={e => { const n = e.target.value === '' ? undefined : Number(e.target.value); if (n !== v[k]) updateVendor(v.id, { [k]: n } as never); }} />
    : <span className="mono">{v[k] ?? '—'}</span>;
  return <>
    {ex.strip && <div className="flex justify-end mb-2">{ex.strip}</div>}
    <Card><table className="t">
      <thead><tr><th>Factory</th><th>Type</th><th>MTM</th><th className="num">Tailors</th><th className="num">Nominal / day</th><th className="num">Measured avg</th><th className="num">Feed target / day</th><th className="num">Distance km</th><th className="num">Lead days</th><th>Corporate</th><th>Urgent reserve</th><th>Grade</th></tr></thead>
      <tbody>{pager.pageRows.map(({ v, l }) => <tr key={v.id}>
        <td><VendorLink id={v.id} className="font-medium" /><div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{v.location} · {v.region}</div></td>
        <td className="text-[12.5px]">{v.kind}</td>
        <td onClick={e => e.stopPropagation()}>{mine ? <input type="checkbox" checked={!!v.mtm} onChange={e => updateVendor(v.id, { mtm: e.target.checked })} /> : (v.mtm ? 'yes' : '—')}</td>
        <td className="num"><Num v={v} k="tailors" /></td>
        <td className="num">{l.nominal || '—'}</td>
        <td className="num">{l.avgOut || '—'}</td>
        <td className="num"><Num v={v} k="dailyTarget" /></td>
        <td className="num"><Num v={v} k="distanceKm" /></td>
        <td className="num"><Num v={v} k="leadDays" /></td>
        <td>{mine ? <input type="radio" name="corporate" checked={!!v.corporate} onChange={() => updateVendor(v.id, { corporate: true })} /> : (v.corporate ? 'yes' : '')}</td>
        <td>{mine ? <input type="radio" name="urgent" checked={!!v.urgentReserve} onChange={() => updateVendor(v.id, { urgentReserve: true })} /> : (v.urgentReserve ? 'yes' : '')}</td>
        <td><Pill tone={l.load > 2.5 ? 'risk' : l.load > 1.5 ? 'warn' : 'good'}>{l.load.toFixed(1)}d load</Pill></td>
      </tr>)}</tbody>
    </table>
    <Pager page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} from={pager.from} to={pager.to} total={pager.total} noun="factories" />
    </Card>
    <div className="mt-3"><Note><b>Feed target</b> is your learned daily number and caps the measured average; edit a cell and tab out to save.</Note></div>
  </>;
}


/* ---------- the page: one master for every factory and mill, MTM and RTW alike ---- */
/* Two different masters that used to live on one screen. Factories are where the
   garment is made — production owns their capacity and their on-time record.
   Fabric vendors are the mills sourcing buys cloth from. Neither team needs the
   other's table, so each has its own screen. */
export function VendorsPage({ only = 'factories' }: { only?: 'factories' | 'mills' }) {
  const { db, role } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? (only === 'mills' ? 'fabrics' : 'factories');
  const set = (t: string) => { const n = new URLSearchParams(params); n.set('tab', t); setParams(n, { replace:true }); };
  const mine = role === 'production' || role === 'sourcing' || role === 'owner';
  const factories = db.vendors.filter(v => v.kind.endsWith('factory') || v.kind === 'Hemming unit');
  const mills = db.vendors.filter(v => v.kind.endsWith('mill'));
  return (
    <Page title={only === 'mills' ? 'Fabric vendors' : 'Factories'}
      lede={only === 'mills'
        ? 'The mills BSC buys cloth from — lead time and block window are edited here, everything else is measured from the orders.'
        : 'Where the garment is made — capacity, assigning MTM orders, daily output, and on-time performance measured from the POs.'}
      replaces={only === 'mills' ? "the Merchandise Master's Fabric Vendor column and the block window nobody wrote down" : "the capacity numbers in Swati's head and the WhatsApp memory of who is late"}>
      {!mine && <div className="mb-2"><ActsBy role={only === 'mills' ? 'sourcing' : 'production'} does={only === 'mills' ? 'edits lead times and block windows' : 'edits the planning inputs — tailors, capacity per day, distance, corporate and urgent flags — and logs daily output'} inline /></div>}
      {only === 'mills'
        ? <Tabs tabs={[{ id:'fabrics', label:'Find a fabric', hint:'search the cloth — who supplies it, at what price and lead, and what it would cost to switch', count: db.fabrics.length }, { id:'mills', label:'The mills', hint:'lead times, block windows and how each mill performs', count: mills.length }]} active={tab} onChange={set} />
        : <Tabs tabs={[{ id:'factories', label:'Capacity & planning inputs', count: factories.length }, { id:'output', label:'Daily output', hint:'daily output per factory' }, { id:'aging', label:'Aging', hint:'stuck in a factory past the ship-by', count: agingOf(db).overdue.length }, { id:'performance', label:'On-time performance' }]} active={tab} onChange={set} />}
      {tab === 'factories' && <FactoryMasterTab mine={mine} />}
      {tab === 'aging' && <AgingTab onOpen={id => { location.hash = `#/mtm?tab=floor&open=${id}`; }} />}
      {tab === 'output' && <OutputTab mine={mine} />}
      {tab === 'performance' && <VendorTable kind="factories" />}
      {tab === 'fabrics' && <FabricSourcingTab />}
      {tab === 'mills' && <><VendorTable kind="mills" /><div className="mt-3"><Note>The block window is how long this vendor holds fabric before BSC must commit or release — its own number, edited by sourcing.</Note></div></>}
    </Page>
  );
}

/* ---------- Find a fabric, then choose who makes it ------------------------
   Sourcing's actual question is not "tell me about this mill" — it is "who can
   give me this cloth, by when, at what price, and is anyone holding it for us
   already". So the search is over the cloth, and the mill arrives as the
   answer, with its alternatives from other mills sitting one click below. */
export function FabricSourcingTab() {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const openVendor = (id: string) => { const n = new URLSearchParams(params); n.set('vendor', id); setParams(n, { replace:true }); };
  const [q, setQ] = useState(params.get('fq') ?? '');
  const [millF, setMillF] = useState('all');
  const [typeF, setTypeF] = useState('all');          // domestic · international
  const [bucketF, setBucketF] = useState('all');
  const [bookF, setBookF] = useState('all');
  const [stateF, setStateF] = useState<'all' | 'buyable' | 'below-rop' | 'stopped' | 'blocked'>('all');
  const [sort, setSort] = useState<'name' | 'price' | 'lead' | 'cover'>('name');
  const [alt, setAlt] = useState<string | null>(null);

  const mills = db.vendors.filter(v => v.kind.endsWith('mill'));
  const millOf = (id: string) => mills.find(m => m.id === id);
  /* The blocks sheet names the cloth in the mill's own words — "2-ply poplin ·
     ART-4471" — never by Enigma's code. Match on the mill plus its article
     number when there is one, else on the fabric name appearing in the line. */
  const blocksOf = (fid: string) => { const f = db.fabrics.find(x => x.id === fid); if (!f) return [];
    return (db.blocks ?? []).filter(b => { if (b.status !== 'held' || b.vendorId !== f.vendorId) return false;
      const line = b.fabricName.toLowerCase(); const name = f.name.toLowerCase();
      if (f.vendorCode && line.includes(f.vendorCode.toLowerCase())) return true;
      return line.includes(name) || name.includes(line.split(' · ')[0]); }); };
  const books = [...new Set(db.fabrics.map(f => f.swatchBook).filter(Boolean) as string[])].sort();

  const row = (f: typeof db.fabrics[number]) => {
    const m = millOf(f.vendorId);
    const c = coverageOf(f, m?.leadDays ?? 30, m);
    const held = blocksOf(f.id);
    const stopped = f.onHold || !!f.paused || f.supply?.status === 'out' || f.millAvailable === false;
    return { f, m, c, held, stopped };
  };
  const all = db.fabrics.map(row);
  const t = q.trim().toLowerCase();
  const rows = all
    .filter(r => !t || [r.f.name, r.f.code, r.f.vendorCode, r.f.composition, r.f.family, r.f.swatchBook, r.m?.name].some(x => (x ?? '').toLowerCase().includes(t)))
    .filter(r => millF === 'all' || r.f.vendorId === millF)
    .filter(r => typeF === 'all' || (typeF === 'intl' ? r.f.international : !r.f.international))
    .filter(r => bucketF === 'all' || r.f.bucket === bucketF)
    .filter(r => bookF === 'all' || r.f.swatchBook === bookF)
    .filter(r => stateF === 'all' ? true
      : stateF === 'buyable' ? !r.stopped
      : stateF === 'below-rop' ? r.c.belowRop && r.f.bucket !== 'BESPOKE'
      : stateF === 'blocked' ? r.held.length > 0
      : r.stopped)
    .sort((a, b) => sort === 'price' ? (a.f.cpm ?? 9e9) - (b.f.cpm ?? 9e9)
      : sort === 'lead' ? (a.m?.leadDays ?? 999) - (b.m?.leadDays ?? 999)
      : sort === 'cover' ? a.c.coverDays - b.c.coverDays
      : a.f.name.localeCompare(b.f.name));
  const ex = useExamples(rows, r => r.stopped ? 'stopped' : r.held.length ? 'blocked' : r.c.belowRop && r.f.bucket !== 'BESPOKE' ? 'below ROP' : 'buyable', { noun: 'fabrics', done: r => !r.stopped && r.held.length === 0 && !r.c.belowRop });
  const pager = usePager(ex.rows, 25);
  const any = !!t || millF !== 'all' || typeF !== 'all' || bucketF !== 'all' || bookF !== 'all' || stateF !== 'all';
  const clear = () => { setQ(''); setMillF('all'); setTypeF('all'); setBucketF('all'); setBookF('all'); setStateF('all'); };
  const count = (fn: (r: ReturnType<typeof row>) => boolean) => all.filter(fn).length;

  return <>
    <div className="flex gap-3 items-end flex-wrap mb-2">
      <div style={{ width: 300 }}><Field label="Search a fabric" hint="name, Enigma code, mill article, composition, book, or mill">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="linen, 2-ply poplin, ART-4471, Albini…" /></Field></div>
      <div style={{ width: 190 }}><Field label="Mill"><Select value={millF} onChange={setMillF} options={[{ value:'all', label:`Any mill · ${all.length}` }, ...mills.map(m => ({ value:m.id, label:`${m.name} · ${all.filter(r => r.f.vendorId === m.id).length}` }))]} /></Field></div>
      <div style={{ width: 150 }}><Field label="Where from"><Select value={typeF} onChange={setTypeF} options={[{ value:'all', label:'Anywhere' }, { value:'dom', label:'Domestic' }, { value:'intl', label:'International' }]} /></Field></div>
      <div style={{ width: 140 }}><Field label="Bucket"><Select value={bucketF} onChange={setBucketF} options={[{ value:'all', label:'All' }, { value:'CORE', label:'Core' }, { value:'NON_CORE', label:'Non-core' }, { value:'BESPOKE', label:'Bespoke' }]} /></Field></div>
      <div style={{ width: 210 }}><Field label="Swatch book"><Select value={bookF} onChange={setBookF} options={[{ value:'all', label:'Any book' }, ...books.map(b => ({ value:b, label:b }))]} /></Field></div>
      <div style={{ width: 130 }}><Field label="Sort by"><Select value={sort} onChange={v => setSort(v as typeof sort)} options={[{ value:'name', label:'Name' }, { value:'price', label:'Cheapest' }, { value:'lead', label:'Fastest' }, { value:'cover', label:'Least cover' }]} /></Field></div>
      {any && <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>}
      <div className="flex-1" />
      <div className="pb-2">{ex.strip}</div>
      <ExportButton filename="fabric-sourcing" sheetName="Fabrics" rows={rows} cols={[
        { label:'Fabric', get: r => r.f.name }, { label:'Code', get: r => r.f.code }, { label:'Mill article', get: r => r.f.vendorCode ?? '' },
        { label:'Mill', get: r => r.m?.name ?? '' }, { label:'Where from', get: r => r.f.international ? 'International' : 'Domestic' },
        { label:'Composition', get: r => r.f.composition ?? '' }, { label:'Width in', get: r => r.f.widthIn ?? '' },
        { label:'Cost per Unit', get: r => r.f.mill?.costPerUnit ?? r.f.cpm ?? '' }, { label:'Currency', get: r => r.f.mill?.currency ?? 'INR' }, { label:'TAT hours', get: r => r.f.mill?.tatHours ?? '' },
        { label:'MOQ', get: r => r.f.mill?.moq ?? '' }, { label:'Bucket', get: r => r.f.bucket },
        { label:'Cover days', get: r => r.c.coverDays }, { label:'Book', get: r => r.f.swatchBook ?? '' }]} />
    </div>

    <div className="mb-3"><Seg value={stateF} onChange={setStateF} label="Show" options={[
      { id:'all', label:'Everything', count: all.length },
      { id:'buyable', label:'Can be bought today', count: count(r => !r.stopped), hint:'not paused, not on hold, mill has not said no' },
      { id:'below-rop', label:'Below reorder point', count: count(r => r.c.belowRop && r.f.bucket !== 'BESPOKE'), hint:'stock plus what is on order will not cover the lead time' },
      { id:'blocked', label:'Already blocked for us', count: count(r => blocksOf(r.f.id).length > 0), hint:'the mill is holding metres against this cloth — convert it to a PO or release it before the window runs out. Few match today because the blocks sheet names cloth in the mill\u2019s words and carries no Enigma code.' },
      { id:'stopped', label:'Stopped', count: count(r => r.stopped), hint:'paused by design, on hold, supply out, or sold out at the mill' },
    ]} /></div>

    <Card><table className="t">
      <thead><tr>
        <Th hint="Fabric Name and Fabric Code, as Enigma has them — click the name for the full record.">Fabric</Th>
        <Th hint="Composition, and the Panna (width) the marker is cut to.">Composition · Panna</Th>
        <Th hint="Vendor Name and the Vendor Code for fabric — what goes on the PO.">Vendor · Vendor Code</Th>
        <Th num hint="Turn-around time in hours, as Enigma keeps it.">TAT</Th>
        <Th num hint="Minimum order quantity for this fabric.">MOQ</Th>
        <Th num hint="Cost per Unit, in the mill's currency.">Cost / m</Th>
        <Th hint="Whether you can buy it today, and how long the shelf lasts at the current rate of sale.">Can I buy it</Th>
        <Th>Alternatives</Th>
      </tr></thead>
      <tbody>{pager.pageRows.length === 0 ? <tr><td colSpan={8}><Empty title="No fabric matches that." body="Try the mill's article number, the composition, or clear the filters." /></td></tr>
        : pager.pageRows.map(({ f, m, c, held, stopped }) => {
        /* "the same cloth from someone else" is the same range and the same
           composition — one line per rival mill, its best price first. */
        const rivals = all.filter(x => x.f.id !== f.id && x.f.vendorId !== f.vendorId && x.f.family === f.family
          && (!f.composition || !x.f.composition || x.f.composition === f.composition));
        const byMill = new Map<string, typeof rivals[number]>();
        [...rivals].sort((a, b) => (a.f.cpm ?? 9e9) - (b.f.cpm ?? 9e9)).forEach(x => { if (!byMill.has(x.f.vendorId)) byMill.set(x.f.vendorId, x); });
        const sameFamily = [...byMill.values()];
        const why = f.paused ? `paused by design — ${f.paused.note}` : f.onHold ? 'on hold — switched off for stores and Shopify' : f.supply?.status === 'out' ? `supplier out${f.supply.backOn ? ` — back ${fmtDate(f.supply.backOn)}` : ''}` : f.millAvailable === false ? 'sold out at the mill' : null;
        return <Fragment key={f.id}>
          <tr className="row" onClick={() => setAlt(alt === f.id ? null : f.id)}>
            <td><a className="font-medium vlink" href={`#/fabrics?tab=books&open=${f.id}`} onClick={e => e.stopPropagation()} style={{ textDecoration:'none' }}>{f.name}</a><div className="mono text-[11px]" style={{ color:'var(--ink-faint)' }}>{f.code} · {f.bucket.toLowerCase().replace('_', '-')}{f.swatchBook ? ` · ${f.swatchBook}` : ''}</div></td>
            <td className="text-[12.5px]">{f.composition ?? '—'}<div style={{ color:'var(--ink-faint)' }}>{(f.attrs?.panna ?? f.widthIn) ? `${f.attrs?.panna ?? f.widthIn}" panna` : ''}</div></td>
            <td className="text-[12.5px]"><VendorLink id={f.vendorId} />{m && <div className="mono" style={{ color:'var(--ink-faint)' }}>{f.vendorCode ?? '—'}{held.length > 0 && <span style={{ color:'var(--accent)' }}> · {held.reduce((a, b) => a + b.metres, 0)} m held</span>}</div>}</td>
            <td className="num">{f.mill?.tatHours != null ? `${f.mill.tatHours} h` : m ? `${m.leadDays}d` : '—'}</td>
            <td className="num">{f.mill?.moq != null ? `${f.mill.moq} m` : m?.moq ? `${m.moq} m` : '—'}</td>
            <td className="num mono">{f.mill?.costPerUnit != null ? `${f.mill.currency} ${f.mill.costPerUnit}` : f.cpm != null ? `INR ${f.cpm}` : '—'}</td>
            <td>{stopped ? <><Pill tone="risk">no</Pill><div className="text-[11px]" style={{ color:'var(--risk)' }}>{why}</div></>
              : f.bucket === 'BESPOKE' ? <><Pill tone="good">yes</Pill><div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>bespoke — cut from the mill's own stock</div></>
              : <><Pill tone={c.belowRop ? 'warn' : 'good'}>yes</Pill><div className="text-[11px]" style={{ color: c.belowRop ? 'var(--warn)' : 'var(--ink-faint)' }}>{c.belowRop ? `below ROP · order ${c.suggestedPo} m` : `${c.coverDays > 365 ? '1y+' : `${c.coverDays}d`} cover`}</div></>}</td>
            <td className="text-[12px]"><button type="button" className="vlink" onClick={e => { e.stopPropagation(); setAlt(alt === f.id ? null : f.id); }}>{sameFamily.length ? `${sameFamily.length} other mill${sameFamily.length === 1 ? '' : 's'} do this cloth` : 'only mill for this'}{sameFamily.length ? (alt === f.id ? ' · hide' : ' · compare') : ''}</button></td>
          </tr>
          {alt === f.id && sameFamily.length > 0 && <tr><td colSpan={8} style={{ background:'var(--surface-2)' }}>
            <div className="text-[12px] mb-1.5" style={{ color:'var(--ink-soft)' }}>{f.family}{f.composition ? ` · ${f.composition}` : ''} from another mill — one line per mill, its cheapest article, dearest last. This is the choice: price against lead time against whether that mill holds its dates.</div>
            <table className="t compact" style={{ background:'var(--surface)' }}>
              <thead><tr><th>Fabric</th><th>Mill</th><th className="num">₹ / m</th><th className="num">vs this</th><th className="num">Lead</th><th className="num">On time</th><th>Can I buy it</th></tr></thead>
              <tbody>{[...sameFamily].sort((a, b) => (a.f.cpm ?? 9e9) - (b.f.cpm ?? 9e9) || (a.m?.leadDays ?? 999) - (b.m?.leadDays ?? 999)).slice(0, 8).map(x => {
                const d = f.cpm != null && x.f.cpm != null ? x.f.cpm - f.cpm : null;
                return <tr key={x.f.id} className="row" onClick={e => { e.stopPropagation(); openVendor(x.f.vendorId); }}>
                  <td>{x.f.name}<div className="mono text-[11px]" style={{ color:'var(--ink-faint)' }}>{x.f.code}</div></td>
                  <td className="text-[12.5px]">{x.m?.name}<div style={{ color:'var(--ink-faint)' }}>{x.f.international ? 'international' : 'domestic'}</div></td>
                  <td className="num mono">{x.f.cpm != null ? `₹${x.f.cpm}` : '—'}</td>
                  <td className="num mono" style={{ color: d == null ? undefined : d < 0 ? 'var(--good)' : d > 0 ? 'var(--risk)' : undefined }}>{d == null ? '—' : d === 0 ? 'same' : `${d < 0 ? '−' : '+'}₹${Math.abs(d)}`}</td>
                  <td className="num">{x.m?.leadDays ?? '—'}d</td>
                  <td className="num">{x.m ? `${Math.round(x.m.onTimeRate * 100)}%` : '—'}</td>
                  <td>{x.stopped ? <Pill tone="risk">no</Pill> : <Pill tone="good">yes</Pill>}</td>
                </tr>; })}</tbody>
            </table>
          </td></tr>}
        </Fragment>; })}</tbody>
    </table>
    <Pager page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} from={pager.from} to={pager.to} total={pager.total} noun="fabrics" />
    </Card>
    <div className="mt-3"><Note>Price, lead, block window and on-time record sit on one line so choosing a mill does not need three sheets.</Note></div>
  </>;
}
