"""Підключає спрайти ракет «повітря-повітря» та РЛС (src/js/02d_sprites.js -> window.BV_SPR) до гри.
Ідемпотентно, як apply_radar.py: патчить src/js/03_game.js, src/index.html і dist/skydominion.html.
Порядок: python3 tools/make_sprites.py && python3 tools/apply_sprites.py"""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
MARK = "/* sprites:v1 */"

HELPERS_AAM = MARK + r'''
/* ---------- етап 7.57: спрайти ракет «повітря-повітря» (BV_SPR.missiles, ніс угору) ---------- */
const AAM_IMG = {};
function aamImg(id){
  let e = AAM_IMG[id]; if (e) return e;
  const S = window.BV_SPR, m = S && S.missiles && S.missiles[id]; if (!m) return (AAM_IMG[id] = { bad: true });
  const im = new Image(); im.src = m.src; return (AAM_IMG[id] = { im, m });
}
function aamPick(key, d, R){
  const S = window.BV_SPR, set = S && S.aamSets && S.aamSets[key]; if (!set || !set.length) return null;
  const f = R > 0 ? d / R : 0.5, ok = set.filter(e => f >= e[1] && f <= e[2]), a = ok.length ? ok : [set[0]];
  return a[(Math.random() * a.length) | 0][0];
}
function drawAam(g, x, y, s, sc, now){
  const e = aamImg(s.aam); if (e.bad || !e.im.naturalWidth) return false;
  const m = e.m, h = m.L * sc, w = h * m.w / m.h, W = Math.max(1.6, w * 0.2);
  g.save(); g.translate(x, y); g.rotate(s.hdg * D2R);
  const fl = 0.78 + 0.22 * Math.sin(now / 21 + s.seed * 7) + 0.14 * Math.random(), fL = h * 0.85 * fl;      // вихлоп — як у drawMissile
  g.globalCompositeOperation = "lighter";
  let gr = g.createLinearGradient(0, h / 2, 0, h / 2 + fL);
  gr.addColorStop(0, "rgba(255,255,236,0.95)"); gr.addColorStop(0.22, "rgba(255,214,128,0.85)"); gr.addColorStop(0.6, "rgba(255,124,44,0.42)"); gr.addColorStop(1, "rgba(255,80,20,0)");
  g.fillStyle = gr; g.beginPath(); g.moveTo(-W * 0.42, h / 2); g.quadraticCurveTo(0, h / 2 + fL * 1.2, W * 0.42, h / 2); g.closePath(); g.fill();
  gr = g.createRadialGradient(0, h / 2 + 1, 0, 0, h / 2 + 1, W * 2.4);
  gr.addColorStop(0, "rgba(255,226,160,0.55)"); gr.addColorStop(1, "rgba(255,140,40,0)");
  g.fillStyle = gr; g.beginPath(); g.arc(0, h / 2 + 1, W * 2.4, 0, 7); g.fill();
  g.globalCompositeOperation = "source-over";
  g.drawImage(e.im, -w / 2, -h / 2, w, h);
  g.restore(); return true;
}
'''

HELPERS_RAD = MARK + r'''
/* ---------- етап 7.57: спрайти РЛС (BV_SPR.radars + radarMap) ---------- */
function radSprId(type, id){
  const S = window.BV_SPR, a = S && S.radarMap && S.radarMap[type]; if (!a || !a.length) return null;
  return a[(parseInt(String(id).replace(/\D/g, ""), 10) || 0) % a.length];      // варіант спрайта — за номером станції
}
function radIcon(st){ const k = radSprId(st.type, st.id); return k ? "rs_" + k : ""; }
function radThumb(type, id){
  const k = radSprId(type, id), r = k && window.BV_SPR.radars[k];
  return r ? `<img src="${r.src}" alt="" style="width:58px;height:34px;object-fit:contain;flex:none;margin-right:8px;vertical-align:middle">` : "";
}
function radIconsInit(map){
  const S = window.BV_SPR; if (!S || !S.radars) return;
  Promise.all(Object.keys(S.radars).map(k => new Promise(res => {
    const im = new Image();
    im.onload = () => { try { if (!map.hasImage("rs_" + k)) map.addImage("rs_" + k, im, { pixelRatio: 2 }); } catch (e) {} res(); };
    im.onerror = res; im.src = S.radars[k].src;
  }))).then(() => {
    try {
      if (map.getLayer("radp-s")) return;
      map.addLayer({ id: "radp-s", type: "symbol", source: "radp", filter: ["!=", ["get", "ic"], ""],
        layout: { "icon-image": ["get", "ic"], "icon-anchor": "bottom", "icon-offset": [0, 6], "icon-allow-overlap": true, "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.28, 6, 0.42, 9, 0.62, 12, 1] },
        paint: { "icon-opacity": ["case", ["==", ["get", "a"], 1], 1, 0.55] } }, map.getLayer("radc-c") ? "radc-c" : undefined);
      map.on("click", "radp-s", e => { const f = e.features && e.features[0]; if (f) radPop(String(f.properties.id)); });
      map.on("mouseenter", "radp-s", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "radp-s", () => { map.getCanvas().style.cursor = ""; });
      RAD.dirty = true;
    } catch (e) { /* карта ще не готова */ }
  });
}
'''

