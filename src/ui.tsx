import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from './store';
import { ROLE_LABEL } from './domain/reference';
import type { RoleId } from './domain/types';

export type Tone = 'neutral' | 'good' | 'warn' | 'risk' | 'info' | 'accent';

/** What this screen is, on demand — not printed under every title. Click the
    mark, read it, click away; the screen underneath starts one line higher.
    The "replaces today" line lives in here too: it is pitch, not work, and a
    person who opens this screen every morning does not need it on the page. */
function InfoButton({ text, replaces }: { text?: string; replaces?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-flex" style={{ flex:'none' }}>
      <button type="button" aria-label="What this screen is" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="inline-flex items-center justify-center qi"
        style={{ width:18, height:18, borderRadius:'50%', border:'1px solid var(--ink-faint)', color:'var(--ink-faint)', background:'transparent', fontFamily:'var(--mono)', fontSize:11, fontWeight:600, cursor:'pointer', lineHeight:1, opacity: open ? 1 : undefined }}>i</button>
      {open && <div className="absolute z-10 text-[13px]" style={{ top:'calc(100% + 8px)', left:0, width:'min(60ch, 80vw)', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:4, boxShadow:'var(--shadow)', padding:'12px 14px', color:'var(--ink-soft)', fontWeight:400, letterSpacing:'normal', textTransform:'none' }}>
        {text}
        {replaces && <div className="mt-2 pt-2 text-[12px]" style={{ borderTop:'1px solid var(--line-soft)', color:'var(--ink-faint)' }}><b style={{ color:'var(--ink-soft)' }}>Replaces today:</b> {replaces}</div>}
      </div>}
    </div>
  );
}

