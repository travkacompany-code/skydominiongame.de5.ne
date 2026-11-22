import re,base64,sys,os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
h=open('src/index.html',encoding='utf8').read()
def fr(m):return open('src/'+m.group(1),encoding='utf8').read()
h=re.sub(r'@@F:([^@]+)@@',fr,h)
def ar(m):return 'data:image/webp;base64,'+base64.b64encode(open('assets/'+m.group(1),'rb').read()).decode()
h=re.sub(r'@@A:([^@]+)@@',ar,h)
out=sys.argv[1] if len(sys.argv)>1 else 'dist/game.html'
open(out,'w',encoding='utf8').write(h);print(out,len(h))
