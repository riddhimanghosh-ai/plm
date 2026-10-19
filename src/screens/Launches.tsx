/* Launches — the Monthly Drops sheet as a set of gates instead of a status
   column someone retypes. A new option is launched when goods are at HO,
   every store has its display and fit pieces, marketing has the final name
   ten days out, and the date is set. Display and fit pieces are issued at
   COGS and never count as sellable. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { Launch } from '../domain/types';
import { launchOf, fmtDate, daysAgo, costingOf, TODAY, addDays, iso, type LaunchStage } from '../domain/engines';
import { STORES, MARKETING_LEAD_DAYS } from '../domain/reference';
import { Page, Card, Pill, Button, Drawer, KV, Section, Note, Tabs, Empty, Field, Input, Select, Seg, dateInput, fromDateInput, useExamples, type Tone } from '../ui';
import { ThreadPanel } from './Thread';
import { Files } from './Files';
import { FILE_LABELS } from '../domain/reference';
import { ActsBy, OwnerPill } from './Who';


const STAGE_TONE: Record<LaunchStage, Tone> = { 'In production':'neutral', 'At HO':'warn', Allocating:'warn', Dispatching:'info', Ready:'good', Launched:'neutral' };

export function Launches() {
  const { db, role } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace:true }); };
  const launches = db.launches ?? [];
  const drops = [...new Set(launches.map(l => l.dropMonth))].sort((a, b) => new Date(`1 ${a}`).getTime() - new Date(`1 ${b}`).getTime());
  const tab = params.get('tab') ?? 'all';   // every drop at once, so the worked examples include one that has launched
  const inDrop = launches.filter(l => tab === 'all' || l.dropMonth === tab).map(l => ({ l, s: launchOf(l) })).sort((a, b) => (a.l.launchOn ?? '').localeCompare(b.l.launchOn ?? ''));
  /* three questions a planner actually asks this screen: what is stuck, what is
     nearly out the door, and where is one particular style */
  const [show, setShow] = useState<'all' | 'attention' | 'ready' | 'launched'>('all');
  const [stage, setStage] = useState('all');
  const [search, setSearch] = useState('');
  const needsAttention = (x: typeof inDrop[number]) => !x.l.launchedOn && (x.s.briefLate || x.s.launchLate || daysAgo(x.l.expectedAtHo) > 0 && !x.l.receivedAtHo);
  const rows = inDrop.filter(x => {
    if (show === 'attention' && !needsAttention(x)) return false;
    if (show === 'ready' && x.s.stage !== 'Ready') return false;
    if (show === 'launched' && !x.l.launchedOn) return false;
    if (stage !== 'all' && x.s.stage !== stage) return false;
    if (search.trim() && !x.l.styleName.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });
  const stages = [...new Set(inDrop.map(x => x.s.stage))];
  // one example per stage so the demo walks the gates from "in production" to "launched"
  const ex = useExamples(rows, x => x.s.stage, { noun: 'launches', score: x => x.s.gates.filter(g => g.ok).length, done: x => !!x.l.launchedOn });
  const active = launches.find(l => l.id === params.get('open')) ?? null;
  const mine = role === 'planning' || role === 'owner';
  const open = launches.filter(l => !l.launchedOn).map(launchOf);

  return (
    <Page title="RTW launches" lede="Every new option on its way to the shop floor, and the six things that must be true before it launches."
      replaces="the Monthly Drops sheet, the display-allocation sheet, and the 'has marketing got the name yet?' message"
      actions={mine ? <Button variant="primary" onClick={() => set('open', 'new')}>+ Add to a drop</Button> : <ActsBy role="planning" does="adds an option to a drop" inline />}>
      <Tabs tabs={[...drops.map(d => ({ id:d, label:d, count: launches.filter(l => l.dropMonth === d && !l.launchedOn).length })), { id:'all', label:'All' }]} active={tab} onChange={t => set('tab', t)} />

      {inDrop.length > 0 && <Card className="mb-3"><div className="flex items-center gap-3 flex-wrap px-3 py-2.5">
        <Seg value={show} onChange={setShow} options={[
          { id:'all', label:`All ${inDrop.length}` },
          { id:'attention', label:'Needs attention', count: inDrop.filter(needsAttention).length, hint:'brief late, launch date passed, or goods overdue at HO' },
          { id:'ready', label:'Ready to launch', count: inDrop.filter(x => x.s.stage === 'Ready').length, hint:'all six gates green — only the date to press' },
          { id:'launched', label:'Launched', count: inDrop.filter(x => x.l.launchedOn).length },
        ]} />
        <Select value={stage} onChange={setStage} style={{ width:'auto' }} options={[{ value:'all', label:'Every stage' }, ...stages.map(st => ({ value:st, label:st }))]} />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search style" style={{ width:190 }} />
        {ex.strip && <span className="ml-auto">{ex.strip}</span>}
      </div></Card>}

      {rows.length === 0 ? <Card><Empty title={inDrop.length ? 'Nothing matches those filters.' : 'Nothing in this drop.'} body={inDrop.length ? 'Loosen the filter or clear the search.' : 'Add an option from the option book, or from a closed production order.'} /></Card> : <Card><table className="t">
        <thead><tr><th>Style</th><th>Stage</th><th>At HO</th><th className="num">Pieces</th><th>Marketing</th><th>Launch</th><th>Gates</th></tr></thead>
        <tbody>{ex.rows.map(({ l, s }) => <tr key={l.id} className="row" onClick={() => set('open', l.id)}>
          <td><div className="font-medium">{l.styleName}{l.hero && <Pill tone="accent">hero</Pill>}</div><div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{l.dropMonth}{l.orderId ? ` · ${db.orders.find(o => o.id === l.orderId)?.poNo ?? 'PO'}` : ''}</div></td>
          <td><Pill tone={STAGE_TONE[s.stage]}>{s.stage}</Pill></td>
          <td>{l.receivedAtHo ? fmtDate(l.receivedAtHo) : <span style={{ color: daysAgo(l.expectedAtHo) > 0 ? 'var(--risk)' : 'var(--ink-faint)' }}>exp. {fmtDate(l.expectedAtHo)}</span>}</td>
          <td className="num">{s.pieceCount ? `${s.received}/${s.dispatched}/${s.pieceCount}` : '—'}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{s.pieceCount ? 'recv / sent / plan' : ''}</div></td>
          <td>{l.marketingBriefOn ? <span className="text-[12.5px]">{l.marketingName}</span> : <Pill tone={s.briefLate ? 'risk' : 'warn'}>{s.briefLate ? 'brief late' : 'brief pending'}</Pill>}</td>
          <td style={{ color: s.launchLate ? 'var(--risk)' : undefined }}>{l.launchedOn ? `launched ${fmtDate(l.launchedOn)}` : l.launchOn ? fmtDate(l.launchOn) : '—'}</td>
          <td><div className="flex gap-0.5">{s.gates.map(g => <span key={g.key} title={g.label} className="dot" style={{ background: g.ok ? 'var(--good)' : 'var(--line)' }} />)}</div></td>
        </tr>)}</tbody>
      </table></Card>}
      <div className="mt-3"><Note>Six dots are the six gates; the store's tap on "received" turns the fourth one green.</Note></div>

      <Drawer open={!!active || params.get('open') === 'new'} onClose={() => set('open', null)} title={active ? active.styleName : 'Add to a drop'}
        subtitle={active && <><Pill tone={STAGE_TONE[launchOf(active).stage]}>{launchOf(active).stage}</Pill><span>{active.dropMonth} · launch {active.launchOn ? fmtDate(active.launchOn) : 'TBD'}</span>
          <button type="button" className="cta" onClick={() => { window.location.hash = `#/health?open=${active.optionId}`; }}>→ Full product 360 · stock, sales, sizes</button></>}>
        {params.get('open') === 'new' && <NewLaunch onDone={id => set('open', id)} />}
        {active && <LaunchDetail l={active} editable={mine} />}
      </Drawer>
    </Page>
  );
}

