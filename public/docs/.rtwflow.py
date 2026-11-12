import sys, re, html
src, out = sys.argv[1], sys.argv[2]
lines = open(src, encoding='utf-8').read().split('\n')
def inline(s):
    s = html.escape(s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'`(.+?)`', r'<code>\1</code>', s)
    return s
body = []; i = 0; title = ''; steps = 0
while i < len(lines):
    l = lines[i]
    if l.startswith('# '): title = l[2:]; i += 1; continue
    if l.startswith('## '):
        h = l[3:]
        m = re.match(r'Step (\d+)\. (.*)', h)
        if m:
            if steps: body.append('</div></div>')
            steps += 1
            body.append(f'<div class="phase"><div class="rail"><div class="num">{m.group(1)}</div><div class="thread"></div></div><div class="pbody"><h2>{inline(m.group(2))}</h2>')
        else:
            if steps: body.append('</div></div>'); steps = 0
            body.append(f'<h2 class="section-head">{inline(h)}</h2>')
        i += 1; continue
    if l.startswith('---'): i += 1; continue
    if l.startswith('|'):
        rows = []
        while i < len(lines) and lines[i].startswith('|'):
            cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r'-+', c) for c in cells): rows.append(cells)
            i += 1
        t = '<table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in rows[0]) + '</tr></thead><tbody>'
        for r in rows[1:]: t += '<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>'
        body.append(t + '</tbody></table>'); continue
    if l.startswith('- '):
        items = []
        while i < len(lines) and lines[i].startswith('- '): items.append(lines[i][2:]); i += 1
        body.append('<ul>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + '</ul>'); continue
    if l.strip() == '': i += 1; continue
    para = []
    while i < len(lines) and lines[i].strip() and not lines[i].startswith(('#', '|', '- ', '---')): para.append(lines[i]); i += 1
    body.append('<p>' + '<br>'.join(inline(x) for x in para) + '</p>')
if steps: body.append('</div></div>')
page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>RTW user flow</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{{--bg:#fff;--ink:#1a1a13;--soft:#6b6759;--line:#e3ddcd;--line-strong:#c9c1a8;--accent:#3c4a30;--accent-soft:#e7ebe0;color-scheme:light}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font-family:'Inter',system-ui,sans-serif;font-size:15px;line-height:1.6;padding:56px 20px 80px}}
main{{max-width:820px;margin:0 auto}}
.eyebrow{{font-size:11.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--soft);margin:0 0 10px}}
h1{{font-family:'Source Serif 4',Georgia,serif;font-weight:700;font-size:clamp(30px,5vw,42px);line-height:1.08;margin:0 0 14px}}
h2.section-head{{font-family:'Source Serif 4',Georgia,serif;font-weight:600;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--soft);margin:44px 0 18px;padding-top:8px;border-top:1px solid var(--line)}}
p{{margin:0 0 12px;max-width:70ch}} ul{{margin:0 0 12px;padding-left:20px;max-width:70ch}} li{{margin:2px 0}}
table{{border-collapse:collapse;width:100%;font-size:13.5px;margin:6px 0 18px}} th,td{{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}} th{{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--soft)}}
.phase{{display:grid;grid-template-columns:56px 1fr;gap:0 22px;padding-bottom:30px}}
.rail{{display:flex;flex-direction:column;align-items:center}}
.num{{width:40px;height:40px;border-radius:50%;background:var(--accent);color:#fff;font-family:'Source Serif 4',serif;font-weight:700;font-size:16px;display:flex;align-items:center;justify-content:center}}
.thread{{flex:1;width:2px;background:var(--line-strong);margin-top:4px}}
.pbody h2{{font-family:'Source Serif 4',Georgia,serif;font-weight:600;font-size:21px;margin:6px 0 10px}}
.pbody p b:first-child{{color:var(--accent)}}
code{{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;background:var(--accent-soft);padding:1px 5px;border-radius:4px}}
.meta{{font-size:12.5px;color:var(--soft);margin-top:40px;padding-top:14px;border-top:1px solid var(--line)}}
</style></head><body><main>
<p class="eyebrow">BSC PLM · RTW</p>
<h1>{inline(title)}</h1>
{''.join(body)}
<p class="meta">Generated from RTW-user-flow.md · 12 Nov 2026 · prototype at <a href="/">localhost:5175</a> · bsc-plm-rtw.vercel.app</p>
</main></body></html>'''
open(out, 'w', encoding='utf-8').write(page)
