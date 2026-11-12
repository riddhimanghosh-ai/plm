import sys, html
out_html, out_drawio, out_svg = sys.argv[1], sys.argv[2], sys.argv[3]
ROLE = {'dp':'Design · Planning','design':'Design','sourcing':'Sourcing','nitin':'Nitin','factory':'Factory','enigma':'Enigma','nd':'Nitin · Design'}
# the spine, in order: id, role, label, kind
SPINE = [
 ('r1','dp','Requirement raised\ndesign ask · reorder · auto-PO','step'),
 ('r2','design','Design the style\nbrief · BOM · CAD','step'),
 ('r3','design','Send for sampling\nsample due date','step'),
 ('f1','factory','Factory makes the sample\nby the due date','step'),
 ('d4','design','Trial · sample right?','decision'),
 ('n1','nitin','Propose a factory\ncost · date','step'),
 ('d6','design','Bulk order · raise the PO?\nqty by size','decision'),
 ('f2','factory','Acknowledge the PO','step'),
 ('d7','design','Upload the tech pack','step'),
 ('f3','factory','Count cloth and trims in\nagainst the PO','step'),
 ('f3b','factory','All in, as ordered?','decision'),
 ('f4','factory','Approve all received','step'),
 ('f5','factory','Make · log the TNA\n22 × planned · revised · actual','step'),
 ('f6','factory','QC passed?','decision'),
 ('f7','factory','AWB · courier · shipped\nnot in PLM yet','outside'),
 ('e4','enigma','Delivered · GRN\nShravani on Enigma, as today','outside'),
 ('n4','nitin','Close the shipment\nshipping cost','step'),
 ('cg','nd','COGS vs MRP\nmargin per style','step'),
 ('p3','dp','Add to a drop\nname · date','step'),
 ('d8','design','Mint design codes\nname · cloth · MRP · sizes','step'),
]
# boxes hanging under a spine box: parent, id, role, label, kind, edge label
SIDE = [
 ('r1','e0','enigma','or: Enigma auto-PO\ncore style below threshold','system','or'),
 ('d4','s1','sourcing','Shop cloth and trims\nin parallel with the PO','step','yes · in parallel'),
 ('s1','e1','enigma','Fabric PO to the mill\nDRAFT → Open','system',''),
 ('e1','s2','sourcing','Send cloth and trims\nto the factory','step',''),
 ('f2','e2','enigma','Factory PO on Enigma\n+ logistics, other costs · TNA','system',''),
 ('f3b','d9','design','Cloth short: design gives a\nnew cut ratio · factory sees it','step','no · cloth short'),
 ('f3','t9','sourcing','Trims short: sourcing\nsends the balance','step','trims short'),
 ('f5','n3','nitin','Tracker · OTIF\nescalations','step','dates'),
 ('d8','e5','enigma','Design rows + variants\ncreated in Enigma','system',''),
]
# back-loops and joins: from, to, label
LOOPS = [('d4','f1','no · remarks → update CAD and design · next round'),('d6','n1','send back'),('f6','f5','rework'),('d9','f4','then'),('t9','f3','count again'),('f3b','f4','yes'),('d4','n1','yes'),('f6','f7','yes'),('s2','f3','cloth and trims in')]
COLS=6; W,H=186,58; GX=226; SUB=H+26; X0,Y0=56,70
# three background bands behind the chart: conceptualization and pre-production, production, post-production
BANDS = [('Conceptualization · Pre-production', '#eef3e8', '#a3b58f'), ('Production', '#fdf3df', '#d6b26a'), ('Post-production', '#e8eef8', '#8fa6cf')]
NOTE = 'heaviest manual and tedious work'
GROUP = {**{k: 0 for k in ['r1','e0','r2','r3','f1','d4','n1','s1','e1','s2','d6','f2','e2','d7','f3','t9','f3b','d9','f4']}, **{k: 1 for k in ['f5','n3','f6']}, **{k: 2 for k in ['f7','e4','n4','cg','p3','d8','e5']}}
FILL={'step':'#fffbe6','decision':'#e7ebe0','system':'#dbeafe','outside':'#f4f3ef'}; STROKE={'step':'#8a7a3a','decision':'#3c4a30','system':'#1d4ed8','outside':'#a9a391'}
DASHED=' stroke-dasharray="5 4"'
node={}
for n in SPINE: node[n[0]]=n
for p,i,r,l,k,_ in SIDE: node[i]=(i,r,l,k)
# side depth per spine column
depth={}
parent={i:p for p,i,*_ in SIDE}
def root(i):
    while i in parent: i=parent[i]
    return i
