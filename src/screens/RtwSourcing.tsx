/* Sourcing on the RTW side (15 Nov 2026), two jobs and nothing else:
   1. on the requirement — when category says "we send it" or "we give the vendor", sourcing adds the cloth vendor,
      the vendor's fabric code, what is blocked, readiness and the trim vendor (part six of the requirement);
   2. after the PO — when BSC sends the cloth and trims, sourcing sends them to the factory. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { ProductionOrder } from '../domain/types';
import { fmtDate, daysAgo } from '../domain/engines';
import { packOf, packReadyOf, poFabricsOf } from '../domain/rtwPack';
import { Page, Card, Pill, Drawer, Empty, Seg, Input } from '../ui';
import { VendorLink } from './Vendors';
import { RtwRequirement } from './RtwRequirement';


export function RtwSourcing() {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };
  const view = (params.get('view') ?? 'vendors') as 'vendors' | 'send';
  const [q, setQ] = useState('');
  const match = (o: ProductionOrder) => !q.trim() || `${o.styleName} ${o.poNo ?? ''}`.toLowerCase().includes(q.trim().toLowerCase());
  const faint = { color: 'var(--ink-faint)' } as const;

  /* 1. requirements whose BOM lines still wait on a vendor from sourcing */
  const vendorRows = db.orders.filter(o => o.status === 'Requirement' && !o.poNo && o.bom.length > 0)
    .map(o => ({ o, rd: packReadyOf(o) })).filter(x => x.rd.sourcingMissing.length > 0).filter(x => match(x.o)).sort((a, b) => a.o.styleHandover.localeCompare(b.o.styleHandover));
  /* 2. POs where BSC sends the cloth and trims and they have not gone yet */
  const sendRows = db.orders.filter(o => o.status === 'Open' && o.poNo && o.fabricNominated && !o.fabricSupply?.sentToFactoryOn).filter(match).sort((a, b) => (a.poDate ?? '').localeCompare(b.poDate ?? ''));
  const active = db.orders.find(o => o.id === params.get('open')) ?? null;
  const vendorName = (id: string | null | undefined) => db.vendors.find(v => v.id === id)?.name ?? '—';

  return <Page title="Sourcing · RTW" lede="The vendors you owe against BOM lines on requirements, and the cloth and trims BSC sends to factories.">
    <div className="flex items-center gap-3 flex-wrap mb-3">
      <Seg value={view} onChange={v => set('view', v === 'vendors' ? null : v)} options={[
        { id: 'vendors', label: 'Vendors on the BOM · requirements', count: vendorRows.length, hint: 'against each BOM line: who supplies it, the vendor and the rate; add more than one option and category picks' },
        { id: 'send', label: 'Send to the factory · BSC sends', count: sendRows.length, hint: 'POs where BSC supplies the cloth and trims' },
      ]} />
      {<Input value={q} onChange={e => setQ(e.target.value)} placeholder="style or PO" style={{ width: 200 }} />}
    </div>

    {view === 'vendors' && (vendorRows.length === 0 ? <Card><Empty title="No BOM line waiting on a vendor." body="" /></Card> : <Card><table className="t">
      <thead><tr><th>Style</th><th>Fabric</th><th className="num">BOM lines</th><th>Lines waiting on a vendor</th><th>Raised</th></tr></thead>
      <tbody>{vendorRows.map(({ o, rd }) => { const p = packOf(o); const done = o.bom.filter(l => l.suppliedBy || (l.options ?? []).length).length; return <tr key={o.id} className="row" onClick={() => set('open', o.id)}>
        <td><div className="font-medium">{o.styleName}</div><div className="text-[11.5px]" style={faint}>{o.category} · {o.orderQty} pcs</div></td>
        <td className="text-[12.5px]">{p.fabric.description ?? '—'}<div className="text-[11px]" style={faint}>{p.fabric.content ?? ''}{p.fabric.widthIn ? ` · ${p.fabric.widthIn}"` : ''}</div></td>
        <td className="num"><Pill tone={done ? 'info' : 'warn'}>{done} of {o.bom.length} filled</Pill></td>
        <td className="text-[12px]" style={{ color: 'var(--warn)', whiteSpace: 'normal', maxWidth: 320 }}>{rd.sourcingMissing.map(x => x.split(':')[0]).join(' · ')}</td>
        <td className="text-[12px]" style={{ whiteSpace: 'nowrap' }}>{fmtDate(o.styleHandover)}<div className="text-[11px]" style={faint}>{daysAgo(o.styleHandover)}d ago</div></td>
      </tr>; })}</tbody>
    </table></Card>)}

    {view === 'send' && (sendRows.length === 0 ? <Card><Empty title="Nothing to send." body="" /></Card> : <Card><table className="t">
      <thead><tr><th>PO</th><th>Factory</th><th>Style</th><th>Cloth</th><th className="num">Metres</th><th>Trims</th><th>Ready</th></tr></thead>
      <tbody>{sendRows.map(o => { const p = packOf(o); const pf = poFabricsOf(o); const trims = (o.materials ?? []).filter(m => o.bom[m.bomIndex]?.kind !== 'fabric').length;
        return <tr key={o.id} className="row" onClick={() => set('open', o.id)}>
          <td className="mono text-[12.5px]" style={{ whiteSpace: 'nowrap' }}>{o.poNo}<div className="text-[11px]" style={{ ...faint, fontFamily: 'var(--body)' }}>{fmtDate(o.poDate)}</div></td>
          <td className="text-[12.5px]"><VendorLink id={o.vendorId} /></td>
          <td><div className="font-medium">{o.styleName}</div><div className="text-[11.5px]" style={faint}>{pf.all.length ? pf.all.map(f => f.colour).join(', ') : o.category}</div></td>
          <td className="text-[12.5px]">{vendorName(p.fabric.vendorId)}{p.fabric.vendorFabricCode && <div className="mono text-[11px]" style={faint}>{p.fabric.vendorFabricCode}</div>}</td>
          <td className="num">{o.fabricMetres ?? p.fabric.blockedMetres ?? '—'}</td>
          <td className="text-[12px]">{trims} line{trims === 1 ? '' : 's'}{p.fabric.trimVendorId ? <div className="text-[11px]" style={faint}>{vendorName(p.fabric.trimVendorId)}</div> : null}</td>
          <td><Pill tone={p.fabric.readiness === 'available' ? 'good' : 'warn'}>{p.fabric.readiness === 'available' ? 'available' : p.fabric.readyOn ? `ready ${fmtDate(p.fabric.readyOn)}` : 'to confirm'}</Pill></td>
        </tr>; })}</tbody>
    </table></Card>)}


    <Drawer open={!!active} onClose={() => set('open', null)} title={active?.poNo ?? active?.styleName ?? ''} subtitle={active && <span>{active.styleName} · {active.orderQty} pcs</span>}>
      {active && <RtwRequirement key={active.id} o={active} initial="pack" scope="sourcing" />}
    </Drawer>
  </Page>;
}
