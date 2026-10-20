/* Enigma's MTM order sheet, on the record — the measurement block, the four
   pattern flags and every option tile, exactly as cms.bombayshirts.com shows
   them. The job card is the summary; this is what the factory cuts and sews to.
   A customer changes their mind four or five times a day, right up to the end —
   so the sheet is editable while nothing physical has happened, an accepted
   change after that is an amended sheet the factory must be re-issued, and once
   the piece is made it is an alteration. Every edit is on the record with a
   name and a time. */
import { useState } from 'react';
import type React from 'react';
import { useApp } from '../store';
import type { CustomerOrder, OrderTag, OrderSpec, OrderMeasurements, PatternFlags } from '../domain/types';
import { sheetEditMode, sheetRev, sheetVersion, factoryVersion, needsReprint, reallocationRisk, lastRevision, fmtRel, fmtDate } from '../domain/engines';
import { MTM_FITS, ORDER_TAGS, ROLE_LABEL, MEASUREMENTS, PATTERN_FLAGS, SHEET_OPTIONS, defaultSpec, defaultMeasurements, defaultPattern } from '../domain/reference';
import { Section, Pill, Button, Input, Select, Field, KV, Note } from '../ui';

const MODE_NOTE: Record<string, string> = {
  free: 'Nothing has been cut yet — the sheet can simply be corrected.',
  remarks: 'Production has allocated a factory, so the sheet is closed to the store. Add a remark and the production unit sees it on their changed-sheets list — they ring the factory.',
  amend: 'The bundle is already with the factory. A change here amends the sheet and has to be re-issued to them.',
  closed: 'The piece is made. A change now is an alteration or a remake, not a sheet edit.',
};

export interface SheetDraft { spec: OrderSpec; measurements: OrderMeasurements; pattern: PatternFlags }
export const emptyDraft = (): SheetDraft => ({ spec: defaultSpec(), measurements: defaultMeasurements(), pattern: defaultPattern() });

/* ---- read view: Enigma's layout — measurements, pattern details, option tiles ---- */
export function SheetView({ o, onField, changed, active }: { o: CustomerOrder; onField?: (k: string) => void; changed?: Set<string>; active?: string | null }) {
  const m = o.measurements; const p = o.pattern; const s = o.spec;
  const cls = (k: string) => `tile${onField ? ' editable' : ''}${changed?.has(k) ? ' changed' : ''}${active === k ? ' active' : ''}`;
  const click = (k: string) => onField ? { onClick: () => onField(k), title: 'Click to correct this field', role: 'button', tabIndex: 0 } : {};
  return <div>
    {m && <>
      <div className="label">Measurements · inches</div>
      <div className="grid gap-1 py-1" style={{ gridTemplateColumns:'repeat(auto-fill, minmax(118px, 1fr))' }}>
        {MEASUREMENTS.map(x => <div key={x.key} className={cls(x.key)} {...click(x.key)}><div className="tile-k">{x.label}</div><div className="mono text-[13px] font-medium">{m[x.key]}{x.unit === 'in' ? '"' : ''}</div></div>)}
      </div>
    </>}
    {p && <>
      <div className="label pt-2">Pattern details</div>
      <div className="flex gap-1.5 flex-wrap py-1 text-[12.5px]">{PATTERN_FLAGS.map(f => <span key={f.key} className={cls(f.key)} style={{ paddingRight: onField ? 22 : undefined }} {...click(f.key)}>{f.label}: <b>{p[f.key] ? 'Yes' : 'No'}</b></span>)}</div>
    </>}
    {s && <>
      <div className="label pt-2">Options</div>
      <div className="grid gap-1 py-1" style={{ gridTemplateColumns:'repeat(auto-fill, minmax(138px, 1fr))' }}>
        {SHEET_OPTIONS.map(x => <div key={x.key} className={cls(x.key)} {...click(x.key)}><div className="tile-k">{x.label}</div><div className="text-[12.5px] font-medium" style={{ color: /^(none|no)$/i.test(s[x.key]) ? 'var(--ink-faint)' : undefined }}>{s[x.key]}</div></div>)}
      </div>
    </>}
  </div>;
}

