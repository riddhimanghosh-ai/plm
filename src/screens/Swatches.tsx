/* The swatch desk: the MTM_Swatches tracker as a list. One row a fabric, every
   step a checkbox the warehouse ticks as the cloth moves; ticking records who and
   when. A row opens the fabric's requirement, the one screen where the whole
   journey sits, so there is no second record to keep in step. */
import { useMemo, useState } from 'react';
import { useApp } from '../store';
import type { Concept } from '../domain/types';
import { fmtDate, daysAgo, conceptOf } from '../domain/engines';
import { Page, Card, Pill, Seg, Th, Button, Section, useExamples } from '../ui';
import { MTM_ONLY } from '../domain/edition';

type Step = 'inward' | 'handover' | 'cut' | 'sticker' | 'dispatched' | 'photos' | 'storesTold';
/* The warehouse is two people. Shravani receives the cloth, ships, and keeps the
   tracker. Yusuf runs the swatch desk: he gets the product code and the sticker,
   cuts the 25 × 25 swatches for every store, and sends the photos. */
const ALL_STEPS: { key: Step; label: string; owner: 'warehouse' | 'design'; who: string }[] = [
  { key:'inward',     label:'Bulk received',   owner:'warehouse', who:'Shravani' },
  { key:'handover',   label:'Handed to Yusuf', owner:'warehouse', who:'Shravani' },
  { key:'cut',        label:'Swatches cut',    owner:'warehouse', who:'Yusuf' },
  { key:'sticker',    label:'Sticker printed', owner:'warehouse', who:'Yusuf' },
  { key:'photos',     label:'Photos shared',   owner:'warehouse', who:'Yusuf' },
  { key:'dispatched', label:'Dispatched',      owner:'warehouse', who:'Shravani' },
  { key:'storesTold', label:'Stores told',     owner:'design',    who:'Design' },
];
/* phase one of the MTM edition runs the desk only up to the handover to Yusuf; the cut, sticker, dispatch and stores told come in the next phase */
export const SWATCH_STEPS = MTM_ONLY ? ALL_STEPS.filter(x => x.key === 'inward' || x.key === 'handover') : ALL_STEPS;

const dateOf = (c: Concept, k: Step): string | null => c.swatch?.[`${k}On` as const] ?? null;
const nextStep = (c: Concept): Step | null => SWATCH_STEPS.find(s => !dateOf(c, s.key))?.key ?? null;
const designName = (c: Concept) => c.naming.newName ?? c.name;

/** One tick box: done shows who and when and cannot be unticked; only the next step can be ticked, by the role that owns it. */
export function Tick({ done, can, onTick, title }: { done: boolean; can: boolean; onTick: () => void; title?: string }) {
  return <button type="button" role="checkbox" aria-checked={done} title={title} disabled={done || !can}
    onClick={e => { e.stopPropagation(); if (!done && can) onTick(); }}
    className="cl-box" style={{ cursor: !done && can ? 'pointer' : 'default', ...(done ? { background:'var(--good)', borderColor:'var(--good)' } : can ? { borderColor:'var(--accent)' } : { opacity: .55 }), background: done ? 'var(--good)' : 'var(--surface)' }}>{done ? '✓' : ''}</button>;
}

/** The swatch desk's steps as a checklist, used on the requirement record. */
export function SwatchChecks({ c }: { c: Concept }) {
  const { role, conceptSwatch, conceptSwatchPriority } = useApp();
  const wh = role === 'warehouse' || role === 'production' || role === 'owner';
  const design = role === 'design' || role === 'owner';
  const next = nextStep(c); const pri = !!c.swatch?.priority;
  return <div className="checklist">
    {SWATCH_STEPS.map(st => { const d = dateOf(c, st.key); const can = next === st.key && (st.owner === 'design' ? design : wh);
      return <div key={st.key} className={`cl-row${d ? ' done' : ''}`}>
        <Tick done={!!d} can={can} onTick={() => conceptSwatch(c.id, st.key)} />
        <div className="cl-main"><div className="cl-label">{st.label}</div>
          <div className="cl-status">{d ? `${c.swatch?.by?.[st.key] ?? st.who} · ${fmtDate(d)}` : next === st.key ? `${st.who} ticks this` : 'after the step above'}</div></div>
      </div>; })}
    {!c.liveOn && <div className={`cl-row${pri ? ' done' : ''}`}>
      <button type="button" role="checkbox" aria-checked={pri} disabled={!wh} onClick={() => conceptSwatchPriority(c.id, !pri)} className="cl-box" style={{ cursor: wh ? 'pointer' : 'default', background: pri ? 'var(--info)' : 'var(--surface)', borderColor: pri ? 'var(--info)' : undefined }}>{pri ? '✓' : ''}</button>
      <div className="cl-main"><div className="cl-label">Priority-1</div><div className="cl-status">{pri ? 'cut this one first; it sits at the top of the desk' : 'tick to cut this one first'}</div></div>
    </div>}
  </div>;
}

