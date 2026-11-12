"""RTW in PLM, high level: one box per module with what happens in it, circles for start and end,
diamonds for the decisions, three phase bands behind. Writes a self-contained HTML page and an SVG.
Usage: python3 -I .overview.py out.html out.svg"""
import sys, html
out_html, out_svg = sys.argv[1], sys.argv[2]
esc = html.escape
INK, SOFT, FAINT = '#1a1a13', '#5d5a4e', '#8a8676'
svg = []
def add(s): svg.append(s)

W_BOX = 250
def box_h(items): return 58 + 19 * len(items) + 12

# module boxes: key, x, y, number, title, owners, items (text, muted?)
MODS = {
 'req': (130, 120, '1', 'Requirement', 'Design · Planning · Enigma',
   [('Starts from: design ask,', 0), ('planning reorder or Enigma auto-PO', 0), ('Style, qty by size, date, cost', 0), ('Cloth brief · BOM · CAD', 0), ('Send to the factory for sampling', 0)]),
 'smp': (430, 120, '2', 'Sample cycle', 'Factory · Design',
   [('Prototype', 0), ('Sampling cycle', 0), ('Trial cycle', 0), ('Each: due date, back, approve', 0), ('or remarks → update CAD and design', 0)]),
 'po':  (860, 56, '3', 'Bulk order and PO', 'Nitin · Design · Factory',
   [('Qty and size-wise qty', 0), ('Nitin proposes, design accepts', 0), ('Piece + logistics + other costs', 0), ('Factory acknowledges the PO', 0), ('TNA generated from the PO date', 0)]),
 'cl':  (860, 300, '4', 'Cloth and trims · in parallel', 'Sourcing',
   [('Vendor · price · hold', 0), ('Fabric PO to the mill (Enigma)', 0), ('Send cloth and trims to the factory', 0)]),
 'cnt': (1180, 120, '5', 'Tech pack and count-in', 'Design · Factory · Sourcing',
   [('Design uploads the tech pack', 0), ('Factory counts cloth and trims in', 0), ('Cloth short → design gives a new', 0), ('cut ratio; factory sees it at once', 0), ('Trims short → sourcing sends the rest', 0), ('Factory approves all received', 0)]),
 'mfg': (1180, 640, '6', 'Manufacturing', 'Factory · Nitin',
   [('TNA: 22 steps', 0), ('planned · revised · actual on each', 0), ('Not-needed steps skipped', 0), ('Tracker · OTIF · late in red', 0)]),
 'shp': (720, 640, '7', 'Delivery', 'Factory · Shravani',
   [('Factory logs dispatch on the TNA', 0), ('GRN by Shravani on Enigma,', 1), ('as today; shows on the record', 1), ('AWB, courier, logistics: not in PLM', 1)]),
 'cog': (430, 640, '8', 'COGS and profitability', 'Nitin · Design see it',
   [('Costing sheet + actuals per piece:', 0), ('fabric, CMT, trims, freight, overheads', 0), ('PO logistics and other costs', 0), ('vs MRP net of discounts and GST', 0), ('Intake margin per style', 0)]),
 'cod': (130, 640, '9', 'Design codes', 'Design · Planning · Enigma',
   [('Add to a drop · name · date', 0), ('Mint design codes', 0), ('name · cloth · MRP · sizes', 0), ('Rows and variants in Enigma', 0)]),
}
geo = {k: (v[0], v[1], W_BOX, box_h(v[5])) for k, v in MODS.items()}
mid = lambda k: (geo[k][0] + geo[k][2] / 2, geo[k][1] + geo[k][3] / 2)

# decisions and terminals
D1 = (765, 228, 'Sample', 'right?')
D2 = (1080, 720, 'QC', 'passed?')
START = (62, 228, 'Ask')
END = (62, 720, 'Ready', 'to sell')

WIDTH, HEIGHT = 1500, 960

# ---- phase bands (behind everything) ----
def band(x0, y0, x1, y1, label, fill, line, note=None):
    add(f'<rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" rx="18" fill="{fill}" stroke="{line}" stroke-width="1.3"/>')
    add(f'<text x="{x0+18}" y="{y0+28}" font-size="14" font-weight="700" letter-spacing=".04em" fill="#3c4a30">{esc(label.upper())}</text>')
    if note:
        tw = len(note) * 6.7 + 30
        add(f'<rect x="{x1-tw-16}" y="{y1-38}" width="{tw}" height="24" rx="12" fill="#fde2e2" stroke="#e5a3a3"/>'
            f'<text x="{x1-tw/2-16}" y="{y1-21}" text-anchor="middle" font-size="12" font-weight="600" fill="#9b2c2c">⚠ {esc(note)}</text>')
