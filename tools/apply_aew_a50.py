# Етап 8б: А-50У (Росія) — літак ДРЛО за тією ж логікою, що Saab 340 (apply_aew.py). Ідемпотентно:  python3 tools/apply_aew_a50.py
# Оновлює модуль 02j_aew.js у dist (bvAew), клей ДРЛО (типізовані дальність/коло/перезарядка/наведення), додає тип aew_a50,
# спрайт, ліміт пального й склад ППО Росії. Кожен якір має зустрітись рівно 1 раз — інакше файли не змінюються.
import re, os, sys, base64
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
rd = lambda p: open(p, encoding='utf8').read()
wr = lambda p, s: open(p, 'w', encoding='utf8').write(s)
MARK = 'aew_a50'
MOD = rd('src/js/02j_aew.js')
IMG = base64.b64encode(open('assets/aew_a50.webp', 'rb').read()).decode()

def once(s, a, b, what):
    n = s.count(a)
    if n != 1: sys.exit(f'ПОМИЛКА: якір «{what}» знайдено {n} разів (очікувався 1) — файли не змінено')
    return s.replace(a, b)

ENTRY = ('  aew_a50: { n: "А-50У (Шмель-М)", type: "Літак ДРЛО", side: "ru", air: true, aew: true, img: "aew_a50", mag: 0, reload: 90, '
         'p: [0, 0, 0, 0, 0, 0], r: 0, spd: "Середня", man: "Низька", fly: "Середня", mobile: true, gun: false, sz: 34, ammo: "вильотів" },\n')

def patch_game(s, src):
    if MARK in s: return s, False
    s = once(s, '  /* ---- етап 6: наземне ППО Росії', ENTRY + '  /* ---- етап 6: наземне ППО Росії', 'AD_TYPES')
    s = once(s, '  "aew": { "w": 240, "h": 240, "src": "', '  "aew_a50": { "w": 240, "h": 240, "src": "' + src + '" },\n  "aew": { "w": 240, "h": 240, "src": "', 'sprite')
    s = once(s, 'const AIR_END = { aew_saab340: 600,', 'const AIR_END = { aew_saab340: 600, aew_a50: 780,', 'AIR_END')
    s = once(s, '  ru: { s500: 1,', '  ru: { aew_a50: 1, s500: 1,', 'AD_STOCK ru')
    s = once(s, '  const C = window.BV_AEW.CFG;\n  if (u.state === "base") return;', '  const C = window.BV_AEW.CFG, A = window.BV_AEW;\n  if (u.state === "base") return;', 'aewStep A')
    s = once(s, 'const R = C.orbitKm, dp = hav(u.pos, u.patrol);', 'const R = A.tp(u.key, "orbitKm"), dp = hav(u.pos, u.patrol);', 'orbit')
    s = once(s, 'u.state = "reload"; u.rl = C.turnaround;', 'u.state = "reload"; u.rl = A.tp(u.key, "turnaround");', 'turnaround')
    s = once(s, 'h = A.height(u.state), R = A.rangeKm(h);', 'h = A.height(u.state, u.key), R = A.rangeKm(h, u.key);', 'height/range')
    s = once(s, 'type: A.RADAR.id,', 'type: A.radarFor(u.key).id,', 'radar type')
    s = once(s, 'if (hav(u.patrol, t.pos) > A.CFG.cueKm) continue;', 'if (hav(u.patrol, t.pos) > A.tp(u.key, "cueKm")) continue;', 'cueKm')
    return s, True

g = rd('src/js/03_game.js'); g2, ch = patch_game(g, '@@A:aew_a50.webp@@')
if ch: wr('src/js/03_game.js', g2)
dist = 'dist/skydominion.html'; d = rd(dist)
d2, ch2 = patch_game(d, 'data:image/webp;base64,' + IMG)
m = re.search(r'<script id="bvAew">.*?</script>', d2, re.S)
if not m: sys.exit('ПОМИЛКА: у dist немає <script id="bvAew">')
d2 = d2[:m.start()] + '<script id="bvAew">' + MOD + '</script>' + d2[m.end():]    # завжди оновлюємо модуль
if d2 != d: wr(dist, d2)
print('src:', 'змінено' if ch else 'вже застосовано', '| dist:', 'змінено' if d2 != d else 'без змін')
