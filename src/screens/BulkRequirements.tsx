/* Bulk upload of requirements (17 Nov 2026): category fills one sheet, a row per style, instead of raising them one
   by one. Each row becomes a requirement at the requirement step; files (tech pack, trim card) are added on each after. */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import readXlsxFile from 'read-excel-file';
import { useApp } from '../store';
import type { GarmentCategory, FabricBy } from '../domain/types';
import { GARMENT_CATEGORIES, SUB_CATEGORIES, SIZE_SETS } from '../domain/reference';
import { fmtDate, fmtMoney } from '../domain/engines';
import { Button, downloadXlsx } from '../ui';

type Row = { styleName: string; category: GarmentCategory; subCategory: string; colours: string[]; sizeBreakup: { size: string; qty: number }[]; targetCost: number; targetInhouse: string; semiStitched: boolean; fabric: string | null; content: string | null; clothBy: FabricBy; problems: string[] };
const COLS = ['Style name', 'Category', 'Sub-category', 'Colours', 'Size quantities', 'Target cost', 'Target in-house date', 'Semi-stitched', 'Fabric', 'Fabric content', 'Cloth supplied by'];
const RTW_CATS = GARMENT_CATEGORIES;
const txt = (v: unknown) => (v == null ? '' : String(v).trim());

function shape(cells: unknown[][]): Row[] {
  return cells.filter(r => r.some(c => txt(c) !== '')).filter(r => txt(r[0]).toLowerCase() !== 'style name').map(r => {
    const problems: string[] = [];
    const styleName = txt(r[0]); if (!styleName) problems.push('no style name');
    const catIn = txt(r[1]).toLowerCase(); const category = (RTW_CATS.find(c => c.toLowerCase() === catIn) ?? RTW_CATS.find(c => catIn && c.toLowerCase().includes(catIn)) ?? null) as GarmentCategory | null; if (!category) problems.push('category not known');
    const cat = category ?? RTW_CATS[0];
    const subCategory = txt(r[2]) || SUB_CATEGORIES[cat]?.[0] || '';
    const colours = txt(r[3]).split(/[,;/]/).map(x => x.trim()).filter(Boolean);
    /* "38:20, 40:30" per size, or one number spread evenly over the category's usual sizes */
    const sz = txt(r[4]); let sizeBreakup = sz.split(/[,;]/).map(x => x.split(/[:=]/)).filter(x => x.length === 2).map(([a, b]) => ({ size: a.trim(), qty: Number(b) || 0 })).filter(x => x.size && x.qty > 0);
    if (!sizeBreakup.length && Number(sz) > 0) { const set = SIZE_SETS[cat] ?? ['S', 'M', 'L', 'XL']; const each = Math.floor(Number(sz) / set.length); sizeBreakup = set.map((s, i) => ({ size: s, qty: each + (i === 0 ? Number(sz) - each * set.length : 0) })); }
    if (!sizeBreakup.length) problems.push('no size quantities');
    const targetCost = Number(txt(r[5]).replace(/[₹,\s]/g, '')); if (!(targetCost > 0)) problems.push('no target cost');
    const d = r[6] instanceof Date ? r[6] : new Date(txt(r[6])); const targetInhouse = isNaN(d.getTime()) ? '' : d.toISOString(); if (!targetInhouse) problems.push('date not read');
    const by = txt(r[10]).toLowerCase(); const clothBy: FabricBy = /factory/.test(by) && !/nominat|vendor/.test(by) ? 'factory' : /nominat|vendor|add/.test(by) ? 'bsc-vendor' : 'bsc';
    return { styleName, category: cat, subCategory, colours, sizeBreakup, targetCost, targetInhouse, semiStitched: /^(y|yes|true|1)$/i.test(txt(r[7])), fabric: txt(r[8]) || null, content: txt(r[9]) || null, clothBy, problems };
  });
}
const SAMPLE: unknown[][] = [
  ['Navy Oxford Button-Down Shirt', 'RTW CMT shirts', '', 'Navy, White', '38:20, 40:40, 42:40, 44:30, 46:20', 495, new Date(Date.now() + 70 * 864e5), 'No', 'Oxford', '100% cotton', 'Sent by BSC'],
  ['Olive Linen Camp-Collar Shirt', 'RTW CMT shirts', '', 'Olive', '150', 560, new Date(Date.now() + 80 * 864e5), 'No', 'Linen', '100% linen', 'Nominated by BSC'],
  ['Stone Stretch Chinos', 'Bottoms / Knitwear / Jackets', '', 'Stone, Navy', '30:30, 32:60, 34:60, 36:30', 780, new Date(Date.now() + 90 * 864e5), 'Yes', 'Stretch twill', '97% cotton, 3% elastane', 'By the factory'],
  ['', 'RTW CMT shirts', '', 'Blue', '120', '', '', 'No', 'Poplin', '', ''],
];

