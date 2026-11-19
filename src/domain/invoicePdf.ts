/* The tax invoice BSC raises on a factory for the material it sends (17 Nov 2026), as a PDF. One shape for the on-screen
   view and the file: seller and buyer with GSTIN, the PO it is against, lines with HSN, taxable value, GST, total in
   words. BSC's registered details and its own template replace the placeholders in the build. */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BSC_LOGO_PNG } from './logoData';
import type { Db, ProductionOrder, PoInvoice, PoDoc } from './types';
import { poVendorsOf, poTotalsOf, rawMaterialsOf, poGroupOf } from './rtwPack';

export const SELLER = { name: 'Bombay Shirt Company Pvt. Ltd.', addr: 'Unit 4, Sun Mill Compound, Lower Parel, Mumbai 400013, Maharashtra', gstin: '27AAECB1234F1Z5', state: 'Maharashtra (27)', bank: 'HDFC Bank · A/c 5020 0012 3456 78 · IFSC HDFC0000060' };
/* GST: the same state as the buyer splits into CGST + SGST; another state is IGST */
export const BSC_STATE = 'Maharashtra';
export const STATES = ['Maharashtra', 'Gujarat', 'Tamil Nadu', 'Karnataka', 'Delhi', 'Uttar Pradesh', 'Haryana', 'Punjab', 'Rajasthan', 'West Bengal', 'Telangana', 'Madhya Pradesh', 'Outside India'];
export const GST_RATES = [0, 5, 12, 18, 28];
const CITY_STATE: [RegExp, string][] = [[/mumbai|vasai|pune|thane|kolhapur|bhiwandi|nashik/i, 'Maharashtra'], [/ahmedabad|surat|vapi/i, 'Gujarat'], [/tirupur|chennai|coimbatore|erode/i, 'Tamil Nadu'], [/bengaluru|bangalore/i, 'Karnataka'], [/delhi/i, 'Delhi'], [/noida|kanpur/i, 'Uttar Pradesh'], [/gurgaon|gurugram|faridabad/i, 'Haryana'], [/ludhiana/i, 'Punjab'], [/jaipur/i, 'Rajasthan'], [/kolkata/i, 'West Bengal'], [/hyderabad/i, 'Telangana'], [/indore/i, 'Madhya Pradesh']];
export const stateOfPlace = (place: string | null | undefined) => place ? (CITY_STATE.find(([re]) => re.test(place))?.[1] ?? 'Outside India') : BSC_STATE;
export const defaultGstOf = (kind: 'fabric' | 'trim' | 'packaging') => HSN[kind][1];
/* the tax on an amount between two states */
export function gstSplit(amount: number, pct: number, from: string | null | undefined, to: string | null | undefined) {
  const tax = Math.round(amount * pct) / 100; const intra = (from ?? BSC_STATE) === (to ?? BSC_STATE);
  return { tax, intra, label: !pct ? 'no GST' : intra ? `CGST ${pct / 2}% + SGST ${pct / 2}%` : `IGST ${pct}%` };
}
const HSN = { fabric: ['5208', 5], trim: ['9606', 12], packaging: ['4819', 12] } as const;
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n: number) => n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
const three = (n: number) => `${n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : ''}${two(n % 100)}`;
export function rupeesInWords(v: number) { let n = Math.round(v); if (!n) return 'Zero Rupees Only'; const out: string[] = [];
  const cr = Math.floor(n / 1e7); n %= 1e7; const lk = Math.floor(n / 1e5); n %= 1e5; const th = Math.floor(n / 1e3); n %= 1e3;
  if (cr) out.push(`${three(cr)} Crore`); if (lk) out.push(`${two(lk)} Lakh`); if (th) out.push(`${two(th)} Thousand`); if (n) out.push(three(n));
  return `${out.join(' ')} Rupees Only`; }

