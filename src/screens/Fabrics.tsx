/* MTM fabrics — the fabric is the SKU, and the three buckets run differently.
   Core: a reorder point that covers international fabrics too — Enigma's
   auto-PO reaches only domestic ones. Non-core: the range plan counted as
   healthy slots against the target hiding in the swatch-book label. Bespoke:
   the mill's last report, and one click to switch a sold-out fabric off before
   a customer orders it. Blocks: the handshake, with a countdown.
   Click any fabric for its 360 — identity, stock, sales with conditions,
   range, blocks, stores. */
import { useSearchParams, useParams } from 'react-router-dom';
import { ThreadPanel } from './Thread';
import { Files } from './Files';
import { FILE_LABELS } from '../domain/reference';

import { VendorLink } from './Vendors';
import { useApp } from '../store';
import type { Fabric, Concept } from '../domain/types';
import { coverageOf, liveStatusOf, trimCoverageOf, fmtDate, fmtMoney, daysAgo, fmtRel, openFabricPos, fabricPoStatus, iso, TODAY, addDays, formerNames } from '../domain/engines';
import { useState } from 'react';
import type React from 'react';
import { Field, Input, dateInput, fromDateInput } from '../ui';
import { STORES, STORE_LOW_METRES, METRES_PER_SHIRT, MTM_SWATCH_BOOKS, MTM_ACTIVE_TARGET } from '../domain/reference';
import { Page, Card, Pill, Button, Note, Tabs, Empty, Drawer, KV, Section, Bars, usePager, Pager, Seg, useExamples, Select, ExportButton } from '../ui';
import { ActsBy } from './Who';
import { DesignsList } from './Designs';
import { FabricInfo } from './FabricInfo';
import { PoReceiving } from './PoReceiving';

/* design's own shorthand — one click instead of a sentence typed 35 times */
const PAUSE_REASONS = ['Shade being retired', 'Quality doubt', 'Book changing', 'Not selling'];

