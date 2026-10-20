/* MTM fabrics — the fabric is the SKU, and the three buckets run differently.
   Core: a reorder point that covers international fabrics too — Enigma's
   auto-PO reaches only domestic ones. Non-core: the range plan counted as
   healthy slots against the target hiding in the swatch-book label. Bespoke:
   the mill's last report, and one click to switch a sold-out fabric off before
   a customer orders it. Blocks: the handshake, with a countdown.
   Click any fabric for its 360 — identity, stock, sales with conditions,
   range, blocks, stores. */
import { useSearchParams } from 'react-router-dom';
import { ThreadPanel } from './Thread';
import { Files } from './Files';
import { FILE_LABELS } from '../domain/reference';

import { VendorLink } from './Vendors';
import { useApp } from '../store';
import type { Fabric, Concept } from '../domain/types';
import { coverageOf, liveStatusOf, trimCoverageOf, fmtDate, fmtMoney, daysAgo, fmtRel, openFabricPos, fabricPoStatus, iso, TODAY, addDays, formerNames } from '../domain/engines';
import { useState } from 'react';
import { Field, Input, dateInput, fromDateInput } from '../ui';
import { STORES, STORE_LOW_METRES, METRES_PER_SHIRT, MTM_SWATCH_BOOKS, MTM_ACTIVE_TARGET } from '../domain/reference';
import { Page, Card, Pill, Button, Note, Tabs, Empty, Drawer, KV, Section, Bars, usePager, Pager, Seg, useExamples, Select, ExportButton } from '../ui';
import { ActsBy } from './Who';

/* design's own shorthand — one click instead of a sentence typed 35 times */
const PAUSE_REASONS = ['Shade being retired', 'Quality doubt', 'Book changing', 'Not selling'];