sub_of={}
for p,i,*_ in SIDE:
    r=root(i); d=1; q=i
    while parent[q]!=r: q=parent[q]; d+=1
    sub_of[i]=(r,d); depth[r]=max(depth.get(r,0),d)
rows=[SPINE[i:i+COLS] for i in range(0,len(SPINE),COLS)]
row_h=[]; row_y=[]; y=Y0
for row in rows:
    dmax=max([depth.get(n[0],0) for n in row]+[0]); row_y.append(y); rh=H+dmax*SUB+92; row_h.append(rh); y+=rh
pos={}
for ri,row in enumerate(rows):
    rev=ri%2==1
    for ci,n in enumerate(row):
        c=(COLS-1-ci) if rev else ci
        pos[n[0]]=(X0+c*GX, row_y[ri])
rows_bottom=y
for i,(r,d) in sub_of.items():
    px,py=pos[r]; pos[i]=(px,py+d*SUB)
width=X0+COLS*GX+16; height=max(rows_bottom, max(v[1] for v in pos.values())+H+20)
def esc(s): return html.escape(s)
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" font-family="Inter, Helvetica, Arial, sans-serif">',
 '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#555"/></marker></defs>',
 f'<rect width="{width}" height="{height}" fill="#fff"/>']
def line(d,label=None,lx=0,ly=0,dash=False):
    dashattr = ' stroke-dasharray="5 4"' if dash else ''
    svg.append(f'<path d="{d}" fill="none" stroke="#555" stroke-width="1.4" marker-end="url(#a)"{dashattr}/>')
    if label: svg.append(f'<text x="{lx}" y="{ly}" font-size="10.5" fill="#6b6759" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="3">{esc(label)}</text>')
for gi,(gname,gfill,gline) in enumerate(BANDS):
    ids=[k for k,g in GROUP.items() if g==gi and k in pos]
    if not ids: continue
    bx0=min(pos[k][0] for k in ids)-14; by0=min(pos[k][1] for k in ids)-40; bx1=max(pos[k][0] for k in ids)+W+14; by1=max(pos[k][1] for k in ids)+H+20
    svg.append(f'<rect x="{bx0}" y="{by0}" width="{bx1-bx0}" height="{by1-by0}" rx="14" fill="{gfill}" stroke="{gline}" stroke-width="1.2"/>')
    svg.append(f'<text x="{bx0+14}" y="{by0+22}" font-size="13" font-weight="700" fill="#3c4a30" letter-spacing=".02em">{esc(gname.upper())}</text>')
    if gi==1:
        tw=len(NOTE)*6.6+22; px=bx1-tw-14; py=by1-36
        svg.append(f'<rect x="{px}" y="{py}" width="{tw}" height="22" rx="11" fill="#fde2e2" stroke="#e5a3a3"/><text x="{px+tw/2}" y="{py+15}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#9b2c2c">⚠ {NOTE}</text>')
# spine arrows (snake)
for i in range(len(SPINE)-1):
    a,b=SPINE[i][0],SPINE[i+1][0]; (ax,ay),(bx,by)=pos[a],pos[b]
    if ay==by:
        if bx>ax: line(f'M{ax+W} {ay+H/2}L{bx} {by+H/2}')
        else: line(f'M{ax} {ay+H/2}L{bx+W} {by+H/2}')
    else:
        line(f'M{ax+W/2} {ay+H}L{ax+W/2} {by}')
# side chains: vertical from parent to child
for p,i,r,l,k,lab in SIDE:
    (px,py),(cx,cy)=pos[p],pos[i]
    line(f'M{px+W/2} {py+H}L{cx+W/2} {cy}', lab, px+W/2+6, (py+H+cy)/2+4)
