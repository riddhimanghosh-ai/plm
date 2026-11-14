/* The two databases behind the recommendations (15 Nov 2026):
   - Factory database: factory, location, region, the categories it specialises in, merchandiser, contact —
     the counter-sourcing step recommends factories from it by category;
   - Cloth vendor database: vendor, location, what it supplies (oxford, poplin, linen, buttons…), lead time, MOQ, contact —
     sourcing's vendor picker puts the vendors that supply the requirement's cloth first. */
import { useState } from 'react';
import { useApp } from '../store';
import type { GarmentCategory, Vendor, VendorKind } from '../domain/types';
import { GARMENT_CATEGORIES, merchandiserOf } from '../domain/reference';
import { Page, Card, Pill, Button, Field, Input, Select, Drawer, Empty, MultiFilter, passes } from '../ui';

type Kind = 'factory' | 'cloth';
type Form = { name: string; kind: VendorKind; location: string; region: string; email: string; leadDays: string; moq: string; specialising: GarmentCategory[]; supplies: string };
const blank = (k: Kind): Form => ({ name: '', kind: k === 'factory' ? 'CMT factory' : 'Domestic mill', location: '', region: 'West', email: '', leadDays: k === 'factory' ? '35' : '10', moq: k === 'factory' ? '150' : '100', specialising: [], supplies: '' });
const REGIONS = ['West', 'South', 'North', 'East', 'International'];

