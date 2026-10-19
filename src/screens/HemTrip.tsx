/* The second alteration route. The store's own tailor is one; this is the other:
   the piece goes to the hemming unit THROUGH the warehouse, and comes back the
   same way — store → vehicle → warehouse inward → hemming unit → hemmed → back at
   the warehouse → dispatched to the store, or straight to the customer. Every
   hop is a scan by the team that has the piece, so the store can see where the
   trouser is instead of asking. */
import { useState } from 'react';
import { useApp, type HemLegStep } from '../store';
import type { ReturnCase } from '../domain/types';
import { returnStatusOf, fmtDate, fmtRel, daysAgo } from '../domain/engines';
import { STORES, ROLE_LABEL } from '../domain/reference';
import { Section, Pill, Button, Select, Field, Card, KV } from '../ui';
import { ActsBy } from './Who';

type Hop = { key: keyof NonNullable<ReturnCase['hemLeg']>; step: HemLegStep | 'handed'; label: (r: ReturnCase) => string; who: 'store' | 'warehouse' | 'production' };
const HOPS: Hop[] = [
  { key:'handedOn',            step:'handed',            label: () => 'Handed to the vehicle by the store',            who:'store' },
  { key:'inwardAtWarehouseOn', step:'inwardAtWarehouse', label: () => 'Inwarded at the warehouse',                    who:'warehouse' },
  { key:'atUnitOn',            step:'atUnit',            label: () => 'Scanned in at the hemming unit',                 who:'production' },
  { key:'hemmedOn',            step:'hemmed',            label: () => 'Hemmed · scanned out of the unit',               who:'production' },
  { key:'backAtWarehouseOn',   step:'backAtWarehouse',   label: () => 'Back at the warehouse',                          who:'warehouse' },
  { key:'dispatchedOn',        step:'dispatched',        label: r => r.hemLeg?.destination === 'customer' ? 'Dispatched to the customer' : 'Dispatched to the store', who:'warehouse' },
  { key:'deliveredOn',         step:'delivered',         label: r => r.hemLeg?.destination === 'customer' ? 'Delivered · store confirms with the customer' : 'Received at the store, counted in', who:'store' },
];

/** The round trip, one dot per hop, with the next hop's button for whoever has the piece. */
export function HemTripSection({ r }: { r: ReturnCase }) {
  const { role, sendReturnToHemming, hemLegStep } = useApp();
  const h = r.hemLeg ?? null;
  const [dest, setDest] = useState<'store' | 'customer'>(h?.destination ?? 'store');
  const last = returnStatusOf(r).last;
  const onRoute = last && last.outcome === 'pending' && last.step === 'alteration' && last.where === 'hemming-unit';
  if (!onRoute && !h) return null;
  const done = (hop: Hop) => !!h?.[hop.key];
  const next = HOPS.find(hop => !done(hop)) ?? null;
  const can = (who: Hop['who']) => role === 'owner' || role === who || (who === 'production' && role === 'merchandiser');
  const tone = !h ? 'neutral' : h.deliveredOn ? 'good' : h.hemmedOn ? 'info' : 'warn';
  const summary = !h || !h.handedOn ? 'not yet handed over' : h.deliveredOn ? `round trip done · ${fmtRel(h.deliveredOn)}` : `${HOPS.filter(done).length} of ${HOPS.length} hops · ${returnStatusOf(r).label}`;
  return <Section title="The piece's round trip · store → warehouse → hemming unit → warehouse → store" right={<Pill tone={tone}>{summary}</Pill>} ownerRole={next ? next.who : null} pending={false} defaultOpen={!!next}>
    {HOPS.map(hop => <div key={hop.key} className="kv"><span className="k flex items-center gap-2"><span className="dot" style={{ background: done(hop) ? 'var(--good)' : next?.key === hop.key ? 'var(--warn)' : 'var(--line)' }} />{hop.label(r)}<span className={`pill role-${hop.who}`}>{ROLE_LABEL[hop.who]}</span></span>
      <span className="v text-[12px]">{h?.[hop.key] ? <>{fmtDate(h[hop.key] as string)}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{fmtRel(h[hop.key] as string)}</div></> : next?.key === hop.key ? <span style={{ color:'var(--warn)' }}>next</span> : '—'}</span></div>)}
    {next && <div className="pt-3 flex gap-2 items-end flex-wrap" style={{ borderTop:'1px solid var(--line-soft)' }}>
      {next.step === 'handed' ? (can('store') ? <>
          <div style={{ width: 230 }}><Field label="Comes back to" hint="the store, or the unit sends it straight to the customer"><Select value={dest} onChange={v => setDest(v as 'store' | 'customer')} options={[{ value:'store', label:'The store · customer collects' }, { value:'customer', label:'Straight to the customer' }]} /></Field></div>
          <Button size="sm" variant="primary" onClick={() => sendReturnToHemming(r.id, dest)}>Handed to the vehicle →</Button>
        </> : <ActsBy role="store" does="hands the piece to the vehicle for the warehouse" />)
      : can(next.who) ? <Button size="sm" variant="primary" onClick={() => hemLegStep(r.id, next.step as HemLegStep)}>{next.label(r)} ✓</Button>
      : <ActsBy role={next.who} does={next.label(r).toLowerCase()} />}
      {h?.handedOn && <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{daysAgo(h.handedOn)}d since it left the store</span>}
    </div>}
    {h?.deliveredOn && <div className="pt-2 text-[12px]" style={{ color:'var(--ink-faint)' }}>The trip is done. The store closes the case with the customer on the ladder above — happy, or not enough.</div>}
  </Section>;
}

/** Every alteration on the unit route that is not home yet — the warehouse's and
    the hemming unit's list of pieces to move on. */
export function UnitAlterations() {
  const { db } = useApp();
  const rows = db.returns.filter(r => r.hemLeg && !r.hemLeg.deliveredOn && !r.closedOn).sort((a, b) => (a.hemLeg!.handedOn ?? '').localeCompare(b.hemLeg!.handedOn ?? ''));
  if (rows.length === 0) return <Card><div className="empty m-3 text-center py-8"><b>Nothing on the way to or from the hemming unit.</b></div></Card>;
  return <>
    {rows.map(r => { const rs = returnStatusOf(r); return <Card key={r.id} className="mb-3"><div className="pad">
      <div className="flex items-center gap-2 flex-wrap mb-1"><span className="mono text-[12.5px]">{r.caseNo}</span><b>{r.styleName}</b><Pill tone={r.kind === 'MTM' ? 'accent' : 'info'}>{r.kind}</Pill><span className="text-[12px]" style={{ color:'var(--ink-faint)' }}>{STORES.find(s => s.id === r.storeId)?.name ?? r.storeId}</span><span className="ml-auto"><Pill tone={rs.overdue ? 'risk' : 'info'}>{rs.label}</Pill></span></div>
      <KV k="What the unit does" v={rs.last?.note || 'alteration'} note={`opened ${fmtDate(r.openedOn)} · ${daysAgo(r.openedOn)}d against ${r.slaDays}d`} />
    </div><div className="px-3 pb-3"><HemTripSection r={r} /></div></Card>; })}
  </>;
}
