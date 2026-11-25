/* The door you came in through decides what you see. One sidebar, a handful
   of entries per role — people migrating off spreadsheets adopt a few screens,
   not forty. */
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { PEOPLE, ROLE_LABEL, STORES } from '../domain/reference';
import { MTM_ONLY, RTW_ONLY, EDITION_LABEL, inEdition, RTW_HIDDEN_NAV_GROUPS, RTW_HIDDEN_PATHS } from '../domain/edition';
import type { RoleId } from '../domain/types';
import { Toasts, Select, Button } from '../ui';
import { THEMES, applyTheme, savedTheme } from '../domain/theme';
import { VendorDrawer } from '../screens/Vendors';
import { MentionBar } from '../screens/Mentions';
import { CommandSearch, SearchHint } from '../screens/Search';

/* Every role sees only the screens it actually works in. A designer never opens
   a factory's capacity; the warehouse never opens the option book. The owner
   sees all of it. Groups are the shape of the business, in order of the flow. */
export const NAV: { path: string; label: string; hint: string; group?: string; roles: RoleId[]; hideFor?: RoleId[] }[] = [

  /* the book: what exists and what it is called */
  { path:'/design',       label:'Requirements',        hint: RTW_ONLY ? 'every RTW style at its stage; open any row, raise a new one' : 'every ask — MTM fabric, RTW style — at its stage; open any row, raise any kind', group:'Design',   roles:['owner','design','planning','sourcing'] , hideFor:['sourcing']},
  { path:'/po-draft',     label:'Draft a PO',                 hint:'one PO for one or several requirements; sent to the HOD and finance', group:'Design',   roles:['owner','design'] },
  { path:'/cogs',         label:'COGS and cost',              hint:'COGS per piece and margin for every style', group:'Design',   roles:['owner','design','production'], hideFor:['production'] },
  /* 19 Nov 2026: planning's half of the requirement; Desai's transfers; marketing's details */
  { path:'/sizes',        label:'Sizes to add',               hint:'requirements waiting on the quantity for each size', group:'Planning · sizes', roles:['owner','planning'] },
  { path:'/transfers',    label:'Material transfers',         hint:'transfer notes to send to factories; the invoice is made for what goes', group:'Transfers', roles:['owner','materials'] },
  { path:'/marketing',    label:'Marketing details',          hint:'product and marketing details while category adds the style to Enigma', group:'Marketing', roles:['owner','marketing'] },
  { path:'/enigma-marketing', label:'Enigma and marketing',   hint:'add received styles to Enigma; product and marketing details', group:'Design',   roles:['owner','design'] },
  { path:'/swatches',     label:'Swatch desk',                hint:'cloth in → swatches cut → stores told → live; the sticker prints off the record', group:'Design',   roles:['owner','design','production','warehouse'] , hideFor:['production']},
  { path:'/fabrics',      label:'MTM fabric master',          hint:'core, non-core and bespoke: stock and blocks',   group:'Design',   roles:['owner','design','sourcing','production'] , hideFor:['production']},

  /* the numbers: how many, how deep, when */
  { path:'/planning',     label:'RTW planning',               hint:'one review per option: rate, projection by size, quantity, ratio — then to design', group:'Planning', roles:['owner','planning'] },
  { path:'/analyse',      label:'Analysis · ask the data',       hint:'the folder\'s sheets as live pivots, a query builder, and a question box', group:'Planning', roles:['owner','planning','design'], hideFor:['design'] },
  { path:'/sheet',        label:'Sheet · the planners\' workbook', hint:'Working, Option count, Order working, then the book and the raw exports, joined on the Shiphero Style Name: products, stock, sales, health, orders, lost sales, reviews', group:'Planning', roles:['owner','planning','design'], hideFor:['design'] },
  { path:'/health',       label:'RTW stock health',           hint:'every option: rate of sale, size gaps, action',  group:'Planning', roles:['owner','planning','design'] , hideFor:['design']},
  { path:'/insights',     label:'What is selling',            hint:'the weekly report, the DSR and the stylist KPI — as planning reads them',          group:'Planning', roles:['owner','design','planning'] , hideFor:['design']},
  { path:'/launches',     label:'RTW launches',               hint:'new options on their way to the stores',         group:'Planning', roles:['owner','planning','warehouse'] , hideFor:['warehouse']},

  /* buying */
  { path:'/sourcing',     label:'Fabric sourcing',            hint:'vendor quotes, then a factory with capacity',    group:'Sourcing', roles:['owner','sourcing'] },
  { path:'/rtw-sourcing', label:'RTW sourcing · vendors and sending', hint:'vendor details on requirements; cloth and trims BSC sends to factories', group:'Sourcing', roles:['owner','sourcing'] },
  { path:'/cloth-vendors', label:'Cloth vendor database',     hint:'every cloth and trim vendor and what it supplies',  group:'Sourcing', roles:['owner','sourcing','design'], hideFor:['design'] },
  { path:'/mills',        label:'Fabric vendors · mills',     hint:'lead times and block windows, by vendor',        group:'Sourcing', roles:['owner','sourcing'] },

  /* making */
  { path:'/vendors',      label:'Factories & capacity',       hint:'capacity, assigning MTM orders, daily output, how late',       group:'Production · MTM', roles:['owner','production'] },
  { path:'/mtm',          label:'MTM daily production',       hint:'customer shirts: plan, factory, dispatch',       group:'Production · MTM', roles:['owner','production','warehouse'] , hideFor:['warehouse']},
  { path:'/cad',          label:'CAD desk',                   hint:'order sheet XML → CAD file and print, before cutting',  group:'Production · MTM', roles:['owner','production','warehouse','cad'] },
  { path:'/cutting',      label:'Cutting desk',               hint:'cut the cloth to the CAD, attach the print',    group:'Production · MTM', roles:['owner','production','warehouse','cutting'] },
  { path:'/fusing',       label:'Fusing desk',                hint:'fuse collar, cuff and placket interlining',     group:'Production · MTM', roles:['owner','production','warehouse','fusing'] },
  { path:'/compiling',    label:'Compiling desk',             hint:'check the bundle, approve contrast fabric',     group:'Production · MTM', roles:['owner','production','warehouse','compiling'] },
  { path:'/factory-db',   label:'Factory database',           hint:'factory, location, what it specialises in — counter sourcing recommends from it', group:'Production · RTW', roles:['owner','production'] },
  { path:'/dashboard',    label:'RTW production dashboard',   hint:'OTIF, late POs, what is waiting on whom, by factory',  group:'Production · RTW', roles:['owner','production','planning'] , hideFor:['planning']},
  { path:'/tracker',      label:'RTW production tracker',     hint:'every bulk PO, date by date',                    group:'Production · RTW', roles:['owner','production','warehouse'] , hideFor:['warehouse']},
  /* Production · RTW in PLM is the tracker alone; analytics read off it sit with planning, and materials go from sourcing straight to the factory */
  { path:'/otif',         label:'RTW production analytics',   hint:'OTIF, daily monitor, escalations, merchandiser alerts — read off the tracker', group:'Planning', roles:['owner','planning'] },
  { path:'/inward',       label:'Goods in · count and receive', hint:'what factories dispatched: invoice, packing list, the order; count it in', group:'Warehouse', roles:['owner','warehouse'] },
  /* 17 Nov 2026: the PO needs approval before it is drafted; finance also runs the payments */
  { path:'/approvals-hod', label:'PO approvals',              hint:'PO requests waiting on the HOD, and by when', group:'HOD', roles:['owner','hod'] },
  { path:'/approvals',    label:'PO approvals',               hint:'approve or reject: new POs and revised POs waiting on finance', group:'Finance', roles:['owner','finance'] },
  /* 19 Nov 2026: finance keeps only what the RTW flow needs — approving the PO and paying it (in parts). Invoices, the ledger and COGS stay on each style's record; their screens are off the menu. */
  { path:'/payments',     label:'Payments to make',           hint:'what is due to factories now, what comes later; record or upload payments', group:'Finance', roles:['owner','finance'] },
  { path:'/qc',           label:'QC · samples and inspections', hint:'PP sample, size set, the line inspections: pass or fail with remarks', group:'QC', roles:['owner','qc'] },
  { path:'/factory',      label:'My factory · merchandiser',   hint:"the floor's own day: output, pieces, cloth",     group:'Merchandiser', roles:['owner','merchandiser','production'] , hideFor:['production']},

  /* moving */
  /* 12 Nov 2026: no warehouse portal in PLM — goods in, GRNs and STOs all happen on Enigma; PLM reads the GRN back onto the PO */

  /* selling */
  { path:'/stores',       label:'My store',                   hint:'orders, customers, stock, returns',              group:'Store',    roles:['owner','store'] },

  /* money */
];

