import json, base64, re, html as H, sys
EXPORT='/Users/riddhiman/.claude/projects/-Users-riddhiman-BSC-PLM/d529ddb0-0d6b-47c3-bcf8-2b245dba4d58/tool-results/mcp-1a59c906-04da-521d-bda7-7f71b9f9e01c-export-1792499571145.txt'
DATE='20 Oct 2026'
raw=open(EXPORT).read()
j=json.loads(raw)
def find(o):
    if isinstance(o,dict):
        for v in o.values():
            r=find(v)
            if r: return r
    elif isinstance(o,list):
        for v in o:
            r=find(v)
            if r: return r
    elif isinstance(o,str) and len(o)>1000: return o
b=find(j)
if b.lstrip().startswith('{'):
    b=json.loads(b)['data']['bytes_b64']
frag=base64.b64decode(b).decode('utf-8')
frag=frag.replace('u_ptjBjG5TJCLehO8lpvYhDA','Riddhiman Ghosh · DevX Labs')
inject='''<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js"></script><script>document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('pre code.language-mermaid').forEach(c=>{const pre=c.closest('pre'); const d=document.createElement('div'); d.className='mermaid'; d.textContent=c.textContent; pre.replaceWith(d);}); mermaid.initialize({startOnLoad:false, theme:'neutral', flowchart:{useMaxWidth:false}, themeVariables:{fontFamily:'Helvetica, Arial, sans-serif'}}); mermaid.run();});</script><style>body{max-width:1180px;margin:32px auto;padding:0 24px;font-family:Helvetica,Arial,sans-serif;line-height:1.5;color:#1a1a13;background:#faf8f3} table{border-collapse:collapse;font-size:12.5px;margin:12px 0} th,td{border:1px solid #d8d2c2;padding:6px 8px;vertical-align:top;text-align:left} th{background:#efeadf} code{background:#efeadf;padding:1px 4px;border-radius:3px;font-size:12px} .mermaid{margin:16px 0;overflow-x:auto} h2{margin-top:44px;border-bottom:2px solid #d8d2c2;padding-bottom:4px} h3{margin-top:32px;border-bottom:1px solid #e6e0d0;padding-bottom:3px}</style>'''
open('bsc-plm-implementation-handover.html','w').write('<!doctype html><html><head><meta charset="utf-8"><title>BSC PLM — Implementation Handover</title>'+inject+'</head><body>'+frag+'</body></html>')
parts=re.split(r'(?=<h[23] )', frag); secs={}
for p in parts:
    m=re.match(r'<h([23])[^>]*>(.*?)</h[23]>(.*)', p, re.S)
    if not m: continue
    t=re.sub('<[^>]+>','',m.group(2)).strip(); key=t.split('.')[0].strip() if re.match(r'[AB]\d+[a-d]?\.',t) else t; secs[key]=(t,m.group(3).strip())
acc_src=open('bsc-current-process-accordion.html').read()
CSS=acc_src[acc_src.index('<style>'):acc_src.index('</style>')+8]; JS=acc_src[acc_src.index('<script src'):acc_src.index('</head>')]
byline=f'<p class="by">{DATE} · Riddhiman Ghosh · DevX Labs · Field lists are a first cut and will be corrected after further discovery.</p>'
def acc(title, content):
    slug=re.sub(r'[^a-z0-9]+','-',title.lower()).strip('-'); return f'<details id="{slug}"><summary>{H.escape(title)}</summary><div class="body">{content}</div></details>'
sec=lambda k: secs[k][1]; lead=lambda s: f'<p class="lead">{s}</p>'
def page(title, intro, groups, out):
    parts=[f'<!doctype html><html><head><meta charset="utf-8"><title>{H.escape(title)}</title>{CSS}{JS}</head><body>', f'<h1>{H.escape(title)}</h1>{byline}<p class="lead">{intro}</p>', '<div class="tools"><button id="openAll">Expand all</button><button id="closeAll">Collapse all</button><input id="q" placeholder="Search within this document…"></div>']
    for g,items in groups:
        parts.append(f'<div class="group">{H.escape(g)}</div>'); parts += [acc(t,c) for t,c in items]
    parts.append('</body></html>'); open(out,'w').write('\n'.join(parts)); print(out, sum(len(i) for _,i in groups))
