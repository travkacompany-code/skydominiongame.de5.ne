# Туман війни (етап 7.60): вшиває tools/fog_glue.js і точкові правки в src/js/03_game.js та dist (ідемпотентно).
# python3 tools/apply_fog.py
import re, os, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GLUE = open('tools/fog_glue.js', encoding='utf8').read().rstrip() + """
window.BV_FOG_API = { sim: fogSim, side: fogSide, live: fogLive, tick: fogTick, airIndex: fogAirIndex, contacts: fogContacts, sprite: fogUnitSprite, adSprite: fogAdSprite, adSkip: fogAdSkip, targets: fogTargets, platforms: fogPlatforms, known: fogKnownThreat, shotOk: fogShotOk, wire: fogWire, unwire: fogUnwire, reset: fogReset, start: fogStart, FOG };
"""
P = []
def p(old, new): P.append((old, new))
# --- відмальовка
p('    const f = [];\n    shownUnits = units.size > 0;', '    const f = [], FOGS = fogSide();\n    shownUnits = units.size > 0;')
p('      let img = u.img, rot = (u.hdg - 45 + 360) % 360, so = null;\n      if (SIDEVIEW[u.img]){ rot = 0; if (u.hdg > 180 && u.hdg < 360) img = u.img + "-l"; }',
  '      let fv = null; if (FOGS && u.sd && u.sd !== FOGS){ fv = fogUnitSprite(FOGS, u); if (!fv) continue; }      // етап 7.60: туман війни\n      const uh = fv ? fv.hdg : u.hdg;\n      let img = u.img, rot = (uh - 45 + 360) % 360, so = null;\n      if (SIDEVIEW[u.img]){ rot = 0; if (uh > 180 && uh < 360) img = u.img + "-l"; }')
p('      let at = u.pos;\n      if (u.kind === "t" && HOOKS.vehPos){', '      let at = fv ? fv.pos : u.pos;\n      if (!fv && u.kind === "t" && HOOKS.vehPos){')
p('  function popHTML(u){\n    let html;', '  function popHTML(u){\n    if (fogSide() && u.sd && u.sd !== fogSide()){ const on0 = FOLLOW.id === u.id; return fogUnitPopHtml(u) + `<div class="pp-fl"><button class="chip${on0 ? " on" : ""}" data-follow="${u.id}">${on0 ? "■ Зупинити стеження" : "◎ Стежити камерою"}</button></div>`; }\n    let html;')
p('    const p = unitPos(u);\n', '    if (fogSide() && u.sd && u.sd !== fogSide() && !fogFollowPos(u)){ followStop(`${FOLLOW.name}: контакт втрачено`); return; }\n    const p = fogFollowPos(u) || unitPos(u);\n')
p('    for (const u of ADS.units.values()){\n      const T = AD_TYPES[u.key], sel = (AP.mode === "unit" && AP.unit === u.id) || (SEL.kind === "ad" && SEL.id === u.id) ? 1 : 0, sd = u.side || "ua";\n',
  '    const FOGS_ = fogSide();\n    for (let u of ADS.units.values()){\n      const T = AD_TYPES[u.key], sel = (AP.mode === "unit" && AP.unit === u.id) || (SEL.kind === "ad" && SEL.id === u.id) ? 1 : 0, sd = u.side || "ua";\n      if (FOGS_ && sd !== FOGS_){ const fvA = fogAdSprite(FOGS_, u); if (!fvA) continue; u = Object.assign({}, u, { pos: fvA.pos, hdg: fvA.hdg == null ? u.hdg : fvA.hdg, patrol: null, mTo: null, mPath: null }); }      // етап 7.60\n')
