/* The fabric as Enigma's fabric master holds it (its Edit Fabric Info, Edit
   Inventory, Fabric Transaction and Fabric Reservation screens, 20 Oct 2026).
   Enigma stays the master; this is the same record with the same field names,
   so what is typed here is what goes there. */
import { useState } from 'react';
import { useApp } from '../store';
import type { Fabric, FabricAttrs, FabricTxn } from '../domain/types';
import { fmtDate, fmtRel } from '../domain/engines';
import { COMPOSITION_FAMILIES } from '../domain/reference';
import { Button, Field, Input, KV, Pill, Section, Select } from '../ui';

const YESNO = [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }];
const opt = (xs: string[]) => [{ value: '', label: '—' }, ...xs.map(x => ({ value: x, label: x }))];
const ATTR_PICKS: Record<string, string[]> = {
  wrinkleResistance: ['Wrinkle Resistant', 'Easy Iron', 'Wrinkle Prone'], stretch: ['No Stretch', 'Mechanical Stretch', 'Elastane Stretch'],
  construction: ['Plain', 'Basket', 'Satin', 'Dobby'], weightClass: ['Light', 'Medium', 'Heavy'], pattern: ['Solid', 'Stripes', 'Checks', 'Print', 'Textured'],
  weave: ['Poplin', 'Plain', 'Twill', 'Oxford', 'Dobby', 'Herringbone', 'Satin', 'Seersucker'], ply: ['Single', '2-Ply'], consumedIn: ['Shirts', 'Trousers', 'Suits'],
};
/* the Dynamic Attributes block, in Enigma's own order and with its own names */
const ATTR_FIELDS: { k: keyof FabricAttrs; label: string; kind: 'text' | 'num' | 'bool' | 'pick' }[] = [
  { k: 'panna', label: 'Panna', kind: 'num' }, { k: 'bigChecked', label: 'Big-Checked', kind: 'bool' }, { k: 'threadCount', label: 'Thread Count', kind: 'text' }, { k: 'ply', label: 'Fabric Ply', kind: 'pick' },
  { k: 'wrinkleResistance', label: 'Wrinkle Resistance', kind: 'pick' }, { k: 'stretch', label: 'Stretch', kind: 'pick' }, { k: 'consumedIn', label: 'Consumed_In', kind: 'pick' }, { k: 'construction', label: 'Construction', kind: 'pick' },
  { k: 'compositionFamily', label: 'Composition family', kind: 'pick' }, { k: 'washed', label: 'Washed Fabric', kind: 'bool' }, { k: 'washcare', label: 'Washcare Description', kind: 'text' }, { k: 'weightClass', label: 'Weight Class', kind: 'pick' },
  { k: 'weaveDescription', label: 'Weave Description', kind: 'text' }, { k: 'pattern', label: 'Pattern', kind: 'pick' }, { k: 'colour', label: 'Fabric Color', kind: 'text' }, { k: 'contrastFabric', label: 'Contrast Fabric', kind: 'bool' },
  { k: 'piping', label: 'Fabric Piping', kind: 'bool' }, { k: 'isCutroll', label: 'Is_Cutroll', kind: 'bool' }, { k: 'isUniform', label: 'Is_uniform', kind: 'bool' }, { k: 'weave', label: 'Weave', kind: 'pick' },
];
const INV_TYPE = { CORE: 'MTM · core', NON_CORE: 'MTM · non-core', BESPOKE: 'Bespoke' } as const;
const TXN_TONE: Record<FabricTxn['type'], 'good' | 'info' | 'warn' | 'neutral'> = { GRN: 'good', ISSUE: 'info', ADJUSTMENT: 'warn', RETURN: 'neutral' };

