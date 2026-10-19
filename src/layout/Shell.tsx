/* The door you came in through decides what you see. One sidebar, a handful
   of entries per role — people migrating off spreadsheets adopt a few screens,
   not forty. */
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { PEOPLE, ROLE_LABEL, STORES } from '../domain/reference';
import type { RoleId } from '../domain/types';
import { Toasts, Select, Button } from '../ui';
import { VendorDrawer } from '../screens/Vendors';
import { MentionBar } from '../screens/Mentions';
import { CommandSearch, SearchHint } from '../screens/Search';

/* Every role sees only the screens it actually works in. A designer never opens
   a factory's capacity; the warehouse never opens the option book. The owner
   sees all of it. Groups are the shape of the business, in order of the flow. */
export const NAV: { path: string; label: string; hint: string; group?: string; roles: RoleId[]; hideFor?: RoleId[] }[] = [

  /* the book: what exists and what it is called */
  { path:'/design',       label:'Requirements',        hint:'every ask — MTM fabric, RTW style, several options — at its stage; open any row, raise any kind', group:'Design',   roles:['owner','design','planning','sourcing'] , hideFor:['sourcing']},
  { path:'/swatches',     label:'Swatch desk',                hint:'cloth in → swatches cut → stores told → live; the sticker prints off the record', group:'Design',   roles:['owner','design','production','warehouse'] , hideFor:['production']},
  { path:'/fabrics',      label:'MTM fabric master',          hint:'core, non-core and bespoke: stock and blocks',   group:'Design',   roles:['owner','design','sourcing','production'] , hideFor:['production']},

  /* the numbers: how many, how deep, when */
  { path:'/planning',     label:'RTW planning',               hint:'one review per option: rate, projection by size, quantity, ratio — then to design', group:'Planning', roles:['owner','planning'] },
  { path:'/health',       label:'RTW stock health',           hint:'every option: rate of sale, size gaps, action',  group:'Planning', roles:['owner','planning','design'] , hideFor:['design']},
  { path:'/insights',     label:'What is selling',            hint:'the weekly report, the DSR and the stylist KPI — as planning reads them',          group:'Planning', roles:['owner','design','planning'] , hideFor:['design']},
  { path:'/launches',     label:'RTW launches',               hint:'new options on their way to the stores',         group:'Planning', roles:['owner','planning','warehouse'] , hideFor:['warehouse']},

  /* buying */
  { path:'/sourcing',     label:'Fabric sourcing',            hint:'vendor quotes, then a factory with capacity',    group:'Sourcing', roles:['owner','sourcing'] },
  { path:'/mills',        label:'Fabric vendors · mills',     hint:'lead times and block windows, by vendor',        group:'Sourcing', roles:['owner','sourcing'] },

  /* making */
  { path:'/vendors',      label:'Factories & capacity',       hint:'capacity, assigning MTM orders, daily output, how late',       group:'Production', roles:['owner','production'] },
  { path:'/mtm',          label:'MTM daily production',       hint:'customer shirts: plan, factory, dispatch',       group:'Production', roles:['owner','production','warehouse'] , hideFor:['warehouse']},
  { path:'/factory',      label:'My factory · merchandiser',   hint:"the floor's own day: output, pieces, cloth",     group:'Merchandiser', roles:['owner','merchandiser','production'] , hideFor:['production']},
  { path:'/tracker',      label:'RTW production tracker',     hint:'every bulk PO, date by date',                    group:'Production', roles:['owner','production','warehouse'] , hideFor:['warehouse']},
  { path:'/outbound',     label:'Outbound to factories',      hint:'bundles to cut, extra fabric, RTW materials',    group:'Production', roles:['owner','production','warehouse'] , hideFor:['production','warehouse']},
  { path:'/otif',         label:'RTW production analytics',   hint:'OTIF, daily monitor, escalations, merchandiser alerts — read off the tracker', group:'Production', roles:['owner','production','planning'] },

  /* moving */
  { path:'/warehouse',    label:'Warehouse & unit',           hint:'goods in, bundles out, STOs, swatch books',      group:'Warehouse', roles:['owner','warehouse','production'] , hideFor:['production']},
  { path:'/grn',          label:'Goods received · GRN',       hint:'every receipt with its PO, for GST and recon',   group:'Warehouse', roles:['owner','warehouse'] },

  /* selling */
  { path:'/stores',       label:'My store',                   hint:'orders, customers, stock, returns',              group:'Store',    roles:['owner','store'] },

  /* money */
];