export function Fabrics() {
  const { db, role, setFabricHold, pauseFabric, resumeFabric, raiseFabricPo, convertBlock, releaseBlock, reviewCoreStock, demoAll } = useApp();
  const [review, setReview] = useState<string | null>(null);
  const [coreFilter, setCoreFilter] = useState<'all' | 'below' | 'manual' | 'intl' | 'soldout' | 'paused' | 'off' | 'unchecked'>('all');
  const [pausing, setPausing] = useState<string | null>(null);
  const [pauseNote, setPauseNote] = useState(''); const [rvStatus, setRvStatus] = useState<'ok' | 'delayed' | 'out'>('ok'); const [rvNote, setRvNote] = useState(''); const [rvBack, setRvBack] = useState('');
  
  const fpoOpen = openFabricPos(db);
  const [params, setParams] = useSearchParams();
  const { myRole } = useApp();
  const designSide = !demoAll && (myRole === 'design' || myRole === 'planning');   // a super admin sees both front pages
  const tab = params.get('tab') ?? 'books';   // everyone lands on the books — what sells is the first question, what to buy follows from it
  const openId = params.get('open');
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace:true }); };
  const canSource = role === 'sourcing' || role === 'owner';
  const canPlan = role === 'design' || role === 'owner';        // design owns what the book offers

  /* ONE answer to "can I sell this today?", three states, the same everywhere:
     inactive is a person's (Make inactive / Make active, Enigma's On Hold); out of stock is the system's,
     when saleable falls to the threshold; otherwise it can sell. */
  const OfferCell = ({ f }: { f: Fabric }) => {
    const held = f.onHold || !!f.paused;
    const out = !held && f.stockMetres - f.reservedMetres <= f.thresholdMetres;
    return <div className="flex flex-col gap-1 items-start">
      <Pill tone={held ? 'warn' : out ? 'risk' : 'good'}>{held ? 'inactive' : out ? 'out of stock' : 'can sell'}</Pill>
      {held ? <Button size="sm" onClick={() => { setFabricHold(f.id, false); if (f.paused) resumeFabric(f.id); }}>Make active</Button>
        : <Button size="sm" onClick={() => setFabricHold(f.id, true)}>Make inactive</Button>}
    </div>;
  };

  /* What the reorder point has already done about it — the auto-PO made visible
     on the row it belongs to, instead of being a sentence about Enigma. */
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
          { id:'sell', label:'Fabric master data', tabs: [
            { id:'books', label:'Fabric inventory', hint:'every MTM fabric as Enigma lists it — code, name, category, inventory type, saleable, physical, reserved, threshold — filtered by swatch book' },
            { id:'core', label:'Core · weekly review', count: reviewDue.length, hint:'sourcing reviews every core fabric with its mill once a week' },
            { id:'noncore', label:'Ranges', hint:'each range against its plan of options' },
            { id:'designs', label:'Designs', hint:'every design (product code) on every fabric: one per fabric' } ] },
          /* trims and packaging have their own master, beside the fabric one (6 Nov 2026) */
          { id:'trim', label:'Trim master data', tabs: [
            { id:'trims', label:'Trims & packaging', count: (db.trims ?? []).filter(t => trimCoverageOf(db, t).belowThreshold).length, hint:'every trim and packaging item: stock, committed, available, incoming, threshold, cost, supplier' } ] },
          { id:'orders', label:'Purchase orders & supply', tabs: [
            { id:'pos', label:'Purchase orders', hint:'every fabric PO — raised by Enigma on its own or by a person — and the fabrics that still need one' } ] },
        ];
        const group = groups.find(g => g.tabs.some(t => t.id === tab)) ?? groups[0];
        return <>
          <Tabs tabs={groups.map(g => ({ id: g.id, label: g.label, count: g.tabs.reduce((n, t) => n + (t.count ?? 0), 0) || undefined }))} active={group.id} onChange={id => set('tab', groups.find(g => g.id === id)!.tabs[0].id)} />
          {group.tabs.length > 1 && <div className="flex items-center gap-1 flex-wrap mb-3" style={{ marginTop: -8 }}>
            <Seg value={tab} onChange={t => set('tab', t)} options={group.tabs.map(t => ({ id: t.id, label: t.label, count: t.count, hint: t.hint }))} />
          </div>}
        </>; })()}
      {tab === 'books' && <BooksTab onOpen={id => set('open', id)} />}

      {tab === 'designs' && <DesignsList />}

      {tab === 'trims' && <TrimsTab />}

      {tab === 'core' && <>
        <div className="flex gap-1.5 flex-wrap mb-2 items-center">
          {([['all', `All ${core.length}`], ['unchecked', `Review due ${reviewDue.length}`], ['below', `Under the reorder point ${belowRop.length}`], ['manual', `PO by hand ${toRaiseByHand.length}`], ['off', `Inactive ${core.filter(x => x.f.onHold || x.f.paused).length}`]] as const).map(([k, label]) =>
            <button key={k} type="button" className={`btn sm ${coreFilter === k ? 'primary' : ''}`} onClick={() => setCoreFilter(k)}>{label}</button>)}
          {exCore.strip && <span className="ml-auto self-center">{exCore.strip}</span>}
        </div>
        <Card><div style={{ overflowX:'auto' }}><table className="t compact">
          <thead><tr><th>Fabric</th><th>Mill</th><th className="num">Saleable</th><th>Reorder</th><th>Weekly review · the mill</th><th>Status</th></tr></thead>
          <tbody>{corePager.pageRows.map(({ f, c }) => { const po = fpoOpen.filter(p => p.fabricId === f.id).sort((a, b) => b.raisedOn.localeCompare(a.raisedOn))[0]; const due = !f.supply || daysAgo(f.supply.reviewedOn) >= 7; const editing = review === f.id; return <tr key={f.id} className="row" onClick={() => set('open', f.id)} style={{ background: editing ? 'var(--accent-soft)' : undefined }}>
            <td className="font-medium" style={{ whiteSpace:'normal', minWidth: 160 }}>{f.name}<div className="text-[11px] font-normal mono" style={{ color:'var(--ink-faint)' }}>{f.code}</div></td>
            <td className="text-[12.5px]" style={{ whiteSpace:'normal' }}>{vendorName(f.vendorId)}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{f.international ? 'international' : 'domestic'} · {lead(f.vendorId)}d</div></td>
            <td className="num mono" style={{ color: c.saleable <= 0 ? 'var(--risk)' : undefined }}>{c.saleable} m{c.incoming ? <div className="text-[10.5px]" style={{ color:'var(--info)' }}>+{c.incoming} m on order</div> : null}</td>
            <td onClick={e => e.stopPropagation()} style={{ whiteSpace:'normal' }}>
              {po ? <Pill tone="info">PO {po.metres} m · {po.source === 'auto' ? 'Enigma' : 'by hand'}</Pill>
                : !c.belowRop ? <Pill tone="good">above {c.rop} m</Pill>
                : f.international ? <span className="flex gap-1 items-center flex-wrap"><Pill tone="risk">under {c.rop} m</Pill>{(canPlan || canSource) && <Button size="sm" variant="primary" onClick={() => raiseFabricPo(f.id, c.suggestedPo)}>Raise PO · {c.suggestedPo} m</Button>}</span>
                : <Pill tone="info">under {c.rop} m · Enigma fires tonight</Pill>}
            </td>
            <td onClick={e => e.stopPropagation()} style={{ whiteSpace:'normal', minWidth: editing ? 420 : 120 }}>
              {!canSource ? <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>sourcing</span>
                : !editing ? <div className="flex flex-col gap-1 items-start">{f.supply ? <><Pill tone={f.supply.status === 'ok' ? 'good' : f.supply.status === 'delayed' ? 'warn' : 'risk'}>{f.supply.status === 'ok' ? 'in stock' : f.supply.status === 'delayed' ? 'delayed' : 'run out'}</Pill><div className="text-[10.5px]" style={{ color: due ? 'var(--warn)' : 'var(--ink-faint)' }}>{fmtRel(f.supply.reviewedOn)}{f.supply.backOn ? ` · back ${fmtDate(f.supply.backOn)}` : ''}</div></> : <Pill tone="warn">never asked</Pill>}<Button size="sm" variant={due ? 'primary' : 'ghost'} onClick={() => beginReview(f)}>{due ? 'Review' : 'Update'}</Button></div>
                : <div className="flex gap-1.5 items-center flex-wrap">
                  <Select value={rvStatus} onChange={v => setRvStatus(v as 'ok' | 'delayed' | 'out')} options={[{ value:'ok', label:'In stock' }, { value:'delayed', label:'Delayed' }, { value:'out', label:'Run out' }]} />
                  {rvStatus !== 'ok' && <Input type="date" value={rvBack} onChange={e => setRvBack(e.target.value)} title="back in stock by" style={{ width: 140 }} />}
                  <Input value={rvNote} onChange={e => setRvNote(e.target.value)} placeholder="note" style={{ width: 150 }} />
                  <Button size="sm" variant="primary" onClick={saveReview}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setReview(null)}>Cancel</Button>
                </div>}
            </td>
            <td onClick={e => e.stopPropagation()} style={{ whiteSpace:'normal', minWidth: 150 }}><OfferCell f={f} /></td>
          </tr>; })}</tbody>
        </table></div>
        <Pager page={corePager.page} pageCount={corePager.pageCount} onChange={corePager.setPage} from={corePager.from} to={corePager.to} total={corePager.total} noun="core fabrics" />
        </Card>
        <div className="mt-3"><Note>Once a week sourcing asks each mill about every core fabric. Delayed or run out goes to design, who switch the fabric off; back in stock, they switch it on.</Note></div>
      </>}

      {tab === 'noncore' && (() => { const fam = params.get('family'); const famFabrics = fam ? nonCore.filter(f => f.family === fam) : []; return <>
        <div className="text-[12.5px] mb-3" style={{ color:'var(--ink-soft)' }}>Each non-core range has a planned number of options; a range below plan has slots to fill with new fabrics. Click a range to see its fabrics.</div>
        <div className="grid gap-3 mb-4" style={{ gridTemplateColumns:'repeat(auto-fill, minmax(210px, 1fr))' }}>
          {ranges.map(r => { const pct = Math.min(100, Math.round(r.healthy / Math.max(1, r.targetOptions) * 100)); const on = fam === r.family; return <button key={r.family} type="button" className="card text-left px-4 py-3" onClick={() => set('family', on ? null : r.family)} style={{ cursor:'pointer', outline: on ? '2px solid var(--accent)' : undefined }}>
            <div className="flex items-baseline justify-between gap-2"><span className="font-semibold">{r.family}</span>{r.gap > 0 ? <Pill tone="warn">{r.gap} to fill</Pill> : <Pill tone="good">full</Pill>}</div>
            <div className="mono text-[13px] pt-1">{r.healthy} selling · plan {r.targetOptions}</div>
            <div style={{ height: 4, background:'var(--surface-3)', borderRadius: 2, marginTop: 6 }}><div style={{ width: `${pct}%`, height: 4, borderRadius: 2, background: r.gap > 0 ? 'var(--warn)' : 'var(--good)' }} /></div>
          </button>; })}
        </div>
        {fam && <Card><div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom:'1px solid var(--line-soft)' }}><h3 className="m-0">{fam} · {famFabrics.length} fabric{famFabrics.length === 1 ? '' : 's'}</h3><span className="flex-1" /><button type="button" className="vlink text-[12px]" onClick={() => set('family', null)}>close</button></div>
          <table className="t">
            <thead><tr><th>Fabric</th><th className="num">Saleable</th><th>Selling</th></tr></thead>
            <tbody>{famFabrics.map(f => { const c = coverageOf(f, lead(f.vendorId)); return <tr key={f.id} className="row" onClick={() => set('open', f.id)}>
              <td className="font-medium">{f.name}<div className="text-[11px] font-normal mono" style={{ color:'var(--ink-faint)' }}>{f.code}</div></td>
              <td className="num">{c.saleable} m</td>
              <td onClick={e => e.stopPropagation()} style={{ whiteSpace:'normal', minWidth: 170 }}><OfferCell f={f} /></td></tr>; })}</tbody>
          </table></Card>}
      </>; })()}

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

      <Drawer open={!!active} onClose={() => set('open', null)} title={active?.name ?? ''} subtitle={active && <><Pill tone="accent">{active.bucket.replace('_', '-').toLowerCase()}</Pill><span className="mono">{active.code}</span><span>· {vendorName(active.vendorId)} · {active.international ? 'international' : 'domestic'}{active.swatchBook ? ` · ${active.swatchBook}` : ''}</span></>}>
        {active && <FabricRecord f={active} view={(params.get('view') as FabricView) ?? 'overview'} setView={v => set('view', v)} />}
      </Drawer>
    </Page>
  );
}