p('  for (const s of ADS.shots) drawTrail(s.trail, s.pos, s.sd === "ru");', '  for (const s of ADS.shots) if (fogShotOk(s)) drawTrail(s.trail, s.pos, s.sd === "ru");')
p('  for (const s of ADS.shots){\n    const [x, y] = fxXY(v, s.pos); if (!vis(x, y, 40)) continue;', '  for (const s of ADS.shots){\n    if (!fogShotOk(s)) continue;\n    const [x, y] = fxXY(v, s.pos); if (!vis(x, y, 40)) continue;')
p('  for (const r of ADS.rounds){\n    const k = Math.min(1, r.s / r.d)', '  for (const r of ADS.rounds){\n    if (!fogRoundOk(r)) continue;\n    const k = Math.min(1, r.s / r.d)')
p('  if (T.air) fxMuzzle(pos); else fxLaunch(pos, hdg);\n}', '  if (fogFxOk(u)){ if (T.air) fxMuzzle(pos); else fxLaunch(pos, hdg); }\n}')
p('  if (Math.random() < 0.5) fxMuzzle(a);', '  if (Math.random() < 0.5 && fogFxOk(u)) fxMuzzle(a);')
p('    if (em.unit && !units.has(em.unit.id)){ FX.emit.splice(i, 1); continue; }', '    if (em.unit && !units.has(em.unit.id)){ FX.emit.splice(i, 1); continue; }\n    if (em.unit && fogSide() && em.unit.sd && em.unit.sd !== fogSide() && !fogUnitSprite(fogSide(), em.unit)){ em.next = Math.max(em.next, now); continue; }      // етап 7.60: дим невидимої цілі')
# --- ППО й тривоги
p('const adSkipT = (u, t) => !!u.skip && u.mode !== "manual" && t.id !== u.atk && !!WEAPONS[t.key] && ((u.skip >> AD_CI[adCls(t)]) & 1) === 1;',
  'const adSkipT = (u, t) => (!!u.skip && u.mode !== "manual" && t.id !== u.atk && !!WEAPONS[t.key] && ((u.skip >> AD_CI[adCls(t)]) & 1) === 1) || (GAME.on && !!GAME.fog && fogLostCue(u, t));      // 7.60: втрачена цілевказання РЛС — ціль скидається')
p('    const tside = u.sd === "ru" ? "ua" : "ru";', '    const tside = u.sd === "ru" ? "ua" : "ru";\n    if (fogLive() && !fogKnownThreat(tside, u)) continue;      // етап 7.60: тривога лише за цілями, виявленими РЛС сторони, що обороняється')
p('function radarAdSkip(u, T, t){\n', 'function radarAdSkip(u, T, t){\n  if (fogLive()) return fogAdSkip(u, T, t);      // етап 7.60: ППО — лише за картиною РЛС, без винятків\n')
# --- РЛС / РЕБ / РЕР
p('function ewTick(sd){\n  radarTick(sd);', 'function ewTick(sd){\n  radarTick(sd); fogTick(sd);')
p('function ewReset(){ radarReset();', 'function ewReset(){ fogReset(); radarReset();')
p('function ewStart(){\n  ewReset(); radarStart();', 'function ewStart(){\n  ewReset(); radarStart(); fogStart();')
p('  const me = other(s.side); return ewMine(me) && s.seen[me] > SIM.t;\n}', '  const me = other(s.side); return ewMine(me) && (fogLive() ? fogStationVisible(me, "e" + s.id, 0) : s.seen[me] > SIM.t);\n}')
p('  const me = other(m.side); return ewMine(me) && m.seen[me] > SIM.t;\n}', '  const me = other(m.side); return ewMine(me) && (fogLive() ? fogStationVisible(me, "r" + m.id, 0) : m.seen[me] > SIM.t);\n}')
p('RAD.meta.set(st.id, { c: c.slice(),', 'RAD.meta.set(st.id, { id: st.id, c: c.slice(),')
p('if (!m || m.side !== foe || !(m.seen[sd] > SIM.t)) continue;', 'if (!m || m.side !== foe || !(m.seen[sd] > SIM.t || fogHasFix(sd, "r" + st.id))) continue;')
p('if (s.side !== foe || !s.alive || !(s.seen[sd] > SIM.t)) continue;', 'if (s.side !== foe || !s.alive || !(s.seen[sd] > SIM.t || fogHasFix(sd, "e" + s.id))) continue;')
p('        for (const c of sim.pic[sd].air){\n', '        for (const c of (fogSide() ? [] : sim.pic[sd].air)){      // 7.60: у тумані контакти малює полотно fogLayer\n')
p('      radvisInit(map);\n', '      radvisInit(map); fogvisInit(map);\n')
p('    tg.push({ id: u.id, side: u.sd || "ru", x: q.x, y: q.y, cat: m.cat, alt: m.alt });\n  }\n  return tg;',
  '    tg.push({ id: u.id, side: u.sd || "ru", x: q.x, y: q.y, cat: m.cat, alt: m.alt });\n  }\n'
  '  for (const u of units.values()){                                                 // етап 7.60: авіація-носії теж видимі РЛС\n    if (u.kind !== "c" || u.fall || !u.pos) continue;\n    const C = CARRIERS[u.key]; if (!C || C.kind !== "air") continue;\n    const q = radXY(u.pos); tg.push({ id: u.id, side: u.sd || "ru", x: q.x, y: q.y, cat: "bomber", alt: "mid" });\n  }\n'
  '  for (const a of ADS.units.values()){                                             // літаки й вертольоти ППО в повітрі\n    const T = AD_TYPES[a.key]; if (!T || !T.air || a.state === "base" || a.state === "reload" || !a.pos) continue;\n    const q = radXY(a.pos); tg.push({ id: "a" + a.id, side: a.side || "ua", x: q.x, y: q.y, cat: T.heli ? "heli" : "fighter", alt: T.heli ? "low" : "mid" });\n  }\n  return tg;')