band(16, 14, 824, 548, 'Conceptualization · design and sampling', '#f3efe2', '#c9b98a')
band(840, 14, WIDTH - 16, 548, 'Pre-production · bulk order, PO and sourcing', '#eef3e8', '#a3b58f')
band(1006, 580, WIDTH - 16, 940, 'Production', '#fdf3df', '#d6b26a', 'heaviest manual and tedious work')
band(16, 580, 990, 940, 'Post-production', '#e8eef8', '#8fa6cf')

# ---- arrows ----
def arrow(d, label=None, lx=0, ly=0, dashed=False):
    dash = ' stroke-dasharray="6 4"' if dashed else ''
    add(f'<path d="{d}" fill="none" stroke="#4a4a40" stroke-width="1.6" marker-end="url(#a)"{dash}/>')
    if label:
        add(f'<text x="{lx}" y="{ly}" font-size="11.5" fill="{SOFT}" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="4">{esc(label)}</text>')
def right(k): x, y, w, h = geo[k]; return x + w, y + h / 2
def left(k): x, y, w, h = geo[k]; return x, y + h / 2
def top(k): x, y, w, h = geo[k]; return x + w / 2, y
def bottom(k): x, y, w, h = geo[k]; return x + w / 2, y + h

# start → requirement → sample cycle → decision
arrow(f'M{START[0]+34} {START[1]}L{left("req")[0]} {START[1]}')
arrow(f'M{right("req")[0]} {mid("req")[1]}L{left("smp")[0]} {mid("smp")[1]}')
arrow(f'M{right("smp")[0]} {D1[1]}L{D1[0]-52} {D1[1]}')
# no → remarks back into the sample cycle
bx, by = bottom('smp')
arrow(f'M{D1[0]} {D1[1]+52}L{D1[0]} {by+40}L{bx} {by+40}L{bx} {by}', 'no · remarks → update CAD, next round', (D1[0]+bx)/2, by+34)
# yes → fork to PO and cloth, in parallel
fx = D1[0] + 52
arrow(f'M{fx} {D1[1]}L{fx+20} {D1[1]}L{fx+20} {mid("po")[1]}L{left("po")[0]} {mid("po")[1]}', 'yes', fx+8, D1[1]-10)
arrow(f'M{fx+20} {D1[1]}L{fx+20} {mid("cl")[1]}L{left("cl")[0]} {mid("cl")[1]}', 'in parallel', fx-14, mid('cl')[1]-10)
# join into count-in
jx = right('po')[0] + 30
arrow(f'M{right("po")[0]} {mid("po")[1]}L{jx} {mid("po")[1]}L{jx} {mid("cnt")[1]}L{left("cnt")[0]} {mid("cnt")[1]}', 'PO out', right('po')[0]+20, mid('po')[1]-10)
arrow(f'M{right("cl")[0]} {mid("cl")[1]}L{jx} {mid("cl")[1]}L{jx} {mid("cnt")[1]}', 'cloth in', right('cl')[0]+22, mid('cl')[1]-10)
# count-in → manufacturing (down)
arrow(f'M{bottom("cnt")[0]} {bottom("cnt")[1]}L{top("mfg")[0]} {top("mfg")[1]}', 'all received', bottom('cnt')[0]+44, (bottom('cnt')[1]+top('mfg')[1])/2)
# manufacturing → QC
arrow(f'M{left("mfg")[0]} {D2[1]}L{D2[0]+52} {D2[1]}')
# QC no → rework
mx, my = bottom('mfg')
arrow(f'M{D2[0]} {D2[1]+52}L{D2[0]} {my+30}L{mx} {my+30}L{mx} {my}', 'no · rework', (D2[0]+mx)/2, my+24)
# QC yes → shipping → COGS → codes → end
arrow(f'M{D2[0]-52} {D2[1]}L{right("shp")[0]} {D2[1]}', 'yes', (D2[0]-52+right('shp')[0])/2, D2[1]-10)
ly = min(mid('shp')[1], mid('cog')[1], mid('cod')[1])   # one level for the post-production arrows
arrow(f'M{left("shp")[0]} {ly}L{right("cog")[0]} {ly}')
arrow(f'M{left("cog")[0]} {ly}L{right("cod")[0]} {ly}')
arrow(f'M{left("cod")[0]} {END[1]}L{END[0]+38} {END[1]}')

