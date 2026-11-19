# Етап 8: Saab 340 AEW&C (ASC 890) — вшиває src/js/02j_aew.js, tools/aew_glue.js і точкові правки
# у src (03_game.js, 02c_radar.js, index.html) та dist/skydominion.html. Ідемпотентно.
#   python3 tools/apply_aew.py
# Кожен якір має зустрічатися рівно 1 раз; інакше — помилка, і жоден файл не змінюється.
import base64, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
rd = lambda p: open(p, encoding='utf-8').read()
wr = lambda p, s: open(p, 'w', encoding='utf-8').write(s)
GLUE = rd('tools/aew_glue.js').rstrip('\n') + '\n'
MOD = rd('src/js/02j_aew.js')
IMG = base64.b64encode(open('assets/aew_saab340.webp', 'rb').read()).decode()
MARK = 'aew_saab340'

def once(s, a, b, what):
    n = s.count(a)
    if n != 1:
        sys.exit(f'ПОМИЛКА: якір «{what}» знайдено {n} разів (очікувався 1) — файли не змінено')
    return s.replace(a, b)

ENTRY = ('  aew_saab340: { n: "Saab 340 AEW&C (ASC 890)", type: "Літак ДРЛО", side: "ua", air: true, aew: true, '
         'img: "aew", mag: 0, reload: 60, p: [0, 0, 0, 0, 0, 0], r: 0, spd: "Висока", man: "Низька", fly: "Середня", '
         'mobile: true, gun: false, sz: 30, ammo: "вильотів" },\n')
SPR = '  "aew": { "w": 240, "h": 240, "src": "{SRC}" },\n'

def patch_game(s, sprite_src):
    if MARK in s:
        return s, False
    s = once(s, 'function radarTick(sd){\n  if (!RAD.sim) return;',
             'function radarTick(sd){\n  if (aewLive() || aewWas()) aewSync();              // етап 8: ДРЛО (станція знімається після посадки)\n  if (!RAD.sim) return;', 'radarTick')
    s = once(s, '  return tg;\n}\nfunction radLaunches(sim){',
             '  aewTargets(tg);                                       // етап 8: повітряні цілі\n  return tg;\n}\nfunction radLaunches(sim){', 'radTargets')
    s = once(s, 'function radLos(sx, sy, tx, ty, alt, tg){', 'function radLos(sx, sy, tx, ty, alt, tg, st){', 'radLos sig')
    s = once(s, 'dh = 4.12 * (Math.sqrt(40) + Math.sqrt(ht));',
             'dh = 4.12 * (Math.sqrt(st && st.h > 0 ? st.h : 40) + Math.sqrt(ht));      // етап 8: висота антени ДРЛО', 'radLos dh')
    s = once(s, 'function airStep(u, T, sd, shotsBy){\n  if (u.state === "base") return;',
             'function airStep(u, T, sd, shotsBy){\n  if (T.aew) return aewStep(u, T, sd);                 // етап 8: ДРЛО — окремий автомат\n  if (u.state === "base") return;', 'airStep')
    s = once(s, '  const okFn = t => hav(t.pos, u.patrol) <= AIR.leash;',
             '  if (!at && u.mode !== "manual"){ const cu = aewCue(u, T); if (cu){ u.atk = cu.id; at = cu; u.engaged = cu.id; ADS.dirty = true; } }   // етап 8: наведення ДРЛО\n  const okFn = t => hav(t.pos, u.patrol) <= AIR.leash;', 'okFn')
    s = once(s, 'const planes = [...ADS.units.values()].filter(u => u.side === sd && AD_TYPES[u.key].air);',
             'const planes = [...ADS.units.values()].filter(u => u.side === sd && AD_TYPES[u.key].air && !AD_TYPES[u.key].aew);   // етап 8: ДРЛО бот не керує', 'planes')
    s = once(s, 'const AIR_END = { su27: 360,', 'const AIR_END = { aew_saab340: 600, su27: 360,', 'AIR_END')
    s = once(s, '  /* ---- етап 6: наземне ППО Росії', ENTRY + '  /* ---- етап 6: наземне ППО Росії', 'AD_TYPES')
    s = once(s, '        if (lo0){ nu.lo = lo0; nu.ld = {}; loadFill(nu, nu.mag); }',
             '        if (lo0){ nu.lo = lo0; nu.ld = {}; loadFill(nu, nu.mag); }\n        if (T.aew) nu.reserve = window.BV_AEW.sortiesAfterTakeoff(nu.reserve);      // етап 8: перший виліт — із запасу вильотів', 'takeoff')
    s = once(s, '    const cap = T.mag * AMMO_CAP;\n    if (a.ammo === "inf"',
             '    const cap = T.aew ? window.BV_AEW.CFG.maxSorties : T.mag * AMMO_CAP;      // етап 8: ДРЛО — ліміт вильотів\n    if (a.ammo === "inf"', 'cap')
    s = once(s, 'if (flying) rf.push({ type: "Feature", properties: { i: u.id, sel, sd, air: 1 }',
             'if (flying && !T.aew) rf.push({ type: "Feature", properties: { i: u.id, sel, sd, air: 1 }', 'sector')
    s = once(s, 'const chanceRows = (T, compact) => AD_CLASSES.map(',
             'const chanceRows = (T, compact) => T.aew ? "" : AD_CLASSES.map(', 'chance')
    s = once(s, 'if (!AP.aammoInf) AP.aammo = AD_TYPES[AP.akey].mag * 3;',
             'if (!AP.aammoInf) AP.aammo = AD_TYPES[AP.akey].aew ? 3 : AD_TYPES[AP.akey].mag * 3;', 'akey')
    s = once(s, 'const I18N_DICT = {', 'const I18N_DICT = {"Літак ДРЛО":["Самолёт ДРЛО","AEW&C aircraft"],', 'i18n')
    s = once(s, '  "su27": { "w": 200, "h": 199, "src": ', SPR.replace('{SRC}', sprite_src) + '  "su27": { "w": 200, "h": 199, "src": ', 'sprite su27')
    s = once(s, '  ua: { patriot: 3,', '  ua: { aew_saab340: 1, patriot: 3,', 'AD_STOCK ua')      # склад: один ДРЛО на бій
    s = once(s, 'setTimeout(radarPanel, 1600);\n', 'setTimeout(radarPanel, 1600);\n' + GLUE, 'вставка клея ДРЛО')
    return s, True