p('data-ad="radneed">ППО потребує РЛС: ${RAD.need ? "так" : "ні"}</button></div>', 'data-ad="radneed">ППО потребує РЛС: ${RAD.need ? "так" : "ні"}</button><button class="chip ${fogLive() ? "on" : ""}" data-ad="radfog">Туман війни: ${fogLive() ? "так" : "ні"}</button></div>${fogStatsHtml(side)}')
p('      case "radneed": RAD.need = !RAD.need; return apRender();\n', '      case "radneed": RAD.need = !RAD.need; return apRender();\n      case "radfog":\n        if (!GAME.on){ toast("Туман війни діє лише в бою"); return; }\n        if (GAME.puppet || GAME.ctx === "online"){ toast("Туман війни задає власник кімнати на старті бою"); return; }\n        GAME.fog = !GAME.fog; FOG.warned = false; toast(GAME.fog ? "Туман війни увімкнено" : "Туман війни вимкнено — видно все"); ADS.dirty = true; RAD.dirty = true; EW.dirty = true; return apRender();\n')
p('setTimeout(radarPanel, 1600);\n', 'setTimeout(radarPanel, 1600);\n@@GLUE@@\n')
# --- повідомлення: телефон (канали UaVector/RuVector) і список цілей у панелі ППО — лише за картиною РЛС
p('      const C = CARRIERS[u.key]; if (!C || C.kind !== "air" || PH.carSeen.has(u.id)) continue;\n', '      const C = CARRIERS[u.key]; if (!C || C.kind !== "air" || PH.carSeen.has(u.id)) continue;\n      { const chc = C.side === "ru" ? "ua" : "ru"; if (fogSide() && (chc !== fogSide() || (!GAME.puppet && !fogKnownThreat(chc, u)))) continue; }      // етап 7.60: зліт — лише якщо носій виявлено РЛС\n')
p('    const ch = u.sd === "ru" ? "ua" : "ru";\n    let tr = PH.track.get(u.id);\n', '    const ch = u.sd === "ru" ? "ua" : "ru";\n    if (fogSide() && ch !== fogSide()) continue;      // етап 7.60: канал противника гравцеві не видно\n    const fgKnown = !fogLive() || GAME.puppet || fogKnownThreat(ch, u);\n    let tr = PH.track.get(u.id);\n    if (!tr && !fgKnown) continue;      // нова ціль потрапляє в канал лише після виявлення РЛС\n')
p('    if (u.fall){ if (!tr.out){ tr.out = "down"; phOutcome(tr, "down", u.pos); } continue; }\n', '    if (u.fall){ if (!tr.out){ tr.out = "down"; phOutcome(tr, "down", u.pos); } continue; }\n    if (!fgKnown) continue;      // контакт втрачено — напрямок і заходи в міста більше не публікуються\n')
p('  for (const ch of ["ua", "ru"]){\n    const now = new Map(); for (const [id, x] of ALERTS)', '  for (const ch of ["ua", "ru"]){\n    if (fogSide() && ch !== fogSide()) continue;\n    const now = new Map(); for (const [id, x] of ALERTS)')
p('        if (!adFoeAny(u, t, T)) continue;\n        const W = WEAPONS[t.key], pk = T.p[AD_CI[adCls(t)]], d = hav(u.pos, t.pos), hi = hiAlt(t);', '        if (!adFoeAny(u, t, T)) continue;\n        if (fogLive() && !GAME.puppet && !fogKnownThreat(u.side || "ua", t)) continue;      // етап 7.60: у списку лише цілі з картини РЛС\n        const W = WEAPONS[t.key], pk = T.p[AD_CI[adCls(t)]], d = hav(u.pos, t.pos), hi = hiAlt(t);')
# --- мережа
p('const SNAPM = new Map();', 'const SNAPM = new Map();\nconst SNAPMS = { all: new Map(), ua: new Map(), ru: new Map() };      // етап 7.60: зміни meta — окремо для кожної сторони\nconst fogSnapKey = E => GAME.fog && E.role === "player" && (E.side === "ua" || E.side === "ru") ? E.side : "all";')
p('function snapBuild(full){\n  const U = [], seen = new Set();\n  for (const u of units.values()){\n    seen.add(u.id);\n    let meta = 0;\n    const ms = JSON.stringify(u.meta || {});\n    if (full) meta = u.meta || {};\n    else if (SNAPM.get(u.id) !== ms){ meta = u.meta || {}; SNAPM.set(u.id, ms); }\n    U.push([u.id, u.kind, u.key, u.img, r5(u.pos[0]), r5(u.pos[1]), Math.round(u.hdg),',
  'function snapBuild(full, sk){\n  const rs = sk === "ua" || sk === "ru" ? sk : null, SM = SNAPMS[rs || "all"];\n  const U = [], seen = new Set();\n  for (const u of units.values()){\n    let fvx = null; if (rs && u.sd && u.sd !== rs){ fvx = fogUnitSprite(rs, u); if (!fvx) continue; }      // 7.60: гість отримує лише те, що бачить його сторона\n    seen.add(u.id);\n    let meta = 0;\n    const um = fvx ? {} : (u.meta || {}), ms = JSON.stringify(um);\n    if (full) meta = um;\n    else if (SM.get(u.id) !== ms){ meta = um; SM.set(u.id, ms); }\n    U.push([u.id, u.kind, u.key, u.img, r5((fvx ? fvx.pos : u.pos)[0]), r5((fvx ? fvx.pos : u.pos)[1]), Math.round(fvx ? fvx.hdg : u.hdg),')