/* ---------- the 360: every fact the tool holds about one fabric ---------- */
/** The fabric as its own page — `#/fabric/<id>`. Opened from the mills page and any list that names a fabric. */
/** This fabric's purchase orders, and how the next one gets raised — the question
    "who orders this, Enigma or a person?" answered on the record itself. */
function FabricPoList({ f, canSource }: { f: Fabric; flat: boolean; canSource: boolean }) {
  const { db, raiseFabricPo } = useApp();
  const mill = db.vendors.find(v => v.id === f.vendorId)!;
  const c = coverageOf(f, mill.leadDays, mill);
  const pos = (db.fabricPos ?? []).filter(p => p.fabricId === f.id).sort((a, b) => b.raisedOn.localeCompare(a.raisedOn));
  const open = pos.filter(p => !p.closedOn && !p.receivedOn);
  const auto = f.inventory?.autoReplenish ?? (f.bucket === 'CORE' && !f.international);
  const rule = f.bucket === 'BESPOKE' ? 'Bespoke: cut from the mill\'s stock, no PO' : auto ? 'Enigma raises it automatically' : f.international ? 'Reordered by hand (international)' : 'Reordered by hand';
  return <>
    {/* how the next PO gets raised, on one line */}
    <Card className="px-4 py-3 mb-3"><div className="flex items-center gap-x-5 gap-y-2 flex-wrap text-[13px]">
      <span><span className="label" style={{ display:'inline', marginRight: 6 }}>Rule</span>{rule}</span>
      {f.bucket !== 'BESPOKE' && <>
        <span title={c.leadDemand >= c.moq ? `${mill.leadDays} days of sales at the current rate` : 'the mill\'s MOQ'}><span className="label" style={{ display:'inline', marginRight: 6 }}>Reorder point</span><span className="mono">{c.rop} m</span></span>
        <span><span className="label" style={{ display:'inline', marginRight: 6 }}>Now</span><Pill tone={c.belowRop ? 'risk' : 'good'}>{c.belowRop ? 'under the point' : 'above the point'}</Pill> <span style={{ color:'var(--ink-faint)' }}>{c.saleable} m saleable{c.incoming ? ` · ${c.incoming} m on order` : ''}</span></span>
        {!auto && c.belowRop && open.length === 0 && (canSource
          ? <Button size="sm" variant="primary" onClick={() => raiseFabricPo(f.id, c.suggestedPo)}>Raise PO now · {c.suggestedPo} m</Button>
          : <ActsBy role="sourcing" does={`raises a PO for ${c.suggestedPo} m`} inline />)}
      </>}
    </div></Card>
    <Section collapsible={false} title={`Purchase orders · ${pos.length}`} right={open.length ? <span className="text-[12px]" style={{ color:'var(--ink-faint)' }}>{open.length} open</span> : undefined}>
      {pos.length === 0 ? <div className="text-[12.5px] py-1" style={{ color:'var(--ink-faint)' }}>No PO yet on this fabric.</div>
        : pos.map(p => { const st = fabricPoStatus(p); return <div key={p.id} className="py-2" style={{ borderBottom:'1px solid var(--line-soft)' }}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="mono font-medium">{p.poNo}</span>
            <span className="mono">{p.metres} m</span>
            <span className="text-[12px]" style={{ color:'var(--ink-faint)' }}>raised {p.source === 'auto' ? 'by Enigma · auto' : 'by hand'} {fmtDate(p.raisedOn)} · expected {fmtDate(p.expectedOn)}{p.remark ? ` · “${p.remark}”` : ''}</span>
            <span className="ml-auto"><Pill tone={!p.closedOn && st === 'overdue' ? 'risk' : 'neutral'}>{p.closedOn ? (p.closedShort ? 'closed short' : 'received') : st}</Pill></span>
          </div>
          <PoReceiving po={p} editable={canSource} />
        </div>; })}
    </Section>
  </>;
}

/* the three selling states, the same on every screen: inactive by hand (Enigma's On Hold), out of stock by the threshold
   (bespoke: when the mill is sold out, since BSC holds no bespoke stock), else can sell */
const sellStateOf = (f: Fabric) => f.onHold || f.paused ? { label:'inactive', tone:'warn' as const } : (f.bucket === 'BESPOKE' ? f.millAvailable === false : f.stockMetres - f.reservedMetres <= f.thresholdMetres) ? { label:'out of stock', tone:'risk' as const } : { label:'can sell', tone:'good' as const };
function HoldButton({ f }: { f: Fabric }) {
  const { setFabricHold, resumeFabric } = useApp();
  return f.onHold || f.paused
    ? <Button size="sm" onClick={() => { setFabricHold(f.id, false); if (f.paused) resumeFabric(f.id); }}>Make active</Button>
    : <Button size="sm" onClick={() => setFabricHold(f.id, true)}>Make inactive</Button>;
}

