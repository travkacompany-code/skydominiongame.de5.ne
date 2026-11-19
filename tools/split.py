import re,json,hashlib,os,sys
src=sys.argv[1];s=open(src,encoding='utf8').read()
assets={}
def rep(m):
    b=m.group(2);h=hashlib.sha1(b.encode()).hexdigest()[:12];n=h+'.webp'
    if n not in assets:assets[n]=b;open('assets/'+n,'wb').write(__import__('base64').b64decode(b))
    return '@@A:'+n+'@@'
t=re.sub(r'data:(image/webp);base64,([A-Za-z0-9+/=]+)',rep,s)
# cut into parts: html skeleton with placeholders for style/script contents
parts=[];out=[];i=0;idx=0
pat=re.compile(r'(<style[^>]*>)(.*?)(</style>)|(<script[^>]*>)(.*?)(</script>)',re.S)
last=0;skel=''
for m in pat.finditer(t):
    skel+=t[last:m.start()]
    if m.group(1):
        name=f'css/{idx:02d}_style.css';open('src/'+name,'w',encoding='utf8').write(m.group(2));skel+=m.group(1)+'@@F:'+name+'@@'+m.group(3)
    else:
        tag=m.group(4)
        if m.group(5).strip()=='':skel+=m.group(0);last=m.end();continue
        nm={0:'geodata',1:'boot',2:'game'}.get(idx-1,'part')
        name=f'js/{idx:02d}_{nm}.js';open('src/'+name,'w',encoding='utf8').write(m.group(5));skel+=m.group(4)+'@@F:'+name+'@@'+m.group(6)
    idx+=1;last=m.end()
skel+=t[last:]
open('src/index.html','w',encoding='utf8').write(skel)
print(idx,len(assets),len(skel))
