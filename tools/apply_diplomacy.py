# Етап 7.72: дипломатія. python3 tools/apply_diplomacy.py — вбудовує 173_diplomacy.css/.js у dist (ідемпотентно)
# і додає у 03_game.js (src і dist) мости: BV_DIPX, truce у canAttack, дохід у infIncK, виклики start/over/step, кнопку «Дипломатія» в HUD.
import os, re
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rep(t, old, new, mark):
    if mark in t: return t
    if t.count(old) != 1: raise SystemExit('anchor not unique/missing: ' + old[:60] + ' x' + str(t.count(old)))
    return t.replace(old, new)
BR = ('window.BV_DIPX = { HOOKS: () => HOOKS, toast: (m, k) => toast(m, k), ecoE: sd => ecoE(sd), ecoAdd: (sd, p, d) => ecoAdd(sd, p, d), endBy: o => endBy(o), PKEY: () => PKEY };      /* diplomacy:bridge */\n')
def patch(t):
    t = rep(t, 'S7.shop = { sync: bcBalSync,', BR + 'S7.shop = { sync: bcBalSync,', 'diplomacy:bridge')
    t = rep(t, 'const canAttack = sd => { const M = MODES[GAME.mode]; return !!M && (',
            'const canAttack = sd => { const M = MODES[GAME.mode]; if (window.BV_DIP && window.BV_DIP.truceOn()) return false; /* dip:truce */ return !!M && (', 'dip:truce')
    t = rep(t, '  if (!E || !E.pw) return 1;' if False else 'function infIncK(sd){\n  const E = ecoE(sd), P = E && E.pw; if (!P) return 1;\n  return (0.6 + 0.4 * P.k) * (P.gk || 1);\n}',
            'function infIncK(sd){\n  const E = ecoE(sd), P = E && E.pw, dk = window.BV_DIP ? window.BV_DIP.incK(sd) : 1; /* dip:inc */ if (!P) return dk;\n  return (0.6 + 0.4 * P.k) * (P.gk || 1) * dk;\n}', 'dip:inc')
    t = rep(t, '  GAME.clock += sd;\n  econStep(sd);', '  GAME.clock += sd;\n  econStep(sd);\n  if (window.BV_DIP) window.BV_DIP.step(sd);      /* dip:step */', 'dip:step')
    t = rep(t, '  S7.onGameStart && S7.onGameStart();\n}', '  S7.onGameStart && S7.onGameStart();\n  if (window.BV_DIP) window.BV_DIP.start();      /* dip:start */\n}', 'dip:start')
    t = rep(t, '  GAME.res = res;\n  S7.onGameOver && S7.onGameOver(res);', '  GAME.res = res;\n  if (window.BV_DIP) window.BV_DIP.over(res);      /* dip:over */\n  S7.onGameOver && S7.onGameOver(res);', 'dip:over')
    btn = '    if (window.BV_DIP && window.BV_DIP.available()){ const bg = window.BV_DIP.badge(); b.push(`<button class="chip gm-dip ${window.BV_DIP.isOpen() ? "on" : ""}" data-dip="1" title="Дипломатія: відносини, союзи, торгівля, санкції, війна й мир">🌐${narrow() ? "" : " Дипломатія"}${bg ? `<span class="bd dp">${bg}</span>` : ""}</button>`); }      /* dip:btn */\n'
    t = rep(t, '    b.push(`<button class="chip ${$("gmStat").classList.contains("on") ? "on" : ""}" data-s7="gmstat"', btn + '    b.push(`<button class="chip ${$("gmStat").classList.contains("on") ? "on" : ""}" data-s7="gmstat"', 'dip:btn')
    t = rep(t, 'S7.team ? S7.team.sig() : ""].join("|");', 'S7.team ? S7.team.sig() : "", window.BV_DIP ? window.BV_DIP.sig() : ""].join("|");      /* dip:sig */', 'dip:sig')
    return t
p = 'src/js/03_game.js'; t = open(p, encoding='utf8').read(); open(p, 'w', encoding='utf8').write(patch(t))
p = 'dist/skydominion.html'; h = open(p, encoding='utf8').read(); h = patch(h)
css = open('src/css/173_diplomacy.css', encoding='utf8').read(); js = open('src/js/173_diplomacy.js', encoding='utf8').read()
h = re.sub(r'\n?<style id="bv-diplomacy">[\s\S]*?</style>', '', h); h = re.sub(r'\n?<script id="bv-diplomacy-js">[\s\S]*?</script>\n?', '', h)
anchor = '<style id="bv-netfront">'
i = h.index(anchor); j = h.index('</style>', i) + len('</style>')
h = h[:j] + '\n<style id="bv-diplomacy">\n' + css + '</style>' + h[j:]
k = h.rindex('</body>'); h = h[:k] + '<script id="bv-diplomacy-js">\n' + js + '</script>\n' + h[k:]
open(p, 'w', encoding='utf8').write(h); print('OK css', len(css), 'js', len(js))
