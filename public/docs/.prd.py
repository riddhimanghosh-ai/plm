# rebuild bsc-plm-prd.html from a docs export (set EXPORT)
import json,base64,re,sys
EXPORT=sys.argv[1]
raw=open(EXPORT).read()
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
try:
    j=json.loads(raw); b=find(j)
    if b and b.lstrip().startswith('{'): b=json.loads(b)['data']['bytes_b64']
except Exception: b=raw.strip()
frag=base64.b64decode(b).decode('utf-8') if not b.lstrip().startswith('<') else b
frag=frag.replace('@u_ptjBjG5TJCLehO8lpvYhDA','Riddhiman Ghosh')
style='''<style>body{max-width:1180px;margin:32px auto;padding:0 24px;font-family:Helvetica,Arial,sans-serif;line-height:1.5;color:#1a1a13;background:#fff} table{border-collapse:collapse;font-size:12.5px;margin:12px 0} th,td{border:1px solid #d8d2c2;padding:6px 8px;vertical-align:top;text-align:left} th{background:#efeadf} td p{margin:0 0 5px} td p:last-child{margin:0} code{background:#efeadf;padding:1px 4px;border-radius:3px;font-size:12px} h1{font-size:30px} h2{margin-top:44px;border-bottom:2px solid #d8d2c2;padding-bottom:4px} ul.toc{columns:2;font-size:13.5px}</style>'''
h2=re.findall(r'<h2[^>]*>(.*?)</h2>', frag, re.S)
toc='<ul class="toc">'+''.join(f'<li><a href="#s{i}">{re.sub("<[^>]+>","",t)}</a></li>' for i,t in enumerate(h2))+'</ul>'
i=[0]
def anchor(m):
    k=i[0]; i[0]+=1; return f'<h2 id="s{k}"'+m.group(1)+'>'
frag=re.sub(r'<h2([^>]*)>', anchor, frag)
m=re.search(r'</h1>\s*<p[^>]*>.*?</p>', frag, re.S)
if m: frag=frag[:m.end()]+toc+frag[m.end():]
open('bsc-plm-prd.html','w').write('<!doctype html><html><head><meta charset="utf-8"><title>BSC PLM — Product Requirements</title>'+style+'</head><body>'+frag+'</body></html>')
print(len(frag), [re.sub('<[^>]+>','',t)[:40] for t in h2])
