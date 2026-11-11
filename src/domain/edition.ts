/* Two prototypes from one codebase. The full one shows every team and both
   product lines; the MTM edition hides everything ready-to-wear — the tracker,
   planning, launches, bulk POs — and keeps made-to-measure end to end: design's
   fabric asks, sourcing, the swatch desk, the store floor, MTM daily production,
   the factory merchandiser. The warehouse portal is out of it too. Set VITE_EDITION=mtm to get it. */
export const MTM_ONLY = import.meta.env.VITE_EDITION === 'mtm';
/* 11 Nov 2026: the RTW edition — ready-to-wear and planning only: RTW requirements, planning, sourcing's RTW cloth,
   the RTW tracker, the factory merchandiser's RTW POs, the warehouse inward and GRN. Set VITE_EDITION=rtw to get it. */
export const RTW_ONLY = import.meta.env.VITE_EDITION === 'rtw';
export const EDITION_LABEL = MTM_ONLY ? 'MTM' : RTW_ONLY ? 'RTW' : null;
/* screens that do not exist in the RTW edition */
export const MTM_PATHS = ['/swatches', '/fabrics', '/designs', '/vendors', '/mtm', '/cad', '/cutting', '/fusing', '/compiling', '/stores'];
/* an alert or search hit that points at an MTM screen or record is dropped in the RTW edition */
export const isMtmHref = (h: string | undefined | null) => !!h && (MTM_PATHS.some(p => h.startsWith(`#${p}`)) || h.includes('side=mtm') || /open=(cn|c|req|cust|co)-/.test(h));
/* is this path shown in the current edition */
export const inEdition = (path: string) => !(MTM_ONLY && RTW_PATHS.includes(path)) && !(RTW_ONLY && MTM_PATHS.includes(path));
/* screens that do not exist in the MTM edition */
/* 20 Oct 2026: the warehouse portal is out of the MTM edition too — receiving lives on the fabric PO and the fabric record */
export const RTW_PATHS = ['/planning', '/analyse', '/sheet', '/health', '/insights', '/launches', '/tracker', '/otif', '/requirements', '/warehouse', '/grn', '/outbound'];
/* an alert or search hit that points at an RTW screen or record is dropped in the MTM edition */
export const isRtwHref = (h: string | undefined | null) => !!h && (RTW_PATHS.some(p => h.startsWith(`#${p}`)) || h.includes('side=rtw') || h.includes('tab=rtw') || h.includes('tab=shelves') || h.includes('tab=rtw-orders') || h.includes('tab=launches'));

/* an option request's category is a garment category name; in the MTM edition the "RTW" prefix only confuses */
export const catLabel = (c: string) => MTM_ONLY ? c.replace(/^RTW (CMT |FOB )?/i, '') : c;

/* 20 Oct 2026: a "several options" request is no longer a flow. Design raises each option as its own MTM fabric ask. */
export const OPTIONS_OFF = true;