page('BSC — Current Process (As-Is)', 'How Bombay Shirt Company runs today, step by step: who does what, in which sheet or system, with which fields, and how long it takes. The optimized-process page mirrors these sections one for one.',
 [('Context',[('Purpose and how to read',sec('Purpose and how to use this document')),('Glossary and status vocabularies',sec('Glossary and status vocabularies')),('Teams and systems today',sec('Teams and systems today')),('Data sources inventory',sec('Data sources inventory'))]),
  ('Current process, flow by flow',[('1. MTM fabric, idea to live',sec('A1')),('2. Option requests and swatch books',sec('A2')),('3. RTW style, requirement to launch',sec('A3')),('4. Swatches to stores',sec('A5')),('5. Store day, returns and alterations',sec('A6')),('6. Replenishment and stock health',sec('A7')),('7. Warehouse and unit',sec('A8')),('8. Timings, volumes and pain points',sec('A9')),('9. MTM daily production',sec('A10')),('10. RTW production at the factory',sec('A11')),('11. The analytics the teams run today',sec('A12')),('12. Bespoke, mill to customer',sec('A13'))])],
 'bsc-current-process-accordion.html')
flows=[('1. MTM fabric, idea to live', lead('Mirrors current section 1. The ask becomes one record; sourcing puts one vendor; design pushes the PO; the cloth runs on the swatch desk (section 4) while sourcing writes the designs; design goes live when it decides. The cases table at the end says which steps apply when, e.g. no sampling for a new shade of a proven construction.')+sec('B5')+'<h4>Then, downstream: the swatch desk, designs on the fabric, go live</h4>'+sec('B7')),
 ('2. Option requests and swatch books', lead('Mirrors current section 2.')+sec('B6')),
 ('3. RTW style, the four-section record', lead('Mirrors current section 3. One record per style: request from design, factory finalisation, fabric finalisation, milestones and final steps (call with Nitin, 3 Oct 2026).')+sec('B8')),
 ('4. Swatches to stores', lead('Mirrors current section 4. The MTM_Swatches tab and the hand-made sticker become the Swatch desk.')+sec('B7')),
 ('5. Store day, returns and alterations', lead('Mirrors current section 5.')+sec('B10')),
 ('6. Replenishment and stock health', lead('Mirrors current section 6.')+sec('B11')),
 ('7. Warehouse and unit', lead('Mirrors current section 7.')+sec('B12')),
 ('8. Timings and targets', lead('Mirrors current section 8.')+sec('B19')),
 ('9. MTM daily production', lead('Mirrors current section 9.')+sec('B12a')),
 ('10. RTW production, milestones and final steps', lead('Mirrors current section 10. Section 4 of the RTW record, kept by Nitin and the factory merchandiser.')+sec('B12b')),
 ('11. Analytics — what replaces the workbooks', lead('Mirrors current section 11.')+sec('B12c')),
 ('12. Bespoke, mill to customer', lead('Mirrors current section 12. The third made-to-measure bucket, with the stock at the mill: the daily list, the gate at the store, the parcel code, then ordinary MTM production.')+sec('B12d'))]
context=[('Purpose and how to read',sec('Purpose and how to use this document')),('Glossary and status vocabularies',sec('Glossary and status vocabularies')),('The spine and the principles',sec('B0')),('Teams, screens and permissions',sec('B1'))]
build=[('Screen specifications',sec('B2')),('Data model',sec('B3')),('State machines',sec('B4')),('Business rules and validations',sec('B13')),('Alert engine',sec('B14')),('Integrations',sec('B15')),('Traceability: current step to target step',sec('B16')),('Non-functional requirements',sec('B17')),('Implementation plan — phased by team, built on Enigma',sec('B18')),('Open questions and assumptions',sec('B20'))]
page('BSC — Optimized Process (Target)', 'The process BSC should run, section for section against the current-process page: the same twelve flows, each as it will work with its cases, followed by the build reference for the implementation team.',
 [('Context',context),('Optimized process, flow by flow (same sections as the current-process page)',flows),('Build reference for the implementation team',build)], 'bsc-optimized-process-accordion.html')
