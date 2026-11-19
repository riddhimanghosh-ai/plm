/* Marketing details (19 Nov 2026, second call): while category adds the style to Enigma, marketing fills in everything the
   listing needs: title, description, buzzwords, key features, fabric and care, fit notes, SEO and pointers for the shoot.
   It starts as soon as the factories have quoted (the Enigma step), never holds up the PO, and the style goes live only
   once it is done, so by the time the goods land everything is sorted. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { MarketingDetails, ProductionOrder } from '../domain/types';
import { fmtDate, fmtMoney, daysAgo } from '../domain/engines';
import { marketingDraftOf } from '../domain/rtwPack';
import { Page, Card, Pill, Drawer, Empty, Stats, Input, Button, Section, Field, Seg, MultiFilter, passes } from '../ui';
import { RtwRequirement } from './RtwRequirement';

const faint = { color: 'var(--ink-faint)' } as const; const soft = { color: 'var(--ink-soft)' } as const;
const ta = { fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.4, width: '100%' } as const;

/* what is still empty, for the pill and the done button */
export const marketingGapsOf = (m: MarketingDetails | null | undefined) => !m ? ['everything'] : ([['title', m.title], ['description', m.description], ['buzzwords', m.buzzwords.join('')], ['key features', m.bullets.join('')], ['fabric and care', m.fabricCare], ['fit notes', m.fitNotes], ['SEO title', m.seo]] as [string, string][]).filter(([, v]) => !v.trim()).map(([k]) => k);

export function MarketingSection({ o }: { o: ProductionOrder }) {
  const { role, saveMarketing } = useApp(); const can = role === 'marketing' || role === 'owner';
  const [m, setM] = useState<MarketingDetails | null>(o.marketing ?? null);
  const replies = o.costQuery?.replies.length ?? 0;
  const set = (p: Partial<MarketingDetails>) => setM(x => x && ({ ...x, ...p }));
  const lines = (v: string) => v.split('\n');
  const gaps = marketingGapsOf(m);
  const ep = o.enigmaProduct;
  return <Section title="Product and marketing details" collapsible={false} right={<span className="flex gap-2 items-center"><span className="pill role-marketing">Marketing</span>{o.marketing?.doneOn ? <Pill tone="good">done {fmtDate(o.marketing.doneOn)} · ready for go-live</Pill> : o.marketing?.savedOn ? <Pill tone="info">draft saved {fmtDate(o.marketing.savedOn)}</Pill> : <Pill tone="warn">to do · go-live waits</Pill>}</span>}>
    <div className="text-[12.5px] pb-2" style={soft}>{ep ? <>In Enigma as <span className="mono">{ep.code}</span> · {ep.name} · {fmtMoney(ep.mrp)} · {ep.skus.length} sizes.</> : replies ? 'Category is adding the style to Enigma now; fill these alongside.' : 'Starts once the factories have quoted and category starts the Enigma entry.'} It never holds up the PO; the style goes live only once this is done.</div>
    {!m ? <div className="flex items-center gap-3 flex-wrap py-1">
      {can ? <><Button variant="primary" onClick={() => setM(marketingDraftOf(o))}>✦ Draft from the record</Button><Button variant="ghost" onClick={() => setM({ ...marketingDraftOf(o), title: '', description: '', buzzwords: [], bullets: [], fabricCare: '', fitNotes: '', seo: '', pointers: [] })}>Start blank</Button></> : <span className="text-[12.5px]" style={faint}>Marketing fills this.</span>}
      <span className="text-[12px]" style={faint}>the draft reads the name, cloth, fit, colour, sizes, MRP and the design brief</span>
    </div> : <div className="grid gap-2">
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <Field label="Product title"><Input value={m.title} onChange={e => set({ title: e.target.value })} disabled={!can} /></Field>
        <Field label="Buzzwords · comma-separated"><Input value={m.buzzwords.join(', ')} onChange={e => set({ buzzwords: e.target.value.split(',').map(x => x.trimStart()) })} disabled={!can} placeholder="breathable, weekend-ready, linen" /></Field>
      </div>
      {m.buzzwords.filter(x => x.trim()).length > 0 && <div className="flex gap-1.5 flex-wrap">{m.buzzwords.filter(x => x.trim()).map((b, i) => <span key={i} className="pill">{b.trim()}</span>)}</div>}
      <Field label="Description"><textarea className="input" rows={3} value={m.description} onChange={e => set({ description: e.target.value })} disabled={!can} style={ta} /></Field>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <Field label="Key features · one per line"><textarea className="input" rows={4} value={m.bullets.join('\n')} onChange={e => set({ bullets: lines(e.target.value) })} disabled={!can} style={ta} /></Field>
        <Field label="Pointers for the shoot · one per line"><textarea className="input" rows={4} value={m.pointers.join('\n')} onChange={e => set({ pointers: lines(e.target.value) })} disabled={!can} style={ta} /></Field>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <Field label="Fabric and care"><Input value={m.fabricCare} onChange={e => set({ fabricCare: e.target.value })} disabled={!can} /></Field>
        <Field label="Fit notes"><Input value={m.fitNotes} onChange={e => set({ fitNotes: e.target.value })} disabled={!can} /></Field>
        <Field label="SEO title"><Input value={m.seo} onChange={e => set({ seo: e.target.value })} disabled={!can} /></Field>
      </div>
      {can && <div className="flex gap-2 items-center flex-wrap pt-1">
        <Button variant="primary" disabled={gaps.length > 0} onClick={() => saveMarketing(o.id, m, true)}>{o.marketing?.doneOn ? 'Save · still done' : 'Done · ready for go-live'}</Button>
        <Button variant="ghost" onClick={() => saveMarketing(o.id, m, false)}>Save draft</Button>
        <Button variant="ghost" onClick={() => setM(x => ({ ...marketingDraftOf(o), savedOn: x?.savedOn ?? null, by: x?.by ?? null, doneOn: x?.doneOn ?? null }))}>✦ Draft again</Button>
        {gaps.length > 0 && <span className="text-[12px]" style={{ color: 'var(--warn)' }}>to fill: {gaps.join(', ')}</span>}
      </div>}
      {o.marketing?.savedOn && <div className="text-[11.5px]" style={faint}>saved {fmtDate(o.marketing.savedOn)}{o.marketing.by ? ` by ${o.marketing.by}` : ''}</div>}
    </div>}
  </Section>;
}

