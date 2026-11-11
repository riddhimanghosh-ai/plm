/* The factory's side of an RTW PO, shared by the factory screen and the one-screen
   RTW record: what was ordered and what is coming, the cloth and trims to count in
   (and the ask when short), and the documents the factory works from. */
import { useState } from 'react';
import { useApp } from '../store';
import type { Attachment, ProductionOrder } from '../domain/types';
import { useFileUrl } from '../domain/files';
import { fabricStateOf, riskOf, rtwDocsOf, fmtDate, fmtMoney } from '../domain/engines';
import { Pill, Button, Note, Field, Input, KV } from '../ui';
import { SizeGrid, CutRatioTrail } from './RtwGates';

export function DocLink({ a }: { a: Attachment }) { const url = useFileUrl(a.id, a.stored); return <div className="text-[11.5px] pt-1 truncate" title={a.name}>{url ? <a className="vlink" href={url} download={a.name} target="_blank" rel="noreferrer">{a.name}</a> : <span>{a.name}</span>} <span style={{ color:'var(--ink-faint)' }}>· {fmtDate(a.at)}{a.stored ? '' : ' · on the record, not in this browser'}</span></div>; }
export const FACTORY_DOCS = ['PAT / CAD', 'Tech pack', 'Style sheet', 'Job card', 'Trim card'] as const as readonly string[];

/* what was ordered and what is coming to the factory: the first thing the factory reads after the PO */
export function OrderSummary({ o, onDates }: { o: ProductionOrder; onDates?: () => void }) {
  const { db } = useApp();
  const d = rtwDocsOf(db, o); const fs = o.fabricSupply; const r = riskOf(o); const fab = fabricStateOf(o);
  const trims = (o.materials ?? []).map(m => ({ m, line: o.bom[m.bomIndex] })).filter(x => x.line && x.line.kind !== 'fabric');
  const given = (o.cutRatios ?? []).filter(c => c.given && c.sentToFactoryOn).slice(-1)[0];
  const breakup = given?.given?.breakup ?? o.sizeBreakup;
  const quote = o.fabricQuotes.find(q => q.selected) ?? null; const cloth = o.bom.find(l => l.kind === 'fabric');
  const mill = db.vendors.find(v => v.id === (quote?.vendorId ?? o.fabricVendorId))?.name ?? null;
  const clothEta = fs?.sentToFactoryOn ? null : quote?.committedDelivery ?? null;
  const closed = o.status === 'Closed';
  const faint = { color:'var(--ink-faint)' } as const;
  return <>
    <div className="grid gap-x-6 gap-y-1" style={{ gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))' }}>
      <div>
        <div className="label">Ordered</div>
        <KV k="PO" v={<b className="mono">{o.poNo}</b>} note={`raised ${fmtDate(o.poDate)}${o.factoryPo ? ` by ${o.factoryPo.by}` : ''}`} />
        <KV k="Pieces" v={`${breakup.reduce((a, x) => a + x.qty, 0)} pcs`} note={given ? `cut ratio revised ${fmtDate(given.sentToFactoryOn!)}` : 'by size below'} />
        <KV k="Due at BSC" v={fmtDate(o.targetInhouse)} note={r.bufferDays != null && !closed ? (r.bufferDays < 0 ? `${-r.bufferDays} days late` : `${r.bufferDays} days to spare`) : undefined} />
        {o.finalFob != null && <KV k="CMT agreed" v={fmtMoney(o.finalFob)} note="per piece" />}
        {o.merchant && <KV k="BSC merchant" v={o.merchant} />}
      </div>
      <div>
        <div className="label">Coming to the factory</div>
        <KV k="Cloth" v={cloth?.item ?? '—'} note={[mill ? `from ${mill}` : null, fab.need != null ? `${fab.need} m` : null, quote?.widthCm ? `${quote.widthCm} cm wide` : null].filter(Boolean).join(' · ') || undefined} />
        <KV k="Cloth arrives" v={fs?.receipt ? `landed ${fmtDate(fs.receipt.on)}` : fs?.sentToFactoryOn ? `sent ${fmtDate(fs.sentToFactoryOn)} · ${fs.metresSent ?? '—'} m` : clothEta ? `around ${fmtDate(clothEta)}` : 'sourcing will send it'} note={fs?.receipt ? `${fs.receipt.metresOk} m usable` : o.sourcing?.fabricPo ? `fabric PO ${o.sourcing.fabricPo.no} on ${fmtDate(o.sourcing.fabricPo.on)}` : 'fabric PO not raised yet'} />
        <KV k="Trims" v={trims.length ? `${trims.length} line${trims.length > 1 ? 's' : ''}` : 'none on the BOM'} note={trims.length ? `${trims.slice(0, 4).map(x => x.line.item).join(', ')}${trims.length > 4 ? ` +${trims.length - 4} more` : ''}` : undefined} />
        <KV k="Documents" v={d.owedAfterPo.length ? `${FACTORY_DOCS.length - d.owedAfterPo.length} of ${FACTORY_DOCS.length} in` : 'all in'} note={d.owedAfterPo.length ? `still owed: ${d.owedAfterPo.join(', ').toLowerCase()}` : undefined} />
        <KV k="Sample" v="first sample from bulk cloth" note="once the cloth lands; production approves it before bulk is cut" />
      </div>
    </div>
    <div className="pt-3 mt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
      <div className="label">Sizes to cut</div>
      <SizeGrid breakup={breakup} />
    </div>
    <div className="pt-3 mt-2" style={{ borderTop:'1px solid var(--line-soft)' }}>
      <div className="label">First dates</div>
      <div className="flex gap-4 flex-wrap text-[12.5px]">{o.milestones.slice(0, 4).map(m => <span key={m.key}><span className="font-medium">{m.key}</span> <span style={{ color: m.actual ? 'var(--good)' : faint.color }}>{m.actual ? `done ${fmtDate(m.actual)}` : fmtDate(m.revised ?? m.plan)}</span></span>)}
        {onDates && <button className="vlink" onClick={onDates}>all {o.milestones.length} steps →</button>}</div>
    </div>
  </>;
}

