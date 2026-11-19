import numpy as np, json
from PIL import Image
from scipy import ndimage as ndi
out={}
MARGIN=22
def inter(a,b,m=None):
    m=MARGIN if m is None else m
    return not(a[2]+m<b[0] or b[2]+m<a[0] or a[3]+m<b[1] or b[3]+m<a[1])
for sheet in (1,2):
    MARGIN=22 if sheet==1 else 8
    im=Image.open(f'radar/radar_sheet_0{sheet}_transparent.png').convert('RGBA')
    a=np.array(im); al=a[...,3]>30
    lab,n=ndi.label(al,structure=np.ones((3,3)))
    comps=[]
    for i,sl in enumerate(ndi.find_objects(lab),1):
        area=int((lab[sl]==i).sum())
        comps.append((i,sl[1].start,sl[0].start,sl[1].stop,sl[0].stop,area))
    boxes=[[c[1],c[2],c[3],c[4]] for c in comps if c[5]>1500]
    changed=True
    while changed:
        changed=False
        for i in range(len(boxes)):
            for j in range(i+1,len(boxes)):
                if inter(boxes[i],boxes[j]):
                    A,B=boxes[i],boxes[j]
                    boxes[i]=[min(A[0],B[0]),min(A[1],B[1]),max(A[2],B[2]),max(A[3],B[3])]
                    boxes.pop(j);changed=True;break
            if changed:break
    rows=[]
    for b in sorted(boxes,key=lambda b:(b[1]+b[3])/2):
        cy=(b[1]+b[3])/2
        for r in rows:
            if abs(r[0]-cy)<110: r[1].append(b);break
        else: rows.append([cy,[b]])
    k=0
    for r in sorted(rows,key=lambda r:r[0]):
        for b in sorted(r[1],key=lambda b:b[0]):
            x0,y0,x1,y1=b
            keep=np.zeros(al.shape,bool)
            for (i,cx0,cy0,cx1,cy1,area) in comps:
                if x0-3<=cx0 and cx1<=x1+3 and y0-3<=cy0 and cy1<=y1+3: keep|=(lab==i)
            sub=a.copy(); sub[~keep]=0
            ys,xs=np.where(keep)
            c=sub[ys.min():ys.max()+1, xs.min():xs.max()+1]
            k+=1; name=f's{sheet}_{k:02d}'
            Image.fromarray(c).save(f'cut/{name}.png')
            out[name]=[int(xs.min()),int(ys.min()),c.shape[1],c.shape[0]]
json.dump(out,open('cut/index.json','w'),indent=1)
print(len(out))
for k,v in out.items(): print(k,v)