/* marketing's screen: every style from the Enigma step on */
export function Marketing() {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };
  const view = (params.get('view') ?? 'todo') as 'todo' | 'done';
  const [cats, setCats] = useState<string[]>([]); const [q, setQ] = useState('');
  const all = db.orders.filter(o => o.status !== 'Cancelled' && ((o.costQuery?.replies.length ?? 0) > 0 || o.enigmaProduct || o.marketing));
  const todo = all.filter(o => !o.marketing?.doneOn).sort((a, b) => a.targetInhouse.localeCompare(b.targetInhouse));
  const done = all.filter(o => o.marketing?.doneOn && (o.status !== 'Closed' || daysAgo(o.marketing.doneOn) <= 30)).sort((a, b) => b.marketing!.doneOn!.localeCompare(a.marketing!.doneOn!));
  const catsAll = [...new Set(all.map(o => o.category))];
  const shown = (view === 'todo' ? todo : done).filter(o => passes(cats, o.category)).filter(o => !q.trim() || `${o.styleName} ${o.enigmaProduct?.code ?? ''} ${o.poNo ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const active = db.orders.find(o => o.id === params.get('open')) ?? null;
  const soon = todo.filter(o => daysAgo(o.targetInhouse) > -21).length;
  return <Page title="Marketing details" lede="Fill the product and marketing details while category adds the style to Enigma, so everything is sorted by the time it goes live.">
    <Stats items={[
      { label: 'To do', value: todo.length, tone: todo.length ? 'warn' : 'good' },
      { label: 'Landing in 3 weeks, not done', value: soon, tone: soon ? 'risk' : undefined },
      { label: 'Draft saved', value: todo.filter(o => o.marketing?.savedOn).length },
      { label: 'Done · ready for go-live', value: done.length, tone: 'good' },
    ]} />
    <div className="pb-3"><Seg value={view} onChange={v => set('view', v === 'todo' ? null : v)} options={[{ id: 'todo', label: 'To do', count: todo.length }, { id: 'done', label: 'Done', count: done.length }]} /></div>
    <Card className="mb-3"><div className="px-3 py-2.5 flex items-end gap-3 flex-wrap">
      <MultiFilter value={cats} onChange={setCats} label="Category" options={[{ id: 'all', label: 'Every category' }, ...catsAll.map(c => ({ id: c, label: c, count: all.filter(o => o.category === c).length }))]} />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="style, code or PO" style={{ width: 200 }} />
    </div></Card>
    {shown.length === 0 ? <Card><Empty title={view === 'todo' ? 'Nothing to do right now.' : 'Nothing done yet.'} body="A style lands here once the factories have quoted and category starts its Enigma entry." /></Card>
      : <Card><table className="t">
        <thead><tr><th>Style</th><th>Enigma</th><th>Stage</th><th>Lands</th><th>Details</th></tr></thead>
        <tbody>{shown.map(o => { const gaps = marketingGapsOf(o.marketing); const d = -daysAgo(o.targetInhouse);
          return <tr key={o.id} className="row" onClick={() => set('open', o.id)}>
            <td><div className="font-medium text-[12.5px]">{o.styleName}</div><div className="text-[11.5px]" style={faint}>{o.category}</div></td>
            <td className="text-[12px]">{o.enigmaProduct ? <><span className="mono">{o.enigmaProduct.code}</span><div style={faint}>{fmtMoney(o.enigmaProduct.mrp)}</div></> : <Pill tone="neutral">category adding it</Pill>}</td>
            <td className="text-[12px]" style={soft}>{o.status === 'Closed' || (o.receipts ?? []).length ? 'landed · ready to go live' : o.poNo ? 'being made' : o.enigmaProduct ? 'in Enigma · PO next' : 'factories quoted · going into Enigma'}</td>
            <td className="text-[12px]" style={{ whiteSpace: 'nowrap', color: d < 21 && !o.marketing?.doneOn ? 'var(--risk)' : undefined }}>{fmtDate(o.targetInhouse)}<div style={faint}>{d >= 0 ? `in ${d} d` : `${-d} d ago`}</div></td>
            <td>{o.marketing?.doneOn ? <Pill tone="good">done {fmtDate(o.marketing.doneOn)}</Pill> : o.marketing?.savedOn ? <Pill tone="info">draft · {gaps.length ? `${gaps.length} to fill` : 'ready to mark done'}</Pill> : <Pill tone="warn">not started</Pill>}</td>
          </tr>; })}</tbody></table></Card>}
    <Drawer open={!!active} onClose={() => set('open', null)} title={active?.styleName ?? ''} subtitle={active && <span>{active.category}{active.enigmaProduct ? ` · ${active.enigmaProduct.code}` : ''}</span>}>
      {active && <RtwRequirement key={active.id} o={active} initial="marketing" scope="marketing" />}
    </Drawer>
  </Page>;
}