/* the invoice worked out: each line with its HSN and GST, the totals, who it is billed to */
export function invoiceDocOf(db: Db, o: ProductionOrder, inv: PoInvoice) {
  const v = db.vendors.find(x => x.id === (o.vendorId ?? o.poApproval?.vendorId)) ?? null;
  const lines = (inv.lines ?? []).map((l, i) => { const b = o.bom.find(x => x.item === l.item); const kind = b?.kind ?? 'trim'; const hsn = HSN[kind][0]; const gst = b?.gstPct ?? HSN[kind][1];
    return { sn: i + 1, item: l.item, hsn, qty: l.qty, unit: l.unit, rate: l.rate, taxable: l.amount, gstPct: gst, gst: Math.round(l.amount * gst) / 100 }; });
  const taxable = lines.reduce((a, l) => a + l.taxable, 0); const gst = Math.round(lines.reduce((a, l) => a + l.gst, 0) * 100) / 100;
  const buyerState = stateOfPlace(v?.location); const intra = buyerState === BSC_STATE;   // the factory in BSC's state: CGST + SGST; otherwise IGST
  return { seller: SELLER, buyer: { name: v?.name ?? 'The factory', addr: v ? `${v.location} · ${buyerState}` : '—', gstin: v ? `27${(v.id.toUpperCase() + 'XXXXX').replace(/[^A-Z]/g, '').slice(0, 5)}0000A1Z${v.name.length % 10}` : '—' },
    no: inv.no, on: inv.on, poNo: o.poNo ?? null, style: o.styleName, shipTo: o.poMail?.deliveryLocation ? `${v?.name ?? 'Factory'} · ${v?.location ?? ''}` : `${v?.name ?? 'Factory'} · ${v?.location ?? ''}`,
    lines, taxable, gst, intra, total: Math.round(taxable + gst), words: rupeesInWords(taxable + gst) };
}
const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export function downloadInvoicePdf(db: Db, o: ProductionOrder, inv: PoInvoice, sample = false) {
  const d = invoiceDocOf(db, o, inv); const pdf = new jsPDF({ unit: 'pt', format: 'a4' }); const W = pdf.internal.pageSize.getWidth(); const L = 40; const R = W - 40;
  /* the watermark goes down first so the invoice prints over it */
  if (sample) { pdf.setFontSize(70); pdf.setTextColor(238); pdf.setFont('helvetica', 'bold'); pdf.text('SAMPLE', W / 2, 620, { align: 'center', angle: 30 }); pdf.setTextColor(0); }
  pdf.addImage(BSC_LOGO_PNG, 'PNG', L, 34, 50, 50); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.text(d.seller.name, L + 60, 52);
  pdf.setFontSize(11); pdf.text('TAX INVOICE', R, 52, { align: 'right' });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(90);
  pdf.text(d.seller.addr, L + 60, 68); pdf.text(`GSTIN ${d.seller.gstin} · State ${d.seller.state}`, L + 60, 81);
  pdf.text(`Invoice no. ${d.no}`, R, 68, { align: 'right' }); pdf.text(`Date ${day(d.on)}`, R, 81, { align: 'right' }); if (d.poNo) pdf.text(`Against ${d.poNo}`, R, 94, { align: 'right' });
  pdf.setDrawColor(200); pdf.line(L, 104, R, 104); pdf.setTextColor(0);
  const block = (x: number, title: string, rows: string[]) => { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(120); pdf.text(title.toUpperCase(), x, 122); pdf.setTextColor(0); pdf.setFontSize(10); pdf.text(rows[0], x, 137); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); rows.slice(1).forEach((r, i) => pdf.text(r, x, 151 + i * 12)); };
  block(L, 'Billed to', [d.buyer.name, d.buyer.addr, `GSTIN ${d.buyer.gstin}`]);
  block(L + (R - L) / 2, 'Shipped to · for', [d.shipTo, d.style, 'Material supplied by BSC for the PO']);
  autoTable(pdf, { startY: 190, margin: { left: L, right: 40 }, styles: { fontSize: 8.5, cellPadding: 5 }, headStyles: { fillColor: [31, 92, 66], textColor: 255 },
    columnStyles: { 0: { cellWidth: 24 }, 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
    head: [['#', 'Description', 'HSN', 'Qty', 'Unit', 'Rate', 'Taxable value', 'GST %', 'GST']],
    body: d.lines.map(l => [l.sn, l.item, l.hsn, l.qty.toLocaleString('en-IN'), l.unit, money(l.rate), money(l.taxable), `${l.gstPct}%`, money(l.gst)]) });
  let y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  const tot = (k: string, v: string, bold = false) => { pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 10.5 : 9.5); pdf.text(k, R - 190, y); pdf.text(v, R, y, { align: 'right' }); y += 15; };
  tot('Taxable value', `Rs. ${money(d.taxable)}`);
  if (d.intra) { tot('CGST', `Rs. ${money(d.gst / 2)}`); tot('SGST', `Rs. ${money(d.gst / 2)}`); } else tot('IGST', `Rs. ${money(d.gst)}`);
  tot('Invoice total', `Rs. ${money(d.total)}`, true);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text(`Amount in words: ${d.words}`, L, y + 6, { maxWidth: R - L });
  pdf.setTextColor(90); pdf.text(['This amount is adjusted against what BSC pays the factory on the PO; no separate payment is due.', `Bank: ${d.seller.bank}`], L, y + 30);
  pdf.setTextColor(0); pdf.text(`For ${d.seller.name}`, R, y + 78, { align: 'right' }); pdf.text('Authorised signatory', R, y + 118, { align: 'right' });
  pdf.setFontSize(7.5); pdf.setTextColor(140); pdf.text('Generated by BSC PLM from the BOM lines BSC sends. GSTIN, HSN and bank details are placeholders in the prototype.', L, 800);
  pdf.save(`${d.no.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`);
}
/* a sample invoice for a style that has none yet: the BOM's own lines, as if BSC sent them, so the format can be seen */
export function sampleInvoiceOf(o: ProductionOrder): PoInvoice {
  const pcs = o.orderQty; const lines = o.bom.filter(l => l.qtyPerPc != null).slice(0, 6).map(l => { const qty = Math.round(l.qtyPerPc! * pcs * 100) / 100; const rate = l.rate ?? (l.kind === 'fabric' ? (o.pack?.fabric.rate ?? o.pack?.fabric.cpm ?? 240) : l.unit === 'pc' ? 3 : 30); return { item: l.item, qty, unit: l.unit, rate, amount: Math.round(qty * rate) }; });
  return { id: 'sample', doc: 'invoice', direction: 'bsc-to-factory', kind: 'fabric', no: 'BSC/INV/SAMPLE', amount: lines.reduce((a, l) => a + l.amount, 0), what: 'Sample invoice', file: 'BSC-INV-SAMPLE.pdf', on: new Date().toISOString(), by: 'PLM', note: 'sample', lines };
}

