/* Design's front door. The system's first record is a DESIGN REQUIREMENT, not an
   inwarded fabric: design says what it needs — an MTM fabric, an RTW style, an
   or several fabric options at once — and that one record carries
   the four stages: 1 · requirement → 2 · sourcing finds and blocks a vendor →
   3 · finalised and ordered → 4 · downstream (swatches, designs, production,
   launch). This screen lists every requirement whatever its kind, at its stage,
   and offers one "+ New requirement" that asks the product type first. */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp, useAppStore } from '../store';
import type { Concept, ProductionOrder, OptionRequest, RoleId } from '../domain/types';
import { designFlowOf, sourcingStateOf, sourcingModeOf, conceptOf, fmtDate, daysAgo } from '../domain/engines';
import { ROLE_LABEL } from '../domain/reference';
import { Page, Card, Pill, Seg, Th, Button, Drawer, Input } from '../ui';
import { ActsBy } from './Who';
import { ConceptDetail, NewConcept } from './Concepts';
import { RequirementDetail, NewRequirement } from './Requirements';
import { RequestDetail, NewRequest } from './OptionRequests';
import type { SourcingMode } from '../domain/types';
import { MTM_ONLY, catLabel, OPTIONS_OFF } from '../domain/edition';

type Kind = 'MTM' | 'RTW' | 'FOB' | 'Options';
type Stage = 1 | 2 | 3 | 4 | 5;   // 5 = live / done
const STAGE_LABEL: Record<Stage, string> = MTM_ONLY
  ? { 1:'Requirement requested', 2:'Vendor added', 3:'PO punched', 4:'Fabric in', 5:'Live online' }
  : { 1:'1 · Requirement', 2:'2 · Sourcing', 3:'3 · Finalised & ordered', 4:'4 · Downstream', 5:'Live' };
const STAGE_HINT: Record<Stage, string> = MTM_ONLY ? {
  1:'design has written what it needs; sourcing has not put a vendor against it yet',
  2:'a vendor is on the table — design pushes the PO, asks for time, or drops it',
  3:'the fabric PO is punched and the Enigma code minted; the cloth is on its way',
  4:'the cloth is in — design adds the designs, pushes them to Enigma and sets consumption',
  5:'photos, video and post, then design switches it on online; stores follow the swatch desk',
} : {
  1:'design has written what it needs; not yet with sourcing',
  2:'sourcing is finding and blocking a vendor, or design is deciding on the one on the table',
  3:'the vendor is finalised and the PO is out — the cloth is on its way',
  4:'swatches, designs, production, launch — operations executes',
  5:'sellable in stores (and online, for MTM)',
};

interface Row { id: string; kind: Kind; name: string; brief: string; raisedBy: string; raisedOn: string; stage: Stage; owner: RoleId | null; next: string; sourcing: string | null; href: string }