/** where a role lands: the first screen it works in */
export const homeFor = (role: RoleId) => NAV.find(n => n.roles.includes(role))?.path ?? '/design';

/* Walkthrough mode opens every screen, which makes it easy to forget whose
   desk you are standing at. One strip at the top of a screen that is not your
   team's says so, and offers the switch. */
/** Where you are: team / screen / record, and the screen you came from when it is somewhere else. */
const PREV_KEY = 'bsc-prev-screen';
function Crumbs() {
  const { db } = useApp();
  const loc = useLocation();
  const navPath = loc.pathname.startsWith('/fabric/') ? '/fabrics' : loc.pathname;
  const entry = NAV.filter(n => n.path !== '/' && navPath.startsWith(n.path)).sort((a, b) => b.path.length - a.path.length)[0];
  const fabric = loc.pathname.startsWith('/fabric/') ? db.fabrics.find(f => f.id === loc.pathname.split('/')[2]) : null;
  const [from, setFrom] = useState<{ path: string; label: string } | null>(null);
  /* before paint, so the 'opened from' crumb never pushes the heading down after the fact */
  useLayoutEffect(() => {
    let prev: { path: string; label: string } | null = null;
    try { prev = JSON.parse(sessionStorage.getItem(PREV_KEY) ?? 'null'); } catch { /* storage off */ }
    const me = NAV.filter(n => n.path !== '/' && navPath.startsWith(n.path)).sort((a, b) => b.path.length - a.path.length)[0];
    setFrom(prev && me && prev.label !== me.label ? prev : null);
    /* remember this screen for the next page, but only list screens, not record pages */
    if (me && !loc.pathname.startsWith('/fabric/')) try { sessionStorage.setItem(PREV_KEY, JSON.stringify({ path: `#${loc.pathname}${loc.search}`, label: me.label })); } catch { /* storage off */ }
  }, [loc.pathname]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!entry) return null;
  const sep = <span style={{ color:'var(--line)' }}>/</span>;
  return <div className="crumbs flex items-center gap-2 flex-wrap">
    <span>{RTW_ONLY && entry.group === 'Design' ? 'Category' : entry.group}</span>{sep}
    {fabric ? <NavLink to={entry.path} className="crumb-link">{entry.label}</NavLink> : <span className="crumb-here">{entry.label}</span>}
    {fabric && <>{sep}<span className="crumb-here">{fabric.name}</span></>}
    {fabric && from && <span className="crumb-from">· opened from <a href={from.path} className="crumb-link">{from.label}</a></span>}
  </div>;
}