export function FabricInfo({ f, editable, part = 'all', flat = false }: { f: Fabric; editable: boolean; part?: 'all' | 'info' | 'inventory'; flat?: boolean }) {
  const sec = { collapsible: !flat, defaultOpen: flat || undefined };
  const { db, updateFabricInfo, adjustFabricStock } = useApp();
  const vendor = db.vendors.find(v => v.id === f.vendorId);
  const [edit, setEdit] = useState<'info' | 'attrs' | 'inv' | null>(null);
  const [d, setD] = useState<Partial<Fabric>>({});
  const [a, setA] = useState<FabricAttrs>({});
  const [inv, setInv] = useState({ warehouse: '', threshold: '', max: '', auto: false, bin: '', binM: '' });
  const [adj, setAdj] = useState<{ open: boolean; metres: string; reason: string; desc: string; bin: string }>({ open: false, metres: '', reason: 'Physical count', desc: '', bin: '' });
  const mill = f.mill;
  const attrs = f.attrs ?? {};
  const inventory = f.inventory;

  const beginInfo = () => { setD({ name: f.name, category: f.category ?? 'Shirts', productType: f.productType ?? 'Fabric', vendorCode: f.vendorCode ?? '', composition: f.composition ?? '', onHold: f.onHold, mill: { country: mill?.country ?? '', description: mill?.description ?? vendor?.name ?? '', currency: mill?.currency ?? 'INR', costPerUnit: mill?.costPerUnit ?? f.cpm ?? null, tatHours: mill?.tatHours ?? null, moq: mill?.moq ?? null, mills: mill?.mills ?? vendor?.name ?? '' } }); setEdit('info'); };
  const saveInfo = () => { updateFabricInfo(f.id, { ...d, cpm: d.mill?.costPerUnit ?? f.cpm, widthIn: f.widthIn }); setEdit(null); };
  const beginAttrs = () => { setA({ ...attrs }); setEdit('attrs'); };
  const beginInv = () => { setInv({ warehouse: inventory?.warehouse ?? 'Dadar unit', threshold: String(inventory?.thresholdMetres ?? f.thresholdMetres), max: inventory?.maxMetres != null ? String(inventory.maxMetres) : '', auto: inventory?.autoReplenish ?? false, bin: inventory?.bins[0]?.bin ?? '', binM: inventory?.bins[0] ? String(inventory.bins[0].metres) : '' }); setEdit('inv'); };
  const saveInv = () => { updateFabricInfo(f.id, { inventory: { warehouse: inv.warehouse || 'Dadar unit', thresholdMetres: Number(inv.threshold) || 0, maxMetres: inv.max === '' ? null : Number(inv.max), autoReplenish: inv.auto, bins: inv.bin ? [{ bin: inv.bin, metres: Number(inv.binM) || f.stockMetres }] : [] }, thresholdMetres: Number(inv.threshold) || 0 }); setEdit(null); };
  const setM = (patch: Partial<NonNullable<Fabric['mill']>>) => setD(x => ({ ...x, mill: { ...(x.mill as NonNullable<Fabric['mill']>), ...patch } }));

  /* the two logs Enigma keeps — built from the records that moved the metres */
  const txns: FabricTxn[] = [
    ...(db.grns ?? []).filter(g => g.kind === 'fabric' && (g.ref === f.code || g.refLabel === f.name)).map<FabricTxn>(g => ({ on: g.receivedOn, orderNo: null, poId: g.poNo ?? g.ref, type: 'GRN', by: g.by, warehouse: inventory?.warehouse ?? 'Dadar unit', bin: inventory?.bins[0]?.bin ?? null, reason: null, desc: g.rejected ? `${g.rejected} m rejected` : null, metres: g.qty })),
    ...(db.customerOrders ?? []).filter(o => o.fabricId === f.id && ['in-factory', 'out-factory', 'rts', 'dispatched', 'ready', 'hemming', 'delivered'].includes(o.stage)).map<FabricTxn>(o => ({ on: o.punchedOn, orderNo: o.orderNo, poId: null, type: 'ISSUE', by: 'Unit', warehouse: inventory?.warehouse ?? 'Dadar unit', bin: inventory?.bins[0]?.bin ?? null, reason: null, desc: `cut for ${o.customer}`, metres: -(o.consumptionM ?? 1.7) })),
    ...(f.transactions ?? []),
  ].sort((x, y) => y.on.localeCompare(x.on));
  const reservations = (db.customerOrders ?? []).filter(o => o.fabricId === f.id && ['punched', 'pp', 'planned', 'in-transit'].includes(o.stage));

  return <>
    {part !== 'inventory' && <Section {...sec} title="Fabric info · as in Enigma" right={<span className="flex gap-1 items-center">{f.onHold && <Pill tone="risk">on hold</Pill>}{editable && edit !== 'info' && <Button size="sm" onClick={beginInfo}>Edit Fabric Info</Button>}</span>}>
      {edit === 'info' ? <>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <Field label="Fabric Name"><Input value={d.name ?? ''} onChange={e => setD({ ...d, name: e.target.value })} /></Field>
          <Field label="Inventory Type" hint="changed on the bucket row above" hintOn="label"><Input value={INV_TYPE[f.bucket]} disabled /></Field>
          <Field label="Category"><Input value={d.category ?? ''} onChange={e => setD({ ...d, category: e.target.value })} /></Field>
          <Field label="Product Type"><Input value={d.productType ?? ''} onChange={e => setD({ ...d, productType: e.target.value })} /></Field>
          <Field label="Fabric Code" hint="Enigma mints it — not edited here" hintOn="label"><Input value={f.code} disabled /></Field>
          <Field label="On Hold"><Select value={d.onHold ? 'yes' : 'no'} onChange={v => setD({ ...d, onHold: v === 'yes' })} options={YESNO} /></Field>
          <Field label="Composition"><Input value={d.composition ?? ''} onChange={e => setD({ ...d, composition: e.target.value })} /></Field>
        </div>
        <div className="label pt-3">Vendor Information</div>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <Field label="Vendor Name"><Input value={vendor?.name ?? ''} disabled /></Field>
          <Field label="Vendor Code for fabric"><Input value={d.vendorCode ?? ''} onChange={e => setD({ ...d, vendorCode: e.target.value })} /></Field>
          <Field label="Mill Country"><Input value={d.mill?.country ?? ''} onChange={e => setM({ country: e.target.value })} /></Field>
          <Field label="Mill Description"><Input value={d.mill?.description ?? ''} onChange={e => setM({ description: e.target.value })} /></Field>
          <Field label="Currency"><Select value={d.mill?.currency ?? 'INR'} onChange={v => setM({ currency: v as 'INR' | 'USD' | 'EUR' })} options={['INR', 'USD', 'EUR'].map(x => ({ value: x, label: x }))} /></Field>
          <Field label="Cost per Unit"><Input type="number" value={d.mill?.costPerUnit ?? ''} onChange={e => setM({ costPerUnit: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="TAT (hours)"><Input type="number" value={d.mill?.tatHours ?? ''} onChange={e => setM({ tatHours: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="MOQ"><Input type="number" value={d.mill?.moq ?? ''} onChange={e => setM({ moq: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="Mills"><Input value={d.mill?.mills ?? ''} onChange={e => setM({ mills: e.target.value })} /></Field>
        </div>
        <div className="flex gap-2 pt-3"><Button size="sm" variant="primary" onClick={saveInfo}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
      </> : <div>
        <div>
          <KV k="Fabric Name" v={f.name} />
          <KV k="Inventory Type" v={INV_TYPE[f.bucket]} />
          <KV k="Category · Product Type" v={`${f.category ?? 'Shirts'} · ${f.productType ?? 'Fabric'}`} />
          <KV k="Fabric Code" v={<span className="mono">{f.code}</span>} />
          <KV k="Composition" v={f.composition ?? '—'} />
          <KV k="On Hold" v={f.onHold ? 'Yes' : 'No'} />
        </div>
        <div className="label pt-2">Vendor Information</div>
        <div>
          <KV k="Vendor Name" v={vendor?.name ?? '—'} />
          <KV k="Vendor Code for fabric" v={<span className="mono">{f.vendorCode ?? '—'}</span>} />
          <KV k="Mill Country · Description" v={`${mill?.country ?? '—'} · ${mill?.description ?? vendor?.name ?? '—'}`} />
          <KV k="Cost per Unit" v={mill?.costPerUnit != null ? `${mill.currency} ${mill.costPerUnit} / m` : f.cpm ? `INR ${f.cpm} / m` : '—'} />
          <KV k="TAT · MOQ" v={`${mill?.tatHours != null ? `${mill.tatHours} h` : '—'} · ${mill?.moq != null ? `${mill.moq} m` : '—'}`} />
          <KV k="Mills" v={mill?.mills ?? vendor?.name ?? '—'} />
        </div>
      </div>}
    </Section>}

    {part !== 'inventory' && <Section {...sec} title="Dynamic attributes · shirts" right={editable && edit !== 'attrs' ? <Button size="sm" onClick={beginAttrs}>Edit</Button> : undefined}>
      {edit === 'attrs' ? <>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          {ATTR_FIELDS.map(({ k, label, kind }) => <Field key={k} label={label}>
            {kind === 'bool' ? <Select value={a[k] ? 'yes' : 'no'} onChange={v => setA({ ...a, [k]: v === 'yes' })} options={YESNO} />
              : kind === 'num' ? <Input type="number" value={(a[k] as number | null | undefined) ?? ''} onChange={e => setA({ ...a, [k]: e.target.value === '' ? null : Number(e.target.value) })} />
              : kind === 'pick' ? <Select value={(a[k] as string | null | undefined) ?? ''} onChange={v => setA({ ...a, [k]: v || null })} options={opt(k === 'compositionFamily' ? COMPOSITION_FAMILIES : ATTR_PICKS[k] ?? [])} />
              : <Input value={(a[k] as string | null | undefined) ?? ''} onChange={e => setA({ ...a, [k]: e.target.value || null })} />}
          </Field>)}
        </div>
        <div className="flex gap-2 pt-3"><Button size="sm" variant="primary" onClick={() => { updateFabricInfo(f.id, { attrs: a, widthIn: a.panna ?? f.widthIn }); setEdit(null); }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
        {a.bigChecked && <div className="text-[11.5px] pt-2" style={{ color: 'var(--warn)' }}>Big-Checked: the pattern is matched in cutting, so consumption on the order sheet goes up.</div>}
      </> : <div>
        {[ATTR_FIELDS].map((col, i) => <div key={i}>{col.map(({ k, label, kind }) => {
          const v = attrs[k]; const text = kind === 'bool' ? (v ? 'Yes' : 'No') : v == null || v === '' ? '—' : String(v);
          return <KV key={k} k={label} v={k === 'bigChecked' && v ? <Pill tone="warn">Yes · matched in cutting</Pill> : text} />; })}</div>)}
      </div>}
    </Section>}

    {part !== 'info' && <Section {...sec} title="Inventory" right={<span className="flex gap-1 items-center"><Pill tone={f.stockMetres <= f.thresholdMetres ? 'warn' : 'good'}>{f.stockMetres} m</Pill>{editable && edit !== 'inv' && <Button size="sm" onClick={beginInv}>Edit Inventory</Button>}</span>}>
      {edit === 'inv' ? <>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <Field label="Warehouse"><Input value={inv.warehouse} onChange={e => setInv({ ...inv, warehouse: e.target.value })} /></Field>
          <Field label="Threshold" hint="metres — Enigma's reorder floor" hintOn="label"><Input type="number" value={inv.threshold} onChange={e => setInv({ ...inv, threshold: e.target.value })} /></Field>
          <Field label="Max Inventory"><Input type="number" value={inv.max} onChange={e => setInv({ ...inv, max: e.target.value })} /></Field>
          <Field label="Is Auto Replenishment"><Select value={inv.auto ? 'yes' : 'no'} onChange={v => setInv({ ...inv, auto: v === 'yes' })} options={YESNO} /></Field>
          <Field label="Bin"><Input value={inv.bin} onChange={e => setInv({ ...inv, bin: e.target.value })} placeholder="R3-B" /></Field>
          <Field label="Metres in bin"><Input type="number" value={inv.binM} onChange={e => setInv({ ...inv, binM: e.target.value })} /></Field>
        </div>
        <div className="flex gap-2 pt-3"><Button size="sm" variant="primary" onClick={saveInv}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
      </> : <div>
        <div>
          <KV k="Warehouse" v={inventory?.warehouse ?? 'Dadar unit'} />
          <KV k="Threshold" v={`${f.thresholdMetres} m`} note={f.stockMetres <= f.thresholdMetres ? 'under it — the auto-PO fires, or sourcing raises one' : undefined} />
          <KV k="Max Inventory" v={inventory?.maxMetres != null ? `${inventory.maxMetres} m` : '—'} />
          <KV k="Is Auto Replenishment" v={inventory?.autoReplenish ? 'Yes' : 'No'} note={f.international ? 'international — Enigma does not auto-PO it' : undefined} />
        </div>
        <div>
          <KV k="On the shelf" v={`${f.stockMetres} m`} />
          <KV k="Reserved" v={`${f.reservedMetres} m`} note="punched orders not yet cut" />
          <KV k="On order" v={`${f.incomingMetres ?? 0} m`} />
          <KV k="Bins" v={inventory?.bins.length ? inventory.bins.map(b => `${b.bin} · ${b.metres} m`).join(', ') : '—'} />
        </div>
      </div>}
      {editable && edit !== 'inv' && <div className="pt-2">
        {!adj.open ? <Button size="sm" variant="ghost" onClick={() => setAdj({ ...adj, open: true, bin: inventory?.bins[0]?.bin ?? '' })}>Adjust stock…</Button>
          : <div className="p-3" style={{ background: 'var(--accent-soft)', borderRadius: 8 }}>
            <div className="grid gap-2.5 items-end" style={{ gridTemplateColumns: '110px 170px 1fr 100px' }}>
              <Field label="Metres (±)"><Input type="number" value={adj.metres} onChange={e => setAdj({ ...adj, metres: e.target.value })} placeholder="-6" /></Field>
              <Field label="Adjustment Reason"><Select value={adj.reason} onChange={v => setAdj({ ...adj, reason: v })} options={['Physical count', 'Damaged roll', 'Shade variation', 'Sample cut', 'Found stock', 'Other'].map(x => ({ value: x, label: x }))} /></Field>
              <Field label="Adjustment Description"><Input value={adj.desc} onChange={e => setAdj({ ...adj, desc: e.target.value })} placeholder="count differed by one roll" /></Field>
              <Field label="Bin"><Input value={adj.bin} onChange={e => setAdj({ ...adj, bin: e.target.value })} /></Field>
            </div>
            <div className="flex gap-2 pt-2"><Button size="sm" variant="primary" disabled={!Number(adj.metres)} onClick={() => { adjustFabricStock(f.id, Number(adj.metres), adj.reason, adj.desc.trim(), adj.bin || null); setAdj({ open: false, metres: '', reason: 'Physical count', desc: '', bin: '' }); }}>Save adjustment</Button><Button size="sm" variant="ghost" onClick={() => setAdj({ ...adj, open: false })}>Cancel</Button></div>
          </div>}
      </div>}
    </Section>}

    {part !== 'info' && <Section {...sec} title="Fabric transactions" right={<Pill tone="neutral">{txns.length}</Pill>}>
      {txns.length === 0 ? <div className="text-[12.5px] py-1" style={{ color: 'var(--ink-faint)' }}>No movement yet — a GRN, a cut or an adjustment writes a line here.</div>
        : <div style={{ overflowX: 'auto' }}><table className="t compact">
          <thead><tr><th>Date</th><th>Order</th><th>PO</th><th>Type</th><th>Created by</th><th>Warehouse · bin</th><th>Reason · description</th><th className="num">Qty</th></tr></thead>
          <tbody>{txns.slice(0, 40).map((t, i) => <tr key={i}>
            <td className="text-[12px]">{fmtDate(t.on)}<div style={{ color: 'var(--ink-faint)' }}>{fmtRel(t.on)}</div></td>
            <td className="mono text-[11.5px]">{t.orderNo ?? '—'}</td>
            <td className="mono text-[11.5px]">{t.poId ?? '—'}</td>
            <td><Pill tone={TXN_TONE[t.type]}>{t.type}</Pill></td>
            <td className="text-[12px]">{t.by}</td>
            <td className="text-[12px]">{t.warehouse}{t.bin ? ` · ${t.bin}` : ''}</td>
            <td className="text-[12px]" style={{ whiteSpace: 'normal' }}>{t.reason ?? ''}{t.reason && t.desc ? ' · ' : ''}{t.desc ?? ''}</td>
            <td className="num mono" style={{ color: t.metres < 0 ? 'var(--risk)' : 'var(--good)' }}>{t.metres > 0 ? '+' : ''}{t.metres} m</td>
          </tr>)}</tbody>
        </table></div>}
    </Section>}

    {part !== 'info' && <Section {...sec} title="Fabric reservations" right={<Pill tone={reservations.length ? 'info' : 'neutral'}>{reservations.length}</Pill>}>
      {reservations.length === 0 ? <div className="text-[12.5px] py-1" style={{ color: 'var(--ink-faint)' }}>Nothing reserved — no punched order on this fabric is waiting to be cut.</div>
        : <div style={{ overflowX: 'auto' }}><table className="t compact">
          <thead><tr><th>Date</th><th>Order</th><th>Type</th><th>Warehouse · bin</th><th className="num">Qty</th></tr></thead>
          <tbody>{reservations.map(o => <tr key={o.id}>
            <td className="text-[12px]">{fmtDate(o.punchedOn)}</td>
            <td className="mono text-[11.5px]">{o.orderNo}<div className="text-[11px]" style={{ color: 'var(--ink-faint)', fontFamily: 'inherit' }}>{o.customer}</div></td>
            <td><Pill tone="info">RESERVED</Pill></td>
            <td className="text-[12px]">{inventory?.warehouse ?? 'Dadar unit'}{inventory?.bins[0] ? ` · ${inventory.bins[0].bin}` : ''}</td>
            <td className="num mono">{o.consumptionM ?? 1.7} m</td>
          </tr>)}</tbody>
        </table></div>}
    </Section>}
  </>;
}
