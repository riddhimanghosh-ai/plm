/* Launches — the Monthly Drops sheet as a set of gates instead of a status
   column someone retypes. A new option is launched when goods are at HO,
   every store has its display and fit pieces, marketing has the final name
   ten days out, and the date is set. Display and fit pieces are issued at
   COGS and never count as sellable. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { Launch, LaunchDeskStep, LaunchCode, LaunchCodeDetails } from '../domain/types';
import { launchOf, fmtDate, daysAgo, costingOf, TODAY, addDays, iso, type LaunchStage } from '../domain/engines';
import { STORES, MARKETING_LEAD_DAYS, SHIRT_STYLES } from '../domain/reference';
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
    {l.receivedAtHo && <LaunchCodes l={l} isDesign={isDesign} />}
    {l.designCode && <LaunchStickers l={l} canMark={isDesign} />}
    {/* after the codes: the same desk a new MTM fabric goes through — Yusuf, stickers, photos, stores told */}
    {/* the desk after the codes (handed to Yusuf, photos, stores told) is the swatch desk's business, not the launch's */}
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
        <KV k="Working name" v={l.styleName} note="design's name on the request" />
        <KV k="Final product name" v={l.marketingName ?? '—'} note={`${l.marketingBriefOn ? `sent ${fmtDate(l.marketingBriefOn)}` : 'not sent'}${(l.nameHistory ?? []).length ? ` · earlier ${(l.nameHistory ?? []).map(h => `“${h.name}”`).join(', ')}` : ''}`} />
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

/* After the design codes, the launch goes through the swatch desk's steps, in the same order as an MTM fabric:
   handed to Yusuf, stickers printed (one per code), photos shared, dispatched to the stores, stores told.
   There is no warehouse screen, so design ticks Yusuf's steps on his word; dispatch reads off the pieces. */
const DESK: { key: LaunchDeskStep | 'dispatched'; label: string; who: string }[] = [
  { key:'handover',   label:'Handed to Yusuf',           who:'Yusuf' },
  { key:'sticker',    label:'Stickers printed',          who:'Yusuf' },
  { key:'photos',     label:'Photos shared',             who:'Yusuf' },
  { key:'dispatched', label:'Display & fit dispatched',  who:'Shravani' },
  { key:'storesTold', label:'Stores told',               who:'Design' },
];
export function LaunchDesk({ l, canTick }: { l: Launch; canTick: boolean }) {
  const { db, launchDesk } = useApp(); const onTick = (st: LaunchDeskStep) => launchDesk(l.id, st);
  const opt = db.options.find(o => o.id === l.optionId);
  const codes: LaunchCode[] = l.designCodes ?? (l.designCode ? [{ code: l.designCode, label: 'base', name: l.marketingName ?? l.styleName, cloth: null, category: 'Casual', style: null, mrp: opt?.mrp ?? null, sizes: [], description: null, on: l.designCodeOn ?? '', by: l.designCodeBy ?? '', enigmaOn: l.designCodeOn ?? null }] : []);
  const dispatched = l.pieces.length > 0 && l.pieces.every(p => p.dispatchedOn);
  const dispatchedOn = dispatched ? [...l.pieces].map(p => p.dispatchedOn!).sort().slice(-1)[0] : null;
  const done = DESK.filter(st => st.key === 'dispatched' ? dispatched : !!l.desk?.[st.key]).length;
  const printStickers = () => { printLaunchStickers(l, codes, opt?.mrp ?? null, STORES.length); if (canTick && !l.desk?.sticker) onTick('sticker'); };
  return <Section title="After the codes · the desk" collapsible={false} right={<Pill tone={done === DESK.length ? 'good' : done ? 'warn' : 'neutral'}>{done} of {DESK.length}</Pill>}>
    <div className="text-[12.5px] pb-2" style={{ color:'var(--ink-soft)' }}>The same steps a new MTM fabric goes through once it has its code. Yusuf has no PLM screen, so design ticks his steps on his word.</div>
    {DESK.map(st => { const d = st.key === 'dispatched' ? (dispatchedOn ? { on: dispatchedOn, by: 'Shravani' } : undefined) : l.desk?.[st.key];
      return <div key={st.key} className="kv"><span className="k flex items-center gap-2"><span className="dot" style={{ background: d ? 'var(--good)' : 'var(--line)' }} />{st.label}<span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{st.who}</span></span>
        <span className="v flex items-center gap-2 justify-end">{d ? <span className="text-[12px]" style={{ color:'var(--ink-soft)' }}>{fmtDate(d.on)}{d.by ? ` · ${d.by}` : ''}</span>
          : st.key === 'dispatched' ? <span className="text-[12px]" style={{ color:'var(--ink-faint)' }}>{l.pieces.length ? `${l.pieces.filter(p => p.dispatchedOn).length} of ${l.pieces.length} out` : 'after allocation'}</span>
          : st.key === 'sticker' ? <Button size="sm" variant="primary" onClick={printStickers}>Print {codes.length} sticker{codes.length === 1 ? '' : 's'}{canTick ? ' & mark' : ''}</Button>
          : canTick ? <Button size="sm" onClick={() => onTick(st.key as LaunchDeskStep)}>Done</Button> : <span className="text-[12px]" style={{ color:'var(--ink-faint)' }}>not yet</span>}</span>
      </div>; })}
  </Section>;
}