/* 18 Nov 2026: the vendor details that go with the PO, as their own PDF: for each vendor, what it supplies on this style,
   whether BSC sends it or the factory raises its own PO on it, and the address and contact. */
export function downloadVendorsPdf(db: Db, o: ProductionOrder) {
  const vs = poVendorsOf(db, o); const f = db.vendors.find(v => v.id === o.vendorId);
  /* the PDF's standard font has no middle dot or long dash */
  const a = (x: string) => x.replace(/\s*·\s*/g, ' - ').replace(/—/g, '-');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' }); const W = pdf.internal.pageSize.getWidth(); const L = 40; const R = W - 40;
  pdf.addImage(BSC_LOGO_PNG, 'PNG', L, 30, 50, 50); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.text(SELLER.name, L + 60, 50);
  pdf.setFontSize(11); pdf.text('VENDOR DETAILS', R, 50, { align: 'right' });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(90);
  pdf.text(SELLER.addr, L + 60, 66); pdf.text(a(`${o.poNo ?? 'PO'} - ${o.styleName}`), R, 66, { align: 'right' }); pdf.text(`For ${f?.name ?? 'the factory'}${f?.location ? `, ${f.location}` : ''}`, R, 79, { align: 'right' });
  pdf.setDrawColor(200); pdf.line(L, 90, R, 90); pdf.setTextColor(0);
  autoTable(pdf, { startY: 104, margin: { left: L, right: 40 }, styles: { fontSize: 8.5, cellPadding: 5, valign: 'top' }, headStyles: { fillColor: [31, 92, 66], textColor: 255 },
    columnStyles: { 0: { cellWidth: 120, fontStyle: 'bold' }, 1: { cellWidth: 150 }, 2: { cellWidth: 130 }, 3: { cellWidth: 170 } },
    head: [['Vendor', 'Supplies on this PO', 'How', 'Address', 'Contact', 'State / vendor code']],
    body: vs.map(v => [v.name, `${v.supplies}\n${v.items.join(', ')}`, v.how, v.address ?? 'not in the vendor database', [v.phone, v.email].filter(Boolean).join('\n') || '-', [v.state ?? (v.location ? stateOfPlace(v.location) : null), v.code].filter(Boolean).join('\n') || '-'].map(x => a(String(x)))) });
  const y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  pdf.setFontSize(9); pdf.setTextColor(90);
  pdf.text(['Material BSC sends: count it in on arrival and account for the balance.', 'Nominated vendors: raise your own PO on them and give us the PO number and receipt details through your merchandiser.', 'Anything not listed here is arranged by the factory.'], L, y);
  pdf.setFontSize(7.5); pdf.setTextColor(140); pdf.text('Generated by BSC PLM from the BOM on this PO. Addresses and contacts come from the vendor database.', L, pdf.internal.pageSize.getHeight() - 30);
  pdf.save(`vendor-details-${(o.poNo ?? o.styleName).replace(/[^A-Za-z0-9]+/g, '-')}.pdf`);
}