/** where a role lands: the first screen it works in */
export const homeFor = (role: RoleId) => NAV.find(n => n.roles.includes(role))?.path ?? '/design';

/* Walkthrough mode opens every screen, which makes it easy to forget whose
   desk you are standing at. One strip at the top of a screen that is not your
   team's says so, and offers the switch. */
function ScreenOwner() {
  const { myRole, demoAll } = useApp();
  const loc = useLocation();
  const entry = NAV.find(n => loc.pathname.startsWith(n.path));
  if (demoAll || !entry || myRole === 'owner' || entry.roles.includes(myRole)) return null;   // a super admin needs no reminder of whose desk this is
  const owners = entry.roles.filter(r => r !== 'owner');
  return <div className="mb-3 text-[11.5px] flex items-center gap-2 flex-wrap" style={{ color:'var(--ink-faint)' }}>
    <span className={`pill role-${owners[0]}`}>{owners.map(r => ROLE_LABEL[r]).join(' & ')}</span> work this screen.
  </div>;
}

export function Shell() {
  const { db, role, myRole, demoAll, setDemoAll, settings, setQuiet, personId, setPerson, storeId, setStore, factoryId, setFactory, reset, views, saveView, deleteView } = useApp();
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  /* design and planning work from the one Design requirements screen; the per-record lists stay reachable by link and drawer */
  /* Walkthrough mode is a super admin: every screen, whoever you are signed in
     as. Off, each team sees only the screens it works in. */
  const items = demoAll ? NAV : NAV.filter(n => n.roles.includes(role) && !(n.hideFor ?? []).includes(myRole));
  const allowedItems = NAV.filter(n => n.roles.includes(role));
  /* a path that is not a screen at all (the old /concepts, /requests, /requirements redirects) passes through to the router untouched — with its query intact */
  const allowed = loc.pathname === '/' || !NAV.some(n => loc.pathname.startsWith(n.path)) || allowedItems.some(n => loc.pathname.startsWith(n.path));
  const me = PEOPLE.find(p => p.id === personId)!;
  /* the sidebar's sections, in the order of the flow, with the one you are in marked */
  const here = items.find(n => loc.pathname.startsWith(n.path))?.group;
  const groups = useMemo(() => {
    const out: { name: string; items: typeof items; hasActive: boolean }[] = [];
    items.forEach(n => { const name = n.group ?? '—'; const g = out.find(x => x.name === name) ?? (out.push({ name, items: [], hasActive: false }), out[out.length - 1]); g.items.push(n); });
    return out.map(g => ({ ...g, hasActive: g.name === here }));
  }, [items, here]);
  /* a section you have not touched follows the screen you are on; once you open
     or close one by hand, that choice sticks for the session */
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (name: string) => open[name] ?? name === here;

  return (
    <div className={`grid min-h-screen${settings.quiet ? ' quiet' : ''}`} style={{ gridTemplateColumns:'264px minmax(0,1fr)' }}>
      <aside className="flex flex-col gap-4 px-3 py-4 sticky top-0 h-screen overflow-y-auto" style={{ background:'var(--sidebar)', color:'var(--sidebar-ink)' }}>
        <div className="px-2">
          <div className="uppercase leading-none" style={{ fontFamily:'var(--display)', fontWeight:700, fontSize:22, letterSpacing:'.08em' }}>BSC <span style={{ color:'var(--sidebar-soft)' }}>PLM</span></div>
          <div className="text-[11px] uppercase tracking-[.12em] mt-1" style={{ color:'var(--sidebar-soft)' }}>Bombay Shirt Company</div>
        </div>

        <div className="px-1"><SearchHint /></div>

        {/* One section open at a time, by default the one you are standing in —
            eighteen screens under seven headings is a scroll, not a menu. */}
        <nav className="flex flex-col gap-px px-1">
          {groups.map(g => { const on = isOpen(g.name); return <div key={g.name}>
            {/* a group is a heading, not a button that looks like a screen: small caps,
                no fill, a chevron — the screens under it are the rows you click */}
            <button type="button" aria-expanded={on} onClick={() => setOpen(o => ({ ...o, [g.name]: !on }))}
              className="w-full flex items-center justify-between gap-2 px-2.5 pt-[10px] pb-[4px] text-[10.5px] uppercase tracking-[.16em] cursor-pointer"
              style={{ fontFamily:'inherit', background:'transparent', border: 0, borderTop: '1px solid rgb(255 255 255/.06)', borderRadius: 0,
                color: on || g.hasActive ? 'var(--sidebar-ink)' : 'var(--sidebar-soft)', opacity: on || g.hasActive ? 1 : .7 }}>
              <span>{g.name}</span>
              <span className="flex items-center gap-1.5">
                <span className="mono" style={{ fontSize: 10, opacity:.6 }}>{g.items.length}</span>
                <span style={{ display:'inline-block', transform: on ? 'rotate(90deg)' : 'none', transition:'transform .12s', fontSize:8, opacity:.7 }}>▶</span>
              </span>
            </button>
            {on && g.items.map(n => <NavLink key={n.path} to={n.path} end={n.path === '/'} className="block px-2.5 py-[6px] my-[1px] rounded-[4px] text-[13.5px] font-medium" title={n.hint}
              style={({ isActive }) => ({ background: isActive ? 'var(--sidebar-active)' : 'transparent', color: isActive ? 'var(--accent-ink)' : 'var(--sidebar-soft)' })}>
              <div>{n.label}</div><div className="text-[11px] font-normal leading-snug nav-hint" style={{ opacity:.6 }}>{n.hint}</div>
            </NavLink>)}
          </div>; })}
        </nav>

        {/* the filter you set every morning, kept by name — the whole URL is the
            view, because every screen already puts its tab and filters there */}
        <div className="px-1">
          <div className="flex items-center justify-between gap-2 px-1.5 pb-1">
            <span className="text-[10px] uppercase tracking-[.14em]" style={{ color:'var(--sidebar-soft)', opacity:.7 }}>My views</span>
            <button type="button" title="Save this screen, with its filters, as a view"
              onClick={() => { const n = window.prompt('Name this view', document.title.replace(' · BSC PLM', '')); if (n?.trim()) saveView(n.trim(), window.location.hash || '#/'); }}
              style={{ font:'inherit', fontSize: 11, background:'none', border:0, color:'var(--sidebar-soft)', cursor:'pointer', padding:0 }}>+ save</button>
          </div>
          {views.length === 0
            ? <div className="px-1.5 text-[11px] leading-snug" style={{ color:'var(--sidebar-soft)', opacity:.6 }}>None yet — set the filters you want and press save.</div>
            : views.map(v => <div key={v.id} className="flex items-center gap-1 group">
                <button type="button" onClick={() => { window.location.hash = v.href; }}
                  className="flex-1 text-left px-1.5 py-1 text-[13px] cursor-pointer" style={{ background:'none', border:0, color:'var(--sidebar-soft)', font:'inherit' }}>{v.name}</button>
                <button type="button" onClick={() => deleteView(v.id)} title="Forget this view"
                  style={{ font:'inherit', fontSize: 12, background:'none', border:0, color:'var(--sidebar-soft)', opacity:.5, cursor:'pointer', padding:'0 4px' }}>×</button>
              </div>)}
        </div>

        {/* who you are is one quiet line; the switches under it are demo scaffolding
            and fold away until asked for */}
        <div className="mt-auto flex flex-col gap-2 px-1">
          <div className="px-1 text-[12.5px] leading-snug" style={{ color:'var(--sidebar-ink)' }}>{me.name}<div className="text-[11px]" style={{ color:'var(--sidebar-soft)' }}>{me.title}{demoAll ? ' · walkthrough' : ''}</div></div>
          <details className="demo-fold flex flex-col gap-2 px-1">
          <summary>Demo settings</summary>
          <div className="flex flex-col gap-2 pt-1">
          {!demoAll && <>
            <div className="text-[11px] uppercase tracking-[.1em]" style={{ color:'var(--sidebar-soft)' }}>Signed in as</div>
            <Select value={personId} onChange={setPerson} style={{ background:'rgb(255 255 255/.06)', color:'var(--sidebar-ink)', borderColor:'rgb(255 255 255/.12)', fontSize: 14 }}
              groups={(Object.keys(ROLE_LABEL) as RoleId[]).map(r => ({ label: ROLE_LABEL[r], options: PEOPLE.filter(p => p.role === r).map(p => ({ value:p.id, label:`${p.name} · ${p.title}` })) })).filter(g => g.options.length)} />
          </>}
          {myRole === 'merchandiser' && !demoAll && <Select value={factoryId} onChange={setFactory} style={{ background:'rgb(255 255 255/.06)', color:'var(--sidebar-ink)', borderColor:'rgb(255 255 255/.12)', fontSize: 14 }}
            options={db.vendors.filter(v => v.mtm && v.kind !== 'Hemming unit').map(v => ({ value:v.id, label:v.name }))} />}
          {(myRole === 'store' && !demoAll) && <Select value={storeId} onChange={setStore} style={{ background:'rgb(255 255 255/.06)', color:'var(--sidebar-ink)', borderColor:'rgb(255 255 255/.12)', fontSize: 14 }} options={STORES.map(s => ({ value:s.id, label:s.name }))} />}
          {demoAll && <>
            <Select value={factoryId} onChange={setFactory} style={{ background:'rgb(255 255 255/.06)', color:'var(--sidebar-ink)', borderColor:'rgb(255 255 255/.12)', fontSize: 14 }}
              options={db.vendors.filter(v => v.mtm && v.kind !== 'Hemming unit').map(v => ({ value:v.id, label:v.name }))} />
            <Select value={storeId} onChange={setStore} style={{ background:'rgb(255 255 255/.06)', color:'var(--sidebar-ink)', borderColor:'rgb(255 255 255/.12)', fontSize: 14 }} options={STORES.map(s => ({ value:s.id, label:s.name }))} />
          </>}
          {/* A blocked button teaches nothing in a walkthrough. With this on you keep
              your name and your screen, and every team's step is open to you — each
              one still labelled with whose step it is. */}
          <label className="flex items-start gap-2 text-[12.5px] leading-snug cursor-pointer pt-1" style={{ color:'var(--sidebar-soft)' }}>
            <input type="checkbox" checked={demoAll} onChange={e => setDemoAll(e.target.checked)} className="mt-[2px]" />
            <span><b style={{ color:'var(--sidebar-ink)' }}>Walkthrough mode</b><br/>{demoAll ? 'Super admin: every screen and every button, whoever you are signed in as.' : 'You only see and click what ' + me.name.split(' ')[0] + ' does.'}</span>
          </label>
          <label className="flex items-start gap-2 text-[12.5px] leading-snug cursor-pointer pt-1" style={{ color:'var(--sidebar-soft)' }}>
            <input type="checkbox" checked={!!settings.quiet} onChange={e => setQuiet(e.target.checked)} className="mt-[2px]" />
            <span><b style={{ color:'var(--sidebar-ink)' }}>Quiet mode</b><br/>{settings.quiet ? 'Guidance off: no explainers, no example strips, full lists.' : 'Hide the explainers and example strips — the tool as the team will use it.'}</span>
          </label>
          <Button size="sm" variant="ghost" onClick={reset} style={{ color:'var(--sidebar-soft)', justifyContent:'flex-start', padding:'4px 2px', fontSize: 12.5 }}>Reset demo data</Button>
          <div className="text-[11px] pt-2 leading-relaxed" style={{ color:'var(--sidebar-soft)', borderTop:'1px solid rgb(255 255 255/.08)' }}>Prototype · illustrative data<br/>Clock fixed at 12 Sep 2026</div>
          </div>
          </details>
        </div>
      </aside>

      {/* a screen this role does not work in is not reachable, even by URL — it lands on the role's own first screen */}
      <main className="px-7 py-6 max-w-[1280px] w-full"><MentionBar /><ScreenOwner /> {allowed ? <Outlet /> : <Navigate to={homeFor(role)} replace />}</main>
      <VendorDrawer />
      <CommandSearch />
      <Toasts />
    </div>
  );
}