export function BulkRequirements({ onClose }: { onClose: () => void }) {
  const { bulkCreateRequirements } = useApp();
  const [rows, setRows] = useState<Row[]>([]); const [file, setFile] = useState(''); const [done, setDone] = useState<number | null>(null);
  const onFile = async (f: File | undefined) => { if (!f) return; setDone(null); setFile(f.name);
    setRows(shape(/\.csv$/i.test(f.name) ? (await f.text()).split(/\r?\n/).map(l => l.split(',')) : await readXlsxFile(f) as unknown[][])); };
  const good = rows.filter(r => !r.problems.length);
  const template = () => downloadXlsx('requirements-template', COLS.map((c, i) => ({ label: c, get: (r: unknown[]) => { const v = r[i]; return v instanceof Date ? v.toISOString().slice(0, 10) : (v as string | number); }, width: i === 0 ? 34 : i === 4 ? 30 : 20 })), SAMPLE.slice(0, 3), 'Requirements');
  const faint = { color: 'var(--ink-faint)' } as const;
  return createPortal(<div className="qf-back" onClick={onClose}><div className="qf" style={{ width: 'min(1040px, 100%)' }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Bulk upload requirements">
    <div className="qf-bar"><b className="text-[13px]">Bulk upload requirements</b><button type="button" className="vlink" onClick={onClose}>✕ close</button></div>
    <div className="qf-body">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="btn primary" style={{ cursor: 'pointer' }}>Choose the sheet (.xlsx or .csv)<input type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0])} /></label>
        <Button variant="ghost" onClick={template}>↓ Template</Button>
        <Button variant="ghost" onClick={() => { setDone(null); setFile('sample rows'); setRows(shape(SAMPLE)); }}>Use sample rows</Button>
        {file && <span className="text-[12px]" style={faint}>{file} · {rows.length} row{rows.length === 1 ? '' : 's'}</span>}
      </div>
      <div className="text-[12px] pt-2" style={faint}>One row per style. Columns: {COLS.join(' · ')}. Size quantities as 38:20, 40:40, or one total.</div>
      {rows.length > 0 && <>
        <div style={{ overflowX: 'auto' }}><table className="t compact mt-3"><thead><tr><th>Style</th><th>Category</th><th>Colours</th><th className="num">Pcs</th><th>Sizes</th><th className="num">Target ₹</th><th>In-house</th><th>Cloth</th><th></th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} style={{ background: r.problems.length ? 'color-mix(in srgb, var(--risk) 5%, transparent)' : undefined }}>
            <td className="font-medium" style={{ whiteSpace: 'normal', minWidth: 180 }}>{r.styleName || '—'}{r.semiStitched && <span className="pill ml-1">semi-stitched</span>}</td><td className="text-[12px]">{r.category}</td><td className="text-[12px]">{r.colours.join(', ') || '—'}</td>
            <td className="num">{r.sizeBreakup.reduce((a, x) => a + x.qty, 0) || '—'}</td><td className="text-[11.5px]" style={{ whiteSpace: 'normal', maxWidth: 200, color: 'var(--ink-soft)' }}>{r.sizeBreakup.map(x => `${x.size}:${x.qty}`).join(' ')}</td>
            <td className="num">{r.targetCost > 0 ? fmtMoney(r.targetCost) : '—'}</td><td className="text-[12px]">{r.targetInhouse ? fmtDate(r.targetInhouse) : '—'}</td>
            <td className="text-[12px]">{r.clothBy === 'bsc' ? 'BSC sends' : r.clothBy === 'bsc-vendor' ? 'BSC nominates' : 'factory'}</td>
            <td className="text-[11.5px]" style={{ color: r.problems.length ? 'var(--risk)' : 'var(--good)', whiteSpace: 'normal' }}>{r.problems.join(', ') || 'ready'}</td></tr>)}</tbody></table></div>
        <div className="flex items-center gap-3 pt-3 flex-wrap">
          <Button variant="primary" disabled={!good.length || done != null} onClick={() => setDone(bulkCreateRequirements(good.map(({ problems: _p, ...r }) => r)))}>Create {good.length} requirement{good.length === 1 ? '' : 's'}</Button>
          {rows.length - good.length > 0 && <span className="text-[12px]" style={{ color: 'var(--risk)' }}>{rows.length - good.length} row{rows.length - good.length === 1 ? '' : 's'} with a problem will be skipped</span>}
          {done != null && <span className="text-[12.5px]" style={{ color: 'var(--good)' }}>{done} created. They are on the list at the requirement step. <button type="button" className="vlink" onClick={onClose}>Close</button></span>}
        </div>
      </>}
    </div></div></div>, document.body);
}
