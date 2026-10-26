/* Enigma's receiving line on a fabric PO, as the warehouse sees it there:
   status · ordered · received · pending · a received quantity to add · close.
   The warehouse books the metres in part by part; closing with metres still
   pending cancels the balance. */
import { useState } from 'react';
import { useApp } from '../store';
import type { FabricPo } from '../domain/types';
import { fmtDate } from '../domain/engines';
import { Button, Input, Pill } from '../ui';

export function PoReceiving({ po, editable }: { po: FabricPo; editable: boolean }) {
  const { db, updateFabricPoReceiving } = useApp();
  const f = db.fabrics.find(x => x.id === po.fabricId);
  const washed = !!f?.attrs?.washed;
  const [shrinkIn, setShrinkIn] = useState(f?.attrs?.washShrinkagePct != null ? String(f.attrs.washShrinkagePct) : '');
  const shrink = washed ? (shrinkIn === '' ? 0 : Number(shrinkIn) || 0) : 0;
  const [qty, setQty] = useState('');
  const [close, setClose] = useState(false);
  const received = po.receivedMetres ?? 0;
  const pending = Math.max(0, Math.round((po.metres - received) * 100) / 100);
  const status = po.closedOn ? (po.closedShort ? 'CANCELLED' : 'RECEIVED') : received > 0 ? 'PARTIALLY RECEIVED' : 'PENDING';
  const tone = status === 'RECEIVED' ? 'good' : status === 'CANCELLED' ? 'risk' : status === 'PARTIALLY RECEIVED' ? 'info' : 'neutral';
  const canUpdate = editable && !po.closedOn && (Number(qty) > 0 || close) && (!washed || Number(qty) <= 0 || shrinkIn !== '');
  return <div className="pt-2">
    <div className="label">Receiving</div>
    <div style={{ overflowX: 'auto' }}><table className="t compact">
      <thead><tr><th>Receiving Status</th><th className="num">Ordered Quantity</th><th className="num">Total Received Quantity</th><th className="num">Pending Quantity</th><th>Received Qty</th><th>Close</th></tr></thead>
      <tbody><tr>
        <td><Pill tone={tone}>{status}</Pill>{po.closedOn && <div className="text-[10.5px]" style={{ color: 'var(--ink-faint)' }}>{fmtDate(po.closedOn)}</div>}</td>
        <td className="num">{po.metres} Meter</td>
        <td className="num">{received}</td>
        <td className="num" style={{ color: pending > 0 && po.closedShort ? 'var(--risk)' : undefined }}>{pending}</td>
        <td>{po.closedOn ? <span style={{ color: 'var(--ink-faint)' }}>—</span>
          : <div className="flex items-center gap-1"><Input type="number" min={0} max={pending} value={qty} onChange={e => setQty(e.target.value)} disabled={!editable} style={{ width: 96 }} /><span className="text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>Meter</span></div>}</td>
        <td>{po.closedOn ? <span style={{ color: 'var(--ink-faint)' }}>closed</span> : <input type="checkbox" checked={close} disabled={!editable} onChange={e => setClose(e.target.checked)} title="tick to close the line — metres still pending are cancelled" />}</td>
      </tr></tbody>
    </table></div>
    {!po.closedOn && <div className="flex items-center gap-3 pt-2 flex-wrap">
      <Button size="sm" variant="primary" disabled={!canUpdate} onClick={() => { updateFabricPoReceiving(po.id, Number(qty) || 0, close, washed && shrinkIn !== '' ? Number(shrinkIn) : null); setQty(''); setClose(false); }}>Update Receiving Status</Button>
      <span className="text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>{close && pending - (Number(qty) || 0) > 0 ? `closing cancels the ${Math.round((pending - (Number(qty) || 0)) * 100) / 100} m still pending` : 'each update raises a GRN and moves the metres from incoming to the shelf'}</span>
    </div>}
    {washed && !po.closedOn && editable && <div className="flex items-end gap-2 pt-2 flex-wrap"><div style={{ width: 170 }}><label className="block"><span className="label">Shrinkage % after washing</span><Input type="number" min={0} max={30} step={0.5} value={shrinkIn} onChange={e => setShrinkIn(e.target.value)} placeholder="e.g. 5" /></label></div>
      <span className="text-[11.5px] pb-2" style={{ color:'var(--ink-faint)' }}>washed fabric (marked on the requirement): wash a cut, then enter how much it shrank; the shelf books the usable metres</span></div>}
    {shrink > 0 && <div className="text-[11.5px] pt-1" style={{ color:'var(--warn)' }}>Washed fabric: {shrink}% shrinkage. The GRN records the metres received; the shelf books {Number(qty) > 0 ? `${Math.round(Number(qty) * (1 - shrink / 100) * 100) / 100} m of the ${qty} m` : 'the usable metres'} after washing.</div>}
    {(po.receipts ?? []).length > 0 && <div className="text-[11.5px] pt-1" style={{ color: 'var(--ink-faint)' }}>{(po.receipts ?? []).map((r, i) => <span key={i}>{i ? ' · ' : ''}{r.metres} m on {fmtDate(r.on)} by {r.by}</span>)}</div>}
  </div>;
}
