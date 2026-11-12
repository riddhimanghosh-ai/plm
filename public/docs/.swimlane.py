import sys, html
out_html, out_drawio, out_svg = sys.argv[1], sys.argv[2], sys.argv[3]

LANES = [('plan','Planning'),('design','Design'),('sourcing','Sourcing'),('nitin','Nitin · production'),('factory','Factory'),('enigma','Enigma · warehouse'),('stores','Stores')]
PHASES = [('Design',0,4),('Buy · cloth and factory',4,10),('Make',10,15),('Land',15,17),('Launch',17,21)]
# id, lane, col, label, kind(step|decision|system|loop)
N = [
 ('p1','plan',0,'Review the option\nstock · ROS · weeks of cover','step'),
 ('p2','plan',1,'Reorder or new style ask','step'),
 ('d1','design',1,'Raise the requirement\nstyle · qty by size · date · cost','step'),
 ('d2','design',2,'Prototype rounds\nor "none needed"','step'),
 ('d3','design',3,'Cloth brief · BOM · tech pack','step'),
 ('d4','design',4,'Send to sourcing\nand production','step'),
 ('s1','sourcing',5,'Put one vendor against the brief\nprice · lead time · hold','step'),
 ('d5','design',6,'Push the fabric PO\nor send back · extend','decision'),
 ('e1','enigma',6,'Fabric PO to the mill\nDRAFT → Open','system'),
 ('n1','nitin',5,'Propose a factory\ncost · date agreed on the phone','step'),
 ('d6','design',7,'Accept the factory\nraise the PO','decision'),
 ('e2','enigma',7,'Factory PO\nPO date → TNA generated','system'),
 ('s2','sourcing',8,'Send cloth and trims\nto the factory','step'),
 ('e3','enigma',8,'Stock adjustment\n"fabric issued for RTW"','system'),
 ('f1','factory',9,'Count cloth and trims in\nagainst the PO','step'),
 ('f2','factory',10,'Short? ask design\ncut fewer / new sizes','decision'),
 ('d7','design',10,'Give the cut ratio\nor approve the cut-short','step'),
 ('n2','nitin',10,'Send the new ratio\nto the factory','step'),
 ('f3','factory',11,'Cut to the new sizes\ncloth count stays final','step'),
 ('f4','factory',12,'First sample\nfrom bulk cloth','step'),
 ('n3','nitin',12,'Review the sample\nPP go-ahead or resubmit','decision'),
 ('f5','factory',13,'Make · log the TNA\n22 milestones, late in red','step'),
 ('n4','nitin',13,'Tracker · OTIF\nescalations','step'),
 ('f6','factory',14,'Dispatch to BSC','step'),
 ('e4','enigma',15,'GRN at BSC\nby size, lot by lot','system'),
 ('p3','plan',16,'Add to a drop\nmarketing name · date','step'),
 ('d8','design',17,'Mint design codes\nname · cloth · MRP · sizes','step'),
 ('e5','enigma',17,'Design rows + variants\ncreated in Enigma','system'),
 ('d9','design',18,'Stickers · Yusuf · photos\nstores told','step'),
 ('p4','plan',18,'Display & fit plan\nper store','step'),
 ('e6','enigma',19,'STO to stores','system'),
 ('st1','stores',19,'Display and fit pieces\nreceived (RetailOS)','step'),
 ('p5','plan',20,'Make live','step'),
 ('e7','enigma',20,'Live · Shopify sync','system'),
]
E = [
 ('p1','p2',''),('p2','d1',''),('d1','d2',''),('d2','d3',''),('d3','d4',''),
 ('d4','s1','cloth brief'),('d4','n1','style'),
 ('s1','d5',''),('d5','e1','push PO'),('d5','s1','send back / extend'),
 ('n1','d6',''),('d6','e2','accept'),('d6','n1','send back'),
 ('e1','s2','cloth from the mill'),('e2','s2','after both POs'),('s2','e3',''),('s2','f1',''),
 ('f1','f2','short'),('f2','d7','ask'),('d7','n2','given'),('n2','f3',''),('d7','f3','factory raised it'),
 ('f1','f4','all in'),('f3','f4',''),('f4','n3',''),('n3','f4','resubmit'),('n3','f5','go-ahead'),
 ('f5','n4','dates'),('f5','f6',''),('f6','e4',''),('e4','p3',''),('p3','d8','goods at HO'),('d8','e5',''),
 ('d8','d9',''),('p3','p4',''),('p4','e6',''),('e6','st1',''),('st1','p5',''),('d9','p5',''),('p5','e7',''),
]
W,H = 190,56; GX,GY = 230,110; X0,Y0 = 150,70; LANE_H = GY
cols = max(n[2] for n in N)+1
width = X0 + cols*GX + 40; height = Y0 + len(LANES)*LANE_H + 20
lane_y = {k: Y0 + i*LANE_H for i,(k,_) in enumerate(LANES)}
pos = {n[0]: (X0 + n[2]*GX, lane_y[n[1]] + (LANE_H-H)/2) for n in N}
node = {n[0]: n for n in N}
FILL = {'step':'#fffbe6','decision':'#e7ebe0','system':'#dbeafe','loop':'#fde2e2'}
STROKE = {'step':'#8a7a3a','decision':'#3c4a30','system':'#1d4ed8','loop':'#b91c1c'}