function LaunchDetail({ l, editable }: { l: Launch; editable: boolean }) {
  const { db, role, updateLaunch, allocateLaunch, dispatchLaunch, receiveLaunch, mintLaunchDesignCode } = useApp();
  const isDesign = role === 'design' || role === 'owner';
  const s = launchOf(l);
  const order = db.orders.find(o => o.id === l.orderId);
  const cogs = order ? costingOf(order).cogs : null;
  const [name, setName] = useState(l.marketingName ?? '');
  const [launchOn, setLaunchOn] = useState(dateInput(l.launchOn));
  const [pointers, setPointers] = useState(l.keyPointers);
  const storeName = (id: string) => STORES.find(x => x.id === id)?.name ?? id;
  const byStore = [...new Set(l.pieces.map(p => p.storeId))].map(id => ({ id, pieces: l.pieces.filter(p => p.storeId === id) }));
  return <>
    <Section title="Readiness" right={<Pill tone={s.blockers ? 'warn' : 'good'}>{s.blockers ? `${s.blockers} gate${s.blockers === 1 ? '' : 's'} open` : 'all gates green'}</Pill>}>
      {s.gates.map(g => <div key={g.key} className="kv"><span className="k flex items-center gap-2"><span className="dot" style={{ background: g.ok ? 'var(--good)' : 'var(--line)' }} />{g.label}</span><span className="v" style={{ color: g.ok ? undefined : 'var(--ink-faint)' }}>{g.note}</span></div>)}
      {editable && !l.launchedOn && <div className="flex gap-2 pt-3 flex-wrap">
        {!l.receivedAtHo && <Button size="sm" variant="primary" onClick={() => updateLaunch(l.id, { receivedAtHo: iso(TODAY) })}>Goods received at HO</Button>}
        {l.receivedAtHo && !l.designCode && isDesign && <Button size="sm" variant="primary" onClick={() => mintLaunchDesignCode(l.id)}>Mint the design code</Button>}
        {l.receivedAtHo && l.pieces.length === 0 && <Button size="sm" variant="primary" onClick={() => allocateLaunch(l.id, 'default')}>Allocate default display & fit plan</Button>}
        {l.pieces.some(p => !p.dispatchedOn) && <Button size="sm" variant="primary" onClick={() => dispatchLaunch(l.id, 'all')}>Dispatch all remaining</Button>}
        {s.stage === 'Ready' && <Button size="sm" variant="primary" onClick={() => updateLaunch(l.id, { launchedOn: iso(TODAY) })}>Make live in Enigma · launch</Button>}
      </div>}
      {l.launchedOn && <div className="pt-2"><Note tone="good">Live in Enigma since {fmtDate(l.launchedOn)} — stores and the website can sell it. From here it is tracked on the option book — health, velocity, replenish or exit.</Note></div>}
    </Section>

    <Section title="Marketing & date" right={<OwnerPill editable={editable} owner="Planning" />}>
      {!editable && <ActsBy role="planning" does="sets the marketing name, the brief date and the launch date, and launches it" />}
      {editable ? <>
        <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'2fr 1fr' }}>
          <Field label="Final product name" hint="flows to Shopify, the system and the website"><Input value={name} onChange={e => setName(e.target.value)} placeholder={l.styleName} /></Field>
          <Field label="Launch date"><Input type="date" value={launchOn} onChange={e => setLaunchOn(e.target.value)} /></Field>
          <div style={{ gridColumn:'1 / -1' }}><Field label="Key pointers for stores" hint="what the floor says in the first sentence"><Input value={pointers} onChange={e => setPointers(e.target.value)} placeholder="100% cotton, soft & breathable" /></Field></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={() => updateLaunch(l.id, { marketingName: name.trim() || null, launchOn: fromDateInput(launchOn), keyPointers: pointers.trim() })}>Save</Button>
          {!l.marketingBriefOn && <Button size="sm" variant="primary" disabled={!name.trim()} onClick={() => updateLaunch(l.id, { marketingName: name.trim(), launchOn: fromDateInput(launchOn), keyPointers: pointers.trim(), marketingBriefOn: iso(TODAY) })}>Brief sent to marketing</Button>}
          <Button size="sm" variant="ghost" onClick={() => updateLaunch(l.id, { hero: !l.hero })}>{l.hero ? 'Unmark hero' : 'Mark as hero product'}</Button>
        </div>
        {s.briefDue && !l.marketingBriefOn && <div className="pt-2"><Note tone={s.briefLate ? 'risk' : 'warn'}>Marketing needs the name {MARKETING_LEAD_DAYS}–15 days before launch — by {fmtDate(s.briefDue)}. {s.briefLate ? 'That has passed; the Shopify listing is now the bottleneck.' : ''}</Note></div>}
      </> : <>
        <KV k="Final product name" v={l.marketingName ?? '—'} note={l.marketingBriefOn ? `sent ${fmtDate(l.marketingBriefOn)}` : 'not sent'} />
        <KV k="Launch date" v={l.launchOn ? fmtDate(l.launchOn) : '—'} />
        <KV k="Key pointers" v={l.keyPointers || '—'} />
      </>}
    </Section>

    <Section title={`Display & fit pieces · ${l.pieces.reduce((a, p) => a + p.qty, 0)}`} right={cogs != null && l.pieces.length ? <Pill tone="neutral">₹{Math.round(cogs * l.pieces.reduce((a, p) => a + p.qty, 0)).toLocaleString('en-IN')} at COGS</Pill> : undefined}>
      {l.pieces.length === 0 ? <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>No plan yet. The default is one display piece and a fit set of three to every store that holds RTW stock; edit per store after.</div>
        : byStore.map(({ id, pieces }) => { const sent = pieces.filter(p => p.dispatchedOn).length; const recv = pieces.filter(p => p.receivedOn).length; return <div key={id} className="kv"><span className="k"><b style={{ color:'var(--ink)' }}>{storeName(id)}</b><div className="text-[11px]">display {pieces.filter(p => p.kind === 'display').map(p => p.size).join(', ')} · fit {pieces.filter(p => p.kind === 'fit').map(p => p.size).join(', ')}</div></span>
          <span className="v"><Pill tone={recv === pieces.length ? 'good' : sent === pieces.length ? 'info' : sent ? 'warn' : 'neutral'}>{recv === pieces.length ? 'received' : sent === pieces.length ? 'dispatched' : sent ? `${sent}/${pieces.length} sent` : 'to send'}</Pill>
            {editable && sent < pieces.length && <div className="mt-1"><Button size="sm" onClick={() => dispatchLaunch(l.id, id)}>Dispatch</Button></div>}
            {editable && sent === pieces.length && recv < pieces.length && <div className="mt-1"><Button size="sm" variant="ghost" onClick={() => receiveLaunch(l.id, id)}>Mark received for them</Button></div>}</span></div>; })}
      <div className="pt-2"><Note>Issued at COGS{cogs != null ? ` (₹${Math.round(cogs)} a piece)` : ''} and kept out of every sellable count.</Note></div>
    </Section>

    {order && <Section title="Feeding production order">
      <KV k={order.poNo ?? 'Requirement'} v={<Pill tone={order.status === 'Closed' ? 'good' : 'info'}>{order.status}</Pill>} note={`${order.orderQty} pcs · ${db.vendors.find(v => v.id === order.vendorId)?.name ?? 'not allocated'} · target inhouse ${fmtDate(order.targetInhouse)}`} />
    </Section>}

    <Files kind="launch" subjectId={l.id} labels={FILE_LABELS.launch} editable={editable} />
    <ThreadPanel kind="launch" subjectId={l.id} />
  </>;
}

