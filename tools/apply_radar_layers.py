"""Етап 7.58 · РЛС у чотири незалежні шари на власному полотні + зв'язок з логікою (BV_RADAR.beam):
   1 корпус і шасі (нерухомий спрайт) · 2 антена (окремий спрайт; ширина = |cos азимута променя|, оберт — з симуляції)
   3 промінь сканування (сектор зі шлейфом, довжина = ефективна дальність) · 4 відмітки контактів (влучання променя в ціль).
   Потрібні: tools/make_sprites.py (BV_SPR.parts), tools/apply_sweep.py (02c_radar.js), tools/apply_sprites.py (v1).
   Патчить src/js/03_game.js і dist/skydominion.html. Ідемпотентно."""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
MARK = "/* radvis:v1 */"

VIS = MARK + r'''
/* ---------- етап 7.58: шари РЛС на власному полотні (незалежні перемикачі RADVIS.on) ----------
   Антена і промінь беруть азимут із симуляції (BV_RADAR.beam): az (на момент останнього кроку) + w · RAD.acc (ігровий час, що ще не пройшов крок).
   Гра на паузі — антена стоїть; станція вимкнена / розгортається / переміщується — не обертається; перевантаження — обертання повільніше.
   Відмітки — це реальні влучання променя (st.hits), а не анімація. */
const RADVIS = { c: null, g: null, W: 0, H: 0, dpr: 1, img: {}, empty: true, raf: 0, on: Object.assign({ body: true, ant: true, scan: true, hits: true }, lsGet("bvRadLayers", {})) };
const RADVIS_N = { body: "Корпус", ant: "Антена", scan: "Промінь", hits: "Контакти" };
function radLayerChips(){ return Object.keys(RADVIS_N).map(k => `<button class="chip ${RADVIS.on[k] ? "on" : ""}" data-ad="radlayer" data-v="${k}">${RADVIS_N[k]}</button>`).join(""); }
function radSz(z){ const S = [[3, 0.28], [6, 0.42], [9, 0.62], [12, 1]]; if (z <= S[0][0]) return S[0][1]; for (let i = 1; i < S.length; i++) if (z <= S[i][0]){ const a = S[i - 1], b = S[i]; return a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]); } return S[S.length - 1][1]; }
function radPart(rid){
  let e = RADVIS.img[rid]; if (e) return e;
  const P = window.BV_SPR && window.BV_SPR.parts && window.BV_SPR.parts[rid]; if (!P) return (RADVIS.img[rid] = { bad: true });
  const b = new Image(), a = new Image(); b.src = P.body; a.src = P.ant; return (RADVIS.img[rid] = { P, b, a });
}
function radvisInit(map){
  if (RADVIS.c) return;
  const c = document.createElement("canvas"); c.id = "radLayer"; c.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;";
  const host = map.getCanvasContainer(), fx = document.getElementById("fxLayer"); if (fx && fx.parentNode === host) host.insertBefore(c, fx); else host.appendChild(c);
  RADVIS.c = c; RADVIS.g = c.getContext("2d");
  const resize = () => { const el = map.getContainer(); RADVIS.W = el.clientWidth; RADVIS.H = el.clientHeight; RADVIS.dpr = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(RADVIS.W * RADVIS.dpr); c.height = Math.round(RADVIS.H * RADVIS.dpr); RADVIS.empty = false; };
  resize(); window.addEventListener("resize", resize); map.on("resize", resize);
  map.on("move", () => radvisDraw(performance.now()));
  const loop = now => { RADVIS.raf = requestAnimationFrame(loop); if (!document.hidden) { try { radvisDraw(now); } catch (e) { /* кадр пропущено */ } } };
  RADVIS.raf = requestAnimationFrame(loop);
}
function radvisDraw(now){
  const V = RADVIS, g = V.g, sim = RAD.sim, map = S7.map; if (!g || !map || !FX.map) return;
  if (!sim || !sim.stations.length){ if (!V.empty){ g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, V.c.width, V.c.height); V.empty = true; } return; }
  V.empty = false;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, V.c.width, V.c.height); g.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  const BV = radBV(), v = fxView(), k = radSz(v.z), sc = k / 2, acc = RAD.acc, W = V.W, H = V.H, rows = [];
  for (const st of sim.stations){
    const m = RAD.meta.get(st.id); if (!m || !radVisible(m)) continue;
    const bm = BV.beam(sim, st.id); if (!bm) continue;
    const [x, y] = fxXY(v, m.c), R = bm.rKm / fxKmpp(v, m.c[1]);
    if (!(x > -90 && y > -90 && x < W + 90 && y < H + 90) && !(R > 40 && bm.active && x > -R && y > -R && x < W + R && y < H + R)) continue;
    const az = bm.mode === "sweep" ? bm.az + bm.w * acc : bm.az;       // азимут антени: крок симуляції + ігровий час, що ще не пройшов крок
    rows.push({ st, m, bm, x, y, R, az });
  }
  /* шар 3: промінь сканування (під спрайтами) */
  if (V.on.scan) for (const r of rows){
    const { st, m, bm, x, y, R, az } = r; if (!bm.active || !(R > 6)) continue;
    const col = m.side === "ua" ? "34,195,230" : "255,107,107", ac = az - Math.PI / 2;
    if (bm.mode === "sweep"){
      const trail = 0.85, N = 16;                                   // шлейф ≈ 49° з плавним згасанням
      for (let i = 0; i < N; i++){
        const f = 1 - i / N; g.fillStyle = `rgba(${col},${(0.2 * f * f).toFixed(3)})`;
        g.beginPath(); g.moveTo(x, y); g.arc(x, y, R, ac - trail * (i + 1) / N, ac - trail * i / N); g.closePath(); g.fill();
      }
      g.strokeStyle = `rgba(${col},0.85)`; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ac) * R, y + Math.sin(ac) * R); g.stroke();
    } else if (Object.keys(st.gr).length){                          // ФАР контрбатарейної РЛС: сектор у бік останнього пуску
      g.fillStyle = `rgba(${col},0.11)`; g.beginPath(); g.moveTo(x, y); g.arc(x, y, R, ac - 0.21, ac + 0.21); g.closePath(); g.fill();
      g.strokeStyle = `rgba(${col},0.6)`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ac) * R, y + Math.sin(ac) * R); g.stroke();
    }
  }
  /* шари 1 і 2: корпус і шасі (нерухомо) + антена (окремий спрайт; видима ширина = |cos азимута|, з дзеркалом, коли антена дивиться «від глядача») */
  if (V.on.body || V.on.ant) for (const r of rows){
    const { st, x, y, az } = r, e = radPart(radSprId(st.type, st.id));
    if (e.bad || !e.b.naturalWidth || !e.a.naturalWidth) continue;
    const P = e.P, bx = x - P.W * sc / 2, by = y - P.H * sc + 4 * sc;
    if (V.on.body) g.drawImage(e.b, bx, by, e.b.naturalWidth * sc * (P.W / e.b.naturalWidth), e.b.naturalHeight * sc * (P.H / e.b.naturalHeight));
    if (V.on.ant){
      let sx = -Math.cos(az); if (Math.abs(sx) < 0.09) sx = sx < 0 ? -0.09 : 0.09;
      g.save(); g.translate(bx + P.px * sc, by + P.py * sc); g.scale(sc * sx, sc); g.drawImage(e.a, P.ax - P.px, P.ay - P.py); g.restore();
    }
  }
  /* шар 4: відмітки контактів — влучання променя; лише станції своєї сторони (чужі контакти гравець не бачить) */
  if (V.on.hits) for (const r of rows){
    const { m, bm } = r; if (!ewMine(m.side) || !bm.hits.length) continue;
    const ttl = Math.max(4, bm.periodSec * 3), tn = sim.t + acc;
    for (const h of bm.hits){
      const age = tn - h.t; if (age < 0 || age > ttl) continue;
      const [hx, hy] = fxXY(v, radLL(h.x, h.y)); if (!(hx > -20 && hy > -20 && hx < W + 20 && hy < H + 20)) continue;
      const f = 1 - age / ttl; g.globalAlpha = Math.max(0.12, f); g.fillStyle = RAD_ST_COL[h.s] || "#ffd23f";
      g.beginPath(); g.arc(hx, hy, 2.6, 0, 7); g.fill();
      if (age < 0.7){ g.globalAlpha = 1 - age / 0.7; g.strokeStyle = RAD_ST_COL[h.s] || "#ffd23f"; g.lineWidth = 1.4; g.beginPath(); g.arc(hx, hy, 4 + age * 16, 0, 7); g.stroke(); }
    }
    g.globalAlpha = 1;
  }
}
'''
# видаляємо v1: символьний шар зі спрайтом цілого корпусу (його замінили шари на полотні)
def drop_v1(t):
    a = "function radIconsInit(map){"; i = t.find(a)
    if i < 0: return t
    j = t.find("\n}\n", i)
    return t[:i] + t[j + 3:]