p('  if (!full) for (const id of [...SNAPM.keys()]) if (!seen.has(id)) SNAPM.delete(id);', '  if (!full) for (const id of [...SM.keys()]) if (!seen.has(id)) SM.delete(id);')
p('  for (const a of ADS.units.values()){\n    A.push([a.id, a.key,', '  for (const a of ADS.units.values()){\n    if (rs && (a.side || "ua") !== rs){\n      const fa = fogAdSprite(rs, a); if (!fa) continue;\n      A.push([a.id, a.key, r5(fa.pos[0]), r5(fa.pos[1]), Math.round(fa.hdg || 0), a.state === "base" ? "base" : "ready", 0, 0, 0, "auto", a.prio, 0, 0, 0, 0, a.post, a.side, 0, 0, 0, 0, 0]); continue;\n    }\n    A.push([a.id, a.key,')
p('  const S = ADS.shots.map(s => s.drone ?', '  const S = ADS.shots.filter(s => !rs || s.sd === rs || fogShooterKnown(rs, s.from)).map(s => s.drone ?')
p('  // склади заводів — лише коли змінилися (або повний знімок)', '  if (rs){ m.F = fogContacts(rs).map(fogWire); m.fs = rs; }      // етап 7.60: картина сторони-одержувача\n  // склади заводів — лише коли змінилися (або повний знімок)')
p('const gpub = () => ({ mode: GAME.mode,', 'const gpub = () => ({ fog: GAME.fog ? 1 : 0, mode: GAME.mode,')
p('  let inc = null, full = null;\n  for (const E of R.conns){\n    if (!E.role) continue;\n    let m;\n    if (E.full){ full = full || Object.assign(snapBuild(true), { ev }); m = full; E.full = false; }\n    else { inc = inc || Object.assign(snapBuild(false), { ev }); m = inc; }\n    nsend(E.c, m);\n  }\n  if (!inc && full) snapBuild(false);',
  '  const incS = {}, fullS = {};\n  for (const E of R.conns){\n    if (!E.role) continue;\n    const sk = fogSnapKey(E);\n    let m;\n    if (E.full){ m = fullS[sk] = fullS[sk] || Object.assign(snapBuild(true, sk), { ev }); E.full = false; }\n    else m = incS[sk] = incS[sk] || Object.assign(snapBuild(false, sk), { ev });\n    nsend(E.c, m);\n  }\n  for (const sk in fullS) if (!incS[sk]) snapBuild(false, sk);')
