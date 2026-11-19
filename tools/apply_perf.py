# Етап 7.61: оптимізація рушія й фізика перехоплення. Накладає точкові правки на src/js/03_game.js і dist (ідемпотентно, із перевіркою числа збігів).
# python3 tools/apply_perf.py
import os, re, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TARGETS = ['src/js/03_game.js', 'dist/skydominion.html']
MARK = 'perf:v1'
P = []
def p(old, new, n=1): P.append((old, new, n))

# 1. знімок юнітів без Array.from на кожен кадр
p('const queue = [];\n', 'const queue = [];\n/* perf:v1 — повторно використовуваний знімок юнітів (без нового масиву на кожен кадр); лише для циклу кроку симуляції, не вкладати */\nconst _snapBuf = [];\nfunction unitsSnap(){ _snapBuf.length = 0; for (const u of units.values()) _snapBuf.push(u); return _snapBuf; }\n')
p('for (const u of Array.from(units.values())) if (units.has(u.id)) stepUnit(u, sd);', 'for (const u of unitsSnap()) if (units.has(u.id)) stepUnit(u, sd);', 3)

# 2. spriteBase з кешем
p('function spriteBase(img){ const k = img.replace(/-l$/, ""), s = SPRITES[k], c = SPR_CONT[k]; return c ? c / 2 : s ? Math.max(s.w, s.h) / 2 : 80; }',
  'const _sbCache = Object.create(null);\nfunction spriteBase(img){ let r = _sbCache[img]; if (r !== undefined) return r; const k = img.replace(/-l$/, ""), s = SPRITES[k], c = SPR_CONT[k]; return _sbCache[img] = c ? c / 2 : s ? Math.max(s.w, s.h) / 2 : 80; }')

# 3. головний цикл: підкроки при великому масштабі часу + пропуск перемальовування на паузі + адаптивна частота
p('''    } else if (!SIM.paused){
      const sd = dt * SIM.scale;
      SIM.t += sd;
      while (queue.length && queue[0].t <= SIM.t) queue.shift().fn();
      for (const u of unitsSnap()) if (units.has(u.id)) stepUnit(u, sd);
      HOOKS.step && HOOKS.step(sd);
      HOOKS.gameStep && HOOKS.gameStep(sd); ewTick(sd);
    }
    const active = units.size > 0;
    if (active || shownUnits){
      if (mapReady && now - lastRender > 33 && map.getSource("units")){ lastRender = now; renderUnits(); }
    }''',
'''    } else if (!SIM.paused){
      /* perf:v1 — при великому масштабі часу крок ділиться на підкроки ≤ 0,25 с: ракети не «перестрибують» ціль, ППО й РЛС отримують чесний темп */
      const sdAll = dt * SIM.scale, nSub = Math.min(8, Math.max(1, Math.ceil(sdAll / 0.25))), sd = sdAll / nSub;
      for (let k = 0; k < nSub; k++){
        SIM.t += sd;
        while (queue.length && queue[0].t <= SIM.t) queue.shift().fn();
        for (const u of unitsSnap()) if (units.has(u.id)) stepUnit(u, sd);
        HOOKS.step && HOOKS.step(sd);
        HOOKS.gameStep && HOOKS.gameStep(sd); ewTick(sd);
        if (HOOKS.puppet && HOOKS.puppet()) break;
      }
      pausedDrawn = false;
    }
    const active = units.size > 0;
    if (active || shownUnits){
      const usrc = mapReady && map.getSource("units");
      /* на паузі стан не змінюється — перемальовуємо лише раз (і після зміни кількості юнітів / джерела мапи) */
      const still = SIM.paused && pausedDrawn && pausedN === units.size && pausedSrc === usrc;
      if (usrc && !still && now - lastRender > (units.size > 250 ? 55 : 33)){ lastRender = now; renderUnits(); if (SIM.paused){ pausedDrawn = true; pausedN = units.size; pausedSrc = usrc; } }
    }''')
p('  let last = performance.now(), lastRender = 0, lastLpTick = 0;', '  let last = performance.now(), lastRender = 0, lastLpTick = 0, pausedDrawn = false, pausedN = -1, pausedSrc = null;      // perf:v1')

