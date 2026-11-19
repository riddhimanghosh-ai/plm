/* Material transfers (19 Nov 2026, second call): no invoice straight off the BOM. When the PO is raised, PLM writes a
   transfer note for the BOM lines BSC sends and it lands with Desai. He checks what he can actually send: the BOM says
   50 m, he has 25, so he types 25 and says what happens to the rest (the factory sources it, or it goes back to
   sourcing). The BOM follows. On Send, PLM makes the invoice for what went and mails it to the factory with the
   transfer note, the rest noted in the same mail. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { ProductionOrder, TransferNote, SuppliedBy } from '../domain/types';
import { fmtDate, fmtMoney, daysAgo } from '../domain/engines';
import { transfersOf, transferOpenOf, untransferredOf, supplyLinesOf, supplyInvoicesOf, transferMailOf } from '../domain/rtwPack';
import { Page, Card, Pill, Drawer, Empty, Stats, Input, Button, Section, Select, Seg, MultiFilter, passes } from '../ui';
import { RtwRequirement } from './RtwRequirement';

const faint = { color: 'var(--ink-faint)' } as const; const soft = { color: 'var(--ink-soft)' } as const;
const r2 = (n: number) => Math.round(n * 100) / 100;

/* one line wherever the BOM's material matters: where the transfer note is and whether the invoice is made */
export function TransferStatus({ o }: { o: ProductionOrder }) {
  const ts = transfersOf(o); const open = transferOpenOf(o); const later = untransferredOf(o).filter(x => x.l.restOf).length;
  if (!supplyLinesOf(o).length && !ts.length) return <span className="text-[12.5px]" style={faint}>nothing on this style is sent by BSC, so no transfer note or invoice</span>;
  if (!o.poNo) return <span className="text-[12.5px]" style={faint}>written when the PO is raised and sent to Desai; the invoice is made for what he actually sends</span>;
  return <span className="text-[12.5px] flex gap-2 flex-wrap items-center">
    {ts.map(t => <span key={t.id} className="flex gap-1.5 items-center"><span className="mono">{t.no}</span>
      {t.sentOn ? <><Pill tone="good">sent {fmtDate(t.sentOn)}{t.by ? ` · ${t.by}` : ''}</Pill>{t.invoiceNo && <span>· invoice <span className="mono">{t.invoiceNo}</span> mailed with it</span>}</> : <Pill tone="warn">with Desai · invoice on send</Pill>}</span>)}
    {later > 0 && <Pill tone="info">{later} line{later === 1 ? '' : 's'} BSC sends later</Pill>}
    {open && <a className="vlink" href={`#/transfers?open=${o.id}`}>open on Desai's screen →</a>}
  </span>;
}

/* Desai's form: what the BOM says, what he sends and from which vendor, and who supplies the rest. He changes the BOM himself. */
const REST: { value: SuppliedBy; label: string }[] = [{ value: 'bsc', label: 'BSC buys it, sends later' }, { value: 'nominated', label: 'Factory buys from a vendor' }, { value: 'factory', label: 'Factory sources it' }];
export function TransferForm({ o, t, can, onSent }: { o: ProductionOrder; t: TransferNote; can: boolean; onSent?: () => void }) {
  const { db, sendTransfer } = useApp();
  const v0 = (l: TransferNote['lines'][number]) => l.vendor ?? o.bom[l.idx]?.vendor ?? (db.vendors.find(v => v.id === (o.bom[l.idx]?.kind === 'fabric' ? o.pack?.fabric.vendorId : o.pack?.fabric.trimVendorId))?.name ?? '');
  const [rows, setRows] = useState(() => t.lines.map(l => ({ idx: l.idx, send: String(l.sendQty), vendor0: v0(l), vendor: v0(l), rest: (l.rest ?? 'bsc') as SuppliedBy, restVendor: l.restVendor ?? '', restRate: l.restRate != null ? String(l.restRate) : '', remark: l.remark ?? '' })));
  const vendorNames = db.vendors.filter(v => v.kind.endsWith('mill') || v.kind === 'Trims').map(v => v.name);
  const [dispatch, setDispatch] = useState(t.dispatch ?? '');
  const [preview, setPreview] = useState(false);
  const sent = !!t.sentOn;
  const val = (k: number) => { const n = Number(rows[k].send); return Number.isFinite(n) ? Math.max(0, Math.min(t.lines[k].bomQty, n)) : 0; };
  const total = t.lines.reduce((a, l, k) => a + Math.round((sent ? l.sendQty : val(k)) * l.rate), 0);
  const shorts = t.lines.filter((l, k) => (sent ? l.sendQty : val(k)) < l.bomQty).length;
  const draft: TransferNote = { ...t, dispatch: dispatch || null, invoiceNo: t.invoiceNo ?? 'BSC/INV/…', lines: t.lines.map((l, k) => ({ ...l, sendQty: val(k), rest: val(k) < l.bomQty ? rows[k].rest : null, restVendor: rows[k].restVendor || null, restRate: rows[k].restRate === '' ? null : Number(rows[k].restRate) })) };
  const mail = transferMailOf(db, o, sent ? t : draft);
  const set = (k: number, p: Partial<typeof rows[number]>) => setRows(rs => rs.map((r, i) => i === k ? { ...r, ...p } : r));
  return <div>
    <div className="tn-wrap"><table className="t compact tn-t">
      <thead><tr><th>Item</th><th className="num">BOM says</th><th className="num">Sending</th><th>From vendor</th><th>The rest · who supplies it</th><th className="num">On the invoice</th></tr></thead>
      <tbody>{t.lines.map((l, k) => { const line = o.bom[l.idx]; const q = sent ? l.sendQty : val(k); const short = q < l.bomQty;
        return <tr key={l.idx} className={short ? 'tn-short' : undefined}>
          <td><div className="font-medium">{l.item}</div><div className="text-[11px]" style={faint}>{line?.kind ?? ''}</div></td>
          <td className="num">{l.bomQty} {l.unit}</td>
          <td className="num">{!sent && can ? <span className="flex items-center gap-1 justify-end"><input className="input tn-in" type="number" min={0} max={l.bomQty} value={rows[k].send} onChange={e => set(k, { send: e.target.value })} /><span style={faint}>{l.unit}</span></span> : <b>{l.sendQty} {l.unit}</b>}</td>
          <td>{!sent && can ? <Input list="tn-vendors" value={rows[k].vendor} onChange={e => set(k, { vendor: e.target.value })} placeholder="vendor" style={{ width: 128 }} /> : <span className="text-[12px]">{l.vendor ?? line?.vendor ?? (rows[k].vendor0 || '—')}</span>}</td>
          <td>{!short ? <span style={faint}>—</span> : !sent && can ? <div className="tn-rest"><span className="text-[11.5px]" style={{ color: 'var(--warn)' }}>{r2(l.bomQty - q)} {l.unit}</span>
              <Select style={{ width: 196 }} value={rows[k].rest} onChange={v => set(k, { rest: v as SuppliedBy })} options={REST} />
              {rows[k].rest !== 'factory' && <span className="flex gap-1"><Input list="tn-vendors" value={rows[k].restVendor} onChange={e => set(k, { restVendor: e.target.value })} placeholder="vendor" style={{ width: 130 }} /><Input type="number" value={rows[k].restRate} onChange={e => set(k, { restRate: e.target.value })} placeholder={`₹ ${l.rate}`} style={{ width: 64 }} /></span>}<Input value={rows[k].remark} onChange={e => set(k, { remark: e.target.value })} placeholder="why short" style={{ width: 198 }} /></div>
            : <span className="text-[12px]">{r2(l.bomQty - q)} {l.unit} · {REST.find(x => x.value === l.rest)?.label ?? '—'}{l.restVendor ? ` · ${l.restVendor}` : ''}{l.restRate ? ` @ ₹${l.restRate}` : ''}{l.remark ? <span className="block" style={soft}>{l.remark}</span> : null}</span>}</td>
          <td className="num">{fmtMoney(Math.round(q * l.rate))}<div className="text-[11px]" style={faint}>@ {fmtMoney(l.rate)}</div></td>
        </tr>; })}</tbody>
      <tfoot><tr><td colSpan={4}>{shorts ? <span style={{ color: 'var(--warn)' }}>{shorts} line{shorts === 1 ? '' : 's'} short · your changes go onto the BOM on send</span> : 'Everything on the BOM · a changed vendor goes onto the BOM on send'}</td><td className="num" style={faint}>invoice</td><td className="num"><b>{fmtMoney(total)}</b></td></tr></tfoot>
    </table><datalist id="tn-vendors">{vendorNames.map(n => <option key={n} value={n} />)}</datalist></div>
    {!sent ? <div className="flex items-end gap-2 flex-wrap pt-3">
      {can && <div style={{ flex: '1 1 260px' }}><div className="cap" style={{ margin: '0 0 4px' }}>Dispatch · how it goes</div><Input value={dispatch} onChange={e => setDispatch(e.target.value)} placeholder="by road · BSC tempo · LR 4471" /></div>}
      <Button variant="ghost" onClick={() => setPreview(v => !v)}>{preview ? 'Hide the mail' : 'See the mail'}</Button>
      {can ? <Button variant="primary" onClick={() => { sendTransfer(o.id, t.id, rows.map((r, k) => ({ idx: r.idx, sendQty: val(k), vendor: r.vendor.trim() && r.vendor.trim() !== r.vendor0 ? r.vendor.trim() : null, rest: val(k) < t.lines[k].bomQty ? r.rest : null, restVendor: r.rest !== 'factory' ? (r.restVendor.trim() || null) : null, restRate: r.restRate === '' ? null : Number(r.restRate), remark: r.remark.trim() || null })), dispatch.trim() || null); onSent?.(); }}>Send · make the invoice and mail it →</Button>
        : <span className="text-[12px]" style={faint}>Desai sends it</span>}
    </div> : <div className="text-[12.5px] pt-2" style={{ color: 'var(--good)' }}>Sent {fmtDate(t.sentOn!)} by {t.by}{t.dispatch ? ` · ${t.dispatch}` : ''}. {t.invoiceNo ? `Invoice ${t.invoiceNo} made for what went and mailed to the factory with the note.` : ''} <button type="button" className="vlink" onClick={() => setPreview(v => !v)}>{preview ? 'hide the mail' : 'see the mail'}</button></div>}
    {preview && <div className="mail-card mt-2"><div className="text-[12px]"><b>To</b> {mail.to.join(', ')} · <b>Cc</b> {mail.cc.join(', ')}</div><div className="text-[12.5px] font-medium pt-1">{mail.subject}</div><pre className="text-[12px] pt-1" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{mail.body}</pre><div className="text-[11.5px] pt-1" style={faint}>Attached: {mail.attachments.join(' · ')}</div></div>}
  </div>;
}

/* on the record (the cloth step): the notes on this PO */
export function TransferSection({ o }: { o: ProductionOrder }) {
  const { role, newTransfer } = useApp(); const can = role === 'materials' || role === 'owner';
  const ts = transfersOf(o); const extra = untransferredOf(o).filter(x => o.poNo && ts.length > 0);
  if (!ts.length && !extra.length) return null;
  return <Section title="Material BSC sends · transfer note" collapsible={false} right={<span className="flex gap-2 items-center"><span className="pill role-materials">Desai</span>{transferOpenOf(o) ? <Pill tone="warn">with Desai</Pill> : <Pill tone="good">sent</Pill>}</span>}>
    {ts.map(t => <div key={t.id} className="pb-2"><div className="text-[12.5px] pb-1"><span className="mono">{t.no}</span> <span style={faint}>· written {fmtDate(t.on)} when the PO was raised</span></div><TransferForm o={o} t={t} can={can} /></div>)}
    {extra.length > 0 && <div className="text-[12.5px] pt-1 flex gap-2 items-center flex-wrap"><span>{extra.length} line{extra.length === 1 ? '' : 's'} BSC still has to send: {extra.map(x => x.l.item).join(', ')}</span>{can && <Button size="sm" variant="primary" onClick={() => newTransfer(o.id)}>Write a transfer note for {extra.length === 1 ? 'it' : 'them'}</Button>}</div>}
  </Section>;
}

/* Desai's screen */
export function Transfers() {
  const { db, role } = useApp(); const can = role === 'materials' || role === 'owner';
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };
  const view = (params.get('view') ?? 'open') as 'open' | 'sent' | 'rest';
  const [fac, setFac] = useState<string[]>([]); const [q, setQ] = useState('');
  const nameOf = (id: string | null) => db.vendors.find(v => v.id === id)?.name ?? '—';
  const rows = db.orders.flatMap(o => transfersOf(o).map(t => ({ o, t })));
  const back = db.orders.flatMap(o => o.bom.map((l, idx) => ({ o, l, idx })).filter(x => x.l.restOf)); const toSendLater = (o: ProductionOrder, idx: number) => untransferredOf(o).some(x => x.idx === idx);
  const ready = db.orders.filter(o => o.poNo && transfersOf(o).length && untransferredOf(o).length);
  const openRows = rows.filter(x => !x.t.sentOn); const sentRows = rows.filter(x => x.t.sentOn).sort((a, b) => b.t.sentOn!.localeCompare(a.t.sentOn!));
  const shown = (view === 'open' ? openRows : sentRows).filter(x => passes(fac, x.o.vendorId)).filter(x => !q.trim() || `${x.o.styleName} ${x.o.poNo} ${x.t.no} ${nameOf(x.o.vendorId)}`.toLowerCase().includes(q.trim().toLowerCase()));
  const active = db.orders.find(o => o.id === params.get('open')) ?? null; const activeT = active ? (transferOpenOf(active) ?? transfersOf(active).slice(-1)[0] ?? null) : null;
  const factories = [...new Set(rows.map(x => x.o.vendorId).filter(Boolean))] as string[];
  const [rec, setRec] = useState<string | null>(null); const recO = db.orders.find(o => o.id === rec) ?? null;
  return <Page title="Material transfers" lede="What BSC sends to factories. A transfer note lands here when a PO is raised; change what you can actually send, the vendor, and who supplies any rest; the BOM follows. Then send it. The invoice is made for what went and mailed to the factory with the note.">
    <Stats items={[
      { label: 'Transfer notes to send', value: openRows.length, tone: openRows.length ? 'warn' : 'good' },
      { label: 'Oldest waiting', value: openRows.length ? `${Math.max(...openRows.map(x => daysAgo(x.t.on)))} d` : '—', tone: openRows.some(x => daysAgo(x.t.on) > 3) ? 'risk' : undefined },
      { label: 'Rest BSC sends later', value: back.filter(x => toSendLater(x.o, x.idx)).length, tone: back.some(x => toSendLater(x.o, x.idx)) ? 'warn' : undefined },
      { label: 'Invoiced this month', value: fmtMoney(db.orders.reduce((a, o) => a + supplyInvoicesOf(o).filter(i => daysAgo(i.on) <= 30).reduce((x, i) => x + i.amount, 0), 0)) },
    ]} />
    <div className="pb-3"><Seg value={view} onChange={v => set('view', v === 'open' ? null : v)} options={[{ id: 'open', label: 'To send', count: openRows.length }, { id: 'rest', label: 'Short · the rest', count: back.length }, { id: 'sent', label: 'Sent', count: sentRows.length }]} /></div>
    <Card className="mb-3"><div className="px-3 py-2.5 flex items-end gap-3 flex-wrap">
      {view !== 'rest' && <MultiFilter value={fac} onChange={setFac} label="Factory" options={[{ id: 'all', label: 'Every factory' }, ...factories.map(id => ({ id, label: nameOf(id), count: rows.filter(x => x.o.vendorId === id && !x.t.sentOn).length }))]} />}
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="style, PO, note or factory" style={{ width: 220 }} />
    </div></Card>
    {ready.length > 0 && view === 'open' && <Card className="mb-3"><div className="px-3 py-2 text-[12.5px] flex gap-2 flex-wrap items-center"><b>Rest to send:</b>{ready.map(o => <button key={o.id} type="button" className="vlink" onClick={() => set('open', o.id)}>{o.styleName} · {untransferredOf(o).length} line{untransferredOf(o).length === 1 ? '' : 's'}</button>)}<span style={faint}>open one to write a transfer note once it is in</span></div></Card>}
    {view === 'rest' ? (back.length === 0 ? <Card><Empty title="Nothing short." body="When you send less than the BOM says, the rest and who supplies it show here." /></Card>
      : <Card><table className="t"><thead><tr><th>PO · style</th><th>Item</th><th className="num">The rest</th><th>Since</th><th>Who supplies it</th></tr></thead>
        <tbody>{back.map(({ o, l, idx }) => <tr key={`${o.id}-${idx}`} className="row" onClick={() => setRec(o.id)}>
          <td><div className="mono text-[12px]">{o.poNo}</div><div className="font-medium text-[12.5px]">{o.styleName}</div></td>
          <td className="text-[12.5px]">{l.item}</td><td className="num">{l.restOf!.qty} {l.unit}</td><td className="text-[12px]">{fmtDate(l.restOf!.on)}<div style={faint}>{l.restOf!.note}</div></td>
          <td>{l.suppliedBy === 'factory' ? <Pill tone="neutral">factory sources it</Pill> : l.suppliedBy === 'nominated' ? <Pill tone="neutral">factory buys from {l.vendor ?? 'a vendor'}</Pill> : toSendLater(o, idx) ? <Pill tone="warn">BSC buys{l.vendor ? ` from ${l.vendor}` : ''} · to send</Pill> : <Pill tone="good">sent on a later note</Pill>}</td></tr>)}</tbody></table></Card>)
    : shown.length === 0 ? <Card><Empty title={view === 'open' ? 'Nothing to send right now.' : 'Nothing sent yet.'} body={view === 'open' ? 'A transfer note lands here when a PO is raised with material BSC sends.' : ''} /></Card>
    : <Card><table className="t">
      <thead><tr><th>Transfer note</th><th>PO · style</th><th>To</th><th>What</th><th className="num">Value</th><th>{view === 'open' ? 'Waiting' : 'Sent'}</th></tr></thead>
      <tbody>{shown.map(({ o, t }) => <tr key={t.id} className="row" onClick={() => set('open', o.id)}>
        <td><div className="mono text-[12.5px]">{t.no}</div><div className="text-[11.5px]" style={faint}>{fmtDate(t.on)}</div></td>
        <td><div className="mono text-[12px]">{o.poNo}</div><div className="font-medium text-[12.5px]">{o.styleName}</div></td>
        <td className="text-[12.5px]">{nameOf(o.vendorId)}</td>
        <td className="text-[12px]" style={{ whiteSpace: 'normal', maxWidth: 300 }}>{t.lines.map(l => `${l.item} ${t.sentOn ? l.sendQty : l.bomQty} ${l.unit}`).join(' · ')}{t.sentOn && t.lines.some(l => l.sendQty < l.bomQty) && <span style={{ color: 'var(--warn)' }}> · {t.lines.filter(l => l.sendQty < l.bomQty).length} short</span>}</td>
        <td className="num">{fmtMoney(t.lines.reduce((a, l) => a + Math.round((t.sentOn ? l.sendQty : l.bomQty) * l.rate), 0))}</td>
        <td className="text-[12px]">{t.sentOn ? <>{fmtDate(t.sentOn)}{t.invoiceNo ? <div className="mono text-[11px]" style={faint}>{t.invoiceNo}</div> : null}</> : <span style={{ color: daysAgo(t.on) > 3 ? 'var(--risk)' : undefined }}>{daysAgo(t.on)} d</span>}</td>
      </tr>)}</tbody></table></Card>}
    <Drawer open={!!active} onClose={() => set('open', null)} title={active ? `${activeT?.no ?? 'Transfer'} · ${active.styleName}` : ''} subtitle={active && <span>{active.poNo} · to {nameOf(active.vendorId)} · <button type="button" className="vlink" onClick={() => setRec(active.id)}>open the record</button></span>}>
      {active && <TransferSection o={active} />}
    </Drawer>
    <Drawer open={!!recO} onClose={() => setRec(null)} title={recO?.styleName ?? ''} subtitle={recO && <span>{recO.poNo}</span>}>
      {recO && <RtwRequirement key={recO.id} o={recO} initial="cloth" />}
    </Drawer>
  </Page>;
}
