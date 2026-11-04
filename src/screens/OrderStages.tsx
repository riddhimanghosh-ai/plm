/* An order's stages as a pop-up from an (i) next to the order number, so the
   drawer stays short: every stage with its scan, and the four pre-production
   desks under PP · planned with who took each up and finished it. */
import { Fragment, useEffect, useRef, useState } from 'react';
import type { CustomerOrder } from '../domain/types';
import { MTM_STAGES } from '../domain/reference';
import { fmtDate, fmtTime, prepOf } from '../domain/engines';
import { Pill } from '../ui';

const stageLabel = (id: string) => MTM_STAGES.find(s => s.id === id)?.label ?? id;

export function StagesList({ o }: { o: CustomerOrder }) {
  return <>
      {MTM_STAGES.map(s => { const sc = o.scans.find(x => x.stage === s.id); const isNow = o.stage === s.id; const done = !!sc || (s.id === 'punched') || (s.id === 'pp' && o.stage !== 'punched'); return (
        <Fragment key={s.id}><div className="kv"><span className="k flex items-center gap-2"><span className="dot" style={{ background: done ? 'var(--good)' : isNow ? 'var(--warn)' : 'var(--line)' }} />{s.label}<span className="text-[11px]">· {s.who}</span></span>
          <span className="v" style={{ color: sc ? undefined : 'var(--ink-faint)' }}>{sc ? `${fmtDate(sc.at)} · ${sc.by}` : s.id === 'punched' ? fmtDate(o.punchedOn) : s.scan ?? '—'}</span></div>
        {/* after planning, the four pre-production desks at the unit, each with who took it up and finished it */}
        {s.id === 'planned' && prepOf(o).steps.map(p => { const bl = o.prepBlocked?.[p.key]; const e = p.entry; return (
          <div key={p.key} className="kv" style={{ paddingLeft: 18 }}><span className="k flex items-center gap-2"><span className="dot" style={{ background: bl ? 'var(--risk)' : p.state === 'done' ? 'var(--good)' : p.state === 'in progress' ? 'var(--warn)' : 'var(--line)' }} />{p.label}<span className="text-[11px]">· {p.team}</span></span>
            <span className="v" style={{ color: e || bl ? undefined : 'var(--ink-faint)' }}>{bl ? <span style={{ color:'var(--risk)' }}>blocked · {bl.reason}</span> : e?.doneOn ? `${fmtTime(e.takenOn)} → ${fmtTime(e.doneOn)} · ${e.doneBy}` : e ? `taken up ${fmtTime(e.takenOn)} · ${e.takenBy}` : p.state === 'done' ? 'done' : 'pending'}</span></div>); })}
        </Fragment>); })}
  </>;
}

/** the (i) button: click opens the stages beside it; click outside or Esc closes */
export function StagesInfo({ o }: { o: CustomerOrder }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!at) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setAt(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAt(null); } };
    window.addEventListener('mousedown', close); window.addEventListener('keydown', esc, true);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc, true); }; }, [at]);
  const W = Math.min(900, window.innerWidth - 32);   // wide, so each stage sits on one line and the list barely scrolls
  return <>
    <button type="button" aria-label={`Stages of ${o.orderNo}`} title="Stages" className="ml-1 align-middle"
      style={{ width: 18, height: 18, borderRadius: 9, border: '1px solid var(--line)', fontSize: 11, lineHeight: '16px', color: 'var(--ink-soft)', background: 'var(--surface)', cursor: 'pointer', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
      onClick={e => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setAt(at ? null : { x: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)), y: r.bottom + 6 }); }}>i</button>
    {at && <div ref={box} onClick={e => e.stopPropagation()} className="card stages-pop" style={{ position: 'fixed', left: at.x, top: Math.min(at.y, window.innerHeight - 120), width: W, maxHeight: `calc(100vh - ${Math.min(at.y, window.innerHeight - 120) + 12}px)`, overflowY: 'auto', zIndex: 80, padding: '10px 14px', boxShadow: '0 12px 40px rgb(0 0 0/.18)', fontFamily: 'var(--body)', fontSize: 13, fontVariantNumeric: 'normal', textAlign: 'left', whiteSpace: 'normal' }}>
      <div className="flex items-center justify-between pb-1"><b className="mono text-[13px]">{o.orderNo} · stages</b><Pill tone="neutral">{stageLabel(o.stage)}</Pill></div>
      <StagesList o={o} />
    </div>}
  </>;
}
