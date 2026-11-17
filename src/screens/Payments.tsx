/* Finance · payments (17 Nov 2026): for every PO, what it is worth, what BSC invoiced the factory for material it
   sent, what is payable, what is paid and what is left; the up-front part still owed. And one upload of payments
   across POs — each row lands on its PO's log and the remaining payable updates by itself. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import readXlsxFile from 'read-excel-file';
import { useApp } from '../store';
import type { ProductionOrder } from '../domain/types';
import { fmtDate, fmtMoney } from '../domain/engines';
import { poLedgerOf } from '../domain/rtwPack';
import { Page, Card, Pill, Drawer, Empty, Seg, Stats, Input, Button, MultiFilter, passes, downloadXlsx } from '../ui';
import { RtwRequirement } from './RtwRequirement';

type UpRow = { poNo: string; on: string; amount: number; ref: string | null; note: string | null; match: ProductionOrder | null; problem: string | null };
const toIso = (v: unknown): string | null => { if (v instanceof Date) return v.toISOString(); const d = new Date(String(v ?? '')); return isNaN(d.getTime()) ? null : d.toISOString(); };

export function Payments() {
  const { db, addPoPayments } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };
  const view = (params.get('view') ?? 'pos') as 'pos' | 'upload';
  const [q, setQ] = useState(''); const [facs, setFacs] = useState<string[]>([]); const [st, setSt] = useState<string[]>([]);
  const nameOf = (id: string | null) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const all = db.orders.filter(o => o.poNo && o.status !== 'Cancelled').map(o => ({ o, l: poLedgerOf(o) }));
  const stateOf = (l: ReturnType<typeof poLedgerOf>) => l.remaining <= 0 ? 'paid' : l.advancePending > 0 ? 'advance' : l.paid > 0 ? 'part' : 'unpaid';
  const STATE: Record<string, [string, 'good' | 'warn' | 'risk' | 'info' | 'neutral']> = { advance: ['up-front payment due', 'risk'], unpaid: ['nothing paid yet', 'warn'], part: ['part paid', 'info'], paid: ['paid in full', 'good'] };
  const rows = all.filter(x => passes(facs, x.o.vendorId ?? '')).filter(x => passes(st, stateOf(x.l))).filter(x => !q.trim() || `${x.o.poNo} ${x.o.styleName}`.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => b.l.remaining - a.l.remaining);
  const sum = (f: (l: ReturnType<typeof poLedgerOf>) => number) => all.reduce((a, x) => a + f(x.l), 0);
  const active = db.orders.find(o => o.id === params.get('open')) ?? null;
  const faint = { color: 'var(--ink-faint)' } as const;

  /* the upload */
  const [up, setUp] = useState<UpRow[]>([]); const [file, setFile] = useState(''); const [done, setDone] = useState<number | null>(null);
  const findPo = (poNo: string) => { const k = poNo.replace(/[^0-9a-z]/gi, '').toLowerCase().replace(/^po/, ''); return k ? db.orders.find(o => o.poNo && o.poNo.replace(/[^0-9a-z]/gi, '').toLowerCase().endsWith(k)) ?? null : null; };
  const shape = (cells: unknown[][]) => cells.filter(r => r.some(c => c != null && String(c).trim() !== '')).filter(r => !/po/i.test(String(r[0] ?? '')) || /\d/.test(String(r[0] ?? ''))).map(r => {
    const poNo = String(r[0] ?? '').trim(); const on = toIso(r[1]); const amount = Number(String(r[2] ?? '').replace(/[₹,\s]/g, '')); const match = findPo(poNo);
    return { poNo, on: on ?? new Date().toISOString(), amount, ref: r[3] != null && String(r[3]).trim() ? String(r[3]).trim() : null, note: r[4] != null && String(r[4]).trim() ? String(r[4]).trim() : null, match,
      problem: !match ? 'PO not found' : !(amount > 0) ? 'no amount' : !on ? 'date not read, today used' : null } as UpRow; });
  const onFile = async (f: File | undefined) => { if (!f) return; setDone(null); setFile(f.name);
    if (/\.csv$/i.test(f.name)) { const t = await f.text(); setUp(shape(t.split(/\r?\n/).map(l => l.split(',')))); }
    else setUp(shape(await readXlsxFile(f) as unknown[][])); };
  const sample = () => { const open = all.filter(x => x.l.remaining > 0).slice(0, 4); setDone(null); setFile('sample rows');
    setUp(open.map((x, i) => ({ poNo: x.o.poNo!, on: new Date().toISOString(), amount: Math.round((x.l.advancePending > 0 ? x.l.advancePending : x.l.remaining * 0.5)), ref: `UTR${91000 + i}`, note: x.l.advancePending > 0 ? `${x.l.advancePct}% up front` : 'part balance', match: x.o, problem: null }))); };
  const good = up.filter(r => r.match && r.amount > 0);
  const template = () => downloadXlsx('payments-template', [{ label: 'PO number', get: (r: string[]) => r[0] }, { label: 'Payment date', get: (r: string[]) => r[1] }, { label: 'Amount', get: (r: string[]) => r[2] }, { label: 'Reference (UTR / cheque)', get: (r: string[]) => r[3] }, { label: 'Note', get: (r: string[]) => r[4] }],
    [[all[0]?.o.poNo ?? 'PO #15501', new Date().toISOString().slice(0, 10), '25000', 'UTR123456', '25% up front']], 'Payments');

  return <Page title="Payments" lede="What every PO is worth, what is paid and what is left; upload payments across POs in one go.">
    <Stats items={[
      { label: 'PO value', value: fmtMoney(Math.round(sum(l => l.poTotal))) },
      { label: "Less BSC's invoices", value: fmtMoney(Math.round(sum(l => l.bscInvoiced))) },
      { label: 'Paid', value: fmtMoney(Math.round(sum(l => l.paid))), tone: 'good' },
      { label: 'Remaining to pay', value: fmtMoney(Math.round(sum(l => Math.max(0, l.remaining)))), tone: 'warn' },
      { label: 'Up-front payments due', value: fmtMoney(Math.round(sum(l => l.advancePending))), tone: sum(l => l.advancePending) ? 'risk' : 'good' },
    ]} />
    <div className="mb-3"><Seg value={view} onChange={v => set('view', v === 'pos' ? null : v)} options={[{ id: 'pos', label: 'Payments by PO', count: all.length }, { id: 'upload', label: 'Upload payments' }]} /></div>

    {view === 'pos' && <>
      <Card className="mb-3"><div className="px-3 py-2.5 flex items-end gap-3 flex-wrap">
        <MultiFilter label="Status" value={st} onChange={setSt} options={[{ id: 'all', label: 'Every PO', count: all.length }, ...Object.entries(STATE).map(([k, [lab]]) => ({ id: k, label: lab, count: all.filter(x => stateOf(x.l) === k).length }))]} />
        <MultiFilter label="Factory" value={facs} onChange={setFacs} width={220} options={[{ id: 'all', label: 'Every factory' }, ...[...new Set(all.map(x => x.o.vendorId ?? ''))].filter(Boolean).map(id => ({ id, label: nameOf(id) }))]} />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="PO or style" style={{ width: 200 }} />
      </div></Card>
      {rows.length === 0 ? <Card><Empty title="Nothing matches." body="" /></Card> : <Card><table className="t">
        <thead><tr><th>PO</th><th>Factory</th><th className="num">PO total</th><th className="num">BSC invoiced</th><th className="num">Payable</th><th>Up front</th><th className="num">Paid</th><th className="num">Remaining</th><th>Status</th></tr></thead>
        <tbody>{rows.slice(0, params.get('all') === '1' ? undefined : 40).map(({ o, l }) => { const [lab, tone] = STATE[stateOf(l)];
          return <tr key={o.id} className="row" onClick={() => set('open', o.id)}>
            <td><div className="mono text-[12.5px]">{o.poNo}</div><div className="text-[11.5px]" style={faint}>{o.styleName} · {fmtDate(o.poDate)}</div></td>
            <td className="text-[12.5px]">{nameOf(o.vendorId)}</td>
            <td className="num">{fmtMoney(Math.round(l.poTotal))}</td>
            <td className="num" style={{ color: l.bscInvoiced ? undefined : 'var(--ink-faint)' }}>{l.bscInvoiced ? `− ${fmtMoney(Math.round(l.bscInvoiced))}` : '—'}</td>
            <td className="num">{fmtMoney(Math.round(l.payable))}</td>
            <td className="text-[12px]">{l.advancePct ? <span style={{ color: l.advancePending > 0 ? 'var(--risk)' : 'var(--good)' }}>{l.advancePct}% · {l.advancePending > 0 ? `${fmtMoney(l.advancePending)} due` : 'paid'}</span> : <span style={faint}>none</span>}</td>
            <td className="num">{fmtMoney(Math.round(l.paid))}</td>
            <td className="num font-semibold">{fmtMoney(Math.round(l.remaining))}</td>
            <td><Pill tone={tone}>{lab}</Pill></td>
          </tr>; })}</tbody>
      </table>
      {rows.length > 40 && params.get('all') !== '1' && <div className="px-4 py-2 text-[12px]" style={faint}>40 of {rows.length} shown · <button type="button" className="vlink" onClick={() => set('all', '1')}>show all</button></div>}
      </Card>}
    </>}

    {view === 'upload' && <Card><div className="p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="btn primary" style={{ cursor: 'pointer' }}>Choose the sheet (.xlsx or .csv)<input type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0])} /></label>
        <Button variant="ghost" onClick={template}>↓ Template</Button>
        <Button variant="ghost" onClick={sample}>Use sample rows</Button>
        {file && <span className="text-[12px]" style={faint}>{file} · {up.length} row{up.length === 1 ? '' : 's'}</span>}
      </div>
      <div className="text-[12px] pt-2" style={faint}>Columns: PO number · payment date · amount · reference · note. One row per payment.</div>
      {up.length > 0 && <>
        <table className="t compact mt-3"><thead><tr><th>PO</th><th>Factory · style</th><th>Date</th><th className="num">Amount ₹</th><th>Reference</th><th>Note</th><th className="num">Remaining after</th><th></th></tr></thead>
          <tbody>{up.map((r, i) => { const l = r.match ? poLedgerOf(r.match) : null; return <tr key={i} style={{ background: r.match && r.amount > 0 ? undefined : 'color-mix(in srgb, var(--risk) 5%, transparent)' }}>
            <td className="mono text-[12.5px]">{r.match?.poNo ?? r.poNo}</td><td className="text-[12.5px]">{r.match ? `${nameOf(r.match.vendorId)} · ${r.match.styleName}` : '—'}</td><td className="text-[12.5px]">{fmtDate(r.on)}</td>
            <td className="num">{r.amount > 0 ? fmtMoney(r.amount) : '—'}</td><td className="mono text-[12px]">{r.ref ?? '—'}</td><td className="text-[12.5px]">{r.note ?? '—'}</td>
            <td className="num">{l && r.amount > 0 ? fmtMoney(Math.round(l.remaining - r.amount)) : '—'}</td>
            <td className="text-[11.5px]" style={{ color: r.problem ? 'var(--risk)' : 'var(--good)' }}>{r.problem ?? 'ready'}</td></tr>; })}</tbody></table>
        <div className="flex items-center gap-3 pt-3">
          <Button variant="primary" disabled={!good.length || done != null} onClick={() => { const n = addPoPayments(good.map(r => ({ poNo: r.match!.poNo!, on: r.on, amount: r.amount, ref: r.ref, note: r.note }))); setDone(n); }}>Add {good.length} payment{good.length === 1 ? '' : 's'} · {fmtMoney(good.reduce((a, r) => a + r.amount, 0))}</Button>
          {up.length - good.length > 0 && <span className="text-[12px]" style={{ color: 'var(--risk)' }}>{up.length - good.length} row{up.length - good.length === 1 ? '' : 's'} will be skipped</span>}
          {done != null && <span className="text-[12.5px]" style={{ color: 'var(--good)' }}>{done} payment{done === 1 ? '' : 's'} added to their POs. <button type="button" className="vlink" onClick={() => { setUp([]); setFile(''); setDone(null); set('view', null); }}>See payments by PO</button></span>}
        </div>
      </>}
    </div></Card>}

    <Drawer open={!!active} onClose={() => set('open', null)} title={active?.poNo ?? ''} subtitle={active && <span>{active.styleName} · {nameOf(active.vendorId)}</span>}>
      {active && <RtwRequirement key={active.id} o={active} initial="invoices" scope="finance" />}
    </Drawer>
  </Page>;
}
