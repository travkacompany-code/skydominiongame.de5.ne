# Етап 7.70: «Hangar Terminal». python3 tools/apply_shop_v2.py — вбудовує 170_shop_v2.css/.js у dist (ідемпотентно)
# і додає у 03_game.js (src і dist) один рядок-міст window.BV_SHOP = S7.shop (читання даних для надбудови).
import os, re
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BR = 'queueMicrotask(() => { window.BV_SHOP = S7.shop; });      /* shop v2: міст для 170_shop_v2.js */\n'
def bridge(t):
    if 'window.BV_SHOP = S7.shop' in t: return t
    i = t.index('S7.shop = { sync: bcBalSync,'); return t[:i] + BR + t[i:]
p = 'src/js/03_game.js'; t = open(p, encoding='utf8').read(); open(p, 'w', encoding='utf8').write(bridge(t))
p = 'dist/skydominion.html'; h = open(p, encoding='utf8').read(); h = bridge(h)
css = open('src/css/170_shop_v2.css', encoding='utf8').read(); js = open('src/js/170_shop_v2.js', encoding='utf8').read()
h = re.sub(r'\n?<style id="bv-shop2">[\s\S]*?</style>', '', h); h = re.sub(r'\n?<script id="bv-shop2-js">[\s\S]*?</script>', '', h)
i = h.index('<style id="bv-unify">'); j = h.index('</style>', i) + len('</style>')
h = h[:j] + '\n<style id="bv-shop2">\n' + css + '</style>' + h[j:]
k = h.rindex('</body>'); h = h[:k] + '<script id="bv-shop2-js">\n' + js + '</script>\n' + h[k:]
open(p, 'w', encoding='utf8').write(h); print('OK css', len(css), 'js', len(js))
