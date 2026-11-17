import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store';
import type { ProductionOrder, PoInvoice, FabricBy } from '../domain/types';
import { fmtDate, fmtMoney } from '../domain/engines';
import { supplyInvoicesOf, supplyLinesOf } from '../domain/rtwPack';
import { Button } from '../ui';

const faint = { color: 'var(--ink-faint)' } as const;
const soft = { color: 'var(--ink-soft)' } as const;

/* the invoice BSC raises on the factory for what it sends; BSC's own template replaces this layout in the build */
export function InvoicePreview({ o, inv, onClose }: { o: ProductionOrder; inv: PoInvoice; onClose: () => void }) {
  const { db } = useApp(); const v = db.vendors.find(x => x.id === (o.vendorId ?? o.poApproval?.vendorId));
  return createPortal(<div className="qf-back" onClick={onClose}><div className="qf" style={{ width: 'min(720px, 100%)' }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Invoice">
    <div className="qf-bar"><span className="mono text-[11px]" style={faint}>{inv.file} · BSC's invoice template goes here</span><button type="button" className="vlink" onClick={onClose}>✕ close</button></div>
    <div className="qf-body">
      <div className="flex justify-between items-start gap-4 flex-wrap"><div><div className="qf-brand">Tax invoice</div><h2 className="qf-title">Bombay Shirt Company</h2></div>
        <div className="text-[12.5px]" style={{ textAlign: 'right' }}><b className="mono">{inv.no}</b><div style={soft}>{fmtDate(inv.on)}</div>{o.poNo && <div style={soft}>against {o.poNo}</div>}</div></div>
      <div className="text-[12.5px] pt-2"><span style={faint}>Billed to </span><b>{v?.name ?? 'the factory'}</b>{v?.location ? ` · ${v.location}` : ''}<div style={soft}>{o.styleName}</div></div>
      <table className="t compact mt-3"><thead><tr><th>Item</th><th className="num">Qty</th><th>Unit</th><th className="num">Rate ₹</th><th className="num">Amount ₹</th></tr></thead>
        <tbody>{(inv.lines ?? []).map((l, i) => <tr key={i}><td className="font-medium">{l.item}</td><td className="num">{l.qty}</td><td>{l.unit}</td><td className="num">{l.rate}</td><td className="num">{fmtMoney(l.amount)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={4} style={{ textAlign: 'right' }} className="text-[12.5px]">Total</td><td className="num font-semibold">{fmtMoney(inv.amount)}</td></tr></tfoot></table>
      <div className="text-[11.5px] pt-3" style={faint}>This amount comes off what BSC pays the factory on the PO.</div>
    </div></div></div>, document.body);
}


/* the invoice generated from the BOM lines BSC sends, wherever the BOM matters: the BOM itself, counter sourcing, the PO */
export function SupplyInvoiceBar({ o, editable, className, clothBy }: { o: ProductionOrder; editable?: boolean; className?: string; clothBy?: FabricBy }) {
  const { generateSupplyInvoice } = useApp(); const [show, setShow] = useState(false);
  const inv = supplyInvoicesOf(o)[0] ?? null; const lines = supplyLinesOf(o, clothBy);
  /* the cloth choice on this screen is not saved until the PO is drafted; the invoice is then made for it */
  const pending = clothBy != null && supplyLinesOf(o).length !== lines.length; const total = lines.reduce((a, l) => a + l.amount, 0);
  return <div className={`supply-inv ${className ?? ''}`}>
    <div className="flex items-center gap-2 flex-wrap"><b className="text-[13px]">Invoice from the BOM · what BSC sends</b>
      {!lines.length ? <span className="text-[12.5px]" style={faint}>no BOM line is sent by BSC on this style, so no invoice</span>
        : inv ? <span className="text-[12.5px]"><span className="mono">{inv.no}</span> · {inv.lines?.length ?? 0} line{inv.lines?.length === 1 ? '' : 's'} · <b>{fmtMoney(inv.amount)}</b> · {fmtDate(inv.on)} <button type="button" className="vlink" onClick={() => setShow(true)}>view invoice</button>{inv.amount !== total && <span style={{ color: 'var(--warn)' }}> · BOM changed since, generate again</span>}</span>
        : <span className="text-[12.5px]" style={faint}>{total ? `not generated yet · ${lines.length} line${lines.length === 1 ? '' : 's'} · ${fmtMoney(total)}` : 'add a rate to the lines BSC sends'}</span>}
      {lines.length > 0 && <span className="ml-auto flex items-center gap-2"><span className="text-[11.5px]" style={faint}>{pending ? 'generated when the PO is raised · goes with the PO mail' : 'goes with the PO mail'}</span>{editable && !pending && <Button size="sm" variant={inv ? 'ghost' : 'primary'} disabled={!total} onClick={() => generateSupplyInvoice(o.id)}>{inv ? 'Generate again' : 'Generate the invoice'}</Button>}</span>}</div>
    {show && inv && <InvoicePreview o={o} inv={inv} onClose={() => setShow(false)} />}
  </div>;
}
