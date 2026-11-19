# Етап 9: підключення повітряного бою BV_AC
# Ідемпотентно вшиває модуль і glue в вихідний і зібраний HTML.
import os, sys
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
rd=lambda p:open(p,encoding='utf-8').read()
wr=lambda p,s:open(p,'w',encoding='utf-8').write(s)
MOD=rd('src/js/02k_aircombat.js')
GLUE=rd('tools/aircombat_glue.js').rstrip()+"\n"

def once(s,a,b,what):
    n=s.count(a)
    if n!=1: raise RuntimeError(f'Якір «{what}» знайдено {n} разів (очікується 1)')
    return s.replace(a,b)

changed=[]
h=rd('src/index.html')
if 'bvAirCombat' not in h:
    h=once(h,'<script>@@F:js/02j_aew.js@@</script>','<script id="bvAirCombat">@@F:js/02k_aircombat.js@@</script>\n<script>@@F:js/02j_aew.js@@</script>','air module index')
    changed.append('src/index.html')
    wr('src/index.html',h)

g=rd('src/js/03_game.js')
if '/* ---------- Air combat integration — BV_AC bridge ----------' not in g:
    g=g.rstrip()+"\n\n"+GLUE
    changed.append('src/js/03_game.js')
    wr('src/js/03_game.js',g)

if os.path.exists('dist/skydominion.html'):
    d=rd('dist/skydominion.html')
    if '<script id="bvAirCombat">' not in d:
        d=once(d,'<script id="bvAew">','<script id="bvAirCombat">'+MOD+'</script>\n<script id="bvAew">','dist module')
    if '/* ---------- Air combat integration — BV_AC bridge ----------' not in d:
        d=d.rstrip()+"\n<script id=\"bvAirCombatGlue\">\n"+GLUE+"\n</script>\n"
    changed.append('dist/skydominion.html')
    wr('dist/skydominion.html',d)
print('змінено:',', '.join(changed) if changed else 'нічого (вже застосовано)')