def esc(s): return html.escape(s)
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" font-family="Inter, Helvetica, Arial, sans-serif">',
 '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#555"/></marker></defs>',
 f'<rect width="{width}" height="{height}" fill="#fff"/>']
for name,c0,c1 in PHASES:
    x=X0+c0*GX-20; w=(c1-c0)*GX
    svg.append(f'<rect x="{x}" y="22" width="{w-10}" height="26" rx="6" fill="#efeadf"/><text x="{x+w/2-5}" y="40" text-anchor="middle" font-size="13" font-weight="600" fill="#3c4a30">{esc(name)}</text>')
for i,(k,label) in enumerate(LANES):
    y=lane_y[k]
    svg.append(f'<rect x="10" y="{y}" width="{width-20}" height="{LANE_H}" fill="{"#fbfaf6" if i%2 else "#fff"}" stroke="#e3ddcd"/>')
    svg.append(f'<text x="22" y="{y+LANE_H/2+5}" font-size="13" font-weight="700" fill="#3c4a30">{esc(label)}</text>')
def edge(a,b,label):
    (ax,ay),(bx,by)=pos[a],pos[b]
    if ay==by:
        if bx>ax: x1,y1,x2,y2 = ax+W,ay+H/2,bx,by+H/2; d=f'M{x1} {y1}L{x2} {y2}'
        else: x1,y1,x2,y2 = ax+W/2,ay,bx+W/2,by; d=f'M{x1} {y1}C{x1} {y1-40},{x2} {y2-40},{x2} {y2}'
        lx,ly=(x1+x2)/2,(min(y1,y2)-6 if bx<=ax else y1-6)
    else:
        if bx>ax+W/2: x1,y1=ax+W,ay+H/2; x2,y2=bx+W/2,(by if by>ay else by+H); d=f'M{x1} {y1}L{x2} {y1}L{x2} {y2}'; lx,ly=(x1+x2)/2,y1-6
        elif bx<ax-W/2: x1,y1=ax,ay+H/2; x2,y2=bx+W/2,(by if by>ay else by+H); d=f'M{x1} {y1}L{x2} {y1}L{x2} {y2}'; lx,ly=(x1+x2)/2,y1-6
        else: x1,y1=ax+W/2,(ay+H if by>ay else ay); x2,y2=bx+W/2,(by if by>ay else by+H); d=f'M{x1} {y1}L{x2} {y2}'; lx,ly=x1+6,(y1+y2)/2
    svg.append(f'<path d="{d}" fill="none" stroke="#555" stroke-width="1.4" marker-end="url(#a)"/>')
    if label: svg.append(f'<text x="{lx}" y="{ly}" font-size="10.5" fill="#6b6759" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="3">{esc(label)}</text>')
for a,b,l in E: edge(a,b,l)
for nid,lane,col,label,kind in N:
    x,y=pos[nid]; lines=label.split('\n')
    if kind=='decision': svg.append(f'<rect x="{x}" y="{y}" width="{W}" height="{H}" rx="28" fill="{FILL[kind]}" stroke="{STROKE[kind]}" stroke-width="1.4"/>')
    else: svg.append(f'<rect x="{x}" y="{y}" width="{W}" height="{H}" rx="6" fill="{FILL[kind]}" stroke="{STROKE[kind]}" stroke-width="1.4"/>')
    for i,t in enumerate(lines):
        svg.append(f'<text x="{x+W/2}" y="{y+H/2+(i-(len(lines)-1)/2)*14+4}" text-anchor="middle" font-size="{11.5 if i==0 else 10.5}" font-weight="{600 if i==0 else 400}" fill="#1a1a13">{esc(t)}</text>')
