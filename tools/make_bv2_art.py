# Генерирует src/js/06a_bv2_art.js: арты карточек (кадры референса) + контуры Украины из геоданных игры.
import io, base64, json, os
from PIL import Image, ImageFilter
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REF = os.environ.get('BV2_REF', '/mnt/user-data/uploads/file_00000000dad88210addabe685b370aee.png')
MAP = os.environ.get('BV2_MAP', '/home/claude/work/map.json')
im = Image.open(REF).convert('RGB'); sx = im.width / 1200
def crop(box): return im.crop(tuple(int(v * sx) for v in box))
# «Мережевий фронт»: кадр без плашки «Онлайн: 1247» (верх обрезан) и без тёмной кромки карточки
net = crop((236, 764, 686, 919))
parts = {
 'load': crop((0, 245, 640, 458)), 'net': net, 'scen': crop((706, 726, 938, 884)),
 'tour': crop((204, 1014, 438, 1106)), 'sim': crop((452, 1014, 694, 1110)),
 'help': crop((712, 1014, 934, 1110)), 'unity': crop((954, 1046, 1176, 1124)),
}
out = {}
for k, v in parts.items():
    v = v.resize((v.width * 2, v.height * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2, 60, 2))
    b = io.BytesIO(); v.save(b, 'WEBP', quality=80, method=6)
    out[k] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
    print(k, v.size, len(out[k]) // 1024, 'KB')
import re
g = open('dist/game_ultra.html', encoding='utf8').read()
for key in ('f16', 'ad_patriot'):   # спрайты техники из самой игры — для карточки «Арсенал»
    out['sp_' + key] = re.search(r'"%s": \{ "w": \d+, "h": \d+, "src": "(data:image/webp;base64,[^"]+)"' % key, g).group(1)
out['MAP'] = json.load(open(MAP))
open('src/js/06a_bv2_art.js', 'w', encoding='utf8').write('window.BV2ART=' + json.dumps(out, ensure_ascii=False) + ';\n')
print('ok')
