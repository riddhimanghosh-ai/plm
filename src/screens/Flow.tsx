/* The journey, as a header on the record you already opened. Design thinks in
   six steps — I asked, sourcing brought vendors, I chose, I raised the PO, the
   cloth came in, it was sampled, I put it live — while the record below is
   organised by team. This is that line, drawn over the top: no second screen,
   no second copy of the data, just the same record with a header that says how
   far it has come and whose move is next. */
import { Fragment } from 'react';
import { useApp } from '../store';
import { designFlowOf, type DesignItem, type DesignStep } from '../domain/engines';
import { ROLE_LABEL } from '../domain/reference';

export function Stepper({ steps, compact = false }: { steps: DesignStep[]; compact?: boolean }) {
  return <div className="flex items-center gap-1 flex-wrap">
    {steps.map((s, i) => <Fragment key={s.key}>
      {i > 0 && <span style={{ width: compact ? 8 : 16, height: 1, background: s.state === 'later' ? 'var(--line)' : 'var(--good)', display:'inline-block' }} />}
      <span title={`${s.label} — ${s.note}`} className="inline-flex items-center gap-1.5">
        <span className="dot" style={{ width: s.state === 'now' ? 11 : 8, height: s.state === 'now' ? 11 : 8, background: s.state === 'done' ? 'var(--good)' : s.state === 'now' ? 'var(--accent)' : 'var(--line)', boxShadow: s.state === 'now' ? '0 0 0 3px var(--accent-soft)' : undefined }} />
        {!compact && <span className="text-[11.5px]" style={{ color: s.state === 'now' ? 'var(--ink)' : s.state === 'done' ? 'var(--ink-soft)' : 'var(--ink-faint)', fontWeight: s.state === 'now' ? 600 : 400 }}>{s.label}</span>}
      </span>
    </Fragment>)}
  </div>;
}

/** The header itself: the six dots, then the one thing that happens next. */
export function FlowHeader({ item }: { item: DesignItem }) {
  const { db } = useApp();
  const f = designFlowOf(db, item);
  return <div className="px-1 pb-2">
    <StepFlow steps={f.steps} />
  </div>;
}

/** "Waiting on me" for a list screen — the same rule the header uses. */
export const isMyTurn = (db: Parameters<typeof designFlowOf>[0], item: DesignItem, role: string) => {
  const f = designFlowOf(db, item);
  return f.now.state === 'now' && (f.now.owner === role || role === 'owner');
};

/** The same six steps as connected blocks: left to right, then down and back right to
    left, the way the TNA reads on the tracker. Click a block to open that step. */
export function StepFlow({ steps, onJump, cols = 3 }: { steps: DesignStep[]; onJump?: (key: DesignStep['key']) => void; cols?: number }) {
  const rows: DesignStep[][] = []; for (let i = 0; i < steps.length; i += cols) rows.push(steps.slice(i, i + cols));
  const colour = (s: DesignStep) => s.state === 'done' ? 'var(--good)' : s.state === 'now' ? 'var(--accent)' : 'var(--line)';
  const faint = { color: 'var(--ink-faint)' } as const;
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: 28, rowGap: 26 }}>
    {rows.flatMap((row, ri) => { const rev = ri % 2 === 1; const cells = rev ? [...row].reverse() : row; const pad = cols - row.length;
      return cells.map((s, ci) => { const idx = ri * cols + (rev ? row.length - 1 - ci : ci); const lastInRow = rev ? ci === 0 : ci === row.length - 1; const hasNext = idx < steps.length - 1; const col = colour(s);
        const hArrow = hasNext && !lastInRow; const vArrow = hasNext && lastInRow;
        return <div key={s.key} style={{ position: 'relative', gridColumn: rev ? ci + 1 + pad : undefined }}>
          <button type="button" onClick={() => onJump?.(s.key)} className="text-left w-full" style={{ border: `1.5px solid ${col}`, borderRadius: 8, padding: '8px 10px', minHeight: 84, background: s.state === 'now' ? 'color-mix(in srgb, var(--accent) 7%, #fff)' : s.state === 'done' ? 'color-mix(in srgb, var(--good) 6%, #fff)' : '#fff', cursor: onJump ? 'pointer' : 'default' }}>
            <div className="flex items-center gap-2"><span className="mono text-[10px]" style={{ color: s.state === 'later' ? 'var(--ink-faint)' : col, fontWeight: 700 }}>{String(idx + 1).padStart(2, '0')}</span><span className="font-medium text-[12.5px] truncate">{s.label}</span>
              {s.state === 'done' && <span className="pill good ml-auto" style={{ fontSize: 10 }}>done</span>}{s.state === 'now' && <span className="pill accent ml-auto" style={{ fontSize: 10 }}>now</span>}</div>
            <div className="text-[10.5px] mt-0.5" style={faint}>{ROLE_LABEL[s.owner]}</div>
            <div className="text-[11px] mt-1" style={{ color: s.state === 'later' ? 'var(--ink-faint)' : 'var(--ink-soft)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.state === 'now' && s.action ? <b style={{ color: 'var(--ink)' }}>{s.action}</b> : s.note}</div>
          </button>
          {hArrow && <span style={{ position: 'absolute', top: '50%', [rev ? 'left' : 'right']: -28, width: 28, height: 0, borderTop: `2px solid ${col}`, transform: 'translateY(-1px)' }}><span style={{ position: 'absolute', top: -5, [rev ? 'left' : 'right']: -1, borderTop: '4.5px solid transparent', borderBottom: '4.5px solid transparent', [rev ? 'borderRight' : 'borderLeft']: `7px solid ${col}` }} /></span>}
          {vArrow && <span style={{ position: 'absolute', left: '50%', bottom: -26, height: 26, width: 0, borderLeft: `2px solid ${col}`, transform: 'translateX(-1px)' }}><span style={{ position: 'absolute', bottom: -1, left: -5, borderLeft: '4.5px solid transparent', borderRight: '4.5px solid transparent', borderTop: `7px solid ${col}` }} /></span>}
        </div>; }); })}
  </div>;
}