svg.append('</svg>')
svg_text='\n'.join(svg)
open(out_svg,'w').write(svg_text)
legend='<div class="legend"><span><i style="background:#fffbe6;border-color:#8a7a3a"></i> step in PLM</span><span><i style="background:#e7ebe0;border-color:#3c4a30;border-radius:10px"></i> decision</span><span><i style="background:#dbeafe;border-color:#1d4ed8"></i> on Enigma</span></div>'
page=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RTW swimlane</title>
<style>body{{margin:0;background:#fff;color:#1a1a13;font-family:Inter,system-ui,sans-serif;padding:24px}}h1{{font-size:22px;margin:0 0 4px}}p{{margin:0 0 14px;color:#6b6759;font-size:13.5px}}.legend{{display:flex;gap:16px;font-size:12px;color:#6b6759;margin-bottom:10px}}.legend i{{display:inline-block;width:14px;height:10px;border:1.4px solid;border-radius:3px;vertical-align:middle;margin-right:4px}}.wrap{{overflow:auto;border:1px solid #e3ddcd;border-radius:8px}}svg{{display:block}}</style></head>
<body><h1>RTW in PLM · the complete flow, one lane per role</h1><p>Left to right: design → buy → make → land → launch. Loops: fabric PO sent back, factory proposal sent back, cut ratio, sample resubmit. Blue boxes are what happens on Enigma. Also as <a href="bsc-plm-rtw-swimlane.drawio" download>a draw.io file</a> and <a href="bsc-plm-rtw-swimlane.svg" download>SVG</a>.</p>{legend}<div class="wrap">{svg_text.replace(f'width="{width}" height="{height}"', 'style="width:100%;height:auto;min-width:1400px"',1)}</div></body></html>'''
open(out_html,'w').write(page)

# draw.io: one swimlane per role, nodes inside, edges orthogonal
cells=['<mxCell id="0"/>','<mxCell id="1" parent="0"/>']
lane_w = width-20
for i,(k,label) in enumerate(LANES):
    cells.append(f'<mxCell id="lane_{k}" value="{esc(label)}" style="swimlane;horizontal=0;startSize=120;fillColor=#efeadf;strokeColor=#c9c1a8;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="0" y="{i*LANE_H}" width="{lane_w}" height="{LANE_H}" as="geometry"/></mxCell>')
STY={'step':'rounded=0;whiteSpace=wrap;html=1;fillColor=#fffbe6;strokeColor=#8a7a3a;fontSize=11;','decision':'rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=#e7ebe0;strokeColor=#3c4a30;fontSize=11;','system':'rounded=0;whiteSpace=wrap;html=1;fillColor=#dbeafe;strokeColor=#1d4ed8;fontSize=11;'}
for nid,lane,col,label,kind in N:
    v=esc(label).replace('\n','&lt;br&gt;')
    cells.append(f'<mxCell id="{nid}" value="{v}" style="{STY[kind]}" vertex="1" parent="lane_{lane}"><mxGeometry x="{X0-10+col*GX}" y="{(LANE_H-H)/2}" width="{W}" height="{H}" as="geometry"/></mxCell>')
for i,(a,b,l) in enumerate(E):
    cells.append(f'<mxCell id="e{i}" value="{esc(l)}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;fontSize=10;strokeColor=#555555;" edge="1" parent="1" source="{a}" target="{b}"><mxGeometry relative="1" as="geometry"/></mxCell>')
xml=f'<mxfile host="app.diagrams.net"><diagram name="RTW swimlane" id="rtw">\n<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{lane_w}" pageHeight="{len(LANES)*LANE_H}" math="0" shadow="0"><root>\n' + '\n'.join(cells) + '\n</root></mxGraphModel></diagram></mxfile>'
open(out_drawio,'w').write(xml)
print('ok', width, height, len(N), 'nodes', len(E), 'edges')
