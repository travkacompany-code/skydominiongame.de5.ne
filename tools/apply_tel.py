# Мобільні ПУ балістики (етап 7.66, «BANGVECTOR 2 · етап 2»): вшиває src/js/02g_tel.js + tools/tel_glue.js і точкові правки
# в src/js/03_game.js, src/js/02c_radar.js, src/index.html та dist/skydominion.html (ідемпотентно).
#   python3 tools/apply_tel.py
# Кожен якір має зустрічатися рівно 1 раз, інакше — помилка й жоден файл не змінюється.
import re, os, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
rd = lambda p: open(p, encoding='utf8').read()
wr = lambda p, s: open(p, 'w', encoding='utf8').write(s)

GLUE = rd('tools/tel_glue.js').rstrip() + '\n'
MARK = '/* tel:v1 */'
GLUE_END = 'window.BV_TEL_API = {'
P = []
def p(old, new): P.append((old, new))

# --- планування пуску: дальність — від справжньої позиції ПУ (а не від центру рубежу + його радіус)
p('if (siteDead(s) && !(C && C.kind === "air" && (s.t === "tac" || s.t === "ua_tac"))){ res.msg = deadMsg(s); return res; }',
  'if (siteDead(s) && !telGated(side, key) && !(C && C.kind === "air" && (s.t === "tac" || s.t === "ua_tac"))){ res.msg = deadMsg(s); return res; }      // 7.66: ПУ не залежить від рубежу')
p('} else if (!C){\n      const pool = c.pointMode === "random" ? groundPool(side, key) : [s];',
  '} else if (!C && telGated(side, key)){      // етап 7.66: пуск лише з мобільної ПУ, дальність — від її справжньої позиції\n'
  '      const tp = telPlan(side, key, c, L); res.cands = tp.cands; res.tcap = tp.cap; minNeed = tp.minNeed;\n'
  '      if (tp.msg){ res.msg = tp.msg; return res; }\n'
  '    } else if (!C){\n      const pool = c.pointMode === "random" ? groundPool(side, key) : [s];')
p('const list = plan.cands.length ? plan.cands.map(c => c.site) : [];',
  'const list = plan.cands.length ? plan.cands.map(c => c.tel ? { c: c.pt } : c.site) : [];      // 7.66: маршрут від позиції ПУ')
p('} else if (!plan.C){\n        const pool = groundPool(plan.side, LP.weapon), n = LP.target ? plan.cands.length : pool.length;',
  '} else if (!plan.C && telGated(plan.side, LP.weapon)){\n        pt.innerHTML = telPointHtml(plan, LP.weapon, !!LP.target);      // етап 7.66\n'
  '      } else if (!plan.C){\n        const pool = groundPool(plan.side, LP.weapon), n = LP.target ? plan.cands.length : pool.length;')
# --- сам пуск
p('const W = plan.W, key = c.weapon, n = Math.max(1, Math.min(999, c.count | 0));\n    HOOKS.onLaunch && HOOKS.onLaunch(plan.side, key, n);',
  'const W = plan.W, key = c.weapon, TELG = telGated(plan.side, key), n = TELG && plan.tcap > 0 ? Math.max(1, Math.min(999, c.count | 0, plan.tcap)) : Math.max(1, Math.min(999, c.count | 0));      // 7.66: не більше, ніж на готових ПУ\n'
  '    HOOKS.onLaunch && HOOKS.onLaunch(plan.side, key, n);')
p('          const pos = W.edge ? edgePt(c.site, zoneR(c.site), cfg.target) : PLk === "stn" ? randInOwn(c.site, Math.min(3, zoneR(c.site) * 0.25)) : randInOwn(c.site, zoneR(c.site));\n          spawnWeapon(key, cfg.variant, pos, cfg.targetFor(), cfg.mode, cfg.wps, { from: pf + c.site.n, target: cfg.targetName });',
  '          if (TELG){      // етап 7.66: ракета йде з мобільної ПУ й списується з її боєкомплекту\n'
  '            const tl = telTake(cands, c.tel, key); if (!tl){ telRefund(plan.side, key); return; }\n'
  '            telFired(tl, spawnWeapon(key, cfg.variant, telMuzzle(tl), cfg.targetFor(), cfg.mode, cfg.wps, { from: telFrom(tl), target: cfg.targetName }));\n'
  '            return;\n          }\n'
  '          const pos = W.edge ? edgePt(c.site, zoneR(c.site), cfg.target) : PLk === "stn" ? randInOwn(c.site, Math.min(3, zoneR(c.site) * 0.25)) : randInOwn(c.site, zoneR(c.site));\n'
  '          spawnWeapon(key, cfg.variant, pos, cfg.targetFor(), cfg.mode, cfg.wps, { from: pf + c.site.n, target: cfg.targetName });')