function NewLaunch({ onDone }: { onDone: (id: string) => void }) {
  const { db, createLaunch } = useApp();
  const inLaunch = new Set((db.launches ?? []).map(l => l.optionId));
  const candidates = db.options.filter(o => !inLaunch.has(o.id));
  const [optionId, setOptionId] = useState(candidates[0]?.id ?? '');
  const [drop, setDrop] = useState('Nov 26');
  const [expected, setExpected] = useState(dateInput(iso(addDays(TODAY, 30))));
  const [launchOn, setLaunchOn] = useState(dateInput(iso(addDays(TODAY, 50))));
  const [pointers, setPointers] = useState('');
  const opt = db.options.find(o => o.id === optionId);
  const order = opt ? db.orders.find(x => x.styleName.toLowerCase().includes(opt.subCat2.split(' ')[0].toLowerCase()) && x.status !== 'Closed') : undefined;
  return (
    <Section title="New option into a drop" right={<Pill tone="accent">Planning</Pill>}>
      <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <div style={{ gridColumn:'1 / -1' }}><Field label="Option" hint={order ? `linked to ${order.poNo ?? 'its requirement'}` : 'no open production order found for this look'}><Select value={optionId} onChange={setOptionId} options={candidates.map(o => ({ value:o.id, label:o.styleName }))} /></Field></div>
        <Field label="Drop"><Select value={drop} onChange={setDrop} options={['Oct 26', 'Nov 26', 'Dec 26', 'Jan 27'].map(d => ({ value:d, label:d }))} /></Field>
        <Field label="Expected at HO"><Input type="date" value={expected} onChange={e => setExpected(e.target.value)} /></Field>
        <Field label="Launch date"><Input type="date" value={launchOn} onChange={e => setLaunchOn(e.target.value)} /></Field>
        <div style={{ gridColumn:'1 / -1' }}><Field label="Key pointers for stores"><Input value={pointers} onChange={e => setPointers(e.target.value)} /></Field></div>
      </div>
      <Button variant="primary" size="sm" disabled={!optionId} onClick={() => onDone(createLaunch({ optionId, styleName: opt!.styleName, dropMonth: drop, orderId: order?.id ?? null, expectedAtHo: fromDateInput(expected) ?? iso(TODAY), launchOn: fromDateInput(launchOn), hero: false, keyPointers: pointers.trim() }))}>Add to drop</Button>
    </Section>
  );
}
