# Вшивает дизайн SKYDOMINION в dist/game_ultra.html -> dist/skydominion.html (идемпотентно, логика игры не меняется)
import re,os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
s=open('dist/game_ultra.html',encoding='utf-8').read()
s=s.replace('SKY<b>DOMINION</b>','SKY<b>DOMINION</b>').replace('SKYDOMINION','SKYDOMINION').replace('SkyDominion_','SkyDominion_')
s=s.replace('fillText("SKYDOMINION", 28, 44)','fillText("SKYDOMINION", 28, 44)').replace('measureText("SKYDOMINION ")','measureText("SKYDOMINION ")').replace('fillText("2", 28 + w, 44)','fillText("", 28 + w, 44)')
s=s.replace('SKYDOMINION ©','SKYDOMINION ©')
s=s.replace('content="#0b0c0e"','content="#04070d"')
fonts='<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">\n'
if 'sd-skydominion' not in s:
    css='<style id="sd-skydominion">\n'+open('src/css/120_skydominion.css',encoding='utf-8').read()+'\n</style>\n'
    i=s.find('</style>',s.find('id="bv-ultra-design"'))+len('</style>')
    s=s[:i]+'\n'+fonts+css+s[i:]
    s=s.replace('</body>','<script id="sd-js">\n'+open('src/js/05_skydominion.js',encoding='utf-8').read()+'\n</script>\n</body>')
open('dist/skydominion.html','w',encoding='utf-8').write(s);print('ok',len(s))
