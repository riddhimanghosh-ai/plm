/* One fabric, several designs. The fabric is the base material — its code,
   composition, book, price per metre are shared. Each design is a separate
   sellable shirt configuration on that fabric and gets its own row: product
   code (what Shopify sells), style, working name and marketing's final name,
   category, MRP, cost, description, attributes and buzzwords, and its own
   Enigma and live status. This is the design tools sheet, one row per design,
   rendered the same on the concept and on the swatch desk. */
import { useState } from 'react';
import { useApp } from '../store';
import type { Concept, ConceptDesign } from '../domain/types';
import { SHIRT_STYLES, RTW_SIZES } from '../domain/reference';
import { fmtDate } from '../domain/engines';
import { Pill, Button, Field, Input, Select } from '../ui';
import { ActsBy } from './Who';

const money = (n: number | null | undefined) => n == null ? '—' : `₹${n.toLocaleString('en-IN')}`;

export function DesignsOnFabric({ c, canEdit, compact = false }: { c: Concept; canEdit: boolean; compact?: boolean }) {
  const { db, conceptAddDesign, conceptUpdateDesign, conceptRemoveDesign, conceptDesignFlag, pushDesignToEnigma } = useApp();
  const designs = c.designs ?? [];
  const f = c.fabricId ? db.fabrics.find(x => x.id === c.fabricId) : null;
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(designs.length === 0);
  const blank = { name:'', style: SHIRT_STYLES[0], category:'Formal' as 'Formal' | 'Casual', mrp: String(c.naming.mrp ?? 2990), cost:'', description:'', buzzwords:'', productType:'CUSTOM_DESIGN', weightGrams:'', region:'IND', stockMode:'track-quantity' as 'track-quantity' | 'variants', status:'ACTIVE' as 'ACTIVE' | 'INACTIVE', salesChannel:'', discountedPrice:'', media:'', sizes: ['36', '38', '40', '42', '44', '46'] as string[], vprice: {} as Record<string, string>, vdisc: {} as Record<string, string> };
  const [v, setV] = useState(blank);
  const start = (d: ConceptDesign) => { setV({ name: d.name, style: d.style ?? SHIRT_STYLES[0], category: d.category, mrp: d.mrp != null ? String(d.mrp) : '', cost: d.cost != null ? String(d.cost) : '', description: d.description ?? '', buzzwords: d.buzzwords ?? '', productType: d.productType ?? 'CUSTOM_DESIGN', weightGrams: d.weightGrams != null ? String(d.weightGrams) : '', region: d.region ?? 'IND', stockMode: d.stockMode ?? 'track-quantity', status: d.status ?? 'ACTIVE', salesChannel: d.salesChannel ?? '', discountedPrice: d.discountedPrice != null ? String(d.discountedPrice) : '', media: (d.media ?? []).join(', '), sizes: d.sizes ?? ['36', '38', '40', '42', '44', '46'], vprice: Object.fromEntries((d.variants ?? []).map(x => [x.size, x.price != null ? String(x.price) : ''])), vdisc: Object.fromEntries((d.variants ?? []).map(x => [x.size, x.discountedPrice != null ? String(x.discountedPrice) : ''])) }); setEditId(d.id); setAdding(false); };
  const save = () => {
    const patch = { name: v.name.trim(), style: v.style, category: v.category, mrp: Number(v.mrp) || null, cost: Number(v.cost) || null, description: v.description.trim() || null, buzzwords: v.buzzwords.trim() || null,
      productType: v.productType || null, weightGrams: Number(v.weightGrams) || null, region: v.region, stockMode: v.stockMode, status: v.status, salesChannel: v.salesChannel.trim() || null, discountedPrice: Number(v.discountedPrice) || null, media: v.media.split(',').map(x => x.trim()).filter(Boolean), sizes: v.sizes,
      variants: v.sizes.map(sz => ({ size: sz, price: Number(v.vprice[sz]) || Number(v.mrp) || null, discountedPrice: Number(v.vdisc[sz]) || null, sku: `${editId ? designs.find(d => d.id === editId)?.code : `BOM-SHI-${v.category === 'Formal' ? 'FM' : 'CS'}-nnnn`}-${sz}` })) };
    if (editId) conceptUpdateDesign(c.id, editId, patch); else conceptAddDesign(c.id, patch);
    setEditId(null); setAdding(false); setV(blank);
  };
  const form = <div className="px-3 py-2 mt-2" style={{ background:'var(--accent-soft)', borderRadius: 6 }}>
    <div className="label" style={{ margin:'0 0 2px' }}>{editId ? 'Edit design' : 'Add a design on this fabric'}{f ? <span className="mono text-[11px]" style={{ color:'var(--ink-faint)' }}> · {f.code}</span> : null}</div>
    <div className="vgrid pt-1">
      <div className="vgrid-cap">The shirt</div>
      <div style={{ gridColumn:'span 5' }}><Field label="Design name" hint="the working name; marketing's final name replaces it on Name & price" hintOn="label"><Input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} placeholder={`${(f?.name ?? c.name).replace(/ - .*$/, '')} Shirt - Half Sleeve`} /></Field></div>
      <div style={{ gridColumn:'span 4' }}><Field label="Style / preset" hint="the shirt configuration this design is built on" hintOn="label"><Select value={v.style} onChange={s => setV({ ...v, style: s })} options={SHIRT_STYLES.map(s => ({ value:s, label:s }))} /></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="Category"><Select value={v.category} onChange={s => setV({ ...v, category: s as 'Formal' | 'Casual' })} options={[{ value:'Formal', label:'Formal' }, { value:'Casual', label:'Casual' }]} /></Field></div>
      <div className="vgrid-cap">Enigma product info</div>
      <div style={{ gridColumn:'span 3' }}><Field label="SKU code" hint="the product code — minted when the design is added"><div className="input mono" style={{ background:'var(--surface-2)', color:'var(--ink-faint)' }}>{editId ? designs.find(d => d.id === editId)?.code : `BOM-SHI-${v.category === 'Formal' ? 'FM' : 'CS'}-nnnn`}</div></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="Product type"><Select value={v.productType} onChange={s => setV({ ...v, productType: s })} options={['CUSTOM_DESIGN', 'READY_DESIGN', 'READY_TO_WEAR', 'HEMMING'].map(x => ({ value:x, label:x }))} /></Field></div>
      <div style={{ gridColumn:'span 2' }}><Field label="Weight (g)"><Input type="number" value={v.weightGrams} onChange={e => setV({ ...v, weightGrams: e.target.value })} placeholder="260" /></Field></div>
      <div style={{ gridColumn:'span 2' }}><Field label="Region"><Select value={v.region} onChange={s => setV({ ...v, region: s })} options={[{ value:'IND', label:'IND' }, { value:'INTL', label:'INTL' }]} /></Field></div>
      <div style={{ gridColumn:'span 2' }}><Field label="Stock"><Select value={v.stockMode} onChange={s => setV({ ...v, stockMode: s as 'track-quantity' | 'variants' })} options={[{ value:'track-quantity', label:'Track quantity' }, { value:'variants', label:'Variants' }]} /></Field></div>
      <div style={{ gridColumn:'span 4' }}><Field label="Primary fabric" hint="fixed — this design hangs off this fabric"><div className="input" style={{ background:'var(--surface-2)', color:'var(--ink-faint)' }}>{f ? `${f.name} · ${f.code}` : c.name}</div></Field></div>
      <div style={{ gridColumn:'span 2' }}><Field label="Status"><Select value={v.status} onChange={s => setV({ ...v, status: s as 'ACTIVE' | 'INACTIVE' })} options={[{ value:'ACTIVE', label:'ACTIVE' }, { value:'INACTIVE', label:'INACTIVE' }]} /></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="Sales channel"><Select value={v.salesChannel} onChange={s => setV({ ...v, salesChannel: s })} options={[{ value:'', label:'—' }, { value:'Stores + Online', label:'Stores + Online' }, { value:'Stores', label:'Stores' }, { value:'Online', label:'Online' }]} /></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="Product media" hint="what appears on the website — file names, comma-separated"><Input value={v.media} onChange={e => setV({ ...v, media: e.target.value })} placeholder="front.jpg, detail.jpg" /></Field></div>
      <div style={{ gridColumn:'span 12' }}><Field label="Sizes" hint="the sizes this design is sold in — Enigma's variants; tick what applies">
        <div className="flex gap-1.5 flex-wrap pt-1">{RTW_SIZES.map(sz => { const on = v.sizes.includes(sz); return <button key={sz} type="button" className={`pill ${on ? 'good' : ''}`} style={{ cursor:'pointer' }} onClick={() => setV({ ...v, sizes: on ? v.sizes.filter(x => x !== sz) : [...v.sizes, sz].sort((a, b) => RTW_SIZES.indexOf(a as typeof RTW_SIZES[number]) - RTW_SIZES.indexOf(b as typeof RTW_SIZES[number])) })}>{sz}</button>; })}
          <span className="text-[11.5px] pl-2 self-center" style={{ color:'var(--ink-faint)' }}>{v.sizes.length ? `${v.sizes.length} sizes · ${v.sizes.join(' ')}` : 'no sizes — one size, made to measure'}</span></div></Field></div>
      {v.sizes.length > 0 && <div style={{ gridColumn:'span 12' }}><div className="label">Variants · a price per size</div>
        <div style={{ overflowX:'auto' }}><table className="t compact"><thead><tr><th>Variant</th><th className="num">Price ₹</th><th className="num">Discounted price ₹</th><th>SKU code</th></tr></thead>
          <tbody>{v.sizes.map(sz => <tr key={sz}>
            <td className="mono">{sz}</td>
            <td className="num"><Input type="number" value={v.vprice[sz] ?? ''} placeholder={v.mrp || '—'} onChange={e => setV({ ...v, vprice: { ...v.vprice, [sz]: e.target.value } })} style={{ width: 110, textAlign:'right' }} /></td>
            <td className="num"><Input type="number" value={v.vdisc[sz] ?? ''} placeholder={v.discountedPrice || '—'} onChange={e => setV({ ...v, vdisc: { ...v.vdisc, [sz]: e.target.value } })} style={{ width: 110, textAlign:'right' }} /></td>
            <td className="mono text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{editId ? designs.find(d => d.id === editId)?.code : `BOM-SHI-${v.category === 'Formal' ? 'FM' : 'CS'}-nnnn`}-{sz}</td>
          </tr>)}</tbody></table></div>
        <div className="text-[11px] pt-1" style={{ color:'var(--ink-faint)' }}>blank price = the MRP; blank discounted = none</div></div>}
      <div className="vgrid-cap">The money</div>
      <div style={{ gridColumn:'span 3' }}><Field label="MRP ₹" hint="Enigma's Original Price"><Input type="number" value={v.mrp} onChange={e => setV({ ...v, mrp: e.target.value })} /></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="Discounted price ₹" hint="IND Details · leave blank when there is none"><Input type="number" value={v.discountedPrice} onChange={e => setV({ ...v, discountedPrice: e.target.value })} /></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="Cost ₹" hint="what the shirt costs to make in this fabric and style" hintOn="label"><Input type="number" value={v.cost} onChange={e => setV({ ...v, cost: e.target.value })} /></Field></div>
      <div style={{ gridColumn:'span 3' }}><Field label="Margin"><div className="input" style={{ background:'var(--surface-2)', color:'var(--ink-faint)' }}>{Number(v.mrp) && Number(v.cost) ? `${Math.round((1 - Number(v.cost) / Number(v.mrp)) * 100)}% on MRP` : 'MRP and cost'}</div></Field></div>
      <div className="vgrid-cap">What the customer reads</div>
      <div style={{ gridColumn:'span 8' }}><Field label="Description · PDP" ><Input value={v.description} onChange={e => setV({ ...v, description: e.target.value })} placeholder="A soft-washed houndstooth in 100% cotton, cut for the boardroom" /></Field></div>
      <div style={{ gridColumn:'span 4' }}><Field label="Buzzwords" hint="the fabric's speciality, comma-separated — wrinkle-free, stretch, breathable" hintOn="label"><Input value={v.buzzwords} onChange={e => setV({ ...v, buzzwords: e.target.value })} placeholder="wrinkle-free, breathable" /></Field></div>
    </div>
    <div className="flex gap-2 items-center flex-wrap pt-2">
      <Button size="sm" variant="primary" disabled={!v.name.trim()} onClick={save}>{editId ? 'Save changes' : 'Add design'}</Button>
      <Button size="sm" variant="ghost" onClick={() => { setEditId(null); setAdding(false); setV(blank); }}>Cancel</Button>
      {!editId && <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>product code minted as <span className="mono">BOM-SHI-{v.category === 'Formal' ? 'FM' : 'CS'}-nnnn</span></span>}
    </div>
  </div>;

  return <>
    {!compact && <div className="text-[12.5px] pb-2" style={{ color:'var(--ink-soft)' }}>One fabric, several designs. The fabric — <span className="mono">{f?.code ?? '…'}</span>{f?.composition ? `, ${f.composition}` : ''}{f?.swatchBook ? `, ${f.swatchBook}` : ''} — is shared; each design is its own sellable shirt with its own product code, style, name, MRP, cost and description. Shopify sells the product code. The sticker sheet carries one label per design.</div>}
    {designs.length > 0 && <div style={{ overflowX:'auto' }}><table className="t compact">
      <thead><tr><th>Product code</th><th>Design</th><th>Style</th><th>Type</th><th className="num">MRP</th><th className="num">Cost</th><th>Status</th><th></th></tr></thead>
      <tbody>{designs.map(d => <tr key={d.id} style={{ background: editId === d.id ? 'var(--accent-soft)' : undefined }}>
        <td className="mono text-[12px]">{d.code}</td>
        <td style={{ whiteSpace:'normal', minWidth: 180 }}><span className="font-medium">{d.finalName ?? d.name}</span>{d.finalName && d.finalName !== d.name && <div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>working name “{d.name}”{(d.nameHistory ?? []).length ? ` · earlier ${(d.nameHistory ?? []).map(h => `“${h.name}”`).join(', ')}` : ''}</div>}{d.description && <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{d.description}</div>}<div className="text-[10.5px] mono" style={{ color:'var(--ink-faint)' }}>{[d.productType ?? 'CUSTOM_DESIGN', d.region ?? 'IND', d.status ?? 'ACTIVE', d.salesChannel, d.weightGrams ? `${d.weightGrams} g` : null, d.discountedPrice ? `disc ₹${d.discountedPrice}` : null, (d.media ?? []).length ? `${(d.media ?? []).length} media` : null, (d.sizes ?? []).length ? `sizes ${(d.sizes ?? []).join(' ')}` : null].filter(Boolean).join(' · ')}</div>{d.buzzwords && <div className="text-[10.5px] mono" style={{ color:'var(--ink-faint)' }}>{d.buzzwords}</div>}</td>
        <td className="text-[12px]">{d.style ?? '—'}</td>
        <td className="text-[12px]" style={{ color:'var(--ink-soft)' }}>{d.category}</td>
        <td className="num">{money(d.mrp)}</td>
        <td className="num" style={{ color:'var(--ink-soft)' }}>{money(d.cost)}{d.mrp && d.cost ? <div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{Math.round((1 - d.cost / d.mrp) * 100)}%</div> : null}</td>
        <td style={{ whiteSpace:'nowrap' }} onClick={e => e.stopPropagation()}>
          <div className="flex gap-1 flex-wrap">
            {d.enigmaOn ? <span className="pill good" title={`pushed to Enigma ${fmtDate(d.enigmaOn)}${d.enigmaBy ? ` by ${d.enigmaBy}` : ''}`}>in Enigma</span>
              : canEdit ? <button type="button" className="cta" title="creates the design row in Enigma over the API — product code, name, MRP, attributes" onClick={() => pushDesignToEnigma(c.id, d.id)}>Push to Enigma →</button>
              : <span className="pill">Enigma pending</span>}
            <button type="button" className={`pill ${d.liveOn ? 'good' : c.liveOn ? 'warn' : ''}`} disabled={!canEdit} title={d.liveOn ? `live since ${fmtDate(d.liveOn)} — click to take down` : 'mark this design live in POS'} onClick={() => conceptDesignFlag(c.id, d.id, 'live', !d.liveOn)}>{d.liveOn ? 'live' : 'not live'}</button>
          </div>
        </td>
        <td className="text-[11.5px]" style={{ whiteSpace:'nowrap' }}>{canEdit && <><button type="button" className="vlink" onClick={() => start(d)}>edit</button>{!d.liveOn && <> · <button type="button" className="vlink" onClick={() => conceptRemoveDesign(c.id, d.id)}>remove</button></>}</>}</td>
      </tr>)}</tbody>
    </table></div>}
    {canEdit ? ((adding || editId) ? form : <div className="pt-2"><Button size="sm" variant={designs.length ? undefined : 'primary'} onClick={() => { setV(blank); setAdding(true); }}>+ Add a design</Button></div>)
      : <ActsBy role="sourcing" does="creates the designs on this fabric, each with its product code, style, MRP and cost" />}
  </>;
}
