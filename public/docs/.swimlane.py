import sys, html
out_html, out_drawio, out_svg = sys.argv[1], sys.argv[2], sys.argv[3]

LANES = [('plan','Planning'),('design','Design'),('sourcing','Sourcing'),('nitin','Nitin · production'),('factory','Factory'),('enigma','Enigma'),('finance','Finance'),('stores','Stores')]
PHASES = [('Design · sample',0,7),('Order · buy',7,15),('Make · QC',15,18),('Ship · cost',18,22),('Launch',22,27)]
# id, lane, col, label, kind(step|decision|system)
N = [
 ('p1','plan',0,'Planning review\nreorder: stock · ROS · cover','step'),
 ('e0','enigma',0,'Auto-PO\ncore style below threshold','system'),
 ('d1','design',1,'Requirement raised\ndesign ask · reorder · auto-PO','step'),
 ('d2','design',2,'Design the style\nbrief · BOM · CAD','step'),
 ('d3','design',3,'Send for sampling\nsample due date','step'),
 ('f1','factory',4,'Make the sample\nby the due date','step'),
 ('d4','design',5,'Trial · sample right?\nor remarks','decision'),
 ('d5','design',6,'Update CAD and design\nfrom the remarks','step'),
 ('n1','nitin',7,'Propose a factory\ncost · date agreed','step'),
 ('d6','design',8,'Bulk order · accept?\nqty by size · raise the PO','decision'),
 ('e2','enigma',9,'Factory PO\n+ logistics, other costs','system'),
 ('f2','factory',10,'Acknowledge the PO','step'),
 ('d7','design',11,'Upload the tech pack','step'),
 ('s1','sourcing',11,'Shop cloth and trims\nvendor · price · hold','step'),
 ('e1','enigma',12,'Fabric PO to the mill\nDRAFT → Open','system'),
 ('s2','sourcing',12,'Send cloth and trims\nto the factory','step'),
 ('f3','factory',13,'Count in\ncloth short?','decision'),
 ('d8','design',13,'Cut ratio\nor approve cut-short','step'),
 ('n2','nitin',14,'Send the new ratio\nto the factory','step'),
 ('f4','factory',15,'Approve all received','step'),
 ('f5','factory',16,'Make · log the TNA\n22 milestones','step'),
 ('n3','nitin',16,'Tracker · OTIF\nescalations','step'),
 ('f6','factory',17,'QC passed?\nor rework','decision'),
 ('f7','factory',18,'AWB · courier\nshipped','step'),
 ('e4','enigma',19,'Delivered · GRN\nby size, lot by lot','system'),
 ('n4','nitin',20,'Close the shipment\nshipping cost','step'),
 ('fi','finance',21,'COGS vs MRP\nmargin per style','step'),
 ('p3','plan',22,'Add to a drop\nmarketing name · date','step'),
 ('d9','design',23,'Mint design codes\nname · cloth · MRP · sizes','step'),
 ('e5','enigma',23,'Design rows + variants\nin Enigma','system'),
 ('p4','plan',24,'Display & fit plan\nper store','step'),
 ('e6','enigma',24,'STO to stores','system'),
 ('st1','stores',25,'Pieces received\n(RetailOS)','step'),
 ('p5','plan',26,'Make live','step'),
 ('e7','enigma',26,'Live · Shopify sync','system'),
]
E = [
 ('p1','d1','reorder'),('e0','d1','auto-PO'),('d1','d2',''),('d2','d3',''),('d3','f1',''),('f1','d4',''),
 ('d4','d5','remarks'),('d5','f1','next round'),('d4','n1','approved'),
 ('n1','d6',''),('d6','n1','send back'),('d6','e2','raise'),('e2','f2',''),
 ('f2','d7',''),('f2','s1',''),('s1','e1',''),('e1','s2',''),('s2','f3',''),('d7','f4','tech pack'),
 ('f3','d8','short'),('d8','n2',''),('n2','f4',''),('f3','f4','all in'),
 ('f4','f5',''),('f5','n3','dates'),('f5','f6',''),('f6','f5','rework'),('f6','f7','pass'),
 ('f7','e4',''),('e4','n4',''),('n4','fi',''),('e4','p3','goods at HO'),
 ('p3','d9',''),('d9','e5',''),('p3','p4',''),('p4','e6',''),('e6','st1',''),('st1','p5',''),('d9','p5',''),('p5','e7',''),
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
<body><h1>RTW in PLM · the complete flow, one lane per role (v2, after the 12 Nov meeting)</h1><p>Left to right: design and the sample cycle → bulk order and PO → tech pack and shopping → make and QC → shipping and COGS → launch. Loops: sample remarks back to the factory, factory proposal sent back, cut ratio, QC rework. Blue boxes are what happens on Enigma. Also as <a href="bsc-plm-rtw-swimlane.drawio" download>a draw.io file</a> and <a href="bsc-plm-rtw-swimlane.svg" download>SVG</a>.</p>{legend}<div class="wrap">{svg_text.replace(f'width="{width}" height="{height}"', 'style="width:100%;height:auto;min-width:1400px"',1)}</div></body></html>'''
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
