/* The cut list — every metre of extra fabric approved and waiting to be picked,
   cut and sent to a factory. It exists on paper today: the unit downloads the
   extra-fabric requests, prints them, and hands the sheet to the fabric team.
   So this screen is the sheet — filtered by day, totalled by fabric, and
   printable — and ticking a line here is what closes the request. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import { fmtDate, fmtRel, daysAgo, iso, TODAY, addDays } from '../domain/engines';
import { STORES } from '../domain/reference';
import { Card, Pill, Button, Note, Empty, Field, Input, Select, useExamples } from '../ui';
import { VendorLink } from './Vendors';
import { ActsBy } from './Who';

export function FabricOutTab() {
  const { db, role, decideExtraFabric } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace:true }); };
  const mine = role === 'warehouse' || role === 'production' || role === 'owner';
  const show = params.get('show') ?? 'topick';          // to pick · sent · everything
  const factoryF = params.get('factory') ?? 'all';
  const from = params.get('from') ?? iso(addDays(TODAY, -7)).slice(0, 10);
  const to = params.get('to') ?? iso(TODAY).slice(0, 10);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const all = (db.extraFabric ?? []).map(r => ({
    r,
    o: (db.customerOrders ?? []).find(x => x.id === r.orderId),
    f: db.fabrics.find(x => x.id === r.fabricId),
    v: db.vendors.find(x => x.id === r.factoryId),
    when: r.decidedOn ?? r.raisedOn,
  }));
  const inRange = all.filter(x => x.when.slice(0, 10) >= from && x.when.slice(0, 10) <= to);
  const rows = inRange
    .filter(x => show === 'topick' ? x.r.status === 'approved' : show === 'sent' ? x.r.status === 'sent' : x.r.status !== 'declined')
    .filter(x => factoryF === 'all' || x.r.factoryId === factoryF)
    .sort((a, b) => (a.v?.name ?? '').localeCompare(b.v?.name ?? '') || (a.f?.name ?? '').localeCompare(b.f?.name ?? ''));
  const ex = useExamples(rows, x => x.r.status, { noun: 'pieces', done: x => x.r.status === 'sent' });

  /* the cutter works off the fabric, not the order — how many metres to pull off each roll */
  const byFabric = new Map<string, { name: string; code: string; metres: number; pieces: number; shelf: number }>();
  rows.forEach(({ r, f }) => { const k = r.fabricId; const v = byFabric.get(k) ?? { name: f?.name ?? '—', code: f?.code ?? '', metres: 0, pieces: 0, shelf: f ? Math.round((f.stockMetres - f.reservedMetres) * 10) / 10 : 0 };
    v.metres = Math.round((v.metres + r.metres) * 100) / 100; v.pieces++; byFabric.set(k, v); });
  const fabrics = [...byFabric.values()].sort((a, b) => b.metres - a.metres);
  const factories = db.vendors.filter(v => v.mtm && v.kind !== 'Hemming unit');
  const store = (id?: string) => STORES.find(s => s.id === id)?.name ?? '';
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sendSelected = () => { [...sel].forEach(id => decideExtraFabric(id, 'sent')); setSel(new Set()); };
  const waiting = all.filter(x => x.r.status === 'approved');
  const oldest = waiting.length ? Math.max(...waiting.map(x => daysAgo(x.r.decidedOn ?? x.r.raisedOn))) : 0;

  return (
    <>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3 no-print">
        <div className="text-[12.5px] max-w-[70ch]" style={{ color:'var(--ink-soft)' }}>Every metre approved and waiting to be pulled off the roll, cut and put on the vehicle. Filter the day, print the sheet, and tick each line off as it goes — the tick is what tells the factory and the order it is on its way.</div>
        <div className="flex gap-2"><Button onClick={() => window.print()}>Print this sheet</Button>
          {mine && sel.size > 0 && <Button variant="primary" onClick={sendSelected}>Picked &amp; sent · {sel.size}</Button>}</div>
      </div>


      <div className="flex gap-2 items-end flex-wrap mb-3 no-print">
        <div style={{ width: 150 }}><Field label="From" hint="by the day it was approved"><Input type="date" value={from} onChange={e => set('from', e.target.value)} /></Field></div>
        <div style={{ width: 150 }}><Field label="To"><Input type="date" value={to} onChange={e => set('to', e.target.value)} /></Field></div>
        <div className="flex gap-1">{([['today', 'Today'], ['3', 'Last 3 days'], ['7', 'Last 7 days'], ['30', 'This month']] as const).map(([k, label]) =>
          <button key={k} type="button" className="btn sm" onClick={() => { const days = k === 'today' ? 0 : Number(k); const n = new URLSearchParams(params); n.set('from', iso(addDays(TODAY, -days)).slice(0, 10)); n.set('to', iso(TODAY).slice(0, 10)); setParams(n, { replace:true }); }}>{label}</button>)}</div>
        <div style={{ width: 190 }}><Field label="Factory"><Select value={factoryF} onChange={v => set('factory', v)} options={[{ value:'all', label:`All factories · ${inRange.length}` }, ...factories.map(f => ({ value:f.id, label:`${f.name} · ${inRange.filter(x => x.r.factoryId === f.id).length}` }))]} /></Field></div>
        <div style={{ width: 190 }}><Field label="Show"><Select value={show} onChange={v => set('show', v)} options={[
          { value:'topick', label:`To pick and send · ${inRange.filter(x => x.r.status === 'approved').length}` },
          { value:'sent', label:`Already sent · ${inRange.filter(x => x.r.status === 'sent').length}` },
          { value:'all', label:`Everything asked for · ${inRange.filter(x => x.r.status !== 'declined').length}` }]} /></Field></div>
        {!mine && <ActsBy role={['warehouse', 'production']} does="picks the cloth, cuts it and marks it sent" inline />}
        <div className="ml-auto pb-2">{ex.strip}</div>
      </div>

      {/* the printed header the fabric team reads at the top of the page */}
      <div className="print-only" style={{ marginBottom: 12 }}>
        <div style={{ fontFamily:'var(--display)', fontSize: 20, textTransform:'uppercase' }}>Fabric to cut & send · Bombay Shirt Company</div>
        <div style={{ fontSize: 12 }}>{fmtDate(from)} to {fmtDate(to)}{factoryF !== 'all' ? ` · ${factories.find(f => f.id === factoryF)?.name}` : ''} · {rows.length} pieces · {Math.round(rows.reduce((a, x) => a + x.r.metres, 0) * 10) / 10} m · printed {fmtDate(iso(TODAY))}</div>
      </div>

      {fabrics.length > 0 && <Card className="mb-3"><div className="px-4 py-2.5" style={{ borderBottom:'1px solid var(--line-soft)' }}><h3 className="m-0">Pull this much off each roll</h3>
        <div className="text-[11.5px] no-print" style={{ color:'var(--ink-faint)' }}>the cutter works off the fabric, not the order — one trip to the rack per fabric</div></div>
        <table className="t compact"><thead><tr><th>Fabric</th><th className="num">Pieces</th><th className="num">Total metres</th><th className="num">On the shelf</th></tr></thead>
          <tbody>{fabrics.map(f => <tr key={f.code}><td className="font-medium">{f.name}<div className="mono text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{f.code}</div></td>
            <td className="num">{f.pieces}</td><td className="num mono">{f.metres} m</td>
            <td className="num" style={{ color: f.shelf < f.metres ? 'var(--risk)' : 'var(--ink-faint)' }}>{f.shelf} m</td></tr>)}</tbody></table>
      </Card>}

      <Card><div className="px-4 py-2.5" style={{ borderBottom:'1px solid var(--line-soft)' }}><h3 className="m-0">Every piece, line by line</h3></div>
        {rows.length === 0 ? <Empty title="Nothing on this sheet." body="Change the dates, the factory, or what you are showing. A request appears here the moment production approves it." />
          : <div style={{ overflowX:'auto' }}><table className="t compact">
            <thead><tr><th className="no-print"></th><th>✓</th><th>Order</th><th>Customer · store</th><th>Fabric</th><th>Panel</th><th className="num">Metres</th><th>Factory</th><th>Why</th><th>Approved</th><th className="no-print"></th></tr></thead>
            <tbody>{ex.rows.map(({ r, o, f, v, when }) => <tr key={r.id} style={{ background: sel.has(r.id) ? 'var(--accent-soft)' : undefined }}>
              <td className="no-print">{mine && r.status === 'approved' && <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />}</td>
              <td style={{ width: 26 }}><span style={{ display:'inline-block', width: 14, height: 14, border:'1px solid var(--ink-faint)' }} /></td>
              <td className="mono text-[12.5px]">{o?.orderNo ?? '—'}<div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{(db.plans ?? []).find(p => p.id === (r.planId ?? o?.planId))?.planNo ?? ''}</div></td>
              <td className="text-[12.5px]" style={{ whiteSpace:'normal' }}>{o?.customer}<div style={{ color:'var(--ink-faint)' }}>{store(o?.storeId)}</div></td>
              <td className="text-[12.5px]" style={{ whiteSpace:'normal' }}>{f?.name}<div className="mono text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{f?.code}</div></td>
              <td className="text-[12.5px]">{r.panel}</td>
              <td className="num mono">{r.metres} m</td>
              <td className="text-[12.5px]"><span className="no-print"><VendorLink id={r.factoryId} /></span><span className="print-only">{v?.name}</span></td>
              <td className="text-[12px]" style={{ whiteSpace:'normal', maxWidth: 200 }}>{r.reason}{r.note && <div style={{ color:'var(--ink-faint)' }}>{r.note}</div>}</td>
              <td className="text-[12px]">{fmtDate(when)}<div style={{ color:'var(--ink-faint)' }}>{fmtRel(when)}</div></td>
              <td className="no-print">{r.status === 'sent' ? <Pill tone="neutral">sent</Pill>
                : mine ? <Button size="sm" variant="primary" onClick={() => decideExtraFabric(r.id, 'sent')}>Picked &amp; sent</Button> : <Pill tone="warn">to pick</Pill>}</td>
            </tr>)}</tbody>
            <tfoot><tr><td className="no-print" /><td /><td colSpan={4} className="font-medium">Total</td><td className="num mono font-medium">{Math.round(ex.rows.reduce((a, x) => a + x.r.metres, 0) * 100) / 100} m</td><td colSpan={3} /><td className="no-print" /></tr></tfoot>
          </table></div>}
      </Card>

      <div className="mt-3 no-print"><Note>"Picked &amp; sent" closes the request and shows the factory the cloth is on its way.</Note></div>
    </>
  );
}