/* The design codes on a launch: minted by design once the goods are at HO, each one created in Enigma in the
   same click, as an MTM product code is. One style can sell under several; each carries what Enigma asks for:
   what it is for, the sellable name, the cloth, the category, the fit, the price, the sizes. A launched style can
   still get another code. The details change whenever design likes; the code never does. */
const CODE_CATS = ['Formal', 'Casual'] as const;
function CodeForm({ initial, onSave, onCancel, saveLabel }: { initial: Partial<LaunchCodeDetails>; onSave: (d: Partial<LaunchCodeDetails>) => void; onCancel: () => void; saveLabel: string }) {
  const [f, setF] = useState({ label: initial.label ?? '', name: initial.name ?? '', cloth: initial.cloth ?? '', category: initial.category ?? 'Casual', style: initial.style ?? '', mrp: initial.mrp != null ? String(initial.mrp) : '', sizes: (initial.sizes ?? []).join(', '), description: initial.description ?? '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(x => ({ ...x, [k]: e.target.value }));
  const setV = (k: keyof typeof f) => (v: string) => setF(x => ({ ...x, [k]: v }));
  return <div className="pt-2">
    <div className="grid gap-2" style={{ gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))' }}>
      <Field label="What this code is for"><Input value={f.label} onChange={set('label')} placeholder="base · navy · online only · slim fit" /></Field>
      <Field label="Name it sells as"><Input value={f.name} onChange={set('name')} placeholder="the marketing name" /></Field>
      <Field label="Cloth"><Input value={f.cloth} onChange={set('cloth')} placeholder="e.g. Seersucker · 100% cotton" /></Field>
      <Field label="Category"><Select value={f.category} onChange={setV('category')} options={CODE_CATS.map(c => ({ value: c, label: c }))} /></Field>
      <Field label="Fit · style"><Select value={f.style} onChange={setV('style')} options={[{ value: '', label: '—' }, ...SHIRT_STYLES.map(st => ({ value: st, label: st }))]} /></Field>
      <Field label="MRP"><Input type="number" min={0} value={f.mrp} onChange={set('mrp')} placeholder="₹" /></Field>
      <Field label="Sizes"><Input value={f.sizes} onChange={set('sizes')} placeholder="36, 38, 40, 42, 44, 46" /></Field>
    </div>
    <div className="pt-2"><Field label="Description · PDP copy"><Input value={f.description} onChange={set('description')} placeholder="what the website and the store say" /></Field></div>
    <div className="flex gap-2 pt-2 flex-wrap">
      <Button size="sm" variant="primary" onClick={() => onSave({ label: f.label.trim() || undefined, name: f.name.trim() || undefined, cloth: f.cloth.trim() || null, category: f.category as 'Formal' | 'Casual', style: f.style || null, mrp: f.mrp === '' ? null : Number(f.mrp), sizes: f.sizes.split(/[,\s]+/).map(x => x.trim()).filter(Boolean), description: f.description.trim() || null })}>{saveLabel}</Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  </div>;
}
export function LaunchCodes({ l, isDesign }: { l: Launch; isDesign: boolean }) {
  const { db, mintLaunchDesignCode, updateLaunchCode, pushLaunchCodeToEnigma } = useApp();
  const [adding, setAdding] = useState(false); const [editing, setEditing] = useState<string | null>(null);
  const o = db.orders.find(x => x.id === l.orderId); const opt = db.options.find(x => x.id === l.optionId);
  const codes: LaunchCode[] = l.designCodes ?? (l.designCode ? [{ code: l.designCode, label: 'base', name: l.marketingName ?? l.styleName, cloth: null, category: 'Casual', style: null, mrp: opt?.mrp ?? null, sizes: [], description: null, on: l.designCodeOn ?? '', by: l.designCodeBy ?? '', enigmaOn: l.designCodeOn ?? null }] : []);
  const money = (n: number | null | undefined) => n == null ? 'MRP —' : `₹${n.toLocaleString('en-IN')}`;
  const prefill: Partial<LaunchCodeDetails> = { name: l.marketingName ?? l.styleName, cloth: o?.bom.find(b => b.kind === 'fabric')?.item ?? null, mrp: opt?.mrp ?? null, sizes: o?.sizeBreakup.map(x => x.size) ?? [] };
  return <Section title="Design codes · in Enigma" collapsible={false} right={<Pill tone={l.designCode ? 'good' : 'neutral'}>{l.designCode ? `${Math.max(codes.length, 1)} code${codes.length > 1 ? 's' : ''}` : 'none yet'}</Pill>}>
    {codes.map(c => <div key={c.code} className="py-2" style={{ borderBottom:'1px solid var(--line-soft)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap"><span className="mono font-medium">{c.code}</span><span className="pill">{c.label}</span>{c.enigmaOn ? <Pill tone="good">in Enigma</Pill> : isDesign ? <Button size="sm" onClick={() => pushLaunchCodeToEnigma(l.id, c.code)}>Create in Enigma</Button> : <Pill tone="warn">not in Enigma</Pill>}</div>
          <div className="text-[13px] pt-0.5">{c.name}</div>
          <div className="text-[11.5px]" style={{ color:'var(--ink-soft)' }}>{[c.cloth, c.category, c.style, money(c.mrp), c.sizes?.length ? `sizes ${c.sizes.join(' ')}` : null].filter(Boolean).join(' · ')}</div>
          {c.description && <div className="text-[11.5px] pt-0.5" style={{ color:'var(--ink-faint)' }}>{c.description}</div>}
        </div>
        <div className="text-[11px] text-right" style={{ color:'var(--ink-faint)' }}>{c.on ? fmtDate(c.on) : ''}{c.by ? ` · ${c.by}` : ''}{isDesign && editing !== c.code && <div><button type="button" className="vlink" onClick={() => { setEditing(c.code); setAdding(false); }}>edit details</button></div>}</div>
      </div>
      {editing === c.code && <CodeForm initial={c} saveLabel="Save · sync to Enigma" onCancel={() => setEditing(null)} onSave={d => { updateLaunchCode(l.id, c.code, d); setEditing(null); }} />}
    </div>)}
    {!l.designCode && !adding && <div className="text-[12.5px] py-1" style={{ color:'var(--ink-faint)' }}>{l.receivedAtHo ? 'Goods are in; design mints the first code and it is created in Enigma at once.' : 'The codes are minted once the goods are at head office.'}</div>}
    {isDesign && l.receivedAtHo && !adding && <div className="pt-2"><Button size="sm" variant="primary" onClick={() => { setAdding(true); setEditing(null); }}>{l.designCode ? '+ Another design code' : 'Mint the design code'}</Button></div>}
    {adding && <CodeForm initial={{ ...prefill, label: codes.length ? `variant ${codes.length + 1}` : 'base' }} saveLabel="Mint · create in Enigma" onCancel={() => setAdding(false)} onSave={d => { mintLaunchDesignCode(l.id, d); setAdding(false); }} />}
    {!isDesign && l.receivedAtHo && !l.designCode && <ActsBy role="design" does="mints the design codes; each is created in Enigma in the same click" />}
  </Section>;
}


/* One sticker per design code, the five lines the MTM sticker has: code, name, cloth and what the code is for with the drop, MRP, taxes.
   `copies` of each, three across on A4. */
function printLaunchStickers(l: Launch, codes: LaunchCode[], fallbackMrp: number | null, copies: number) {
  const w = window.open('', '_blank', 'width=760,height=980'); if (!w) return;
  const name = l.marketingName ?? l.styleName;
  const one = (c: LaunchCode) => `<div class="b"><div class="c">${c.code}</div><div class="n">${c.name || name}</div><div class="k">${[c.cloth, c.label].filter(Boolean).join(' · ').toUpperCase()} · ${l.dropMonth.toUpperCase()}</div><div class="p">${(c.mrp ?? fallbackMrp) != null ? `MRP ${(c.mrp ?? fallbackMrp)!.toLocaleString('en-IN')}` : 'MRP —'}</div><div class="s">Incl. of all taxes</div></div>`;
  const labels = codes.map(c => Array.from({ length: Math.max(1, copies) }, () => one(c)).join('')).join('');
  w.document.write(`<!doctype html><title>Stickers · ${name}</title><style>body { margin:0; font-family: Calibri, -apple-system, Helvetica, Arial, sans-serif; color:#222; } @page { size: A4; margin: 10mm; } .grid { display:grid; grid-template-columns: repeat(3, 63mm); } .b { width: 63mm; height: 36mm; border:1px solid #333; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; } .c { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color:#555; } .n { font-size: 14px; font-weight: 700; margin: 2px 0; } .k { font-size: 10px; letter-spacing:.04em; } .p { font-size: 13px; margin-top: 2px; } .s { font-size: 9px; color:#666; }</style><div class="grid">${labels}</div>`);
  w.document.close();
}
/* The stickers, shown before they are printed: one preview per design code, as the swatch desk shows the MTM sticker.
   Printing marks the desk's "Stickers printed" step. */
export function LaunchStickers({ l, canMark }: { l: Launch; canMark: boolean }) {
  const { db, launchDesk } = useApp();
  const opt = db.options.find(o => o.id === l.optionId);
  const codes: LaunchCode[] = l.designCodes ?? (l.designCode ? [{ code: l.designCode, label: 'base', name: l.marketingName ?? l.styleName, cloth: null, category: 'Casual', style: null, mrp: opt?.mrp ?? null, sizes: [], description: null, on: l.designCodeOn ?? '', by: l.designCodeBy ?? '', enigmaOn: l.designCodeOn ?? null }] : []);
  const [copies, setCopies] = useState(String(STORES.length));
  const n = Math.max(1, Math.min(500, Math.round(Number(copies)) || 1));
  const name = l.marketingName ?? l.styleName;
  const print = () => { printLaunchStickers(l, codes, opt?.mrp ?? null, n); if (canMark && !l.desk?.sticker) launchDesk(l.id, 'sticker'); };
  return <Section title="Stickers" collapsible={false} right={<Pill tone={l.desk?.sticker ? 'good' : codes.length ? 'neutral' : 'neutral'}>{l.desk?.sticker ? `printed ${fmtDate(l.desk.sticker.on)}` : codes.length ? 'not printed' : 'after the codes'}</Pill>}>
    {codes.length === 0 ? <div className="text-[12.5px] py-1" style={{ color:'var(--ink-faint)' }}>One sticker per design code, once design has minted them.</div> : <>
      <div className="flex gap-3 flex-wrap py-1">
        {codes.map(c => <div key={c.code} className="text-center" style={{ border:'1px solid var(--ink-soft)', background:'var(--surface)', width: 220, padding:'10px 6px', fontSize: 11.5, lineHeight: 1.4 }}>
          <div className="mono" style={{ color:'var(--ink-soft)' }}>{c.code}</div>
          <div className="font-semibold text-[13px]">{c.name || name}</div>
          <div className="uppercase" style={{ letterSpacing:'.04em', fontSize: 10.5 }}>{[c.cloth, c.label].filter(Boolean).join(' · ')} · {l.dropMonth}</div>
          <div style={{ color: (c.mrp ?? opt?.mrp) == null ? 'var(--warn)' : undefined }}>{(c.mrp ?? opt?.mrp) != null ? `MRP ${(c.mrp ?? opt!.mrp).toLocaleString('en-IN')}` : 'MRP —'}</div>
          <div style={{ color:'var(--ink-faint)', fontSize: 10 }}>Incl. of all taxes</div>
        </div>)}
      </div>
      <div className="flex items-end gap-2 flex-wrap pt-1">
        <Field label="Copies of each"><Input type="number" min={1} max={500} value={copies} onChange={e => setCopies(e.target.value)} style={{ width: 90 }} /></Field>
        <Button variant="primary" onClick={print}>Print {codes.length * n} sticker{codes.length * n === 1 ? '' : 's'}{canMark && !l.desk?.sticker ? ' & mark' : ''}</Button>
        <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{codes.length} code{codes.length === 1 ? '' : 's'} × {n} · one per store by default</span>
      </div>
    </>}
  </Section>;
}
