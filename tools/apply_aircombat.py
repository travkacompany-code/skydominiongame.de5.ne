#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""етап 7.70 — повітряний бій: вносить зміни в src/js/03_game.js, src/index.html і dist/skydominion.html (ідемпотентно).
   Модуль BV_AIRC (src/js/02l_aircombat.js) і клей (tools/aircombat_glue.js) беруться з диска, тож після правок у них достатньо
   видалити маркер 'aircombat:v1' (або просто запустити з --force) — клей і модуль будуть замінені заново."""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
FORCE = "--force" in sys.argv
MOD = open("src/js/02l_aircombat.js", encoding="utf8").read()
GLUE = open("tools/aircombat_glue.js", encoding="utf8").read().rstrip("\n") + "\n"
GLUE_B, GLUE_E = "/* aircombat:v1 */", "/* aircombat:end */"
GLUE_FULL = GLUE + GLUE_E + "\n"

FX = '''/* aircombat:v1 — теплова пастка й диполі */
function fxFlare(p){
  buildTex();
  fxFlash(p, 0.2, 0.07, 10, 5, 2800);
  for (let i = 0; i < 2; i++) P({ tex: pickA(TEX.smoke), p: jitter(p, 0.04), v: dirV(rnd(0, 6.28), 0.05), tau: 1, wind: true, life: rnd(1600, 2400), s0: 0.06, s1: rnd(0.25, 0.4), m0: 5, m1: 12, a0: 0.3, pw: 1.2, fin: 0.1 });
}
function fxChaff(p){
  buildTex();
  for (let i = 0; i < 4; i++) P({ tex: pickA(TEX.smoke), p: jitter(p, 0.1), v: dirV(rnd(0, 6.28), 0.08), tau: 1.2, wind: true, life: rnd(2800, 4200), s0: 0.1, s1: rnd(0.45, 0.8), m0: 6, m1: 16, a0: 0.22, pw: 1.5, fin: 0.12 });
}
'''

def patch(text, label, tag):
    """повертає (новий_текст, змінено?)"""
    changed = False
    def sub(old, new, once_key):
        nonlocal text, changed
        if once_key in text:
            return
        n = text.count(old)
        if n != 1:
            raise SystemExit(f"[{label}] якір «{once_key}» знайдено {n} разів (очікується 1)")
        text = text.replace(old, new); changed = True

    # 1. власні ракети не веде старий stepShots
    sub("  for (let i = ADS.shots.length - 1; i >= 0; i--){\n    const s = ADS.shots[i];\n    if (s.ctl){",
        "  for (let i = ADS.shots.length - 1; i >= 0; i--){\n    const s = ADS.shots[i];\n    if (s.ac) continue;      // aircombat:v1 — ракети повітряного бою веде BV_AIRC\n    if (s.ctl){", "aircombat:v1 — ракети повітряного бою веде")
    # 2. крок + клей
    if GLUE_B in text:
        if FORCE:
            a = text.index(GLUE_B); b = text.index(GLUE_E) + len(GLUE_E) + 1
            text = text[:a] + GLUE_FULL + text[b:]; changed = True
    else:
        old = "  stepShots(sd);\n}\n"
        if text.count(old) != 1: raise SystemExit(f"[{label}] якір stepShots(sd) знайдено {text.count(old)} разів")
        text = text.replace(old, "  stepShots(sd);\n  HOOKS.acStep && HOOKS.acStep(sd);      // aircombat:v1\n}\n" + GLUE_FULL); changed = True
    # 3. мозок винищувача
    sub("  if (u.state === \"transit\"){\n    // етап 7.4: літак не чекає точки патрулювання",
        "  if (HOOKS.acBrain && HOOKS.acBrain(u, T, sd, shotsBy)) return;      // aircombat:v1 — повітряний бій (ухилення, переслідування, пуск)\n  if (u.state === \"transit\"){\n    // етап 7.4: літак не чекає точки патрулювання", "HOOKS.acBrain && HOOKS.acBrain(u, T, sd, shotsBy)")
    # 4. носії
    sub("  place(u, sd);\n}\n/* atkreal:v1 */",
        "  place(u, sd);\n  if (u.kind === \"c\" && HOOKS.acCar) HOOKS.acCar(u, sd);      // aircombat:v1 — ухилення носія\n}\n/* atkreal:v1 */", "HOOKS.acCar(u, sd)")
    # 5. FX
    sub("HOOKS.fx = (p, k, cls) => {\n  if (k === \"ship\")", FX + "HOOKS.fx = (p, k, cls) => {\n  if (k === \"ship\")", "aircombat:v1 — теплова пастка")
    sub("  else if (k === \"crash\") fxGroundHit(p, cls, true);\n  else fxGroundHit(p, cls, false);",
        "  else if (k === \"crash\") fxGroundHit(p, cls, true);\n  else if (k === \"flare\") fxFlare(p);\n  else if (k === \"chaff\") fxChaff(p);\n  else fxGroundHit(p, cls, false);", "k === \"flare\") fxFlare")
    # 6. РЛС (основна мережа й станції ДРЛО) бачить висоту літаків
    H = lambda r: f'(HOOKS.acH ? HOOKS.acH({r}) : 0)'
    sub('tg.push({ id: u.id, side: u.sd || "ru", x: q.x, y: q.y, cat: "bomber", alt: "mid" });',
        'tg.push({ id: u.id, side: u.sd || "ru", x: q.x, y: q.y, cat: "bomber", alt: (' + H('"c" + u.id') + ' > 0 && ' + H('"c" + u.id') + ' < 600) ? "low" : "mid", hm: ' + H('"c" + u.id') + ' });', 'tg.push({ id: u.id, side: u.sd || "ru", x: q.x, y: q.y, cat: "bomber", alt: (')
    sub('tg.push({ id: "c" + u.id, side: u.sd || "ru", x: q.x, y: q.y, cat: "bomber", alt: "mid" });',
        'tg.push({ id: "c" + u.id, side: u.sd || "ru", x: q.x, y: q.y, cat: "bomber", alt: (' + H('"c" + u.id') + ' > 0 && ' + H('"c" + u.id') + ' < 600) ? "low" : "mid", hm: ' + H('"c" + u.id') + ' });', 'tg.push({ id: "c" + u.id, side: u.sd || "ru", x: q.x, y: q.y, cat: "bomber", alt: (')
    sub('tg.push({ id: "a" + a.id, side: a.side || "ua", x: q.x, y: q.y, cat: T.heli ? "heli" : "fighter", alt: T.heli ? "low" : "mid" });',
        'tg.push({ id: "a" + a.id, side: a.side || "ua", x: q.x, y: q.y, cat: T.heli ? "heli" : "fighter", alt: T.heli ? "low" : "mid", hm: ' + H('"f" + a.id') + ' });', 'id: "a" + a.id, side: a.side || "ua", x: q.x, y: q.y, cat: T.heli ? "heli" : "fighter", alt: T.heli ? "low" : "mid", hm:')
    sub('tg.push({ id: "ad" + u.id, side: u.side || "ua", x: q.x, y: q.y, cat: T.heli ? "heli" : "fighter", alt: T.heli ? "low" : "mid" });',
        'tg.push({ id: "ad" + u.id, side: u.side || "ua", x: q.x, y: q.y, cat: T.heli ? "heli" : "fighter", alt: T.heli ? "low" : "mid", hm: ' + H('"f" + u.id') + ' });', 'id: "ad" + u.id, side: u.side || "ua", x: q.x, y: q.y, cat: T.heli ? "heli" : "fighter", alt: T.heli ? "low" : "mid", hm:')
    # 7. старт гри
    sub("HOOKS.avInit && HOOKS.avInit();", "HOOKS.avInit && HOOKS.avInit(); HOOKS.acInit && HOOKS.acInit();", "HOOKS.acInit && HOOKS.acInit()")
    return text, changed

# --- 03_game.js
p = "src/js/03_game.js"; t = open(p, encoding="utf8").read(); t2, ch = patch(t, "src", "src"); open(p, "w", encoding="utf8").write(t2); print(p, "змінено" if ch else "без змін")
# --- index.html
p = "src/index.html"; t = open(p, encoding="utf8").read()
tag = "<script>@@F:js/02l_aircombat.js@@</script>\n"
if "02l_aircombat.js" not in t:
    a = "<script>@@F:js/02i_avia.js@@</script>\n"
    assert t.count(a) == 1; t = t.replace(a, a + tag); open(p, "w", encoding="utf8").write(t); print(p, "змінено")
else: print(p, "без змін")
# --- dist
p = "dist/skydominion.html"; t = open(p, encoding="utf8").read(); t2, ch = patch(t, "dist", "dist")
blk = '<script id="bvAirc">' + MOD + '</script>\n'
if '<script id="bvAirc">' in t2:
    if FORCE:
        a = t2.index('<script id="bvAirc">'); b = t2.index('</script>\n', a) + len('</script>\n'); t2 = t2[:a] + blk + t2[b:]; ch = True
else:
    a = '<script id="bvSprites">'
    assert t2.count(a) == 1; t2 = t2.replace(a, blk + a); ch = True
open(p, "w", encoding="utf8").write(t2); print(p, "змінено" if ch else "без змін")
