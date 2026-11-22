# Drag & Drop карток на мапу (етап 7.74).
#   1) клей tools/dnd_glue.js вшивається в замикання гри (src/js/03_game.js і dist) одразу після
#      «window.BV_AP = AP;» — там доступні HOOKS, AP, canPlaceSide, toast, circleRing, AD_TYPES;
#   2) модуль src/js/174_dragdrop.js і стилі src/css/174_dragdrop.css підключаються після гри.
#   python3 tools/apply_dragdrop.py   (ідемпотентно; кожен якір має зустрічатися рівно 1 раз)
import os, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
rd = lambda p: open(p, encoding='utf8').read()

GLUE_MARK = '/* bv-dnd-glue */'
CSS_MARK = '<style id="bv-dnd">'
JS_MARK = '<script id="bv-dnd-js">'
GAME_ANCHOR = '  window.BV_AP = AP;\n'
GLUE = '  ' + GLUE_MARK + '\n' + rd('tools/dnd_glue.js').rstrip() + '\n'
CSS = CSS_MARK + '\n' + rd('src/css/174_dragdrop.css').rstrip() + '\n</style>\n'
JS = JS_MARK + '\n' + rd('src/js/174_dragdrop.js').rstrip() + '\n</script>\n'

def once(s, a, path):
    n = s.count(a)
    if n != 1: sys.exit(f'{path}: якір {a[:40]!r} зустрічається {n} раз(и) — жоден файл не змінено')

def patch(path, pairs, marks):
    s = rd(path)
    if all(m in s for m in marks): return 'уже підключено'
    for old, new in pairs:
        once(s, old, path)
        s = s.replace(old, new, 1)
    open(path, 'w', encoding='utf8').write(s)
    return 'ок'

# 1) клей у замиканні гри
game = [(GAME_ANCHOR, GAME_ANCHOR + GLUE)]
# 2) у dist — стилі й модуль 174 перед </body>; у src/index.html — через @@F-маркери
dist = [('</head>', CSS + '</head>'), ('</body>', JS + '</body>')]
srcidx = [('</head>', '<style>@@F:css/174_dragdrop.css@@</style>\n</head>'),
          ('</body>', '<script>@@F:js/174_dragdrop.js@@</script>\n</body>')]

print({
    'src/js/03_game.js': patch('src/js/03_game.js', game, [GLUE_MARK]),
    'dist/skydominion.html': patch('dist/skydominion.html', game + dist, [GLUE_MARK, CSS_MARK, JS_MARK]),
    'src/index.html': patch('src/index.html', srcidx, ['174_dragdrop.css', '174_dragdrop.js']),
})