export function Swatches() {
  const { db, role, conceptSwatch, conceptSwatchPriority } = useApp();
  const wh = role === 'warehouse' || role === 'production' || role === 'owner';
  const design = role === 'design' || role === 'owner';
  const [show, setShow] = useState<'open' | 'all'>('open');
  const all = useMemo(() => (db.concepts ?? []).filter(c => c.kind === 'new-fabric' && (c.fabricPo || c.swatch)), [db]);
  const rows = all.map(c => ({ c, next: nextStep(c), s: conceptOf(db, c) }))
    .filter(x => show === 'all' || !!x.next)
    /* priority first, then the one that has waited longest */
    .sort((a, b) => Number(!!b.c.swatch?.priority && !!b.next) - Number(!!a.c.swatch?.priority && !!a.next) || Number(!a.next) - Number(!b.next) || (b.c.swatch?.inwardOn ? daysAgo(b.c.swatch.inwardOn) : 0) - (a.c.swatch?.inwardOn ? daysAgo(a.c.swatch.inwardOn) : 0));
  const ex = useExamples(rows, x => x.next ?? 'done', { noun: 'fabrics', score: x => Number(!!x.c.swatch?.priority), done: x => !x.next });
  const openRecord = (id: string) => { window.location.hash = `#/design?open=${id}`; };
  return (
    <Page title="Swatch desk" lede="Tick each step as the cloth moves. A row opens the fabric's requirement.">
      <div className="flex items-end gap-3 flex-wrap mb-3">
        <Seg value={show} onChange={v => setShow(v as typeof show)} options={[
          { id:'open', label:'To do', count: all.filter(c => !!nextStep(c)).length },
          { id:'all', label:'All', count: all.length },
        ]} />
        <div className="ml-auto pb-1">{ex.strip}</div>
      </div>
      {rows.length === 0 ? <Card><div className="pad py-8 text-center text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing on the desk.</div></Card>
      : <Card><div style={{ overflowX:'auto' }}><table className="t compact">
        <thead><tr><Th>Fabric</Th><Th hint="cut this one first; sorts to the top">Priority-1</Th>{SWATCH_STEPS.map(s => <Th key={s.key}>{s.label}</Th>)}</tr></thead>
        <tbody>{ex.rows.map(({ c, next, s }) => { const f = s.fabric; const pri = !!c.swatch?.priority && !!next;
          return <tr key={c.id} className="row" style={{ background: pri ? 'var(--info-soft)' : undefined }} onClick={() => openRecord(c.id)}>
            <td style={{ whiteSpace:'normal', minWidth: 200 }}><span className="font-medium">{designName(c)}</span>
              <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{f ? <span className="mono">{f.code}</span> : 'code on the PO'}{f?.swatchBook ? ` · ${f.swatchBook}` : ''}</div></td>
            <td onClick={e => e.stopPropagation()}>{next ? <Tick done={pri} can={wh} title={pri ? 'Priority-1, click to clear' : 'mark Priority-1'} onTick={() => conceptSwatchPriority(c.id, true)} /> : null}
              {pri && wh && <button type="button" className="vlink text-[11px] ml-1" onClick={e => { e.stopPropagation(); conceptSwatchPriority(c.id, false); }}>clear</button>}</td>
            {SWATCH_STEPS.map(st => { const d = dateOf(c, st.key); const can = next === st.key && (st.owner === 'design' ? design : wh);
              return <td key={st.key} onClick={e => e.stopPropagation()} style={{ whiteSpace:'nowrap' }}>
                <span className="flex items-center gap-1.5"><Tick done={!!d} can={can} onTick={() => conceptSwatch(c.id, st.key)} />{d && <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{fmtDate(d)}</span>}</span></td>; })}
          </tr>; })}</tbody>
      </table></div></Card>}
    </Page>
  );
}

/** The sticker page: one sticker per fabric (fabric code, name and article, book, price). The swatch at the store
    carries the fabric and its one product code. Shown on the swatch desk and on
    the requirement; printing marks the sticker step only on the swatch desk in the full edition. */