changed = []

g = rd('src/js/03_game.js')
g2, ch = patch_game(g, '@@A:aew_saab340.webp@@')
if ch:
    wr('src/js/03_game.js', g2); changed.append('src/js/03_game.js')

r = rd('src/js/02c_radar.js')
if r.count('env.los(st.x, st.y, t.x, t.y, alt, t)') == 2:
    wr('src/js/02c_radar.js', r.replace('env.los(st.x, st.y, t.x, t.y, alt, t)', 'env.los(st.x, st.y, t.x, t.y, alt, t, st)'))
    changed.append('src/js/02c_radar.js')

h = rd('src/index.html')
if '02j_aew.js' not in h:
    wr('src/index.html', once(h, '<script>@@F:js/02c_radar.js@@</script>\n',
       '<script>@@F:js/02c_radar.js@@</script>\n<script>@@F:js/02j_aew.js@@</script>\n', 'index.html 02c'))
    changed.append('src/index.html')

if os.path.exists('dist/skydominion.html'):
    d = rd('dist/skydominion.html')
    d2, ch = patch_game(d, 'data:image/webp;base64,' + IMG)
    if ch:
        d2 = d2.replace('env.los(st.x, st.y, t.x, t.y, alt, t)', 'env.los(st.x, st.y, t.x, t.y, alt, t, st)')
        if '<script id="bvAew">' not in d2:
            d2 = once(d2, '<script id="bvBoom">', '<script id="bvAew">' + MOD + '</script>\n<script id="bvBoom">', 'dist bvBoom')
        wr('dist/skydominion.html', d2); changed.append('dist/skydominion.html')

print('змінено:', ', '.join(changed) if changed else 'нічого (вже застосовано)')