/* the team each sidebar group belongs to; the portal you are in makes you that team (18 Nov 2026) */
export const GROUP_ROLE: Record<string, string> = { Design:'design', Category:'design', Sourcing:'sourcing', Planning:'planning', Production:'production', 'Production · MTM':'production', 'Production · RTW':'production', Merchandiser:'merchandiser', QC:'qc', Warehouse:'warehouse', Store:'store', Finance:'finance', HOD:'hod', 'Planning · sizes':'planning', Transfers:'materials', Marketing:'marketing', Owner:'owner', Company:'owner' };

function ScreenOwner() {
  /* 18 Nov 2026: every screen is yours: you act as the team whose portal you are in, so no "whose screen" line */
  return null;
}

export function Shell() {
  const { db, role, myRole, demoAll, setDemoAll, settings, personId, setPerson, storeId, setStore, factoryId, setFactory, reset } = useApp();
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  /* design and planning work from the one Design requirements screen; the per-record lists stay reachable by link and drawer */
  /* Walkthrough mode is a super admin: every screen, whoever you are signed in
     as. Off, each team sees only the screens it works in. */
  /* 18 Nov 2026: every portal shows for everyone; outside walkthrough a team's screens are view-only to the others */
  const items = NAV.filter(n => inEdition(n.path) && !(RTW_ONLY && RTW_HIDDEN_NAV_GROUPS.includes(n.group ?? '')) && !(RTW_ONLY && RTW_HIDDEN_PATHS.includes(n.path))).map(n => RTW_ONLY && n.path === '/sourcing' ? { ...n, label: 'Sourcing · vendors and sending', hint: 'vendor details on requirements; cloth and trims BSC sends' } : n).map(n => RTW_ONLY && n.group === 'Production · MTM' ? { ...n, group: 'Production · RTW' } : RTW_ONLY && n.group === 'Design' ? { ...n, group: 'Category' } : n);
  const allowedItems = NAV.filter(n => n.roles.includes(role));
  /* a path that is not a screen at all (the old /concepts, /requests, /requirements redirects) passes through to the router untouched — with its query intact */
  const allowed = true; void allowedItems;
  const me = PEOPLE.find(p => p.id === personId)!;
  /* the sidebar's sections, in the order of the flow, with the one you are in marked */
  /* a record page sits under the screen that lists it: a fabric's page is part of the MTM fabric master */
  const navPath = loc.pathname.startsWith('/fabric/') ? '/fabrics' : loc.pathname;
  const here = items.find(n => navPath.startsWith(n.path))?.group;

  const groups = useMemo(() => {
    const out: { name: string; items: typeof items; hasActive: boolean }[] = [];
    items.forEach(n => { const name = n.group ?? '—'; const g = out.find(x => x.name === name) ?? (out.push({ name, items: [], hasActive: false }), out[out.length - 1]); g.items.push(n); });
    const mine = (g: { items: typeof items }) => !demoAll && myRole !== 'owner' && g.items.some(n => n.roles.includes(myRole));
    return out.map(g => ({ ...g, hasActive: g.name === here, mine: mine(g) }));
  }, [items, here, demoAll, myRole]);
  /* a section you have not touched follows the screen you are on; once you open
     or close one by hand, that choice sticks for the session */
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (name: string) => open[name] ?? name === here;
  /* the portal you are in makes you its team (18 Nov 2026) */
  const { setPortalRole } = useApp();
  const portalEntry = NAV.filter(n => n.path !== '/' && (loc.pathname.startsWith('/fabric/') ? '/fabrics' : loc.pathname).startsWith(n.path)).sort((a, b) => b.path.length - a.path.length)[0];
  const portalRole = (portalEntry?.group ? GROUP_ROLE[portalEntry.group] : null) as RoleId | null;
  useLayoutEffect(() => { setPortalRole(portalRole && portalRole !== 'owner' ? portalRole : null); }, [portalRole, setPortalRole]);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => { setNavOpen(false); }, [loc.pathname, loc.search]);
  /* phone: on the floor roles' list screens every table row reads as a card; each cell is labelled with its column heading */
  const CARD_SCREENS = ['/sizes', '/transfers', '/marketing', '/po-draft', '/qc', '/factory', '/inward', '/tracker', '/rtw-sourcing', '/design', '/approvals', '/approvals-hod', '/payments', '/dashboard', '/factory-db', '/cloth-vendors'];
  const cards = CARD_SCREENS.some(p => loc.pathname === p || loc.pathname.startsWith(p + '/'));
  useEffect(() => {
    if (!cards) return; const main = document.querySelector('main.app-main'); if (!main) return; let raf = 0;
    const label = () => { raf = 0; if (!window.matchMedia('(max-width: 820px)').matches) return;
      main.querySelectorAll('table.t').forEach(t => { const heads = [...t.querySelectorAll('thead th')].map(h => (h.textContent ?? '').trim());
        if (!heads.length) return; t.classList.add('m-cards');
        t.querySelectorAll('tbody > tr').forEach(tr => { const tds = [...tr.children] as HTMLElement[]; const plain = tds.length === heads.length;
          tr.classList.toggle('m-span', !plain); if (plain) tds.forEach((td, i) => { if (td.dataset.th !== heads[i]) td.dataset.th = heads[i]; }); }); }); };
    const ob = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(label); }); ob.observe(main, { childList: true, subtree: true }); label();
    const mq = window.matchMedia('(max-width: 820px)'); mq.addEventListener('change', label);
    return () => { ob.disconnect(); mq.removeEventListener('change', label); if (raf) cancelAnimationFrame(raf); };
  }, [cards, loc.pathname]);

  return (
    <div className={`app-shell grid min-h-screen${settings.quiet ? ' quiet' : ''}${navOpen ? ' nav-open' : ''}`} style={{ gridTemplateColumns:'264px minmax(0,1fr)' }}>
      {/* phone: a top bar with the menu; the sidebar slides in over the screen (18 Nov 2026) */}
      <header className="app-top"><button type="button" className="app-burger" aria-label="Menu" aria-expanded={navOpen} onClick={() => setNavOpen(v => !v)}>☰</button>
        <img src={`${import.meta.env.BASE_URL}bsc-logo-light.png`} alt="" width={30} height={30} /><b>BSC PLM</b><span className="app-top-where">{NAV.filter(n => n.path !== '/' && loc.pathname.startsWith(n.path)).sort((a, b) => b.path.length - a.path.length)[0]?.label ?? ''}</span></header>
      {navOpen && <div className="app-scrim" onClick={() => setNavOpen(false)} aria-hidden />}
      <aside className="app-side flex flex-col gap-4 px-3 py-4 sticky top-0 h-screen overflow-y-auto" style={{ background:'var(--sidebar)', color:'var(--sidebar-ink)' }}>
        <a href="#/" className="px-2 flex items-center gap-3" style={{ textDecoration: 'none', color: 'inherit' }} aria-label="BSC PLM home">
          <img src={`${import.meta.env.BASE_URL}bsc-logo-light.png`} alt="Bombay Shirt Company" width={52} height={52} style={{ flex: 'none' }} />
          <div><div className="uppercase leading-none" style={{ fontFamily:'var(--display)', fontWeight:700, fontSize:22, letterSpacing:'.08em' }}>BSC <span style={{ color:'var(--sidebar-soft)' }}>PLM</span></div>
          <div className="text-[11px] uppercase tracking-[.12em] mt-1" style={{ color:'var(--sidebar-soft)' }}>Bombay Shirt Company{EDITION_LABEL ? ` · ${EDITION_LABEL} edition` : ''}</div></div>
        </a>

        <div className="px-1"><SearchHint /></div>

        {/* One section open at a time, by default the one you are standing in —
            eighteen screens under seven headings is a scroll, not a menu. */}
        <nav className="flex flex-col gap-1 px-1">
          {groups.map(g => { const on = isOpen(g.name); const role = GROUP_ROLE[g.name] ?? 'owner'; return <div key={g.name} className={`nav-group${on ? ' open' : ''}${g.hasActive ? ' here' : ''}`}>
            {/* the group is a pill you press: a role-coloured dot, the team's name, how many screens, a chevron.
                Open, it fills; the screens drop out underneath it on a rail, so a team and a screen never look the same */}
            <button type="button" aria-expanded={on} onClick={() => setOpen(o => ({ ...o, [g.name]: !on }))} className="nav-pill">
              <span className="nav-dot" style={{ background: `var(--role-${role})` }} />
              <span className="nav-pill-name">{g.name === 'Warehouse' ? 'Warehouse (Prince)' : g.name}</span>
              <span className="nav-count">{g.items.length}</span>
              <span className="nav-chev" aria-hidden>▾</span>
            </button>
            {on && <div className="nav-rail">{g.items.map(n => <NavLink key={n.path} to={n.path} end={n.path === '/'} className={({ isActive }) => `nav-item${isActive || (n.path !== '/' && navPath.startsWith(n.path) && navPath !== loc.pathname) ? ' on' : ''}`} title={n.hint}>
              <span className="nav-item-label">{n.label}</span><span className="nav-hint">{n.hint}</span>
            </NavLink>)}</div>}
          </div>; })}
        </nav>

        {/* 19 Nov 2026: My views removed from the sidebar */}

        {/* who you are is one quiet line; the switches under it are demo scaffolding
            and fold away until asked for */}
        <div className="mt-auto flex flex-col gap-2 px-1">
          <div className="px-1 text-[12.5px] leading-snug" style={{ color:'var(--sidebar-ink)' }}>{me.name}<div className="text-[11px]" style={{ color:'var(--sidebar-soft)' }}>{me.title}{demoAll ? ' · walkthrough' : ''}</div>{!demoAll && portalRole && portalRole !== 'owner' && portalRole !== me.role && <div className="acting-as">Working here as <b>{ROLE_LABEL[portalRole] ?? portalRole}</b></div>}</div>
          <ThemePicker />
          <details className="demo-fold flex flex-col gap-2 px-1">
          <summary>Demo settings</summary>
          <div className="flex flex-col gap-2 pt-1">
          {!demoAll && <>
            <div className="text-[11px] uppercase tracking-[.1em]" style={{ color:'var(--sidebar-soft)' }}>Signed in as</div>
            <Select value={personId} onChange={setPerson} style={{ background:'rgb(255 255 255/.06)', color:'var(--sidebar-ink)', borderColor:'rgb(255 255 255/.12)', fontSize: 14 }}
              groups={(Object.keys(ROLE_LABEL) as RoleId[]).filter(r => RTW_ONLY || r !== 'warehouse').filter(r => MTM_ONLY ? (r !== 'planning') : RTW_ONLY ? NAV.some(n => n.roles.includes(r) && inEdition(n.path) && r !== 'owner') || r === 'owner' : true).map(r => ({ label: ROLE_LABEL[r], options: PEOPLE.filter(p => p.role === r).map(p => ({ value:p.id, label:`${p.name} · ${p.title}` })) })).filter(g => g.options.length)} />
          </>}
          {myRole === 'merchandiser' && !demoAll && <Select value={factoryId} onChange={setFactory} style={{ background:'rgb(255 255 255/.06)', color:'var(--sidebar-ink)', borderColor:'rgb(255 255 255/.12)', fontSize: 14 }}
            options={db.vendors.filter(v => (RTW_ONLY ? v.kind.endsWith('factory') : v.mtm) && v.kind !== 'Hemming unit').map(v => ({ value:v.id, label:v.name }))} />}
          {(myRole === 'store' && !demoAll) && <Select value={storeId} onChange={setStore} style={{ background:'rgb(255 255 255/.06)', color:'var(--sidebar-ink)', borderColor:'rgb(255 255 255/.12)', fontSize: 14 }} options={STORES.map(s => ({ value:s.id, label:s.name }))} />}
          {demoAll && <>
            <Select value={factoryId} onChange={setFactory} style={{ background:'rgb(255 255 255/.06)', color:'var(--sidebar-ink)', borderColor:'rgb(255 255 255/.12)', fontSize: 14 }}
              options={db.vendors.filter(v => (RTW_ONLY ? v.kind.endsWith('factory') : v.mtm) && v.kind !== 'Hemming unit').map(v => ({ value:v.id, label:v.name }))} />
            {!RTW_ONLY && <Select value={storeId} onChange={setStore} style={{ background:'rgb(255 255 255/.06)', color:'var(--sidebar-ink)', borderColor:'rgb(255 255 255/.12)', fontSize: 14 }} options={STORES.map(s => ({ value:s.id, label:s.name }))} />}
          </>}
          {/* A blocked button teaches nothing in a walkthrough. With this on you keep
              your name and your screen, and every team's step is open to you — each
              one still labelled with whose step it is. */}
          <label className="flex items-start gap-2 text-[12.5px] leading-snug cursor-pointer pt-1" style={{ color:'var(--sidebar-soft)' }}>
            <input type="checkbox" checked={demoAll} onChange={e => setDemoAll(e.target.checked)} className="mt-[2px]" />
            <span><b style={{ color:'var(--sidebar-ink)' }}>Walkthrough mode</b><br/>{demoAll ? 'Super admin: every screen and every button, whoever you are signed in as.' : `Every screen opens; ${me.name.split(' ')[0]} changes only what ${me.name.split(' ')[0]}'s team does. The rest is view only.`}</span>
          </label>
          <Button size="sm" variant="ghost" onClick={reset} style={{ color:'var(--sidebar-soft)', justifyContent:'flex-start', padding:'4px 2px', fontSize: 12.5 }}>Reset demo data</Button>
          
          </div>
          </details>
        </div>
      </aside>

      {/* a screen this role does not work in is not reachable, even by URL — it lands on the role's own first screen */}
      <main className="app-main px-7 py-4 max-w-[1280px] w-full"><MentionBar /><div className="app-crumbs" style={{ minHeight: 34, paddingRight: 190, display: 'flex', alignItems: 'center' }}><Crumbs />{!demoAll && portalRole && portalRole !== 'owner' && <span className={`acting-chip pill role-${portalRole === 'hod' ? 'owner' : portalRole}`}>You are {ROLE_LABEL[portalRole] ?? portalRole} here</span>}</div><ScreenOwner /> {allowed ? <Outlet /> : <Navigate to={homeFor(role)} replace />}</main>
      <VendorDrawer />
      <CommandSearch />
      <Toasts />
    </div>
  );
}

/* 25 Nov 2026: pick a colour theme; kept in this browser */
function ThemePicker() {
  const [cur, setCur] = useState(savedTheme());
  const t = THEMES.find(x => x.id === cur) ?? THEMES[0];
  return <div className="theme-pick px-1">
    <div className="text-[11px] uppercase tracking-[.1em] pb-1" style={{ color: 'var(--sidebar-soft)' }}>Theme · {t.name}</div>
    <div className="theme-dots">{THEMES.map(x => <button key={x.id} type="button" title={x.name} aria-label={`${x.name} theme`} aria-pressed={x.id === cur}
      onClick={() => { applyTheme(x.id); setCur(x.id); }} className={x.id === cur ? 'on' : ''}
      style={{ background: `linear-gradient(135deg, ${x.sidebar} 0 50%, ${x.accent} 50% 100%)` }} />)}</div>
  </div>;
}
