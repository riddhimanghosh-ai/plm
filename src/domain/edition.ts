/* Two prototypes from one codebase. The full one shows every team and both
   product lines; the MTM edition hides everything ready-to-wear — the tracker,
   planning, launches, bulk POs — and keeps made-to-measure end to end: design's
   fabric asks, sourcing, the swatch desk, the store floor, MTM daily production,
   the factory merchandiser and the warehouse. Set VITE_EDITION=mtm to get it. */
export const MTM_ONLY = import.meta.env.VITE_EDITION === 'mtm';
export const EDITION_LABEL = MTM_ONLY ? 'MTM' : null;
/* screens that do not exist in the MTM edition */
export const RTW_PATHS = ['/planning', '/health', '/insights', '/launches', '/tracker', '/otif', '/requirements'];
/* an alert or search hit that points at an RTW screen or record is dropped in the MTM edition */
export const isRtwHref = (h: string | undefined | null) => !!h && (RTW_PATHS.some(p => h.startsWith(`#${p}`)) || h.includes('side=rtw') || h.includes('tab=rtw') || h.includes('tab=shelves') || h.includes('tab=rtw-orders') || h.includes('tab=launches'));

/* an option request's category is a garment category name; in the MTM edition the "RTW" prefix only confuses */
export const catLabel = (c: string) => MTM_ONLY ? c.replace(/^RTW (CMT |FOB )?/i, '') : c;

/* 20 Oct 2026: a "several options" request is no longer a flow. Design raises each option as its own MTM fabric ask. */
export const OPTIONS_OFF = true;
