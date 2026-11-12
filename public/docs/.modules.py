import sys, html
out_html, out_drawio, out_svg = sys.argv[1], sys.argv[2], sys.argv[3]
# modules: key, title, who, nodes [(id, label, kind)], kind: step | decision | system | source
M = [
 ('req','1 · Requirement intake','Design · Planning · Enigma',[
   ('src','SOURCES','sourcesrow'),
   ('r1','Requirement raised\nstyle · qty by size · date · cost','step'),
   ('r2','Prototype rounds\nor "none needed"','step'),
   ('r3','Cloth brief · BOM · tech pack','step'),
   ('r4','Send to sourcing and production','step')]),
 ('cloth','2 · Cloth sourcing','Sourcing · Design',[
   ('c1','Vendor against the brief\nprice · lead time · hold','step'),
   ('c2','Design: push the fabric PO?\nor send back · extend','decision'),
   ('c3','Fabric PO to the mill\nDRAFT → Open','system'),
   ('c4','Cloth and trims sent to the factory\n"fabric issued for RTW"','step')]),
 ('fac','3 · Factory and PO','Nitin · Design',[
   ('f1','Propose a factory\ncost · date agreed','step'),
   ('f2','Design: accept the factory?\nor send back','decision'),
   ('f3','Factory PO raised\nTNA generated from the PO date','system')]),
 ('mat','4 · Cloth at the factory','Factory · Design · Nitin',[
   ('m1','Count cloth and trims in\nagainst the PO','step'),
   ('m2','Cloth short?','decision'),
   ('m3','Design gives the cut ratio\nor approves the cut-short','step'),
   ('m4','Nitin sends the new ratio\n(straight through if the factory asked)','step'),
   ('m5','Factory cuts to the new sizes\ncloth count stays final','step')]),
 ('smp','5 · Sample','Factory · Production',[
   ('s1','First sample from bulk cloth','step'),
   ('s2','PP go-ahead?\nor resubmit','decision')]),
 ('tna','6 · Production · TNA','Factory · Nitin',[
   ('t1','22 milestones logged by the factory\nnot-needed steps skipped','step'),
   ('t2','Tracker · OTIF · late in red\nescalations','step'),
   ('t3','Dispatch to BSC','step')]),
 ('grn','7 · Receipt','Enigma',[
   ('g1','GRN at BSC\nby size, lot by lot','system'),
   ('g2','Record step 9 filled\nfrom the GRN','step')]),
 ('lau','8 · Launch','Planning · Design · Enigma · Stores',[
   ('l1','Add to a drop\nmarketing name · date','step'),
   ('l2','Design codes minted\nname · cloth · MRP · sizes','step'),
   ('l3','Design rows + variants\ncreated in Enigma','system'),
   ('l4','Stickers · Yusuf · photos\nstores told','step'),
   ('l5','Display & fit plan → STO','system'),
   ('l6','Stores receive (RetailOS)','step'),
   ('l7','Make live · Shopify sync','system')]),
]
SOURCES=[('Design ask','source'),('Planning reorder\nstock · ROS · cover','source'),('Enigma auto-PO\ncore style below threshold','sourcesys')]
INTER=[('r4','c1','cloth brief'),('r4','f1','style'),('c4','m1',''),('f3','c4','after both POs'),('f3','m1',''),('m2','s1','no · all in'),('m5','s1',''),('s2','t1','yes'),('t3','g1',''),('g2','l1','goods at HO')]
LOOPS=[('c2','c1','send back'),('f2','f1','send back'),('s2','s1','resubmit')]
# layout
COLS=4; MW=300; NW=256; NH=52; GAP=14; PAD=14; HEAD=40; MX=40; MY=40; GX=MW+60; SRC_W=76
FILL={'step':'#fffbe6','decision':'#e7ebe0','system':'#dbeafe','source':'#fde7c9','sourcesys':'#dbeafe'}
STROKE={'step':'#8a7a3a','decision':'#3c4a30','system':'#1d4ed8','source':'#b45309','sourcesys':'#1d4ed8'}
def esc(s): return html.escape(s)
def mod_height(nodes): return HEAD+PAD+sum((NH if k!='sourcesrow' else NH+10)+GAP for _,_,k in nodes)-GAP+PAD
rows=[M[i:i+COLS] for i in range(0,len(M),COLS)]
pos={}; mpos={}; y=MY
for row in rows:
    rh=max(mod_height(n) for _,_,_,n in row)
    for ci,(k,t,w,nodes) in enumerate(row):
        x=MX+ci*GX; mpos[k]=(x,y,MW,rh); ny=y+HEAD+PAD
        for nid,label,kind in nodes:
            h=NH+10 if kind=='sourcesrow' else NH
            pos[nid]=(x+(MW-NW)/2,ny,NW,h,kind,label); ny+=h+GAP
    y+=rh+50