# 4. adPick: дешевий відсів за прямокутником, без filter() і зайвих викликів
i = open('src/js/03_game.js', encoding='utf8').read()
a = i.index('function adPick(u, T, shotsBy, R, okFn){'); b = i.index('/* ======', a)
OLD_PICK = i[a:b].rstrip('\n') + '\n'
if 'perf:v1' in OLD_PICK: OLD_PICK = None
NEW_PICK = '''function adPick(u, T, shotsBy, R, okFn){      // perf:v1: дешевий відсів за прямокутником до haversine; без filter() у гарячому циклі
  let best = null, bs = Infinity, bestP = null, bps = Infinity;
  if (u.mode === "manual" && u.manual && !units.has(u.manual)) u.manual = null;
  const rr = R || T.r, up = u.pos, kx = 111.32 * Math.cos(up[1] * D2R) || 1e-6, ky = 110.574, lim = rr * 1.15 + 1, manual = u.mode === "manual";
  for (const t of units.values()){
    if (t.kind !== "w" || t.fall) continue;
    const tp = t.pos, dx = (tp[0] - up[0]) * kx, dy = (tp[1] - up[1]) * ky;
    if (dx > lim || dx < -lim || dy > lim || dy < -lim) continue;
    if (!adFoe(u, t, T)) continue;
    const cls = adCls(t), pk = T.p[AD_CI[cls]];
    if (!(pk > 0)) continue;
    if (manual && t.id !== u.manual) continue;
    if (adSkipT(u, t)) continue;      // етап 7.31
    const d = hav(up, tp); if (d > rr) continue;
    if (okFn && !okFn(t, d)) continue;
    if (HOOKS.adSkip && HOOKS.adSkip(u, T, t)) continue;      // етап 7.5: економна ППО бота
    let others = 0;
    if (!T.gun){
      const list = shotsBy.get(t.id);
      if (list){ let mine = 0; for (let k = 0; k < list.length; k++){ if (list[k] === u.id) mine++; else others++; } if (mine >= (cls === "ballistic" || cls === "hyper" || cls === "icbm" ? 2 : 1)) continue; }
    }
    const score = d + others * 40;
    if (score < bs){ bs = score; best = t; }
    if (u.mode === "priority" && cls === u.prio && score < bps){ bps = score; bestP = t; }
  }
  return u.mode === "priority" && bestP ? bestP : best;
}
'''
if OLD_PICK: p(OLD_PICK, NEW_PICK)

# 5. фізика перехоплення: вигорання двигуна, втрата швидкості й маневровості, спад Pk за дальністю польоту
p('''    s.v = Math.min(s.vmax, s.v + s.vmax * 1.6 * sd);
    const step = s.v * sd, d = hav(s.pos, t.pos);
    if (d <= step + 0.35){
      s.pos = t.pos.slice();
      if (Math.random() * 100 < s.p){ endShot(s, "hit"); targetHit(t, ADS.units.get(s.from)); }''',
'''    /* perf:v1 — енергетика ракети: розгін → маршовий політ → після вигорання (PHYS.burn частки макс. шляху) швидкість і маневровість падають */
    const fr = s.fl / s.max;
    if (!s.drone && fr > PHYS.burn) s.v = Math.max(s.vmax * PHYS.vmin, s.v - s.vmax * PHYS.decay * sd);
    else s.v = Math.min(s.vmax, s.v + s.vmax * 1.6 * sd);
    const step = s.v * sd, d = hav(s.pos, t.pos);
    if (d <= step + 0.35){
      s.pos = t.pos.slice();
      const pkEff = s.drone ? s.p : s.p * (1 - PHYS.pkEdge * Math.max(0, Math.min(1, (fr - PHYS.pkFrom) / (1 - PHYS.pkFrom))));      // чим далі політ — тим нижча ймовірність влучання
      if (Math.random() * 100 < pkEff){ endShot(s, "hit"); targetHit(t, ADS.units.get(s.from)); }''')
p('''    const dh = ((brg(s.pos, aim) - s.hdg + 540) % 360) - 180, mt = (d < 6 ? 900 : 240) * sd;''',
  '''    const dh = ((brg(s.pos, aim) - s.hdg + 540) % 360) - 180, mt = (d < 6 ? 900 : 240) * sd * (s.drone ? 1 : 0.45 + 0.55 * Math.min(1, s.v / s.vmax));      // perf:v1: повільна ракета гірше маневрує''')
p('function stepShots(sd){', '/* perf:v1 — параметри фізики перехоплення (баланс): burn — частка шляху до вигорання, vmin — мін. швидкість після нього (частка vmax), decay — спад швидкості (vmax/с), pkEdge — втрата Pk на краю дальності */\nconst PHYS = { burn: 0.55, vmin: 0.5, decay: 0.35, pkFrom: 0.5, pkEdge: 0.35 };\nwindow.BV_PHYS = PHYS;\nfunction stepShots(sd){')

def apply(path):
    s = open(path, encoding='utf8').read(); n0 = s.count(MARK)
    if n0: print(path, 'вже застосовано'); return
    for old, new, n in P:
        c = s.count(old)
        if c != n: sys.exit(f'{path}: очікувалось {n} збігів, є {c}:\n{old[:120]!r}')
        s = s.replace(old, new)
    open(path, 'w', encoding='utf8').write(s); print(path, 'OK', len(P), 'правок')
for t in TARGETS: apply(t)