/** The status line at the top of the record: the one place the status and its action sit, with Rename beside them. */
function FabricStatusLine({ f }: { f: Fabric }) {
  const { role, renameFabric } = useApp();
  const canDesign = role === 'design' || role === 'owner';
  const [renaming, setRenaming] = useState(false); const [newName, setNewName] = useState(f.name); const [why, setWhy] = useState('');
  const st = sellStateOf(f);
  return <div className="mb-3">
    <div className="flex items-center gap-2 flex-wrap">
      <Pill tone={st.tone}>{st.label}</Pill><HoldButton f={f} />
      {canDesign && !renaming && <button type="button" className="btn sm ml-1" title={`the code ${f.code} does not change`} onClick={() => { setNewName(f.name); setRenaming(true); }}>Rename</button>}
      {(f.nameHistory ?? []).length > 0 && <span className="text-[12px]" style={{ color:'var(--ink-faint)' }}>formerly {formerNames(f)}</span>}
    </div>
    {renaming && <div className="flex gap-2 items-end flex-wrap pt-2">
      <div style={{ width: 260 }}><Field label="New name"><Input value={newName} onChange={e => setNewName(e.target.value)} /></Field></div>
      <div className="flex-1" style={{ minWidth: 200 }}><Field label="Why"><Input value={why} onChange={e => setWhy(e.target.value)} placeholder="book reprint; the shade name read wrong" /></Field></div>
      <Button size="sm" variant="primary" disabled={!newName.trim() || newName.trim() === f.name} onClick={() => { renameFabric(f.id, newName, why.trim()); setRenaming(false); setWhy(''); }}>Rename</Button>
      <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
    </div>}
  </div>;
}

/** The fabric record: status line, an even strip of facts, then tabs. The page keeps the tab in the URL; the drawer keeps it in state. */
export function FabricRecord({ f, view, setView }: { f: Fabric; view: FabricView; setView: (v: FabricView) => void }) {
  const { db, role } = useApp();
  const mill = db.vendors.find(v => v.id === f.vendorId)!;
  const c = coverageOf(f, mill.leadDays, mill);
  const pos = (db.fabricPos ?? []).filter(p => p.fabricId === f.id);
  /* eight equal tiles: one row when there is room, two rows of four when there is not */
  const fact = (k: string, v: React.ReactNode, title?: string) => <div className="fact-tile" title={title}><div className="label" style={{ margin: 0 }}>{k}</div><div className="text-[14.5px] font-medium mono">{v}</div></div>;
  return <>
    <FabricStatusLine f={f} />
    <div className="facts-wrap mb-3"><div className="facts">
      {fact('Physical', <span style={{ color: f.stockMetres <= f.thresholdMetres ? 'var(--risk)' : undefined }}>{f.stockMetres} m</span>, 'physical stock in the warehouse')}
      {fact('Reserved', `${f.reservedMetres} m`, 'held for punched orders')}
      {fact('On order', `${f.incomingMetres ?? 0} m`, 'still to arrive on open POs')}
      {fact('Saleable', <span style={{ color: c.saleable <= 0 ? 'var(--risk)' : undefined }}>{c.saleable} m</span>, 'physical minus reserved minus threshold')}
      {fact('Threshold', `${f.thresholdMetres} m`)}
      {fact('Cover', f.bucket === 'BESPOKE' ? '—' : c.coverDays > 365 ? '1y+' : `${c.coverDays} d`, 'days of sales the saleable stock covers')}
      {fact('Cost / m', f.mill?.costPerUnit != null ? `${f.mill.currency} ${f.mill.costPerUnit}` : f.cpm != null ? `INR ${f.cpm}` : '—')}
      {fact('Sells', `${c.ros.toFixed(1)}/wk`, 'shirts a week from this fabric')}
    </div></div>
    <Tabs wrap active={view} onChange={v => setView(v as FabricView)} tabs={[{ id:'overview', label:'Overview' }, { id:'pos', label:'Purchase orders', count: pos.filter(p => !p.closedOn && !p.receivedOn).length || undefined }, { id:'enigma', label:'Fabric info · Enigma' }, { id:'inventory', label:'Inventory & movements' }, { id:'files', label:'Files & conversation' }]} />
    <Fabric360 f={f} view={view} setView={setView} flat canSource={role === 'sourcing' || role === 'owner'} canPlan={role === 'design' || role === 'owner'} />
  </>;
}
export function FabricPage() {
  const { db } = useApp();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') ?? 'overview') as FabricView;
  const setView = (v: string) => { const n = new URLSearchParams(params); n.set('view', v); setParams(n, { replace:true }); };
  const f = db.fabrics.find(x => x.id === id) ?? null;
  const mill = f ? db.vendors.find(v => v.id === f.vendorId) : null;
  if (!f || !mill) return <Page title="Fabric"><Card><Empty title="No such fabric." body="It may have been removed from the master." /></Card></Page>;
  return <Page title={f.name} actions={<Button size="sm" variant="ghost" onClick={() => history.back()}>← Back</Button>}>
    <div className="flex items-center gap-2 flex-wrap mb-3 text-[13px]" style={{ color:'var(--ink-soft)' }}><Pill tone="accent">{f.bucket.replace('_', '-').toLowerCase()}</Pill><span className="mono">{f.code}</span><span>· <VendorLink id={mill.id}>{mill.name}</VendorLink> · {f.international ? 'international' : 'domestic'}{f.swatchBook ? ` · ${f.swatchBook}` : ''}</span></div>
    <div style={{ maxWidth: 1040 }}><FabricRecord f={f} view={view} setView={setView} /></div>
  </Page>;
}