EDITS = [
  ('return RAD.sim || (RAD.sim = radBV().create({ seed: 20260 }));', 'return RAD.sim || (RAD.sim = radBV().create({ seed: 20260, cfg: { sweep: true } })); /* 7.58: променевий скан */'),
  ('RAD.acc += sd; if (RAD.acc < 0.5) return;', 'RAD.acc += sd; if (RAD.acc < 0.2) return; /* 7.58: крок 0,2 ігрової секунди */'),
  ('noted: new Set(), sel: null };', 'noted: new Set(), sel: null };'),
  ('function radarRender(now){\n', VIS + 'function radarRender(now){\n'),
  ('radIconsInit(map);', 'radvisInit(map);'),
  ('data-ad="radneed">ППО потребує РЛС: ${RAD.need ? "так" : "ні"}</button></div>', 'data-ad="radneed">ППО потребує РЛС: ${RAD.need ? "так" : "ні"}</button></div><div class="row" style="margin-top:6px;flex-wrap:wrap">${radLayerChips()}</div>'),
  ('      case "radneed": RAD.need = !RAD.need; return apRender();', '      case "radneed": RAD.need = !RAD.need; return apRender();\n      case "radlayer": RADVIS.on[v] = !RADVIS.on[v]; lsSet("bvRadLayers", RADVIS.on); return apRender();'),
  ('`<br>Контактів: ${card.tracks}/${card.maxTracks} · канал до КП: ', '`<br>${card.rotationSec ? "Антена: оберт " + card.rotationSec + " с · азимут " + card.azDeg + "°<br>" : ""}Контактів: ${card.tracks}/${card.maxTracks} · канал до КП: '),
  ('window.BV_RAD_API = { add: radarAdd,', 'window.BV_RADVIS = RADVIS;\nwindow.BV_RAD_API = { add: radarAdd,'),
]
def patch(t, name):
    if MARK in t: print(name, ": вже застосовано"); return t
    if "sprites:v1" not in t: sys.exit(name + ": спершу tools/apply_sprites.py")
    for old, new in EDITS:
        n = t.count(old)
        if n != 1: sys.exit(f"{name}: очікувався 1 збіг, знайдено {n}: {old[:70]!r}")
        t = t.replace(old, new)
    t = drop_v1(t); print(name, ": OK"); return t
def rw(path, fn):
    t = open(path, encoding="utf8").read(); n = fn(t)
    if n != t: open(path, "w", encoding="utf8").write(n)
rw("src/js/03_game.js", lambda t: patch(t, "src/js/03_game.js"))
rw("dist/skydominion.html", lambda t: patch(t, "dist (гра)"))