export function StickerSheet({ c, canMark, title }: { c: Concept; canMark: boolean; title?: string }) {
  const { db, conceptSwatch } = useApp();
  const s = conceptOf(db, c); const f = s.fabric;
  const d0 = (c.designs ?? [])[0];
  const [layout, setLayout] = useState<'label' | 'page'>('label');
  /* The label, five lines, as the sheet they print today:
       BER.DOSOYE-1816            the fabric code
       Purcell - 13728            the name, then the mill's article (or the first design's product code)
       SOKTAS BESPOKE             the swatch book
       MRP 6990                   the fabric's price (the base design's when none is set)
       Incl. of all taxes */
  const name = c.naming.newName ?? d0?.finalName ?? d0?.name ?? f?.name ?? designName(c);
  const mrp = c.naming.mrp ?? d0?.mrp ?? null;
  const l = { l1: f?.code ?? '', l2: `${name}${f?.vendorCode ? ` - ${f.vendorCode}` : d0?.code ? ` - ${d0.code}` : ''}`, l3: (f?.swatchBook ?? '').toUpperCase(), l4: mrp != null ? `MRP ${mrp.toLocaleString('en-IN')}` : 'MRP —', l5: 'Incl. of all taxes' };
  const printSticker = () => {
    const w = window.open('', '_blank', 'width=760,height=980'); if (!w) return;
    const css = layout === 'page'
      ? `@page { size: A4; margin: 14mm; } .pg { height: calc(100vh - 28mm); display:flex; align-items:center; justify-content:center; }
         .b { border: 1px dashed #999; padding: 18mm 16mm; text-align:center; min-width: 120mm; }
         .c { font-family: ui-monospace, Menlo, monospace; font-size: 16px; color:#555; } .n { font-size: 30px; font-weight: 700; margin: 10px 0 6px; line-height: 1.2; } .k { font-size: 14px; letter-spacing:.04em; } .p { font-size: 24px; margin-top: 10px; } .s { font-size: 12px; margin-top: 6px; color:#666; }`
      : `@page { size: A4; margin: 10mm; } .b { width: 63mm; height: 36mm; border:1px solid #333; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; font-size: 12.5px; line-height: 1.45; padding: 2mm; box-sizing:border-box; } .s { font-size: 9.5px; }`;
    const body = `<div class="b"><div class="c">${l.l1}</div><div class="n">${l.l2}</div><div class="k">${l.l3}</div><div class="p">${l.l4}</div><div class="s">${l.l5}</div></div>`;
    w.document.write(`<!doctype html><title>Sticker · ${f?.name ?? designName(c)}</title><style>body { margin:0; font-family: Calibri, -apple-system, Helvetica, Arial, sans-serif; color:#222; } ${css}</style>${layout === 'page' ? `<div class="pg">${body}</div>` : body}<script>window.onload=()=>{window.print();}</script>`);
    w.document.close();
    if (canMark && !MTM_ONLY && !c.swatch?.stickerOn) conceptSwatch(c.id, 'sticker');
  };

  return <>
    {/* ── the sticker page: one sticker for the fabric ── */}
    <Section title={title ?? 'The sticker'} collapsible={false} ownerRole="warehouse" pending={false} right={<Pill tone={c.swatch?.stickerOn ? 'good' : 'neutral'}>{c.swatch?.stickerOn ? `printed ${fmtDate(c.swatch.stickerOn)}` : 'not printed'}</Pill>}>
      <div className="my-2 text-center" style={{ border:'1px solid var(--ink-soft)', background:'var(--surface)', width: 220, padding:'10px 6px', fontSize: 11.5, lineHeight: 1.4 }}>
        <div className="mono">{l.l1 || '—'}</div><div>{l.l2}</div><div>{l.l3 || <span style={{ color:'var(--warn)' }}>no swatch book</span>}</div><div style={{ color: l.l4 === 'MRP —' ? 'var(--warn)' : undefined }}>{l.l4}</div><div style={{ fontSize: 9, color:'var(--ink-faint)' }}>{l.l5}</div>
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        <div><span className="label">Layout</span><div className="seg"><button type="button" className={layout === 'label' ? 'on' : ''} onClick={() => setLayout('label')}>Label</button><button type="button" className={layout === 'page' ? 'on' : ''} onClick={() => setLayout('page')}>Full page</button></div></div>
        <Button variant="primary" onClick={printSticker}>Print sticker{c.swatch?.stickerOn || !canMark || MTM_ONLY ? '' : ' & mark'}</Button>
        <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>One sticker for the fabric</span>
      </div>
    </Section>
  </>;
}