export function VendorDb({ kind, bare }: { kind: Kind; bare?: boolean }) {
  const { db, saveDbVendor, role } = useApp();
  const canEdit = role === 'owner' || (kind === 'factory' ? role === 'production' : role === 'sourcing');
  const all = db.vendors.filter(v => kind === 'factory' ? (v.kind === 'CMT factory' || v.kind === 'MTM factory') : (v.kind.endsWith('mill') || v.kind === 'Trims'));
  const [q, setQ] = useState(''); const [regions, setRegions] = useState<string[]>([]); const [tags, setTags] = useState<string[]>([]);
  const tagOf = (v: Vendor) => kind === 'factory' ? (v.specialising ?? []) as string[] : (v.supplies ?? []);
  const allTags = [...new Set(all.flatMap(tagOf))].sort();
  const rows = all.filter(v => passes(regions, v.region)).filter(v => tags.length === 0 || tagOf(v).some(t => tags.includes(t)))
    .filter(v => !q.trim() || `${v.name} ${v.location} ${tagOf(v).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [f, setF] = useState<Form>(blank(kind));
  const open = (v: Vendor | null) => { setEditing(v ? v.id : 'new'); setF(v ? { name: v.name, kind: v.kind, location: v.location, region: v.region, email: v.email ?? '', leadDays: String(v.leadDays), moq: String(v.moq), specialising: v.specialising ?? [], supplies: (v.supplies ?? []).join(', ') } : blank(kind)); };
  const save = () => { saveDbVendor(editing === 'new' ? null : editing, { name: f.name.trim(), kind: f.kind, location: f.location.trim(), region: f.region, email: f.email.trim() || null, leadDays: Number(f.leadDays) || 0, moq: Number(f.moq) || 0, ...(kind === 'factory' ? { specialising: f.specialising } : { supplies: f.supplies.split(/[,;]/).map(x => x.trim()).filter(Boolean) }) }); setEditing(null); };
  const faint = { color: 'var(--ink-faint)' } as const;
  const body = <>
    <Card className="mb-3"><div className="px-3 py-2.5 flex items-end gap-3 flex-wrap">
      <MultiFilter label="Region" value={regions} onChange={setRegions} options={[{ id: 'all', label: 'Every region' }, ...REGIONS.filter(r => all.some(v => v.region === r)).map(r => ({ id: r, label: r, count: all.filter(v => v.region === r).length }))]} />
      <MultiFilter label={kind === 'factory' ? 'Specialises in' : 'Supplies'} value={tags} onChange={setTags} width={240} options={[{ id: 'all', label: 'Anything' }, ...allTags.map(t => ({ id: t, label: t, count: all.filter(v => tagOf(v).includes(t)).length }))]} />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder={kind === 'factory' ? 'factory or city' : 'vendor, city or cloth'} style={{ width: 220 }} />
      {canEdit && <span className="ml-auto"><Button variant="primary" onClick={() => open(null)}>+ Add {kind === 'factory' ? 'a factory' : 'a vendor'}</Button></span>}
    </div></Card>
    {rows.length === 0 ? <Card><Empty title="Nothing matches." body="" /></Card> : <Card><table className="t">
      <thead><tr><th>{kind === 'factory' ? 'Factory' : 'Vendor'}</th><th>Location</th><th>{kind === 'factory' ? 'Specialises in' : 'Supplies'}</th>{kind === 'factory' ? <th>Merchandiser</th> : <th>Type</th>}<th className="num">Lead · days</th><th className="num">MOQ</th><th>Contact</th>{kind === 'factory' && <th className="num">On time</th>}</tr></thead>
      <tbody>{rows.map(v => <tr key={v.id} className={canEdit ? 'row' : undefined} onClick={canEdit ? () => open(v) : undefined}>
        <td className="font-medium">{v.name}</td>
        <td className="text-[12.5px]">{v.location}<div className="text-[11px]" style={faint}>{v.region}</div></td>
        <td style={{ whiteSpace: 'normal', maxWidth: 320 }}>{tagOf(v).length ? <span className="flex gap-1 flex-wrap">{tagOf(v).map(t => <span key={t} className="pill" style={{ fontSize: 11 }}>{t}</span>)}</span> : <span style={faint}>—</span>}</td>
        {kind === 'factory' ? <td className="text-[12.5px]">{merchandiserOf(v.id) ?? <span style={faint}>—</span>}</td> : <td><Pill tone={v.kind === 'Trims' ? 'info' : v.kind === 'International mill' ? 'warn' : 'neutral'}>{v.kind === 'Trims' ? 'trims' : v.kind === 'International mill' ? 'international' : 'domestic'}</Pill></td>}
        <td className="num">{v.leadDays}</td><td className="num">{v.moq}</td>
        <td className="text-[12px]" style={faint}>{v.email ?? '—'}</td>
        {kind === 'factory' && <td className="num">{Math.round(v.onTimeRate * 100)}%</td>}
      </tr>)}</tbody>
    </table></Card>}
    <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? `New ${kind === 'factory' ? 'factory' : 'vendor'}` : f.name}>
      {editing && <Card><div className="p-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Field label="Name"><Input value={f.name} onChange={e => setF(x => ({ ...x, name: e.target.value }))} /></Field>
        {kind === 'cloth' && <Field label="Type"><Select value={f.kind} onChange={v => setF(x => ({ ...x, kind: v as VendorKind }))} options={[{ value: 'Domestic mill', label: 'Domestic mill' }, { value: 'International mill', label: 'International mill' }, { value: 'Trims', label: 'Trims' }]} /></Field>}
        <Field label="Location (city)"><Input value={f.location} onChange={e => setF(x => ({ ...x, location: e.target.value }))} /></Field>
        <Field label="Region"><Select value={f.region} onChange={v => setF(x => ({ ...x, region: v }))} options={REGIONS.map(r => ({ value: r, label: r }))} /></Field>
        <Field label="Contact e-mail"><Input value={f.email} onChange={e => setF(x => ({ ...x, email: e.target.value }))} placeholder={kind === 'factory' ? 'orders@factory.in' : 'sales@mill.in'} /></Field>
        <Field label="Lead time (days)"><Input type="number" value={f.leadDays} onChange={e => setF(x => ({ ...x, leadDays: e.target.value }))} /></Field>
        <Field label="MOQ"><Input type="number" value={f.moq} onChange={e => setF(x => ({ ...x, moq: e.target.value }))} /></Field>
        <div style={{ gridColumn: '1 / -1' }}>{kind === 'factory'
          ? <Field label="Specialises in"><div className="flex gap-1.5 flex-wrap pt-1">{GARMENT_CATEGORIES.map(c => { const on = f.specialising.includes(c); return <button key={c} type="button" className={`dest-opt${on ? ' on' : ''}`} style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => setF(x => ({ ...x, specialising: on ? x.specialising.filter(y => y !== c) : [...x.specialising, c] }))}><span className="dest-dot" />{c}</button>; })}</div></Field>
          : <Field label="Supplies" hint="comma-separated: the cloths or trims this vendor is known for"><Input value={f.supplies} onChange={e => setF(x => ({ ...x, supplies: e.target.value }))} placeholder="oxford, poplin, twill" /></Field>}</div>
        <div className="flex gap-2" style={{ gridColumn: '1 / -1' }}><Button variant="primary" disabled={!f.name.trim() || !f.location.trim()} onClick={save}>Save</Button><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
      </div></Card>}
    </Drawer>
  </>;
  if (bare) return body;
  return <Page title={kind === 'factory' ? 'Factory database' : 'Cloth vendor database'} lede={kind === 'factory' ? 'Every factory with where it is and what it specialises in; counter sourcing recommends from here by category.' : 'Every cloth and trim vendor with what it supplies; the vendor picker on a requirement puts the ones that supply that cloth first.'}>{body}</Page>;
}