p('  // ППО\n  const sa = new Set();', '  if (m.F) FOG.guest = { side: m.fs, list: m.F }; else FOG.guest = { side: null, list: [] };      // етап 7.60\n  // ППО\n  const sa = new Set();')

def patch(text, label):
    miss = []
    for i, (o, n) in enumerate(P):
        n = n.replace('@@GLUE@@', GLUE)
        if '/* fog:v1 */' in text and i == 0: print(label, 'already patched'); return text
        c = text.count(o)
        if c != 1: miss.append((i, c, o[:70])); continue
        text = text.replace(o, n)
    if miss: print(label, 'MISS', miss); sys.exit(1)
    print(label, 'ok'); return text

# src
f = 'src/js/03_game.js'; s = open(f, encoding='utf8').read(); s2 = patch(s, f)
if s2 != s: open(f, 'w', encoding='utf8').write(s2)
h = open('src/index.html', encoding='utf8').read()
if '02e_fog.js' not in h:
    h = h.replace('<script>@@F:js/02c_radar.js@@</script>\n', '<script>@@F:js/02c_radar.js@@</script>\n<script>@@F:js/02e_fog.js@@</script>\n'); open('src/index.html', 'w', encoding='utf8').write(h)
# dist
f = 'dist/skydominion.html'; t = open(f, encoding='utf8').read()
if 'id="bvFog"' not in t:
    pat = re.compile(r'(<script[^>]*>)(.*?)(</script>)', re.S)
    ms = list(pat.finditer(t)); main = max(ms, key=lambda m: len(m.group(2)))
    new = patch(main.group(2), 'dist main')
    t = t[:main.start(2)] + new + t[main.end(2):]
    rad = [m for m in pat.finditer(t) if 'id="bvRadar"' in m.group(1)][0]
    mod = '\n<script id="bvFog">' + open('src/js/02e_fog.js', encoding='utf8').read() + '</script>'
    t = t[:rad.end()] + mod + t[rad.end():]
    open(f, 'w', encoding='utf8').write(t)
print('done')
