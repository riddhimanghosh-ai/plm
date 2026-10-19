/* The swatch desk — the MTM_Swatches tracker, as a screen. One row a fabric: the
   warehouse writes the dates as the cloth moves (bulk received, handed to the
   swatch team, cut, sticker printed, dispatched, photos), one dispatch row per
   store fans out underneath, and design tells the stores and switches it on.
   Priority-1 sorts to the top. The sticker page prints off the record — one box
   per design on the fabric — so the tracker's empty "Sticker Link" column
   becomes a date. Go live is a button, not a gate: design can switch a fabric
   on whenever it decides to. */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import type { Concept } from '../domain/types';
import { fmtDate, daysAgo, conceptOf } from '../domain/engines';
import { STORES } from '../domain/reference';
import { Page, Card, Pill, Seg, Th, Button, Drawer, KV, Section, Note, Input, useExamples } from '../ui';
import { ActsBy, OwnerPill } from './Who';
import { DesignsOnFabric } from './Designs';
import { RecordTail } from './RecordTail';

type Step = 'inward' | 'handover' | 'cut' | 'sticker' | 'dispatched' | 'photos' | 'storesTold';
/* The warehouse is two people. Shravani receives the cloth, ships, and keeps the
   tracker. Yusuf runs the swatch desk: he gets the design codes and the sticker
   file, cuts the 25 × 25 swatches for every store, and sends the photos. */
const STEPS: { key: Step; label: string; owner: 'warehouse' | 'design'; who: string; hint: string }[] = [
  { key:'inward',     label:'Bulk received', owner:'warehouse', who:'Shravani', hint:'the tracker’s "Fabric Bulk Received date" — the cloth is in the warehouse' },
  { key:'handover',   label:'To Yusuf',      owner:'warehouse', who:'Shravani', hint:'"Fabric Team handover date for swatches" — the cloth, the design codes and the sticker file go to Yusuf' },
  { key:'cut',        label:'Cut',           owner:'warehouse', who:'Yusuf',    hint:'25 × 25 swatches cut and prepared, one set per store' },
  { key:'sticker',    label:'Sticker',       owner:'warehouse', who:'Yusuf',    hint:'the sticker page printed off the record — the "Sticker Link" column, as a date' },
  { key:'photos',     label:'Photos',        owner:'warehouse', who:'Yusuf',    hint:'photos of what was cut and packed, so design can see what went' },
  { key:'dispatched', label:'Dispatched',    owner:'warehouse', who:'Shravani', hint:'handed to shipping — one dispatch row per store, tracking and receiving underneath' },
  { key:'storesTold', label:'Stores told',   owner:'design',    who:'Design',   hint:'stores told to display it' },
];
const dateOf = (c: Concept, k: Step): string | null => c.swatch?.[`${k}On` as const] ?? null;
const nextStep = (c: Concept): Step | null => STEPS.find(s => !dateOf(c, s.key))?.key ?? null;
const designName = (c: Concept) => c.naming.newName ?? c.name;

