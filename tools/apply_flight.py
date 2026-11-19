# Етап 7.62: льотна модель дронів і авіації — вітер, радіогоризонт РЛС, інерція швидкості, пальне/бінго.
# python3 tools/apply_flight.py  (src/js/03_game.js, src/js/02c_radar.js, tools/radar_glue.js, dist) — ідемпотентно, перевіряє число збігів.
import os, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MARK = 'flight:v1'
FILES = {}
def p(files, old, new, n=1):
    for f in files: FILES.setdefault(f, []).append((old, new, n))
GAME = ['src/js/03_game.js', 'dist/skydominion.html']
RADJS = ['src/js/02c_radar.js', 'dist/skydominion.html']
GLUE = ['tools/radar_glue.js']

# ---------- 1. вітер: наземна швидкість дрона = повітряна + складова вітру вздовж курсу
p(GAME, 'const queue = [];\n', '''const queue = [];
/* flight:v1 — ВІТЕР. dir — звідки дме (°), ms — м/с (повільно змінюється + пориви). Наземна швидкість поршневих/малих дронів = повітряна + складова вітру вздовж курсу
   (Шахед 51 м/с, вітер 9 м/с → ±17 % часу польоту); швидкі й реактивні — майже не відчувають. Керування з консолі: BV_WIND.on = false; BV_WIND.base = 8 */
const WINDX = { on: true, base: 3 + Math.random() * 6, dir: 235 + Math.random() * 50, ms: 0, wx: 0, wy: 0, t: -1 };
window.BV_WIND = WINDX;
function windUpdate(){
  if (WINDX.t === SIM.t) return; WINDX.t = SIM.t;
  WINDX.ms = WINDX.base * (1 + 0.25 * Math.sin(SIM.t / 310) + 0.15 * Math.sin(SIM.t / 47 + 1.3));
  const a = (WINDX.dir + 180) * D2R; WINDX.wx = Math.sin(a) * WINDX.ms; WINDX.wy = Math.cos(a) * WINDX.ms;
}
function windK(u){
  if (!WINDX.on) return 1;
  let va = u.va;
  if (va === undefined){ const D = DSPEC[u.key], W = WEAPONS[u.key]; va = u.va = D && W && !W.child ? D.v / 3.6 : 0; }
  if (!va) return 1;
  windUpdate(); const h = u.hdg * D2R;
  return Math.max(0.7, Math.min(1.3, 1 + (WINDX.wx * Math.sin(h) + WINDX.wy * Math.cos(h)) / va));
}
''')
p(GAME, '  u.s += u.spd * sd;\n  if (u.mirv', '  u.s += u.spd * sd * windK(u);      // flight:v1\n  if (u.mirv')
p(GAME, 'function place(u){\n', 'function place(u, sd){      // flight:v1: згладжування курсу залежить від часу, а не від частоти кадрів\n')
p(GAME, 'u.hdg = (u.hdg + d * 0.35 + 360) % 360;', 'u.hdg = (u.hdg + d * (sd > 0 ? 1 - Math.exp(-sd / 0.04) : 0.35) + 360) % 360;')
p(GAME, '  place(u);\n}\nfunction impact(p, k, cls)', '  place(u, sd);\n}\nfunction impact(p, k, cls)')

# ---------- 2. радіогоризонт РЛС: низьколетючі цілі (дрони, крилаті) поза прямою видимістю не виявляються
p(GAME, '''const radBV = () => window.BV_RADAR;''', '''const radBV = () => window.BV_RADAR;
/* flight:v1 — радіогоризонт: d_h ≈ 4,12·(√h_РЛС + √h_цілі) км. Типова висота цілі за класом, м; антена ≈ 40 м. Повертає 0..1 (плавний спад у 15 % за горизонтом) */
const RAD_HT = { ground: 30, low: 120, mid: 6000, high: 25000 };
function radLos(sx, sy, tx, ty, alt){
  const d = Math.hypot(tx - sx, ty - sy), ht = RAD_HT[alt] != null ? RAD_HT[alt] : 1000, dh = 4.12 * (Math.sqrt(40) + Math.sqrt(ht));
  return d <= dh ? 1 : d >= dh * 1.15 ? 0 : 1 - (d - dh) / (dh * 0.15);
}''')
p(GAME + GLUE, 'BV.step(sim, dt, { targets: () => tg, jam:', 'BV.step(sim, dt, { targets: () => tg, los: radLos, jam:')
p(GLUE, 'const radBV = () => window.BV_RADAR;', '''const radBV = () => window.BV_RADAR;
/* flight:v1 — радіогоризонт (див. 03_game.js) */
const RAD_HT = { ground: 30, low: 120, mid: 6000, high: 25000 };
function radLos(sx, sy, tx, ty, alt){
  const d = Math.hypot(tx - sx, ty - sy), ht = RAD_HT[alt] != null ? RAD_HT[alt] : 1000, dh = 4.12 * (Math.sqrt(40) + Math.sqrt(ht));
  return d <= dh ? 1 : d >= dh * 1.15 ? 0 : 1 - (d - dh) / (dh * 0.15);
}''')
p(RADJS, 'altLosSens: { ground: 1, low: 0.8, mid: 0.3, high: 0 }', 'altLosSens: { ground: 1, low: 0.95, mid: 0.3, high: 0 }')