/* 18 Nov 2026: the PO itself as a PDF, the 'PO' attachment on the PO mail: BSC and the factory, delivery, the lines by size,
   other charges, GST and total, the commercial terms, who supplies the raw material, and a signature block. */
export function poPdfOf(db: Db, o: ProductionOrder, docIn?: PoDoc | null): jsPDF | null {
  const d = docIn ?? o.poDoc; if (!d) return null;
  const a = (x: string) => x.replace(/\s*·\s*/g, ' - ').replace(/[—–]/g, '-').replace(/₹/g, 'Rs. ');
  const f = db.vendors.find(v => v.id === (o.vendorId ?? o.poApproval?.vendorId)) ?? null; const pm = o.poMail;
  /* 19 Nov 2026: one PO can carry several styles; the PDF is then one document with every style's lines and one total */
  const grp = docIn ? null : poGroupOf(db, o);
  const items = (grp?.many ? grp.rows.map(r => ({ o: r.o, d: (r.o.poDoc ?? r.o.poApproval?.doc) ?? null })).filter((x): x is { o: ProductionOrder; d: PoDoc } => !!x.d) : [{ o, d }]);
  const many = items.length > 1; const ts = items.map(x => poTotalsOf(x.d));
  const t = { pcs: ts.reduce((x, y) => x + y.pcs, 0), value: ts.reduce((x, y) => x + y.value, 0), gst: ts.reduce((x, y) => x + y.gst, 0), total: ts.reduce((x, y) => x + y.total, 0) };
  const charges = items.flatMap(x => x.d.charges.filter(c => c.amount).map(c => ({ label: many ? `${c.label} - ${x.o.styleName}` : c.label, amount: c.amount })));
  const places = [...new Set(items.map(x => x.o.poMail?.deliveryLocation ?? x.o.deliverTo ?? (x.o.semiStitched ? 'Vasai · in-house' : '3PL warehouse')))];
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' }); const W = pdf.internal.pageSize.getWidth(); const H = pdf.internal.pageSize.getHeight(); const L = 40; const R = W - 40;
  pdf.setFillColor(31, 92, 66); pdf.rect(0, 0, W, 6, 'F');
  pdf.addImage(BSC_LOGO_PNG, 'PNG', L, 26, 50, 50); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.text(SELLER.name, L + 60, 46);
  pdf.setFontSize(13); pdf.text('PURCHASE ORDER', R, 46, { align: 'right' });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(90);
  pdf.text(SELLER.addr, L + 60, 62); pdf.text(`GSTIN ${SELLER.gstin} - State ${SELLER.state}`, L + 60, 75);
  pdf.text(a(`${o.poNo ?? 'PO (draft)'}${d.revision ? ` - revision ${d.revision}` : ''}`), R, 62, { align: 'right' }); pdf.text(`Date ${o.poDate ? day(o.poDate) : day(new Date().toISOString())}`, R, 75, { align: 'right' });
  pdf.setDrawColor(200); pdf.line(L, 86, R, 86); pdf.setTextColor(0);
  const col = (x: number, title: string, rows: string[]) => { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(120); pdf.text(title.toUpperCase(), x, 104); pdf.setTextColor(0); pdf.setFontSize(10); pdf.text(a(rows[0]), x, 119); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); rows.slice(1).forEach((r, i) => pdf.text(a(r), x, 133 + i * 12, { maxWidth: (R - L) / 3 - 10 })); };
  const third = (R - L) / 3;
  col(L, 'Factory', [f?.name ?? 'The factory', f?.location ?? '', f?.email ?? `${f?.id ?? 'factory'}@factory.in`]);
  many ? col(L + third, 'Deliver to', [places.join(' and '), places.length > 1 ? 'by style, see the lines' : '', `By ${day(items.map(x => x.o.targetInhouse).sort()[0])} onwards`]) : col(L + third, 'Deliver to', [pm?.deliveryLocation ?? (d.deliveryBasis === 'in-house' ? 'BSC warehouse' : 'Ex-factory'), pm?.needsHemming ? 'Hemming in-house' : 'Ready to sell', `By ${day(o.targetInhouse)}`]);
  many ? col(L + third * 2, 'Styles on this PO', [`${items.length} styles`, `${t.pcs} pcs in all`, `${items.reduce((x, y) => x + y.d.lines.length, 0)} lines`]) : col(L + third * 2, 'Style', [o.styleName, `${o.category} - ${o.subCategory}`, `${t.pcs} pcs - ${d.lines.length} colour${d.lines.length === 1 ? '' : 's'}`]);
  const allLines = items.flatMap(x => x.d.lines.map((l, j) => ({ l, o: x.o, first: j === 0 })));
  const sizes = [...new Set(allLines.flatMap(x => x.l.sizes.map(y => y.size)))];
  autoTable(pdf, { startY: 172, margin: { left: L, right: 40 }, styles: { fontSize: 8.5, cellPadding: 5 }, headStyles: { fillColor: [31, 92, 66], textColor: 255 },
    head: [['#', many ? 'Style - colour' : 'Colour', ...sizes, 'Pcs', 'Rate', 'Amount']],
    body: allLines.map(({ l, o: so }, i) => { const pcs = l.sizes.reduce((x, y) => x + (y.qty || 0), 0); return [String(i + 1), many ? a(`${so.styleName} - ${l.colour} (to ${so.poMail?.deliveryLocation ?? so.deliverTo ?? '3PL warehouse'}, by ${day(so.targetInhouse)})`) : l.colour, ...sizes.map(z => String(l.sizes.find(x => x.size === z)?.qty ?? '-')), String(pcs), money(l.rate), money(l.rate * pcs)]; }),
    foot: [['', 'Total', ...sizes.map(z => String(allLines.reduce((x, r) => x + (r.l.sizes.find(y => y.size === z)?.qty ?? 0), 0))), String(t.pcs), '', money(t.value)]],
    footStyles: { fillColor: [240, 240, 236], textColor: 20, fontStyle: 'bold' },
    columnStyles: Object.fromEntries([...Array(sizes.length + 3)].map((_, k) => [k + 2, { halign: 'right' }])) });
  let y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  const tot = (k: string, v: string, bold = false) => { pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 10.5 : 9.5); pdf.text(k, R - 200, y); pdf.text(v, R, y, { align: 'right' }); y += 15; };
  const ty = y; tot('Goods', `Rs. ${money(t.value)}`); charges.forEach(c => tot(a(c.label), `Rs. ${money(c.amount)}`)); tot(`GST ${d.gstPct}%`, `Rs. ${money(t.gst)}`); tot('PO total', `Rs. ${money(t.total)}`, true);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text(`In words: ${rupeesInWords(t.total)}`, L, y + 4, { maxWidth: R - L });
  autoTable(pdf, { startY: Math.max(y + 18, ty), margin: { left: L, right: 40 }, theme: 'plain', styles: { fontSize: 8.5, cellPadding: 3.5, valign: 'top' }, columnStyles: { 0: { cellWidth: 130, textColor: 110, fontStyle: 'bold' } },
    body: [
      ['Price basis', d.priceBasis], ['Payment', `${d.advancePct ? `${d.advancePct}% advance${d.advanceWhen ? ` ${d.advanceWhen}` : ''}, then ` : ''}${d.paymentTerms}`],
      many ? ['Delivery date', 'By style, as on each line'] : ['Delivery date', `${d.shipBy ? day(d.shipBy) : day(o.targetInhouse)}${d.deliveryBasis ? ` (${d.deliveryBasis === 'in-house' ? 'in-house at the warehouse' : 'ex-factory'})` : ''}`],
      ...(d.goodsExpectedBy ? [['Goods expected by', day(d.goodsExpectedBy)]] : []),
      ...(d.tolerancePct != null ? [['Quantity tolerance', `+/-${d.tolerancePct}%`]] : []), ...(d.aql ? [['AQL', d.aql]] : []), ...(d.lateDeduction ? [['Late delivery', d.lateDeduction]] : []),
      ...(d.cloth ? [['Cloth issued (CMT)', `${d.cloth.metresIssued ?? '-'} m - ${d.cloth.consumptionPerPc ?? '-'} m/pc - ${d.cloth.wastagePct ?? '-'}% wastage - ${d.cloth.leftover}`]] : []),
      ...(many ? items.map(x => [`Raw material - ${x.o.styleName}`, x.d.rawMaterialTerms ?? rawMaterialsOf(db, x.o).text]) : [['Raw material', d.rawMaterialTerms ?? rawMaterialsOf(db, o).text]]), ...(d.notes ? [['Notes', d.notes]] : []),
      ['With this PO', 'Tech pack, trim card, size break-up, BOM, TNA form (return the planned dates through your merchandiser), vendor details'],
    ].map(r => r.map(x => a(String(x)))) });
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 40;
  if (y > H - 90) { pdf.addPage(); y = 80; }
  pdf.setFontSize(9); pdf.setTextColor(0); pdf.text(`For ${SELLER.name}`, L, y); pdf.text('Accepted by the factory', R, y, { align: 'right' });
  pdf.setDrawColor(160); pdf.line(L, y + 36, L + 170, y + 36); pdf.line(R - 170, y + 36, R, y + 36);
  pdf.setTextColor(110); pdf.text('Authorised signatory', L, y + 48); pdf.text('Signature, stamp and date', R, y + 48, { align: 'right' });
  pdf.setFontSize(7.5); pdf.setTextColor(140); pdf.text('Generated by BSC PLM. GSTIN and company details are placeholders in the prototype.', L, H - 28);
  return pdf;
}
export const poPdfName = (o: ProductionOrder) => `${(o.poNo ?? 'PO-draft').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