export function Swatches() {
  const { db, role, conceptSwatch, conceptSwatchPriority, conceptGoLive } = useApp();
  const [params, setParams] = useSearchParams();
  const open = (id: string | null) => { const n = new URLSearchParams(params); id ? n.set('open', id) : n.delete('open'); setParams(n, { replace:true }); };
  const wh = role === 'warehouse' || role === 'production' || role === 'owner';
  const design = role === 'design' || role === 'owner';
  const can = (s: Step) => (STEPS.find(x => x.key === s)!.owner === 'design' ? design : wh);
  const [show, setShow] = useState<'all' | 'cut' | 'dispatch' | 'tell' | 'live'>('all');

  const rows = useMemo(() => (db.concepts ?? []).filter(c => c.kind === 'new-fabric' && (c.fabricPo || c.swatch))
    .map(c => ({ c, next: nextStep(c), s: conceptOf(db, c) }))
    .filter(x => show === 'all' ? true : show === 'cut' ? (x.next === 'inward' || x.next === 'handover' || x.next === 'cut' || x.next === 'sticker') : show === 'dispatch' ? (x.next === 'dispatched' || x.next === 'photos') : show === 'tell' ? (x.next === 'storesTold' && !x.c.liveOn) : !!x.c.liveOn)
    /* priority first, then the one that has waited longest */
    .sort((a, b) => Number(!!b.c.swatch?.priority && !b.c.liveOn) - Number(!!a.c.swatch?.priority && !a.c.liveOn) || Number(!!a.c.liveOn) - Number(!!b.c.liveOn) || (b.c.swatch?.inwardOn ? daysAgo(b.c.swatch.inwardOn) : 0) - (a.c.swatch?.inwardOn ? daysAgo(a.c.swatch.inwardOn) : 0)), [db, show]);
  const ex = useExamples(rows, x => x.c.liveOn ? 'live' : x.next ?? 'every date written', { noun: 'fabrics', score: x => Number(!!x.c.swatch?.priority), done: x => !!x.c.liveOn && !!x.c.online?.liveOn && !!x.c.swatch?.photosOn && !!x.c.swatch?.storesToldOn });
  const all = (db.concepts ?? []).filter(c => c.kind === 'new-fabric' && (c.fabricPo || c.swatch)).map(c => ({ n: nextStep(c), live: !!c.liveOn }));
  const count = (f: (x: { n: Step | null; live: boolean }) => boolean) => all.filter(f).length;
  const active = (db.concepts ?? []).find(c => c.id === params.get('open')) ?? null;

  return (
    <Page title="Swatch desk" lede="The MTM swatches tracker as a screen: the warehouse writes the dates, design switches it on."
      replaces="the MTM_Swatches tracker, the blue highlight, the swatch Slack channel, and the sticker file made by hand in Word or Canva">
      <div className="flex items-end gap-3 flex-wrap mb-3">
        <Seg value={show} onChange={setShow} options={[
          { id:'all', label:'All', count: all.length },
          { id:'cut', label:'To cut & sticker', count: count(x => !x.live && (x.n === 'inward' || x.n === 'handover' || x.n === 'cut' || x.n === 'sticker')), hint:'cloth in, swatches or sticker not yet done — priority first' },
          { id:'dispatch', label:'To dispatch', count: count(x => !x.live && (x.n === 'dispatched' || x.n === 'photos')), hint:'cut and stickered, not yet out to the stores' },
          { id:'tell', label:'To tell stores', count: count(x => !x.live && x.n === 'storesTold'), hint:'out to the stores — tell them' },
          { id:'live', label:'Live in stores', count: count(x => x.live) },
        ]} />
        <div className="ml-auto pb-1">{ex.strip}</div>
      </div>
      {rows.length === 0 ? <Card><div className="pad py-8 text-center text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing on the desk — no new fabric is between the PO and the stores.</div></Card>
      : <Card><div style={{ overflowX:'auto' }}><table className="t compact">
        <thead><tr>
          <Th hint="the fabric — its code, its swatch book, and how many designs hang off it">Fabric</Th>
          <Th hint="Priority-1 in the tracker — cut this one first; sorts to the top">Priority</Th>
          {STEPS.map(s => <Th key={s.key} hint={s.hint}>{s.label}</Th>)}
          <Th hint="design's switch — whenever it decides, not after a gate">Live</Th>
          <th></th>
        </tr></thead>
        <tbody>{ex.rows.map(({ c, next, s }) => {
          const f = s.fabric; const pri = !!c.swatch?.priority && !c.liveOn; const n = c.designs?.length ?? 0;
          return <tr key={c.id} className="row" style={{ background: pri ? 'var(--info-soft)' : undefined }} onClick={() => open(c.id)}>
            <td style={{ whiteSpace:'normal', minWidth: 200 }}><span className="font-medium">{designName(c)}</span>
              <div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{f ? <span className="mono">{f.code}</span> : 'code on the PO'}{f?.swatchBook ? ` · ${f.swatchBook}` : ''} · <span style={{ color: n ? undefined : 'var(--warn)' }}>{n ? `${n} design${n === 1 ? '' : 's'}` : 'no designs yet'}</span></div></td>
            <td onClick={e => e.stopPropagation()}>{c.liveOn ? <span style={{ color:'var(--ink-faint)' }}>—</span>
              : <button type="button" className={`pill ${pri ? 'info' : ''}`} title={pri ? 'Priority-1 — click to clear' : 'mark Priority-1'} disabled={!wh} onClick={() => conceptSwatchPriority(c.id, !pri)}>{pri ? 'Priority-1' : 'normal'}</button>}</td>
            {STEPS.map(st => { const d = dateOf(c, st.key); const isNext = next === st.key;
              return <td key={st.key} onClick={e => e.stopPropagation()} style={{ whiteSpace:'nowrap' }}>
                {d ? <span className="text-[12px]">{fmtDate(d)}{st.key === 'dispatched' && s.swatchSent > 0 && <div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{s.swatchGot} of {s.swatchSent} stores received</div>}</span>
                  : isNext ? (can(st.key) ? <Button size="sm" variant={pri ? 'primary' : undefined} onClick={() => conceptSwatch(c.id, st.key)}>{st.key === 'sticker' ? 'Print & mark' : `Mark ${st.label.toLowerCase()}`}</Button> : <span className={`pill role-${st.owner}`}>{st.owner}</span>)
                  : <span style={{ color:'var(--line)' }}>·</span>}
              </td>; })}
            <td onClick={e => e.stopPropagation()} style={{ whiteSpace:'nowrap' }}>{c.liveOn ? <Pill tone="good">live {fmtDate(c.liveOn)}</Pill> : design ? <Button size="sm" variant="primary" title="switch it on in stores — whenever you decide" onClick={() => conceptGoLive(c.id)}>Go live</Button> : <span className="pill role-design">design</span>}</td>
            <td className="text-[12px]"><span className="cta">Open →</span></td>
          </tr>; })}</tbody>
      </table></div></Card>}
      <div className="mt-3"><Note>The warehouse writes the six dates as the cloth moves; design tells the stores and switches it on.</Note></div>

      <Drawer open={!!active} onClose={() => open(null)} title={active ? designName(active) : ''}
        subtitle={active && <><Pill tone={active.liveOn ? 'good' : 'neutral'}>{active.liveOn ? `live in stores ${fmtDate(active.liveOn)}` : nextStep(active) ? `next · ${STEPS.find(s => s.key === nextStep(active))?.label}` : 'every date written'}</Pill><a className="cta" href={`#/design?open=${active.id}`}>the concept →</a></>}>
        {active && <SwatchDetail c={active} wh={wh} design={design} />}
      </Drawer>
    </Page>
  );
}