export function Page({ title, lede, replaces, actions, children }: { title: string; lede?: string; replaces?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="pb-16">
      <header className="flex items-start justify-between gap-5 flex-wrap mb-4">
        <div className="min-w-0 flex items-center gap-2"><h1>{title}</h1>{(lede || replaces) && <InfoButton text={lede} replaces={replaces} />}</div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export const Card = ({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) => <div className={`card ${className}`} style={style}>{children}</div>;
export const Pill = ({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) => <span className={`pill ${tone === 'neutral' ? '' : tone}`}>{children}</span>;
export const KV = ({ k, v, note }: { k: string; v: React.ReactNode; note?: string }) => <div className="kv"><span className="k">{k}</span><span className="v">{v}{note && <span className="block text-[11px] font-normal" style={{ color:'var(--ink-faint)' }}>{note}</span>}</span></div>;
/* `hint` sits under the input by default. In a grid of fields that makes one
   cell taller than its neighbours and the whole row goes ragged, so a field
   can carry its hint on the LABEL instead — same words, no extra height. */
export const Field = ({ label, children, hint, hintOn = 'below' }: { label: string; children: React.ReactNode; hint?: string; hintOn?: 'below' | 'label' }) =>
  <label className="block" title={hintOn === 'label' ? hint : undefined}>
    <span className="label">{label}{hint && hintOn === 'label' && <span className="q" aria-hidden> ⓘ</span>}</span>
    {children}
    {hint && hintOn === 'below' && <span className="block mt-1 text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{hint}</span>}
  </label>;
export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input className="input" {...p} />;
type Opt = { value: string; label: string };
export const Select = ({ value, onChange, options, groups, ...rest }: { value: string; onChange: (v: string) => void; options?: Opt[]; groups?: { label: string; options: Opt[] }[] } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) =>
  <select className="select" value={value} onChange={e => onChange(e.target.value)} {...rest}>
    {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    {groups?.map(g => <optgroup key={g.label} label={g.label}>{g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>)}
  </select>;
export const Button = ({ variant, size, className = '', ...p }: { variant?: 'primary' | 'danger' | 'ghost'; size?: 'sm' } & React.ButtonHTMLAttributes<HTMLButtonElement>) => <button className={`btn ${variant ?? ''} ${size ?? ''} ${className}`} {...p} />;
/* a toneless note is guidance — it goes away in quiet mode; a warn/risk/good note is a fact and stays */
export const Note = ({ tone, children }: { tone?: 'warn' | 'risk' | 'good'; children: React.ReactNode }) => <div className={`note ${tone ?? 'guide'}`}>{children}</div>;
export const Empty = ({ title, body }: { title: string; body: string }) => <div className="empty text-center m-3 py-8"><div className="font-medium" style={{ color:'var(--ink-soft)' }}>{title}</div><div className="mt-1">{body}</div></div>;

export function Stats({ items }: { items: { label: string; value: React.ReactNode; tone?: 'warn' | 'risk' | 'good' }[] }) {
  return <div className="card grid mb-4" style={{ gridTemplateColumns:`repeat(${items.length}, minmax(0,1fr))` }}>{items.map(s => <div key={s.label} className="stat"><div className="l">{s.label}</div><div className={`n ${s.tone ?? ''}`}>{s.value}</div></div>)}</div>;
}

/** Any table, out as a real .xlsx. A parallel run needs it, and the mills and
    factories who are not users still get sent a sheet. Columns are declared, so
    what downloads is what the screen shows — not the raw record. Numbers go out
    as numbers and dates as dates, so the sheet sorts and sums on arrival instead
    of arriving as text. The writer is imported only when someone presses the
    button, so it costs nothing to the people who never do. */
export type CsvCol<T> = { label: string; get: (row: T) => string | number | null | undefined; width?: number };

const looksLikeDate = (v: string) => /^\d{4}-\d{2}-\d{2}(T|$)/.test(v);

export async function downloadXlsx<T>(filename: string, cols: CsvCol<T>[], rows: T[], sheetName = 'Sheet1') {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  /* one column definition drives the header, the width and the cell type */
  const columns = cols.map(c => {
    /* Type per cell, not per column: a column built with .toFixed() is a string
       whose every value is still a number, and Excel must be able to sum it. */
    const vals = rows.map(r => c.get(r)).filter(v => v != null && v !== '');
    const sample = vals[0];
    /* A column counts as numeric when every value in it reads as a number —
       `'6.5'` from a .toFixed() is still a number, and Excel has to sum it. */
    const numeric = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v.replace(/,/g, ''))));
    const isNum = vals.length > 0 && vals.every(numeric);
    const isDate = !isNum && typeof sample === 'string' && looksLikeDate(sample);
    return {
      width: c.width ?? Math.min(42, Math.max(12, c.label.length + 6)),
      header: { value: c.label, fontWeight: 'bold' as const, backgroundColor: '#ECE5D5', align: 'left' as const },
      cell: (row: T) => {
        const v = c.get(row);
        if (v == null || v === '') return null;
        if (isNum) { const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '')); return isNaN(n) ? String(v) : { value: n, type: Number as NumberConstructor }; }
        if (isDate) { const d = new Date(String(v)); return isNaN(d.getTime()) ? String(v) : { value: d, type: Date as DateConstructor, format: 'dd mmm yyyy' }; }
        return String(v);
      },
    };
  });
  await writeXlsxFile(rows, { columns, sheet: sheetName, stickyRowsCount: 1 })
    .toFile(`${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function ExportButton<T>({ filename, cols, rows, label = 'Export', sheetName }: { filename: string; cols: CsvCol<T>[]; rows: T[]; label?: string; sheetName?: string }) {
  const [busy, setBusy] = useState(false);
  return <Button size="sm" variant="ghost" disabled={busy || rows.length === 0}
    title={`${rows.length} row${rows.length === 1 ? '' : 's'} as an .xlsx — the header stays put and the numbers arrive as numbers`}
    onClick={async () => { setBusy(true); try { await downloadXlsx(filename, cols, rows, sheetName); } finally { setBusy(false); } }}>
    ↓ {busy ? 'Building…' : label}</Button>;
}

/** A number that can explain itself. Every derived figure in this tool comes
    from a rule; clicking it should show the rule and its inputs, not send you
    to a manual. */
export function Why({ children, rule, inputs }: { children: React.ReactNode; rule: string; inputs?: [string, React.ReactNode][] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);
  return <span ref={ref} style={{ position:'relative', display:'inline-block' }}>
    <button type="button" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
      style={{ font:'inherit', color:'inherit', background:'none', border:0, padding:0, cursor:'help', textDecoration:'underline dotted var(--ink-faint)', textUnderlineOffset: 3 }}>{children}</button>
    {open && <span className="text-[12px]" onClick={e => e.stopPropagation()} style={{ position:'absolute', zIndex: 20, top:'calc(100% + 6px)', left: 0, width: 'max(26ch, min(46ch, 70vw))', background:'var(--surface)', border:'1px solid var(--line)', borderRadius: 4, boxShadow:'var(--shadow)', padding:'10px 12px', display:'block', textAlign:'left', whiteSpace:'normal', fontWeight: 400, textTransform:'none', letterSpacing:'normal' }}>
      <span className="block" style={{ color:'var(--ink-soft)' }}>{rule}</span>
      {inputs?.length ? <span className="block mt-2 pt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
        {inputs.map(([k, v]) => <span key={k} className="flex justify-between gap-3 py-0.5"><span style={{ color:'var(--ink-faint)' }}>{k}</span><span className="mono" style={{ color:'var(--ink)' }}>{v}</span></span>)}
      </span> : null}
    </span>}
  </span>;
}

/** A long list paged instead of endlessly scrolled — pick a page size, slice
    the rows, and get a strip of Prev / page numbers / Next for free. Resets to
    page 1 whenever the row count changes under it (a filter, a search). */
export function usePager<T>(rows: T[], pageSize = 20) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const clamped = Math.min(page, pageCount);
  useEffect(() => { if (page !== clamped) setPage(clamped); }, [clamped]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = (clamped - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  return { page: clamped, setPage, pageCount, pageRows, from: rows.length ? start + 1 : 0, to: Math.min(start + pageSize, rows.length), total: rows.length };
}

/** A column heading that explains itself — hover or tap the mark, read what
    the column means and where the number comes from, without a legend at the
    bottom of the page nobody scrolls to. */
export function Th({ children, hint, num }: { children: React.ReactNode; hint?: string; num?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLTableCellElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);
  if (!hint) return <th className={num ? 'num' : undefined}>{children}</th>;
  return (
    <th ref={ref} className={num ? 'num' : undefined} style={{ position:'relative' }}>
      <span className="inline-flex items-center gap-1" style={{ cursor:'help' }} onClick={() => setOpen(o => !o)}>
        {children}
        <span aria-hidden className="qi" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:12, height:12, borderRadius:'50%', border:'1px solid var(--ink-faint)', fontSize:8, fontWeight:700, color:'var(--ink-faint)', lineHeight:1, opacity: open ? 1 : undefined }}>i</span>
      </span>
      {open && <div className="absolute z-10 text-[12px]" style={{ top:'calc(100% + 6px)', left:0, width:'max(22ch, min(40ch, 60vw))', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:4, boxShadow:'var(--shadow)', padding:'8px 10px', color:'var(--ink-soft)', fontWeight:400, textTransform:'none', letterSpacing:'normal', whiteSpace:'normal' }}>{hint}</div>}
    </th>
  );
}

export function Pager({ page, pageCount, onChange, from, to, total, noun = 'rows' }: { page: number; pageCount: number; onChange: (p: number) => void; from: number; to: number; total: number; noun?: string }) {
  if (pageCount <= 1) return null;
  const nums: (number | '…')[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return (
    <div className="pager no-print flex items-center justify-between gap-3 flex-wrap px-3 py-2.5" style={{ borderTop:'1px solid var(--line)' }}>
      <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{from}–{to} of {total} {noun}</span>
      <div className="flex items-center gap-1">
        <button type="button" className="btn ghost sm" disabled={page === 1} onClick={() => onChange(page - 1)}>‹ Prev</button>
        {nums.map((n, i) => n === '…'
          ? <span key={'e' + i} className="text-[11.5px] px-1" style={{ color:'var(--ink-faint)' }}>…</span>
          : <button key={n} type="button" className="btn ghost sm" onClick={() => onChange(n)}
              style={n === page ? { background:'var(--accent)', color:'var(--accent-ink)', borderColor:'var(--accent)' } : undefined}>{n}</button>)}
        <button type="button" className="btn ghost sm" disabled={page === pageCount} onClick={() => onChange(page + 1)}>Next ›</button>
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange, wrap }: { tabs: { id: string; label: string; count?: number; hint?: string }[]; active: string; onChange: (id: string) => void; wrap?: boolean }) {
  return <div className={`tabs${wrap ? ' wrap' : ''}`} role="tablist">{tabs.map(t => <button key={t.id} role="tab" aria-selected={t.id === active} title={t.hint ?? t.label} className={`tab ${t.id === active ? 'on' : ''}`} onClick={() => onChange(t.id)}>
    <span className="tab-l">{t.label}</span>{t.count != null && t.count > 0 && <span className="pill">{t.count}</span>}</button>)}</div>;
}

/** A filter you answer with one click — the alternative to stacking every cut
    of the same numbers down one long page. */
export function Seg<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string; hint?: string; count?: number }[]; value: T; onChange: (id: T) => void; label?: string }) {
  return <span className="inline-flex items-center gap-2">
    {label && <span className="label" style={{ margin:0 }}>{label}</span>}
    <span className="seg">{options.map(o => <button key={o.id} type="button" title={o.hint} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}{o.count != null && o.count > 0 && <span className="segn">{o.count}</span>}</button>)}</span>
  </span>;
}

/** A record open beside the list. Long ones (the concept record runs twelve
    sections) grow an index across the top: the section you came for is rarely
    the first. Sections register themselves, so no screen had to be rewritten. */
/* Everything that floats over the page — drawers, and the ⌘K palette — shares
   one stack, so exactly one thing answers Escape: the thing on top. Closing the
   vendor 360 returns you to the record you were reading, and closing the
   palette leaves that record open behind it. */
const drawerStack: symbol[] = [];
export function useOverlay(open: boolean) {
  const me = useRef<symbol>(null as unknown as symbol);
  if (me.current == null) me.current = Symbol('overlay');
  useEffect(() => { if (!open) return; const id = me.current; drawerStack.push(id);
    return () => { const i = drawerStack.lastIndexOf(id); if (i >= 0) drawerStack.splice(i, 1); }; }, [open]);
  return () => drawerStack[drawerStack.length - 1] === me.current;
}

const DRAWER_W = 'bsc-plm-drawer-share';   // a fraction, not pixels — old pixel values under the previous key are ignored
export function Drawer({ open, onClose, title, subtitle, back, children }: { open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; back?: { label: string; onClick: () => void }; children: React.ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  const onTop = useOverlay(open);
  const [sections, setSections] = useState<string[]>([]);
  const [here, setHere] = useState('');
  /* Half the window by default — a record is read beside the list it came from,
     not through a letterbox. Drag the left edge to change it; the width is
     remembered, because a person who wants it wide wants it wide every time. */
  /* remembered as a share of the window (0.35–0.9), so a width saved on a small
     screen does not come back as a sliver on a large one */
  const [width, setWidth] = useState(() => { const f = Number(localStorage.getItem(DRAWER_W)); const share = f > 0.3 && f <= 0.95 ? f : 0.5; return Math.max(380, Math.round(window.innerWidth * share)); });
  const drag = useRef<{ x: number; w: number } | null>(null);
  const clamp = (w: number) => Math.max(380, Math.min(window.innerWidth - 120, w));
  useEffect(() => {
    const move = (e: PointerEvent) => { if (!drag.current) return; setWidth(clamp(drag.current.w + (drag.current.x - e.clientX))); };
    const up = () => { if (!drag.current) return; drag.current = null; document.body.style.userSelect = ''; setWidth(w => { localStorage.setItem(DRAWER_W, String(Math.min(0.95, Math.max(0.3, w / window.innerWidth)))); return w; }); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);
  /* the window got smaller than the remembered width */
  useEffect(() => { const r = () => setWidth(w => clamp(w)); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  useEffect(() => { if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && onTop()) onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open, onClose, onTop]);
  useLayoutEffect(() => {
    if (!open) { setSections([]); return; }
    /* top-level sections only — a step that holds a BOM and a quote board
       inside it is one entry in the index, not three */
    const names = [...(body.current?.querySelectorAll('[data-section]') ?? [])]
      .filter(e => !e.parentElement?.closest('[data-section]'))
      .map(e => (e as HTMLElement).dataset.section!).filter(Boolean);
    setSections(prev => (prev.length === names.length && prev.every((n, i) => n === names[i]) ? prev : names));
  }, [open, children]);
  const jump = (name: string) => {
    const el = [...(body.current?.querySelectorAll('[data-section]') ?? [])].find(e => (e as HTMLElement).dataset.section === name) as HTMLElement | undefined;
    if (el?.dataset.collapsed === 'true') el.querySelector('button')?.click();   // jumping to a folded section opens it
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setHere(name);
  };
  if (!open) return null;
  return <>
    <div className="scrim" onClick={onClose} />
    <aside className="drawer" role="dialog" aria-modal="true" style={{ width }}>
      {/* the grab edge — drag to resize, double-click to go back to half */}
      <div className="drawer-grip no-print" role="separator" aria-orientation="vertical" aria-label="Drag to resize this panel"
        onPointerDown={e => { drag.current = { x: e.clientX, w: width }; document.body.style.userSelect = 'none'; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
        onDoubleClick={() => { setWidth(Math.round(window.innerWidth * 0.5)); localStorage.setItem(DRAWER_W, '0.5'); }}
        title="Drag to resize · double-click for half the screen" />
      <div className="px-5 py-4 sticky top-0" style={{ background:'var(--ground)', borderBottom:'1px solid var(--line)', zIndex:6 }}>
        {back && <button type="button" className="vlink text-[12.5px] mb-1.5 no-print" style={{ textDecoration:'none' }} onClick={back.onClick}>← Back to {back.label}</button>}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 style={{ fontSize: 22 }}>{title}</h2>{subtitle && <div className="mt-1 text-[12.5px] flex gap-2 items-center flex-wrap" style={{ color:'var(--ink-soft)' }}>{subtitle}</div>}</div>
          <div className="flex items-center gap-1 no-print" style={{ flex:'none' }}>
            <Button size="sm" variant="ghost" onClick={() => window.print()} title="Print this record — the job card and cut sheet go to the floor on paper">🖨</Button>
            <Button size="sm" variant="ghost" onClick={onClose}>{back ? '✕ Esc' : '✕ Esc'}</Button>
          </div>
        </div>
      </div>
      {sections.length >= 4 && <div className="drawer-index">
        {sections.map(n => <button key={n} type="button" className={here === n ? 'on' : ''} onClick={() => jump(n)}>{n}</button>)}
      </div>}
      <div ref={body} className="px-5 py-4 drawer-body">{children}</div>
    </aside>
  </>;
}

/** `owner` is the team whose step this is — shown beside the title so a reader
    can tell at a glance where the record is sitting, even when they can act. */
/** A block of one record, folded by default and labelled with its own state.
    Nothing had to be rewritten to get the label: this codebase already marks an
    unsettled thing with a warn/risk pill or note, so a section that contains one
    is a section with something outstanding in it. It says "pending" and opens
    itself; a settled section stays folded and out of the way. A screen that
    knows better can say so with `pending` or `defaultOpen`. */
/* a section card wears the colour of the team it is with — read from the owner
   pill it was given, so every drawer gets it without each call site changing */
const roleFromOwner = (owner: React.ReactNode): RoleId | null => {
  if (!React.isValidElement(owner)) return null;
  const label = (owner.props as { owner?: string }).owner; if (!label) return null;
  const hit = (Object.entries(ROLE_LABEL) as [RoleId, string][]).find(([, l]) => label.toLowerCase().startsWith(l.toLowerCase()));
  return hit ? hit[0] : null;
};
/* `look` picks which of the three kinds of block this is inside a record: the
   `lead` (a header band — "The call"), a `fold` (the list of other steps), the
   `tail` (files · conversation · activity). Default is a step card. */
export function Section({ title, right, owner, children, collapsible = true, defaultOpen, pending, ownerRole, look }: { title: React.ReactNode; right?: React.ReactNode; owner?: React.ReactNode; children: React.ReactNode; collapsible?: boolean; defaultOpen?: boolean; pending?: boolean; ownerRole?: RoleId | null; look?: 'lead' | 'fold' | 'tail' }) {
  const tint = ownerRole === undefined ? roleFromOwner(owner) : ownerRole;   // an explicit null means "mixed — no tint"
  const card = useRef<HTMLDivElement>(null);
  const [found, setFound] = useState<boolean | null>(null);
  const [open, setOpen] = useState<boolean | null>(defaultOpen ?? null);
  /* Runs after the DOM is committed but BEFORE the browser paints, so the
     section's first painted frame is already in its right state. The old
     30 ms timeout painted everything folded, then popped sections open — the
     layout jumped on every drawer. The card scans its whole subtree (the
     state pill usually sits in the header), minus the badge it adds itself. */
  useLayoutEffect(() => {
    if (pending !== undefined) return;
    const next = !!card.current?.querySelector('.pill.warn:not([data-pending-badge]), .pill.risk, .note.warn, .note.risk');
    setFound(prev => (prev === next ? prev : next));
  }, [children, right, pending]);
  const isPending = pending ?? found ?? false;
  /* until you touch it: open when something is outstanding, folded when not */
  /* closed until you open it — pending is a badge, not a reason to unfold */
  const shown = open ?? (defaultOpen ?? false);
  const shut = collapsible && !shown;
  /* `owner` is often an OwnerPill, which is itself a button — so it sits beside
     the toggle, never inside it. Only the chevron and the title are clickable. */
  const head = <div className="flex items-center gap-2 min-w-0">
    {collapsible && <span aria-hidden style={{ display:'inline-block', transform: shut ? 'none' : 'rotate(90deg)', transition:'transform .12s', fontSize: 9, color:'var(--ink-faint)' }}>▶</span>}
    <h3>{title}</h3>
    {isPending && <span className="pill warn" data-pending-badge>pending</span>}
  </div>;
  return <div ref={card} className={`card${tint ? ` role-tint role-${tint}` : ''}${look ? ` sec-${look}` : ''}`} data-section={typeof title === 'string' ? title : undefined} data-collapsed={shut ? 'true' : undefined}>
    {/* the toggle wraps only the title — `right` often carries its own buttons
        (an owner pill, an action) and a button inside a button is invalid HTML */}
    {collapsible
      ? <div className="sec-head flex items-center justify-between gap-2 pr-4" style={{ borderBottom: shut ? 0 : '1px solid var(--line-soft)' }}>
          <button type="button" aria-expanded={shown} onClick={() => { const next = !shown; setOpen(next);
              /* opening scrolls the section to the top of the drawer, so it reads from its heading down, not from wherever the click landed */
              if (next) requestAnimationFrame(() => { const el = card.current; if (!el) return; const d = el.closest('.drawer') as HTMLElement | null;
                if (!d) { el.scrollIntoView({ block:'start', behavior:'smooth' }); return; }
                const sticky = [...d.children].filter(x => getComputedStyle(x).position === 'sticky').reduce((a, x) => a + x.getBoundingClientRect().height, 0);
                d.scrollTo({ top: el.getBoundingClientRect().top - d.getBoundingClientRect().top + d.scrollTop - sticky - 8, behavior:'smooth' }); }); }}
            className="flex-1 flex items-center gap-2 px-4 py-2.5 cursor-pointer min-w-0"
            style={{ background:'transparent', border:0, font:'inherit', textAlign:'left' }}>
            {head}
          </button>
          {(owner || right) && <div className="flex items-center gap-2 flex-wrap justify-end py-1.5">{owner}{right}</div>}
        </div>
      : <div className="sec-head flex items-center justify-between gap-2 px-4 py-2.5" style={{ borderBottom:'1px solid var(--line-soft)' }}>{head}<div className="flex items-center gap-2 flex-wrap justify-end">{owner}{right}</div></div>}
    {/* kept in the DOM while folded so the state scan above stays honest */}
    <div className="sec-body px-4 py-2" hidden={shut}>{children}</div>
  </div>;
}

export function Toasts() {
  const toasts = useAppStore(s => s.toasts);
  const undoTo = useAppStore(s => s.undoTo);
  const depth = useAppStore(s => s.undoStack.length);
  return <div className="toast">{toasts.map(t => <div key={t.id} className={t.tone}>
    <span>{t.text}</span>
    {/* only while this toast's own change is still the last one */}
    {t.undo && t.undoAt != null && depth === t.undoAt + 1 && <button type="button" onClick={() => undoTo(t.undoAt! + 1)}
      style={{ marginLeft: 12, font:'inherit', fontSize: 12, fontWeight: 600, background:'transparent', border:0, borderBottom:'1px solid currentColor', color:'inherit', cursor:'pointer', padding:0 }}>Undo</button>}
  </div>)}</div>;
}

/** Twelve weeks of sales with the condition attached — a bar the week was out
    of stock is drawn hollow, because a zero with nothing to sell is not a zero
    of demand. */
export function Bars({ values, ok, unit = '', compact = false }: { values: number[]; ok?: boolean[]; unit?: string; compact?: boolean }) {
  const max = Math.max(1, ...values); const w = compact ? 7 : 14, gap = compact ? 3 : 4, h = compact ? 24 : 44;
  return (
    <svg viewBox={`0 0 ${values.length * (w + gap)} ${h + 14}`} width={values.length * (w + gap)} height={h + 14} role="img" aria-label={`${values.length}-week sales`}>
      {values.map((v, i) => { const bh = Math.max(2, (v / max) * h); const out = ok ? !ok[i] : false; return <g key={i}>
        <rect x={i * (w + gap)} y={h - bh} width={w} height={bh} rx="1" fill={out ? 'none' : 'var(--accent)'} stroke={out ? 'var(--risk)' : 'none'} strokeDasharray={out ? '2 2' : undefined} opacity={out ? .9 : .85} />
        <text x={i * (w + gap) + w / 2} y={h + 11} fontSize="8" textAnchor="middle" fill="var(--ink-faint)" fontFamily="var(--mono)">{i === values.length - 1 ? 'now' : i === 0 ? `-${values.length - 1}w` : ''}</text>
      </g>; })}
      <text x={values.length * (w + gap) - 2} y="9" fontSize="9" textAnchor="end" fill="var(--ink-faint)" fontFamily="var(--mono)">max {max}{unit}</text>
    </svg>
  );
}

export const dateInput = (iso: string | null | undefined) => iso ? iso.slice(0, 10) : '';
export const fromDateInput = (v: string) => v ? new Date(v + 'T09:00:00+05:30').toISOString() : null;

/** A demo list opens on a few worked examples, not the whole sheet. Up to `n`
    rows: the first is the most complete FINISHED record (`done` says what
    finished means for this list — closed, launched, live, received — and
    `score`, or a generic count of filled fields, says which is most complete),
    the rest taken one from each distinct `key` (a status, a stage, a health
    word) so the handful covers the states a reader should see. `?all=1` on the
    screen shows everything; the strip this returns is the line that says which
    view is showing and flips it. Rows come back in their original order, so
    the screen's sort still holds. */
const completeness = (v: unknown, depth = 0): number => {
  if (v == null || v === '' || v === false) return 0;
  if (Array.isArray(v)) return v.length ? 1 + (depth < 1 ? v.reduce<number>((n, x) => n + completeness(x, depth + 1), 0) / v.length : 0) : 0;
  if (typeof v === 'object') return depth > 1 ? 1 : Object.values(v as Record<string, unknown>).reduce<number>((n, x) => n + completeness(x, depth + 1), 0);
  return 1;
};
export function useExamples<T>(rows: T[], key: (r: T) => unknown, opts: { n?: number; score?: (r: T) => number; noun?: string; done?: (r: T) => boolean } = {}): { rows: T[]; all: boolean; total: number; strip: React.ReactNode; missingDone: boolean } {
  const { n = 4, score = completeness, noun = 'rows', done } = opts;
  const [params, setParams] = useSearchParams();
  const quiet = useAppStore(s => !!s.settings.quiet);
  const all = quiet || params.get('all') === '1';   // quiet mode shows the real list, no examples
  const { picked, missingDone } = useMemo(() => {
    const finished = done ? rows.filter(done) : [];
    const missing = !!done && finished.length === 0;
    if (rows.length <= n) return { picked: rows, missingDone: missing };
    const out = new Set<T>();
    /* first, what "done" looks like — the fullest finished record */
    if (finished.length) out.add(finished.slice().sort((a, b) => score(b) - score(a))[0]);
    const groups = new Map<string, T[]>();
    rows.forEach(r => { if (out.has(r)) return; const k = String(key(r)); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); });
    /* then one of each other state, best first, until the handful is full */
    const lists = [...groups.values()].map(g => g.slice().sort((a, b) => score(b) - score(a)));
    for (let i = 0; out.size < n; i++) { let any = false; for (const g of lists) { if (g[i] !== undefined && out.size < n) { out.add(g[i]); any = true; } } if (!any) break; }
    return { picked: rows.filter(r => out.has(r)), missingDone: missing };
  }, [rows, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (v: string | null) => { const q = new URLSearchParams(params); v ? q.set('all', v) : q.delete('all'); setParams(q, { replace: true }); };
  const strip = !quiet && (rows.length > n || missingDone) ? <span className="text-[12px] no-print ex-strip" style={{ color:'var(--ink-faint)' }}>{rows.length <= n ? null : all
    ? <>{rows.length} {noun} · <button type="button" className="vlink" onClick={() => set(null)}>show {Math.min(n, rows.length)} examples</button></>
    : <>{picked.length} worked examples{done && !missingDone ? ', one finished' : ''} · <button type="button" className="vlink" onClick={() => set('1')}>show all {rows.length}</button></>}
    {missingDone && <span data-missing-done title="the demo data has no finished record in this list"> · none finished yet</span>}</span> : null;
  return { rows: all ? rows : picked, all, total: rows.length, strip, missingDone };
}