/* the documents the factory works from: open any file; what is missing shows as owed */
export function FactoryDocs({ o }: { o: ProductionOrder }) {
  const { db } = useApp();
  const docFiles = (db.attachments ?? []).filter(a => a.kind === 'order' && a.subjectId === o.id && FACTORY_DOCS.includes(a.label));
  const faint = { color:'var(--ink-faint)' } as const;
  return <div className="grid gap-2" style={{ gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))' }}>
    {FACTORY_DOCS.map(label => { const f = docFiles.filter(a => a.label === label); const fromLines = label === 'Trim card' && o.bom.some(l => l.kind === 'trim'); const have = f.length > 0 || fromLines;
      return <div key={label} className="rounded-[6px] p-2.5" style={{ border:`1px solid ${have ? 'var(--line)' : 'var(--risk)'}`, background: have ? 'var(--surface)' : 'color-mix(in srgb, var(--risk) 5%, #fff)' }}>
        <div className="flex items-center gap-2"><span className="font-medium text-[12.5px]">{label}</span><Pill tone={have ? 'good' : 'risk'}>{have ? (f.length ? `${f.length} file${f.length > 1 ? 's' : ''}` : 'on the BOM') : 'not sent yet'}</Pill></div>
        {f.map(a => <DocLink key={a.id} a={a} />)}
        {fromLines && !f.length && <div className="text-[11.5px] pt-1" style={faint}>{o.bom.filter(l => l.kind === 'trim').map(l => l.item).join(', ')}</div>}
        {!have && <div className="text-[11.5px] pt-1" style={faint}>{label === 'PAT / CAD' ? 'design uploads the pattern' : 'the production unit sends it'}</div>}
      </div>; })}
  </div>;
}

