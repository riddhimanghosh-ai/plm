/* Finance · payments to make (18 Nov 2026): a queue, not a ledger. What is due to a factory now (the up-front part on its
   trigger, the balance on the payment terms), what comes later, what is paid; a payment is recorded from the row, or many
   at once from a sheet. The ledger itself is its own screen. */
import { useState } from 'react';
import readXlsxFile from 'read-excel-file';
import { useApp } from '../store';
import type { ProductionOrder } from '../domain/types';
import { fmtDate, fmtMoney } from '../domain/engines';
import { poLedgerOf, payDueOf } from '../domain/rtwPack';
import { Page, Card, Pill, Empty, Tabs, Stats, Input, Button, MultiFilter, passes, downloadXlsx } from '../ui';
import { PayDialog, FinanceDrawer, useFinanceUrl } from './Finance';

type UpRow = { poNo: string; on: string; amount: number; ref: string | null; note: string | null; match: ProductionOrder | null; problem: string | null };
const toIso = (v: unknown): string | null => { if (v instanceof Date) return v.toISOString(); const d = new Date(String(v ?? '')); return isNaN(d.getTime()) ? null : d.toISOString(); };

export function Payments() {
  const { db, addPoPayments } = useApp();
  const u = useFinanceUrl<'due' | 'later' | 'paid' | 'upload'>('due'); const view = u.tab; const set = u.set;
  const [q, setQ] = useState(''); const [facs, setFacs] = useState<string[]>([]); const [pay, setPay] = useState<ProductionOrder | null>(null);
  const nameOf = (id: string | null) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const all = db.orders.filter(o => o.poNo && o.status !== 'Cancelled').map(o => ({ o, l: poLedgerOf(o), d: payDueOf(o) }));
  const hit = (x: { o: ProductionOrder }) => passes(facs, x.o.vendorId ?? '') && (!q.trim() || `${x.o.poNo} ${x.o.styleName} ${nameOf(x.o.vendorId)}`.toLowerCase().includes(q.trim().toLowerCase()));
  const due = all.filter(x => x.d.bucket === 'due'); const later = all.filter(x => x.d.bucket === 'later'); const paid = all.filter(x => x.d.bucket === 'paid');
  const dueRows = due.filter(hit).sort((a, b) => b.d.lateDays - a.d.lateDays || b.d.dueNow - a.d.dueNow);
  const laterRows = later.filter(hit).sort((a, b) => (a.d.parts[0]?.dueOn ?? '9').localeCompare(b.d.parts[0]?.dueOn ?? '9') || b.l.remaining - a.l.remaining);
  const paidRows = paid.filter(hit).sort((a, b) => (b.o.poDate ?? '').localeCompare(a.o.poDate ?? ''));
  const late = due.filter(x => x.d.lateDays > 7);
  const active = db.orders.find(o => o.id === u.open) ?? null;
  const faint = { color: 'var(--ink-faint)' } as const; const r0 = (n: number) => fmtMoney(Math.round(n));
  const po = (o: ProductionOrder) => <td><div className="mono text-[12.5px]">{o.poNo}</div><div className="text-[11.5px]" style={faint}>{o.styleName}</div></td>;

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
  const sample = () => { const open = [...due, ...later].slice(0, 4); setDone(null); setFile('sample rows');
    setUp(open.map((x, i) => ({ poNo: x.o.poNo!, on: new Date().toISOString(), amount: Math.round(x.d.dueNow || x.l.remaining * 0.5), ref: `UTR${91000 + i}`, note: x.l.advancePending > 0 ? `${x.l.advancePct}% up front` : 'part balance', match: x.o, problem: null }))); };
  const good = up.filter(r => r.match && r.amount > 0);
  const template = () => downloadXlsx('payments-template', [{ label: 'PO number', get: (r: string[]) => r[0] }, { label: 'Payment date', get: (r: string[]) => r[1] }, { label: 'Amount', get: (r: string[]) => r[2] }, { label: 'Reference (UTR / cheque)', get: (r: string[]) => r[3] }, { label: 'Note', get: (r: string[]) => r[4] }],
    [[all[0]?.o.poNo ?? 'PO #15501', new Date().toISOString().slice(0, 10), '25000', 'UTR123456', '25% up front']], 'Payments');

  return <Page title="Payments to make" lede="What is due to factories now, what comes later, and recording what was paid.">
    <Stats items={[
      { label: 'Due now', value: r0(due.reduce((a, x) => a + x.d.dueNow, 0)), tone: due.length ? 'risk' : 'good' },
      { label: 'POs with a payment due', value: due.length, tone: due.length ? 'warn' : 'good' },
      { label: 'More than a week late', value: late.length, tone: late.length ? 'risk' : 'good' },
      { label: 'Not due yet', value: r0(all.reduce((a, x) => a + x.d.later, 0)) },
      { label: 'Paid so far', value: r0(all.reduce((a, x) => a + x.l.paid, 0)), tone: 'good' },
    ]} />
    <Tabs active={view} onChange={u.setTab} tabs={[
      { id: 'due', label: 'Due now', count: due.length, hint: 'the up-front part or the balance has fallen due' },
      { id: 'later', label: 'Not due yet', count: later.length, hint: 'still to pay, waiting on its trigger' },
      { id: 'paid', label: 'Paid in full', count: paid.length },
      { id: 'upload', label: 'Upload payments', hint: 'many payments across POs from one sheet' }]} />
    {view !== 'upload' && <Card className="mb-3"><div className="px-3 py-2.5 flex items-end gap-3 flex-wrap">
      <MultiFilter label="Factory" value={facs} onChange={setFacs} width={220} options={[{ id: 'all', label: 'Every factory' }, ...[...new Set(all.map(x => x.o.vendorId ?? ''))].filter(Boolean).map(id => ({ id, label: nameOf(id) }))]} />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="PO, style or factory" style={{ width: 210 }} />
      {view === 'due' && <span className="ml-auto text-[12px]" style={faint}>Paid many at once? <button type="button" className="vlink" onClick={() => u.setTab('upload')}>Upload the sheet</button></span>}
    </div></Card>}

    {view === 'due' && (dueRows.length === 0 ? <Card><Empty title="Nothing is due." body="" /></Card> : <Card><table className="t">
      <thead><tr><th>PO</th><th>Factory</th><th>What is due</th><th>Due since</th><th className="num">Due now</th><th className="num">Left on the PO after</th><th></th></tr></thead>
      <tbody>{dueRows.map(({ o, l, d }) => <tr key={o.id} className="row" onClick={() => u.setOpen(o.id)}>
        {po(o)}<td className="text-[12.5px]">{nameOf(o.vendorId)}</td>
        <td style={{ whiteSpace: 'normal' }}>{d.dueParts.map(x => <div key={x.key} className="text-[12.5px]"><Pill tone={x.key === 'advance' ? 'warn' : 'info'}>{x.label}</Pill> <span className="text-[11.5px]" style={faint}>{x.when}</span></div>)}</td>
        <td className="text-[12.5px]" style={{ whiteSpace: 'nowrap', color: d.lateDays > 7 ? 'var(--risk)' : undefined }}>{fmtDate(d.dueOn)}<div className="text-[11px]">{d.lateDays > 0 ? `${d.lateDays}d ago` : 'today'}</div></td>
        <td className="num font-semibold">{r0(d.dueNow)}</td>
        <td className="num" style={faint}>{r0(l.remaining - d.dueNow)}</td>
        <td style={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}><button type="button" className="cta" onClick={() => setPay(o)}>Record payment →</button></td>
      </tr>)}</tbody></table></Card>)}

    {view === 'later' && (laterRows.length === 0 ? <Card><Empty title="Nothing waiting." body="" /></Card> : <Card><table className="t">
      <thead><tr><th>PO</th><th>Factory</th><th>Falls due</th><th>Expected on</th><th className="num">To pay</th><th className="num">Paid so far</th><th></th></tr></thead>
      <tbody>{laterRows.map(({ o, l, d }) => <tr key={o.id} className="row" onClick={() => u.setOpen(o.id)}>
        {po(o)}<td className="text-[12.5px]">{nameOf(o.vendorId)}</td>
        <td style={{ whiteSpace: 'normal' }}>{d.parts.map(x => <div key={x.key} className="text-[12.5px]"><b>{x.label}</b> <span style={faint}>{x.when}</span></div>)}</td>
        <td className="text-[12.5px]">{d.parts[0]?.dueOn ? fmtDate(d.parts[0].dueOn) : <span style={faint}>{d.parts[0]?.key === 'balance' ? 'once the goods are in' : 'not known yet'}</span>}</td>
        <td className="num font-semibold">{r0(l.remaining)}</td><td className="num">{r0(l.paid)}</td>
        <td style={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}><button type="button" className="vlink text-[12px]" onClick={() => setPay(o)}>pay early</button></td>
      </tr>)}</tbody></table></Card>)}

    {view === 'paid' && (paidRows.length === 0 ? <Card><Empty title="No PO is paid in full yet." body="" /></Card> : <Card><table className="t">
      <thead><tr><th>PO</th><th>Factory</th><th className="num">Payable</th><th className="num">Paid</th><th>Payments</th><th>Last paid</th></tr></thead>
      <tbody>{paidRows.map(({ o, l }) => { const ps = [...(o.poPayments ?? [])].sort((a, b) => b.on.localeCompare(a.on));
        return <tr key={o.id} className="row" onClick={() => u.setOpen(o.id)}>
          {po(o)}<td className="text-[12.5px]">{nameOf(o.vendorId)}</td><td className="num">{r0(l.payable)}</td><td className="num font-semibold">{r0(l.paid)}</td>
          <td className="text-[12.5px]">{ps.length} · <span className="mono text-[12px]" style={faint}>{ps.map(x => x.ref).filter(Boolean).join(', ') || '—'}</span></td>
          <td className="text-[12.5px]">{ps[0] ? fmtDate(ps[0].on) : '—'}</td></tr>; })}</tbody></table></Card>)}

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
          {done != null && <span className="text-[12.5px]" style={{ color: 'var(--good)' }}>{done} payment{done === 1 ? '' : 's'} added to their POs. <button type="button" className="vlink" onClick={() => { setUp([]); setFile(''); setDone(null); u.setTab('due'); }}>See what is still due</button></span>}
        </div>
      </>}
    </div></Card>}

    <FinanceDrawer o={active} onClose={() => u.setOpen(null)} />
    {pay && <PayDialog o={pay} onClose={() => setPay(null)} />}
  </Page>;
}
