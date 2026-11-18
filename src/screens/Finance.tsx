/* Finance, one screen per job (18 Nov 2026). Approving a PO and paying a factory have their own screens (Approvals,
   Payments). Here: Invoices — a factory's invoice checked against the PO and the warehouse count, BSC's own invoices for
   the material it sends, and the debit and credit notes; Ledger — every PO's money, and the same rolled up by factory. */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { ProductionOrder, PoInvoice } from '../domain/types';
import { fmtDate, fmtMoney } from '../domain/engines';
import { poLedgerOf, payDueOf, poTotalsOf, packedPcsOf, supplyInvoicesOf, supplyLinesOf } from '../domain/rtwPack';
import { invoiceDocOf, downloadInvoicePdf } from '../domain/invoicePdf';
import { Page, Card, Pill, Drawer, Empty, Tabs, Stats, Input, Button, MultiFilter, passes, ExportButton, dateInput, fromDateInput } from '../ui';
import { RtwRequirement } from './RtwRequirement';
import { InvoicePreview } from './InvoicePreview';

const faint = { color: 'var(--ink-faint)' } as const;
type Tone = 'good' | 'warn' | 'risk' | 'info' | 'neutral';
const r0 = (n: number) => fmtMoney(Math.round(n));

/* the screens share the URL habits: ?tab= for the tab, ?open= for the record in the drawer */
export function useFinanceUrl<T extends string>(first: T) {
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };
  return { tab: (params.get('tab') ?? first) as T, setTab: (t: string) => set('tab', t === first ? null : t), open: params.get('open'), setOpen: (id: string | null) => set('open', id), params, set };
}
export function FinanceDrawer({ o, step, onClose }: { o: ProductionOrder | null; step?: string; onClose: () => void }) {
  const { db } = useApp();
  return <Drawer open={!!o} onClose={onClose} title={o?.poNo ?? o?.styleName ?? ''} subtitle={o && <span>{o.styleName} · {db.vendors.find(v => v.id === o.vendorId)?.name ?? ''}</span>}>
    {o && <RtwRequirement key={o.id + (step ?? '')} o={o} initial={step ?? 'invoices'} scope="finance" />}
  </Drawer>;
}

