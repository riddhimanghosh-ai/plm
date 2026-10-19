# re-embed both accordion pages into bsc-plm.html (run after .rebuild.py)
import html,re
s=open('bsc-plm.html').read()
head=s[:s.index('<iframe id="f-current"')]
tail=s[s.index('</iframe>', s.index('<iframe id="f-optimized"'))+len('</iframe>'):]
def ifr(i,f):
    m=re.search(r'<iframe id="%s"[^>]*?srcdoc='%i, s)
    return s[m.start():m.end()]+'"'+html.escape(open(f).read(),quote=True)+'"></iframe>'
a=s.index('</iframe>', s.index('<iframe id="f-current"'))+len('</iframe>')
mid=s[a:s.index('<iframe id="f-optimized"')]
open('bsc-plm.html','w').write(head+ifr('f-current','bsc-current-process-accordion.html')+mid+ifr('f-optimized','bsc-optimized-process-accordion.html')+tail)
