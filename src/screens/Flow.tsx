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

/** The steps as one compact row of connected chips: number, name, state. The step open below is
    outlined; hover a chip for who owns it and where it stands; click to open it. */
export function StepFlow({ steps, onJump, active }: { steps: DesignStep[]; onJump?: (key: DesignStep['key']) => void; active?: DesignStep['key'] | null; cols?: number }) {
  const colour = (s: DesignStep) => s.state === 'done' ? 'var(--good)' : s.state === 'now' ? 'var(--accent)' : 'var(--line)';
  return <div className="flex items-stretch flex-wrap" style={{ rowGap: 8 }}>
    {steps.map((s, i) => { const col = colour(s); const on = active ? active === s.key : s.state === 'now';
      return <Fragment key={s.key}>
        {i > 0 && <span aria-hidden className="self-center" style={{ width: 14, height: 2, background: steps[i - 1].state === 'done' ? 'var(--good)' : 'var(--line)', flexShrink: 0 }} />}
        <button type="button" onClick={() => onJump?.(s.key)} title={`${s.label} · ${ROLE_LABEL[s.owner]} · ${s.note}`}
          className="text-left" style={{ flex: '1 1 0', minWidth: 92, maxWidth: 190, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 7, cursor: onJump ? 'pointer' : 'default',
            border: `1.5px solid ${on ? 'var(--accent)' : s.state === 'later' ? 'var(--line)' : col}`, boxShadow: on ? '0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent)' : undefined,
            background: s.state === 'done' ? 'color-mix(in srgb, var(--good) 8%, #fff)' : s.state === 'now' ? 'color-mix(in srgb, var(--accent) 8%, #fff)' : '#fff' }}>
          <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: s.state === 'later' ? 'var(--ink-faint)' : col, flexShrink: 0 }}>{s.state === 'done' ? '✓' : String(i + 1).padStart(2, '0')}</span>
          <span style={{ fontSize: 12, lineHeight: 1.2, fontWeight: s.state === 'now' || on ? 600 : 500, color: s.state === 'later' ? 'var(--ink-soft)' : 'var(--ink)' }}>{s.label}</span>
        </button>
      </Fragment>; })}
  </div>;
}
