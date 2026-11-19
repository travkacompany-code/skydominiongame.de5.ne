import re,base64,io,json,cv2,numpy as np,sys,time
from PIL import Image
s=open('/home/claude/proj/skydominion/dist/game_ultra.html',encoding='utf8').read()
items=[(m.group(1),m.group(2)) for m in re.finditer(r'"([a-z0-9_]+)": \{ "w": \d+, "h": \d+, "src": "data:image/webp;base64,([^"]+)"',s)]
sr=cv2.dnn_superres.DnnSuperResImpl_create(); sr.readModel('FSRCNN_x2.pb'); sr.setModel('fsrcnn',2)
out={}; t=time.time()
for n,(k,b64) in enumerate(items):
    im=Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGBA'); W,H=im.size
    a=np.array(im); al=a[:,:,3]
    # цвет под прозрачным краем «растягиваем» наружу, чтобы не тянуть тёмные ореолы в апскейл
    rgb=a[:,:,:3].copy(); m=(al>8).astype(np.uint8)
    bg=cv2.inpaint(rgb,(1-m)*255,3,cv2.INPAINT_TELEA) if (m==0).any() else rgb
    big=sr.upsample(cv2.cvtColor(np.where(m[:,:,None]>0,rgb,bg),cv2.COLOR_RGB2BGR))
    big=cv2.cvtColor(big,cv2.COLOR_BGR2RGB)
    rgb2=cv2.resize(big,(W,H),interpolation=cv2.INTER_AREA)
    a2=cv2.resize(al,(W*2,H*2),interpolation=cv2.INTER_CUBIC); a2=cv2.GaussianBlur(a2,(0,0),1.1)
    a2=cv2.resize(a2,(W,H),interpolation=cv2.INTER_AREA)
    # лёгкий «ап» контраста краю, чтобы не стало мыльно
    a2=np.clip((a2.astype(np.float32)-128)*1.15+128,0,255).astype(np.uint8)
    a2=np.where(al==0,np.minimum(a2,al+0),a2) if False else a2
    res=Image.fromarray(np.dstack([rgb2,a2]),'RGBA')
    b=io.BytesIO(); res.save(b,'WEBP',quality=92,method=6)
    out[k]=base64.b64encode(b.getvalue()).decode()
    if n%20==0: print(n,len(items),round(time.time()-t),flush=True); json.dump(out,open('sr_out.json','w'))
json.dump(out,open('sr_out.json','w')); print('DONE',len(out),flush=True)
