# Етап 7.73: запит повітряного простору. python3 tools/apply_airspace.py — ідемпотентно:
#  1) у 03_game.js (src і dist): міст BV_DIPX.airReset, ROUTE_SIDE, відкритий коридор у avoidForeign, облік використання в spawnWeapon;
#  2) перевбудовує 173_diplomacy.css/.js у dist НА МІСЦІ (<style id="bv-diplomacy">, <script id="bv-diplomacy-js">) без зміни порядку скриптів.
import os, re
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rep(t, old, new, mark):
    if mark in t: return t
    if t.count(old) != 1: raise SystemExit('anchor not unique/missing: ' + old[:70] + ' x' + str(t.count(old)))
    return t.replace(old, new)
def patch(t):
    t = rep(t, 'S7.shop = { sync: bcBalSync,', 'window.BV_DIPX.airReset = () => safeCache.clear();      /* dip:airbridge */\nS7.shop = { sync: bcBalSync,', 'dip:airbridge')
    t = rep(t, 'function avoidForeign(P, strict){\n  const FG = strict ? gridInit(FOREIGN) : transitInit();      // strict — без транзитної смуги (колії, дороги)',
            'let ROUTE_SIDE = null;      /* dip:air — сторона, для якої прокладається маршрут (дозволи на повітряний простір) */\n'
            'function avoidForeign(P, strict){\n  const FG = strict ? gridInit(FOREIGN) : ((window.BV_DIP && window.BV_DIP.airGrid && window.BV_DIP.airGrid(ROUTE_SIDE, transitInit(), gridInit(FOREIGN))) || transitInit());      // strict — без транзитної смуги (колії, дороги); /* dip:air */', 'dip:air —')
    t = rep(t, '  const base = avoidForeign(densify(buildRoute(start, target, mode, wps), 4));\n  let pts = W.cls === "ballistic"',
            '  ROUTE_SIDE = W.side; let base; try { base = avoidForeign(densify(buildRoute(start, target, mode, wps), 4)); } finally { ROUTE_SIDE = null; }      /* dip:air */\n'
            '  if (window.BV_DIP && window.BV_DIP.airUse) window.BV_DIP.airUse(W.side, base, W);      /* dip:airuse */\n'
            '  let pts = W.cls === "ballistic"', 'dip:airuse')
    return t
p = 'src/js/03_game.js'; t = open(p, encoding='utf8').read(); open(p, 'w', encoding='utf8').write(patch(t))
p = 'dist/skydominion.html'; h = open(p, encoding='utf8').read(); h = patch(h)
css = open('src/css/173_diplomacy.css', encoding='utf8').read(); js = open('src/js/173_diplomacy.js', encoding='utf8').read()
def sub(h, pat, new):
    m = re.search(pat, h)
    if not m: raise SystemExit('block missing: ' + pat[:40])
    return h[:m.start()] + new + h[m.end():]
h = sub(h, r'<style id="bv-diplomacy">\n[\s\S]*?</style>', '<style id="bv-diplomacy">\n' + css + '</style>')
h = sub(h, r'<script id="bv-diplomacy-js">\n[\s\S]*?</script>', lambda: None) if False else h
i = h.index('<script id="bv-diplomacy-js">\n'); j = h.index('</script>', i)
h = h[:i] + '<script id="bv-diplomacy-js">\n' + js + h[j:]
open(p, 'w', encoding='utf8').write(h); print('OK css', len(css), 'js', len(js))