/* one PO's cloth and materials: what is coming, what landed, the ask when short. Used on the Fabric in tab and in the drawer. */
export function MaterialsPanel({ o, mine }: { o: ProductionOrder; mine: boolean }) {
  const { db, receiveMaterial, askCutRatio, confirmFabricReceipt } = useApp();
  const [counting, setCounting] = useState<number | null>(null); const [cnt, setCnt] = useState(''); const [cnote, setCnote] = useState('');
  const [ok, setOk] = useState(''); const [dmg, setDmg] = useState('0'); const [rnote, setRnote] = useState('');
  const [shortOpen, setShortOpen] = useState(false); const [shortQty, setShortQty] = useState<Record<string, string>>({}); const [shortWhy, setShortWhy] = useState('');
  const fab = fabricStateOf(o); const fs = o.fabricSupply;
  const trims = (o.materials ?? []).map(m => ({ m, line: o.bom[m.bomIndex] })).filter(x => x.line && x.line.kind !== 'fabric');
  const trimsShort = trims.filter(x => x.m.receivedOn && x.m.receivedQty != null && x.m.receivedQty < x.m.requiredQty);
  const shortFactor = trimsShort.length ? Math.min(1, ...trimsShort.map(x => (x.m.receivedQty ?? 0) / x.m.requiredQty)) : 1;
  const clothFactor = fab.key === 'short' && fab.need ? Math.min(1, (fs?.receipt?.metresOk ?? 0) / fab.need) : 1;
  const faint = { color:'var(--ink-faint)' } as const;
  const given = (o.cutRatios ?? []).filter(c => c.given && c.sentToFactoryOn).slice(-1)[0];
  const breakup = given?.given?.breakup ?? o.sizeBreakup;
  const cloth = o.bom.find(l => l.kind === 'fabric');
  const openAsk = fab.cr && !fab.cr.given;
  const closed = o.status === 'Closed';
  const askShort = (why: string, bk: { size: string; qty: number }[]) => { askCutRatio(o.id, why, 'cut-short', bk); setShortOpen(false); setShortWhy(''); };
  return <div className="px-4 py-3">
      <div className="text-[12.5px] pb-2" style={{ color:'var(--ink-soft)' }}>Everything below is for <span className="mono font-medium" style={{ color:'var(--ink)' }}>{o.poNo}</span> · {o.styleName} · {o.orderQty} pcs. Nothing here belongs to another PO.</div>
      <table className="t compact">
        <thead><tr><th>What is coming for {o.poNo}</th><th className="num">Coming</th><th className="num">Landed</th><th>Status</th><th></th></tr></thead>
        <tbody>
          <tr>
            <td><div className="font-medium">Cloth · {cloth?.item ?? '—'}</div><div className="text-[11px]" style={faint}>{o.fabricNominated ? `from ${db.vendors.find(v => v.id === o.fabricVendorId)?.name ?? 'the mill'}` : 'we buy it'}{fs?.sentToFactoryOn ? ` · sent ${fmtDate(fs.sentToFactoryOn)}` : ''}</div></td>
            <td className="num">{fs?.sentToFactoryOn ? `${fs.metresSent ?? '—'} m` : fab.need != null ? `${fab.need} m` : '—'}{fab.need != null && <div className="text-[11px]" style={faint}>need {fab.need} m</div>}</td>
            <td className="num">{fs?.receipt ? <>{fs.receipt.metresOk} m{fs.receipt.metresDamaged ? <div className="text-[11px]" style={{ color:'var(--risk)' }}>{fs.receipt.metresDamaged} m damaged</div> : null}</> : <span style={faint}>—</span>}</td>
            <td><Pill tone={fs?.receipt ? (fab.short > 0 ? (fab.cr?.given ? 'info' : 'risk') : 'good') : fs?.sentToFactoryOn ? 'warn' : 'neutral'}>{fs?.receipt ? (fab.short > 0 ? (fab.cr?.given ? `short ${fab.short} m · sizes changed` : `short ${fab.short} m`) : 'in') : fs?.sentToFactoryOn ? 'count it in' : 'not sent yet'}</Pill></td>
            <td style={{ whiteSpace:'nowrap' }}>{mine && fs?.sentToFactoryOn && !fs.receipt && <span className="flex gap-1 items-center"><Input type="number" value={ok} onChange={e => setOk(e.target.value)} placeholder={`${fs.metresSent ?? ''} usable`} style={{ width: 96, padding:'4px 6px' }} /><Input type="number" value={dmg} onChange={e => setDmg(e.target.value)} placeholder="damaged" style={{ width: 80, padding:'4px 6px' }} /><Input value={rnote} onChange={e => setRnote(e.target.value)} placeholder="note" style={{ width: 110, padding:'4px 6px' }} /><Button size="sm" variant="primary" disabled={ok === ''} onClick={() => confirmFabricReceipt(o.id, Number(ok), Number(dmg) || 0, rnote.trim())}>Save</Button></span>}</td>
          </tr>
          {trims.map(({ m, line }) => { const short = m.receivedOn && m.receivedQty != null ? Math.max(0, m.requiredQty - m.receivedQty) : 0; const isEditing = counting === m.bomIndex;
            return <tr key={m.bomIndex}>
              <td><div className="font-medium">{line.item}</div>{line.spec && <div className="text-[11px]" style={faint}>{line.spec}</div>}</td>
              <td className="num">{m.requiredQty} {line.unit}</td>
              <td className="num">{m.receivedOn ? `${m.receivedQty ?? m.requiredQty} ${line.unit}` : <span style={faint}>—</span>}{m.note && <div className="text-[11px]" style={faint}>{m.note}</div>}</td>
              <td><Pill tone={m.receivedOn ? (short || m.checked !== 'ok' ? 'risk' : 'good') : 'neutral'}>{m.receivedOn ? (short ? `short ${short} ${line.unit}` : m.checked === 'ok' ? 'in' : 'not OK') : 'not yet'}</Pill></td>
              <td style={{ whiteSpace:'nowrap' }}>{mine && !m.receivedOn && (isEditing
                ? <span className="flex gap-1 items-center"><Input type="number" min={0} value={cnt} onChange={e => setCnt(e.target.value)} placeholder={String(m.requiredQty)} style={{ width: 80, padding:'4px 6px' }} /><Input value={cnote} onChange={e => setCnote(e.target.value)} placeholder="note" style={{ width: 110, padding:'4px 6px' }} />
                  <Button size="sm" variant="primary" onClick={() => { const q = cnt === '' ? m.requiredQty : Number(cnt); receiveMaterial(o.id, m.bomIndex, q >= m.requiredQty ? 'ok' : 'fail', q, cnote.trim()); setCounting(null); setCnt(''); setCnote(''); }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setCounting(null)}>×</Button></span>
                : <span className="flex gap-1"><Button size="sm" onClick={() => receiveMaterial(o.id, m.bomIndex, 'ok', m.requiredQty)}>All in</Button><Button size="sm" variant="ghost" onClick={() => { setCounting(m.bomIndex); setCnt(''); setCnote(''); }}>Less…</Button></span>)}</td>
            </tr>; })}
        </tbody>
      </table>

      {/* short → one plain ask */}
      {(fab.key === 'short' || trimsShort.length > 0) && !openAsk && !closed && <div className="mt-3 p-3 rounded-[6px]" style={{ background:'color-mix(in srgb, var(--risk) 6%, #fff)', border:'1px solid var(--risk)' }}>
        <div className="font-medium text-[13px]">Not enough to make {o.orderQty} pcs</div>
        <div className="text-[12.5px] pt-0.5" style={{ color:'var(--ink-soft)' }}>{fab.key === 'short' ? `Cloth is ${fab.short} m short of the ${fab.need} m needed. ` : ''}{trimsShort.length ? `${trimsShort.map(x => `${x.line.item} ${x.m.receivedQty}/${x.m.requiredQty} ${x.line.unit}`).join(', ')} short. ` : ''}Tell design: either they change the sizes, or you cut fewer pieces with what is here.</div>
        {mine && !shortOpen && <div className="flex gap-2 pt-2 flex-wrap">
          {fab.key === 'short' && <Button size="sm" variant="primary" onClick={() => askCutRatio(o.id, `cloth short by ${fab.short} m`, 'ratio')}>Ask design to change the sizes</Button>}
          <Button size="sm" variant={fab.key === 'short' ? undefined : 'primary'} onClick={() => { const f = Math.min(clothFactor, shortFactor); setShortQty(Object.fromEntries(breakup.map(x => [x.size, String(Math.floor(x.qty * f))]))); setShortOpen(true); }}>Propose to cut fewer…</Button>
        </div>}
        {mine && shortOpen && <div className="pt-2">
          <div className="text-[11.5px] pb-1" style={faint}>What is here allows about {Math.round(Math.min(clothFactor, shortFactor) * 100)}% of the order; change any size</div>
          <div className="grid gap-1.5 py-1" style={{ gridTemplateColumns:`repeat(${breakup.length}, minmax(52px, 1fr))` }}>{breakup.map(x => <Field key={x.size} label={`${x.size} · was ${x.qty}`}><Input type="number" min={0} value={shortQty[x.size] ?? '0'} onChange={e => setShortQty(q => ({ ...q, [x.size]: e.target.value }))} style={{ padding:'4px 6px' }} /></Field>)}</div>
          <div className="flex gap-2 items-end flex-wrap"><div style={{ flex:'1 1 240px' }}><Field label="Why"><Input value={shortWhy} onChange={e => setShortWhy(e.target.value)} placeholder="what was short" /></Field></div>
            <Button size="sm" variant="primary" onClick={() => { const bk = breakup.map(x => ({ size: x.size, qty: Number(shortQty[x.size] ?? 0) || 0 })); askShort(shortWhy.trim() || `cut ${bk.reduce((a, x) => a + x.qty, 0)} of ${o.orderQty}: ${fab.key === 'short' ? `cloth short ${fab.short} m` : ''}${trimsShort.map(x => ` ${x.line.item} ${x.m.receivedQty}/${x.m.requiredQty}`).join(',')}`, bk); }}>Send to design</Button>
            <Button size="sm" variant="ghost" onClick={() => setShortOpen(false)}>Cancel</Button></div>
        </div>}
      </div>}
      {(o.cutRatios ?? []).length > 0 && <div className="pt-3 mt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div className="label">Cut ratio</div>
        {openAsk && <div className="pb-1"><Note tone="warn">Your {fab.cr!.kind === 'cut-short' ? 'proposal to cut fewer' : 'ask to change the sizes'} is with design since {fmtDate(fab.cr!.askedOn)}. The cloth count above is final; the new sizes appear below when design answers.</Note></div>}
        {fab.cr?.given && !fab.cr.sentToFactoryOn && <div className="pb-1"><Note tone="warn">Design has given new sizes; Nitin is sending them to you. Nothing to count again.</Note></div>}
        {given && <div className="pb-1"><Note tone="good">New cut ratio from design on {fmtDate(given.sentToFactoryOn!)}: cut {given.given!.breakup.reduce((a, x) => a + x.qty, 0)} pcs to the sizes below. The cloth count above stays as counted.</Note></div>}
        <CutRatioTrail o={o} />
      </div>}

      <div className="pt-3 mt-3" style={{ borderTop:'1px solid var(--line-soft)' }}>
        <div className="label">Sizes to cut{given ? ` · design changed these on ${fmtDate(given.sentToFactoryOn!)}` : ''}</div>
        <SizeGrid breakup={breakup} />
      </div>
    </div>;
}