export type FabricView = 'all' | 'overview' | 'pos' | 'enigma' | 'inventory' | 'files';
function Fabric360({ f, canSource, canPlan, view = 'all', flat = false, setView }: { f: Fabric; canSource: boolean; canPlan: boolean; view?: FabricView; flat?: boolean; setView: (v: FabricView) => void }) {
  const show = (v: FabricView) => view === 'all' || view === v;
  const { db, role, setFabricBucket, agreeCoreBlock, endCoreBlock } = useApp();
  const canDesign = role === 'design' || role === 'owner';
  const [blk, setBlk] = useState(false); const [blkYears, setBlkYears] = useState<1 | 2 | 0>(1); const [blkUntil, setBlkUntil] = useState(''); const [blkMpm, setBlkMpm] = useState(''); const [blkVia, setBlkVia] = useState<'email' | 'whatsapp' | 'call'>('email'); const [blkNote, setBlkNote] = useState('');
  const mill = db.vendors.find(v => v.id === f.vendorId)!;
  const c = coverageOf(f, mill.leadDays, mill);
  const range = db.ranges.find(r => r.family === f.family);
  const family = db.fabrics.filter(x => x.family === f.family && x.bucket === f.bucket);
  const familyHealthy = family.filter(x => liveStatusOf(x, mill.leadDays) === 'Active').length;
  const swatches = db.swatchDispatches.filter(s => s.fabricId === f.id);
  const inStockWeeks = f.weeklySalesShirts.map(() => true);
  const storeNames = (ids: string[]) => ids.map(id => STORES.find(s => s.id === id)?.name ?? id);

  /* one line a fact; a short hint lives in the tooltip, not under the value */
  const row = (k: string, v: React.ReactNode, act?: React.ReactNode, title?: string) => <div className="ov-row" title={title}><span className="ov-k">{k}</span><span className="ov-v">{v}{act && <span className="ov-act">{act}</span>}</span></div>;
  const left = f.coreBlock ? -daysAgo(f.coreBlock.until) : null;
  const confirmed = swatches.filter(s => s.confirmedOn).length;
  return <>
    {show('overview') && <Card className="px-4 py-2 mb-3 facts-wrap"><div className="ov-grid">
      {row('Bucket', f.bucket === 'CORE' ? 'Core · never runs out' : f.bucket === 'NON_CORE' ? 'Non-core · one buy' : 'Bespoke · held at the mill',
        canPlan && f.bucket !== 'BESPOKE' ? <button type="button" className="btn sm" onClick={() => setFabricBucket(f.id, f.bucket === 'NON_CORE' ? 'CORE' : 'NON_CORE', '')}>{f.bucket === 'NON_CORE' ? 'Promote to core' : 'Demote to non-core'}</button> : undefined,
        f.bucket === 'NON_CORE' ? 'core is replenished on a reorder point; non-core is bought once' : f.bucket === 'CORE' ? 'demoted, it stops being replenished and is allowed to sell out' : undefined)}
      {row('Reorder', f.bucket === 'BESPOKE' ? 'No PO: cut from the mill\'s stock' : (f.inventory?.autoReplenish ?? (f.bucket === 'CORE' && !f.international)) ? 'Enigma auto' : <span className="pill warn">reordered by hand</span>,
        f.bucket !== 'BESPOKE' ? <button type="button" className="btn sm" onClick={() => setView('pos')}>reorder point {c.rop} m</button> : undefined)}
      {f.bucket === 'CORE' && row('Supply block', f.coreBlock ? <>until {fmtDate(f.coreBlock.until)} · {f.coreBlock.metresPerMonth} m/month{left != null && left <= 60 ? <span style={{ color:'var(--risk)' }}> · {left < 0 ? 'lapsed' : `${left}d left`}</span> : null}</> : <span style={{ color:'var(--risk)' }}>none agreed</span>,
        canSource && !blk ? (f.coreBlock ? <><button type="button" className="btn sm" onClick={() => { setBlk(true); setBlkYears(1); setBlkUntil(''); setBlkMpm(String(f.coreBlock!.metresPerMonth)); setBlkVia(f.coreBlock!.via); setBlkNote(f.coreBlock!.note); }}>Renew</button> <button type="button" className="btn sm" onClick={() => endCoreBlock(f.id)}>End</button></>
          : <button type="button" className="btn sm" onClick={() => { setBlk(true); setBlkYears(1); setBlkUntil(''); setBlkMpm(String(Math.max(100, Math.round(c.baseMpw * 4.33 / 50) * 50))); setBlkNote(''); }}>Agree a block</button>) : undefined,
        f.coreBlock ? `agreed ${fmtRel(f.coreBlock.agreedOn)} by ${f.coreBlock.by} over ${f.coreBlock.via}${f.coreBlock.note ? ` · ${f.coreBlock.note}` : ''}` : `asks ${mill.name} to keep weaving it for a year or two`)}
      {row('Family', range ? <>{f.family} · {familyHealthy} healthy of {range.targetOptions}</> : f.family)}
      {row('Vendor', <><VendorLink id={mill.id}>{mill.name}</VendorLink> · {mill.leadDays}d lead · {Math.round(mill.onTimeRate * 100)}% on time</>, undefined, `${mill.kind} · ${mill.location}`)}
      {row('Swatch book', f.swatchBook ?? '—')}
      {f.bucket === 'BESPOKE' && row('At the mill', f.millAvailable === false ? <span style={{ color:'var(--risk)' }}>sold out{!f.onHold ? ' · still on sale, make it inactive' : ''}</span> : f.millStockMetres != null ? `${f.millStockMetres} m` : 'available', undefined, `reported ${fmtRel(f.millReportedAt)}`)}
      {row('In stores', swatches.length ? `${confirmed} of ${swatches.length} swatches received` : 'no swatch sent yet', undefined, swatches.length - confirmed ? `waiting: ${storeNames(swatches.filter(s => !s.confirmedOn).map(s => s.storeId)).join(', ')}` : undefined)}
    </div>
    {blk && <div className="mt-2 mb-2 p-3" style={{ background:'var(--accent-soft)', borderRadius: 8 }}>
      <div className="label">What did {mill.name} agree to hold?</div>
      <div className="flex gap-1 mb-2">{([[1, 'One year'], [2, 'Two years'], [0, 'Until a date']] as const).map(([y, l]) => <button key={y} type="button" className={`btn sm ${blkYears === y ? 'primary' : ''}`} onClick={() => setBlkYears(y)}>{l}</button>)}</div>
      <div className="grid gap-2.5 items-end" style={{ gridTemplateColumns: blkYears === 0 ? '150px 120px 110px 1fr' : '120px 110px 1fr' }}>
        {blkYears === 0 && <Field label="Hold until"><Input type="date" value={blkUntil} onChange={e => setBlkUntil(e.target.value)} /></Field>}
        <Field label="Metres a month"><Input type="number" min={0} value={blkMpm} onChange={e => setBlkMpm(e.target.value)} /></Field>
        <Field label="Agreed over"><select className="input" value={blkVia} onChange={e => setBlkVia(e.target.value as 'email' | 'whatsapp' | 'call')}><option value="email">email</option><option value="whatsapp">WhatsApp</option><option value="call">call</option></select></Field>
        <Field label="Terms"><Input value={blkNote} onChange={e => setBlkNote(e.target.value)} placeholder="price fixed for the first year" /></Field>
      </div>
      <div className="flex gap-2 mt-2"><Button size="sm" variant="primary" disabled={blkYears === 0 ? !blkUntil : !Number(blkMpm)} onClick={() => { const until = blkYears === 0 ? (fromDateInput(blkUntil) ?? iso(TODAY)) : iso(addDays(TODAY, 365 * blkYears)); agreeCoreBlock(f.id, until, Number(blkMpm) || 0, blkVia, blkNote.trim()); setBlk(false); }}>Record the block</Button><Button size="sm" variant="ghost" onClick={() => setBlk(false)}>Cancel</Button></div>
    </div>}
    </Card>}

    {show('pos') && <FabricPoList f={f} flat={flat} canSource={canSource || canPlan} />}
    {show('enigma') && <FabricInfo f={f} editable={canDesign || canSource} part="info" flat={flat} />}
    {show('inventory') && <FabricInfo f={f} editable={canDesign || canSource} part="inventory" flat={flat} />}

    {show('files') && <><Files kind="fabric" subjectId={f.id} labels={FILE_LABELS.fabric} editable hint="the swatch image the block sheet has a column for, the mill's stock sheet from WhatsApp, the block confirmation email" />
    <ThreadPanel kind="fabric" subjectId={f.id} /></>}

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
  const { db } = useApp();
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'auto' | 'hand' | 'needs'>('all');
  /* fabrics under their reorder point that Enigma will NOT order — a person has to */
  const needs = db.fabrics.filter(f => f.bucket === 'CORE' && f.international).map(f => { const m = db.vendors.find(v => v.id === f.vendorId); return { f, m, c: coverageOf(f, m?.leadDays ?? 30, m) }; })
    .filter(x => x.c.belowRop && !openFabricPos(db).some(p => p.fabricId === x.f.id));
  const { raiseFabricPo } = useApp();
  const allPos = openFabricPos(db).sort((a, b) => a.expectedOn.localeCompare(b.expectedOn));
  /* search by PO number, fabric name or code, mill, remark — anything on the row */
  const hay = (p: typeof allPos[number]) => { const f = db.fabrics.find(x => x.id === p.fabricId); const v = db.vendors.find(x => x.id === p.vendorId); return `${p.poNo} ${f?.name ?? ''} ${f?.code ?? ''} ${f?.bucket ?? ''} ${v?.name ?? ''} ${p.remark ?? ''}`.toLowerCase(); };
  const pos = allPos.filter(p => (!q.trim() || q.toLowerCase().split(/\s+/).every(w => hay(p).includes(w)))
    && (only === 'all' || only === 'needs' || (only === 'auto' && p.source === 'auto') || (only === 'hand' && p.source !== 'auto')));
  const ex = useExamples(pos, p => fabricPoStatus(p), { noun: 'fabric POs', score: p => (p.remark ? 1 : 0), done: p => fabricPoStatus(p) === 'on order' });
  const fabric = (id: string) => db.fabrics.find(f => f.id === id);
  const TONE: Record<string, 'neutral' | 'info' | 'warn' | 'good' | 'risk'> = { 'on order':'neutral', overdue:'risk', received:'neutral' };
  return <>
    <div className="flex items-end gap-3 flex-wrap mb-3">
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search PO, fabric, code, mill, remark…" style={{ width: 300 }} aria-label="search fabric POs" />
      <Seg value={only} onChange={setOnly} options={[{ id:'all', label:'All open', count: allPos.length }, { id:'auto', label:'Enigma raised · auto', count: allPos.filter(p => p.source === 'auto').length, hint:'Enigma\'s batch run raised these on its own — domestic core under its threshold' }, { id:'hand', label:'Raised by hand', count: allPos.filter(p => p.source !== 'auto').length, hint:'a person pushed these — international core, a design\'s new fabric, an RTW requirement' }, { id:'needs', label:'Needs a PO by hand', count: needs.length, hint:'international core under its reorder point with no PO — Enigma will not raise it' }]} />
      {q && <span className="text-[12px]" style={{ color:'var(--ink-soft)' }}>{pos.length} of {allPos.length}</span>}
      {ex.strip && <span className="ml-auto">{ex.strip}</span>}
    </div>
    <div className="mb-3"><Note>Two ways a PO gets raised. <b>Enigma · auto</b>: its batch run orders a domestic core fabric the moment saleable stock falls under the threshold. <b>By hand</b>: a person pushes it — sourcing for international core (Enigma never orders those), design for a new fabric or an RTW requirement.</Note></div>
    {(only === 'needs' || (only === 'all' && needs.length > 0)) && <Card className="mb-3"><div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom:'1px solid var(--line-soft)' }}><h3>Needs a PO by hand · {needs.length}</h3><span className="text-[12px]" style={{ color:'var(--ink-faint)' }}>international core under its reorder point, nothing on order — Enigma will not raise these</span></div>
      {needs.length === 0 ? <div className="px-4 py-3 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing waiting on a person right now.</div> : <table className="t compact"><thead><tr><th>Fabric</th><th>Mill</th><th className="num">Saleable</th><th className="num">Reorder point</th><th className="num">Suggested PO</th><th></th></tr></thead>
      <tbody>{needs.map(({ f, m, c }) => <tr key={f.id} className="row" onClick={() => { location.hash = `#/fabrics?tab=pos&open=${f.id}&view=pos`; }}>
        <td className="font-medium">{f.name}<div className="text-[11px] font-normal mono" style={{ color:'var(--ink-faint)' }}>{f.code}</div></td><td className="text-[12.5px]">{m?.name ?? '—'}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{m?.leadDays ?? '—'}d lead</div></td>
        <td className="num" style={{ color:'var(--risk)' }}>{c.saleable} m</td><td className="num">{c.rop} m</td><td className="num">{c.suggestedPo} m</td>
        <td onClick={e => e.stopPropagation()}>{canSource ? <Button size="sm" variant="primary" onClick={() => raiseFabricPo(f.id, c.suggestedPo)}>Raise PO · {c.suggestedPo} m</Button> : <ActsBy role="sourcing" does="raises it" inline />}</td>
      </tr>)}</tbody></table>}</Card>}
    {only === 'needs' ? null : pos.length === 0 ? <Card><Empty title={allPos.length ? 'Nothing matches.' : 'No fabric POs open.'} body={allPos.length ? 'Try a shorter word — the search covers PO number, fabric name and code, mill and remark.' : "Enigma's auto-POs and the manual international ones appear here until the rolls are received."} /></Card> : <Card><div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><th>PO</th><th>Fabric</th><th>Mill</th><th className="num">Metres</th><th>Expected</th><th>Status</th></tr></thead>
      <tbody>{ex.rows.map(p => { const f = fabric(p.fabricId); const st = fabricPoStatus(p); return (
        <tr key={p.id}>
          <td className="mono text-[12.5px]">{p.poNo}<div className="text-[11px]" style={{ color:'var(--ink-faint)', fontFamily:'var(--body)' }}>{/* who raised it is a fact about the PO, not a status: plain text, so the row has one status pill */}raised {p.source === 'auto' ? 'by Enigma · auto' : /concept|RTW bulk|REQ-\d/i.test(p.remark) ? 'by hand · design' : 'by hand · sourcing'} · {fmtRel(p.raisedOn)}</div></td>
          <td style={{ whiteSpace:'normal', minWidth: 180 }}>{f?.name}<div className="text-[11px] mono" style={{ color:'var(--ink-faint)' }}>{f?.code} · {f?.bucket.toLowerCase().replace('_', '-')}</div></td>
          <td style={{ whiteSpace:'normal' }}><VendorLink id={p.vendorId} /></td>
          <td className="num">{p.metres} m</td>
          <td className="text-[12px]" style={{ whiteSpace:'normal', minWidth: 190 }}><span style={{ color: daysAgo(p.expectedOn) > 0 ? 'var(--risk)' : undefined }}>{fmtDate(p.expectedOn)}</span></td>
          <td><Pill tone={TONE[st]}>{st}</Pill></td>
        </tr>); })}</tbody>
    </table></div>
    </Card>}
    <div className="mt-3"><Note>A PO is on order until its rolls are received, and overdue once the expected date passes.</Note></div>
  </>;
}


