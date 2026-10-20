/* Notifications — every line anywhere in the tool that tagged you, behind one
   bell. Today a tag lives inside whichever thread it was written on, so the only
   way to know you were asked is to open the record and look. Marking one done
   does not delete it: it greys out and stays, because the person who asked
   should be able to see that you dealt with it. */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { mentionsFor, alertsFor, fmtAgo, daysAgo, stageOf, designFlowOf, launchOf, returnStatusOf, type MentionItem, type Alert } from '../domain/engines';
import type { Db } from '../domain/types';
import { PEOPLE, ROLE_LABEL } from '../domain/reference';
import { Pill } from '../ui';

const KIND_LABEL: Record<string, string> = { order:'Order', fabric:'Fabric', option:'RTW option', return:'Return', launch:'Launch', vendor:'Vendor', concept:'Concept', customer:'Customer' };
/* Which screen this opens, read off the link itself rather than guessed from
   kind — an "order" thread can land on MTM, the store, or the tracker. Same
   names as the sidebar, so "where" here means the same thing it means there. */
const SCREEN_LABEL: [string, string][] = [
  ['#/design', 'Requirements'], ['#/requests', 'Requirements'], ['#/concepts', 'Requirements'], ['#/requirements', 'Requirements'], ['#/fabrics', 'MTM fabric master'],
  ['#/health', 'RTW stock health'], ['#/insights', 'What is selling'], ['#/launches', 'RTW launches'],
  ['#/sourcing', 'Fabric sourcing'], ['#/mills', 'Fabric vendors · mills'], ['#/vendors', 'Factories & capacity'],
  ['#/mtm', 'MTM daily production'], ['#/factory', 'My factory · merchandiser'], ['#/tracker', 'RTW production tracker'],
  ['#/outbound', 'Outbound to factories'], ['#/otif', 'Delivery performance'],
  ['#/warehouse', 'Warehouse & unit'], ['#/grn', 'Goods received · GRN'], ['#/stores', 'My store'],
  ['#/design', 'Requirements'],
];
const screenOf = (href: string) => SCREEN_LABEL.find(([p]) => href.startsWith(p))?.[1] ?? 'Somewhere in the tool';
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
const dayGroup = (at: string) => { const d = daysAgo(at); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d <= 7 ? 'Earlier this week' : 'Older'; };