export function DesignHome() {
  const { db, role, myRole } = useApp();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace:true }); };
  const design = role === 'design' || role === 'planning' || role === 'owner';
  const prod = role === 'production' || role === 'owner';
  /* the kind is in the URL: /concepts, /requests and /requirements now land here with it set */
  const kind = (params.get('kind') as 'all' | Kind | null) ?? 'all';
  const setKind = (k: 'all' | Kind) => set('kind', k === 'all' ? null : k);
  const [stage, setStage] = useState<'all' | `${Stage}`>('all');
  const [q, setQ] = useState('');
  const asRole = myRole === 'planning' ? 'design' : myRole;

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    /* MTM concepts — one fabric each; a request's bought cloth is a concept too, listed under its request */
    (db.concepts ?? []).filter(c => c.kind === 'new-fabric' && !/^cn-req-/.test(c.id)).forEach((c: Concept) => {
      const f = designFlowOf(db, { kind:'concept', c }); const s = conceptOf(db, c);
      /* 3 = finalised and ordered, cloth not yet in; 4 = cloth in, operations executing */
      /* MTM edition: the stage is the step design is on — the five steps of the flow, in order */
      const st: Stage = MTM_ONLY ? (f.mtmStage ?? 1)
        : c.liveOn && c.online?.liveOn ? 5 : c.fabricPo ? (c.swatch?.inwardOn || c.liveOn ? 4 : 3) : (c.fabricOptions ?? []).some(o => !o.rejected) || c.optionsSentOn || c.approvalSentOn ? 2 : 1;
      out.push({ id: c.id, kind:'MTM', name: c.naming.newName ?? c.name, brief: c.brief, raisedBy: c.raisedBy, raisedOn: c.raisedOn, stage: st,
        owner: f.now.state === 'done' ? null : f.now.owner, next: f.now.state === 'done' ? 'live' : (f.now.action ?? f.now.label),
        sourcing: c.fabricPo ? 'finalised' : s.offersWithDesign ? 'design to push PO' : c.optionsExtension && !c.optionsExtension.resolvedOn ? 'extension asked' : c.approvalSentOn ? 'sourcing to add vendors' : null,
        href: c.id });
    });
    /* RTW and FOB requirements */
    db.orders.filter(o => o.status !== 'Cancelled' && !MTM_ONLY).forEach((o: ProductionOrder) => {
      const f = designFlowOf(db, { kind:'order', o }); const mode = sourcingModeOf(o); const ss = sourcingStateOf(o);
      const launch = (db.launches ?? []).find(l => l.orderId === o.id);
      const poDone = mode === 'fob-nominated' ? !!o.fobNomination?.emailedOn : mode === 'vendor-sources' ? o.status !== 'Requirement' : !!o.sourcing?.fabricPo;
      const fabricLine = (o.materials ?? []).find(m => o.bom[m.bomIndex]?.kind === 'fabric');
      const inProduction = o.fabricReady || !!fabricLine?.receivedOn || !!o.vendorId || (o.samples?.length ?? 0) > 0;
      const st: Stage = launch?.launchedOn ? 5 : poDone ? (inProduction ? 4 : 3) : o.status === 'Requirement' ? 1 : 2;
      out.push({ id: o.id, kind: mode === 'fob-nominated' ? 'FOB' : 'RTW', name: o.styleName, brief: o.fabricBrief?.look ? `${o.fabricBrief.look}${o.fabricBrief.colour ? ` · ${o.fabricBrief.colour}` : ''} · ${o.orderQty} pcs` : `${o.category} · ${o.orderQty} pcs`,
        raisedBy: 'Design', raisedOn: o.styleHandover, stage: st, owner: f.now.state === 'done' ? null : f.now.owner, next: f.now.state === 'done' ? 'launched' : (f.now.action ?? f.now.label),
        sourcing: mode === 'vendor-sources' ? null : mode === 'fob-nominated' ? (o.fobNomination?.emailedOn ? 'finalised' : 'design to name the supplier') : poDone ? 'finalised' : o.status === 'Requirement' ? null : ss.label,
        href: o.id });
    });
    /* option requests — several fabrics at once */
    (OPTIONS_OFF ? [] : (db.optionRequests ?? [])).forEach((r: OptionRequest) => {
      const live = r.options.filter(o => o.status !== 'closed');
      const done = live.filter(o => o.status === 'po-raised').length;
      const withDesign = live.filter(o => o.status === 'with-design').length, ext = live.filter(o => o.status === 'extension').length, open = live.filter(o => o.status === 'open').length;
      const st: Stage = live.length > 0 && done === live.length ? 3 : done > 0 || withDesign > 0 || ext > 0 || open > 0 ? 2 : 1;   // options: 3 once every option has its PO; their cloth then runs as concepts
      const owner: RoleId | null = withDesign > 0 ? 'design' : (open > 0 || ext > 0) ? 'sourcing' : null;
      out.push({ id: r.id, kind:'Options', name: `${r.reqNo} · ${catLabel(r.category)}`, brief: `${r.optionCount} options · ${r.brief}`, raisedBy: r.raisedBy, raisedOn: r.raisedOn, stage: st, owner,
        next: withDesign ? `push PO on ${withDesign} option${withDesign === 1 ? '' : 's'}` : ext ? `${ext} extension${ext === 1 ? '' : 's'} asked` : open ? `sourcing to add vendors on ${open}` : done ? `${done} PO raised · swatches next` : 'send',
        sourcing: `${done} PO raised · ${withDesign} design to push PO · ${open} sourcing to add vendors${ext ? ` · ${ext} extension asked` : ''}`, href: r.id });
    });
    return out.sort((a, b) => a.stage - b.stage || (a.owner === asRole ? 0 : 1) - (b.owner === asRole ? 0 : 1) || b.raisedOn.localeCompare(a.raisedOn));
  }, [db, asRole]);

  /* Four worked examples, not a hundred and seventy rows: one of each kind, and
     the RTW one is the record with everything on it — fabric bought, samples
     approved, launched — so a reader can open it and see what "done" looks like.
     The full list is one click away and is what the real tool would show. */
  const examples = useMemo<Row[]>(() => {
    const filled = (o: ProductionOrder) => [o.fabricBrief, o.sourcing?.fabricPo, o.vendorId, o.samples?.length, o.materials?.length, o.bom?.length, o.sizeBreakup, o.targetCost, o.costing, o.finalFob, o.qcAudits?.length, (db.launches ?? []).find(l => l.orderId === o.id)?.launchedOn].filter(Boolean).length;
    const best = (rs: Row[], score: (r: Row) => number) => rs.slice().sort((a, b) => score(b) - score(a))[0];
    const order = (id: string) => db.orders.find(o => o.id === id)!;
    const rtw = best(rows.filter(r => r.kind === 'RTW' && r.stage === 5 && sourcingModeOf(order(r.id)) === 'bsc-buys'), r => filled(order(r.id)))
      ?? best(rows.filter(r => r.kind === 'RTW'), r => r.stage);
    const mtm = rows.find(r => r.kind === 'MTM' && r.stage === 2) ?? rows.find(r => r.kind === 'MTM');
    const fob = rows.find(r => r.kind === 'FOB' && r.stage === 2) ?? rows.find(r => r.kind === 'FOB');
    const opts = rows.find(r => r.kind === 'Options');
    return [rtw, mtm, fob, opts].filter((r): r is Row => !!r);
  }, [rows, db]);
  const quiet = useAppStore(s => !!s.settings.quiet);
  const showAll = quiet || params.get('all') === '1';   // quiet mode: the real list
  const base = showAll ? rows : examples;
  const shown = base.filter(r => (kind === 'all' || r.kind === kind) && (stage === 'all' || String(r.stage) === stage)
    && (!q.trim() || q.toLowerCase().split(/\s+/).every(w => `${r.name} ${r.brief} ${r.kind}`.toLowerCase().includes(w))));
  const count = (f: (r: Row) => boolean) => base.filter(f).length;
  /* everything opens in place: ?open=<id> is a concept, an order or a request; ?new= is the chooser or one of the four forms */
  const openId = params.get('open');
  const newKind = params.get('new');   // '1' = chooser · mtm · options · rtw · fob
  const activeConcept = openId ? (db.concepts ?? []).find(c => c.id === openId) ?? null : null;
  const activeOrder = openId ? db.orders.find(o => o.id === openId) ?? null : null;
  const activeRequest = openId ? (db.optionRequests ?? []).find(r => r.id === openId) ?? null : null;
  const activeRow = openId ? rows.find(r => r.id === openId) ?? null : null;
  const created = (id: string) => { const n = new URLSearchParams(params); n.delete('new'); n.set('open', id); setParams(n, { replace:true }); };
  const KIND_TONE: Record<Kind, string> = { MTM:'design', RTW:'planning', FOB:'production', Options:'sourcing' };

  return (
    <Page title="Design requirements" lede="Everything design has asked for, at one of four stages: requirement, sourcing, finalised and ordered, execution."
      replaces="the design meeting's un-minuted list, the brief emailed to sourcing, and three trackers that each start too late"
      actions={design ? <Button variant="primary" onClick={() => set('new', '1')}>+ New requirement</Button> : <ActsBy role={['design', 'planning']} does="raises a requirement — what is needed, for which product, by when" inline />}>

      <div className="flex items-end gap-3 flex-wrap mb-3">
        <Seg value={stage} onChange={v => setStage(v as typeof stage)} label="Stage" options={[
          { id:'all', label:'All', count: base.length },
          ...([1, 2, 3, 4, 5] as Stage[]).map(s => ({ id: String(s), label: STAGE_LABEL[s], count: count(r => r.stage === s), hint: STAGE_HINT[s] })),
        ]} />
        {!MTM_ONLY && <Seg value={kind} onChange={v => setKind(v as typeof kind)} options={[{ id:'all', label:'Every kind' }, { id:'MTM', label:'MTM fabric', count: count(r => r.kind === 'MTM') }, ...(MTM_ONLY ? [] : [{ id:'RTW', label:'RTW style', count: count(r => r.kind === 'RTW') }]), ...(OPTIONS_OFF ? [] : [{ id:'Options', label:'Several options', count: count(r => r.kind === 'Options') }])]} />}
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search requirement, fabric, style…" style={{ width: 240 }} aria-label="search requirements" />
        <span className="text-[12px] ml-auto" style={{ color:'var(--ink-faint)' }}>{showAll
          ? <>{rows.length} requirements · <button type="button" className="vlink" onClick={() => set('all', null)}>show the {examples.length} examples</button></>
          : <>{examples.length} worked examples, one of each kind · <button type="button" className="vlink" onClick={() => set('all', '1')}>show all {rows.length}</button></>}</span>
      </div>

      <Card><div style={{ overflowX:'auto' }}><table className="t compact">
        <thead><tr>
          <Th hint="what design asked for — the working name and the brief">Requirement</Th>
          {!MTM_ONLY && <Th hint="MTM fabric · RTW style">Kind</Th>}
          <Th hint="where it stands">Stage</Th>
        </tr></thead>
        <tbody>{shown.length === 0 ? <tr><td colSpan={5} className="text-[12.5px]" style={{ color:'var(--ink-faint)' }}>Nothing here.</td></tr> : shown.map(r => <tr key={r.id} className="row" onClick={() => set('open', r.href)}>
          <td style={{ whiteSpace:'normal', minWidth: 260 }}><span className="font-medium">{r.name}</span><div className="text-[11.5px]" style={{ color:'var(--ink-faint)' }}>{r.brief.slice(0, 110)}{r.brief.length > 110 ? '…' : ''}</div><div className="text-[10.5px]" style={{ color:'var(--ink-faint)' }}>{r.raisedBy} · {fmtDate(r.raisedOn)} · {daysAgo(r.raisedOn)}d</div></td>
          {!MTM_ONLY && <td><span className={`pill role-${KIND_TONE[r.kind]}`}>{r.kind === 'Options' ? 'options' : r.kind}</span></td>}
          <td style={{ whiteSpace:'normal', minWidth: 260 }}>
            <Pill tone={r.stage === 5 ? 'good' : r.stage === 4 ? 'info' : 'neutral'}>{STAGE_LABEL[r.stage]}</Pill>
          </td>
        </tr>)}</tbody>
      </table></div></Card>

      {/* ── the front door: product type first, then the right form, all without leaving the screen ── */}
      <Drawer open={newKind === '1'} onClose={() => set('new', null)} title="New requirement" subtitle={<span>What does design need? Pick the product type — the form that follows asks only what that type needs.</span>}>
        <div className="grid gap-3 py-2" style={{ gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {([
            { k:'MTM' as Kind, go:'mtm', title:'An MTM fabric', body:'One new fabric for the swatch books — a working name, why, the book it fills, when it is wanted, a reference. Sampled first; then sourcing puts one vendor against it.' },
            ...(OPTIONS_OFF ? [] : [{ k:'Options' as Kind, go:'options', title:'Several fabric options at once', body:'"Ten options for shirts" — a category, a count, a brief, a BOM. Sourcing puts one vendor against each option; design pushes the PO on each.' }]),
            ...(MTM_ONLY ? [] : [{ k:'RTW' as Kind, go:'rtw', title:'An RTW style', body:'One bulk style — qty, size ratio, target price and date, the cloth brief, the BOM and tech pack. Production proposes a factory; design accepts and raises the PO; sourcing buys the cloth and sends it to the factory.' }]),
          ]).map(x => <button key={x.k} type="button" className="card text-left p-4" style={{ cursor:'pointer', font:'inherit', border:'1px solid var(--line)' }} onClick={() => set('new', x.go)}>
            <div className="flex items-center gap-2 mb-1"><span className={`pill role-${KIND_TONE[x.k]}`}>{x.k === 'Options' ? 'options' : x.k}</span><span className="font-semibold">{x.title}</span></div>
            <div className="text-[12.5px]" style={{ color:'var(--ink-soft)' }}>{x.body}</div>
          </button>)}
        </div>
        <div className="text-[12px] pt-2" style={{ color:'var(--ink-faint)' }}>A construction variant on an existing fabric is an MTM concept too — pick "An MTM fabric" and choose the kind on the form. Vendor-sourced cloth is an RTW style with "Vendor sources" picked for the cloth.</div>
      </Drawer>

      <Drawer open={newKind === 'mtm'} onClose={() => set('new', null)} title="New requirement · an MTM fabric" back={{ label:'product type', onClick: () => set('new', '1') }}>
        {newKind === 'mtm' && <NewConcept onDone={created} />}
      </Drawer>
      <Drawer open={newKind === 'options'} onClose={() => set('new', null)} title="New requirement · several fabric options" back={{ label:'product type', onClick: () => set('new', '1') }}>
        {newKind === 'options' && <NewRequest defaults={{ count: params.get('count'), category: params.get('category'), brief: params.get('brief') }} onDone={created} />}
      </Drawer>
      <Drawer open={newKind === 'rtw'} onClose={() => set('new', null)} title="New requirement · an RTW style" back={{ label:'product type', onClick: () => set('new', '1') }}>
        {newKind === 'rtw' && <NewRequirement initialMode={'bsc-buys' as SourcingMode} onDone={created} />}
      </Drawer>

      {/* ── every requirement opens here, whatever its kind ── */}
      <Drawer open={!!activeConcept} onClose={() => set('open', null)} title={activeConcept ? (activeConcept.naming.newName ?? activeConcept.name) : ''}
        subtitle={activeConcept && activeRow && <><span className="pill role-design">MTM</span><Pill tone={activeRow.stage === 5 ? 'good' : 'neutral'}>{STAGE_LABEL[activeRow.stage]}</Pill><span>{activeConcept.raisedBy} · {fmtDate(activeConcept.raisedOn)}</span></>}>
        {activeConcept && <ConceptDetail c={activeConcept} design={design} prod={prod} />}
      </Drawer>
      <Drawer open={!!activeOrder} onClose={() => set('open', null)} title={activeOrder?.styleName ?? ''}
        subtitle={activeOrder && activeRow && <><span className={`pill role-${KIND_TONE[activeRow.kind]}`}>{activeRow.kind}</span><Pill tone={activeRow.stage === 5 ? 'good' : 'neutral'}>{STAGE_LABEL[activeRow.stage]}</Pill><span>{activeOrder.category} · {activeOrder.subCategory}</span></>}>
        {activeOrder && <RequirementDetail o={activeOrder} editable={design && activeOrder.status === 'Requirement'} editableAlloc={role === 'planning' || role === 'owner'} />}
      </Drawer>
      <Drawer open={!!activeRequest} onClose={() => set('open', null)} title={activeRequest ? `${activeRequest.reqNo} · ${catLabel(activeRequest.category)}` : ''}
        subtitle={activeRequest && activeRow && <><span className="pill role-sourcing">options</span><Pill tone={activeRow.stage === 3 ? 'good' : 'neutral'}>{STAGE_LABEL[activeRow.stage]}</Pill><span>{activeRequest.raisedBy} · {fmtDate(activeRequest.raisedOn)}{activeRequest.liveBy ? ` · live by ${activeRequest.liveBy}` : ''}</span></>}>
        {activeRequest && <RequestDetail r={activeRequest} focusOptionId={params.get('slot')} />}
      </Drawer>
    </Page>
  );
}