/* ---------- the swatch books — design's front page of the master ------------------
   One block per book, the fabrics in it as rows: is it on the shelf, what does it
   sell as (the designs and their product codes), is cloth coming, when did stores
   and online go live. No reorder maths — that is sourcing's page. */
/* inactive = a person switched it off by hand (Enigma's On Hold); out of stock = the system's, saleable has fallen to the threshold */
type BookState = 'active' | 'coming' | 'hold' | 'out';
const BOOK_STATE: Record<BookState, { label: string; tone: 'good' | 'info' | 'warn' | 'risk' }> = {
  active: { label:'can sell', tone:'good' }, coming: { label:'cloth coming', tone:'info' }, hold: { label:'inactive', tone:'warn' }, out: { label:'out of stock', tone:'risk' } };
function BooksTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { db, setFabricHold, resumeFabric } = useApp();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'active' | 'hold' | 'coming' | 'out'>('all');
  const [book, setBook] = useState<string>('all');
  const [wh, setWh] = useState('factory');
  const [bucket, setBucket] = useState<'all' | 'CORE' | 'NON_CORE'>('all');   // Enigma's warehouse picker — one stock today; per-warehouse once the read is live
  const saleable = (f: Fabric) => Math.round((f.stockMetres - f.reservedMetres - f.thresholdMetres) * 10) / 10;
  const STATE = BOOK_STATE;
  /* one flat table, every fabric in every book; the filters do the grouping the
     old one-card-per-book layout did with a page of scroll */
  const all = db.fabrics.filter(f => f.swatchBook && f.bucket !== 'BESPOKE').map(f => {
    const c = (db.concepts ?? []).find(x => x.fabricId === f.id) ?? null;
    const state: BookState = f.onHold || f.paused ? 'hold' : f.stockMetres === 0 && f.incomingMetres > 0 ? 'coming' : saleable(f) <= 0 ? 'out' : 'active';
    return { f, c, state };
  });
  const books = MTM_SWATCH_BOOKS.map(bk => { const fs = all.filter(x => x.f.swatchBook === bk); const active = fs.filter(x => x.state === 'active').length;
    return { b: bk, total: fs.length, active, gap: MTM_ACTIVE_TARGET - active, coming: fs.filter(x => x.state === 'coming').length, live: fs.filter(x => x.c?.liveOn).length }; }).filter(x => x.total > 0);
  const rows = all
    .filter(x => (book === 'all' || x.f.swatchBook === book) && (show === 'all' || x.state === show) && (bucket === 'all' || x.f.bucket === bucket)
      && (!q.trim() || q.toLowerCase().split(/\s+/).every(w => `${x.f.name} ${x.f.code} ${x.f.swatchBook} ${(x.c?.designs ?? []).map(d => `${d.name} ${d.finalName ?? ''} ${d.code}`).join(' ')}`.toLowerCase().includes(w))))
    .sort((a, b) => (a.f.swatchBook ?? '').localeCompare(b.f.swatchBook ?? '') || ({ active: 0, coming: 1, out: 2, hold: 3 })[a.state] - ({ active: 0, coming: 1, out: 2, hold: 3 })[b.state] || a.f.name.localeCompare(b.f.name));
  const count = (f: (x: typeof all[number]) => boolean) => all.filter(x => (book === 'all' || x.f.swatchBook === book) && (bucket === 'all' || x.f.bucket === bucket) && f(x)).length;
  const ex = useExamples(rows, r => `${r.f.swatchBook}·${r.state}`, { noun: 'fabrics', score: r => (r.c ? 1 : 0) + (r.c?.designs?.length ? 1 : 0) + (r.c?.liveOn ? 1 : 0) + (r.c?.swatch ? 1 : 0), done: r => r.state === 'active' && !!r.c?.liveOn });
  const pager = usePager(ex.rows, 25);
  return <>
    {/* the books in one strip: click a book to filter to it */}
    <div className="grid gap-2 mb-3" style={{ gridTemplateColumns:`repeat(${books.length + 1}, minmax(0, 1fr))` }}>
      <button type="button" className="card text-left px-3 py-2" style={{ borderColor: book === 'all' ? 'var(--accent)' : undefined, cursor:'pointer' }} onClick={() => setBook('all')}>
        <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>Every book</div><div className="text-[15px] font-semibold">{all.filter(x => x.state === 'active').length} <span className="text-[11.5px] font-normal" style={{ color:'var(--ink-faint)' }}>can sell of {all.length}</span></div></button>
      {books.map(bk => <button key={bk.b} type="button" className="card text-left px-3 py-2" style={{ borderColor: book === bk.b ? 'var(--accent)' : undefined, borderLeft: `3px solid var(${bk.gap > 0 ? '--warn' : '--good'})`, cursor:'pointer' }} onClick={() => setBook(book === bk.b ? 'all' : bk.b)} title={`${bk.total} fabrics · ${bk.coming} coming · ${bk.live} live in stores`}>
        <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{bk.b}</div>
        <div className="text-[15px] font-semibold">{bk.active} <span className="text-[11.5px] font-normal" style={{ color:'var(--ink-faint)' }}>/ {MTM_ACTIVE_TARGET}</span> {bk.gap > 0 ? <span className="pill warn" style={{ marginLeft: 4 }}>{bk.gap} short</span> : <span className="pill good" style={{ marginLeft: 4 }}>met</span>}</div></button>)}
    </div>
    <div className="flex items-end gap-3 flex-wrap mb-2">
      <Seg value={show} onChange={setShow} options={[{ id:'all', label:'Every fabric', count: count(() => true) }, { id:'active', label:'Can sell', count: count(x => x.state === 'active'), hint:'sellable now: above the threshold and active' }, { id:'coming', label:'Cloth coming', count: count(x => x.state === 'coming') }, { id:'out', label:'Out of stock', count: count(x => x.state === 'out'), hint:'saleable has fallen to the threshold (physical − reserved ≤ threshold); set by the system' }, { id:'hold', label:'Inactive', count: count(x => x.state === 'hold'), hint:'made inactive by hand (Enigma: On Hold); Make active puts it back on sale' }]} />
      <Seg value={bucket} onChange={v => setBucket(v as typeof bucket)} options={[{ id:'all', label:'Core + non-core' }, { id:'CORE', label:'Core', count: all.filter(x => x.f.bucket === 'CORE' && (book === 'all' || x.f.swatchBook === book)).length }, { id:'NON_CORE', label:'Non-core', count: all.filter(x => x.f.bucket === 'NON_CORE' && (book === 'all' || x.f.swatchBook === book)).length }]} />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name…" style={{ width: 280 }} aria-label="search books" />
      <Select value={wh} onChange={setWh} options={[{ value:'factory', label:'Factory Warehouse' }, { value:'ho', label:'HO Warehouse' }]} />
      <ExportButton filename="fabric-inventory" sheetName="Fabric Inventory" rows={rows} cols={[
        { label:'Code', get: r => r.f.code }, { label:'Name', get: r => r.f.name }, { label:'Category', get: r => r.f.family }, { label:'Inventory Type', get: r => r.f.bucket }, { label:'Product Type', get: () => 'CUSTOM_DESIGN' },
        { label:'Saleable Stock', get: r => saleable(r.f) }, { label:'Physical Stock', get: r => r.f.stockMetres }, { label:'Reserved Stock', get: r => r.f.reservedMetres }, { label:'Threshold', get: r => r.f.thresholdMetres }, { label:'Swatch book', get: r => r.f.swatchBook ?? '' }]} />
      <span className="ml-auto flex items-center gap-3">{ex.strip}{book !== 'all' && books.find(x => x.b === book)!.gap > 0 && <a className="cta" href="#/design?new=mtm">raise an MTM fabric ask for the {books.find(x => x.b === book)!.gap} short →</a>}</span>
    </div>
    {rows.length === 0 ? <Card><Empty title="Nothing matches." body="Widen the filter or the search." /></Card> : <Card><div className="tbox" style={{ maxHeight:'calc(100vh - 380px)' }}><table className="t compact frozen tight">
      <thead><tr><th>Fabric · code</th><th>Category</th><th style={{ whiteSpace:'normal' }}>Inventory type</th><th style={{ whiteSpace:'normal' }}>Product type</th><th className="num" style={{ whiteSpace:'normal' }}>Saleable</th><th className="num" style={{ whiteSpace:'normal' }}>Physical</th><th className="num" style={{ whiteSpace:'normal' }}>Reserved</th><th className="num" style={{ whiteSpace:'normal' }}>Threshold</th><th>Status · action</th></tr></thead>
      <tbody>{pager.pageRows.map(({ f, c, state }) => { const ds = c?.designs ?? []; const sal = saleable(f);
        return <tr key={f.id} className="row" onClick={() => onOpen(f.id)}>
          <td style={{ whiteSpace:'normal', minWidth: 180 }}><div className="flex gap-2 items-start"><span aria-hidden style={{ display:'inline-block', width: 28, height: 28, flex:'none', borderRadius: 4, background: `hsl(${[...f.code].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360} 30% 78%)`, border:'1px solid var(--line)' }} title={ds[0] ? (ds[0].finalName ?? ds[0].name) : f.name} /><div><span className="font-medium">{f.name}</span><div className="mono text-[11px]" style={{ color:'var(--ink-faint)' }}>{f.code}</div>{formerNames(f).length ? <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>formerly {formerNames(f)[0]}</div> : null}<div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{f.swatchBook}{ds.length ? ` · ${ds.length} design${ds.length === 1 ? '' : 's'}` : ''}</div></div></div></td>
          <td className="text-[12px]">{f.family}</td>
          <td className="mono text-[11px]">{f.bucket}</td>
          <td className="mono text-[11px]" style={{ whiteSpace:'normal', wordBreak:'break-all' }}>CUSTOM_DESIGN</td>
          <td className="num" style={{ color: sal < 0 ? 'var(--risk)' : undefined }}>{sal}</td>
          <td className="num">{f.stockMetres}{f.incomingMetres ? <div className="text-[10.5px]" style={{ color:'var(--info)' }}>+{f.incomingMetres} coming</div> : null}</td>
          <td className="num">{f.reservedMetres}</td>
          <td className="num">{f.thresholdMetres}</td>
          <td onClick={e => e.stopPropagation()}><div className="flex flex-col gap-1 items-start"><Pill tone={STATE[state].tone}>{STATE[state].label}</Pill>{state === 'hold'
            ? <Button size="sm" onClick={() => { setFabricHold(f.id, false); if (f.paused) resumeFabric(f.id); }}>Make active</Button>
            : <Button size="sm" onClick={() => setFabricHold(f.id, true)}>Make inactive</Button>}</div></td>
        </tr>; })}</tbody>
    </table></div><Pager {...pager} onChange={pager.setPage} noun="fabrics" /></Card>}
    <div className="mt-3"><Note>The columns are Enigma's Fabric Inventory, metres. Saleable = physical − reserved − threshold, the number a store can sell against. Click a book to filter; Inactive is set by hand (Make inactive / Make active; Enigma's On Hold); out of stock is the system's, when saleable falls to the threshold. Open a fabric to rename it or see its POs and stock.</Note></div>
  </>;
}

/** A fabric as a drawer, for screens other than the fabric master (the mills, Find a fabric): opened by ?fabric=<id>,
    the same record the master opens, so a fabric never jumps to a full page from a list. */
export function FabricDrawer() {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const f = db.fabrics.find(x => x.id === params.get('fabric')) ?? null;
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); if (k === 'fabric' && !v) n.delete('fview'); setParams(n, { replace:true }); };
  const mill = f ? db.vendors.find(v => v.id === f.vendorId)?.name ?? '' : '';
  return <Drawer open={!!f} onClose={() => set('fabric', null)} title={f?.name ?? ''} subtitle={f && <><Pill tone="accent">{f.bucket.replace('_', '-').toLowerCase()}</Pill><span className="mono">{f.code}</span><span>· {mill} · {f.international ? 'international' : 'domestic'}{f.swatchBook ? ` · ${f.swatchBook}` : ''}</span></>}>
    {f && <FabricRecord f={f} view={(params.get('fview') as FabricView) ?? 'overview'} setView={v => set('fview', v)} />}
  </Drawer>;
}