# ---- boxes ----
for k, (x, y, num, title, owners, items) in MODS.items():
    w, h = W_BOX, box_h(items)
    outside = all(m for _, m in items[:4]) and k == 'shp'
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="#fffdf6" stroke="#8a7a3a" stroke-width="1.5"/>')
    add(f'<rect x="{x}" y="{y}" width="{w}" height="42" rx="12" fill="#3c4a30"/><rect x="{x}" y="{y+30}" width="{w}" height="12" fill="#3c4a30"/>')
    add(f'<circle cx="{x+22}" cy="{y+21}" r="12" fill="#fff"/><text x="{x+22}" y="{y+25.5}" text-anchor="middle" font-size="13" font-weight="700" fill="#3c4a30">{num}</text>')
    add(f'<text x="{x+42}" y="{y+26}" font-size="14.5" font-weight="700" fill="#fff">{esc(title)}</text>')
    add(f'<text x="{x+14}" y="{y+60}" font-size="11" font-weight="600" letter-spacing=".04em" fill="{FAINT}">{esc(owners.upper())}</text>')
    for i, (t, muted) in enumerate(items):
        ty = y + 82 + i * 19
        cont = i > 0 and t[:1].islower()   # a continuation line carries no bullet
        if not cont: add(f'<circle cx="{x+19}" cy="{ty-4}" r="2.6" fill="{"#a9a391" if muted else "#8a7a3a"}"/>')
        ital = ' font-style="italic"' if muted else ''
        add(f'<text x="{x+30}" y="{ty}" font-size="12.5" fill="{FAINT if muted else INK}"{ital}>{esc(t)}</text>')
    if k == 'shp':
        add(f'<rect x="{x+8}" y="{y+85}" width="{w-16}" height="{3*19+2}" rx="8" fill="none" stroke="#a9a391" stroke-dasharray="5 4"/>')

# ---- decisions ----
def diamond(cx, cy, a, b):
    add(f'<path d="M{cx} {cy-52}L{cx+52} {cy}L{cx} {cy+52}L{cx-52} {cy}Z" fill="#e7ebe0" stroke="#3c4a30" stroke-width="1.6"/>')
    add(f'<text x="{cx}" y="{cy-2}" text-anchor="middle" font-size="12.5" font-weight="700" fill="{INK}">{esc(a)}</text><text x="{cx}" y="{cy+14}" text-anchor="middle" font-size="12.5" font-weight="700" fill="{INK}">{esc(b)}</text>')
diamond(D1[0], D1[1], D1[2], D1[3])
diamond(D2[0], D2[1], D2[2], D2[3])

# ---- start and end ----
add(f'<circle cx="{START[0]}" cy="{START[1]}" r="34" fill="#3c4a30"/><text x="{START[0]}" y="{START[1]+5}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">{START[2]}</text>')
add(f'<circle cx="{END[0]}" cy="{END[1]}" r="38" fill="#fff" stroke="#3c4a30" stroke-width="5"/><text x="{END[0]}" y="{END[1]-2}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#3c4a30">{END[2]}</text><text x="{END[0]}" y="{END[1]+13}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#3c4a30">{END[3]}</text>')

head = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" font-family="Inter, Helvetica, Arial, sans-serif"><defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#4a4a40"/></marker></defs><rect width="{WIDTH}" height="{HEIGHT}" fill="#fff"/>'
svg_text = head + '\n'.join(svg) + '</svg>'
open(out_svg, 'w').write(svg_text.replace('<svg ', f'<svg width="{WIDTH}" height="{HEIGHT}" ', 1))
legend = ('<div class="legend"><span><i class="c"></i> start · end</span><span><i class="b"></i> module</span>'
          '<span><i class="d"></i> decision</span><span><i class="o"></i> outside PLM for now</span></div>')
page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RTW at a glance</title>
<style>body{{margin:0;background:#fff;color:#1a1a13;font-family:Inter,system-ui,sans-serif;padding:24px}}h1{{font-size:22px;margin:0 0 4px}}p{{margin:0 0 12px;color:#6b6759;font-size:13.5px;max-width:110ch}}
.legend{{display:flex;gap:18px;font-size:12px;color:#6b6759;margin-bottom:10px;flex-wrap:wrap}}.legend i{{display:inline-block;vertical-align:middle;margin-right:5px}}
.legend .c{{width:12px;height:12px;border-radius:50%;background:#3c4a30}}.legend .b{{width:16px;height:11px;border-radius:3px;border:1.4px solid #8a7a3a;background:#fffdf6}}
.legend .d{{width:10px;height:10px;transform:rotate(45deg);border:1.4px solid #3c4a30;background:#e7ebe0}}.legend .o{{width:16px;height:11px;border-radius:3px;border:1.4px dashed #a9a391}}
.wrap{{overflow:auto;border:1px solid #e3ddcd;border-radius:10px}}svg{{display:block;width:100%;height:auto;min-width:1100px}}</style></head>
<body><h1>RTW in PLM · at a glance</h1><p>Nine modules, each with what happens in it, in four phases: conceptualization (the ask, design and the sample cycle), pre-production (the bulk order and PO with sourcing in parallel, through everything received at the factory), production (the TNA and QC), and post-production (shipping, COGS and the design codes). Diamonds are the two decisions that loop back. AWB, courier and logistics are not in PLM; the GRN stays with Shravani on Enigma.</p>{legend}<div class="wrap">{svg_text}</div></body></html>'''
open(out_html, 'w').write(page)
print('ok')