export function MentionBar() {
  const { db, personId, myRole, demoAll, storeId, resolveMention } = useApp();
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<'todo' | 'msgs'>('todo');
  const [range, setRange] = useState<'all' | 'week' | 'older'>('all');
  const box = useRef<HTMLDivElement>(null);
  const me = PEOPLE.find(p => p.id === personId);
  const items = mentionsFor(db, personId, me?.role ?? myRole, myRole);
  const unread = items.filter(m => !m.resolved);
  /* the other half of the bell: what the rules found, not what a person typed */
  /* your team's work only — walkthrough opens the screens, it does not hand you every team's list */
  const todo = alertsFor(db, myRole, { storeId, all: false });
  void demoAll;
  const waiting = unread.length + todo.length;

  /* click anywhere else and it closes, the way a notification panel should */
  useEffect(() => { if (!open) return; const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); }; }, [open]);

  const shown = items.filter(m => range === 'all' ? true : range === 'week' ? daysAgo(m.at) <= 7 : daysAgo(m.at) > 7);
  const groups: { day: string; rows: MentionItem[] }[] = [];
  shown.forEach(m => { const day = dayGroup(m.at); const g = groups.find(x => x.day === day) ?? (groups.push({ day, rows: [] }), groups[groups.length - 1]); g.rows.push(m); });

  return (
    /* The bar takes its own height rather than floating at zero: as an overlay it
       painted straight over the right-hand side of every page header, hiding the
       actions there — "+ Log an MTM concept" sat underneath it and could not be
       clicked. Sticky still keeps it in view as the page scrolls. */
    <div className="flex justify-end no-print mb-2" style={{ position:'sticky', top: 8, zIndex: 30 }}>
      <div ref={box} style={{ position:'relative' }}>
        <button type="button" onClick={() => setOpen(o => !o)} title={`${waiting} waiting on you`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[3px] cursor-pointer"
          style={{ background:'var(--surface)', border:'1px solid var(--line)', font:'inherit', fontSize: 12.5, color:'var(--ink-soft)' }}>
          <span style={{ fontSize: 13 }}>🔔</span>
          <span>Waiting on you</span>
          {waiting > 0 && <span className="mono" style={{ background:'var(--risk)', color:'#fff', borderRadius: 999, fontSize: 10, padding:'1px 6px' }}>{waiting}</span>}
        </button>

        {open && <div className="card" style={{ position:'absolute', right: 0, top: 38, width: 420, maxWidth:'92vw', zIndex: 40 }}>
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="m-0">Waiting on you</h3>
              <span className="text-[11px]" style={{ color:'var(--ink-faint)' }}>as <b style={{ color:'var(--ink-soft)' }}>{me?.name}</b> · {me ? ROLE_LABEL[me.role] : ''}</span>
            </div>
            <div className="seg mt-2" style={{ width:'100%' }}>
              <button type="button" className={pane === 'todo' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setPane('todo')}>Things to do {todo.length > 0 ? `· ${todo.length}` : ''}</button>
              <button type="button" className={pane === 'msgs' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setPane('msgs')}>Messages {unread.length > 0 ? `· ${unread.length}` : ''}</button>
            </div>
            {pane === 'todo' && todo.length > 0 && <div className="text-[11.5px] mt-2" style={{ color:'var(--ink-faint)' }}>Grouped by the job. Each line is one record; Open takes you to where the job is done.</div>}
            {pane === 'msgs' && <div className="seg mt-2" style={{ width:'100%' }}>
              {([['all', `All ${items.length}`], ['week', 'This week'], ['older', 'Earlier']] as const).map(([k, label]) =>
                <button key={k} type="button" className={range === k ? 'on' : ''} style={{ flex: 1 }} onClick={() => setRange(k)}>{label}</button>)}
            </div>}
          </div>

          <div style={{ maxHeight: '60vh', overflowY:'auto', borderTop:'1px solid var(--line-soft)' }}>
            {pane === 'todo' && (todo.length === 0
              ? <div className="px-3 py-4 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing is waiting on you. Every rule the tool runs is satisfied for your team right now.</div>
              : <AlertGroups todo={todo} onGo={() => setOpen(false)} />)}
            {pane === 'msgs' && groups.length === 0 && <div className="px-3 py-4 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing here.</div>}
            {pane === 'msgs' &&
            groups.map(g => <div key={g.day}>
              <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-[.1em]" style={{ color:'var(--ink-faint)', fontFamily:'var(--mono)' }}>{g.day}</div>
              {g.rows.map(m => { const done = !!m.resolved; return (
                <div key={m.commentId} className="flex items-start gap-2 px-3 py-2.5" style={{ borderTop:'1px solid var(--line-soft)', background: done ? 'transparent' : 'var(--surface-2)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: done ? 'transparent' : 'var(--risk)', flex:'none', marginTop: 7 }} />
                  <span className="mono" style={{ flex:'none', width: 28, height: 28, borderRadius: 999, background: done ? 'var(--surface-3)' : 'var(--accent)', color: done ? 'var(--ink-faint)' : 'var(--accent-ink)', fontSize: 10.5, display:'flex', alignItems:'center', justifyContent:'center' }}>{initials(m.who)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <Pill tone="accent">{screenOf(m.href)}</Pill>
                      <span className="text-[11px] font-medium" style={{ color:'var(--ink-soft)' }}>{KIND_LABEL[m.kind] ?? m.kind} · {m.label}</span>
                    </div>
                    <button type="button" onClick={() => { window.location.hash = m.href; setOpen(false); }}
                      className="block text-left w-full bg-transparent border-0 p-0 cursor-pointer"
                      style={{ font:'inherit', fontSize: 12.5, lineHeight: 1.4, color: done ? 'var(--ink-faint)' : 'var(--ink)', fontWeight: done ? 400 : 500 }}>
                      {m.text}
                    </button>
                    <div className="text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color:'var(--ink-faint)' }}>
                      <span>{fmtAgo(m.at)}</span>
                      <span>· from {m.who}</span>
                      {m.step && <span>· {m.step}</span>}
                    </div>
                    <div className="mt-1 flex gap-2">
                      <button type="button" className="vlink text-[11px]" onClick={() => { window.location.hash = m.href; setOpen(false); }}>Open the record</button>
                      <button type="button" className="vlink text-[11px]" style={{ color: done ? 'var(--ink-faint)' : 'var(--good)' }}
                        onClick={() => resolveMention(m.commentId, !done)}>{done ? `Resolved ${fmtAgo(m.resolved!.at)} · undo` : 'Mark resolved'}</button>
                    </div>
                  </div>
                </div>); })}
            </div>)}
          </div>

          {pane === 'msgs' && unread.length > 0 && <div className="px-3 py-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
            <button type="button" className="vlink text-[11.5px]" onClick={() => unread.forEach(m => resolveMention(m.commentId, true))}>Mark all {unread.length} resolved</button>
          </div>}
        </div>}
      </div>
    </div>
  );
}

/** One rule-detected condition: what it is, what it costs, and the record that
    settles it. Nothing to mark done — fix the record and the line goes away. */
/* An alert's title is "<record> · <what is wanted>". The panel groups by the
   second half and says it as a job in plain words, so thirty lines read as
   six jobs — "Give a new cut ratio · 4 styles" — not thirty riddles. */
const JOB_WORDS: [RegExp, string][] = [
  [/modified ratio|cut ratio|cut short/i, 'Give a new cut ratio'], [/factory proposed/i, 'Accept the factory, or send it back'],
  [/still owed/i, 'Send the factory its documents'], [/raise the PO|push PO|to push PO/i, 'Raise the purchase order'],
  [/choose the cloth|option.*to choose/i, 'Choose the cloth'], [/sample waiting/i, 'Review the sample'],
  [/stores not told|swatches out/i, 'Tell the stores'], [/extension/i, 'Answer the extension ask'],
  [/add vendor/i, 'Add a vendor'], [/mill check/i, 'Ask the mill this week'], [/block (expired|expiring)/i, 'Renew or release the block'],
  [/fabric short|cloth short/i, 'Cover the fabric shortfall'], [/confirm the fabric/i, 'Confirm the fabric landed'],
  [/marketing brief/i, 'Send the marketing brief'], [/launch date/i, 'Launch is overdue'], [/refund/i, 'Approve the refund'],
  [/goods-received/i, 'Pick up the GRNs'], [/short at/i, 'Resolve the short STO'], [/open \d+d/i, 'Close the STO'],
  [/count in/i, 'Count the parcels in'], [/ship-by/i, 'Tell the customer the new date'], [/closed for selling/i, 'Stop offering the closed fabric'],
  [/asked for/i, 'Answer the stock request'], [/swatch not cut|not cut/i, 'Cut the swatches'], [/reprint/i, 'Reprint the sticker'],
];
/* Which workflow the line belongs to and where that record stands right now,
   read off the link the rule left — so "modified ratio needed" arrives as
   "RTW style · step 4 of 6 · Fabric in", not as a bare instruction. */
function contextOf(db: Db, a: Alert): { flow: string; stage: string | null } {
  const [path, qs] = a.href.replace(/^#/, '').split('?'); const q = new URLSearchParams(qs ?? ''); const id = q.get('open');
  const o = id ? db.orders.find(x => x.id === id) : null;
  if (o) { const so = o.poNo ? stageOf(o) : null; const st = so ? `${so.stage}${so.next ? ` → next ${so.next}` : ''}` : null; const f = designFlowOf(db, { kind:'order', o }); const i = f.steps.findIndex(x => x.key === f.now.key);
    return { flow: 'RTW style', stage: st ?? `step ${i + 1} of ${f.steps.length} · ${f.now.label}` }; }
  const c = id ? (db.concepts ?? []).find(x => x.id === id) : null;
  if (c) { const f = designFlowOf(db, { kind:'concept', c }); const i = f.steps.findIndex(x => x.key === f.now.key);
    const mtm = f.mtmStage ? ({ 1:'Requirement requested', 2:'Vendor added', 3:'PO punched', 4:'Fabric in', 5:'Live online' } as const)[f.mtmStage] : null;
    return { flow: path.startsWith('/swatches') ? 'Swatch desk' : 'MTM fabric ask', stage: mtm ? `${f.mtmStage} of 5 · ${mtm}` : `step ${i + 1} of ${f.steps.length} · ${f.now.label}` }; }
  const l = id ? (db.launches ?? []).find(x => x.id === id) : null;
  if (l) return { flow: 'RTW launch', stage: launchOf(l).stage };
  const r = id ? (db.returns ?? []).find(x => x.id === id) : null;
  if (r) return { flow: 'Return case', stage: returnStatusOf(r).label ?? r.stage };
  const req = id ? (db.optionRequests ?? []).find(x => x.id === id) : null;
  if (req) return { flow: 'Fabric options request', stage: null };
  const FLOW: [string, string][] = [['/swatches', 'Swatch desk'], ['/fabrics', 'Fabric master'], ['/mills', 'Fabric vendors'], ['/warehouse', 'Warehouse'], ['/grn', 'Goods received'], ['/refunds', 'Refunds'], ['/stores', 'Store floor'], ['/mtm', 'MTM production'], ['/health', 'Stock health'], ['/planning', 'Planning'], ['/factory', 'Factory'], ['/sourcing', 'Sourcing desk'], ['/design', 'Design desk'], ['/tracker', 'RTW production']];
  return { flow: FLOW.find(([p]) => path.startsWith(p))?.[1] ?? 'PLM', stage: null };
}
function splitAlert(a: Alert) {
  const i = a.title.indexOf(' · ');
  const record = i > 0 ? a.title.slice(0, i) : a.title;
  const what = i > 0 ? a.title.slice(i + 3) : a.detail;
  const job = JOB_WORDS.find(([re]) => re.test(what) || re.test(a.detail))?.[1] ?? what.charAt(0).toUpperCase() + what.slice(1);
  return { record, what, job };
}
function AlertGroups({ todo, onGo }: { todo: Alert[]; onGo: () => void }) {
  const groups: { job: string; rows: (Alert & { record: string; what: string })[] }[] = [];
  todo.forEach(a => { const { record, what, job } = splitAlert(a); const g = groups.find(x => x.job === job) ?? (groups.push({ job, rows: [] }), groups[groups.length - 1]); g.rows.push({ ...a, record, what }); });
  groups.sort((x, y) => Math.max(...y.rows.map(r => r.weight)) - Math.max(...x.rows.map(r => r.weight)));
  return <>{groups.map(g => { const urgent = g.rows.filter(r => r.level === 'critical').length; return <div key={g.job}>
    <div className="flex items-center gap-2 px-3 pt-3 pb-1.5" style={{ borderTop:'1px solid var(--line-soft)' }}>
      <span className="text-[12.5px] font-semibold" style={{ color:'var(--ink)' }}>{g.job}</span>
      <span className="pill">{g.rows.length}</span>
      {urgent > 0 && <span className="pill risk">{urgent} urgent</span>}
    </div>
    {g.rows.map(a => <AlertRow key={a.id} a={a} onGo={onGo} />)}
  </div>; })}</>;
}
function AlertRow({ a, onGo }: { a: Alert & { record?: string; what?: string }; onGo: () => void }) {
  const { db } = useApp();
  const tone = a.level === 'critical' ? 'var(--risk)' : a.level === 'warn' ? 'var(--warn)' : 'var(--ink-faint)';
  const ctx = contextOf(db, a);
  return (
    <button type="button" onClick={() => { window.location.hash = a.href; onGo(); }}
      className="w-full text-left flex items-center gap-2 px-3 py-2 cursor-pointer alert-row"
      style={{ background:'transparent', border: 0, font:'inherit' }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: tone, flex:'none' }} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 flex-wrap"><span className="text-[12.5px] font-medium" style={{ color:'var(--ink)' }}>{a.record ?? a.title}</span><span className="pill" style={{ fontSize: 10 }}>{ctx.flow}</span></span>
        {ctx.stage && <span className="block text-[11px] mono" style={{ color:'var(--ink-soft)' }}>now · {ctx.stage}</span>}
        <span className="block text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{a.detail}</span>
      </span>
      <span className="cta" style={{ flex:'none' }}>Open →</span>
    </button>
  );
}