width=MX+COLS*GX-60+MX; height=y
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" font-family="Inter, Helvetica, Arial, sans-serif">',
 '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#555"/></marker></defs>',
 f'<rect width="{width}" height="{height}" fill="#fff"/>']
for k,t,w,nodes in M:
    x,y0,mw,mh=mpos[k]
    svg.append(f'<rect x="{x}" y="{y0}" width="{mw}" height="{mh}" rx="10" fill="#fbfaf6" stroke="#c9c1a8" stroke-width="1.2"/>')
    svg.append(f'<text x="{x+14}" y="{y0+20}" font-size="13" font-weight="700" fill="#3c4a30">{esc(t)}</text><text x="{x+14}" y="{y0+34}" font-size="10.5" fill="#6b6759">{esc(w)}</text>')
def path(d,label=None,lx=0,ly=0):
    svg.append(f'<path d="{d}" fill="none" stroke="#555" stroke-width="1.4" marker-end="url(#a)"/>')
    if label: svg.append(f'<text x="{lx}" y="{ly}" font-size="10" fill="#6b6759" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="3">{esc(label)}</text>')
# chains inside modules
for k,t,w,nodes in M:
    for a,b in zip(nodes,nodes[1:]):
        x1,y1,w1,h1,*_=pos[a[0]]; x2,y2,*_=pos[b[0]]
        path(f'M{x1+w1/2} {y1+h1}L{x2+w1/2} {y2}')
# loops inside modules (curve on the left edge)
for a,b,l in LOOPS:
    x1,y1,w1,h1,*_=pos[a]; x2,y2,w2,h2,*_=pos[b]
    path(f'M{x1} {y1+h1/2}C{x1-40} {y1+h1/2},{x2-40} {y2+h2/2},{x2} {y2+h2/2}', l, x1-30, (y1+y2)/2+h1/2+3)
# arrows between modules
hop=0
for a,b,l in INTER:
    x1,y1,w1,h1,*_=pos[a]; x2,y2,w2,h2,*_=pos[b]
    if abs(y1-y2)<400 and x2>x1:   # same row: right edge to left edge
        path(f'M{x1+w1} {y1+h1/2}L{x2} {y2+h2/2}', l, (x1+w1+x2)/2, min(y1,y2)+h1/2-6)
    elif x2>x1: path(f'M{x1+w1} {y1+h1/2}L{x1+w1+20} {y1+h1/2}L{x1+w1+20} {y2-16}L{x2+w2/2} {y2-16}L{x2+w2/2} {y2}', l, x1+w1+40, y1+h1/2-6)
    else:   # next row: down from the bottom of the module, across, up into the target
        mx,my,mw,mh=[v for key,v in mpos.items() if any(n[0]==a for n in dict((m[0],m[3]) for m in M)[key])][0]
        yy=my+mh+18+hop*14; hop+=1
        path(f'M{x1+w1/2} {y1+h1}L{x1+w1/2} {yy}L{x2+w2/2} {yy}L{x2+w2/2} {y2}', l, (x1+x2)/2+w1/2, yy-6)
# nodes
for nid,(x,y0,w,h,kind,label) in pos.items():
    if kind=='sourcesrow':
        sw=(w-2*8)/3
        for i,(sl,sk) in enumerate(SOURCES):
            sx=x+i*(sw+8); lines=sl.split('\n')
            svg.append(f'<rect x="{sx}" y="{y0}" width="{sw}" height="{h}" rx="{h/2}" fill="{FILL[sk]}" stroke="{STROKE[sk]}" stroke-width="1.3"/>')
            for j,t in enumerate(lines): svg.append(f'<text x="{sx+sw/2}" y="{y0+h/2+4+(j-(len(lines)-1)/2)*12}" text-anchor="middle" font-size="{10 if j==0 else 8.5}" font-weight="{600 if j==0 else 400}" fill="#1a1a13">{esc(t)}</text>')
        continue
    lines=label.split('\n')
    svg.append(f'<rect x="{x}" y="{y0}" width="{w}" height="{h}" rx="{26 if kind=="decision" else 6}" fill="{FILL[kind]}" stroke="{STROKE[kind]}" stroke-width="1.3"/>')
    for j,t in enumerate(lines): svg.append(f'<text x="{x+w/2}" y="{y0+h/2+4+(j-(len(lines)-1)/2)*13}" text-anchor="middle" font-size="{11.5 if j==0 else 10.5}" font-weight="{600 if j==0 else 400}" fill="#1a1a13">{esc(t)}</text>')
