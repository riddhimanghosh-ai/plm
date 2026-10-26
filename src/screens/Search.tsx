/* ⌘K — one box that finds anything by the name a person would actually say:
   a PO number, a fabric code, a customer, a style, a mill. Today that search is
   "which sheet was it in?", and the answer depends on who you ask. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import { useOverlay } from '../ui';
import { STORES } from '../domain/reference';
import { MTM_ONLY, isRtwHref, OPTIONS_OFF } from '../domain/edition';

type Hit = { kind: string; title: string; detail: string; href: string };

export function CommandSearch() {
  const { db } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const onTop = useOverlay(open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o); setQ(''); setSel(0); }
      /* the palette sits above any open record: it is top of the overlay stack
         while it is open, so Escape closes it and leaves the record alone */
      else if (e.key === 'Escape' && open && onTop()) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onTop]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 10); }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [open]);

  /* one flat index, built once — the tool is small enough that a filter beats a search engine */
  const index = useMemo<Hit[]>(() => {
    const out: Hit[] = [];
    db.orders.forEach(o => out.push({ kind:'Bulk PO', title: `${o.poNo ?? 'no PO yet'} · ${o.styleName}`, detail: `${o.category} · ${o.orderQty} pcs · ${o.status}`, href: `#/tracker?open=${o.id}` }));
    (db.customerOrders ?? []).forEach(o => out.push({ kind: o.kind === 'MTM' ? 'MTM order' : 'RTW order', title: `${o.orderNo} · ${o.customer}`, detail: `${o.styleName} · ${o.stage}`, href: o.kind === 'MTM' ? `#/mtm?open=${o.id}` : `#/stores?tab=rtw-orders&open=${o.id}` }));
    db.fabrics.forEach(f => out.push({ kind:'Fabric', title: `${f.name} · ${f.code}`, detail: `${f.family} · ${f.bucket.toLowerCase().replace('_', '-')}`, href: `#/fabrics?open=${f.id}` }));
    db.options.forEach(o => out.push({ kind:'RTW option', title: o.styleName, detail: `${o.subCat1}${o.core ? ' · core' : ''}`, href: `#/health?open=${o.id}` }));
    /* a mill's 360 opens from the mills screen, a factory's from the factories
        screen — sending both to /vendors bounced sourcing off a production route */
    db.vendors.forEach(v => { const mill = v.kind.endsWith('mill');
      out.push({ kind: mill ? 'Mill' : 'Factory', title: v.name, detail: `${v.kind} · ${v.location}`, href: `#/${mill ? 'mills' : 'vendors'}?vendor=${v.id}` }); });
    (db.concepts ?? []).forEach(c => (c.designs ?? []).forEach(d => out.push({ kind:'Design', title: `${d.code} · ${d.finalName ?? d.name}`, detail: `on ${db.fabrics.find(f => f.id === c.fabricId)?.name ?? c.naming.newName ?? c.name}`, href: `#/design?open=${c.id}` })));
    (db.concepts ?? []).forEach(c => out.push({ kind:'Concept', title: c.naming.newName ?? c.name, detail: c.kind === 'new-fabric' ? 'new fabric' : 'construction', href: `#/design?open=${c.id}` }));
    db.returns.forEach(r => out.push({ kind:'Return', title: `${r.caseNo} · ${r.styleName}`, detail: `${r.reason} · ${r.wants}`, href: `#/stores?tab=returns&open=${r.id}` }));
    (db.launches ?? []).forEach(l => out.push({ kind:'Launch', title: l.styleName, detail: `${l.dropMonth} drop`, href: `#/launches?open=${l.id}` }));
    [...new Set((db.customerOrders ?? []).map(o => o.customer))].forEach(c => out.push({ kind:'Customer', title: c, detail: 'every order, measurements, returns', href: `#/stores?tab=customers&open=cust:${encodeURIComponent(c)}` }));
    STORES.forEach(st => out.push({ kind:'Store', title: st.name, detail: st.region, href: `#/stores` }));
    return out.filter(r => !MTM_ONLY || (!isRtwHref(r.href) && r.kind !== 'Bulk PO' && r.kind !== 'RTW option' && r.kind !== 'RTW order' && r.kind !== 'Launch')).filter(r => !OPTIONS_OFF || r.kind !== 'Request');
  }, [db]);

  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return index.filter(h => h.title.toLowerCase().includes(t) || h.detail.toLowerCase().includes(t) || h.kind.toLowerCase().includes(t)).slice(0, 12);
  }, [q, index]);

  const go = (h: Hit) => { window.location.hash = h.href; setOpen(false); };
  if (!open) return null;

  return (
    <div style={{ position:'fixed', inset: 0, zIndex: 80, background:'rgb(10 10 10/.32)', display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'12vh' }}>
      <div ref={box} className="card" style={{ width:'min(680px, 92vw)', overflow:'hidden' }}>
        <input ref={input} className="input" value={q} placeholder="Find a PO, a fabric code, a customer, a style, a mill…"
          onChange={e => { setQ(e.target.value); setSel(0); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(i => Math.min(i + 1, hits.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(i => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter' && hits[sel]) { e.preventDefault(); go(hits[sel]); }
          }}
          style={{ border: 0, borderBottom: '1px solid var(--line)', borderRadius: 0, fontSize: 16, padding: '14px 16px' }} />
        <div style={{ maxHeight: '52vh', overflowY:'auto' }}>
          {!q.trim() && <div className="px-4 py-3 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Type to search every record in the tool. ↑↓ to move, Enter to open, Esc to close.</div>}
          {q.trim() && hits.length === 0 && <div className="px-4 py-3 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing matches “{q}”.</div>}
          {hits.map((h, i) => <button key={h.href + i} type="button" onClick={() => go(h)} onMouseEnter={() => setSel(i)}
            className="w-full text-left flex items-center gap-3 px-4 py-2.5 cursor-pointer"
            style={{ background: i === sel ? 'var(--accent-soft)' : 'transparent', border: 0, borderTop: '1px solid var(--line-soft)', font:'inherit' }}>
            <span className="pill" style={{ flex:'none' }}>{h.kind}</span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium" style={{ color:'var(--ink)' }}>{h.title}</span>
              <span className="block text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{h.detail}</span>
            </span>
          </button>)}
        </div>
      </div>
    </div>
  );
}

/** The hint that the box exists at all — a dead keycap in the sidebar. */
export function SearchHint() {
  return <button type="button" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key:'k', metaKey:true }))}
    className="flex items-center justify-between gap-2 w-full px-2.5 py-2 cursor-pointer"
    style={{ background:'rgb(255 255 255/.06)', border:'1px solid rgb(255 255 255/.12)', borderRadius: 3, color:'var(--sidebar-soft)', font:'inherit', fontSize: 13 }}>
    <span>Search anything</span><span className="mono" style={{ fontSize: 11, opacity:.8 }}>⌘K</span>
  </button>;
}
