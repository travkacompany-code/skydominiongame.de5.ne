# Вшивает AAA-дизайн SKYDOMINION в dist/game_ultra.html -> dist/skydominion.html (логика игры не меняется).
# Порядок: python3 tools/make_bv2_art.py  &&  python3 tools/apply_bv2.py
import re, os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
rd = lambda p: open(p, encoding='utf-8').read()
s = rd('dist/game_ultra.html')
# 1) прежний слой «ПЛАНШЕТ» (110_ultra_design) заменяем: остаются только встроенные шрифты (109_fonts)
a = s.index('<style id="bv-ultra-design">'); b = s.index('</style>', a) + len('</style>')
s = s[:a] + '<style id="bv-ultra-design">\n' + rd('src/css/109_fonts.css') + '\n</style>' + s[b:]
# 1b) спрайты техники: тот же размер в пикселях, но восстановленное качество (FSRCNN 2x -> обратно, сглаженная маска)
import json
if os.path.exists('tools/sprites_restored.json'):
    SR = json.load(open('tools/sprites_restored.json')); n = 0
    def _swap(m):
        global n
        k = m.group(1)
        if k in SR: n += 1; return m.group(0).replace(m.group(2), SR[k])
        return m.group(0)
    s = re.sub(r'"([a-z0-9_]+)": \{ "w": \d+, "h": \d+, "src": "data:image/webp;base64,([^"]+)"', _swap, s)
    print('sprites restored:', n)
# 2) шрифт Exo 2 (кириллица, курсив) + мета
fonts = '<link href="https://fonts.googleapis.com/css2?family=Exo+2:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500;1,600;1,700;1,800;1,900&display=swap" rel="stylesheet">\n'
s = s.replace('content="#0b0c0e"', 'content="#030813"')
# 3) новый слой стилей — последним
if 'id="bv2-aaa"' not in s:
    i = s.index('</head>')
    s = s[:i] + fonts + '<style id="bv2-aaa">\n' + rd('src/css/130_bv2_aaa.css') + '\n</style>\n' + s[i:]
    j = s.rindex('</body>')
    s = s[:j] + '<script id="bv2-art-js">\n' + rd('src/js/06a_bv2_art.js') + '</script>\n<script id="bv2-ui-js">\n' + rd('src/js/06b_bv2_ui.js') + '\n</script>\n' + s[j:]
open('dist/skydominion.html', 'w', encoding='utf-8').write(s); print('ok', len(s))