# loops
for a,b,lab in LOOPS:
    (ax,ay),(bx,by)=pos[a],pos[b]
    if ay==by:
        if abs(bx-ax)<=GX+1 and lab in ('yes','no · all in','then'):
            continue  # the spine arrow already shows this move
        # curved back arrow above both boxes
        x1,x2=ax+W/2,bx+W/2; top=min(ay,by)-26
        line(f'M{x1} {ay}C{x1} {top},{x2} {top},{x2} {by}', lab, (x1+x2)/2, top+6)
    else:
        # a loop or join between rows: run it through the gap beside the target column and arrive on its edge,
        # just below the main arrow, so it never crosses a box
        G=(GX-W)/2
        def blocked(x, y1, y2):
            lo,hi=min(y1,y2),max(y1,y2)
            return any(abs(px-x)<1 and py>lo and py+H<hi for k2,(px,py) in pos.items() if k2 not in (a,b))
        if abs(bx-ax)<1 and not blocked(ax, ay, by):
            top,bot=(ay,by+H) if ay>by else (ay+H,by); xr=ax+W-24
            line(f'M{xr} {top}L{xr} {bot}', lab, xr+30, (top+bot)/2)
        elif abs(bx-ax)<1:
            gx=bx+W+G; y0=ay-14 if ay>by else ay+H+14
            line(f'M{ax+W-24} {ay if ay>by else ay+H}L{ax+W-24} {y0}L{gx} {y0}L{gx} {by+H-10}L{bx+W} {by+H-10}', lab, gx+26, (y0+by+H)/2)
        elif bx<ax:
            gx=bx+W+G; ty=by+H-10 if by<ay else by+10
            line(f'M{ax} {ay+H/2}L{gx} {ay+H/2}L{gx} {ty}L{bx+W} {ty}', lab, (ax+gx)/2, ay+H/2-6)
        else:
            gx=bx-G; ty=by+H-10 if by<ay else by+10
            line(f'M{ax+W} {ay+H/2}L{gx} {ay+H/2}L{gx} {ty}L{bx} {ty}', lab, (ax+W+gx)/2, ay+H/2-6)
# label the spine edges that carry a word
for a,b,lab in LOOPS:
    (ax,ay),(bx,by)=pos[a],pos[b]
    if ay==by and abs(bx-ax)<=GX+1 and lab in ('yes','no · all in','then'):
        x=(ax+W+bx)/2 if bx>ax else (ax+bx+W)/2
        svg.append(f'<text x="{x}" y="{ay+H/2-6}" font-size="10.5" fill="#6b6759" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="3">{esc(lab)}</text>')
for nid,(x,y) in pos.items():
    _,role,label,kind=node[nid][:4]; lines=label.split('\n')
    svg.append(f'<rect x="{x}" y="{y}" width="{W}" height="{H}" rx="{28 if kind=="decision" else 6}" fill="{FILL[kind]}" stroke="{STROKE[kind]}" stroke-width="1.4"{DASHED if kind=="outside" else ""}/>')
    svg.append(f'<text x="{x+8}" y="{y+12}" font-size="9" fill="#6b6759" font-weight="600" letter-spacing=".06em">{esc(ROLE[role].upper())}</text>')
    for i,t in enumerate(lines):
        svg.append(f'<text x="{x+W/2}" y="{y+H/2+6+(i-(len(lines)-1)/2)*13}" text-anchor="middle" font-size="{11.5 if i==0 else 10.5}" font-weight="{600 if i==0 else 400}" fill="#1a1a13">{esc(t)}</text>')