svg.append('</svg>'); svg_text='\n'.join(svg); open(out_svg,'w').write(svg_text)
legend='<div class="legend"><span><i style="background:#fde7c9;border-color:#b45309;border-radius:8px"></i> how a requirement starts</span><span><i style="background:#fffbe6;border-color:#8a7a3a"></i> step in PLM</span><span><i style="background:#e7ebe0;border-color:#3c4a30;border-radius:10px"></i> decision</span><span><i style="background:#dbeafe;border-color:#1d4ed8"></i> on Enigma</span></div>'
page=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RTW modules</title>
<style>body{{margin:0;background:#fff;color:#1a1a13;font-family:Inter,system-ui,sans-serif;padding:24px}}h1{{font-size:22px;margin:0 0 4px}}p{{margin:0 0 14px;color:#6b6759;font-size:13.5px}}.legend{{display:flex;gap:16px;font-size:12px;color:#6b6759;margin-bottom:10px;flex-wrap:wrap}}.legend i{{display:inline-block;width:14px;height:10px;border:1.4px solid;border-radius:3px;vertical-align:middle;margin-right:4px}}.wrap{{overflow:auto;border:1px solid #e3ddcd;border-radius:8px}}svg{{display:block}}</style></head>
<body><h1>RTW in PLM · eight modules</h1><p>Each module is one box with its steps top to bottom; arrows between modules carry the hand-off. A requirement starts three ways: a design ask, a planning reorder, or an Enigma auto-PO on a core style below its threshold. Also as <a href="bsc-plm-rtw-modules.drawio" download>a draw.io file</a>, <a href="bsc-plm-rtw-modules.svg" download>SVG</a>; see also the <a href="bsc-plm-rtw-flowchart.html">flowchart</a> and the <a href="bsc-plm-rtw-swimlane.html">swimlane</a>.</p>{legend}<div class="wrap">{svg_text.replace(f'width="{width}" height="{height}"', 'style="width:100%;height:auto;min-width:1100px"',1)}</div></body></html>'''
open(out_html,'w').write(page)
# draw.io
STY={'step':'rounded=0;whiteSpace=wrap;html=1;fillColor=#fffbe6;strokeColor=#8a7a3a;fontSize=11;','decision':'rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=#e7ebe0;strokeColor=#3c4a30;fontSize=11;','system':'rounded=0;whiteSpace=wrap;html=1;fillColor=#dbeafe;strokeColor=#1d4ed8;fontSize=11;','source':'ellipse;whiteSpace=wrap;html=1;fillColor=#fde7c9;strokeColor=#b45309;fontSize=10;','sourcesys':'ellipse;whiteSpace=wrap;html=1;fillColor=#dbeafe;strokeColor=#1d4ed8;fontSize=10;'}
cells=['<mxCell id="0"/>','<mxCell id="1" parent="0"/>']
for k,t,w,nodes in M:
    x,y0,mw,mh=mpos[k]
    cells.append(f'<mxCell id="mod_{k}" value="{esc(t)}&lt;br&gt;&lt;span style=&quot;font-size:10px;font-weight:normal;color:#6b6759&quot;&gt;{esc(w)}&lt;/span&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fbfaf6;strokeColor=#c9c1a8;verticalAlign=top;align=left;spacingLeft=10;fontStyle=1;fontSize=12;" vertex="1" parent="1"><mxGeometry x="{x}" y="{y0}" width="{mw}" height="{mh}" as="geometry"/></mxCell>')
for nid,(x,y0,w,h,kind,label) in pos.items():
    if kind=='sourcesrow':
        sw=(w-16)/3
        for i,(sl,sk) in enumerate(SOURCES):
            cells.append(f'<mxCell id="src{i}" value="{esc(sl).replace(chr(10),"&lt;br&gt;")}" style="{STY[sk]}" vertex="1" parent="1"><mxGeometry x="{x+i*(sw+8)}" y="{y0}" width="{sw}" height="{h}" as="geometry"/></mxCell>')
        continue
    cells.append(f'<mxCell id="{nid}" value="{esc(label).replace(chr(10),"&lt;br&gt;")}" style="{STY[kind]}" vertex="1" parent="1"><mxGeometry x="{x}" y="{y0}" width="{w}" height="{h}" as="geometry"/></mxCell>')
edges=[]
for k,t,w,nodes in M:
    for a,b in zip(nodes,nodes[1:]):
        if a[2]=='sourcesrow':
            for i in range(3): edges.append((f'src{i}',b[0],''))
        else: edges.append((a[0],b[0],''))
edges+=INTER+LOOPS
for i,(a,b,l) in enumerate(edges):
    cells.append(f'<mxCell id="e{i}" value="{esc(l)}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;fontSize=10;strokeColor=#555555;" edge="1" parent="1" source="{a}" target="{b}"><mxGeometry relative="1" as="geometry"/></mxCell>')
xml=f'<mxfile host="app.diagrams.net"><diagram name="RTW modules" id="rtwmod">\n<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{width}" pageHeight="{height}" math="0" shadow="0"><root>\n'+'\n'.join(cells)+'\n</root></mxGraphModel></diagram></mxfile>'
open(out_drawio,'w').write(xml)
print('ok',width,height)