function SwatchDetail({ c, wh, design }: { c: Concept; wh: boolean; design: boolean }) {
  const { db, conceptSwatch, conceptSwatchPriority, conceptGoLive } = useApp();
  const s = conceptOf(db, c); const f = s.fabric; const next = nextStep(c);
  const designs = c.designs ?? [];
  const [copies, setCopies] = useState(String(STORES.length));   // one label per store, per design — the sheet they print today
  const [layout, setLayout] = useState<'labels' | 'pages'>('labels');   // the 3 × 7 label sheet, or one page per design
  const canMark = (k: Step) => (STEPS.find(x => x.key === k)!.owner === 'design' ? design : wh);
  const dispatches = f ? db.swatchDispatches.filter(x => x.fabricId === f.id) : [];
  const storeName = (id: string) => STORES.find(x => x.id === id)?.name ?? id;
  /* The label, five lines, as the sheet they print today:
       BER.DOSOYE-1816            the fabric code
       Purcell - 13728            the name, then the mill's article (or the product code)
       SOKTAS BESPOKE             the swatch book
       MRP 6990
       Incl. of all taxes */
  const labels = (designs.length ? designs.map(d => ({ name: d.finalName ?? d.name, mrp: d.mrp, code: d.code })) : [{ name: f?.name ?? designName(c), mrp: c.naming.mrp, code: '' }])
    .map(b => ({ l1: f?.code ?? '', l2: `${b.name}${f?.vendorCode ? ` - ${f.vendorCode}` : b.code ? ` - ${b.code}` : ''}`, l3: (f?.swatchBook ?? '').toUpperCase(), l4: b.mrp != null ? `MRP ${b.mrp.toLocaleString('en-IN')}` : 'MRP —', l5: 'Incl. of all taxes' }));
  const perPage = 21;   // 3 across × 7 down on A4
  /* the sticker sheet: every design's label, repeated once per swatch going out */
  const printSticker = () => {
    const n = Math.max(1, Math.min(60, Number(copies) || 1));
    const w = window.open('', '_blank', 'width=760,height=980'); if (!w) return;
    if (layout === 'pages') {
      /* one page per design: the big sticker the store cuts and sticks on the swatch */
      const page = (l: typeof labels[number]) => `<div class="pg"><div class="b"><div class="c">${l.l1}</div><div class="n">${l.l2}</div><div class="k">${l.l3}</div><div class="p">${l.l4}</div><div class="s">${l.l5}</div></div></div>`;
      w.document.write(`<!doctype html><title>Stickers · ${f?.name ?? designName(c)}</title><style>
        @page { size: A4; margin: 14mm; } body { margin:0; font-family: Calibri, -apple-system, Helvetica, Arial, sans-serif; color:#222; }
        .pg { page-break-after: always; height: calc(100vh - 28mm); display:flex; align-items:center; justify-content:center; }
        .b { border: 1px dashed #999; padding: 18mm 16mm; text-align:center; min-width: 120mm; }
        .c { font-family: ui-monospace, Menlo, monospace; font-size: 16px; color:#555; } .n { font-size: 30px; font-weight: 700; margin: 10px 0 6px; line-height: 1.2; } .k { font-size: 14px; letter-spacing:.04em; } .p { font-size: 24px; margin-top: 10px; } .s { font-size: 12px; margin-top: 6px; color:#666; }
        </style>${labels.map(page).join('')}<script>window.onload=()=>{window.print();}</script>`);
    } else {
      const all = labels.flatMap(l => Array.from({ length: n }, () => l));
      const cell = (l: typeof labels[number]) => `<div class="c"><div>${l.l1}</div><div>${l.l2}</div><div>${l.l3}</div><div>${l.l4}</div><div class="s">${l.l5}</div></div>`;
      const pages: string[] = []; for (let i = 0; i < all.length; i += perPage) pages.push(`<div class="pg">${all.slice(i, i + perPage).map(cell).join('')}</div>`);
      w.document.write(`<!doctype html><title>Stickers · ${f?.name ?? designName(c)}</title><style>
        @page { size: A4; margin: 10mm; } body { margin:0; font-family: Calibri, -apple-system, Helvetica, Arial, sans-serif; color:#222; }
        .pg { display:grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 36mm; page-break-after: always; border-top:1px solid #333; border-left:1px solid #333; }
        .c { border-right:1px solid #333; border-bottom:1px solid #333; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; font-size: 12.5px; line-height: 1.45; padding: 2mm; }
        .c .s { font-size: 9.5px; }
        </style>${pages.join('')}<script>window.onload=()=>{window.print();}</script>`);
    }
    w.document.close();
    if (wh && !c.swatch?.stickerOn) conceptSwatch(c.id, 'sticker');
  };

  return <>
    {/* ── the designs on this fabric — the product master's rows ── */}
    <Section title={`Designs on this fabric · ${designs.length}`} collapsible={false} ownerRole="sourcing" pending={false} right={<Pill tone={designs.length ? 'good' : 'warn'}>{designs.length ? `${designs.length} product code${designs.length === 1 ? '' : 's'}` : 'none yet'}</Pill>}>
      <DesignsOnFabric c={c} canEdit={wh || design} />
    </Section>

    {/* ── the sticker page: one box per design ── */}
    <Section title="The sticker page" collapsible={false} ownerRole="warehouse" pending={false} right={<Pill tone={c.swatch?.stickerOn ? 'good' : 'neutral'}>{c.swatch?.stickerOn ? `printed ${fmtDate(c.swatch.stickerOn)}` : 'not printed'}</Pill>}>
      <div className="my-2" style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', borderTop:'1px solid var(--ink-soft)', borderLeft:'1px solid var(--ink-soft)', background:'var(--surface)', maxWidth: 560 }}>
        {labels.map((l, i) => <div key={i} className="text-center" style={{ borderRight:'1px solid var(--ink-soft)', borderBottom:'1px solid var(--ink-soft)', padding:'10px 6px', fontSize: 11.5, lineHeight: 1.4 }}>
          <div className="mono">{l.l1 || '—'}</div><div>{l.l2}</div><div>{l.l3 || <span style={{ color:'var(--warn)' }}>no swatch book</span>}</div><div style={{ color: l.l4 === 'MRP —' ? 'var(--warn)' : undefined }}>{l.l4}</div><div style={{ fontSize: 9, color:'var(--ink-faint)' }}>{l.l5}</div>
        </div>)}
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        <div><span className="label">Layout</span><div className="seg"><button type="button" className={layout === 'labels' ? 'on' : ''} onClick={() => setLayout('labels')}>Label sheet · 3 × 7</button><button type="button" className={layout === 'pages' ? 'on' : ''} onClick={() => setLayout('pages')}>One page per design</button></div></div>
        {layout === 'labels' && <div style={{ width: 110 }}><label className="block"><span className="label">Copies per design</span><Input type="number" min={1} max={60} value={copies} onChange={e => setCopies(e.target.value)} /></label></div>}
        <Button variant="primary" onClick={printSticker}>Print {layout === 'pages' ? `${labels.length} sticker page${labels.length === 1 ? '' : 's'}` : 'sticker sheet'}{c.swatch?.stickerOn ? '' : ' & mark'}</Button>
        <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{labels.length} design{labels.length === 1 ? '' : 's'} × {Math.max(1, Number(copies) || 1)} = {labels.length * Math.max(1, Number(copies) || 1)} labels · {Math.ceil(labels.length * Math.max(1, Number(copies) || 1) / perPage)} sheet{Math.ceil(labels.length * Math.max(1, Number(copies) || 1) / perPage) === 1 ? '' : 's'} of 21 · one label a store, a design</span>
      </div>
    </Section>

    {/* ── the desk ── */}
    <Section title="The desk · where it is" pending={false} right={c.liveOn ? <Pill tone="good">live in stores</Pill> : next ? <span className={`pill role-${STEPS.find(x => x.key === next)!.owner}`}>next · {STEPS.find(x => x.key === next)!.label}</span> : <Pill tone="neutral">every date written</Pill>}>
      <div className="flex items-center gap-3 flex-wrap pb-2">
        <span className="text-[12.5px]">Priority</span>
        <button type="button" className={`pill ${c.swatch?.priority ? 'info' : ''}`} disabled={!wh || !!c.liveOn} onClick={() => conceptSwatchPriority(c.id, !c.swatch?.priority)}>{c.swatch?.priority ? 'Priority-1 — cut first' : 'normal'}</button>
      </div>
      {STEPS.map(st => { const d = dateOf(c, st.key); const isNext = next === st.key;
        return <div key={st.key} className="kv"><span className="k">{st.label}<div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>{st.hint}</div></span>
          <span className="v flex items-center gap-2 justify-end">{d ? <><span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{c.swatch?.by?.[st.key] ?? st.who}</span>{fmtDate(d)}{st.key === 'sticker' && c.naming.setOn && c.naming.setOn > d ? <Button size="sm" onClick={printSticker} title={`name or MRP changed ${fmtDate(c.naming.setOn)} — after this sticker was printed`}>Out of date · reprint</Button> : <Pill tone="good">done</Pill>}</>
            : isNext ? (canMark(st.key) ? <Button size="sm" variant="primary" onClick={() => st.key === 'sticker' ? printSticker() : conceptSwatch(c.id, st.key)}>{st.key === 'sticker' ? 'Print & mark' : `Mark ${st.label.toLowerCase()} · today`}</Button> : <ActsBy role={st.owner} does={`marks "${st.label.toLowerCase()}"`} inline />)
            : <span style={{ color:'var(--ink-faint)' }}>later</span>}{!d && <span className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{st.who}</span>}</span></div>; })}
      <div className="kv" style={{ borderTop:'1px solid var(--line)', marginTop: 6, paddingTop: 8 }}><span className="k"><b>Live in stores</b><div className="text-[11px]" style={{ color:'var(--ink-faint)' }}>design's switch — whenever design decides, before or after the dates above</div></span>
        <span className="v flex items-center gap-2 justify-end">{c.liveOn ? <>{fmtDate(c.liveOn)}<Pill tone="good">live</Pill></> : design ? <Button size="sm" variant="primary" onClick={() => conceptGoLive(c.id)}>Go live in stores</Button> : <ActsBy role="design" does="switches it on" inline />}<OwnerPill owner="Design" /></span></div>
    </Section>

    {/* ── the tracker's per-store columns ── */}
    <Section title={`Stores · ${dispatches.length ? `${dispatches.filter(x => x.confirmedOn).length} of ${dispatches.length} received` : 'not dispatched'}`} pending={false}>
      {dispatches.length === 0 ? <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Mark "dispatched" and one row per store appears here — the tracker's dispatch date and receiving date, without the tracking-number columns typed by hand.</div>
        : <div style={{ overflowX:'auto' }}><table className="t compact"><thead><tr><th>Store</th><th>Dispatched</th><th>Received</th></tr></thead>
          <tbody>{dispatches.map(x => <tr key={x.id}><td>{storeName(x.storeId)}</td><td className="text-[12px]">{fmtDate(x.dispatchedOn)}</td><td>{x.confirmedOn ? <span className="text-[12px]">{fmtDate(x.confirmedOn)}</span> : <Pill tone="warn">not yet</Pill>}</td></tr>)}</tbody></table></div>}
    </Section>

    <Section title="Fabric" pending={false}>
      {f ? <>
        <KV k="Fabric" v={<>{f.name} <span className="mono text-[11px]" style={{ color:'var(--ink-faint)' }}>{f.code}</span></>} note={`${f.composition ?? ''}${f.widthIn ? ` · ${f.widthIn}" panna` : ''}${f.cpm ? ` · ₹${f.cpm}/m` : ''}`} />
        <KV k="Vendor" v={db.vendors.find(v => v.id === f.vendorId)?.name ?? '—'} note="the tracker's Vendor Name column" />
        <KV k="Swatch book" v={f.swatchBook ?? '—'} note="where the store finds it on the shelf" />
        <KV k="On the shelf" v={`${f.stockMetres} m`} note={f.incomingMetres ? `${f.incomingMetres} m more on order` : undefined} />
      </> : <div className="py-2 text-[12.5px]" style={{ color:'var(--ink-faint)' }}>The fabric joins the master when the PO is pushed.</div>}
      {c.fabricPo && <KV k="Fabric PO" v={`${c.fabricPo.metres} m`} note={`raised ${fmtDate(c.fabricPo.on)}`} />}
      {c.online && <KV k="Online" v={c.online.liveOn ? `live ${fmtDate(c.online.liveOn)}` : `${[c.online.photosOn, c.online.videoOn, c.online.postOn].filter(Boolean).length} of 3 content steps done`} note="its own track — follows stores by about two weeks" />}
    </Section>
    {/* Yusuf's photos of what was cut and packed, comments from anyone on the
        record, and marketing's lines for the go-live — one thread, shared with
        the fabric's design record */}
    <RecordTail kind="concept" subjectId={c.id} labels={['Photos of the cut swatches', 'Dispatch photo', 'Sticker page', 'Marketing lines', 'Reference']} editable={wh || design} steps={['Cut & packed', 'Dispatch', 'Marketing · go live', 'General']} />
  </>;
}
