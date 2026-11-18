import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store';
import type { ProductionOrder, PoInvoice, FabricBy } from '../domain/types';
import { fmtDate, fmtMoney } from '../domain/engines';
import { supplyInvoicesOf, supplyLinesOf, bomOpenOf } from '../domain/rtwPack';
import { Button } from '../ui';
import { invoiceDocOf, downloadInvoicePdf, sampleInvoiceOf } from '../domain/invoicePdf';

const faint = { color: 'var(--ink-faint)' } as const;
const soft = { color: 'var(--ink-soft)' } as const;

/* the tax invoice BSC raises on the factory for what it sends: the same shape on screen and in the PDF */
export function InvoicePreview({ o, inv, onClose, sample }: { o: ProductionOrder; inv: PoInvoice; onClose: () => void; sample?: boolean }) {
  const { db } = useApp(); const d = invoiceDocOf(db, o, inv); const m2 = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return createPortal(<div className="qf-back" onClick={onClose}><div className="qf" style={{ width: 'min(820px, 100%)' }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Invoice">
    <div className="qf-bar"><span className="mono text-[11px]" style={faint}>{inv.file}{sample ? ' · sample' : ''}</span><span className="flex items-center gap-3"><Button size="sm" variant="primary" onClick={() => downloadInvoicePdf(db, o, inv, sample)}>↓ Download PDF</Button><button type="button" className="vlink" onClick={onClose}>✕ close</button></span></div>
    <div className="qf-body">
      <div className="flex justify-between items-start gap-4 flex-wrap"><div><h2 className="qf-title" style={{ margin: 0 }}>{d.seller.name}</h2><div className="text-[11.5px]" style={soft}>{d.seller.addr}</div><div className="text-[11.5px]" style={soft}>GSTIN <span className="mono">{d.seller.gstin}</span> · {d.seller.state}</div></div>
        <div className="text-[12.5px]" style={{ textAlign: 'right' }}><div className="qf-brand">Tax invoice{sample ? ' · sample' : ''}</div><b className="mono">{d.no}</b><div style={soft}>{fmtDate(d.on)}</div>{d.poNo && <div style={soft}>against {d.poNo}</div>}</div></div>
      <div className="grid gap-4 pt-3 mt-3 text-[12.5px]" style={{ gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--line-soft)' }}>
        <div><div className="cap">Billed to</div><b>{d.buyer.name}</b><div style={soft}>{d.buyer.addr}</div><div style={soft}>GSTIN <span className="mono">{d.buyer.gstin}</span></div></div>
        <div><div className="cap">Shipped to · for</div><b>{d.shipTo}</b><div style={soft}>{d.style}</div><div style={soft}>material supplied by BSC for the PO</div></div></div>
      <div style={{ overflowX: 'auto' }}><table className="t compact inv-lines mt-3"><thead><tr><th>#</th><th>Description</th><th>HSN</th><th className="num">Qty</th><th>Unit</th><th className="num">Rate ₹</th><th className="num">Taxable ₹</th><th className="num">GST</th><th className="num">GST ₹</th></tr></thead>
        <tbody>{d.lines.map(l => <tr key={l.sn}><td>{l.sn}</td><td className="font-medium">{l.item}</td><td className="mono text-[12px]">{l.hsn}</td><td className="num">{l.qty.toLocaleString('en-IN')}</td><td>{l.unit}</td><td className="num">{m2(l.rate)}</td><td className="num">{m2(l.taxable)}</td><td className="num">{l.gstPct}%</td><td className="num">{m2(l.gst)}</td></tr>)}</tbody></table></div>
      <div className="flex justify-between gap-4 flex-wrap pt-3">
        <div className="text-[12px]" style={{ flex: '1 1 260px', ...soft }}><b style={{ color: 'var(--ink)' }}>Amount in words</b><div>{d.words}</div><div className="pt-2">Adjusted against what BSC pays the factory on the PO; no separate payment is due.</div><div>Bank: {d.seller.bank}</div></div>
        <div className="text-[12.5px]" style={{ minWidth: 240 }}>
          <div className="flex justify-between"><span style={soft}>Taxable value</span><span className="mono">{fmtMoney(d.taxable)}</span></div>
          {d.intra ? <><div className="flex justify-between"><span style={soft}>CGST</span><span className="mono">₹{m2(d.gst / 2)}</span></div><div className="flex justify-between"><span style={soft}>SGST</span><span className="mono">₹{m2(d.gst / 2)}</span></div></> : <div className="flex justify-between"><span style={soft}>IGST</span><span className="mono">₹{m2(d.gst)}</span></div>}
          <div className="flex justify-between pt-1 mt-1" style={{ borderTop: '1px solid var(--line)' }}><b>Invoice total</b><b className="mono">{fmtMoney(d.total)}</b></div></div></div>
      <div className="text-[11px] pt-3" style={faint}>GSTIN, HSN codes, GST rates and bank details are placeholders until BSC gives its own.</div>
    </div></div></div>, document.body);
}

/* the invoice generated from the BOM lines BSC sends, wherever the BOM matters: the BOM itself, counter sourcing, the PO */
export function SupplyInvoiceBar({ o, editable, className, clothBy }: { o: ProductionOrder; editable?: boolean; className?: string; clothBy?: FabricBy }) {
  const { db, generateSupplyInvoice } = useApp(); const [show, setShow] = useState(false); const [sample, setSample] = useState(false);
  const inv = supplyInvoicesOf(o)[0] ?? null; const lines = supplyLinesOf(o, clothBy);
  /* the cloth choice on this screen is not saved until the PO is drafted; the invoice is then made for it */
  const pending = clothBy != null && supplyLinesOf(o).length !== lines.length; const total = lines.reduce((a, l) => a + l.amount, 0);
  const openN = bomOpenOf(o).open.length;
  return <div className={`supply-inv ${className ?? ''}`}>
    <div className="flex items-center gap-2 flex-wrap"><b className="text-[13px]">Invoice from the BOM · what BSC sends</b>
      {openN > 0 ? <span className="text-[12.5px]" style={{ color: 'var(--warn)' }}>waiting on the BOM · {openN} line{openN === 1 ? '' : 's'} without a vendor. The invoice is generated once every line has one.</span>
        : !lines.length ? <span className="text-[12.5px]" style={faint}>no BOM line is sent by BSC on this style, so no invoice</span>
        : inv ? <span className="text-[12.5px]"><span className="mono">{inv.no}</span> · {inv.lines?.length ?? 0} line{inv.lines?.length === 1 ? '' : 's'} · <b>{fmtMoney(inv.amount)}</b> · {fmtDate(inv.on)} <button type="button" className="vlink" onClick={() => setShow(true)}>view invoice</button> · <button type="button" className="vlink" onClick={() => downloadInvoicePdf(db, o, inv)}>↓ PDF</button>{inv.amount !== total && <span style={{ color: 'var(--warn)' }}> · BOM changed since, generate again</span>}</span>
        : <span className="text-[12.5px]" style={faint}>{total ? `not generated yet · ${lines.length} line${lines.length === 1 ? '' : 's'} · ${fmtMoney(total)}` : 'add a rate to the lines BSC sends'}</span>}
      {!inv && o.bom.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSample(true)}>Sample invoice · PDF</Button>}
      {lines.length > 0 && <span className="ml-auto flex items-center gap-2"><span className="text-[11.5px]" style={faint}>{pending ? 'generated when the PO is raised · goes with the PO mail' : 'goes with the PO mail'}</span>{editable && !pending && !openN && <Button size="sm" variant={inv ? 'ghost' : 'primary'} disabled={!total} onClick={() => generateSupplyInvoice(o.id)}>{inv ? 'Generate again' : 'Generate the invoice'}</Button>}</span>}</div>
    {show && inv && <InvoicePreview o={o} inv={inv} onClose={() => setShow(false)} />}
    {sample && <InvoicePreview o={o} inv={sampleInvoiceOf(o)} sample onClose={() => setSample(false)} />}
  </div>;
}