svg.append('</svg>'); svg_text='\n'.join(svg)
open(out_svg,'w').write(svg_text)
legend='<div class="legend"><span><i style="background:#fffbe6;border-color:#8a7a3a"></i> step in PLM</span><span><i style="background:#e7ebe0;border-color:#3c4a30;border-radius:10px"></i> decision</span><span><i style="background:#dbeafe;border-color:#1d4ed8"></i> on Enigma</span><span><i style="background:#f4f3ef;border:1.4px dashed #a9a391"></i> outside PLM for now</span><span>reads left to right, then down and back</span></div>'
page=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RTW flowchart</title>
<style>body{{margin:0;background:#fff;color:#1a1a13;font-family:Inter,system-ui,sans-serif;padding:24px}}h1{{font-size:22px;margin:0 0 4px}}p{{margin:0 0 14px;color:#6b6759;font-size:13.5px}}.legend{{display:flex;gap:16px;font-size:12px;color:#6b6759;margin-bottom:10px}}.legend i{{display:inline-block;width:14px;height:10px;border:1.4px solid;border-radius:3px;vertical-align:middle;margin-right:4px}}.wrap{{overflow:auto;border:1px solid #e3ddcd;border-radius:8px}}svg{{display:block}}</style></head>
<body><h1>RTW in PLM · the flow, box by box (v2, after the 12 Nov meeting)</h1><p>The main line snakes left to right, then down and back. Once the sample is right, sourcing shops the cloth and trims in parallel with the bulk order and PO. At count-in: all in goes straight to approval; cloth short goes to design, whose new cut ratio the factory sees at once; trims short goes to sourcing for the balance. Blue boxes are Enigma. The chart ends at the design codes. Also as <a href="bsc-plm-rtw-flowchart.drawio" download>a draw.io file</a>, <a href="bsc-plm-rtw-flowchart.svg" download>SVG</a>, and <a href="bsc-plm-rtw-swimlane.html">the same flow as a swimlane</a>.</p>{legend}<div class="wrap">{svg_text.replace(f'width="{width}" height="{height}"', 'style="width:100%;height:auto;min-width:1100px"',1)}</div></body></html>'''
open(out_html,'w').write(page)
STY={'outside':'rounded=0;whiteSpace=wrap;html=1;fillColor=#f4f3ef;strokeColor=#a9a391;dashed=1;fontColor=#6b6759;fontSize=11;','step':'rounded=0;whiteSpace=wrap;html=1;fillColor=#fffbe6;strokeColor=#8a7a3a;fontSize=11;','decision':'rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=#e7ebe0;strokeColor=#3c4a30;fontSize=11;','system':'rounded=0;whiteSpace=wrap;html=1;fillColor=#dbeafe;strokeColor=#1d4ed8;fontSize=11;'}
cells=['<mxCell id="0"/>','<mxCell id="1" parent="0"/>']
for nid,(x,y) in pos.items():
    _,role,label,kind=node[nid][:4]
    v=f'&lt;span style=&quot;font-size:9px;color:#6b6759&quot;&gt;{esc(ROLE[role].upper())}&lt;/span&gt;&lt;br&gt;'+esc(label).replace('\n','&lt;br&gt;')
    cells.append(f'<mxCell id="{nid}" value="{v}" style="{STY[kind]}" vertex="1" parent="1"><mxGeometry x="{x}" y="{y}" width="{W}" height="{H}" as="geometry"/></mxCell>')
edges=[(SPINE[i][0],SPINE[i+1][0],'') for i in range(len(SPINE)-1)]+[(p,i,lab) for p,i,_,_,_,lab in SIDE]+[(a,b,l) for a,b,l in LOOPS if not (pos[a][1]==pos[b][1] and abs(pos[b][0]-pos[a][0])<=GX+1 and l in ('yes','no · all in','then'))]
for i,(a,b,l) in enumerate(edges):
    cells.append(f'<mxCell id="e{i}" value="{esc(l)}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;fontSize=10;strokeColor=#555555;" edge="1" parent="1" source="{a}" target="{b}"><mxGeometry relative="1" as="geometry"/></mxCell>')
xml=f'<mxfile host="app.diagrams.net"><diagram name="RTW flowchart" id="rtwflow">\n<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{width}" pageHeight="{height}" math="0" shadow="0"><root>\n'+'\n'.join(cells)+'\n</root></mxGraphModel></diagram></mxfile>'
open(out_drawio,'w').write(xml)
print('ok',width,height,len(pos),'boxes')
