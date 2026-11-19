# Етап 7.63: покадрові спрайти вибухів (лист 8×7, 52 кадри 128×128, assets/boom_sheet.webp) замість процедурних вогняних куль.
# python3 tools/apply_boom.py — створює src/js/02f_boom.js, підключає модуль і накладає правки на src/js/03_game.js та dist (ідемпотентно).
import os, sys, base64
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MARK = 'boom:v1'
b64 = base64.b64encode(open('assets/boom_sheet.webp', 'rb').read()).decode()
MOD = ('/* SKYDOMINION · етап 7.63 · лист спрайтів вибуху: 8 стовпців × 7 рядів, 52 кадри по 128 px, прозорий фон (assets/boom_sheet.webp).\n   Це ДВІ окремі послідовності: a = кадри 0–19 (спалах → куля → щільний темний дим; без згасання), b = кадри 20–51 (яскрава куля → бурий пил → сірий дим, що розсіюється повністю) */\n'
       '(function(){\n  const B = window.BV_BOOM = { cols: 8, cell: 128, n: 52, seq: { a: [0, 19], b: [20, 51] }, img: null, ready: false,\n    src: "data:image/webp;base64,' + b64 + '" };\n'
       '  const im = new Image(); im.onload = () => { B.img = im; B.ready = true; }; im.src = B.src;\n})();\n')
open('src/js/02f_boom.js', 'w', encoding='utf8').write(MOD)

G = ['src/js/03_game.js', 'dist/skydominion.html']
P = []
def p(old, new, n=1): P.append((old, new, n))
p('function fxRing(p, r1, life, m1){', '''/* boom:v1 — покадрова анімація вибуху з листа BV_BOOM (52 кадри: спалах → вогняна куля → темний дим → розсіювання).
   Листок містить дві послідовності (BV_BOOM.seq): "a" (0–19, закінчується щільним димом — потрібне згасання pw) і "b" (20–51, згасає сама).
   v — послідовність; f0/f1 — діапазон усередині неї; size — розмір кадру, км; m — мінімум, px (дальні масштаби); life — мс. Повертає false, якщо лист ще не завантажено */
const boomFrame = (q, e) => Math.min(q.f1, q.f0 + Math.floor(e * (q.f1 - q.f0 + 1)));
function fxBoom(p, o){
  const B = window.BV_BOOM; if (!B || !B.ready) return false;
  const sq = B.seq[o.v || "b"], f0 = sq[0] + (o.f0 || 0), f1 = Math.min(sq[1], o.f1 != null ? sq[0] + o.f1 : sq[1]);
  P({ k: "anim", p: o.jit ? jitter(p, o.jit) : p, life: o.life, size: o.size, m: o.m, f0, f1, rot: rnd(0, 6.283), flip: Math.random() < 0.5 ? -1 : 1,
    t0: performance.now() + (o.delay || 0), a0: 1, pw: o.pw != null ? o.pw : 0.3, fin: 0 });
  return true;
}
function fxRing(p, r1, life, m1){''')
p('''      } else if (q.k === "spark"){
        const sp = Math.hypot(q.v[0], q.v[1]) || 1,''', '''      } else if (q.k === "anim"){      // boom:v1
        const B = window.BV_BOOM; if (!B || !B.img) continue;
        const fi = boomFrame(q, e), s = Math.max(q.size / kmpp, q.m * v.fs), r = q.rot, c = Math.cos(r), sn = Math.sin(r);
        g.setTransform(dpr * c * q.flip, dpr * sn * q.flip, -dpr * sn, dpr * c, x * dpr, y * dpr);
        g.drawImage(B.img, (fi % B.cols) * B.cell, ((fi / B.cols) | 0) * B.cell, B.cell, B.cell, -s / 2, -s / 2, s, s);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else if (q.k === "spark"){
        const sp = Math.hypot(q.v[0], q.v[1]) || 1,''')
# наземний удар: основний вибух + (для великих боєприпасів) другий, зі зсувом
p('''  fxRing(p, 2.6 * sc, 700, 60 * sc);
  fxFireballs(p, 8, sc * 1.35, 1150);''', '''  fxRing(p, 2.6 * sc, 700, 60 * sc);
  const vb = Math.random() < 0.65 ? "b" : "a";      // boom:v1 — основний вибух: чи то «пиловий» (b, повний цикл), чи димний (a)
  if (fxBoom(p, vb === "b" ? { v: "b", size: 3.6 * sc, m: 40 * sc, life: 2700 + 700 * sc } : { v: "a", size: 3.2 * sc, m: 40 * sc, life: 1900 + 400 * sc, pw: 1.3 })){
    if (sc > 1.2) fxBoom(p, vb === "b" ? { v: "a", size: 2.2 * sc, m: 28 * sc, life: 1500, delay: 160, jit: 0.22 * sc, pw: 1.3 } : { v: "b", size: 2.4 * sc, m: 28 * sc, life: 2300, delay: 160, jit: 0.22 * sc });
    fxFireballs(p, 2, sc * 0.9, 700);
  } else fxFireballs(p, 8, sc * 1.35, 1150);''')
# підбитий у повітрі: короткий яскравий вибух (кадри до 38 — далі лише дим, який дають емітери)
p('''  fxFlash(p, 0.4 * sc, 1.3 * sc, 14, 34 * sc, 230);
  fxFireballs(p, 5, sc, 850);''', '''  fxFlash(p, 0.4 * sc, 1.3 * sc, 14, 34 * sc, 230);
  if (fxBoom(p, { v: "a", size: 2.0 * sc, m: 24 * sc, life: 1000, f1: 11, pw: 1.3 })) fxFireballs(p, 1, sc * 0.8, 500);      // boom:v1
  else fxFireballs(p, 5, sc, 850);''')
p('function fxHitSpark(p){ buildTex(); fxFlash(p, 0.15, 0.45, 8, 16, 160); fxFireballs(p, 2, 0.5, 500); fxSparks(p, 9, 0.7); }',
  'function fxHitSpark(p){ buildTex(); fxFlash(p, 0.15, 0.45, 8, 16, 160); if (!fxBoom(p, { v: "a", size: 0.9, m: 14, life: 450, f1: 7, pw: 1 })) fxFireballs(p, 2, 0.5, 500); fxSparks(p, 9, 0.7); }      // boom:v1')

def patch(path):
    s = open(path, encoding='utf8').read()
    if MARK in s: print(path, 'вже застосовано'); return
    for old, new, n in P:
        c = s.count(old)
        if c != n: sys.exit(f'{path}: очікувалось {n}, є {c}: {old[:90]!r}')
        s = s.replace(old, new)
    if path.endswith('.html'):
        a = '<script id="bvFog">'; assert s.count(a) == 1
        s = s.replace(a, '<script id="bvBoom">' + MOD + '</script>\n' + a)
    open(path, 'w', encoding='utf8').write(s); print(path, 'OK')
for f in G: patch(f)
ix = open('src/index.html', encoding='utf8').read()
if '02f_boom' not in ix:
    a = '<script>@@F:js/02e_fog.js@@</script>'; assert ix.count(a) == 1
    open('src/index.html', 'w', encoding='utf8').write(ix.replace(a, a + '\n<script>@@F:js/02f_boom.js@@</script>')); print('index.html OK')