# --- політ: поступовий розгін і набір висоти
p('  if (W.child || W.glide) u.dive = true;          // бойовий блок МБР',
  '  if (W.cls === "ballistic" && !W.child && !W.glide && TEL.on && window.BV_TEL) u.tl = window.BV_TEL.flightId(key, W.km, W.ad);      // етап 7.66: розгін → набір висоти → політ → зниження\n'
  '  if (W.child || W.glide) u.dive = true;          // бойовий блок МБР')
p('  u.s += u.spd * sd * windK(u);      // flight:v1', '  u.s += u.spd * sd * windK(u) * (u.tl ? telSpdK(u) : 1);      // flight:v1 · 7.66: профіль швидкості балістики (середній час польоту не змінюється)')
p('(W.mirv ? `<br>Дочірні цілі: ${W.mirv} · розкид ≈ ${mirvR(W)} км` : "")', '(u.tl ? telFlightHtml(u) : "") + (W.mirv ? `<br>Дочірні цілі: ${W.mirv} · розкид ≈ ${mirvR(W)} км` : "")')
# --- удар ракети по ПУ
p('  if (RAD && RAD.sim && RAD.sim.stations.length) radarStrike(u, sd);\n  let best = null, bd = Infinity;',
  '  if (RAD && RAD.sim && RAD.sim.stations.length) radarStrike(u, sd);\n  telStrike(u, sd);      // етап 7.66: ураження мобільних ПУ\n  let best = null, bd = Infinity;')
# --- життєвий цикл (разом з РЕБ/РЛС/туманом)
p('function ewReset(){ fogReset(); radarReset();', 'function ewReset(){ telReset(); fogReset(); radarReset();')
p('ewReset(); radarStart(); fogStart();', 'ewReset(); radarStart(); fogStart(); telStart();')
p('radarTick(sd); fogTick(sd);', 'radarTick(sd); fogTick(sd); telTick(sd);')
p('function ewRender(now){\n  radarRender(now);', 'function ewRender(now){\n  telRender(now);\n  radarRender(now);')
# --- РЛС: висота ракети задає радіогоризонт (клас цілі для злиття треків не змінюється)
p('function radLos(sx, sy, tx, ty, alt){\n  const d = Math.hypot(tx - sx, ty - sy), ht = RAD_HT[alt] != null ? RAD_HT[alt] : 1000,',
  'function radLos(sx, sy, tx, ty, alt, tg){\n  const d = Math.hypot(tx - sx, ty - sy), ht = tg && tg.hm > 0 ? tg.hm : RAD_HT[alt] != null ? RAD_HT[alt] : 1000,')
p('tg.push({ id: u.id, side: u.sd || "ru", x: q.x, y: q.y, cat: m.cat, alt: m.alt });', 'tg.push({ id: u.id, side: u.sd || "ru", x: q.x, y: q.y, cat: m.cat, alt: m.alt, hm: typeof telHm === "function" ? telHm(u) : 0 });      // 7.66: фактична висота балістики')
# --- боти: ціль лише в межах дальності готових ПУ
p('  for (let tries = 0; tries < 8; tries++){\n    const o = botTarget(sd, key, reach); if (!o) return false;',
  '  if (telGated(sd, key)) reach = telReach(sd, key);      // етап 7.66: дальність — від справжніх позицій готових ПУ\n'
  '  for (let tries = 0; tries < 8; tries++){\n    const o = botTarget(sd, key, reach); if (!o) return false;')
# --- мережа
p('function hostCmd(E, k, p){\n  const sd = E.side, deny = msg => nsend(E.c, { t: "toast", msg });\n',
  'function hostCmd(E, k, p){\n  const sd = E.side, deny = msg => nsend(E.c, { t: "toast", msg });\n  if (k === "tel"){ telCmd(sd, p, deny); return; }      // етап 7.66: команди гостя щодо ПУ\n')
p('  if (rs){ m.F = fogContacts(rs).map(fogWire); m.fs = rs; }      // етап 7.60: картина сторони-одержувача',
  '  if (rs){ m.F = fogContacts(rs).map(fogWire); m.fs = rs; }      // етап 7.60: картина сторони-одержувача\n'
  '  m.T = telWire(rs); m.Td = rs && TEL.sim ? TEL.sim.depot[rs] : 0;      // етап 7.66: ПУ — лише те, що бачить сторона')