# (old, new) — кожен old має бути в тексті рівно 1 раз
EDITS = [
  # --- ракети ---
  ('max: T.r * 1.6 + 15, trail: [[pos[0], pos[1], performance.now()]], tl: 0, seed: Math.random() });\n  if (T.air) fxMuzzle(pos);',
   'max: T.r * 1.6 + 15, trail: [[pos[0], pos[1], performance.now()]], tl: 0, seed: Math.random(), aam: T.air ? aamPick(u.key, hav(pos, t.pos), T.r) : null });\n  if (T.air) fxMuzzle(pos);'),
  ('    if (v.near) drawMissile(g, x, y, s.hdg, MSL[s.key] || MSL.patriot, msc, now, s.seed);',
   '    if (v.near){ if (!(s.aam && drawAam(g, x, y, s, msc, now))) drawMissile(g, x, y, s.hdg, MSL[s.key] || MSL.patriot, msc, now, s.seed); }      // 7.57: спрайт ракети В-В, якщо є'),
  ('function drawNeonDart(g, x, y, hdg, len, red){', HELPERS_AAM + 'function drawNeonDart(g, x, y, hdg, len, red){'),
  ('  mig29:   { L: 13, w: 0.085, body: "#dfe2dd", nose: "#6d747a", band: "#c9b44a", canard: true },\n',
   '  mig29:   { L: 13, w: 0.085, body: "#dfe2dd", nose: "#6d747a", band: "#c9b44a", canard: true },\n'
   '  f16:     { L: 12, w: 0.085, body: "#c9ced1", nose: "#e8eaec", band: "#6d747a", canard: false },      // 7.57: запасний вигляд, якщо спрайт не завантажився\n'
   '  mirage:  { L: 12, w: 0.085, body: "#d8dcdd", nose: "#3a3e42", band: "#6d747a", canard: false },\n'
   '  su35:    { L: 14, w: 0.085, body: "#e4e6e2", nose: "#8f969b", band: "#b9554c", canard: true },\n'
   '  su30:    { L: 14, w: 0.085, body: "#e4e6e2", nose: "#8f969b", band: "#b9554c", canard: true },\n'),
  # --- РЛС ---
  ('function radarRender(now){\n', HELPERS_RAD + 'function radarRender(now){\n'),
  ('id: "radp-c", type: "circle", source: "radp", paint: { "circle-radius": 6,',
   'id: "radp-c", type: "circle", source: "radp", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 9, 7, 12, 10],'),
  ('properties: { id: st.id, c: col, a: act, sn:', 'properties: { id: st.id, ic: radIcon(st), c: col, a: act, sn:'),
  ('map.on("click", "radp-c", e => {', 'radIconsInit(map);\n      map.on("click", "radp-c", e => {'),
  ('el.innerHTML = `<b style="color:#ffd23f">${escH(T.name)}</b> · ${SIDE_N[m.side]}<br>',
   'el.innerHTML = radThumb(st.type, st.id).replace("margin-right:8px", "float:right;width:96px;height:56px;margin:0 0 6px 10px") + `<b style="color:#ffd23f">${escH(T.name)}</b> · ${SIDE_N[m.side]}<br>'),
  ('data-ad="radst" data-v="${s.id}"><span class="tn">${escH(s.name)}',
   'data-ad="radst" data-v="${s.id}">${radThumb(s.type, s.id)}<span class="tn">${escH(s.name)}'),
  ('data-ad="radpick" data-k="${u.id}"><span class="tn">${escH(u.name)}',
   'data-ad="radpick" data-k="${u.id}">${radThumb(u.id, 0)}<span class="tn">${escH(u.name)}'),
]

def patch(txt, name):
    if MARK in txt: print(name, ": вже застосовано"); return txt
    for old, new in EDITS:
        n = txt.count(old)
        if n != 1: sys.exit(f"{name}: очікувався 1 збіг, знайдено {n} для: {old[:80]!r}")
        txt = txt.replace(old, new)
    print(name, ": OK"); return txt

def rw(path, fn):
    t = open(path, encoding="utf8").read(); n = fn(t)
    if n != t: open(path, "w", encoding="utf8").write(n)

# 1) гра
rw("src/js/03_game.js", lambda t: patch(t, "src/js/03_game.js"))
# 2) src/index.html: модуль спрайтів перед грою
def idx(t):
    tag = '<script>@@F:js/02d_sprites.js@@</script>\n'
    if tag in t: print("src/index.html : вже підключено"); return t
    a = '<script>@@F:js/02c_radar.js@@</script>\n'
    if a not in t: sys.exit("index.html: немає 02c_radar")
    print("src/index.html : OK"); return t.replace(a, a + tag)
rw("src/index.html", idx)
# 3) dist
def dist(t):
    t = patch(t, "dist (гра)")
    if 'id="bvSprites"' not in t:
        js = open("src/js/02d_sprites.js", encoding="utf8").read()
        a = '<script id="bvBoot">'
        if t.count(a) != 1: sys.exit("dist: не знайдено bvBoot")
        t = t.replace(a, '<script id="bvSprites">' + js + '</script>\n' + a); print("dist (спрайти) : OK")
    else:
        js = open("src/js/02d_sprites.js", encoding="utf8").read()
        t = re.sub(r'<script id="bvSprites">.*?</script>', lambda m: '<script id="bvSprites">' + js + '</script>', t, count=1, flags=re.S); print("dist (спрайти) : оновлено")
    return t
rw("dist/skydominion.html", dist)
