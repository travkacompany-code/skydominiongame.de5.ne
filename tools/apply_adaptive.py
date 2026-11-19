# Вшивает адаптивный слой в dist/skydominion.html (идемпотентно): CSS последним стилем, JS перед </body>.
import os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
f='dist/skydominion.html'; s=open(f,encoding='utf-8').read()
import re
s=re.sub(r'<style id="sx-adaptive">.*?</style>\n?','',s,flags=re.S)
s=re.sub(r'<script id="sx-adaptive-js">.*?</script>\n?','',s,flags=re.S)
css='<style id="sx-adaptive">\n'+open('src/css/150_adaptive.css',encoding='utf-8').read()+'\n</style>\n'
js='<script id="sx-adaptive-js">\n'+open('src/js/150_adaptive.js',encoding='utf-8').read()+'\n</script>\n'
s=s.replace('</body>',css+js+'</body>',1)
open(f,'w',encoding='utf-8').write(s); print('ok',len(s))