p('  if (m.F) FOG.guest = { side: m.fs, list: m.F }; else FOG.guest = { side: null, list: [] };      // етап 7.60',
  '  if (m.F) FOG.guest = { side: m.fs, list: m.F }; else FOG.guest = { side: null, list: [] };      // етап 7.60\n'
  '  TEL.guest = Array.isArray(m.T) ? m.T.map(telUnwire) : []; TEL.depotG = m.Td || null; TEL.dirty = true;      // етап 7.66')
# --- кліки по мапі під час вибору місця ПУ
p('if (EW.pick || RAD.pick) return true;', 'if (EW.pick || RAD.pick || TEL.pick) return true;')
p('HOOKS.escape = () => { if (AP.pick || EW.pick || RAD.pick){', 'HOOKS.escape = () => { if (TEL.pick){ telPickStop(); return true; } if (AP.pick || EW.pick || RAD.pick){')

def patch(text, label):
    glue_re = re.compile(re.escape(MARK) + r'.*?' + re.escape(GLUE_END) + r'[^\n]*\n', re.S)
    if MARK in text:                       # вже вшито — лише оновлюємо клей
        new = glue_re.sub(lambda m: GLUE, text, count=1)
        print(label, 'клей оновлено' if new != text else 'вже застосовано'); return new
    miss = []
    for i, (o, n) in enumerate(P):
        c = text.count(o)
        if c != 1: miss.append((i, c, o[:80].replace('\n', '⏎')))
    anchor = re.search(r'window\.BV_FOG_API = \{[^\n]*\};\n', text)
    if not anchor: miss.append(('fog-api', 0, 'window.BV_FOG_API'))
    if miss: print(label, 'MISS', miss); sys.exit(1)
    for o, n in P: text = text.replace(o, n)
    a = re.search(r'window\.BV_FOG_API = \{[^\n]*\};\n', text)
    text = text[:a.end()] + GLUE + text[a.end():]
    print(label, 'ok'); return text

def patch_radar(text, label):
    o = 'env.los(st.x, st.y, t.x, t.y, alt)'; n = 'env.los(st.x, st.y, t.x, t.y, alt, t)'
    if text.count(n) == 2 and o + ',' not in text: return text
    if text.count(o) != 2: print(label, 'MISS los', text.count(o)); sys.exit(1)
    return text.replace(o, n)

pat = re.compile(r'(<script[^>]*>)(.*?)(</script>)', re.S)
# --- перевірка всіх цілей до запису
g = rd('src/js/03_game.js'); g2 = patch(g, 'src/js/03_game.js')
r = rd('src/js/02c_radar.js'); r2 = patch_radar(r, 'src/js/02c_radar.js')
dist = 'dist/skydominion.html'; d = rd(dist)
ms = list(pat.finditer(d)); main = max(ms, key=lambda m: len(m.group(2)))
dm2 = patch(main.group(2), 'dist main')
d2 = d[:main.start(2)] + dm2 + d[main.end(2):]
rad = [m for m in pat.finditer(d2) if 'id="bvRadar"' in m.group(1)][0]
d2 = d2[:rad.start(2)] + patch_radar(rad.group(2), 'dist bvRadar') + d2[rad.end(2):]
MOD = '\n<script id="bvTel">' + rd('src/js/02g_tel.js') + '</script>'
if 'id="bvTel"' in d2:
    m = [m for m in pat.finditer(d2) if 'id="bvTel"' in m.group(1)][0]
    d2 = d2[:m.start(2)] + rd('src/js/02g_tel.js') + d2[m.end(2):]
else:
    fog = [m for m in pat.finditer(d2) if 'id="bvFog"' in m.group(1)][0]
    d2 = d2[:fog.end()] + MOD + d2[fog.end():]
CSS = rd('src/css/160_tel.css')
sm = re.search(r'<style id="bv-tel">.*?</style>', d2, re.S)
if sm: d2 = d2[:sm.start()] + '<style id="bv-tel">' + CSS + '</style>' + d2[sm.end():]
else:
    u = re.search(r'<style id="bv-unify">.*?</style>', d2, re.S)
    d2 = d2[:u.end()] + '\n<style id="bv-tel">' + CSS + '</style>' + d2[u.end():]
h = rd('src/index.html'); h2 = h
if '02g_tel.js' not in h2 and '02e_fog.js' in h2:
    h2 = h2.replace('<script>@@F:js/02e_fog.js@@</script>\n', '<script>@@F:js/02e_fog.js@@</script>\n<script>@@F:js/02g_tel.js@@</script>\n')
for f, a, b in [('src/js/03_game.js', g, g2), ('src/js/02c_radar.js', r, r2), (dist, d, d2), ('src/index.html', h, h2)]:
    if a != b: wr(f, b); print('записано', f)
print('done')
