# Етап 7.71: «Мережевий фронт» / Tactical Lobby. python3 tools/apply_netfront.py — вбудовує 171_netfront.css/.js у dist (ідемпотентно)
# і додає у 03_game.js (src і dist) рядок-міст window.BV_NET = NET (читання стану лобі для надбудови). Потребує apply_shop_v2.py (стилі йдуть після bv-shop2).
import os, re
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BR = 'queueMicrotask(() => { window.BV_NET = NET; });      /* net front v2: міст для 171_netfront.js */\n'
def bridge(t):
    if 'window.BV_NET = NET' in t: return t
    i = t.index('S7.shop = { sync: bcBalSync,'); return t[:i] + BR + t[i:]
p = 'src/js/03_game.js'; t = open(p, encoding='utf8').read(); open(p, 'w', encoding='utf8').write(bridge(t))
p = 'dist/skydominion.html'; h = open(p, encoding='utf8').read(); h = bridge(h)
css = open('src/css/171_netfront.css', encoding='utf8').read(); js = open('src/js/171_netfront.js', encoding='utf8').read()
h = re.sub(r'\n?<style id="bv-netfront">[\s\S]*?</style>', '', h); h = re.sub(r'\n?<script id="bv-netfront-js">[\s\S]*?</script>', '', h)
anchor = '<style id="bv-shop2">' if '<style id="bv-shop2">' in h else '<style id="bv-unify">'
i = h.index(anchor); j = h.index('</style>', i) + len('</style>')
h = h[:j] + '\n<style id="bv-netfront">\n' + css + '</style>' + h[j:]
k = h.rindex('</body>'); h = h[:k] + '<script id="bv-netfront-js">\n' + js + '</script>\n' + h[k:]
open(p, 'w', encoding='utf8').write(h); print('OK css', len(css), 'js', len(js))