export function Fabrics() {
  const { db, role, setFabricHold, pauseFabric, resumeFabric, raiseFabricPo, convertBlock, releaseBlock, reviewCoreStock, demoAll } = useApp();
  const [review, setReview] = useState<string | null>(null);
  const [coreFilter, setCoreFilter] = useState<'all' | 'below' | 'manual' | 'intl' | 'soldout' | 'paused' | 'off' | 'unchecked'>('all');
  const [pausing, setPausing] = useState<string | null>(null);
  const [pauseNote, setPauseNote] = useState(''); const [rvStatus, setRvStatus] = useState<'ok' | 'delayed' | 'out'>('ok'); const [rvNote, setRvNote] = useState(''); const [rvBack, setRvBack] = useState('');
  const fpoOpen = openFabricPos(db); const fpoUnconfirmed = fpoOpen.filter(p => !p.vendorConfirmedOn).length;
  const [params, setParams] = useSearchParams();
  const { myRole } = useApp();
  const designSide = !demoAll && (myRole === 'design' || myRole === 'planning');   // a super admin sees both front pages
  const tab = params.get('tab') ?? 'books';   // everyone lands on the books — what sells is the first question, what to buy follows from it
  const openId = params.get('open');
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace:true }); };
  const canSource = role === 'sourcing' || role === 'owner';
  const canPlan = role === 'design' || role === 'owner';        // design owns what the book offers

  /* ONE answer to the only question a store asks: can I sell this today? It is
     derived, never typed — design's pause first, then sourcing's switch-off,
     then our own shelf, then the store floor. The same cell on core, non-core
     and bespoke, because the question does not change with the bucket. */
  const OfferCell = ({ f }: { f: Fabric }) => {
    const live = liveStatusOf(f, lead(f.vendorId));
    const c = coverageOf(f, lead(f.vendorId));
    const tone = live === 'Active' ? 'good' : live === 'Low Stock' ? 'warn' : 'risk';
    const why = live === 'Paused' ? `${f.paused!.by} · ${fmtRel(f.paused!.at)}`
      : live === 'On Hold' ? 'switched off — supplier'
      : live === 'Sold Out' ? (f.bucket === 'BESPOKE' ? 'the mill has none' : 'nothing left to cut from')
      : live === 'Low Stock' ? `${c.saleable} m — about ${Math.floor(c.saleable / METRES_PER_SHIRT)} shirts` : null;
    return <>
      <Pill tone={tone}>{live === 'Active' ? 'can sell' : live === 'Low Stock' ? 'low' : live === 'On Hold' ? 'off' : live.toLowerCase()}</Pill>
      {why && <div className="text-[10.5px] mt-0.5" style={{ color:'var(--ink-faint)' }}>{why}</div>}
      {f.paused && <div className="text-[10.5px]" style={{ color:'var(--ink-faint)', fontStyle:'italic' }}>“{f.paused.note}”</div>}
      <div className="mt-1 flex flex-col gap-1 items-start">
        {canPlan ? (f.paused
          ? <Button size="sm" variant="primary" onClick={() => resumeFabric(f.id)}>Resume selling</Button>
          : pausing === f.id
            ? <div className="flex flex-col gap-1" style={{ minWidth: 210 }}>
                <div className="flex gap-1 flex-wrap">{PAUSE_REASONS.map(r => <button key={r} type="button" className="btn sm" style={{ padding:'2px 7px', fontSize:10.5 }} onClick={() => { pauseFabric(f.id, r); setPausing(null); setPauseNote(''); }}>{r}</button>)}</div>
                <Input autoFocus value={pauseNote} onChange={e => setPauseNote(e.target.value)} placeholder="…or type your own reason" style={{ padding:'3px 6px' }}
                  onKeyDown={e => { if (e.key === 'Enter' && pauseNote.trim()) { pauseFabric(f.id, pauseNote.trim()); setPausing(null); setPauseNote(''); } if (e.key === 'Escape') setPausing(null); }} />
                <div className="flex gap-1 items-center"><Button size="sm" variant="primary" disabled={!pauseNote.trim()} onClick={() => { pauseFabric(f.id, pauseNote.trim()); setPausing(null); setPauseNote(''); }}>Pause</Button>
                  <Button size="sm" variant="ghost" onClick={() => setPausing(null)}>Cancel</Button>
                  {!pauseNote.trim() && <span className="text-[10px]" style={{ color:'var(--ink-faint)' }}>pick a reason, or write one</span>}</div>
              </div>
            : <Button size="sm" variant="ghost" onClick={() => { setPausing(f.id); setPauseNote(''); }}>Pause selling…</Button>)
          : !f.paused && <div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>design pauses it</div>}
        {f.onHold && f.supply?.status === 'ok' && <div className="text-[10.5px]" style={{ color:'var(--warn)' }}>the mill says it is back — nothing has switched it on</div>}
        {canSource && !f.paused && (f.onHold
          ? <Button size="sm" variant={f.supply?.status === 'ok' ? 'primary' : undefined} onClick={() => setFabricHold(f.id, false)}>Switch back on</Button>
          : (f.supply && f.supply.status !== 'ok') || f.millAvailable === false
            ? <Button size="sm" onClick={() => setFabricHold(f.id, true)}>Switch off · supplier</Button> : null)}
      </div>
    </>;
  };

  /* What the reorder point has already done about it — the auto-PO made visible
     on the row it belongs to, instead of being a sentence about Enigma. */
  const ReorderCell = ({ f, c }: { f: Fabric; c: ReturnType<typeof coverageOf> }) => {
    const po = fpoOpen.filter(p => p.fabricId === f.id).sort((a, b) => b.raisedOn.localeCompare(a.raisedOn))[0];
    if (po) return <div className="text-[11.5px]">
      <Pill tone={po.vendorConfirmedOn ? 'good' : 'info'}>{po.source === 'auto' ? 'Enigma raised it' : 'raised by hand'}</Pill>
      <div style={{ color:'var(--ink-soft)' }}>{po.metres} m · {fmtRel(po.raisedOn)}</div>
      <div style={{ color:'var(--ink-faint)' }}>{po.vendorConfirmedOn ? `mill ships ${fmtDate(po.expectedOn)}` : 'mill has not confirmed'}</div>
      <button type="button" className="cta" onClick={() => set('tab', 'pos')}>open the PO →</button>
    </div>;
    if (!c.belowRop) return <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>above the point — nothing to do</span>;
    return <div className="text-[11.5px]">
      {f.international
        ? <><Pill tone="warn">no automation</Pill><div style={{ color:'var(--ink-soft)' }}>international — a person raises it</div></>
        : <><Pill tone="info">Enigma fires tonight</Pill><div style={{ color:'var(--ink-soft)' }}>{c.suggestedPo} m — the mill's MOQ</div></>}
      {(canPlan || canSource) && <div className="mt-1"><Button size="sm" variant="primary" onClick={() => raiseFabricPo(f.id, c.suggestedPo)}>Raise it now · {c.suggestedPo} m</Button></div>}
    </div>;
  };
  const lead = (vid: string) => db.vendors.find(v => v.id === vid)?.leadDays ?? 14;
  const vendorName = (id: string) => db.vendors.find(v => v.id === id)?.name ?? '—';

  const core = db.fabrics.filter(f => f.bucket === 'CORE').map(f => ({ f, c: coverageOf(f, lead(f.vendorId), db.vendors.find(v => v.id === f.vendorId)) })).sort((a, b) => a.c.coverDays - b.c.coverDays);
  const nonCore = db.fabrics.filter(f => f.bucket === 'NON_CORE');
  const bespoke = db.fabrics.filter(f => f.bucket === 'BESPOKE');
  const blocks = db.blocks.filter(b => b.status === 'held').sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
  /* worked examples: one row per state so a demo shows each situation once; ?all=1 shows the whole sheet */
  const exBlocks = useExamples(blocks, b => { const left = -daysAgo(b.expiresOn); return left < 7 ? 'urgent' : left <= 21 ? 'soon' : 'ok'; }, { noun: 'blocks', done: b => -daysAgo(b.expiresOn) > 21 });
  const blocksPager = usePager(exBlocks.rows, 20);

  const belowRop = core.filter(x => x.c.belowRop);
  const reviewDue = core.filter(x => !x.f.supply || daysAgo(x.f.supply.reviewedOn) >= 7);
  const beginReview = (f: Fabric) => { setReview(f.id); setRvStatus(f.supply?.status ?? 'ok'); setRvNote(f.supply?.note ?? ''); setRvBack(f.supply?.backOn ? dateInput(f.supply.backOn) : ''); };
  const saveReview = () => { if (!review) return; reviewCoreStock(review, rvStatus, rvNote.trim(), rvStatus === 'ok' ? null : (rvBack ? fromDateInput(rvBack) : null)); setReview(null); };
  const intlBelow = belowRop.filter(x => x.f.international);
  /* the gap that costs money: a core fabric a store can still be offered with
     nothing left to cut from. It was invisible while the row only showed
     paused / off and never looked at the shelf. */
  const soldOutLive = core.filter(x => liveStatusOf(x.f, lead(x.f.vendorId)) === 'Sold Out');
  const autoRaised7d = (db.fabricPos ?? []).filter(p => p.source === 'auto' && daysAgo(p.raisedOn) <= 7);
  const awaitingPo = belowRop.filter(x => !fpoOpen.some(p => p.fabricId === x.f.id));
  /* the list Planning rebuilds in Excel every week: international core under its
     point with nothing on order — Enigma will not raise these, a person must. */
  const toRaiseByHand = core.filter(x => x.f.international && x.c.belowRop && !fpoOpen.some(p => p.fabricId === x.f.id));
  const coreRows = core.filter(x => coreFilter === 'all' ? true : coreFilter === 'manual' ? toRaiseByHand.some(y => y.f.id === x.f.id) : coreFilter === 'intl' ? x.f.international : coreFilter === 'below' ? x.c.belowRop : coreFilter === 'soldout' ? liveStatusOf(x.f, lead(x.f.vendorId)) === 'Sold Out' : coreFilter === 'paused' ? !!x.f.paused : coreFilter === 'off' ? x.f.onHold : !x.f.supply || daysAgo(x.f.supply.reviewedOn) >= 7);
  const exCore = useExamples(coreRows, x => x.c.belowRop ? 'under' : x.f.paused ? 'paused' : x.f.onHold ? 'off' : x.f.supply?.status ?? 'unchecked', { noun: 'core fabrics', score: x => (x.f.supply ? 1 : 0) + (x.f.coreBlock ? 1 : 0) + (x.c.incoming ? 1 : 0), done: x => !x.c.belowRop && !x.f.paused && !x.f.onHold && x.f.supply?.status === 'ok' });
  const corePager = usePager(exCore.rows, 20);
  const gateOpen = bespoke.filter(f => f.millAvailable === false && !f.onHold);
  /* Every pager is a hook, so all of them live here, not inside a tab body — a
     hook behind `tab === '…'` changes the hook count when the tab changes, and
     React tears the screen down mid-render. */
  const exNonCore = useExamples(nonCore, f => liveStatusOf(f, lead(f.vendorId)), { noun: 'fabrics', done: f => liveStatusOf(f, lead(f.vendorId)) === 'Active' });
  const nonCorePager = usePager(exNonCore.rows, 20);
  const bespokeRows = [...gateOpen, ...bespoke.filter(f => !(f.millAvailable === false && !f.onHold))];
  const exBespoke = useExamples(bespokeRows, f => f.millAvailable === false ? (f.onHold ? 'sold-out-off' : 'sold-out-live') : 'available', { noun: 'bespoke fabrics', done: f => f.millAvailable !== false && !f.onHold && !f.paused });
  const bespokePager = usePager(exBespoke.rows, 25);
  const cb = db.fabrics.filter(f => f.bucket === 'CORE').sort((a, b) => (a.coreBlock ? -daysAgo(a.coreBlock.until) : -1) - (b.coreBlock ? -daysAgo(b.coreBlock.until) : -1));
  const cbRows = [...cb.filter(f => !f.coreBlock), ...cb.filter(f => f.coreBlock && -daysAgo(f.coreBlock.until) <= 60), ...cb.filter(f => f.coreBlock && -daysAgo(f.coreBlock.until) > 60)];
  const exCb = useExamples(cbRows, f => { const b = f.coreBlock; const left = b ? -daysAgo(b.until) : null; return !b ? 'none' : left! < 0 ? 'lapsed' : left! <= 60 ? 'renew' : 'held'; }, { noun: 'core fabrics', done: f => !!f.coreBlock && -daysAgo(f.coreBlock.until) > 60 });
  const cbPager = usePager(exCb.rows, 20);
  const ranges = db.ranges.map(r => { const fam = nonCore.filter(f => f.family === r.family); const healthy = fam.filter(f => liveStatusOf(f, lead(f.vendorId)) === 'Active').length; return { ...r, listed: fam.length, healthy, gap: r.targetOptions - healthy }; });
  const active = db.fabrics.find(f => f.id === openId) ?? null;

  return (
    <Page title="MTM fabric master" lede="Core, non-core and bespoke, each with the one trigger it lacks today — click any fabric for its full 360."
      replaces="the fabric ordering sheet, the international-core Excel rebuilt weekly, the block sheet in three copies, and five mill emails re-typed every morning">
      {/* design reads the master by book — what is on the shelf, what is coming, what each fabric sells as;
          sourcing reads it by what to buy. Same rows, two front pages. */}
      {/* two questions, two rows: what sells (design reads by book and by range) and
          what to buy (sourcing reads by trigger). One row of tabs, folded flat, was
          seven labels with counts fighting for the eye. */}
      {(() => {
        type T = { id: string; label: string; count?: number; hint?: string };
        const groups: { id: string; label: string; tabs: T[] }[] = [
          { id:'sell', label:'What sells', tabs: [
            { id:'books', label:'Fabric inventory', hint:'every MTM fabric as Enigma lists it — code, name, category, inventory type, saleable, physical, reserved, threshold — filtered by swatch book' },
            { id:'noncore', label:'Ranges · non-core gaps', hint:'each range against its plan of options' } ] },
          { id:'orders', label:'Cloth on order', tabs: [
            { id:'pos', label: designSide ? 'Fabric POs' : 'Fabric POs · confirm with mills', count: designSide ? undefined : fpoUnconfirmed },
            ...(designSide ? [] : [
              { id:'core', label:'Core · weekly stock review', count: reviewDue.length, hint:'sourcing reviews every core fabric with its mill once a week; an out fabric is escalated to design' },
              { id:'trims', label:'Trims & packaging', count: (db.trims ?? []).filter(t => trimCoverageOf(db, t).belowThreshold).length } ]) ] },
        ];
        const group = groups.find(g => g.tabs.some(t => t.id === tab)) ?? groups[0];
        return <>
          <Tabs tabs={groups.map(g => ({ id: g.id, label: g.label, count: g.tabs.reduce((n, t) => n + (t.count ?? 0), 0) || undefined }))} active={group.id} onChange={id => set('tab', groups.find(g => g.id === id)!.tabs[0].id)} />
          {group.tabs.length > 1 && <div className="flex items-center gap-1 flex-wrap mb-3" style={{ marginTop: -8 }}>
            <Seg value={tab} onChange={t => set('tab', t)} options={group.tabs.map(t => ({ id: t.id, label: t.label, count: t.count, hint: t.hint }))} />
          </div>}
        </>; })()}
      {tab === 'books' && <BooksTab onOpen={id => set('open', id)} />}

      {tab === 'trims' && <TrimsTab />}

      {tab === 'core' && <>
        <div className="mb-3"><Note tone={awaitingPo.filter(x => !x.f.international).length ? 'warn' : undefined}>
          <b>The reorder point is max(what sells while the mill makes it, the mill's MOQ)</b>, and the PO is the MOQ. Under it, a <b>domestic</b> fabric is Enigma's own auto-PO — the one piece of automation in the company; an <b>international</b> one is a person with a spreadsheet, which is why {intlBelow.length} of the {belowRop.length} under the point {intlBelow.length === 1 ? 'is' : 'are'} still waiting. Every row below says what actually happened to its reorder, not what is supposed to happen.</Note></div>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {([['all', `All ${core.length}`], ['manual', `Raise the PO by hand ${toRaiseByHand.length}`], ['intl', `International ${core.filter(x => x.f.international).length}`], ['below', `Under the point ${belowRop.length}`], ['soldout', `Sold out, still sellable ${soldOutLive.length}`], ['paused', `Paused by design ${core.filter(x => x.f.paused).length}`], ['off', `Switched off ${core.filter(x => x.f.onHold).length}`], ['unchecked', `Mill check due ${reviewDue.length}`]] as const).map(([k, label]) =>
            <button key={k} type="button" className={`btn sm ${coreFilter === k ? 'primary' : ''}`} onClick={() => setCoreFilter(k)}>{label}</button>)}
          {exCore.strip && <span className="ml-auto self-center">{exCore.strip}</span>}
        </div>
        <Card><div style={{ overflowX:'auto' }}><table className="t compact">
          <thead><tr><th>Fabric</th><th>Mill</th><th>Stock &amp; cover</th><th>Reorder point</th><th>The reorder — what happened</th><th>What the mill said · weekly</th><th>Can stores sell it?</th></tr></thead>
          <tbody>{corePager.pageRows.map(({ f, c }) => <tr key={f.id} className="row" onClick={() => set('open', f.id)} style={{ background: review === f.id ? 'var(--accent-soft)' : undefined }}>
            <td className="font-medium" style={{ whiteSpace:'normal', minWidth: 170 }}>{f.name}<div className="text-[11px] font-normal mono" style={{ color:'var(--ink-faint)' }}>{f.code}{f.swatchBook ? ` · ${f.swatchBook}` : ''}</div>{!f.coreBlock && <div className="mt-1"><Pill tone="risk">no supply block</Pill></div>}</td>
            <td className="text-[12.5px]" style={{ whiteSpace:'normal' }}>{vendorName(f.vendorId)}{f.vendorCode && <span className="mono text-[11px]" style={{ color:'var(--ink-faint)' }}> · {f.vendorCode}</span>}<div className="text-[10.5px]" style={{ color: f.international ? 'var(--warn)' : 'var(--ink-faint)' }}>{f.international ? `International · ${lead(f.vendorId)}d lead` : `Domestic · ${lead(f.vendorId)}d lead`}</div></td>
            {/* one cell, because these four numbers are one sentence: what is left, what is coming, how fast it sells, how long it lasts */}
            <td style={{ whiteSpace:'normal', minWidth: 150 }}>
              <div className="mono text-[13px]" style={{ color: c.saleable <= 0 ? 'var(--risk)' : undefined }}>{c.saleable} m saleable</div>
              <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{c.incoming ? <span style={{ color:'var(--info)' }}>+{c.incoming} m on order · </span> : null}{c.ros.toFixed(1)} shirts/wk</div>
              <div className="text-[11px]" style={{ color: c.coverDays < lead(f.vendorId) ? 'var(--risk)' : 'var(--ink-faint)' }}>{c.coverDays > 365 ? 'no sales to measure' : `${c.coverDays} days of cover`}{c.coverDays < lead(f.vendorId) && c.coverDays <= 365 ? ` · mill takes ${lead(f.vendorId)}d` : ''}</div>
            </td>
            <td style={{ whiteSpace:'normal', minWidth: 120 }}><div className="mono text-[13px]">{c.rop} m</div>
              <div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{c.leadDemand >= c.moq ? `${lead(f.vendorId)} days of sales` : `the mill's MOQ`}</div>
              {c.belowRop ? <Pill tone="risk">under it</Pill> : c.saleable <= 0 ? <Pill tone="info">covered by the PO</Pill> : <Pill tone="good">above it</Pill>}</td>
            <td onClick={e => e.stopPropagation()} style={{ whiteSpace:'normal', minWidth: 170 }}><ReorderCell f={f} c={c} /></td>
            <td onClick={e => e.stopPropagation()} style={{ whiteSpace:'normal', minWidth: 190 }}>
              {f.supply ? <><Pill tone={f.supply.status === 'ok' ? 'good' : f.supply.status === 'delayed' ? 'warn' : 'risk'}>{f.supply.status === 'ok' ? 'mill has it' : f.supply.status === 'delayed' ? 'mill delayed' : 'mill run out'}</Pill><div className="text-[11px]" style={{ color: daysAgo(f.supply.reviewedOn) >= 7 ? 'var(--warn)' : 'var(--ink-faint)' }}>asked {fmtRel(f.supply.reviewedOn)} · {f.supply.by}{daysAgo(f.supply.reviewedOn) >= 7 ? ' · due again' : ''}</div>{f.supply.note && <div className="text-[11px]" style={{ color:'var(--ink-soft)' }}>“{f.supply.note}”{f.supply.backOn ? ` · back ${fmtDate(f.supply.backOn)}` : ''}</div>}</>
                : <Pill tone="warn">never asked</Pill>}
              {canSource && review !== f.id && <div className="mt-1"><Button size="sm" variant={!f.supply || daysAgo(f.supply.reviewedOn) >= 7 ? 'primary' : 'ghost'} onClick={() => beginReview(f)}>Asked the mill…</Button></div>}
            </td>
            <td onClick={e => e.stopPropagation()} style={{ whiteSpace:'normal', minWidth: 190 }}><OfferCell f={f} /></td>
          </tr>)}</tbody>
        </table></div>
        <Pager page={corePager.page} pageCount={corePager.pageCount} onChange={corePager.setPage} from={corePager.from} to={corePager.to} total={corePager.total} noun="core fabrics" />
        {review && (() => { const f = db.fabrics.find(x => x.id === review)!; return <div className="px-4 py-3" style={{ borderTop:'1px solid var(--line)' }}>
          <div className="label">{f.name} · {vendorName(f.vendorId)} — what did the supplier say this week?</div>
          <div className="flex gap-1 mb-2">{([['ok','In stock, on schedule'],['delayed','Delayed past the committed date'],['out','Run out at the supplier']] as const).map(([k, l]) => <button key={k} type="button" className={`btn sm ${rvStatus === k ? 'primary' : ''}`} onClick={() => setRvStatus(k)}>{l}</button>)}</div>
          <div className="grid gap-2.5 items-end" style={{ gridTemplateColumns: rvStatus === 'ok' ? '1fr auto auto' : '160px 1fr auto auto' }}>
            {rvStatus !== 'ok' && <Field label="Back in stock by" hint="leave blank if the supplier has no date"><Input type="date" value={rvBack} onChange={e => setRvBack(e.target.value)} /></Field>}
            <Field label="Note" hint={rvStatus === 'ok' ? 'optional — e.g. 600 m received Tuesday' : 'goes to Neha and design as the reason'}><Input value={rvNote} onChange={e => setRvNote(e.target.value)} placeholder={rvStatus === 'ok' ? 'in stock' : 'e.g. dyeing backlog — dispatch a week past commitment'} /></Field>
            <Button variant="primary" size="sm" onClick={saveReview}>{rvStatus === 'ok' ? 'Save · in stock' : 'Save · escalate to design'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setReview(null)}>Cancel</Button>
          </div>
        </div>; })()}
        </Card>
        <div className="mt-3 flex flex-col gap-2"><Note>A supplier delay or run-out becomes the fabric's status here, and design sees "switch it off" on their Today.</Note>
        <Note>Reorder point = (mill lead time + weekly review) × projected metres per week.</Note></div>
      </>}

      {tab === 'noncore' && <>
        <Card><table className="t">
          <thead><tr><th>Family</th><th className="num">Plan (from the label)</th><th className="num">Listed</th><th className="num">Healthy</th><th className="num">Slots to source</th></tr></thead>
          <tbody>{ranges.map(r => <tr key={r.family}><td className="font-medium">{r.family}</td><td className="num">{r.targetOptions}</td><td className="num">{r.listed}</td><td className="num" style={{ color:'var(--good)' }}>{r.healthy}</td><td className="num" style={{ color: r.gap > 0 ? 'var(--risk)' : 'var(--good)' }}>{r.gap > 0 ? r.gap : 'full'}</td></tr>)}</tbody>
        </table></Card>
        <div className="flex items-baseline mt-5 mb-2"><h3 className="m-0">Options in the ranges</h3>{exNonCore.strip && <span className="ml-auto">{exNonCore.strip}</span>}</div>
        <Card><table className="t">
          <thead><tr><th>Fabric</th><th>Family</th><th>Mill</th><th className="num">Saleable</th><th>Can stores sell it?</th></tr></thead>
          <tbody>{nonCorePager.pageRows.map(f => { const c = coverageOf(f, lead(f.vendorId)); return <tr key={f.id} className="row" onClick={() => set('open', f.id)}>
            <td className="font-medium">{f.name}<div className="text-[11px] font-normal mono" style={{ color:'var(--ink-faint)' }}>{f.code}{(f.nameHistory ?? []).length ? <span style={{ fontFamily:'var(--body)' }}> · formerly {f.nameHistory![f.nameHistory!.length - 1].name}</span> : null}</div></td><td className="text-[12.5px]">{f.family}</td><td className="text-[12.5px]">{vendorName(f.vendorId)}{f.international && <span className="pill ml-1">intl</span>}</td>
            <td className="num">{c.saleable} m</td>
            <td onClick={e => e.stopPropagation()} style={{ whiteSpace:'normal', minWidth: 170 }}><OfferCell f={f} /></td></tr>; })}</tbody>
        </table>
        <Pager page={nonCorePager.page} pageCount={nonCorePager.pageCount} onChange={nonCorePager.setPage} from={nonCorePager.from} to={nonCorePager.to} total={nonCorePager.total} noun="fabrics" />
        </Card>
        <div className="mt-3"><Note>Non-core is never re-bought — when a family thins, the slot is refilled with a new fabric.</Note></div>
      </>}

      {tab === 'pos' && <FabricPosTab canSource={canSource || canPlan} />}

      {tab === 'bespoke' && <>
        {gateOpen.length > 0 && <div className="mb-3"><Note tone="risk">{gateOpen.length} fabric{gateOpen.length === 1 ? '' : 's'} the mill has reported sold out are still orderable on Shopify and in stores. Inside that gap a customer can buy a shirt that cannot be made.</Note></div>}
        {exBespoke.strip && <div className="flex justify-end mb-2">{exBespoke.strip}</div>}
        <Card><table className="t">
          <thead><tr><th>Fabric</th><th>Mill</th><th>Mill last said</th><th>Reported</th><th>Can stores sell it?</th></tr></thead>
          <tbody>{bespokePager.pageRows.map(f => <tr key={f.id} className="row" onClick={() => set('open', f.id)}>
            <td className="font-medium">{f.name}</td><td className="text-[12.5px]">{vendorName(f.vendorId)}</td>
            <td>{f.millAvailable === false ? <Pill tone="risk">sold out</Pill> : <Pill tone="good">available</Pill>}</td>
            <td className="text-[12.5px]" style={{ color:'var(--ink-faint)' }}>{fmtRel(f.millReportedAt)}</td>
            <td onClick={e => e.stopPropagation()} style={{ whiteSpace:'normal', minWidth: 190 }}>
              <OfferCell f={f} /></td>
          </tr>)}</tbody>
        </table>
        <Pager page={bespokePager.page} pageCount={bespokePager.pageCount} onChange={bespokePager.setPage} from={bespokePager.from} to={bespokePager.to} total={bespokePager.total} noun="bespoke fabrics" />
        </Card>
        <div className="mt-3"><Note>The trigger is the gap between the mill selling out and the customer still being able to pick it.</Note></div>
      </>}

      {tab === 'blocks' && !canSource && <div className="mb-2"><ActsBy role="sourcing" does="converts a block to a PO or releases it back to the vendor" inline /></div>}
      {tab === 'blocks' && <>
        <Card>
          <div className="px-4 py-2.5 flex items-start gap-3" style={{ borderBottom:'1px solid var(--line-soft)' }}><div><h3>Continuous supply · core</h3><div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>Non-core is bought once. The day a fabric is promoted to core, sourcing asks the mill to hold it for a year or two — otherwise the auto-PO fires at a mill that has moved on.</div></div>{exCb.strip && <span className="ml-auto" style={{ whiteSpace:'nowrap' }}>{exCb.strip}</span>}</div>
          <div style={{ overflowX:'auto' }}><table className="t compact"><thead><tr><th>Fabric</th><th>Mill</th><th className="num">m / month</th><th>Agreed</th><th>Holds until</th><th>Terms</th><th>State</th></tr></thead>
          <tbody>{cbPager.pageRows.map(f => { const b = f.coreBlock; const left = b ? -daysAgo(b.until) : null; return <tr key={f.id} className="row" onClick={() => set('open', f.id)}>
            <td className="font-medium">{f.name}<div className="text-[11px] font-normal mono" style={{ color:'var(--ink-faint)' }}>{f.code}{f.promotedOn ? ` · promoted ${fmtRel(f.promotedOn)}` : ''}</div></td>
            <td className="text-[12.5px]">{vendorName(f.vendorId)}</td>
            <td className="num">{b ? `${b.metresPerMonth} m` : '—'}</td><td>{b ? fmtDate(b.agreedOn) : '—'}</td><td>{b ? fmtDate(b.until) : '—'}</td>
            <td className="text-[12px]" style={{ whiteSpace:'normal', maxWidth: 220, color:'var(--ink-soft)' }}>{b?.note || (b ? b.via : 'sourcing to speak to the mill')}</td>
            <td>{!b ? <Pill tone="risk">no block</Pill> : left! < 0 ? <Pill tone="risk">lapsed</Pill> : left! <= 60 ? <Pill tone="warn">{left}d left · renew</Pill> : <Pill tone="good">held · {Math.round(left! / 30)} mo</Pill>}</td>
          </tr>; })}</tbody></table></div>
          <Pager page={cbPager.page} pageCount={cbPager.pageCount} onChange={cbPager.setPage} from={cbPager.from} to={cbPager.to} total={cbPager.total} noun="core fabrics" />
        </Card>
        <div className="mt-3 mb-3 flex items-baseline"><span className="label">Short blocks · bulk buys</span>{exBlocks.strip && <span className="ml-auto">{exBlocks.strip}</span>}</div>
      </>}
      {tab === 'blocks' && (blocks.length === 0 ? <Card><Empty title="No blocks held." body="Nothing is being held at a mill right now." /></Card> : <>
        <Card><table className="t">
          <thead><tr><th>Fabric</th><th>Mill</th><th className="num">Metres</th><th>Agreed</th><th>Via</th><th>Expires</th><th>Countdown</th><th></th></tr></thead>
          <tbody>{blocksPager.pageRows.map(b => { const left = -daysAgo(b.expiresOn); return <tr key={b.id}>
            <td className="font-medium">{b.fabricName}</td><td className="text-[12.5px]">{vendorName(b.vendorId)}</td><td className="num">{b.metres}</td>
            <td>{fmtDate(b.agreedOn)}</td><td className="text-[12px]">{b.via}</td><td>{fmtDate(b.expiresOn)}</td>
            <td><Pill tone={left < 0 ? 'risk' : left <= 7 ? 'risk' : left <= 21 ? 'warn' : 'good'}>{left < 0 ? `expired ${-left}d ago` : `${left}d left`}</Pill></td>
            <td>{canSource ? <div className="flex gap-1"><Button size="sm" variant="primary" onClick={() => convertBlock(b.id)}>Convert to PO</Button><Button size="sm" variant="ghost" onClick={() => releaseBlock(b.id)}>Release</Button></div> : null}</td>
          </tr>; })}</tbody>
        </table>
        <Pager page={blocksPager.page} pageCount={blocksPager.pageCount} onChange={blocksPager.setPage} from={blocksPager.from} to={blocksPager.to} total={blocksPager.total} noun="blocks" />
        </Card>
        <div className="mt-3"><Note>A block is a handshake: no money paid, the mill holds 2–5 months, and it expires unless someone acts.</Note></div>
      </>)}

      <Drawer open={!!active} onClose={() => set('open', null)} title={active?.name ?? ''} subtitle={active && <><Pill tone="accent">{active.bucket.replace('_', '-').toLowerCase()}</Pill><span className="mono">{active.code}</span><span>· {vendorName(active.vendorId)}{active.international ? ' · International' : ' · Domestic'}</span></>}>
        {active && <Fabric360 f={active} canSource={canSource} canPlan={canPlan} />}
      </Drawer>
    </Page>
  );
}

/* ---------- the 360: every fact the tool holds about one fabric ---------- */
function Fabric360({ f, canSource, canPlan }: { f: Fabric; canSource: boolean; canPlan: boolean }) {
  const [pnote, setPnote] = useState('');
  const { db, role, setFabricHold, pauseFabric, resumeFabric, raiseFabricPo, convertBlock, releaseBlock, setFabricBucket, agreeCoreBlock, endCoreBlock, renameFabric } = useApp();
  const canDesign = role === 'design' || role === 'owner';
  const [renaming, setRenaming] = useState(false); const [newName, setNewName] = useState(f.name); const [renameWhy, setRenameWhy] = useState('');
  const [blk, setBlk] = useState(false); const [blkYears, setBlkYears] = useState<1 | 2 | 0>(1); const [blkUntil, setBlkUntil] = useState(''); const [blkMpm, setBlkMpm] = useState(''); const [blkVia, setBlkVia] = useState<'email' | 'whatsapp' | 'call'>('email'); const [blkNote, setBlkNote] = useState('');
  const mill = db.vendors.find(v => v.id === f.vendorId)!;
  const c = coverageOf(f, mill.leadDays, mill);
  const live = liveStatusOf(f, mill.leadDays);
  const range = db.ranges.find(r => r.family === f.family);
  const family = db.fabrics.filter(x => x.family === f.family && x.bucket === f.bucket);
  const familyHealthy = family.filter(x => liveStatusOf(x, mill.leadDays) === 'Active').length;
  const familyWord = f.family.split(' ')[0].toLowerCase();
  const blocks = db.blocks.filter(b => b.vendorId === f.vendorId && (b.fabricName.toLowerCase().includes(familyWord) || b.fabricName.toLowerCase().includes(f.name.split(' ').pop()!.toLowerCase())));
  const swatches = db.swatchDispatches.filter(s => s.fabricId === f.id);
  const inStockWeeks = f.weeklySalesShirts.map(() => true);
  const storeNames = (ids: string[]) => ids.map(id => STORES.find(s => s.id === id)?.name ?? id);

  return <>
    {/* the name is a label with a history; the code is the fabric */}
    <div className="px-1 pb-2">
      {(f.nameHistory ?? []).length > 0 && <div className="text-[12px]" style={{ color:'var(--ink-soft)' }}><span className="pill">renamed</span> formerly {formerNames(f)} — same code <span className="mono">{f.code}</span>, same numbers.</div>}
      {canDesign && !renaming && <button type="button" className="vlink text-[12px]" onClick={() => { setNewName(f.name); setRenaming(true); }}>Rename this fabric</button>}
      {renaming && <div className="flex gap-2 items-end flex-wrap pt-1">
        <div style={{ width: 260 }}><Field label="New name" hint={`the code ${f.code} does not change`}><Input value={newName} onChange={e => setNewName(e.target.value)} /></Field></div>
        <div className="flex-1" style={{ minWidth: 200 }}><Field label="Why"><Input value={renameWhy} onChange={e => setRenameWhy(e.target.value)} placeholder="book reprint; the shade name read wrong" /></Field></div>
        <Button size="sm" variant="primary" disabled={!newName.trim() || newName.trim() === f.name} onClick={() => { renameFabric(f.id, newName, renameWhy.trim()); setRenaming(false); setRenameWhy(''); }}>Rename</Button>
        <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
      </div>}
    </div>
    <Section title="Where it stands" right={<Pill tone={live === 'Active' ? 'good' : live === 'Low Stock' ? 'warn' : 'risk'}>{live}</Pill>}>
      <KV k="Bucket" v={f.bucket === 'CORE' ? 'Core — must never run out' : f.bucket === 'NON_CORE' ? 'Non-core — one buy, refill the slot' : 'Bespoke — held at the mill, not by BSC'} note={f.bucket === 'NON_CORE' ? 'a non-core that keeps selling is promoted to core — then it is replenished, not left to sell out' : f.bucket === 'CORE' ? 'a core that stops earning its place is moved back to non-core and allowed to sell out' : undefined} />
      {/* an action, not a value — on its own labelled row, so it cannot be read
          as "this core fabric is in non-core" */}
      {canPlan && f.bucket !== 'BESPOKE' && <KV k="Change the bucket" v={f.bucket === 'NON_CORE'
        ? <Button size="sm" variant="primary" onClick={() => setFabricBucket(f.id, 'CORE', '')}>Promote to core →</Button>
        : <Button size="sm" variant="ghost" onClick={() => setFabricBucket(f.id, 'NON_CORE', '')}>Demote to non-core →</Button>}
        note={f.bucket === 'NON_CORE' ? 'core is replenished on a reorder point; non-core is bought once' : 'it stops being replenished and is allowed to sell out'} />}
      {f.bucket === 'CORE' && <>
        <KV k="Supply block with the mill" v={f.coreBlock ? <b>until {fmtDate(f.coreBlock.until)}</b> : <span style={{ color:'var(--risk)' }}>none agreed</span>}
          note={f.coreBlock ? `${f.coreBlock.metresPerMonth} m a month · agreed ${fmtRel(f.coreBlock.agreedOn)} by ${f.coreBlock.by} over ${f.coreBlock.via}${f.coreBlock.note ? ` · ${f.coreBlock.note}` : ''}${-daysAgo(f.coreBlock.until) <= 60 ? ` · ${-daysAgo(f.coreBlock.until) < 0 ? 'lapsed' : `${-daysAgo(f.coreBlock.until)}d left — renew`}` : ''}` : `${f.promotedOn ? `promoted ${fmtRel(f.promotedOn)} — ` : ''}non-core was a one-time buy; core needs the mill to keep weaving it. Sourcing asks ${mill.name} to hold it for a year or two`} />
        {!blk && (canSource
          ? <div className="pt-1 flex gap-1">{!f.coreBlock ? <Button size="sm" variant="primary" onClick={() => { setBlk(true); setBlkYears(1); setBlkUntil(''); setBlkMpm(String(Math.max(100, Math.round(c.baseMpw * 4.33 / 50) * 50))); setBlkNote(''); }}>Agree a block with {mill.name}…</Button>
            : <><Button size="sm" variant={-daysAgo(f.coreBlock.until) <= 60 ? 'primary' : undefined} onClick={() => { setBlk(true); setBlkYears(1); setBlkUntil(''); setBlkMpm(String(f.coreBlock!.metresPerMonth)); setBlkVia(f.coreBlock!.via); setBlkNote(f.coreBlock!.note); }}>Renew / change…</Button><Button size="sm" variant="ghost" onClick={() => endCoreBlock(f.id)}>End block</Button></>}</div>
          : !f.coreBlock ? <ActsBy role="sourcing" does={`asks ${mill.name} to block this fabric for a year or two`} /> : null)}
        {blk && <div className="mt-2 p-3" style={{ background:'var(--accent-soft)', borderRadius: 8 }}>
          <div className="label">What did {mill.name} agree to hold?</div>
          <div className="flex gap-1 mb-2">{([[1, 'One year'], [2, 'Two years'], [0, 'Until a date…']] as const).map(([y, l]) => <button key={y} type="button" className={`btn sm ${blkYears === y ? 'primary' : ''}`} onClick={() => setBlkYears(y)}>{l}</button>)}</div>
          <div className="grid gap-2.5 items-end" style={{ gridTemplateColumns: blkYears === 0 ? '150px 120px 110px 1fr' : '120px 110px 1fr' }}>
            {blkYears === 0 && <Field label="Hold until"><Input type="date" value={blkUntil} onChange={e => setBlkUntil(e.target.value)} /></Field>}
            <Field label="Metres a month" hint={`planned demand ≈ ${Math.round(c.baseMpw * 4.33)} m`}><Input type="number" min={0} value={blkMpm} onChange={e => setBlkMpm(e.target.value)} /></Field>
            <Field label="Agreed over"><select className="input" value={blkVia} onChange={e => setBlkVia(e.target.value as 'email' | 'whatsapp' | 'call')}><option value="email">email</option><option value="whatsapp">WhatsApp</option><option value="call">call</option></select></Field>
            <Field label="Terms" hint="price fixed? reviewed when?"><Input value={blkNote} onChange={e => setBlkNote(e.target.value)} placeholder="e.g. price fixed for the first year" /></Field>
          </div>
          <div className="flex gap-2 mt-2"><Button size="sm" variant="primary" disabled={blkYears === 0 ? !blkUntil : !Number(blkMpm)} onClick={() => { const until = blkYears === 0 ? (fromDateInput(blkUntil) ?? iso(TODAY)) : iso(addDays(TODAY, 365 * blkYears)); agreeCoreBlock(f.id, until, Number(blkMpm) || 0, blkVia, blkNote.trim()); setBlk(false); }}>Mill agreed — record the block</Button><Button size="sm" variant="ghost" onClick={() => setBlk(false)}>Cancel</Button></div>
        </div>}
      </>}
      <KV k="Family / range" v={f.family} note={range ? `${familyHealthy} healthy of ${range.targetOptions} planned in this family` : undefined} />
      <KV k="Fabric vendor" v={<VendorLink id={mill.id}>{mill.name}</VendorLink>} note={`${mill.kind} · ${mill.location} · ${mill.leadDays}d measured lead · ${Math.round(mill.onTimeRate * 100)}% on time`} />
      {f.vendorCode && <KV k="Vendor article" v={<span className="mono">{f.vendorCode}</span>} note="what goes on the PO — the mill does not know our code" />}
      {(f.composition || f.widthIn) && <KV k="Composition · width" v={`${f.composition ?? '—'}${f.widthIn ? ` · ${f.widthIn}" panna` : ''}`} />}
      {(f.cpm || f.mrp) && <KV k="Price" v={`${f.cpm ? `₹${f.cpm}/m` : '—'}${f.mrp ? ` · shirt MRP ₹${f.mrp.toLocaleString('en-IN')}` : ''}`} />}
      {f.swatchBook && <KV k="Swatch book" v={f.swatchBook} note="where the store finds it" />}
      {f.international && <div className="pt-2"><Note tone="warn">International — Enigma's auto-PO does not reach this fabric. Reordering is a person's job, and the reorder point below is what that person should act on.</Note></div>}
    </Section>

    {f.bucket !== 'BESPOKE' ? <Section title="Stock & coverage" right={c.belowRop ? <Pill tone="risk">below reorder point</Pill> : <Pill tone="good">covered</Pill>}>
      <KV k="Physical stock" v={`${f.stockMetres} m`} />
      <KV k="Reserved against orders" v={`− ${f.reservedMetres} m`} note="Enigma reserves the moment an order is punched" />
      <KV k="Threshold (Enigma floor)" v={`− ${f.thresholdMetres} m`} />
      <KV k="Saleable" v={<b>{c.saleable} m</b>} note={`≈ ${Math.floor(c.saleable / 2.15)} shirts at 2.15 m each`} />
      <KV k="Incoming on open POs" v={c.incoming ? `+ ${c.incoming} m` : 'nothing on order'} note={c.incoming ? (() => { const ps = (db.fabricPos ?? []).filter(p => p.fabricId === f.id && !p.receivedOn); return ps.map(p => `${p.poNo} · ${p.metres} m · ${fabricPoStatus(p)}${p.vendorConfirmedOn ? ` · mill says ${fmtDate(p.expectedOn)}` : ''}${p.remark ? ` · “${p.remark}”` : ''}`).join(' | ') || 'counts as cover so the same fabric is not ordered twice'; })() : undefined} />
      <KV k="Available to promise" v={`${c.atp} m`} note="saleable + incoming" />
      <KV k="Store reads it as" v={live} note={c.lowForStore ? `under ${STORE_LOW_METRES} m — the store's own rule of thumb for low` : undefined} />
      <KV k="On Shopify & in stores" v={f.paused ? 'Paused by design' : f.onHold ? 'Switched off' : 'Live'} note={f.paused ? `${f.paused.by} · ${fmtRel(f.paused.at)} — “${f.paused.note}”` : f.bucket === 'CORE' && f.onHold && f.supply?.status === 'ok' ? 'sourcing says it is back — nobody has switched it on' : undefined} />
      {f.paused
        ? <div className="pt-2"><Note tone="warn">Paused by design — no store and no website can offer it, whatever the shelf or the mill says. {canPlan ? <Button size="sm" variant="primary" onClick={() => resumeFabric(f.id)}>Resume</Button> : <ActsBy role="design" does="resumes it" inline />}</Note></div>
        : canPlan ? <div className="flex gap-2 items-end pt-2 flex-wrap"><div className="flex-1" style={{ minWidth: 200 }}><Field label="Pause this fabric" hint="the reason goes on the record with your name"><Input value={pnote} onChange={e => setPnote(e.target.value)} placeholder="shade being retired at the end of the book" /></Field></div><Button size="sm" disabled={!pnote.trim()} onClick={() => { pauseFabric(f.id, pnote.trim()); setPnote(''); }}>Pause</Button></div>
        : null}
      {f.bucket === 'CORE' && <KV k="Supplier check · weekly" v={f.supply ? `${f.supply.status === 'ok' ? 'In stock, on schedule' : f.supply.status === 'delayed' ? 'Delayed past committed date' : 'Run out at the supplier'} · ${fmtRel(f.supply.reviewedOn)} by ${f.supply.by}` : 'Never checked'} note={f.supply ? `${f.supply.note || ''}${f.supply.backOn ? ` · back ${fmtDate(f.supply.backOn)}` : ''}` || undefined : 'sourcing calls every core supplier once a week'} />}
      {f.bucket === 'CORE' && f.supply && f.supply.status !== 'ok' && !f.onHold && <div className="pt-2"><Note tone="risk">Sourcing has escalated this: the supplier {f.supply.status === 'out' ? 'has run out' : 'is late past the committed date'}. It is still live — customers keep buying a fabric that cannot be made.</Note>{canPlan ? <div className="mt-2"><Button variant="primary" size="sm" onClick={() => setFabricHold(f.id, true)}>Switch off on Shopify & stores</Button></div> : <ActsBy role="planning" does="switches it off on Shopify and in stores" />}</div>}
      {f.bucket === 'CORE' && f.onHold && f.supply?.status === 'ok' && <div className="pt-2">{canSource ? <Button variant="primary" size="sm" onClick={() => setFabricHold(f.id, false)}>Switch back on — in stock</Button> : <ActsBy role="planning" does="switches it on again once sourcing confirms stock" />}</div>}
    </Section> : null}

    {f.bucket !== 'BESPOKE' ? <Section title="Auto-PO threshold · Enigma's rule" right={<Pill tone="good">as BSC described it</Pill>}>
      <KV k="Sell rate" v={`${c.ros.toFixed(1)} shirts / wk`} note={`${c.baseMpw.toFixed(1)} m / wk at ${METRES_PER_SHIRT} m a shirt · last 8 weeks`} />
      <KV k="Vendor lead time" v={`${mill.leadDays} days`} note={`${mill.name} · transit from order to the shelf`} />
      <KV k="Sold during the lead time" v={`${c.leadDemand} m`} note={`${c.baseMpw.toFixed(1)} m / wk × ${mill.leadDays} / 7`} />
      <KV k="Vendor MOQ" v={`${c.moq} m`} note="the threshold never sits below what the vendor will ship" />
      <KV k="Threshold" v={<b>{c.rop} m</b>} note="the larger of the two — the minute stock plus what is on order falls under it, the PO goes" />
      <KV k="Stock against it" v={`${c.atp} m`} note={`${c.saleable} m saleable on the shelf${c.incoming ? ` + ${c.incoming} m already on order` : ''} · ${c.coverDays > 365 ? 'over a year' : `${c.coverDays} days`} of cover`} />
      <KV k="Auto-PO quantity" v={c.belowRop ? <b>{c.suggestedPo} m</b> : `${c.suggestedPo} m when it trips`} note={f.international ? 'the same number — but Enigma does not reach this vendor, so a person raises it' : 'Enigma sends this to the vendor itself'} />
      {c.belowRop && (f.international ? (canSource ? <div className="pt-2"><Button variant="primary" size="sm" onClick={() => raiseFabricPo(f.id, c.suggestedPo)}>Raise PO · {c.suggestedPo} m to {mill.name}</Button></div> : <ActsBy role="sourcing" does={`raises the ${c.suggestedPo} m PO to ${mill.name}`} />) : <div className="pt-2"><Note>Domestic — Enigma auto-PO handles this, nothing to do here.</Note></div>)}
      {!c.belowRop && c.incoming > 0 && <div className="pt-2"><Note tone="good">Covered by what is on order. The row will read "below ROP" again only if the PO is late enough for saleable stock to run out first.</Note></div>}
    </Section> : <Section title="Mill availability" right={f.millAvailable === false ? <Pill tone="risk">sold out at mill</Pill> : <Pill tone="good">available</Pill>}>
      <KV k="Mill last reported" v={f.millAvailable === false ? 'Sold out' : f.millStockMetres != null ? `${f.millStockMetres} m at the mill` : 'Available'} note={`${fmtRel(f.millReportedAt)} · the mill's stock is the inventory; the warehouse enters it from the evening sheet`} />
      <KV k="On Shopify & in stores" v={f.onHold ? 'Switched off' : 'Live'} />
      {f.millAvailable === false && !f.onHold && <div className="pt-2"><Note tone="risk">The mill says gone; the channel still sells it. Every hour this stays live is an order that cannot be made.</Note>{canSource ? <div className="mt-2"><Button variant="primary" size="sm" onClick={() => setFabricHold(f.id, true)}>Switch off on Shopify & stores</Button></div> : <ActsBy role="sourcing" does="switches it off on Shopify and in stores" />}</div>}
      {f.onHold && f.millAvailable && canSource && <div className="pt-2"><Button size="sm" onClick={() => setFabricHold(f.id, false)}>Restore to sale</Button></div>}
    </Section>}

    <Section title="Sales · last 12 weeks">
      <div className="py-2"><Bars values={f.weeklySalesShirts} ok={inStockWeeks} unit=" shirts" /></div>
      <div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>Shirts made from this fabric per week. Core is replenished off this; non-core is not — when it is gone, the slot is refilled with a new fabric.</div>
    </Section>

    {blocks.length > 0 && <Section title={`Blocks at ${mill.name}`}>
      {blocks.map(b => { const left = -daysAgo(b.expiresOn); return <div key={b.id} className="kv"><span className="k">{b.fabricName}<div className="text-[11px]">{b.metres} m · agreed {fmtDate(b.agreedOn)} by {b.via}</div></span><span className="v"><Pill tone={b.status !== 'held' ? 'neutral' : left < 7 ? 'risk' : left <= 21 ? 'warn' : 'good'}>{b.status !== 'held' ? b.status : left < 0 ? `expired ${-left}d` : `${left}d left`}</Pill>{canSource && b.status === 'held' && <div className="flex gap-1 mt-1 justify-end"><Button size="sm" onClick={() => convertBlock(b.id)}>Convert</Button><Button size="sm" variant="ghost" onClick={() => releaseBlock(b.id)}>Release</Button></div>}</span></div>; })}
    </Section>}

    <Section title={`In stores · ${swatches.length} swatch dispatch${swatches.length === 1 ? '' : 'es'}`}>
      {swatches.length === 0 ? <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>No swatch of this fabric has been dispatched to a store yet — customers cannot pick it from a book.</div> : <>
        <KV k="Confirmed landed" v={storeNames(swatches.filter(s => s.confirmedOn).map(s => s.storeId)).join(', ') || '—'} />
        <KV k="Dispatched, unconfirmed" v={storeNames(swatches.filter(s => !s.confirmedOn).map(s => s.storeId)).join(', ') || '—'} note={swatches.some(s => !s.confirmedOn) ? 'nobody knows if these reached the book' : undefined} />
      </>}
      {live !== 'Active' && swatches.length > 0 && <div className="pt-2"><Note tone="warn">This fabric is {live.toLowerCase()} but its swatch is in {swatches.length} store book{swatches.length === 1 ? '' : 's'} — customers will keep asking for something that cannot be ordered.</Note></div>}
    </Section>

    <Files kind="fabric" subjectId={f.id} labels={FILE_LABELS.fabric} editable hint="the swatch image the block sheet has a column for, the mill's stock sheet from WhatsApp, the block confirmation email" />
    <ThreadPanel kind="fabric" subjectId={f.id} />

    <Section title="Lifecycle">
      <div className="text-[12.5px] py-1" style={{ color:'var(--ink-soft)' }}>
        {f.bucket === 'CORE' && 'Sourced once → datasheet in Enigma (code minted) → swatch to books → sells → reorder point trips → PO → GRN → stock. Never retired while it sells.'}
        {f.bucket === 'NON_CORE' && 'Scouted at mill → design selects → blocked (handshake, 2–5 months) → design + tech pack + costing (20–30 days) → PO → GRN → swatch to books → sells once → slot refilled with a new fabric.'}
        {f.bucket === 'BESPOKE' && 'Listed from the mill\'s catalogue → swatch to books → customer orders → PO fires per order → mill ships cut length → made. Availability is the mill\'s daily word, not BSC stock.'}
      </div>
    </Section>
  </>;
}

/* ---------- trims, labels, buttons, packaging — bulk stock at the unit -------- */
function TrimsTab() {
  const { db, role, orderTrims, receiveTrims } = useApp();
  const mine = role === 'production' || role === 'warehouse' || role === 'sourcing' || role === 'owner';
  const rows = (db.trims ?? []).map(t => ({ t, c: trimCoverageOf(db, t) })).sort((a, b) => Number(b.c.belowThreshold) - Number(a.c.belowThreshold));
  const value = rows.reduce((a, r) => a + r.t.stock * r.t.costPer, 0);
  const ex = useExamples(rows, r => r.c.belowThreshold ? 'order' : r.t.incoming ? 'on-order' : 'covered', { noun: 'trims', done: r => !r.c.belowThreshold && !r.t.incoming });
  return <>
    {ex.strip && <div className="flex justify-end mb-2">{ex.strip}</div>}
    <Card><table className="t compact">
      <thead><tr><th>Item</th><th>Supplier</th><th className="num">On shelf</th><th className="num">Committed</th><th className="num">Available</th><th className="num">Incoming</th><th className="num">Threshold</th><th className="num">₹ each</th><th>Status</th><th></th></tr></thead>
      <tbody>{ex.rows.map(({ t, c }) => <tr key={t.id}>
        <td className="font-medium">{t.name}<div className="text-[11px] font-normal" style={{ color:'var(--ink-faint)' }}>{t.kind}{t.lastOrderedOn ? ` · last ordered ${fmtDate(t.lastOrderedOn)}` : ''}</div></td>
        <td className="text-[12.5px]">{t.vendorId ? <VendorLink id={t.vendorId} /> : '—'}</td>
        <td className="num">{t.stock.toLocaleString('en-IN')}</td>
        <td className="num" style={{ color:'var(--ink-faint)' }}>{c.committed.toLocaleString('en-IN')}</td>
        <td className="num" style={{ color: c.available <= t.threshold ? 'var(--risk)' : undefined }}>{c.available.toLocaleString('en-IN')}</td>
        <td className="num" style={{ color: t.incoming ? 'var(--info)' : undefined }}>{t.incoming ? `+${t.incoming.toLocaleString('en-IN')}` : '—'}</td>
        <td className="num" style={{ color:'var(--ink-faint)' }}>{t.threshold.toLocaleString('en-IN')}</td>
        <td className="num">₹{t.costPer.toFixed(2)}</td>
        <td>{c.belowThreshold ? <Pill tone="risk">order more</Pill> : t.incoming ? <Pill tone="info">covered · on order</Pill> : <Pill tone="good">covered</Pill>}</td>
        <td className="flex gap-1">{mine && c.belowThreshold && !t.incoming && <Button size="sm" variant="primary" onClick={() => orderTrims(t.id, Math.max(t.threshold * 2, 5000))}>Order {Math.max(t.threshold * 2, 5000).toLocaleString('en-IN')}</Button>}{mine && t.incoming > 0 && <Button size="sm" onClick={() => receiveTrims(t.id)}>Received</Button>}</td>
      </tr>)}</tbody>
    </table></Card>
    <div className="mt-3"><Note>Trims are bought in bulk by head office, so <b>available</b> is the number that matters — a PO cannot go without its trims.</Note></div>
  </>;
}


/* ---------- fabric POs — raised by Enigma or by planning; confirmed by sourcing with the mill ---- */
function FabricPosTab({ canSource }: { canSource: boolean }) {
  const { db, confirmFabricPo, remarkFabricPo } = useApp();
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'chase' | 'confirmed' | 'design'>('all');
  const allPos = openFabricPos(db).sort((a, b) => Number(!!a.vendorConfirmedOn) - Number(!!b.vendorConfirmedOn) || a.raisedOn.localeCompare(b.raisedOn));
  /* search by PO number, fabric name or code, mill, remark — anything on the row */
  const hay = (p: typeof allPos[number]) => { const f = db.fabrics.find(x => x.id === p.fabricId); const v = db.vendors.find(x => x.id === p.vendorId); return `${p.poNo} ${f?.name ?? ''} ${f?.code ?? ''} ${f?.bucket ?? ''} ${v?.name ?? ''} ${p.remark ?? ''}`.toLowerCase(); };
  const pos = allPos.filter(p => (!q.trim() || q.toLowerCase().split(/\s+/).every(w => hay(p).includes(w)))
    && (only === 'all' || (only === 'chase' && !p.vendorConfirmedOn) || (only === 'confirmed' && !!p.vendorConfirmedOn) || (only === 'design' && /concept|RTW bulk|REQ-\d/i.test(p.remark))));
  const ex = useExamples(pos, p => fabricPoStatus(p), { noun: 'fabric POs', score: p => (p.vendorConfirmedOn ? 1 : 0) + (p.remark ? 1 : 0), done: p => fabricPoStatus(p) === 'confirmed' });
  const [edit, setEdit] = useState<string | null>(null);
  const [date, setDate] = useState(''); const [remark, setRemark] = useState('');
  const fabric = (id: string) => db.fabrics.find(f => f.id === id);
  const TONE: Record<string, 'neutral' | 'info' | 'warn' | 'good' | 'risk'> = { 'awaiting confirmation':'neutral', 'unconfirmed · chase':'warn', confirmed:'good', 'confirmed · overdue':'risk', received:'neutral' };
  const begin = (id: string, expectedOn: string, r: string) => { setEdit(id); setDate(dateInput(expectedOn)); setRemark(r); };
  return <>
    <div className="flex items-end gap-3 flex-wrap mb-3">
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search PO, fabric, code, mill, remark…" style={{ width: 300 }} aria-label="search fabric POs" />
      <Seg value={only} onChange={setOnly} options={[{ id:'all', label:'All open', count: allPos.length }, { id:'chase', label:'Unconfirmed · chase', count: allPos.filter(p => !p.vendorConfirmedOn).length }, { id:'confirmed', label:'Confirmed', count: allPos.filter(p => !!p.vendorConfirmedOn).length }, { id:'design', label:'Raised by design', count: allPos.filter(p => /concept|RTW bulk|REQ-\d/i.test(p.remark)).length, hint:'POs design pushed off a concept, an RTW requirement or an option request' }]} />
      {q && <span className="text-[12px]" style={{ color:'var(--ink-soft)' }}>{pos.length} of {allPos.length}</span>}
      {ex.strip && <span className="ml-auto">{ex.strip}</span>}
    </div>
    {pos.length === 0 ? <Card><Empty title={allPos.length ? 'Nothing matches.' : 'No fabric POs open.'} body={allPos.length ? 'Try a shorter word — the search covers PO number, fabric name and code, mill and remark.' : "Enigma's auto-POs and the manual international ones appear here until the rolls are received."} /></Card> : <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><th>PO</th><th>Fabric</th><th>Mill</th><th className="num">Metres</th><th>Mill says</th><th>Status</th><th></th></tr></thead>
      <tbody>{ex.rows.map(p => { const f = fabric(p.fabricId); const st = fabricPoStatus(p); const editing = edit === p.id; return (
        <tr key={p.id} style={{ background: editing ? 'var(--accent-soft)' : undefined }}>
          <td className="mono text-[12.5px]">{p.poNo}<div className="text-[10.5px]" style={{ color: p.source === 'auto' ? 'var(--info)' : 'var(--ink-faint)' }}>{p.source === 'auto' ? 'Enigma auto' : /concept|RTW bulk|REQ-\d/i.test(p.remark) ? 'raised by design' : db.fabrics.find(f => f.id === p.fabricId)?.international ? 'manual · intl' : 'manual'} · {fmtRel(p.raisedOn)}</div></td>
          <td style={{ whiteSpace:'normal', minWidth: 180 }}>{f?.name}<div className="text-[11px] mono" style={{ color:'var(--ink-faint)' }}>{f?.code} · {f?.bucket.toLowerCase().replace('_', '-')}</div></td>
          <td style={{ whiteSpace:'normal' }}><VendorLink id={p.vendorId} /></td>
          <td className="num">{p.metres} m</td>
          <td className="text-[12px]" style={{ whiteSpace:'normal', minWidth: 190 }}>{p.vendorConfirmedOn ? <><span style={{ color: daysAgo(p.expectedOn) > 0 ? 'var(--risk)' : undefined }}>ships {fmtDate(p.expectedOn)}</span><div style={{ color:'var(--ink-faint)' }}>confirmed {fmtRel(p.vendorConfirmedOn)} · {p.vendorConfirmedBy}</div>{p.remark && <div style={{ color:'var(--warn)' }}>“{p.remark}”</div>}</> : <span style={{ color:'var(--ink-faint)' }}>nothing heard · lead time says {fmtDate(p.expectedOn)}</span>}</td>
          <td><Pill tone={TONE[st]}>{st}</Pill></td>
          <td>{canSource && !editing && <Button size="sm" variant={p.vendorConfirmedOn ? undefined : 'primary'} onClick={() => begin(p.id, p.expectedOn, p.remark)}>{p.vendorConfirmedOn ? 'Update date / remark' : 'Mill confirmed…'}</Button>}</td>
        </tr>); })}</tbody>
    </table></div>
    {edit && (() => { const p = pos.find(x => x.id === edit)!; const f = fabric(p.fabricId); return <div className="px-4 py-3" style={{ borderTop:'1px solid var(--line)' }}>
      <div className="label">{p.poNo} · {f?.name} · {p.metres} m — what did the mill say?</div>
      <div className="grid gap-2.5 items-end" style={{ gridTemplateColumns:'160px 1fr auto auto' }}>
        <Field label="Mill's dispatch date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Remark" hint="a few days more, why; shade lot changed; two lots…"><Input value={remark} onChange={e => setRemark(e.target.value)} placeholder="e.g. loom down last week — 4 days more" /></Field>
        {!p.vendorConfirmedOn ? <Button variant="primary" size="sm" onClick={() => { confirmFabricPo(p.id, fromDateInput(date), remark.trim()); setEdit(null); }}>Confirmed by mill</Button> : <Button variant="primary" size="sm" onClick={() => { remarkFabricPo(p.id, fromDateInput(date), remark.trim()); setEdit(null); }}>Save</Button>}
        <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
      </div>
    </div>; })()}
    </Card>}
    <div className="mt-3"><Note>An auto-PO the mill has not confirmed shows here as a chase after two days, not as a surprise at the GRN.</Note></div>
  </>;
}


/* ---------- the swatch books — design's front page of the master ------------------
   One block per book, the fabrics in it as rows: is it on the shelf, what does it
   sell as (the designs and their product codes), is cloth coming, when did stores
   and online go live. No reorder maths — that is sourcing's page. */
type BookState = 'active' | 'coming' | 'hold' | 'paused';
const BOOK_STATE: Record<BookState, { label: string; tone: 'good' | 'info' | 'warn' | 'neutral' }> = {
  active: { label:'on the shelf', tone:'good' }, coming: { label:'cloth coming', tone:'info' }, hold: { label:'on hold', tone:'warn' }, paused: { label:'paused', tone:'neutral' } };
function BooksTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { db } = useApp();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'active' | 'hold' | 'coming' | 'paused'>('all');
  const [book, setBook] = useState<string>('all');
  const [wh, setWh] = useState('factory');   // Enigma's warehouse picker — one stock today; per-warehouse once the read is live
  const saleable = (f: Fabric) => Math.round((f.stockMetres - f.reservedMetres - f.thresholdMetres) * 10) / 10;
  const STATE = BOOK_STATE;
  /* one flat table, every fabric in every book; the filters do the grouping the
     old one-card-per-book layout did with a page of scroll */
  const all = db.fabrics.filter(f => f.swatchBook && f.bucket !== 'BESPOKE').map(f => {
    const c = (db.concepts ?? []).find(x => x.fabricId === f.id) ?? null;
    const state: BookState = f.paused ? 'paused' : f.onHold ? (f.incomingMetres > 0 && f.stockMetres === 0 ? 'coming' : 'hold') : 'active';
    return { f, c, state };
  });
  const books = MTM_SWATCH_BOOKS.map(bk => { const fs = all.filter(x => x.f.swatchBook === bk); const active = fs.filter(x => x.state === 'active').length;
    return { b: bk, total: fs.length, active, gap: MTM_ACTIVE_TARGET - active, coming: fs.filter(x => x.state === 'coming').length, live: fs.filter(x => x.c?.liveOn).length }; }).filter(x => x.total > 0);
  const rows = all
    .filter(x => (book === 'all' || x.f.swatchBook === book) && (show === 'all' || x.state === show)
      && (!q.trim() || q.toLowerCase().split(/\s+/).every(w => `${x.f.name} ${x.f.code} ${x.f.swatchBook} ${(x.c?.designs ?? []).map(d => `${d.name} ${d.finalName ?? ''} ${d.code}`).join(' ')}`.toLowerCase().includes(w))))
    .sort((a, b) => (a.f.swatchBook ?? '').localeCompare(b.f.swatchBook ?? '') || ({ active: 0, coming: 1, hold: 2, paused: 3 })[a.state] - ({ active: 0, coming: 1, hold: 2, paused: 3 })[b.state] || a.f.name.localeCompare(b.f.name));
  const count = (f: (x: typeof all[number]) => boolean) => all.filter(x => (book === 'all' || x.f.swatchBook === book) && f(x)).length;
  const ex = useExamples(rows, r => `${r.f.swatchBook}·${r.state}`, { noun: 'fabrics', score: r => (r.c ? 1 : 0) + (r.c?.designs?.length ? 1 : 0) + (r.c?.liveOn ? 1 : 0) + (r.c?.swatch ? 1 : 0), done: r => r.state === 'active' && !!r.c?.liveOn });
  const pager = usePager(ex.rows, 25);
  return <>
    {/* the books in one strip: click a book to filter to it */}
    <div className="grid gap-2 mb-3" style={{ gridTemplateColumns:`repeat(${books.length + 1}, minmax(0, 1fr))` }}>
      <button type="button" className="card text-left px-3 py-2" style={{ borderColor: book === 'all' ? 'var(--accent)' : undefined, cursor:'pointer' }} onClick={() => setBook('all')}>
        <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>Every book</div><div className="text-[15px] font-semibold">{all.filter(x => x.state === 'active').length} <span className="text-[11.5px] font-normal" style={{ color:'var(--ink-faint)' }}>on the shelf of {all.length}</span></div></button>
      {books.map(bk => <button key={bk.b} type="button" className="card text-left px-3 py-2" style={{ borderColor: book === bk.b ? 'var(--accent)' : undefined, borderLeft: `3px solid var(${bk.gap > 0 ? '--warn' : '--good'})`, cursor:'pointer' }} onClick={() => setBook(book === bk.b ? 'all' : bk.b)} title={`${bk.total} fabrics · ${bk.coming} coming · ${bk.live} live in stores`}>
        <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{bk.b}</div>
        <div className="text-[15px] font-semibold">{bk.active} <span className="text-[11.5px] font-normal" style={{ color:'var(--ink-faint)' }}>/ {MTM_ACTIVE_TARGET}</span> {bk.gap > 0 ? <span className="pill warn" style={{ marginLeft: 4 }}>{bk.gap} short</span> : <span className="pill good" style={{ marginLeft: 4 }}>met</span>}</div></button>)}
    </div>
    <div className="flex items-end gap-3 flex-wrap mb-2">
      <Seg value={show} onChange={setShow} options={[{ id:'all', label:'Every fabric', count: count(() => true) }, { id:'active', label:'On the shelf', count: count(x => x.state === 'active') }, { id:'coming', label:'Cloth coming', count: count(x => x.state === 'coming') }, { id:'hold', label:'On hold', count: count(x => x.state === 'hold') }, { id:'paused', label:'Paused', count: count(x => x.state === 'paused') }]} />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name…" style={{ width: 280 }} aria-label="search books" />
      <Select value={wh} onChange={setWh} options={[{ value:'factory', label:'Factory Warehouse' }, { value:'ho', label:'HO Warehouse' }]} />
      <ExportButton filename="fabric-inventory" sheetName="Fabric Inventory" rows={rows} cols={[
        { label:'Code', get: r => r.f.code }, { label:'Name', get: r => r.f.name }, { label:'Category', get: r => r.f.family }, { label:'Inventory Type', get: r => r.f.bucket }, { label:'Product Type', get: () => 'CUSTOM_DESIGN' },
        { label:'Saleable Stock', get: r => saleable(r.f) }, { label:'Physical Stock', get: r => r.f.stockMetres }, { label:'Reserved Stock', get: r => r.f.reservedMetres }, { label:'Threshold', get: r => r.f.thresholdMetres }, { label:'Swatch book', get: r => r.f.swatchBook ?? '' }]} />
      <span className="ml-auto flex items-center gap-3">{ex.strip}{book !== 'all' && books.find(x => x.b === book)!.gap > 0 && <a className="cta" href="#/design?new=mtm">raise an MTM fabric ask for the {books.find(x => x.b === book)!.gap} short →</a>}</span>
    </div>
    {rows.length === 0 ? <Card><Empty title="Nothing matches." body="Widen the filter or the search." /></Card> : <Card><div className="tbox" style={{ maxHeight:'calc(100vh - 380px)' }}><table className="t compact frozen">
      <thead><tr><th>Image</th><th>Code</th><th>Name</th><th>Category</th><th>Inventory Type</th><th>Product Type</th><th className="num">Saleable Stock</th><th className="num">Physical Stock</th><th className="num">Reserved Stock</th><th className="num">Threshold</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{pager.pageRows.map(({ f, c, state }) => { const ds = c?.designs ?? []; const sal = saleable(f);
        return <tr key={f.id} className="row" onClick={() => onOpen(f.id)}>
          <td><span aria-hidden style={{ display:'inline-block', width: 34, height: 34, borderRadius: 4, background: `hsl(${[...f.code].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360} 30% 78%)`, border:'1px solid var(--line)' }} title={ds[0] ? (ds[0].finalName ?? ds[0].name) : f.name} /></td>
          <td className="mono text-[12px]" style={{ whiteSpace:'nowrap' }}>{f.code}</td>
          <td style={{ whiteSpace:'normal', minWidth: 200 }}><span className="font-medium">{f.name}</span>{formerNames(f).length ? <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>formerly {formerNames(f)[0]}</div> : null}<div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{f.swatchBook}{ds.length ? ` · ${ds.length} design${ds.length === 1 ? '' : 's'}` : ''}</div></td>
          <td className="text-[12px]">{f.family}</td>
          <td className="mono text-[11.5px]">{f.bucket}</td>
          <td className="mono text-[11.5px]">CUSTOM_DESIGN</td>
          <td className="num" style={{ color: sal < 0 ? 'var(--risk)' : undefined }}>{sal}</td>
          <td className="num">{f.stockMetres}{f.incomingMetres ? <div className="text-[10.5px]" style={{ color:'var(--info)' }}>+{f.incomingMetres} coming</div> : null}</td>
          <td className="num">{f.reservedMetres}</td>
          <td className="num">{f.thresholdMetres}</td>
          <td><Pill tone={STATE[state].tone}>{STATE[state].label}</Pill></td>
          <td onClick={e => e.stopPropagation()}><button type="button" className="cta" onClick={() => onOpen(f.id)}>Open →</button></td>
        </tr>; })}</tbody>
    </table></div><Pager {...pager} onChange={pager.setPage} noun="fabrics" /></Card>}
    <div className="mt-3"><Note>The columns are Enigma's Fabric Inventory, metres. Saleable = physical − reserved − threshold, the number a store can sell against. Click a book to filter; open a fabric to rename, pause or resume it, or see its POs and stock.</Note></div>
  </>;
}