/* record one payment without leaving the list: the amount starts at what is due */
export function PayDialog({ o, onClose }: { o: ProductionOrder; onClose: () => void }) {
  const { db, addPoPayment } = useApp(); const d = payDueOf(o); const l = d.l;
  const [on, setOn] = useState(dateInput(new Date().toISOString())); const [amt, setAmt] = useState(String(Math.round(d.dueNow || l.remaining)));
  const [ref, setRef] = useState(''); const [note, setNote] = useState(d.dueParts.map(x => x.label.toLowerCase()).join(' + '));
  const n = Number(amt); const after = Math.round(l.remaining) - (n > 0 ? n : 0);
  return createPortal(<div className="qf-back" onClick={onClose}><div className="qf" style={{ width: 'min(520px, 100%)' }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Record a payment">
    <div className="qf-bar"><span className="text-[13px] font-semibold">Record a payment · <span className="mono">{o.poNo}</span></span><button type="button" className="vlink" onClick={onClose}>✕ close</button></div>
    <div className="qf-body">
      <div className="text-[12.5px] pb-2" style={faint}>{db.vendors.find(v => v.id === o.vendorId)?.name ?? '—'} · {o.styleName}</div>
      <div className="kv"><span className="k">Payable on the PO</span><span className="v">{r0(l.payable)}</span></div>
      <div className="kv"><span className="k">Paid so far</span><span className="v">{r0(l.paid)}</span></div>
      <div className="kv"><span className="k">Due now{d.dueParts.length ? ` · ${d.dueParts.map(x => x.label.toLowerCase()).join(' + ')}` : ''}</span><span className="v" style={{ color: d.dueNow ? 'var(--risk)' : undefined }}>{r0(d.dueNow)}</span></div>
      <div className="grid gap-3 pt-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="text-[12px]"><span className="label">Paid on</span><Input type="date" value={on} onChange={e => setOn(e.target.value)} style={{ width: '100%' }} /></label>
        <label className="text-[12px]"><span className="label">Amount ₹</span><Input type="number" min={0} value={amt} onChange={e => setAmt(e.target.value)} style={{ width: '100%' }} /></label>
        <label className="text-[12px]"><span className="label">Reference · UTR or cheque no.</span><Input value={ref} onChange={e => setRef(e.target.value)} placeholder="UTR123456" style={{ width: '100%' }} /></label>
        <label className="text-[12px]"><span className="label">Note</span><Input value={note} onChange={e => setNote(e.target.value)} placeholder="25% up front" style={{ width: '100%' }} /></label>
      </div>
      <div className="flex items-center gap-3 pt-4"><Button variant="primary" disabled={!(n > 0) || !on} onClick={() => { addPoPayment(o.id, { on: fromDateInput(on)!, amount: n, ref: ref.trim() || null, note: note.trim() || null }); onClose(); }}>Record {n > 0 ? r0(n) : 'the payment'}</Button>
        <span className="text-[12px]" style={{ color: after < 0 ? 'var(--risk)' : 'var(--ink-faint)' }}>{after < 0 ? `${r0(-after)} more than the PO's payable` : `${r0(after)} left on the PO after this`}</span></div>
    </div></div></div>, document.body);
}

/* ---------- Invoices ---------- */
type FacRow = { o: ProductionOrder; no: string; amount: number; on: string; file: string | null; packed: number | null; main: boolean };
export function FinanceInvoices() {
  const { db, generateSupplyInvoice } = useApp(); const u = useFinanceUrl<'factory' | 'bsc' | 'notes'>('factory');
  const [q, setQ] = useState(''); const [facs, setFacs] = useState<string[]>([]); const [st, setSt] = useState<string[]>([]);
  const [view, setView] = useState<{ o: ProductionOrder; inv: PoInvoice } | null>(null); const [pay, setPay] = useState<ProductionOrder | null>(null);
  const nameOf = (id: string | null) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const orders = db.orders.filter(o => o.poNo && o.status !== 'Cancelled');
  const hit = (o: ProductionOrder, extra = '') => passes(facs, o.vendorId ?? '') && (!q.trim() || `${o.poNo} ${o.styleName} ${extra}`.toLowerCase().includes(q.trim().toLowerCase()));

  /* a factory's invoice: against the PO's value, and the pieces against what the warehouse counted in */
  const fac: FacRow[] = orders.flatMap(o => [
    ...(o.invoice ? [{ o, no: o.invoice.no, amount: o.invoice.amount, on: o.invoice.uploadedOn, file: o.invoice.file, packed: packedPcsOf(o.invoice), main: true }] : []),
    ...(o.poInvoices ?? []).filter(i => i.direction === 'factory-to-bsc' && (i.doc ?? 'invoice') === 'invoice').map(i => ({ o, no: i.no, amount: i.amount, on: i.on, file: i.file, packed: null, main: false })) ]);
  const checkOf = (r: FacRow): { id: string; label: string; tone: Tone; note: string | null } => { const l = poLedgerOf(r.o); const over = r.amount - l.poTotal;
    if (!r.main) return { id: 'extra', label: 'extra invoice', tone: 'info', note: 'not the goods invoice; check what it is for' };
    if (over > l.poTotal * 0.01) return { id: 'over', label: `over the PO by ${r0(over)}`, tone: 'risk', note: 'ask for a credit note or a revised PO before paying' };
    if (!l.counted) return { id: 'wait', label: 'waiting on the warehouse count', tone: 'neutral', note: null };
    if (l.shortPcs > 0) return { id: 'short', label: `${l.shortPcs} pcs short received`, tone: 'warn', note: `${r0(l.shortValue)} comes off the payable` };
    return { id: 'ok', label: 'matches · OK to pay', tone: 'good', note: null }; };
  const CHECK: Record<string, string> = { over: 'over the PO', short: 'short received', wait: 'waiting on the count', ok: 'matches · OK to pay', extra: 'extra invoice' };
  const facRows = fac.map(r => ({ r, c: checkOf(r) })).filter(x => hit(x.r.o, x.r.no) && passes(st, x.c.id)).sort((a, b) => ['over', 'short', 'extra', 'wait', 'ok'].indexOf(a.c.id) - ['over', 'short', 'extra', 'wait', 'ok'].indexOf(b.c.id) || b.r.on.localeCompare(a.r.on));
  const facAll = fac.map(r => checkOf(r).id);

  /* BSC's invoices: generated from the BOM lines BSC sends */
  const bsc = orders.map(o => { const lines = supplyLinesOf(o); const inv = supplyInvoicesOf(o)[0] ?? null; const total = lines.reduce((a, l) => a + l.amount, 0);
    const state = !inv ? 'missing' : inv.amount !== total ? 'stale' : 'ok'; return { o, lines, inv, total, state, doc: inv ? invoiceDocOf(db, o, inv) : null }; }).filter(x => x.lines.length || x.inv);
  const BSC: Record<string, [string, Tone]> = { missing: ['not generated', 'risk'], stale: ['BOM changed since · generate again', 'warn'], ok: ['sent with the PO', 'good'] };
  const bscRows = bsc.filter(x => hit(x.o, x.inv?.no ?? '') && passes(st, x.state)).sort((a, b) => ['missing', 'stale', 'ok'].indexOf(a.state) - ['missing', 'stale', 'ok'].indexOf(b.state));

  /* debit and credit notes, both ways */
  const notes = orders.flatMap(o => (o.poInvoices ?? []).filter(i => i.doc && i.doc !== 'invoice').map(i => ({ o, i }))).filter(x => hit(x.o, x.i.no)).sort((a, b) => b.i.on.localeCompare(a.i.on));
  const notesAll = orders.flatMap(o => (o.poInvoices ?? []).filter(i => i.doc && i.doc !== 'invoice'));
  const active = db.orders.find(o => o.id === u.open) ?? null;
  const statusOpts = u.tab === 'factory' ? Object.entries(CHECK).map(([id, label]) => ({ id, label, count: facAll.filter(x => x === id).length })) : u.tab === 'bsc' ? Object.entries(BSC).map(([id, [label]]) => ({ id, label, count: bsc.filter(x => x.state === id).length })) : [];

  return <Page title="Invoices" lede="Factories' invoices checked against the PO and the warehouse count, BSC's own invoices for the material it sends, and the debit and credit notes.">
    <Stats items={[
      { label: "Factories' invoices to look at", value: facAll.filter(x => x === 'over' || x === 'short' || x === 'extra').length, tone: facAll.some(x => x === 'over') ? 'risk' : 'good' },
      { label: 'OK to pay', value: facAll.filter(x => x === 'ok').length, tone: 'good' },
      { label: "BSC's invoices to generate", value: bsc.filter(x => x.state !== 'ok').length, tone: bsc.some(x => x.state !== 'ok') ? 'warn' : 'good' },
      { label: "BSC's invoices raised", value: r0(bsc.reduce((a, x) => a + (x.inv?.amount ?? 0), 0)) },
      { label: 'Debit and credit notes', value: notesAll.length },
    ]} />
    <Tabs active={u.tab} onChange={t => { setSt([]); u.setTab(t); }} tabs={[
      { id: 'factory', label: 'From factories · check', count: facAll.filter(x => x !== 'ok' && x !== 'wait').length, hint: "the factory's invoice against the PO value and the pieces the warehouse counted in" },
      { id: 'bsc', label: "BSC's invoices · material sent", count: bsc.filter(x => x.state !== 'ok').length, hint: 'the tax invoice BSC raises on the factory for the BOM lines it sends' },
      { id: 'notes', label: 'Debit and credit notes', hint: 'deductions and credits logged on a PO' }]} />
    <Card className="mb-3"><div className="px-3 py-2.5 flex items-end gap-3 flex-wrap">
      {statusOpts.length > 0 && <MultiFilter label="Status" value={st} onChange={setSt} width={230} options={[{ id: 'all', label: 'Every invoice' }, ...statusOpts]} />}
      <MultiFilter label="Factory" value={facs} onChange={setFacs} width={220} options={[{ id: 'all', label: 'Every factory' }, ...[...new Set(orders.map(o => o.vendorId ?? ''))].filter(Boolean).map(id => ({ id, label: nameOf(id) }))]} />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="invoice, PO or style" style={{ width: 210 }} />
    </div></Card>

    {u.tab === 'factory' && (facRows.length === 0 ? <Card><Empty title="No invoice matches." body="" /></Card> : <Card><table className="t">
      <thead><tr><th>Invoice</th><th>PO · style</th><th>Factory</th><th className="num">Invoice ₹</th><th className="num">PO total ₹</th><th className="num">Pieces · invoiced / PO / counted in</th><th>Check</th><th></th></tr></thead>
      <tbody>{facRows.map(({ r, c }) => { const l = poLedgerOf(r.o); const d = payDueOf(r.o);
        return <tr key={r.o.id + r.no} className="row" onClick={() => u.setOpen(r.o.id)}>
          <td><div className="mono text-[12.5px]">{r.no}</div><div className="text-[11.5px]" style={faint}>{fmtDate(r.on)}{r.file ? ` · ${r.file}` : ''}</div></td>
          <td><div className="mono text-[12.5px]">{r.o.poNo}</div><div className="text-[11.5px]" style={faint}>{r.o.styleName}</div></td>
          <td className="text-[12.5px]">{nameOf(r.o.vendorId)}</td>
          <td className="num font-semibold">{r0(r.amount)}</td>
          <td className="num">{r0(l.poTotal)}</td>
          <td className="num text-[12.5px]">{r.packed ?? '—'} / {l.poPcs} / {l.counted ? <span style={{ color: l.shortPcs ? 'var(--warn)' : undefined }}>{l.receivedPcs}</span> : <span style={faint}>not yet</span>}</td>
          <td style={{ whiteSpace: 'normal' }}><Pill tone={c.tone}>{c.label}</Pill>{c.note && <div className="text-[11px] pt-0.5" style={faint}>{c.note}</div>}</td>
          <td style={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>{d.dueNow > 0 && c.id !== 'over' ? <button type="button" className="cta" onClick={() => setPay(r.o)}>Pay {r0(d.dueNow)} →</button> : l.remaining <= 0 ? <span className="text-[12px]" style={{ color: 'var(--good)' }}>paid</span> : <span className="text-[12px]" style={faint}>{c.id === 'over' ? 'hold' : 'not due yet'}</span>}</td>
        </tr>; })}</tbody></table></Card>)}

    {u.tab === 'bsc' && (bscRows.length === 0 ? <Card><Empty title="No invoice matches." body="" /></Card> : <Card><table className="t">
      <thead><tr><th>Invoice</th><th>PO · style</th><th>Billed to</th><th>What BSC sends</th><th className="num">Taxable ₹</th><th className="num">GST ₹</th><th className="num">Total ₹</th><th>Status</th><th></th></tr></thead>
      <tbody>{bscRows.map(({ o, lines, inv, total, state, doc }) => <tr key={o.id} className="row" onClick={() => u.setOpen(o.id)}>
        <td>{inv ? <><div className="mono text-[12.5px]">{inv.no}</div><div className="text-[11.5px]" style={faint}>{fmtDate(inv.on)}</div></> : <span style={faint}>—</span>}</td>
        <td><div className="mono text-[12.5px]">{o.poNo}</div><div className="text-[11.5px]" style={faint}>{o.styleName}</div></td>
        <td className="text-[12.5px]">{nameOf(o.vendorId)}</td>
        <td className="text-[12px]" style={{ whiteSpace: 'normal', maxWidth: 260 }}>{lines.map(l => l.item).join(' · ') || '—'}</td>
        <td className="num">{doc ? r0(doc.taxable) : r0(total)}</td>
        <td className="num">{doc ? <>{r0(doc.gst)}<div className="text-[11px]" style={faint}>{doc.intra ? 'CGST + SGST' : 'IGST'}</div></> : '—'}</td>
        <td className="num font-semibold">{doc ? r0(doc.total) : '—'}</td>
        <td style={{ whiteSpace: 'normal' }}><Pill tone={BSC[state][1]}>{BSC[state][0]}</Pill></td>
        <td style={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>{inv && state === 'ok' ? <><button type="button" className="vlink text-[12px]" onClick={() => setView({ o, inv })}>view</button> · <button type="button" className="vlink text-[12px]" onClick={() => downloadInvoicePdf(db, o, inv)}>↓ PDF</button></>
          : <button type="button" className="cta" disabled={!total} onClick={() => generateSupplyInvoice(o.id)}>{inv ? 'Generate again →' : 'Generate →'}</button>}</td>
      </tr>)}</tbody></table></Card>)}

    {u.tab === 'notes' && (notes.length === 0 ? <Card><Empty title="No debit or credit note logged." body="They are added on a PO, in its invoices and payments step." /></Card> : <Card><table className="t">
      <thead><tr><th>Document</th><th>No.</th><th>PO · style</th><th>Factory</th><th>What for</th><th className="num">Amount ₹</th><th>Effect on the payable</th></tr></thead>
      <tbody>{notes.map(({ o, i }) => <tr key={i.id} className="row" onClick={() => u.setOpen(o.id)}>
        <td><Pill tone={i.doc === 'credit-note' ? 'good' : i.doc === 'debit-note' ? 'risk' : 'neutral'}>{i.doc === 'credit-note' ? 'Credit note' : i.doc === 'debit-note' ? 'Debit note' : 'Other'}</Pill></td>
        <td className="mono text-[12.5px]">{i.no}<div className="text-[11.5px]" style={{ ...faint, fontFamily: 'inherit' }}>{fmtDate(i.on)}</div></td>
        <td><div className="mono text-[12.5px]">{o.poNo}</div><div className="text-[11.5px]" style={faint}>{o.styleName}</div></td>
        <td className="text-[12.5px]">{nameOf(o.vendorId)}</td>
        <td className="text-[12.5px]" style={{ whiteSpace: 'normal' }}>{i.what}{i.note ? <div className="text-[11px]" style={faint}>{i.note}</div> : null}</td>
        <td className="num font-semibold">{r0(i.amount)}</td>
        <td className="text-[12.5px]">{i.direction === 'bsc-to-factory' ? <span style={{ color: 'var(--good)' }}>− {r0(i.amount)} · BSC pays less</span> : <span style={{ color: 'var(--warn)' }}>logged · BSC pays</span>}</td>
      </tr>)}</tbody></table></Card>)}

    <FinanceDrawer o={active} onClose={() => u.setOpen(null)} />
    {view && <InvoicePreview o={view.o} inv={view.inv} onClose={() => setView(null)} />}
    {pay && <PayDialog o={pay} onClose={() => setPay(null)} />}
  </Page>;
}

/* ---------- Ledger ---------- */
export function FinanceLedger() {
  const { db } = useApp(); const u = useFinanceUrl<'po' | 'factory'>('po');
  const [q, setQ] = useState(''); const [facs, setFacs] = useState<string[]>([]); const [st, setSt] = useState<string[]>([]);
  const nameOf = (id: string | null) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const all = db.orders.filter(o => o.poNo && o.status !== 'Cancelled').map(o => ({ o, l: poLedgerOf(o) }));
  type L = ReturnType<typeof poLedgerOf>;
  const stateOf = (l: L) => l.remaining <= 0 ? 'paid' : l.advancePending > 0 ? 'advance' : l.paid > 0 ? 'part' : 'unpaid';
  const STATE: Record<string, [string, Tone]> = { advance: ['up-front payment due', 'risk'], unpaid: ['nothing paid yet', 'warn'], part: ['part paid', 'info'], paid: ['paid in full', 'good'] };
  const rows = all.filter(x => passes(facs, x.o.vendorId ?? '')).filter(x => passes(st, stateOf(x.l))).filter(x => !q.trim() || `${x.o.poNo} ${x.o.styleName}`.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => b.l.remaining - a.l.remaining);
  const sum = (xs: { l: L }[], f: (l: L) => number) => xs.reduce((a, x) => a + f(x.l), 0);
  const byFac = [...new Set(all.map(x => x.o.vendorId ?? ''))].filter(Boolean).map(id => { const xs = all.filter(x => x.o.vendorId === id);
    return { id, name: nameOf(id), pos: xs.length, open: xs.filter(x => x.l.remaining > 0).length, poTotal: sum(xs, l => l.poTotal), less: sum(xs, l => l.bscInvoiced + l.shortValue), payable: sum(xs, l => l.payable), paid: sum(xs, l => l.paid), remaining: sum(xs, l => Math.max(0, l.remaining)), advance: sum(xs, l => l.advancePending) }; })
    .filter(f => !q.trim() || f.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => b.remaining - a.remaining);
  const active = db.orders.find(o => o.id === u.open) ?? null; const showAll = u.params.get('all') === '1';

  return <Page title="Ledger" lede="What every PO is worth, what comes off it, what is paid and what is left; the same by factory."
    actions={u.tab === 'po' ? <ExportButton filename="po-ledger" sheetName="By PO" rows={rows} cols={[{ label: 'PO', get: x => x.o.poNo ?? '' }, { label: 'Style', get: x => x.o.styleName }, { label: 'Factory', get: x => nameOf(x.o.vendorId) }, { label: 'PO total', get: x => Math.round(x.l.poTotal) }, { label: 'BSC invoiced', get: x => Math.round(x.l.bscInvoiced) }, { label: 'Not received', get: x => x.l.shortValue }, { label: 'Payable', get: x => Math.round(x.l.payable) }, { label: 'Paid', get: x => Math.round(x.l.paid) }, { label: 'Remaining', get: x => Math.round(x.l.remaining) }]} />
      : <ExportButton filename="factory-ledger" sheetName="By factory" rows={byFac} cols={[{ label: 'Factory', get: f => f.name }, { label: 'POs', get: f => f.pos }, { label: 'PO value', get: f => Math.round(f.poTotal) }, { label: 'Deductions', get: f => Math.round(f.less) }, { label: 'Payable', get: f => Math.round(f.payable) }, { label: 'Paid', get: f => Math.round(f.paid) }, { label: 'Remaining', get: f => Math.round(f.remaining) }]} />}>
    <Stats items={[
      { label: 'PO value', value: r0(sum(all, l => l.poTotal)) },
      { label: "Less BSC's invoices and short receipts", value: r0(sum(all, l => l.bscInvoiced + l.shortValue)) },
      { label: 'Payable', value: r0(sum(all, l => l.payable)) },
      { label: 'Paid', value: r0(sum(all, l => l.paid)), tone: 'good' },
      { label: 'Remaining to pay', value: r0(sum(all, l => Math.max(0, l.remaining))), tone: 'warn' },
    ]} />
    <Tabs active={u.tab} onChange={u.setTab} tabs={[{ id: 'po', label: 'By PO', count: all.length }, { id: 'factory', label: 'By factory', count: byFac.length }]} />
    <Card className="mb-3"><div className="px-3 py-2.5 flex items-end gap-3 flex-wrap">
      {u.tab === 'po' && <MultiFilter label="Status" value={st} onChange={setSt} options={[{ id: 'all', label: 'Every PO', count: all.length }, ...Object.entries(STATE).map(([k, [lab]]) => ({ id: k, label: lab, count: all.filter(x => stateOf(x.l) === k).length }))]} />}
      {u.tab === 'po' && <MultiFilter label="Factory" value={facs} onChange={setFacs} width={220} options={[{ id: 'all', label: 'Every factory' }, ...[...new Set(all.map(x => x.o.vendorId ?? ''))].filter(Boolean).map(id => ({ id, label: nameOf(id) }))]} />}
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder={u.tab === 'po' ? 'PO or style' : 'factory'} style={{ width: 200 }} />
    </div></Card>

    {u.tab === 'po' && (rows.length === 0 ? <Card><Empty title="Nothing matches." body="" /></Card> : <Card><table className="t">
      <thead><tr><th>PO</th><th>Factory</th><th className="num">PO total</th><th className="num">BSC invoiced</th><th className="num">Not received</th><th className="num">Payable</th><th className="num">Paid</th><th className="num">Remaining</th><th>Status</th></tr></thead>
      <tbody>{rows.slice(0, showAll ? undefined : 40).map(({ o, l }) => { const [lab, tone] = STATE[stateOf(l)];
        return <tr key={o.id} className="row" onClick={() => u.setOpen(o.id)}>
          <td><div className="mono text-[12.5px]">{o.poNo}</div><div className="text-[11.5px]" style={faint}>{o.styleName} · {fmtDate(o.poDate)}</div></td>
          <td className="text-[12.5px]">{nameOf(o.vendorId)}</td>
          <td className="num">{r0(l.poTotal)}</td>
          <td className="num" style={{ color: l.bscInvoiced ? undefined : 'var(--ink-faint)' }}>{l.bscInvoiced ? `− ${r0(l.bscInvoiced)}` : '—'}</td>
          <td className="num" style={{ color: l.shortValue ? 'var(--risk)' : 'var(--ink-faint)' }}>{l.shortValue ? `− ${r0(l.shortValue)}` : '—'}</td>
          <td className="num">{r0(l.payable)}</td>
          <td className="num">{r0(l.paid)}</td>
          <td className="num font-semibold">{r0(l.remaining)}</td>
          <td><Pill tone={tone}>{lab}</Pill></td>
        </tr>; })}</tbody></table>
      {rows.length > 40 && !showAll && <div className="px-4 py-2 text-[12px]" style={faint}>40 of {rows.length} shown · <button type="button" className="vlink" onClick={() => u.set('all', '1')}>show all</button></div>}
    </Card>)}

    {u.tab === 'factory' && (byFac.length === 0 ? <Card><Empty title="Nothing matches." body="" /></Card> : <Card><table className="t">
      <thead><tr><th>Factory</th><th className="num">POs · open</th><th className="num">PO value</th><th className="num">Deductions</th><th className="num">Payable</th><th className="num">Paid</th><th className="num">Remaining</th><th>Up front due</th></tr></thead>
      <tbody>{byFac.map(f => <tr key={f.id} className="row" title="See this factory's POs" onClick={() => { setFacs([f.id]); setQ(''); u.setTab('po'); }}>
        <td className="font-medium">{f.name}</td>
        <td className="num">{f.pos} · {f.open}</td>
        <td className="num">{r0(f.poTotal)}</td>
        <td className="num" style={{ color: f.less ? undefined : 'var(--ink-faint)' }}>{f.less ? `− ${r0(f.less)}` : '—'}</td>
        <td className="num">{r0(f.payable)}</td>
        <td className="num">{r0(f.paid)}</td>
        <td className="num font-semibold">{r0(f.remaining)}</td>
        <td className="text-[12.5px]">{f.advance > 0 ? <span style={{ color: 'var(--risk)' }}>{r0(f.advance)}</span> : <span style={faint}>none</span>}</td>
      </tr>)}</tbody></table></Card>)}
    <FinanceDrawer o={active} onClose={() => u.setOpen(null)} />
  </Page>;
}
