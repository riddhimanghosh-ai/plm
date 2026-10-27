/* The cutting team's view of a cloth: the fabric image and where its roll sits.
   The backend supplies the fabric image (fabric master) and the bin: its code, place on
   the rack and a photo. Where the prototype has no photograph it draws a stand-in from
   the fabric's name (colour and weave) and a rack map from the bin code. */
import type { Fabric } from '../domain/types';

const COLOURS: [RegExp, string][] = [
  [/navy|indigo/i, '#27375a'], [/sky/i, '#9cc3e6'], [/blue/i, '#5b86c2'], [/pink|rose/i, '#e7a9b8'], [/lavender|lilac|purple/i, '#b6a4d6'],
  [/grey|gray|charcoal/i, '#9a9da3'], [/black/i, '#2a2a2a'], [/olive/i, '#7b7d4a'], [/green|sage|mint/i, '#7fa98a'], [/teal/i, '#3d8c8a'],
  [/beige|khaki|sand|stone|ecru|cream|natural/i, '#d9ccb0'], [/brown|tan|camel/i, '#9a7451'], [/maroon|wine|burgundy/i, '#7a2d3b'], [/red/i, '#c2463f'],
  [/yellow|mustard/i, '#e2c15a'], [/orange|rust/i, '#d27b45'], [/white/i, '#f7f6f2'],
];
const coloursOf = (name: string) => { const found = COLOURS.filter(([re]) => re.test(name)).map(([, c]) => c); return found.length ? found : ['#c9ccd2']; };
const weaveOf = (name: string) => /stripe/i.test(name) ? 'stripes' : /check|plaid|gingham|tartan/i.test(name) ? 'checks' : /herringbone/i.test(name) ? 'herringbone' : /dobby|jacquard/i.test(name) ? 'dobby' : /print|floral|paisley/i.test(name) ? 'print' : 'twill';

export function FabricImage({ f, height = 320 }: { f: Fabric; height?: number }) {
  if (f.imageUrl) return <img src={f.imageUrl} alt={`${f.name} fabric`} style={{ width: '100%', height, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)', display: 'block' }} />;
  const [base, accent = base === '#f7f6f2' ? '#c9ccd2' : '#f7f6f2'] = coloursOf(f.name);
  const w = weaveOf(f.name); const id = `fab-${f.id}`;
  return <svg viewBox="0 0 400 300" width="100%" height={height} preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${f.name} fabric image`} style={{ borderRadius: 10, border: '1px solid var(--line)', display: 'block' }}>
    <defs>
      <pattern id={`${id}-tw`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill={base} /><rect width="2" height="6" fill="#000" opacity=".06" /></pattern>
      <pattern id={`${id}-p`} width={w === 'checks' ? 36 : w === 'stripes' ? 18 : w === 'herringbone' ? 16 : w === 'dobby' ? 10 : 44} height={w === 'stripes' ? 300 : w === 'checks' ? 36 : w === 'herringbone' ? 16 : w === 'dobby' ? 10 : 44} patternUnits="userSpaceOnUse">
        <rect width="100%" height="100%" fill={`url(#${id}-tw)`} />
        {w === 'stripes' && <rect x="0" width="5" height="300" fill={accent} opacity=".85" />}
        {w === 'checks' && <><rect width="12" height="36" fill={accent} opacity=".45" /><rect width="36" height="12" fill={accent} opacity=".45" /></>}
        {w === 'herringbone' && <path d="M0 0 L8 8 L0 16 M8 0 L16 8 L8 16" stroke="#000" strokeOpacity=".12" strokeWidth="2" fill="none" />}
        {w === 'dobby' && <rect x="4" y="4" width="2" height="2" fill={accent} opacity=".9" />}
        {w === 'print' && <><circle cx="12" cy="12" r="6" fill={accent} opacity=".8" /><circle cx="34" cy="32" r="4" fill={accent} opacity=".6" /></>}
      </pattern>
      <linearGradient id={`${id}-sh`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".18" /><stop offset="1" stopColor="#000" stopOpacity=".12" /></linearGradient>
    </defs>
    <rect width="400" height="300" fill={`url(#${id}-p)`} />
    <rect width="400" height="300" fill={`url(#${id}-sh)`} />
  </svg>;
}

/** the bin on a rack map: racks R1–R9 across, shelves A–F down; the roll's bin lit */
export function BinMap({ bin, warehouse }: { bin: string; warehouse: string }) {
  const m = /^R(\d+)-([A-Z])$/.exec(bin); const rack = m ? Number(m[1]) : 0; const shelf = m ? m[2].charCodeAt(0) - 65 : -1;
  const RACKS = 9, SHELVES = 6, cw = 40, ch = 22, x0 = 34, y0 = 26;
  return <svg viewBox={`0 0 ${x0 + RACKS * cw + 10} ${y0 + SHELVES * ch + 26}`} width="100%" role="img" aria-label={`Bin ${bin} in ${warehouse}`} style={{ display: 'block' }}>
    {Array.from({ length: RACKS }, (_, r) => <text key={r} x={x0 + r * cw + cw / 2} y={18} textAnchor="middle" fontSize="11" fill="var(--ink-faint)">R{r + 1}</text>)}
    {Array.from({ length: SHELVES }, (_, s) => <text key={s} x={x0 - 10} y={y0 + s * ch + ch / 2 + 4} textAnchor="end" fontSize="11" fill="var(--ink-faint)">{String.fromCharCode(65 + s)}</text>)}
    {Array.from({ length: RACKS * SHELVES }, (_, k) => { const r = k % RACKS, s = Math.floor(k / RACKS); const on = r + 1 === rack && s === shelf;
      return <rect key={k} x={x0 + r * cw + 2} y={y0 + s * ch + 2} width={cw - 4} height={ch - 4} rx="3" fill={on ? 'var(--accent)' : 'var(--line)'} opacity={on ? 1 : .55} />; })}
    {m && <text x={x0 + (rack - 1) * cw + cw / 2} y={y0 + shelf * ch + ch / 2 + 4} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#fff">{bin}</text>}
    <text x={x0} y={y0 + SHELVES * ch + 18} fontSize="11" fill="var(--ink-faint)">{warehouse} · racks across, shelves down · entrance at R1</text>
  </svg>;
}