# ---------- 3. авіація: інерція швидкості (форсаж), пальне й «бінго»
p(GAME, 'function turnTo(u, want, sd, k){ const d = ((want - u.hdg + 540) % 360) - 180, mt = AIR.turn * airM(AD_TYPES[u.key]) * sd * (k || 1);',
  '''/* flight:v1 — ЛЬОТНА МОДЕЛЬ: швидкість має інерцію (розгін на форсаж / гальмування), на форсажі радіус розвороту більший, пальне спалюється (форсаж ×3,2), при «бінго» літак сам іде на аеродром.
   AIR_END — час польоту на крейсерській швидкості, с ігрового часу. Керування: BV_AIRX.flameout = false — літак без пального не гине, лише повертається */
const AIRX = { acc: 2.4, dec: 1.8, abBurn: 3.2, heliBurn: 1.4, reserve: 0.2, abTurn: 0.3, flameout: true };
window.BV_AIRX = AIRX;
const AIR_END = { su27: 360, mig29: 240, su30: 420, su35: 360, f16: 330, mirage: 250, mi24: 420, mi8: 520, mi28: 480, ka52: 480 };
const airEnd = u => AIR_END[u.key] || (AD_TYPES[u.key].heli ? 480 : 300);
function airSpeed(u, T, want, sd){
  let v = u.sp; if (!(v > 0)) v = AIR.cruise * airK(T);
  v = want > v ? Math.min(want, v + AIRX.acc * sd) : Math.max(want, v - AIRX.dec * sd);
  return u.sp = v;
}
function airTurnK(u, T){
  const c = AIR.cruise * airK(T), h = AIR.chase * airK(T);
  return 1 - AIRX.abTurn * (h > c ? Math.max(0, Math.min(1, ((u.sp || c) - c) / (h - c))) : 0);
}
/* повертає true, якщо пального лишилось лише на дорогу додому з резервом (бінго) */
function airFuelStep(u, T, sd){
  if (u.fuel === undefined) u.fuel = 1;
  const c = AIR.cruise * airK(T), ab = (u.sp || c) > c * 1.05, E = airEnd(u);
  u.fuel -= sd / E * (ab ? (T.heli ? AIRX.heliBurn : AIRX.abBurn) : 1);
  const hm = u.home || (nearestAirfield(u.side, u.pos) || {}).c;
  return u.fuel < AIRX.reserve + (hm ? hav(u.pos, hm) / c / E : 0) * 1.1;
}
function turnTo(u, want, sd, k){ const d = ((want - u.hdg + 540) % 360) - 180, mt = AIR.turn * airM(AD_TYPES[u.key]) * sd * (k || 1) * airTurnK(u, AD_TYPES[u.key]);''')
p(GAME, '''  ADS.dirty = true;
  if (u.state === "transit"){
    // етап 7.4:''', '''  ADS.dirty = true;
  { /* flight:v1 — пальне */
    const bingo = airFuelStep(u, T, sd);
    if (u.fuel <= 0 && AIRX.flameout){
      ADS.units.delete(u.id); ADS.dirty = true; HOOKS.adHint && HOOKS.adHint(u.side, `${T.n}: пальне вичерпано — літак втрачено`); return;
    }
    if (bingo && u.state !== "rtb"){
      HOOKS.adHint && HOOKS.adHint(u.side, `${T.n}: бінго — повертається на аеродром`);
      airRTB(u, u.mag > 0 || u.reserve > 0 ? "patrol" : "base"); return;
    }
  }
  if (u.state === "transit"){
    // етап 7.4:''')
p(GAME, 'st = AIR.chase * airK(T) * sd,', 'st = airSpeed(u, T, AIR.chase * airK(T), sd) * sd,', 2)
p(GAME, 'airFollow(u, AIR.cruise * airK(T), sd)', 'airFollow(u, airSpeed(u, T, AIR.cruise * airK(T), sd), sd)', 3)
p(GAME, 'const R = airOrbit(T), dp = hav(u.pos, u.patrol), st = AIR.cruise * airK(T) * sd;', 'const R = airOrbit(T), dp = hav(u.pos, u.patrol), st = airSpeed(u, T, AIR.cruise * airK(T), sd) * sd;')
p(GAME, '''      if (u.after === "patrol" && u.mag < capOf(u, T) && u.reserve > 0){ u.state = "reload"; u.rl = T.reload; }''',
  '''      u.sp = 0;
      if (u.after === "patrol" && ((u.mag < capOf(u, T) && u.reserve > 0) || (u.fuel !== undefined && u.fuel < 0.9))){ u.state = "reload"; u.rl = T.reload; }''')
p(GAME, '''      const take = Math.min(capOf(u, T) - u.mag, u.reserve); u.mag += take;''', '''      u.fuel = 1; u.sp = 0;      // flight:v1: заправка
      const take = Math.min(capOf(u, T) - u.mag, u.reserve); u.mag += take;''')
p(GAME, '      else u.state = "base";\n    }\n    return;\n  }\n  // патрулювання', '      else { u.state = "base"; u.fuel = 1; }\n    }\n    return;\n  }\n  // патрулювання')

def apply(path, patches):
    s = open(path, encoding='utf8').read()
    if MARK in s and path != 'dist/skydominion.html': print(path, 'вже застосовано'); return
    if path == 'dist/skydominion.html' and MARK in s: print(path, 'вже застосовано'); return
    for old, new, n in patches:
        c = s.count(old)
        if c != n: sys.exit(f'{path}: очікувалось {n}, є {c}: {old[:100]!r}')
        s = s.replace(old, new)
    open(path, 'w', encoding='utf8').write(s); print(path, 'OK', len(patches))
for f, ps in FILES.items(): apply(f, ps)