/* ---- editor: the same three blocks, every field a control ---- */
export function SheetEditor({ d, onChange, compact = false }: { d: SheetDraft; onChange: (d: SheetDraft) => void; compact?: boolean }) {
  const setM = (k: keyof OrderMeasurements, v: string) => onChange({ ...d, measurements: { ...d.measurements, [k]: Number(v) } });
  const setP = (k: keyof PatternFlags, v: boolean) => onChange({ ...d, pattern: { ...d.pattern, [k]: v } });
  const setS = (k: keyof OrderSpec, v: string) => onChange({ ...d, spec: { ...d.spec, [k]: v } });
  return <>
    <div className="label">Measurements · inches</div>
    <div className="grid gap-1.5 py-1" style={{ gridTemplateColumns: compact ? 'repeat(4, 1fr)' : 'repeat(auto-fill, minmax(118px, 1fr))' }}>
      {MEASUREMENTS.map(x => <label key={x.key} className="block"><span className="text-[9.5px] uppercase tracking-[.06em] block" style={{ color:'var(--ink-faint)' }}>{x.label}</span><input className="input mono" type="number" step={x.unit === 'in' ? 0.125 : 1} value={d.measurements[x.key]} onChange={e => setM(x.key, e.target.value)} style={{ padding:'4px 6px' }} /></label>)}
    </div>
    <div className="label pt-2">Pattern details</div>
    <div className="flex gap-4 flex-wrap py-1 text-[12.5px]">{PATTERN_FLAGS.map(f => <label key={f.key} className="flex items-center gap-1"><input type="checkbox" checked={d.pattern[f.key]} onChange={e => setP(f.key, e.target.checked)} /> {f.label}</label>)}</div>
    <div className="label pt-2">Options</div>
    <div className="grid gap-1.5 py-1" style={{ gridTemplateColumns: compact ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(160px, 1fr))' }}>
      {SHEET_OPTIONS.map(x => <label key={x.key} className="block"><span className="text-[9.5px] uppercase tracking-[.06em] block" style={{ color:'var(--ink-faint)' }}>{x.label}</span><Select value={d.spec[x.key]} onChange={v => setS(x.key, v)} options={x.options.map(v => ({ value:v, label:v }))} /></label>)}
    </div>
  </>;
}

/* ---- the panel on an order: what came in with the order, one-field corrections under the rules, history ---- */
type FieldKey = keyof OrderSpec | keyof OrderMeasurements | keyof PatternFlags;
export function SheetChangePanel({ o, who }: { o: CustomerOrder; who: 'store' | 'unit' }) {
  const { db, editOrderSheet, reissueSheet } = useApp();
  const mode = sheetEditMode(o, who);
  const canEdit = mode === 'free' || (mode === 'amend' && who === 'unit');
  const [remark, setRemark] = useState('');
  const [field, setField] = useState<FieldKey | null>(null);
  const [val, setVal] = useState<string>('');
  const [note, setNote] = useState('');
  const [headOpen, setHeadOpen] = useState(false);
  const [head, setHead] = useState({ fabricId: o.fabricId ?? '', fit: o.fit ?? '', tag: o.tag, remarks: o.remarks });
  const fabrics = db.fabrics.filter(f => !f.paused && !f.onHold && f.millAvailable !== false);
  const revs = o.revisions ?? [];
  const last = lastRevision(o);
  const changedKeys = new Set<string>((last?.changes ?? []).map(c => [...SHEET_OPTIONS, ...MEASUREMENTS, ...PATTERN_FLAGS].find(x => x.label === c.field)?.key ?? '').filter(Boolean));
  const opt = SHEET_OPTIONS.find(x => x.key === field); const mea = MEASUREMENTS.find(x => x.key === field); const flag = PATTERN_FLAGS.find(x => x.key === field);
  const current = field ? (opt ? o.spec?.[opt.key] : mea ? String(o.measurements?.[mea.key] ?? '') : flag ? (o.pattern?.[flag.key] ? 'Yes' : 'No') : '') : '';
  const pickField = (k: string) => { if (!canEdit) return; setField(k as FieldKey); const o2 = SHEET_OPTIONS.find(x => x.key === k); const m2 = MEASUREMENTS.find(x => x.key === k); const f2 = PATTERN_FLAGS.find(x => x.key === k);
    setVal(o2 ? (o.spec?.[o2.key] ?? '') : m2 ? String(o.measurements?.[m2.key] ?? '') : f2 ? (o.pattern?.[f2.key] ? 'Yes' : 'No') : ''); };
  const why = note.trim() || (who === 'store' ? 'Customer asked for the change' : 'Correction taken by the production unit on the customer\'s request');
  const saveField = () => {
    if (!field || val === current) { setField(null); return; }
    editOrderSheet(o.id, opt ? { spec: { [opt.key]: val } } : mea ? { measurements: { [mea.key]: Number(val) } } : { pattern: { [flag!.key]: val === 'Yes' } }, why, who);
    setField(null); setNote('');
  };
  const saveHead = () => { editOrderSheet(o.id, { fabricId: head.fabricId || undefined, fit: head.fit || undefined, tag: head.tag as OrderTag, remarks: head.remarks }, why, who); setHeadOpen(false); setNote(''); };

  return (
    <Section title={`Order sheet · ${sheetVersion(o)}${(o.revisions ?? []).length ? ` · changed ${(o.revisions ?? []).length === 1 ? 'once' : `${(o.revisions ?? []).length} times`}` : ' · as punched'}`} right={<div className="flex gap-2 items-center">
      {needsReprint(o) && <Pill tone="risk">amended · re-issue to factory</Pill>}
      <Pill tone="neutral">as ordered by the customer</Pill>
      {canEdit ? <span className="edit-hint">✎ click any field to correct it</span> : <Pill tone={(mode as string) === 'free' ? 'good' : mode === 'amend' ? 'warn' : mode === 'remarks' ? 'info' : 'neutral'}>{(mode as string) === 'free' ? (canEdit ? 'click a field to correct it' : 'correctable by the unit') : mode === 'amend' ? 'corrections re-issue the sheet' : mode === 'remarks' ? 'allocated — remarks only' : 'closed'}</Pill>}
    </div>}>
      <div className="text-[11.5px] pb-1" style={{ color:'var(--ink-faint)' }}>Every value below came in with the order from {db.stores.find(x => x.id === o.storeId)?.name ?? 'the store'} — Enigma's sheet, measurement for measurement. Nothing here is chosen by production; a change is a correction the customer asked for, and it goes on the record.</div>
      <SheetView o={o} onField={canEdit ? pickField : undefined} changed={changedKeys} active={field} />
      {field && <div className="mt-2 rounded-[4px] px-3 py-2" style={{ background:'var(--accent-soft)' }}>
        <div className="flex gap-2 items-end flex-wrap">
          <div style={{ minWidth: 200 }}><Field label={`Correct ${(opt ?? mea ?? flag)!.label}`} hint={`currently ${current}${mea?.unit === 'in' ? '"' : ''}`}>
            {opt ? <Select value={val} onChange={setVal} options={opt.options.map(v => ({ value:v, label:v }))} />
              : mea ? <Input type="number" step={mea.unit === 'in' ? 0.125 : 1} value={val} onChange={e => setVal(e.target.value)} />
              : <Select value={val} onChange={setVal} options={[{ value:'Yes', label:'Yes' }, { value:'No', label:'No' }]} />}
          </Field></div>
          <div className="flex-1" style={{ minWidth: 220 }}><Field label="Why" hint="goes on the record with your name"><Input value={note} onChange={e => setNote(e.target.value)} placeholder={who === 'store' ? 'customer came back for a re-measure' : 'store called — customer re-measured'} /></Field></div>
          <Button size="sm" variant="primary" onClick={saveField}>{mode === 'free' ? 'Save correction' : 'Amend — re-issue to factory'}</Button>
          <Button size="sm" variant="ghost" onClick={() => setField(null)}>Cancel</Button>
        </div>
      </div>}
      <div className="pt-2"><KV k="Fit block" v={o.fit ?? '—'} note={o.fitProfile ? `profile · ${o.fitProfile}` : undefined} />
        {o.kind === 'MTM' && <KV k="Measured by" v={o.measuredBy ?? '—'} note={o.measuredBy ? undefined : 'not recorded — today only the store notebook knows'} />}
        {(o.promiseRevisions?.length ?? 0) > 0 && <KV k="Ship-by moved" v={`${fmtDate(o.promiseRevisions![0].from)} → ${fmtDate(o.promisedOn)}`} note={o.promiseRevisions!.map(r => `${r.reason} · ${r.by}, ${fmtDate(r.at)}`).join(' · ')} />}
        {(o.trial || o.express) && <KV k="Promise" v={[o.trial ? 'trial shirt first' : '', o.express ? 'urgent · ₹600 express' : ''].filter(Boolean).join(' · ')} note={`ship by ${fmtDate(o.promisedOn)}`} />}
        <KV k="Comment for the factory" v={o.factoryComment || '—'} />
        <KV k="Comment for shipping" v={o.logisticComment || '—'} />
        <KV k="Remarks" v={o.remarks || '—'} /></div>
      {!field && changedKeys.size > 0 && <div className="text-[11px] pt-1" style={{ color:'var(--warn)' }}>Outlined fields were corrected in the last revision.</div>}

      {needsReprint(o) && <div className="pt-2"><Note tone="risk">The factory is holding {factoryVersion(o)}; this is {sheetVersion(o)}. Re-issue the amended sheet before they cut to the old one.{who === 'unit' && <> <Button size="sm" variant="primary" onClick={() => reissueSheet([o.id])}>Re-issue to factory</Button></>}</Note></div>}
      {reallocationRisk(o) && <div className="pt-2"><Note tone="warn">{last!.changes.map(c => c.field).join(' and ')} changed after this was planned to {db.vendors.find(v => v.id === o.factoryId)?.name} — it may belong at a different factory. Pull it back to PP or leave it.</Note></div>}

      {canEdit && !headOpen && <div className="pt-3"><Button size="sm" onClick={() => setHeadOpen(true)}>Change fabric, fit block{who === 'unit' ? ', tag' : ''} or remarks</Button> <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{MODE_NOTE[mode]}</span></div>}
      {!canEdit && <div className="pt-2"><Note tone={mode === 'closed' ? 'warn' : undefined}>{MODE_NOTE[mode]}</Note></div>}
      {/* once production has allocated a factory the sheet is frozen to the store —
          what is left is a remark, which lands on the production unit's changed-sheets list */}
      {mode === 'remarks' && <div className="pt-2 flex gap-2 items-end flex-wrap">
        <div className="flex-1" style={{ minWidth: 240 }}><Field label="Add a remark" hint="the sheet is with the factory now — this goes on the record and to the production unit">
          <Input value={remark} onChange={e => setRemark(e.target.value)} placeholder="customer rang — please keep the cuff as ordered" /></Field></div>
        <Button size="sm" variant="primary" disabled={!remark.trim()} onClick={() => { editOrderSheet(o.id, { remarks: `${o.remarks ? o.remarks + ' · ' : ''}${remark.trim()}` }, remark.trim(), who); setRemark(''); }}>Add remark</Button>
      </div>}
      {canEdit && headOpen && <div className="pt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div className="grid gap-2.5 py-1" style={{ gridTemplateColumns:'1fr 1fr 1fr' }}>
          <Field label="Fit block"><Select value={head.fit} onChange={v => setHead(p => ({ ...p, fit: v }))} options={MTM_FITS.map(x => ({ value:x, label:x }))} /></Field>
          {mode === 'free' && <Field label="Fabric" hint="changing the fabric may change the factory"><Select value={head.fabricId} onChange={v => setHead(p => ({ ...p, fabricId: v }))} options={fabrics.map(f => ({ value:f.id, label:`${f.name} · ${f.code}` }))} /></Field>}
          {who === 'unit' && <Field label="Tag"><Select value={head.tag} onChange={v => setHead(p => ({ ...p, tag: v as OrderTag }))} options={ORDER_TAGS.map(t => ({ value:t, label:t }))} /></Field>}
          <div style={{ gridColumn:'1 / -1' }}><Field label="Remarks"><Input value={head.remarks} onChange={e => setHead(p => ({ ...p, remarks: e.target.value }))} /></Field></div>
          <div style={{ gridColumn:'1 / -1' }}><Field label="Why the change" hint="goes on the record with your name"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="customer rang the store" /></Field></div>
        </div>
        <div className="flex gap-2"><Button size="sm" variant="primary" onClick={saveHead}>{mode === 'free' ? 'Save the change' : 'Amend — factory must be re-issued'}</Button><Button size="sm" variant="ghost" onClick={() => setHeadOpen(false)}>Cancel</Button></div>
      </div>}

    </Section>
  );
}

export function PullBackButton({ o }: { o: CustomerOrder }) {
  const { unplanOrders } = useApp();
  if (o.stage !== 'planned') return null;
  return <Button size="sm" variant="ghost" onClick={() => unplanOrders([o.id], 'Pulled back from the plan')}>Pull back to PP</Button>;
}

/** Every change since the order was punched, as its own block right under the
    order: when, who, which field, from what to what, and why. Open whenever
    there is anything in it — a correction is the thing people come back to check. */
export function SheetHistory({ o }: { o: CustomerOrder }) {
  const revs = [...(o.revisions ?? [])].reverse();
  /* keyed on the count so the block unfolds the moment the first correction lands */
  return <Section key={revs.length} title={`Changes · ${revs.length}`} defaultOpen={revs.length > 0} pending={false} ownerRole={null}
    right={<Pill tone={revs.length ? 'info' : 'neutral'}>{revs.length ? `rev ${sheetRev(o) - 1 || 1} · last ${fmtRel(revs[0].at)}` : 'as punched'}</Pill>}>
    {revs.length === 0 ? <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing changed since the order was punched.</div>
      : <div style={{ overflowX:'auto' }}><table className="t compact">
        <thead><tr><th>When</th><th>Who</th><th>Field</th><th>From</th><th>To</th><th>Why</th></tr></thead>
        <tbody>{revs.map(r => r.changes.map((c, i) => <tr key={`${r.rev}-${i}`}>
          {i === 0 && <td rowSpan={r.changes.length} style={{ whiteSpace:'nowrap', verticalAlign:'top' }}><span className="mono text-[11px]">V{r.rev + 1}</span><div className="text-[11.5px]">{fmtDate(r.at)}</div><div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{fmtRel(r.at)}{r.reprint ? ' · sheet re-issued' : ''}</div></td>}
          {i === 0 && <td rowSpan={r.changes.length} style={{ verticalAlign:'top' }}><b>{r.by}</b><div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{ROLE_LABEL[r.role]}</div></td>}
          <td className="font-medium text-[12.5px]">{c.field}</td>
          <td className="text-[12.5px]" style={{ color:'var(--ink-faint)', textDecoration:'line-through' }}>{c.from || '—'}</td>
          <td className="text-[12.5px] font-medium">{c.to || '—'}</td>
          {i === 0 && <td rowSpan={r.changes.length} className="text-[12px]" style={{ whiteSpace:'normal', minWidth: 160, verticalAlign:'top', color:'var(--ink-soft)' }}>{r.note || '—'}</td>}
        </tr>))}</tbody>
      </table></div>}
  </Section>;
}
