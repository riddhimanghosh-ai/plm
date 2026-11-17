/* Category's COGS and cost dashboard (15 Nov 2026): COGS per piece and intake margin across every RTW style with a PO,
   the totals on top, and from each row the two moves category makes once costs are known — add it to Enigma,
   and get its product and marketing details ready. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { ProductionOrder } from '../domain/types';
import { fmtMoney, fmtDate } from '../domain/engines';
import { rtwCogsOf } from '../domain/rtwPack';
import { Page, Card, Pill, Drawer, Empty, Stats, Input, MultiFilter, passes, Seg } from '../ui';
import { VendorLink } from './Vendors';
import { RtwRequirement } from './RtwRequirement';

const TARGET_MARGIN = 0.55;   // the costing sheet's intake-margin line; below it shows red
type Row = { o: ProductionOrder; c: ReturnType<typeof rtwCogsOf> };

/* only: the screen shows one side. COGS and margin is finance's and category's; Enigma and marketing is category's own screen (17 Nov 2026). */
export function CogsDashboard({ only = 'cogs' }: { only?: 'cogs' | 'enigma' }) {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };
  const view = only;
  const [cats, setCats] = useState<string[]>([]); const [status, setStatus] = useState<string[]>([]); const [q, setQ] = useState('');
  const all: Row[] = db.orders.filter(o => o.poNo && o.status !== 'Cancelled').map(o => ({ o, c: rtwCogsOf(db, o) }));
  const stateOf = (r: Row) => r.c.margin != null && r.c.margin < TARGET_MARGIN ? 'below' : !r.o.enigmaProduct ? (r.c.delivered ? 'to-enigma' : 'making') : !r.o.enigmaProduct.copy ? 'to-marketing' : 'live';
  const STATE: Record<string, [string, 'risk' | 'warn' | 'info' | 'good' | 'neutral']> = { below: ['below target margin', 'risk'], 'to-enigma': ['ready for Enigma', 'warn'], making: ['in production', 'neutral'], 'to-marketing': ['marketing details to do', 'info'], live: ['in Enigma · copy done', 'good'] };
  const rows = all.filter(r => view === 'cogs' || stateOf(r) === 'to-enigma' || stateOf(r) === 'to-marketing' || stateOf(r) === 'live').filter(r => passes(cats, r.o.category)).filter(r => passes(status, stateOf(r))).filter(r => !q.trim() || `${r.o.styleName} ${r.o.poNo}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (a.c.margin ?? 1) - (b.c.margin ?? 1));
  const withM = all.filter(r => r.c.margin != null);
  const avgCogs = all.length ? all.reduce((a, r) => a + r.c.cogs, 0) / all.length : 0;
  const avgMargin = withM.length ? withM.reduce((a, r) => a + (r.c.margin ?? 0), 0) / withM.length : null;
  const book = all.reduce((a, r) => a + r.c.total, 0);
  const over = all.filter(r => r.c.diff != null && r.c.diff > 0);
  const below = all.filter(r => r.c.margin != null && r.c.margin < TARGET_MARGIN);
  const toEnigma = all.filter(r => !r.o.enigmaProduct && r.c.delivered); const toMkt = all.filter(r => r.o.enigmaProduct && !r.o.enigmaProduct.copy);
  /* where the money goes, per piece on average */
  const parts = ['fabric', 'make', 'trims', 'transport', 'hemming', 'freight', 'overheads', 'poExtra'] as const;
  const PART: Record<typeof parts[number], string> = { fabric: 'Fabric', make: 'Making', trims: 'Trims & packaging', transport: 'Transport', hemming: 'Hemming', freight: 'Freight', overheads: 'Overheads', poExtra: 'PO extras' };
  const mix = parts.map(k => ({ k, v: all.length ? all.reduce((a, r) => a + (r.c.parts[k] || 0), 0) / all.length : 0 })).filter(x => x.v > 0);
  const mixTotal = mix.reduce((a, x) => a + x.v, 0) || 1;
  const active = db.orders.find(o => o.id === (params.get('open') ?? '').split(':')[0]) ?? null;
  const faint = { color: 'var(--ink-faint)' } as const;
  const cats0 = [...new Set(all.map(r => r.o.category))];

  return <Page title={view === 'enigma' ? 'Enigma and marketing' : 'COGS and cost'} lede={view === 'enigma' ? 'Once a style is in: add it to Enigma, then its product and marketing details.' : 'What every style costs per piece against what it sells for.'}>
    {view === 'cogs' && <Stats items={[
      { label: 'Avg COGS per piece', value: fmtMoney(Math.round(avgCogs)) },
      { label: 'Avg intake margin', value: avgMargin != null ? `${Math.round(avgMargin * 100)}%` : '—', tone: avgMargin != null ? (avgMargin >= TARGET_MARGIN ? 'good' : 'risk') : undefined },
      { label: `Below ${Math.round(TARGET_MARGIN * 100)}% margin`, value: below.length, tone: below.length ? 'risk' : 'good' },
      { label: 'Over planned COGS', value: over.length, tone: over.length ? 'warn' : 'good' },
      { label: 'COGS on the book', value: fmtMoney(Math.round(book)) },
    ]} />}
    {view === 'cogs' && <div className="mb-3">
      <Card><div className="px-4 py-3">
        <div className="cap">Where a piece's cost goes · average</div>
        <div className="cogs-bar my-2">{mix.map((x, i) => <span key={x.k} style={{ width: `${x.v * 100 / mixTotal}%`, background: `var(--cogs-${i})` }} title={`${PART[x.k]} ${fmtMoney(Math.round(x.v))}`} />)}</div>
        {mix.map((x, i) => <div key={x.k} className="kv"><span className="k flex items-center gap-2"><span className="dot" style={{ background: `var(--cogs-${i})` }} />{PART[x.k]}</span><span className="v">{fmtMoney(Math.round(x.v))} <span className="text-[11px]" style={faint}>{Math.round(x.v * 100 / mixTotal)}%</span></span></div>)}
      </div></Card>
    </div>}
    {view === 'enigma' && <div className="mb-3" style={{ maxWidth: 640 }}>
      <Card><div className="px-4 py-3">
        <div className="cap">To do · click a count to list them</div>
        <div className="kv"><span className="k">Ready to add to Enigma<span className="text-[11px] block" style={faint}>received, not yet in Enigma</span></span><span className="v"><button type="button" className="vlink" onClick={() => setStatus(['to-enigma'])}><b>{toEnigma.length}</b></button></span></div>
        <div className="kv"><span className="k">Product and marketing details<span className="text-[11px] block" style={faint}>in Enigma, copy not done</span></span><span className="v"><button type="button" className="vlink" onClick={() => setStatus(['to-marketing'])}><b>{toMkt.length}</b></button></span></div>
      </div></Card>
    </div>}
    <Card className="mb-3"><div className="px-3 py-2.5 flex items-end gap-3 flex-wrap">
      <MultiFilter label="Status" value={status} onChange={setStatus} options={[{ id: 'all', label: 'Every style', count: all.length }, ...Object.entries(STATE).map(([k, [l]]) => ({ id: k, label: l, count: all.filter(r => stateOf(r) === k).length }))]} />
      <MultiFilter label="Category" value={cats} onChange={setCats} width={240} options={[{ id: 'all', label: 'Every category' }, ...cats0.map(c => ({ id: c, label: c, count: all.filter(r => r.o.category === c).length }))]} />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="style or PO" style={{ width: 200 }} />
    </div></Card>
    {rows.length === 0 ? <Card><Empty title="Nothing matches." body="" /></Card> : <Card><table className="t">
      <thead><tr><th>Style</th><th>Factory</th><th className="num">COGS / pc</th><th className="num">Planned</th><th className="num">MRP</th><th className="num">Net</th><th className="num">Margin</th><th>Status</th><th></th></tr></thead>
      <tbody>{rows.slice(0, params.get('all') === '1' ? undefined : 40).map(({ o, c }) => { const [lab, tone] = STATE[stateOf({ o, c })];
        return <tr key={o.id} className="row" onClick={() => set('open', `${o.id}:cogs`)}>
          <td><div className="font-medium">{o.enigmaProduct?.name ?? o.styleName}</div><div className="text-[11.5px]" style={faint}><span className="mono">{o.poNo}</span> · {o.category} · {c.pcs} pcs</div></td>
          <td className="text-[12.5px]"><VendorLink id={o.vendorId} /></td>
          <td className="num font-semibold">{fmtMoney(Math.round(c.cogs))}</td>
          <td className="num" style={{ color: c.diff != null && c.diff > 0 ? 'var(--warn)' : 'var(--ink-faint)' }}>{c.planned != null ? fmtMoney(Math.round(c.planned)) : '—'}{c.diff ? <div className="text-[11px]">{c.diff > 0 ? '+' : ''}{fmtMoney(Math.round(c.diff))}</div> : null}</td>
          <td className="num">{c.mrp != null ? fmtMoney(c.mrp) : '—'}</td>
          <td className="num">{c.net != null ? fmtMoney(Math.round(c.net)) : '—'}</td>
          <td className="num"><b style={{ color: c.margin == null ? undefined : c.margin < TARGET_MARGIN ? 'var(--risk)' : 'var(--good)' }}>{c.margin != null ? `${Math.round(c.margin * 100)}%` : '—'}</b></td>
          <td><Pill tone={tone}>{lab}</Pill>{c.closedOn && <div className="text-[11px]" style={faint}>COGS closed {fmtDate(c.closedOn)}</div>}</td>
          <td style={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
            {!o.enigmaProduct ? <button type="button" className="cta" onClick={() => set('open', `${o.id}:launch`)}>Add to Enigma →</button>
              : !o.enigmaProduct.copy ? <button type="button" className="cta" onClick={() => set('open', `${o.id}:launch`)}>✦ Marketing →</button>
              : <button type="button" className="vlink text-[12px]" onClick={() => set('open', `${o.id}:launch`)}>in Enigma</button>}
          </td>
        </tr>; })}</tbody>
    </table>
    {rows.length > 40 && params.get('all') !== '1' && <div className="px-4 py-2 text-[12px]" style={faint}>40 of {rows.length} shown · <button type="button" className="vlink" onClick={() => set('all', '1')}>show all</button></div>}
    </Card>}
    <Drawer open={!!active} onClose={() => set('open', null)} title={active?.poNo ?? ''} subtitle={active && <span>{active.styleName} · {db.vendors.find(v => v.id === active.vendorId)?.name ?? ''}</span>}>
      {active && <RtwRequirement key={params.get('open')!} o={active} initial={params.get('open')!.split(':')[1] ?? 'cogs'} />}
    </Drawer>
  </Page>;
}
