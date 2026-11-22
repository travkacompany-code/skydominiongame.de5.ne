#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""етап 7.72 — картина цілей РЛС на полотні (плавно, кожен кадр): кольорові стани, захоплення, лінії РЛС→ціль, ракети під цілевказанням мережі.
   Патчить src/js/03_game.js і dist/skydominion.html. Ідемпотентно. Потрібен radvis:v1 (apply_radar_layers.py)."""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
MARK = "/* radpic:v1 */"
PIC = MARK + r'''
/* ---------- етап 7.72: картина цілей на полотні ----------
   Стани (колір = RAD_ST_COL): попередній — порожня точка; виявлено — жовте кільце; супровід — оранжевий ромб + вектор швидкості;
   ЗАХОПЛЕННЯ (супровід/ідентифікація з впевненістю ≥ 0,6 — та сама умова, що пускає ЗРК) — червона мітка з кутовими дужками, пульсом і ореолом;
   втрачений — тьмяне порожнє кільце, що згасає. Позиція екстраполюється за вектором між оновленнями — без ривків.
   Лінії РЛС→ціль: від кожної станції, що свіжо веде захоплену ціль. Ракети РЛ-типу, що ведуться мережею (m.cued), — штрихова лінія від станції до ракети. */
function radpicDraw(g, v, W, H, sim, acc, now){
  const V = RADVIS, tn = sim.t + acc, kmpp = lat => fxKmpp(v, lat);
  const pulse = 0.5 + 0.5 * Math.sin(now / 230), flow = -(now / 45) % 1000;
  const scr = (x, y) => fxXY(v, radLL(x, y));
  for (const sd of ["ua", "ru"]){
    if (!ewMine(sd)) continue;
    const list = sim.pic[sd].air, locks = [];
    for (const c of list){
      const lost = c.state === "lost", age = tn - c.lastUpdatedAt;
      if (lost && age > 7) continue;
      const dt = c.hasV ? Math.min(12, Math.max(0, age)) : 0, X = c.x + (c.vx || 0) * dt, Y = c.y + (c.vy || 0) * dt;
      const [px, py] = scr(X, Y); if (!(px > -60 && py > -60 && px < W + 60 && py < H + 60)) continue;
      const rank = c.state === "identified" ? 4 : c.state === "tracking" ? 3 : c.state === "detected" ? 2 : 1;
      const lock = !lost && rank >= 3 && c.conf >= 0.6, col = RAD_ST_COL[c.state] || "#ffd23f";
      const fade = lost ? Math.max(0.12, 0.5 * (1 - (age - 0) / 7)) : Math.min(1, 0.45 + c.conf * 0.7) * (age > 6 ? Math.max(0.45, 1 - (age - 6) / 10) : 1);
      g.globalAlpha = fade;
      if (rank <= 2 && !lost){                                          // невизначеність положення
        const R = Math.min(46, Math.max(5, c.sigma / kmpp(radLL(X, Y)[1])));
        g.strokeStyle = col; g.lineWidth = 1; g.setLineDash([3, 4]); g.beginPath(); g.arc(px, py, R, 0, 7); g.stroke(); g.setLineDash([]);
      }
      if (rank >= 3 && !lost){                                          // ореол
        const gr = g.createRadialGradient(px, py, 0, px, py, lock ? 26 : 18); gr.addColorStop(0, col + (lock ? "88" : "55")); gr.addColorStop(1, col + "00");
        g.fillStyle = gr; g.beginPath(); g.arc(px, py, lock ? 26 : 18, 0, 7); g.fill();
      }
      if (c.hasV && rank >= 3 && !lost){                                // вектор швидкості (≈ 25 с)
        const [qx, qy] = scr(X + c.vx * 25, Y + c.vy * 25);
        g.strokeStyle = col; g.lineWidth = 1.3; g.beginPath(); g.moveTo(px, py); g.lineTo(qx, qy); g.stroke();
      }
      g.lineWidth = 1.6; g.strokeStyle = col; g.fillStyle = col;
      if (lost){ g.setLineDash([2, 3]); g.beginPath(); g.arc(px, py, 5, 0, 7); g.stroke(); g.setLineDash([]); }
      else if (rank === 1){ g.beginPath(); g.arc(px, py, 2.6, 0, 7); g.stroke(); }
      else if (rank === 2){ g.beginPath(); g.arc(px, py, 3, 0, 7); g.fill(); g.beginPath(); g.arc(px, py, 6.5, 0, 7); g.stroke(); }
      else {
        const r = lock ? 6.5 : 5.2;
        g.beginPath(); g.moveTo(px, py - r); g.lineTo(px + r, py); g.lineTo(px, py + r); g.lineTo(px - r, py); g.closePath(); g.fill();
        g.strokeStyle = "#0e1116"; g.lineWidth = 1; g.stroke();
        if (lock){
          const b = 11 + pulse * 2.5, l = 4.5; g.strokeStyle = col; g.lineWidth = 1.8;
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){ g.beginPath(); g.moveTo(px + sx * b, py + sy * (b - l)); g.lineTo(px + sx * b, py + sy * b); g.lineTo(px + sx * (b - l), py + sy * b); g.stroke(); }
          g.globalAlpha = fade * (1 - pulse) * 0.8; g.lineWidth = 1.3; g.beginPath(); g.arc(px, py, 9 + pulse * 12, 0, 7); g.stroke();
          locks.push({ c, px, py, col });
        }
      }
      g.globalAlpha = 1;
    }
    if (V.on.link && locks.length){                                     // лінії РЛС → захоплена ціль
      g.lineWidth = 1; g.setLineDash([5, 6]); g.lineDashOffset = flow;
      for (const L of locks){
        for (const id in L.c.src){
          const s = L.c.src[id]; if (tn - s.t > s.ttl) continue;
          const m = RAD.meta.get(id); if (!m || m.side !== sd) continue;
          const [sx, sy] = fxXY(v, m.c);
          g.globalAlpha = 0.16 + 0.25 * Math.min(1, s.conf); g.strokeStyle = L.col;
          g.beginPath(); g.moveTo(sx, sy); g.lineTo(L.px, L.py); g.stroke();
        }
      }
      g.setLineDash([]); g.lineDashOffset = 0; g.globalAlpha = 1;
    }
  }
  /* ракети, що ведуться мережею РЛС/ДРЛО (етап 7.71): штрихова лінія від станції, що веде ціль, до ракети */
  const AC = window.BV_ACG;
  if (V.on.link && AC && AC.ms && AC.ms.length){
    g.lineWidth = 1.2; g.setLineDash([2, 5]); g.lineDashOffset = -flow;
    for (const m of AC.ms){
      if (m.dead || !m.cued || !m.pos || !ewMine(m.side) || !m.src) continue;
      let s0; try { s0 = m.src(); } catch (e) { continue; } if (!s0 || !s0.link || !(s0.q > 0)) continue;
      const ref = String(m.tgt), id = ref.slice(1), ks = ref[0] === "f" ? ["a" + id, "ad" + id] : [id, "c" + id];
      let c = null; for (const k of ks){ const x = RAD.lock.get(m.side + ":" + k); if (x && (!c || x.conf > c.conf)) c = x; }
      if (!c) continue;
      let best = null, bt = -1; for (const sid in c.src){ const s = c.src[sid]; if (s.t > bt && tn - s.t <= s.ttl && RAD.meta.get(sid)) { bt = s.t; best = sid; } }
      if (!best) continue;
      const [sx, sy] = fxXY(v, RAD.meta.get(best).c), [mx, my] = fxXY(v, m.pos);
      g.globalAlpha = 0.5; g.strokeStyle = m.side === "ua" ? "#22c3e6" : "#ff6b6b";
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(mx, my); g.stroke();
      g.globalAlpha = 0.9; g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(mx, my, 2.6, 0, 7); g.fill();
    }
    g.setLineDash([]); g.lineDashOffset = 0; g.globalAlpha = 1;
  }
}
'''
EDITS = [
  ("    g.globalAlpha = 1;\n  }\n}\nfunction radarRender(now){",
   "    g.globalAlpha = 1;\n  }\n  if (V.on.pic && !fogSide()) radpicDraw(g, v, W, H, sim, acc, now);      // radpic:v1\n}\n" + PIC + "function radarRender(now){"),
  ("{ body: true, ant: true, scan: true, hits: true }", "{ body: true, ant: true, scan: true, hits: true, pic: true, link: true }"),
  ('hits: "Контакти" }', 'hits: "Імпульси", pic: "Цілі", link: "Лінії" }'),
  ("for (const c of (fogSide() ? [] : sim.pic[sd].air)){", "for (const c of (fogSide() || RADVIS.on.pic ? [] : sim.pic[sd].air)){"),
]
def patch(t, name):
    if MARK in t: print(name, ": вже застосовано"); return t
    if "radvis:v1" not in t: sys.exit(name + ": спершу tools/apply_radar_layers.py")
    for old, new in EDITS:
        n = t.count(old)
        if n != 1: sys.exit(f"{name}: очікувався 1 збіг, знайдено {n}: {old[:70]!r}")
        t = t.replace(old, new)
    print(name, ": OK"); return t
def rw(path, fn):
    t = open(path, encoding="utf8").read(); n = fn(t)
    if n != t: open(path, "w", encoding="utf8").write(n)
rw("src/js/03_game.js", lambda t: patch(t, "src/js/03_game.js"))
rw("dist/skydominion.html", lambda t: patch(t, "dist (гра)"))
